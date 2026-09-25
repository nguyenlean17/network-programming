/**
 * ========================================================
 * OẲN TÙ TÌ v2 (OTTv2) - PHIÊN BẢN CẢI TIẾN
 * - 2 Ô đích cố định: a9 và i1 (Tuyệt đối không spawn quân ở đó)
 * - Hệ thống POOL nhiều kiểu bố trí quân khởi đầu cân bằng
 * - 3 loại quân: Kéo (✌️), Búa (✊), Bao (✋)
 * - Quy tắc ăn quân Oẳn Tù Tì: Kéo > Bao > Búa > Kéo
 * - Đối xứng hoàn hảo qua đường chéo chính a1 -> i9
 * ========================================================
 */

// Bảng chữ cái đại diện cho 9 cột từ a đến i
const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const BOARD_SIZE = 9;

// Tọa độ 2 ô đích cố định
const GOAL_A9 = { row: 8, col: 0 }; // a9 (Góc dưới - trái)
const GOAL_I1 = { row: 0, col: 8 }; // i1 (Góc trên - phải)

// 8 hướng di chuyển xung quanh 1 ô (King move)
const DIRECTIONS = [
  [-1, -1], [-1,  0], [-1,  1],
  [ 0, -1],           [ 0,  1],
  [ 1, -1], [ 1,  0], [ 1,  1]
];

// Cấu hình 3 loại quân Oẳn tù tì và quy luật khắc chế
const PIECE_CONFIG = {
  scissors: {
    key: 'scissors',
    name: 'Kéo',
    symbol: '✌️',
    beats: 'paper',
    beatsText: 'Kéo cắt Bao'
  },
  rock: {
    key: 'rock',
    name: 'Búa',
    symbol: '✊',
    beats: 'scissors',
    beatsText: 'Búa đập Kéo'
  },
  paper: {
    key: 'paper',
    name: 'Bao',
    symbol: '✋',
    beats: 'rock',
    beatsText: 'Bao bọc Búa'
  }
};

/**
 * POOL CÁC KIỂU BỐ TRÍ BAN ĐẦU (4 KIỂU CHIẾN THUẬT)
 * Tất cả các kiểu đều thỏa mãn:
 * - 12 quân P1 (4 Kéo, 4 Búa, 4 Bao) nằm dưới đường chéo chính (row > col).
 * - Tuyệt đối không spawn trên a9 (8, 0) và i1 (0, 8).
 * - Player 2 được sinh đối xứng hoàn hảo (col, row) cùng loại quân.
 */
