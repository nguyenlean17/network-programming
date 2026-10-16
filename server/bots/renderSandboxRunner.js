import { MAX_RESPONSE_BYTES } from './protocol.js';
import { ServerGameSession } from '../game.js';
import { botRequest, parseBotResponse } from './protocol.js';
import { validateMove } from '../../shared/gameRules.js';

const COMMAND = 'umask 077; ulimit -t 2 -v 131072 -u 16 -f 16 -n 64; exec timeout -k 1s 2s python3 -I -B /tmp/main.py < /tmp/request.json';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const markRunnerError = error => {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.code = 'RUNNER_ERROR';
  return failure;
};

export async function validatePythonBot({ sandboxes, source, startupTimeoutMs = 60000, decisionTimeoutMs = 2500 }) {
  const code = Buffer.isBuffer(source) ? source : Buffer.from(source);
  if (!code.length || code.length > 64 * 1024) return { valid: false, message: 'Source must contain 1–65536 bytes' };
  let sandboxId;
  let timer;
  let timedOut = false;
  try {
    const sandbox = await sandboxes.create({ timeoutSeconds: 120, networkPolicy: { default: 'deny-all' } });
    sandboxId = sandbox.id;
    let state = sandbox.status;
    const deadline = Date.now() + startupTimeoutMs;
    let pause = 200;
    while (state !== 'running') {
      if (state === 'failed' || state === 'terminated') throw new Error(`Sandbox entered ${state} state`);
      if (Date.now() >= deadline) throw new Error('Sandbox startup timed out');
      await delay(pause);
      state = (await sandboxes.get(sandboxId)).status;
      pause = Math.min(pause * 1.5, 1500);
    }
    const game = new ServerGameSession('bot-validation');
    const request = botRequest(game, game.currentTurn, 0);
    await sandboxes.upload(sandboxId, '/tmp/main.py', code);
    await sandboxes.upload(sandboxId, '/tmp/request.json', JSON.stringify(request));
    const controller = new AbortController();
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, decisionTimeoutMs);
    const events = await sandboxes.exec(sandboxId, COMMAND, undefined, controller.signal);
    let stdout = '';
    let stderr = '';
    let exitCode = null;
    for await (const event of events) {
      if (event.type === 'output' && event.stream === 'stdout') {
        if (Buffer.byteLength(stdout) + Buffer.byteLength(event.data) > MAX_RESPONSE_BYTES) {
          controller.abort();
          return { valid: false, message: 'Bot output exceeded 4 KiB' };
        }
        stdout += event.data;
      } else if (event.type === 'output' && event.stream === 'stderr' && Buffer.byteLength(stderr) < 1024) {
        stderr = Buffer.from(stderr + event.data, 'utf8').subarray(0, 1024).toString('utf8');
      } else if (event.type === 'exit') exitCode = event.exit_code;
    }
    clearTimeout(timer);
    timer = null;
    if (timedOut || exitCode === 124 || exitCode === 137) return { valid: false, message: 'Bot exceeded the 2 second decision limit' };
    if (exitCode !== 0) return { valid: false, message: `Bot exited with status ${exitCode}${stderr ? `: ${stderr}` : ''}`.slice(0, 500) };
    let response;
    try { response = parseBotResponse(stdout); }
    catch (error) { return { valid: false, message: error.message }; }
    const allowed = request.legalMoves.some(move => move.from === response.move.from && move.to === response.move.to);
    const legal = allowed && validateMove(game.board, { ...response.move, player: game.currentTurn }, game.currentTurn).valid;
    return legal ? { valid: true, message: 'Bot returned a valid API 1.0 move' }
      : { valid: false, message: 'Bot returned a move outside the supplied legal move list' };
  } catch (error) {
    if (timedOut) return { valid: false, message: 'Bot exceeded the 2 second decision limit' };
    error.code = 'RUNNER_ERROR';
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (sandboxId) await sandboxes.terminate(sandboxId);
  }
}

/**
 * Creates an isolated sandbox per player for a match. Each player's source and
 * requests live in a different network-disabled sandbox; only JSON crosses the
 * boundary. Sandboxes are terminated when the match finishes.
 */
