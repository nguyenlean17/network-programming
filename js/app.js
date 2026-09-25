/**
 * Playchess Arena · Oẳn Tù Tì v2 (OTTv2) - Main Application Controller
 * Orchestrates game rules, board renderer, 15-piece original frontline strategy,
 * 30s turn timer, dual digital LCD chess clocks, network ping RTT monitor,
 * Playchess dock sidebar, and Supabase / playhtml multiplayer sync.
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
  getValidMovesForPiece
} from './gameRules.js';

import { BoardRenderer } from './board.js';
import { RenderSyncEngine } from './renderSync.js';
import { SupabaseSyncEngine } from './supabaseSync.js';
import { PlayhtmlSyncEngine } from './playhtmlSync.js';

class OttApp {
  constructor() {
    this.gameMode = 'LOCAL'; // 'LOCAL', 'MULTIPLAYER'
    this.boardPreset = 'FRONTLINE'; // 'FRONTLINE' (15 quân nguyên bản) | 'DIAGONAL' | 'CHESS_9'
    this.goalMode = 'OPPOSITE'; // P1 (row 9) -> A1 (row 1) | P2 (row 1) -> I9 (row 9)
    this.currentTurn = PLAYERS.PLAYER_1;
    this.gameStatus = GAME_STATUS.PLAYING;
    this.board = null;
    this.lastMove = null;
    this.moveHistory = [];
    this.winnerInfo = null;

    // Dual Chess Clocks (300s = 5 phút mỗi bên)
    this.clockP1Seconds = 300;
    this.clockP2Seconds = 300;
    this.capturedPiecesP1 = []; // Quân bị P1 ăn
    this.capturedPiecesP2 = []; // Quân bị P2 ăn

    // Multi-board Live Spectator State (2x2 Grid)
    this.multiBoardPage = 1;
    this.multiBoardFilter = 'ALL';
    this.multiBoardRooms = [];
    this.multiBoardSimInterval = null;

    // Turn Timer (30s countdown)
    this.turnDuration = 30;
    this.timerRemaining = 30;
    this.timerInterval = null;

    // Ping RTT monitor
    this.pingInterval = null;

    // Internet WebSocket Server Multiplayer sync (Render.com / Local Node Server)
    this.renderSync = new RenderSyncEngine({
      onRemoteUpdate: (data) => this.handleRemoteUpdate(data),
      onConnectionChange: (connected, msg) => this.handleConnectionChange(connected, msg),
      onRoomJoined: (roomId, role, roomName) => this.handleRoomJoined(roomId, role, roomName),
      onPresenceUpdate: (presence) => this.handlePresenceUpdate(presence),
      onRoomsList: (rooms) => this.renderRoomsList(rooms)
    });

    // Supabase Realtime Serverless Multiplayer sync
    this.supabaseSync = new SupabaseSyncEngine({
      onRemoteUpdate: (data) => this.handleRemoteUpdate(data),
      onConnectionChange: (connected, msg) => this.handleConnectionChange(connected, msg),
      onRoomJoined: (roomId, role) => this.handleRoomJoined(roomId, role),
      onPresenceUpdate: (presence) => this.handlePresenceUpdate(presence)
    });

    // Active sync engine defaults to RenderSyncEngine (WebSocket Internet)
    this.syncEngine = this.renderSync;

    // Elements
    this.dom = {};
  }

  init() {
    this.cacheDomElements();
    this.initBoardRenderer();
    this.bindEvents();
    this.startPingMonitor();

    // Check URL for room parameter (?room=...)
    const urlRoom = this.syncEngine.getRoomFromUrl();
    if (urlRoom) {
      this.gameMode = 'MULTIPLAYER';
      if (this.dom.gameModeSelect) this.dom.gameModeSelect.value = 'MULTIPLAYER';
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role');
      const role = (roleParam === 'SPECTATOR' || roleParam === 'P1' || roleParam === 'P2') ? roleParam : 'P2';
      this.syncEngine.joinRoom(urlRoom, role, this.getSerializableState());
    }

    this.startNewGame();
  }

  cacheDomElements() {
    this.dom = {
      boardContainer: document.getElementById('board-container'),
      // Lobby & Active Room Bar Elements
      lobbyRoomNameInput: document.getElementById('lobby-room-name-input'),
      lobbyBtnCreateRoom: document.getElementById('lobby-btn-create-room'),
      lobbyBtnRefresh: document.getElementById('lobby-btn-refresh'),
      lobbyRoomCountBadge: document.getElementById('lobby-room-count-badge'),
      roomsContainer: document.getElementById('rooms-container'),
      activeRoomBar: document.getElementById('active-room-bar'),
      activeRoomCode: document.getElementById('active-room-code'),
      activeRoomName: document.getElementById('active-room-name'),
      activeRoomRole: document.getElementById('active-room-role'),
      activeRoomPresence: document.getElementById('active-room-presence'),
      btnToggleLobby: document.getElementById('btn-toggle-lobby'),
      btnCopyRoomLink: document.getElementById('btn-copy-room-link'),
      btnRoomResetGame: document.getElementById('btn-room-reset-game'),
      btnLeaveRoom: document.getElementById('btn-leave-room'),
      turnBanner: document.getElementById('turn-banner'),
      turnText: document.getElementById('turn-text'),
      turnBadge: document.getElementById('turn-badge'),
      turnAvatar: document.getElementById('turn-avatar'),
      turnSubtext: document.getElementById('turn-subtext'),
      turnTimerBadge: document.getElementById('turn-timer-badge'),
      turnTimerText: document.getElementById('turn-timer-text'),
      turnTimerBar: document.getElementById('turn-timer-bar'),
      moveHintText: document.getElementById('move-hint-text'),
      pingBadge: document.getElementById('ping-badge'),
      battleLog: document.getElementById('battle-log'),
      toastAlert: document.getElementById('toast-alert'),

      // Player 1 Cards
      p1Card: document.getElementById('player1-card'),
      p1RockCount: document.getElementById('p1-rock-count'),
      p1PaperCount: document.getElementById('p1-paper-count'),
      p1ScissorsCount: document.getElementById('p1-scissors-count'),
      p1TotalCount: document.getElementById('p1-total-count'),
      p1ArmyStatus: document.getElementById('p1-army-status'),
      p1ArmyBar: document.getElementById('p1-army-bar'),
      p1MeterLabel: document.getElementById('p1-meter-label'),

      // Player 2 Cards
      p2Card: document.getElementById('player2-card'),
      p2RockCount: document.getElementById('p2-rock-count'),
      p2PaperCount: document.getElementById('p2-paper-count'),
      p2ScissorsCount: document.getElementById('p2-scissors-count'),
      p2TotalCount: document.getElementById('p2-total-count'),
      p2ArmyStatus: document.getElementById('p2-army-status'),
      p2ArmyBar: document.getElementById('p2-army-bar'),
      p2MeterLabel: document.getElementById('p2-meter-label'),

      // Controls
      gameModeSelect: document.getElementById('game-mode-select'),
      newGameBtn: document.getElementById('btn-new-game'),
      rulesBtn: document.getElementById('btn-rules'),
      btnQuickGuide: document.getElementById('btn-quick-guide'),
      soundBtn: document.getElementById('btn-sound'),
      onlineBtn: document.getElementById('btn-online-room'),
      presetSelect: document.getElementById('board-preset-select'),

      // Playchess Dock Sidebar Tabs & Panes
      tabBtnNotation: document.getElementById('tab-btn-notation'),
      tabBtnLobby: document.getElementById('tab-btn-lobby'),
      tabBtnChat: document.getElementById('tab-btn-chat'),
      paneNotation: document.getElementById('pane-notation'),
      paneLobby: document.getElementById('pane-lobby'),
      paneChat: document.getElementById('pane-chat'),

      // Playchess Dock Lobby Quick Actions
      btnDockCreateRoom: document.getElementById('btn-dock-create-room'),
      dockRoomCodeInput: document.getElementById('dock-room-code-input'),
      btnDockJoinRoom: document.getElementById('btn-dock-join-room'),

      // Playchess Move Notation Navigation Buttons
      btnNotationStart: document.getElementById('btn-notation-start'),
      btnNotationPrev: document.getElementById('btn-notation-prev'),
      btnNotationNext: document.getElementById('btn-notation-next'),
      btnNotationEnd: document.getElementById('btn-notation-end'),

      // Room Modal & Supabase Cloud
      roomModal: document.getElementById('room-modal'),
      closeRoomModal: document.getElementById('close-room-modal'),
      roomCodeInput: document.getElementById('room-code-input'),
      btnJoinRoom: document.getElementById('btn-join-room'),
      btnCreateRoom: document.getElementById('btn-create-room'),
      roomInfoBox: document.getElementById('room-info-box'),
      currentRoomCode: document.getElementById('current-room-code'),
      btnCopyLink: document.getElementById('btn-copy-link'),
      roleP1Btn: document.getElementById('role-p1'),
      roleP2Btn: document.getElementById('role-p2'),
      roleSpecBtn: document.getElementById('role-spec'),
      onlineStatusBadge: document.getElementById('online-status-badge'),

      // Supabase Modal & Presence
      sbStatusText: document.getElementById('sb-status-text'),
      btnOpenSbConfig: document.getElementById('btn-open-supabase-config'),
      sbConfigModal: document.getElementById('supabase-config-modal'),
      closeSbConfigModal: document.getElementById('close-supabase-config'),
      btnSaveSbConfig: document.getElementById('btn-save-supabase-config'),
      sbCfgUrl: document.getElementById('sb-cfg-url'),
      sbCfgKey: document.getElementById('sb-cfg-key'),
      sbCfgName: document.getElementById('sb-cfg-name'),
      presenceP1: document.getElementById('presence-p1'),
      presenceP2: document.getElementById('presence-p2'),
      presenceSpecs: document.getElementById('presence-specs'),

      // Quick Guide Modal
      guideModal: document.getElementById('guide-modal'),
      closeGuideModal: document.getElementById('close-guide-modal'),
      btnGuideGotIt: document.getElementById('btn-guide-got-it'),

      // Rules Modal
      rulesModal: document.getElementById('rules-modal'),
      closeRulesModal: document.getElementById('close-rules-modal'),

      // Victory Overlay
      victoryModal: document.getElementById('victory-modal'),
      victoryTitle: document.getElementById('victory-title'),
      victoryDesc: document.getElementById('victory-desc'),
      btnVictoryRestart: document.getElementById('btn-victory-restart'),

      // Chess Dual Clocks & Strips
      chessStripP1: document.getElementById('chess-strip-p1'),
      chessStripP2: document.getElementById('chess-strip-p2'),
      clockDisplayP1: document.getElementById('clock-display-p1'),
      clockDisplayP2: document.getElementById('clock-display-p2'),
      capturedByP1: document.getElementById('captured-by-p1'),
      capturedByP2: document.getElementById('captured-by-p2'),
      materialAdvP1: document.getElementById('material-adv-p1'),
      materialAdvP2: document.getElementById('material-adv-p2'),

      // Chess Action Toolbar
      btnFlipBoard: document.getElementById('btn-flip-board'),
      btnResign: document.getElementById('btn-resign'),
      btnDraw: document.getElementById('btn-draw'),
      boardThemeSelect: document.getElementById('board-theme-select'),

      // Chess Move Notation Panel
      chessNotationList: document.getElementById('chess-notation-list'),
      notationTotalMoves: document.getElementById('notation-total-moves'),

      // 2x2 Multi-Board Live Spectator Modal
      btnMultiBoard: document.getElementById('btn-multi-board'),
      btnOpenMultiBoard: document.getElementById('btn-open-multi-board'),
      multiBoardModal: document.getElementById('multi-board-modal'),
      closeMultiBoardModal: document.getElementById('close-multi-board-modal'),
      modalMultiBoardGrid: document.getElementById('modal-multi-board-grid'),
      modalPaginationBar: document.getElementById('modal-pagination-bar'),
      modalFilterTabs: document.getElementById('modal-filter-tabs')
    };
  }

  initBoardRenderer() {
    this.renderer = new BoardRenderer(this.dom.boardContainer, {
      onMove: (moveData) => this.handleMove(moveData),
      onInvalidClick: (msg) => this.showToast(msg, 'warning'),
      onCellHover: (x, y, coord, selectedPos, board, currentTurn) => this.handleCellHover(x, y, coord, selectedPos, board, currentTurn),
      onCellLeave: () => this.handleCellLeave(),
      onSelectPiece: (piece, coord, validMoves) => this.handlePieceSelected(piece, coord, validMoves)
    });
    this.renderer.initBoard();
  }

  bindEvents() {
    this.dom.newGameBtn.addEventListener('click', () => {
      this.startNewGame();
      if (this.gameMode === 'MULTIPLAYER') {
        this.syncEngine.broadcastGameState(this.getSerializableState(), null);
      }
    });

    this.dom.gameModeSelect.addEventListener('change', (e) => {
      this.gameMode = e.target.value;

      if (this.gameMode === 'MULTIPLAYER') {
        this.openRoomModal();
      } else {
        this.syncEngine.updateUrl(null);
        this.renderer.setLocalRole(null);
        this.dom.onlineStatusBadge.style.display = 'none';
        this.startNewGame();
      }
    });

    if (this.dom.presetSelect) {
      this.dom.presetSelect.addEventListener('change', (e) => {
        this.boardPreset = e.target.value;
        this.startNewGame();
      });
    }

    // Playchess Dock Tab Switching
    const dockTabs = [
      { btn: this.dom.tabBtnNotation, pane: this.dom.paneNotation },
      { btn: this.dom.tabBtnLobby, pane: this.dom.paneLobby },
      { btn: this.dom.tabBtnChat, pane: this.dom.paneChat }
    ];
    dockTabs.forEach(({ btn, pane }) => {
      if (btn) {
        btn.addEventListener('click', () => {
          dockTabs.forEach(t => {
            t.btn?.classList.remove('active');
            t.pane?.classList.remove('active');
          });
          btn.classList.add('active');
          pane?.classList.add('active');
        });
      }
    });

    // Playchess Dock Lobby Quick Online Handlers
    if (this.dom.btnDockCreateRoom) {
      this.dom.btnDockCreateRoom.addEventListener('click', () => {
        this.gameMode = 'MULTIPLAYER';
        if (this.dom.gameModeSelect) this.dom.gameModeSelect.value = 'MULTIPLAYER';
        const newRoom = this.syncEngine.generateRoomId();
        this.syncEngine.joinRoom(newRoom, 'P1', this.getSerializableState());
        this.openRoomModal();
      });
    }

    if (this.dom.btnDockJoinRoom) {
      this.dom.btnDockJoinRoom.addEventListener('click', () => {
        const code = this.dom.dockRoomCodeInput?.value.trim().toUpperCase();
        if (!code) {
          this.showToast('Vui lòng nhập mã phòng!', 'warning');
          return;
        }
        this.gameMode = 'MULTIPLAYER';
        if (this.dom.gameModeSelect) this.dom.gameModeSelect.value = 'MULTIPLAYER';
        const fullRoom = code.startsWith('OTT-') ? code : `OTT-${code}`;
        this.syncEngine.joinRoom(fullRoom, 'P2', this.getSerializableState());
        this.openRoomModal();
      });
    }

    // Playchess Notation Navigation Controls
    if (this.dom.btnNotationStart) {
      this.dom.btnNotationStart.addEventListener('click', () => {
        if (this.dom.chessNotationList) this.dom.chessNotationList.scrollTop = 0;
      });
    }
    if (this.dom.btnNotationEnd) {
      this.dom.btnNotationEnd.addEventListener('click', () => {
        if (this.dom.chessNotationList) this.dom.chessNotationList.scrollTop = this.dom.chessNotationList.scrollHeight;
      });
    }
    if (this.dom.btnNotationPrev) {
      this.dom.btnNotationPrev.addEventListener('click', () => {
        if (this.dom.chessNotationList) this.dom.chessNotationList.scrollTop -= 35;
      });
    }
    if (this.dom.btnNotationNext) {
      this.dom.btnNotationNext.addEventListener('click', () => {
        if (this.dom.chessNotationList) this.dom.chessNotationList.scrollTop += 35;
      });
    }

    this.dom.soundBtn.addEventListener('click', () => {
      const isMuted = !sounds.toggle();
      this.dom.soundBtn.innerHTML = isMuted ? '🔇 Tắt âm' : '🔊 Âm thanh';
      this.dom.soundBtn.classList.toggle('active', !isMuted);
    });

    this.dom.rulesBtn.addEventListener('click', () => {
      this.dom.rulesModal.classList.add('open');
    });
    this.dom.closeRulesModal.addEventListener('click', () => {
      this.dom.rulesModal.classList.remove('open');
    });

    if (this.dom.btnQuickGuide) {
      this.dom.btnQuickGuide.addEventListener('click', () => {
        this.dom.guideModal?.classList.add('open');
      });
    }
    if (this.dom.closeGuideModal) {
      this.dom.closeGuideModal.addEventListener('click', () => {
        this.dom.guideModal?.classList.remove('open');
      });
    }
    if (this.dom.btnGuideGotIt) {
      this.dom.btnGuideGotIt.addEventListener('click', () => {
        this.dom.guideModal?.classList.remove('open');
      });
    }

    this.dom.onlineBtn.addEventListener('click', () => {
      this.openRoomModal();
    });
    this.dom.closeRoomModal.addEventListener('click', () => {
      this.dom.roomModal.classList.remove('open');
    });

    this.dom.btnCreateRoom.addEventListener('click', () => {
      this.gameMode = 'MULTIPLAYER';
      if (this.dom.gameModeSelect) this.dom.gameModeSelect.value = 'MULTIPLAYER';
      const newRoom = this.syncEngine.generateRoomId();
      this.syncEngine.joinRoom(newRoom, 'P1', this.getSerializableState());
    });

    this.dom.btnJoinRoom.addEventListener('click', () => {
      const code = this.dom.roomCodeInput.value.trim().toUpperCase();
      if (!code) {
        this.showToast('Vui lòng nhập mã phòng!', 'warning');
        return;
      }
      this.gameMode = 'MULTIPLAYER';
      if (this.dom.gameModeSelect) this.dom.gameModeSelect.value = 'MULTIPLAYER';
      const fullRoom = code.startsWith('OTT-') ? code : `OTT-${code}`;
      this.syncEngine.joinRoom(fullRoom, 'P2', this.getSerializableState());
    });

    this.dom.btnCopyLink.addEventListener('click', () => {
      const link = this.syncEngine.getShareableLink();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(link).then(() => {
          this.showToast('Đã copy link mời tham gia phòng!', 'success');
        });
      }
    });

    // Supabase Config Modal events
    if (this.dom.btnOpenSbConfig) {
      this.dom.btnOpenSbConfig.addEventListener('click', () => {
        const cfg = this.syncEngine.getConfig();
        if (this.dom.sbCfgUrl) this.dom.sbCfgUrl.value = cfg.url || '';
        if (this.dom.sbCfgKey) this.dom.sbCfgKey.value = cfg.key || '';
        if (this.dom.sbCfgName) this.dom.sbCfgName.value = cfg.playerName || '';
        if (this.dom.sbConfigModal) this.dom.sbConfigModal.classList.add('open');
      });
    }

    if (this.dom.closeSbConfigModal) {
      this.dom.closeSbConfigModal.addEventListener('click', () => {
        if (this.dom.sbConfigModal) this.dom.sbConfigModal.classList.remove('open');
      });
    }

    if (this.dom.btnSaveSbConfig) {
      this.dom.btnSaveSbConfig.addEventListener('click', () => {
        const url = this.dom.sbCfgUrl ? this.dom.sbCfgUrl.value.trim() : '';
        const key = this.dom.sbCfgKey ? this.dom.sbCfgKey.value.trim() : '';
        const name = this.dom.sbCfgName ? this.dom.sbCfgName.value.trim() : '';
        this.syncEngine.setConfig(url, key, name);
        if (this.dom.sbConfigModal) this.dom.sbConfigModal.classList.remove('open');
        this.showToast('Đã lưu cấu hình Supabase Cloud!', 'success');
        if (this.dom.sbStatusText) {
          this.dom.sbStatusText.textContent = url ? '⚡ Supabase Realtime: Sẵn sàng' : '⚡ Supabase Realtime: Chế độ Demo';
        }
      });
    }

    // Quick Emoji Reactions
    document.querySelectorAll('.btn-reaction').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.triggerFloatingReaction(emoji);
        if (this.gameMode === 'MULTIPLAYER') {
          this.syncEngine.broadcastReaction(emoji);
        }
      });
    });

    // Roles
    [
      { btn: this.dom.roleP1Btn, role: 'P1' },
      { btn: this.dom.roleP2Btn, role: 'P2' },
      { btn: this.dom.roleSpecBtn, role: 'SPECTATOR' }
    ].forEach(({ btn, role }) => {
      if (btn) {
        btn.addEventListener('click', () => {
          this.syncEngine.setRole(role);
          this.updateRoleButtons(role);
          this.renderer.setLocalRole(role);
          this.showToast(`Bạn đang ở vai trò: ${role === 'P1' ? 'Player 1' : (role === 'P2' ? 'Player 2' : 'Khán giả')}`, 'info');
        });
      }
    });

    // Lobby: Create Room Button
    if (this.dom.lobbyBtnCreateRoom) {
      this.dom.lobbyBtnCreateRoom.addEventListener('click', () => {
        const roomName = (this.dom.lobbyRoomNameInput?.value || '').trim();
        this.syncEngine.createRoom(roomName);
        if (this.dom.lobbyRoomNameInput) this.dom.lobbyRoomNameInput.value = '';
      });
    }

    // Lobby: Refresh Rooms
    if (this.dom.lobbyBtnRefresh) {
      this.dom.lobbyBtnRefresh.addEventListener('click', () => {
        this.syncEngine.fetchRooms();
        this.showToast('Đang cập nhật danh sách phòng...', 'info');
      });
    }

    if (this.dom.btnToggleLobby) {
      this.dom.btnToggleLobby.addEventListener('click', () => {
        const isShown = this.dom.lobbySection && this.dom.lobbySection.style.display === 'flex';
        if (this.dom.lobbySection) this.dom.lobbySection.style.display = isShown ? 'none' : 'flex';
        this.dom.btnToggleLobby.textContent = isShown ? '📺 Xem các phòng khác' : '🔼 Thu gọn danh sách';
        if (!isShown) {
          this.syncEngine.fetchRooms();
        }
      });
    }

    // Active Room Actions
    if (this.dom.btnCopyRoomLink) {
      this.dom.btnCopyRoomLink.addEventListener('click', () => {
        const link = this.syncEngine.getShareableLink();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(link).then(() => {
            this.showToast('Đã copy liên kết mời vào phòng!', 'success');
          });
        }
      });
    }

    if (this.dom.btnRoomResetGame) {
      this.dom.btnRoomResetGame.addEventListener('click', () => {
        this.startNewGame();
        if (this.syncEngine && this.syncEngine.sendResetGame) {
          this.syncEngine.sendResetGame();
        }
      });
    }

    if (this.dom.btnLeaveRoom) {
      this.dom.btnLeaveRoom.addEventListener('click', () => {
        if (this.syncEngine && this.syncEngine.leaveRoom) {
          this.syncEngine.leaveRoom();
        }
      });
    }

    if (this.dom.btnVictoryRestart) {
      this.dom.btnVictoryRestart.addEventListener('click', () => {
        if (this.dom.victoryModal) this.dom.victoryModal.classList.remove('open');
        this.startNewGame();
        if (this.gameMode === 'MULTIPLAYER') {
          this.syncEngine.broadcastGameState(this.getSerializableState(), null);
        }
      });
    }

    // Chess Flip Board
    if (this.dom.btnFlipBoard) {
      this.dom.btnFlipBoard.addEventListener('click', () => {
        const flipped = this.renderer.flipBoard();
        this.showToast(flipped ? '🔄 Đã xoay góc nhìn sang Player 2 (Xanh)!' : '🔄 Đã xoay góc nhìn sang Player 1 (Đỏ)!', 'info');
      });
    }

    // Chess Resign
    if (this.dom.btnResign) {
      this.dom.btnResign.addEventListener('click', () => {
        if (this.gameStatus === GAME_STATUS.ENDED) return;
        const winner = this.currentTurn === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;
        const winnerName = winner === PLAYERS.PLAYER_1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)';
        if (confirm(`Bạn có chắc chắn muốn ĐẦU HÀNG ván cờ này? ${winnerName} sẽ giành chiến thắng!`)) {
          this.stopTurnTimer();
          this.gameStatus = GAME_STATUS.ENDED;
          this.winnerInfo = { winner, reason: 'RESIGN' };
          this.renderer.setInteractive(false);
          this.addLog(`🏳️ <strong>${this.currentTurn === PLAYERS.PLAYER_1 ? 'Player 1' : 'Player 2'} đã xin đầu hàng!</strong> ${winnerName} giành chiến thắng!`, 'win');
          this.handleVictory(this.winnerInfo);
          if (this.gameMode === 'MULTIPLAYER') {
            this.syncEngine.broadcastGameState(this.getSerializableState(), null);
          }
        }
      });
    }

    // Chess Offer Draw
    if (this.dom.btnDraw) {
      this.dom.btnDraw.addEventListener('click', () => {
        if (this.gameStatus === GAME_STATUS.ENDED) return;
        if (confirm('Đối thủ có đồng ý HÒA CỜ không?')) {
          this.stopTurnTimer();
          this.gameStatus = GAME_STATUS.ENDED;
          this.winnerInfo = { winner: 'DRAW', reason: 'AGREEMENT' };
          this.renderer.setInteractive(false);
          this.addLog(`🤝 <strong>Hai đấu thủ đã đồng ý hòa cờ!</strong> Trận đấu kết thúc bất phân thắng bại.`, 'info');
          this.handleVictory(this.winnerInfo);
          if (this.gameMode === 'MULTIPLAYER') {
            this.syncEngine.broadcastGameState(this.getSerializableState(), null);
          }
        }
      });
    }

    // Board Theme Selector
    if (this.dom.boardThemeSelect) {
      this.dom.boardThemeSelect.addEventListener('change', (e) => {
        this.renderer.setTheme(e.target.value);
        this.showToast(`Đã áp dụng giao diện: ${e.target.options[e.target.selectedIndex].text}`, 'success');
      });
    }

    // 2x2 Multi-Board Live Spectator Modal
    const openMultiBoardModal = () => this.openMultiBoardModal();
    if (this.dom.btnMultiBoard) this.dom.btnMultiBoard.addEventListener('click', openMultiBoardModal);
    if (this.dom.btnOpenMultiBoard) this.dom.btnOpenMultiBoard.addEventListener('click', openMultiBoardModal);
    if (this.dom.closeMultiBoardModal) {
      this.dom.closeMultiBoardModal.addEventListener('click', () => this.closeMultiBoardModal());
    }

    if (this.dom.modalFilterTabs) {
      this.dom.modalFilterTabs.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          this.dom.modalFilterTabs.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.multiBoardFilter = tab.dataset.filter;
          this.multiBoardPage = 1;
          this.renderModalMultiBoard();
        });
      });
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
        const isGoal = (r === 0 && c === 0) || (r === 8 && c === 8);
        const piece = board[r] ? board[r][c] : null;

        let pieceHtml = '';
        if (piece) {
          const pieceClass = (piece.player === 'P1' || piece.player === 'PLAYER_1') ? 'mini-piece-p1' : 'mini-piece-p2';
          pieceHtml = `<div class="${pieceClass}"></div>`;
        }

        cellsHtml += `<div class="mini-cell ${isLight ? 'cell-light' : ''} ${isGoal ? 'is-goal' : ''}">${pieceHtml}</div>`;
      }
    }
    return `<div class="mini-board-preview" title="Bản đồ thế cờ thu nhỏ 9x9 (A1 ở góc trên trái, I9 ở góc dưới phải)">${cellsHtml}</div>`;
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
      let statusText = '🟡 Chờ người chơi 2';

      if (room.status === 'PLAYING') {
        statusBadgeClass = 'room-badge-playing';
        statusText = `🟢 Đang thi đấu (${room.turn === 'P1' ? 'Lượt P1' : 'Lượt P2'})`;
      } else if (room.status === 'ENDED') {
        statusBadgeClass = 'room-badge-ended';
        statusText = '⚪ Đã kết thúc';
      }

      card.innerHTML = `
        <div class="room-card-top">
          <span class="room-title-text">
            <span>⚔️</span> ${room.name || room.id}
          </span>
          <span class="room-badge-status ${statusBadgeClass}">${statusText}</span>
        </div>

        <div class="room-matchup-box">
          <div class="room-player-side side-p1">
            <span class="room-player-label">Player 1 (Đỏ)</span>
            <span class="room-player-val">${room.p1Name || (room.hasP1 ? 'Sẵn sàng' : 'Trống')}</span>
          </div>
          <div class="room-vs-divider">VS</div>
          <div class="room-player-side side-p2">
            <span class="room-player-label">Player 2 (Xanh)</span>
            <span class="room-player-val">${room.p2Name || (room.hasP2 ? 'Sẵn sàng' : 'Chờ tham gia...')}</span>
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
                  ${room.lastMove.from} → ${room.lastMove.to} ${room.lastMove.isCapture ? '⚔️' : ''}
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
            Mã: <code style="color: var(--gold-light);">${room.id}</code> · 👁️ ${room.spectators || 0} khán giả
          </div>
          <div class="room-card-actions">
            ${!room.hasP2 && room.status !== 'ENDED' ? `
              <button class="btn btn-primary btn-sm btn-join-p2" data-room="${room.id}">
                ⚔️ Vào chơi (P2)
              </button>
            ` : `
              <button class="btn btn-sm btn-spectate" data-room="${room.id}">
                👁️ Xem trực tiếp
              </button>
            `}
            <button class="btn btn-sm btn-copy-card-link" data-room="${room.id}" title="Copy link phòng">
              📋 Link
            </button>
          </div>
        </div>
      `;

      // Event listener for Join P2
      const btnJoin = card.querySelector('.btn-join-p2');
      if (btnJoin) {
        btnJoin.addEventListener('click', () => {
          this.syncEngine.joinRoom(room.id, 'P2');
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
  // Standard Gameplay Controls
  // -------------------------------------------------------------
  startNewGame() {
    this.board = createInitialBoard(this.boardPreset);
    this.currentTurn = PLAYERS.PLAYER_1;
    this.gameStatus = GAME_STATUS.PLAYING;
    this.lastMove = null;
    this.moveHistory = [];
    this.winnerInfo = null;

    // Reset Chess Clocks (300s = 5m each)
    this.clockP1Seconds = 300;
    this.clockP2Seconds = 300;
    this.capturedPiecesP1 = [];
    this.capturedPiecesP2 = [];
    this.updateCapturedTrays();
    this.updateClockDisplays();

    // Reset Chess Move Notation Sheet
    if (this.dom.chessNotationList) {
      this.dom.chessNotationList.innerHTML = `
        <div class="notation-row" style="color: var(--text-muted); font-style: italic; display: block; text-align: center; padding: 0.5rem;">
          Chưa có nước cờ nào...
        </div>
      `;
    }
    if (this.dom.notationTotalMoves) this.dom.notationTotalMoves.textContent = '0 nước đi';

    this.renderer.clearSelection();
    this.renderer.setInteractive(true);
    this.renderer.render(this.board, this.currentTurn, this.lastMove);

    this.updateStatsDisplay();
    this.updateTurnDisplay();
    this.startTurnTimer();

    this.dom.battleLog.innerHTML = '<div class="log-entry info">Trận đấu bắt đầu! Lượt đầu tiên thuộc về Player 1. Mục tiêu P1: A1, P2: I9.</div>';
    this.showToast('Bắt đầu ván mới!', 'info');
  }

  startTurnTimer() {
    this.stopTurnTimer();
    this.timerRemaining = this.turnDuration;
    this.updateTimerDisplay();
    this.updateClockDisplays();

    this.timerInterval = setInterval(() => {
      if (this.gameStatus === GAME_STATUS.ENDED) {
        this.stopTurnTimer();
        return;
      }

      this.timerRemaining--;

      // Decrement player clock
      if (this.currentTurn === PLAYERS.PLAYER_1) {
        this.clockP1Seconds = Math.max(0, this.clockP1Seconds - 1);
        if (this.clockP1Seconds === 0) {
          this.stopTurnTimer();
          this.handleFlagFall(PLAYERS.PLAYER_1);
          return;
        }
      } else {
        this.clockP2Seconds = Math.max(0, this.clockP2Seconds - 1);
        if (this.clockP2Seconds === 0) {
          this.stopTurnTimer();
          this.handleFlagFall(PLAYERS.PLAYER_2);
          return;
        }
      }

      this.updateTimerDisplay();
      this.updateClockDisplays();

      if (this.timerRemaining <= 5 && this.timerRemaining > 0) {
        sounds.select(); // Beep warning
      }

      if (this.timerRemaining <= 0) {
        this.stopTurnTimer();
        this.handleTurnTimeout();
      }
    }, 1000);
  }

  handleFlagFall(playerWhoRanOutOfTime) {
    const winner = playerWhoRanOutOfTime === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;
    const winnerName = winner === PLAYERS.PLAYER_1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)';
    const loserName = playerWhoRanOutOfTime === PLAYERS.PLAYER_1 ? 'Player 1' : 'Player 2';

    this.gameStatus = GAME_STATUS.ENDED;
    this.winnerInfo = { winner, reason: 'TIMEOUT' };
    this.renderer.setInteractive(false);
    this.addLog(`⏱️ <strong>${loserName} đã hết thời gian ván cờ (Flag fall)!</strong> ${winnerName} chiến thắng!`, 'win');
    this.showToast(`${loserName} hết giờ! ${winnerName} thắng!`, 'danger');
    this.handleVictory(this.winnerInfo);
    if (this.gameMode === 'MULTIPLAYER') {
      this.syncEngine.broadcastGameState(this.getSerializableState(), null);
    }
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
      if (this.timerRemaining <= 5) {
        this.dom.turnTimerBar.classList.add('warning');
      } else {
        this.dom.turnTimerBar.classList.remove('warning');
      }
    }

    if (this.timerRemaining <= 5) {
      this.dom.turnTimerBadge?.classList.add('warning');
    } else {
      this.dom.turnTimerBadge?.classList.remove('warning');
    }
  }

  handleTurnTimeout() {
    this.addLog(`⏱️ Hết thời gian lượt đi 30s! Tự động đổi lượt thi đấu.`, 'warning');
    this.showToast('Hết thời gian lượt đi (30s)!', 'warning');
    sounds.block();

    this.currentTurn = this.currentTurn === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;
    this.renderer.clearSelection();
    this.renderer.render(this.board, this.currentTurn, this.lastMove);
    this.updateTurnDisplay();
    this.updateClockDisplays();
    this.startTurnTimer();
  }

  handleMove(moveData) {
    if (this.gameStatus === GAME_STATUS.ENDED) return;

    // Apply move to board
    const { fromPos, toPos, piece, isCapture, capturedPiece, from, to } = moveData;
    this.board[fromPos.y][fromPos.x] = null;
    this.board[toPos.y][toPos.x] = piece;

    this.lastMove = { from, to, player: piece.player, pieceType: piece.type };
    this.moveHistory.push(this.lastMove);

    // Track captured pieces for Chess cemetery tray
    if (isCapture && capturedPiece) {
      if (piece.player === PLAYERS.PLAYER_1) {
        this.capturedPiecesP1.push(capturedPiece);
      } else {
        this.capturedPiecesP2.push(capturedPiece);
      }
      this.updateCapturedTrays();
    }

    // Append to Algebraic Chess Notation sheet
    this.appendMoveNotation(moveData, this.moveHistory.length);

    // Add battle log
    const playerText = piece.player === PLAYERS.PLAYER_1 ? 'Player 1' : 'Player 2';
    const pieceIcon = PIECE_SYMBOLS[piece.type];
    const pieceName = PIECE_NAMES_VI[piece.type];

    if (isCapture && capturedPiece) {
      const enemyName = PIECE_NAMES_VI[capturedPiece.type];
      const enemyIcon = PIECE_SYMBOLS[capturedPiece.type];
      this.addLog(
        `⚔️ <strong>${playerText}</strong> dùng ${pieceIcon} ${pieceName} tại <code>${from}</code> ăn ${enemyIcon} ${enemyName} của đối thủ tại <code>${to}</code>!`,
        'capture'
      );
      sounds.capture();
    } else {
      this.addLog(
        `➡️ <strong>${playerText}</strong> di chuyển ${pieceIcon} ${pieceName}: <code>${from}</code> → <code>${to}</code>`
      );
      sounds.move();
    }

    // Check Win Condition
    const win = checkWinCondition(this.board, this.lastMove, this.goalMode);
    if (win.hasWinner) {
      this.stopTurnTimer();
      this.gameStatus = GAME_STATUS.ENDED;
      this.winnerInfo = win;
      this.renderer.setInteractive(false);
      this.renderer.render(this.board, this.currentTurn, this.lastMove);
      this.updateStatsDisplay();
      this.handleVictory(win);

      if (this.gameMode === 'MULTIPLAYER') {
        this.syncEngine.broadcastGameState(this.getSerializableState(), this.lastMove);
      }
      return;
    }

    // Next turn
    this.currentTurn = this.currentTurn === PLAYERS.PLAYER_1 ? PLAYERS.PLAYER_2 : PLAYERS.PLAYER_1;
    this.renderer.render(this.board, this.currentTurn, this.lastMove);
    this.updateStatsDisplay();
    this.updateTurnDisplay();
    this.startTurnTimer();

    // Broadcast in multiplayer
    if (this.gameMode === 'MULTIPLAYER') {
      this.syncEngine.broadcastGameState(this.getSerializableState(), this.lastMove);
    }
  }

  triggerFloatingReaction(emoji) {
    if (!this.dom.boardContainer) return;
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.textContent = emoji;

    const rect = this.dom.boardContainer.getBoundingClientRect();
    el.style.left = `${rect.left + rect.width / 2 + (Math.random() * 140 - 70)}px`;
    el.style.top = `${rect.top + rect.height / 2 + (Math.random() * 90 - 45)}px`;
    document.body.appendChild(el);

    sounds.select();
    setTimeout(() => el.remove(), 1600);
  }

  startPingMonitor() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    const updatePing = async () => {
      if (!this.dom.pingBadge) return;
      if (this.gameMode !== 'MULTIPLAYER') {
        this.dom.pingBadge.textContent = '⚡ Cục bộ (0ms)';
        this.dom.pingBadge.style.color = 'var(--text-muted)';
        return;
      }
      const t0 = performance.now();
      try {
        const resp = await fetch('/api/health', { cache: 'no-store' });
        if (resp.ok) {
          const rtt = Math.round(performance.now() - t0);
          this.dom.pingBadge.textContent = `📶 Ping: ${rtt}ms`;
          this.dom.pingBadge.style.color = rtt < 100 ? '#34d399' : '#facc15';
        } else {
          this.dom.pingBadge.textContent = '📶 Ngoại tuyến';
          this.dom.pingBadge.style.color = 'var(--text-muted)';
        }
      } catch {
        this.dom.pingBadge.textContent = this.syncEngine?.isOnline ? '📶 Online (Cloud)' : '📶 Ngoại tuyến';
        this.dom.pingBadge.style.color = this.syncEngine?.isOnline ? '#34d399' : 'var(--text-muted)';
      }
    };
    updatePing();
    this.pingInterval = setInterval(updatePing, 5000);
  }

  handleVictory(win) {
    this.stopTurnTimer();
    sounds.victory();
    const winnerName = win.winner === PLAYERS.PLAYER_1 ? 'Player 1' : 'Player 2';
    this.addLog(`🏆 ${winnerName} CHIẾN THẮNG! ${win.details}`, 'win');

    this.dom.victoryTitle.textContent = `🏆 ${winnerName} WIN!`;
    this.dom.victoryDesc.textContent = win.details || 'Chúc mừng bạn đã giành chiến thắng!';
    this.dom.victoryModal.classList.add('open');
  }

  updateStatsDisplay() {
    const counts = countPlayerPieces(this.board);

    // Player 1
    const p1 = counts[PLAYERS.PLAYER_1];
    this.dom.p1RockCount.textContent = p1[PIECE_TYPES.ROCK];
    this.dom.p1PaperCount.textContent = p1[PIECE_TYPES.PAPER];
    this.dom.p1ScissorsCount.textContent = p1[PIECE_TYPES.SCISSORS];
    this.dom.p1TotalCount.textContent = p1.total;

    const p1Max = (this.boardPreset === 'CHESS_9') ? 9 : 15;
    const p1Pct = Math.min(100, Math.round((p1.total / p1Max) * 100));
    if (this.dom.p1ArmyBar) this.dom.p1ArmyBar.style.width = `${p1Pct}%`;
    if (this.dom.p1MeterLabel) this.dom.p1MeterLabel.innerHTML = `<strong>${p1.total}</strong> / ${p1Max} quân (${p1Pct}%)`;

    const p1Danger = (p1[PIECE_TYPES.ROCK] === 1 || p1[PIECE_TYPES.PAPER] === 1 || p1[PIECE_TYPES.SCISSORS] === 1);
    if (this.dom.p1ArmyStatus) {
      if (p1Danger) {
        this.dom.p1ArmyStatus.className = 'army-status-pill danger';
        this.dom.p1ArmyStatus.textContent = '⚠️ Cận kề thất bại';
      } else {
        this.dom.p1ArmyStatus.className = 'army-status-pill';
        this.dom.p1ArmyStatus.textContent = 'Sẵn sàng';
      }
    }

    // Highlight critical count (0 or 1 piece left)
    this.highlightDanger(this.dom.p1RockCount, p1[PIECE_TYPES.ROCK]);
    this.highlightDanger(this.dom.p1PaperCount, p1[PIECE_TYPES.PAPER]);
    this.highlightDanger(this.dom.p1ScissorsCount, p1[PIECE_TYPES.SCISSORS]);

    // Player 2
    const p2 = counts[PLAYERS.PLAYER_2];
    this.dom.p2RockCount.textContent = p2[PIECE_TYPES.ROCK];
    this.dom.p2PaperCount.textContent = p2[PIECE_TYPES.PAPER];
    this.dom.p2ScissorsCount.textContent = p2[PIECE_TYPES.SCISSORS];
    this.dom.p2TotalCount.textContent = p2.total;

    const p2Max = (this.boardPreset === 'CHESS_9') ? 9 : 15;
    const p2Pct = Math.min(100, Math.round((p2.total / p2Max) * 100));
    if (this.dom.p2ArmyBar) this.dom.p2ArmyBar.style.width = `${p2Pct}%`;
    if (this.dom.p2MeterLabel) this.dom.p2MeterLabel.innerHTML = `<strong>${p2.total}</strong> / ${p2Max} quân (${p2Pct}%)`;

    const p2Danger = (p2[PIECE_TYPES.ROCK] === 1 || p2[PIECE_TYPES.PAPER] === 1 || p2[PIECE_TYPES.SCISSORS] === 1);
    if (this.dom.p2ArmyStatus) {
      if (p2Danger) {
        this.dom.p2ArmyStatus.className = 'army-status-pill danger';
        this.dom.p2ArmyStatus.textContent = '⚠️ Cận kề thất bại';
      } else {
        this.dom.p2ArmyStatus.className = 'army-status-pill';
        this.dom.p2ArmyStatus.textContent = 'Sẵn sàng';
      }
    }

    this.highlightDanger(this.dom.p2RockCount, p2[PIECE_TYPES.ROCK]);
    this.highlightDanger(this.dom.p2PaperCount, p2[PIECE_TYPES.PAPER]);
    this.highlightDanger(this.dom.p2ScissorsCount, p2[PIECE_TYPES.SCISSORS]);
  }

  highlightDanger(el, count) {
    if (count === 0) {
      el.className = 'count-pill eliminated';
    } else if (count === 1) {
      el.className = 'count-pill danger';
    } else {
      el.className = 'count-pill';
    }
  }

  updateTurnDisplay() {
    const isP1 = this.currentTurn === PLAYERS.PLAYER_1;
    this.dom.turnBanner.className = `turn-banner turn-${this.currentTurn.toLowerCase()}`;
    if (this.dom.turnBadge) this.dom.turnBadge.textContent = isP1 ? 'P1' : 'P2';
    if (this.dom.turnAvatar) this.dom.turnAvatar.textContent = isP1 ? 'P1' : 'P2';

    this.dom.turnText.textContent = `Lượt của ${isP1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)'}`;
    if (this.dom.turnSubtext) {
      this.dom.turnSubtext.textContent = isP1
        ? 'Ruby Legion · Chọn 1 quân cờ để di chuyển'
        : 'Sapphire Order · Chọn 1 quân cờ để di chuyển';
    }

    this.dom.p1Card?.classList.toggle('active-turn', isP1);
    this.dom.p2Card?.classList.toggle('active-turn', !isP1);

    if (this.dom.moveHintText) {
      this.dom.moveHintText.innerHTML = `💡 Đến lượt <strong>${isP1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)'}</strong>. Chọn 1 quân của bạn để xem 8 hướng di chuyển.`;
    }
  }

  handlePieceSelected(piece, coord, validMoves) {
    if (!this.dom.moveHintText) return;
    const pieceName = PIECE_NAMES_VI[piece.type] || piece.type;
    const count = validMoves.length;
    this.dom.moveHintText.innerHTML = `🎯 Đã chọn quân <strong>${pieceName} [${coord}]</strong>: Có <strong>${count}</strong> ô có thể đi. Rê chuột vào các ô lân cận để xem trước kết quả ăn quân/chặn đường.`;
  }

  handleCellHover(x, y, coord, selectedPos, board, currentTurn) {
    if (!this.dom.moveHintText) return;

    if (!selectedPos) {
      const piece = board && board[y] ? board[y][x] : null;
      if (piece) {
        const isMine = piece.player === currentTurn;
        const ownerName = piece.player === PLAYERS.PLAYER_1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)';
        const pName = PIECE_NAMES_VI[piece.type] || piece.type;
        if (isMine) {
          this.dom.moveHintText.innerHTML = `👉 Nhấp để chọn quân <strong>${pName} (${ownerName})</strong> tại ô [<strong>${coord}</strong>].`;
        } else {
          this.dom.moveHintText.innerHTML = `🛡️ Quân địch <strong>${pName} (${ownerName})</strong> tại ô [<strong>${coord}</strong>].`;
        }
      } else {
        this.dom.moveHintText.innerHTML = `Ô trống [<strong>${coord}</strong>]. Chọn một quân cờ của bạn để bắt đầu di chuyển.`;
      }
      return;
    }

    // A piece is selected!
    const { x: selX, y: selY } = selectedPos;
    const selPiece = board[selY][selX];
    const selCoord = posToCoord(selX, selY);
    const selName = PIECE_NAMES_VI[selPiece.type] || selPiece.type;

    if (x === selX && y === selY) {
      this.dom.moveHintText.innerHTML = `🎯 Đang chọn quân <strong>${selName}</strong> tại [<strong>${selCoord}</strong>]. Click lại để bỏ chọn.`;
      return;
    }

    const check = validateMove(board, { from: selCoord, to: coord, player: currentTurn }, currentTurn);
    const targetPiece = board[y][x];

    if (check.valid) {
      if (check.isCapture && targetPiece) {
        const targetName = PIECE_NAMES_VI[targetPiece.type] || targetPiece.type;
        this.dom.moveHintText.innerHTML = `⚔️ <strong>ĂN QUÂN HỢP LỆ</strong>: ${selName} ăn ${targetName} tại ô [<strong>${coord}</strong>]!`;
      } else if (coord === 'A1' || coord === 'I9') {
        this.dom.moveHintText.innerHTML = `👑 <strong>ĐỘT KÍCH CỨ ĐIỂM [${coord}]</strong>: Đi vào ô đích này để CHIẾN THẮNG TRẬN ĐẤU NGAY!`;
      } else {
        this.dom.moveHintText.innerHTML = `➡️ Di chuyển 1 ô đến ô trống [<strong>${coord}</strong>].`;
      }
    } else {
      if (targetPiece) {
        const targetName = PIECE_NAMES_VI[targetPiece.type] || targetPiece.type;
        if (targetPiece.player === currentTurn) {
          this.dom.moveHintText.innerHTML = `🤝 Ô [<strong>${coord}</strong>] đã có quân cùng phe (<strong>${targetName}</strong>).`;
        } else if (targetPiece.type === selPiece.type) {
          this.dom.moveHintText.innerHTML = `🛡️ <strong>CHẶN ĐƯỜNG</strong>: Hai quân <strong>${selName}</strong> cùng loại không thể ăn nhau, chỉ đứng chặn đường!`;
        } else {
          this.dom.moveHintText.innerHTML = `⚠️ <strong>BỊ KHẮC CHẾ</strong>: Quân <strong>${selName}</strong> không thể ăn <strong>${targetName}</strong>!`;
        }
      } else {
        this.dom.moveHintText.innerHTML = `🚫 ${check.reason || 'Nước đi không hợp lệ'}`;
      }
    }
  }

  handleCellLeave(selectedPos) {
    if (!this.dom.moveHintText) return;
    if (selectedPos && this.board) {
      const { x, y } = selectedPos;
      const piece = this.board[y][x];
      if (piece) {
        const pName = PIECE_NAMES_VI[piece.type] || piece.type;
        this.dom.moveHintText.innerHTML = `🎯 Đang chọn <strong>${pName}</strong> tại [<strong>${posToCoord(x, y)}</strong>]. Click ô xanh lá để đi, hoặc ô đỏ ⚔️ để ăn quân.`;
        return;
      }
    }
    const isP1 = this.currentTurn === PLAYERS.PLAYER_1;
    this.dom.moveHintText.innerHTML = `💡 Đến lượt <strong>${isP1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)'}</strong>. Chọn 1 quân của bạn để xem 8 hướng di chuyển.`;
  }

  addLog(msg, type = 'normal') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-content">${msg}</span>`;
    this.dom.battleLog.prepend(entry);
  }

  showToast(msg, type = 'info') {
    const toast = this.dom.toastAlert;
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // Multiplayer Room Handlers
  openRoomModal() {
    this.dom.roomModal.classList.add('open');
  }

  handleRoomJoined(roomId, role) {
    this.dom.roomInfoBox.style.display = 'block';
    this.dom.currentRoomCode.textContent = roomId;
    this.updateRoleButtons(role);
    this.renderer.setLocalRole(role);

    this.dom.onlineStatusBadge.style.display = 'inline-flex';
    this.dom.onlineStatusBadge.textContent = `● Online: ${roomId.toUpperCase()} (${role})`;
    this.showToast(`Đã vào phòng ${roomId}! Bạn là ${role}`, 'success');
  }

  handleConnectionChange(connected, msg) {
    if (connected) {
      this.dom.onlineStatusBadge.className = 'status-badge online';
      this.dom.onlineStatusBadge.textContent = `● Online: ${this.syncEngine.roomId}`;
    } else {
      this.dom.onlineStatusBadge.className = 'status-badge offline';
      this.dom.onlineStatusBadge.textContent = `○ Offline`;
      if (msg) this.showToast(msg, 'warning');
    }
  }

  updateRoleButtons(activeRole) {
    [this.dom.roleP1Btn, this.dom.roleP2Btn, this.dom.roleSpecBtn].forEach(btn => {
      if (btn) {
        btn.classList.toggle('active', btn.dataset.role === activeRole);
      }
    });
  }

  handleRemoteUpdate(data) {
    if (!data) return;

    if (data.reaction) {
      this.triggerFloatingReaction(data.reaction);
      this.addLog(`💬 Đối thủ vừa thả biểu cảm: ${data.reaction}`, 'info');
      return;
    }

    if (!data.gameState) return;
    const { board, currentTurn, gameStatus, lastMove, winnerInfo } = data.gameState;

    // Apply synchronized state
    this.board = board;
    this.currentTurn = currentTurn;
    this.gameStatus = gameStatus;
    this.lastMove = lastMove;
    this.winnerInfo = winnerInfo;

    this.renderer.render(this.board, this.currentTurn, this.lastMove);
    this.updateStatsDisplay();
    this.updateTurnDisplay();
    this.startTurnTimer();

    if (data.lastMove) {
      sounds.move();
    }

    if (gameStatus === GAME_STATUS.ENDED && winnerInfo) {
      this.handleVictory(winnerInfo);
    }
  }

  handlePresenceUpdate(presence) {
    if (!presence) return;
    if (this.dom.presenceP1) {
      const p1Name = presence.p1?.name ? `🔴 P1: ${presence.p1.name}` : '🔴 P1: Đang chờ...';
      this.dom.presenceP1.textContent = p1Name;
      this.dom.presenceP1.style.color = presence.p1 ? 'var(--p1-light)' : 'var(--text-muted)';
    }
    if (this.dom.presenceP2) {
      const p2Name = presence.p2?.name ? `🔵 P2: ${presence.p2.name}` : '🔵 P2: Đang chờ...';
      this.dom.presenceP2.textContent = p2Name;
      this.dom.presenceP2.style.color = presence.p2 ? 'var(--p2-light)' : 'var(--text-muted)';
    }
    if (this.dom.presenceSpecs) {
      const count = presence.spectators ? presence.spectators.length : 0;
      this.dom.presenceSpecs.textContent = `👁️ Khán giả: ${count}`;
    }
  }

  countPieces(player) {
    if (!this.board) return 0;
    const counts = countPlayerPieces(this.board);
    return counts[player]?.total || 0;
  }

  formatClockTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  updateClockDisplays() {
    const p1Str = this.formatClockTime(this.clockP1Seconds);
    const p2Str = this.formatClockTime(this.clockP2Seconds);

    if (this.dom.clockDisplayP1) {
      this.dom.clockDisplayP1.textContent = p1Str;
      this.dom.clockDisplayP1.classList.toggle('clock-warning', this.clockP1Seconds <= 60 && this.clockP1Seconds > 20);
      this.dom.clockDisplayP1.classList.toggle('clock-danger', this.clockP1Seconds <= 20);
    }
    if (this.dom.clockDisplayP2) {
      this.dom.clockDisplayP2.textContent = p2Str;
      this.dom.clockDisplayP2.classList.toggle('clock-warning', this.clockP2Seconds <= 60 && this.clockP2Seconds > 20);
      this.dom.clockDisplayP2.classList.toggle('clock-danger', this.clockP2Seconds <= 20);
    }

    if (this.dom.chessStripP1 && this.dom.chessStripP2) {
      if (this.gameStatus === GAME_STATUS.PLAYING) {
        this.dom.chessStripP1.classList.toggle('clock-active', this.currentTurn === PLAYERS.PLAYER_1);
        this.dom.chessStripP2.classList.toggle('clock-active', this.currentTurn === PLAYERS.PLAYER_2);
      } else {
        this.dom.chessStripP1.classList.remove('clock-active');
        this.dom.chessStripP2.classList.remove('clock-active');
      }
    }
  }

  updateCapturedTrays() {
    if (this.dom.capturedByP1) {
      this.dom.capturedByP1.innerHTML = this.capturedPiecesP1
        .map(p => `<span class="captured-icon" title="${PIECE_NAMES_VI[p.type] || p.type}">${PIECE_SYMBOLS[p.type] || ''}</span>`)
        .join('');
    }
    if (this.dom.capturedByP2) {
      this.dom.capturedByP2.innerHTML = this.capturedPiecesP2
        .map(p => `<span class="captured-icon" title="${PIECE_NAMES_VI[p.type] || p.type}">${PIECE_SYMBOLS[p.type] || ''}</span>`)
        .join('');
    }

    const diff = (this.capturedPiecesP1?.length || 0) - (this.capturedPiecesP2?.length || 0);
    if (this.dom.materialAdvP1) {
      if (diff > 0) {
        this.dom.materialAdvP1.textContent = `+${diff}`;
        this.dom.materialAdvP1.style.display = 'inline-block';
      } else {
        this.dom.materialAdvP1.style.display = 'none';
      }
    }
    if (this.dom.materialAdvP2) {
      if (diff < 0) {
        this.dom.materialAdvP2.textContent = `+${Math.abs(diff)}`;
        this.dom.materialAdvP2.style.display = 'inline-block';
      } else {
        this.dom.materialAdvP2.style.display = 'none';
      }
    }
  }

  appendMoveNotation(moveData, totalMoves) {
    if (!this.dom.chessNotationList) return;
    const { piece, from, to, isCapture } = moveData;
    const pieceIcon = PIECE_SYMBOLS[piece.type] || '';
    const captureMark = isCapture ? ' ⚔️' : '';
    const moveStr = `${pieceIcon} ${from}→${to}${captureMark}`;

    if (this.dom.notationTotalMoves) {
      this.dom.notationTotalMoves.textContent = `${totalMoves} nước`;
    }

    // Remove previous last-move highlight
    const prevHighlight = this.dom.chessNotationList.querySelector('.last-move-row');
    if (prevHighlight) prevHighlight.classList.remove('last-move-row');

    const turnNum = Math.ceil(totalMoves / 2) || 1;
    if (piece.player === PLAYERS.PLAYER_1) {
      const row = document.createElement('div');
      row.className = 'notation-row last-move-row';
      row.id = `notation-row-${turnNum}`;
      row.innerHTML = `
        <span class="notation-turn-num">${turnNum}.</span>
        <span class="notation-move-p1">${moveStr}</span>
        <span class="notation-move-p2">-</span>
      `;
      this.dom.chessNotationList.appendChild(row);
    } else {
      let row = document.getElementById(`notation-row-${turnNum}`);
      if (!row) {
        row = document.createElement('div');
        row.className = 'notation-row last-move-row';
        row.id = `notation-row-${turnNum}`;
        row.innerHTML = `
          <span class="notation-turn-num">${turnNum}.</span>
          <span class="notation-move-p1">-</span>
          <span class="notation-move-p2">${moveStr}</span>
        `;
        this.dom.chessNotationList.appendChild(row);
      } else {
        row.classList.add('last-move-row');
        const p2Col = row.querySelector('.notation-move-p2');
        if (p2Col) p2Col.textContent = moveStr;
      }
    }
    this.dom.chessNotationList.scrollTop = this.dom.chessNotationList.scrollHeight;
  }

  async fetchRealMultiBoardRooms() {
    try {
      const resp = await fetch('/api/rooms', { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.rooms)) {
          this.multiBoardRooms = data.rooms.map(r => ({
            id: r.id,
            title: r.title || `Phòng ${r.id}`,
            status: r.status || (r.hasP1 && r.hasP2 ? 'PLAYING' : 'WAITING'),
            p1Name: r.p1Name || (r.hasP1 ? 'Player 1' : 'Đang chờ...'),
            p2Name: r.p2Name || (r.hasP2 ? 'Player 2' : 'Đang chờ...'),
            hasP1: r.hasP1,
            hasP2: r.hasP2,
            spectators: r.spectators || 0,
            turn: r.turn || PLAYERS.PLAYER_1,
            moveCount: r.moveCount || 0,
            clockP1: r.clockP1 || '05:00',
            clockP2: r.clockP2 || '05:00',
            lastMove: r.lastMove || null,
            board: r.board || createInitialBoard('CHESS_9')
          }));
          this.renderModalMultiBoard();
          return;
        }
      }
    } catch {
      // Server offline or static mode
    }
    this.multiBoardRooms = [];
    this.renderModalMultiBoard();
  }

  openMultiBoardModal() {
    if (!this.dom.multiBoardModal) return;
    this.dom.multiBoardModal.classList.add('open');
    this.fetchRealMultiBoardRooms();
    this.startMultiBoardSync();
  }

  closeMultiBoardModal() {
    if (!this.dom.multiBoardModal) return;
    this.dom.multiBoardModal.classList.remove('open');
    this.stopMultiBoardSync();
  }

  renderModalMultiBoard() {
    if (!this.dom.modalMultiBoardGrid) return;
    const PAGE_SIZE = 4;

    const filtered = this.multiBoardRooms.filter(room => {
      if (this.multiBoardFilter === 'PLAYING') return room.status === 'PLAYING';
      if (this.multiBoardFilter === 'WAITING') return room.status === 'WAITING' || !room.hasP2;
      return true;
    });

    const totalRooms = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRooms / PAGE_SIZE));
    if (this.multiBoardPage > totalPages) this.multiBoardPage = totalPages;

    if (totalRooms === 0) {
      if (this.multiBoardRooms.length === 0) {
        this.dom.modalMultiBoardGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1.5rem; background: rgba(15, 23, 42, 0.6); border: 1.5px dashed rgba(255, 255, 255, 0.15); border-radius: 14px;">
            <div style="font-size: 2.8rem; margin-bottom: 0.6rem;">🏟️</div>
            <h3 style="font-size: 1.25rem; color: #f8fafc; margin-bottom: 0.4rem;">Chưa có phòng thi đấu trực tuyến nào</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 460px; margin: 0 auto 1.5rem auto; line-height: 1.6;">
              Hiện tại không có trận đấu nào đang diễn ra trên máy chủ. Bạn có thể tạo phòng mới ngay để thi đấu cùng người chơi khác!
            </p>
            <div style="display: flex; justify-content: center; gap: 0.75rem;">
              <button id="btn-modal-create-room" class="btn btn-primary" style="padding: 0.6rem 1.4rem; font-size: 0.9rem;">
                ➕ Tạo phòng đấu mới ngay
              </button>
            </div>
          </div>
        `;
        const btnModalCreate = document.getElementById('btn-modal-create-room');
        if (btnModalCreate) {
          btnModalCreate.onclick = () => {
            this.closeMultiBoardModal();
            this.openRoomModal();
          };
        }
      } else {
        this.dom.modalMultiBoardGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
            <p>Không có bàn cờ nào phù hợp bộ lọc hiện tại.</p>
          </div>
        `;
      }
      if (this.dom.modalPaginationBar) this.dom.modalPaginationBar.innerHTML = '';
      return;
    }

    const startIndex = (this.multiBoardPage - 1) * PAGE_SIZE;
    const currentRooms = filtered.slice(startIndex, startIndex + PAGE_SIZE);

    this.dom.modalMultiBoardGrid.innerHTML = '';

    currentRooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'mini-board-card';
      card.id = `modal-card-${room.id}`;

      const isPlaying = room.status === 'PLAYING';
      const statusBadgeClass = isPlaying ? 'status-playing' : (room.status === 'ENDED' ? 'status-ended' : 'status-waiting');
      const statusText = isPlaying ? '🟢 ĐANG ĐẤU' : (room.status === 'ENDED' ? '⚪ KẾT THÚC' : '🟡 CHỜ ĐỐI THỦ');

      const turnText = room.turn === PLAYERS.PLAYER_1
        ? '<span style="color: #f87171; font-weight:700;">🔴 Lượt P1</span>'
        : '<span style="color: #60a5fa; font-weight:700;">🔵 Lượt P2</span>';

      card.innerHTML = `
        <div class="mini-board-header">
          <span class="mini-room-code">🎲 ${room.id}</span>
          <span class="room-status-badge ${statusBadgeClass}">${statusText}</span>
        </div>
        <div style="font-size: 0.85rem; font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${room.title || 'Ván đấu OTTv2'}
        </div>
        <div class="mini-matchup-row">
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <span>🔴</span>
            <strong style="color: #fca5a5;">${room.p1Name || 'P1'}</strong>
            <small style="color: var(--text-muted); font-family: monospace;">(${room.clockP1 || '05:00'})</small>
          </div>
          <span style="font-weight: 900; color: var(--gold); font-size: 0.75rem;">VS</span>
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <small style="color: var(--text-muted); font-family: monospace;">(${room.clockP2 || '05:00'})</small>
            <strong style="color: #93c5fd;">${room.p2Name || 'P2'}</strong>
            <span>🔵</span>
          </div>
        </div>
        <div class="mini-board-wrapper" id="modal-mini-container-${room.id}"></div>
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); padding: 0 0.2rem;">
          <div>${turnText}</div>
          <div>Nước: <strong style="color: #fff;">${room.moveCount || 0}</strong> · 👁️ ${room.spectators || 0}</div>
        </div>
        <div class="mini-footer-actions">
          <a href="index.html?room=${room.id}&role=SPECTATOR" class="btn-chess-tool" style="flex:1; justify-content:center; text-decoration:none;" title="Xem toàn màn hình">
            👁️ Xem Bàn Này
          </a>
          ${!room.hasP2 ? `
            <a href="index.html?room=${room.id}&role=P2" class="btn-chess-tool" style="flex:1; justify-content:center; text-decoration:none; border-color: rgba(239, 68, 68, 0.5); color: #fca5a5;" title="Vào thi đấu P2">
              ⚔️ Vào Đấu (P2)
            </a>
          ` : `
            <a href="rooms.html" class="btn-chess-tool" style="flex:1; justify-content:center; text-decoration:none; border-color: rgba(16, 185, 129, 0.5); color: #34d399;" title="Mở sảnh đấu lớn">
              🏛️ Sảnh Lớn
            </a>
          `}
        </div>
      `;

      this.dom.modalMultiBoardGrid.appendChild(card);

      const target = document.getElementById(`modal-mini-container-${room.id}`);
      if (target) {
        BoardRenderer.renderMiniBoard(target, room.board, {
          turn: room.turn,
          lastMove: room.lastMove
        });
      }
    });

    this.renderModalPagination(totalPages, totalRooms, startIndex, currentRooms.length);
  }

  renderModalPagination(totalPages, totalRooms, startIndex, currentCount) {
    if (!this.dom.modalPaginationBar) return;
    if (totalPages <= 1 && totalRooms <= 4) {
      this.dom.modalPaginationBar.innerHTML = `
        <span class="page-info-text">Hiển thị <strong>${totalRooms}</strong> bàn cờ</span>
      `;
      return;
    }

    this.dom.modalPaginationBar.innerHTML = '';

    const btnFirst = document.createElement('button');
    btnFirst.className = 'page-btn';
    btnFirst.innerHTML = '⏮️ Đầu';
    btnFirst.disabled = (this.multiBoardPage === 1);
    btnFirst.onclick = () => { this.multiBoardPage = 1; this.renderModalMultiBoard(); };
    this.dom.modalPaginationBar.appendChild(btnFirst);

    const btnPrev = document.createElement('button');
    btnPrev.className = 'page-btn';
    btnPrev.innerHTML = '◀️ Trước';
    btnPrev.disabled = (this.multiBoardPage === 1);
    btnPrev.onclick = () => { if (this.multiBoardPage > 1) { this.multiBoardPage--; this.renderModalMultiBoard(); } };
    this.dom.modalPaginationBar.appendChild(btnPrev);

    for (let p = 1; p <= totalPages; p++) {
      const btnPage = document.createElement('button');
      btnPage.className = `page-btn ${p === this.multiBoardPage ? 'active' : ''}`;
      btnPage.textContent = p;
      btnPage.onclick = () => { this.multiBoardPage = p; this.renderModalMultiBoard(); };
      this.dom.modalPaginationBar.appendChild(btnPage);
    }

    const btnNext = document.createElement('button');
    btnNext.className = 'page-btn';
    btnNext.innerHTML = 'Sau ▶️';
    btnNext.disabled = (this.multiBoardPage === totalPages);
    btnNext.onclick = () => { if (this.multiBoardPage < totalPages) { this.multiBoardPage++; this.renderModalMultiBoard(); } };
    this.dom.modalPaginationBar.appendChild(btnNext);

    const btnLast = document.createElement('button');
    btnLast.className = 'page-btn';
    btnLast.innerHTML = 'Cuối ⏭️';
    btnLast.disabled = (this.multiBoardPage === totalPages);
    btnLast.onclick = () => { this.multiBoardPage = totalPages; this.renderModalMultiBoard(); };
    this.dom.modalPaginationBar.appendChild(btnLast);

    const infoSpan = document.createElement('span');
    infoSpan.className = 'page-info-text';
    infoSpan.innerHTML = `Bàn ${startIndex + 1} - ${startIndex + currentCount} / Tổng ${totalRooms} (Trang ${this.multiBoardPage}/${totalPages})`;
    this.dom.modalPaginationBar.appendChild(infoSpan);
  }

  startMultiBoardSync() {
    this.stopMultiBoardSync();
    this.multiBoardSyncInterval = setInterval(() => {
      if (!this.dom.multiBoardModal?.classList.contains('open')) {
        this.stopMultiBoardSync();
        return;
      }
      this.fetchRealMultiBoardRooms();
    }, 3500);
  }

  stopMultiBoardSync() {
    if (this.multiBoardSyncInterval) {
      clearInterval(this.multiBoardSyncInterval);
      this.multiBoardSyncInterval = null;
    }
  }

  getSerializableState() {
    return {
      board: this.board,
      currentTurn: this.currentTurn,
      gameStatus: this.gameStatus,
      lastMove: this.lastMove,
      winnerInfo: this.winnerInfo
    };
  }
}

// Instantiate and start on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.ottGame = new OttApp();
  window.ottGame.init();
});
