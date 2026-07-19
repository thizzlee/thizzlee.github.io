// ============================================================
// Petualangan Kota Angka — Game Edukasi Matematika untuk anak SD
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas(){
  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(window.devicePixelRatio,0,0,window.devicePixelRatio,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---------- Utility ----------
function randInt(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }
function choice(arr){ return arr[randInt(0, arr.length - 1)]; }
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Simple beep feedback using WebAudio (no external asset needed)
let audioCtx = null;
function beep(freq, duration, type='sine'){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }catch(e){ /* audio not critical */ }
}
function sfxCorrect(){ beep(660,0.12); setTimeout(()=>beep(880,0.15),100); }
function sfxWrong(){ beep(180,0.25,'sawtooth'); }
function sfxHit(){ beep(120,0.2,'square'); }
function sfxCombo(){ beep(990,0.1); setTimeout(()=>beep(1180,0.12),90); }

// ---------- Game state ----------
const STATE = { START:'start', RUNNING:'running', QUESTION:'question', GAMEOVER:'gameover' };
let state = STATE.START;

let score = 0;
let distance = 0;
let lives = 3;
let correctCount = 0;
let combo = 0;
let selectedGender = 'boy';

let playerLane = 1; // 0,1,2
const LANES = 3;
let laneX = [0,0,0];
let roadLeft = 0, roadWidth = 0;
let playerY = 0;
let roadScroll = 0;

let speed = 220;
const baseSpeed = 220;

let obstacles = [];
let particles = [];

let spawnDodgeTimer = 0;
let spawnGateTimer = 2.0;
let lastFrameTime = null;

let currentGateObstacle = null;
let questionAttempts = 0;

// ---------- Layout ----------
function computeLayout(){
  const w = window.innerWidth, h = window.innerHeight;
  roadWidth = Math.min(w * 0.62, 520);
  roadLeft = (w - roadWidth) / 2;
  const laneW = roadWidth / LANES;
  for(let i=0;i<LANES;i++){
    laneX[i] = roadLeft + laneW * (i + 0.5);
  }
  playerY = h - Math.max(120, h*0.18);
}
computeLayout();
window.addEventListener('resize', computeLayout);

// ============================================================
// CHARACTER — 2D animated runner (boy / girl)
// ============================================================
const GENDER_STYLES = {
  boy: {
    skin:'#FFD9B0', hair:'#2B2740', hairStyle:'short',
    shirt:'#4C9BE0', shirtAccent:'#2E77C2',
    pants:'#2B2740', shoes:'#FFD23F'
  },
  girl: {
    skin:'#FFD9B0', hair:'#7A3E9D', hairStyle:'ponytail',
    shirt:'#FF6FA5', shirtAccent:'#E14F87',
    pants:'#6A4C93', shoes:'#FFD23F'
  }
};

function roundRect(tctx,x,y,w,h,r){
  tctx.beginPath();
  tctx.moveTo(x+r,y);
  tctx.arcTo(x+w,y,x+w,y+h,r);
  tctx.arcTo(x+w,y+h,x,y+h,r);
  tctx.arcTo(x,y+h,x,y,r);
  tctx.arcTo(x,y,x+w,y,r);
  tctx.closePath();
}

// draws one limb (arm or leg) swinging around a pivot point
function drawLimb(tctx, pivotX, pivotY, angle, length, width, colorMain, colorTip, isArm){
  tctx.save();
  tctx.translate(pivotX, pivotY);
  tctx.rotate(angle);
  tctx.fillStyle = colorMain;
  roundRect(tctx, -width/2, 0, width, length*0.62, width/2);
  tctx.fill();
  tctx.fillStyle = colorTip;
  if(isArm){
    tctx.beginPath();
    tctx.arc(0, length*0.62, width/2*0.95, 0, Math.PI*2);
    tctx.fill();
  } else {
    roundRect(tctx, -width/2-2, length*0.55, width+4, length*0.4, 4);
    tctx.fill();
  }
  tctx.restore();
}

function drawHair(tctx, g){
  tctx.fillStyle = g.hair;
  if(g.hairStyle === 'short'){
    tctx.beginPath();
    tctx.arc(0,-82,13.5, Math.PI*1.02, Math.PI*1.98);
    tctx.fill();
  } else {
    tctx.beginPath();
    tctx.arc(0,-82,13.5, Math.PI*0.98, Math.PI*2.02);
    tctx.fill();
    // swinging ponytail
    tctx.save();
    tctx.translate(9,-76);
    tctx.rotate(0.5);
    tctx.beginPath();
    tctx.ellipse(0,0,5,13,0,0,Math.PI*2);
    tctx.fill();
    tctx.restore();
  }
}

/**
 * Draws the 2D running character.
 * @param {CanvasRenderingContext2D} tctx target context
 * @param {number} cx  x position of the character (feet center)
 * @param {number} groundY y position of the ground/feet contact point
 * @param {string} gender 'boy' | 'girl'
 * @param {number} phase running cycle phase (radians, increases over time)
 * @param {number} scale size multiplier
 */
function drawCharacter(tctx, cx, groundY, gender, phase, scale){
  const g = GENDER_STYLES[gender] || GENDER_STYLES.boy;
  const bob = Math.abs(Math.sin(phase)) * 4; // little up-down bounce while running

  tctx.save();
  tctx.translate(cx, groundY - bob);
  tctx.scale(scale, scale);

  const legSwing = Math.sin(phase) * 0.7;
  const armSwing = Math.sin(phase + Math.PI) * 0.55;

  // ground shadow
  tctx.fillStyle = 'rgba(0,0,0,0.18)';
  tctx.beginPath();
  tctx.ellipse(0, 4 + bob*0.4, 20, 6, 0, 0, Math.PI*2);
  tctx.fill();

  // back leg & arm (further from viewer, drawn first)
  drawLimb(tctx, 0, -30, legSwing + Math.PI, 26, 9, g.pants, g.shoes, false);
  drawLimb(tctx, 0, -54, armSwing + Math.PI, 20, 6.5, g.shirtAccent, g.skin, true);

  // torso
  tctx.fillStyle = g.shirt;
  roundRect(tctx, -13, -66, 26, 34, 9);
  tctx.fill();
  tctx.fillStyle = g.shirtAccent;
  roundRect(tctx, -13, -40, 26, 7, 3.5);
  tctx.fill();

  // front leg & arm
  drawLimb(tctx, 0, -30, legSwing, 26, 9, g.pants, g.shoes, false);
  drawLimb(tctx, 0, -54, armSwing, 20, 6.5, g.shirtAccent, g.skin, true);

  // head
  tctx.fillStyle = g.skin;
  tctx.beginPath();
  tctx.arc(0, -78, 13, 0, Math.PI*2);
  tctx.fill();

  drawHair(tctx, g);

  // face: eyes
  tctx.fillStyle = '#2B2740';
  tctx.beginPath();
  tctx.arc(-4.5,-79,1.5,0,Math.PI*2);
  tctx.arc(4.5,-79,1.5,0,Math.PI*2);
  tctx.fill();
  // smile
  tctx.strokeStyle = '#2B2740';
  tctx.lineWidth = 1.4;
  tctx.beginPath();
  tctx.arc(0,-74,4,0.15*Math.PI,0.85*Math.PI);
  tctx.stroke();
  // blush
  tctx.fillStyle = 'rgba(255,120,140,0.5)';
  tctx.beginPath();
  tctx.arc(-8.5,-75,2,0,Math.PI*2);
  tctx.arc(8.5,-75,2,0,Math.PI*2);
  tctx.fill();

  tctx.restore();
}

function initGenderPreviews(){
  const boyCanvas = document.getElementById('genderPreviewBoy');
  const girlCanvas = document.getElementById('genderPreviewGirl');
  if(boyCanvas){
    const bctx = boyCanvas.getContext('2d');
    bctx.clearRect(0,0,boyCanvas.width, boyCanvas.height);
    drawCharacter(bctx, boyCanvas.width/2, boyCanvas.height-8, 'boy', 0.9, 0.82);
  }
  if(girlCanvas){
    const gctx = girlCanvas.getContext('2d');
    gctx.clearRect(0,0,girlCanvas.width, girlCanvas.height);
    drawCharacter(gctx, girlCanvas.width/2, girlCanvas.height-8, 'girl', 0.9, 0.82);
  }
}
initGenderPreviews();

document.querySelectorAll('.gender-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.gender-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedGender = card.dataset.gender;
  });
});

