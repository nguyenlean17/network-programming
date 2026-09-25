/**
 * ========================================================
 * OẲN TÙ TÌ v2 (OTTv2) - 3 LOẠI QUÂN: KÉO - BÚA - BAO
 * Quy tắc ăn quân Oẳn tù tì:
 * - Kéo ăn Bao (✌️ > ✋)
 * - Búa ăn Kéo (✊ > ✌️)
 * - Bao ăn Búa (✋ > ✊)
 * - Quân cùng loại hoặc yếu hơn không thể ăn nhau (bị chặn đường).
 * - Quân cùng phe chặn đường nhau.
 * - Điều kiện thắng: Ăn hết 1 loại quân đối phương (hoặc hết sạch quân)
 *   hoặc đưa quân vào ô đích (P1 -> a1, P2 -> i9).
 * ========================================================
 */

// Bảng chữ cái đại diện cho 9 cột từ a đến i
const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const BOARD_SIZE = 9;

// Tọa độ ô đích cố định của hai bên
const GOAL_P1 = { row: 0, col: 0 }; // a1
const GOAL_P2 = { row: 8, col: 8 }; // i9

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
 * Kiểm tra xem quân tấn công có ăn được quân phòng thủ theo luật Oẳn tù tì hay không
 * Kéo ăn Bao (scissors > paper)
 * Búa ăn Kéo (rock > scissors)
 * Bao ăn Búa (paper > rock)
 */
function canCapture(attackerType, defenderType) {
  if (!attackerType || !defenderType) return false;
  return PIECE_CONFIG[attackerType].beats === defenderType;
}

/**
 * 12 vị trí ban đầu của Player 1 (4 Kéo, 4 Búa, 4 Bao) nằm dưới đường chéo chính (row > col).
 * Player 2 sẽ nhận các quân đối xứng tuyệt đối qua đường chéo chính: (row, col) -> (col, row)
 * với CÙNG LOẠI QUÂN để đảm bảo sự cân bằng và công bằng tuyệt đối.
 */
const INITIAL_P1_PIECES = [
  // Hàng 6 (tiền tuyến - 2 quân)
  { row: 5, col: 2, type: 'rock' },     // c6: Búa ✊
  { row: 5, col: 3, type: 'scissors' }, // d6: Kéo ✌️

  // Hàng 7 (4 quân)
  { row: 6, col: 0, type: 'paper' },    // a7: Bao ✋
  { row: 6, col: 1, type: 'rock' },     // b7: Búa ✊
  { row: 6, col: 2, type: 'scissors' }, // c7: Kéo ✌️
  { row: 6, col: 3, type: 'paper' },    // d7: Bao ✋

  // Hàng 8 (3 quân)
  { row: 7, col: 0, type: 'scissors' }, // a8: Kéo ✌️
  { row: 7, col: 1, type: 'paper' },    // b8: Bao ✋
  { row: 7, col: 2, type: 'rock' },     // c8: Búa ✊

  // Hàng 9 (hậu phương - 3 quân)
  { row: 8, col: 0, type: 'rock' },     // a9: Búa ✊
  { row: 8, col: 1, type: 'scissors' }, // b9: Kéo ✌️
  { row: 8, col: 2, type: 'paper' }     // c9: Bao ✋
];

/**
 * Quản lý trạng thái trò chơi toàn cục (Game State)
 */
