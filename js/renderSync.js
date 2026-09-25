/**
 * Oẳn Tù Tì v2 (OTTv2) - Server WebSocket & Realtime Room Synchronization Engine
 * Handles lobby room lists, creation, joining as P1/P2/Spectator, and authoritative move sync.
 */

const STORAGE_KEY_SERVER_URL = 'ottv2_server_url';
const STORAGE_KEY_NAME = 'ottv2_player_name';

export class RenderSyncEngine {
  constructor(options = {}) {
    this.roomId = null;
    this.roomName = null;
    this.ws = null;
    this.isOnline = false;
    this.myRole = 'P1'; // 'P1', 'P2', 'SPECTATOR'
    this.myId = 'player_' + Math.random().toString(36).substring(2, 9);
    this.playerName = localStorage.getItem(STORAGE_KEY_NAME) || `Kỳ thủ ${Math.floor(100 + Math.random() * 900)}`;

    this.onRemoteUpdate = options.onRemoteUpdate || null;
    this.onConnectionChange = options.onConnectionChange || null;
    this.onRoomJoined = options.onRoomJoined || null;
    this.onPresenceUpdate = options.onPresenceUpdate || null;
    this.onRoomsList = options.onRoomsList || null;

    this.cachedRooms = [];
  }

  resolveWsUrl(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) {
      if (typeof window !== 'undefined' && window.location.origin.includes('http')) {
        url = window.location.origin;
      } else {
        url = 'http://localhost:3000';
      }
    }

