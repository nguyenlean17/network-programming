import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages = [];
    const waiters = [];
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      messages.push(message);
      for (const waiter of [...waiters]) {
        const index = messages.findIndex(waiter.predicate);
        if (index < 0) continue;
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(messages.splice(index, 1)[0]);
      }
    });
    socket.once('error', reject);
    socket.once('open', () => resolve({
      socket,
      send: (message) => socket.send(JSON.stringify(message)),
      take: (predicate) => {
        const index = messages.findIndex(predicate);
        if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
        return new Promise((resolveMessage, rejectMessage) => {
          const waiter = { predicate, resolve: resolveMessage };
          waiter.timer = setTimeout(() => rejectMessage(new Error('Timed out waiting for server message')), 3000);
          waiters.push(waiter);
        });
      }
    }));
  });
}

const port = await freePort();
const server = spawn(process.execPath, ['server/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
  windowsHide: true
});
const clients = [];

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch { /* server is still starting */ }
    await delay(100);
  }
  assert.ok(ready, 'server should start');

  const url = `ws://127.0.0.1:${port}`;
  const [p1, p2, viewer] = await Promise.all([connect(url), connect(url), connect(url)]);
  clients.push(p1, p2, viewer);
  const roomId = `TEST-${port}`;
  p1.send({ type: 'CREATE_ROOM', roomId, roomName: 'Test room' });
  assert.equal((await p1.take((m) => m.type === 'ROOM_JOINED')).role, 'P1');

  p1.send({ type: 'MAKE_MOVE', from: 'B9', to: 'A9' });
  assert.match((await p1.take((m) => m.type === 'MOVE_ERROR')).message, /đủ 2 người/);

  p2.send({ type: 'JOIN_ROOM', roomId });
  assert.equal((await p2.take((m) => m.type === 'ROOM_JOINED')).role, 'P2');
  viewer.send({ type: 'JOIN_ROOM', roomId, role: 'SPECTATOR' });
  assert.equal((await viewer.take((m) => m.type === 'ROOM_JOINED')).role, 'SPECTATOR');

  viewer.send({ type: 'MAKE_MOVE', from: 'B9', to: 'A9' });
  assert.match((await viewer.take((m) => m.type === 'MOVE_ERROR')).message, /khán giả/);
  viewer.send({ type: 'RESET_GAME' });
  assert.match((await viewer.take((m) => m.type === 'MOVE_ERROR')).message, /Chỉ người chơi/);
  viewer.send({ type: 'REACTION', emoji: '👏' });
  assert.equal((await p2.take((m) => m.type === 'REACTION')).emoji, '👏');

  p1.send({ type: 'MAKE_MOVE', from: 'B9', to: 'A9' });
  const update = await p2.take((m) => m.type === 'STATE_UPDATE');
  assert.equal(update.gameState.board[8][0]?.player, 'P1');
  assert.equal(update.gameState.currentTurn, 'P2');
  assert.equal(update.gameState.status, 'PLAYING', 'P1 không thắng ở A9 của phe mình');

  p2.send({ type: 'MAKE_MOVE', from: 'H1', to: 'I1' });
  const secondUpdate = await p1.take((m) => m.type === 'STATE_UPDATE' && m.lastMove?.player === 'P2');
  assert.equal(secondUpdate.gameState.board[0][8]?.player, 'P2');
  assert.equal(secondUpdate.gameState.currentTurn, 'P1');
  assert.equal(secondUpdate.gameState.status, 'PLAYING', 'P2 không thắng ở I1 của phe mình');

  p1.send({ type: 'JOIN_ROOM', roomId, role: 'P2' });
  assert.equal((await p1.take((m) => m.type === 'ROOM_JOINED')).role, 'P1');

  const other = await connect(url);
  clients.push(other);
  other.send({ type: 'CREATE_ROOM', roomId: `${roomId}-OTHER` });
  assert.equal((await other.take((m) => m.type === 'ROOM_JOINED')).role, 'P1');
  const rooms = (await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json()).rooms;
  assert.equal(rooms.find((room) => room.id === roomId).moveCount, 2);
  assert.equal(rooms.find((room) => room.id === `${roomId}-OTHER`).moveCount, 0);

  const alias = await fetch(`http://127.0.0.1:${port}/playfull.html`, { redirect: 'manual' });
  assert.equal(alias.status, 302);
  assert.equal(alias.headers.get('location'), '/playfun.html');
  console.log('✓ Live server rooms, roles, moves, reset guard and alias passed');
} finally {
  for (const client of clients) client.socket.terminate();
  server.kill();
}
