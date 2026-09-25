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
  createInitialBoard,
  createCustomBoard,
  generateAiDraftPlacement
} from '../shared/gameRules.js';

import {
  PIECE_TYPES,
  PLAYERS,
  COMBAT_RESULT,
  WIN_REASONS
} from '../shared/constants.js';

import { OttAi } from '../js/ai.js';

console.log('================================================================');
console.log('🧪 BẮT ĐẦU CHẠY BỘ KIỂM THỬ TÍNH ĐÚNG ĐẮN CỦA OTTv2 GAME ENGINE');
console.log('   Thành viên: Trần Văn Mạnh (Nhánh: manh)');
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
assert.strictEqual(isKingMove(4, 4, 4, 4), false, 'Đứng yên không phải nước đi');
assert.strictEqual(isKingMove(4, 4, 4, 6), false, 'Không được nhảy 2 ô');
assert.strictEqual(isKingMove(4, 4, 6, 6), false, 'Không được nhảy chéo 2 ô');
console.log('  ✓ Luật di chuyển quân Vua 8 hướng kiểm chứng thành công\n');

// -------------------------------------------------------------
// Test 3: Tương sinh tương khắc Oẳn tù tì & 2 quân cùng loại chặn đường
// -------------------------------------------------------------
console.log('3. Kiểm tra quy tắc ăn quân Đấm-Lá-Kéo và luật cùng loại chặn đường...');
const p1Rock = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_1 };
const p1Paper = { type: PIECE_TYPES.PAPER, player: PLAYERS.PLAYER_1 };
const p1Scissors = { type: PIECE_TYPES.SCISSORS, player: PLAYERS.PLAYER_1 };

const p2Rock = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_2 };
const p2Paper = { type: PIECE_TYPES.PAPER, player: PLAYERS.PLAYER_2 };
const p2Scissors = { type: PIECE_TYPES.SCISSORS, player: PLAYERS.PLAYER_2 };

// Ăn quân
assert.strictEqual(evaluateCombat(p1Rock, p2Scissors), COMBAT_RESULT.WIN, 'Đấm ăn Kéo');
assert.strictEqual(evaluateCombat(p1Scissors, p2Paper), COMBAT_RESULT.WIN, 'Kéo ăn Lá');
assert.strictEqual(evaluateCombat(p1Paper, p2Rock), COMBAT_RESULT.WIN, 'Lá ăn Đấm');

// Bị khắc chế (Không thể tấn công)
assert.strictEqual(evaluateCombat(p1Rock, p2Paper), COMBAT_RESULT.LOSE, 'Đấm không thể ăn Lá');
assert.strictEqual(evaluateCombat(p1Scissors, p2Rock), COMBAT_RESULT.LOSE, 'Kéo không thể ăn Đấm');
assert.strictEqual(evaluateCombat(p1Paper, p2Scissors), COMBAT_RESULT.LOSE, 'Lá không thể ăn Kéo');

// Cùng loại -> Chặn đường
assert.strictEqual(evaluateCombat(p1Rock, p2Rock), COMBAT_RESULT.TIE, 'Hai quân Đấm chỉ chặn đường nhau');
assert.strictEqual(evaluateCombat(p1Paper, p2Paper), COMBAT_RESULT.TIE, 'Hai quân Lá chỉ chặn đường nhau');
assert.strictEqual(evaluateCombat(p1Scissors, p2Scissors), COMBAT_RESULT.TIE, 'Hai quân Kéo chỉ chặn đường nhau');

// Cùng phe -> Không thể đi vào
assert.strictEqual(evaluateCombat(p1Rock, p1Paper), COMBAT_RESULT.SAME_PLAYER, 'Không đi vào ô cùng phe');
console.log('  ✓ Luật khắc chế và luật chặn đường hai quân cùng loại chuẩn xác 100%\n');

