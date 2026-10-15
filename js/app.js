/**
 * Oẳn Tù Tì v2 (OTTv2) - Main Application Controller
 * Manages Local 2-Player, AI Engine, and Authoritative Online Multiplayer Room Lobby.
 */

import {
  PLAYERS,
  PIECE_TYPES,
  PIECE_SYMBOLS,
  PIECE_NAMES_VI,
  GAME_STATUS,
  WIN_REASONS,
  sounds
} from './constants.js';

import {
  createInitialBoard,
  createEmptyBoard,
  countPlayerPieces,
  checkWinCondition,
  validateMove,
  posToCoord,
  coordToPos
} from './gameRules.js';

import { BoardRenderer } from './board.js';
import { OttAi } from './ai.js';
import { RenderSyncEngine } from './renderSync.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

class OttApp {
  constructor() {
    this.gameMode = 'LOCAL'; // 'LOCAL' | 'ONLINE' | 'BOT'
    this.boardPreset = 'FRONTLINE'; // 'FRONTLINE' | 'DIAGONAL'
    this.goalMode = 'OPPOSITE'; // P1 reaches I1; P2 reaches A9.
    this.currentTurn = PLAYERS.PLAYER_1;
    this.gameStatus = GAME_STATUS.PLAYING;
    this.board = null;
    this.lastMove = null;
    this.moveHistory = [];
    this.winnerInfo = null;

    // AI engine with 3 levels
    this.ai = new OttAi('hard');

    // Turn Timer (30s countdown)
    this.turnDuration = 30;
    this.timerRemaining = 30;
    this.timerInterval = null;

    this.bothPlayersReady = false;
    this.onlineClockDeadline = null;
    this.onlineClockDuration = 30000;

    // Multiplayer Server Sync Engine
    this.syncEngine = new RenderSyncEngine({
      onRemoteUpdate: (data) => this.handleRemoteUpdate(data),
      onConnectionChange: (connected, msg) => this.handleConnectionChange(connected, msg),
      onRoomJoined: (roomId, role, roomName) => this.handleRoomJoined(roomId, role, roomName),
      onPresenceUpdate: (presence) => this.handlePresenceUpdate(presence),
      onRoomsList: (rooms) => this.renderRoomsList(rooms),
      onTimerUpdate: (timer) => this.handleOnlineTimer(timer),
      onRoomError: (message) => this.showToast(message, 'warning')
    });

    this.dom = {};
  }

  init() {
    this.cacheDomElements();
    this.initBoardRenderer();
    this.bindEvents();

    // Check URL parameters (?room=...)
    const urlRoom = this.syncEngine.getRoomFromUrl();
    if (urlRoom) {
      this.switchMode('ONLINE');
      this.syncEngine.joinRoom(urlRoom, this.syncEngine.getRoleFromUrl());
    } else {
      this.switchMode('LOCAL');
      this.startNewGame();
    }
  }

  cacheDomElements() {
    this.dom = {
      // Containers
      lobbySection: document.getElementById('lobby-section'),
      gameArena: document.getElementById('game-arena'),
      boardContainer: document.getElementById('board-container'),

      // Nav Tabs
      tabModeLocal: document.getElementById('tab-mode-local'),
      tabModeOnline: document.getElementById('tab-mode-online'),
      tabModeBot: document.getElementById('tab-mode-bot'),

      // Header Actions & Status
      onlineStatusBadge: document.getElementById('online-status-badge'),
      btnQuickGuide: document.getElementById('btn-quick-guide'),
      btnRules: document.getElementById('btn-rules'),
      btnSound: document.getElementById('btn-sound'),
      btnNewGame: document.getElementById('btn-new-game'),

      // Lobby Elements
      lobbyRoomNameInput: document.getElementById('lobby-room-name-input'),
      lobbyBtnCreateRoom: document.getElementById('lobby-btn-create-room'),
      lobbyBtnRefresh: document.getElementById('lobby-btn-refresh'),
      lobbyRoomCountBadge: document.getElementById('lobby-room-count-badge'),
      roomsContainer: document.getElementById('rooms-container'),

      // Active Room Bar
      activeRoomBar: document.getElementById('active-room-bar'),
      activeRoomCode: document.getElementById('active-room-code'),
      activeRoomName: document.getElementById('active-room-name'),
      activeRoomRole: document.getElementById('active-room-role'),
      activeRoomPresence: document.getElementById('active-room-presence'),
      btnToggleLobby: document.getElementById('btn-toggle-lobby'),
      btnCopyRoomLink: document.getElementById('btn-copy-room-link'),
      btnRoomReady: document.getElementById('btn-room-ready'),
      btnRoomResetGame: document.getElementById('btn-room-reset-game'),
      btnLeaveRoom: document.getElementById('btn-leave-room'),

      // Player 1 Card
      p1Card: document.getElementById('player1-card'),
      p1DisplayName: document.getElementById('p1-display-name'),
      p1ArmyStatus: document.getElementById('p1-army-status'),
      p1ArmyBar: document.getElementById('p1-army-bar'),
      p1MeterLabel: document.getElementById('p1-meter-label'),
      p1TotalCount: document.getElementById('p1-total-count'),
      p1RockCount: document.getElementById('p1-rock-count'),
      p1PaperCount: document.getElementById('p1-paper-count'),
      p1ScissorsCount: document.getElementById('p1-scissors-count'),

      // Player 2 Card
      p2Card: document.getElementById('player2-card'),
      p2DisplayName: document.getElementById('p2-display-name'),
      p2ArmyStatus: document.getElementById('p2-army-status'),
      p2ArmyBar: document.getElementById('p2-army-bar'),
      p2MeterLabel: document.getElementById('p2-meter-label'),
      p2TotalCount: document.getElementById('p2-total-count'),
      p2RockCount: document.getElementById('p2-rock-count'),
      p2PaperCount: document.getElementById('p2-paper-count'),
      p2ScissorsCount: document.getElementById('p2-scissors-count'),

      // Turn & Helper
      turnBanner: document.getElementById('turn-banner'),
      turnAvatar: document.getElementById('turn-avatar'),
      turnText: document.getElementById('turn-text'),
      turnSubtext: document.getElementById('turn-subtext'),
      turnTimerBadge: document.getElementById('turn-timer-badge'),
      turnTimerText: document.getElementById('turn-timer-text'),
      turnTimerBar: document.getElementById('turn-timer-bar'),
      moveHintText: document.getElementById('move-hint-text'),

      // Controls
      gameModeSelect: document.getElementById('game-mode-select'),
      aiDifficultyGroup: document.getElementById('ai-difficulty-group'),
      aiDifficultySelect: document.getElementById('ai-difficulty-select'),
      presetSelect: document.getElementById('board-preset-select'),

      // Battle Log & Toast
      battleLog: document.getElementById('battle-log'),
      toastAlert: document.getElementById('toast-alert'),

      // Modals
      guideModal: document.getElementById('guide-modal'),
      closeGuideModal: document.getElementById('close-guide-modal'),
      btnGuideGotIt: document.getElementById('btn-guide-got-it'),

      rulesModal: document.getElementById('rules-modal'),
      closeRulesModal: document.getElementById('close-rules-modal'),

      victoryModal: document.getElementById('victory-modal'),
      victoryTitle: document.getElementById('victory-title'),
      victoryDesc: document.getElementById('victory-desc'),
      btnVictoryRestart: document.getElementById('btn-victory-restart')
    };
  }

