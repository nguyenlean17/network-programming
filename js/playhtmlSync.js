/**
 * PlayHTML mirrors server-approved game snapshots and room cursors.
 * The WebSocket server remains the authority for player roles and moves.
 */
export class PlayhtmlSyncEngine {
  constructor(options = {}) {
    this.roomId = null;
    this.playhtml = options.playhtml || null;
    this.syncHandle = null;
    this.isOnline = false;
    this.onRemoteUpdate = options.onRemoteUpdate || null;
    this.onConnectionChange = options.onConnectionChange || null;
  }

  async loadPlayhtml() {
    if (this.playhtml) return this.playhtml;
    const module = await import('https://unpkg.com/playhtml@latest');
    this.playhtml = module.playhtml;
    if (!this.playhtml) throw new Error('Không tìm thấy playhtml trong thư viện.');
    return this.playhtml;
  }

  async joinRoom(roomId) {
    if (!roomId) throw new Error('Thiếu mã phòng.');
    if (this.isOnline && this.roomId === roomId) return true;
    if (this.isOnline) throw new Error('Hãy tải lại trang để đổi phòng PlayHTML.');

    try {
      const play = await this.loadPlayhtml();
      this.roomId = roomId;
      const elementId = 'ottv2-live-sync';
      let element = document.getElementById(elementId);
      if (!element) {
        element = document.createElement('div');
        element.id = elementId;
        element.hidden = true;
        document.body.appendChild(element);
      }

      this.syncHandle = play.register(element, {
        defaultData: { gameState: null, lastMove: null, version: 0 },
        update: ({ data }) => {
          if (data?.gameState && this.onRemoteUpdate) this.onRemoteUpdate(data);
        }
      });

      await play.init({
        room: `ottv2-${roomId}`,
        cursors: { enabled: true },
        onError: () => {
          this.isOnline = false;
          if (this.onConnectionChange) this.onConnectionChange(false, 'Mất kết nối PlayHTML.');
        }
      });

      this.isOnline = true;
      if (this.onConnectionChange) this.onConnectionChange(true, 'PlayHTML đã kết nối.');
      return true;
    } catch (error) {
      this.isOnline = false;
      if (this.onConnectionChange) this.onConnectionChange(false, error.message);
      return false;
    }
  }

  broadcastGameState(gameState, lastMove = null) {
    if (!this.isOnline || !this.syncHandle || !gameState) return false;
    this.syncHandle.setData({ gameState, lastMove, version: Date.now() });
    return true;
  }

  getShareableLink() {
    if (!this.roomId) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    return url.toString();
  }
}
