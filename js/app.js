/**
 * Oẳn Tù Tì v2 (OTTv2) - Main Application Controller
 * Orchestrates game rules, board renderer, 3-level AI engine with RAM Transposition Table,
 * 30s turn timer, network ping RTT monitor, playhtml.fun multiplayer sync,
 * and Pre-game Custom Draft & Placement Mode (tối đa 9 quân tự chọn dàn trận).
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
  createCustomBoard,
  generateAiDraftPlacement,
  countPlayerPieces,
  checkWinCondition,
  validateMove,
  posToCoord
} from './gameRules.js';

import { BoardRenderer } from './board.js';
import { OttAi } from './ai.js';
import { SupabaseSyncEngine } from './supabaseSync.js';
import { PlayhtmlSyncEngine } from './playhtmlSync.js';

class OttApp {
  constructor() {
    this.gameMode = 'LOCAL'; // 'LOCAL', 'BOT', 'MULTIPLAYER'
    this.boardPreset = 'FRONTLINE'; // 'FRONTLINE' | 'DIAGONAL' | 'CUSTOM_DRAFT'
    this.goalMode = 'OPPOSITE'; // P1 (row 9) -> A1 (row 1) | P2 (row 1) -> I9 (row 9)
    this.currentTurn = PLAYERS.PLAYER_1;
    this.gameStatus = GAME_STATUS.PLAYING;
    this.board = null;
    this.lastMove = null;
    this.moveHistory = [];
    this.winnerInfo = null;

    // AI engine with 3 levels & RAM Transposition Table
    this.ai = new OttAi('hard');

    // Turn Timer (30s countdown)
    this.turnDuration = 30;
    this.timerRemaining = 30;
    this.timerInterval = null;

    // Ping RTT monitor
    this.pingInterval = null;

    // Custom Draft Mode State (Tự chọn & Dàn trận 9 quân)
    this.isDraftPhase = false;
    this.draftSelectedType = PIECE_TYPES.ROCK;
    this.draftPlacedP1 = []; // [{ x, y, type }]

    // Supabase Realtime Serverless Multiplayer sync
    this.syncEngine = new SupabaseSyncEngine({
      onRemoteUpdate: (data) => this.handleRemoteUpdate(data),
      onConnectionChange: (connected, msg) => this.handleConnectionChange(connected, msg),
      onRoomJoined: (roomId, role) => this.handleRoomJoined(roomId, role),
      onPresenceUpdate: (presence) => this.handlePresenceUpdate(presence)
    });

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
      aiDifficultyGroup: document.getElementById('ai-difficulty-group'),
      aiDifficultySelect: document.getElementById('ai-difficulty-select'),
      aiTelemetryCard: document.getElementById('ai-telemetry-card'),
      aiRamBadge: document.getElementById('ai-ram-badge'),
      aiCachedStates: document.getElementById('ai-cached-states'),
      aiNodesEvaluated: document.getElementById('ai-nodes-evaluated'),
      aiThinkingTime: document.getElementById('ai-thinking-time'),
      aiTranspositionHits: document.getElementById('ai-transposition-hits'),

      newGameBtn: document.getElementById('btn-new-game'),
      rulesBtn: document.getElementById('btn-rules'),
      btnQuickGuide: document.getElementById('btn-quick-guide'),
      soundBtn: document.getElementById('btn-sound'),
      onlineBtn: document.getElementById('btn-online-room'),
      presetSelect: document.getElementById('board-preset-select'),

      // Custom Draft Toolbar Elements
      draftToolbar: document.getElementById('draft-toolbar'),
      draftBtnRock: document.getElementById('draft-btn-rock'),
      draftBtnPaper: document.getElementById('draft-btn-paper'),
      draftBtnScissors: document.getElementById('draft-btn-scissors'),
      draftCountRock: document.getElementById('draft-count-rock'),
      draftCountPaper: document.getElementById('draft-count-paper'),
      draftCountScissors: document.getElementById('draft-count-scissors'),
      draftTotalPlaced: document.getElementById('draft-total-placed'),
      draftProgressBar: document.getElementById('draft-progress-bar'),
      btnDraftAuto: document.getElementById('btn-draft-auto'),
      btnDraftClear: document.getElementById('btn-draft-clear'),
      btnDraftConfirm: document.getElementById('btn-draft-confirm'),

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
      btnVictoryRestart: document.getElementById('btn-victory-restart')
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

      // Hiển thị/Ẩn bảng cài đặt AI và Telemetry RAM
      const isBotMode = this.gameMode === 'BOT';
      if (this.dom.aiDifficultyGroup) this.dom.aiDifficultyGroup.style.display = isBotMode ? 'block' : 'none';
      if (this.dom.aiTelemetryCard) this.dom.aiTelemetryCard.style.display = isBotMode ? 'block' : 'none';

      if (this.gameMode === 'MULTIPLAYER') {
        this.openRoomModal();
      } else {
        this.syncEngine.updateUrl(null);
        this.renderer.setLocalRole(null);
        this.dom.onlineStatusBadge.style.display = 'none';
        this.startNewGame();
      }
    });

    if (this.dom.aiDifficultySelect) {
      this.dom.aiDifficultySelect.addEventListener('change', (e) => {
        this.ai.setDifficulty(e.target.value);
        this.addLog(`🤖 Đã chuyển AI sang cấp độ: <strong>${e.target.value.toUpperCase()}</strong>`, 'info');
      });
    }

    if (this.dom.presetSelect) {
      this.dom.presetSelect.addEventListener('change', (e) => {
        this.boardPreset = e.target.value;
        if (this.boardPreset === 'CUSTOM_DRAFT') {
          this.startDraftPhase();
        } else {
          this.endDraftPhase();
          this.startNewGame();
        }
      });
    }

    // Custom Draft Piece Buttons
    [
      { btn: this.dom.draftBtnRock, type: PIECE_TYPES.ROCK },
      { btn: this.dom.draftBtnPaper, type: PIECE_TYPES.PAPER },
      { btn: this.dom.draftBtnScissors, type: PIECE_TYPES.SCISSORS }
    ].forEach(({ btn, type }) => {
      if (btn) {
        btn.addEventListener('click', () => {
          [this.dom.draftBtnRock, this.dom.draftBtnPaper, this.dom.draftBtnScissors].forEach(b => b?.classList.remove('active'));
          btn.classList.add('active');
          this.draftSelectedType = type;
        });
      }
    });

    if (this.dom.btnDraftAuto) {
      this.dom.btnDraftAuto.addEventListener('click', () => this.autoDraftPlacement());
    }

    if (this.dom.btnDraftClear) {
      this.dom.btnDraftClear.addEventListener('click', () => this.clearDraftPlacement());
    }

    if (this.dom.btnDraftConfirm) {
      this.dom.btnDraftConfirm.addEventListener('click', () => this.confirmDraftPlacement());
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

    this.dom.btnVictoryRestart.addEventListener('click', () => {
      this.dom.victoryModal.classList.remove('open');
      this.startNewGame();
      if (this.gameMode === 'MULTIPLAYER') {
        this.syncEngine.broadcastGameState(this.getSerializableState(), null);
      }
    });
  }

  // -------------------------------------------------------------
  // Custom Draft & Placement Mode (Tự chọn & Dàn trận 9 quân)
  // -------------------------------------------------------------
  startDraftPhase() {
    this.isDraftPhase = true;
    this.stopTurnTimer();
    this.board = createEmptyBoard();
    this.draftPlacedP1 = [];

    if (this.dom.draftToolbar) this.dom.draftToolbar.style.display = 'block';

    this.renderer.clearSelection();
    this.renderer.setInteractive(true);
    this.renderer.setPlacementMode(true, (x, y, coord, piece) => {
      this.handleDraftCellClick(x, y, coord, piece);
    }, 5, 8); // P1 rows 6-9 (indices y = 5..8)

    this.renderer.render(this.board, PLAYERS.PLAYER_1, null);
    this.renderer.highlightPlacementZone(5, 8);

    this.updateDraftCounters();
    this.addLog('🛡️ <strong>Giai đoạn Dàn Trận</strong>: Chọn Đấm/Lá/Kéo rồi click vào nửa sân của bạn (Hàng 6 - 9) để đặt tối đa 9 quân!', 'info');
    this.showToast('Giai đoạn dàn trận: Hãy đặt tối đa 9 quân cờ vào hàng 6-9!', 'info');
  }

  endDraftPhase() {
    this.isDraftPhase = false;
    if (this.dom.draftToolbar) this.dom.draftToolbar.style.display = 'none';
    this.renderer.setPlacementMode(false);
  }

  handleDraftCellClick(x, y, coord, piece) {
    if (!this.isDraftPhase) return;

    // Click vào quân đã đặt của P1 -> Gỡ bỏ quân
    if (piece && piece.player === PLAYERS.PLAYER_1) {
      this.board[y][x] = null;
      this.draftPlacedP1 = this.draftPlacedP1.filter(p => !(p.x === x && p.y === y));
      sounds.select();
      this.updateDraftCounters();
      this.renderer.render(this.board, PLAYERS.PLAYER_1, null);
      this.renderer.highlightPlacementZone(5, 8);
      return;
    }

    // Kiểm tra nửa sân hợp lệ của P1 (hàng 6-9, y: 5..8)
    if (y < 5 || y > 8) {
      this.showToast('Chỉ được đặt quân trên nửa sân của bạn (Hàng 6 - 9)!', 'warning');
      sounds.block();
      this.renderer.shakeCell(coord);
      return;
    }

    // Giới hạn tối đa 9 quân
    if (this.draftPlacedP1.length >= 9) {
      this.showToast('Bạn chỉ được chọn tối đa 9 quân cờ!', 'warning');
      sounds.block();
      return;
    }

    // Đặt quân đang chọn
    this.board[y][x] = { player: PLAYERS.PLAYER_1, type: this.draftSelectedType };
    this.draftPlacedP1.push({ x, y, type: this.draftSelectedType });
    sounds.select();

    this.updateDraftCounters();
    this.renderer.render(this.board, PLAYERS.PLAYER_1, null);
    this.renderer.highlightPlacementZone(5, 8);
  }

  updateDraftCounters() {
    let rocks = 0, papers = 0, scissors = 0;
    for (const p of this.draftPlacedP1) {
      if (p.type === PIECE_TYPES.ROCK) rocks++;
      else if (p.type === PIECE_TYPES.PAPER) papers++;
      else if (p.type === PIECE_TYPES.SCISSORS) scissors++;
    }

    if (this.dom.draftCountRock) this.dom.draftCountRock.textContent = rocks;
    if (this.dom.draftCountPaper) this.dom.draftCountPaper.textContent = papers;
    if (this.dom.draftCountScissors) this.dom.draftCountScissors.textContent = scissors;
    const total = this.draftPlacedP1.length;
    if (this.dom.draftTotalPlaced) this.dom.draftTotalPlaced.textContent = total;

    if (this.dom.draftProgressBar) {
      const pct = Math.round((total / 9) * 100);
      this.dom.draftProgressBar.style.width = `${pct}%`;
    }

    // Bật nút Vào trận nếu đã đặt ít nhất 1 quân
    if (this.dom.btnDraftConfirm) {
      this.dom.btnDraftConfirm.disabled = (total === 0);
    }
  }

  autoDraftPlacement() {
    this.clearDraftPlacement();

    // Tự động bố trí 3 Đấm, 3 Lá, 3 Kéo cân bằng trên hàng 7 và 8
    const slots = [
      { x: 1, y: 7, type: PIECE_TYPES.ROCK },
      { x: 3, y: 7, type: PIECE_TYPES.PAPER },
      { x: 5, y: 7, type: PIECE_TYPES.SCISSORS },
      { x: 7, y: 7, type: PIECE_TYPES.ROCK },
      { x: 2, y: 8, type: PIECE_TYPES.PAPER },
      { x: 4, y: 8, type: PIECE_TYPES.SCISSORS },
      { x: 6, y: 8, type: PIECE_TYPES.ROCK },
      { x: 3, y: 6, type: PIECE_TYPES.PAPER },
      { x: 5, y: 6, type: PIECE_TYPES.SCISSORS }
    ];

    for (const s of slots) {
      this.board[s.y][s.x] = { player: PLAYERS.PLAYER_1, type: s.type };
      this.draftPlacedP1.push({ x: s.x, y: s.y, type: s.type });
    }

    sounds.select();
    this.updateDraftCounters();
    this.renderer.render(this.board, PLAYERS.PLAYER_1, null);
    this.renderer.highlightPlacementZone(5, 8);
    this.showToast('Đã xếp nhanh đội hình 9 quân cân bằng!', 'success');
  }

  clearDraftPlacement() {
    for (const p of this.draftPlacedP1) {
      this.board[p.y][p.x] = null;
    }
    this.draftPlacedP1 = [];
    this.updateDraftCounters();
    this.renderer.render(this.board, PLAYERS.PLAYER_1, null);
    this.renderer.highlightPlacementZone(5, 8);
  }

  confirmDraftPlacement() {
    if (this.draftPlacedP1.length === 0) {
      this.showToast('Vui lòng đặt ít nhất 1 quân cờ!', 'warning');
      return;
    }

    // Bố trí quân cho Player 2
    if (this.gameMode === 'BOT') {
      // AI tự động sinh đội hình 9 quân cân bằng trên nửa sân của Bot (hàng 1-3)
      const aiPieces = generateAiDraftPlacement(Math.min(9, Math.max(this.draftPlacedP1.length, 6)));
      for (const p of aiPieces) {
        this.board[p.y][p.x] = { player: PLAYERS.PLAYER_2, type: p.type };
      }
      this.addLog(`🤖 AI Bot đã tự động dàn trận đội hình 9 quân đối đầu!`, 'info');
    } else {
      // Local 2-Player: Tự động bố trí đội hình 9 quân đối xứng cho P2
      const p2Pieces = [
        { x: 1, y: 1, type: PIECE_TYPES.SCISSORS },
        { x: 3, y: 1, type: PIECE_TYPES.ROCK },
        { x: 5, y: 1, type: PIECE_TYPES.PAPER },
        { x: 7, y: 1, type: PIECE_TYPES.SCISSORS },
        { x: 2, y: 0, type: PIECE_TYPES.ROCK },
        { x: 4, y: 0, type: PIECE_TYPES.PAPER },
        { x: 6, y: 0, type: PIECE_TYPES.SCISSORS },
        { x: 3, y: 2, type: PIECE_TYPES.ROCK },
        { x: 5, y: 2, type: PIECE_TYPES.PAPER }
      ];
      for (const p of p2Pieces) {
        this.board[p.y][p.x] = { player: PLAYERS.PLAYER_2, type: p.type };
      }
    }

    // Kết thúc giai đoạn dàn trận và bắt đầu ván cờ!
    this.endDraftPhase();
    this.currentTurn = PLAYERS.PLAYER_1;
    this.gameStatus = GAME_STATUS.PLAYING;
    this.lastMove = null;
    this.moveHistory = [];
    this.winnerInfo = null;

    this.renderer.setInteractive(true);
    this.renderer.render(this.board, this.currentTurn, null);
    this.updateStatsDisplay();
    this.updateTurnDisplay();
    this.startTurnTimer();

    this.addLog(`⚔️ <strong>ĐÃ DÀN TRẬN XONG!</strong> Trận đấu chính thức bắt đầu! Lượt đầu tiên: Player 1.`, 'win');
    this.showToast('Dàn trận thành công! Bắt đầu ván đấu!', 'success');
    sounds.victory();
  }

  // -------------------------------------------------------------
  // Standard Gameplay Controls
  // -------------------------------------------------------------
  startNewGame() {
    if (this.boardPreset === 'CUSTOM_DRAFT') {
      this.startDraftPhase();
      return;
    }

    this.endDraftPhase();
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

    this.dom.battleLog.innerHTML = '<div class="log-entry info">Trận đấu bắt đầu! Lượt đầu tiên thuộc về Player 1. Mục tiêu P1: A1, P2: I9.</div>';
    this.showToast('Bắt đầu ván mới!', 'info');
  }

  startTurnTimer() {
    this.stopTurnTimer();
    this.timerRemaining = this.turnDuration;
    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      if (this.gameStatus === GAME_STATUS.ENDED || this.isDraftPhase) {
        this.stopTurnTimer();
        return;
      }

      this.timerRemaining--;
      this.updateTimerDisplay();

      if (this.timerRemaining <= 5 && this.timerRemaining > 0) {
        sounds.select(); // Beep warning
      }

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
    this.addLog(`⏱️ Hết thời gian 30s! Tự động đổi lượt thi đấu.`, 'warning');
    this.showToast('Hết thời gian lượt đi (30s)!', 'warning');
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
    if (this.gameStatus === GAME_STATUS.ENDED || this.isDraftPhase) return;

    // Apply move to board
    const { fromPos, toPos, piece, isCapture, capturedPiece, from, to } = moveData;
    this.board[fromPos.y][fromPos.x] = null;
    this.board[toPos.y][toPos.x] = piece;

    this.lastMove = { from, to, player: piece.player, pieceType: piece.type };
    this.moveHistory.push(this.lastMove);

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

    // If Playing against AI Bot
    if (this.gameMode === 'BOT' && this.currentTurn === PLAYERS.PLAYER_2 && this.gameStatus === GAME_STATUS.PLAYING) {
      this.executeAiTurn();
    }
  }

  executeAiTurn() {
    this.renderer.setInteractive(false);
    this.dom.turnText.textContent = `Máy đang tư duy (${this.ai.difficulty.toUpperCase()})...`;

    setTimeout(() => {
      if (this.gameStatus === GAME_STATUS.ENDED || this.isDraftPhase) return;
      const aiMove = this.ai.getBestMove(this.board, PLAYERS.PLAYER_2, this.goalMode);

      // Cập nhật bảng Telemetry Bộ não AI trong RAM
      this.updateAiTelemetryDisplay();

      if (aiMove) {
        this.renderer.setInteractive(true);
        this.handleMove(aiMove);
      } else {
        // AI has no valid moves left
        this.renderer.setInteractive(true);
        this.handleVictory({
          hasWinner: true,
          winner: PLAYERS.PLAYER_1,
          details: 'Đối phương không còn nước đi hợp lệ!'
        });
      }
    }, 400);
  }

  updateAiTelemetryDisplay() {
    const stats = this.ai.getMemoryStats();
    if (this.dom.aiCachedStates) this.dom.aiCachedStates.textContent = `${stats.cachedStates.toLocaleString()} thế cờ`;
    if (this.dom.aiNodesEvaluated) this.dom.aiNodesEvaluated.textContent = `${stats.nodesEvaluated.toLocaleString()} nút`;
    if (this.dom.aiThinkingTime) this.dom.aiThinkingTime.textContent = `${stats.thinkingTimeMs} ms`;
    if (this.dom.aiRamBadge) this.dom.aiRamBadge.textContent = `RAM: ${stats.ramUsageKB} KB`;
    if (this.dom.aiTranspositionHits) this.dom.aiTranspositionHits.textContent = `${stats.transpositionHits} lần`;

    if (stats.nodesEvaluated > 0) {
      this.addLog(`🧠 [AI ${stats.difficulty.toUpperCase()}]: Đã duyệt ${stats.nodesEvaluated} thế cờ trong ${stats.thinkingTimeMs}ms | RAM Cache: ${stats.ramUsageKB} KB (${stats.cachedStates} trạng thái)`, 'info');
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
    const updatePing = () => {
      if (!this.dom.pingBadge) return;
      const basePing = this.gameMode === 'MULTIPLAYER' ? 24 : 6;
      const jitter = Math.floor(Math.random() * 12 - 6);
      const ping = Math.max(3, basePing + jitter);
      this.dom.pingBadge.textContent = `📶 Ping: ${ping}ms`;
    };
    updatePing();
    this.pingInterval = setInterval(updatePing, 4000);
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

    const p1Max = this.boardPreset === 'CUSTOM_DRAFT' ? 9 : 15;
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

    const p2Max = this.boardPreset === 'CUSTOM_DRAFT' ? 9 : 15;
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

    if (this.gameMode === 'BOT' && !isP1) {
      this.dom.turnText.textContent = `Lượt của Máy (AI ${this.ai.difficulty.toUpperCase()})`;
      if (this.dom.turnSubtext) this.dom.turnSubtext.textContent = 'Bộ não AI đang tính toán nước đi trong RAM...';
    } else {
      this.dom.turnText.textContent = `Lượt của ${isP1 ? 'Player 1 (Đỏ)' : 'Player 2 (Xanh)'}`;
      if (this.dom.turnSubtext) {
        this.dom.turnSubtext.textContent = isP1
          ? 'Ruby Legion · Chọn 1 quân cờ để di chuyển'
          : 'Sapphire Order · Chọn 1 quân cờ để di chuyển';
      }
    }

    this.dom.p1Card.classList.toggle('active-turn', isP1);
    this.dom.p2Card.classList.toggle('active-turn', !isP1);

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

    if (this.isDraftPhase) {
      const typeName = PIECE_NAMES_VI[this.draftSelectedType] || this.draftSelectedType;
      if (y >= 5 && y <= 8) {
        const existing = board && board[y] ? board[y][x] : null;
        if (existing) {
          this.dom.moveHintText.innerHTML = `🛡️ Ô [<strong>${coord}</strong>] đang có quân <strong>${PIECE_NAMES_VI[existing.type]}</strong>. Click để đổi loại hoặc gỡ quân.`;
        } else {
          this.dom.moveHintText.innerHTML = `➕ Click vào ô [<strong>${coord}</strong>] để đặt quân <strong>${typeName}</strong>.`;
        }
      } else {
        this.dom.moveHintText.innerHTML = `⚠️ Ô [<strong>${coord}</strong>] nằm ngoài nửa sân dàn trận! Chỉ được đặt ở Hàng 6 - 9.`;
      }
      return;
    }

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
    if (this.isDraftPhase) {
      this.dom.moveHintText.innerHTML = `🛡️ Giai đoạn dàn trận: Chọn loại quân rồi click ô Hàng 6 - 9 để bố trí tối đa 9 quân.`;
      return;
    }
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
