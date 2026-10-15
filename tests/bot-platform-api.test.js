import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createBotPlatformRouter } from '../server/bots/platformRouter.js';

const authSecret = 'test secret for bot platform with enough bytes';
let account;
let bot;
let version;
const opponentVersionId = '00000000-0000-4000-8000-000000000001';
const pool = {
  async query(sql, params) {
    if (sql.startsWith('INSERT INTO users')) {
      account = { id: params[0], email: params[1], displayName: params[2], passwordHash: params[3], role: 'USER' };
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('FROM users WHERE lower(email)')) {
      return { rowCount: account?.email === params[0] ? 1 : 0,
        rows: account?.email === params[0] ? [{ id: account.id, email: account.email, display_name: account.displayName, password_hash: account.passwordHash }] : [] };
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
    throw new Error(`Unexpected query: ${sql}`);
  },
  async connect() {
    return {
      async query(sql, params = []) {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
        if (sql.includes('FROM bot_versions v JOIN bots b') && sql.includes('FOR SHARE OF v')) {
          const rows = [];
          if (params[0].includes(version?.id) && version?.validation_status === 'READY') rows.push({ id: version.id, owner_id: bot.ownerId });
          if (params[0].includes(opponentVersionId)) rows.push({ id: opponentVersionId, owner_id: 'another-user' });
          return { rowCount: rows.length, rows };
        }
        if (sql.includes("kind = 'PRACTICE' AND status IN")) return { rowCount: 1, rows: [{ count: 0 }] };
        if (sql.includes("INSERT INTO matches")) return { rowCount: 1, rows: [] };
        if (sql.includes('INSERT INTO runner_jobs')) return { rowCount: 1, rows: [] };
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
  assert.equal((await fetch(`${base}/bots`)).status, 401);
  const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/auth/me`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: 'incorrect password' }) })).status, 401);
  const created = await fetch(`${base}/bots`, { method: 'POST', headers, body: JSON.stringify({ name: 'My bot' }) });
  assert.equal(created.status, 201);
  const { bot: newBot } = await created.json();
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
    body: JSON.stringify({ ownBotVersionId: version.id, opponentBotVersionId: opponentVersionId }) });
  assert.equal(practice.status, 202, 'practice matches are queued only after isolated validation');
  const oversized = await fetch(`${base}/bots/${newBot.id}/versions`, { method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'text/x-python', 'x-bot-filename': 'main.py' },
    body: 'x'.repeat(70 * 1024) });
  assert.equal(oversized.status, 413);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
console.log('✓ Authenticated account, bot and quarantined Python version API');
