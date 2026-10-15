/**
 * Oẳn Tù Tì v2 (OTTv2) - Board UI & Interaction Controller
 * Handles 9x9 DOM rendering, selection states, valid move highlights, and animations.
 */

import { pieceArt } from './pieceArt.js';
import {
  BOARD_SIZE,
  COLUMNS,
  ROWS,
  GOAL_CELLS,
  PIECE_NAMES_VI,
  PLAYERS,
  sounds
} from './constants.js';
import {
  coordToPos,
  posToCoord,
  getValidMovesForPiece,
  validateMove
} from './gameRules.js';

export class BoardRenderer {
  constructor(boardElement, options = {}) {
    this.container = boardElement;
    this.onMove = options.onMove || null;
    this.onSelectPiece = options.onSelectPiece || null;
    this.onInvalidClick = options.onInvalidClick || null;
    this.onCellHover = options.onCellHover || null;
    this.onCellLeave = options.onCellLeave || null;

    this.selectedPos = null;
    this.validMoves = [];
    this.lastMove = null;
    this.currentBoard = null;
    this.currentTurn = PLAYERS.PLAYER_1;
    this.interactive = true;
    this.localPlayerRole = null; // null = can move both, 'P1' or 'P2' = locked role
  }

  setInteractive(flag) {
    this.interactive = flag;
  }

  setLocalRole(role) {
    this.localPlayerRole = role;
  }

  setPlacementMode(active, callback = null, validMinY = 5, validMaxY = 8) {
    this.placementMode = active;
    this.onPlacementClick = callback;
    this.clearSelection();
    this.highlightPlacementZone(validMinY, validMaxY);
  }

  highlightPlacementZone(validMinY = 5, validMaxY = 8) {
    const cells = this.container.querySelectorAll('.board-cell');
    cells.forEach(cell => {
      const y = parseInt(cell.dataset.y, 10);
      if (this.placementMode && y >= validMinY && y <= validMaxY) {
        cell.classList.add('cell-placement-valid');
      } else {
        cell.classList.remove('cell-placement-valid');
      }
    });
  }

