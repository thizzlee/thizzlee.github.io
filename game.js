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

// ---------- Game state ----------
const STATE = { START:'start', RUNNING:'running', QUESTION:'question', GAMEOVER:'gameover' };
let state = STATE.START;

let score = 0;
let distance = 0;
let lives = 3;
let correctCount = 0;
let level = 1;
let speed = 220; // px per second, road scroll speed
const baseSpeed = 220;

let playerLane = 1; // 0,1,2
const LANES = 3;
let laneX = [0,0,0];
let roadLeft = 0, roadWidth = 0;
let playerY = 0;
let roadScroll = 0;

let obstacles = []; // {type:'dodge'|'gate', lane, y, w,h, hit:false, question, exploding, explodeT}
let particles = [];

let spawnDodgeTimer = 0;
let spawnGateTimer = 2.0; // first gate appears after a short warmup
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
  } else { // division - construct so it divides evenly
    let divisor = randInt(2, lvl<=3?5:10);
    let quotient = randInt(2, lvl<=3?5:10);
    a = divisor*quotient; b = divisor;
    answer = quotient;
    text = `${a} ÷ ${b} = ?`;
  }

  // build 4 unique multiple-choice options
  const options = new Set([answer]);
  let guard = 0;
  while(options.size < 4 && guard < 50){
    guard++;
    let offset = choice([-3,-2,-1,1,2,3, -5, 5]);
    let candidate = answer + offset;
    if(candidate < 0) candidate = answer + Math.abs(offset);
    if(candidate !== answer && candidate >= 0) options.add(candidate);
  }
  const optionsArr = Array.from(options);
  // shuffle
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

// swipe support
let touchStartX = null;
canvas.addEventListener('touchstart', (e)=>{ touchStartX = e.touches[0].clientX; });
canvas.addEventListener('touchend', (e)=>{
  if(touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if(Math.abs(dx) > 40){ moveLane(dx > 0 ? 1 : -1); }
  touchStartX = null;
});

// ---------- Particles (celebration burst) ----------
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

// ---------- Rendering ----------
function drawBackground(w,h){
  // sky gradient
  const g = ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0, '#7EC8E3');
  g.addColorStop(1, '#BEE7F5');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);

  // sun
  ctx.fillStyle = '#FFD23F';
  ctx.beginPath();
  ctx.arc(w-70, 70, 40, 0, Math.PI*2);
  ctx.fill();

  // clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  drawCloud(90 + (roadScroll*0.05)%(w+200) - 200, 90, 1);
  drawCloud(w*0.5 + (roadScroll*0.03)%(w+200) - 200, 60, 0.8);

  // buildings backdrop (both sides)
  drawBuildings(0, roadLeft, w, h);
  drawBuildings(roadLeft+roadWidth, w, w, h);

  // road
  ctx.fillStyle = '#3A3845';
  ctx.fillRect(roadLeft, 0, roadWidth, h);

  // sidewalks edges
  ctx.fillStyle = '#565163';
  ctx.fillRect(roadLeft-10, 0, 10, h);
  ctx.fillRect(roadLeft+roadWidth, 0, 10, h);

  // lane lines
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
    // windows
    ctx.fillStyle = 'rgba(255,229,143,0.85)';
    for(let wy = by+14; wy < h-40-10; wy += 22){
      for(let wx = bx+8; wx < bx+segW-16; wx += 18){
        if((Math.floor(wx+wy) % 5) !== 0){
          ctx.fillRect(wx, wy, 8, 10);
        }
      }
    }
  }
  // ground strip
  ctx.fillStyle = '#4C9F70';
  ctx.fillRect(xStart, h-40, xEnd-xStart, 40);
}

function drawPlayer(){
  const x = laneX[playerLane];
  const y = playerY;
  const bob = Math.sin(performance.now()/110) * 5;
  ctx.font = '58px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏃', x, y + bob);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y+34, 24, 8, 0, 0, Math.PI*2);
  ctx.fill();
}

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
  // particles
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

  // eyes
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

  // mouth
  ctx.strokeStyle = '#2B2740';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x+w*0.5, y+h*0.62, 20, 0, Math.PI, false);
  ctx.stroke();

  ctx.restore();
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// ---------- UI updates ----------
function updateHUD(){
  document.getElementById('scoreDisplay').textContent = Math.floor(score);
  document.getElementById('heartsDisplay').textContent = '❤️'.repeat(Math.max(0,lives)) + '🖤'.repeat(Math.max(0,3-lives));
  document.getElementById('levelBadge').textContent = 'Level ' + getLevel();
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
    sfxCorrect();
    correctCount++;
    score += 20;
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
  document.getElementById('gameOverOverlay').classList.remove('hidden');
}

// ---------- Game loop ----------
function update(dt){
  if(state !== STATE.RUNNING) return;

  distance += speed * dt;
  score += dt * 6; // passive score for distance traveled
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

  // cleanup off-screen / exploded obstacles
  obstacles = obstacles.filter(ob => {
    if(ob.exploding) return ob.explodeT < 0.45;
    return ob.y < window.innerHeight + 150;
  });

  // update particles
  for(const p of particles){
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220*dt;
  }
  particles = particles.filter(p => p.t < p.life);

  updateHUD();
}

function render(){
  const w = window.innerWidth, h = window.innerHeight;
  drawBackground(w,h);
  drawObstacles();
  drawPlayer();
}

function loop(timestamp){
  if(lastFrameTime === null) lastFrameTime = timestamp;
  const dt = Math.min(0.05, (timestamp - lastFrameTime) / 1000);
  lastFrameTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

// ---------- Start / Restart ----------
function resetGame(){
  score = 0; distance = 0; lives = 3; correctCount = 0;
  playerLane = 1;
  obstacles = []; particles = [];
  spawnDodgeTimer = 1.2; spawnGateTimer = 4;
  speed = baseSpeed;
  roadScroll = 0;
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
