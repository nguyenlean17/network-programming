/**
 * Oẳn Tù Tì v2 (OTTv2) - Server Game State Manager
 */

import {
  PLAYERS,
  GAME_STATUS
} from '../shared/constants.js';
import {
  createInitialBoard,
  validateMove,
  checkWinCondition
} from '../shared/gameRules.js';

export class ServerGameSession {
  constructor(roomId, options = {}) {
    this.roomId = roomId;
    this.preset = options.preset || 'CHESS_9';
    this.goalMode = options.goalMode || 'ANY';

    this.board = createInitialBoard(this.preset);
    this.currentTurn = PLAYERS.PLAYER_1;
    this.status = GAME_STATUS.PLAYING;
    this.lastMove = null;
    this.winnerInfo = null;
    this.moveHistory = [];
  }

  processMove(player, from, to) {
    if (this.status === GAME_STATUS.ENDED) {
      return { success: false, error: 'Trận đấu đã kết thúc.' };
    }

    const validation = validateMove(
      this.board,
      { from, to, player },
      this.currentTurn,
      this.goalMode
    );

    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // Apply move
    const fromCol = from[0].toUpperCase();
    const fromRow = parseInt(from.slice(1), 10) - 1;
    const toCol = to[0].toUpperCase();
    const toRow = parseInt(to.slice(1), 10) - 1;
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const fx = cols.indexOf(fromCol);
    const fy = fromRow;
    const tx = cols.indexOf(toCol);
    const ty = toRow;

    const piece = this.board[fy][fx];
    const target = this.board[ty][tx];

    this.board[fy][fx] = null;
    this.board[ty][tx] = piece;

    this.lastMove = { from, to, player, pieceType: piece.type, isCapture: validation.isCapture, capturedPiece: target };
    this.moveHistory.push(this.lastMove);

    // Check Win
    const win = checkWinCondition(this.board, this.lastMove, this.goalMode);
    if (win.hasWinner) {
      this.status = GAME_STATUS.ENDED;
      this.winnerInfo = win;
    } else {
      this.currentTurn = this.currentTurn === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;
    }

    return {
      success: true,
      gameState: this.getState(),
      lastMove: this.lastMove,
      winnerInfo: this.winnerInfo
    };
  }

  reset() {
    this.board = createInitialBoard(this.preset);
    this.currentTurn = PLAYERS.PLAYER_1;
    this.status = GAME_STATUS.PLAYING;
    this.lastMove = null;
    this.winnerInfo = null;
    this.moveHistory = [];
    return this.getState();
  }

  getState() {
    return {
      board: this.board,
      currentTurn: this.currentTurn,
      status: this.status,
      lastMove: this.lastMove,
      winnerInfo: this.winnerInfo
    };
  }
}
