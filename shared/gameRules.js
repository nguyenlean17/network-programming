/**
 * Oẳn Tù Tì v2 (OTTv2) - Game Rules Engine
 * Pure logic for validation, movement, combat, and win conditions.
 */

import {
  PIECE_TYPES,
  PLAYERS,
  BOARD_SIZE,
  COLUMNS,
  PLAYER_GOALS,
  BEATS,
  COMBAT_RESULT,
  WIN_REASONS
} from './constants.js';

/**
 * Converts col ('A'-'I') and row (1-9) to x, y indices (0-8)
 */
export function coordToPos(cellId) {
  if (typeof cellId !== 'string' || !/^[A-I][1-9]$/i.test(cellId)) return null;
  const colChar = cellId[0].toUpperCase();
  const rowNum = parseInt(cellId.slice(1), 10);
  const x = COLUMNS.indexOf(colChar);
  const y = rowNum - 1;
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
  return { x, y };
}

/**
 * Converts x, y indices (0-8) to cell ID (e.g. 'A1', 'I9')
 */
export function posToCoord(x, y) {
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
  return `${COLUMNS[x]}${y + 1}`;
}

/**
 * Evaluates combat outcome when attacker attacks defender
 */
export function evaluateCombat(attacker, defender) {
  if (!defender) return COMBAT_RESULT.WIN; // Empty cell
  if (attacker.player === defender.player) return COMBAT_RESULT.SAME_PLAYER;
  if (attacker.type === defender.type) return COMBAT_RESULT.TIE;
  if (BEATS[attacker.type] === defender.type) return COMBAT_RESULT.WIN;
  return COMBAT_RESULT.LOSE;
}

/**
 * Checks if a move is within 1 step (King's move in 8 directions)
 */
export function isKingMove(fromX, fromY, toX, toY) {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  if (dx === 0 && dy === 0) return false;
  return dx <= 1 && dy <= 1;
}

/**
 * Validates a single move in the game
 */
export function validateMove(board, move, currentTurn, goalMode = 'ANY') {
  const { from, to, player } = move;

  // Turn check
  if (player !== currentTurn) {
    return { valid: false, reason: 'Chưa tới lượt của bạn.' };
  }

  const fromPos = coordToPos(from);
  const toPos = coordToPos(to);

  if (!fromPos || !toPos) {
    return { valid: false, reason: 'Vị trí không nằm trên bàn cờ.' };
  }

  const piece = board[fromPos.y][fromPos.x];
  if (!piece) {
    return { valid: false, reason: 'Không có quân cờ ở ô xuất phát.' };
  }

  if (piece.player !== player) {
    return { valid: false, reason: 'Bạn chỉ có thể di chuyển quân của mình.' };
  }

  if (!isKingMove(fromPos.x, fromPos.y, toPos.x, toPos.y)) {
    return { valid: false, reason: 'Chỉ được di chuyển tối đa 1 ô theo 8 hướng.' };
  }

  const target = board[toPos.y][toPos.x];
  const combat = evaluateCombat(piece, target);

  if (combat === COMBAT_RESULT.SAME_PLAYER) {
    return { valid: false, reason: 'Ô đích đang bị quân cùng phe chiếm giữ.' };
  }

  if (combat === COMBAT_RESULT.TIE) {
    return { valid: false, reason: 'Hai quân cùng loại không thể ăn nhau (chặn đường)!' };
  }

  if (combat === COMBAT_RESULT.LOSE) {
    return { valid: false, reason: 'Quân của bạn bị quân đối phương khắc chế, không thể tấn công!' };
  }

  return {
    valid: true,
    isCapture: combat === COMBAT_RESULT.WIN && target !== null,
    capturedPiece: target
  };
}

/**
 * Returns all valid moves for a piece at (x, y)
 */
export function getValidMovesForPiece(board, fromX, fromY, currentTurn) {
  const piece = board[fromY][fromX];
  if (!piece || piece.player !== currentTurn) return [];

  const validMoves = [];
  const directions = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1]
  ];

  for (const [dx, dy] of directions) {
    const toX = fromX + dx;
    const toY = fromY + dy;
    if (toX < 0 || toX >= BOARD_SIZE || toY < 0 || toY >= BOARD_SIZE) continue;

    const fromCoord = posToCoord(fromX, fromY);
    const toCoord = posToCoord(toX, toY);
    const check = validateMove(board, { from: fromCoord, to: toCoord, player: currentTurn }, currentTurn);

    if (check.valid) {
      validMoves.push({
        x: toX,
        y: toY,
        coord: toCoord,
        isCapture: check.isCapture,
        capturedPiece: check.capturedPiece
      });
    }
  }

  return validMoves;
}

/**
 * Counts pieces remaining for both players
 */
export function countPlayerPieces(board) {
  const counts = {
    [PLAYERS.PLAYER_1]: { [PIECE_TYPES.ROCK]: 0, [PIECE_TYPES.PAPER]: 0, [PIECE_TYPES.SCISSORS]: 0, total: 0 },
    [PLAYERS.PLAYER_2]: { [PIECE_TYPES.ROCK]: 0, [PIECE_TYPES.PAPER]: 0, [PIECE_TYPES.SCISSORS]: 0, total: 0 }
  };

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const piece = board[y][x];
      if (piece) {
        counts[piece.player][piece.type] = (counts[piece.player][piece.type] || 0) + 1;
        counts[piece.player].total += 1;
      }
    }
  }

  return counts;
}

