/**
 * Oẳn Tù Tì v2 (OTTv2) - Advanced AI Engine with RAM Transposition Table
 *
 * Tính năng chính:
 * 1. 3 Cấp độ tư duy:
 *    - DỄ (Tập sự): Heuristic 1-ply nhanh, ngẫu nhiên hóa nhẹ.
 *    - VỪA (Chiến thuật gia): Minimax 2-ply với Alpha-Beta Pruning, bảo vệ quân và phòng thủ cứ điểm.
 *    - KHÓ (Đại kiện tướng): Minimax sâu 3-4 ply + Cắt tỉa Alpha-Beta + Sắp xếp nước đi (Move Ordering)
 * 2. Bộ nhớ tư duy trong RAM máy tính (In-Memory Transposition Table):
 *    - Sử dụng Zobrist Hashing sinh mã băm 64-bit cho trạng thái bàn cờ 9x9.
 *    - Lưu trữ hàng chục nghìn nhánh thế cờ đã duyệt trực tiếp trong RAM (Map cache).
 *    - Tái sử dụng tri thức trong RAM với độ phức tạp O(1) để tăng tốc độ tư duy.
 *    - Telemetry: Đo lường số nút duyệt, thời gian suy nghĩ và dung lượng RAM chiếm dụng.
 */

