import assert from 'node:assert/strict';
import { readBotServiceStatus, verifyWorkerSandbox, startWorkerHeartbeat } from '../server/bots/workerReadiness.js';

assert.deepEqual(await readBotServiceStatus(null, false), {
  botPlatform: 'unavailable', botStorage: 'unavailable', botRunner: 'unknown'
});
for (const [validation, matches] of [[false, false], [true, true], [true, false], [false, true]]) {
  const online = validation && matches;
  const status = await readBotServiceStatus({ query: async sql => {
    assert.match(sql, /online = true AND last_seen_at > now\(\) - interval '90 seconds'/);
    return { rows: [{ validation, matches }] };
  } }, true);
  assert.equal(status.botStorage, 'ready');
  assert.equal(status.botRunner, online ? 'online' : validation || matches ? 'partial' : 'offline');
  assert.equal(status.botPlatform, online ? 'ready' : 'worker_offline');
}
assert.equal((await readBotServiceStatus({ query: async () => { throw new Error('Database offline'); } }, true)).botRunner, 'unknown');

let created = 0;
await assert.rejects(verifyWorkerSandbox({ listGroups: async () => [], create: async () => { created++; } }), /not enabled/);
assert.equal(created, 0, 'missing sandbox access must stop startup before any execution');
let request;
let terminated = 0;
let validOutput = true;
const sandboxes = {
  listGroups: async () => [{ sandboxGroup: { id: 'group-test' } }],
  create: async () => { created++; return { id: 'sandbox-test', status: 'running' }; },
  upload: async (_id, path, value) => { if (path === '/tmp/request.json') request = JSON.parse(value); },
  exec: async () => (async function* () {
    yield { type: 'output', stream: 'stdout', data: validOutput ? JSON.stringify({ apiVersion: '1.0', move: request.legalMoves[0] }) : '{}' };
    yield { type: 'exit', exit_code: 0 };
  })(),
  terminate: async () => { terminated++; }
};
await verifyWorkerSandbox(sandboxes);
validOutput = false;
await assert.rejects(verifyWorkerSandbox(sandboxes), /startup check failed/);
assert.equal(terminated, 2, 'both successful and failed startup probes clean up');

const publications = [];
const stop = await startWorkerHeartbeat({ query: async (sql, params) => publications.push({ sql, params }) }, 'matches');
await stop();
assert.equal(publications.length, 2);
assert.match(publications[0].sql, /INSERT INTO bot_worker_heartbeats/);
assert.equal(publications[0].params[1], 'matches');
assert.equal(JSON.parse(publications[0].params[2]).cpuPercent, null);
assert.ok(JSON.parse(publications[0].params[2]).rssBytes > 0);
assert.match(publications[1].sql, /SET online = false/);
assert.equal(publications[0].params[0], publications[1].params[0]);
console.log('✓ Worker access probe, startup cleanup, heartbeat and truthful service status');