function drawHudAvatar(){
  const c = document.getElementById('hudAvatar');
  if(!c) return;
  const hctx = c.getContext('2d');
  hctx.clearRect(0,0,c.width,c.height);
  const phase = (performance.now()/1000) * (5 + speed*0.012);
  drawCharacter(hctx, c.width/2, c.height-2, selectedGender, phase, 0.34);
}

// ============================================================
// LEADERBOARD (persisted locally in the browser)
// ============================================================
const LEADERBOARD_KEY = 'kotaAngkaLeaderboard';

function loadLeaderboard(){
  try{
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveLeaderboardList(list){
  try{ localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list)); }catch(e){ /* storage unavailable */ }
}
function addScoreToLeaderboard(name, finalScoreValue, lvl, correct){
  const list = loadLeaderboard();
  list.push({
    name: (name && name.trim()) ? name.trim().slice(0,14) : 'Pemain',
    score: Math.floor(finalScoreValue),
    level: lvl,
    correct: correct,
    date: new Date().toLocaleDateString('id-ID')
  });
  list.sort((a,b) => b.score - a.score);
  const trimmed = list.slice(0,10);
  saveLeaderboardList(trimmed);
  return trimmed;
}
function renderLeaderboard(containerEl, list){
  containerEl.innerHTML = '';
  if(!list || list.length === 0){
    containerEl.innerHTML = '<p style="opacity:0.6;font-size:14px;text-align:center;">Belum ada skor. Jadilah yang pertama! 🌟</p>';
    return;
  }
  list.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row' + (i===0?' top1': i===1?' top2': i===2?' top3':'');
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
    row.innerHTML =
      '<span class="lb-rank">'+medal+'</span>' +
      '<span class="lb-name">'+escapeHtml(entry.name)+'</span>' +
      '<span class="lb-score">'+entry.score+'</span>' +
      '<span class="lb-level">Lv.'+entry.level+'</span>';
    containerEl.appendChild(row);
  });
}

