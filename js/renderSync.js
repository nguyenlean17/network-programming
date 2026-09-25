/**
 * Oẳn Tù Tì v2 (OTTv2) - Render.com WebSocket Multiplayer Synchronization Engine
 * Connects directly to the Node.js WebSocket Server deployed on Render.com (or localhost).
 * Uses native WebSockets (zero external dependencies).
 */

const STORAGE_KEY_RENDER_URL = 'ottv2_render_server_url';
const STORAGE_KEY_NAME = 'ottv2_player_name';

export class RenderSyncEngine {
  constructor(options = {}) {
    this.roomId = null;
    this.ws = null;
    this.isOnline = false;
    this.myRole = 'P1'; // 'P1', 'P2', 'SPECTATOR'
    this.myId = 'player_' + Math.random().toString(36).substring(2, 9);
    this.playerName = localStorage.getItem(STORAGE_KEY_NAME) || `Kỳ thủ ${Math.floor(100 + Math.random() * 900)}`;

    this.onRemoteUpdate = options.onRemoteUpdate || null;
    this.onConnectionChange = options.onConnectionChange || null;
    this.onRoomJoined = options.onRoomJoined || null;
    this.onPresenceUpdate = options.onPresenceUpdate || null;

    this.reconnectTimer = null;
    this.pendingInitialState = null;
  }

  /**
   * Resolves the WebSocket URL (ws:// or wss://) from HTTP(S) URL
   */
  resolveWsUrl(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) {
      if (typeof window !== 'undefined' && window.location.origin.includes('http')) {
        url = window.location.origin;
      } else {
        url = 'http://localhost:3000';
      }
    }

    // Convert http(s) to ws(s)
    if (url.startsWith('https://')) {
      return url.replace('https://', 'wss://');
    }
    if (url.startsWith('http://')) {
      return url.replace('http://', 'ws://');
    }
    if (url.startsWith('wss://') || url.startsWith('ws://')) {
      return url;
    }
    // Default to wss if host given without scheme
    return `wss://${url}`;
  }

  /**
   * Gets current Render Server URL
   */
  getServerUrl() {
    const saved = localStorage.getItem(STORAGE_KEY_RENDER_URL);
    if (saved) return saved;
    if (typeof window !== 'undefined' && window.location.origin.includes('http')) {
      return window.location.origin;
    }
    return 'http://localhost:3000';
  }

  /**
   * Sets and saves custom Render Server URL (e.g., https://ottv2-game.onrender.com)
   */
  setServerUrl(url, playerName) {
    if (url) {
      localStorage.setItem(STORAGE_KEY_RENDER_URL, url.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_RENDER_URL);
    }
    if (playerName) {
      this.playerName = playerName.trim();
      localStorage.setItem(STORAGE_KEY_NAME, this.playerName);
    }
    // Reconnect if currently connected
    if (this.roomId) {
      this.joinRoom(this.roomId, this.myRole);
    }
  }

  /**
   * Generates a 5-character friendly Room ID (e.g. OTT-8A2F)
   */
  generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `OTT-${code}`;
  }

  /**
   * Gets room ID from URL parameters (?room=XYZ)
   */
  getRoomFromUrl() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || null;
  }

  /**
   * Updates browser URL without full page reload
   */
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

  /**
   * Returns shareable room URL
   */
  getShareableLink() {
    if (typeof window === 'undefined' || !this.roomId) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }

  /**
   * Connects to WebSocket server and joins or creates room
   */
  async joinRoom(roomId, role = null, initialGameState = null) {
    this.roomId = roomId || this.generateRoomId();
    this.updateUrl(this.roomId);

    if (role) {
      this.myRole = role;
    } else {
      const urlRoom = this.getRoomFromUrl();
      this.myRole = (urlRoom && urlRoom.toLowerCase() === this.roomId.toLowerCase()) ? 'P2' : 'P1';
    }

    this.pendingInitialState = initialGameState;

    // Close any previous socket
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }

    const wsUrl = this.resolveWsUrl(this.getServerUrl());

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isOnline = true;
        if (this.onConnectionChange) {
          this.onConnectionChange(true, `Đã kết nối máy chủ Render (${wsUrl})`);
        }

        // Send JOIN_ROOM command to server
        this.send({
          type: 'JOIN_ROOM',
          roomId: this.roomId,
          role: this.myRole,
          playerName: this.playerName,
          initialGameState: this.pendingInitialState
        });

        if (this.onRoomJoined) {
          this.onRoomJoined(this.roomId, this.myRole);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch (err) {
          console.error('[RenderSync] Lỗi phân tích thông điệp:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[RenderSync] Lỗi WebSocket:', err);
        this.isOnline = false;
        if (this.onConnectionChange) {
          this.onConnectionChange(false, 'Không thể kết nối máy chủ Render. Đang thử lại...');
        }
      };

      this.ws.onclose = () => {
        this.isOnline = false;
        if (this.onConnectionChange) {
          this.onConnectionChange(false, 'Mất kết nối máy chủ Render.');
        }
      };

      return { success: true, roomId: this.roomId, role: this.myRole };
    } catch (err) {
      console.error('[RenderSync] Lỗi khởi tạo WebSocket:', err);
      this.isOnline = false;
      if (this.onConnectionChange) {
        this.onConnectionChange(false, err.message);
      }
      return { success: false, error: err.message };
    }
  }

  /**
   * Internal message sender
   */
  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /**
   * Handles incoming WebSocket messages from Render server
   */
  handleServerMessage(data) {
    if (!data) return;

    switch (data.type) {
      case 'ROOM_JOINED': {
        this.roomId = data.roomId || this.roomId;
        if (data.role) this.myRole = data.role;
        if (this.onRoomJoined) {
          this.onRoomJoined(this.roomId, this.myRole);
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
          this.onPresenceUpdate({
            role: data.role,
            totalConnected: data.totalConnected,
            p1: data.hasP1 ? { name: 'Player 1' } : null,
            p2: data.hasP2 ? { name: 'Player 2' } : null,
            spectators: new Array(Math.max(0, (data.totalConnected || 1) - (data.hasP1 ? 1 : 0) - (data.hasP2 ? 1 : 0)))
          });
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

  /**
   * Broadcasts game state to server
   */
  broadcastGameState(gameState, lastMove = null) {
    if (!this.isOnline || !this.ws) return;

    this.send({
      type: 'MAKE_MOVE_BROADCAST',
      roomId: this.roomId,
      role: this.myRole,
      gameState,
      lastMove
    });
  }

  /**
   * Broadcasts an emoji reaction
   */
  broadcastReaction(emoji) {
    if (!this.isOnline || !this.ws) return;

    this.send({
      type: 'REACTION',
      roomId: this.roomId,
      emoji,
      senderRole: this.myRole
    });
  }

  /**
   * Updates player role (P1, P2, or SPECTATOR)
   */
  setRole(role) {
    this.myRole = role;
    this.send({
      type: 'JOIN_ROOM',
      roomId: this.roomId,
      role: this.myRole,
      playerName: this.playerName
    });
  }

  /**
   * Leaves current room
   */
  leaveRoom() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
    this.isOnline = false;
    this.roomId = null;
    this.updateUrl(null);
    if (this.onConnectionChange) {
      this.onConnectionChange(false, 'Đã rời phòng thi đấu');
    }
  }
}
