/**
 * OTTv2 (Oẳn Tù Tì v2) - Online Multiplayer Controller
 * Manages WebSocket / Socket.IO real-time multiplayer rooms
 */

(function () {
  'use strict';

  class OnlineController {
    constructor() {
      this.socket = null;
      this.currentRoom = null;
      this.myRole = null; // 'P1', 'P2', 'SPECTATOR'
      this.selectedCell = null;
      this.validMoves = [];
      this.engine = new OTTv2Engine();

      // DOM Elements
      this.lobbyView = document.getElementById('online-lobby-view');
      this.gameView = document.getElementById('online-game-view');
      this.boardEl = document.getElementById('online-board-grid');
      this.roomsListEl = document.getElementById('online-rooms-list');
      this.roomInfoEl = document.getElementById('online-room-badge');
      this.myRoleEl = document.getElementById('online-my-role');
      this.turnBannerEl = document.getElementById('online-turn-banner');
      this.turnDotEl = document.getElementById('online-turn-dot');
      this.turnTextEl = document.getElementById('online-turn-text');
      this.chatMessagesEl = document.getElementById('online-chat-messages');

      // Stats
      this.p1Card = document.getElementById('online-p1-card');
      this.p1Rock = document.getElementById('online-p1-rock');
      this.p1Paper = document.getElementById('online-p1-paper');
      this.p1Scissors = document.getElementById('online-p1-scissors');

      this.p2Card = document.getElementById('online-p2-card');
      this.p2Rock = document.getElementById('online-p2-rock');
      this.p2Paper = document.getElementById('online-p2-paper');
      this.p2Scissors = document.getElementById('online-p2-scissors');

      this.initSocket();
      this.initEvents();
    }

    initSocket() {
      // Connect to Socket.IO server on current host or port 3000
      const serverUrl = window.location.origin.includes('http') ? window.location.origin : 'http://localhost:3000';
      if (typeof io !== 'undefined') {
        this.socket = io(serverUrl);

        this.socket.on('connect', () => {
          console.log('[Online] Đã kết nối Socket server:', this.socket.id);
          this.socket.emit('get_rooms');
        });

        this.socket.on('rooms_list', (rooms) => {
          this.renderRoomsList(rooms);
        });

        this.socket.on('room_created', (data) => {
          this.enterRoom(data.roomId, data.role, data.roomInfo, data.gameState);
        });

        this.socket.on('room_joined', (data) => {
          this.enterRoom(data.roomId, data.role, data.roomInfo, data.gameState, data.chatHistory);
        });

        this.socket.on('room_updated', (data) => {
          if (data.roomInfo) this.updateRoomInfo(data.roomInfo);
          if (data.gameState) {
            this.engine.loadState(data.gameState);
            this.render();
          }
        });

        this.socket.on('game_state_update', (data) => {
          this.engine.loadState(data.gameState);
          this.render();

          if (data.gameOver) {
            alert(`🎉 TRÒ CHƠI KẾT THÚC!\n${data.winReason}`);
          }
        });

        this.socket.on('game_restarted', (data) => {
          this.engine.loadState(data.gameState);
          this.render();
          alert('🔄 ' + data.message);
        });

        this.socket.on('new_chat', (chatItem) => {
          this.appendChatMessage(chatItem);
        });

        this.socket.on('error_message', (msg) => {
          alert('⚠️ Thông báo: ' + msg);
        });
      }
    }

    initEvents() {
      // Create room button
      const createBtn = document.getElementById('btn-create-room');
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          const nameInput = document.getElementById('online-player-name');
          const roomInput = document.getElementById('online-new-room-name');
          const playerName = (nameInput && nameInput.value.trim()) || 'Người chơi Đỏ';
          const roomName = (roomInput && roomInput.value.trim()) || 'Phòng Chiến Thuật';

          if (this.socket) {
            this.socket.emit('create_room', { roomName, playerName });
          }
        });
      }

      // Refresh rooms list
      const refreshBtn = document.getElementById('btn-refresh-rooms');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          if (this.socket) this.socket.emit('get_rooms');
        });
      }

      // Leave room button
      const leaveBtn = document.getElementById('btn-leave-room');
      if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
          window.location.reload();
        });
      }

      // Restart room game button
      const restartBtn = document.getElementById('btn-online-restart');
      if (restartBtn) {
        restartBtn.addEventListener('click', () => {
          if (this.socket && this.currentRoom) {
            this.socket.emit('restart_game', { roomId: this.currentRoom });
          }
        });
      }

      // Chat send
      const chatInput = document.getElementById('online-chat-input');
      const chatSendBtn = document.getElementById('btn-send-chat');
      const sendChat = () => {
        if (!chatInput || !chatInput.value.trim() || !this.socket || !this.currentRoom) return;
        const nameInput = document.getElementById('online-player-name');
        const senderName = (nameInput && nameInput.value.trim()) || this.myRole;
        this.socket.emit('send_chat', {
          roomId: this.currentRoom,
          message: chatInput.value.trim(),
          senderName
        });
        chatInput.value = '';
      };

      if (chatSendBtn) chatSendBtn.addEventListener('click', sendChat);
      if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') sendChat();
        });
      }

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
    }

    renderRoomsList(rooms) {
      if (!this.roomsListEl) return;
      this.roomsListEl.innerHTML = '';

      if (!rooms || rooms.length === 0) {
        this.roomsListEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:12px;">Chưa có phòng nào. Hãy tạo phòng mới ngay!</div>';
        return;
      }

      rooms.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'room-card';
        const statusText = !r.hasP2 ? '🟢 Còn 1 chỗ (Đang chờ đối thủ)' : '⚔️ Đang thi đấu';
        item.innerHTML = `
          <div>
            <div style="font-weight:700; font-size:0.95rem;">${r.name} (#${r.id})</div>
            <div style="font-size:0.78rem; color:var(--text-muted);">${statusText} | Khán giả: ${r.spectatorCount}</div>
          </div>
          <button class="btn btn-primary" style="padding:6px 12px; font-size:0.8rem;" data-id="${r.id}">
            ${!r.hasP2 ? 'Vào Chơi' : 'Xem Trận'}
          </button>
        `;

        item.querySelector('button').addEventListener('click', () => {
          const nameInput = document.getElementById('online-player-name');
          const playerName = (nameInput && nameInput.value.trim()) || 'Người chơi';
          if (this.socket) {
            this.socket.emit('join_room', { roomId: r.id, playerName });
          }
        });

        this.roomsListEl.appendChild(item);
      });
    }

    enterRoom(roomId, role, roomInfo, gameState, chatHistory = []) {
      this.currentRoom = roomId;
      this.myRole = role;

      if (this.lobbyView) this.lobbyView.style.display = 'none';
      if (this.gameView) this.gameView.style.display = 'grid';

      if (this.roomInfoEl) this.roomInfoEl.innerText = `${roomInfo.name} (#${roomId})`;
      if (this.myRoleEl) {
        const roleLabel = role === 'P1' ? '🔴 Bạn là: Người chơi 1 (Đỏ)' : role === 'P2' ? '🔵 Bạn là: Người chơi 2 (Xanh)' : '👁️ Bạn là: Khán giả (Spectator)';
        this.myRoleEl.innerText = roleLabel;
      }

      if (chatHistory && this.chatMessagesEl) {
        this.chatMessagesEl.innerHTML = '';
        chatHistory.forEach(item => this.appendChatMessage(item));
      }

      if (gameState) this.engine.loadState(gameState);
      this.render();
    }

    updateRoomInfo(roomInfo) {
      const p1Label = document.getElementById('online-p1-name');
      const p2Label = document.getElementById('online-p2-name');
      if (p1Label) p1Label.innerText = roomInfo.p1Name || 'Đang chờ...';
      if (p2Label) p2Label.innerText = roomInfo.p2Name || 'Đang chờ đối thủ...';
    }

    appendChatMessage(item) {
      if (!this.chatMessagesEl) return;
      const el = document.createElement('div');
      el.style.padding = '3px 0';
      el.innerHTML = `<span style="color:var(--accent-gold); font-weight:700;">[${item.timestamp}] ${item.sender}:</span> <span>${item.text}</span>`;
      this.chatMessagesEl.appendChild(el);
      this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
    }

    handleCellClick(r, c) {
      if (this.engine.isGameOver) return;
      if (this.myRole !== 'P1' && this.myRole !== 'P2') {
        alert('Bạn đang ở chế độ khán giả (chỉ theo dõi)!');
        return;
      }

      if (this.myRole !== this.engine.turn) {
        return; // Not your turn
      }

      const piece = this.engine.board[r][c];

      // If a cell is already selected, check if user clicked a valid move destination
      if (this.selectedCell) {
        const move = this.validMoves.find(m => m.toR === r && m.toC === c);
        if (move) {
          // Send move to server
          if (this.socket && this.currentRoom) {
            this.socket.emit('make_move', {
              roomId: this.currentRoom,
              fromR: this.selectedCell.r,
              fromC: this.selectedCell.c,
              toR: r,
              toC: c
            });
          }
          this.selectedCell = null;
          this.validMoves = [];
          this.render();
          return;
        }
      }

      // If clicked on own piece: select it
      if (piece && piece.player === this.myRole) {
        this.selectedCell = { r, c };
        this.validMoves = this.engine.getValidMoves(r, c);
      } else {
        this.selectedCell = null;
        this.validMoves = [];
      }

      this.render();
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

      for (let r = 8; r >= 0; r--) {
        for (let c = 0; c < 9; c++) {
          const cellEl = document.createElement('div');
          cellEl.className = 'cell';
          cellEl.dataset.r = r;
          cellEl.dataset.c = c;

          if (r === 0 && c === 0) {
            cellEl.classList.add('base-a1');
            cellEl.innerHTML += '<span class="base-icon">🚩 a1 (P1)</span>';
          }
          if (r === 8 && c === 8) {
            cellEl.classList.add('base-i9');
            cellEl.innerHTML += '<span class="base-icon">🏰 i9 (P2)</span>';
          }

          if (lastMove) {
            if (lastMove.from.r === r && lastMove.from.c === c) cellEl.classList.add('last-move-source');
            if (lastMove.to.r === r && lastMove.to.c === c) cellEl.classList.add('last-move-target');
          }

          if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
            cellEl.classList.add('selected');
          }

          const validMove = this.validMoves.find(m => m.toR === r && m.toC === c);
          if (validMove) {
            if (validMove.action === 'CAPTURE') cellEl.classList.add('valid-capture');
            else cellEl.classList.add('valid-move');
          }

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

      // Update Turn Banner
      if (this.engine.turn === 'P1') {
        this.p1Card.classList.add('active-turn');
        this.p2Card.classList.remove('active-turn');
        this.turnDotEl.style.background = 'var(--p1-color)';
        this.turnTextEl.innerText = 'Lượt đi: Người chơi 1 (Đỏ)';
      } else {
        this.p2Card.classList.add('active-turn');
        this.p1Card.classList.remove('active-turn');
        this.turnDotEl.style.background = 'var(--p2-color)';
        this.turnTextEl.innerText = 'Lượt đi: Người chơi 2 (Xanh)';
      }

      // Piece counts
      const p1Counts = this.engine.getRemainingPieces('P1');
      const p2Counts = this.engine.getRemainingPieces('P2');
      this.p1Rock.innerText = p1Counts.ROCK;
      this.p1Paper.innerText = p1Counts.PAPER;
      this.p1Scissors.innerText = p1Counts.SCISSORS;
      this.p2Rock.innerText = p2Counts.ROCK;
      this.p2Paper.innerText = p2Counts.PAPER;
      this.p2Scissors.innerText = p2Counts.SCISSORS;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.onlineGameController = new OnlineController();
  });
})();