const POOL_LAYOUTS = [
  {
    id: 'central_fortress',
    name: 'Pháo Đài Trung Tâm',
    desc: 'Tập trung ở khu vực trung lộ, cơ động tỏa ra 8 hướng',
    pieces: [
      { row: 3, col: 1, type: 'rock' },     // b4: Búa
      { row: 3, col: 2, type: 'scissors' }, // c4: Kéo
      { row: 4, col: 1, type: 'paper' },    // b5: Bao
      { row: 4, col: 2, type: 'rock' },     // c5: Búa
      { row: 4, col: 3, type: 'scissors' }, // d5: Kéo
      { row: 5, col: 1, type: 'scissors' }, // b6: Kéo
      { row: 5, col: 2, type: 'paper' },    // c6: Bao
      { row: 5, col: 3, type: 'rock' },     // d6: Búa
      { row: 5, col: 4, type: 'paper' },    // e6: Bao
      { row: 6, col: 2, type: 'rock' },     // c7: Búa
      { row: 6, col: 3, type: 'paper' },    // d7: Bao
      { row: 6, col: 4, type: 'scissors' }  // e7: Kéo
    ]
  },
  {
    id: 'southwest_flank',
    name: 'Tiền Tuyến Tây Nam',
    desc: 'Bố trí ở cánh Tây Nam, che chắn cẩn mật nhưng ô a9 hoàn toàn trống',
    pieces: [
      { row: 5, col: 2, type: 'rock' },     // c6: Búa
      { row: 5, col: 3, type: 'scissors' }, // d6: Kéo
      { row: 6, col: 1, type: 'paper' },    // b7: Bao
      { row: 6, col: 2, type: 'rock' },     // c7: Búa
      { row: 6, col: 3, type: 'paper' },    // d7: Bao
      { row: 7, col: 0, type: 'scissors' }, // a8: Kéo
      { row: 7, col: 1, type: 'paper' },    // b8: Bao
      { row: 7, col: 2, type: 'rock' },     // c8: Búa
      { row: 7, col: 3, type: 'scissors' }, // d8: Kéo
      { row: 8, col: 1, type: 'rock' },     // b9: Búa
      { row: 8, col: 2, type: 'scissors' }, // c9: Kéo
      { row: 8, col: 3, type: 'paper' }     // d9: Bao
    ]
  },
  {
    id: 'tactical_pincer',
    name: 'Gọng Kìm Chiến Thuật',
    desc: 'Chia thành 2 cánh bao vây, tạo không gian cơ động rộng mở',
    pieces: [
      { row: 2, col: 0, type: 'scissors' }, // a3: Kéo
      { row: 3, col: 0, type: 'rock' },     // a4: Búa
      { row: 3, col: 1, type: 'paper' },    // b4: Bao
      { row: 4, col: 0, type: 'paper' },    // a5: Bao
      { row: 4, col: 1, type: 'scissors' }, // b5: Kéo
      { row: 4, col: 2, type: 'rock' },     // c5: Búa
      { row: 6, col: 3, type: 'scissors' }, // d7: Kéo
      { row: 6, col: 4, type: 'rock' },     // e7: Búa
      { row: 7, col: 4, type: 'paper' },    // e8: Bao
      { row: 7, col: 5, type: 'rock' },     // f8: Búa
      { row: 8, col: 4, type: 'scissors' }, // e9: Kéo
      { row: 8, col: 5, type: 'paper' }     // f9: Bao
    ]
  },
  {
    id: 'defensive_wall',
    name: 'Bức Tường Bọc Lót',
    desc: 'Bức tường phòng ngự chéo kiên cố, sẵn sàng phản công',
    pieces: [
      { row: 4, col: 0, type: 'rock' },     // a5: Búa
      { row: 4, col: 1, type: 'paper' },    // b5: Bao
      { row: 4, col: 2, type: 'scissors' }, // c5: Kéo
      { row: 5, col: 0, type: 'paper' },    // a6: Bao
      { row: 5, col: 1, type: 'rock' },     // b6: Búa
      { row: 5, col: 2, type: 'scissors' }, // c6: Kéo
      { row: 5, col: 3, type: 'paper' },    // d6: Bao
      { row: 6, col: 1, type: 'scissors' }, // b7: Kéo
      { row: 6, col: 2, type: 'rock' },     // c7: Búa
      { row: 6, col: 3, type: 'scissors' }, // d7: Kéo
      { row: 7, col: 2, type: 'paper' },    // c8: Bao
      { row: 7, col: 3, type: 'rock' }      // d8: Búa
    ]
  }
];

/**
 * Kiểm tra xem quân tấn công có ăn được quân phòng thủ theo luật Oẳn tù tì không
 */
function canCapture(attackerType, defenderType) {
  if (!attackerType || !defenderType) return false;
  return PIECE_CONFIG[attackerType].beats === defenderType;
}

/**
 * Trạng thái trò chơi toàn cục (Game State)
 */
const gameState = {
  board: [],               // Mảng 2 chiều 9x9 lưu quân cờ
  currentTurn: 1,          // 1: Player 1, 2: Player 2
  pieceCounts: {
    1: { total: 12, scissors: 4, rock: 4, paper: 4 },
    2: { total: 12, scissors: 4, rock: 4, paper: 4 }
  },
  selectedSquare: null,    // { row, col } đang được chọn
  validMoves: [],          // Danh sách ô có thể đi
  isGameOver: false,       // Kết thúc ván chưa
  winner: null,            // 1 | 2 | null
  winReason: '',           // Lý do chiến thắng
  totalMoves: 0,           // Số nước đi
  lastMove: null,          // Nước đi cuối

  // Cấu hình pool và ô đích
  currentLayout: null,
  selectedLayoutOption: 'random', // 'random' hoặc layout id
  goalMode: 'p1_a9_p2_i1'         // 'p1_a9_p2_i1' hoặc 'p1_i1_p2_a9'
};

