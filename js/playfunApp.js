import { BoardRenderer } from './board.js';
import { RenderSyncEngine } from './renderSync.js';
import { PlayhtmlSyncEngine } from './playhtmlSync.js';
import { createInitialBoard, countPlayerPieces } from '../shared/gameRules.js';
import { GAME_STATUS, PIECE_TYPES, PLAYERS, sounds } from './constants.js';

const boardElement = document.getElementById('board');
const statusBadge = document.getElementById('playfun-status-badge');
const serverBadge = document.getElementById('pf-ping-badge');
const roleLabel = document.getElementById('playfun-role');
const roomLabel = document.getElementById('display-room-id');
const turnText = document.getElementById('turn-text');
const turnBanner = document.getElementById('turn-banner');
const turnTimer = document.getElementById('playfun-turn-timer');
const history = document.getElementById('sync-history');
const resetButton = document.getElementById('btn-sync-reset');
const readyButton = document.getElementById('playfun-ready');
const modal = document.getElementById('victory-modal');

let gameState = {
  board: createInitialBoard(),
  currentTurn: PLAYERS.PLAYER_1,
  status: GAME_STATUS.PLAYING,
  lastMove: null,
  winnerInfo: null
};
let role = null;
let bothPlayersPresent = false;
let bothPlayersReady = false;
let myReady = false;
let lastMoveKey = '';
let lastMirrorKey = '';
let timerInterval = null;

function updateTurnTimer(data) {
  clearInterval(timerInterval);
  timerInterval = null;
  if (!data?.active || data.remainingMs === null) {
    turnTimer.textContent = data?.gameEnded ? '⏱️ Ván đã kết thúc' : '⏱️ Chờ sẵn sàng';
    return;
  }
  const deadline = Date.now() + data.remainingMs;
  const update = () => {
    turnTimer.textContent = `⏱️ ${Math.ceil(Math.max(0, deadline - Date.now()) / 1000)}s`;
  };
  update();
  timerInterval = setInterval(update, 250);
}

function log(message) {
  const entry = document.createElement('div');
  entry.className = 'history-item';
  entry.textContent = `[${new Date().toLocaleTimeString('vi-VN')}] ${message}`;
  history.prepend(entry);
  while (history.children.length > 40) history.lastElementChild.remove();
}

function notice(message) {
  const element = document.getElementById('player-notice');
  element.textContent = message;
  element.hidden = false;
}

function showReaction(emoji) {
  const element = document.createElement('div');
  element.className = 'floating-reaction';
  element.textContent = emoji;
  const rect = boardElement.getBoundingClientRect();
  element.style.left = `${rect.left + rect.width / 2}px`;
  element.style.top = `${rect.top + rect.height / 2}px`;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 1600);
}

function updateReadyState(ready) {
  bothPlayersReady = Boolean(bothPlayersPresent && ready?.p1 && ready?.p2);
  myReady = role === 'P1' ? Boolean(ready?.p1) : role === 'P2' ? Boolean(ready?.p2) : false;
  readyButton.disabled = !serverSync.isOnline || !['P1', 'P2'].includes(role) || myReady || gameState.status === GAME_STATUS.ENDED;
  readyButton.textContent = myReady ? '✓ Đã sẵn sàng' : '✅ Sẵn sàng';
  render();
}

const board = new BoardRenderer(boardElement, {
  onMove: ({ from, to }) => serverSync.sendAuthoritativeMove(from, to),
  onInvalidClick: notice
});
board.initBoard();

const playhtmlSync = new PlayhtmlSyncEngine({
  onRemoteUpdate: (data) => {
    if (data.reaction) {
      showReaction(data.reaction);
      log(`Biểu cảm trong phòng: ${data.reaction}`);
      return;
    }
    // The shared PlayHTML document mirrors server snapshots. Never use it to
    // grant a role or commit a move; only the WebSocket server may do that.
    const mirrorKey = data.gameState ? JSON.stringify({
      turn: data.gameState.currentTurn,
      move: data.gameState.lastMove,
      status: data.gameState.status
    }) : '';
    if (mirrorKey && mirrorKey !== lastMirrorKey) {
      lastMirrorKey = mirrorKey;
      log('PlayHTML đã đồng bộ trạng thái bàn cờ trong phòng.');
    }
  },
  onConnectionChange: (connected, message) => {
    statusBadge.textContent = connected ? '● PlayHTML đã kết nối' : `○ PlayHTML: ${message}`;
  }
});

