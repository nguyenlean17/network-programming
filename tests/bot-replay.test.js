import assert from 'node:assert/strict';
import { runBotMatch } from '../server/bots/match.js';
import { replayFrame } from '../server/bots/replay.js';

const record = await runBotMatch({ maxPlies: 6, runner: async (_player, request) =>
  JSON.stringify({ apiVersion: '1.0', move: request.legalMoves[0] }) });
assert.deepEqual(replayFrame(record, 0).board, record.initialBoard);
assert.deepEqual(replayFrame(record).board, record.finalBoard);
const middle = replayFrame(record, 3);
assert.equal(middle.ply, 3);
assert.notDeepEqual(middle.board, record.initialBoard);
// jsonb round trips can change key order while preserving every board value.
const reordered = structuredClone(record);
reordered.initialBoard = reordered.initialBoard.map(row => row.map(piece => piece ? { type: piece.type, player: piece.player } : null));
assert.deepEqual(replayFrame(reordered, 0).board, record.initialBoard);
assert.deepEqual(replayFrame(reordered).board, record.finalBoard);
const changedBoard = structuredClone(reordered);
const piece = changedBoard.initialBoard.flat().find(Boolean);
piece.player = piece.player === 'P1' ? 'P2' : 'P1';
assert.throws(() => replayFrame(changedBoard), /starting board differs/);
assert.throws(() => replayFrame({ ...record, initialBoard: [] }), /starting board differs/);
const tampered = structuredClone(record);
tampered.moves[1].to = 'Z9';
assert.throws(() => replayFrame(tampered), /invalid/);
console.log('✓ Replay reconstructs frames and rejects invalid history');
