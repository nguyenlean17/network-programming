/**
 * Oẳn Tù Tì v2 (OTTv2) - Supabase Realtime Multiplayer Synchronization Engine
 * 100% Serverless: Connects directly to Supabase Realtime Channels (Broadcast & Presence).
 * Allows players to play over the internet without running any local Node.js server!
 */

const STORAGE_KEY_URL = 'ottv2_supabase_url';
const STORAGE_KEY_KEY = 'ottv2_supabase_key';
const STORAGE_KEY_NAME = 'ottv2_player_name';

// Default demo credentials (user can customize in settings modal)
const DEMO_SUPABASE_URL = 'https://tnqovsryqnhwomqomwcb.supabase.co';
const DEMO_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM0NTYwMDB9.sample';

export class SupabaseSyncEngine {
  constructor(options = {}) {
    this.roomId = null;
    this.client = null;
    this.channel = null;
    this.isOnline = false;
    this.myRole = 'P1'; // 'P1', 'P2', 'SPECTATOR'
    this.myId = 'player_' + Math.random().toString(36).substring(2, 9);
    this.playerName = localStorage.getItem(STORAGE_KEY_NAME) || `Player_${Math.floor(100 + Math.random() * 900)}`;

    this.onRemoteUpdate = options.onRemoteUpdate || null;
    this.onConnectionChange = options.onConnectionChange || null;
    this.onRoomJoined = options.onRoomJoined || null;
    this.onPresenceUpdate = options.onPresenceUpdate || null;

    // Load credentials from localStorage or defaults
    this.supabaseUrl = localStorage.getItem(STORAGE_KEY_URL) || '';
    this.supabaseKey = localStorage.getItem(STORAGE_KEY_KEY) || '';
  }

  /**
   * Returns current Supabase config
   */
  getConfig() {
    return {
      url: this.supabaseUrl,
      key: this.supabaseKey,
      isConfigured: Boolean(this.supabaseUrl && this.supabaseKey),
      playerName: this.playerName
    };
  }

  /**
   * Saves Supabase configuration to localStorage
   */
  setConfig(url, key, playerName) {
    this.supabaseUrl = (url || '').trim();
    this.supabaseKey = (key || '').trim();
    if (playerName) {
      this.playerName = playerName.trim();
      localStorage.setItem(STORAGE_KEY_NAME, this.playerName);
    }

    if (this.supabaseUrl) localStorage.setItem(STORAGE_KEY_URL, this.supabaseUrl);
    else localStorage.removeItem(STORAGE_KEY_URL);

    if (this.supabaseKey) localStorage.setItem(STORAGE_KEY_KEY, this.supabaseKey);
    else localStorage.removeItem(STORAGE_KEY_KEY);

    // Reset client to reinitialize on next connection
    this.client = null;
  }

  /**
   * Dynamically loads Supabase JS Client
   */
  async loadSupabaseClient() {
    if (this.client) return this.client;

    const url = this.supabaseUrl || DEMO_SUPABASE_URL;
    const key = this.supabaseKey || DEMO_SUPABASE_KEY;

    if (!url || !key) {
      return null;
    }

    try {
      // 1. Check window.supabase if loaded via <script> tag
      let createClientFn = window.supabase?.createClient;

      // 2. Otherwise dynamically import from CDN
      if (!createClientFn) {
        const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        createClientFn = mod.createClient;
      }

      if (!createClientFn) {
        throw new Error('Supabase client library not found');
      }

      this.client = createClientFn(url, key, {
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      return this.client;
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  /**
   * Generates a 5-character friendly Room ID (e.g., OTT-7821)
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
   * Gets room ID from URL parameters (?room=XYZ or ?sb_room=XYZ)
   */
  getRoomFromUrl() {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('sb_room') || params.get('room') || null;
  }

  /**
   * Updates browser URL without page reload
   */
  updateUrl(roomId) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (roomId) {
      url.searchParams.set('room', roomId);
      url.searchParams.set('backend', 'supabase');
    } else {
      url.searchParams.delete('room');
      url.searchParams.delete('sb_room');
      url.searchParams.delete('backend');
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
    url.searchParams.set('backend', 'supabase');
    return url.toString();
  }

  /**
   * Joins or creates a multiplayer room using Supabase Realtime Channel
   */
  async joinRoom(roomId, role = null, initialGameState = null) {
    this.roomId = roomId || this.generateRoomId();
    this.updateUrl(this.roomId);

    // Determine initial role
    if (role) {
      this.myRole = role;
    } else {
      const urlRoom = this.getRoomFromUrl();
      this.myRole = (urlRoom && urlRoom.toLowerCase() === this.roomId.toLowerCase()) ? 'P2' : 'P1';
    }

    // Leave any existing channel
    if (this.channel) {
      try {
        await this.channel.unsubscribe();
      } catch (e) {
        // ignore
      }
      this.channel = null;
    }

    const client = await this.loadSupabaseClient();
    if (!client) {
      this.isOnline = false;
      const msg = 'Chưa cấu hình Supabase URL hoặc Key. Vui lòng bấm "Cấu hình Supabase" để thiết lập.';
      if (this.onConnectionChange) this.onConnectionChange(false, msg);
      return { success: false, error: 'NO_CONFIG', message: msg };
    }

    const cleanRoomCode = this.roomId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const channelName = `ottv2_${cleanRoomCode}`;

    try {
      this.channel = client.channel(channelName, {
        config: {
          broadcast: { ack: true, self: false },
          presence: { key: this.myId }
        }
      });

      // 1. Listen for Broadcast Game State
      this.channel.on('broadcast', { event: 'game_update' }, ({ payload }) => {
        if (!payload || payload.senderId === this.myId) return;
        if (this.onRemoteUpdate) {
          this.onRemoteUpdate(payload);
        }
      });

      // 2. Listen for Broadcast Reactions (Emoji)
      this.channel.on('broadcast', { event: 'game_reaction' }, ({ payload }) => {
        if (!payload || payload.senderId === this.myId) return;
        if (this.onRemoteUpdate) {
          this.onRemoteUpdate({ reaction: payload.emoji, senderRole: payload.senderRole });
        }
      });

      // 3. Listen for Broadcast Game Reset
      this.channel.on('broadcast', { event: 'game_restart' }, ({ payload }) => {
        if (!payload || payload.senderId === this.myId) return;
        if (this.onRemoteUpdate) {
          this.onRemoteUpdate({ restart: true, state: payload.state });
        }
      });

      // 4. Presence State Synchronization
      this.channel.on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        this.processPresence(state);
      });

      this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const state = this.channel.presenceState();
        this.processPresence(state);
      });

      this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const state = this.channel.presenceState();
        this.processPresence(state);
      });