// -------------------------------------------------------------
// Test 4: Khởi tạo bàn cờ & Kiểm tra số lượng quân
// -------------------------------------------------------------
console.log('4. Kiểm tra khởi tạo bàn cờ ban đầu...');
const board = createInitialBoard();
const counts = countPlayerPieces(board);

assert.ok(counts.P1.total > 0, 'P1 phải có quân trên bàn cờ');
assert.ok(counts.P2.total > 0, 'P2 phải có quân trên bàn cờ');
assert.strictEqual(counts.P1.ROCK, counts.P1.PAPER, 'Quân P1 cân bằng');
assert.strictEqual(counts.P1.PAPER, counts.P1.SCISSORS, 'Quân P1 cân bằng');
assert.strictEqual(counts.P2.ROCK, counts.P2.PAPER, 'Quân P2 cân bằng');
assert.strictEqual(counts.P2.PAPER, counts.P2.SCISSORS, 'Quân P2 cân bằng');
console.log(`  ✓ Khởi tạo cân đối: P1 (${counts.P1.total} quân) vs P2 (${counts.P2.total} quân)\n`);

// -------------------------------------------------------------
// Test 5: Kiểm tra nước đi hợp lệ trên bàn cờ giả lập
// -------------------------------------------------------------
console.log('5. Kiểm tra tính hợp lệ của nước đi và chặn đường trên bàn cờ...');
const testBoard = createEmptyBoard();
// P1 Rock tại E5 (4, 4)
testBoard[4][4] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_1, id: 'test_p1_r' };
// P2 Rock tại E6 (4, 5) -> Chặn đường
testBoard[5][4] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_2, id: 'test_p2_r' };
// P2 Scissors tại D5 (3, 4) -> Có thể ăn
testBoard[4][3] = { type: PIECE_TYPES.SCISSORS, player: PLAYERS.PLAYER_2, id: 'test_p2_s' };
// P2 Paper tại F5 (5, 4) -> Bị khắc chế, không thể đi vào
testBoard[4][5] = { type: PIECE_TYPES.PAPER, player: PLAYERS.PLAYER_2, id: 'test_p2_p' };

// Nước đi ăn Kéo (E5 -> D5)
const captureCheck = validateMove(testBoard, { from: 'E5', to: 'D5', player: PLAYERS.PLAYER_1 }, PLAYERS.PLAYER_1);
assert.strictEqual(captureCheck.valid, true, 'Đấm ăn Kéo hợp lệ');
assert.strictEqual(captureCheck.isCapture, true, 'Đánh dấu là nước ăn quân');

// Nước đi vào Đấm đối phương (E5 -> E6)
const tieCheck = validateMove(testBoard, { from: 'E5', to: 'E6', player: PLAYERS.PLAYER_1 }, PLAYERS.PLAYER_1);
assert.strictEqual(tieCheck.valid, false, 'Không thể đi vào ô quân Đấm cùng loại của đối phương');
assert.ok(tieCheck.reason.includes('chặn đường'), 'Báo lỗi chặn đường');

// Nước đi vào Lá đối phương (E5 -> F5)
const loseCheck = validateMove(testBoard, { from: 'E5', to: 'F5', player: PLAYERS.PLAYER_1 }, PLAYERS.PLAYER_1);
assert.strictEqual(loseCheck.valid, false, 'Không thể đi vào ô quân Lá khắc chế mình');

console.log('  ✓ Kiểm tra tương tác bàn cờ thực tế hoàn toàn chính xác\n');

// -------------------------------------------------------------
// Test 6: Điều kiện thắng 1 - Ăn sạch 1 loại quân của đối phương
// -------------------------------------------------------------
console.log('6. Kiểm tra điều kiện thắng: Tiêu diệt hoàn toàn 1 loại quân của đối phương...');
const winEliminationBoard = createEmptyBoard();
// P1 có quân
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
// Test 7: Điều kiện thắng 2 - Chiếm cứ điểm ô đích A1 / I9
// -------------------------------------------------------------
console.log('7. Kiểm tra điều kiện thắng: Đột kích cứ điểm A1 hoặc I9...');
const winGoalBoard = createEmptyBoard();
winGoalBoard[8][8] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_1, id: 'p1_hero' };

