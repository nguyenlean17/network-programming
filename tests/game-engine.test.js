const assert = require('assert');
const OTTv2Engine = require('../js/game-engine');

console.log('--- ĐANG CHẠY BỘ KIỂM THỬ TÍNH ĐÚNG ĐẮN CỦA OTTv2 GAME ENGINE ---');

// Test 1: Notation conversion
console.log('1. Kiểm tra chuyển đổi tọa độ bàn cờ 9x9 (a1 -> i9)...');
assert.strictEqual(OTTv2Engine.toNotation(0, 0), 'a1');
assert.strictEqual(OTTv2Engine.toNotation(8, 8), 'i9');
assert.strictEqual(OTTv2Engine.toNotation(4, 4), 'e5');
assert.deepStrictEqual(OTTv2Engine.fromNotation('a1'), { row: 0, col: 0 });
assert.deepStrictEqual(OTTv2Engine.fromNotation('i9'), { row: 8, col: 8 });
console.log('  ✓ Tọa độ a1 - i9 chính xác 100%');

// Test 2: Initial board state
console.log('2. Kiểm tra khởi tạo bàn cờ 9x9 và số lượng quân ban đầu...');
const game = new OTTv2Engine();
const p1Counts = game.getRemainingPieces('P1');
const p2Counts = game.getRemainingPieces('P2');
assert.strictEqual(p1Counts.ROCK, 3, 'P1 phải có 3 Đấm');
assert.strictEqual(p1Counts.PAPER, 3, 'P1 phải có 3 Lá');
assert.strictEqual(p1Counts.SCISSORS, 3, 'P1 phải có 3 Kéo');
assert.strictEqual(p1Counts.total, 9, 'P1 tổng cộng 9 quân');

assert.strictEqual(p2Counts.ROCK, 3, 'P2 phải có 3 Đấm');
assert.strictEqual(p2Counts.PAPER, 3, 'P2 phải có 3 Lá');
assert.strictEqual(p2Counts.SCISSORS, 3, 'P2 phải có 3 Kéo');
assert.strictEqual(p2Counts.total, 9, 'P2 tổng cộng 9 quân');
console.log('  ✓ Khởi tạo 9 quân mỗi bên (3 Đấm, 3 Lá, 3 Kéo) chính xác');

// Test 3: Combat rules & Same-type blocking
console.log('3. Kiểm tra quy tắc ăn quân Đấm-Lá-Kéo và luật 2 quân cùng loại chặn đường nhau...');
assert.strictEqual(game.evaluateCombat('ROCK', 'SCISSORS'), 'WIN', 'Đấm phải ăn được Kéo');
assert.strictEqual(game.evaluateCombat('SCISSORS', 'PAPER'), 'WIN', 'Kéo phải ăn được Lá');
assert.strictEqual(game.evaluateCombat('PAPER', 'ROCK'), 'WIN', 'Lá phải ăn được Đấm');

assert.strictEqual(game.evaluateCombat('ROCK', 'ROCK'), 'CANNOT_CAPTURE_SAME', 'Hai quân Đấm không thể ăn nhau');
assert.strictEqual(game.evaluateCombat('PAPER', 'PAPER'), 'CANNOT_CAPTURE_SAME', 'Hai quân Lá không thể ăn nhau');
assert.strictEqual(game.evaluateCombat('SCISSORS', 'SCISSORS'), 'CANNOT_CAPTURE_SAME', 'Hai quân Kéo không thể ăn nhau');

assert.strictEqual(game.evaluateCombat('ROCK', 'PAPER'), 'LOSE', 'Đấm không thể ăn Lá');
console.log('  ✓ Quy tắc ăn quân và luật cùng loại chặn đường hoạt động chính xác');

// Test 4: Movement in 8 directions
console.log('4. Kiểm tra khả năng di chuyển 8 hướng (như quân vua cờ vua)...');
// Đặt 1 quân ở giữa bàn cờ trống e5 (4, 4)
const testGame = new OTTv2Engine();
testGame.board = Array(9).fill(null).map(() => Array(9).fill(null));
testGame.board[4][4] = { id: 'test_p1', player: 'P1', type: 'ROCK' };
testGame.turn = 'P1';

