/**
 * OTTv2 (Oẳn Tù Tì v2) - Game Engine
 * Core logic for 9x9 Board Game:
 * - 3 Piece Types: Rock (Đấm ✊), Paper (Lá ✋), Scissors (Kéo ✌️)
 * - 8-directional movement (1 step, like King in chess)
 * - Capture rules: Rock beats Scissors, Scissors beats Paper, Paper beats Rock.
 * - Same-type interaction: Cannot capture each other, blocks path.
 * - Win conditions:
 *   1. Completely eliminate any 1 piece type of opponent (0 Rocks, 0 Papers, or 0 Scissors).
 *   2. Infiltrate enemy base: Player 1 reaches i9 (row 8, col 8); Player 2 reaches a1 (row 0, col 0).
 *   3. Opponent has no legal moves left.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OTTv2Engine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BOARD_SIZE = 9;
  const PIECE_TYPES = {
    ROCK: 'ROCK',         // Đấm ✊
    PAPER: 'PAPER',       // Lá ✋
    SCISSORS: 'SCISSORS'  // Kéo ✌️
  };

  const PLAYERS = {
    P1: 'P1', // Red / Đỏ (starts at bottom rows 1-2, base at a1)
    P2: 'P2'  // Blue / Xanh (starts at top rows 8-9, base at i9)
  };

  // 8-directional movement offsets (King in chess)
  const DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [ 0, -1],          [ 0, 1],
    [ 1, -1], [ 1, 0], [ 1, 1]
  ];

  // RPS rules: key beats value
  const BEATS = {
    [PIECE_TYPES.ROCK]: PIECE_TYPES.SCISSORS,
    [PIECE_TYPES.SCISSORS]: PIECE_TYPES.PAPER,
    [PIECE_TYPES.PAPER]: PIECE_TYPES.ROCK
  };

  class OTTv2Engine {
    constructor() {
      this.boardSize = BOARD_SIZE;
      this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
      this.turn = PLAYERS.P1;
      this.moveHistory = [];
      this.capturedPieces = {
        [PLAYERS.P1]: { [PIECE_TYPES.ROCK]: 0, [PIECE_TYPES.PAPER]: 0, [PIECE_TYPES.SCISSORS]: 0 },
        [PLAYERS.P2]: { [PIECE_TYPES.ROCK]: 0, [PIECE_TYPES.PAPER]: 0, [PIECE_TYPES.SCISSORS]: 0 }
      };
      this.isGameOver = false;
      this.winner = null;
      this.winReason = null;

      this.initBoard();
    }

    /**
     * Coordinate conversion helpers:
     * col: 0 -> 'a', 8 -> 'i'
     * row: 0 -> '1', 8 -> '9'
     */
    static toNotation(row, col) {
      const colChar = String.fromCharCode(97 + col);
      const rowChar = String(row + 1);
      return `${colChar}${rowChar}`;
    }

    static fromNotation(notation) {
      if (!notation || notation.length < 2) return null;
      const col = notation.charCodeAt(0) - 97;
      const row = parseInt(notation.substring(1), 10) - 1;
      if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
      return { row, col };
    }

    /**
     * Initializes default balanced 9-piece layout per player
     */
    initBoard() {
      this.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

      // Player 1 (Red) pieces on rows 0 and 1 (rank 1 and 2)
      // Base: a1 (0, 0)
      const p1Setup = [
        { r: 0, c: 0, type: PIECE_TYPES.ROCK },      // a1 (Base)
        { r: 0, c: 2, type: PIECE_TYPES.PAPER },     // c1
        { r: 0, c: 4, type: PIECE_TYPES.SCISSORS },  // e1
        { r: 0, c: 6, type: PIECE_TYPES.ROCK },      // g1
        { r: 0, c: 8, type: PIECE_TYPES.PAPER },     // i1
        { r: 1, c: 1, type: PIECE_TYPES.SCISSORS },  // b2
        { r: 1, c: 3, type: PIECE_TYPES.ROCK },      // d2
        { r: 1, c: 5, type: PIECE_TYPES.PAPER },     // f2
        { r: 1, c: 7, type: PIECE_TYPES.SCISSORS }   // h2
      ];

      p1Setup.forEach((p, idx) => {
        this.board[p.r][p.c] = {
          id: `p1_${idx}_${p.type}`,
          player: PLAYERS.P1,
          type: p.type
        };
      });

      // Player 2 (Blue) pieces on rows 8 and 7 (rank 9 and 8)
      // Base: i9 (8, 8)
      const p2Setup = [
        { r: 8, c: 0, type: PIECE_TYPES.PAPER },     // a9
        { r: 8, c: 2, type: PIECE_TYPES.ROCK },      // c9
        { r: 8, c: 4, type: PIECE_TYPES.SCISSORS },  // e9
        { r: 8, c: 6, type: PIECE_TYPES.PAPER },     // g9
        { r: 8, c: 8, type: PIECE_TYPES.ROCK },      // i9 (Base)
        { r: 7, c: 1, type: PIECE_TYPES.SCISSORS },  // b8
        { r: 7, c: 3, type: PIECE_TYPES.PAPER },     // d8
        { r: 7, c: 5, type: PIECE_TYPES.ROCK },      // f8
        { r: 7, c: 7, type: PIECE_TYPES.SCISSORS }   // h8
      ];

      p2Setup.forEach((p, idx) => {
        this.board[p.r][p.c] = {
          id: `p2_${idx}_${p.type}`,
          player: PLAYERS.P2,
          type: p.type
        };
      });

      this.turn = PLAYERS.P1;
      this.moveHistory = [];
      this.capturedPieces = {
        [PLAYERS.P1]: { [PIECE_TYPES.ROCK]: 0, [PIECE_TYPES.PAPER]: 0, [PIECE_TYPES.SCISSORS]: 0 },
        [PLAYERS.P2]: { [PIECE_TYPES.ROCK]: 0, [PIECE_TYPES.PAPER]: 0, [PIECE_TYPES.SCISSORS]: 0 }
      };
      this.isGameOver = false;
      this.winner = null;
      this.winReason = null;
    }

    /**
     * Checks if coordinates are within bounds
     */
    isInBounds(r, c) {
      return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
    }

    /**
     * Returns piece counts remaining on the board for a player
     */
    getRemainingPieces(player) {
      const counts = {
        [PIECE_TYPES.ROCK]: 0,
        [PIECE_TYPES.PAPER]: 0,
        [PIECE_TYPES.SCISSORS]: 0,
        total: 0
      };

      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const piece = this.board[r][c];
          if (piece && piece.player === player) {
            counts[piece.type]++;
            counts.total++;
          }
        }
      }
      return counts;
    }

    /**
     * Evaluates capture outcome between attacker and target:
     * Returns:
     *  'CANNOT_CAPTURE_SAME': Same piece type (Blocks path)
     *  'WIN': Attacker captures target
     *  'LOSE': Attacker is defeated by target (Cannot suicide into stronger piece)
     */
    evaluateCombat(attackerType, targetType) {
      if (attackerType === targetType) {
        return 'CANNOT_CAPTURE_SAME';
      }
      if (BEATS[attackerType] === targetType) {
        return 'WIN';
      }
      return 'LOSE';
    }

    /**
     * Computes all valid moves for a piece at (fromR, fromC)
     */
    getValidMoves(fromR, fromC) {
      if (this.isGameOver) return [];
      if (!this.isInBounds(fromR, fromC)) return [];

      const piece = this.board[fromR][fromC];
      if (!piece || piece.player !== this.turn) return [];

      const validMoves = [];

      for (const [dr, dc] of DIRECTIONS) {
        const toR = fromR + dr;
        const toC = fromC + dc;

        if (!this.isInBounds(toR, toC)) continue;

        const target = this.board[toR][toC];

        if (!target) {
          // Empty cell: valid move
          validMoves.push({
            toR,
            toC,
            notation: OTTv2Engine.toNotation(toR, toC),
            action: 'MOVE'
          });
        } else if (target.player === piece.player) {
          // Friendly piece: blocked
          continue;
        } else {
          // Opponent piece: check combat rule
          const combat = this.evaluateCombat(piece.type, target.type);
          if (combat === 'WIN') {
            // Can capture
            validMoves.push({
              toR,
              toC,
              notation: OTTv2Engine.toNotation(toR, toC),
              action: 'CAPTURE',
              capturedPiece: { ...target }
            });
          } else if (combat === 'CANNOT_CAPTURE_SAME') {
            // Same piece type blocks each other!
            // No capture allowed, cannot move into this square.
            continue;
          } else {
            // Loses to opponent: cannot move here
            continue;
          }
        }
      }

      return validMoves;
    }

    /**
     * Executes a move
     */
    makeMove(fromR, fromC, toR, toC) {
      if (this.isGameOver) {
        return { success: false, error: 'Trò chơi đã kết thúc' };
      }

      const piece = this.board[fromR][fromC];
      if (!piece || piece.player !== this.turn) {
        return { success: false, error: 'Không phải lượt của người chơi này hoặc ô trống' };
      }

      const validMoves = this.getValidMoves(fromR, fromC);
      const move = validMoves.find(m => m.toR === toR && m.toC === toC);

      if (!move) {
        return { success: false, error: 'Nước đi không hợp lệ theo luật OTTv2' };
      }

      const fromNotation = OTTv2Engine.toNotation(fromR, fromC);
      const toNotation = OTTv2Engine.toNotation(toR, toC);
      const opponent = this.turn === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;
      let captured = null;

      // Handle capture
      if (move.action === 'CAPTURE') {
        captured = { ...this.board[toR][toC] };
        this.capturedPieces[this.turn][captured.type]++;
      }

      // Move piece
      this.board[toR][toC] = piece;
      this.board[fromR][fromC] = null;

      // Record history
      const moveRecord = {
        player: this.turn,
        piece: { ...piece },
        from: { r: fromR, c: fromC, notation: fromNotation },
        to: { r: toR, c: toC, notation: toNotation },
        action: move.action,
        captured
      };
      this.moveHistory.push(moveRecord);

      // Check Win Condition 1: Infiltration of enemy base
      // P1 reaches i9 (row 8, col 8)
      if (this.turn === PLAYERS.P1 && toR === 8 && toC === 8) {
        this.isGameOver = true;
        this.winner = PLAYERS.P1;
        this.winReason = 'Người chơi 1 (Đỏ) đã đột kích thành công vào căn cứ i9 của đối phương!';
        return { success: true, move: moveRecord, gameOver: true, winner: this.winner, reason: this.winReason };
      }
      // P2 reaches a1 (row 0, col 0)
      if (this.turn === PLAYERS.P2 && toR === 0 && toC === 0) {
        this.isGameOver = true;
        this.winner = PLAYERS.P2;
        this.winReason = 'Người chơi 2 (Xanh) đã đột kích thành công vào căn cứ a1 của đối phương!';
        return { success: true, move: moveRecord, gameOver: true, winner: this.winner, reason: this.winReason };
      }

      // Check Win Condition 2: Completely eliminated any 1 piece type of opponent
      const opponentCounts = this.getRemainingPieces(opponent);
      if (opponentCounts[PIECE_TYPES.ROCK] === 0) {
        this.isGameOver = true;
        this.winner = this.turn;
        this.winReason = `${this.turn === PLAYERS.P1 ? 'Người chơi 1 (Đỏ)' : 'Người chơi 2 (Xanh)'} thắng vì đã ăn sạch toàn bộ quân ĐẤM (Rock ✊) của đối phương!`;
        return { success: true, move: moveRecord, gameOver: true, winner: this.winner, reason: this.winReason };
      }
      if (opponentCounts[PIECE_TYPES.PAPER] === 0) {
        this.isGameOver = true;
        this.winner = this.turn;
        this.winReason = `${this.turn === PLAYERS.P1 ? 'Người chơi 1 (Đỏ)' : 'Người chơi 2 (Xanh)'} thắng vì đã ăn sạch toàn bộ quân LÁ (Paper ✋) của đối phương!`;
        return { success: true, move: moveRecord, gameOver: true, winner: this.winner, reason: this.winReason };
      }
      if (opponentCounts[PIECE_TYPES.SCISSORS] === 0) {
        this.isGameOver = true;
        this.winner = this.turn;
        this.winReason = `${this.turn === PLAYERS.P1 ? 'Người chơi 1 (Đỏ)' : 'Người chơi 2 (Xanh)'} thắng vì đã ăn sạch toàn bộ quân KÉO (Scissors ✌️) của đối phương!`;
        return { success: true, move: moveRecord, gameOver: true, winner: this.winner, reason: this.winReason };
      }

      // Switch turn
      this.turn = opponent;

      // Check Win Condition 3: Next player has no legal moves
      const nextPlayerMoves = this.getAllValidMoves(this.turn);
      if (nextPlayerMoves.length === 0) {
        this.isGameOver = true;
        this.winner = opponent === PLAYERS.P1 ? PLAYERS.P2 : PLAYERS.P1;
        this.winReason = `${opponent === PLAYERS.P1 ? 'Người chơi 1' : 'Người chơi 2'} không còn nước đi hợp lệ nào!`;
        return { success: true, move: moveRecord, gameOver: true, winner: this.winner, reason: this.winReason };
      }

      return { success: true, move: moveRecord, gameOver: false };
    }

    /**
     * Get all legal moves for a given player
     */
    getAllValidMoves(player) {
      const originalTurn = this.turn;
      this.turn = player;
      const allMoves = [];

      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const piece = this.board[r][c];
          if (piece && piece.player === player) {
            const moves = this.getValidMoves(r, c);
            moves.forEach(m => {
              allMoves.push({
                fromR: r,
                fromC: c,
                fromNotation: OTTv2Engine.toNotation(r, c),
                ...m
              });
            });
          }
        }
      }

      this.turn = originalTurn;
      return allMoves;
    }

    /**
     * State snapshot for multiplayer sync
     */
    getState() {
      return {
        board: this.board,
        turn: this.turn,
        capturedPieces: this.capturedPieces,
        isGameOver: this.isGameOver,
        winner: this.winner,
        winReason: this.winReason,
        lastMove: this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1] : null,
        p1Remaining: this.getRemainingPieces(PLAYERS.P1),
        p2Remaining: this.getRemainingPieces(PLAYERS.P2)
      };
    }

    /**
     * Loads a state snapshot
     */
    loadState(state) {
      if (!state) return;
      this.board = state.board;
      this.turn = state.turn;
      this.capturedPieces = state.capturedPieces;
      this.isGameOver = state.isGameOver;
      this.winner = state.winner;
      this.winReason = state.winReason;
    }
  }

  OTTv2Engine.BOARD_SIZE = BOARD_SIZE;
  OTTv2Engine.PIECE_TYPES = PIECE_TYPES;
  OTTv2Engine.PLAYERS = PLAYERS;

  return OTTv2Engine;
}));
