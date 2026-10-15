/**
 * Oẳn Tù Tì v2 (OTTv2) - Server Room Manager
 * Manages active multiplayer rooms, client connections, player slot assignments,
 * and comprehensive room state synchronization (including board & piece counts).
 */

import { ServerGameSession } from './game.js';
import { countPlayerPieces } from '../shared/gameRules.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> room data
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
        ready: { P1: false, P2: false },
        playerNames: { P1: 'Chờ P1...', P2: 'Chờ P2...' },
        turnDeadline: null,
        turnTimer: null
      });
    }
    return this.rooms.get(roomId);
  }

  createRoom(roomId, roomName, ws, playerName = 'Player 1') {
    const cleanId = roomId;
    const cleanName = roomName || `Phòng ${cleanId}`;

    const room = this.getOrCreateRoom(cleanId, cleanName);
    return this.joinRoom(cleanId, ws, 'P1', playerName);
  }

  joinRoom(roomId, ws, preferredRole = null, playerName = 'Player') {
    if (ws.roomId && ws.roomId !== roomId) {
      this.leaveRoom(ws);
    }
    const room = this.getOrCreateRoom(roomId);
    room.clients.add(ws);

    let assignedRole = 'SPECTATOR';

    if (room.players.P1 === ws) {
      assignedRole = 'P1';
    } else if (room.players.P2 === ws) {
      assignedRole = 'P2';
    } else if (preferredRole === 'SPECTATOR') {
      assignedRole = 'SPECTATOR';
    } else if (preferredRole === 'P1' && !room.players.P1) {
      room.players.P1 = ws;
      room.ready.P1 = false;
      room.playerNames.P1 = playerName || 'Player 1 (Đỏ)';
      assignedRole = 'P1';
    } else if (preferredRole === 'P2' && !room.players.P2) {
      room.players.P2 = ws;
      room.ready.P2 = false;
      room.playerNames.P2 = playerName || 'Player 2 (Xanh)';
      assignedRole = 'P2';
    } else if (!preferredRole && !room.players.P1) {
      room.players.P1 = ws;
      room.ready.P1 = false;
      room.playerNames.P1 = playerName || 'Player 1 (Đỏ)';
      assignedRole = 'P1';
    } else if (!preferredRole && !room.players.P2) {
      room.players.P2 = ws;
      room.ready.P2 = false;
      room.playerNames.P2 = playerName || 'Player 2 (Xanh)';
      assignedRole = 'P2';
    }

    ws.roomId = roomId;
    ws.role = assignedRole;
    ws.playerName = playerName;

    return { room, role: assignedRole };
  }

  leaveRoom(ws) {
    if (!ws.roomId) return;
    const roomId = ws.roomId;
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.clients.delete(ws);
    if (room.players.P1 === ws) {
      room.players.P1 = null;
      room.ready.P1 = false;
      room.playerNames.P1 = 'Chờ P1...';
    }
    if (room.players.P2 === ws) {
      room.players.P2 = null;
      room.ready.P2 = false;
      room.playerNames.P2 = 'Chờ P2...';
    }

    ws.roomId = null;
    ws.role = null;

    if (room.clients.size === 0) {
      clearTimeout(room.turnTimer);
      this.rooms.delete(roomId);
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
      } else if (hasP1 && hasP2 && room.ready.P1 && room.ready.P2) {
        roomStatus = 'PLAYING';
      } else if (hasP1 || hasP2) {
        roomStatus = 'WAITING';
      } else {
        roomStatus = 'EMPTY';
      }

      const pieceCounts = countPlayerPieces(room.gameSession.board);

      list.push({
        id,
        name: room.name || `Phòng ${id}`,
        createdAt: room.createdAt || Date.now(),
        status: roomStatus,
        totalConnected,
        hasP1,
        hasP2,
        ready: { p1: room.ready.P1, p2: room.ready.P2 },
        p1Name: room.playerNames ? room.playerNames.P1 : 'Player 1',
        p2Name: room.playerNames ? room.playerNames.P2 : 'Player 2',
        spectators,
        turn: room.gameSession.currentTurn,
        turnDeadline: room.turnDeadline,
        moveCount: room.gameSession.moveHistory ? room.gameSession.moveHistory.length : 0,
        lastMove: room.gameSession.lastMove,
        winner: room.gameSession.winnerInfo ? room.gameSession.winnerInfo.winner : null,
        winnerInfo: room.gameSession.winnerInfo,
        pieceCounts,
        board: room.gameSession.board
      });
    }

    // Sort: Playing first, then Waiting, then Ended
    const statusOrder = { PLAYING: 1, WAITING: 2, EMPTY: 3, ENDED: 4 };
    list.sort((a, b) => {
      const orderDiff = (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9);
      if (orderDiff !== 0) return orderDiff;
      return b.createdAt - a.createdAt;
    });

    return list;
  }
}