export function createRenderSandboxRunner({ sandboxes, sources, startupTimeoutMs = 60000, decisionTimeoutMs = 2500 }) {
  if (!sandboxes || typeof sandboxes.create !== 'function' || typeof sandboxes.exec !== 'function' ||
      typeof sandboxes.upload !== 'function' || typeof sandboxes.terminate !== 'function') {
    throw new TypeError('A Render Sandboxes client is required');
  }
  if (!sources?.P1 || !sources?.P2) throw new TypeError('Both immutable bot sources are required');
  const states = new Map();

  async function createSeatSandbox(player) {
    const source = Buffer.isBuffer(sources[player]) ? sources[player] : Buffer.from(sources[player]);
    if (source.length === 0 || source.length > 64 * 1024) throw new Error('Stored bot source is empty or too large');
    let created;
    try {
      created = await sandboxes.create({
        timeoutSeconds: 1800,
        networkPolicy: { default: 'deny-all' }
      });
    } catch (error) { throw markRunnerError(error); }
    const state = { id: created.id, status: created.status };
    try {
      const deadline = Date.now() + startupTimeoutMs;
      let pause = 200;
      while (state.status !== 'running') {
        if (state.status === 'failed' || state.status === 'terminated') throw new Error(`Sandbox entered ${state.status} state`);
        if (Date.now() >= deadline) throw new Error('Sandbox did not become ready in time');
        await delay(pause);
        state.status = (await sandboxes.get(state.id)).status;
        pause = Math.min(pause * 1.5, 1500);
      }
      await sandboxes.upload(state.id, '/tmp/main.py', source);
      return state;
    } catch (error) {
      await sandboxes.terminate(state.id).catch(() => {});
      throw markRunnerError(error);
    }
  }

  async function getSeat(player) {
    let pending = states.get(player);
    if (!pending) {
      pending = createSeatSandbox(player);
      states.set(player, pending);
    }
    try { return await pending; }
    catch (error) { states.delete(player); throw error; }
  }

  const runner = async (player, request) => {
    const state = await getSeat(player);
    try { await sandboxes.upload(state.id, '/tmp/request.json', JSON.stringify(request)); }
    catch (error) { throw markRunnerError(error); }
    const controller = new AbortController();
    let expired = false;
    const timer = setTimeout(() => { expired = true; controller.abort(); }, decisionTimeoutMs);
    let stdout = '';
    let stderr = '';
    let exitCode = null;
    try {
      const events = await sandboxes.exec(state.id, COMMAND, undefined, controller.signal);
      for await (const event of events) {
        if (event.type === 'output') {
          if (event.stream === 'stdout') {
            if (Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(event.data, 'utf8') > MAX_RESPONSE_BYTES) {
              controller.abort();
              const error = new Error('Bot output is too large');
              error.code = 'BOT_CRASH';
              throw error;
            }
            stdout += event.data;
          } else if (event.stream === 'stderr' && Buffer.byteLength(stderr, 'utf8') < 2048) {
            const next = stderr + event.data;
            stderr = Buffer.from(next, 'utf8').subarray(0, 2048).toString('utf8');
          }
        } else if (event.type === 'exit') exitCode = event.exit_code;
      }
    } catch (error) {
      if (expired) {
        const timeout = new Error('Bot decision exceeded the execution time limit');
        timeout.code = 'BOT_TIMEOUT';
        throw timeout;
      }
      if (error?.code === 'BOT_CRASH') throw error;
      throw markRunnerError(error);
    } finally { clearTimeout(timer); }
    if (expired) {
      const timeout = new Error('Bot decision exceeded the execution time limit');
      timeout.code = 'BOT_TIMEOUT';
      throw timeout;
    }
    if (exitCode === 124 || exitCode === 137) {
      const timeout = new Error('Bot decision exceeded the execution time limit');
      timeout.code = 'BOT_TIMEOUT';
      throw timeout;
    }
    if (exitCode !== 0) {
      const crash = new Error(`Bot process exited with status ${exitCode}${stderr ? `: ${stderr}` : ''}`);
      crash.code = 'BOT_CRASH';
      throw crash;
    }
    return stdout;
  };

  runner.close = async () => {
    const statesToClose = await Promise.allSettled([...states.values()]);
    const ids = statesToClose.filter(item => item.status === 'fulfilled').map(item => item.value.id);
    states.clear();
    const results = await Promise.allSettled(ids.map(id => sandboxes.terminate(id)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  };
  return runner;
}
