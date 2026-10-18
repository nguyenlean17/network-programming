import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runBotMatch } from '../server/bots/match.js';

// Only the two reviewed, repository-owned examples run here. Never use this
// helper for uploads or production matches; those require the sandbox worker.
const examples = {
  P1: fileURLToPath(new URL('../examples/bots/first_legal.py', import.meta.url)),
  P2: fileURLToPath(new URL('../examples/bots/goal_seeker.py', import.meta.url))
};

function trustedSample(player, request) {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [path.resolve(examples[player])], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    const timer = setTimeout(() => child.kill(), 3000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      code === 0 ? resolve(output) : reject(new Error(`Trusted example exited ${code}: ${error}`));
    });
    child.stdin.end(JSON.stringify(request));
  });
}

const match = await runBotMatch({ runner: trustedSample, maxPlies: 12 });
assert.ok(match.moves.length > 0, JSON.stringify(match.result));
assert.equal(match.moves.length, 12);
assert.equal(match.result.reason, 'MOVE_LIMIT');
console.log('✓ Two trusted Python examples completed a local match');
