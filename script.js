/* ============================================================
   本格テニスゲーム
   ・実際のテニスの得点方式(0/15/30/40・デュース・アドバンテージ)
   ・ワンバウンドまでに打ち返すルール、コート外/ネットは失点
   ・サーブは1ゲームごとに交代
   ・スマッシュ、ラリー演出、効果音、紙吹雪などで「楽しさ」を強化
   ============================================================ */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const popupLayer = document.getElementById('popupLayer');
const messageEl = document.getElementById('message');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const playerPointEl = document.getElementById('playerPoint');
const cpuPointEl = document.getElementById('cpuPoint');
const playerGamesEl = document.getElementById('playerGames');
const cpuGamesEl = document.getElementById('cpuGames');
const serverInfoEl = document.getElementById('serverInfo');
const rallyInfoEl = document.getElementById('rallyInfo');

/* ---------------- コート座標 ---------------- */
const COURT_LEFT = 90, COURT_RIGHT = 550;
const COURT_TOP = 70, COURT_BOTTOM = 790;
const NET_Y = (COURT_TOP + COURT_BOTTOM) / 2; // 430
const SERVICE_LINE_TOP = NET_Y - 150;
const SERVICE_LINE_BOTTOM = NET_Y + 150;
const NET_HEIGHT_PX = 26; // ネットの実効高さ(これ以下でネット通過するとネットに引っかかる)

const GRAVITY = 0.55;
const RESTITUTION = 0.56;
const HIT_RADIUS = 58;

/* ---------------- 状態管理 ---------------- */
let running = false;
let animId = null;
let rally = 0;
let difficulty = 0; // ラリーやゲームが進むほど上がる

const match = {
  point: { player: 0, cpu: 0 }, // 0,1,2,3 = 0/15/30/40, advantage表現は関数で
  games: { player: 0, cpu: 0 },
  server: 'player', // 'player' | 'cpu'
};

const player = {
  x: W / 2, y: COURT_BOTTOM + 30,
  targetX: W / 2, targetY: COURT_BOTTOM + 30,
  side: 'player',
  color: '#ffd633',
};

const cpu = {
  x: W / 2, y: COURT_TOP - 30,
  side: 'cpu',
  color: '#ff6b6b',
  speed: 3.4,
};

const ball = {
  x: W / 2, y: COURT_BOTTOM + 30,
  vx: 0, vy: 0,
  h: 0, vh: 0,
  bounces: 0,
  trail: [],
};

let lastHitter = null; // 'player' | 'cpu'
let state = 'idle'; // idle, ready_to_serve, serving_wait, rally, point_over
let charging = false;
let mouse = { x: W / 2, y: COURT_BOTTOM + 30, vx: 0, vy: 0, prevX: W/2, prevY: COURT_BOTTOM+30 };
let shakeTime = 0, shakeMag = 0;
let particles = [];

/* ---------------- サウンド (WebAudio、外部ファイル不要) ---------------- */
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
}
function beep(freq, duration = 0.09, type = 'sine', gainVal = 0.18, delay = 0) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainVal;
  osc.connect(gain).connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(gainVal, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}
function sfxHit(power = 1) { beep(220 + power * 140, 0.08, 'triangle', 0.22); }
function sfxBounce() { beep(140, 0.06, 'sine', 0.12); }
function sfxNet() { beep(90, 0.18, 'sawtooth', 0.15); }
function sfxScore() { beep(523, 0.1, 'square', 0.15); beep(659, 0.12, 'square', 0.15, 0.09); beep(784, 0.16, 'square', 0.18, 0.18); }
function sfxWinGame() { [523,659,784,1046].forEach((f,i)=>beep(f,0.14,'square',0.18,i*0.11)); }

/* ---------------- 見た目演出: 浮遊テキスト ---------------- */
function floatText(text, xRatio, yRatio, color = '#fff', size = 28) {
  const el = document.createElement('div');
  el.className = 'floating-text';
  el.textContent = text;
  el.style.left = (xRatio * 100) + '%';
  el.style.top = (yRatio * 100) + '%';
  el.style.color = color;
  el.style.fontSize = size + 'px';
  popupLayer.appendChild(el);
  setTimeout(() => el.remove(), 1150);
}

