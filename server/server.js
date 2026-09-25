const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const OTTv2Engine = require('../js/game-engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
// Serve static client files from project root
app.use(express.static(path.join(__dirname, '..')));

// Room management state
// roomId -> { id, name, engine: OTTv2Engine, players: { P1: socketId, P2: socketId }, playerNames: { P1, P2 }, spectators: [] }
const rooms = new Map();

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRoomPublicInfo(room) {
  return {
    id: room.id,
    name: room.name,
    hasP1: !!room.players.P1,
    hasP2: !!room.players.P2,
    p1Name: room.playerNames.P1 || null,
    p2Name: room.playerNames.P2 || null,
    spectatorCount: room.spectators.length,
    isGameOver: room.engine.isGameOver,
    winner: room.engine.winner
  };
}

io.on('connection', (socket) => {
  console.log(`[Socket] Kết nối mới: ${socket.id}`);

  // Send available rooms
  socket.on('get_rooms', () => {
    const publicRooms = Array.from(rooms.values()).map(getRoomPublicInfo);
    socket.emit('rooms_list', publicRooms);
  });

  // Create room
  socket.on('create_room', ({ roomName, playerName }) => {
    const roomId = generateRoomId();
    const engine = new OTTv2Engine();

    const room = {
      id: roomId,
      name: roomName || `Phòng ${roomId}`,
      engine,
      players: { P1: socket.id, P2: null },
      playerNames: { P1: playerName || 'Người chơi 1 (Đỏ)', P2: null },
      spectators: [],
      chatMessages: []
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerRole = 'P1';

    console.log(`[Room] Tạo phòng ${roomId} bởi ${playerName} (${socket.id})`);

    socket.emit('room_created', {
      roomId,
      role: 'P1',
      roomInfo: getRoomPublicInfo(room),
      gameState: engine.getState()
    });

    // Broadcast updated lobby
    io.emit('rooms_list', Array.from(rooms.values()).map(getRoomPublicInfo));
  });

  // Join room
  socket.on('join_room', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room) {
      return socket.emit('error_message', 'Phòng không tồn tại hoặc đã bị hủy!');
    }

    socket.join(roomId);
    socket.roomId = roomId;

    let role = 'SPECTATOR';
    if (!room.players.P1) {
      room.players.P1 = socket.id;
      room.playerNames.P1 = playerName || 'Người chơi 1 (Đỏ)';
      role = 'P1';
    } else if (!room.players.P2) {
      room.players.P2 = socket.id;
      room.playerNames.P2 = playerName || 'Người chơi 2 (Xanh)';
      role = 'P2';
    } else {
      room.spectators.push({ id: socket.id, name: playerName || `Khán giả #${room.spectators.length + 1}` });
      role = 'SPECTATOR';
    }

    socket.playerRole = role;

    console.log(`[Room] ${socket.id} gia nhập ${roomId} với vai trò ${role}`);

    socket.emit('room_joined', {
      roomId,
      role,
      roomInfo: getRoomPublicInfo(room),
      gameState: room.engine.getState(),
      chatHistory: room.chatMessages
    });

    // Notify room of new participant
    io.to(roomId).emit('room_updated', {
      roomInfo: getRoomPublicInfo(room),
      gameState: room.engine.getState(),
      message: `${playerName || role} vừa tham gia phòng!`
    });

    io.emit('rooms_list', Array.from(rooms.values()).map(getRoomPublicInfo));
  });

  // Make move
  socket.on('make_move', ({ roomId, fromR, fromC, toR, toC }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error_message', 'Phòng không hợp lệ!');

    if (socket.playerRole !== room.engine.turn) {
      return socket.emit('error_message', 'Chưa tới lượt của bạn hoặc bạn là khán giả!');
    }

    const result = room.engine.makeMove(fromR, fromC, toR, toC);
    if (!result.success) {
      return socket.emit('error_message', result.error);
    }

    // Broadcast valid move to everyone in room
    io.to(roomId).emit('game_state_update', {
      gameState: room.engine.getState(),
      lastMove: result.move,
      gameOver: result.gameOver,
      winner: result.winner,
      winReason: result.reason
    });
  });

  // Restart game
  socket.on('restart_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (socket.playerRole !== 'P1' && socket.playerRole !== 'P2') {
      return socket.emit('error_message', 'Chỉ người chơi trong phòng mới có thể bắt đầu lại!');
    }

    room.engine.initBoard();
    io.to(roomId).emit('game_restarted', {
      gameState: room.engine.getState(),
      message: 'Ván đấu mới đã bắt đầu!'
    });
  });

  // Room chat
  socket.on('send_chat', ({ roomId, message, senderName }) => {
    const room = rooms.get(roomId);
    if (!room || !message) return;

    const chatItem = {
      id: Date.now(),
      sender: senderName || socket.playerRole,
      role: socket.playerRole,
      text: message,
      timestamp: new Date().toLocaleTimeString('vi-VN')
    };

    room.chatMessages.push(chatItem);
    if (room.chatMessages.length > 50) room.chatMessages.shift();

    io.to(roomId).emit('new_chat', chatItem);
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (!socket.roomId) return;
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (room.players.P1 === socket.id) {
      room.players.P1 = null;
      room.playerNames.P1 = null;
    } else if (room.players.P2 === socket.id) {
      room.players.P2 = null;
      room.playerNames.P2 = null;
    } else {
      room.spectators = room.spectators.filter(s => s.id !== socket.id);
    }

    // Clean up empty room
    if (!room.players.P1 && !room.players.P2 && room.spectators.length === 0) {
      rooms.delete(socket.roomId);
      console.log(`[Room] Phòng ${socket.roomId} đã bị xóa do không còn ai.`);
    } else {
      io.to(socket.roomId).emit('room_updated', {
        roomInfo: getRoomPublicInfo(room),
        gameState: room.engine.getState(),
        message: `Một người chơi (${socket.playerRole}) đã rời phòng.`
      });
    }

    io.emit('rooms_list', Array.from(rooms.values()).map(getRoomPublicInfo));
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  🚀 OTTv2 MULTIPLAYER SERVER ĐANG CHẠY TẠI:`);
  console.log(`  👉 http://localhost:${PORT}`);
  console.log(`  👉 Chơi qua thư viện playfun: http://localhost:${PORT}/playfun.html`);
  console.log(`=======================================================`);
});