document.getElementById('leaderboardBtn').addEventListener('click', () => {
  renderLeaderboard(document.getElementById('leaderboardList'), loadLeaderboard());
  document.getElementById('startOverlay').classList.add('hidden');
  document.getElementById('leaderboardOverlay').classList.remove('hidden');
});
document.getElementById('closeLeaderboardBtn').addEventListener('click', () => {
  document.getElementById('leaderboardOverlay').classList.add('hidden');
  document.getElementById('startOverlay').classList.remove('hidden');
});

let scoreSaved = false;
document.getElementById('saveScoreBtn').addEventListener('click', () => {
  if(scoreSaved) return;
  const nameInput = document.getElementById('playerNameInput');
  const list = addScoreToLeaderboard(nameInput.value, score, getLevel(), correctCount);
  const goLb = document.getElementById('gameOverLeaderboard');
  goLb.classList.remove('hidden');
  renderLeaderboard(goLb, list);
  scoreSaved = true;
  const btn = document.getElementById('saveScoreBtn');
  btn.textContent = '✅ Skor Tersimpan!';
  btn.disabled = true;
});

// ---------- Question generation ----------
function getLevel(){
  return Math.min(4, 1 + Math.floor(score / 120));
}

function generateQuestion(lvl){
  let a,b,op,answer,text;
  const opsPool = {
    1: ['+','-'],
    2: ['+','-','×'],
    3: ['×','÷'],
    4: ['+','-','×','÷']
  };
  op = choice(opsPool[lvl] || ['+','-']);

  if(op === '+'){
    if(lvl===1){ a=randInt(1,10); b=randInt(1,10); }
    else if(lvl===2){ a=randInt(5,30); b=randInt(5,30); }
    else { a=randInt(10,60); b=randInt(10,40); }
    answer = a+b;
    text = `${a} + ${b} = ?`;
  } else if(op === '-'){
    if(lvl===1){ a=randInt(1,10); b=randInt(0,a); }
    else if(lvl===2){ a=randInt(10,40); b=randInt(0,a); }
    else { a=randInt(20,70); b=randInt(0,a); }
    answer = a-b;
    text = `${a} - ${b} = ?`;
  } else if(op === '×'){
    if(lvl<=2){ a=randInt(2,5); b=randInt(2,5); }
    else { a=randInt(2,10); b=randInt(2,10); }
    answer = a*b;
    text = `${a} × ${b} = ?`;
  } else {
    let divisor = randInt(2, lvl<=3?5:10);
    let quotient = randInt(2, lvl<=3?5:10);
    a = divisor*quotient; b = divisor;
    answer = quotient;
    text = `${a} ÷ ${b} = ?`;
  }

  const options = new Set([answer]);
  let guard = 0;
  while(options.size < 4 && guard < 50){
    guard++;
    let offset = choice([-3,-2,-1,1,2,3,-5,5]);
    let candidate = answer + offset;
    if(candidate < 0) candidate = answer + Math.abs(offset);
    if(candidate !== answer && candidate >= 0) options.add(candidate);
  }
  const optionsArr = Array.from(options);
  for(let i=optionsArr.length-1;i>0;i--){
    const j = randInt(0,i);
    [optionsArr[i],optionsArr[j]] = [optionsArr[j],optionsArr[i]];
  }
  return { text, answer, options: optionsArr };
}

