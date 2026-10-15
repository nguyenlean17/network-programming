import assert from 'node:assert/strict';
import { runBotMatch } from '../server/bots/match.js';
import { createRenderSandboxRunner, validatePythonBot } from '../server/bots/renderSandboxRunner.js';

let nextId = 1;
const calls = { created: [], uploaded: [], executed: [], terminated: [] };
const files = new Map();
const sandboxes = {
  async create(options) { const sandbox = { id: `sandbox-${nextId++}`, status: 'running' }; calls.created.push({ sandbox, options }); return sandbox; },
  async get(id) { return { id, status: 'running' }; },
  async upload(id, path, data) { files.set(`${id}:${path}`, Buffer.from(data)); calls.uploaded.push({ id, path }); },
  async exec(id, command, _ownerId, signal) {
    assert.equal(signal instanceof AbortSignal, true);
    calls.executed.push({ id, command });
    const request = JSON.parse(files.get(`${id}:/tmp/request.json`).toString('utf8'));
    const output = JSON.stringify({ apiVersion: '1.0', move: request.legalMoves[0], memory: null });
    return (async function* () { yield { type: 'output', stream: 'stdout', data: output }; yield { type: 'exit', exit_code: 0 }; })();
  },
  async terminate(id) { calls.terminated.push(id); }
};

const runner = createRenderSandboxRunner({ sandboxes, sources: { P1: Buffer.from('p1 code'), P2: Buffer.from('p2 code') } });
const match = await runBotMatch({ runner, maxPlies: 4 });
assert.equal(match.moves.length, 4);
assert.equal(match.result.reason, 'MOVE_LIMIT');
assert.equal(calls.created.length, 2, 'each player gets a separate sandbox for the match');
assert.ok(calls.created.every(({ options }) => options.networkPolicy.default === 'deny-all'));
assert.ok(calls.created.every(({ options }) => options.timeoutSeconds <= 1800));
assert.notEqual(files.get('sandbox-1:/tmp/main.py').toString(), files.get('sandbox-2:/tmp/main.py').toString());
assert.ok(calls.executed.every(({ command }) => !command.includes('RENDER_API_KEY')));
assert.deepEqual(calls.terminated.sort(), ['sandbox-1', 'sandbox-2']);

const validationFiles = new Map();
const validationCalls = { options: [], terminated: [] };
const validationSandbox = {
  async create(options) { validationCalls.options.push(options); return { id: 'validation-1', status: 'running' }; },
  async upload(id, path, data) { validationFiles.set(`${id}:${path}`, Buffer.from(data)); },
  async exec(id, command) {
    assert.match(command, /python3 -I -B/);
    const request = JSON.parse(validationFiles.get(`${id}:/tmp/request.json`).toString());
    const output = JSON.stringify({ apiVersion: '1.0', move: request.legalMoves[0], memory: null });
    return (async function* () { yield { type: 'output', stream: 'stdout', data: output }; yield { type: 'exit', exit_code: 0 }; })();
  },
  async terminate(id) { validationCalls.terminated.push(id); }
};
const validation = await validatePythonBot({ sandboxes: validationSandbox, source: Buffer.from('print("safe")') });
assert.equal(validation.valid, true);
assert.equal(validationCalls.options[0].networkPolicy.default, 'deny-all');
assert.deepEqual(validationCalls.terminated, ['validation-1']);

const unavailableSandbox = { ...sandboxes, async create() { throw new Error('Render API unavailable'); } };
const failedRunner = createRenderSandboxRunner({ sandboxes: unavailableSandbox,
  sources: { P1: 'p1', P2: 'p2' } });
const infrastructureFailure = await runBotMatch({ runner: failedRunner, maxPlies: 1 });
assert.equal(infrastructureFailure.result.reason, 'RUNNER_ERROR', 'sandbox service failure must not count as a bot loss');
console.log('✓ Render sandbox adapter isolates both seats and cleans up after the match');