/**
 * Lấy tọa độ ô đích hiện tại của từng người chơi
 */
function getPlayerGoal(player) {
  if (gameState.goalMode === 'p1_a9_p2_i1') {
    return player === 1 ? GOAL_A9 : GOAL_I1;
  } else {
    return player === 1 ? GOAL_I1 : GOAL_A9;
  }
}

function getGoalCoordName(player) {
  const g = getPlayerGoal(player);
  return toCoord(g.row, g.col);
}

/**
 * Hiệu ứng âm thanh bằng Web Audio API
 */
class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.15) {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Bỏ qua lỗi audio
    }
  }

  move() { this.playTone(480, 'sine', 0.08, 0.1); }
  select() { this.playTone(600, 'triangle', 0.05, 0.08); }
  capture() {
    this.playTone(320, 'square', 0.15, 0.22);
    setTimeout(() => this.playTone(220, 'sawtooth', 0.2, 0.2), 60);
  }
  win() {
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'triangle', 0.3, 0.25), i * 140);
    });
  }
}

const sounds = new SoundEffects();

/**
 * Chuyển đổi tọa độ (row, col) thành chuỗi cờ
 */
function toCoord(row, col) {
  return `${COLS[col]}${row + 1}`;
}

/**
 * Khởi tạo bàn cờ 9x9 rỗng
 */
function initializeBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  gameState.board = [];

  const p1Goal = getPlayerGoal(1);
  const p2Goal = getPlayerGoal(2);

  for (let r = 0; r < BOARD_SIZE; r++) {
    const rowArray = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      rowArray.push(null);

      const cellEl = document.createElement('div');
      cellEl.classList.add('cell');
      cellEl.dataset.row = r;
      cellEl.dataset.col = c;
      cellEl.id = `cell-${r}-${c}`;

      if ((r + c) % 2 === 0) {
        cellEl.classList.add('light');
      } else {
        cellEl.classList.add('dark');
      }

      // Đánh dấu đường chéo chính a1 -> i9 (r === c)
      if (r === c) {
        cellEl.classList.add('on-main-diagonal');
      }

      // Đánh dấu 2 ô đích cố định a9 và i1
      if (r === GOAL_A9.row && c === GOAL_A9.col) {
        cellEl.classList.add('goal-a9');
        cellEl.classList.add(p1Goal.row === 8 && p1Goal.col === 0 ? 'goal-p1' : 'goal-p2');
        cellEl.title = `Ô đích a9 (${p1Goal.row === 8 && p1Goal.col === 0 ? 'Player 1' : 'Player 2'})`;
      } else if (r === GOAL_I1.row && c === GOAL_I1.col) {
        cellEl.classList.add('goal-i1');
        cellEl.classList.add(p2Goal.row === 0 && p2Goal.col === 8 ? 'goal-p2' : 'goal-p1');
        cellEl.title = `Ô đích i1 (${p2Goal.row === 0 && p2Goal.col === 8 ? 'Player 2' : 'Player 1'})`;
      }

      cellEl.addEventListener('click', () => handleCellClick(r, c));
      boardEl.appendChild(cellEl);
    }
    gameState.board.push(rowArray);
  }
}

/**
 * Chọn kiểu bố trí từ POOL và sinh quân cờ
 */
