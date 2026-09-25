/**
 * Oẳn Tù Tì v2 (OTTv2) - Server Room Manager
 * Manages active multiplayer rooms, client connections, player slot assignments,
 * and room list synchronization.
 */

import { ServerGameSession } from './game.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> room data
    this.initDefaultRooms();
  }

  initDefaultRooms() {
    // Optional starter room for instant testing
    const defaultRoomId = 'OTT-ROOM-1';
    this.rooms.set(defaultRoomId, {
      id: defaultRoomId,
      name: 'Phòng Tập Luyện #1',
      createdAt: Date.now(),
      gameSession: new ServerGameSession(defaultRoomId),
      clients: new Set(),
      players: { P1: null, P2: null },
      playerNames: { P1: 'Chờ P1...', P2: 'Chờ P2...' }
    });
  }

  getOrCreateRoom(roomId, roomName = null) {
    if (!this.rooms.has(roomId)) {
      const generatedName = roomName || `Phòng ${roomId}`;
      this.rooms.set(roomId, {
        id: roomId,
        name: generatedName,
        createdAt: Date.now(),
        gameSession: new ServerGameSession(roomId),
        clients: new Set(),
        players: { P1: null, P2: null },
        playerNames: { P1: 'Chờ P1...', P2: 'Chờ P2...' }
      });
    }
    return this.rooms.get(roomId);
  }

  createRoom(roomId, roomName, ws, playerName = 'Player 1') {
    const cleanId = roomId || `OTT-${Math.floor(1000 + Math.random() * 9000)}`;
    const cleanName = roomName || `Phòng ${cleanId}`;

    const room = this.getOrCreateRoom(cleanId, cleanName);
    return this.joinRoom(cleanId, ws, 'P1', playerName);
  }

  joinRoom(roomId, ws, preferredRole = null, playerName = 'Player') {
    const room = this.getOrCreateRoom(roomId);
    room.clients.add(ws);

    let assignedRole = 'SPECTATOR';

    if (preferredRole === 'P1' && (!room.players.P1 || room.players.P1 === ws)) {
      room.players.P1 = ws;
      room.playerNames.P1 = playerName || 'Player 1 (Đỏ)';
      assignedRole = 'P1';
    } else if (preferredRole === 'P2' && (!room.players.P2 || room.players.P2 === ws)) {
      room.players.P2 = ws;
      room.playerNames.P2 = playerName || 'Player 2 (Xanh)';
      assignedRole = 'P2';
    } else if (!room.players.P1) {
      room.players.P1 = ws;
      room.playerNames.P1 = playerName || 'Player 1 (Đỏ)';
      assignedRole = 'P1';
    } else if (!room.players.P2) {
      room.players.P2 = ws;
      room.playerNames.P2 = playerName || 'Player 2 (Xanh)';
      assignedRole = 'P2';
    } else {
      assignedRole = 'SPECTATOR';
    }

    ws.roomId = roomId;
    ws.role = assignedRole;
    ws.playerName = playerName;

    return { room, role: assignedRole };
  }

  leaveRoom(ws) {
    if (!ws.roomId) return;
    const room = this.rooms.get(ws.roomId);
    if (!room) return;

    room.clients.delete(ws);
    if (room.players.P1 === ws) {
      room.players.P1 = null;
      room.playerNames.P1 = 'Chờ P1...';
    }
    if (room.players.P2 === ws) {
      room.players.P2 = null;
      room.playerNames.P2 = 'Chờ P2...';
    }

    // Keep default room always, delete user-created rooms if totally empty
    if (room.clients.size === 0 && room.id !== 'OTT-ROOM-1') {
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

  getAllRoomsSummary() {
    const list = [];
    for (const [id, room] of this.rooms.entries()) {
      const hasP1 = !!room.players.P1;
      const hasP2 = !!room.players.P2;
      const totalConnected = room.clients.size;
      const spectators = Math.max(0, totalConnected - (hasP1 ? 1 : 0) - (hasP2 ? 1 : 0));

      let roomStatus = 'WAITING';
      if (room.gameSession.status === 'ENDED') {
        roomStatus = 'ENDED';
      } else if (hasP1 && hasP2) {
        roomStatus = 'PLAYING';
      } else if (hasP1 || hasP2) {
        roomStatus = 'WAITING';
      } else {
        roomStatus = 'EMPTY';
      }

      list.push({
        id,
        name: room.name || `Phòng ${id}`,
        createdAt: room.createdAt || Date.now(),
        status: roomStatus,
        totalConnected,
        hasP1,
        hasP2,
        p1Name: room.playerNames ? room.playerNames.P1 : 'Player 1',
        p2Name: room.playerNames ? room.playerNames.P2 : 'Player 2',
        spectators,
        turn: room.gameSession.currentTurn,
        moveCount: room.gameSession.moveHistory ? room.gameSession.moveHistory.length : 0,
        lastMove: room.gameSession.lastMove,
        winner: room.gameSession.winnerInfo ? room.gameSession.winnerInfo.winner : null
      });
    }

    // Sort: Waiting first, then Playing, then Ended
    const statusOrder = { WAITING: 1, PLAYING: 2, EMPTY: 3, ENDED: 4 };
    list.sort((a, b) => {
      const orderDiff = (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9);
      if (orderDiff !== 0) return orderDiff;
      return b.createdAt - a.createdAt;
    });

    return list;
  }
}