function confettiBurst() {
  const colors = ['#ffd633', '#ff6b6b', '#7fffaf', '#66ccff', '#ff99ff'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + '%';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = (1.4 + Math.random() * 1.2) + 's';
    el.style.animationDelay = (Math.random() * 0.4) + 's';
    popupLayer.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
}

function shake(mag, time) { shakeMag = mag; shakeTime = time; }

function spawnParticles(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 26 + Math.random() * 14,
      color,
    });
  }
}

/* ---------------- 得点表示ヘルパー ---------------- */
const POINT_LABEL = ['0', '15', '30', '40'];
function updateScoreboard() {
  const p = match.point.player, c = match.point.cpu;
  let pText, cText;
  if (p >= 3 && c >= 3) {
    if (p === c) { pText = '40'; cText = '40'; }
    else if (p > c) { pText = 'AD'; cText = ''; }
    else { pText = ''; cText = 'AD'; }
  } else {
    pText = POINT_LABEL[Math.min(p, 3)];
    cText = POINT_LABEL[Math.min(c, 3)];
  }
  playerPointEl.textContent = pText;
  cpuPointEl.textContent = cText;
  playerGamesEl.textContent = match.games.player;
  cpuGamesEl.textContent = match.games.cpu;
  serverInfoEl.textContent = 'サーブ: ' + (match.server === 'player' ? 'あなた' : 'CPU');
  rallyInfoEl.textContent = 'ラリー: ' + rally;
}

/* ---------------- 得点処理 ---------------- */
function awardPoint(side) {
  match.point[side]++;
  sfxScore();
  floatText(side === 'player' ? 'ポイント!' : 'CPUポイント', 0.5, 0.42,
    side === 'player' ? '#ffd633' : '#ff6b6b', 34);

  const p = match.point.player, c = match.point.cpu;
  const won = (p >= 4 || c >= 4) && Math.abs(p - c) >= 2;
  if (won) {
    const winner = p > c ? 'player' : 'cpu';
    match.games[winner]++;
    match.point.player = 0; match.point.cpu = 0;
    sfxWinGame();
    floatText(winner === 'player' ? 'ゲーム獲得!' : 'CPUがゲーム獲得', 0.5, 0.3,
      winner === 'player' ? '#7fffaf' : '#ff9999', 30);
    // サーブ交代
    match.server = match.server === 'player' ? 'cpu' : 'player';

    const gp = match.games.player, gc = match.games.cpu;
    const matchWon = (gp >= 4 || gc >= 4) && Math.abs(gp - gc) >= 2;
    if (matchWon) {
      const matchWinner = gp > gc ? 'player' : 'cpu';
      endMatch(matchWinner);
      updateScoreboard();
      return;
    }
  }
  updateScoreboard();
  rally = 0;
  prepareServe();
}

function endMatch(winner) {
  running = false;
  cancelAnimationFrame(animId);
  if (winner === 'player') {
    messageEl.textContent = '🏆 あなたの勝利です！おめでとうございます！';
    confettiBurst();
  } else {
    messageEl.textContent = 'CPUの勝利です。次こそはリベンジしましょう！';
  }
  state = 'idle';
}

/* ---------------- サーブ準備 ---------------- */
function prepareServe() {
  ball.bounces = 0;
  lastHitter = null;
  ball.h = 0; ball.vh = 0; ball.vx = 0; ball.vy = 0;
  ball.trail = [];
  if (match.server === 'player') {
    ball.x = player.x; ball.y = COURT_BOTTOM + 20;
    state = 'ready_to_serve';
    messageEl.textContent = 'クリックまたはスペースキーでサーブ！';
  } else {
    ball.x = cpu.x; ball.y = COURT_TOP - 20;
    state = 'cpu_serving';
    messageEl.textContent = 'CPUがサーブします…';
    setTimeout(() => { if (state === 'cpu_serving') cpuServe(); }, 700);
  }
}

function playerServe() {
  if (state !== 'ready_to_serve') return;
  ensureAudio();
  const targetX = COURT_LEFT + 40 + Math.random() * (COURT_RIGHT - COURT_LEFT - 80);
  const targetY = COURT_TOP + 60 + Math.random() * 100;
  launchBall(ball.x, ball.y, targetX, targetY, 15, 'player');
  sfxHit(0.6);
  messageEl.textContent = '';
  state = 'rally';
}

