/**
 * Oẳn Tù Tì v2 (OTTv2) - Standalone Node.js HTTP & WebSocket Server
 * Serves static web frontend and provides centralized authoritative game room synchronization.
 */

import http from 'http';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import pg from 'pg';
import { RoomManager } from './room.js';
import { migrateBotPlatform } from './bots/migrate.js';
import { createBotPlatformRouter } from './bots/platformRouter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();
const { Pool } = pg;

const PORT = process.env.PORT || 3000;
const TURN_DURATION_MS = Number(process.env.TURN_DURATION_MS) > 0
  ? Number(process.env.TURN_DURATION_MS) : 30000;
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS) > 0 ? Number(process.env.HEARTBEAT_MS) : 15000;
const EMPTY_ROOM_TTL_MS = Number(process.env.EMPTY_ROOM_TTL_MS) > 0 ? Number(process.env.EMPTY_ROOM_TTL_MS) : 30000;

// Detect silently lost connections (network loss or a suspended device).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    if (ws.readyState === 1) ws.ping();
  }
}, HEARTBEAT_MS);
const roomCleanup = setInterval(() => {
  if (roomManager.pruneEmptyRooms(EMPTY_ROOM_TTL_MS)) broadcastRoomsList();
}, Math.min(5000, EMPTY_ROOM_TTL_MS));
wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(roomCleanup);
});

const newRoomId = () => `OTT-${randomUUID().slice(0, 8).toUpperCase()}`;
const validRoomId = (value) => typeof value === 'string' && ROOM_ID_PATTERN.test(value);
const cleanLabel = (value, fallback) => typeof value === 'string'
  ? (value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 32) || fallback)
  : fallback;

// Body parser
app.use(express.json());

const authSecret = process.env.AUTH_SECRET || '';
const hasBotPlatformConfig = Boolean(process.env.DATABASE_URL) && Buffer.byteLength(authSecret) >= 32;
const platformPool = hasBotPlatformConfig
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 5000 })
  : null;
let botPlatformReady = false;
let migrationRetry = null;
if (platformPool) app.use('/api/platform', (req, res, next) => {
  if (!botPlatformReady) return res.status(503).json({ error: 'Bot platform storage is not ready' });
  next();
}, createBotPlatformRouter({ pool: platformPool, authSecret }));
else app.use('/api/platform', (_req, res) => res.status(503).json({
  error: 'Bot platform is not configured. Set DATABASE_URL and a 32-byte AUTH_SECRET.'
}));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Publish only browser assets. Server code, tests and deployment files stay private.
app.get('/', (_req, res) => res.sendFile(path.join(rootDir, 'index.html')));
for (const page of ['index.html', 'playfun.html', 'rooms.html', 'bots.html', 'match.html']) {
  app.get(`/${page}`, (_req, res) => res.sendFile(path.join(rootDir, page)));
}
for (const directory of ['css', 'js', 'shared']) {
  app.use(`/${directory}`, express.static(path.join(rootDir, directory), { index: false }));
}
app.get('/OTTv2/index.html', (_req, res) => res.redirect('/'));

// Keep the spelling used in some assignment handouts as a compatibility URL.
app.get('/playfull.html', (_req, res) => res.redirect('/playfun.html'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'OTTv2',
    activeRooms: roomManager.rooms.size,
    botPlatform: botPlatformReady ? 'ready' : 'unavailable',
    timestamp: new Date().toISOString()
  });
});

// Active rooms list endpoint
app.get('/api/rooms', (req, res) => {
  res.json({
    status: 'ok',
    totalRooms: roomManager.rooms.size,
    rooms: roomManager.getAllRoomsSummary(),
    timestamp: new Date().toISOString()
  });
});

// Create room endpoint
app.post('/api/rooms', (req, res) => {
  const { roomId, roomName } = req.body || {};
  const cleanId = roomId || newRoomId();
  if (!validRoomId(cleanId)) return res.status(400).json({ error: 'Mã phòng không hợp lệ.' });
  if (roomManager.rooms.has(cleanId)) return res.status(409).json({ error: 'Mã phòng đã tồn tại.' });
  const cleanName = cleanLabel(roomName, `Phòng ${cleanId}`);
  const room = roomManager.getOrCreateRoom(cleanId, cleanName);

  broadcastRoomsList();

  res.json({
    status: 'ok',
    roomId: room.id,
    name: room.name,
    createdAt: room.createdAt
  });
});

function broadcastRoomsList() {
  const summary = JSON.stringify({
    type: 'ROOMS_LIST',
    rooms: roomManager.getAllRoomsSummary()
  });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(summary);
    }
  }
}

function broadcastRoomPresence(room) {
  roomManager.broadcast(room, {
    type: 'PLAYER_PRESENCE',
    roomId: room.id,
    p1: !!room.players.P1,
    p2: !!room.players.P2,
    ready: { p1: room.ready.P1, p2: room.ready.P2 },
    players: { p1: room.playerNames.P1, p2: room.playerNames.P2 },
    totalConnected: room.clients.size
  });
}

