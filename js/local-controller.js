/**
 * OTTv2 (Oẳn Tù Tì v2) - Local Game Controller
 * Manages 2-Player Hotseat and Single Player vs AI Bot
 */

(function () {
  'use strict';

  // Sound generator using Web Audio API (Zero external assets required)
  class SoundFX {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }

    init() {
      if (!this.ctx && typeof AudioContext !== 'undefined') {
        this.ctx = new AudioContext();
      }
    }

    playTone(freq, type, duration, gainVal = 0.15) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      try {
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
        // Audio error handling
      }
    }

    move() { this.playTone(320, 'sine', 0.12, 0.1); }
    capture() {
      this.playTone(550, 'triangle', 0.1, 0.2);
      setTimeout(() => this.playTone(720, 'sine', 0.18, 0.2), 60);
    }
    victory() {
      const notes = [440, 554, 659, 880];
      notes.forEach((f, idx) => {
        setTimeout(() => this.playTone(f, 'triangle', 0.25, 0.25), idx * 120);
      });
    }
  }

  const sounds = new SoundFX();

  class LocalController {
    constructor() {
      this.engine = new OTTv2Engine();
      this.selectedCell = null;
      this.validMoves = [];
      this.gameMode = 'PVP'; // 'PVP' (2 players) or 'AI' (vs Computer)
      this.aiPlayer = 'P2';
      this.turnTimeLeft = 30;
      this.timerInterval = null;

      // DOM Elements
      this.boardEl = document.getElementById('local-board-grid');
      this.turnBannerEl = document.getElementById('local-turn-banner');
      this.turnDotEl = document.getElementById('local-turn-dot');
      this.turnTextEl = document.getElementById('local-turn-text');
      this.historyListEl = document.getElementById('local-history-list');

      // P1 Stats
      this.p1Card = document.getElementById('local-p1-card');
      this.p1Rock = document.getElementById('local-p1-rock');
      this.p1Paper = document.getElementById('local-p1-paper');
      this.p1Scissors = document.getElementById('local-p1-scissors');

      // P2 Stats
      this.p2Card = document.getElementById('local-p2-card');
      this.p2Rock = document.getElementById('local-p2-rock');
      this.p2Paper = document.getElementById('local-p2-paper');
      this.p2Scissors = document.getElementById('local-p2-scissors');

      // Modal
      this.modalOverlay = document.getElementById('game-modal-overlay');
      this.modalTitle = document.getElementById('modal-title');
      this.modalDesc = document.getElementById('modal-desc');
      this.modalBtn = document.getElementById('modal-restart-btn');

      this.initEvents();
      this.render();
      this.startTimer();
    }

    initEvents() {
      // Board click delegation
      if (this.boardEl) {
        this.boardEl.addEventListener('click', (e) => {
          const cell = e.target.closest('.cell');
          if (!cell) return;
          const r = parseInt(cell.dataset.r, 10);
          const c = parseInt(cell.dataset.c, 10);
          this.handleCellClick(r, c);
        });
      }

      // Mode Selector buttons
      const pvpBtn = document.getElementById('btn-mode-pvp');
      const aiBtn = document.getElementById('btn-mode-ai');
      const restartBtn = document.getElementById('btn-local-restart');
      const undoBtn = document.getElementById('btn-local-undo');

      if (pvpBtn && aiBtn) {
        pvpBtn.addEventListener('click', () => {
          this.gameMode = 'PVP';
          pvpBtn.classList.add('btn-primary');
          aiBtn.classList.remove('btn-primary');
          document.getElementById('local-p2-name').innerText = 'Người chơi 2 (Xanh)';
          this.restart();
        });

        aiBtn.addEventListener('click', () => {
          this.gameMode = 'AI';
          aiBtn.classList.add('btn-primary');
          pvpBtn.classList.remove('btn-primary');
          document.getElementById('local-p2-name').innerText = 'Máy tính (AI Bot)';
          this.restart();
        });
      }

      if (restartBtn) restartBtn.addEventListener('click', () => this.restart());
      if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
      if (this.modalBtn) this.modalBtn.addEventListener('click', () => {
        this.hideModal();
        this.restart();
      });
    }

    startTimer() {
      clearInterval(this.timerInterval);
      this.turnTimeLeft = 30;
      this.updateTimerDisplay();

      this.timerInterval = setInterval(() => {
        if (this.engine.isGameOver) {
          clearInterval(this.timerInterval);
          return;
        }

        this.turnTimeLeft--;
        this.updateTimerDisplay();

        if (this.turnTimeLeft <= 0) {
          // Auto random move when timeout
          this.makeRandomMoveForCurrentPlayer();
          this.turnTimeLeft = 30;
        }
      }, 1000);
    }

    updateTimerDisplay() {
      const timerEl = document.getElementById('local-timer-val');
      if (timerEl) {
        timerEl.innerText = `${this.turnTimeLeft}s`;
        if (this.turnTimeLeft <= 5) {
          timerEl.style.color = '#ef4444';
        } else {
          timerEl.style.color = 'var(--accent-gold)';
        }
      }
    }

    handleCellClick(r, c) {
      if (this.engine.isGameOver) return;
      if (this.gameMode === 'AI' && this.engine.turn === this.aiPlayer) return;

      const piece = this.engine.board[r][c];

      // If a cell is already selected, check if user clicked a valid move destination
      if (this.selectedCell) {
        const move = this.validMoves.find(m => m.toR === r && m.toC === c);
        if (move) {
          this.executeMove(this.selectedCell.r, this.selectedCell.c, r, c);
          this.selectedCell = null;
          this.validMoves = [];
          this.render();
          return;
        }
      }

      // If clicked on own piece: select it and calculate 8-directional moves
      if (piece && piece.player === this.engine.turn) {
        this.selectedCell = { r, c };
        this.validMoves = this.engine.getValidMoves(r, c);
        sounds.move();
      } else {
        this.selectedCell = null;
        this.validMoves = [];
      }

      this.render();
    }

    executeMove(fromR, fromC, toR, toC) {
      const result = this.engine.makeMove(fromR, fromC, toR, toC);
      if (!result.success) return;

      if (result.move.action === 'CAPTURE') {
        sounds.capture();
      } else {
        sounds.move();
      }

      this.addHistoryLog(result.move);
      this.turnTimeLeft = 30;

      if (result.gameOver) {
        sounds.victory();
        this.showModal(
          result.winner === 'P1' ? '🎉 NGƯỜI CHƠI 1 (ĐỎ) CHIẾN THẮNG!' : '🎉 NGƯỜI CHƠI 2 (XANH) CHIẾN THẮNG!',
          result.reason
        );
      } else if (this.gameMode === 'AI' && this.engine.turn === this.aiPlayer) {
        // Trigger AI turn after brief delay
        setTimeout(() => this.triggerAIMove(), 450);
      }
    }

    triggerAIMove() {
      if (this.engine.isGameOver || this.engine.turn !== this.aiPlayer) return;

      const bestMove = this.calculateBestAIMove();
      if (bestMove) {
        this.executeMove(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
        this.render();
      }
    }

    /**
     * AI Heuristic:
     * 1. Priority 1000: Win instantly by infiltrating base a1.
     * 2. Priority 800: Win instantly by eliminating last piece of any type.
     * 3. Priority 500: Capture opponent piece.
     * 4. Priority 200: Advance towards base a1.
     * 5. Priority 10: Safe valid move.
     */
    calculateBestAIMove() {
      const allMoves = this.engine.getAllValidMoves(this.aiPlayer);
      if (allMoves.length === 0) return null;

      let bestScore = -Infinity;
      let candidates = [];

      for (const move of allMoves) {
        let score = 0;

        // Base infiltration win
        if (move.toR === 0 && move.toC === 0) {
          score += 10000;
        }

        // Capture piece
        if (move.action === 'CAPTURE' && move.capturedPiece) {
          score += 500;
          // Check if this capture completely wipes out that piece type
          const oppCounts = this.engine.getRemainingPieces('P1');
          if (oppCounts[move.capturedPiece.type] === 1) {
            score += 8000; // Winning move!
          }
        }

        // Distance to target base a1 (0, 0)
        const distBefore = Math.hypot(move.fromR - 0, move.fromC - 0);
        const distAfter = Math.hypot(move.toR - 0, move.toC - 0);
        score += (distBefore - distAfter) * 30; // Closer is better

        if (score > bestScore) {
          bestScore = score;
          candidates = [move];
        } else if (score === bestScore) {
          candidates.push(move);
        }
      }

      // Pick random from top candidates to add variety
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    makeRandomMoveForCurrentPlayer() {
      const moves = this.engine.getAllValidMoves(this.engine.turn);
      if (moves.length > 0) {
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        this.executeMove(randomMove.fromR, randomMove.fromC, randomMove.toR, randomMove.toC);
        this.render();
      }
    }

    undo() {
      // Re-initialize and replay all except last move
      if (this.engine.moveHistory.length === 0) return;
      const history = [...this.engine.moveHistory];
      history.pop();
      if (this.gameMode === 'AI' && history.length > 0) {
        history.pop(); // Also undo bot's move
      }

      this.engine.initBoard();
      this.selectedCell = null;
      this.validMoves = [];
      this.historyListEl.innerHTML = '';

      for (const m of history) {
        this.engine.makeMove(m.from.r, m.from.c, m.to.r, m.to.c);
        this.addHistoryLog(m);
      }

      this.render();
    }

    restart() {
      this.engine.initBoard();
      this.selectedCell = null;
      this.validMoves = [];
      if (this.historyListEl) this.historyListEl.innerHTML = '';
      this.hideModal();
      this.startTimer();
      this.render();
    }

    addHistoryLog(move) {
      if (!this.historyListEl) return;
      const item = document.createElement('div');
      item.className = `history-item ${move.player.toLowerCase()}`;
      const actionText = move.action === 'CAPTURE' ? `⚔️ ăn ${move.captured.type}` : '→';
      item.innerHTML = `
        <span><strong>${move.player}</strong>: ${move.piece.type} ${move.from.notation} ${actionText} ${move.to.notation}</span>
        <span>#${this.engine.moveHistory.length}</span>
      `;
      this.historyListEl.prepend(item);
    }

    showModal(title, desc) {
      if (!this.modalOverlay) return;
      this.modalTitle.innerText = title;
      this.modalDesc.innerText = desc;
      this.modalOverlay.classList.add('active');
    }

    hideModal() {
      if (this.modalOverlay) this.modalOverlay.classList.remove('active');
    }

    getPieceEmoji(type) {
      switch (type) {
        case 'ROCK': return '✊';
        case 'PAPER': return '✋';
        case 'SCISSORS': return '✌️';
        default: return '';
      }
    }

    render() {
      if (!this.boardEl) return;
      this.boardEl.innerHTML = '';

      const lastMove = this.engine.moveHistory[this.engine.moveHistory.length - 1];

      // Board is rendered from top row 8 down to bottom row 0 (9 down to 1 like real board)
      for (let r = 8; r >= 0; r--) {
        for (let c = 0; c < 9; c++) {
          const cellEl = document.createElement('div');
          cellEl.className = 'cell';
          cellEl.dataset.r = r;
          cellEl.dataset.c = c;

          // Special bases
          if (r === 0 && c === 0) {
            cellEl.classList.add('base-a1');
            cellEl.innerHTML += '<span class="base-icon">🚩 a1 (P1 Base)</span>';
          }
          if (r === 8 && c === 8) {
            cellEl.classList.add('base-i9');
            cellEl.innerHTML += '<span class="base-icon">🏰 i9 (P2 Base)</span>';
          }

          // Last move highlight
          if (lastMove) {
            if (lastMove.from.r === r && lastMove.from.c === c) cellEl.classList.add('last-move-source');
            if (lastMove.to.r === r && lastMove.to.c === c) cellEl.classList.add('last-move-target');
          }

          // Selected cell highlight
          if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
            cellEl.classList.add('selected');
          }

          // Valid move & capture highlights
          const validMove = this.validMoves.find(m => m.toR === r && m.toC === c);
          if (validMove) {
            if (validMove.action === 'CAPTURE') {
              cellEl.classList.add('valid-capture');
            } else {
              cellEl.classList.add('valid-move');
            }
          }

          // Piece rendering
          const piece = this.engine.board[r][c];
          if (piece) {
            const pieceEl = document.createElement('div');
            pieceEl.className = `piece ${piece.player.toLowerCase()}`;
            pieceEl.innerHTML = `
              <span class="piece-icon">${this.getPieceEmoji(piece.type)}</span>
              <span class="piece-tag">${piece.type === 'ROCK' ? 'ĐẤM' : piece.type === 'PAPER' ? 'LÁ' : 'KÉO'}</span>
            `;
            cellEl.appendChild(pieceEl);
          }

          this.boardEl.appendChild(cellEl);
        }
      }

      // Update Player Turn Card Active States
      if (this.engine.turn === 'P1') {
        this.p1Card.classList.add('active-turn');
        this.p2Card.classList.remove('active-turn');
        this.turnDotEl.style.background = 'var(--p1-color)';
        this.turnDotEl.style.boxShadow = '0 0 10px var(--p1-color)';
        this.turnTextEl.innerText = 'Lượt đi: Người chơi 1 (Đỏ)';
      } else {
        this.p2Card.classList.add('active-turn');
        this.p1Card.classList.remove('active-turn');
        this.turnDotEl.style.background = 'var(--p2-color)';
        this.turnDotEl.style.boxShadow = '0 0 10px var(--p2-color)';
        this.turnTextEl.innerText = `Lượt đi: ${this.gameMode === 'AI' ? 'Máy tính (AI Bot)' : 'Người chơi 2 (Xanh)'}`;
      }

      // Update Piece Counts Dashboard
      const p1Counts = this.engine.getRemainingPieces('P1');
      const p2Counts = this.engine.getRemainingPieces('P2');

      this.p1Rock.innerText = p1Counts.ROCK;
      this.p1Paper.innerText = p1Counts.PAPER;
      this.p1Scissors.innerText = p1Counts.SCISSORS;

      this.p2Rock.innerText = p2Counts.ROCK;
      this.p2Paper.innerText = p2Counts.PAPER;
      this.p2Scissors.innerText = p2Counts.SCISSORS;

      // Highlight critical danger (only 1 piece left of a type)
      [this.p1Rock, this.p1Paper, this.p1Scissors].forEach((el, idx) => {
        const val = [p1Counts.ROCK, p1Counts.PAPER, p1Counts.SCISSORS][idx];
        if (val === 1) el.classList.add('critical');
        else el.classList.remove('critical');
      });

      [this.p2Rock, this.p2Paper, this.p2Scissors].forEach((el, idx) => {
        const val = [p2Counts.ROCK, p2Counts.PAPER, p2Counts.SCISSORS][idx];
        if (val === 1) el.classList.add('critical');
        else el.classList.remove('critical');
      });
    }
  }

  // Auto-initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.localGameController = new LocalController();
  });
})();