const serverSync = new RenderSyncEngine({
  onRoomJoined: async (roomId, assignedRole) => {
    if (!roomId) {
      role = null;
      bothPlayersPresent = false;
      bothPlayersReady = false;
      myReady = false;
      updateTurnTimer(null);
      roomLabel.textContent = 'Đã đóng';
      roleLabel.textContent = 'Phòng đã đóng. Về sảnh để chọn phòng khác.';
      readyButton.disabled = true;
      resetButton.disabled = true;
      document.getElementById('btn-copy-room-link').disabled = true;
      document.getElementById('btn-victory-restart').disabled = true;
      modal.classList.remove('active');
      render();
      return;
    }
    role = assignedRole;
    document.getElementById('player-notice').hidden = true;
    myReady = false;
    board.setLocalRole(role);
    roomLabel.textContent = roomId;
    document.getElementById('btn-copy-room-link').disabled = false;
    roleLabel.textContent = role === 'P1' ? 'Bạn ở đội Hồng' :
      role === 'P2' ? 'Bạn ở đội Xanh' : 'Bạn là khán giả';
    resetButton.disabled = role === 'SPECTATOR';
    readyButton.disabled = role === 'SPECTATOR';
    readyButton.textContent = '✅ Sẵn sàng';
    document.getElementById('btn-victory-restart').disabled = role === 'SPECTATOR';
    render();
    log(`Đã vào phòng ${roomId} với vai trò ${role}.`);

    if (await playhtmlSync.joinRoom(roomId)) {
      if (role === 'P1') playhtmlSync.broadcastGameState(gameState, gameState.lastMove);
    }
  },
  onConnectionChange: (connected, message) => {
    serverBadge.textContent = connected ? '● Đã kết nối' : '○ Mất kết nối';
    if (connected && message?.startsWith('⚠️')) notice(message);
    if (!connected) {
      updateTurnTimer(null);
      readyButton.disabled = true;
      log(message || 'Mất kết nối server. Tải lại trang để vào lại phòng.');
      notice('Kết nối bị gián đoạn. Bạn tải lại trang để vào chơi tiếp nhé.');
    }
    render();
  },
  onTimerUpdate: updateTurnTimer,
  onRoomError: notice,
  onRoomsList: (rooms) => {
    const current = rooms.find((room) => room.id === serverSync.roomId);
    bothPlayersPresent = Boolean(current?.hasP1 && current?.hasP2);
    updatePlayerNotes(current?.hasP1, current?.hasP2, current?.ready);
    updateReadyState(current?.ready);
  },
  onPresenceUpdate: (presence) => {
    bothPlayersPresent = Boolean(presence.p1 && presence.p2);
    updatePlayerNotes(presence.p1, presence.p2, presence.ready);
    updateReadyState(presence.ready);
  },
  onRemoteUpdate: (data) => {
    if (data.reaction) {
      showReaction(data.reaction);
      log(`Biểu cảm trong phòng: ${data.reaction}`);
      return;
    }
    if (!data.gameState) return;

    gameState = data.gameState;
    board.clearSelection();
    render();

    const move = data.lastMove === undefined ? gameState.lastMove : data.lastMove;
    if (data.timedOutRole) log(`${data.timedOutRole} hết 30 giây; đến lượt bạn kia.`);
    const moveKey = move ? `${move.player}:${move.from}:${move.to}` : '';
    if (move && moveKey !== lastMoveKey) {
      lastMoveKey = moveKey;
      log(`${move.player} đi ${move.from} → ${move.to}${move.isCapture ? ' và ăn quân' : ''}.`);
      if (move.isCapture) sounds.capture();
      else sounds.move();
    } else if (!move) {
      lastMoveKey = '';
    }

    if (gameState.status === GAME_STATUS.ENDED && gameState.winnerInfo) {
      showVictory(gameState.winnerInfo);
    } else {
      modal.classList.remove('active');
    }

    if (role === 'P1') playhtmlSync.broadcastGameState(gameState, move);
  }
});

