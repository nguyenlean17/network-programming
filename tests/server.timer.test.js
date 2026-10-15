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

async function connect(url) {
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
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return {
    socket,
    send: (message) => socket.send(JSON.stringify(message)),
    take: (predicate) => {
      const index = messages.findIndex(predicate);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve };
        waiter.timer = setTimeout(() => reject(new Error('Timed out waiting for server message')), 4000);
        waiters.push(waiter);
      });
    }
  };
}

const port = await freePort();
const server = spawn(process.execPath, ['server/server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), TURN_DURATION_MS: '800' },
  stdio: 'ignore',
  windowsHide: true
});
const clients = [];

try {
  let started = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) { started = true; break; }
    } catch { /* starting */ }
    await delay(100);
  }
  assert.ok(started, 'server should start');
  const p1 = await connect(`ws://127.0.0.1:${port}`);
  const p2 = await connect(`ws://127.0.0.1:${port}`);
  clients.push(p1, p2);
  const roomId = `TIMER-${port}`;
  p1.send({ type: 'CREATE_ROOM', roomId });
  await p1.take((m) => m.type === 'ROOM_JOINED');
  p1.send({ type: 'SET_READY' });
  await delay(950);
  let room = (await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json()).rooms[0];
  assert.equal(room.turn, 'P1', 'turn must not expire while only one player is ready');
  assert.equal(room.turnDeadline, null, 'clock must wait for both players');

  p2.send({ type: 'JOIN_ROOM', roomId });
  await p2.take((m) => m.type === 'ROOM_JOINED');
  await p2.take((m) => m.type === 'TURN_TIMER' && !m.active);
  p2.send({ type: 'SET_READY' });
  const startedClock = await p1.take((m) => m.type === 'TURN_TIMER' && m.active);
  assert.ok(startedClock.remainingMs > 0 && startedClock.remainingMs <= 800);
  const timeout = await p1.take((m) => m.type === 'STATE_UPDATE' && m.timedOutRole === 'P1');
  assert.equal(timeout.gameState.currentTurn, 'P2', 'server must switch the turn on timeout');

  p2.socket.terminate();
  await p1.take((m) => m.type === 'PLAYER_PRESENCE' && !m.p2);
  await delay(950);
  room = (await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json()).rooms[0];
  assert.equal(room.turn, 'P2', 'turn must stay unchanged after a player leaves');
  assert.equal(room.turnDeadline, null, 'clock must pause after a player leaves');
  console.log('✓ Turn timer waits for both ready players, switches on timeout and pauses on disconnect');
} finally {
  for (const client of clients) client.socket.terminate();
  server.kill();
}