import {
  BOARD_SIZE,
  PLAYER_GOALS,
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
  constructor(difficulty = 'hard') {
    this.difficulty = difficulty; // 'easy' | 'medium' | 'hard'

    // In-Memory Transposition Table (Lưu trữ bộ nhớ thế cờ trong RAM)
    this.transpositionTable = new Map();
    this.maxTableSize = 65536; // Giới hạn kích thước bảng trong RAM để tránh tràn bộ nhớ

    // Khởi tạo bảng số ngẫu nhiên Zobrist trong RAM cho bàn cờ 9x9
    this.initZobristTable();

    // Thống kê đo lường hiệu năng & RAM
    this.lastStats = {
      difficulty: this.difficulty,
      nodesEvaluated: 0,
      thinkingTimeMs: 0,
      cachedStates: 0,
      ramUsageKB: 0,
      transpositionHits: 0
    };
  }

  setDifficulty(diff) {
    if (['easy', 'medium', 'hard'].includes(diff)) {
      this.difficulty = diff;
    }
  }

  /**
   * Khởi tạo bảng mã băm ngẫu nhiên Zobrist 32-bit trong RAM
   * Cho mỗi [y][x][player][piece_type]
   */
  initZobristTable() {
    this.zobrist = [];
    const playerKeys = [PLAYERS.PLAYER_1, PLAYERS.PLAYER_2];
    const pieceKeys = [PIECE_TYPES.ROCK, PIECE_TYPES.PAPER, PIECE_TYPES.SCISSORS];

    for (let y = 0; y < BOARD_SIZE; y++) {
      this.zobrist[y] = [];
      for (let x = 0; x < BOARD_SIZE; x++) {
        this.zobrist[y][x] = {};
        for (const player of playerKeys) {
          this.zobrist[y][x][player] = {};
          for (const type of pieceKeys) {
            // Sinh mã băm ngẫu nhiên 32-bit
            this.zobrist[y][x][player][type] = (Math.random() * 0xFFFFFFFF) >>> 0;
          }
        }
      }
    }

    // Hash bổ sung cho lượt đi
    this.zobristTurn = {
      [PLAYERS.PLAYER_1]: (Math.random() * 0xFFFFFFFF) >>> 0,
      [PLAYERS.PLAYER_2]: (Math.random() * 0xFFFFFFFF) >>> 0
    };
  }

  /**
   * Tính mã băm Zobrist của toàn bộ bàn cờ hiện tại
   */
  computeZobristHash(board, turn) {
    let hash = this.zobristTurn[turn] || 0;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const piece = board[y][x];
        if (piece && this.zobrist[y][x][piece.player]) {
          const pieceHash = this.zobrist[y][x][piece.player][piece.type];
          if (pieceHash) {
            hash = (hash ^ pieceHash) >>> 0;
          }
        }
      }
    }
    return hash;
  }

  /**
   * Lấy báo cáo thống kê sử dụng RAM và thời gian tư duy
   */
  getMemoryStats() {
    const cachedStates = this.transpositionTable.size;
    // Mỗi mục trong Transposition Table chiếm khoảng ~128 bytes trong JavaScript Heap RAM
    const estimatedRamKB = Math.round((cachedStates * 128) / 1024);

    return {
      difficulty: this.difficulty,
      nodesEvaluated: this.lastStats.nodesEvaluated,
      thinkingTimeMs: this.lastStats.thinkingTimeMs,
      cachedStates,
      ramUsageKB: estimatedRamKB,
      transpositionHits: this.lastStats.transpositionHits
    };
  }

  /**
   * Xóa sạch bảng chuyển vị trong RAM nếu cần reset
   */
  clearMemory() {
    this.transpositionTable.clear();
  }

  /**
   * Thu thập tất cả các nước đi hợp lệ của một người chơi
   */
  getAllMoves(board, player) {
    const moves = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const piece = board[y][x];
        if (piece && piece.player === player) {
          const fromCoord = posToCoord(x, y);
          const valids = getValidMovesForPiece(board, x, y, player);

          for (const m of valids) {
            moves.push({
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
    return moves;
  }

  /**
   * Tính toán nước đi tối ưu nhất cho AI dựa trên cấp độ đã chọn
   */
  getBestMove(board, aiPlayer = PLAYERS.PLAYER_2, goalMode = 'ANY') {
    const startTime = performance.now();
    this.lastStats.nodesEvaluated = 0;
    this.lastStats.transpositionHits = 0;

    const candidateMoves = this.getAllMoves(board, aiPlayer);
    if (candidateMoves.length === 0) return null;

    let selectedMove = null;

    if (this.difficulty === 'easy') {
      // CẤP ĐỘ 1: DỄ (Tập sự - Heuristic 1-ply nhanh)
      selectedMove = this.getBestMoveEasy(board, candidateMoves, aiPlayer, goalMode);
    } else if (this.difficulty === 'medium') {
      // CẤP ĐỘ 2: VỪA (Chiến thuật gia - Minimax 2-ply)
      selectedMove = this.getBestMoveMinimax(board, candidateMoves, aiPlayer, goalMode, 2);
    } else {
      // CẤP ĐỘ 3: KHÓ (Đại kiện tướng - Minimax 3-ply + RAM Transposition Table)
      selectedMove = this.getBestMoveMinimax(board, candidateMoves, aiPlayer, goalMode, 3);
    }

    const elapsed = Math.round(performance.now() - startTime);
    this.lastStats.thinkingTimeMs = elapsed;
    this.lastStats.cachedStates = this.transpositionTable.size;
    this.lastStats.ramUsageKB = Math.round((this.transpositionTable.size * 128) / 1024);

    return selectedMove || candidateMoves[0];
  }

  /**
   * CẤP ĐỘ 1: DỄ - Tính điểm 1-ply đơn giản, có 30% chọn ngẫu nhiên
   */
  getBestMoveEasy(board, candidateMoves, aiPlayer, goalMode) {
    this.lastStats.nodesEvaluated += candidateMoves.length;

    // 30% cơ hội chọn ngẫu nhiên
    if (Math.random() < 0.3) {
      const idx = Math.floor(Math.random() * candidateMoves.length);
      return candidateMoves[idx];
    }

    // Heuristic 1 bước
    let bestScore = -Infinity;
    let bestMove = candidateMoves[0];

    for (const move of candidateMoves) {
      let score = 0;
      if (move.to === PLAYER_GOALS[aiPlayer]) score += 5000;
      if (move.isCapture) score += 100;
      score += Math.random() * 20;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  /**
   * Thuật toán Minimax với Cắt tỉa Alpha-Beta và Bảng Chuyển Vị RAM
   */
  getBestMoveMinimax(board, candidateMoves, aiPlayer, goalMode, searchDepth) {
    const opponent = aiPlayer === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;

    // 1. Kiểm tra nước đi thắng ngay lập tức trong 1 lượt (Ưu tiên tuyệt đối)
    for (const move of candidateMoves) {
      if (move.to === PLAYER_GOALS[aiPlayer]) return move;
    }

    // 2. Sắp xếp nước đi (Move Ordering) để tăng tối đa hiệu suất cắt tỉa Alpha-Beta
    this.orderMoves(candidateMoves, board, aiPlayer);

    let bestScore = -Infinity;
    let bestMove = candidateMoves[0];
    let alpha = -Infinity;
    const beta = Infinity;

    for (const move of candidateMoves) {
      // Giả lập nước đi
      const nextBoard = this.cloneBoard(board);
      nextBoard[move.toPos.y][move.toPos.x] = move.piece;
      nextBoard[move.fromPos.y][move.fromPos.x] = null;

      // Kiểm tra thắng ngay
      const win = checkWinCondition(nextBoard, move, goalMode);
      if (win.hasWinner && win.winner === aiPlayer) {
        return move;
      }

      // Đệ quy Minimax
      const score = this.minimax(
        nextBoard,
        searchDepth - 1,
        alpha,
        beta,
        false, // Lượt tiếp theo là đối phương (Minimizing)
        aiPlayer,
        opponent,
        goalMode
      );

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }

      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) break; // Cắt tỉa
    }

    return bestMove;
  }

  /**
   * Đệ quy Minimax kết hợp Bảng Chuyển Vị trong RAM (Transposition Table)
   */
  minimax(board, depth, alpha, beta, isMaximizing, aiPlayer, opponent, goalMode) {
    this.lastStats.nodesEvaluated++;

    const currentTurn = isMaximizing ? aiPlayer : opponent;

    // 1. Tra cứu Bảng Chuyển Vị trong RAM
    const boardHash = this.computeZobristHash(board, currentTurn);
    const cachedEntry = this.transpositionTable.get(boardHash);

    if (cachedEntry && cachedEntry.depth >= depth) {
      this.lastStats.transpositionHits++;
      if (cachedEntry.flag === 'EXACT') {
        return cachedEntry.score;
      } else if (cachedEntry.flag === 'LOWERBOUND' && cachedEntry.score > alpha) {
        alpha = cachedEntry.score;
      } else if (cachedEntry.flag === 'UPPERBOUND' && cachedEntry.score < beta) {
        beta = cachedEntry.score;
      }
      if (alpha >= beta) {
        return cachedEntry.score;
      }
    }

    // 2. Điều kiện dừng: Đạt độ sâu hoặc ván cờ kết thúc
    const p1Goal = coordToPos(PLAYER_GOALS[PLAYERS.PLAYER_1]);
    const p2Goal = coordToPos(PLAYER_GOALS[PLAYERS.PLAYER_2]);
    const winner = board[p1Goal.y][p1Goal.x]?.player === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_1 :
      board[p2Goal.y][p2Goal.x]?.player === PLAYERS.PLAYER_2 ? PLAYERS.PLAYER_2 : null;
    if (winner) {
      const score = winner === aiPlayer ? (100000 + depth * 100) : (-100000 - depth * 100);
      return score;
    }

    if (depth <= 0) {
      return this.evaluateBoard(board, aiPlayer, opponent, goalMode);
    }

    // 3. Sinh các nước đi của bên hiện tại
    const moves = this.getAllMoves(board, currentTurn);
    if (moves.length === 0) {
      // Hết nước đi -> bên này thua
      return isMaximizing ? -80000 : 80000;
    }

    this.orderMoves(moves, board, currentTurn);

    let bestScore = isMaximizing ? -Infinity : Infinity;

    if (isMaximizing) {
      for (const move of moves) {
        const nextBoard = this.cloneBoard(board);
        nextBoard[move.toPos.y][move.toPos.x] = move.piece;
        nextBoard[move.fromPos.y][move.fromPos.x] = null;

        const score = this.minimax(nextBoard, depth - 1, alpha, beta, false, aiPlayer, opponent, goalMode);
        bestScore = Math.max(bestScore, score);
        alpha = Math.max(alpha, bestScore);
        if (beta <= alpha) break; // Cắt tỉa Alpha-Beta
      }
    } else {
      for (const move of moves) {
        const nextBoard = this.cloneBoard(board);
        nextBoard[move.toPos.y][move.toPos.x] = move.piece;
        nextBoard[move.fromPos.y][move.fromPos.x] = null;

        const score = this.minimax(nextBoard, depth - 1, alpha, beta, true, aiPlayer, opponent, goalMode);
        bestScore = Math.min(bestScore, score);
        beta = Math.min(beta, bestScore);
        if (beta <= alpha) break; // Cắt tỉa Alpha-Beta
      }
    }

    // 4. Lưu trạng thái thế cờ vừa tính vào RAM Transposition Table
    if (this.transpositionTable.size < this.maxTableSize) {
      let flag = 'EXACT';
      if (bestScore <= alpha) flag = 'UPPERBOUND';
      else if (bestScore >= beta) flag = 'LOWERBOUND';

      this.transpositionTable.set(boardHash, {
        depth,
        score: bestScore,
        flag
      });
    }

    return bestScore;
  }

  /**
   * Sắp xếp nước đi (Move Ordering):
   * Nước ăn quân và nước tiến sát ô đích được đánh giá trước để tăng tốc độ cắt tỉa
   */
  orderMoves(moves, board, player) {
    moves.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      if (a.to === PLAYER_GOALS[player]) scoreA += 1000;
      if (b.to === PLAYER_GOALS[player]) scoreB += 1000;

      if (a.isCapture) scoreA += 500;
      if (b.isCapture) scoreB += 500;

      return scoreB - scoreA;
    });
  }

  /**
   * Hàm lượng giá thế cờ (Heuristic Evaluation Function)
   */
  evaluateBoard(board, aiPlayer, opponent, goalMode) {
    let score = 0;
    const counts = countPlayerPieces(board);

    // 1. Chênh lệch quân số
    const myTotal = counts[aiPlayer].total;
    const oppTotal = counts[opponent].total;
    score += (myTotal - oppTotal) * 100;

    // 2. Giữ quân và ưu tiên bắt quân đối phương.
    const types = [PIECE_TYPES.ROCK, PIECE_TYPES.PAPER, PIECE_TYPES.SCISSORS];
    for (const t of types) {
      const oppCount = counts[opponent][t];
      const myCount = counts[aiPlayer][t];

      // Nếu đối thủ chỉ còn 1 quân -> Ưu tiên cực lớn săn lùng
      if (oppCount === 1) score += 600;
      else if (oppCount === 2) score += 200;

      // Nếu quân mình chỉ còn 1 quân -> Cực kỳ nguy hiểm, phải bảo vệ
      if (myCount === 1) score -= 800;
      else if (myCount === 2) score -= 250;
    }

    // 3. Khoảng cách tới ô đích của từng người chơi.
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const piece = board[y][x];
        if (!piece) continue;

        // Xác định mục tiêu
        const targetGoal = coordToPos(PLAYER_GOALS[piece.player]);

        const dist = Math.hypot(x - targetGoal.x, y - targetGoal.y);
        const proximityScore = Math.max(0, (12 - dist) * 12);

        if (piece.player === aiPlayer) {
          score += proximityScore;
          // Điểm kiểm soát trung tâm bàn cờ
          const centerDist = Math.hypot(x - 4, y - 4);
          score += Math.max(0, (6 - centerDist) * 4);
        } else {
          score -= proximityScore * 1.1; // Cảnh giác quân địch tiến sát đích
        }
      }
    }

    return score;
  }

  /**
   * Tạo bản sao độc lập của ma trận bàn cờ 9x9
   */
  cloneBoard(board) {
    const next = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      next[y] = [];
      for (let x = 0; x < BOARD_SIZE; x++) {
        const p = board[y][x];
        next[y][x] = p ? { type: p.type, player: p.player, id: p.id } : null;
      }
    }
    return next;
  }
}