const gameState = {
  board: [],               // Mảng 2 chiều 9x9 lưu thông tin ô cờ ({ player: 1|2, type: 'rock'|'paper'|'scissors', id: string })
  currentTurn: 1,          // 1: Player 1 (đi trước), 2: Player 2
  pieceCounts: {
    1: { total: 12, scissors: 4, rock: 4, paper: 4 },
    2: { total: 12, scissors: 4, rock: 4, paper: 4 }
  },
  selectedSquare: null,    // { row, col } đang được chọn
  validMoves: [],          // Danh sách các ô có thể đi tới: [{ row, col, isCapture, capturedType }]
  isGameOver: false,       // Trạng thái kết thúc game
  winner: null,            // 1 | 2 | null
  winReason: '',           // Lý do chiến thắng
  totalMoves: 0,           // Tổng số nước đi
  lastMove: null           // { from: {row, col}, to: {row, col} }
};

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
      // Bỏ qua lỗi audio nếu trình duyệt chặn tự phát âm thanh
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
 * Chuyển đổi tọa độ số (row, col) thành chuỗi cờ như "a1", "i9"
 */
function toCoord(row, col) {
  return `${COLS[col]}${row + 1}`;
}

/**
 * Khởi tạo bàn cờ 9x9 trong bộ nhớ và trên DOM
 */
function initializeBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  gameState.board = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    const rowArray = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      rowArray.push(null);

      const cellEl = document.createElement('div');
      cellEl.classList.add('cell');
      cellEl.dataset.row = r;
      cellEl.dataset.col = c;
      cellEl.id = `cell-${r}-${c}`;

      // Màu sắc xen kẽ ô cờ
      if ((r + c) % 2 === 0) {
        cellEl.classList.add('light');
      } else {
        cellEl.classList.add('dark');
      }

      // Đánh dấu đường chéo chính a1 -> i9 (r === c)
      if (r === c) {
        cellEl.classList.add('on-main-diagonal');
      }

      // Đánh dấu 2 ô đích cố định
      if (r === GOAL_P1.row && c === GOAL_P1.col) {
        cellEl.classList.add('goal-a1');
        cellEl.title = 'Ô đích Player 1 (a1)';
      } else if (r === GOAL_P2.row && c === GOAL_P2.col) {
        cellEl.classList.add('goal-i9');
        cellEl.title = 'Ô đích Player 2 (i9)';
      }

      // Sự kiện click vào ô cờ
      cellEl.addEventListener('click', () => handleCellClick(r, c));

      boardEl.appendChild(cellEl);
    }
    gameState.board.push(rowArray);
  }
}

/**
 * Tạo 12 quân cờ cho Player 1 và 12 quân đối xứng cho Player 2.
 * Mỗi bên có chính xác: 4 Kéo (✌️), 4 Búa (✊), 4 Bao (✋).
 */
