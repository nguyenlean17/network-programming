import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import express from 'express';
import { createBotPlatformRouter } from '../server/bots/platformRouter.js';
import { signAccessToken } from '../server/bots/auth.js';
import { watchPoolErrors, isDatabaseUnavailable } from '../server/bots/database.js';

const authSecret = 'database-failure-test-secret-with-32-bytes';
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.test', display_name: 'Test', role: 'ADMIN' };
const failure = Object.assign(new Error('test database disconnected'), { code: 'ECONNRESET' });
let mode = 'connect';
let released = 0;
const pool = {
  async query() {
    if (mode === 'query') throw failure;
    return { rowCount: 1, rows: [user] };
  },
  async connect() {
    if (mode === 'connect') throw failure;
    return {
      async query() { throw failure; }, // BEGIN and even ROLLBACK fail on a lost socket.
      release() { released++; }
    };
  }
};
const events = new EventEmitter();
const messages = [];
watchPoolErrors(events, 'Test pool', { error: (...args) => messages.push(args) });
events.emit('error', failure);
assert.equal(messages.length, 1, 'idle pool errors must be handled instead of terminating the process');
assert.ok(isDatabaseUnavailable(new Error('Connection terminated unexpectedly')));
assert.equal(isDatabaseUnavailable({ code: '23505' }), false);

const app = express();
app.use(express.json());
app.use('/api/platform', createBotPlatformRouter({ pool, authSecret }));
const server = http.createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/platform`;
const headers = { authorization: `Bearer ${signAccessToken(user, authSecret)}`, 'content-type': 'application/json' };
const routes = [
  ['/practice/matches', { ownBotVersionId: 'v1', opponentBotVersionId: 'v2' }],
  ['/tournaments', { name: 'Test tournament' }],
  ['/tournaments/t1/participants', { botVersionId: 'v1' }],
  ['/tournaments/t1/lock', {}],
  ['/tournaments/t1/start', {}],
  ['/admin/jobs/j1/retry', { jobType: 'MATCH' }],
  ['/admin/jobs/j1/retry', { jobType: 'VALIDATION' }],
  ['/tournaments/t1/participants/u1', {}, 'DELETE'],
  ['/bots/b1/versions', 'print(1)', 'POST', { 'content-type': 'text/x-python', 'x-bot-filename': 'main.py' }]
];
async function expectUnavailable(path, options = {}) {
  const response = await fetch(`${base}${path}`, { headers, ...options, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 503, `${path} should return a controlled temporary failure`);
  assert.equal(response.headers.get('retry-after'), '5');
  assert.match((await response.json()).error, /temporarily unavailable/);
}
try {
  for (mode of ['connect', 'transaction']) {
    for (const [path, body, method = 'POST', extraHeaders = {}] of routes) {
      await expectUnavailable(path, { method, headers: { ...headers, ...extraHeaders },
        body: typeof body === 'string' ? body : JSON.stringify(body) });
    }
    assert.equal((await fetch(`${base}/auth/me`, { headers })).status, 200, 'server still accepts requests after failures');
  }
  assert.equal(released, routes.length, 'every acquired transaction client is released');
  mode = 'query';
  await expectUnavailable('/bots');
  await expectUnavailable('/auth/login', { method: 'POST', body: JSON.stringify({ email: user.email, password: 'test-password' }) });
  await expectUnavailable('/auth/register', { method: 'POST', body: JSON.stringify({ email: 'new@example.test', displayName: 'New', password: 'long-test-password' }) });
  mode = 'healthy';
  assert.equal((await fetch(`${base}/auth/me`, { headers })).status, 200, 'requests recover when the database is available again');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
console.log('✓ Database acquire/query/rollback/idle failures stay contained; HTTP requests recover');