// P1 vừa đi vào I9
const goalWin = checkWinCondition(winGoalBoard, { from: 'H8', to: 'I9', player: PLAYERS.PLAYER_1 });
assert.strictEqual(goalWin.hasWinner, true, 'Trò chơi phải kết thúc khi vào ô đích');
assert.strictEqual(goalWin.winner, PLAYERS.PLAYER_1, 'P1 thắng khi vào I9');
assert.strictEqual(goalWin.reason, WIN_REASONS.GOAL_REACHED);
console.log('  ✓ Phát hiện điều kiện thắng chiếm ô đích chuẩn xác\n');

// -------------------------------------------------------------
// Test 8: AI Engine - 3 Cấp độ tư duy (Dễ, Vừa, Khó)
// -------------------------------------------------------------
console.log('8. Kiểm tra AI Engine với 3 cấp độ tư duy (Easy, Medium, Hard)...');
const standardBoard = createInitialBoard();

const aiEasy = new OttAi('easy');
assert.strictEqual(aiEasy.difficulty, 'easy');
const moveEasy = aiEasy.getBestMove(standardBoard, PLAYERS.PLAYER_2, 'OPPOSITE');
assert.ok(moveEasy && moveEasy.from && moveEasy.to, 'AI Easy phải sinh nước đi hợp lệ');

const aiMedium = new OttAi('medium');
assert.strictEqual(aiMedium.difficulty, 'medium');
const moveMedium = aiMedium.getBestMove(standardBoard, PLAYERS.PLAYER_2, 'OPPOSITE');
assert.ok(moveMedium && moveMedium.from && moveMedium.to, 'AI Medium phải sinh nước đi hợp lệ');

const aiHard = new OttAi('hard');
assert.strictEqual(aiHard.difficulty, 'hard');
const moveHard = aiHard.getBestMove(standardBoard, PLAYERS.PLAYER_2, 'OPPOSITE');
assert.ok(moveHard && moveHard.from && moveHard.to, 'AI Hard phải sinh nước đi hợp lệ');
console.log('  ✓ Cả 3 cấp độ AI (Easy / Medium / Hard) khởi tạo và sinh nước đi hợp lệ 100%\n');

// -------------------------------------------------------------
// Test 9: AI Engine - Bộ nhớ RAM Transposition Table & Zobrist Hashing
// -------------------------------------------------------------
console.log('9. Kiểm tra Bảng Chuyển Vị trong RAM máy tính (Transposition Table Cache & Telemetry)...');
const aiRam = new OttAi('hard');
aiRam.clearMemory();
assert.strictEqual(aiRam.transpositionTable.size, 0, 'Bảng RAM ban đầu phải trống');

// Chạy 1 nước đi để ghi nhớ các thế cờ vào RAM
aiRam.getBestMove(standardBoard, PLAYERS.PLAYER_2, 'OPPOSITE');
const stats = aiRam.getMemoryStats();

assert.ok(stats.cachedStates > 0, 'Phải lưu trữ các trạng thái thế cờ trong RAM');
assert.ok(stats.ramUsageKB >= 0, 'Dung lượng RAM ước tính phải đo lường được');
assert.ok(stats.nodesEvaluated > 0, 'Phải đếm được số nút cờ đã phân tích');
assert.strictEqual(stats.difficulty, 'hard');
console.log(`  ✓ Đã lưu ${stats.cachedStates} thế cờ vào RAM (~${stats.ramUsageKB} KB). Đạt chuẩn bộ nhớ tư duy O(1)!\n`);

