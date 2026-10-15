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
const history = document.getElementById('sync-history');
const resetButton = document.getElementById('btn-sync-reset');
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
let lastMoveKey = '';
let lastMirrorKey = '';

function log(message) {
  const entry = document.createElement('div');
  entry.className = 'history-item';
  entry.textContent = `[${new Date().toLocaleTimeString('vi-VN')}] ${message}`;
  history.prepend(entry);
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

const board = new BoardRenderer(boardElement, {
  onMove: ({ from, to }) => serverSync.sendAuthoritativeMove(from, to),
  onInvalidClick: (reason) => log(reason)
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
    role = assignedRole;
    board.setLocalRole(role);
    roomLabel.textContent = roomId;
    roleLabel.textContent = role === 'P1' ? 'Bạn là P1 (Đỏ)' :
      role === 'P2' ? 'Bạn là P2 (Xanh)' : 'Bạn là khán giả';
    resetButton.disabled = role === 'SPECTATOR';
    document.getElementById('btn-victory-restart').disabled = role === 'SPECTATOR';
    render();
    log(`Đã vào phòng ${roomId} với vai trò ${role}.`);

    if (await playhtmlSync.joinRoom(roomId)) {
      if (role === 'P1') playhtmlSync.broadcastGameState(gameState, gameState.lastMove);
    }
  },
  onConnectionChange: (connected, message) => {
    serverBadge.textContent = connected ? '● Server đã kết nối' : '○ Server mất kết nối';
    if (!connected) log(message || 'Mất kết nối server. Tải lại trang để vào lại phòng.');
    render();
  },
  onRoomsList: (rooms) => {
    const current = rooms.find((room) => room.id === serverSync.roomId);
    bothPlayersPresent = Boolean(current?.hasP1 && current?.hasP2);
    render();
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

    const move = data.lastMove || gameState.lastMove;
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

function render() {
  const active = serverSync.isOnline && bothPlayersPresent &&
    (role === 'P1' || role === 'P2') && gameState.status !== GAME_STATUS.ENDED;
  board.setInteractive(active);
  board.render(gameState.board, gameState.currentTurn, gameState.lastMove);

  turnBanner.className = `turn-banner ${gameState.currentTurn === 'P1' ? 'p1-turn' : 'p2-turn'}`;
  turnText.textContent = !serverSync.isOnline ? 'Đang chờ kết nối server…' :
    !bothPlayersPresent ? 'Đang chờ đủ hai người chơi…' :
    gameState.status === GAME_STATUS.ENDED ? 'Ván đấu đã kết thúc' :
    `Lượt đi: ${gameState.currentTurn === 'P1' ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)'}`;

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
    `${result.winner === 'P1' ? 'PLAYER 1 (ĐỎ)' : 'PLAYER 2 (XANH)'} CHIẾN THẮNG!`;
  document.getElementById('victory-desc').textContent = result.details || '';
  modal.classList.add('active');
  log(`Ván đấu kết thúc: ${result.details || 'đã có người thắng'}`);
}

resetButton.addEventListener('click', () => {
  if (role !== 'P1' && role !== 'P2') return;
  if (window.confirm('Tạo ván mới cho cả phòng?')) serverSync.sendResetGame();
});
document.getElementById('btn-victory-restart').addEventListener('click', () => {
  if (role === 'P1' || role === 'P2') serverSync.sendResetGame();
});
document.getElementById('btn-copy-room-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(playhtmlSync.getShareableLink() || window.location.href);
    log('Đã sao chép liên kết phòng.');
  } catch {
    log('Không thể sao chép. Hãy chép địa chỉ trên thanh trình duyệt.');
  }
});
document.querySelectorAll('.btn-reaction').forEach((button) => {
  button.addEventListener('click', () => {
    serverSync.sendReaction(button.dataset.emoji);
  });
});

const requestedRoom = new URLSearchParams(window.location.search).get('room');
if (requestedRoom) serverSync.joinRoom(requestedRoom);
else serverSync.createRoom('Phòng PlayHTML');
render();
