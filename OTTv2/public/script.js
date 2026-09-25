/**
 * ========================================================
 * OẲN TÙ TÌ v2 (OTTv2) - CLIENT MULTIPLAYER ONLINE REALTIME
 * - Giao tiếp thời gian thực qua Socket.IO
 * - Authoritative Server: Server kiểm tra toàn bộ luật và đồng bộ trạng thái
 * - Hỗ trợ Reconnect tự động, chia sẻ link phòng /room/:roomId
 * ========================================================
 */

// Khởi tạo kết nối Socket.IO (tự động kết nối tới host/port hiện tại mà không hardcode localhost)
const socket = io();

// Bảng chữ cái đại diện cho 9 cột từ a đến i
const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const BOARD_SIZE = 9;

// Cấu hình hiển thị 3 loại quân
const PIECE_CONFIG = {
  scissors: { name: 'Kéo', symbol: '✌️', beats: 'paper' },
  rock:     { name: 'Búa', symbol: '✊', beats: 'scissors' },
  paper:    { name: 'Bao', symbol: '✋', beats: 'rock' }
};

const DIRECTIONS = [
  [-1, -1], [-1,  0], [-1,  1],
  [ 0, -1],           [ 0,  1],
  [ 1, -1], [ 1,  0], [ 1,  1]
];

function canCapture(attackerType, defenderType) {
  if (!attackerType || !defenderType) return false;
  return PIECE_CONFIG[attackerType].beats === defenderType;
}

// Trạng thái client
const clientState = {
  roomId: null,
  myRole: null,           // 'player1' hoặc 'player2'
  sessionToken: null,     // Token định danh khi reconnect
  myName: 'Player',
  opponentName: 'Đối thủ',
  isMyTurn: false,
  selectedSquare: null,   // { row, col }
  validMoves: [],         // Các ô có thể đi tới (tính toán tạm để highlight)
  gameState: null         // Dữ liệu authoritative từ server
};

// Hiệu ứng âm thanh bằng Web Audio API
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
    } catch (e) {}
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
  error() { this.playTone(180, 'sawtooth', 0.15, 0.15); }
}

const sounds = new SoundEffects();

function toCoord(row, col) {
  return `${COLS[col]}${row + 1}`;
}

// ========================================================
// RENDER BÀN CỜ VÀ GIAO DIỆN TỪ SERVER GAME STATE
// ========================================================

function initializeBoardDOM() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
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

      // Đánh dấu đường chéo chính a1 -> i9
      if (r === c) {
        cellEl.classList.add('on-main-diagonal');
      }

      cellEl.addEventListener('click', () => handleCellClick(r, c));
      boardEl.appendChild(cellEl);
    }
  }
}

/**
 * Render bàn cờ dựa trên gameState được server gửi về
 */
