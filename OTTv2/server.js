const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Phục vụ các tệp tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Định tuyến đường link chia sẻ phòng: /room/:roomId -> phục vụ index.html
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API kiểm tra tình trạng server (Health check)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size, timestamp: Date.now() });
});

// ========================================================
// LOGIC BÀN CỜ VÀ LUẬT CHƠI AUTHORITATIVE SERVER
// ========================================================

const BOARD_SIZE = 9;
const COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

const DIRECTIONS = [
  [-1, -1], [-1,  0], [-1,  1],
  [ 0, -1],           [ 0,  1],
  [ 1, -1], [ 1,  0], [ 1,  1]
];

// Quy tắc khắc chế Oẳn Tù Tì
const PIECE_CONFIG = {
  scissors: { name: 'Kéo', symbol: '✌️', beats: 'paper' },
  rock:     { name: 'Búa', symbol: '✊', beats: 'scissors' },
  paper:    { name: 'Bao', symbol: '✋', beats: 'rock' }
};

function canCapture(attackerType, defenderType) {
  if (!attackerType || !defenderType) return false;
  return PIECE_CONFIG[attackerType].beats === defenderType;
}

// Pool các kiểu bố trí khởi đầu cân bằng (12 quân P1, 12 quân P2 đối xứng qua a1-i9)
const POOL_LAYOUTS = [
  {
    id: 'central_fortress',
    name: 'Pháo Đài Trung Tâm',
    pieces: [
      { row: 3, col: 1, type: 'rock' },     // b4
      { row: 3, col: 2, type: 'scissors' }, // c4
      { row: 4, col: 1, type: 'paper' },    // b5
      { row: 4, col: 2, type: 'rock' },     // c5
      { row: 4, col: 3, type: 'scissors' }, // d5
      { row: 5, col: 1, type: 'scissors' }, // b6
      { row: 5, col: 2, type: 'paper' },    // c6
      { row: 5, col: 3, type: 'rock' },     // d6
      { row: 5, col: 4, type: 'paper' },    // e6
      { row: 6, col: 2, type: 'rock' },     // c7
      { row: 6, col: 3, type: 'paper' },    // d7
      { row: 6, col: 4, type: 'scissors' }  // e7
    ]
  },
  {
    id: 'southwest_flank',
    name: 'Tiền Tuyến Tây Nam',
    pieces: [
      { row: 5, col: 2, type: 'rock' },     // c6
      { row: 5, col: 3, type: 'scissors' }, // d6
      { row: 6, col: 1, type: 'paper' },    // b7
      { row: 6, col: 2, type: 'rock' },     // c7
      { row: 6, col: 3, type: 'paper' },    // d7
      { row: 7, col: 0, type: 'scissors' }, // a8
      { row: 7, col: 1, type: 'paper' },    // b8
      { row: 7, col: 2, type: 'rock' },     // c8
      { row: 7, col: 3, type: 'scissors' }, // d8
      { row: 8, col: 1, type: 'rock' },     // b9
      { row: 8, col: 2, type: 'scissors' }, // c9
      { row: 8, col: 3, type: 'paper' }     // d9
    ]
  },
  {
    id: 'tactical_pincer',
    name: 'Gọng Kìm Chiến Thuật',
    pieces: [
      { row: 2, col: 0, type: 'scissors' }, // a3
      { row: 3, col: 0, type: 'rock' },     // a4
      { row: 3, col: 1, type: 'paper' },    // b4
      { row: 4, col: 0, type: 'paper' },    // a5
      { row: 4, col: 1, type: 'scissors' }, // b5
      { row: 4, col: 2, type: 'rock' },     // c5
      { row: 6, col: 3, type: 'scissors' }, // d7
      { row: 6, col: 4, type: 'rock' },     // e7
      { row: 7, col: 4, type: 'paper' },    // e8
      { row: 7, col: 5, type: 'rock' },     // f8
      { row: 8, col: 4, type: 'scissors' }, // e9
      { row: 8, col: 5, type: 'paper' }     // f9
    ]
  },
  {
    id: 'defensive_wall',
    name: 'Bức Tường Bọc Lót',
    pieces: [
      { row: 4, col: 0, type: 'rock' },     // a5
      { row: 4, col: 1, type: 'paper' },    // b5
      { row: 4, col: 2, type: 'scissors' }, // c5
      { row: 5, col: 0, type: 'paper' },    // a6
      { row: 5, col: 1, type: 'rock' },     // b6
      { row: 5, col: 2, type: 'scissors' }, // c6
      { row: 5, col: 3, type: 'paper' },    // d6
      { row: 6, col: 1, type: 'scissors' }, // b7
      { row: 6, col: 2, type: 'rock' },     // c7
      { row: 6, col: 3, type: 'scissors' }, // d7
      { row: 7, col: 2, type: 'paper' },    // c8
      { row: 7, col: 3, type: 'rock' }      // d8
    ]
  }
];

