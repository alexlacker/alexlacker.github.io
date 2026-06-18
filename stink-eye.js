const canvas = document.getElementById("stink-eye");
const ctx = canvas.getContext("2d");

const WIDTH = 800;
const HEIGHT = 600;
const GAME_OVER_TIME = 1200;
const FADE_TIME = 1800;
const SHURIKEN_SPAWN_TIME = 3000;
const OUT_OF_BOUNDS_TIME = 500;
const EXPLOSION_HOLD_TIME = 650;

const COLORS = {
  background: "#16181c",
  border: "#50555f",
  eyeWhite: "#f5f5eb",
  iris: "#50aadc",
  pupil: "#0a0c10",
  red: "#d23c46",
  gameOver: "#78000f",
  gold: "#e6b437",
  shuriken: "#bec3cd",
  shurikenDark: "#41464e",
  fast: "#aa0f23",
  slow: "#3791eb",
  stun: "#f5d22d",
  bomb: "#9646e6",
  explosion: "#b973ff",
  cursor: "#00ff5a"
};

const gameArea = { left: 40, top: 40, right: WIDTH - 40, bottom: HEIGHT - 40 };
const eyeRadius = 50;
const shurikenRadius = 18;

let eye;
let shurikens;
let explosions;
let nextShurikenTime;
let state = "start";
let gameOverTimer = 0;
let playTimer = 0;
let finalTime = 0;
let deathMessage = "";
let dailyBest = loadDailyBest();
let personalBest = Number(localStorage.getItem("stinkEyeBest") || 0);
let outOfBoundsTimer = 0;
let eyeStunTimer = 0;
let lastTime = 0;
let pointer = { x: WIDTH / 2, y: HEIGHT / 2, active: false };
let playButton = null;
let newGameButton = null;

function clamp(value, low, high) {
  return Math.max(low, Math.min(value, high));
}

function randomRange(low, high) {
  return low + Math.random() * (high - low);
}

function touchingCircle(ax, ay, bx, by, radius) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= radius * radius;
}

function insideArea(x, y, area) {
  return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
}

