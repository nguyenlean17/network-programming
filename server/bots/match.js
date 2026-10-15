import { randomUUID } from 'node:crypto';
import { PLAYERS } from '../../shared/constants.js';
import { ServerGameSession } from '../game.js';
import { botRequest, parseBotResponse } from './protocol.js';

// The runner is injected so web routes never execute uploaded code in their own process.
// Production callers must provide an isolated runner. This module has no upload endpoint.
export async function runBotMatch({ runner, maxPlies = 300, matchId = randomUUID() }) {
  if (typeof runner !== 'function') throw new TypeError('An isolated runner is required');
  if (!Number.isSafeInteger(maxPlies) || maxPlies < 1 || maxPlies > 10000) throw new RangeError('Invalid maxPlies');

  const game = new ServerGameSession(matchId);
  const initialBoard = structuredClone(game.board);
  const moves = [];
  const memories = { P1: null, P2: null };
  let result = null;

  for (let ply = 0; ply < maxPlies; ply++) {
    const player = game.currentTurn;
    const request = botRequest(game, player, ply, memories[player]);
    if (!request.legalMoves.length) {
      result = { winner: null, reason: 'NO_LEGAL_MOVES', faultPlayer: null };
      break;
    }

    let raw;
    try {
      raw = await runner(player, request);
    } catch (error) {
      result = { winner: player === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1,
        reason: error?.code === 'BOT_TIMEOUT' ? 'BOT_TIMEOUT' : 'BOT_CRASH',
        faultPlayer: player, detail: String(error?.message || error).slice(0, 200) };
      break;
    }
    let response;
    try {
      response = parseBotResponse(raw);
    } catch (error) {
      result = { winner: player === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1,
        reason: 'MALFORMED_OUTPUT', faultPlayer: player, detail: String(error.message).slice(0, 200) };
      break;
    }

    // The authoritative game engine checks the move even though legalMoves is supplied.
    const applied = game.processMove(player, response.move.from, response.move.to);
    if (!applied.success) {
      result = { winner: player === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1,
        reason: 'INVALID_MOVE', faultPlayer: player, detail: applied.error };
      break;
    }
    memories[player] = response.memory;
    moves.push({ ply: ply + 1, ...structuredClone(applied.lastMove) });
    if (applied.winnerInfo) {
      result = { winner: applied.winnerInfo.winner, reason: applied.winnerInfo.reason, faultPlayer: null };
      break;
    }
  }

  result ??= { winner: null, reason: 'MOVE_LIMIT', faultPlayer: null };
  return { matchId, apiVersion: '1.0', initialBoard, moves, result, finalBoard: structuredClone(game.board) };
}