function createPieces() {
  // 1. Tạo 12 quân cho Player 1
  INITIAL_P1_PIECES.forEach((p, idx) => {
    gameState.board[p.row][p.col] = {
      player: 1,
      type: p.type,
      id: `p1-${p.type}-${idx + 1}`
    };
  });

  // 2. Tạo 12 quân cho Player 2 bằng phép đối xứng qua đường chéo chính
  INITIAL_P1_PIECES.forEach((p, idx) => {
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
 * Vẽ lại toàn bộ quân cờ, highlight và cập nhật thống kê lên giao diện
 */
function renderBoard() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cellEl = document.getElementById(`cell-${r}-${c}`);
      if (!cellEl) continue;

      // Xóa các class highlight cũ
      cellEl.classList.remove('selected', 'valid-move', 'valid-capture', 'selectable', 'last-move-from', 'last-move-to');

      // Highlight nước đi gần nhất
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

        // Cho phép hover vào quân của lượt hiện tại
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

  // Cập nhật thông số thống kê quân cờ
  updateStatsUI();

  // Cập nhật thẻ lượt hiện tại
  updateTurnUI();
}

/**
 * Cập nhật bảng thống kê số lượng từng loại quân
 */
function updateStatsUI() {
  // Player 1
  const p1 = gameState.pieceCounts[1];
  document.getElementById('p1-count').textContent = p1.total;
  document.getElementById('p1-scissors').textContent = p1.scissors;
  document.getElementById('p1-rock').textContent = p1.rock;
  document.getElementById('p1-paper').textContent = p1.paper;

  // Đổi trạng thái hiển thị nếu hết quân loại đó
  togglePillZero('p1-scissors', p1.scissors);
  togglePillZero('p1-rock', p1.rock);
  togglePillZero('p1-paper', p1.paper);

  // Player 2
  const p2 = gameState.pieceCounts[2];
  document.getElementById('p2-count').textContent = p2.total;
  document.getElementById('p2-scissors').textContent = p2.scissors;
  document.getElementById('p2-rock').textContent = p2.rock;
  document.getElementById('p2-paper').textContent = p2.paper;

  togglePillZero('p2-scissors', p2.scissors);
  togglePillZero('p2-rock', p2.rock);
  togglePillZero('p2-paper', p2.paper);
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
 * Áp dụng đúng luật:
 * - 8 hướng, đúng 1 ô (King move)
 * - Nằm trong bàn cờ 9x9
 * - Ô trống: Đi được
 * - Ô có quân cùng phe: KHÔNG đi được (chặn đường)
 * - Ô có quân đối phương: CHỈ ĐƯỢC ĐI/ĂN NẾU thắng theo luật Oẳn Tù Tì
 *   (Kéo ăn Bao, Búa ăn Kéo, Bao ăn Búa). Nếu cùng loại hoặc yếu hơn -> BỊ CHẶN!
 */
function getValidMoves(r, c) {
  const piece = gameState.board[r][c];
  if (!piece) return [];

  const moves = [];

  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;

    // 1. Kiểm tra nằm trong phạm vi bàn cờ 9x9
    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) {
      continue;
    }

    const targetPiece = gameState.board[nr][nc];

    // 2. Ô trống: Nước đi hợp lệ
    if (!targetPiece) {
      moves.push({
        row: nr,
        col: nc,
        isCapture: false,
        capturedType: null
      });
      continue;
    }

    // 3. Ô có quân cùng phe: Không thể đi vào (chặn đường nhau)
    if (targetPiece.player === piece.player) {
      continue;
    }

    // 4. Ô có quân đối phương: Áp dụng quy tắc Oẳn Tù Tì
    // Kéo ăn Bao, Búa ăn Kéo, Bao ăn Búa
    if (canCapture(piece.type, targetPiece.type)) {
      moves.push({
        row: nr,
        col: nc,
        isCapture: true,
        capturedType: targetPiece.type
      });
    }
    // Nếu cùng loại (hòa) hoặc đối phương mạnh hơn: Bị chặn, không thể đi vào!
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
 * Xử lý việc ăn quân đối phương
 */
function capturePiece(r, c) {
  const targetPiece = gameState.board[r][c];
  if (!targetPiece) return null;

  const capturedPlayer = targetPiece.player;
  const capturedType = targetPiece.type;

  // Giảm số lượng quân của loại bị ăn và tổng số quân
  gameState.pieceCounts[capturedPlayer][capturedType]--;
  gameState.pieceCounts[capturedPlayer].total--;

  sounds.capture();
  return targetPiece;
}

/**
 * Di chuyển quân từ (fromR, fromC) sang (toR, toC)
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

  // Cập nhật vị trí trên bảng cờ
  gameState.board[toR][toC] = movingPiece;
  gameState.board[fromR][fromC] = null;

  gameState.lastMove = {
    from: { row: fromR, col: fromC },
    to: { row: toR, col: toC }
  };
  gameState.totalMoves++;

  // Ghi nhật ký nước đi
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

  // Kiểm tra điều kiện thắng
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
 * 1. Điều kiện đích cố định:
 *    - Player 1 đưa quân vào a1 -> Player 1 thắng ngay!
 *    - Player 2 đưa quân vào i9 -> Player 2 thắng ngay!
 * 2. Điều kiện ăn hết một loại quân đối phương (Kéo / Búa / Bao) hoặc hết sạch 12 quân:
 *    - Đối phương hết sạch Kéo (scissors = 0) -> Thắng!
 *    - Đối phương hết sạch Búa (rock = 0) -> Thắng!
 *    - Đối phương hết sạch Bao (paper = 0) -> Thắng!
 *    - Đối phương còn 0 quân (total = 0) -> Thắng!
 */
function checkWinCondition(movingPlayer, targetRow, targetCol) {
  const opponent = movingPlayer === 1 ? 2 : 1;
  const oppCounts = gameState.pieceCounts[opponent];

  // 1. Kiểm tra đưa quân vào ô đích
  if (movingPlayer === 1 && targetRow === GOAL_P1.row && targetCol === GOAL_P1.col) {
    return {
      gameOver: true,
      winner: 1,
      reason: 'Player 1 đã đưa quân vào ô đích a1 thành công!'
    };
  }

  if (movingPlayer === 2 && targetRow === GOAL_P2.row && targetCol === GOAL_P2.col) {
    return {
      gameOver: true,
      winner: 2,
      reason: 'Player 2 đã đưa quân vào ô đích i9 thành công!'
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

  // Kiểm tra ăn hết toàn bộ quân
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
 * Chuyển lượt luân phiên giữa 2 người chơi
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

  // 1. Nếu đang có quân được chọn
  if (gameState.selectedSquare) {
    const fromR = gameState.selectedSquare.row;
    const fromC = gameState.selectedSquare.col;

    // A. Click vào chính quân đang chọn: Hủy chọn
    if (fromR === r && fromC === c) {
      clearSelection();
      setStatusMessage('Đã hủy chọn quân.');
      return;
    }

    // B. Click vào ô trong danh sách nước đi hợp lệ: Thực hiện di chuyển!
    const validMove = gameState.validMoves.find(m => m.row === r && m.col === c);
    if (validMove) {
      movePiece(fromR, fromC, r, c);
      return;
    }

    // C. Click vào một quân khác CỦA CHÍNH MÌNH: Đổi sang chọn quân đó
    if (clickedPiece && clickedPiece.player === gameState.currentTurn) {
      selectPiece(r, c);
      return;
    }

    // D. Click ô có quân đối phương nhưng KHÔNG ĂN ĐƯỢC (cùng loại hoặc yếu hơn)
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

    // E. Click ô không hợp lệ
    clearSelection();
    setStatusMessage('Nước đi không hợp lệ. Vui lòng chọn lại quân hoặc ô có thể đi.');
    return;
  }

  // 2. Nếu chưa có quân nào được chọn
  if (clickedPiece) {
    if (clickedPiece.player === gameState.currentTurn) {
      selectPiece(r, c);
    } else {
      setStatusMessage(`Không thể chọn quân đối phương! Hiện tại là lượt của Player ${gameState.currentTurn}.`);
    }
  }
}

/**
 * Ghi nhật ký nước đi kèm biểu tượng Oẳn tù tì
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

/**
 * Ghi log khi có người chiến thắng
 */
function addWinLog(winner, reason) {
  const logList = document.getElementById('move-log-list');
  const winEntry = document.createElement('div');
  winEntry.classList.add('log-entry', 'win-entry');
  winEntry.innerHTML = `<span>🎉 <strong>Player ${winner} CHIẾN THẮNG!</strong> ${reason}</span>`;
  logList.insertBefore(winEntry, logList.firstChild);
}

/**
 * Khởi động lại toàn bộ trạng thái ván chơi (Reset Game)
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

  setStatusMessage('Ván chơi mới bắt đầu. Player 1 đi trước!');
}

/**
 * Cài đặt các sự kiện nút bấm và modal
 */
function setupEventListeners() {
  document.getElementById('btn-reset').addEventListener('click', resetGame);
  document.getElementById('btn-modal-restart').addEventListener('click', resetGame);

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

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  initializeBoard();
  createPieces();
  renderBoard();
  setupEventListeners();
  setStatusMessage('Player 1 đi trước. Hãy chọn một quân cờ đỏ!');
});