function createPieces() {
  // Chọn layout từ pool
  let selectedLayout;
  if (gameState.selectedLayoutOption === 'random') {
    // Chọn ngẫu nhiên 1 layout trong pool
    const randIdx = Math.floor(Math.random() * POOL_LAYOUTS.length);
    selectedLayout = POOL_LAYOUTS[randIdx];
  } else {
    selectedLayout = POOL_LAYOUTS.find(l => l.id === gameState.selectedLayoutOption) || POOL_LAYOUTS[0];
  }

  gameState.currentLayout = selectedLayout;

  // Cập nhật tên đội hình đang chơi trên giao diện
  const layoutTag = document.getElementById('active-layout-name');
  if (layoutTag) {
    layoutTag.textContent = selectedLayout.name;
    layoutTag.title = selectedLayout.desc;
  }

  // 1. Tạo 12 quân cho Player 1 từ layout
  selectedLayout.pieces.forEach((p, idx) => {
    gameState.board[p.row][p.col] = {
      player: 1,
      type: p.type,
      id: `p1-${p.type}-${idx + 1}`
    };
  });

  // 2. Tạo 12 quân đối xứng hoàn hảo qua đường chéo chính cho Player 2
  selectedLayout.pieces.forEach((p, idx) => {
    const p2Row = p.col;
    const p2Col = p.row;
    gameState.board[p2Row][p2Col] = {
      player: 2,
      type: p.type,
      id: `p2-${p.type}-${idx + 1}`
    };
  });

  // Khởi tạo bộ đếm quân
  gameState.pieceCounts = {
    1: { total: 12, scissors: 4, rock: 4, paper: 4 },
    2: { total: 12, scissors: 4, rock: 4, paper: 4 }
  };
}

/**
 * Vẽ lại toàn bộ quân cờ, highlight và cập nhật thông số lên giao diện
 */
function renderBoard() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cellEl = document.getElementById(`cell-${r}-${c}`);
      if (!cellEl) continue;

      cellEl.classList.remove('selected', 'valid-move', 'valid-capture', 'selectable', 'last-move-from', 'last-move-to');

      if (gameState.lastMove) {
        if (gameState.lastMove.from.row === r && gameState.lastMove.from.col === c) {
          cellEl.classList.add('last-move-from');
        }
        if (gameState.lastMove.to.row === r && gameState.lastMove.to.col === c) {
          cellEl.classList.add('last-move-to');
        }
      }

      const pieceData = gameState.board[r][c];
      const existingPiece = cellEl.querySelector('.piece');

      if (pieceData) {
        const config = PIECE_CONFIG[pieceData.type];
        const pClass = pieceData.player === 1 ? 'p1-piece' : 'p2-piece';

        if (!existingPiece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = `piece ${pClass}`;
          pieceEl.innerHTML = `
            <span class="piece-symbol">${config.symbol}</span>
            <span class="piece-tag">P${pieceData.player}</span>
          `;
          pieceEl.title = `Player ${pieceData.player} - ${config.name} (${config.symbol})`;
          cellEl.appendChild(pieceEl);
        } else {
          existingPiece.className = `piece ${pClass}`;
          existingPiece.innerHTML = `
            <span class="piece-symbol">${config.symbol}</span>
            <span class="piece-tag">P${pieceData.player}</span>
          `;
          existingPiece.title = `Player ${pieceData.player} - ${config.name} (${config.symbol})`;
        }

        if (!gameState.isGameOver && pieceData.player === gameState.currentTurn) {
          cellEl.classList.add('selectable');
        }
      } else {
        if (existingPiece) {
          cellEl.removeChild(existingPiece);
        }
      }
    }
  }

  // Highlight quân đang được chọn
  if (gameState.selectedSquare) {
    const selCell = document.getElementById(`cell-${gameState.selectedSquare.row}-${gameState.selectedSquare.col}`);
    if (selCell) selCell.classList.add('selected');

    // Highlight các ô có thể đi tới
    gameState.validMoves.forEach(m => {
      const targetCell = document.getElementById(`cell-${m.row}-${m.col}`);
      if (!targetCell) return;

      if (m.isCapture) {
        targetCell.classList.add('valid-capture');
      } else {
        targetCell.classList.add('valid-move');
      }
    });
  }

  updateStatsUI();
  updateTurnUI();
}

/**
 * Cập nhật bảng thống kê số lượng quân
 */
