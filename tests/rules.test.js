/**
 * Unit Test Suite for Oẳn Tù Tì v2 (OTTv2) - Game Rules Engine
 * Thành viên phụ trách: Trần Văn Mạnh (Branch: manh)
 * Môn học: Lập trình mạng - VNU-UET
 */

import assert from 'assert';
import {
  coordToPos,
  posToCoord,
  evaluateCombat,
  isKingMove,
  validateMove,
  getValidMovesForPiece,
  countPlayerPieces,
  checkWinCondition,
  createEmptyBoard,
  createInitialBoard
} from '../shared/gameRules.js';

import {
  PIECE_TYPES,
  PLAYERS,
  COMBAT_RESULT,
  WIN_REASONS
} from '../shared/constants.js';

console.log('================================================================');
console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TÍNH ĐÚNG ĐẮN CỦA OTTv2 GAME ENGINE');
console.log('   (Phiên bản luật chơi nguyên bản & Giao diện Playchess)');
console.log('================================================================\n');

// -------------------------------------------------------------
// Test 1: Chuyển đổi tọa độ A1 -> I9
// -------------------------------------------------------------
console.log('1. Kiểm tra chuyển đổi hệ tọa độ bàn cờ 9x9 (A1 - I9)...');
assert.deepStrictEqual(coordToPos('A1'), { x: 0, y: 0 });
assert.deepStrictEqual(coordToPos('I9'), { x: 8, y: 8 });
assert.deepStrictEqual(coordToPos('E5'), { x: 4, y: 4 });
assert.strictEqual(posToCoord(0, 0), 'A1');
assert.strictEqual(posToCoord(8, 8), 'I9');
assert.strictEqual(posToCoord(4, 4), 'E5');
assert.strictEqual(coordToPos('Z9'), null);
assert.strictEqual(posToCoord(10, 10), null);
console.log('  ✓ Hệ tọa độ A1 <-> (x, y) chính xác 100%\n');

// -------------------------------------------------------------
// Test 2: Quy tắc di chuyển 8 hướng như quân Vua cờ vua
// -------------------------------------------------------------
console.log('2. Kiểm tra di chuyển 1 ô theo 8 hướng (King\'s Move)...');
assert.strictEqual(isKingMove(4, 4, 4, 5), true, 'Đi thẳng lên');
assert.strictEqual(isKingMove(4, 4, 4, 3), true, 'Đi thẳng xuống');
assert.strictEqual(isKingMove(4, 4, 3, 4), true, 'Đi sang trái');
assert.strictEqual(isKingMove(4, 4, 5, 4), true, 'Đi sang phải');
assert.strictEqual(isKingMove(4, 4, 5, 5), true, 'Đi chéo trên-phải');
assert.strictEqual(isKingMove(4, 4, 3, 3), true, 'Đi chéo dưới-trái');
assert.strictEqual(isKingMove(4, 4, 5, 3), true, 'Đi chéo trên-trái');
assert.strictEqual(isKingMove(4, 4, 3, 5), true, 'Đi chéo dưới-phải');
assert.strictEqual(isKingMove(4, 4, 4, 4), false, 'Đứng yên không phải nước đi');
assert.strictEqual(isKingMove(4, 4, 4, 6), false, 'Không được đi 2 ô');
assert.strictEqual(isKingMove(4, 4, 6, 6), false, 'Không được nhảy chéo 2 ô');
console.log('  ✓ Luật di chuyển quân Vua 8 hướng kiểm chứng thành công\n');

// -------------------------------------------------------------
// Test 3: Quy tắc khắc chế Oẳn Tù Tì & luật cùng loại chặn đường
// -------------------------------------------------------------
console.log('3. Kiểm tra quy tắc ăn quân Đấm-Lá-Kéo và luật cùng loại chặn đường...');
const rock = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_1 };
const paper = { type: PIECE_TYPES.PAPER, player: PLAYERS.PLAYER_1 };
const scissors = { type: PIECE_TYPES.SCISSORS, player: PLAYERS.PLAYER_1 };

const enemyRock = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_2 };
const enemyPaper = { type: PIECE_TYPES.PAPER, player: PLAYERS.PLAYER_2 };
const enemyScissors = { type: PIECE_TYPES.SCISSORS, player: PLAYERS.PLAYER_2 };

// Đấm ăn Kéo
assert.strictEqual(evaluateCombat(rock, enemyScissors), COMBAT_RESULT.WIN);
// Kéo ăn Lá
assert.strictEqual(evaluateCombat(scissors, enemyPaper), COMBAT_RESULT.WIN);
// Lá ăn Đấm
assert.strictEqual(evaluateCombat(paper, enemyRock), COMBAT_RESULT.WIN);

// Bị khắc chế (Thua / Không được đi)
assert.strictEqual(evaluateCombat(rock, enemyPaper), COMBAT_RESULT.LOSE);
assert.strictEqual(evaluateCombat(paper, enemyScissors), COMBAT_RESULT.LOSE);
assert.strictEqual(evaluateCombat(scissors, enemyRock), COMBAT_RESULT.LOSE);

