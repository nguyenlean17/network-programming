import assert from 'node:assert/strict';
import { runBotMatch } from '../server/bots/match.js';

const firstLegal = async (_player, request) => JSON.stringify({ apiVersion: '1.0', move: request.legalMoves[0] });
const progress = [];
const observedMatch = await runBotMatch({ runner: firstLegal, maxPlies: 2,
  onStart: ({ initialBoard }) => progress.push({ type: 'start', pieces: initialBoard.flat().filter(Boolean).length }),
  onMove: ({ move, board }) => progress.push({ type: 'move', ply: move.ply, pieces: board.flat().filter(Boolean).length }) });
assert.equal(observedMatch.moves.length, 2);
assert.deepEqual(progress.map(item => item.type), ['start', 'move', 'move']);
assert.deepEqual(progress.map(item => item.ply), [undefined, 1, 2]);

const draw = await runBotMatch({ runner: firstLegal, maxPlies: 4 });
assert.equal(draw.moves.length, 4);
assert.equal(draw.result.reason, 'MOVE_LIMIT');
assert.equal(draw.result.winner, null);
assert.equal(draw.initialBoard.length, 9);
assert.equal(draw.moves[0].player, 'P1');
assert.equal(draw.moves[1].player, 'P2');

const invalid = await runBotMatch({ runner: async () => JSON.stringify({ apiVersion: '1.0', move: { from: 'A1', to: 'A2' } }) });
assert.equal(invalid.result.reason, 'INVALID_MOVE');
assert.equal(invalid.result.winner, 'P2');
assert.equal(invalid.moves.length, 0);

const crash = await runBotMatch({ runner: async () => { throw new Error('crash'); } });
assert.equal(crash.result.reason, 'BOT_CRASH');
assert.equal(crash.result.winner, 'P2');
assert.equal(crash.result.detail, 'crash');
const timeout = await runBotMatch({ runner: async () => { const error = new Error('Too slow'); error.code = 'BOT_TIMEOUT'; throw error; } });
assert.equal(timeout.result.reason, 'BOT_TIMEOUT');
const malformed = await runBotMatch({ runner: async () => 'not JSON' });
assert.equal(malformed.result.reason, 'MALFORMED_OUTPUT');
console.log('✓ Bot match authority, move history and bot failures');
