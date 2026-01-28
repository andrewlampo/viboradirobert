(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const toast = document.getElementById('toast');

  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const fireBtn = document.getElementById('fireBtn');

  const ASSETS = {
    court: 'assets/court.png',
    player: 'assets/player.png',
    ball: 'assets/tennisball.png',
    enemies: ['assets/enemy1.png','assets/enemy2.png','assets/enemy3.png','assets/enemy4.png','assets/enemy5.png']
  };

  function resize() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const imgs = {};
  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  let running = false;
  let score = 0;
  let best = Number(localStorage.getItem('vibora_best') || '0');
  bestEl.textContent = best;

  const world = {
    w: () => window.innerWidth,
    h: () => window.innerHeight,
    controlsH: 130, // approximate controls height
  };

  const player = {
    x: 0,
    y: 0,
    w: 72,
    h: 72,
    speed: 420, // px/s
  };

  const bullets = [];
  const enemies = [];

  // Difficulty
  let spawnEvery = 900; // ms
  let enemyBaseSpeed = 170; // px/s
  let difficultyTimer = 0;

  function reset() {
    score = 0;
    scoreEl.textContent = score;
    bullets.length = 0;
    enemies.length = 0;
    spawnEvery = 900;
    enemyBaseSpeed = 170;
    difficultyTimer = 0;

    player.w = Math.max(64, Math.min(86, world.w() * 0.12));
    player.h = player.w;
    player.x = (world.w() - player.w) / 2;
    player.y = world.h() - player.h - (world.controlsH - 26);
  }

  function showToast() {
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 900);
  }

  // Input (touch + mouse)
  const input = { left:false, right:false };

  function bindHold(btn, key) {
    const down = (e) => { e.preventDefault(); input[key] = true; };
    const up = (e) => { e.preventDefault(); input[key] = false; };
    btn.addEventListener('touchstart', down, {passive:false});
    btn.addEventListener('touchend', up, {passive:false});
    btn.addEventListener('touchcancel', up, {passive:false});
    btn.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    btn.addEventListener('mouseleave', up);
  }
  bindHold(leftBtn, 'left');
  bindHold(rightBtn, 'right');

  let canFire = true;
  const maxBullets = 2;
  function fire() {
    if (!running) return;
    if (!canFire) return;
    if (bullets.length >= maxBullets) return;

    const bw = 18, bh = 18;
    bullets.push({
      x: player.x + player.w/2 - bw/2,
      y: player.y - bh,
      w: bw, h: bh,
      v: 760
    });

    canFire = false;
    setTimeout(() => canFire = true, 120);
  }
  fireBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); fire(); }, {passive:false});
  fireBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); fire(); });

  // Start overlay
  function start() {
    if (running) return;
    running = true;
    overlay.classList.add('hidden');
    reset();
    last = performance.now();
    requestAnimationFrame(loop);
  }
  startBtn.addEventListener('click', start);
  overlay.addEventListener('click', start);

  function rand(min, max){ return Math.random()*(max-min)+min; }
  function choose(arr){ return arr[(Math.random()*arr.length)|0]; }

  let spawnAcc = 0;

  function spawnEnemy() {
    const ew = Math.max(58, Math.min(84, world.w()*0.11));
    const eh = ew;
    const x = rand(14, world.w()-ew-14);
    const y = -eh - 10;
    enemies.push({
      x,y,w:ew,h:eh,
      v: enemyBaseSpeed * rand(0.92, 1.12),
      img: choose(imgs.enemies)
    });
  }

  function aabb(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function clampScore() {
    if (score < 0) score = 0;
  }

  function update(dt) {
    // Difficulty ramp (both faster spawn and faster enemies)
    difficultyTimer += dt;
    if (difficultyTimer >= 4.0) { // every 4 seconds
      difficultyTimer = 0;
      spawnEvery = Math.max(340, spawnEvery - 35);
      enemyBaseSpeed = Math.min(520, enemyBaseSpeed + 18);
    }

    // Move player
    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    player.x += dir * player.speed * dt;
    player.x = Math.max(8, Math.min(world.w() - player.w - 8, player.x));

    // Spawn
    spawnAcc += dt * 1000;
    if (spawnAcc >= spawnEvery) {
      spawnAcc = 0;
      spawnEnemy();
    }

    // Bullets
    for (let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.y -= b.v * dt;
      if (b.y + b.h < -30) bullets.splice(i,1);
    }

    // Enemies + scoring when escaped
    for (let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      e.y += e.v * dt;

      // escaped
      if (e.y > world.h() + 20) {
        enemies.splice(i,1);
        score -= 3;
        clampScore();
        scoreEl.textContent = score;
        continue;
      }
    }

    // Collisions (bullets vs enemies)
    for (let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      for (let j=bullets.length-1;j>=0;j--){
        const b = bullets[j];
        if (aabb(e,b)) {
          enemies.splice(i,1);
          bullets.splice(j,1);
          score += 10;
          scoreEl.textContent = score;

          if (score > best) {
            best = score;
            localStorage.setItem('vibora_best', String(best));
            bestEl.textContent = best;
            showToast();
          }
          break;
        }
      }
    }
  }

  function draw() {
    const w = world.w(), h = world.h();

    // background (cover)
    const bg = imgs.court;
    if (bg) {
      const scale = Math.max(w / bg.width, h / bg.height);
      const bw = bg.width * scale;
      const bh = bg.height * scale;
      const bx = (w - bw)/2;
      const by = (h - bh)/2;
      ctx.drawImage(bg, bx, by, bw, bh);
    } else {
      ctx.fillStyle = '#0d5fc7';
      ctx.fillRect(0,0,w,h);
    }

    // Enemies
    for (const e of enemies) ctx.drawImage(e.img, e.x, e.y, e.w, e.h);

    // Player
    ctx.drawImage(imgs.player, player.x, player.y, player.w, player.h);

    // Bullets
    for (const b of bullets) ctx.drawImage(imgs.ball, b.x, b.y, b.w, b.h);
  }

  let last = performance.now();
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Prevent iOS scroll/bounce while playing
  document.addEventListener('touchmove', (e) => e.preventDefault(), {passive:false});

  // Load assets then show start overlay
  (async () => {
    imgs.court = await loadImage(ASSETS.court);
    imgs.player = await loadImage(ASSETS.player);
    imgs.ball = await loadImage(ASSETS.ball);
    imgs.enemies = [];
    for (const src of ASSETS.enemies) imgs.enemies.push(await loadImage(src));
    overlay.classList.remove('hidden');
  })().catch(err => {
    console.error(err);
    alert('Errore nel caricamento assets. Controlla la cartella assets/');
  });
})();
