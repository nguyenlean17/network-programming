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

// WebSocket message dispatcher
wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString());
      const { type, roomId, from, to, role, preset } = payload;

      switch (type) {
        case 'JOIN_ROOM': {
          const { room, role: assignedRole } = roomManager.joinRoom(roomId || 'default', ws, role);
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
  });
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🎮 OTTv2 Server running on http://localhost:${PORT}`);
  console.log(`🌐 WebSockets listening for multiplayer rooms`);
  console.log(`===============================================`);
});
