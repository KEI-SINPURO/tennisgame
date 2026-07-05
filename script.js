const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const playerScoreEl = document.getElementById('playerScore');
const cpuScoreEl = document.getElementById('cpuScore');
const messageEl = document.getElementById('message');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 90;
const BALL_SIZE = 12;
const WIN_SCORE = 5;

let player = { x: 20, y: HEIGHT / 2 - PADDLE_HEIGHT / 2, width: PADDLE_WIDTH, height: PADDLE_HEIGHT, speed: 8, score: 0 };
let cpu = { x: WIDTH - 20 - PADDLE_WIDTH, y: HEIGHT / 2 - PADDLE_HEIGHT / 2, width: PADDLE_WIDTH, height: PADDLE_HEIGHT, speed: 5, score: 0 };
let ball = { x: WIDTH / 2, y: HEIGHT / 2, size: BALL_SIZE, speedX: 5, speedY: 3 };

let running = false;
let animationId = null;
let upPressed = false;
let downPressed = false;

function resetBall(direction) {
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  const speed = 5;
  const angle = (Math.random() * 0.6 - 0.3);
  ball.speedX = speed * direction;
  ball.speedY = speed * angle * 3;
}

function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawCircle(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawNet() {
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2, 0);
  ctx.lineTo(WIDTH / 2, HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawNet();
  drawRect(player.x, player.y, player.width, player.height, '#ffcc00');
  drawRect(cpu.x, cpu.y, cpu.width, cpu.height, '#ff5555');
  drawCircle(ball.x, ball.y, ball.size, '#ffffff');
}

function update() {
  // プレイヤーの移動（キーボード操作）
  if (upPressed) player.y -= player.speed;
  if (downPressed) player.y += player.speed;
  player.y = Math.max(0, Math.min(HEIGHT - player.height, player.y));

  // CPUの移動（ボールを追いかける）
  const cpuCenter = cpu.y + cpu.height / 2;
  if (cpuCenter < ball.y - 15) {
    cpu.y += cpu.speed;
  } else if (cpuCenter > ball.y + 15) {
    cpu.y -= cpu.speed;
  }
  cpu.y = Math.max(0, Math.min(HEIGHT - cpu.height, cpu.y));

  // ボールの移動
  ball.x += ball.speedX;
  ball.y += ball.speedY;

  // 上下の壁反射
  if (ball.y - ball.size < 0 || ball.y + ball.size > HEIGHT) {
    ball.speedY *= -1;
  }

  // プレイヤーのラケットとの衝突
  if (
    ball.x - ball.size < player.x + player.width &&
    ball.x - ball.size > player.x &&
    ball.y > player.y &&
    ball.y < player.y + player.height &&
    ball.speedX < 0
  ) {
    ball.speedX *= -1.05;
    const hitPos = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
    ball.speedY = hitPos * 6;
  }

  // CPUのラケットとの衝突
  if (
    ball.x + ball.size > cpu.x &&
    ball.x + ball.size < cpu.x + cpu.width &&
    ball.y > cpu.y &&
    ball.y < cpu.y + cpu.height &&
    ball.speedX > 0
  ) {
    ball.speedX *= -1.05;
    const hitPos = (ball.y - (cpu.y + cpu.height / 2)) / (cpu.height / 2);
    ball.speedY = hitPos * 6;
  }

  // 得点判定
  if (ball.x < 0) {
    cpu.score++;
    updateScore();
    checkWin();
    if (running) resetBall(1);
  } else if (ball.x > WIDTH) {
    player.score++;
    updateScore();
    checkWin();
    if (running) resetBall(-1);
  }
}

function updateScore() {
  playerScoreEl.textContent = player.score;
  cpuScoreEl.textContent = cpu.score;
}

function checkWin() {
  if (player.score >= WIN_SCORE) {
    endGame('あなたの勝ちです！ 🎉');
  } else if (cpu.score >= WIN_SCORE) {
    endGame('CPUの勝ちです。もう一度挑戦しましょう！');
  }
}

function endGame(text) {
  running = false;
  cancelAnimationFrame(animationId);
  messageEl.textContent = text;
}

function gameLoop() {
  if (!running) return;
  update();
  draw();
  animationId = requestAnimationFrame(gameLoop);
}

function startGame() {
  if (running) return;
  running = true;
  messageEl.textContent = '';
  draw();
  gameLoop();
}

function restartGame() {
  player.score = 0;
  cpu.score = 0;
  player.y = HEIGHT / 2 - PADDLE_HEIGHT / 2;
  cpu.y = HEIGHT / 2 - PADDLE_HEIGHT / 2;
  updateScore();
  messageEl.textContent = '';
  resetBall(Math.random() > 0.5 ? 1 : -1);
  running = true;
  cancelAnimationFrame(animationId);
  gameLoop();
}

// マウス操作
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleY = canvas.height / rect.height;
  const mouseY = (e.clientY - rect.top) * scaleY;
  player.y = mouseY - player.height / 2;
  player.y = Math.max(0, Math.min(HEIGHT - player.height, player.y));
});

// キーボード操作
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') upPressed = true;
  if (e.key === 'ArrowDown') downPressed = true;
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp') upPressed = false;
  if (e.key === 'ArrowDown') downPressed = false;
});

startBtn.addEventListener('click', () => {
  resetBall(Math.random() > 0.5 ? 1 : -1);
  startGame();
});

restartBtn.addEventListener('click', restartGame);

// 初期描画
resetBall(1);
draw();