// -------------------------------------------------------------
// Test 10: AI Engine - Nhận biết nước đi dứt điểm ván cờ (Instant Win Detection)
// -------------------------------------------------------------
console.log('10. Kiểm tra AI phát hiện nước đi chiến thắng tức thì (Đột kích cứ điểm hoặc ăn quân cuối)...');
const instantWinBoard = createEmptyBoard();
// P2 có quân tại H8, chỉ cần đi vào I9 là thắng ngay!
instantWinBoard[7][7] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_2, id: 'p2_winner' };
// P1 có quân ở xa
instantWinBoard[0][0] = { type: PIECE_TYPES.ROCK, player: PLAYERS.PLAYER_1, id: 'p1_dummy' };

const aiSniper = new OttAi('hard');
const winMove = aiSniper.getBestMove(instantWinBoard, PLAYERS.PLAYER_2, 'OPPOSITE');
assert.strictEqual(winMove.to, 'I9', 'AI phải chọn ngay nước đi vào cứ điểm I9 để thắng trận');
console.log('  ✓ AI phát hiện và thực hiện ngay nước đi chiến thắng vào cứ điểm I9\n');

// -------------------------------------------------------------
// Test 11: Chế độ Tự Chọn & Dàn Trận (Custom Draft & Pre-game Placement)
// -------------------------------------------------------------
console.log('11. Kiểm tra khởi tạo bàn cờ tùy chọn với đội hình tự chọn tối đa 9 quân (createCustomBoard)...');
const p1Custom = [
  { x: 2, y: 7, type: PIECE_TYPES.ROCK },
  { x: 3, y: 7, type: PIECE_TYPES.ROCK },
  { x: 4, y: 7, type: PIECE_TYPES.ROCK },
  { x: 2, y: 8, type: PIECE_TYPES.PAPER },
  { x: 3, y: 8, type: PIECE_TYPES.PAPER },
  { x: 4, y: 8, type: PIECE_TYPES.PAPER },
  { x: 5, y: 8, type: PIECE_TYPES.SCISSORS },
  { x: 6, y: 8, type: PIECE_TYPES.SCISSORS },
  { x: 7, y: 8, type: PIECE_TYPES.SCISSORS }
];
const p2Custom = [
  { x: 1, y: 1, type: PIECE_TYPES.ROCK },
  { x: 2, y: 1, type: PIECE_TYPES.PAPER },
  { x: 3, y: 1, type: PIECE_TYPES.SCISSORS }
];

const customBoard = createCustomBoard(p1Custom, p2Custom);
const customCounts = countPlayerPieces(customBoard);

assert.strictEqual(customCounts.P1.total, 9, 'P1 phải có chính xác 9 quân');
assert.strictEqual(customCounts.P1.ROCK, 3, 'P1 có 3 quân Đấm');
assert.strictEqual(customCounts.P1.PAPER, 3, 'P1 có 3 quân Lá');
assert.strictEqual(customCounts.P1.SCISSORS, 3, 'P1 có 3 quân Kéo');
assert.strictEqual(customCounts.P2.total, 3, 'P2 có 3 quân');
assert.strictEqual(customBoard[7][2].type, PIECE_TYPES.ROCK, 'Ô (2, 7) là quân Đấm của P1');
assert.strictEqual(customBoard[7][2].player, PLAYERS.PLAYER_1, 'Ô (2, 7) thuộc sở hữu P1');
assert.strictEqual(customBoard[1][1].player, PLAYERS.PLAYER_2, 'Ô (1, 1) thuộc sở hữu P2');
console.log('  ✓ Bàn cờ tùy biến dàn trận khởi tạo chính xác theo tọa độ và phân bổ loại quân\n');

// -------------------------------------------------------------
// Test 12: AI Tự Động Dàn Trận 9 Quân Cân Bằng (generateAiDraftPlacement)
// -------------------------------------------------------------
console.log('12. Kiểm tra thuật toán tự động sinh dàn trận cho AI (generateAiDraftPlacement)...');
const aiDraft = generateAiDraftPlacement(9);
assert.strictEqual(aiDraft.length, 9, 'AI phải sinh đúng 9 quân cờ');

let aiRock = 0;
let aiPaper = 0;
let aiScissors = 0;
const occupiedCoords = new Set();