function toCoord(row, col) {
  return `${COLS[col]}${row + 1}`;
}

function parseCoord(coordStr) {
  if (!coordStr || typeof coordStr !== 'string' || coordStr.length < 2) return null;
  const colChar = coordStr[0].toLowerCase();
  const col = COLS.indexOf(colChar);
  const row = parseInt(coordStr.substring(1), 10) - 1;
  if (col < 0 || col >= 9 || isNaN(row) || row < 0 || row >= 9) return null;
  return { row, col };
}

/**
 * Khởi tạo bàn cờ mới từ pool
 */
function createNewGameState(layoutIndex = null) {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  const chosenLayout = (layoutIndex !== null && POOL_LAYOUTS[layoutIndex])
    ? POOL_LAYOUTS[layoutIndex]
    : POOL_LAYOUTS[Math.floor(Math.random() * POOL_LAYOUTS.length)];

  // Tạo quân Player 1
  chosenLayout.pieces.forEach((p, idx) => {
    board[p.row][p.col] = {
      player: 1,
      type: p.type,
      id: `p1-${p.type}-${idx + 1}`
    };
  });

  // Tạo quân Player 2 đối xứng tuyệt đối qua đường chéo chính (r, c) -> (c, r)
  chosenLayout.pieces.forEach((p, idx) => {
    board[p.col][p.row] = {
      player: 2,
      type: p.type,
      id: `p2-${p.type}-${idx + 1}`
    };
  });

  return {
    board,
    currentTurn: 'player1', // Player 1 luôn đi trước
    layoutName: chosenLayout.name,
    pieceCounts: {
      player1: { total: 12, rock: 4, paper: 4, scissors: 4 },
      player2: { total: 12, rock: 4, paper: 4, scissors: 4 }
    },
    goals: {
      player1: { row: 0, col: 0, coord: 'a1' }, // a1
      player2: { row: 8, col: 8, coord: 'i9' }  // i9
    },
    totalMoves: 0,
    lastMove: null,
    winner: null,
    winReason: '',
    isGameOver: false,
    moveHistory: []
  };
}

// Quản lý các phòng chơi trên RAM
const rooms = new Map();

/**
 * Tạo mã phòng ngẫu nhiên gồm 4 chữ in hoa / số (ví dụ: A7K9, X42B)
 */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // loại bỏ ký tự dễ nhầm lẫn như 0, O, 1, I
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomId() : code;
}

/**
 * Kiểm tra tính hợp lệ của nước đi trên Server
 */
