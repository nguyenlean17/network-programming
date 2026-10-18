import { randomUUID } from 'node:crypto';
import { rollbackQuietly } from './database.js';
import { pagination, pageResult } from './pagination.js';
import { qualificationPairings, QUALIFIER_LEADERBOARD_SQL } from './qualification.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const route = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
async function transaction(pool, operation) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await rollbackQuietly(client);
    if (error.code === '23505') fail(409, 'Phiên bản mã nguồn này đã được nộp vào vòng loại.');
    throw error;
  } finally { client?.release(); }
}
async function audit(client, userId, action, id) {
  await client.query(`INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json)
    VALUES ($1, $2, $3, 'QUALIFIER', $4, '{}'::jsonb)`, [randomUUID(), userId, action, id]);
}

export function installQualifierRoutes(router, { pool, requireUser, requireAdmin }) {
  router.get('/qualifiers', route(async (req, res) => {
    const paging = pagination(req.query);
    const result = await pool.query(`SELECT q.*, (SELECT count(*)::int FROM qualifier_benchmarks WHERE qualifier_id = q.id) AS benchmark_count
      FROM qualifiers q ORDER BY q.created_at DESC, q.id LIMIT $1 OFFSET $2`, [paging.limit + 1, paging.offset]);
    res.json(pageResult(result.rows, paging, 'qualifiers'));
  }));

  router.get('/qualifiers/benchmarks', requireAdmin, route(async (req, res) => {
    const result = await pool.query(`SELECT v.id, v.version, b.name FROM bot_versions v JOIN bots b ON b.id = v.bot_id
      WHERE v.validation_status = 'READY' AND (b.owner_id = $1 OR b.is_public_sample = true)
      ORDER BY b.is_public_sample DESC, b.name, v.version DESC LIMIT 100`, [req.user.id]);
    res.json({ benchmarks: result.rows });
  }));

  router.post('/qualifiers', requireAdmin, route(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const deadline = new Date(req.body?.submissionDeadline);
    const benchmarks = req.body?.benchmarkVersionIds;
    const rounds = req.body?.roundsPerOpponent ?? 1;
    const maxSubmissions = req.body?.maxSubmissions ?? 20;
    if (!name || name.length > 100 || !Number.isFinite(deadline.getTime()) || deadline <= new Date()) fail(400, 'Cần tên vòng loại và hạn nộp trong tương lai.');
    if (!Array.isArray(benchmarks) || benchmarks.length < 1 || benchmarks.length > 8 || benchmarks.some(id => !uuid(id)) ||
        new Set(benchmarks).size !== benchmarks.length || !Number.isInteger(rounds) || rounds < 1 || rounds > 3 ||
        !Number.isInteger(maxSubmissions) || maxSubmissions < 1 || maxSubmissions > 100) fail(400, 'Chọn 1–8 bot chuẩn, 1–3 cặp trận mỗi đối thủ và giới hạn 1–100 bài mỗi tài khoản.');
    const qualifier = await transaction(pool, async client => {
      const eligible = await client.query(`SELECT v.id FROM bot_versions v JOIN bots b ON b.id = v.bot_id
        WHERE v.id = ANY($1::uuid[]) AND v.validation_status = 'READY' AND (b.owner_id = $2 OR b.is_public_sample = true) FOR SHARE OF v`, [benchmarks, req.user.id]);
      if (eligible.rowCount !== benchmarks.length) fail(400, 'Bot chuẩn phải là bot mẫu hoặc bot của quản trị viên, đã qua kiểm tra.');
      const id = randomUUID();
      const rules = { apiVersion: '1.0', maxPlies: 300, decisionTimeoutMs: 2000, scoring: { win: 3, draw: 1, loss: 0 }, ranking: 'BEST_SUBMISSION', tiedRanks: true };
      const created = await client.query(`INSERT INTO qualifiers (id,name,submission_deadline,rounds_per_opponent,max_submissions,rules_json,created_by)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING *`, [id, name, deadline, rounds, maxSubmissions, JSON.stringify(rules), req.user.id]);
      for (const [index, versionId] of benchmarks.entries()) await client.query(`INSERT INTO qualifier_benchmarks
        (qualifier_id,bot_version_id,position) VALUES ($1,$2,$3)`, [id, versionId, index]);
      await audit(client, req.user.id, 'QUALIFIER_CREATED', id);
      return created.rows[0];
    });
    res.status(201).json({ qualifier });
  }));

  for (const action of ['open', 'close', 'finalize']) router.post(`/qualifiers/:id/${action}`, requireAdmin, route(async (req, res) => {
    if (!uuid(req.params.id)) fail(400, 'Mã vòng loại không hợp lệ.');
    const qualifier = await transaction(pool, async client => {
      const found = await client.query('SELECT * FROM qualifiers WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!found.rowCount) fail(404, 'Không tìm thấy vòng loại.');
      const q = found.rows[0];
      if (action === 'open' && (q.status !== 'DRAFT' || new Date(q.submission_deadline) <= new Date())) fail(409, 'Chỉ mở vòng loại nháp chưa hết hạn.');
      if (action === 'close' && q.status !== 'OPEN') fail(409, 'Vòng loại không còn mở.');
      if (action === 'finalize') {
        if (q.status !== 'CLOSED' && !(q.status === 'OPEN' && new Date(q.submission_deadline) <= new Date())) fail(409, 'Đóng nhận bài trước khi chốt kết quả.');
        const pending = await client.query(`SELECT 1 FROM qualifier_submissions WHERE qualifier_id = $1 AND status <> 'COMPLETED' LIMIT 1`, [q.id]);
        if (pending.rowCount) fail(409, 'Còn bài chưa chấm xong. Cần hoàn tất hoặc xử lý các trận lỗi trước khi chốt.');
      }
      const status = { open: 'OPEN', close: 'CLOSED', finalize: 'FINALIZED' }[action];
      const updated = await client.query(`UPDATE qualifiers SET status = $2,
        finalized_at = CASE WHEN $2 = 'FINALIZED' THEN now() ELSE finalized_at END WHERE id = $1 RETURNING *`, [q.id, status]);
      await audit(client, req.user.id, `QUALIFIER_${status}`, q.id);
      return updated.rows[0];
    });
    res.json({ qualifier });
  }));

  router.post('/qualifiers/:id/submissions', requireUser, route(async (req, res) => {
    const versionId = req.body?.botVersionId;
    if (!uuid(req.params.id) || !uuid(versionId)) fail(400, 'Chọn vòng loại và phiên bản bot hợp lệ.');
    const result = await transaction(pool, async client => {
      // Many students can submit concurrently; only one account's submissions serialize.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`qualifier-submit:${req.user.id}`]);
      const found = await client.query('SELECT * FROM qualifiers WHERE id = $1 FOR SHARE', [req.params.id]);
      if (!found.rowCount) fail(404, 'Không tìm thấy vòng loại.');
      const q = found.rows[0];
      if (q.status !== 'OPEN' || new Date(q.submission_deadline) <= new Date()) fail(409, 'Vòng loại đã đóng nhận bài hoặc hết hạn.');
      const version = await client.query(`SELECT v.id, v.sha256 FROM bot_versions v JOIN bots b ON b.id = v.bot_id
        WHERE v.id = $1 AND b.owner_id = $2 AND v.validation_status = 'READY' FOR SHARE OF v`, [versionId, req.user.id]);
      if (!version.rowCount) fail(400, 'Chỉ nộp phiên bản của bạn đã qua kiểm tra.');
      const duplicate = await client.query('SELECT id FROM qualifier_submissions WHERE qualifier_id = $1 AND user_id = $2 AND source_sha256 = $3', [q.id, req.user.id, version.rows[0].sha256]);
      if (duplicate.rowCount) fail(409, 'Mã nguồn này đã được chấm hoặc đang chờ chấm trong vòng loại.');
      const counts = await client.query(`SELECT count(*) FILTER (WHERE qualifier_id = $2)::int AS total,
        count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS daily
        FROM qualifier_submissions WHERE user_id = $1`, [req.user.id, q.id]);
      if (counts.rows[0].pending >= 1) fail(429, 'Bạn đang có một bài chờ chấm. Hãy đợi hoàn tất trước khi nộp tiếp.');
      if (counts.rows[0].daily >= 5 || counts.rows[0].total >= q.max_submissions) fail(429, 'Đã đạt giới hạn 5 bài trong 24 giờ hoặc tổng số bài của vòng loại.');
      const opponents = await client.query('SELECT bot_version_id FROM qualifier_benchmarks WHERE qualifier_id = $1 ORDER BY position', [q.id]);
      if (opponents.rows.some(row => row.bot_version_id === versionId)) fail(400, 'Không thể nộp chính phiên bản bot chuẩn để tích điểm.');
      const pairings = qualificationPairings(versionId, opponents.rows.map(row => row.bot_version_id), q.rounds_per_opponent);
      const id = randomUUID();
      await client.query(`INSERT INTO qualifier_submissions (id,qualifier_id,user_id,bot_version_id,source_sha256,expected_matches)
        VALUES ($1,$2,$3,$4,$5,$6)`, [id, q.id, req.user.id, versionId, version.rows[0].sha256, pairings.length]);
      const games = pairings.map(pairing => ({ ...pairing, id: randomUUID() }));
      await client.query(`INSERT INTO matches (id,created_by,kind,p1_version_id,p2_version_id,round_number,rules_json,scoring_json,qualifier_submission_id)
        SELECT g.id,$2,'QUALIFICATION',g.p1,g.p2,g.round,$3::jsonb,$4::jsonb,$5
        FROM jsonb_to_recordset($1::jsonb) AS g(id uuid,p1 uuid,p2 uuid,round integer)`,
      [JSON.stringify(games), req.user.id, JSON.stringify(q.rules_json), JSON.stringify(q.rules_json.scoring), id]);
      await client.query(`INSERT INTO runner_jobs (id,match_id) SELECT gen_random_uuid(),id FROM matches WHERE qualifier_submission_id = $1`, [id]);
      return { submissionId: id, matches: pairings.length, status: 'PENDING' };
    });
    res.status(202).json(result);
  }));

  router.get('/qualifiers/:id/submissions', requireUser, route(async (req, res) => {
    if (!uuid(req.params.id)) fail(400, 'Mã vòng loại không hợp lệ.');
    const paging = pagination(req.query);
    const result = await pool.query(`SELECT s.*, b.name AS bot_name, v.version,
      (SELECT count(*)::int FROM matches WHERE qualifier_submission_id = s.id AND status = 'COMPLETED') AS completed_matches,
      (SELECT count(*)::int FROM matches WHERE qualifier_submission_id = s.id AND status = 'FAILED') AS failed_matches
      FROM qualifier_submissions s JOIN bot_versions v ON v.id = s.bot_version_id JOIN bots b ON b.id = v.bot_id
      WHERE s.qualifier_id = $1 AND s.user_id = $2 ORDER BY s.created_at DESC,s.id LIMIT $3 OFFSET $4`,
    [req.params.id, req.user.id, paging.limit + 1, paging.offset]);
    res.json(pageResult(result.rows, paging, 'submissions'));
  }));

  router.get('/qualifiers/:id/submissions/:submissionId/matches', requireUser, route(async (req, res) => {
    if (!uuid(req.params.id) || !uuid(req.params.submissionId)) fail(400, 'Mã bài nộp không hợp lệ.');
    const result = await pool.query(`SELECT m.id,m.status,m.result_json,m.error_message,
      (m.initial_board_json IS NOT NULL) AS replay_available FROM matches m JOIN qualifier_submissions s ON s.id = m.qualifier_submission_id
      WHERE s.id = $1 AND s.qualifier_id = $2 AND (s.user_id = $3 OR $4::boolean) ORDER BY m.created_at,m.id`,
    [req.params.submissionId, req.params.id, req.user.id, req.user.role === 'ADMIN']);
    res.json({ matches: result.rows });
  }));

  router.get('/qualifiers/:id/leaderboard', route(async (req, res) => {
    if (!uuid(req.params.id)) fail(400, 'Mã vòng loại không hợp lệ.');
    const paging = pagination(req.query);
    const result = await pool.query(QUALIFIER_LEADERBOARD_SQL, [req.params.id, paging.limit + 1, paging.offset]);
    res.json(pageResult(result.rows, paging, 'leaderboard'));
  }));
}