// Cùng loại chặn đường (Hòa)
assert.strictEqual(evaluateCombat(rock, enemyRock), COMBAT_RESULT.TIE);
assert.strictEqual(evaluateCombat(paper, enemyPaper), COMBAT_RESULT.TIE);
assert.strictEqual(evaluateCombat(scissors, enemyScissors), COMBAT_RESULT.TIE);

// Cùng phe
assert.strictEqual(evaluateCombat(rock, paper), COMBAT_RESULT.SAME_PLAYER);
console.log('  ✓ Luật khắc chế và luật chặn đường hai quân cùng loại chuẩn xác 100%\n');

// -------------------------------------------------------------
// Test 4: Bố cục bàn cờ gốc FRONTLINE (15 quân mỗi bên: 5 Đấm, 5 Lá, 5 Kéo)
// -------------------------------------------------------------
console.log('4. Kiểm tra bố cục bàn cờ nguyên bản FRONTLINE (15 quân mỗi bên)...');
const frontlineBoard = createInitialBoard('FRONTLINE');
const frontlineCounts = countPlayerPieces(frontlineBoard);

assert.strictEqual(frontlineCounts.P1.total, 15, 'P1 phải có chính xác 15 quân');
assert.strictEqual(frontlineCounts.P2.total, 15, 'P2 phải có chính xác 15 quân');
assert.strictEqual(frontlineCounts.P1.ROCK, 5, 'P1 có đúng 5 Đấm');
assert.strictEqual(frontlineCounts.P1.PAPER, 5, 'P1 có đúng 5 Lá');
assert.strictEqual(frontlineCounts.P1.SCISSORS, 5, 'P1 có đúng 5 Kéo');
assert.strictEqual(frontlineCounts.P2.ROCK, 5, 'P2 có đúng 5 Đấm');
assert.strictEqual(frontlineCounts.P2.PAPER, 5, 'P2 có đúng 5 Lá');
assert.strictEqual(frontlineCounts.P2.SCISSORS, 5, 'P2 có đúng 5 Kéo');

// Cứ điểm A1 (0, 0) và I9 (8, 8) thông thoáng
assert.strictEqual(frontlineBoard[0][0], null, 'Cứ điểm A1 thông thoáng');
assert.strictEqual(frontlineBoard[8][8], null, 'Cứ điểm I9 thông thoáng');
console.log('  ✓ Bố cục gốc FRONTLINE hoàn hảo: 15 vs 15 quân (5 Đấm, 5 Lá, 5 Kéo), A1 và I9 thông thoáng\n');

// -------------------------------------------------------------
// Test 5: Bố cục bàn cờ phụ DIAGONAL (15 quân mỗi bên)
// -------------------------------------------------------------
console.log('5. Kiểm tra bố cục bàn cờ DIAGONAL (15 quân mỗi bên)...');
const diagonalBoard = createInitialBoard('DIAGONAL');
const diagonalCounts = countPlayerPieces(diagonalBoard);

assert.strictEqual(diagonalCounts.P1.total, 15, 'P1 có 15 quân');
assert.strictEqual(diagonalCounts.P2.total, 15, 'P2 có 15 quân');
console.log('  ✓ Bố cục DIAGONAL khởi tạo cân bằng 15 vs 15\n');

// -------------------------------------------------------------
// Test 6: Kiểm tra tính hợp lệ của nước đi thực tế trên bàn cờ
// -------------------------------------------------------------
console.log('6. Kiểm tra tính hợp lệ của nước đi và chặn đường trên bàn cờ...');
const testBoard = createEmptyBoard();
testBoard[4][4] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_1, id: 'p1_r1' }; // E5
testBoard[4][5] = { type: PIECE_TYPES.SCISSORS, player: PLAYERS.PLAYER_2, id: 'p2_s1' }; // F5
testBoard[4][3] = { type: PIECE_TYPES.PAPER, player: PLAYERS.PLAYER_2, id: 'p2_p1' }; // D5
testBoard[3][4] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_2, id: 'p2_r1' }; // E4

// P1 Đấm (E5) ăn P2 Kéo (F5) -> Hợp lệ
const moveEat = validateMove(testBoard, { from: 'E5', to: 'F5', player: PLAYERS.PLAYER_1 }, PLAYERS.PLAYER_1);
assert.strictEqual(moveEat.valid, true, 'Đấm phải ăn được Kéo');
assert.strictEqual(moveEat.isCapture, true, 'Đây là nước ăn quân');

// P1 Đấm (E5) lao vào P2 Lá (D5) -> Không hợp lệ (Bị khắc chế)
const moveLose = validateMove(testBoard, { from: 'E5', to: 'D5', player: PLAYERS.PLAYER_1 }, PLAYERS.PLAYER_1);
assert.strictEqual(moveLose.valid, false, 'Đấm không thể tấn công Lá');

