import { ServerGameSession } from '../game.js';
import { isDeepStrictEqual } from 'node:util';

/** Rebuild a recorded frame through the same authoritative engine as live play. */
export function replayFrame(record, ply = record?.moves?.length) {
  if (!record || !Array.isArray(record.moves) || !Number.isSafeInteger(ply) || ply < 0 || ply > record.moves.length) {
    throw new Error('Invalid replay position');
  }
  const game = new ServerGameSession(record.matchId || 'replay');
  // PostgreSQL jsonb may reorder object keys; compare board contents instead.
  if (!isDeepStrictEqual(game.board, record.initialBoard)) throw new Error('Replay starting board differs from game rules');
  for (let index = 0; index < ply; index++) {
    const saved = record.moves[index];
    if (saved.ply !== index + 1 || saved.player !== game.currentTurn) throw new Error('Replay turn order is invalid');
    const applied = game.processMove(saved.player, saved.from, saved.to);
    if (!applied.success || applied.lastMove.isCapture !== saved.isCapture ||
        applied.lastMove.pieceType !== saved.pieceType) throw new Error('Replay move is invalid');
    if (game.winnerInfo && index !== record.moves.length - 1) throw new Error('Replay contains moves after game ended');
  }
  return { ply, board: structuredClone(game.board), currentTurn: game.currentTurn,
    status: game.status, winnerInfo: game.winnerInfo, lastMove: game.lastMove };
}
