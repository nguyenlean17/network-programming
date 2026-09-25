/**
 * Oẳn Tù Tì v2 (OTTv2) - Server Room Manager
 */

import { ServerGameSession } from './game.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { id, gameSession, clients: Set, players: { P1: ws, P2: ws } }
  }

  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        gameSession: new ServerGameSession(roomId),
        clients: new Set(),
        players: { P1: null, P2: null }
      });
    }
    return this.rooms.get(roomId);
  }

  joinRoom(roomId, ws, preferredRole = null) {
    const room = this.getOrCreateRoom(roomId);
    room.clients.add(ws);

    let assignedRole = 'SPECTATOR';
    if (preferredRole === 'P1' && !room.players.P1) {
      room.players.P1 = ws;
      assignedRole = 'P1';
    } else if (preferredRole === 'P2' && !room.players.P2) {
      room.players.P2 = ws;
      assignedRole = 'P2';
    } else if (!room.players.P1) {
      room.players.P1 = ws;
      assignedRole = 'P1';
    } else if (!room.players.P2) {
      room.players.P2 = ws;
      assignedRole = 'P2';
    }

    ws.roomId = roomId;
    ws.role = assignedRole;

    return { room, role: assignedRole };
  }

  leaveRoom(ws) {
    if (!ws.roomId) return;
    const room = this.rooms.get(ws.roomId);
    if (!room) return;

    room.clients.delete(ws);
    if (room.players.P1 === ws) room.players.P1 = null;
    if (room.players.P2 === ws) room.players.P2 = null;

    if (room.clients.size === 0) {
      this.rooms.delete(ws.roomId);
    }
  }

  broadcast(room, messageObj) {
    const raw = JSON.stringify(messageObj);
    for (const client of room.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(raw);
      }
    }
  }

  /**
   * Lấy tổng hợp danh sách tất cả các phòng đang hoạt động
   */
  getAllRoomsSummary() {
    const list = [];
    for (const [id, room] of this.rooms.entries()) {
      const state = room.gameSession.getState();
      const hasP1 = !!room.players.P1;
      const hasP2 = !!room.players.P2;
      const totalConnected = room.clients.size;
      const spectators = Math.max(0, totalConnected - (hasP1 ? 1 : 0) - (hasP2 ? 1 : 0));

      list.push({
        id,
        status: room.gameSession.status || 'PLAYING',
        totalConnected,
        hasP1,
        hasP2,
        spectators,
        turn: room.gameSession.currentTurn,
        moveCount: room.gameSession.moveHistory ? room.gameSession.moveHistory.length : 0,
        lastMove: room.gameSession.lastMove,
        winner: room.gameSession.winnerInfo ? room.gameSession.winnerInfo.winner : null
      });
    }
    return list;
  }
}