function broadcastTurnClock(room) {
  roomManager.broadcast(room, {
    type: 'TURN_TIMER',
    active: room.turnDeadline !== null,
    remainingMs: room.turnDeadline === null ? null : Math.max(0, room.turnDeadline - Date.now()),
    durationMs: TURN_DURATION_MS,
    gameEnded: room.gameSession.status === 'ENDED'
  });
}

function expireTurn(room) {
  if (roomManager.rooms.get(room.id) !== room || room.turnDeadline === null) return;
  clearTimeout(room.turnTimer);
  room.turnTimer = null;
  room.turnDeadline = null;
  if (!room.players.P1 || !room.players.P2 || !room.ready.P1 || !room.ready.P2 || room.gameSession.status === 'ENDED') {
    broadcastTurnClock(room);
    return;
  }

  const timedOutRole = room.gameSession.currentTurn;
  room.gameSession.currentTurn = timedOutRole === 'P1' ? 'P2' : 'P1';
  roomManager.broadcast(room, {
    type: 'STATE_UPDATE',
    gameState: room.gameSession.getState(),
    lastMove: null,
    timedOutRole
  });
  syncTurnClock(room, true);
  broadcastRoomsList();
}

function syncTurnClock(room, restart = false) {
  const ready = room.players.P1 && room.players.P2 && room.ready.P1 && room.ready.P2 && room.gameSession.status !== 'ENDED';
  if (!ready || restart) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
    room.turnDeadline = null;
  }
  if (ready && room.turnDeadline === null) {
    room.turnDeadline = Date.now() + TURN_DURATION_MS;
    const deadline = room.turnDeadline;
    room.turnTimer = setTimeout(() => {
      if (room.turnDeadline === deadline) expireTurn(room);
    }, TURN_DURATION_MS);
  }
  broadcastTurnClock(room);
}