  /**
   * Initializes the 9x9 board DOM structure with coordinate headers
   */
  initBoard() {
    this.container.innerHTML = '';
    this.container.className = 'board-grid';

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const coord = posToCoord(c, r);
        const cell = document.createElement('div');
        cell.setAttribute('role', 'button');
        cell.tabIndex = 0;
        cell.className = 'board-cell';
        cell.dataset.x = c;
        cell.dataset.y = r;
        cell.dataset.coord = coord;

        // Alternate checkered pattern
        if ((r + c) % 2 === 0) {
          cell.classList.add('cell-light');
        } else {
          cell.classList.add('cell-dark');
        }

        // Special goal cells: A9 and I1
        if (GOAL_CELLS.includes(coord)) {
          cell.classList.add('cell-goal');
          const goalBadge = document.createElement('span');
          goalBadge.className = 'goal-marker';
          goalBadge.textContent = '★ ĐÍCH';
          cell.appendChild(goalBadge);
        }

        // Cell coordinate label (e.g. A1, B2)
        const label = document.createElement('span');
        label.className = 'coord-label';
        label.textContent = coord;
        cell.appendChild(label);

        // Click and Hover listeners
        cell.addEventListener('click', (e) => this.handleCellClick(c, r, coord, e));
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.handleCellClick(c, r, coord, e);
          }
        });
        cell.addEventListener('mouseenter', () => this.handleCellHover(c, r, coord));
        cell.addEventListener('mouseleave', () => this.handleCellLeave());

        this.container.appendChild(cell);
      }
    }
  }

  handleCellHover(x, y, coord) {
    if (this.onCellHover) {
      this.onCellHover(x, y, coord, this.selectedPos, this.currentBoard, this.currentTurn);
    }
  }

  handleCellLeave() {
    if (this.onCellLeave) {
      this.onCellLeave(this.selectedPos);
    }
  }

  /**
   * Updates the board display based on current game state
   */
  render(board, turn, lastMove = null) {
    this.currentBoard = board;
    this.currentTurn = turn;
    this.lastMove = lastMove;

    const cells = this.container.querySelectorAll('.board-cell');
    cells.forEach(cell => {
      const x = parseInt(cell.dataset.x, 10);
      const y = parseInt(cell.dataset.y, 10);
      const coord = cell.dataset.coord;

      // Clear dynamic classes
      cell.classList.remove('selected', 'valid-dest', 'valid-capture', 'last-from', 'last-to');

      // Highlight last move
      if (this.lastMove) {
        if (this.lastMove.from === coord) cell.classList.add('last-from');
        if (this.lastMove.to === coord) cell.classList.add('last-to');
      }

      // Check if selected
      if (this.selectedPos && this.selectedPos.x === x && this.selectedPos.y === y) {
        cell.classList.add('selected');
      }

      // Check if valid destination
      const validMove = this.validMoves.find(m => m.x === x && m.y === y);
      if (validMove) {
        if (validMove.isCapture) {
          cell.classList.add('valid-capture');
        } else {
          cell.classList.add('valid-dest');
        }
      }

      // Render piece in cell
      let pieceEl = cell.querySelector('.piece');
      const piece = board[y][x];

      if (piece) {
        if (!pieceEl) {
          pieceEl = document.createElement('div');
          cell.appendChild(pieceEl);
        }
        pieceEl.className = `piece piece-${piece.player.toLowerCase()} piece-type-${piece.type.toLowerCase()}`;
        pieceEl.dataset.type = piece.type;
        pieceEl.dataset.player = piece.player;

        // Content with high readability
        const pieceName = PIECE_NAMES_VI[piece.type] || piece.type;
        pieceEl.innerHTML = `
          ${pieceArt(piece.type)}
          <span class="piece-tag">${pieceName}</span>
        `;
        pieceEl.title = `${piece.player === PLAYERS.PLAYER_1 ? 'Đội Hồng · P1' : 'Đội Xanh · P2'} - Quân ${pieceName}`;
        cell.setAttribute('aria-label', `${coord}: ${pieceEl.title}`);
      } else if (pieceEl) {
        pieceEl.remove();
      }
      if (!piece) cell.setAttribute('aria-label', `${coord}${GOAL_CELLS.includes(coord) ? ': Ô đích' : ': Ô trống'}`);
    });
  }

  /**
   * Handles user click on any cell
   */
  handleCellClick(x, y, coord, event) {
    if (!this.interactive || !this.currentBoard) return;

    // Khi đang trong giai đoạn Tự Chọn & Dàn Trận
    if (this.placementMode) {
      if (this.onPlacementClick) {
        this.onPlacementClick(x, y, coord, this.currentBoard[y][x]);
      }
      return;
    }

    // Check player role lock in multiplayer
    if (this.localPlayerRole && this.localPlayerRole !== this.currentTurn) {
      if (this.onInvalidClick) {
        this.onInvalidClick('Chưa tới lượt của bạn!');
      }
      sounds.block();
      return;
    }

    const clickedPiece = this.currentBoard[y][x];

    // Scenario 1: No piece is currently selected
    if (!this.selectedPos) {
      if (!clickedPiece) return;

      // Cannot select opponent piece
      if (clickedPiece.player !== this.currentTurn) {
        this.shakeCell(coord);
        sounds.block();
        if (this.onInvalidClick) {
          this.onInvalidClick(`Đang là lượt của ${this.currentTurn === PLAYERS.PLAYER_1 ? 'Player 1' : 'Player 2'}!`);
        }
        return;
      }

      // Select piece and calculate valid moves
      this.selectPiece(x, y);
      return;
    }

    // Scenario 2: A piece is already selected
    const { x: selX, y: selY } = this.selectedPos;
    const selectedPiece = this.currentBoard[selY][selX];
    const fromCoord = posToCoord(selX, selY);

    // Clicking the same piece again -> deselect
    if (selX === x && selY === y) {
      this.clearSelection();
      sounds.select();
      return;
    }

    // Clicking another piece of the same player -> switch selection
    if (clickedPiece && clickedPiece.player === this.currentTurn) {
      this.selectPiece(x, y);
      return;
    }

    // Validate the proposed move
    const check = validateMove(
      this.currentBoard,
      { from: fromCoord, to: coord, player: this.currentTurn },
      this.currentTurn
    );

    if (check.valid) {
      // Execute move
      const moveData = {
        from: fromCoord,
        fromPos: { x: selX, y: selY },
        to: coord,
        toPos: { x, y },
        player: this.currentTurn,
        isCapture: check.isCapture,
        capturedPiece: check.capturedPiece,
        piece: selectedPiece
      };

      if (check.isCapture) {
        sounds.capture();
        this.spawnCaptureEffect(x, y);
      } else {
        sounds.move();
      }

      this.clearSelection();

      if (this.onMove) {
        this.onMove(moveData);
      }
    } else {
      // Invalid move
      this.shakeCell(coord);
      sounds.block();
      if (this.onInvalidClick) {
        this.onInvalidClick(check.reason || 'Nước đi không hợp lệ!');
      }
    }
  }

  selectPiece(x, y) {
    this.selectedPos = { x, y };
    this.validMoves = getValidMovesForPiece(this.currentBoard, x, y, this.currentTurn);
    sounds.select();

    if (this.onSelectPiece) {
      this.onSelectPiece(this.currentBoard[y][x], posToCoord(x, y), this.validMoves);
    }

    this.render(this.currentBoard, this.currentTurn, this.lastMove);
  }

  clearSelection() {
    this.selectedPos = null;
    this.validMoves = [];
    if (this.currentBoard) {
      this.render(this.currentBoard, this.currentTurn, this.lastMove);
    }
  }

  shakeCell(coord) {
    const cell = this.container.querySelector(`[data-coord="${coord}"]`);
    if (cell) {
      cell.classList.remove('cell-shake');
      void cell.offsetWidth; // Force reflow
      cell.classList.add('cell-shake');
      setTimeout(() => cell.classList.remove('cell-shake'), 450);
    }
  }

  spawnCaptureEffect(x, y) {
    const cell = this.container.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    if (!cell) return;

    const splash = document.createElement('div');
    splash.className = 'capture-splash';
    splash.innerHTML = '💥';
    cell.appendChild(splash);

    setTimeout(() => splash.remove(), 700);
  }
}