// ---------- Obstacles ----------
function spawnDodgeObstacle(){
  const lane = randInt(0, LANES-1);
  obstacles.push({
    type:'dodge', lane, y:-60, w:56, h:56, hit:false,
    emoji: choice(['🪨','🚧','📦'])
  });
}
function spawnGateObstacle(){
  const q = generateQuestion(getLevel());
  obstacles.push({
    type:'gate', lane:-1, y:-140, w:roadWidth, h:110, hit:false,
    question: q, exploding:false, explodeT:0
  });
}

// ---------- Input ----------
function moveLane(dir){
  if(state !== STATE.RUNNING) return;
  playerLane = Math.max(0, Math.min(LANES-1, playerLane + dir));
}
window.addEventListener('keydown', (e)=>{
  if(['ArrowLeft','a','A'].includes(e.key)) moveLane(-1);
  if(['ArrowRight','d','D'].includes(e.key)) moveLane(1);
  if(state === STATE.QUESTION){
    const n = parseInt(e.key);
    if(n>=1 && n<=4){
      const btns = document.querySelectorAll('.answer-btn');
      if(btns[n-1]) btns[n-1].click();
    }
  }
});
document.getElementById('btnLeft').addEventListener('click', ()=>moveLane(-1));
document.getElementById('btnRight').addEventListener('click', ()=>moveLane(1));