      // Subscribe to Realtime channel
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isOnline = true;

          // Track presence
          await this.channel.track({
            id: this.myId,
            role: this.myRole,
            name: this.playerName,
            onlineAt: Date.now()
          });

          if (this.onConnectionChange) {
            this.onConnectionChange(true, `Đã kết nối phòng ${this.roomId} qua Supabase Realtime!`);
          }

          if (this.onRoomJoined) {
            this.onRoomJoined(this.roomId, this.myRole);
          }

          // If creator with initial game state, broadcast
          if (initialGameState && this.myRole === 'P1') {
            this.broadcastGameState(initialGameState, null);
          }
        } else if (status === 'CHANNEL_ERROR') {
          this.isOnline = false;
          if (this.onConnectionChange) {
            this.onConnectionChange(false, 'Lỗi kết nối kênh Supabase Realtime');
          }
        } else if (status === 'TIMED_OUT') {
          this.isOnline = false;
          if (this.onConnectionChange) {
            this.onConnectionChange(false, 'Hết thời gian kết nối Supabase');
          }
        }
      });

      return { success: true, roomId: this.roomId, role: this.myRole };
    } catch (err) {
      console.error('Supabase joinRoom error:', err);
      this.isOnline = false;
      if (this.onConnectionChange) this.onConnectionChange(false, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Broadcasts game state to all players in the room
   */
  broadcastGameState(gameState, lastMove = null) {
    if (!this.channel || !this.isOnline) return;

    this.channel.send({
      type: 'broadcast',
      event: 'game_update',
      payload: {
        gameState,
        lastMove,
        senderRole: this.myRole,
        senderId: this.myId,
        syncTime: Date.now()
      }
    });
  }

  /**
   * Broadcasts an emoji reaction
   */
  broadcastReaction(emoji) {
    if (!this.channel || !this.isOnline) return;

    this.channel.send({
      type: 'broadcast',
      event: 'game_reaction',
      payload: {
        emoji,
        senderRole: this.myRole,
        senderId: this.myId,
        syncTime: Date.now()
      }
    });
  }

  /**
   * Updates player role (P1, P2, or SPECTATOR)
   */
  async setRole(role) {
    this.myRole = role;
    if (this.channel && this.isOnline) {
      await this.channel.track({
        id: this.myId,
        role: this.myRole,
        name: this.playerName,
        onlineAt: Date.now()
      });
    }
  }

  /**
   * Processes presence map to identify players and spectators
   */
  processPresence(presenceState) {
    const players = [];
    Object.values(presenceState).forEach(list => {
      if (Array.isArray(list)) {
        list.forEach(p => players.push(p));
      }
    });

    const p1 = players.find(p => p.role === 'P1') || null;
    const p2 = players.find(p => p.role === 'P2') || null;
    const spectators = players.filter(p => p.role === 'SPECTATOR');

    if (this.onPresenceUpdate) {
      this.onPresenceUpdate({
        p1,
        p2,
        spectators,
        total: players.length,
        all: players
      });
    }
  }

  /**
   * Leaves current room
   */
  async leaveRoom() {
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }
    this.isOnline = false;
    this.roomId = null;
    this.updateUrl(null);
    if (this.onConnectionChange) this.onConnectionChange(false, 'Đã rời phòng');
  }
}
