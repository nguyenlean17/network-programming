import assert from 'node:assert/strict';
import { RenderSyncEngine } from '../js/renderSync.js';

let socket;
globalThis.WebSocket = class {
  static CONNECTING = 0;
  static OPEN = 1;

  constructor() {
    this.readyState = WebSocket.CONNECTING;
    this.sent = [];
    socket = this;
  }

  send(raw) { this.sent.push(JSON.parse(raw)); }
};
globalThis.localStorage = { getItem: () => null };
globalThis.window = {
  location: {
    href: 'http://localhost:3000/index.html?room=OTT-RACE&role=SPECTATOR',
    origin: 'http://localhost:3000',
    search: '?room=OTT-RACE&role=SPECTATOR'
  },
  history: { replaceState() {} }
};
globalThis.fetch = async () => ({ json: async () => ({ rooms: [] }) });

const sync = new RenderSyncEngine();
assert.equal(sync.getRoleFromUrl(), 'SPECTATOR');
sync.connect();
sync.joinRoom('OTT-RACE', 'SPECTATOR');
assert.equal(socket.sent.length, 0, 'join must wait for the WebSocket to open');
socket.readyState = WebSocket.OPEN;
socket.onopen();
assert.deepEqual(socket.sent.find((message) => message.type === 'JOIN_ROOM'), {
  type: 'JOIN_ROOM', roomId: 'OTT-RACE', role: 'SPECTATOR', playerName: sync.playerName
});
sync.handleServerMessage({ type: 'ROOM_JOINED', roomId: 'OTT-RACE', role: 'SPECTATOR' });
assert.equal(new URL(sync.getShareableLink()).searchParams.has('role'), false,
  'shared links should let the invitee take a free player seat');

console.log('✓ Joining from a link waits for connection and keeps spectator role');
