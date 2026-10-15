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
    this.onTimerUpdate = options.onTimerUpdate || null;
    this.onRoomError = options.onRoomError || null;

    this.cachedRooms = [];
    this.pendingConnectCallbacks = [];
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
    const token = globalThis.crypto?.randomUUID?.().slice(0, 8)
      || Math.random().toString(36).slice(2, 10);
    return `OTT-${token.toUpperCase()}`;
  }

  getRoomFromUrl() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || null;
  }

  getRoleFromUrl() {
    if (typeof window === 'undefined') return null;
    const role = new URLSearchParams(window.location.search).get('role');
    return ['P1', 'P2', 'SPECTATOR'].includes(role) ? role : null;
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
    url.searchParams.delete('role');
    return url.toString();
  }

  /**
   * Connects to WebSocket server (for lobby monitoring or room participation)
   */
  connect(callback = null) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (callback) callback(true);
      return;
    }
    if (callback) this.pendingConnectCallbacks.push(callback);
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    const finishConnect = (connected) => {
      for (const pending of this.pendingConnectCallbacks.splice(0)) pending(connected);
    };

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
        finishConnect(true);
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
        finishConnect(false);
      };

      this.ws.onclose = () => {
        this.isOnline = false;
        finishConnect(false);
        if (this.onConnectionChange) {
          this.onConnectionChange(false, 'Mất kết nối máy chủ.');
        }
      };
    } catch (err) {
      this.isOnline = false;
      if (this.onConnectionChange) {
        this.onConnectionChange(false, err.message);
      }
      finishConnect(false);
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
      this.send({
        type: 'CREATE_ROOM',
        roomId: targetId,
        roomName: targetName,
        playerName: this.playerName
      });
    });
  }

  joinRoom(roomId, preferredRole = null) {
    if (!roomId) return;
    this.connect((connected) => {
      if (!connected) return;
      this.send({
        type: 'JOIN_ROOM',
        roomId,
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

  sendReady() {
    if (!this.roomId || !this.ws) return;
    this.send({ type: 'SET_READY', roomId: this.roomId });
  }

  sendReaction(emoji) {
    if (!this.roomId || !this.ws) return;
    this.send({
      type: 'REACTION',
      roomId: this.roomId,
      emoji
    });
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
        this.updateUrl(this.roomId);

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
            winnerInfo: data.winnerInfo,
            timedOutRole: data.timedOutRole
          });
        }
        break;
      }

      case 'TURN_TIMER': {
        if (this.onTimerUpdate) this.onTimerUpdate(data);
        break;
      }

      case 'ROOM_ERROR': {
        if (!this.roomId) this.updateUrl(null);
        if (this.onRoomError) this.onRoomError(data.message || 'Không thể vào phòng.');
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
