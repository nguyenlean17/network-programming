import assert from 'node:assert/strict';
import { RoomManager } from '../server/room.js';
import { PlayhtmlSyncEngine } from '../js/playhtmlSync.js';

const manager = new RoomManager();
const client = () => ({ readyState: 1, send() {} });
const p1 = client();
const p2 = client();
const spectator = client();
const roomId = 'TEST-ROOM';

assert.equal(manager.joinRoom(roomId, p1, null, 'Red').role, 'P1');
assert.equal(manager.joinRoom(roomId, p2, null, 'Blue').role, 'P2');
assert.equal(manager.joinRoom(roomId, spectator, null, 'Viewer').role, 'SPECTATOR');
assert.equal(manager.joinRoom(roomId, p1, 'P2', 'Red').role, 'P1', 'P1 cannot claim P2');
assert.equal(manager.rooms.get(roomId).players.P2, p2);

manager.leaveRoom(p2);
assert.equal(manager.rooms.get(roomId).players.P2, null);
assert.equal(manager.joinRoom(roomId, spectator, 'SPECTATOR', 'Viewer').role, 'SPECTATOR');
const replacement = client();
assert.equal(manager.joinRoom(roomId, replacement, null, 'New Blue').role, 'P2');
manager.joinRoom('OTHER-ROOM', replacement, null, 'New Blue');
assert.equal(manager.rooms.get(roomId).players.P2, null, 'moving rooms releases the old seat');
manager.leaveRoom(p1);
assert.equal(manager.rooms.has(roomId), false, 'last player leaving removes the room even with spectators');
assert.equal(spectator.roomId, null, 'spectators are detached from deleted rooms');
manager.leaveRoom(spectator);
assert.equal(manager.rooms.has(roomId), false, 'empty custom rooms are removed');

const pending = manager.getOrCreateRoom('PENDING');
assert.equal(manager.pruneEmptyRooms(30000, pending.createdAt + 29999), 0);
assert.equal(manager.pruneEmptyRooms(30000, pending.createdAt + 30000), 1);
assert.equal(manager.rooms.has('PENDING'), false, 'rooms created without joining expire');
assert.equal(manager.rooms.has('OTHER-ROOM'), true, 'one active player keeps a waiting room alive');

let update;
let lastData;
const fakeElement = { id: '' };
globalThis.document = {
  getElementById: () => null,
  createElement: () => fakeElement,
  body: { appendChild() {} }
};
const playhtml = {
  register(_element, initializer) {
    update = initializer.update;
    return { setData(data) { lastData = data; update({ data }); } };
  },
  async init(options) { assert.equal(options.room, 'ottv2-TEST-ROOM'); },
};
const received = [];
const sync = new PlayhtmlSyncEngine({
  playhtml,
  onRemoteUpdate: (data) => received.push(data)
});
assert.equal(await sync.joinRoom(roomId), true);
const gameState = { board: [], currentTurn: 'P1', status: 'PLAYING' };
assert.equal(sync.broadcastGameState(gameState), true);
assert.equal(lastData.gameState, gameState);
assert.equal(received.at(-1).gameState, gameState);

console.log('✓ Multiplayer room roles and PlayHTML sync passed');