function updateStatsUI() {
  const p1 = gameState.pieceCounts[1];
  document.getElementById('p1-count').textContent = p1.total;
  document.getElementById('p1-scissors').textContent = p1.scissors;
  document.getElementById('p1-rock').textContent = p1.rock;
  document.getElementById('p1-paper').textContent = p1.paper;

  togglePillZero('p1-scissors', p1.scissors);
  togglePillZero('p1-rock', p1.rock);
  togglePillZero('p1-paper', p1.paper);

  const p2 = gameState.pieceCounts[2];
  document.getElementById('p2-count').textContent = p2.total;
  document.getElementById('p2-scissors').textContent = p2.scissors;
  document.getElementById('p2-rock').textContent = p2.rock;
  document.getElementById('p2-paper').textContent = p2.paper;

  togglePillZero('p2-scissors', p2.scissors);
  togglePillZero('p2-rock', p2.rock);
  togglePillZero('p2-paper', p2.paper);

  // Cập nhật nhãn ô đích
  const p1GoalName = getGoalCoordName(1);
  const p2GoalName = getGoalCoordName(2);

  const p1GoalEl = document.getElementById('p1-goal-text');
  if (p1GoalEl) p1GoalEl.textContent = p1GoalName;

  const p2GoalEl = document.getElementById('p2-goal-text');
  if (p2GoalEl) p2GoalEl.textContent = p2GoalName;

  const legP1 = document.getElementById('legend-p1-goal');
  if (legP1) legP1.textContent = p1GoalName;

  const legP2 = document.getElementById('legend-p2-goal');
  if (legP2) legP2.textContent = p2GoalName;
}

function togglePillZero(elementId, count) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const pill = el.closest('.type-pill');
  if (pill) {
    if (count <= 0) {
      pill.classList.add('zero');
    } else {
      pill.classList.remove('zero');
    }
  }
}

/**
 * Cập nhật giao diện lượt người chơi
 */
function updateTurnUI() {
  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const turnDisplay = document.getElementById('turn-display');
  const turnText = document.getElementById('turn-text');

  if (gameState.currentTurn === 1) {
    p1Card.classList.add('active-turn');
    p2Card.classList.remove('active-turn');
    turnDisplay.className = 'current-turn-badge turn-p1';
    turnText.textContent = 'Player 1';
  } else {
    p2Card.classList.add('active-turn');
    p1Card.classList.remove('active-turn');
    turnDisplay.className = 'current-turn-badge turn-p2';
    turnText.textContent = 'Player 2';
  }
}

/**
 * Đặt thông báo trạng thái
 */
function setStatusMessage(msg) {
  const msgEl = document.getElementById('status-message');
  if (msgEl) msgEl.textContent = msg;
}

/**
 * Tính toán danh sách các nước đi hợp lệ cho quân cờ tại (r, c)
 */
function getValidMoves(r, c) {
  const piece = gameState.board[r][c];
  if (!piece) return [];

  const moves = [];

  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;

    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
      continue;
    }

    const targetPiece = gameState.board[nr][nc];

    // Ô trống: Đi được
    if (!targetPiece) {
      moves.push({
        row: nr,
        col: nc,
        isCapture: false,
        capturedType: null
      });
      continue;
    }

    // Quân cùng phe: Chặn đường nhau
    if (targetPiece.player === piece.player) {
      continue;
    }

    // Quân đối phương: Chỉ ăn được nếu thắng theo luật Oẳn Tù Tì
    if (canCapture(piece.type, targetPiece.type)) {
      moves.push({
        row: nr,
        col: nc,
        isCapture: true,
        capturedType: targetPiece.type
      });
    }
  }

  return moves;
}

/**
 * Chọn quân cờ của người chơi hiện tại
 */
function selectPiece(r, c) {
  const piece = gameState.board[r][c];

  if (!piece || piece.player !== gameState.currentTurn) {
    return;
  }

  gameState.selectedSquare = { row: r, col: c };
  gameState.validMoves = getValidMoves(r, c);

  sounds.select();

  const coord = toCoord(r, c);
  const cfg = PIECE_CONFIG[piece.type];
  const captureCount = gameState.validMoves.filter(m => m.isCapture).length;

  let msg = `Đã chọn ${cfg.name} ${cfg.symbol} tại ${coord}. Có ${gameState.validMoves.length} ô có thể đi`;
  if (captureCount > 0) {
    msg += ` (${captureCount} ô có thể ăn đối phương)`;
  }
  msg += '.';

  setStatusMessage(msg);
  renderBoard();
}