/**
 * Checks win conditions after a move
 * Returns { hasWinner: boolean, winner: string|null, reason: string|null, details: string|null }
 */
export function checkWinCondition(board, lastMove = null) {
  const goal = PLAYER_GOALS[lastMove?.player];
  const position = goal && coordToPos(goal);
  if (goal && goal === lastMove?.to && board[position.y][position.x]?.player === lastMove.player) {
    return {
      hasWinner: true,
      winner: lastMove.player,
      reason: WIN_REASONS.GOAL_REACHED,
      details: `${lastMove.player === PLAYERS.PLAYER_1 ? 'Player 1' : 'Player 2'} đã đưa quân vào ô đích ${goal} của đối phương!`
    };
  }
  return { hasWinner: false, winner: null, reason: null, details: null };
}

/**
 * Creates an empty 9x9 board
 */
export function createEmptyBoard() {
  const board = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    const row = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      row.push(null);
    }
    board.push(row);
  }
  return board;
}

/**
 * Standard Setup (Frontlines):
 * Each player has 15 pieces (5 ✊, 5 ✋, 5 ✌️).
 * Player 2 at Rows 1-2; I1 is kept free.
 * Player 1 at Rows 8-9; A9 is kept free.
 */
export function createInitialBoard(preset = 'FRONTLINE') {
  const board = createEmptyBoard();

  if (preset === 'DIAGONAL') {
    // Diagonal Camps:
    // P2 at top-right corner (rows 0-2, cols 4-8, I1 free)
    // P1 at bottom-left corner (rows 6-8, cols 0-4, A9 free)
    const p2Pieces = [
      // row 0: cols E-H (4)
      { coord: 'E1', type: PIECE_TYPES.ROCK },
      { coord: 'F1', type: PIECE_TYPES.PAPER },
      { coord: 'G1', type: PIECE_TYPES.SCISSORS },
      { coord: 'H1', type: PIECE_TYPES.ROCK },
      // row 1: cols E-I (5)
      { coord: 'E2', type: PIECE_TYPES.PAPER },
      { coord: 'F2', type: PIECE_TYPES.SCISSORS },
      { coord: 'G2', type: PIECE_TYPES.ROCK },
      { coord: 'H2', type: PIECE_TYPES.PAPER },
      { coord: 'I2', type: PIECE_TYPES.SCISSORS },
      // row 2: cols D-I (6)
      { coord: 'D3', type: PIECE_TYPES.ROCK },
      { coord: 'E3', type: PIECE_TYPES.PAPER },
      { coord: 'F3', type: PIECE_TYPES.SCISSORS },
      { coord: 'G3', type: PIECE_TYPES.ROCK },
      { coord: 'H3', type: PIECE_TYPES.PAPER },
      { coord: 'I3', type: PIECE_TYPES.SCISSORS }
    ];

    const p1Pieces = [
      // row 6: cols A-F (6)
      { coord: 'A7', type: PIECE_TYPES.SCISSORS },
      { coord: 'B7', type: PIECE_TYPES.PAPER },
      { coord: 'C7', type: PIECE_TYPES.ROCK },
      { coord: 'D7', type: PIECE_TYPES.SCISSORS },
      { coord: 'E7', type: PIECE_TYPES.PAPER },
      { coord: 'F7', type: PIECE_TYPES.ROCK },
      // row 7: cols A-E (5)
      { coord: 'A8', type: PIECE_TYPES.SCISSORS },
      { coord: 'B8', type: PIECE_TYPES.PAPER },
      { coord: 'C8', type: PIECE_TYPES.ROCK },
      { coord: 'D8', type: PIECE_TYPES.SCISSORS },
      { coord: 'E8', type: PIECE_TYPES.PAPER },
      // row 8: cols B-E (4)
      { coord: 'B9', type: PIECE_TYPES.ROCK },
      { coord: 'C9', type: PIECE_TYPES.SCISSORS },
      { coord: 'D9', type: PIECE_TYPES.PAPER },
      { coord: 'E9', type: PIECE_TYPES.ROCK }
    ];

    for (const p of p2Pieces) {
      const pos = coordToPos(p.coord);
      board[pos.y][pos.x] = { player: PLAYERS.PLAYER_2, type: p.type };
    }
    for (const p of p1Pieces) {
      const pos = coordToPos(p.coord);
      board[pos.y][pos.x] = { player: PLAYERS.PLAYER_1, type: p.type };
    }

    return board;
  }

  // Default: FRONTLINE
  // Player 2 pieces (15 total: 5 Rock, 5 Paper, 5 Scissors)
  // Row 1 (y = 0): B1 -> H1 (7 pieces, A1 is free, I1 is free)
  const p2Row1 = [
    { x: 1, type: PIECE_TYPES.ROCK },      // B1
    { x: 2, type: PIECE_TYPES.PAPER },     // C1
    { x: 3, type: PIECE_TYPES.SCISSORS },  // D1
    { x: 4, type: PIECE_TYPES.ROCK },      // E1
    { x: 5, type: PIECE_TYPES.PAPER },     // F1
    { x: 6, type: PIECE_TYPES.SCISSORS },  // G1
    { x: 7, type: PIECE_TYPES.ROCK }       // H1
  ];
  // Row 2 (y = 1): A2 -> H2 (8 pieces)
  const p2Row2 = [
    { x: 0, type: PIECE_TYPES.PAPER },     // A2
    { x: 1, type: PIECE_TYPES.SCISSORS },  // B2
    { x: 2, type: PIECE_TYPES.ROCK },      // C2
    { x: 3, type: PIECE_TYPES.PAPER },     // D2
    { x: 4, type: PIECE_TYPES.SCISSORS },  // E2
    { x: 5, type: PIECE_TYPES.ROCK },      // F2
    { x: 6, type: PIECE_TYPES.PAPER },     // G2
    { x: 7, type: PIECE_TYPES.SCISSORS }   // H2
  ];

  for (const p of p2Row1) {
    board[0][p.x] = { player: PLAYERS.PLAYER_2, type: p.type };
  }
  for (const p of p2Row2) {
    board[1][p.x] = { player: PLAYERS.PLAYER_2, type: p.type };
  }

  // Player 1 pieces (15 total: 5 Rock, 5 Paper, 5 Scissors)
  // Row 8 (y = 7): B8 -> I8 (8 pieces)
  const p1Row8 = [
    { x: 1, type: PIECE_TYPES.SCISSORS },  // B8
    { x: 2, type: PIECE_TYPES.PAPER },     // C8
    { x: 3, type: PIECE_TYPES.ROCK },      // D8
    { x: 4, type: PIECE_TYPES.SCISSORS },  // E8
    { x: 5, type: PIECE_TYPES.PAPER },     // F8
    { x: 6, type: PIECE_TYPES.ROCK },      // G8
    { x: 7, type: PIECE_TYPES.SCISSORS },  // H8
    { x: 8, type: PIECE_TYPES.PAPER }      // I8
  ];
  // Row 9 (y = 8): B9 -> H9 (7 pieces, I9 is free, A9 is free)
  const p1Row9 = [
    { x: 1, type: PIECE_TYPES.ROCK },      // B9
    { x: 2, type: PIECE_TYPES.SCISSORS },  // C9
    { x: 3, type: PIECE_TYPES.PAPER },     // D9
    { x: 4, type: PIECE_TYPES.ROCK },      // E9
    { x: 5, type: PIECE_TYPES.SCISSORS },  // F9
    { x: 6, type: PIECE_TYPES.PAPER },     // G9
    { x: 7, type: PIECE_TYPES.ROCK }       // H9
  ];

  for (const p of p1Row8) {
    board[7][p.x] = { player: PLAYERS.PLAYER_1, type: p.type };
  }
  for (const p of p1Row9) {
    board[8][p.x] = { player: PLAYERS.PLAYER_1, type: p.type };
  }

  return board;
}