function cpuServe() {
  const targetX = COURT_LEFT + 40 + Math.random() * (COURT_RIGHT - COURT_LEFT - 80);
  const targetY = COURT_BOTTOM - 160 + Math.random() * 100;
  launchBall(ball.x, ball.y, targetX, targetY, 14, 'cpu');
  sfxHit(0.5);
  messageEl.textContent = '';
  state = 'rally';
}

/* 弾道計算: (fromX,fromY) から (toX,toY) へ、frames フレームで届く放物線 */
function launchBall(fromX, fromY, toX, toY, frames, hitter) {
  ball.x = fromX; ball.y = fromY;
  ball.vx = (toX - fromX) / frames;
  ball.vy = (toY - fromY) / frames;
  // 山なりの軌道になるよう初速を計算(重力から頂点の高さを逆算)
  const peakHeight = 90 + Math.random() * 40;
  ball.vh = Math.sqrt(2 * GRAVITY * peakHeight);
  ball.h = Math.max(ball.h, 0);
  ball.bounces = 0;
  lastHitter = hitter;
}

/* ---------------- 入力 ---------------- */
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  mouse.prevX = mouse.x; mouse.prevY = mouse.y;
  mouse.x = (e.clientX - rect.left) * scaleX;
  mouse.y = (e.clientY - rect.top) * scaleY;
  mouse.vx = mouse.x - mouse.prevX;
  mouse.vy = mouse.y - mouse.prevY;
});

canvas.addEventListener('mousedown', () => {
  ensureAudio();
  charging = true;
  if (state === 'ready_to_serve') playerServe();
});
canvas.addEventListener('mouseup', () => { charging = false; });

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    ensureAudio();
    charging = true;
    if (state === 'ready_to_serve') playerServe();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') charging = false;
});

/* ---------------- プレイヤー移動 ---------------- */
function updatePlayerPosition() {
  const minX = COURT_LEFT - 40, maxX = COURT_RIGHT + 40;
  const minY = NET_Y + 30, maxY = COURT_BOTTOM + 60;
  player.x = Math.max(minX, Math.min(maxX, mouse.x));
  player.y = Math.max(minY, Math.min(maxY, mouse.y));
}

/* ---------------- CPU AI ---------------- */
function updateCpuPosition() {
  const targetX = ball.y < NET_Y ? ball.x : cpu.x; // ボールが自陣にある時だけ追う
  const minX = COURT_LEFT - 20, maxX = COURT_RIGHT + 20;
  const speed = cpu.speed + difficulty * 0.35;
  if (cpu.x < targetX - 4) cpu.x += Math.min(speed, targetX - cpu.x);
  else if (cpu.x > targetX + 4) cpu.x -= Math.min(speed, cpu.x - targetX);
  cpu.x = Math.max(minX, Math.min(maxX, cpu.x));

  const targetY = ball.y < NET_Y ? Math.max(COURT_TOP - 20, ball.y - 10) : COURT_TOP - 30;
  if (cpu.y < targetY - 4) cpu.y += speed * 0.7;
  else if (cpu.y > targetY + 4) cpu.y -= speed * 0.7;
}

/* ---------------- 打球処理 ---------------- */
function performHit(entity) {
  const isPlayer = entity.side === 'player';
  rally++;
  difficulty = Math.min(6, rally * 0.12);

  let power = 1;
  let smash = false;
  if (isPlayer && charging) { power = 1.6; smash = true; }

  // 狙う場所: 相手コートのランダムな位置(相手から離れた場所を狙うと少し有利)
  const oppX = isPlayer ? cpu.x : player.x;
  let targetX;
  const awayLeft = Math.abs((COURT_LEFT + 30) - oppX);
  const awayRight = Math.abs((COURT_RIGHT - 30) - oppX);
  const biasAway = Math.random() < 0.65;
  if (biasAway) {
    targetX = awayLeft > awayRight ? COURT_LEFT + 30 + Math.random() * 60 : COURT_RIGHT - 30 - Math.random() * 60;
  } else {
    targetX = COURT_LEFT + 40 + Math.random() * (COURT_RIGHT - COURT_LEFT - 80);
  }
  // プレイヤーの場合はマウスの振り(スイング方向)を少し反映
  if (isPlayer) {
    targetX += mouse.vx * 4;
    targetX = Math.max(COURT_LEFT + 10, Math.min(COURT_RIGHT - 10, targetX));
  }

  const targetY = isPlayer
    ? COURT_TOP + 50 + Math.random() * 120
    : COURT_BOTTOM - 170 + Math.random() * 120;

  const baseFrames = Math.max(26, 44 - rally * 1.1 - difficulty * 2);
  const frames = smash ? baseFrames * 0.72 : baseFrames;

  launchBall(entity.x, entity.y, targetX, targetY, frames, entity.side);
  // スマッシュは弾道を低めに(頂点を下げる)
  if (smash) ball.vh *= 0.7;

  sfxHit(power);
  spawnParticles(entity.x, entity.y, entity.color, smash ? 26 : 14);
  if (smash) {
    shake(6, 10);
    floatText('スマッシュ!!', entity.x / W, entity.y / H, '#ffaa00', 30);
  } else if (rally > 0 && rally % 5 === 0) {
    const msgs = ['ナイスラリー!', 'いい調子!', 'すごい打ち合い!', 'まだまだ続く!'];
    floatText(msgs[Math.floor(Math.random() * msgs.length)], 0.5, 0.5, '#66ccff', 24);
  }
}