  initBoardRenderer() {
    this.renderer = new BoardRenderer(this.dom.boardContainer, {
      onMove: (moveData) => this.handleMove(moveData),
      onInvalidClick: (msg) => this.showToast(msg, 'warning'),
      onCellHover: (x, y, coord, selectedPos, board, currentTurn) =>
        this.handleCellHover(x, y, coord, selectedPos, board, currentTurn),
      onCellLeave: () => this.handleCellLeave(),
      onSelectPiece: (piece, coord, validMoves) =>
        this.handlePieceSelected(piece, coord, validMoves)
    });
    this.renderer.initBoard();
  }

  bindEvents() {
    // Mode Switcher Tabs
    this.dom.tabModeLocal.addEventListener('click', () => this.switchMode('LOCAL'));
    this.dom.tabModeOnline.addEventListener('click', () => this.switchMode('ONLINE'));
    this.dom.tabModeBot.addEventListener('click', () => this.switchMode('BOT'));

    // Game Mode Dropdown
    if (this.dom.gameModeSelect) {
      this.dom.gameModeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'MULTIPLAYER') this.switchMode('ONLINE');
        else if (val === 'BOT') this.switchMode('BOT');
        else this.switchMode('LOCAL');
      });
    }

    // AI Difficulty
    if (this.dom.aiDifficultySelect) {
      this.dom.aiDifficultySelect.addEventListener('change', (e) => {
        this.ai.setDifficulty(e.target.value);
        this.addLog(`🤖 AI đã chuyển sang cấp độ: ${e.target.value.toUpperCase()}`, 'info');
      });
    }

    // Preset Select
    if (this.dom.presetSelect) {
      this.dom.presetSelect.addEventListener('change', (e) => {
        if (this.gameMode === 'ONLINE') return;
        this.boardPreset = e.target.value;
        this.startNewGame();
      });
    }

    // New Game Button
    this.dom.btnNewGame.addEventListener('click', () => {
      if (this.gameMode === 'ONLINE' && this.syncEngine.roomId) {
        this.syncEngine.sendResetGame();
      } else {
        this.startNewGame();
      }
    });

    // Sound Button
    this.dom.btnSound.addEventListener('click', () => {
      const isMuted = !sounds.toggle();
      this.dom.btnSound.innerHTML = isMuted ? '🔇 Tắt âm' : '🔊 Âm thanh';
    });

    // Modals
    this.dom.btnRules.addEventListener('click', () => this.dom.rulesModal.classList.add('active'));
    this.dom.closeRulesModal.addEventListener('click', () => this.dom.rulesModal.classList.remove('active'));

    if (this.dom.btnQuickGuide) {
      this.dom.btnQuickGuide.addEventListener('click', () => this.dom.guideModal.classList.add('active'));
    }
    if (this.dom.closeGuideModal) {
      this.dom.closeGuideModal.addEventListener('click', () => this.dom.guideModal.classList.remove('active'));
    }
    if (this.dom.btnGuideGotIt) {
      this.dom.btnGuideGotIt.addEventListener('click', () => this.dom.guideModal.classList.remove('active'));
    }

    // Victory Restart
    this.dom.btnVictoryRestart.addEventListener('click', () => {
      this.dom.victoryModal.classList.remove('active');
      if (this.gameMode === 'ONLINE' && this.syncEngine.roomId) {
        this.syncEngine.sendResetGame();
      } else {
        this.startNewGame();
      }
    });

    // Quick Emoji Reactions
    document.querySelectorAll('.btn-reaction').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.triggerReaction(emoji);
        if (this.gameMode === 'ONLINE' && this.syncEngine.roomId) {
          this.syncEngine.sendReaction(emoji);
        }
      });
    });

    // Lobby: Create Room Button
    this.dom.lobbyBtnCreateRoom.addEventListener('click', () => {
      const roomName = (this.dom.lobbyRoomNameInput.value || '').trim();
      this.syncEngine.createRoom(roomName);
      this.dom.lobbyRoomNameInput.value = '';
    });

    // Lobby: Refresh Rooms
    this.dom.lobbyBtnRefresh.addEventListener('click', () => {
      this.syncEngine.fetchRooms();
      this.showToast('Đang cập nhật danh sách phòng...', 'info');
    });

    if (this.dom.btnToggleLobby) {
      this.dom.btnToggleLobby.addEventListener('click', () => {
        const isShown = this.dom.lobbySection.style.display === 'flex';
        this.dom.lobbySection.style.display = isShown ? 'none' : 'flex';
        this.dom.btnToggleLobby.textContent = isShown ? '📺 Xem các phòng khác' : '🔼 Thu gọn danh sách';
        if (!isShown) {
          this.syncEngine.fetchRooms();
        }
      });
    }

    // Active Room Actions
    this.dom.btnCopyRoomLink.addEventListener('click', () => {
      const link = this.syncEngine.getShareableLink();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => {
          this.showToast('Đã copy liên kết mời vào phòng!', 'success');
        });
      }
    });

    this.dom.btnRoomResetGame.addEventListener('click', () => {
      this.syncEngine.sendResetGame();
    });
    this.dom.btnRoomReady.addEventListener('click', () => this.syncEngine.sendReady());

    this.dom.btnLeaveRoom.addEventListener('click', () => {
      this.syncEngine.leaveRoom();
      this.switchMode('ONLINE');
      this.showToast('Đã rời khỏi phòng đấu.', 'info');
    });
  }

  // -------------------------------------------------------------
  // Mode Switcher Logic
  // -------------------------------------------------------------
  switchMode(newMode) {
    this.gameMode = newMode;
    if (this.dom.presetSelect) this.dom.presetSelect.disabled = newMode === 'ONLINE';

    // Update Nav Tabs Active Class
    this.dom.tabModeLocal.classList.toggle('active', newMode === 'LOCAL');
    this.dom.tabModeOnline.classList.toggle('active', newMode === 'ONLINE');
    this.dom.tabModeBot.classList.toggle('active', newMode === 'BOT');

    if (this.dom.gameModeSelect) {
      if (newMode === 'ONLINE') this.dom.gameModeSelect.value = 'MULTIPLAYER';
      else if (newMode === 'BOT') this.dom.gameModeSelect.value = 'BOT';
      else this.dom.gameModeSelect.value = 'LOCAL';
    }

    if (this.dom.aiDifficultyGroup) {
      this.dom.aiDifficultyGroup.style.display = newMode === 'BOT' ? 'flex' : 'none';
    }

    if (newMode === 'ONLINE') {
      this.stopTurnTimer();
      this.showWaitingForPlayers();
      this.dom.p1ArmyStatus.textContent = 'Chờ người chơi';
      this.dom.p2ArmyStatus.textContent = 'Chờ người chơi';
      // Connect to server and show lobby if not inside a room
      this.syncEngine.connect();
      if (!this.syncEngine.roomId) {
        this.dom.lobbySection.style.display = 'flex';
        this.dom.gameArena.style.display = 'none';
        this.dom.activeRoomBar.style.display = 'none';
        this.syncEngine.fetchRooms();
      } else {
        this.dom.lobbySection.style.display = 'none';
        this.dom.gameArena.style.display = 'grid';
        this.dom.activeRoomBar.style.display = 'flex';
      }
    } else {
      // Local or Bot
      if (this.syncEngine.roomId) {
        this.syncEngine.leaveRoom();
      }
      this.renderer.setLocalRole(null);
      this.dom.lobbySection.style.display = 'none';
      this.dom.gameArena.style.display = 'grid';
      this.dom.activeRoomBar.style.display = 'none';
      this.dom.onlineStatusBadge.style.display = 'none';
      this.dom.p1ArmyStatus.textContent = 'Sẵn sàng';
      this.dom.p2ArmyStatus.textContent = 'Sẵn sàng';
      this.dom.btnNewGame.disabled = false;
      this.dom.btnVictoryRestart.disabled = false;
      this.startNewGame();
    }
  }

  // -------------------------------------------------------------
  // Room Lobby Rendering & Realtime Selection
  // -------------------------------------------------------------
  generateMiniBoardHtml(board) {
    if (!board) return '<div class="mini-board-preview" style="display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:0.65rem;">Trống</div>';
    let cellsHtml = '';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const isLight = (r + c) % 2 === 0;
        const isGoal = (r === 0 && c === 8) || (r === 8 && c === 0);
        const piece = board[r] ? board[r][c] : null;

        let pieceHtml = '';
        if (piece) {
          const pieceClass = (piece.player === 'P1' || piece.player === 'PLAYER_1') ? 'mini-piece-p1' : 'mini-piece-p2';
          pieceHtml = `<div class="${pieceClass}"></div>`;
        }

        cellsHtml += `<div class="mini-cell ${isLight ? 'cell-light' : ''} ${isGoal ? 'is-goal' : ''}">${pieceHtml}</div>`;
      }
    }
    return `<div class="mini-board-preview" title="Bản đồ thế cờ thu nhỏ 9x9; ô đích là I1 và A9">${cellsHtml}</div>`;
  }

  renderRoomsList(rooms) {
    const container = this.dom.roomsContainer;
    if (!container) return;

    if (this.dom.lobbyRoomCountBadge) {
      this.dom.lobbyRoomCountBadge.textContent = `${rooms.length} phòng`;
    }

    if (!rooms || rooms.length === 0) {
      container.innerHTML = `
        <div class="empty-rooms-placeholder">
          <div style="font-size: 1.75rem; margin-bottom: 0.5rem;">📭</div>
          <h4 style="color: #ffffff; margin-bottom: 0.35rem;">Chưa có phòng nào đang mở</h4>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
            Hãy nhập tên phòng ở trên và bấm "Tạo phòng ngay" để trở thành người tạo phòng đầu tiên!
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    rooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'room-card';

      let statusBadgeClass = 'room-badge-waiting';
      let statusText = room.hasP1 ? '🟡 Chờ P2' : room.hasP2 ? '🟡 Chờ P1' : '🟡 Phòng trống';

      if (room.status === 'PLAYING') {
        statusBadgeClass = 'room-badge-playing';
        statusText = `🟢 Đang thi đấu (${room.turn === 'P1' ? 'Lượt P1' : 'Lượt P2'})`;
      } else if (room.status === 'ENDED') {
        statusBadgeClass = 'room-badge-ended';
        statusText = '⚪ Đã kết thúc';
      } else if (room.hasP1 && room.hasP2) {
        statusText = '🟡 Chờ cả hai sẵn sàng';
      }

      card.innerHTML = `
        <div class="room-card-top">
          <span class="room-title-text">
            <span>⚔️</span> ${escapeHtml(room.name || room.id)}
          </span>
          <span class="room-badge-status ${statusBadgeClass}">${statusText}</span>
        </div>

        <div class="room-matchup-box">
          <div class="room-player-side side-p1">
            <span class="room-player-label">Player 1 (Đỏ)</span>
            <span class="room-player-val">${escapeHtml(room.p1Name || (room.hasP1 ? 'Sẵn sàng' : 'Trống'))}</span>
          </div>
          <div class="room-vs-divider">VS</div>
          <div class="room-player-side side-p2">
            <span class="room-player-label">Player 2 (Xanh)</span>
            <span class="room-player-val">${escapeHtml(room.p2Name || (room.hasP2 ? 'Sẵn sàng' : 'Chờ tham gia...'))}</span>
          </div>
        </div>

        <!-- Room State: Mini-Board 9x9 Preview & Live Match Telemetry -->
        <div class="room-state-body">
          ${this.generateMiniBoardHtml(room.board)}
          <div class="room-state-details">
            <div class="state-row">
              <span class="state-label">Lượt hiện tại:</span>
              <span class="state-val" style="color: ${room.turn === 'P1' ? 'var(--p1-light)' : 'var(--p2-light)'};">
                ${room.turn === 'P1' ? '🔴 Player 1 (Đỏ)' : '🔵 Player 2 (Xanh)'}
              </span>
            </div>
            <div class="state-row">
              <span class="state-label">Tiến trình:</span>
              <span class="state-val">${room.moveCount || 0} nước đã đi</span>
            </div>
            ${room.pieceCounts ? `
              <div class="state-row" style="margin-top: 2px;">
                <span class="state-label">Quân P1:</span>
                <span class="state-pieces-chip" style="color: var(--p1-light);">
                  ✊${(room.pieceCounts.P1 || room.pieceCounts.PLAYER_1)?.ROCK ?? 0} ✋${(room.pieceCounts.P1 || room.pieceCounts.PLAYER_1)?.PAPER ?? 0} ✌️${(room.pieceCounts.P1 || room.pieceCounts.PLAYER_1)?.SCISSORS ?? 0} (Σ${(room.pieceCounts.P1 || room.pieceCounts.PLAYER_1)?.total ?? 0})
                </span>
              </div>
              <div class="state-row">
                <span class="state-label">Quân P2:</span>
                <span class="state-pieces-chip" style="color: var(--p2-light);">
                  ✊${(room.pieceCounts.P2 || room.pieceCounts.PLAYER_2)?.ROCK ?? 0} ✋${(room.pieceCounts.P2 || room.pieceCounts.PLAYER_2)?.PAPER ?? 0} ✌️${(room.pieceCounts.P2 || room.pieceCounts.PLAYER_2)?.SCISSORS ?? 0} (Σ${(room.pieceCounts.P2 || room.pieceCounts.PLAYER_2)?.total ?? 0})
                </span>
              </div>
            ` : ''}
            ${room.lastMove ? `
              <div class="state-row" style="margin-top: 2px;">
                <span class="state-label">Nước cuối:</span>
                <span style="font-family: var(--font-mono); color: var(--gold-light); font-size: 0.72rem;">
                  ${escapeHtml(room.lastMove.from)} → ${escapeHtml(room.lastMove.to)} ${room.lastMove.isCapture ? '⚔️' : ''}
                </span>
              </div>
            ` : ''}
            ${room.winner ? `
              <div class="state-row" style="margin-top: 2px; color: var(--gold); font-weight: 800;">
                <span>🏆 Thắng:</span>
                <span>${room.winner === 'PLAYER_1' || room.winner === 'P1' ? 'Player 1' : 'Player 2'}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="room-card-footer">
          <div class="room-card-info">
            Mã: <code style="color: var(--gold-light);">${escapeHtml(room.id)}</code> · 👁️ ${Number(room.spectators) || 0} khán giả
          </div>
          <div class="room-card-actions">
            ${(!room.hasP1 || !room.hasP2) && room.status !== 'ENDED' ? `
              <button class="btn btn-primary btn-sm btn-join-player" data-room="${escapeHtml(room.id)}" data-role="${room.hasP1 ? 'P2' : 'P1'}">
                ⚔️ Vào chơi (${room.hasP1 ? 'P2' : 'P1'})
              </button>
            ` : `
              <button class="btn btn-sm btn-spectate" data-room="${escapeHtml(room.id)}">
                👁️ Xem trực tiếp
              </button>
            `}
            <button class="btn btn-sm btn-copy-card-link" data-room="${escapeHtml(room.id)}" title="Copy link phòng">
              📋 Link
            </button>
          </div>
        </div>
      `;

      // Event listener for Join P2
      const btnJoin = card.querySelector('.btn-join-player');
      if (btnJoin) {
        btnJoin.addEventListener('click', () => {
          this.syncEngine.joinRoom(room.id, btnJoin.dataset.role);
        });
      }

      // Event listener for Spectate
      const btnSpec = card.querySelector('.btn-spectate');
      if (btnSpec) {
        btnSpec.addEventListener('click', () => {
          this.syncEngine.joinRoom(room.id, 'SPECTATOR');
        });
      }

      // Event listener for Copy Link
      const btnCopy = card.querySelector('.btn-copy-card-link');
      if (btnCopy) {
        btnCopy.addEventListener('click', () => {
          const url = new URL(window.location.href);
          url.searchParams.set('room', room.id);
          url.searchParams.delete('role');
          if (navigator.clipboard) {
            navigator.clipboard.writeText(url.toString()).then(() => {
              this.showToast(`Đã copy link phòng ${room.id}!`, 'success');
            });
          }
        });
      }

      container.appendChild(card);
    });
  }

  // -------------------------------------------------------------
  // Gameplay Engine
  // -------------------------------------------------------------
  startNewGame() {
    this.board = createInitialBoard(this.boardPreset);
    this.currentTurn = PLAYERS.PLAYER_1;
    this.gameStatus = GAME_STATUS.PLAYING;
    this.lastMove = null;
    this.moveHistory = [];
    this.winnerInfo = null;

    this.renderer.clearSelection();
    this.renderer.setInteractive(true);
    this.renderer.render(this.board, this.currentTurn, this.lastMove);

    this.updateStatsDisplay();
    this.updateTurnDisplay();
    this.startTurnTimer();

    this.dom.battleLog.innerHTML = '<div class="log-entry info">Trận đấu bắt đầu! Player 1 đi trước. P1 đến I1, P2 đến A9.</div>';
    this.showToast('Bắt đầu ván mới!', 'info');
  }

  startTurnTimer() {
    if (this.gameMode === 'ONLINE') return;
    this.stopTurnTimer();
    this.timerRemaining = this.turnDuration;
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      if (this.gameStatus === GAME_STATUS.ENDED) {
        this.stopTurnTimer();
        return;
      }

      this.timerRemaining--;
      this.updateTimerDisplay();

      if (this.timerRemaining <= 0) {
        this.stopTurnTimer();
        this.handleTurnTimeout();
      }
    }, 1000);
  }

  stopTurnTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  updateTimerDisplay() {
    if (!this.dom.turnTimerText) return;
    this.dom.turnTimerText.textContent = `${this.timerRemaining}s`;

    const pct = Math.max(0, Math.min(100, (this.timerRemaining / this.turnDuration) * 100));
    if (this.dom.turnTimerBar) {
      this.dom.turnTimerBar.style.width = `${pct}%`;
    }
  }

  handleTurnTimeout() {
    if (this.gameMode === 'ONLINE') return;
    this.addLog(`⏱️ Hết thời gian 30s! Chuyển lượt đi.`, 'warning');
    this.showToast('Hết 30s lượt đi, tự động đổi lượt!', 'warning');
    sounds.block();

    this.currentTurn = this.currentTurn === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;
    this.renderer.clearSelection();
    this.renderer.render(this.board, this.currentTurn, this.lastMove);
    this.updateTurnDisplay();
    this.startTurnTimer();

    if (this.gameMode === 'BOT' && this.currentTurn === PLAYERS.PLAYER_2) {
      this.executeAiTurn();
    }
  }

  handleMove(moveData) {
    if (this.gameStatus === GAME_STATUS.ENDED) return;

    const { from, to, piece, isCapture, capturedPiece, fromPos, toPos } = moveData;

    // In Online mode, send authoritative move to server
    if (this.gameMode === 'ONLINE' && this.syncEngine.roomId) {
      this.syncEngine.sendAuthoritativeMove(from, to);
      return;
    }

    // Local or Bot execution
    this.board[fromPos.y][fromPos.x] = null;
    this.board[toPos.y][toPos.x] = piece;

    this.lastMove = { from, to, player: piece.player, pieceType: piece.type };
    this.moveHistory.push(this.lastMove);

    const playerText = piece.player === PLAYERS.PLAYER_1 ? 'Player 1' : 'Player 2';
    const pieceIcon = PIECE_SYMBOLS[piece.type];
    const pieceName = PIECE_NAMES_VI[piece.type];

    if (isCapture && capturedPiece) {
      const enemyName = PIECE_NAMES_VI[capturedPiece.type];
      const enemyIcon = PIECE_SYMBOLS[capturedPiece.type];
      this.addLog(
        `⚔️ <strong>${playerText}</strong>: ${pieceIcon} ${pieceName} đã ăn ${enemyIcon} ${enemyName}! (${from} → ${to})`,
        'capture'
      );
      this.showToast(`${playerText}: ${pieceName} đã ăn ${enemyName}!`, 'success');
      sounds.capture();
    } else {
      this.addLog(`➡️ <strong>${playerText}</strong>: ${pieceIcon} ${pieceName} di chuyển đến ${to}`);
      sounds.move();
    }

    // Check whether the mover reached the opponent's goal.
    const win = checkWinCondition(this.board, this.lastMove, this.goalMode);
    if (win.hasWinner) {
      this.stopTurnTimer();
      this.gameStatus = GAME_STATUS.ENDED;
      this.winnerInfo = win;
      this.renderer.setInteractive(false);
      this.renderer.render(this.board, this.currentTurn, this.lastMove);
      this.updateStatsDisplay();
      this.handleVictory(win);
      return;
    }

    // Next turn
    this.currentTurn = this.currentTurn === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;
    this.renderer.render(this.board, this.currentTurn, this.lastMove);
    this.updateStatsDisplay();
    this.updateTurnDisplay();
    this.startTurnTimer();

    // AI Bot Turn
    if (this.gameMode === 'BOT' && this.currentTurn === PLAYERS.PLAYER_2 && this.gameStatus === GAME_STATUS.PLAYING) {
      this.executeAiTurn();
    }
  }

  executeAiTurn() {
    this.renderer.setInteractive(false);
    this.dom.turnText.textContent = `Máy đang tư duy...`;

    setTimeout(() => {
      if (this.gameStatus === GAME_STATUS.ENDED) return;
      const aiMove = this.ai.getBestMove(this.board, PLAYERS.PLAYER_2, this.goalMode);

      this.renderer.setInteractive(true);
      if (aiMove) {
        this.handleMove(aiMove);
      } else {
        this.handleVictory({
          hasWinner: true,
          winner: PLAYERS.PLAYER_1,
          details: 'Đối phương không còn nước đi hợp lệ!'
        });
      }
    }, 450);
  }

  handleVictory(win) {
    this.stopTurnTimer();
    sounds.victory();
    const winnerName = win.winner === PLAYERS.PLAYER_1 ? 'Player 1' : 'Player 2';
    this.addLog(`🏆 <strong>${winnerName} WIN!</strong> ${win.details}`, 'win');
    this.showToast(`${winnerName} WIN!`, 'success');

    this.dom.victoryTitle.textContent = `🏆 ${winnerName} WIN!`;
    this.dom.victoryDesc.textContent = win.details || 'Chúc mừng bạn đã giành chiến thắng!';
    this.dom.victoryModal.classList.add('active');
  }

  updateStatsDisplay() {
    const counts = countPlayerPieces(this.board);

    // Player 1
    const p1 = counts[PLAYERS.PLAYER_1];
    this.dom.p1RockCount.textContent = p1[PIECE_TYPES.ROCK];
    this.dom.p1PaperCount.textContent = p1[PIECE_TYPES.PAPER];
    this.dom.p1ScissorsCount.textContent = p1[PIECE_TYPES.SCISSORS];
    this.dom.p1TotalCount.textContent = p1.total;

    const p1Pct = Math.min(100, Math.round((p1.total / 15) * 100));
    if (this.dom.p1ArmyBar) this.dom.p1ArmyBar.style.width = `${p1Pct}%`;
    if (this.dom.p1MeterLabel) this.dom.p1MeterLabel.innerHTML = `<strong>${p1.total}</strong> / 15 quân (${p1Pct}%)`;

    // Player 2
    const p2 = counts[PLAYERS.PLAYER_2];
    this.dom.p2RockCount.textContent = p2[PIECE_TYPES.ROCK];
    this.dom.p2PaperCount.textContent = p2[PIECE_TYPES.PAPER];
    this.dom.p2ScissorsCount.textContent = p2[PIECE_TYPES.SCISSORS];
    this.dom.p2TotalCount.textContent = p2.total;

    const p2Pct = Math.min(100, Math.round((p2.total / 15) * 100));
    if (this.dom.p2ArmyBar) this.dom.p2ArmyBar.style.width = `${p2Pct}%`;
    if (this.dom.p2MeterLabel) this.dom.p2MeterLabel.innerHTML = `<strong>${p2.total}</strong> / 15 quân (${p2Pct}%)`;
  }

  updateTurnDisplay() {
    const isP1 = this.currentTurn === PLAYERS.PLAYER_1;
    this.dom.turnBanner.className = `turn-banner turn-${this.currentTurn.toLowerCase()}`;
    if (this.dom.turnAvatar) this.dom.turnAvatar.textContent = isP1 ? 'P1' : 'P2';

    if (this.gameMode === 'BOT' && !isP1) {
      this.dom.turnText.textContent = `Lượt của Máy (AI)`;
      if (this.dom.turnSubtext) this.dom.turnSubtext.textContent = 'Máy tính đang suy nghĩ...';
    } else {
      this.dom.turnText.textContent = `Lượt của ${isP1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)'}`;
      if (this.dom.turnSubtext) {
        this.dom.turnSubtext.textContent = isP1
          ? 'Phe Đỏ · Chọn 1 quân cờ để di chuyển 1 ô theo 8 hướng'
          : 'Phe Xanh · Chọn 1 quân cờ để di chuyển 1 ô theo 8 hướng';
      }
    }

    this.dom.p1Card.classList.toggle('active-turn', isP1);
    this.dom.p2Card.classList.toggle('active-turn', !isP1);

    if (this.dom.moveHintText) {
      this.dom.moveHintText.innerHTML = `💡 Lượt của <strong>${isP1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)'}</strong>. Click một quân của bạn để xem 8 hướng di chuyển.`;
    }
    if (this.gameMode === 'ONLINE' && !this.bothPlayersReady) {
      this.dom.turnText.textContent = 'Đang chờ hai người sẵn sàng…';
      if (this.dom.turnSubtext) this.dom.turnSubtext.textContent = 'Mỗi người bấm “Sẵn sàng” để bắt đầu đồng hồ.';
    }
  }

  handlePieceSelected(piece, coord, validMoves) {
    if (!this.dom.moveHintText) return;
    const pieceName = PIECE_NAMES_VI[piece.type] || piece.type;
    const count = validMoves.length;
    this.dom.moveHintText.innerHTML = `🎯 Đã chọn quân <strong>${pieceName} [${coord}]</strong>: Có <strong>${count}</strong> nước đi hợp lệ.`;
  }

  handleCellHover(x, y, coord, selectedPos, board, currentTurn) {
    if (!this.dom.moveHintText || !selectedPos) return;

    const { x: selX, y: selY } = selectedPos;
    const selPiece = board[selY][selX];
    if (!selPiece) return;

    const selCoord = posToCoord(selX, selY);
    const selName = PIECE_NAMES_VI[selPiece.type] || selPiece.type;

    if (x === selX && y === selY) {
      this.dom.moveHintText.innerHTML = `🎯 Đang chọn <strong>${selName}</strong> tại [<strong>${selCoord}</strong>]. Click lại để bỏ chọn.`;
      return;
    }

    const check = validateMove(board, { from: selCoord, to: coord, player: currentTurn }, currentTurn);
    const targetPiece = board[y][x];

    if (check.valid) {
      if (check.isCapture && targetPiece) {
        const targetName = PIECE_NAMES_VI[targetPiece.type] || targetPiece.type;
        this.dom.moveHintText.innerHTML = `⚔️ <strong>ĂN QUÂN HỢP LỆ</strong>: ${selName} ăn ${targetName} tại [<strong>${coord}</strong>]!`;
      } else if (coord === 'A9' || coord === 'I1') {
        this.dom.moveHintText.innerHTML = `👑 <strong>ĐỘT KÍCH Ô ĐÍCH [${coord}]</strong>: Vào ô này để THẮNG NGAY!`;
      } else {
        this.dom.moveHintText.innerHTML = `➡️ Di chuyển 1 ô đến ô trống [<strong>${coord}</strong>].`;
      }
    } else {
      if (targetPiece) {
        const targetName = PIECE_NAMES_VI[targetPiece.type] || targetPiece.type;
        if (targetPiece.player === currentTurn) {
          this.dom.moveHintText.innerHTML = `🤝 Ô [<strong>${coord}</strong>] đã có quân cùng phe (${targetName}).`;
        } else if (targetPiece.type === selPiece.type) {
          this.dom.moveHintText.innerHTML = `🛡️ <strong>CHẶN ĐƯỜNG</strong>: Hai quân ${selName} cùng loại không thể ăn nhau!`;
        } else {
          this.dom.moveHintText.innerHTML = `⚠️ <strong>BỊ KHẮC CHẾ</strong>: Quân ${selName} không thể tấn công ${targetName}!`;
        }
      } else {
        this.dom.moveHintText.innerHTML = `🚫 ${check.reason || 'Nước đi không hợp lệ'}`;
      }
    }
  }

  handleCellLeave() {
    if (!this.dom.moveHintText) return;
    const isP1 = this.currentTurn === PLAYERS.PLAYER_1;
    this.dom.moveHintText.innerHTML = `💡 Lượt của <strong>${isP1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)'}</strong>. Click một quân của bạn để xem 8 hướng di chuyển.`;
  }

  addLog(msg, type = 'normal') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = `<span style="color:var(--text-dim);font-family:var(--font-mono);font-size:0.7rem;">[${time}]</span> ${msg}`;
    this.dom.battleLog.prepend(entry);
  }

  showToast(msg, type = 'info') {
    const toast = this.dom.toastAlert;
    toast.textContent = msg;
    toast.className = `toast show`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  triggerReaction(emoji) {
    this.addLog(`💬 Thả biểu cảm: ${emoji}`, 'info');
  }

  showWaitingForPlayers(label = 'Chờ sẵn sàng') {
    this.onlineClockDeadline = null;
    if (this.dom.turnTimerText) this.dom.turnTimerText.textContent = label;
    if (this.dom.turnTimerBar) this.dom.turnTimerBar.style.width = '0%';
  }

  handleOnlineTimer(timer) {
    if (this.gameMode !== 'ONLINE') return;
    this.stopTurnTimer();
    if (!timer.active || timer.remainingMs === null) {
      this.showWaitingForPlayers(timer.gameEnded ? 'Đã kết thúc' : 'Chờ sẵn sàng');
      return;
    }
    this.onlineClockDuration = timer.durationMs;
    this.onlineClockDeadline = Date.now() + timer.remainingMs;
    const update = () => {
      const remaining = Math.max(0, this.onlineClockDeadline - Date.now());
      this.dom.turnTimerText.textContent = `${Math.ceil(remaining / 1000)}s`;
      this.dom.turnTimerBar.style.width = `${Math.min(100, remaining / this.onlineClockDuration * 100)}%`;
    };
    update();
    this.timerInterval = setInterval(update, 250);
  }

  // -------------------------------------------------------------
  // Multiplayer WebSocket Event Handlers
  // -------------------------------------------------------------
  handleRoomJoined(roomId, role, roomName) {
    if (!roomId) {
      this.bothPlayersReady = false;
      this.stopTurnTimer();
      this.showWaitingForPlayers();
      this.dom.btnNewGame.disabled = false;
      // Left room
      this.dom.lobbySection.style.display = 'flex';
      this.dom.gameArena.style.display = 'none';
      this.dom.activeRoomBar.style.display = 'none';
      this.dom.onlineStatusBadge.style.display = 'none';
      return;
    }

    this.dom.lobbySection.style.display = 'none';
    this.dom.gameArena.style.display = 'grid';
    this.dom.activeRoomBar.style.display = 'flex';

    this.dom.activeRoomCode.textContent = roomId;
    this.dom.activeRoomName.textContent = roomName || `Phòng ${roomId}`;

    let roleText = 'Khán giả';
    let roleClass = 'room-role-spec';
    if (role === 'P1') {
      roleText = 'Bạn là: Player 1 (Đỏ)';
      roleClass = 'room-role-p1';
    } else if (role === 'P2') {
      roleText = 'Bạn là: Player 2 (Xanh)';
      roleClass = 'room-role-p2';
    }

    this.dom.activeRoomRole.textContent = roleText;
    this.dom.activeRoomRole.className = `room-role-chip ${roleClass}`;

    this.renderer.setLocalRole(role);
    const isPlayer = role === 'P1' || role === 'P2';
    this.dom.btnNewGame.disabled = !isPlayer;
    this.dom.btnRoomResetGame.disabled = !isPlayer;
    this.dom.btnVictoryRestart.disabled = !isPlayer;
    this.dom.btnRoomReady.disabled = role !== 'P1' && role !== 'P2';
    this.dom.btnRoomReady.textContent = '✅ Sẵn sàng';

    this.dom.onlineStatusBadge.style.display = 'inline-flex';
    this.dom.onlineStatusBadge.className = 'status-badge online';
    this.dom.onlineStatusBadge.textContent = `● Online: ${roomId}`;

    this.showToast(`Đã vào phòng ${roomId}! (${roleText})`, 'success');
    this.addLog(`🌐 Đã tham gia phòng <strong>${escapeHtml(roomId)}</strong> với vai trò: <strong>${roleText}</strong>`, 'info');
  }

  handleConnectionChange(connected, msg) {
    if (connected) {
      this.dom.onlineStatusBadge.className = 'status-badge online';
      this.dom.onlineStatusBadge.textContent = `● Server Online`;
      if (msg?.startsWith('⚠️')) this.showToast(msg, 'warning');
    } else {
      this.stopTurnTimer();
      if (this.gameMode === 'ONLINE') this.showWaitingForPlayers();
      this.renderer.setInteractive(false);
      this.dom.btnRoomReady.disabled = true;
      this.dom.onlineStatusBadge.className = 'status-badge offline';
      this.dom.onlineStatusBadge.textContent = `○ Server Offline`;
      if (msg) this.showToast(msg, 'warning');
    }
  }

  handlePresenceUpdate(presence) {
    if (!presence || !this.dom.activeRoomPresence) return;

    this.bothPlayersReady = Boolean(presence.p1 && presence.p2 && presence.ready?.p1 && presence.ready?.p2);
    this.dom.p1ArmyStatus.textContent = !presence.p1 ? 'Chờ người chơi' : presence.ready?.p1 ? 'Đã sẵn sàng' : 'Chưa sẵn sàng';
    this.dom.p2ArmyStatus.textContent = !presence.p2 ? 'Chờ người chơi' : presence.ready?.p2 ? 'Đã sẵn sàng' : 'Chưa sẵn sàng';
    const role = this.syncEngine.myRole;
    const ownReady = role === 'P1' ? presence.ready?.p1 : role === 'P2' ? presence.ready?.p2 : false;
    this.dom.btnRoomReady.disabled = !this.syncEngine.isOnline || !['P1', 'P2'].includes(role) || ownReady || this.gameStatus === GAME_STATUS.ENDED;
    this.dom.btnRoomReady.textContent = ownReady ? '✓ Đã sẵn sàng' : '✅ Sẵn sàng';
    this.renderer.setInteractive(this.bothPlayersReady && this.gameStatus !== GAME_STATUS.ENDED &&
      (this.syncEngine.myRole === 'P1' || this.syncEngine.myRole === 'P2'));
    this.updateTurnDisplay();

    if (this.bothPlayersReady) {
      this.dom.activeRoomPresence.className = 'room-badge-status room-badge-playing';
      this.dom.activeRoomPresence.textContent = '🟢 Cả 2 người chơi đã sẵn sàng!';
    } else {
      this.dom.activeRoomPresence.className = 'room-badge-status room-badge-waiting';
      this.dom.activeRoomPresence.textContent = `🟡 P1 ${presence.ready?.p1 ? '✓' : '○'} · P2 ${presence.ready?.p2 ? '✓' : '○'} — chờ sẵn sàng`;
    }
  }

  handleRemoteUpdate(data) {
    if (!data) return;

    if (data.reaction) {
      this.triggerReaction(data.reaction);
      return;
    }

    if (!data.gameState) return;
    const { board, currentTurn, status, lastMove, winnerInfo } = data.gameState;

    this.board = board;
    this.currentTurn = currentTurn;
    this.gameStatus = status;
    this.lastMove = lastMove;
    this.winnerInfo = winnerInfo;

    this.renderer.render(this.board, this.currentTurn, this.lastMove);
    this.updateStatsDisplay();
    this.updateTurnDisplay();
    if (data.timedOutRole) {
      this.addLog(`⏱️ ${data.timedOutRole} hết 30 giây; server đã chuyển lượt.`, 'warning');
    }

    if (data.lastMove) {
      if (data.lastMove.isCapture) {
        sounds.capture();
        this.addLog(`⚔️ Đối thủ vừa ăn quân! (${data.lastMove.from} → ${data.lastMove.to})`, 'capture');
      } else {
        sounds.move();
        this.addLog(`➡️ Đối thủ vừa di chuyển: ${data.lastMove.from} → ${data.lastMove.to}`);
      }
    }

    if (status === GAME_STATUS.ENDED && winnerInfo) {
      this.handleVictory(winnerInfo);
    } else if (this.gameMode === 'ONLINE') {
      this.renderer.setInteractive(this.bothPlayersReady &&
        (this.syncEngine.myRole === 'P1' || this.syncEngine.myRole === 'P2'));
    }
  }
}

// Start app
window.addEventListener('DOMContentLoaded', () => {
  window.ottApp = new OttApp();
  window.ottApp.init();
});
