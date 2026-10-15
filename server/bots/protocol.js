import { BOARD_SIZE, PLAYER_GOALS, PLAYERS } from '../../shared/constants.js';
import { getValidMovesForPiece, posToCoord } from '../../shared/gameRules.js';

export const BOT_API_VERSION = '1.0';
export const MAX_RESPONSE_BYTES = 4096;

export function legalMoves(board, player) {
  const moves = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x]?.player !== player) continue;
      const from = posToCoord(x, y);
      for (const destination of getValidMovesForPiece(board, x, y, player)) {
        moves.push({ from, to: destination.coord });
      }
    }
  }
  return moves;
}

export function botRequest(game, player, ply, memory = null) {
  if (![PLAYERS.PLAYER_1, PLAYERS.PLAYER_2].includes(player)) throw new Error('Invalid player');
  return {
    apiVersion: BOT_API_VERSION,
    player,
    turn: ply + 1,
    goals: PLAYER_GOALS,
    board: game.board.map(row => row.map(piece => piece ? { player: piece.player, type: piece.type } : null)),
    legalMoves: legalMoves(game.board, player),
    memory
  };
}

export function parseBotResponse(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('Bot output is missing or too large');
  }
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('Bot output is not valid JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.apiVersion !== BOT_API_VERSION) {
    throw new Error('Unsupported Bot API version');
  }
  if (!data.move || typeof data.move !== 'object' || Array.isArray(data.move) ||
      typeof data.move.from !== 'string' || typeof data.move.to !== 'string') {
    throw new Error('Bot response must contain move.from and move.to');
  }
  const from = data.move.from.toUpperCase();
  const to = data.move.to.toUpperCase();
  if (!/^[A-I][1-9]$/.test(from) || !/^[A-I][1-9]$/.test(to)) {
    throw new Error('Move coordinates are invalid');
  }
  const memory = data.memory ?? null;
  if (Buffer.byteLength(JSON.stringify(memory), 'utf8') > 1024) {
    throw new Error('Bot memory is too large');
  }
  return { move: { from, to }, memory };
}
