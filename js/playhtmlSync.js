/**
 * Oẳn Tù Tì v2 (OTTv2) - playhtml.fun Multiplayer Synchronization Engine
 * Handles real-time room syncing, remote state broadcasts, and presence cursors.
 */

export class PlayhtmlSyncEngine {
  constructor(options = {}) {
    this.roomId = null;
    this.playhtml = null;
    this.syncHandle = null;
    this.isOnline = false;
    this.myRole = 'P1'; // 'P1', 'P2', 'SPECTATOR'
    this.onRemoteUpdate = options.onRemoteUpdate || null;
    this.onConnectionChange = options.onConnectionChange || null;
    this.onRoomJoined = options.onRoomJoined || null;
  }

  /**
   * Initializes playhtml library from CDN
   */
  async loadPlayhtml() {
    if (this.playhtml) return this.playhtml;
    if (typeof window === 'undefined') return null;

    try {
      // Dynamic import of playhtml from unpkg CDN
      const module = await import('https://unpkg.com/playhtml@latest');
      this.playhtml = module.playhtml || module.default || window.playhtml;
      return this.playhtml;
    } catch (err) {
      console.warn('Cannot load playhtml library via CDN. Checking global window.playhtml...', err);
      if (window.playhtml) {
        this.playhtml = window.playhtml;
        return this.playhtml;
      }
      return null;
    }
  }

  /**
   * Generates a clean, friendly Room ID
   */
  generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ottv2-${code}`;
  }

  /**
   * Gets room ID from URL parameters if present (?room=XYZ)
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
   * Joins or creates a multiplayer room using playhtml
   */
  async joinRoom(roomId, role = null, initialGameState = null) {
    this.roomId = roomId || this.generateRoomId();
    this.updateUrl(this.roomId);

    // If role is not explicitly provided, choose based on URL
    if (role) {
      this.myRole = role;
    } else {
      // Default creator is P1, joiner from URL is P2
      const urlRoom = this.getRoomFromUrl();
      this.myRole = (urlRoom && urlRoom === roomId) ? 'P2' : 'P1';
    }

    const play = await this.loadPlayhtml();
    if (!play) {
      this.isOnline = false;
      if (this.onConnectionChange) this.onConnectionChange(false, 'Không thể tải thư viện playhtml.fun');
      return { success: false, error: 'Library load failed' };
    }

    try {
      const syncElementId = 'ottv2-live-sync';
      let syncEl = document.getElementById(syncElementId);
      if (!syncEl) {
        syncEl = document.createElement('div');
        syncEl.id = syncElementId;
        syncEl.style.display = 'none';
        syncEl.setAttribute('can-play', '');
        document.body.appendChild(syncEl);
      }

      // Register the game state element
      this.syncHandle = play.register(syncElementId, {
        defaultData: {
          gameState: initialGameState,
          lastMove: null,
          syncTime: Date.now(),
          version: 1
        },
        updateElement: ({ element, data }) => {
          if (!data || !data.gameState) return;
          if (this.onRemoteUpdate) {
            this.onRemoteUpdate(data);
          }
        }
      });

      // Initialize playhtml with custom room and presence cursors
      await play.init({
        room: `ottv2-${this.roomId}`,
        cursors: {
          enabled: true
        },
        onError: () => {
          this.isOnline = false;
          if (this.onConnectionChange) this.onConnectionChange(false, 'Mất kết nối tới server playhtml');
        }
      });

      this.isOnline = true;
      if (this.onConnectionChange) this.onConnectionChange(true, `Đã kết nối phòng ${this.roomId}`);
      if (this.onRoomJoined) this.onRoomJoined(this.roomId, this.myRole);

      return { success: true, roomId: this.roomId, role: this.myRole };
    } catch (e) {
      console.error('Lỗi khi khởi tạo playhtml room:', e);
      this.isOnline = false;
      if (this.onConnectionChange) this.onConnectionChange(false, e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Broadcasts a new game state to all players in the room
   */
  broadcastGameState(gameState, lastMove = null) {
    if (!this.isOnline) return;

    const payload = {
      gameState,
      lastMove,
      senderRole: this.myRole,
      syncTime: Date.now()
    };

    if (this.syncHandle && typeof this.syncHandle.setData === 'function') {
      this.syncHandle.setData(payload);
    } else if (this.playhtml && typeof this.playhtml.getHandle === 'function') {
      const handle = this.playhtml.getHandle('ottv2-live-sync');
      if (handle && handle.setData) {
        handle.setData(payload);
      }
    }
  }

  setRole(role) {
    this.myRole = role;
  }

  getShareableLink() {
    if (typeof window === 'undefined' || !this.roomId) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }
}