function renderGameState(gameState) {
  if (!gameState) return;
  clientState.gameState = gameState;
  clientState.isMyTurn = (gameState.currentTurn === clientState.myRole);

  const myPlayerNum = clientState.myRole === 'player1' ? 1 : 2;

  // Cập nhật ô đích trên bàn cờ
  if (gameState.goals) {
    const p1Goal = gameState.goals.player1;
    const p2Goal = gameState.goals.player2;

    // Reset các class goal cũ
    document.querySelectorAll('.cell.goal-a1, .cell.goal-i9, .cell.goal-a9, .cell.goal-i1').forEach(el => {
      el.className = el.className.replace(/\bgoal-[^\s]+\b/g, '').trim();
    });

    const cellP1 = document.getElementById(`cell-${p1Goal.row}-${p1Goal.col}`);
    if (cellP1) {
      cellP1.classList.add(`goal-${p1Goal.coord}`);
      cellP1.title = `Ô đích Player 1 (${p1Goal.coord})`;
    }

    const cellP2 = document.getElementById(`cell-${p2Goal.row}-${p2Goal.col}`);
    if (cellP2) {
      cellP2.classList.add(`goal-${p2Goal.coord}`);
      cellP2.title = `Ô đích Player 2 (${p2Goal.coord})`;
    }

    // Cập nhật text trên panel
    const p1GoalText = document.getElementById('p1-goal-text');
    if (p1GoalText) p1GoalText.textContent = p1Goal.coord;
    const p2GoalText = document.getElementById('p2-goal-text');
    if (p2GoalText) p2GoalText.textContent = p2Goal.coord;
    const legP1 = document.getElementById('legend-p1-goal');
    if (legP1) legP1.textContent = p1Goal.coord;
    const legP2 = document.getElementById('legend-p2-goal');
    if (legP2) legP2.textContent = p2Goal.coord;
  }

  // Render từng ô và quân cờ
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cellEl = document.getElementById(`cell-${r}-${c}`);
      if (!cellEl) continue;

      cellEl.classList.remove('selected', 'valid-move', 'valid-capture', 'selectable', 'last-move-from', 'last-move-to');

      // Highlight nước đi cuối cùng
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
        const config = PIECE_CONFIG[pieceData.type] || { symbol: '?', name: 'Quân cờ' };
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

        // Cho phép hover vào quân của chính mình khi đến lượt
        if (!gameState.isGameOver && clientState.isMyTurn && pieceData.player === myPlayerNum) {
          cellEl.classList.add('selectable');
        }
      } else {
        if (existingPiece) {
          cellEl.removeChild(existingPiece);
        }
      }
    }
  }

  // Highlight quân đang được chọn trên client
  if (clientState.selectedSquare) {
    const selCell = document.getElementById(`cell-${clientState.selectedSquare.row}-${clientState.selectedSquare.col}`);
    if (selCell) selCell.classList.add('selected');

    clientState.validMoves.forEach(m => {
      const targetCell = document.getElementById(`cell-${m.row}-${m.col}`);
      if (!targetCell) return;

      if (m.isCapture) {
        targetCell.classList.add('valid-capture');
      } else {
        targetCell.classList.add('valid-move');
      }
    });
  }

  // Cập nhật số lượng quân
  updateCountsUI(gameState.pieceCounts);

  // Cập nhật lượt chơi
  updateTurnUI(gameState.currentTurn);

  // Cập nhật đội hình
  const layoutTag = document.getElementById('active-layout-name');
  if (layoutTag && gameState.layoutName) {
    layoutTag.textContent = gameState.layoutName;
  }

  // Cập nhật nhật ký nước đi
  renderMoveLog(gameState.moveHistory);
}

function updateCountsUI(counts) {
  if (!counts) return;

  const p1 = counts.player1 || counts[1];
  const p2 = counts.player2 || counts[2];

  if (p1) {
    document.getElementById('p1-count').textContent = p1.total;
    document.getElementById('p1-scissors').textContent = p1.scissors;
    document.getElementById('p1-rock').textContent = p1.rock;
    document.getElementById('p1-paper').textContent = p1.paper;
  }

  if (p2) {
    document.getElementById('p2-count').textContent = p2.total;
    document.getElementById('p2-scissors').textContent = p2.scissors;
    document.getElementById('p2-rock').textContent = p2.rock;
    document.getElementById('p2-paper').textContent = p2.paper;
  }
}