/**
 * Bỏ chọn quân
 */
function clearSelection() {
  gameState.selectedSquare = null;
  gameState.validMoves = [];
  renderBoard();
}

/**
 * Ăn quân đối phương
 */
function capturePiece(r, c) {
  const targetPiece = gameState.board[r][c];
  if (!targetPiece) return null;

  const capturedPlayer = targetPiece.player;
  const capturedType = targetPiece.type;

  gameState.pieceCounts[capturedPlayer][capturedType]--;
  gameState.pieceCounts[capturedPlayer].total--;

  sounds.capture();
  return targetPiece;
}

/**
 * Di chuyển quân cờ
 */
function movePiece(fromR, fromC, toR, toC) {
  const movingPiece = gameState.board[fromR][fromC];
  if (!movingPiece) return false;

  const fromCoord = toCoord(fromR, fromC);
  const toCoordStr = toCoord(toR, toC);
  const isCapture = gameState.board[toR][toC] !== null;

  let capturedPiece = null;
  if (isCapture) {
    capturedPiece = capturePiece(toR, toC);
  }

  gameState.board[toR][toC] = movingPiece;
  gameState.board[fromR][fromC] = null;

  gameState.lastMove = {
    from: { row: fromR, col: fromC },
    to: { row: toR, col: toC }
  };
  gameState.totalMoves++;

  addMoveLog({
    turnNum: gameState.totalMoves,
    player: movingPiece.player,
    pieceType: movingPiece.type,
    from: fromCoord,
    to: toCoordStr,
    isCapture: isCapture,
    capturedType: capturedPiece ? capturedPiece.type : null,
    capturedPlayer: capturedPiece ? capturedPiece.player : null
  });

  sounds.move();

  const winResult = checkWinCondition(movingPiece.player, toR, toC);

  if (winResult.gameOver) {
    handleGameOver(winResult.winner, winResult.reason);
  } else {
    switchTurn();
    clearSelection();
  }

  renderBoard();
  return true;
}

/**
 * Kiểm tra các điều kiện thắng:
 * 1. Đưa quân vào ô đích quy định (a9 hoặc i1)
 * 2. Ăn hết một loại quân đối phương (Kéo/Búa/Bao) hoặc hết sạch 12 quân
 */
function checkWinCondition(movingPlayer, targetRow, targetCol) {
  const opponent = movingPlayer === 1 ? 2 : 1;
  const oppCounts = gameState.pieceCounts[opponent];
  const myGoal = getPlayerGoal(movingPlayer);

  // 1. Kiểm tra đưa quân vào đúng ô đích của người chơi
  if (targetRow === myGoal.row && targetCol === myGoal.col) {
    const goalName = toCoord(myGoal.row, myGoal.col);
    return {
      gameOver: true,
      winner: movingPlayer,
      reason: `Player ${movingPlayer} đã đưa quân vào ô đích ${goalName} thành công!`
    };
  }

  // 2. Kiểm tra ăn hết một loại quân của đối phương
  if (oppCounts.scissors <= 0) {
    return {
      gameOver: true,
      winner: movingPlayer,
      reason: `Player ${movingPlayer} đã tiêu diệt toàn bộ quân KÉO ✌️ của Player ${opponent}!`
    };
  }

  if (oppCounts.rock <= 0) {
    return {
      gameOver: true,
      winner: movingPlayer,
      reason: `Player ${movingPlayer} đã tiêu diệt toàn bộ quân BÚA ✊ của Player ${opponent}!`
    };
  }

  if (oppCounts.paper <= 0) {
    return {
      gameOver: true,
      winner: movingPlayer,
      reason: `Player ${movingPlayer} đã tiêu diệt toàn bộ quân BAO ✋ của Player ${opponent}!`
    };
  }

  if (oppCounts.total <= 0) {
    return {
      gameOver: true,
      winner: movingPlayer,
      reason: `Player ${movingPlayer} đã tiêu diệt toàn bộ 12 quân của đối phương!`
    };
  }

  return { gameOver: false, winner: null, reason: '' };
}