function checkHit(entity) {
  if (state !== 'rally') return;
  const onSide = entity.side === 'player' ? ball.y > NET_Y : ball.y < NET_Y;
  if (!onSide) return;
  if (lastHitter === entity.side) return;
  const dist = Math.hypot(ball.x - entity.x, ball.y - entity.y);
  if (dist < HIT_RADIUS) performHit(entity);
}

/* ---------------- ボール物理 ---------------- */
function updateBall() {
  if (state !== 'rally') return;

  const prevY = ball.y;
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.h += ball.vh;
  ball.vh -= GRAVITY;

  ball.trail.push({ x: ball.x, y: ball.y, h: ball.h });
  if (ball.trail.length > 10) ball.trail.shift();

  // ネット判定(ネットを低い高さで通過しようとした場合)
  const crossedNet = (prevY < NET_Y && ball.y >= NET_Y) || (prevY > NET_Y && ball.y <= NET_Y);
  if (crossedNet && ball.h < NET_HEIGHT_PX) {
    sfxNet();
    spawnParticles(ball.x, NET_Y, '#ffffff', 16);
    const receiver = lastHitter === 'player' ? 'cpu' : 'player';
    endRally(receiver, lastHitter === 'player' ? 'ネットにかかりました' : 'CPUがネットにかけました');
    return;
  }

  // バウンド判定
  if (ball.h <= 0) {
    ball.h = 0;
    ball.vh = -ball.vh * RESTITUTION;
    sfxBounce();
    spawnParticles(ball.x, ball.y, '#ffffff', 8);

    const inBounds = ball.x >= COURT_LEFT && ball.x <= COURT_RIGHT && ball.y >= COURT_TOP && ball.y <= COURT_BOTTOM;
    if (!inBounds) {
      const receiver = lastHitter === 'player' ? 'cpu' : 'player';
      endRally(receiver, lastHitter === 'player' ? 'アウト！' : 'CPUのアウト！');
      return;
    }

    ball.bounces++;
    if (ball.bounces >= 2) {
      // 打ち返せなかった -> 直前の打者の得点
      endRally(lastHitter, lastHitter === 'player' ? 'ナイスショット！' : 'CPUの得点');
      return;
    }
  }

  // コート外に大きく外れた場合の保険(高く浮いたまま外に出た時など)
  if (ball.x < COURT_LEFT - 220 || ball.x > COURT_RIGHT + 220 || ball.y < COURT_TOP - 260 || ball.y > COURT_BOTTOM + 260) {
    const receiver = lastHitter === 'player' ? 'cpu' : 'player';
    endRally(receiver, '大きくアウト！');
    return;
  }
}

function endRally(winnerSide, text) {
  state = 'point_over';
  if (text) messageEl.textContent = text;
  setTimeout(() => {
    awardPoint(winnerSide);
  }, 550);
}