function updateTurnUI(currentTurn) {
  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const turnDisplay = document.getElementById('turn-display');
  const turnText = document.getElementById('turn-text');
  const statusMsg = document.getElementById('status-message');

  const isP1 = currentTurn === 'player1';

  if (isP1) {
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

  if (clientState.gameState && !clientState.gameState.isGameOver) {
    if (clientState.isMyTurn) {
      statusMsg.textContent = 'Đến lượt của BẠN! Hãy chọn quân để di chuyển.';
      statusMsg.style.color = '#34d399';
    } else {
      statusMsg.textContent = 'Đang chờ đối phương đi quân...';
      statusMsg.style.color = '#94a3b8';
    }
  }
}

function renderMoveLog(history) {
  if (!history || !Array.isArray(history)) return;
  const logList = document.getElementById('move-log-list');
  logList.innerHTML = '';

  if (history.length === 0) {
    logList.innerHTML = '<div class="log-placeholder">Ván đấu mới đã sẵn sàng. Player 1 đi trước.</div>';
    document.getElementById('move-count-badge').textContent = '0 nước';
    return;
  }

  document.getElementById('move-count-badge').textContent = `${history.length} nước`;

  history.forEach(data => {
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry');
    if (data.isCapture) logEntry.classList.add('capture-entry');

    const pBadge = `<strong>P${data.player}</strong>`;
    const pieceSym = PIECE_CONFIG[data.pieceType] ? PIECE_CONFIG[data.pieceType].symbol : '';

    let actionText = '';
    if (data.isCapture) {
      const oppSym = PIECE_CONFIG[data.capturedType] ? PIECE_CONFIG[data.capturedType].symbol : '';
      actionText = `⚔️ ${pBadge} (${pieceSym}) ăn quân (${oppSym}) tại <strong>${data.to}</strong>`;
    } else {
      actionText = `${pBadge} (${pieceSym}): ${data.from} → <strong>${data.to}</strong>`;
    }

    logEntry.innerHTML = `
      <span>#${data.turnNum}. ${actionText}</span>
      <span style="font-size: 0.75rem; color: #94a3b8;">${data.to}</span>
    `;
    logList.appendChild(logEntry);
  });
}

// ========================================================
// XỬ LÝ CLICK Ô CỜ & TƯƠNG TÁC NGƯỜI CHƠI
// ========================================================

function handleCellClick(r, c) {
  const gs = clientState.gameState;
  if (!gs || gs.isGameOver) return;

  // 1. Kiểm tra có đúng lượt của mình không
  if (!clientState.isMyTurn) {
    setStatusMessage('Chưa đến lượt của bạn! Vui lòng chờ đối phương.');
    sounds.error();
    return;
  }

  const myPlayerNum = clientState.myRole === 'player1' ? 1 : 2;
  const clickedPiece = gs.board[r][c];

  // 2. Nếu đang chọn quân
  if (clientState.selectedSquare) {
    const fromR = clientState.selectedSquare.row;
    const fromC = clientState.selectedSquare.col;

    // A. Click lại chính quân đó -> Hủy chọn
    if (fromR === r && fromC === c) {
      clearSelection();
      setStatusMessage('Đã hủy chọn quân.');
      return;
    }

    // B. Click vào một quân khác CỦA MÌNH -> Đổi lựa chọn
    if (clickedPiece && clickedPiece.player === myPlayerNum) {
      selectPiece(r, c);
      return;
    }

    // C. Click vào ô hợp lệ -> Gửi nước đi lên Authoritative Server
    const validMove = clientState.validMoves.find(m => m.row === r && m.col === c);
    if (validMove) {
      sendMoveToServer(fromR, fromC, r, c);
      clearSelection();
      return;
    }

    // D. Nước đi không hợp lệ
    setStatusMessage('Nước đi không hợp lệ theo luật Oẳn Tù Tì!');
    sounds.error();
    clearSelection();
    return;
  }

  // 3. Nếu chưa chọn quân
  if (clickedPiece) {
    if (clickedPiece.player === myPlayerNum) {
      selectPiece(r, c);
    } else {
      setStatusMessage('Bạn không thể chọn quân của đối phương!');
      sounds.error();
    }
  }
}

/**
 * Chọn quân và tính toán các ô hợp lệ để highlight trên client
 */
function selectPiece(r, c) {
  const piece = clientState.gameState.board[r][c];
  if (!piece) return;

  clientState.selectedSquare = { row: r, col: c };
  clientState.validMoves = computeClientValidMoves(r, c);

  sounds.select();

  const cfg = PIECE_CONFIG[piece.type];
  const coord = toCoord(r, c);
  setStatusMessage(`Đã chọn ${cfg.name} ${cfg.symbol} tại ${coord}. Có ${clientState.validMoves.length} ô có thể đi.`);

  renderGameState(clientState.gameState);
}

function clearSelection() {
  clientState.selectedSquare = null;
  clientState.validMoves = [];
  if (clientState.gameState) {
    renderGameState(clientState.gameState);
  }
}

/**
 * Tính toán sơ bộ các ô hợp lệ trên client để highlight
 */
function computeClientValidMoves(r, c) {
  const piece = clientState.gameState.board[r][c];
  if (!piece) return [];

  const moves = [];

  for (const [dr, dc] of DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;

    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;

    const targetPiece = clientState.gameState.board[nr][nc];

    if (!targetPiece) {
      moves.push({ row: nr, col: nc, isCapture: false });
      continue;
    }

    // Quân cùng phe: Chặn đường
    if (targetPiece.player === piece.player) continue;

    // Quân đối phương: Kiểm tra quy tắc Oẳn tù tì
    if (canCapture(piece.type, targetPiece.type)) {
      moves.push({ row: nr, col: nc, isCapture: true });
    }
  }

  return moves;
}

/**
 * Gửi yêu cầu di chuyển lên Server
 */
function sendMoveToServer(fromR, fromC, toR, toC) {
  const fromCoord = toCoord(fromR, fromC);
  const toCoordStr = toCoord(toR, toC);

  socket.emit('make_move', {
    roomId: clientState.roomId,
    from: fromCoord,
    to: toCoordStr
  }, (response) => {
    if (response && !response.success) {
      setStatusMessage(`Lỗi nước đi: ${response.error}`);
      sounds.error();
    }
  });
}

function setStatusMessage(msg) {
  const msgEl = document.getElementById('status-message');
  if (msgEl) msgEl.textContent = msg;
}

// ========================================================
// QUẢN LÝ LOBBY, PHÒNG CHƠI VÀ KẾT NỐI SOCKET.IO
// ========================================================

function showLobbyModal(viewName) {
  const modal = document.getElementById('lobby-modal');
  modal.classList.remove('hidden');

  document.getElementById('lobby-view-main').classList.add('hidden');
  document.getElementById('lobby-view-waiting').classList.add('hidden');
  document.getElementById('lobby-view-invite').classList.add('hidden');

  if (viewName === 'waiting') {
    document.getElementById('lobby-view-waiting').classList.remove('hidden');
  } else if (viewName === 'invite') {
    document.getElementById('lobby-view-invite').classList.remove('hidden');
  } else {
    document.getElementById('lobby-view-main').classList.remove('hidden');
  }
}

function hideLobbyModal() {
  document.getElementById('lobby-modal').classList.add('hidden');
}

function showLobbyError(msg) {
  const errEl = document.getElementById('lobby-error');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
  setTimeout(() => errEl.classList.add('hidden'), 5000);
}

function updateIdentityUI() {
  const myRoleText = document.getElementById('my-role-text');
  const gameRoomId = document.getElementById('game-room-id');
  const p1YouTag = document.getElementById('p1-you-tag');
  const p2YouTag = document.getElementById('p2-you-tag');

  if (gameRoomId) gameRoomId.textContent = clientState.roomId || '----';

  if (clientState.myRole === 'player1') {
    if (myRoleText) {
      myRoleText.textContent = `${clientState.myName} (Player 1 - Đỏ)`;
      myRoleText.className = 'role-text-p1';
    }
    if (p1YouTag) p1YouTag.classList.remove('hidden');
    if (p2YouTag) p2YouTag.classList.add('hidden');
  } else if (clientState.myRole === 'player2') {
    if (myRoleText) {
      myRoleText.textContent = `${clientState.myName} (Player 2 - Xanh)`;
      myRoleText.className = 'role-text-p2';
    }
    if (p2YouTag) p2YouTag.classList.remove('hidden');
    if (p1YouTag) p1YouTag.classList.add('hidden');
  }
}

/**
 * Tạo link chia sẻ phòng hoàn chỉnh từ URL hiện tại
 */
function getRoomShareUrl(roomId) {
  return `${window.location.origin}/room/${roomId}`;
}

// ========================================================
// LẮNG NGHE CÁC SỰ KIỆN TỪ SERVER
// ========================================================

// 1. Trò chơi bắt đầu khi có đủ 2 người
socket.on('game_start', (data) => {
  hideLobbyModal();
  clientState.roomId = data.roomId;

  if (data.players) {
    if (data.players.player1) document.getElementById('p1-name-display').textContent = data.players.player1.name;
    if (data.players.player2) document.getElementById('p2-name-display').textContent = data.players.player2.name;
  }

  updateIdentityUI();
  renderGameState(data.gameState);
  sounds.win();
  setStatusMessage('Trò chơi đã bắt đầu! Player 1 đi trước.');
});

// 2. Cập nhật trạng thái game sau mỗi nước đi hợp lệ
socket.on('game_update', (data) => {
  const prevMove = clientState.gameState ? clientState.gameState.totalMoves : 0;
  renderGameState(data.gameState);

  if (data.gameState.lastMove && data.gameState.totalMoves > prevMove) {
    if (data.gameState.lastMove.isCapture) {
      sounds.capture();
    } else {
      sounds.move();
    }
  }
});

// 3. Kết thúc trận đấu
socket.on('game_over', (data) => {
  renderGameState(data.gameState);
  sounds.win();

  const isWinner = data.winner === clientState.myRole;
  const winnerTitle = document.getElementById('modal-winner-title');
  const winnerReason = document.getElementById('modal-winner-reason');

  if (isWinner) {
    winnerTitle.textContent = '🏆 BẠN ĐÃ CHIẾN THẮNG!';
    winnerTitle.style.color = '#10b981';
  } else {
    const winPlayerNum = data.winner === 'player1' ? '1' : '2';
    winnerTitle.textContent = `PLAYER ${winPlayerNum} CHIẾN THẮNG!`;
    winnerTitle.style.color = '#ef4444';
  }

  winnerReason.textContent = data.reason;
  document.getElementById('modal-total-moves').textContent = data.gameState.totalMoves;
  document.getElementById('modal-p1-left').textContent = data.gameState.pieceCounts.player1.total;
  document.getElementById('modal-p2-left').textContent = data.gameState.pieceCounts.player2.total;

  setTimeout(() => {
    document.getElementById('win-modal').classList.remove('hidden');
  }, 400);

  setStatusMessage(`KẾT THÚC VÁN: ${data.reason}`);
});

// 4. Ván chơi mới được khởi động lại
socket.on('game_restarted', (data) => {
  document.getElementById('win-modal').classList.add('hidden');
  clearSelection();
  renderGameState(data.gameState);
  sounds.select();
  setStatusMessage('Ván chơi mới đã sẵn sàng! Player 1 đi trước.');
});

// 5. Đối phương bị ngắt kết nối tạm thời
socket.on('player_disconnected', (data) => {
  setStatusMessage(`⚠️ ${data.message}`);
  const dotId = data.role === 'player1' ? 'p1-conn-dot' : 'p2-conn-dot';
  const dot = document.getElementById(dotId);
  if (dot) dot.className = 'player-conn-dot offline';
});

// 6. Đối phương kết nối lại thành công
socket.on('player_reconnected', (data) => {
  setStatusMessage(`✅ ${data.message}`);
  const dotId = data.role === 'player1' ? 'p1-conn-dot' : 'p2-conn-dot';
  const dot = document.getElementById(dotId);
  if (dot) dot.className = 'player-conn-dot online';
});

// Tình trạng kết nối Socket với server
socket.on('connect', () => {
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  if (dot) dot.className = 'conn-dot online';
  if (text) text.textContent = 'Đã kết nối';

  // Tự động khôi phục phiên nếu đã có phòng lưu trong sessionStorage
  const savedRoomId = sessionStorage.getItem('ottv2_room_id');
  const savedSessionToken = sessionStorage.getItem('ottv2_session_token');

  if (savedRoomId && savedSessionToken) {
    socket.emit('reconnect_session', {
      roomId: savedRoomId,
      sessionToken: savedSessionToken
    }, (res) => {
      if (res && res.success) {
        clientState.roomId = res.roomId;
        clientState.myRole = res.role;
        clientState.sessionToken = res.sessionToken;

        if (res.players) {
          if (res.players.player1) document.getElementById('p1-name-display').textContent = res.players.player1.name;
          if (res.players.player2) document.getElementById('p2-name-display').textContent = res.players.player2.name;
        }

        updateIdentityUI();
        hideLobbyModal();
        renderGameState(res.gameState);
        setStatusMessage('Đã khôi phục phiên chơi thành công!');
      } else {
        sessionStorage.removeItem('ottv2_room_id');
        sessionStorage.removeItem('ottv2_session_token');
      }
    });
  }
});

socket.on('disconnect', () => {
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  if (dot) dot.className = 'conn-dot offline';
  if (text) text.textContent = 'Mất kết nối...';
  setStatusMessage('Đang kết nối lại tới máy chủ...');
});

// ========================================================
// KHỞI TẠO EVENT LISTENERS GIAO DIỆN
// ========================================================

function setupLobbyAndControls() {
  // 1. Nút Tạo phòng
  document.getElementById('btn-create-room').addEventListener('click', () => {
    const nameInput = document.getElementById('input-player-name').value.trim() || 'Player 1';
    clientState.myName = nameInput;

    socket.emit('create_room', { name: nameInput }, (res) => {
      if (res && res.success) {
        clientState.roomId = res.roomId;
        clientState.myRole = 'player1';
        clientState.sessionToken = res.sessionToken;

        sessionStorage.setItem('ottv2_room_id', res.roomId);
        sessionStorage.setItem('ottv2_session_token', res.sessionToken);

        document.getElementById('display-room-code').textContent = res.roomId;
        document.getElementById('input-share-link').value = getRoomShareUrl(res.roomId);
        document.getElementById('p1-name-display').textContent = nameInput;

        updateIdentityUI();
        showLobbyModal('waiting');
      } else {
        showLobbyError(res ? res.error : 'Không thể tạo phòng.');
      }
    });
  });

  // 2. Nút Tham gia phòng bằng mã
  document.getElementById('btn-join-room').addEventListener('click', () => {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    const nameInput = document.getElementById('input-player-name').value.trim() || 'Player 2';
    if (!code) {
      showLobbyError('Vui lòng nhập mã phòng!');
      return;
    }

    clientState.myName = nameInput;
    socket.emit('join_room', { roomId: code, name: nameInput }, (res) => {
      if (res && res.success) {
        clientState.roomId = res.roomId;
        clientState.myRole = 'player2';
        clientState.sessionToken = res.sessionToken;

        sessionStorage.setItem('ottv2_room_id', res.roomId);
        sessionStorage.setItem('ottv2_session_token', res.sessionToken);

        document.getElementById('p2-name-display').textContent = nameInput;
        updateIdentityUI();
        hideLobbyModal();
      } else {
        showLobbyError(res ? res.error : 'Không thể vào phòng.');
      }
    });
  });

  // 3. Sao chép link phòng
  const handleCopyLink = () => {
    if (!clientState.roomId) return;
    const url = getRoomShareUrl(clientState.roomId);
    navigator.clipboard.writeText(url).then(() => {
      alert(`Đã sao chép link phòng: ${url}\nHãy gửi link này cho Người chơi 2!`);
    }).catch(() => {
      prompt('Hãy copy link phòng sau:', url);
    });
  };

  document.getElementById('btn-copy-link').addEventListener('click', handleCopyLink);
  document.getElementById('btn-copy-room-link-mini').addEventListener('click', handleCopyLink);

  // 4. Hủy chờ phòng
  document.getElementById('btn-cancel-waiting').addEventListener('click', () => {
    sessionStorage.removeItem('ottv2_room_id');
    sessionStorage.removeItem('ottv2_session_token');
    clientState.roomId = null;
    clientState.myRole = null;
    showLobbyModal('main');
  });

  // 5. Tham gia từ lời mời URL
  document.getElementById('btn-accept-invite').addEventListener('click', () => {
    const code = document.getElementById('invite-room-code').textContent;
    const nameInput = document.getElementById('input-player-name').value.trim() || 'Player 2';
    clientState.myName = nameInput;

    socket.emit('join_room', { roomId: code, name: nameInput }, (res) => {
      if (res && res.success) {
        clientState.roomId = res.roomId;
        clientState.myRole = 'player2';
        clientState.sessionToken = res.sessionToken;

        sessionStorage.setItem('ottv2_room_id', res.roomId);
        sessionStorage.setItem('ottv2_session_token', res.sessionToken);

        document.getElementById('p2-name-display').textContent = nameInput;
        updateIdentityUI();
        hideLobbyModal();
      } else {
        showLobbyError(res ? res.error : 'Không thể vào phòng.');
      }
    });
  });

  document.getElementById('btn-cancel-invite').addEventListener('click', () => {
    showLobbyModal('main');
  });

  // 6. Rời phòng
  document.getElementById('btn-leave-room').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn rời phòng chơi này không?')) {
      sessionStorage.removeItem('ottv2_room_id');
      sessionStorage.removeItem('ottv2_session_token');
      window.location.href = '/';
    }
  });

  // 7. Yêu cầu chơi lại (Ván mới)
  const handleRestart = () => {
    socket.emit('request_restart');
  };
  document.getElementById('btn-request-restart').addEventListener('click', handleRestart);
  document.getElementById('btn-modal-restart').addEventListener('click', handleRestart);

  // 8. Modal Luật chơi
  const rulesModal = document.getElementById('rules-modal');
  const btnRules = document.getElementById('btn-rules');
  const btnCloseRules = document.getElementById('btn-close-rules');
  const btnCloseRulesBottom = document.getElementById('btn-close-rules-bottom');

  btnRules.addEventListener('click', () => rulesModal.classList.remove('hidden'));
  const closeRules = () => rulesModal.classList.add('hidden');
  btnCloseRules.addEventListener('click', closeRules);
  btnCloseRulesBottom.addEventListener('click', closeRules);
  rulesModal.addEventListener('click', (e) => { if (e.target === rulesModal) closeRules(); });
}

// Kiểm tra tham số URL khi trang tải
function checkUrlForRoom() {
  let roomIdFromUrl = null;

  // Kiểm tra /room/:roomId
  const pathParts = window.location.pathname.split('/');
  const roomIdx = pathParts.indexOf('room');
  if (roomIdx !== -1 && pathParts[roomIdx + 1]) {
    roomIdFromUrl = pathParts[roomIdx + 1].toUpperCase();
  }

  // Hoặc ?room=:roomId
  if (!roomIdFromUrl) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('room')) {
      roomIdFromUrl = urlParams.get('room').toUpperCase();
    }
  }

  if (roomIdFromUrl) {
    document.getElementById('invite-room-code').textContent = roomIdFromUrl;
    document.getElementById('input-room-code').value = roomIdFromUrl;
    showLobbyModal('invite');
  } else {
    // Nếu chưa có phòng lưu, hiển thị sảnh chính
    if (!sessionStorage.getItem('ottv2_room_id')) {
      showLobbyModal('main');
    }
  }
}

// Khởi tạo khi DOM tải xong
document.addEventListener('DOMContentLoaded', () => {
  initializeBoardDOM();
  setupLobbyAndControls();
  checkUrlForRoom();
});