/**
 * Chuyển lượt luân phiên
 */
function switchTurn() {
  gameState.currentTurn = gameState.currentTurn === 1 ? 2 : 1;
  const nextPlayer = `Player ${gameState.currentTurn}`;
  setStatusMessage(`Lượt của ${nextPlayer}. Hãy chọn một quân để di chuyển.`);
}

/**
 * Xử lý khi kết thúc game
 */
function handleGameOver(winner, reason) {
  gameState.isGameOver = true;
  gameState.winner = winner;
  gameState.winReason = reason;

  clearSelection();
  sounds.win();

  document.getElementById('modal-winner-title').textContent = `🏆 PLAYER ${winner} CHIẾN THẮNG!`;
  document.getElementById('modal-winner-reason').textContent = reason;
  document.getElementById('modal-total-moves').textContent = gameState.totalMoves;
  document.getElementById('modal-p1-left').textContent = gameState.pieceCounts[1].total;
  document.getElementById('modal-p2-left').textContent = gameState.pieceCounts[2].total;

  addWinLog(winner, reason);

  setTimeout(() => {
    document.getElementById('win-modal').classList.remove('hidden');
  }, 450);

  setStatusMessage(`TRÒ CHƠI KẾT THÚC: Player ${winner} chiến thắng!`);
}

/**
 * Xử lý sự kiện click ô cờ
 */
function handleCellClick(r, c) {
  if (gameState.isGameOver) return;

  const clickedPiece = gameState.board[r][c];

  if (gameState.selectedSquare) {
    const fromR = gameState.selectedSquare.row;
    const fromC = gameState.selectedSquare.col;

    if (fromR === r && fromC === c) {
      clearSelection();
      setStatusMessage('Đã hủy chọn quân.');
      return;
    }

    const validMove = gameState.validMoves.find(m => m.row === r && m.col === c);
    if (validMove) {
      movePiece(fromR, fromC, r, c);
      return;
    }

    if (clickedPiece && clickedPiece.player === gameState.currentTurn) {
      selectPiece(r, c);
      return;
    }

    if (clickedPiece && clickedPiece.player !== gameState.currentTurn) {
      const selectedPiece = gameState.board[fromR][fromC];
      const selCfg = PIECE_CONFIG[selectedPiece.type];
      const oppCfg = PIECE_CONFIG[clickedPiece.type];

      if (selectedPiece.type === clickedPiece.type) {
        setStatusMessage(`Không thể ăn! Hai quân cùng loại ${selCfg.symbol} chỉ chặn đường nhau.`);
      } else {
        setStatusMessage(`Không thể ăn! ${selCfg.name} ${selCfg.symbol} không ăn được ${oppCfg.name} ${oppCfg.symbol} (bị chặn).`);
      }
      return;
    }

    clearSelection();
    setStatusMessage('Nước đi không hợp lệ. Vui lòng chọn lại quân hoặc ô có thể đi.');
    return;
  }

  if (clickedPiece) {
    if (clickedPiece.player === gameState.currentTurn) {
      selectPiece(r, c);
    } else {
      setStatusMessage(`Không thể chọn quân đối phương! Hiện tại là lượt của Player ${gameState.currentTurn}.`);
    }
  }
}

/**
 * Ghi nhật ký nước đi
 */
function addMoveLog(data) {
  const logList = document.getElementById('move-log-list');
  const placeholder = logList.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const logEntry = document.createElement('div');
  logEntry.classList.add('log-entry');
  if (data.isCapture) logEntry.classList.add('capture-entry');

  const pBadge = `<strong>P${data.player}</strong>`;
  const pieceSym = PIECE_CONFIG[data.pieceType].symbol;

  let actionText = '';
  if (data.isCapture) {
    const oppSym = PIECE_CONFIG[data.capturedType].symbol;
    actionText = `⚔️ ${pBadge} (${pieceSym}) ăn <strong>P${data.capturedPlayer} (${oppSym})</strong> tại <strong>${data.to}</strong>`;
  } else {
    actionText = `${pBadge} (${pieceSym}): ${data.from} → <strong>${data.to}</strong>`;
  }

  logEntry.innerHTML = `
    <span>#${data.turnNum}. ${actionText}</span>
    <span style="font-size: 0.75rem; color: #94a3b8;">${data.to}</span>
  `;

  logList.insertBefore(logEntry, logList.firstChild);

  const countBadge = document.getElementById('move-count-badge');
  if (countBadge) countBadge.textContent = `${data.turnNum} nước`;
}

