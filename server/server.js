/**
 * Oẳn Tù Tì v2 (OTTv2) - Standalone Node.js HTTP & WebSocket Server
 * Serves static web frontend and provides centralized authoritative game room synchronization.
 */

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { RoomManager } from './room.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static frontend files
app.use(express.static(rootDir));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'OTTv2',
    activeRooms: roomManager.rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Active rooms list endpoint (Lấy danh sách tất cả các phòng đang chơi)
app.get('/api/rooms', (req, res) => {
  res.json({
    status: 'ok',
    totalRooms: roomManager.rooms.size,
    rooms: roomManager.getAllRoomsSummary(),
    timestamp: new Date().toISOString()
  });
});

// Create new room endpoint
app.post('/api/rooms', (req, res) => {
  const { roomId, title, preset, goalMode } = req.body || {};
  const id = roomId || `ottv2-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const room = roomManager.getOrCreateRoom(id);
  if (title) room.title = title;
  if (preset) room.gameSession.preset = preset;
  if (goalMode) room.gameSession.goalMode = goalMode;
  broadcastRoomsList();
  res.json({
    status: 'ok',
    roomId: id,
    room: {
      id,
      title: room.title || `Phòng ${id}`,
      status: room.gameSession.status
    }
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

// WebSocket message dispatcher
wss.on('connection', (ws) => {
  // Send current rooms list on connect
  ws.send(JSON.stringify({
    type: 'ROOMS_LIST',
    rooms: roomManager.getAllRoomsSummary()
  }));

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString());
      const { type, roomId, from, to, role, preset, playerName } = payload;

      switch (type) {
        case 'GET_ROOMS': {
          ws.send(JSON.stringify({
            type: 'ROOMS_LIST',
            rooms: roomManager.getAllRoomsSummary()
          }));
          break;
        }

        case 'JOIN_ROOM': {
          const { room, role: assignedRole } = roomManager.joinRoom(roomId || 'default', ws, role, playerName);
          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            roomId: room.id,
            role: assignedRole,
            gameState: room.gameSession.getState()
          }));

          // Notify other clients in room
          roomManager.broadcast(room, {
            type: 'PLAYER_PRESENCE',
            roomId: room.id,
            role: assignedRole,
            totalConnected: room.clients.size
          });

          broadcastRoomsList();
          break;
        }

        case 'MAKE_MOVE': {
          if (!ws.roomId) return;
          const room = roomManager.rooms.get(ws.roomId);
          if (!room) return;

          // Validate sender's role
          if (ws.role !== room.gameSession.currentTurn) {
            ws.send(JSON.stringify({
              type: 'MOVE_ERROR',
              message: 'Chưa tới lượt của bạn hoặc bạn là khán giả!'
            }));
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

          // Broadcast authoritative state update to all clients
          roomManager.broadcast(room, {
            type: 'STATE_UPDATE',
            gameState: result.gameState,
            lastMove: result.lastMove,
            winnerInfo: result.winnerInfo
          });

          broadcastRoomsList();
          break;
        }

        case 'RESET_GAME': {
          if (!ws.roomId) return;
          const room = roomManager.rooms.get(ws.roomId);
          if (!room) return;

          const newState = room.gameSession.reset();
          roomManager.broadcast(room, {
            type: 'STATE_UPDATE',
            gameState: newState,
            lastMove: null,
            winnerInfo: null
          });

          broadcastRoomsList();
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
    roomManager.leaveRoom(ws);
    broadcastRoomsList();
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🎮 OTTv2 Server running on http://localhost:${PORT}`);
  console.log(`🌐 WebSockets listening for multiplayer rooms`);
  console.log(`===============================================`);
});
