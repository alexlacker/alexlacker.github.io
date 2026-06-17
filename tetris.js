const canvas = document.getElementById("board");
const context = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextContext = nextCanvas.getContext("2d");
const scoreElement = document.getElementById("score");
const linesElement = document.getElementById("lines");
const levelElement = document.getElementById("level");
const pauseButton = document.getElementById("pause");
const restartButton = document.getElementById("restart");

const COLS = 10;
const ROWS = 20;
const BLOCK = canvas.width / COLS;
const NEXT_BLOCK = nextCanvas.width / 6;

const COLORS = {
  I: "#38bdf8",
  J: "#4f46e5",
  L: "#f97316",
  O: "#facc15",
  S: "#22c55e",
  T: "#c084fc",
  Z: "#ef4444"
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]]
};

const TYPES = Object.keys(SHAPES);
const LINE_POINTS = [0, 100, 300, 500, 800];

let board;
let piece;
let nextPiece;
let score;
let lines;
let level;
let dropCounter;
let dropInterval;
let lastTime;
let paused;
let gameOver;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneShape(shape) {
  return shape.map((row) => [...row]);
}

function createPiece() {
  const type = TYPES[Math.floor(Math.random() * TYPES.length)];
  const shape = cloneShape(SHAPES[type]);

  return {
    type,
    shape,
    x: Math.floor((COLS - shape[0].length) / 2),
    y: 0
  };
}

function resetGame() {
  board = createBoard();
  piece = createPiece();
  nextPiece = createPiece();
  score = 0;
  lines = 0;
  level = 1;
  dropCounter = 0;
  dropInterval = 850;
  lastTime = 0;
  paused = false;
  gameOver = false;
  pauseButton.innerHTML = "&#10073;&#10073;";
  updateHud();
  draw();
}

function updateHud() {
  scoreElement.textContent = score;
  linesElement.textContent = lines;
  levelElement.textContent = level;
}

function rotate(shape) {
  return shape[0].map((_, index) => shape.map((row) => row[index]).reverse());
}

function collides(target = piece) {
  return target.shape.some((row, y) => row.some((cell, x) => {
    if (!cell) return false;

    const nextX = target.x + x;
    const nextY = target.y + y;

    return nextX < 0 || nextX >= COLS || nextY >= ROWS || Boolean(board[nextY]?.[nextX]);
  }));
}

function mergePiece() {
  piece.shape.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) {
        board[piece.y + y][piece.x + x] = piece.type;
      }
    });
  });
}

function clearLines() {
  let cleared = 0;

  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared += 1;
      y += 1;
    }
  }

  if (!cleared) return;

  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  score += LINE_POINTS[cleared] * level;
  dropInterval = Math.max(120, 850 - (level - 1) * 70);
  updateHud();
}

function spawnPiece() {
  piece = nextPiece;
  piece.x = Math.floor((COLS - piece.shape[0].length) / 2);
  piece.y = 0;
  nextPiece = createPiece();

  if (collides(piece)) {
    gameOver = true;
    paused = false;
  }
}

function movePiece(offset) {
  if (paused || gameOver) return;

  piece.x += offset;
  if (collides()) {
    piece.x -= offset;
  }
}

function rotatePiece() {
  if (paused || gameOver) return;

  const previousShape = piece.shape;
  const previousX = piece.x;
  piece.shape = rotate(piece.shape);

  for (const offset of [0, -1, 1, -2, 2]) {
    piece.x = previousX + offset;
    if (!collides()) return;
  }

  piece.shape = previousShape;
  piece.x = previousX;
}

function dropPiece() {
  if (paused || gameOver) return;

  piece.y += 1;
  if (collides()) {
    piece.y -= 1;
    mergePiece();
    clearLines();
    spawnPiece();
  }

  dropCounter = 0;
}

function hardDrop() {
  if (paused || gameOver) return;

  while (!collides()) {
    piece.y += 1;
  }

  piece.y -= 1;
  mergePiece();
  clearLines();
  spawnPiece();
  dropCounter = 0;
}

function drawCell(targetContext, x, y, size, color) {
  targetContext.fillStyle = color;
  targetContext.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  targetContext.fillStyle = "rgba(255, 255, 255, 0.18)";
  targetContext.fillRect(x * size + 3, y * size + 3, size - 6, 4);
}

function drawMatrix(targetContext, matrix, offsetX, offsetY, size, type) {
  matrix.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) {
        drawCell(targetContext, offsetX + x, offsetY + y, size, COLORS[type]);
      }
    });
  });
}

function drawBoard() {
  context.fillStyle = "#080b10";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(148, 163, 184, 0.08)";
  context.lineWidth = 1;

  for (let x = 1; x < COLS; x += 1) {
    context.beginPath();
    context.moveTo(x * BLOCK, 0);
    context.lineTo(x * BLOCK, canvas.height);
    context.stroke();
  }

  for (let y = 1; y < ROWS; y += 1) {
    context.beginPath();
    context.moveTo(0, y * BLOCK);
    context.lineTo(canvas.width, y * BLOCK);
    context.stroke();
  }

  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) {
        drawCell(context, x, y, BLOCK, COLORS[cell]);
      }
    });
  });

  drawMatrix(context, piece.shape, piece.x, piece.y, BLOCK, piece.type);
}

function drawNext() {
  nextContext.fillStyle = "#080b10";
  nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  const offsetX = Math.floor((6 - nextPiece.shape[0].length) / 2);
  const offsetY = Math.floor((6 - nextPiece.shape.length) / 2);
  drawMatrix(nextContext, nextPiece.shape, offsetX, offsetY, NEXT_BLOCK, nextPiece.type);
}

function drawOverlay(text) {
  context.fillStyle = "rgba(8, 11, 16, 0.72)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8fafc";
  context.font = "700 34px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);
}

function draw() {
  drawBoard();
  drawNext();

  if (paused) {
    drawOverlay("Paused");
  }

  if (gameOver) {
    drawOverlay("Game over");
  }
}

function update(time = 0) {
  const deltaTime = time - lastTime;
  lastTime = time;

  if (!paused && !gameOver) {
    dropCounter += deltaTime;

    if (dropCounter > dropInterval) {
      dropPiece();
    }
  }

  draw();
  requestAnimationFrame(update);
}

function togglePause() {
  if (gameOver) return;

  paused = !paused;
  pauseButton.innerHTML = paused ? "&#9654;" : "&#10073;&#10073;";
}

document.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.key === "ArrowLeft") movePiece(-1);
  if (event.key === "ArrowRight") movePiece(1);
  if (event.key === "ArrowDown") dropPiece();
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "x") rotatePiece();
  if (event.code === "Space") {
    hardDrop();
  }
  if (event.key.toLowerCase() === "p") togglePause();
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "left") movePiece(-1);
    if (action === "right") movePiece(1);
    if (action === "rotate") rotatePiece();
    if (action === "drop") dropPiece();
  });
});

pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", resetGame);

resetGame();
requestAnimationFrame(update);