// WebSocket message dispatcher
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  // Send current rooms list immediately on connect
  ws.send(JSON.stringify({
    type: 'ROOMS_LIST',
    rooms: roomManager.getAllRoomsSummary()
  }));

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString());
      const { type, roomId, roomName, from, to, role, playerName } = payload;

      switch (type) {
        case 'GET_ROOMS': {
          ws.send(JSON.stringify({
            type: 'ROOMS_LIST',
            rooms: roomManager.getAllRoomsSummary()
          }));
          break;
        }

        case 'CREATE_ROOM': {
          const requestedId = roomId || newRoomId();
          if (!validRoomId(requestedId) || roomManager.rooms.has(requestedId)) {
            ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: 'Mã phòng không hợp lệ hoặc đã tồn tại.' }));
            break;
          }
          const cleanName = cleanLabel(roomName, `Phòng ${requestedId}`);
          const previousRoom = ws.roomId ? roomManager.rooms.get(ws.roomId) : null;
          const { room, role: assignedRole } = roomManager.createRoom(requestedId, cleanName, ws, cleanLabel(playerName, 'Player 1'));

          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            roomId: room.id,
            roomName: room.name,
            role: assignedRole,
            gameState: room.gameSession.getState(),
            players: {
              p1: room.playerNames.P1,
              p2: room.playerNames.P2
            }
          }));

          broadcastRoomPresence(room);
          syncTurnClock(room);
          if (previousRoom && roomManager.rooms.has(previousRoom.id)) {
            broadcastRoomPresence(previousRoom);
            syncTurnClock(previousRoom);
          }
          broadcastRoomsList();
          break;
        }

        case 'JOIN_ROOM': {
          if (!validRoomId(roomId)) {
            ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: 'Mã phòng không hợp lệ.' }));
            break;
          }
          const targetRoom = roomManager.rooms.get(roomId);
          if (role === 'SPECTATOR' && (!targetRoom || (!targetRoom.players.P1 && !targetRoom.players.P2))) {
            ws.send(JSON.stringify({ type: 'ROOM_ERROR', message: 'Phòng không còn người chơi để xem.' }));
            break;
          }
          const previousRoom = ws.roomId && ws.roomId !== roomId ? roomManager.rooms.get(ws.roomId) : null;
          const { room, role: assignedRole } = roomManager.joinRoom(roomId, ws, role, cleanLabel(playerName, 'Player'));
          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            roomId: room.id,
            roomName: room.name,
            role: assignedRole,
            gameState: room.gameSession.getState(),
            players: {
              p1: room.playerNames.P1,
              p2: room.playerNames.P2
            }
          }));

          broadcastRoomPresence(room);
          syncTurnClock(room);
          if (previousRoom && roomManager.rooms.has(previousRoom.id)) {
            broadcastRoomPresence(previousRoom);
            syncTurnClock(previousRoom);
          }
          broadcastRoomsList();
          break;
        }

        case 'LEAVE_ROOM': {
          const previousRoom = roomManager.rooms.get(ws.roomId);
          roomManager.leaveRoom(ws);
          ws.send(JSON.stringify({ type: 'ROOM_LEFT' }));
          if (previousRoom && roomManager.rooms.has(previousRoom.id)) {
            broadcastRoomPresence(previousRoom);
            syncTurnClock(previousRoom);
          }
          broadcastRoomsList();
          break;
        }

        case 'SET_READY': {
          if (!ws.roomId) return;
          const room = roomManager.rooms.get(ws.roomId);
          if (!room || !['P1', 'P2'].includes(ws.role) || room.players[ws.role] !== ws) return;
          if (room.gameSession.status === 'ENDED') return;
          room.ready[ws.role] = true;
          broadcastRoomPresence(room);
          syncTurnClock(room);
          broadcastRoomsList();
          break;
        }

        case 'MAKE_MOVE': {
          if (!ws.roomId) return;
          const room = roomManager.rooms.get(ws.roomId);
          if (!room) return;

          // Validate sender's role
          if (room.players[ws.role] !== ws || ws.role !== room.gameSession.currentTurn) {
            ws.send(JSON.stringify({
              type: 'MOVE_ERROR',
              message: 'Chưa tới lượt của bạn hoặc bạn là khán giả!'
            }));
            return;
          }

          if (!room.players.P1 || !room.players.P2 || !room.ready.P1 || !room.ready.P2) {
            ws.send(JSON.stringify({ type: 'MOVE_ERROR', message: 'Cần đủ 2 người chơi để bắt đầu.' }));
            return;
          }

          if (room.turnDeadline === null || Date.now() >= room.turnDeadline) {
            if (room.turnDeadline !== null) expireTurn(room);
            ws.send(JSON.stringify({ type: 'MOVE_ERROR', message: 'Đã hết thời gian lượt đi.' }));
            return;
          }

          const result = room.gameSession.processMove(ws.role, from, to);
          if (!result.success) {
            ws.send(JSON.stringify({
              type: 'MOVE_ERROR',
              message: result.error
            }));
            return;
          }

          // Broadcast authoritative state update to all clients in room
          roomManager.broadcast(room, {
            type: 'STATE_UPDATE',
            gameState: result.gameState,
            lastMove: result.lastMove,
            winnerInfo: result.winnerInfo
          });
          syncTurnClock(room, true);
          broadcastRoomsList();
          break;
        }

        case 'RESET_GAME': {
          if (!ws.roomId) return;
          const room = roomManager.rooms.get(ws.roomId);
          if (!room) return;
          if (room.players[ws.role] !== ws) {
            ws.send(JSON.stringify({ type: 'MOVE_ERROR', message: 'Chỉ người chơi trong phòng mới được tạo ván mới.' }));
            return;
          }

          const newState = room.gameSession.reset();
          room.ready.P1 = false;
          room.ready.P2 = false;
          roomManager.broadcast(room, {
            type: 'STATE_UPDATE',
            gameState: newState,
            lastMove: null,
            winnerInfo: null
          });
          broadcastRoomPresence(room);
          syncTurnClock(room, true);
          broadcastRoomsList();
          break;
        }

        case 'REACTION': {
          if (!ws.roomId) return;
          const room = roomManager.rooms.get(ws.roomId);
          if (!room) return;
          if (!['👏', '⚔️', '🔥', '😱', '🏆'].includes(payload.emoji)) return;

          roomManager.broadcast(room, {
            type: 'REACTION',
            emoji: payload.emoji,
            senderRole: ws.role
          });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    const previousRoom = roomManager.rooms.get(ws.roomId);
    roomManager.leaveRoom(ws);
    if (previousRoom && roomManager.rooms.has(previousRoom.id)) {
      broadcastRoomPresence(previousRoom);
      syncTurnClock(previousRoom);
    }
    broadcastRoomsList();
  });
});

async function startServer() {
  if (platformPool) {
    const preparePlatform = async () => {
      try {
        await migrateBotPlatform(platformPool);
        const bootstrapAdminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
        if (bootstrapAdminEmail) {
          await platformPool.query("UPDATE users SET role = 'ADMIN' WHERE lower(email) = $1", [bootstrapAdminEmail]);
        }
        botPlatformReady = true;
        console.log('Bot platform database is ready');
        if (migrationRetry) clearInterval(migrationRetry);
      } catch (error) {
        botPlatformReady = false;
        console.error('Bot platform database is unavailable:', error.message);
      }
    };
    await preparePlatform();
    if (!botPlatformReady) {
      migrationRetry = setInterval(preparePlatform, 30000);
    }
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(`🎮 OTTv2 Server running on http://0.0.0.0:${PORT} (Port: ${PORT})`);
    console.log(`🌐 WebSockets listening for multiplayer rooms`);
    console.log(`===============================================`);
  });
}

startServer();