function validateMove(gameState, playerRole, fromCoord, toCoord) {
  if (gameState.isGameOver) {
    return { valid: false, error: 'Trò chơi đã kết thúc.' };
  }

  if (gameState.currentTurn !== playerRole) {
    return { valid: false, error: 'Không phải lượt của bạn!' };
  }

  const from = parseCoord(fromCoord);
  const to = parseCoord(toCoord);

  if (!from || !to) {
    return { valid: false, error: 'Tọa độ ô cờ không hợp lệ.' };
  }

  const piece = gameState.board[from.row][from.col];
  if (!piece) {
    return { valid: false, error: 'Không có quân cờ nào tại ô xuất phát.' };
  }

  const playerNum = playerRole === 'player1' ? 1 : 2;
  if (piece.player !== playerNum) {
    return { valid: false, error: 'Bạn không thể di chuyển quân của đối phương!' };
  }

  // Kiểm tra di chuyển đúng 1 ô theo 8 hướng
  const dr = to.row - from.row;
  const dc = to.col - from.col;

  if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (dr === 0 && dc === 0)) {
    return { valid: false, error: 'Quân cờ chỉ được di chuyển đúng 1 ô theo 8 hướng!' };
  }

  const targetPiece = gameState.board[to.row][to.col];

  // Không được đi vào ô quân cùng phe
  if (targetPiece && targetPiece.player === playerNum) {
    return { valid: false, error: 'Không thể đi vào ô có quân cùng phe (bị chặn).' };
  }

  // Nếu có quân đối phương: Kiểm tra quy tắc Oẳn Tù Tì
  if (targetPiece && targetPiece.player !== playerNum) {
    if (!canCapture(piece.type, targetPiece.type)) {
      const myCfg = PIECE_CONFIG[piece.type];
      const oppCfg = PIECE_CONFIG[targetPiece.type];
      if (piece.type === targetPiece.type) {
        return { valid: false, error: `Không thể ăn! Hai quân cùng loại (${myCfg.name}) chỉ chặn đường nhau.` };
      } else {
        return { valid: false, error: `Không thể ăn! ${myCfg.name} không thắng được ${oppCfg.name} của đối phương.` };
      }
    }
  }

  return {
    valid: true,
    from,
    to,
    movingPiece: piece,
    targetPiece,
    isCapture: targetPiece !== null
  };
}

/**
 * Thực hiện nước đi và kiểm tra điều kiện thắng trên Server
 */
function executeMove(gameState, moveData) {
  const { from, to, movingPiece, targetPiece, isCapture } = moveData;
  const playerRole = movingPiece.player === 1 ? 'player1' : 'player2';
  const opponentRole = movingPiece.player === 1 ? 'player2' : 'player1';

  // 1. Xử lý ăn quân nếu có
  if (isCapture) {
    gameState.pieceCounts[opponentRole][targetPiece.type]--;
    gameState.pieceCounts[opponentRole].total--;
  }

  // 2. Cập nhật vị trí trên bảng cờ
  gameState.board[to.row][to.col] = movingPiece;
  gameState.board[from.row][from.col] = null;

  gameState.totalMoves++;
  gameState.lastMove = {
    from: { row: from.row, col: from.col, coord: toCoord(from.row, from.col) },
    to: { row: to.row, col: to.col, coord: toCoord(to.row, to.col) },
    player: movingPiece.player,
    pieceType: movingPiece.type,
    isCapture
  };

  // Ghi nhật ký nước đi
  gameState.moveHistory.unshift({
    turnNum: gameState.totalMoves,
    player: movingPiece.player,
    pieceType: movingPiece.type,
    from: toCoord(from.row, from.col),
    to: toCoord(to.row, to.col),
    isCapture,
    capturedType: targetPiece ? targetPiece.type : null
  });

  // 3. Kiểm tra điều kiện thắng
  const myGoal = gameState.goals[playerRole];
  const oppCounts = gameState.pieceCounts[opponentRole];

  // Điều kiện 2: Đưa quân vào ô đích của mình
  if (to.row === myGoal.row && to.col === myGoal.col) {
    gameState.isGameOver = true;
    gameState.winner = playerRole;
    gameState.winReason = `Player ${movingPiece.player} đã đưa quân vào ô đích ${myGoal.coord} thành công!`;
    return;
  }

  // Điều kiện 1: Đối phương hết 1 loại quân (Kéo / Búa / Bao) hoặc hết sạch quân
  if (oppCounts.scissors <= 0) {
    gameState.isGameOver = true;
    gameState.winner = playerRole;
    gameState.winReason = `Player ${movingPiece.player} đã tiêu diệt toàn bộ quân KÉO ✌️ của đối phương!`;
    return;
  }

  if (oppCounts.rock <= 0) {
    gameState.isGameOver = true;
    gameState.winner = playerRole;
    gameState.winReason = `Player ${movingPiece.player} đã tiêu diệt toàn bộ quân BÚA ✊ của đối phương!`;
    return;
  }

  if (oppCounts.paper <= 0) {
    gameState.isGameOver = true;
    gameState.winner = playerRole;
    gameState.winReason = `Player ${movingPiece.player} đã tiêu diệt toàn bộ quân BAO ✋ của đối phương!`;
    return;
  }

  if (oppCounts.total <= 0) {
    gameState.isGameOver = true;
    gameState.winner = playerRole;
    gameState.winReason = `Player ${movingPiece.player} đã tiêu diệt toàn bộ quân đối phương!`;
    return;
  }

  // 4. Nếu chưa ai thắng: Chuyển lượt
  gameState.currentTurn = opponentRole;
}

