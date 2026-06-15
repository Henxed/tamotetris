import { addCoins, getActiveBuff, getState, mutatePet, recordGame } from './state.js';

const COLS = 10;
const ROWS = 20;
const BLOCK = 24;
const EMPTY = 0;

const COLORS = {
  1: '#62f7ff',
  2: '#396eff',
  3: '#ffe27a',
  4: '#ff70cc',
  5: '#85ffb5',
  6: '#f98745',
  7: '#b98cff',
  8: '#2a3f59',
};

const SHAPES = [
  { id: 1, name: 'I', shape: [[1, 1, 1, 1]] },
  { id: 2, name: 'J', shape: [[2, 0, 0], [2, 2, 2]] },
  { id: 3, name: 'L', shape: [[0, 0, 3], [3, 3, 3]] },
  { id: 4, name: 'O', shape: [[4, 4], [4, 4]] },
  { id: 5, name: 'S', shape: [[0, 5, 5], [5, 5, 0]] },
  { id: 6, name: 'Z', shape: [[6, 6, 0], [0, 6, 6]] },
  { id: 7, name: 'T', shape: [[0, 7, 0], [7, 7, 7]] },
];

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

function cloneShape(shape) {
  return shape.map((row) => row.slice());
}

function randomPiece() {
  const base = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return {
    id: base.id,
    name: base.name,
    shape: cloneShape(base.shape),
    x: Math.floor(COLS / 2) - Math.ceil(base.shape[0].length / 2),
    y: 0,
  };
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

export class TetrisGame {
  constructor({ canvas, nextCanvas, onStats, onCoins, onGameOver }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext('2d');
    this.onStats = onStats;
    this.onCoins = onCoins;
    this.onGameOver = onGameOver;
    this.reset();
  }

  reset() {
    this.board = createBoard();
    this.piece = randomPiece();
    this.nextPiece = randomPiece();
    this.score = 0;
    this.lines = 0;
    this.combo = 0;
    this.earnedCoins = 0;
    this.dropCounter = 0;
    this.dropInterval = 850;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    this.gameOver = false;
    this.draw();
    this.drawNext();
    this.emitStats();
  }

  start() {
    if (this.gameOver) this.reset();
    if (this.running && this.paused) {
      this.togglePause();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.lastTime = 0;
    this.emitStats();
    requestAnimationFrame((time) => this.loop(time));
  }

  togglePause() {
    if (!this.running || this.gameOver) return;
    this.paused = !this.paused;
    this.emitStats();
    if (!this.paused) requestAnimationFrame((time) => this.loop(time));
    this.draw();
  }

  loop(time = 0) {
    if (!this.running || this.paused) return;
    const delta = time - this.lastTime;
    this.lastTime = time;
    this.dropCounter += delta;
    if (this.dropCounter > this.dropInterval) this.softDrop(false);
    this.draw();
    requestAnimationFrame((nextTime) => this.loop(nextTime));
  }

  move(direction) {
    if (!this.canAct()) return;
    this.piece.x += direction;
    if (this.collides(this.piece)) this.piece.x -= direction;
    this.draw();
  }

  rotate() {
    if (!this.canAct()) return;
    const oldShape = this.piece.shape;
    const oldX = this.piece.x;
    this.piece.shape = rotateMatrix(this.piece.shape);

    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      this.piece.x = oldX + kick;
      if (!this.collides(this.piece)) {
        this.draw();
        return;
      }
    }

    this.piece.x = oldX;
    this.piece.shape = oldShape;
  }

  softDrop(countScore = true) {
    if (!this.canAct()) return;
    this.piece.y += 1;
    if (this.collides(this.piece)) {
      this.piece.y -= 1;
      this.lockPiece();
    } else if (countScore) {
      this.score += 1;
    }
    this.dropCounter = 0;
    this.emitStats();
  }

  hardDrop() {
    if (!this.canAct()) return;
    let distance = 0;
    while (!this.collides({ ...this.piece, y: this.piece.y + 1 })) {
      this.piece.y += 1;
      distance += 1;
    }
    this.score += distance * 2;
    this.lockPiece();
    this.dropCounter = 0;
    this.emitStats();
  }

  canAct() {
    return this.running && !this.paused && !this.gameOver;
  }

  collides(piece) {
    for (let y = 0; y < piece.shape.length; y += 1) {
      for (let x = 0; x < piece.shape[y].length; x += 1) {
        if (!piece.shape[y][x]) continue;
        const boardX = piece.x + x;
        const boardY = piece.y + y;
        if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
        if (boardY >= 0 && this.board[boardY][boardX]) return true;
      }
    }
    return false;
  }

  lockPiece() {
    for (let y = 0; y < this.piece.shape.length; y += 1) {
      for (let x = 0; x < this.piece.shape[y].length; x += 1) {
        const value = this.piece.shape[y][x];
        if (!value) continue;
        const boardY = this.piece.y + y;
        const boardX = this.piece.x + x;
        if (boardY >= 0) this.board[boardY][boardX] = value;
      }
    }

    const cleared = this.clearLines();
    this.handleReward(cleared);
    this.spawnPiece();
    this.draw();
    this.emitStats();
  }

  clearLines() {
    let cleared = 0;
    outer: for (let y = ROWS - 1; y >= 0; y -= 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!this.board[y][x]) continue outer;
      }
      this.board.splice(y, 1);
      this.board.unshift(Array(COLS).fill(EMPTY));
      cleared += 1;
      y += 1;
    }
    return cleared;
  }

  handleReward(cleared) {
    if (!cleared) {
      this.combo = 0;
      mutatePet({ mood: -0.3, clean: -0.2 });
      return;
    }

    this.combo += 1;
    this.lines += cleared;
    const lineScore = [0, 120, 320, 620, 1040][cleared] || cleared * 260;
    const comboBonus = Math.max(0, this.combo - 1) * 50;
    this.score += lineScore + comboBonus;
    this.dropInterval = Math.max(250, 850 - Math.floor(this.lines / 8) * 58);

    const pet = getState().pet;
    const petCareBonus = pet.alive && pet.hunger > 55 && pet.mood > 55 && pet.clean > 55 ? 1 : 0;
    const baseCoins = [0, 2, 5, 9, 16][cleared] || cleared * 4;
    const comboCoins = Math.floor(this.combo / 2);
    const buffMultiplier = getActiveBuff() === 'bubble_fever' ? 2 : 1;
    const shellBonus = getState().ownedDecor.includes('retro_shell') && cleared === 4 ? 1 : 0;
    const coins = (baseCoins + comboCoins + petCareBonus + shellBonus) * buffMultiplier;

    this.earnedCoins += addCoins(coins);
    mutatePet({ mood: 1.5 + cleared, energy: -0.5, hunger: -0.6, clean: -0.3 });
    this.onCoins?.(coins, cleared, buffMultiplier);
  }

  spawnPiece() {
    this.piece = this.nextPiece;
    this.piece.x = Math.floor(COLS / 2) - Math.ceil(this.piece.shape[0].length / 2);
    this.piece.y = 0;
    this.nextPiece = randomPiece();
    this.drawNext();

    if (this.collides(this.piece)) this.endGame();
  }

  endGame() {
    this.running = false;
    this.paused = false;
    this.gameOver = true;
    recordGame(this.score, this.lines);
    mutatePet({ mood: this.lines > 8 ? 6 : -4, energy: -4, hunger: -2 });
    this.emitStats();
    this.onGameOver?.({ score: this.score, lines: this.lines, coins: this.earnedCoins });
    this.draw();
  }

  emitStats() {
    this.onStats?.({
      score: this.score,
      lines: this.lines,
      combo: this.combo,
      coins: this.earnedCoins,
      running: this.running,
      paused: this.paused,
      gameOver: this.gameOver,
    });
  }

  drawCell(ctx, x, y, value, size = BLOCK) {
    const color = COLORS[value];
    const px = x * size;
    const py = y * size;
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px + 3, py + 3, size - 6, Math.max(2, size * 0.18));
    ctx.strokeStyle = 'rgba(4, 16, 30, 0.45)';
    ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
  }

  drawGrid(ctx, width, height, size) {
    ctx.strokeStyle = 'rgba(98, 247, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += size) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += size) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#061120';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid(this.ctx, this.canvas.width, this.canvas.height, BLOCK);

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (this.board[y][x]) this.drawCell(this.ctx, x, y, this.board[y][x]);
      }
    }

    this.drawGhost();

    if (this.piece) {
      for (let y = 0; y < this.piece.shape.length; y += 1) {
        for (let x = 0; x < this.piece.shape[y].length; x += 1) {
          const value = this.piece.shape[y][x];
          if (value) this.drawCell(this.ctx, this.piece.x + x, this.piece.y + y, value);
        }
      }
    }

    if (this.paused) this.drawOverlay('Пауза', 'Нажми «Продолжить»');
    if (this.gameOver) this.drawOverlay('Игра окончена', 'Нажми «Снова»');
  }

  drawGhost() {
    if (!this.piece || this.gameOver) return;
    const ghost = { ...this.piece, shape: cloneShape(this.piece.shape) };
    while (!this.collides({ ...ghost, y: ghost.y + 1 })) ghost.y += 1;
    this.ctx.globalAlpha = 0.18;
    for (let y = 0; y < ghost.shape.length; y += 1) {
      for (let x = 0; x < ghost.shape[y].length; x += 1) {
        const value = ghost.shape[y][x];
        if (value) this.drawCell(this.ctx, ghost.x + x, ghost.y + y, value);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  drawOverlay(text, subtitle) {
    this.ctx.fillStyle = 'rgba(4, 16, 30, 0.72)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#ebfbff';
    this.ctx.textAlign = 'center';
    this.ctx.font = 'bold 22px system-ui';
    this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2 - 8);
    this.ctx.font = '12px system-ui';
    this.ctx.fillStyle = '#88a8bc';
    this.ctx.fillText(subtitle, this.canvas.width / 2, this.canvas.height / 2 + 18);
  }

  drawNext() {
    const ctx = this.nextCtx;
    ctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    ctx.fillStyle = '#061120';
    ctx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    const size = 16;
    const shape = this.nextPiece.shape;
    const offsetX = Math.floor((this.nextCanvas.width / size - shape[0].length) / 2);
    const offsetY = Math.floor((this.nextCanvas.height / size - shape.length) / 2);
    shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) this.drawCell(ctx, offsetX + x, offsetY + y, value, size);
      });
    });
  }
}
