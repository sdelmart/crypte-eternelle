'use strict';
const MAX_FLOOR = 5;
const BOSS_BY_FLOOR = ['kingslime', 'eye', 'golem', null, 'lich'];
const MENU_STATES = ['menu', 'meta', 'codex', 'select'];

function loadMeta() {
  const m = Store.get('crypte_meta', null) || {};
  m.souls = m.souls || 0;
  m.up = m.up || {};
  m.seen = m.seen || [];
  m.unlocked = m.unlocked || ['mage'];
  m.char = m.char || 'mage';
  m.stats = Object.assign({ runs: 0, kills: 0, wins: 0, bosses: 0, deaths: 0, time: 0, bestFloor: 0, fastWin: 0 }, m.stats || {});
  m.stats.bestFloor = Math.max(m.stats.bestFloor, Store.get('crypte_best', 0));
  return m;
}

const Game = {
  state: 'menu', prevState: 'menu', stateT: 0, t: 0, buttons: [], focus: 0, fade: 0,
  particles: [], texts: [], bullets: [], enemies: [], hazards: [], bombs: [], delayed: [],
  shakeAmt: 0, flash: 0, toast: null, banner: null, trans: null, fieldT: 0,
  hitstop: 0, slowT: 0, dying: 0, hbT: 0, inRun: false, confirmQuit: false, bigMap: false,
  menuEmbers: [], settingsReturn: 'menu',

  init() {
    this.meta = loadMeta();
    this.field = new Int16Array(COLS * ROWS);
    for (let i = 0; i < 70; i++) this.menuEmbers.push({ x: rand(0, W), y: rand(0, H), s: rand(1, 3), v: rand(10, 40) });
    this.setState('menu');
  },
  saveMeta() { Store.set('crypte_meta', this.meta); },
  onResize() { if (this.dungeon) for (const r of this.dungeon.rooms.values()) r.dirty = true; },

  setState(s) {
    if (s !== 'paused' && s !== 'settings') this.confirmQuit = false;
    this.prevState = this.state; this.state = s; this.stateT = 0; this.focus = 0;
    this.fade = s === 'paused' || this.prevState === 'paused' || s === 'settings' || this.prevState === 'settings' ? 0 : 0.35;
    if (s === 'select') this.focus = Math.max(0, CHARACTERS.findIndex(c => c.id === this.meta.char));
    this.updateMusic();
  },
  updateMusic() {
    const s = this.state;
    if (s === 'dead' || s === 'victory' || this.dying > 0) Music.play(null);
    else if (!this.inRun) Music.play('menu');
    else Music.play(this.room && this.room.type === 'boss' && this.room.locked ? 'boss' : 'f' + (((this.floor - 1) % 5) + 1));
    Music.duck(s === 'paused' || (s === 'settings' && this.inRun));
  },
  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { /* non supporté */ }
  },
  later(t, fn) { this.delayed.push({ t, fn }); },

  // ---------------- PARTIE ----------------
  newRun(charId) {
    const ch = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
    this.meta.char = ch.id;
    const up = this.meta.up, p = (this.player = new Player(ch));
    p.maxHp += (up.hp || 0) * 2; p.hp = p.maxHp;
    p.dmg += (up.dmg || 0) * 0.5;
    p.coins = (up.coins || 0) * 5;
    p.dashCooldown *= Math.pow(0.85, up.dash || 0);
    this.pool = shuffle(ITEMS.map(i => i.id));
    this.floor = 1;
    this.stats = { kills: 0, bosses: 0, time: 0, secrets: 0 };
    Object.assign(this, { victoryT: 0, toast: null, dying: 0, slowT: 0, hitstop: 0, delayed: [], bombs: [], inRun: true, bigMap: false, bossRef: null });
    this.meta.stats.runs++;
    this.saveMeta();
    if (up.start) this.giveItem(this.pool.pop());
    this.loadFloor();
    this.setState('playing');
  },
  loadFloor() {
    this.dungeon = generateFloor(this.floor);
    this.theme = this.dungeon.theme;
    this.enterRoom(this.dungeon.start, null);
    this.banner = { title: `Étage ${this.floor}`, sub: this.theme.name, t: 2.6 };
  },
  neighbor(room, dir) {
    const D = DOORS[dir];
    return this.dungeon.rooms.get((room.gx + D.dx) + ',' + (room.gy + D.dy));
  },
  enterRoom(room, dir) {
    this.room = room; room.visited = true;
    this.bullets.length = 0; this.enemies.length = 0; this.hazards.length = 0; this.texts.length = 0; this.bombs.length = 0;
    this.particles = this.particles.filter(p => !p.ghost);
    const p = this.player;
    if (dir) {
      const D = DOORS[OPP[dir]];
      p.x = (D.tx + 0.5) * TILE - D.dx * TILE * 0.95;
      p.y = (D.ty + 0.5) * TILE - D.dy * TILE * 0.95;
    } else { p.x = RW / 2; p.y = RH / 2 + 60; }
    p.vx = p.vy = 0; p.dashTime = 0;
    if (!room.spawned) { room.spawned = true; this.populate(room); }
    room.locked = this.enemies.length > 0;
    if (room.type === 'secret' && !room.announced) {
      room.announced = true;
      this.stats.secrets++;
      this.toast = { icon: '🗝️', title: 'Salle secrète !', desc: 'Tu as trouvé un passage caché.', t: 2.6 };
    }
    this.computeField();
    this.updateMusic();
  },
  populate(room) {
    const f = this.floor;
    if (room.type === 'normal') {
      const n = Math.min(10, randi(3, 5) + Math.floor(f * 0.8));
      const pool = ENEMY_POOLS[Math.min(f, ENEMY_POOLS.length) - 1];
      let elites = 0;
      for (let i = 0; i < n; i++) {
        const pos = this.freeSpot(230);
        if (!pos) continue;
        const elite = elites < 1 && Math.random() < 0.05 + 0.03 * f;
        if (elite) elites++;
        this.enemies.push(new Enemy(choice(pool), pos.x, pos.y, f, false, elite));
      }
    } else if (room.type === 'treasure') {
      room.pickups.push(this.itemPickup(RW / 2, RH / 2));
    } else if (room.type === 'shop') {
      const price = 12 + f * 3;
      const a = this.itemPickup(RW / 2 - 210, RH / 2 + 20), b = this.itemPickup(RW / 2 - 70, RH / 2 + 20);
      for (const it of [a, b]) if (it.type === 'item') { it.type = 'shop'; it.price = price; }
      room.pickups.push(a, b,
        { type: 'shop', id: 'heart', price: 5, x: RW / 2 + 70, y: RH / 2 + 20 },
        { type: 'shop', id: 'bomb', price: 4, x: RW / 2 + 210, y: RH / 2 + 20 });
    } else if (room.type === 'secret') {
      if (Math.random() < 0.55 && this.pool.length) room.pickups.push(this.itemPickup(RW / 2, RH / 2));
      else {
        for (let i = randi(6, 9); i > 0; i--) room.pickups.push({ type: 'coin', x: RW / 2 + rand(-90, 90), y: RH / 2 + rand(-50, 50) });
        room.pickups.push({ type: 'bomb', x: RW / 2 - 60, y: RH / 2 + 80 }, { type: 'heart', x: RW / 2 + 60, y: RH / 2 + 80 });
      }
    } else if (room.type === 'boss') {
      const type = BOSS_BY_FLOOR[f - 1] || choice(['kingslime', 'eye', 'golem']);
      const boss = new Enemy(type, RW / 2, RH / 2 - 90, f, true);
      this.enemies.push(boss);
      this.bossRef = boss;
      this.banner = { title: boss.def.name, sub: 'BOSS', t: 2.4, boss: true };
      Sfx.play('boss');
    }
  },
  itemPickup(x, y) {
    const id = this.pool.pop();
    return id ? { type: 'item', id, x, y } : { type: 'heart', x, y };
  },
  freeSpot(minD) {
    for (let i = 0; i < 80; i++) {
      const tx = randi(1, COLS - 2), ty = randi(1, ROWS - 2);
      if (this.room.tiles[ty][tx] !== 0) continue;
      const x = (tx + 0.5) * TILE + rand(-10, 10), y = (ty + 0.5) * TILE + rand(-10, 10);
      if (Math.hypot(x - this.player.x, y - this.player.y) < minD) continue;
      return { x, y };
    }
    return null;
  },
  spawnEnemy(type, x, y, spawnT = 0.5) {
    const e = new Enemy(type, clamp(x, TILE + 16, RW - TILE - 16), clamp(y, TILE + 16, RH - TILE - 16), this.floor, false);
    e.spawnT = e.spawnMax = spawnT;
    this.enemies.push(e);
  },
  giveItem(id) {
    const it = ITEM_BY_ID[id], p = this.player;
    it.apply(p); p.items.push(id);
    const isNew = !this.meta.seen.includes(id);
    if (isNew) { this.meta.seen.push(id); this.saveMeta(); }
    this.toast = { icon: it.icon, title: it.name, desc: it.desc, t: 3.2, isNew };
    Sfx.play('item');
    this.spark(p.x, p.y, '#fde047', 26, 240, 4);
  },

  computeField() {
    const f = this.field; f.fill(9999);
    const p = this.player;
    const sx = clamp(Math.floor(p.x / TILE), 0, COLS - 1), sy = clamp(Math.floor(p.y / TILE), 0, ROWS - 1);
    const q = [sx + sy * COLS]; f[q[0]] = 0;
    let h = 0;
    while (h < q.length) {
      const i = q[h++], x = i % COLS, y = (i / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, ni = nx + ny * COLS;
        if (this.room.solidFor(nx, ny, false) || f[ni] !== 9999) continue;
        f[ni] = f[i] + 1; q.push(ni);
      }
    }
  },

  // ---------------- EFFETS ----------------
  shake(n) { if (Settings.shake) this.shakeAmt = Math.max(this.shakeAmt, n); },
  spark(x, y, color, n = 8, spd = 150, size = 3, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.3, 1) * spd;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1) * life, max: life, size: rand(0.6, 1.2) * size, color });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  },
  addText(x, y, str, color = '#fff', size = 14) { this.texts.push({ x, y, str, color, size, life: 0.8 }); },
  enemyShot(x, y, a, spd, r = 7, color = '#f43f5e') {
    this.bullets.push({ friendly: false, x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r, life: 6, color });
    Sfx.play('eshoot');
  },
  fallingRock(x, y) { this.hazards.push({ x, y, r: 34, t: rand(0.8, 1.3), max: 1.3 }); },
  explode(x, y, radius, dmg, isBomb = false) {
    Sfx.play('boom'); this.shake(isBomb ? 14 : 6);
    this.spark(x, y, '#fb923c', isBomb ? 40 : 22, isBomb ? 340 : 260, 5, 0.6);
    this.spark(x, y, '#fde047', 14, 160, 4, 0.4);
    this.spark(x, y, '#44403c', isBomb ? 16 : 0, 120, 8, 0.9);
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: radius, color: '#fed7aa', ring: true });
    for (const e of this.enemies) {
      if (e.spawnT > 0 || e.dead || e.invuln) continue;
      if (dist(e, { x, y }) < radius + e.r) this.damageEnemy(e, dmg, e.x - x, e.y - y);
    }
    const room = this.room;
    if (room.breakRocks(x, y, radius)) { this.spark(x, y, this.theme.rockHi, 14, 200, 5); this.computeField(); }
    if (isBomb) {
      const p = this.player;
      if (dist(p, { x, y }) < radius + p.r * 0.5) p.hurt(1, this);
      for (const d in room.hidden) {
        if (!room.hidden[d]) continue;
        const D = DOORS[d];
        if (Math.hypot((D.tx + 0.5) * TILE - x, (D.ty + 0.5) * TILE - y) < radius + 50) {
          room.revealDoor(d);
          Sfx.play('secret');
          this.spark((D.tx + 0.5) * TILE, (D.ty + 0.5) * TILE, '#fde047', 30, 220, 4);
          this.addText((D.tx + 0.5) * TILE, (D.ty + 0.5) * TILE - D.dy * 40 + (D.dy ? 0 : -30), 'Passage secret !', '#fde047', 18);
        }
      }
    }
  },

  damageEnemy(e, dmg, kx, ky) {
    if (e.dead) return;
    const p = this.player;
    let d = dmg;
    if (p.rage && p.hp <= 2) d *= 1.6;
    let crit = false;
    if (Math.random() < p.crit) { d *= 2.5; crit = true; }
    e.hp -= d; e.flash = 0.09;
    if (!e.boss) { const k = Math.hypot(kx, ky) || 1, kb = e.elite ? 70 : 150; e.kx += (kx / k) * kb; e.ky += (ky / k) * kb; }
    if (Settings.dmgNumbers || crit) this.addText(e.x + rand(-8, 8), e.y - e.r - 6, crit ? Math.round(d) + '!' : String(Math.round(d * 10) / 10), crit ? '#fde047' : '#fff', crit ? 18 : 13);
    Sfx.play('hit');
    if (e.hp <= 0) this.killEnemy(e);
  },
  killEnemy(e) {
    e.dead = true;
    const p = this.player;
    this.spark(e.x, e.y, e.def.color, e.boss ? 60 : 16, e.boss ? 380 : 200, e.boss ? 7 : 4, 0.7);
    Sfx.play('kill'); this.shake(e.boss ? 22 : e.elite ? 8 : 3);
    if (e.elite) this.hitstop = 0.05;
    this.stats.kills++;
    if (p.lifesteal && Math.random() < p.lifesteal && p.hp < p.maxHp) { p.hp++; this.addText(p.x, p.y - 26, '+♥', '#f87171', 16); }
    if (e.elite) {
      for (let i = randi(2, 3); i > 0; i--) this.dropCoin(e.x, e.y);
      if (Math.random() < 0.35) this.room.pickups.push({ type: 'bomb', x: e.x, y: e.y, vx: rand(-80, 80), vy: rand(-80, 80) });
    } else if (!e.boss && Math.random() < 0.08 + p.luck * 0.04) this.dropCoin(e.x, e.y);
    if (e.def.split) for (let i = 0; i < 2; i++) this.spawnEnemy('slime', e.x + (i ? 14 : -14), e.y, 0.05);
    if (e.boss) this.onBossDeath(e);
  },
  onBossDeath(e) {
    this.stats.bosses++;
    this.slowT = 1.3; this.hitstop = 0.12;
    Sfx.play('boom');
    for (const o of this.enemies) if (o !== e && !o.dead) { o.dead = true; this.spark(o.x, o.y, o.def.color, 10, 150, 3); }
    this.bullets = this.bullets.filter(b => b.friendly);
    this.hazards.length = 0;
    for (let i = 1; i <= 4; i++) this.later(i * 0.15, () => { this.spark(e.x + rand(-40, 40), e.y + rand(-40, 40), '#fde047', 20, 260, 5); Sfx.play('kill'); });
    this.room.locked = false; this.room.cleared = true;
    this.updateMusic();
    if (this.floor >= MAX_FLOOR) { this.victoryT = 2.5; return; }
    this.room.trapdoor = { x: RW / 2, y: RH / 2 - 30 };
    this.room.pickups.push(this.itemPickup(RW / 2 - 140, RH / 2 + 60), { type: 'heart', x: RW / 2 + 140, y: RH / 2 + 60 });
  },
  dropCoin(x, y) { this.room.pickups.push({ type: 'coin', x, y, vx: rand(-140, 140), vy: rand(-140, 140) }); },

  startDeath() {
    this.dying = 1.8;
    Sfx.play('death');
    this.shake(18);
    const p = this.player;
    this.spark(p.x, p.y, p.char.body, 40, 260, 5, 1.2);
    this.spark(p.x, p.y, '#ef4444', 20, 180, 4, 1);
    this.updateMusic();
  },
  gameOver(win) {
    this.inRun = false; this.dying = 0;
    const souls = this.floor * 12 + this.stats.kills + this.stats.bosses * 25 + this.stats.secrets * 10 + (win ? 100 : 0);
    const m = this.meta, st = m.stats;
    m.souls += souls;
    st.kills += this.stats.kills; st.bosses += this.stats.bosses; st.time += this.stats.time;
    st.bestFloor = Math.max(st.bestFloor, win ? MAX_FLOOR + 1 : this.floor);
    if (win) { st.wins++; if (!st.fastWin || this.stats.time < st.fastWin) st.fastWin = this.stats.time; } else st.deaths++;
    const unlocks = [];
    for (const ch of CHARACTERS) {
      if (ch.unlock && !m.unlocked.includes(ch.id) && ch.unlock.check(m)) { m.unlocked.push(ch.id); unlocks.push(ch); }
    }
    this.saveMeta();
    this.lastRun = { souls, win, floor: this.floor, kills: this.stats.kills, bosses: this.stats.bosses, secrets: this.stats.secrets, time: this.stats.time, items: this.player.items.slice(), unlocks, char: this.player.char };
    this.setState(win ? 'victory' : 'dead');
    Sfx.play(win ? 'victory' : 'death');
    if (unlocks.length) setTimeout(() => Sfx.play('unlock'), 900);
  },

  // ---------------- MISE À JOUR ----------------
  update(dt) {
    Input.poll();
    this.t += dt; this.stateT += dt;
    this.fade = Math.max(0, this.fade - dt);
    Music.update();
    if (Input.act('mute')) Sfx.toggleMute();
    if (Input.act('fullscreen')) this.toggleFullscreen();
    for (const m of this.menuEmbers) { m.y -= m.v * dt; if (m.y < -5) { m.y = H + 5; m.x = rand(0, W); } }

    if (this.state === 'playing') {
      if (Input.act('pause') && this.stateT > 0.1 && !this.dying) { this.setState('paused'); return; }
      this.updatePlay(dt);
      return;
    }
    if (this.state === 'paused' && Input.act('pause') && this.stateT > 0.1) { this.setState('playing'); return; }
    this.updateMenuNav();
  },

  updateMenuNav() {
    const B = this.buttons;
    if (Input.clicked) {
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (Input.mouse.x >= b.x && Input.mouse.x <= b.x + b.w && Input.mouse.y >= b.y && Input.mouse.y <= b.y + b.h) {
          this.focus = i;
          if (b.disabled) Sfx.play('deny'); else { Sfx.play('click'); b.action(); }
          return;
        }
      }
    }
    if (!B.length) return;
    if (this.focus >= B.length) this.focus = 0;
    const cur = B[this.focus];
    const horiz = (Input.act('left') ? -1 : 0) + (Input.act('right') ? 1 : 0);
    if (horiz && cur && cur.onAdjust) { cur.onAdjust(horiz); Sfx.play('move'); }
    else {
      const d = (Input.act('up') ? -1 : 0) + (Input.act('down') ? 1 : 0) + horiz;
      if (d) { this.focus = (this.focus + d + B.length) % B.length; Sfx.play('move'); }
    }
    if (Input.act('confirm') && this.stateT > 0.5 && cur) {
      if (cur.disabled) Sfx.play('deny'); else { Sfx.play('click'); cur.action(); }
      return;
    }
    if (Input.act('back') && this.stateT > 0.1) {
      if (this.state === 'paused') this.setState('playing');
      else if (this.state === 'settings') this.setState(this.settingsReturn);
      else if (['meta', 'codex', 'select'].includes(this.state)) this.setState('menu');
    }
  },

  updatePlay(rawDt) {
    const p = this.player, room = this.room;
    if (this.hitstop > 0) { this.hitstop -= rawDt; return; }
    let dt = rawDt;
    if (this.dying > 0) {
      this.dying -= rawDt;
      if (this.dying <= 0) { this.gameOver(false); return; }
      dt *= 0.3;
    } else if (this.slowT > 0) { this.slowT -= rawDt; dt *= 0.35; }

    if (!this.dying) this.stats.time += rawDt;
    this.updateFx(dt);
    for (const d of this.delayed) { d.t -= rawDt; if (d.t <= 0) { d.done = true; d.fn(); } }
    this.delayed = this.delayed.filter(d => !d.done);

    if (this.trans) {
      this.trans.t += rawDt;
      if (!this.trans.done && this.trans.t >= 0.18) { this.trans.done = true; this.trans.action(); }
      if (this.trans.t >= 0.36) this.trans = null;
      return;
    }
    if (this.victoryT > 0) { this.victoryT -= rawDt; if (this.victoryT <= 0) { this.gameOver(true); return; } }

    if (!this.dying) p.update(dt, this);

    // portes
    if (!room.locked && !this.dying) {
      const m = TILE * 0.42;
      for (const d in room.doors) {
        if (room.hidden[d]) continue;
        const out = (d === 'left' && p.x < m) || (d === 'right' && p.x > RW - m) || (d === 'up' && p.y < m) || (d === 'down' && p.y > RH - m);
        if (out) { const n = this.neighbor(room, d); this.trans = { t: 0, done: false, action: () => this.enterRoom(n, d) }; Sfx.play('door'); return; }
      }
    }

    this.fieldT -= dt;
    if (this.fieldT <= 0) { this.fieldT = 0.15; this.computeField(); }

    // ennemis
    for (const e of this.enemies) {
      e.update(dt, this);
      if (e.spawnT > 0 || e.dead) continue;
      const d = dist(e, p);
      if (!e.invuln && e.z < 25 && d < e.r + p.r * 0.75) p.hurt(e.contact, this);
      if (p.dashTime > 0 && p.dashDmg && !p.dashHit.has(e) && d < e.r + p.r + 6) { p.dashHit.add(e); this.damageEnemy(e, p.dmg * 2, e.x - p.x, e.y - p.y); }
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.boss || a.spawnT > 0) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.boss || b.spawnT > 0 || a.fly !== b.fly) continue;
        const d = dist(a, b), min = a.r + b.r;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2, nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        }
      }
    }

    // orbes
    if (p.orbitals > 0 && p.hp > 0) {
      for (let i = 0; i < p.orbitals; i++) {
        const a = this.t * 3 + (i * TAU) / p.orbitals, o = { x: p.x + Math.cos(a) * 48, y: p.y + Math.sin(a) * 48 };
        for (const e of this.enemies) {
          if (e.spawnT > 0 || e.dead || e.invuln || e.orbCd > 0) continue;
          if (dist(e, o) < e.r + 10) { e.orbCd = 0.3; this.damageEnemy(e, 2 + p.dmg * 0.5, e.x - p.x, e.y - p.y); }
        }
        for (const b of this.bullets) if (!b.friendly && !b.dead && dist(b, o) < b.r + 10) { b.dead = true; this.spark(b.x, b.y, '#a5b4fc', 4, 80, 2); }
      }
    }

    this.updateBullets(dt);

    // bombes
    for (const b of this.bombs) {
      b.t -= dt;
      if (Math.random() < 0.3) this.particles.push({ x: b.x + 10, y: b.y - 22, vx: rand(-20, 20), vy: rand(-60, -20), life: 0.3, max: 0.3, size: 2.5, color: '#fde047' });
      if (b.t <= 0) { b.dead = true; this.explode(b.x, b.y, 95, 14 + this.floor * 3, true); }
    }
    this.bombs = this.bombs.filter(b => !b.dead);

    // pierres qui tombent
    for (const h of this.hazards) {
      h.t -= dt;
      if (h.t <= 0) {
        h.dead = true; this.shake(4);
        this.spark(h.x, h.y, '#a8a29e', 12, 180, 4);
        if (dist(h, p) < h.r + p.r * 0.6) p.hurt(1, this);
      }
    }
    this.hazards = this.hazards.filter(h => !h.dead);
    this.enemies = this.enemies.filter(e => !e.dead);

    if (!this.dying) this.updatePickups(dt);

    // salle nettoyée
    if (room.locked && this.enemies.length === 0) {
      room.locked = false; room.cleared = true;
      Sfx.play('clear');
      if (room.type === 'normal') {
        const r = Math.random(), luck = p.luck;
        if (r < 0.12 + luck * 0.05) room.pickups.push({ type: 'heart', x: RW / 2, y: RH / 2 });
        else if (r < 0.22 + luck * 0.08) room.pickups.push({ type: 'bomb', x: RW / 2, y: RH / 2 });
        else if (r < 0.6 + luck * 0.1) for (let i = randi(1, 2 + luck); i > 0; i--) this.dropCoin(RW / 2, RH / 2);
      }
      this.updateMusic();
    }

    // trappe
    if (room.trapdoor && !this.dying && dist(room.trapdoor, p) < 28) {
      room.trapdoor = null;
      Sfx.play('stairs');
      this.trans = { t: 0, done: false, action: () => { this.floor++; this.loadFloor(); } };
    }

    // battement de cœur à faible vie
    if (p.hp > 0 && p.hp <= 2) { this.hbT -= rawDt; if (this.hbT <= 0) { this.hbT = 1; Sfx.play('heartbeat'); } }

    if (Input.act('map')) this.bigMap = !this.bigMap;
  },

  updateBullets(dt) {
    const p = this.player, room = this.room;
    const solid = (x, y) => room.solidFor(Math.floor(x / TILE), Math.floor(y / TILE), false);
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.friendly && b.homing) {
        let best = null, bd = 380;
        for (const e of this.enemies) { if (e.spawnT > 0 || e.dead) continue; const d = dist(b, e); if (d < bd) { bd = d; best = e; } }
        if (best) {
          const cur = Math.atan2(b.vy, b.vx), want = angle(b, best);
          const diff = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          const na = cur + clamp(diff, -7 * dt, 7 * dt), sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (solid(nx, ny)) {
        if (b.bounces > 0) {
          b.bounces--;
          const sx = solid(nx, b.y), sy = solid(b.x, ny);
          if (sx) b.vx *= -1;
          if (sy) b.vy *= -1;
          if (!sx && !sy) { b.vx *= -1; b.vy *= -1; }
        } else { this.killBullet(b); continue; }
      } else { b.x = nx; b.y = ny; }
      if (b.life <= 0) { this.killBullet(b); continue; }
      if (b.friendly) {
        for (const e of this.enemies) {
          if (e.spawnT > 0 || e.dead || e.invuln || e.z > 30) continue;
          if (b.hit && b.hit.has(e)) continue;
          if (dist(b, e) < e.r + b.r) {
            this.damageEnemy(e, b.dmg, b.vx, b.vy);
            if (b.pierce) b.hit.add(e); else { this.killBullet(b); break; }
          }
        }
      } else if (dist(b, p) < p.r * 0.7 + b.r && p.canBeHit()) {
        p.hurt(1, this); b.dead = true;
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  },
  killBullet(b) {
    b.dead = true;
    this.spark(b.x, b.y, b.color, 4, 90, 2, 0.3);
    if (b.explosive) this.explode(b.x, b.y, 58, b.dmg * 0.8);
  },

  updatePickups(dt) {
    const p = this.player, room = this.room;
    for (const k of room.pickups) {
      if (k.vx !== undefined) {
        k.x += k.vx * dt; k.y += k.vy * dt;
        const fr = Math.pow(0.02, dt); k.vx *= fr; k.vy *= fr;
        k.x = clamp(k.x, TILE + 10, RW - TILE - 10); k.y = clamp(k.y, TILE + 10, RH - TILE - 10);
      }
      const d = dist(k, p);
      if (k.type === 'coin') {
        if (d < 90) { const a = angle(k, p); k.x += Math.cos(a) * 320 * dt; k.y += Math.sin(a) * 320 * dt; }
        if (d < p.r + 10) { k.dead = true; p.coins++; Sfx.play('coin'); this.addText(p.x, p.y - 24, '+1', '#fbbf24'); }
      } else if (k.type === 'bomb') {
        if (d < p.r + 14) { k.dead = true; p.bombs++; Sfx.play('coin'); this.addText(p.x, p.y - 24, '+1 💣', '#e5e7eb'); }
      } else if (k.type === 'heart') {
        if (d < p.r + 12 && p.hp < p.maxHp) { k.dead = true; p.hp = Math.min(p.maxHp, p.hp + 2); Sfx.play('heart'); this.spark(k.x, k.y, '#ef4444', 12, 140, 3); }
      } else if (k.type === 'item') {
        if (d < p.r + 18) { k.dead = true; this.giveItem(k.id); }
      } else if (k.type === 'shop') {
        k.denyT = (k.denyT || 0) - dt;
        if (d < p.r + 18 && k.denyT <= 0) {
          const full = k.id === 'heart' && p.hp >= p.maxHp;
          if (p.coins >= k.price && !full) {
            p.coins -= k.price; k.dead = true; Sfx.play('buy');
            if (k.id === 'heart') { p.hp = Math.min(p.maxHp, p.hp + 2); this.spark(k.x, k.y, '#ef4444', 12, 140, 3); }
            else if (k.id === 'bomb') { p.bombs++; this.addText(k.x, k.y - 40, '+1 💣', '#e5e7eb', 15); }
            else this.giveItem(k.id);
          } else {
            k.denyT = 1.2; Sfx.play('deny');
            this.addText(k.x, k.y - 40, full ? 'Déjà en pleine forme' : 'Pas assez d\'or', '#fca5a5', 15);
          }
        }
      }
    }
    room.pickups = room.pickups.filter(k => !k.dead);
  },

  updateFx(dt) {
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(0.05, dt); q.vy *= Math.pow(0.05, dt); q.life -= dt; }
    this.particles = this.particles.filter(q => q.life > 0);
    for (const q of this.texts) { q.y -= 40 * dt; q.life -= dt; }
    this.texts = this.texts.filter(q => q.life > 0);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    this.flash = Math.max(0, this.flash - dt);
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
  },
};
