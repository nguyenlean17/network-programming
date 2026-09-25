/**
 * Oẳn Tù Tì v2 (OTTv2) - AI Bot Engine
 * Evaluates tactical positions, captures, goal-rushing, and threat avoidance.
 */

import {
  BOARD_SIZE,
  GOAL_CELLS,
  PLAYERS,
  PIECE_TYPES,
  BEATS
} from './constants.js';
import {
  coordToPos,
  posToCoord,
  getValidMovesForPiece,
  countPlayerPieces,
  checkWinCondition
} from './gameRules.js';

export class OttAi {
  constructor(difficulty = 'normal') {
    this.difficulty = difficulty; // 'easy', 'normal', 'hard'
  }

  setDifficulty(diff) {
    this.difficulty = diff;
  }

  /**
   * Computes the best move for the specified player
   */
  getBestMove(board, aiPlayer = PLAYERS.PLAYER_2, goalMode = 'ANY') {
    const opponent = aiPlayer === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;
    const piecesCount = countPlayerPieces(board);
    const candidateMoves = [];

    // Collect all possible moves for all AI pieces
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const piece = board[y][x];
        if (piece && piece.player === aiPlayer) {
          const fromCoord = posToCoord(x, y);
          const validMoves = getValidMovesForPiece(board, x, y, aiPlayer);

          for (const m of validMoves) {
            candidateMoves.push({
              piece,
              from: fromCoord,
              fromPos: { x, y },
              to: m.coord,
              toPos: { x: m.x, y: m.y },
              isCapture: m.isCapture,
              capturedPiece: m.capturedPiece
            });
          }
        }
      }
    }

    if (candidateMoves.length === 0) return null;

    if (this.difficulty === 'easy') {
      // Pick random valid move
      const randomIndex = Math.floor(Math.random() * candidateMoves.length);
      return candidateMoves[randomIndex];
    }

    // Evaluate each candidate move
    for (const move of candidateMoves) {
      let score = 0;

      // 1. Immediate Win: Check if move reaches winning goal cell
      const isGoal = GOAL_CELLS.includes(move.to);
      if (isGoal) {
        if (goalMode === 'OPPOSITE') {
          if ((aiPlayer === PLAYERS.PLAYER_1 && move.to === 'A1') ||
              (aiPlayer === PLAYERS.PLAYER_2 && move.to === 'I9')) {
            score += 100000;
          }
        } else {
          score += 100000;
        }
      }

      // 2. Immediate Win by Elimination: Check if capturing this piece leaves opponent with 0 of that type
      if (move.isCapture && move.capturedPiece) {
        const remainingOfType = piecesCount[opponent][move.capturedPiece.type];
        if (remainingOfType === 1) {
          // This will be the last piece of this type! Winning move!
          score += 90000;
        } else {
          // Standard capture value
          score += 120;
          // Extra value if targeting a rare enemy type (e.g. only 2 left)
          score += (6 - remainingOfType) * 25;
        }
      }

      // 3. Goal progression: Move toward the target goal
      const targetCoord = (aiPlayer === PLAYERS.PLAYER_2 && goalMode === 'OPPOSITE') ? 'I9' :
                          (aiPlayer === PLAYERS.PLAYER_1 && goalMode === 'OPPOSITE') ? 'A1' :
                          (move.fromPos.y < 4 ? 'I9' : 'A1'); // Closest goal
      const targetPos = coordToPos(targetCoord);
      const currentDist = Math.hypot(move.fromPos.x - targetPos.x, move.fromPos.y - targetPos.y);
      const newDist = Math.hypot(move.toPos.x - targetPos.x, move.toPos.y - targetPos.y);
      const progress = currentDist - newDist;
      score += progress * 15;

      // 4. Center control / mobility
      const centerDist = Math.hypot(move.toPos.x - 4, move.toPos.y - 4);
      score += (6 - centerDist) * 3;

      // 5. Threat Avoidance (Hard & Normal)
      // Check if entering toPos puts the piece in danger from adjacent enemy pieces
      if (this.difficulty === 'hard' || this.difficulty === 'normal') {
        const dangerScore = this.evaluateCellDanger(board, move.toPos.x, move.toPos.y, move.piece, opponent);
        score -= dangerScore;
      }

      // Small jitter for unpredictability
      score += Math.random() * 6;

      move.score = score;
    }

    // Sort by score descending
    candidateMoves.sort((a, b) => b.score - a.score);

    // Pick among the top candidate moves based on difficulty
    if (this.difficulty === 'hard') {
      return candidateMoves[0];
    }

    // Normal difficulty: 80% pick best, 20% pick 2nd/3rd best
    const pickIndex = (Math.random() < 0.8 || candidateMoves.length === 1) ? 0 :
                      Math.min(1, candidateMoves.length - 1);
    return candidateMoves[pickIndex];
  }

  /**
   * Checks if an enemy piece adjacent to (targetX, targetY) can capture our piece
   */
  evaluateCellDanger(board, targetX, targetY, myPiece, opponent) {
    let penalty = 0;
    const directions = [
      [-1, -1], [0, -1], [1, -1],
      [-1,  0],          [1,  0],
      [-1,  1], [0,  1], [1,  1]
    ];

    for (const [dx, dy] of directions) {
      const nx = targetX + dx;
      const ny = targetY + dy;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        const neighbor = board[ny][nx];
        if (neighbor && neighbor.player === opponent) {
          // If neighbor beats our piece
          if (BEATS[neighbor.type] === myPiece.type) {
            penalty += 80; // Significant danger!
          }
        }
      }
    }

    return penalty;
  }
}
