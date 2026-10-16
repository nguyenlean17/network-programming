import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import { hashPassword, signAccessToken, verifyAccessToken, verifyPassword } from './auth.js';
import { calculateStandings } from './standings.js';
import { createRoundRobinSchedule } from './schedule.js';
import { replayFrame } from './replay.js';
import { extractMainPythonFromZip, MAX_ARCHIVE_BYTES, MAX_SOURCE_BYTES } from './sourceArchive.js';

const VERSION_UPLOAD_LIMIT = MAX_ARCHIVE_BYTES;
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const authAttempts = new Map();
const cleanText = (value, max) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

export function createBotPlatformRouter({ pool, authSecret }) {
  const router = express.Router();
  const accountAttemptLimiter = (req, res, next) => {
    const accountKey = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const now = Date.now();
    const prior = authAttempts.get(accountKey);
    if (authAttempts.size > 4096) {
      for (const [key, bucket] of authAttempts) {
        if (now - bucket.startedAt >= AUTH_ATTEMPT_WINDOW_MS) authAttempts.delete(key);
      }
      if (!authAttempts.has(accountKey) && authAttempts.size >= 4096) return res.status(429).json({ error: 'Too many active account requests; try again later' });
    }
    if (prior && now - prior.startedAt < AUTH_ATTEMPT_WINDOW_MS && prior.count >= 20) {
      return res.status(429).json({ error: 'Too many requests for this account; try again later' });
    }
    authAttempts.set(accountKey, prior && now - prior.startedAt < AUTH_ATTEMPT_WINDOW_MS
      ? { startedAt: prior.startedAt, count: prior.count + 1 } : { startedAt: now, count: 1 });
    next();
  };

  router.post('/auth/register', accountAttemptLimiter, async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const displayName = cleanText(req.body?.displayName, 48);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (!displayName) return res.status(400).json({ error: 'Display name is required' });
    let passwordHash;
    try { passwordHash = await hashPassword(req.body?.password); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const user = { id: randomUUID(), email, displayName };
    try {
      await pool.query('INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)',
        [user.id, user.email, user.displayName, passwordHash]);
      authAttempts.delete(email);
      res.status(201).json({ user, accessToken: signAccessToken(user, authSecret) });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' });
      console.error('Account registration failed:', error.message);
      res.status(500).json({ error: 'Account could not be created' });
    }
  });

  router.post('/auth/login', accountAttemptLimiter, async (req, res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    try {
      const result = await pool.query('SELECT id, email, display_name, password_hash FROM users WHERE lower(email) = $1', [email]);
      const row = result.rows[0];
      if (!row || !(await verifyPassword(req.body?.password, row.password_hash))) {
        return res.status(401).json({ error: 'Email or password is incorrect' });
      }
      authAttempts.delete(email);
      const user = { id: row.id, email: row.email, displayName: row.display_name };
      res.json({ user, accessToken: signAccessToken(user, authSecret) });
    } catch (error) {
      next(error);
    }
  });

  const requireUser = async (req, res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = verifyAccessToken(token, authSecret);
    if (!claims) return res.status(401).json({ error: 'Sign in to continue' });
    try {
      const result = await pool.query('SELECT id, email, display_name, role FROM users WHERE id = $1', [claims.userId]);
      if (!result.rowCount) return res.status(401).json({ error: 'Account is no longer available' });
      const row = result.rows[0];
      req.user = { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
      next();
    } catch (error) { next(error); }
  };
  const requireAdmin = async (req, res, next) => requireUser(req, res, () => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Administrator access is required' });
    next();
  });

  router.get('/auth/me', requireUser, (req, res) => res.json({ user: req.user }));

  router.get('/admin/users', requireAdmin, async (_req, res, next) => {
    try {
      const result = await pool.query(`SELECT id, email, display_name, role, created_at
        FROM users ORDER BY created_at DESC LIMIT 500`);
      res.json({ users: result.rows });
    } catch (error) { next(error); }
  });

  router.patch('/admin/users/:userId/role', requireAdmin, async (req, res, next) => {
    const role = req.body?.role;
    if (!['USER', 'ADMIN'].includes(role)) return res.status(400).json({ error: 'Role must be USER or ADMIN' });
    if (req.params.userId === req.user.id && role !== 'ADMIN') return res.status(409).json({ error: 'You cannot remove your own administrator role' });
    try {
      const result = await pool.query('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, email, display_name, role', [req.params.userId, role]);
      if (!result.rowCount) return res.status(404).json({ error: 'User not found' });
      await pool.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'USER_ROLE_CHANGED', 'USER', $3, $4::jsonb)`,
      [randomUUID(), req.user.id, req.params.userId, JSON.stringify({ role })]);
      res.json({ user: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.get('/bots', requireUser, async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT b.id, b.name, b.description, b.created_at,
        COALESCE(json_agg(json_build_object('id', v.id, 'version', v.version, 'apiVersion', v.api_version,
          'sha256', v.sha256, 'status', v.validation_status, 'message', v.validation_message,
          'createdAt', v.created_at)) FILTER (WHERE v.id IS NOT NULL), '[]'::json) AS versions
        FROM bots b LEFT JOIN bot_versions v ON v.bot_id = b.id WHERE b.owner_id = $1
        GROUP BY b.id ORDER BY b.created_at DESC`, [req.user.id]);
      res.json({ bots: result.rows });
    } catch (error) { next(error); }
  });

  router.post('/bots', requireUser, async (req, res, next) => {
    const name = cleanText(req.body?.name, 48);
    const description = cleanText(req.body?.description, 500);
    if (!name) return res.status(400).json({ error: 'Bot name is required' });
    try {
      const id = randomUUID();
      await pool.query('INSERT INTO bots (id, owner_id, name, description) VALUES ($1, $2, $3, $4)',
        [id, req.user.id, name, description]);
      res.status(201).json({ bot: { id, name, description } });
    } catch (error) { next(error); }
  });

  router.patch('/bots/:botId', requireUser, async (req, res, next) => {
    const name = cleanText(req.body?.name, 48);
    const description = cleanText(req.body?.description, 500);
    if (!name) return res.status(400).json({ error: 'Bot name is required' });
    try {
      const result = await pool.query(`UPDATE bots SET name = $3, description = $4
        WHERE id = $1 AND owner_id = $2 RETURNING id, name, description`, [req.params.botId, req.user.id, name, description]);
      if (!result.rowCount) return res.status(404).json({ error: 'Bot not found' });
      res.json({ bot: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.delete('/bots/:botId', requireUser, async (req, res, next) => {
    try {
      const result = await pool.query('DELETE FROM bots WHERE id = $1 AND owner_id = $2 RETURNING id', [req.params.botId, req.user.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Bot not found' });
      res.status(204).end();
    } catch (error) {
      if (error.code === '23503') return res.status(409).json({ error: 'This bot has match or tournament history and cannot be deleted' });
      next(error);
    }
  });

  router.get('/practice/bots', requireUser, async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT v.id AS bot_version_id, v.version, b.id AS bot_id,
        b.name AS bot_name, u.display_name AS owner_name, (b.owner_id = $1) AS is_mine, b.is_public_sample AS is_sample
        FROM bot_versions v JOIN bots b ON b.id = v.bot_id JOIN users u ON u.id = b.owner_id
        WHERE v.validation_status = 'READY' ORDER BY (b.owner_id = $1) DESC, b.name, v.version DESC`, [req.user.id]);
      res.json({ bots: result.rows });
    } catch (error) { next(error); }
  });

  router.post('/practice/matches', requireUser, async (req, res, next) => {
    const { ownBotVersionId, opponentBotVersionId } = req.body || {};
    const count = req.body?.count ?? 1;
    if (typeof ownBotVersionId !== 'string' || typeof opponentBotVersionId !== 'string' || ownBotVersionId === opponentBotVersionId) {
      return res.status(400).json({ error: 'Choose two different ready bot versions' });
    }
    if (!Number.isInteger(count) || count < 1 || count > 3) return res.status(400).json({ error: 'Practice series count must be between 1 and 3' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`practice:${req.user.id}`]);
      const versions = await client.query(`SELECT v.id, b.owner_id FROM bot_versions v JOIN bots b ON b.id = v.bot_id
        WHERE v.id = ANY($1::uuid[]) AND v.validation_status = 'READY' FOR SHARE OF v`,
      [[ownBotVersionId, opponentBotVersionId]]);
      const own = versions.rows.find(row => row.id === ownBotVersionId);
      const opponent = versions.rows.find(row => row.id === opponentBotVersionId);
      if (!own || own.owner_id !== req.user.id || !opponent) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Your bot must be yours and both versions must pass validation' });
      }
      const active = await client.query(`SELECT count(*)::int AS count FROM matches
        WHERE created_by = $1 AND kind = 'PRACTICE' AND status IN ('QUEUED', 'RUNNING')`, [req.user.id]);
      if (active.rows[0].count + count > 3) {
        await client.query('ROLLBACK');
        return res.status(429).json({ error: 'You can have up to three practice matches queued or running at once' });
      }
      const matchIds = [];
      const rules = { apiVersion: '1.0', maxPlies: 300, decisionTimeoutMs: 2000 };
      for (let index = 0; index < count; index++) {
        const matchId = randomUUID();
        matchIds.push(matchId);
        const p1VersionId = index % 2 === 0 ? ownBotVersionId : opponentBotVersionId;
        const p2VersionId = index % 2 === 0 ? opponentBotVersionId : ownBotVersionId;
        await client.query(`INSERT INTO matches
          (id, created_by, kind, p1_version_id, p2_version_id, rules_json)
          VALUES ($1, $2, 'PRACTICE', $3, $4, $5::jsonb)`,
        [matchId, req.user.id, p1VersionId, p2VersionId, JSON.stringify(rules)]);
        await client.query('INSERT INTO runner_jobs (id, match_id) VALUES ($1, $2)', [randomUUID(), matchId]);
      }
      await client.query('COMMIT');
      res.status(202).json({ matchId: matchIds[0], matchIds, status: 'QUEUED' });
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {});
      next(error);
    } finally { client?.release(); }
  });

  router.get('/practice/matches', requireUser, async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT m.id, m.status, m.result_json, m.error_message, m.created_at,
        (m.initial_board_json IS NOT NULL) AS replay_available,
        m.completed_at, b1.name AS p1_bot_name, v1.version AS p1_version,
        b2.name AS p2_bot_name, v2.version AS p2_version
        FROM matches m JOIN bot_versions v1 ON v1.id = m.p1_version_id JOIN bots b1 ON b1.id = v1.bot_id
        JOIN bot_versions v2 ON v2.id = m.p2_version_id JOIN bots b2 ON b2.id = v2.bot_id
        WHERE m.kind = 'PRACTICE' AND m.created_by = $1 ORDER BY m.created_at DESC LIMIT 50`, [req.user.id]);
      res.json({ matches: result.rows });
    } catch (error) { next(error); }
  });

  router.post('/bots/:botId/versions', requireUser,
    express.raw({ type: ['application/octet-stream', 'text/x-python', 'application/zip', 'application/x-zip-compressed'], limit: VERSION_UPLOAD_LIMIT }),
    async (req, res, next) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'Upload a non-empty Python source file' });
      const uploadName = req.get('x-bot-filename') || '';
      if (uploadName.length > 128 || !/^[\w.-]+\.(?:py|zip)$/i.test(uploadName)) return res.status(415).json({ error: 'Upload a .py file or ZIP containing only root-level main.py' });
      if (/\.py$/i.test(uploadName) && req.body.length > MAX_SOURCE_BYTES) return res.status(413).json({ error: 'Python source exceeds the 64 KiB limit' });
      let source;
      try { source = /\.zip$/i.test(uploadName) ? extractMainPythonFromZip(req.body) : req.body; }
      catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
      const code = source.toString('utf8');
      if (source.length > MAX_SOURCE_BYTES || Buffer.from(code, 'utf8').compare(source) !== 0 || code.includes('\u0000')) return res.status(400).json({ error: 'Python source must be valid UTF-8 text up to 64 KiB' });
      const filename = /\.zip$/i.test(uploadName) ? 'main.py' : uploadName;
      const sha256 = createHash('sha256').update(source).digest('hex');
      let client;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        const bot = await client.query('SELECT id FROM bots WHERE id = $1 AND owner_id = $2 FOR UPDATE', [req.params.botId, req.user.id]);
        if (!bot.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bot not found' }); }
        const duplicate = await client.query('SELECT id, version FROM bot_versions WHERE bot_id = $1 AND sha256 = $2', [req.params.botId, sha256]);
        if (duplicate.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This exact source version was already uploaded' }); }
        const version = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM bot_versions WHERE bot_id = $1', [req.params.botId]);
        const id = randomUUID();
        const inserted = await client.query(`INSERT INTO bot_versions
          (id, bot_id, version, api_version, filename, sha256, source, validation_status)
          VALUES ($1, $2, $3, '1.0', $4, $5, $6, 'QUARANTINED')
          RETURNING id, version, api_version, sha256, validation_status, created_at`,
        [id, req.params.botId, Number(version.rows[0].next), filename, sha256, source]);
        await client.query('INSERT INTO bot_validation_jobs (id, bot_version_id) VALUES ($1, $2)', [randomUUID(), id]);
        await client.query('COMMIT');
        res.status(202).json({ version: inserted.rows[0], message: 'Uploaded to quarantine. It cannot be selected until isolated validation is available.' });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        next(error);
      } finally { client?.release(); }
    });

  router.get('/tournaments', async (_req, res, next) => {
    try {
      const result = await pool.query(`SELECT id, name, status, format, submission_deadline, created_at, started_at, completed_at
        FROM tournaments ORDER BY created_at DESC`);
      res.json({ tournaments: result.rows });
    } catch (error) { next(error); }
  });

  router.post('/tournaments', requireAdmin, async (req, res, next) => {
    const name = cleanText(req.body?.name, 100);
    const format = req.body?.format ?? 'ROUND_ROBIN';
    const deadline = req.body?.submissionDeadline ? new Date(req.body.submissionDeadline) : null;
    if (!name) return res.status(400).json({ error: 'Tournament name is required' });
    if (format !== 'ROUND_ROBIN') return res.status(400).json({ error: 'Only round robin scheduling is currently supported' });
    if (deadline && (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now())) return res.status(400).json({ error: 'Submission deadline must be a future date' });
    try {
      const id = randomUUID();
      const rules = { apiVersion: '1.0', maxPlies: 300, decisionTimeoutMs: 2000 };
      const scoring = { win: 3, draw: 1, loss: 0 };
      const client = await pool.connect();
      let result;
      try {
        await client.query('BEGIN');
        result = await client.query(`INSERT INTO tournaments
        (id, name, format, submission_deadline, rules_json, scoring_json, created_by)
        VALUES ($1, $2, 'ROUND_ROBIN', $3, $4::jsonb, $5::jsonb, $6)
        RETURNING id, name, status, format, submission_deadline, rules_json, scoring_json, created_at`,
        [id, name, deadline, JSON.stringify(rules), JSON.stringify(scoring), req.user.id]);
        await client.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
          VALUES ($1, $2, 'TOURNAMENT_CREATED', 'TOURNAMENT', $3, $4::jsonb)`,
        [randomUUID(), req.user.id, id, JSON.stringify({ format, scoring })]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
      res.status(201).json({ tournament: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.patch('/tournaments/:tournamentId', requireAdmin, async (req, res, next) => {
    const name = cleanText(req.body?.name, 100);
    const hasDeadline = Object.hasOwn(req.body || {}, 'submissionDeadline');
    const deadline = hasDeadline && req.body.submissionDeadline ? new Date(req.body.submissionDeadline) : null;
    if (!name) return res.status(400).json({ error: 'Tournament name is required' });
    if (hasDeadline && deadline && (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now())) {
      return res.status(400).json({ error: 'Submission deadline must be a future date or empty' });
    }
    try {
      const result = await pool.query(`UPDATE tournaments SET name = $2,
        submission_deadline = CASE WHEN $3::boolean THEN $4::timestamptz ELSE submission_deadline END
        WHERE id = $1 AND status IN ('DRAFT', 'OPEN')
        RETURNING id, name, status, submission_deadline`,
      [req.params.tournamentId, name, hasDeadline, deadline]);
      if (!result.rowCount) return res.status(409).json({ error: 'Only draft or open tournaments can be edited' });
      await pool.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'TOURNAMENT_UPDATED', 'TOURNAMENT', $3, $4::jsonb)`,
      [randomUUID(), req.user.id, req.params.tournamentId, JSON.stringify({ name, submissionDeadline: deadline })]);
      res.json({ tournament: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.post('/tournaments/:tournamentId/cancel', requireAdmin, async (req, res, next) => {
    try {
      const result = await pool.query(`UPDATE tournaments t SET status = 'CANCELLED', completed_at = now()
        WHERE t.id = $1 AND t.status IN ('DRAFT', 'OPEN', 'LOCKED')
          AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.tournament_id = t.id)
        RETURNING id, status`, [req.params.tournamentId]);
      if (!result.rowCount) return res.status(409).json({ error: 'Only a pre-start tournament without scheduled matches can be cancelled' });
      await pool.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'TOURNAMENT_CANCELLED', 'TOURNAMENT', $3, '{}'::jsonb)`,
      [randomUUID(), req.user.id, req.params.tournamentId]);
      res.json({ tournament: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.post('/tournaments/:tournamentId/open', requireAdmin, async (req, res, next) => {
    try {
      const result = await pool.query(`UPDATE tournaments SET status = 'OPEN'
        WHERE id = $1 AND status = 'DRAFT'
          AND (submission_deadline IS NULL OR submission_deadline > now())
        RETURNING id, status`, [req.params.tournamentId]);
      if (!result.rowCount) return res.status(409).json({ error: 'Tournament must be a draft with an open or future deadline' });
      await pool.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'TOURNAMENT_OPENED', 'TOURNAMENT', $3, '{}'::jsonb)`,
      [randomUUID(), req.user.id, req.params.tournamentId]);
      res.json({ tournament: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.post('/tournaments/:tournamentId/participants', requireUser, async (req, res, next) => {
    const { tournamentId } = req.params;
    const versionId = req.body?.botVersionId;
    if (typeof versionId !== 'string') return res.status(400).json({ error: 'botVersionId is required' });
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const tournament = await client.query('SELECT status, submission_deadline FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
      if (!tournament.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Tournament not found' }); }
      const entry = tournament.rows[0];
      if (entry.status !== 'OPEN' || (entry.submission_deadline && new Date(entry.submission_deadline) <= new Date())) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'Tournament registration is closed' });
      }
      const version = await client.query(`SELECT v.id FROM bot_versions v JOIN bots b ON b.id = v.bot_id
        WHERE v.id = $1 AND b.owner_id = $2 AND v.validation_status = 'READY'`, [versionId, req.user.id]);
      if (!version.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Select one of your bot versions that passed isolated validation' }); }
      await client.query(`INSERT INTO tournament_participants (tournament_id, user_id, bot_version_id)
        VALUES ($1, $2, $3)`, [tournamentId, req.user.id, versionId]);
      await client.query('COMMIT');
      res.status(201).json({ tournamentId, botVersionId: versionId });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') return res.status(409).json({ error: 'You already registered for this tournament' });
      next(error);
    } finally { client?.release(); }
  });

  router.get('/tournaments/:tournamentId/participants', requireAdmin, async (req, res, next) => {
    try {
      const tournament = await pool.query('SELECT id FROM tournaments WHERE id = $1', [req.params.tournamentId]);
      if (!tournament.rowCount) return res.status(404).json({ error: 'Tournament not found' });
      const result = await pool.query(`SELECT p.user_id, u.display_name AS owner_name, u.email,
        p.bot_version_id, b.name AS bot_name, v.version, p.registered_at, p.locked_at
        FROM tournament_participants p JOIN users u ON u.id = p.user_id
        JOIN bot_versions v ON v.id = p.bot_version_id JOIN bots b ON b.id = v.bot_id
        WHERE p.tournament_id = $1 ORDER BY p.registered_at`, [req.params.tournamentId]);
      res.json({ participants: result.rows });
    } catch (error) { next(error); }
  });

  router.delete('/tournaments/:tournamentId/participants/:userId', requireAdmin, async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const tournament = await client.query('SELECT status FROM tournaments WHERE id = $1 FOR UPDATE', [req.params.tournamentId]);
      if (!tournament.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Tournament not found' }); }
      if (tournament.rows[0].status !== 'OPEN') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Participants can only be removed while registration is open' }); }
      const removed = await client.query(`DELETE FROM tournament_participants
        WHERE tournament_id = $1 AND user_id = $2 RETURNING bot_version_id`, [req.params.tournamentId, req.params.userId]);
      if (!removed.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Participant not found' }); }
      await client.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'TOURNAMENT_PARTICIPANT_REMOVED', 'TOURNAMENT', $3, $4::jsonb)`,
      [randomUUID(), req.user.id, req.params.tournamentId, JSON.stringify({ userId: req.params.userId, botVersionId: removed.rows[0].bot_version_id })]);
      await client.query('COMMIT');
      res.status(204).end();
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => {});
      next(error);
    } finally { client?.release(); }
  });

  router.post('/tournaments/:tournamentId/lock', requireAdmin, async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const tournament = await client.query('SELECT id, status FROM tournaments WHERE id = $1 FOR UPDATE', [req.params.tournamentId]);
      if (!tournament.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Tournament not found' }); }
      if (tournament.rows[0].status !== 'OPEN') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Only an open tournament can be locked' }); }
      const count = await client.query('SELECT count(*)::int AS count FROM tournament_participants WHERE tournament_id = $1', [req.params.tournamentId]);
      if (count.rows[0].count < 2) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'At least two participants are required' }); }
      await client.query('UPDATE tournament_participants SET locked_at = now() WHERE tournament_id = $1', [req.params.tournamentId]);
      await client.query("UPDATE tournaments SET status = 'LOCKED' WHERE id = $1", [req.params.tournamentId]);
      await client.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'TOURNAMENT_LOCKED', 'TOURNAMENT', $3, $4::jsonb)`,
      [randomUUID(), req.user.id, req.params.tournamentId, JSON.stringify({ participants: count.rows[0].count })]);
      await client.query('COMMIT');
      res.json({ status: 'LOCKED', participantCount: count.rows[0].count });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally { client?.release(); }
  });

  router.post('/tournaments/:tournamentId/start', requireAdmin, async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const tournamentResult = await client.query('SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [req.params.tournamentId]);
      if (!tournamentResult.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Tournament not found' }); }
      const tournament = tournamentResult.rows[0];
      if (tournament.status !== 'LOCKED' || tournament.format !== 'ROUND_ROBIN') {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'Tournament must be locked and use round robin format' });
      }
      const entrants = await client.query(`SELECT p.bot_version_id FROM tournament_participants p
        JOIN bot_versions v ON v.id = p.bot_version_id
        WHERE p.tournament_id = $1 AND p.locked_at IS NOT NULL AND v.validation_status = 'READY'
        ORDER BY p.registered_at, p.bot_version_id`, [tournament.id]);
      if (entrants.rowCount < 2) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'At least two isolated-validated bot versions are required' }); }
      const schedule = createRoundRobinSchedule(entrants.rows.map(row => row.bot_version_id));
      for (const pairing of schedule) {
        const matchId = randomUUID();
        await client.query(`INSERT INTO matches
          (id, tournament_id, kind, p1_version_id, p2_version_id, round_number, rules_json, scoring_json)
          VALUES ($1, $2, 'TOURNAMENT', $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [matchId, tournament.id, pairing.p1VersionId, pairing.p2VersionId, pairing.round,
          JSON.stringify(tournament.rules_json), JSON.stringify(tournament.scoring_json)]);
        await client.query("INSERT INTO runner_jobs (id, match_id) VALUES ($1, $2)", [randomUUID(), matchId]);
      }
      await client.query("UPDATE tournaments SET status = 'RUNNING', started_at = now() WHERE id = $1", [tournament.id]);
      await client.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'TOURNAMENT_STARTED', 'TOURNAMENT', $3, $4::jsonb)`,
      [randomUUID(), req.user.id, tournament.id, JSON.stringify({ scheduledMatches: schedule.length })]);
      await client.query('COMMIT');
      res.status(202).json({ tournamentId: tournament.id, scheduledMatches: schedule.length });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally { client?.release(); }
  });

  router.post('/tournaments/:tournamentId/pause', requireAdmin, async (req, res, next) => {
    try {
      const result = await pool.query(`UPDATE tournaments SET status = 'PAUSED'
        WHERE id = $1 AND status = 'RUNNING' RETURNING id, status`, [req.params.tournamentId]);
      if (!result.rowCount) return res.status(409).json({ error: 'Only a running tournament can be paused' });
      await pool.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'TOURNAMENT_PAUSED', 'TOURNAMENT', $3, '{}'::jsonb)`,
      [randomUUID(), req.user.id, req.params.tournamentId]);
      res.json({ tournament: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.post('/tournaments/:tournamentId/resume', requireAdmin, async (req, res, next) => {
    try {
      const result = await pool.query(`UPDATE tournaments t SET
        status = CASE WHEN NOT EXISTS (SELECT 1 FROM matches m WHERE m.tournament_id = t.id AND m.status <> 'COMPLETED')
          THEN 'COMPLETED' ELSE 'RUNNING' END,
        completed_at = CASE WHEN NOT EXISTS (SELECT 1 FROM matches m WHERE m.tournament_id = t.id AND m.status <> 'COMPLETED')
          THEN now() ELSE NULL END
        WHERE t.id = $1 AND t.status = 'PAUSED' RETURNING id, status`, [req.params.tournamentId]);
      if (!result.rowCount) return res.status(409).json({ error: 'Only a paused tournament can resume' });
      await pool.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
        VALUES ($1, $2, 'TOURNAMENT_RESUMED', 'TOURNAMENT', $3, '{}'::jsonb)`,
      [randomUUID(), req.user.id, req.params.tournamentId]);
      res.json({ tournament: result.rows[0] });
    } catch (error) { next(error); }
  });

  router.get('/tournaments/:tournamentId/leaderboard', async (req, res, next) => {
    try {
      const tournament = await pool.query('SELECT id, scoring_json FROM tournaments WHERE id = $1', [req.params.tournamentId]);
      if (!tournament.rowCount) return res.status(404).json({ error: 'Tournament not found' });
      const entrants = await pool.query(`SELECT p.bot_version_id, v.version, b.name AS bot_name, u.display_name AS owner_name
        FROM tournament_participants p JOIN bot_versions v ON v.id = p.bot_version_id
        JOIN bots b ON b.id = v.bot_id JOIN users u ON u.id = p.user_id
        WHERE p.tournament_id = $1`, [req.params.tournamentId]);
      const games = await pool.query(`SELECT p1_version_id, p2_version_id, result_json
        FROM matches WHERE tournament_id = $1 AND status = 'COMPLETED'`, [req.params.tournamentId]);
      const matches = games.rows.map(row => ({ status: 'COMPLETED', p1VersionId: row.p1_version_id,
        p2VersionId: row.p2_version_id, result: row.result_json }));
      const participants = entrants.rows.map(row => ({ botVersionId: row.bot_version_id, version: row.version,
        botName: row.bot_name, ownerName: row.owner_name }));
      res.json({ leaderboard: calculateStandings(participants, matches, tournament.rows[0].scoring_json),
        scoring: tournament.rows[0].scoring_json });
    } catch (error) { next(error); }
  });

  router.get('/tournaments/:tournamentId/matches', async (req, res, next) => {
    try {
      const tournament = await pool.query('SELECT id FROM tournaments WHERE id = $1', [req.params.tournamentId]);
      if (!tournament.rowCount) return res.status(404).json({ error: 'Tournament not found' });
      const result = await pool.query(`SELECT m.id, m.round_number, m.status, m.result_json, m.created_at, m.completed_at,
        b1.name AS p1_bot_name, u1.display_name AS p1_owner_name,
        b2.name AS p2_bot_name, u2.display_name AS p2_owner_name
        FROM matches m
        JOIN bot_versions v1 ON v1.id = m.p1_version_id JOIN bots b1 ON b1.id = v1.bot_id
        JOIN users u1 ON u1.id = b1.owner_id
        JOIN bot_versions v2 ON v2.id = m.p2_version_id JOIN bots b2 ON b2.id = v2.bot_id
        JOIN users u2 ON u2.id = b2.owner_id
        WHERE m.tournament_id = $1 ORDER BY m.round_number, m.created_at`, [req.params.tournamentId]);
      res.json({ matches: result.rows });
    } catch (error) { next(error); }
  });

  router.get('/matches/:matchId/replay', async (req, res, next) => {
    try {
      const game = await pool.query(`SELECT m.id, m.kind, m.status, m.result_json, m.error_message, m.initial_board_json, m.final_board_json,
        b1.name AS p1_bot_name, u1.display_name AS p1_owner_name,
        b2.name AS p2_bot_name, u2.display_name AS p2_owner_name
        FROM matches m
        JOIN bot_versions v1 ON v1.id = m.p1_version_id JOIN bots b1 ON b1.id = v1.bot_id JOIN users u1 ON u1.id = b1.owner_id
        JOIN bot_versions v2 ON v2.id = m.p2_version_id JOIN bots b2 ON b2.id = v2.bot_id JOIN users u2 ON u2.id = b2.owner_id
        WHERE m.id = $1`, [req.params.matchId]);
      if (!game.rowCount) return res.status(404).json({ error: 'Match not found' });
      const movesResult = await pool.query('SELECT ply, event_json FROM match_moves WHERE match_id = $1 ORDER BY ply', [req.params.matchId]);
      const row = game.rows[0];
      const record = { matchId: row.id, initialBoard: row.initial_board_json,
        finalBoard: row.final_board_json, moves: movesResult.rows.map(move => move.event_json), result: row.result_json };
      if (!record.initialBoard) return res.status(409).json({ error: 'This match does not have a saved replay yet' });
      const requestedPly = req.query.ply === undefined ? record.moves.length : Number(req.query.ply);
      res.json({ matchId: row.id, matchKind: row.kind, status: row.status, result: row.result_json, errorMessage: row.error_message,
        players: { p1: { botName: row.p1_bot_name, ownerName: row.p1_owner_name },
          p2: { botName: row.p2_bot_name, ownerName: row.p2_owner_name } },
        totalPlies: record.moves.length, frame: replayFrame(record, requestedPly) });
    } catch (error) { next(error); }
  });

  router.get('/admin/jobs', requireAdmin, async (_req, res, next) => {
    try {
      const result = await pool.query(`SELECT j.id, j.match_id, j.status, j.attempts, j.lease_until, j.created_at, j.updated_at,
        m.tournament_id, 'MATCH' AS job_type FROM runner_jobs j JOIN matches m ON m.id = j.match_id
        UNION ALL
        SELECT v.id, NULL::uuid AS match_id, v.status, v.attempts, v.lease_until, v.created_at, v.updated_at,
        NULL::uuid AS tournament_id, 'VALIDATION' AS job_type FROM bot_validation_jobs v
        ORDER BY created_at DESC LIMIT 200`);
      res.json({ jobs: result.rows });
    } catch (error) { next(error); }
  });

  router.post('/admin/jobs/:jobId/retry', requireAdmin, async (req, res, next) => {
    const { jobType } = req.body || {};
    if (!['MATCH', 'VALIDATION'].includes(jobType)) return res.status(400).json({ error: 'jobType must be MATCH or VALIDATION' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (jobType === 'MATCH') {
        const match = await client.query(`UPDATE runner_jobs j SET status = 'QUEUED', attempts = 0, lease_until = NULL, updated_at = now()
          FROM matches m WHERE j.id = $1 AND j.match_id = m.id AND j.status = 'FAILED' RETURNING m.id AS match_id, m.tournament_id`, [req.params.jobId]);
        if (!match.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Failed match job not found' }); }
        await client.query("UPDATE matches SET status = 'QUEUED', error_message = NULL, result_json = NULL, completed_at = NULL WHERE id = $1", [match.rows[0].match_id]);
        await client.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
          VALUES ($1, $2, 'MATCH_JOB_REQUEUED', 'MATCH', $3, '{}'::jsonb)`,
        [randomUUID(), req.user.id, match.rows[0].match_id]);
      } else {
        const validation = await client.query(`UPDATE bot_validation_jobs SET status = 'QUEUED', attempts = 0,
          lease_until = NULL, result_message = NULL, updated_at = now()
          WHERE id = $1 AND status = 'FAILED' RETURNING bot_version_id`, [req.params.jobId]);
        if (!validation.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Failed validation job not found' }); }
        await client.query("UPDATE bot_versions SET validation_status = 'QUARANTINED', validation_message = NULL WHERE id = $1", [validation.rows[0].bot_version_id]);
        await client.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
          VALUES ($1, $2, 'BOT_VALIDATION_REQUEUED', 'BOT_VERSION', $3, '{}'::jsonb)`,
        [randomUUID(), req.user.id, validation.rows[0].bot_version_id]);
      }
      await client.query('COMMIT');
      res.status(202).json({ queued: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally { client.release(); }
  });

  router.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Python file must be 64 KiB or smaller' });
    console.error('Bot platform request failed:', error?.message || error);
    res.status(500).json({ error: 'Request could not be completed' });
  });
  return router;
}
