import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createBotPlatformRouter } from '../server/bots/platformRouter.js';

const authSecret = 'test secret for bot platform with enough bytes';
let account;
let bot;
let version;
let tournamentStatus = 'DRAFT';
const participants = [{ user_id: 'player-2', owner_name: 'Second player', email: 'second@example.test', bot_version_id: 'v2', bot_name: 'Other bot', version: 1 }];
const practiceMatches = [];
const opponentVersionId = '00000000-0000-4000-8000-000000000001';
const pool = {
  async query(sql, params) {
    if (sql.startsWith('INSERT INTO users')) {
      account = { id: params[0], email: params[1], displayName: params[2], passwordHash: params[3], role: 'USER' };
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('FROM users WHERE lower(email)')) {
      return { rowCount: account?.email === params[0] ? 1 : 0,
        rows: account?.email === params[0] ? [{ id: account.id, email: account.email, display_name: account.displayName, password_hash: account.passwordHash, role: account.role }] : [] };
    }
    if (sql.includes('FROM users WHERE id = $1')) return { rowCount: account?.id === params[0] ? 1 : 0,
      rows: account ? [{ id: account.id, email: account.email, display_name: account.displayName, role: account.role }] : [] };
    if (sql.includes('FROM bots b LEFT JOIN')) return { rowCount: 0, rows: [] };
    if (sql.includes("WHERE v.validation_status = 'READY' ORDER BY")) {
      const rows = [];
      if (version?.validation_status === 'READY') rows.push({ bot_version_id: version.id, version: 1, bot_id: bot.id,
        bot_name: bot.name, owner_name: account.displayName, is_mine: true });
      rows.push({ bot_version_id: opponentVersionId, version: 1, bot_id: 'opponent-bot', bot_name: 'Opponent', owner_name: 'Other', is_mine: false });
      return { rowCount: rows.length, rows };
    }
    if (sql.includes("WHERE m.kind = 'PRACTICE' AND m.created_by = $1")) return { rowCount: 0, rows: [] };
    if (sql.startsWith('INSERT INTO bots')) { bot = { id: params[0], ownerId: params[1], name: params[2], description: params[3] }; return { rowCount: 1, rows: [] }; }
    if (sql.startsWith('UPDATE bots SET name')) {
      if (bot?.id !== params[0] || bot.ownerId !== params[1]) return { rowCount: 0, rows: [] };
      bot.name = params[2]; bot.description = params[3]; return { rowCount: 1, rows: [{ id: bot.id, name: bot.name, description: bot.description }] };
    }
    if (sql.startsWith('DELETE FROM bots')) {
      if (bot?.id !== params[0] || bot.ownerId !== params[1]) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: bot.id }] };
    }
    if (sql.startsWith('UPDATE tournaments SET name')) {
      if (!['DRAFT', 'OPEN'].includes(tournamentStatus)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: params[0], name: params[1], status: tournamentStatus, submission_deadline: params[3] }] };
    }
    if (sql.includes("SET status = 'CANCELLED'")) {
      if (!['DRAFT', 'OPEN', 'LOCKED'].includes(tournamentStatus)) return { rowCount: 0, rows: [] };
      tournamentStatus = 'CANCELLED'; return { rowCount: 1, rows: [{ id: params[0], status: tournamentStatus }] };
    }
    if (sql.includes('INSERT INTO audit_logs')) return { rowCount: 1, rows: [] };
    if (sql.includes('FROM users ORDER BY created_at DESC, id LIMIT')) return { rowCount: 2, rows: [
      { id: account.id, email: account.email, display_name: account.displayName, role: account.role },
      { id: 'user-2', email: 'other@example.test', display_name: 'Other', role: 'USER' }] };
    if (sql.startsWith('UPDATE users SET role')) return { rowCount: params[0] === 'user-2' ? 1 : 0,
      rows: params[0] === 'user-2' ? [{ id: 'user-2', email: 'other@example.test', display_name: 'Other', role: params[1] }] : [] };
    if (sql === 'SELECT id FROM tournaments WHERE id = $1') return { rowCount: 1, rows: [{ id: params[0] }] };
    if (sql.includes('FROM tournament_participants p JOIN users')) return { rowCount: participants.length, rows: participants };
    throw new Error(`Unexpected query: ${sql}`);
  },
  async connect() {
    return {
      async query(sql, params = []) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [] };
        if (sql.includes('AS total') && sql.includes('AS daily')) return { rowCount: 1, rows: [{ total: 0, daily: 0, pending: 0 }] };
        if (sql.includes('FROM bot_versions v JOIN bots b') && sql.includes('FOR SHARE OF v')) {
          const rows = [];
          if (params[0].includes(version?.id) && version?.validation_status === 'READY') rows.push({ id: version.id, owner_id: bot.ownerId });
          if (params[0].includes(opponentVersionId)) rows.push({ id: opponentVersionId, owner_id: 'another-user' });
          return { rowCount: rows.length, rows };
        }
        if (sql.includes("kind = 'PRACTICE' AND status IN")) return { rowCount: 1, rows: [{ count: practiceMatches.length }] };
        if (sql.includes("INSERT INTO matches")) { practiceMatches.push({ p1: params[2], p2: params[3] }); return { rowCount: 1, rows: [] }; }
        if (sql.includes('INSERT INTO runner_jobs')) return { rowCount: 1, rows: [] };
        if (sql.includes('SELECT status FROM tournaments WHERE id = $1 FOR UPDATE')) return { rowCount: 1, rows: [{ status: 'OPEN' }] };
        if (sql.includes('DELETE FROM tournament_participants')) {
          const index = participants.findIndex(item => item.user_id === params[1]);
          return index < 0 ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [participants.splice(index, 1)[0]] };
        }
        if (sql.includes('INSERT INTO audit_logs')) return { rowCount: 1, rows: [] };
        if (sql.includes('FROM bots WHERE id = $1 AND owner_id = $2')) return { rowCount: bot?.id === params[0] && bot.ownerId === params[1] ? 1 : 0, rows: bot ? [{ id: bot.id }] : [] };
        if (sql.includes('FROM bot_versions WHERE bot_id = $1 AND sha256 = $2')) return { rowCount: 0, rows: [] };
        if (sql.includes('SELECT COALESCE(MAX(version)')) return { rowCount: 1, rows: [{ next: 1 }] };
        if (sql.includes('INSERT INTO bot_versions')) {
          version = { id: params[0], version: params[2], api_version: '1.0', sha256: params[4], validation_status: 'QUARANTINED', created_at: new Date().toISOString(), source: params[5] };
          return { rowCount: 1, rows: [version] };
        }
        if (sql.includes('INSERT INTO bot_validation_jobs')) return { rowCount: 1, rows: [] };
        throw new Error(`Unexpected transaction query: ${sql}`);
      }, release() {}
    };
  }
};

