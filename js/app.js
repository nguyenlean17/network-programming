/**
 * Oẳn Tù Tì v2 (OTTv2) - Main Application Controller
 * Orchestrates game rules, board renderer, AI engine, and playhtml.fun multiplayer sync.
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
  countPlayerPieces,
  checkWinCondition
} from './gameRules.js';
import { BoardRenderer } from './board.js';
import { OttAi } from './ai.js';
import { PlayhtmlSyncEngine } from './playhtmlSync.js';

class OttApp {
  constructor() {
    this.gameMode = 'LOCAL'; // 'LOCAL', 'BOT', 'MULTIPLAYER'
    this.boardPreset = 'FRONTLINE'; // 'FRONTLINE' | 'DIAGONAL'
    this.goalMode = 'ANY'; // 'ANY' (A1 or I9) | 'OPPOSITE'
    this.currentTurn = PLAYERS.PLAYER_1;
    this.gameStatus = GAME_STATUS.PLAYING;
    this.board = null;
    this.lastMove = null;
    this.moveHistory = [];
    this.winnerInfo = null;

    // AI engine
    this.ai = new OttAi('normal');

    // Multiplayer sync
    this.syncEngine = new PlayhtmlSyncEngine({
      onRemoteUpdate: (data) => this.handleRemoteUpdate(data),
      onConnectionChange: (connected, msg) => this.handleConnectionChange(connected, msg),
      onRoomJoined: (roomId, role) => this.handleRoomJoined(roomId, role)
    });

    // Elements
    this.dom = {};
  }

  init() {
    this.cacheDomElements();
    this.initBoardRenderer();
    this.bindEvents();
    this.bindMainMenuEvents();

    // Check URL for room parameter (?room=...)
    const urlRoom = this.syncEngine.getRoomFromUrl();
    if (urlRoom) {
      this.gameMode = 'MULTIPLAYER';
      this.dom.gameModeSelect.value = 'MULTIPLAYER';
      this.syncEngine.joinRoom(urlRoom, 'P2', this.getSerializableState());
      this.hideMainMenu(); // Skip menu when joining via link
    }

    this.startNewGame();
  }

  cacheDomElements() {
    this.dom = {
      boardContainer: document.getElementById('board-container'),
      turnBanner: document.getElementById('turn-banner'),
      turnText: document.getElementById('turn-text'),
      turnBadge: document.getElementById('turn-badge'),
      battleLog: document.getElementById('battle-log'),
      toastAlert: document.getElementById('toast-alert'),

      // Player 1 Cards
      p1Card: document.getElementById('player1-card'),
      p1RockCount: document.getElementById('p1-rock-count'),
      p1PaperCount: document.getElementById('p1-paper-count'),
      p1ScissorsCount: document.getElementById('p1-scissors-count'),
      p1TotalCount: document.getElementById('p1-total-count'),

      // Player 2 Cards
      p2Card: document.getElementById('player2-card'),
      p2RockCount: document.getElementById('p2-rock-count'),
      p2PaperCount: document.getElementById('p2-paper-count'),
      p2ScissorsCount: document.getElementById('p2-scissors-count'),
      p2TotalCount: document.getElementById('p2-total-count'),

      // Controls
      gameModeSelect: document.getElementById('game-mode-select'),
      newGameBtn: document.getElementById('btn-new-game'),
      rulesBtn: document.getElementById('btn-rules'),
      soundBtn: document.getElementById('btn-sound'),
      onlineBtn: document.getElementById('btn-online-room'),
      presetSelect: document.getElementById('board-preset-select'),

      // Room Modal
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

      // Rules Modal
      rulesModal: document.getElementById('rules-modal'),
      closeRulesModal: document.getElementById('close-rules-modal'),

      // Victory Overlay
      victoryModal: document.getElementById('victory-modal'),
      victoryTitle: document.getElementById('victory-title'),
      victoryDesc: document.getElementById('victory-desc'),
      btnVictoryRestart: document.getElementById('btn-victory-restart'),

      // Main Menu
      mainMenu: document.getElementById('main-menu'),
      menuBtnRules: document.getElementById('menu-btn-rules'),
      menuBtns: document.querySelectorAll('.menu-btn[data-mode]')
    };
  }

  initBoardRenderer() {
    this.renderer = new BoardRenderer(this.dom.boardContainer, {
      onMove: (moveData) => this.handleMove(moveData),
      onInvalidClick: (msg) => this.showToast(msg, 'warning')
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

    this.dom.onlineBtn.addEventListener('click', () => {
      this.openRoomModal();
    });
    this.dom.closeRoomModal.addEventListener('click', () => {
      this.dom.roomModal.classList.remove('open');
    });

    this.dom.btnCreateRoom.addEventListener('click', () => {
      const newRoom = this.syncEngine.generateRoomId();
      this.syncEngine.joinRoom(newRoom, 'P1', this.getSerializableState());
    });

    this.dom.btnJoinRoom.addEventListener('click', () => {
      const code = this.dom.roomCodeInput.value.trim().toUpperCase();
      if (!code) {
        this.showToast('Vui lòng nhập mã phòng!', 'warning');
        return;
      }
      const fullRoom = code.startsWith('OTTV2-') ? code.toLowerCase() : `ottv2-${code.toLowerCase()}`;
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

    // Role switcher
    [this.dom.roleP1Btn, this.dom.roleP2Btn, this.dom.roleSpecBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', (e) => {
          const role = e.currentTarget.dataset.role;
          this.syncEngine.setRole(role);
          this.updateRoleButtons(role);
          this.renderer.setLocalRole(role === 'SPECTATOR' ? 'NONE' : role);
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
    this.dom.battleLog.innerHTML = '<div class="log-entry info">Trận đấu bắt đầu! Lượt đầu tiên thuộc về Player 1.</div>';
    this.showToast('Bắt đầu ván mới!', 'info');
  }

  handleMove(moveData) {
    if (this.gameStatus === GAME_STATUS.ENDED) return;

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
      this.addLog(`${playerText} (${pieceIcon} ${pieceName}) đã ăn ${enemyIcon} ${enemyName} tại ô ${to}!`, 'capture');
      this.showToast(`${playerText}: ${pieceName} đã ăn ${enemyName}!`, 'capture');
    } else {
      this.addLog(`${playerText} di chuyển ${pieceIcon} ${pieceName} từ ${from} đến ${to}.`, 'normal');
    }

    // Check Win Condition
    const win = checkWinCondition(this.board, this.lastMove, this.goalMode);
    if (win.hasWinner) {
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
    this.dom.turnText.textContent = 'Máy đang suy nghĩ...';

    setTimeout(() => {
      if (this.gameStatus === GAME_STATUS.ENDED) return;
      const aiMove = this.ai.getBestMove(this.board, PLAYERS.PLAYER_2, this.goalMode);

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
    }, 550);
  }

  handleVictory(win) {
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
    this.dom.turnBadge.textContent = isP1 ? 'P1' : 'P2';
    this.dom.turnText.textContent = `Lượt của ${isP1 ? 'Player 1' : 'Player 2'}`;

    this.dom.p1Card.classList.toggle('active-turn', isP1);
    this.dom.p2Card.classList.toggle('active-turn', !isP1);
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
    if (!data || !data.gameState) return;
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

    if (data.lastMove) {
      sounds.move();
    }

    if (gameStatus === GAME_STATUS.ENDED && winnerInfo) {
      this.handleVictory(winnerInfo);
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

  // ===== Main Menu =====
  bindMainMenuEvents() {
    // Mode buttons
    this.dom.menuBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this.gameMode = mode;
        this.dom.gameModeSelect.value = mode;
        this.hideMainMenu();
        this.startNewGame();

        if (mode === 'MULTIPLAYER') {
          this.openRoomModal();
        }
      });
    });

    // Rules button on main menu
    if (this.dom.menuBtnRules) {
      this.dom.menuBtnRules.addEventListener('click', () => {
        this.dom.rulesModal.classList.add('open');
      });
    }
  }

  hideMainMenu() {
    if (this.dom.mainMenu) {
      this.dom.mainMenu.classList.add('hidden');
    }
  }

  showMainMenu() {
    if (this.dom.mainMenu) {
      this.dom.mainMenu.classList.remove('hidden');
    }
  }
}

// Instantiate and start on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.ottGame = new OttApp();
  window.ottGame.init();
});