// ========================================================
// SOCKET.IO EVENTS & QUẢN LÝ PHÒNG REALTIME
// ========================================================

io.on('connection', (socket) => {
  // 1. Tạo phòng mới
  socket.on('create_room', (data, callback) => {
    try {
      const roomId = generateRoomId();
      const sessionToken = crypto.randomUUID();
      const playerName = (data && data.name) ? data.name.trim().substring(0, 20) : 'Player 1';

      const room = {
        roomId,
        status: 'waiting', // 'waiting' | 'playing' | 'game_over'
        createdAt: Date.now(),
        players: {
          player1: {
            id: 'player1',
            socketId: socket.id,
            sessionToken,
            name: playerName || 'Player 1',
            connected: true,
            disconnectTimeout: null
          },
          player2: null
        },
        gameState: createNewGameState()
      };

      rooms.set(roomId, room);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerRole = 'player1';

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          role: 'player1',
          sessionToken,
          message: 'Phòng đã tạo thành công! Đang chờ người chơi 2...'
        });
      }
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: 'Không thể tạo phòng.' });
    }
  });

  // 2. Tham gia phòng
  socket.on('join_room', (data, callback) => {
    try {
      const roomId = (data && data.roomId) ? data.roomId.trim().toUpperCase() : '';
      const playerName = (data && data.name) ? data.name.trim().substring(0, 20) : 'Player 2';

      const room = rooms.get(roomId);
      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Mã phòng không tồn tại!' });
        return;
      }

      // Nếu phòng đã đủ 2 người
      if (room.players.player2 && room.players.player2.connected) {
        if (typeof callback === 'function') callback({ success: false, error: 'Phòng đã đầy (tối đa 2 người chơi)!' });
        return;
      }

      const sessionToken = crypto.randomUUID();

      room.players.player2 = {
        id: 'player2',
        socketId: socket.id,
        sessionToken,
        name: playerName || 'Player 2',
        connected: true,
        disconnectTimeout: null
      };

      room.status = 'playing';
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerRole = 'player2';

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          role: 'player2',
          sessionToken,
          message: 'Tham gia phòng thành công!'
        });
      }

      // Thông báo cho cả 2 người chơi rằng game đã bắt đầu!
      io.to(roomId).emit('game_start', {
        roomId,
        players: {
          player1: { name: room.players.player1.name, connected: true },
          player2: { name: room.players.player2.name, connected: true }
        },
        gameState: room.gameState
      });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: 'Lỗi tham gia phòng.' });
    }
  });

  // 3. Kết nối lại (Reconnect)
  socket.on('reconnect_session', (data, callback) => {
    try {
      const { roomId, sessionToken } = data || {};
      const room = rooms.get(roomId);

      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Phòng không tồn tại hoặc đã hết hạn.' });
        return;
      }

      let role = null;
      if (room.players.player1 && room.players.player1.sessionToken === sessionToken) {
        role = 'player1';
      } else if (room.players.player2 && room.players.player2.sessionToken === sessionToken) {
        role = 'player2';
      }

      if (!role) {
        if (typeof callback === 'function') callback({ success: false, error: 'Phiên kết nối không hợp lệ.' });
        return;
      }

      // Cập nhật socketId mới và hủy timeout mất kết nối
      const playerObj = room.players[role];
      playerObj.socketId = socket.id;
      playerObj.connected = true;
      if (playerObj.disconnectTimeout) {
        clearTimeout(playerObj.disconnectTimeout);
        playerObj.disconnectTimeout = null;
      }

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.playerRole = role;

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          role,
          sessionToken,
          roomStatus: room.status,
          players: {
            player1: { name: room.players.player1 ? room.players.player1.name : '', connected: room.players.player1?.connected },
            player2: { name: room.players.player2 ? room.players.player2.name : '', connected: room.players.player2?.connected }
          },
          gameState: room.gameState
        });
      }

      // Báo cho đối phương biết người chơi đã kết nối lại
      socket.to(roomId).emit('player_reconnected', {
        role,
        message: `${playerObj.name} đã kết nối lại!`
      });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: 'Lỗi kết nối lại.' });
    }
  });

  // 4. Người chơi thực hiện nước đi
  socket.on('make_move', (data, callback) => {
    try {
      const { roomId, from, to } = data || {};
      const room = rooms.get(roomId);

      if (!room) {
        if (typeof callback === 'function') callback({ success: false, error: 'Phòng không tồn tại.' });
        return;
      }

      const playerRole = socket.data.playerRole;
      if (!playerRole) {
        if (typeof callback === 'function') callback({ success: false, error: 'Bạn không thuộc phòng này.' });
        return;
      }

      // Xác thực nghiêm ngặt toàn bộ luật chơi trên Server
      const validation = validateMove(room.gameState, playerRole, from, to);
      if (!validation.valid) {
        if (typeof callback === 'function') callback({ success: false, error: validation.error });
        return;
      }

      // Thực hiện nước đi trên Server
      executeMove(room.gameState, validation);

      if (typeof callback === 'function') {
        callback({ success: true });
      }

      // Phát sóng cập nhật trạng thái game mới nhất cho cả 2 người chơi
      io.to(roomId).emit('game_update', {
        gameState: room.gameState
      });

      // Nếu có người thắng, phát sóng thông báo kết thúc
      if (room.gameState.isGameOver) {
        room.status = 'game_over';
        io.to(roomId).emit('game_over', {
          winner: room.gameState.winner,
          reason: room.gameState.winReason,
          gameState: room.gameState
        });
      }
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: 'Lỗi xử lý nước đi trên server.' });
    }
  });

  // 5. Yêu cầu chơi lại (Ván mới)
  socket.on('request_restart', (data) => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);
    if (!room || room.status !== 'game_over') return;

    // Reset bàn cờ với kiểu bố trí ngẫu nhiên từ pool
    room.gameState = createNewGameState();
    room.status = 'playing';

    io.to(roomId).emit('game_restarted', {
      gameState: room.gameState,
      message: 'Ván chơi mới đã bắt đầu!'
    });
  });

  // 6. Xử lý khi ngắt kết nối (Disconnect)
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const role = socket.data.playerRole;
    if (!roomId || !role) return;

    const room = rooms.get(roomId);
    if (!room) return;

    const playerObj = room.players[role];
    if (playerObj) {
      playerObj.connected = false;

      // Báo cho người còn lại biết đối phương tạm thời mất kết nối
      socket.to(roomId).emit('player_disconnected', {
        role,
        message: `${playerObj.name} đã mất kết nối. Đang chờ kết nối lại...`
      });

      // Cho phép người chơi kết nối lại trong 90 giây trước khi dọn dẹp
      playerObj.disconnectTimeout = setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom) return;

        // Nếu người chơi vẫn chưa kết nối lại
        if (!playerObj.connected) {
          const otherRole = role === 'player1' ? 'player2' : 'player1';
          const otherPlayer = currentRoom.players[otherRole];

          if (currentRoom.status === 'playing') {
            currentRoom.status = 'game_over';
            currentRoom.gameState.isGameOver = true;
            currentRoom.gameState.winner = otherRole;
            currentRoom.gameState.winReason = `${playerObj.name} đã rời khỏi trận đấu quá thời gian cho phép.`;

            io.to(roomId).emit('game_over', {
              winner: otherRole,
              reason: currentRoom.gameState.winReason,
              gameState: currentRoom.gameState
            });
          }

          // Dọn dẹp phòng nếu cả 2 đều không còn kết nối
          if (!otherPlayer || !otherPlayer.connected) {
            rooms.delete(roomId);
          }
        }
      }, 90000);
    }
  });
});

// Khởi động HTTP và WebSocket Server
server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 OẲN TÙ TÌ v2 (OTTv2) - SERVER ONLINE ĐÃ SẴN SÀNG`);
  console.log(`📡 Cổng hoạt động (PORT): ${PORT}`);
  console.log(`🌐 Truy cập cục bộ: http://localhost:${PORT}`);
  console.log(`🔗 Hỗ trợ Socket.IO và WebSockets Realtime 2 người chơi`);
  console.log(`=================================================`);
});