/* ---------------- 描画 ---------------- */
function drawCourt() {
  // 芝生の質感(縞模様)
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)';
    ctx.fillRect(0, i * (H / 14), W, H / 14);
  }

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  // 外枠(サイドライン・ベースライン)
  ctx.strokeRect(COURT_LEFT, COURT_TOP, COURT_RIGHT - COURT_LEFT, COURT_BOTTOM - COURT_TOP);
  // シングルスの内側ライン風(装飾)
  ctx.strokeRect(COURT_LEFT + 25, COURT_TOP, COURT_RIGHT - COURT_LEFT - 50, COURT_BOTTOM - COURT_TOP);
  // サービスライン
  ctx.beginPath();
  ctx.moveTo(COURT_LEFT + 25, SERVICE_LINE_TOP); ctx.lineTo(COURT_RIGHT - 25, SERVICE_LINE_TOP);
  ctx.moveTo(COURT_LEFT + 25, SERVICE_LINE_BOTTOM); ctx.lineTo(COURT_RIGHT - 25, SERVICE_LINE_BOTTOM);
  ctx.stroke();
  // センターサービスライン
  ctx.beginPath();
  ctx.moveTo(W / 2, SERVICE_LINE_TOP); ctx.lineTo(W / 2, SERVICE_LINE_BOTTOM);
  ctx.stroke();

  // ネット
  ctx.strokeStyle = '#eeeeee';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(COURT_LEFT - 15, NET_Y);
  ctx.lineTo(COURT_RIGHT + 15, NET_Y);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  for (let x = COURT_LEFT - 15; x <= COURT_RIGHT + 15; x += 10) {
    ctx.beginPath(); ctx.moveTo(x, NET_Y - 8); ctx.lineTo(x, NET_Y + 8); ctx.stroke();
  }
}

function drawRacket(entity) {
  ctx.save();
  ctx.translate(entity.x, entity.y);
  // シャドウ
  ctx.beginPath();
  ctx.ellipse(0, 30, 26, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  // 体
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fillStyle = entity.color;
  ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  // ラケット枠
  ctx.beginPath();
  ctx.ellipse(0, entity.side === 'player' ? 22 : -22, 14, 20, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawBall() {
  // 軌跡
  ball.trail.forEach((t, i) => {
    const alpha = (i / ball.trail.length) * 0.4;
    ctx.beginPath();
    ctx.arc(t.x, t.y - t.h * 0.6, 5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,100,${alpha})`;
    ctx.fill();
  });

  // 影(高さに応じて薄く・小さく)
  const shadowScale = Math.max(0.3, 1 - ball.h / 220);
  ctx.beginPath();
  ctx.ellipse(ball.x, ball.y, 10 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  // ボール本体
  const drawY = ball.y - ball.h * 0.6;
  ctx.beginPath();
  ctx.arc(ball.x, drawY, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#e8ff3c';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life / 30);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function updateParticles() {
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.15;
    p.life--;
  });
  particles = particles.filter(p => p.life > 0);
}

/* チャージ中のスイングインジケーター */
function drawChargeIndicator() {
  if (charging && state === 'rally') {
    ctx.beginPath();
    ctx.arc(player.x, player.y, HIT_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,170,0,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function draw() {
  ctx.save();
  if (shakeTime > 0) {
    const dx = (Math.random() - 0.5) * shakeMag;
    const dy = (Math.random() - 0.5) * shakeMag;
    ctx.translate(dx, dy);
    shakeTime--;
  }
  ctx.clearRect(-20, -20, W + 40, H + 40);
  drawCourt();
  drawChargeIndicator();
  drawRacket(cpu);
  drawRacket(player);
  drawBall();
  drawParticles();
  ctx.restore();
}

/* ---------------- メインループ ---------------- */
function loop() {
  if (!running) return;
  updatePlayerPosition();
  updateCpuPosition();
  updateBall();
  checkHit(player);
  checkHit(cpu);
  updateParticles();
  updateScoreboard();
  draw();
  animId = requestAnimationFrame(loop);
}

/* ---------------- スタート/リスタート ---------------- */
function startGame() {
  if (running) return;
  ensureAudio();
  running = true;
  messageEl.textContent = '';
  prepareServe();
  loop();
}

function restartGame() {
  match.point.player = 0; match.point.cpu = 0;
  match.games.player = 0; match.games.cpu = 0;
  match.server = 'player';
  rally = 0; difficulty = 0;
  particles = [];
  updateScoreboard();
  running = true;
  cancelAnimationFrame(animId);
  prepareServe();
  loop();
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', restartGame);

/* ---------------- 初期描画 ---------------- */
updateScoreboard();
draw();
messageEl.textContent = '「試合開始」ボタンを押してスタート！';