const app = express();
app.use(express.json());
app.use('/api/platform', createBotPlatformRouter({ pool, authSecret }));
const server = http.createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/platform`;
try {
  const registered = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'player@example.test', displayName: 'Player', password: 'correct horse battery staple' }) });
  assert.equal(registered.status, 201);
  const { user, accessToken } = await registered.json();
  assert.equal(user.email, 'player@example.test');
  assert.equal(user.role, 'USER');
  assert.equal((await fetch(`${base}/bots`)).status, 401);
  const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/auth/me`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: 'incorrect password' }) })).status, 401);
  const created = await fetch(`${base}/bots`, { method: 'POST', headers, body: JSON.stringify({ name: 'My bot' }) });
  assert.equal(created.status, 201);
  const { bot: newBot } = await created.json();
  const renamed = await fetch(`${base}/bots/${newBot.id}`, { method: 'PATCH', headers,
    body: JSON.stringify({ name: 'Tactical', description: 'Wait and advance.' }) });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).bot.name, 'Tactical');
  const upload = await fetch(`${base}/bots/${newBot.id}/versions`, { method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'text/x-python', 'x-bot-filename': 'main.py' },
    body: 'print("hello")' });
  assert.equal(upload.status, 202);
  assert.equal((await upload.json()).version.validation_status, 'QUARANTINED');
  assert.deepEqual(version.source, Buffer.from('print("hello")'));
  assert.equal((await fetch(`${base}/practice/bots`, { headers })).status, 200);
  const unauditedPractice = await fetch(`${base}/practice/matches`, { headers });
  assert.equal(unauditedPractice.status, 200);
  assert.equal((await fetch(`${base}/practice/matches`, { method: 'POST', headers,
    body: JSON.stringify({ ownBotVersionId: version.id, opponentBotVersionId: opponentVersionId }) })).status, 400,
  'quarantined versions cannot be run in practice');
  version.validation_status = 'READY';
  const practice = await fetch(`${base}/practice/matches`, { method: 'POST', headers,
    body: JSON.stringify({ ownBotVersionId: version.id, opponentBotVersionId: opponentVersionId, count: 3 }) });
  assert.equal(practice.status, 202, 'practice matches are queued only after isolated validation');
  const batch = await practice.json();
  assert.equal(batch.matchIds.length, 3);
  assert.equal(practiceMatches[0].p1, version.id);
  assert.equal(practiceMatches[1].p1, opponentVersionId, 'batch alternates the starting side');
  assert.equal(practiceMatches[2].p1, version.id);
  assert.equal((await fetch(`${base}/practice/matches`, { method: 'POST', headers,
    body: JSON.stringify({ ownBotVersionId: version.id, opponentBotVersionId: opponentVersionId }) })).status, 429,
  'practice queue cap applies across a batch');
  const oversized = await fetch(`${base}/bots/${newBot.id}/versions`, { method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'text/x-python', 'x-bot-filename': 'main.py' },
    body: 'x'.repeat(70 * 1024) });
  assert.equal(oversized.status, 413);
  const deleted = await fetch(`${base}/bots/${newBot.id}`, { method: 'DELETE', headers });
  assert.equal(deleted.status, 204);
  const deniedTournamentEdit = await fetch(`${base}/tournaments/t1`, { method: 'PATCH', headers,
    body: JSON.stringify({ name: 'Season', submissionDeadline: null }) });
  assert.equal(deniedTournamentEdit.status, 403, 'tournament administration is role protected');
  account.role = 'ADMIN';
  const adminLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: 'correct horse battery staple' }) });
  assert.equal(adminLogin.status, 200);
  const adminSession = await adminLogin.json();
  assert.equal(adminSession.user.role, 'ADMIN', 'admin controls must be available immediately after login');
  assert.equal(adminSession.user.password_hash, undefined, 'login must not expose the stored password hash');
  const tournamentEdit = await fetch(`${base}/tournaments/t1`, { method: 'PATCH', headers,
    body: JSON.stringify({ name: 'Season', submissionDeadline: null }) });
  assert.equal(tournamentEdit.status, 200);
  const listParticipants = await fetch(`${base}/tournaments/t1/participants`, { headers });
  assert.equal(listParticipants.status, 200);
  assert.equal((await listParticipants.json()).participants.length, 1);
  assert.equal((await fetch(`${base}/tournaments/t1/participants/player-2`, { method: 'DELETE', headers })).status, 204);
  const cancelled = await fetch(`${base}/tournaments/t1/cancel`, { method: 'POST', headers });
  assert.equal(cancelled.status, 200);
  assert.equal((await fetch(`${base}/tournaments/t1/cancel`, { method: 'POST', headers })).status, 409,
    'cancelling a terminal tournament is rejected');
  assert.equal((await fetch(`${base}/admin/users`, { headers })).status, 200);
  const changedRole = await fetch(`${base}/admin/users/user-2/role`, { method: 'PATCH', headers,
    body: JSON.stringify({ role: 'ADMIN' }) });
  assert.equal(changedRole.status, 200);
  assert.equal((await fetch(`${base}/admin/users/${user.id}/role`, { method: 'PATCH', headers,
    body: JSON.stringify({ role: 'USER' }) })).status, 409, 'administrator cannot accidentally demote itself');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
console.log('✓ Authenticated account, bot and quarantined Python version API');