    if (url.startsWith('https://')) return url.replace('https://', 'wss://');
    if (url.startsWith('http://')) return url.replace('http://', 'ws://');
    if (url.startsWith('wss://') || url.startsWith('ws://')) return url;
    return `ws://${url}`;
  }

  getServerUrl() {
    const saved = localStorage.getItem(STORAGE_KEY_SERVER_URL);
    if (saved) return saved;
    if (typeof window !== 'undefined' && window.location.origin.includes('http')) {
      return window.location.origin;
    }
    return 'http://localhost:3000';
  }

  generateRoomId() {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `OTT-${num}`;
  }

  getRoomFromUrl() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || null;
  }

  updateUrl(roomId) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (roomId) {
      url.searchParams.set('room', roomId);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
  }

  getShareableLink() {
    if (typeof window === 'undefined' || !this.roomId) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }

  /**
   * Connects to WebSocket server (for lobby monitoring or room participation)
   */
  connect(callback = null) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (callback) callback(true);
      return;
    }

    const wsUrl = this.resolveWsUrl(this.getServerUrl());

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isOnline = true;
        if (this.onConnectionChange) {
          this.onConnectionChange(true, `Đã kết nối Server (${wsUrl})`);
        }
        // Request rooms list immediately
        this.fetchRooms();
        if (callback) callback(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (err) {
          console.error('[SyncEngine] Error parsing socket data:', err);
        }
      };

      this.ws.onerror = (err) => {
        this.isOnline = false;
        if (this.onConnectionChange) {
          this.onConnectionChange(false, 'Không thể kết nối máy chủ WebSocket.');
        }
        if (callback) callback(false);
      };

      this.ws.onclose = () => {
        this.isOnline = false;
        if (this.onConnectionChange) {
          this.onConnectionChange(false, 'Mất kết nối máy chủ.');
        }
      };
    } catch (err) {
      this.isOnline = false;
      if (this.onConnectionChange) {
        this.onConnectionChange(false, err.message);
      }
      if (callback) callback(false);
    }
  }

  fetchRooms() {
    this.send({ type: 'GET_ROOMS' });

    // Fallback HTTP fetch
    const httpUrl = this.getServerUrl() + '/api/rooms';
    fetch(httpUrl)
      .then(res => res.json())
      .then(data => {
        if (data && data.rooms) {
          this.cachedRooms = data.rooms;
          if (this.onRoomsList) this.onRoomsList(data.rooms);
        }
      })
      .catch(() => {});
  }

  createRoom(roomName = null, roomId = null) {
    const targetId = roomId || this.generateRoomId();
    const targetName = roomName || `Phòng ${targetId}`;

    this.connect((connected) => {
      if (!connected) return;
      this.roomId = targetId;
      this.roomName = targetName;
      this.myRole = 'P1';
      this.updateUrl(this.roomId);

      this.send({
        type: 'CREATE_ROOM',
        roomId: this.roomId,
        roomName: this.roomName,
        playerName: this.playerName
      });
    });
  }

  joinRoom(roomId, preferredRole = null) {
    if (!roomId) return;
    this.roomId = roomId;
    this.updateUrl(this.roomId);

    this.connect((connected) => {
      if (!connected) return;
      this.send({
        type: 'JOIN_ROOM',
        roomId: this.roomId,
        role: preferredRole,
        playerName: this.playerName
      });
    });
  }

  sendAuthoritativeMove(from, to) {
    if (!this.roomId || !this.ws) return;
    this.send({
      type: 'MAKE_MOVE',
      roomId: this.roomId,
      from,
      to
    });
  }

  sendResetGame() {
    if (!this.roomId || !this.ws) return;
    this.send({
      type: 'RESET_GAME',
      roomId: this.roomId
    });
  }

  sendReaction(emoji) {
    if (!this.roomId || !this.ws) return;
    this.send({
      type: 'REACTION',
      roomId: this.roomId,
      emoji
    });
  }

  broadcastGameState(state, lastMove = null) {
    if (lastMove && lastMove.from && lastMove.to) {
      this.sendAuthoritativeMove(lastMove.from, lastMove.to);
    } else if (!lastMove) {
      this.sendResetGame();
    }
  }

  broadcastReaction(emoji) {
    this.sendReaction(emoji);
  }

  setRole(role) {
    this.myRole = role;
  }

  leaveRoom() {
    if (this.ws && this.roomId) {
      this.send({ type: 'LEAVE_ROOM', roomId: this.roomId });
    }
    this.roomId = null;
    this.roomName = null;
    this.updateUrl(null);
    if (this.onRoomJoined) {
      this.onRoomJoined(null, null);
    }
    // Refresh rooms list
    this.fetchRooms();
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  handleServerMessage(data) {
    if (!data) return;

    switch (data.type) {
      case 'ROOMS_LIST': {
        this.cachedRooms = data.rooms || [];
        if (this.onRoomsList) {
          this.onRoomsList(this.cachedRooms);
        }
        break;
      }

      case 'ROOM_JOINED': {
        this.roomId = data.roomId;
        this.roomName = data.roomName || `Phòng ${data.roomId}`;
        if (data.role) this.myRole = data.role;

        if (this.onRoomJoined) {
          this.onRoomJoined(this.roomId, this.myRole, this.roomName);
        }
        if (data.gameState && this.onRemoteUpdate) {
          this.onRemoteUpdate({ gameState: data.gameState });
        }
        break;
      }

      case 'STATE_UPDATE': {
        if (this.onRemoteUpdate) {
          this.onRemoteUpdate({
            gameState: data.gameState,
            lastMove: data.lastMove,
            winnerInfo: data.winnerInfo
          });
        }
        break;
      }

      case 'PLAYER_PRESENCE': {
        if (this.onPresenceUpdate) {
          this.onPresenceUpdate(data);
        }
        break;
      }

      case 'REACTION': {
        if (this.onRemoteUpdate) {
          this.onRemoteUpdate({
            reaction: data.emoji,
            senderRole: data.senderRole
          });
        }
        break;
      }

      case 'MOVE_ERROR': {
        if (this.onConnectionChange) {
          this.onConnectionChange(true, `⚠️ ${data.message || 'Nước đi không hợp lệ'}`);
        }
        break;
      }

      default:
        break;
    }
  }
}
