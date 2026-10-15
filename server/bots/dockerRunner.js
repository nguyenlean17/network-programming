import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { MAX_RESPONSE_BYTES } from './protocol.js';

const IMAGE = 'python:3.12.7-alpine3.20';
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 4096;

function capture(command, args, input, timeoutMs, stdoutLimit = MAX_RESPONSE_BYTES) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        const error = new Error('Bot decision timed out');
        error.code = 'BOT_TIMEOUT';
        reject(error);
      }
    }, timeoutMs);
    child.on('error', error => {
      if (!settled) { settled = true; clearTimeout(timer); reject(error); }
    });
    child.stdout.on('data', chunk => {
      if (stdout.length <= stdoutLimit) stdout = Buffer.concat([stdout, chunk]).subarray(0, stdoutLimit + 1);
      if (stdout.length > stdoutLimit) child.kill();
    });
    child.stderr.on('data', chunk => {
      stderr = Buffer.concat([stderr, chunk]).subarray(0, MAX_STDERR_BYTES);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdout.length > stdoutLimit) reject(new Error('Bot output is too large'));
      else if (code !== 0) reject(new Error(`Bot exited with code ${code}: ${stderr.toString('utf8').slice(0, 500)}`));
      else resolve(stdout.toString('utf8'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/** Creates a runner callback for runBotMatch. Source files must already be immutable versions. */
export function createDockerRunner({ sourceRoot, sources, decisionTimeoutMs = 2000, image = IMAGE }) {
  if (!sourceRoot || !sources?.P1 || !sources?.P2) throw new TypeError('Source root and both bot versions are required');
  if (!Number.isSafeInteger(decisionTimeoutMs) || decisionTimeoutMs < 100 || decisionTimeoutMs > 30000) {
    throw new RangeError('Invalid decision timeout');
  }
  return async (player, request) => {
    if (player !== 'P1' && player !== 'P2') throw new Error('Invalid player');
    const root = await realpath(sourceRoot);
    const source = await realpath(sources[player]);
    if (!source.startsWith(root + path.sep) || path.extname(source).toLowerCase() !== '.py' || /[,\r\n]/.test(source)) {
      throw new Error('Bot source is outside the version store or has an unsafe path');
    }
    const info = await stat(source);
    if (!info.isFile() || info.size > MAX_SOURCE_BYTES) throw new Error('Bot source is invalid or too large');
    const name = `ottv2-${randomUUID()}`;
    const args = [
      'run', '--rm', '--name', name, '--pull', 'never', '--network', 'none', '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '65534:65534',
      '--memory', '64m', '--memory-swap', '64m', '--cpus', '0.5', '--pids-limit', '32',
      '--ulimit', 'fsize=1048576:1048576', '--ulimit', 'nofile=64:64',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=1m',
      '--mount', `type=bind,source=${source},target=/bot/main.py,readonly`,
      '--workdir', '/bot', image, 'python', '-I', '-B', '/bot/main.py'
    ];
    try {
      return await capture('docker', args, JSON.stringify(request), decisionTimeoutMs);
    } finally {
      // A killed Docker CLI may leave its container running; remove it by exact random name.
      try { await capture('docker', ['rm', '-f', name], '', 3000, 1024); } catch { /* --rm may already have removed it */ }
    }
  };
}