function addWinLog(winner, reason) {
  const logList = document.getElementById('move-log-list');
  const winEntry = document.createElement('div');
  winEntry.classList.add('log-entry', 'win-entry');
  winEntry.innerHTML = `<span>🎉 <strong>Player ${winner} CHIẾN THẮNG!</strong> ${reason}</span>`;
  logList.insertBefore(winEntry, logList.firstChild);
}

/**
 * Khởi động lại ván chơi mới từ POOL (Reset Game)
 */
function resetGame() {
  gameState.currentTurn = 1;
  gameState.pieceCounts = {
    1: { total: 12, scissors: 4, rock: 4, paper: 4 },
    2: { total: 12, scissors: 4, rock: 4, paper: 4 }
  };
  gameState.selectedSquare = null;
  gameState.validMoves = [];
  gameState.isGameOver = false;
  gameState.winner = null;
  gameState.winReason = '';
  gameState.totalMoves = 0;
  gameState.lastMove = null;

  document.getElementById('win-modal').classList.add('hidden');

  initializeBoard();
  createPieces();
  renderBoard();

  const logList = document.getElementById('move-log-list');
  logList.innerHTML = '<div class="log-placeholder">Ván đấu mới đã sẵn sàng. Player 1 đi trước.</div>';
  document.getElementById('move-count-badge').textContent = '0 nước';

  const layoutName = gameState.currentLayout ? gameState.currentLayout.name : '';
  setStatusMessage(`Ván chơi mới (${layoutName}) bắt đầu! Player 1 đi trước.`);
}

/**
 * Cài đặt sự kiện nút bấm và bộ lọc
 */
function setupEventListeners() {
  // Nút ván mới / Reset
  document.getElementById('btn-reset').addEventListener('click', resetGame);
  document.getElementById('btn-modal-restart').addEventListener('click', resetGame);

  // Bộ chọn Layout từ Pool
  const selectLayout = document.getElementById('select-layout');
  if (selectLayout) {
    selectLayout.addEventListener('change', (e) => {
      gameState.selectedLayoutOption = e.target.value;
      resetGame();
    });
  }

  // Bộ chọn chế độ phân công ô đích
  const selectGoalMode = document.getElementById('select-goal-mode');
  if (selectGoalMode) {
    selectGoalMode.addEventListener('change', (e) => {
      gameState.goalMode = e.target.value;
      initializeBoard();
      renderBoard();
      setStatusMessage(`Đã cập nhật ô đích: Player 1 -> ${getGoalCoordName(1)}, Player 2 -> ${getGoalCoordName(2)}`);
    });
  }

  // Modal luật chơi
  const rulesModal = document.getElementById('rules-modal');
  const btnRules = document.getElementById('btn-rules');
  const btnCloseRules = document.getElementById('btn-close-rules');
  const btnCloseRulesBottom = document.getElementById('btn-close-rules-bottom');

  btnRules.addEventListener('click', () => {
    rulesModal.classList.remove('hidden');
  });

  const closeRules = () => rulesModal.classList.add('hidden');
  btnCloseRules.addEventListener('click', closeRules);
  btnCloseRulesBottom.addEventListener('click', closeRules);

  rulesModal.addEventListener('click', (e) => {
    if (e.target === rulesModal) closeRules();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeRules();
  });
}

// Khởi chạy khi DOM tải xong
document.addEventListener('DOMContentLoaded', () => {
  initializeBoard();
  createPieces();
  renderBoard();
  setupEventListeners();
  const layoutName = gameState.currentLayout ? gameState.currentLayout.name : '';
  setStatusMessage(`Đội hình "${layoutName}". Player 1 đi trước. Hãy chọn một quân cờ đỏ!`);
});
