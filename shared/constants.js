/**
 * Oẳn Tù Tì v2 (OTTv2) - Shared Constants & Enums
 */

export const PIECE_TYPES = {
  ROCK: 'ROCK',         // ✊ Đấm
  PAPER: 'PAPER',       // ✋ Lá
  SCISSORS: 'SCISSORS'  // ✌️ Kéo
};

export const PIECE_SYMBOLS = {
  [PIECE_TYPES.ROCK]: '✊',
  [PIECE_TYPES.PAPER]: '✋',
  [PIECE_TYPES.SCISSORS]: '✌️'
};

export const PIECE_NAMES_VI = {
  [PIECE_TYPES.ROCK]: 'Đấm',
  [PIECE_TYPES.PAPER]: 'Lá',
  [PIECE_TYPES.SCISSORS]: 'Kéo'
};

export const PLAYERS = {
  PLAYER_1: 'P1',
  PLAYER_2: 'P2'
};

export const PLAYER_NAMES = {
  [PLAYERS.PLAYER_1]: 'Player 1',
  [PLAYERS.PLAYER_2]: 'Player 2'
};

export const BOARD_SIZE = 9; // 9x9 board

export const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
export const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Special winning / goal cells
export const GOAL_CELLS = ['A1', 'I9'];

// Combat relation: Key beats Value
export const BEATS = {
  [PIECE_TYPES.ROCK]: PIECE_TYPES.SCISSORS,      // Đấm > Kéo
  [PIECE_TYPES.SCISSORS]: PIECE_TYPES.PAPER,    // Kéo > Lá
  [PIECE_TYPES.PAPER]: PIECE_TYPES.ROCK         // Lá > Đấm
};

/**
 * Combat outcomes between attacker and defender
 */
export const COMBAT_RESULT = {
  WIN: 'WIN',           // Attacker captures defender
  LOSE: 'LOSE',         // Attacker is beaten (illegal move)
  TIE: 'TIE',           // Same type, blocked
  SAME_PLAYER: 'SAME'   // Cannot capture own piece
};

export const GAME_STATUS = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  ENDED: 'ENDED'
};

export const WIN_REASONS = {
  ELIMINATION: 'ELIMINATION',   // Ăn sạch hoàn toàn 1 loại quân
  GOAL_REACHED: 'GOAL_REACHED'  // Đưa quân vào ô đích (A1 hoặc I9)
};

export const BOARD_PRESETS = {
  CHESS_9: 'CHESS_9',            // Chuẩn Cờ Vua: 9 quân chia đều (3 Đấm, 3 Lá, 3 Kéo)
  FRONTLINE: 'FRONTLINE',        // Tiền tuyến đối đầu (15 quân)
  DIAGONAL: 'DIAGONAL',          // Doanh trại đường chéo (15 quân)
  CUSTOM_DRAFT: 'CUSTOM_DRAFT'   // Tự chọn & Dàn trận (Tối đa 9 quân)
};