let touchStartX = null;
canvas.addEventListener('touchstart', (e)=>{ touchStartX = e.touches[0].clientX; });
canvas.addEventListener('touchend', (e)=>{
  if(touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if(Math.abs(dx) > 40){ moveLane(dx > 0 ? 1 : -1); }
  touchStartX = null;
});

// ---------- Particles ----------
function burst(x,y,color,count=18){
  for(let i=0;i<count;i++){
    const ang = Math.random()*Math.PI*2;
    const spd = 60 + Math.random()*160;
    particles.push({
      x,y, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd,
      life:0.6+Math.random()*0.4, t:0, color, size: 4+Math.random()*4
    });
  }
}

// ---------- Rendering: world ----------
function drawBackground(w,h){
  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0, '#7EC8E3');
  g.addColorStop(1, '#BEE7F5');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  ctx.fillStyle = '#FFD23F';
  ctx.beginPath();
  ctx.arc(w-70, 70, 40, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  drawCloud(90 + (roadScroll*0.05)%(w+200) - 200, 90, 1);
  drawCloud(w*0.5 + (roadScroll*0.03)%(w+200) - 200, 60, 0.8);

  drawBuildings(0, roadLeft, w, h);
  drawBuildings(roadLeft+roadWidth, w, w, h);

  ctx.fillStyle = '#3A3845';
  ctx.fillRect(roadLeft, 0, roadWidth, h);

  ctx.fillStyle = '#565163';
  ctx.fillRect(roadLeft-10, 0, 10, h);
  ctx.fillRect(roadLeft+roadWidth, 0, 10, h);

  const laneW = roadWidth / LANES;
  ctx.strokeStyle = 'rgba(255,253,247,0.8)';
  ctx.lineWidth = 4;
  ctx.setLineDash([26,22]);
  for(let i=1;i<LANES;i++){
    const x = roadLeft + laneW*i;
    ctx.beginPath();
    ctx.moveTo(x, (roadScroll % 48) - 48);
    ctx.lineTo(x, h+48);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawCloud(x,y,scale){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.beginPath();
  ctx.arc(0,0,22,0,Math.PI*2);
  ctx.arc(24,-8,18,0,Math.PI*2);
  ctx.arc(28,6,20,0,Math.PI*2);
  ctx.arc(-20,8,16,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawBuildings(xStart, xEnd, w, h){
  const segW = 70;
  const count = Math.ceil((xEnd - xStart) / segW) + 1;
  const colors = ['#6A4C93','#8B6BB1','#5A3E82'];
  for(let i=0;i<count;i++){
    const bx = xStart + i*segW - (roadScroll*0.2)%segW;
    const bh = 140 + ((i*37) % 160);
    const by = h - bh - 40;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(bx, by, segW-8, bh);
    ctx.fillStyle = 'rgba(255,229,143,0.85)';
    for(let wy = by+14; wy < h-40-10; wy += 22){
      for(let wx = bx+8; wx < bx+segW-16; wx += 18){
        if((Math.floor(wx+wy) % 5) !== 0){
          ctx.fillRect(wx, wy, 8, 10);
        }
      }
    }
  }
  ctx.fillStyle = '#4C9F70';
  ctx.fillRect(xStart, h-40, xEnd-xStart, 40);
}

function drawPlayer(dt){
  const x = laneX[playerLane];
  const y = playerY + 32;
  runPhaseAccum += dt * (6 + speed*0.014);
  drawCharacter(ctx, x, y, selectedGender, runPhaseAccum, 1);
}
let runPhaseAccum = 0;

function drawObstacles(){
  for(const ob of obstacles){
    if(ob.type === 'dodge'){
      ctx.font = '48px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ob.emoji, laneX[ob.lane], ob.y);
    } else if(ob.type === 'gate'){
      drawGate(ob);
    }
  }
  for(const p of particles){
    ctx.globalAlpha = Math.max(0, 1 - p.t/p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawGate(ob){
  const x = roadLeft, y = ob.y - ob.h/2, w = ob.w, h = ob.h;
  const scale = ob.exploding ? Math.max(0, 1 - ob.explodeT/0.4) : 1;
  ctx.save();
  ctx.translate(x + w/2, y + h/2);
  ctx.scale(scale, scale);
  ctx.translate(-(x+w/2), -(y+h/2));

  ctx.fillStyle = '#8B6BB1';
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = '#3A3845';
  ctx.lineWidth = 5;
  roundRect(ctx, x, y, w, h, 16);
  ctx.stroke();

  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(x+w*0.32, y+h*0.4, 16, 0, Math.PI*2);
  ctx.arc(x+w*0.68, y+h*0.4, 16, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = '#2B2740';
  ctx.beginPath();
  ctx.arc(x+w*0.32, y+h*0.4, 7, 0, Math.PI*2);
  ctx.arc(x+w*0.68, y+h*0.4, 7, 0, Math.PI*2);
  ctx.fill();

  ctx.strokeStyle = '#2B2740';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x+w*0.5, y+h*0.62, 20, 0, Math.PI, false);
  ctx.stroke();

  ctx.restore();
}

// ---------- HUD updates ----------
let lastScoreShown = 0;
function updateHUD(){
  const scoreEl = document.getElementById('scoreDisplay');
  const flooredScore = Math.floor(score);
  scoreEl.textContent = flooredScore;
  if(flooredScore > lastScoreShown + 15){
    scoreEl.classList.add('bump');
    setTimeout(()=>scoreEl.classList.remove('bump'), 150);
  }
  lastScoreShown = flooredScore;

  document.getElementById('heartsDisplay').textContent = '❤️'.repeat(Math.max(0,lives)) + '🖤'.repeat(Math.max(0,3-lives));

  const lvl = getLevel();
  document.getElementById('levelBadge').textContent = 'Level ' + lvl;
  let pct;
  if(lvl >= 4){ pct = 100; }
  else { pct = ((score - (lvl-1)*120) / 120) * 100; }
  document.getElementById('levelProgressFill').style.width = Math.max(0,Math.min(100,pct)) + '%';

  const comboBadge = document.getElementById('comboBadge');
  if(combo >= 2){
    comboBadge.classList.remove('hidden');
    comboBadge.textContent = '🔥 Combo x' + combo;
  } else {
    comboBadge.classList.add('hidden');
  }
}

// ---------- Question flow ----------
function triggerQuestion(gateObstacle){
  state = STATE.QUESTION;
  currentGateObstacle = gateObstacle;
  questionAttempts = 0;
  showQuestionUI(gateObstacle.question);
}

function showQuestionUI(q){
  document.getElementById('questionOverlay').classList.remove('hidden');
  document.getElementById('questionText').textContent = q.text;
  document.getElementById('feedbackText').textContent = '';
  const grid = document.getElementById('answersGrid');
  grid.innerHTML = '';
  q.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = opt;
    btn.addEventListener('click', () => onAnswer(opt, q.answer, btn));
    grid.appendChild(btn);
  });
}

function onAnswer(selected, correctAnswer, btnEl){
  const allBtns = document.querySelectorAll('.answer-btn');
  allBtns.forEach(b => b.disabled = true);

  if(selected === correctAnswer){
    btnEl.classList.add('correct');
    document.getElementById('feedbackText').textContent = 'Hebat! Jawaban benar! 🎉';
    document.getElementById('feedbackText').style.color = '#06D6A0';
    combo++;
    if(combo >= 2) sfxCombo(); else sfxCorrect();
    correctCount++;
    score += 20 + (combo-1)*5;
    updateHUD();
    resolveGate(true);
  } else {
    btnEl.classList.add('wrong');
    questionAttempts++;
    sfxWrong();
    if(questionAttempts < 2){
      document.getElementById('feedbackText').textContent = 'Belum tepat, coba lagi! 💪';
      document.getElementById('feedbackText').style.color = '#EF476F';
      setTimeout(() => {
        allBtns.forEach(b => { b.disabled=false; b.classList.remove('wrong'); });
      }, 600);
    } else {
      document.getElementById('feedbackText').textContent = `Jawaban yang benar: ${correctAnswer}`;
      document.getElementById('feedbackText').style.color = '#EF476F';
      lives--;
      combo = 0;
      updateHUD();
      setTimeout(() => { resolveGate(false); }, 900);
    }
  }
}

function resolveGate(success){
  setTimeout(() => {
    document.getElementById('questionOverlay').classList.add('hidden');
    if(currentGateObstacle){
      currentGateObstacle.exploding = true;
      currentGateObstacle.explodeT = 0;
      const cx = roadLeft + roadWidth/2;
      const cy = currentGateObstacle.y;
      burst(cx, cy, success ? '#06D6A0' : '#EF476F', 24);
    }
    currentGateObstacle = null;
    if(lives <= 0){
      triggerGameOver();
    } else {
      state = STATE.RUNNING;
    }
  }, success ? 250 : 100);
}

function triggerGameOver(){
  state = STATE.GAMEOVER;
  document.getElementById('finalScore').textContent = Math.floor(score);
  document.getElementById('finalLevel').textContent = getLevel();
  document.getElementById('finalCorrect').textContent = correctCount;
  document.getElementById('gameOverEmoji').textContent = getLevel() >= 3 ? '🏆' : '🏁';
  document.getElementById('gameOverOverlay').classList.remove('hidden');
  document.getElementById('gameOverLeaderboard').classList.add('hidden');
  document.getElementById('playerNameInput').value = '';
  scoreSaved = false;
  const btn = document.getElementById('saveScoreBtn');
  btn.textContent = '💾 Simpan ke Papan Peringkat';
  btn.disabled = false;
}

// ---------- Game loop ----------
function update(dt){
  if(state !== STATE.RUNNING) return;

  distance += speed * dt;
  score += dt * 6;
  speed = baseSpeed + Math.min(180, distance * 0.03);
  roadScroll += speed * dt;

  spawnDodgeTimer -= dt;
  spawnGateTimer -= dt;

  if(spawnDodgeTimer <= 0){
    spawnDodgeObstacle();
    spawnDodgeTimer = Math.max(0.9, 1.8 - getLevel()*0.15) + Math.random()*0.6;
  }
  if(spawnGateTimer <= 0){
    spawnGateObstacle();
    spawnGateTimer = 9 + Math.random()*3;
  }

  for(const ob of obstacles){
    if(ob.exploding){
      ob.explodeT += dt;
      continue;
    }
    ob.y += speed * dt;

    if(ob.type === 'dodge' && !ob.hit){
      if(ob.y > playerY - 30 && ob.y < playerY + 30 && ob.lane === playerLane){
        ob.hit = true;
        lives--;
        combo = 0;
        sfxHit();
        burst(laneX[ob.lane], playerY, '#EF476F', 14);
        updateHUD();
        if(lives <= 0){ triggerGameOver(); }
      }
    } else if(ob.type === 'gate' && !ob.hit){
      if(ob.y + ob.h/2 >= playerY - 10){
        ob.hit = true;
        triggerQuestion(ob);
      }
    }
  }

  obstacles = obstacles.filter(ob => {
    if(ob.exploding) return ob.explodeT < 0.45;
    return ob.y < window.innerHeight + 150;
  });

  for(const p of particles){
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220*dt;
  }
  particles = particles.filter(p => p.t < p.life);

  updateHUD();
}

function render(dt){
  const w = window.innerWidth, h = window.innerHeight;
  drawBackground(w,h);
  drawObstacles();
  drawPlayer(state === STATE.RUNNING ? dt : dt*0.4);
  drawHudAvatar();
}

function loop(timestamp){
  if(lastFrameTime === null) lastFrameTime = timestamp;
  const dt = Math.min(0.05, (timestamp - lastFrameTime) / 1000);
  lastFrameTime = timestamp;

  update(dt);
  render(dt);

  requestAnimationFrame(loop);
}

// ---------- Start / Restart ----------
function resetGame(){
  score = 0; distance = 0; lives = 3; correctCount = 0; combo = 0;
  playerLane = 1;
  obstacles = []; particles = [];
  spawnDodgeTimer = 1.2; spawnGateTimer = 4;
  speed = baseSpeed;
  roadScroll = 0;
  lastScoreShown = 0;
  updateHUD();
}

document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('startOverlay').classList.add('hidden');
  resetGame();
  state = STATE.RUNNING;
});

document.getElementById('restartBtn').addEventListener('click', () => {
  document.getElementById('gameOverOverlay').classList.add('hidden');
  resetGame();
  state = STATE.RUNNING;
});

updateHUD();
requestAnimationFrame(loop);
