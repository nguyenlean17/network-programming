import assert from 'node:assert/strict';
import { ServerGameSession } from '../server/game.js';
import { botRequest, parseBotResponse, legalMoves } from '../server/bots/protocol.js';
import { validateMove } from '../shared/gameRules.js';

const game = new ServerGameSession('test');
const request = botRequest(game, 'P1', 0);
assert.equal(request.apiVersion, '1.0');
assert.equal(request.board.length, 9);
assert.ok(request.legalMoves.length > 0);
assert.deepEqual(request.legalMoves, legalMoves(game.board, 'P1'));
for (const move of request.legalMoves) assert.equal(validateMove(game.board, { ...move, player: 'P1' }, 'P1').valid, true);
const occupiedRow = game.board.findIndex(row => row.some(Boolean));
const occupiedCol = game.board[occupiedRow].findIndex(Boolean);
request.board[occupiedRow][occupiedCol] = null;
assert.notEqual(game.board[occupiedRow][occupiedCol], null, 'bot request must not expose the authoritative board');
const chosen = request.legalMoves[0];
assert.deepEqual(parseBotResponse(JSON.stringify({ apiVersion: '1.0', move: chosen })).move, chosen);
for (const bad of ['', 'not json', '{}', '{"apiVersion":"2.0","move":{"from":"A1","to":"A2"}}',
  '{"apiVersion":"1.0","move":{"from":"Z1","to":"A2"}}', 'x'.repeat(4097)]) {
  assert.throws(() => parseBotResponse(bad));
}
console.log('✓ Bot API request, legal moves and invalid responses');