function formatTime(milliseconds) {
  const totalSeconds = milliseconds / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
  if (minutes > 0) return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
  return seconds.toFixed(2);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadDailyBest() {
  const saved = localStorage.getItem("stinkEyeDailyBest");
  if (!saved) return 0;

  const [day, value] = saved.split(",");
  return day === todayKey() ? Number(value) || 0 : 0;
}

function saveBests() {
  localStorage.setItem("stinkEyeBest", String(personalBest));
  localStorage.setItem("stinkEyeDailyBest", `${todayKey()},${dailyBest}`);
}

function resetEye() {
  return {
    x: gameArea.left + eyeRadius,
    y: gameArea.top + eyeRadius,
    speedX: 0,
    speedY: 0,
    pupilX: 0,
    pupilY: 0
  };
}

function resetGame() {
  eye = resetEye();
  shurikens = [];
  explosions = [];
  nextShurikenTime = SHURIKEN_SPAWN_TIME;
  gameOverTimer = 0;
  playTimer = 0;
  finalTime = 0;
  deathMessage = "";
  outOfBoundsTimer = 0;
  eyeStunTimer = 0;
  state = "playing";
}

function makeShuriken() {
  const roll = Math.random() * 100;
  let kind = "normal";
  let speed = 4.5;
  let color = COLORS.shuriken;

  if (roll >= 35 && roll < 55) {
    kind = "fast";
    speed *= 2;
    color = COLORS.fast;
  } else if (roll >= 55 && roll < 75) {
    kind = "slow";
    speed *= 0.5;
    color = COLORS.slow;
  } else if (roll >= 75 && roll < 90) {
    kind = "stun";
    speed *= 5;
    color = COLORS.stun;
  } else if (roll >= 90) {
    kind = "bomb";
    speed *= 2;
    color = COLORS.bomb;
  }

  const direction = randomRange(0, Math.PI * 2);
  return {
    x: gameArea.right - shurikenRadius,
    y: gameArea.top + shurikenRadius,
    speedX: Math.cos(direction) * speed,
    speedY: Math.sin(direction) * speed,
    angle: 0,
    radius: shurikenRadius,
    color,
    kind,
    eyeHitCooldown: 0
  };
}

function updateShurikens(dtScale, dt) {
  shurikens.forEach((shuriken) => {
    if (shuriken.eyeHitCooldown > 0) shuriken.eyeHitCooldown -= dt;

    shuriken.x += shuriken.speedX * dtScale;
    shuriken.y += shuriken.speedY * dtScale;
    shuriken.angle += 0.25 * dtScale;

    if (shuriken.x - shuriken.radius < gameArea.left || shuriken.x + shuriken.radius > gameArea.right) {
      shuriken.speedX *= -1;
    }
    if (shuriken.y - shuriken.radius < gameArea.top || shuriken.y + shuriken.radius > gameArea.bottom) {
      shuriken.speedY *= -1;
    }

    shuriken.x = clamp(shuriken.x, gameArea.left + shuriken.radius, gameArea.right - shuriken.radius);
    shuriken.y = clamp(shuriken.y, gameArea.top + shuriken.radius, gameArea.bottom - shuriken.radius);
  });
}

function bounceShurikenOffEye(shuriken) {
  const dx = shuriken.x - eye.x;
  const dy = shuriken.y - eye.y;
  const distance = Math.hypot(dx, dy) || 1;
  const minDistance = eyeRadius + shuriken.radius;
  const normalX = dx / distance;
  const normalY = dy / distance;
  const dot = shuriken.speedX * normalX + shuriken.speedY * normalY;

  if (dot < 0) {
    shuriken.speedX -= 2 * dot * normalX;
    shuriken.speedY -= 2 * dot * normalY;
  }

  shuriken.x = eye.x + normalX * minDistance;
  shuriken.y = eye.y + normalY * minDistance;
}

function updateExplosions(dt, dtScale) {
  explosions.forEach((explosion) => {
    if (explosion.radius < explosion.targetRadius) {
      explosion.radius = Math.min(explosion.targetRadius, explosion.radius + explosion.growthSpeed * dtScale);
    } else {
      explosion.timer -= dt;
    }
  });

  explosions = explosions.filter((explosion) => explosion.timer > 0);
}

function endGame(message) {
  state = "gameOver";
  gameOverTimer = 0;
  finalTime = playTimer;
  deathMessage = message;
  saveBests();
}

function updateGame(dt) {
  const dtScale = dt / (1000 / 60);
  playTimer += dt;

  if (playTimer > dailyBest) dailyBest = playTimer;
  if (playTimer > personalBest) personalBest = playTimer;

  if (!pointer.active || !insideArea(pointer.x, pointer.y, gameArea)) {
    outOfBoundsTimer += dt;
    if (outOfBoundsTimer >= OUT_OF_BOUNDS_TIME) {
      endGame("You left the parameters for too long");
      return;
    }
  } else {
    outOfBoundsTimer = 0;
  }

  while (playTimer >= nextShurikenTime) {
    shurikens.push(makeShuriken());
    nextShurikenTime += SHURIKEN_SPAWN_TIME;
  }

  const explosionActive = explosions.length > 0;
  if (explosionActive) {
    eye.speedX = 0;
    eye.speedY = 0;
  } else if (eyeStunTimer > 0) {
    eyeStunTimer -= dt;
    eye.speedX = 0;
    eye.speedY = 0;
  } else {
    eye.speedX += (pointer.x - eye.x) * 0.0025 * dtScale;
    eye.speedY += (pointer.y - eye.y) * 0.0025 * dtScale;
    eye.speedX += randomRange(-0.4, 0.4) * dtScale;
    eye.speedY += randomRange(-0.4, 0.4) * dtScale;
    eye.speedX *= 0.88;
    eye.speedY *= 0.88;
    eye.speedX = clamp(eye.speedX, -1.5, 1.5);
    eye.speedY = clamp(eye.speedY, -1.5, 1.5);
    eye.x += eye.speedX * dtScale;
    eye.y += eye.speedY * dtScale;
  }

  const pupilTargetX = clamp((pointer.x - eye.x) * 0.12, -22, 22);
  const pupilTargetY = clamp((pointer.y - eye.y) * 0.12, -22, 22);
  eye.pupilX += (pupilTargetX - eye.pupilX) * 0.25;
  eye.pupilY += (pupilTargetY - eye.pupilY) * 0.25;
  eye.pupilX = clamp(eye.pupilX + randomRange(-2.5, 2.5), -24, 24);
  eye.pupilY = clamp(eye.pupilY + randomRange(-2.5, 2.5), -24, 24);

  if (touchingCircle(pointer.x, pointer.y, eye.x, eye.y, eyeRadius)) {
    endGame("You were given the stink eye");
    return;
  }

  if (!explosionActive) {
    updateShurikens(dtScale, dt);
    const remaining = [];

    shurikens.forEach((shuriken) => {
      if (touchingCircle(shuriken.x, shuriken.y, eye.x, eye.y, eyeRadius + shuriken.radius)) {
        if (shuriken.kind === "bomb") {
          explosions.push({
            x: shuriken.x,
            y: shuriken.y,
            radius: 0,
            targetRadius: eyeRadius * 9,
            growthSpeed: 2.25,
            timer: EXPLOSION_HOLD_TIME
          });
          return;
        }

        bounceShurikenOffEye(shuriken);
        if (shuriken.kind === "stun" && shuriken.eyeHitCooldown <= 0) {
          eyeStunTimer = 1000;
          shuriken.speedX *= 0.5;
          shuriken.speedY *= 0.5;
          shuriken.eyeHitCooldown = 1000;
        }
      }
      remaining.push(shuriken);
    });

    shurikens = remaining;
  }

  updateExplosions(dt, dtScale);

  for (const explosion of explosions) {
    if (touchingCircle(pointer.x, pointer.y, explosion.x, explosion.y, explosion.radius)) {
      endGame("You got caught in the blast");
      return;
    }
  }

  for (const shuriken of shurikens) {
    if (touchingCircle(pointer.x, pointer.y, shuriken.x, shuriken.y, shuriken.radius)) {
      endGame("You got sliced by a shuriken");
      return;
    }
  }
}

function drawText(text, x, y, size, color, align = "center", weight = 700, family = "system-ui, sans-serif") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function drawTimers() {
  ctx.textAlign = "right";
  drawText(`current ${formatTime(playTimer)}`, WIDTH - 60, 56, 26, COLORS.gold, "right", 700, "Consolas, monospace");
  drawText(`daily ${dailyBest ? formatTime(dailyBest) : "0.00"}`, WIDTH - 60, 94, 26, COLORS.gold, "right", 700, "Consolas, monospace");
  drawText(`all-time ${personalBest ? formatTime(personalBest) : "0.00"}`, WIDTH - 60, 132, 26, COLORS.gold, "right", 700, "Consolas, monospace");
}

function drawShuriken(shuriken) {
  const points = [];
  for (let index = 0; index < 8; index += 1) {
    const distance = index % 2 === 0 ? shuriken.radius : shuriken.radius * 0.35;
    const angle = shuriken.angle + index * Math.PI * 2 / 8;
    points.push([shuriken.x + Math.cos(angle) * distance, shuriken.y + Math.sin(angle) * distance]);
  }

  ctx.beginPath();
  points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = shuriken.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.shurikenDark;
  ctx.stroke();
}

function drawEye() {
  ctx.fillStyle = COLORS.eyeWhite;
  ctx.beginPath();
  ctx.arc(eye.x, eye.y, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.red;
  ctx.stroke();

  ctx.fillStyle = COLORS.iris;
  ctx.beginPath();
  ctx.arc(eye.x + eye.pupilX, eye.y + eye.pupilY, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.pupil;
  ctx.beginPath();
  ctx.arc(eye.x + eye.pupilX, eye.y + eye.pupilY, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawCursor() {
  if (!pointer.active) return;

  ctx.strokeStyle = COLORS.cursor;
  ctx.fillStyle = COLORS.cursor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 22, 0, Math.PI * 2);
  ctx.stroke();
}

function drawButton(text) {
  ctx.font = "700 86px system-ui, sans-serif";
  const width = Math.max(220, ctx.measureText(text).width + 90);
  const height = 82;
  const x = WIDTH / 2 - width / 2;
  const y = HEIGHT / 2 - height / 2;

  ctx.fillStyle = COLORS.pupil;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawText(text, WIDTH / 2, HEIGHT / 2, 86, COLORS.gold);
  return { x, y, width, height };
}

function drawGame() {
  ctx.fillStyle = outOfBoundsTimer > 0 ? COLORS.gameOver : COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (outOfBoundsTimer > 0) {
    ctx.fillStyle = COLORS.background;
    roundedRect(gameArea.left, gameArea.top, gameArea.right - gameArea.left, gameArea.bottom - gameArea.top, eyeRadius);
    ctx.fill();
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.border;
  roundedRect(gameArea.left, gameArea.top, gameArea.right - gameArea.left, gameArea.bottom - gameArea.top, eyeRadius);
  ctx.stroke();

  drawTimers();
  drawEye();
  shurikens.forEach(drawShuriken);

  explosions.forEach((explosion) => {
    ctx.fillStyle = COLORS.explosion;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  drawCursor();
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function drawEndScreen(dt) {
  gameOverTimer += dt;
  ctx.fillStyle = COLORS.gameOver;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (gameOverTimer < GAME_OVER_TIME + FADE_TIME) {
    drawText("game over", WIDTH / 2, HEIGHT / 2 - 74, 88, COLORS.pupil);
    drawText(deathMessage, WIDTH / 2, HEIGHT / 2 + 18, 28, COLORS.pupil);
    drawText(formatTime(finalTime), WIDTH / 2, HEIGHT / 2 + 68, 34, COLORS.gold, "center", 700, "Consolas, monospace");

    if (gameOverTimer > GAME_OVER_TIME) {
      const fade = (gameOverTimer - GAME_OVER_TIME) / FADE_TIME;
      ctx.fillStyle = `rgba(120, 0, 15, ${fade})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    newGameButton = null;
  } else {
    newGameButton = drawButton("new game");
  }
}

function drawFrame(dt) {
  if (state === "start") {
    playButton = drawButton("play");
  } else if (state === "playing") {
    updateGame(dt);
    drawGame();
  } else if (state === "paused") {
    drawGame();
    drawText("paused", WIDTH / 2, HEIGHT / 2, 86, COLORS.gold);
  } else if (state === "gameOver") {
    drawEndScreen(dt);
  }
}

function animationLoop(time) {
  const dt = Math.min(50, time - lastTime || 0);
  lastTime = time;
  drawFrame(dt);
  requestAnimationFrame(animationLoop);
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = (event.clientX - rect.left) * WIDTH / rect.width;
  pointer.y = (event.clientY - rect.top) * HEIGHT / rect.height;
  pointer.active = true;
}

function pointInRect(point, rect) {
  return rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

canvas.addEventListener("pointermove", updatePointer);
canvas.addEventListener("pointerdown", (event) => {
  updatePointer(event);
  canvas.setPointerCapture(event.pointerId);

  if (state === "start" && pointInRect(pointer, playButton)) {
    resetGame();
  } else if (state === "gameOver" && pointInRect(pointer, newGameButton)) {
    resetGame();
  }
});

canvas.addEventListener("pointerleave", () => {
  pointer.active = false;
});

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && state === "playing") {
    event.preventDefault();
    state = "paused";
  } else if (event.code === "Space" && state === "paused") {
    event.preventDefault();
    state = "playing";
  }
});

eye = resetEye();
shurikens = [];
explosions = [];
requestAnimationFrame(animationLoop);
