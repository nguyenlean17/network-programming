import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import express from 'express';
import { createBotLearningRouter } from '../server/bots/learningRouter.js';
import { ServerGameSession } from '../server/game.js';
import { botRequest, parseBotResponse } from '../server/bots/protocol.js';

const app = express();
app.use('/bot-kit', createBotLearningRouter());
const server = http.createServer(app);
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/bot-kit`;
  const response = await fetch(`${base}/request.json`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /attachment; filename="request.json"/);
  const request = await response.json();
  const game = new ServerGameSession('test-learning');
  assert.deepEqual(request, botRequest(game, 'P1', 0), 'downloaded fixture must come from the real engine');
  assert.equal(request.board.length, 9);
  assert.ok(request.board.every(row => row.length === 9));
  const starter = await fetch(`${base}/main.py`);
  assert.equal(starter.status, 200);
  assert.match(starter.headers.get('content-disposition'), /filename="main.py"/);
  const source = await starter.text();
  // Execute only this reviewed repository teaching file, never user uploads.
  for (const player of ['P1', 'P2']) {
    const state = botRequest(game, player, player === 'P1' ? 0 : 1);
    const result = spawnSync('python', ['-I', '-B', '-c', source], {
      input: JSON.stringify(state), encoding: 'utf8', timeout: 10000, windowsHide: true
    });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    const decision = parseBotResponse(result.stdout);
    assert.ok(state.legalMoves.some(move => move.from === decision.move.from && move.to === decision.move.to));
    assert.equal(game.processMove(player, decision.move.from, decision.move.to).success, true);
  }
  for (const name of ['first_legal.py', 'goal_seeker.py', 'bot-api-v1.md']) {
    const downloaded = await fetch(`${base}/${name}`);
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get('content-disposition'), /attachment/);
    assert.ok((await downloaded.text()).length > 100);
  }
  for (const name of ['worker.js', '.env', '%2e%2e%2fserver%2fserver.js', 'unknown.py']) {
    assert.equal((await fetch(`${base}/${name}`)).status, 404, 'only teaching files are public');
  }
  console.log('✓ Public teaching kit works without a database; real board fixture, valid Python starter for both seats, restricted downloads');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