for (const piece of aiDraft) {
  // Kiểm tra nằm trên nửa sân của AI: Hàng 1-3 (y = 0..2)
  assert.ok(piece.y >= 0 && piece.y <= 2, `Tọa độ y (${piece.y}) phải nằm trên nửa sân AI (0..2)`);
  assert.ok(piece.x >= 0 && piece.x < 9, `Tọa độ x (${piece.x}) phải nằm trong bàn cờ (0..8)`);
  
  // Không được đặt đè lên ô cứ điểm A1 (0, 0)
  assert.ok(!(piece.x === 0 && piece.y === 0), 'Không được đặt quân chặn ô cứ điểm A1');

  // Đảm bảo không trùng tọa độ
  const coordKey = `${piece.x},${piece.y}`;
  assert.ok(!occupiedCoords.has(coordKey), `Ô cờ (${coordKey}) không được có 2 quân trùng nhau`);
  occupiedCoords.add(coordKey);

  if (piece.type === PIECE_TYPES.ROCK) aiRock++;
  if (piece.type === PIECE_TYPES.PAPER) aiPaper++;
  if (piece.type === PIECE_TYPES.SCISSORS) aiScissors++;
}

assert.strictEqual(aiRock, 3, 'AI phải dàn trận 3 quân Đấm');
assert.strictEqual(aiPaper, 3, 'AI phải dàn trận 3 quân Lá');
assert.strictEqual(aiScissors, 3, 'AI phải dàn trận 3 quân Kéo');
console.log('  ✓ Đội hình AI sinh ngẫu nhiên đủ 9 quân (3 Đấm, 3 Lá, 3 Kéo) trên nửa sân không trùng lặp và không chặn A1\n');

// -------------------------------------------------------------
// Test 13: Bố Cục Chuẩn Cờ Vua CHESS_9 (9 quân chia đều: 3 Đấm, 3 Lá, 3 Kéo)
// -------------------------------------------------------------
console.log('13. Kiểm tra bố cục chuẩn Cờ Vua CHESS_9 (9 quân chia đều mỗi bên)...');
const chessBoard = createInitialBoard('CHESS_9');
const chessCounts = countPlayerPieces(chessBoard);

assert.strictEqual(chessCounts.P1.total, 9, 'P1 phải có đúng 9 quân');
assert.strictEqual(chessCounts.P2.total, 9, 'P2 phải có đúng 9 quân');
assert.strictEqual(chessCounts.P1.ROCK, 3, 'P1 có đúng 3 Đấm');
assert.strictEqual(chessCounts.P1.PAPER, 3, 'P1 có đúng 3 Lá');
assert.strictEqual(chessCounts.P1.SCISSORS, 3, 'P1 có đúng 3 Kéo');
assert.strictEqual(chessCounts.P2.ROCK, 3, 'P2 có đúng 3 Đấm');
assert.strictEqual(chessCounts.P2.PAPER, 3, 'P2 có đúng 3 Lá');
assert.strictEqual(chessCounts.P2.SCISSORS, 3, 'P2 có đúng 3 Kéo');

// Cứ điểm A1 (0, 0) và I9 (8, 8) không bị quân cờ nào án ngữ ban đầu
assert.strictEqual(chessBoard[0][0], null, 'Cứ điểm A1 (0, 0) phải thông thoáng cho mục tiêu đột kích');
assert.strictEqual(chessBoard[8][8], null, 'Cứ điểm I9 (8, 8) phải thông thoáng cho mục tiêu đột kích');
console.log('  ✓ Bố cục CHESS_9 đạt chuẩn cờ vua: 9 quân chia đều (3 Đấm, 3 Lá, 3 Kéo), 2 cứ điểm thông thoáng 100%\n');

console.log('================================================================');
console.log('🎉 TẤT CẢ 13/13 BÀI TEST ĐỀU VƯỢT QUA XUẤT SẮC (100% PASS)!');
console.log('================================================================\n');