/**
 * Tạo bàn cờ từ danh sách quân tự chọn (Tối đa 9 quân mỗi bên)
 */
export function createCustomBoard(p1Pieces = [], p2Pieces = []) {
  const board = createEmptyBoard();
  for (const p of p1Pieces) {
    if (p.x >= 0 && p.x < BOARD_SIZE && p.y >= 0 && p.y < BOARD_SIZE) {
      board[p.y][p.x] = { player: PLAYERS.PLAYER_1, type: p.type };
    }
  }
  for (const p of p2Pieces) {
    if (p.x >= 0 && p.x < BOARD_SIZE && p.y >= 0 && p.y < BOARD_SIZE) {
      board[p.y][p.x] = { player: PLAYERS.PLAYER_2, type: p.type };
    }
  }
  return board;
}

/**
 * Tự động sinh đội hình 9 quân cân bằng chiến thuật cho AI trên nửa sân của AI (Hàng 1-3)
 */
export function generateAiDraftPlacement(armySize = 9) {
  const pieces = [];
  // 3 Đấm, 3 Lá, 3 Kéo
  for (let i = 0; i < 3; i++) {
    pieces.push(PIECE_TYPES.ROCK);
    pieces.push(PIECE_TYPES.PAPER);
    pieces.push(PIECE_TYPES.SCISSORS);
  }

  // Shuffle pieces
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  // AI nửa sân: rows 1-3 (y: 0..2)
  const availableSlots = [];
  for (let y = 0; y <= 2; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (x === 8 && y === 0) continue; // Ô I1 của P2
      availableSlots.push({ x, y });
    }
  }

  for (let i = availableSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableSlots[i], availableSlots[j]] = [availableSlots[j], availableSlots[i]];
  }

  const result = [];
  for (let i = 0; i < Math.min(armySize, pieces.length); i++) {
    result.push({
      x: availableSlots[i].x,
      y: availableSlots[i].y,
      type: pieces[i]
    });
  }

  return result;
}