const movesCenter = testGame.getValidMoves(4, 4);
assert.strictEqual(movesCenter.length, 8, 'Quân ở giữa bàn cờ trống phải đi được đúng 8 hướng');
console.log('  ✓ Quân di chuyển được đầy đủ 8 hướng');

// Test 5: Same-type blocking on board
console.log('5. Kiểm tra trường hợp quân cùng loại của đối phương đứng cạnh -> Chặn đường, không ăn được...');
testGame.board[4][5] = { id: 'test_p2_rock', player: 'P2', type: 'ROCK' }; // Đấm đối phương ở bên phải
testGame.board[4][3] = { id: 'test_p2_scissors', player: 'P2', type: 'SCISSORS' }; // Kéo đối phương ở bên trái

const movesWithOpponent = testGame.getValidMoves(4, 4);
const canMoveToRock = movesWithOpponent.some(m => m.toR === 4 && m.toC === 5);
const canCaptureScissors = movesWithOpponent.some(m => m.toR === 4 && m.toC === 3 && m.action === 'CAPTURE');

assert.strictEqual(canMoveToRock, false, 'Không được phép đi vào ô Đấm của đối phương (bị chặn đường)');
assert.strictEqual(canCaptureScissors, true, 'Phải được phép ăn quân Kéo của đối phương');
console.log('  ✓ Kiểm tra trên bàn cờ: Đấm đối phương chặn đường, Kéo bị ăn thành công');

// Test 6: Win condition by eliminating all pieces of one type
console.log('6. Kiểm tra điều kiện thắng: Ăn sạch 1 loại quân của đối phương...');
const winGame = new OTTv2Engine();
winGame.board = Array(9).fill(null).map(() => Array(9).fill(null));
// P1 có 1 Đấm tại (3, 3)
winGame.board[3][3] = { id: 'p1_rock', player: 'P1', type: 'ROCK' };
// P2 chỉ còn duy nhất 1 quân Kéo tại (3, 4) và các quân khác
winGame.board[3][4] = { id: 'p2_scissors', player: 'P2', type: 'SCISSORS' };
winGame.board[7][7] = { id: 'p2_paper', player: 'P2', type: 'PAPER' };
winGame.board[7][8] = { id: 'p2_rock', player: 'P2', type: 'ROCK' };
winGame.turn = 'P1';

const captureRes = winGame.makeMove(3, 3, 3, 4);
assert.strictEqual(captureRes.success, true);
assert.strictEqual(captureRes.gameOver, true, 'Trò chơi phải kết thúc');
assert.strictEqual(captureRes.winner, 'P1', 'P1 phải thắng');
assert.ok(captureRes.reason.includes('KÉO'), 'Lý do thắng phải ghi rõ ăn sạch quân Kéo');
console.log('  ✓ Điều kiện thắng khi ăn sạch 1 loại quân hoạt động hoàn hảo');

// Test 7: Win condition by reaching enemy base (i9 for P1, a1 for P2)
console.log('7. Kiểm tra điều kiện thắng: Đột kích căn cứ đối phương (i9 cho P1, a1 cho P2)...');
const baseGame = new OTTv2Engine();
baseGame.board = Array(9).fill(null).map(() => Array(9).fill(null));
baseGame.board[7][7] = { id: 'p1_runner', player: 'P1', type: 'PAPER' }; // Tại h8
baseGame.turn = 'P1';

// Đi từ h8 (7, 7) vào i9 (8, 8)
const baseRes = baseGame.makeMove(7, 7, 8, 8);
assert.strictEqual(baseRes.success, true);
assert.strictEqual(baseRes.gameOver, true);
assert.strictEqual(baseRes.winner, 'P1');
assert.ok(baseRes.reason.includes('i9'), 'Lý do thắng phải ghi rõ đột kích căn cứ i9');
console.log('  ✓ Đột kích căn cứ i9 của đối phương giành chiến thắng tức thì');

console.log('===========================================================');
console.log('  TẤT CẢ 7 BÀI TEST GAME ENGINE ĐỀU PASS 100% TUYỆT ĐỐI!');
console.log('===========================================================');