function updatePlayerNotes(p1, p2, ready) {
  for (const [key, present] of [['p1', p1], ['p2', p2]]) {
    document.getElementById(`${key}-ready-note`).textContent = !present
      ? 'Chờ bạn vào chơi…' : ready?.[key] ? '✓ Đã sẵn sàng' : 'Đang chuẩn bị…';
  }
}

function render() {
  const active = serverSync.isOnline && bothPlayersPresent &&
    bothPlayersReady && (role === 'P1' || role === 'P2') && gameState.status !== GAME_STATUS.ENDED;
  board.setInteractive(active);
  board.render(gameState.board, gameState.currentTurn, gameState.lastMove);
  for (const [id, team] of [['player1-card', 'P1'], ['player2-card', 'P2']]) {
    document.getElementById(id).classList.toggle('active-turn', bothPlayersReady && gameState.currentTurn === team);
  }

  turnBanner.className = `turn-banner ${gameState.currentTurn === 'P1' ? 'p1-turn' : 'p2-turn'}`;
  turnText.textContent = !serverSync.isOnline ? 'Đang kết nối…' :
    !serverSync.roomId ? 'Chưa tham gia phòng. Hãy chọn phòng trong sảnh.' :
    gameState.status === GAME_STATUS.ENDED ? 'Ván đấu đã kết thúc' :
    !bothPlayersPresent ? 'Đang chờ đủ hai người chơi…' :
    !bothPlayersReady ? 'Đang chờ hai bạn bấm Sẵn sàng…' :
    `Lượt đi: ${gameState.currentTurn === 'P1' ? 'Đội Hồng' : 'Đội Xanh'}`;

  const counts = countPlayerPieces(gameState.board);
  for (const player of ['p1', 'p2']) {
    const data = counts[player.toUpperCase()];
    for (const type of [PIECE_TYPES.ROCK, PIECE_TYPES.PAPER, PIECE_TYPES.SCISSORS]) {
      document.getElementById(`${player}-${type.toLowerCase()}-count`).textContent = data[type];
    }
  }
}

function showVictory(result) {
  if (modal.classList.contains('active')) return;
  sounds.victory();
  document.getElementById('victory-title').textContent =
    `${result.winner === 'P1' ? 'Đội Hồng' : 'Đội Xanh'} thắng rồi!`;
  document.getElementById('victory-desc').textContent = 'Một nước đi thật hay. Cùng chơi thêm một ván nhé?';
  modal.classList.add('active');
  log(`Ván đấu kết thúc: ${result.details || 'đã có người thắng'}`);
}

resetButton.addEventListener('click', () => {
  if (role !== 'P1' && role !== 'P2') return;
  if (window.confirm('Tạo ván mới cho cả phòng?')) serverSync.sendResetGame();
});

readyButton.addEventListener('click', () => serverSync.sendReady());
document.getElementById('btn-victory-restart').addEventListener('click', () => {
  if (role === 'P1' || role === 'P2') serverSync.sendResetGame();
});
document.getElementById('btn-copy-room-link').addEventListener('click', async () => {
  if (!serverSync.roomId) return;
  try {
    await navigator.clipboard.writeText(serverSync.getShareableLink());
    notice('Đã sao chép! Gửi liên kết này cho bạn của bạn nhé.');
  } catch {
    notice('Chưa sao chép được. Bạn có thể chép địa chỉ trên thanh trình duyệt nhé.');
  }
});
document.querySelectorAll('.btn-reaction').forEach((button) => {
  button.addEventListener('click', () => {
    serverSync.sendReaction(button.dataset.emoji);
  });
});

const requestedRoom = new URLSearchParams(window.location.search).get('room');
if (requestedRoom) serverSync.joinRoom(requestedRoom, serverSync.getRoleFromUrl());
else serverSync.createRoom('Phòng PlayHTML');
render();