// P1 Đấm (E5) lao vào P2 Đấm (E4) -> Không hợp lệ (Hai quân cùng loại chặn đường)
const moveTie = validateMove(testBoard, { from: 'E5', to: 'E4', player: PLAYERS.PLAYER_1 }, PLAYERS.PLAYER_1);
assert.strictEqual(moveTie.valid, false, 'Hai quân Đấm chặn đường nhau');
console.log('  ✓ Kiểm tra tương tác bàn cờ thực tế hoàn toàn chính xác\n');

// -------------------------------------------------------------
// Test 7: Điều kiện thắng 1 - Tiêu diệt sạch 1 loại quân đối phương
// -------------------------------------------------------------
console.log('7. Kiểm tra điều kiện thắng: Tiêu diệt hoàn toàn 1 loại quân của đối phương...');
const winEliminationBoard = createEmptyBoard();
winEliminationBoard[0][0] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_1, id: 'p1_1' };
winEliminationBoard[0][1] = { type: PIECE_TYPES.PAPER, player: PLAYERS.PLAYER_1, id: 'p1_2' };
winEliminationBoard[0][2] = { type: PIECE_TYPES.SCISSORS, player: PLAYERS.PLAYER_1, id: 'p1_3' };

// P2 còn Đấm và Lá, nhưng mất sạch Kéo (SCISSORS = 0)
winEliminationBoard[8][0] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_2, id: 'p2_1' };
winEliminationBoard[8][1] = { type: PIECE_TYPES.PAPER, player: PLAYERS.PLAYER_2, id: 'p2_2' };

const elimWin = checkWinCondition(winEliminationBoard);
assert.strictEqual(elimWin.hasWinner, true, 'Trò chơi phải kết thúc');
assert.strictEqual(elimWin.winner, PLAYERS.PLAYER_1, 'P1 phải giành chiến thắng');
assert.strictEqual(elimWin.reason, WIN_REASONS.ELIMINATION);
assert.ok(elimWin.details.includes('Kéo'), 'Chi tiết phải ghi rõ ăn sạch quân Kéo');
console.log('  ✓ Phát hiện điều kiện thắng diệt chủng 1 loại quân chuẩn xác\n');

// -------------------------------------------------------------
// Test 8: Điều kiện thắng 2 - Chiếm cứ điểm ô đích A1 / I9
// -------------------------------------------------------------
console.log('8. Kiểm tra điều kiện thắng: Đột kích cứ điểm A1 hoặc I9...');
const winGoalBoard = createEmptyBoard();
winGoalBoard[8][8] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_1, id: 'p1_hero' };

// P1 vừa đi vào I9
const goalWin = checkWinCondition(winGoalBoard, { from: 'H8', to: 'I9', player: PLAYERS.PLAYER_1 });
assert.strictEqual(goalWin.hasWinner, true, 'Trò chơi phải kết thúc khi vào ô đích');
assert.strictEqual(goalWin.winner, PLAYERS.PLAYER_1, 'P1 thắng khi vào I9');
assert.strictEqual(goalWin.reason, WIN_REASONS.GOAL_REACHED);
console.log('  ✓ Phát hiện điều kiện thắng chiếm ô đích chuẩn xác\n');

// -------------------------------------------------------------
// Test 9: Kiểm tra bố cục CHESS_9 (9 quân chia đều mỗi bên)
// -------------------------------------------------------------
console.log('9. Kiểm tra bố cục CHESS_9 (9 quân chia đều mỗi bên)...');
const chessBoard = createInitialBoard('CHESS_9');
const chessCounts = countPlayerPieces(chessBoard);

assert.strictEqual(chessCounts.P1.total, 9, 'P1 có đúng 9 quân');
assert.strictEqual(chessCounts.P2.total, 9, 'P2 có đúng 9 quân');
assert.strictEqual(chessCounts.P1.ROCK, 3, 'P1 có 3 Đấm');
assert.strictEqual(chessCounts.P1.PAPER, 3, 'P1 có 3 Lá');
assert.strictEqual(chessCounts.P1.SCISSORS, 3, 'P1 có 3 Kéo');
assert.strictEqual(chessCounts.P2.ROCK, 3, 'P2 có 3 Đấm');
assert.strictEqual(chessCounts.P2.PAPER, 3, 'P2 có 3 Lá');
assert.strictEqual(chessCounts.P2.SCISSORS, 3, 'P2 có 3 Kéo');
console.log('  ✓ Bố cục CHESS_9 kiểm tra thành công: 9 quân chia đều (3 Đấm, 3 Lá, 3 Kéo)\n');

console.log('================================================================');
console.log('🎉 TẤT CẢ 9/9 BÀI TEST LUẬT CHƠI NGUYÊN BẢN ĐỀU VƯỢT QUA XUẤT SẮC (100% PASS)!');
console.log('================================================================\n');
