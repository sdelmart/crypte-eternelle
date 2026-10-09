import {
  TILE,
  COLS,
  ROWS,
  W,
  H,
  RW,
  RH,
  DOORS,
  OPP,
  TAU,
  rand,
  randi,
  choice,
  clamp,
  dist,
  angle,
  lerp,
  Store,
  makeRng,
  hashSeed,
  randomSeed,
  dailySeed,
  sanitizeSeed,
} from '../core/utils.js';
import { Settings } from '../core/settings.js';
import { Sfx, Music } from '../core/audio.js';
import { Input } from '../core/input.js';
import { ITEMS, ITEM_BY_ID, ACTIVES, ACTIVE_BY_ID, ALL_ITEMS, CHARACTERS } from '../data/items.js';
import { ACHIEVEMENT_BY_ID } from '../data/achievements.js';
import { generateFloor } from '../world/dungeon.js';
import { Player, Enemy, ENEMY_POOLS } from '../world/entities.js';

export const MAX_FLOOR = 5;
export const BOSS_BY_FLOOR = ['kingslime', 'eye', 'golem', null, 'lich'];
export const MENU_STATES = ['menu', 'meta', 'codex', 'select', 'controls'];
export const TUTORIAL_STEPS = ['move', 'shoot', 'dash', 'bomb', 'explore'];
const SPIKE_CYCLE = 2.8;

export function loadMeta(raw = Store.get('crypte_meta', null)) {
  const m = raw || {};
  m.souls = m.souls || 0;
  m.up = m.up || {};
  m.seen = m.seen || [];
  m.unlocked = m.unlocked || ['mage'];
  m.ach = m.ach || [];
  m.board = m.board || [];
  m.char = m.char || 'mage';
  m.tutorialDone = !!m.tutorialDone;
  m.stats = Object.assign(
    { runs: 0, kills: 0, wins: 0, bosses: 0, deaths: 0, time: 0, bestFloor: 0, fastWin: 0, secrets: 0, elites: 0, nightmareWins: 0 },
    m.stats || {},
  );
  m.stats.bestFloor = Math.max(m.stats.bestFloor, Store.get('crypte_best', 0));
  return m;
}

/** Score d'une partie (classement local) */
export function computeScore(r) {
  const base = r.floor * 1000 + r.kills * 10 + r.bosses * 500 + r.secrets * 200;
  const winBonus = r.win ? 5000 + Math.max(0, 1800 - Math.floor(r.time)) * 2 : 0;
  return Math.round((base + winBonus) * (r.nightmare ? 1.5 : 1));
}

/** Ajoute une partie au classement (10 meilleures) et renvoie son rang, ou 0 */
export function recordRun(board, entry) {
  board.push(entry);
  board.sort((a, b) => b.score - a.score);
  board.length = Math.min(board.length, 10);
  return board.indexOf(entry) + 1;
}

export const Game = {
  state: 'menu',
  prevState: 'menu',
  stateT: 0,
  t: 0,
  buttons: [],
  focus: 0,
  fade: 0,
  particles: [],
  texts: [],
  bullets: [],
  enemies: [],
  hazards: [],
  bombs: [],
  delayed: [],
  shakeAmt: 0,
  flash: 0,
  toast: null,
  banner: null,
  trans: null,
  fieldT: 0,
  hitstop: 0,
  slowT: 0,
  timeWarp: 0,
  dying: 0,
  hbT: 0,
  spikeT: 0,
  inRun: false,
  confirmQuit: false,
  bigMap: false,
  menuEmbers: [],
  settingsReturn: 'menu',
  codexTab: 'items',
  achQueue: [],
  achToast: null,
  fps: 60,
  tut: null,
  runOpts: { nightmare: false, daily: false, seed: '' },
  seedEdit: null,

  init() {
    this.meta = loadMeta();
    this.field = new Int16Array(COLS * ROWS);
    for (let i = 0; i < 70; i++) this.menuEmbers.push({ x: rand(0, W), y: rand(0, H), s: rand(1, 3), v: rand(10, 40) });
    this.setState('menu');
  },
  saveMeta() {
    Store.set('crypte_meta', this.meta);
  },
  onResize() {
    if (this.dungeon) for (const r of this.dungeon.rooms.values()) r.dirty = true;
  },

  setState(s) {
    if (s !== 'paused' && s !== 'settings' && s !== 'controls') this.confirmQuit = false;
    this.prevState = this.state;
    this.state = s;
    this.stateT = 0;
    this.focus = 0;
    const overlay = ['paused', 'settings', 'controls'];
    this.fade = overlay.includes(s) || overlay.includes(this.prevState) ? 0 : 0.35;
    if (s === 'select')
      this.focus = Math.max(
        0,
        CHARACTERS.findIndex(c => c.id === this.meta.char),
      );
    if (s === 'credits') this.creditsT = 0;
    this.updateMusic();
  },
  updateMusic() {
    const s = this.state;
    if (s === 'dead' || this.dying > 0) Music.play(null);
    else if (s === 'credits' || s === 'victory') Music.play('menu');
    else if (!this.inRun) Music.play('menu');
    else {
      const fight = this.room && (this.room.type === 'boss' || this.room.type === 'challenge') && this.room.locked;
      Music.play(fight ? 'boss' : 'f' + (((this.floor - 1) % 5) + 1));
    }
    Music.duck(s === 'paused' || ((s === 'settings' || s === 'controls') && this.inRun));
  },
  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch {
      /* non supporté (iPhone notamment) */
    }
  },
  later(t, fn) {
    this.delayed.push({ t, fn });
  },

  // ---------------- SUCCÈS ----------------
  unlock(id) {
    const m = this.meta;
    if (!ACHIEVEMENT_BY_ID[id] || m.ach.includes(id)) return;
    m.ach.push(id);
    this.saveMeta();
    this.achQueue.push(ACHIEVEMENT_BY_ID[id]);
  },
  updateAchToast(dt) {
    if (this.achToast) {
      this.achToast.t -= dt;
      if (this.achToast.t <= 0) this.achToast = null;
    } else if (this.achQueue.length) {
      this.achToast = { a: this.achQueue.shift(), t: 3.6 };
      Sfx.play('achievement');
    }
  },

  // ---------------- PARTIE ----------------
  nightmareUnlocked() {
    return this.meta.stats.wins > 0;
  },
  newRun(charId) {
    const ch = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
    const o = this.runOpts;
    this.meta.char = ch.id;
    this.nightmare = o.nightmare && this.nightmareUnlocked();
    this.daily = o.daily;
    this.seed = o.daily ? dailySeed() : sanitizeSeed(o.seed) || randomSeed();
    this.rng = makeRng(hashSeed(this.seed));
    const up = this.meta.up,
      p = (this.player = new Player(ch));
    p.maxHp += (up.hp || 0) * 2;
    p.hp = p.maxHp;
    p.dmg += (up.dmg || 0) * 0.5;
    p.coins = (up.coins || 0) * 5;
    p.dashCooldown *= Math.pow(0.85, up.dash || 0);
    this.pool = this.rng.shuffle(ITEMS.map(i => i.id));
    this.activePool = this.rng.shuffle(ACTIVES.map(i => i.id));
    this.floor = 1;
    this.stats = { kills: 0, bosses: 0, time: 0, secrets: 0, elites: 0 };
    Object.assign(this, {
      victoryT: 0,
      toast: null,
      dying: 0,
      slowT: 0,
      hitstop: 0,
      timeWarp: 0,
      delayed: [],
      bombs: [],
      inRun: true,
      bigMap: false,
      bossRef: null,
      bombsPlaced: 0,
    });
    this.tut = this.meta.tutorialDone ? null : { step: 0, t: 0 };
    this.meta.stats.runs++;
    this.saveMeta();
    if (up.start) this.giveItem(this.pool.pop());
    this.loadFloor();
    this.setState('playing');
  },
  loadFloor() {
    this.dungeon = generateFloor(this.floor, makeRng(this.rng.next() * 4294967296));
    this.theme = this.dungeon.theme;
    this.planFloor();
    this.enterRoom(this.dungeon.start, null);
    this.banner = { title: `Étage ${this.floor}`, sub: this.nightmare ? `${this.theme.name} · Cauchemar` : this.theme.name, t: 2.6 };
  },
  /** Tire à l'avance le contenu de chaque salle : une même seed donne le même donjon et les mêmes objets */
  planFloor() {
    const R = this.rng,
      f = this.floor;
    const pool = ENEMY_POOLS[Math.min(f, ENEMY_POOLS.length) - 1];
    const eliteChance = (0.05 + 0.03 * f) * (this.nightmare ? 2 : 1);
    const wave = n => {
      const list = [];
      let elites = 0;
      for (let i = 0; i < n; i++) {
        const elite = elites < 1 && R.chance(eliteChance);
        if (elite) elites++;
        list.push({ type: R.choice(pool), elite });
      }
      return list;
    };
    const passive = () => {
      const id = this.pool.pop();
      return id ? { kind: 'item', id } : null;
    };
    const active = () => {
      const id = this.activePool.pop();
      return id ? { kind: 'active', id } : passive();
    };
    const rooms = [...this.dungeon.rooms.values()].sort((a, b) => a.gy - b.gy || a.gx - b.gx);
    for (const room of rooms) {
      const plan = { enemies: [], waves: [], items: [] };
      if (room.type === 'normal') plan.enemies = wave(Math.min(10, R.randi(3, 5) + Math.floor(f * 0.8)));
      else if (room.type === 'challenge') {
        plan.waves = [wave(4 + f), wave(5 + f)];
        plan.items = [passive()];
      } else if (room.type === 'treasure') plan.items = [R.chance(0.3) ? active() : passive()];
      else if (room.type === 'shop') plan.items = [passive(), passive(), R.chance(0.5) ? active() : null];
      else if (room.type === 'secret') plan.items = [R.chance(0.55) ? passive() : null];
      else if (room.type === 'boss') {
        plan.boss = BOSS_BY_FLOOR[f - 1] || R.choice(['kingslime', 'eye', 'golem']);
        plan.items = [passive()];
      }
      room.plan = plan;
    }
  },
  neighbor(room, dir) {
    const D = DOORS[dir];
    return this.dungeon.rooms.get(room.gx + D.dx + ',' + (room.gy + D.dy));
  },
  enterRoom(room, dir) {
    const from = this.room;
    this.room = room;
    room.visited = true;
    this.bullets.length = 0;
    this.enemies.length = 0;
    this.hazards.length = 0;
    this.texts.length = 0;
    this.bombs.length = 0;
    this.timeWarp = 0;
    this.spikeT = 0;
    this.particles = this.particles.filter(p => !p.ghost);
    const p = this.player;
    if (dir) {
      const D = DOORS[OPP[dir]];
      p.x = (D.tx + 0.5) * TILE - D.dx * TILE * 0.95;
      p.y = (D.ty + 0.5) * TILE - D.dy * TILE * 0.95;
    } else {
      p.x = RW / 2;
      p.y = RH / 2 + 60;
    }
    p.vx = p.vy = 0;
    p.dashTime = 0;
    if (!room.spawned) {
      room.spawned = true;
      this.populate(room);
    }
    if (room.type === 'challenge' && !room.cleared && !room.started) {
      room.started = true;
      room.waveIdx = 0;
      this.spawnWave(room.plan.waves[0]);
      this.banner = { title: 'Salle de défi', sub: `Survis à ${room.plan.waves.length} vagues`, t: 2.2, boss: true };
      Sfx.play('wave');
    }
    room.locked = this.enemies.length > 0;
    if (room.type === 'secret' && !room.announced) {
      room.announced = true;
      this.stats.secrets++;
      if (this.meta.stats.secrets + this.stats.secrets >= 5) this.unlock('secrets');
      this.toast = { icon: '🔑', title: 'Salle secrète !', desc: 'Tu as trouvé un passage caché.', t: 2.6 };
    }
    if (this.tut && this.tut.step === TUTORIAL_STEPS.indexOf('explore') && from && from !== room) this.advanceTutorial();
    this.computeField();
    this.updateMusic();
  },
  addEnemy(type, x, y, elite = false, spawnT = null) {
    const e = new Enemy(type, x, y, this.floor, false, elite, this.nightmare ? 1.5 : 1);
    if (this.nightmare) e.speed *= 1.1;
    if (spawnT !== null) e.spawnT = e.spawnMax = spawnT;
    this.enemies.push(e);
    return e;
  },
  spawnWave(list) {
    for (const en of list) {
      const pos = this.freeSpot(200);
      if (pos) this.addEnemy(en.type, pos.x, pos.y, en.elite);
    }
  },
  populate(room) {
    const plan = room.plan,
      f = this.floor;
    if (room.type === 'normal') this.spawnWave(plan.enemies);
    else if (room.type === 'treasure') this.placeReward(plan.items[0], RW / 2, RH / 2);
    else if (room.type === 'shop') {
      const slots = [];
      for (const it of plan.items.slice(0, 2)) if (it) slots.push({ type: 'shop', kind: 'item', id: it.id, price: 12 + f * 3 });
      if (plan.items[2]) slots.push({ type: 'shop', kind: 'active', id: plan.items[2].id, price: 10 + f * 2 });
      slots.push({ type: 'shop', kind: 'heart', id: 'heart', price: 5 });
      slots.push({ type: 'shop', kind: 'bomb', id: 'bomb', price: 4 });
      slots.push({ type: 'shop', kind: 'key', id: 'key', price: 6 });
      const gap = 128,
        x0 = RW / 2 - ((slots.length - 1) * gap) / 2;
      slots.forEach((s, i) => room.pickups.push({ ...s, x: x0 + i * gap, y: RH / 2 + 20 }));
    } else if (room.type === 'secret') {
      if (plan.items[0]) this.placeReward(plan.items[0], RW / 2, RH / 2);
      else {
        for (let i = randi(6, 9); i > 0; i--) room.pickups.push({ type: 'coin', x: RW / 2 + rand(-90, 90), y: RH / 2 + rand(-50, 50) });
        room.pickups.push({ type: 'bomb', x: RW / 2 - 70, y: RH / 2 + 90 }, { type: 'key', x: RW / 2 + 70, y: RH / 2 + 90 });
      }
      room.pickups.push({ type: 'chest', gold: true, x: RW / 2, y: RH / 2 + 150 });
    } else if (room.type === 'boss') {
      const boss = new Enemy(plan.boss, RW / 2, RH / 2 - 90, f, true, false, this.nightmare ? 1.4 : 1);
      this.enemies.push(boss);
      this.bossRef = boss;
      this.bossHit = false;
      this.banner = { title: boss.def.name, sub: 'BOSS', t: 2.4, boss: true };
      Sfx.play('boss');
    }
  },
  placeReward(it, x, y) {
    const room = this.room;
    if (!it) room.pickups.push({ type: 'heart', x, y });
    else if (it.kind === 'active')
      room.pickups.push({ type: 'active', id: it.id, charge: ACTIVE_BY_ID[it.id].charge, x, y, pedestal: true });
    else room.pickups.push({ type: 'item', id: it.id, x, y });
  },
  freeSpot(minD) {
    for (let i = 0; i < 80; i++) {
      const tx = randi(1, COLS - 2),
        ty = randi(1, ROWS - 2);
      if (this.room.tiles[ty][tx] !== 0) continue;
      const x = (tx + 0.5) * TILE + rand(-10, 10),
        y = (ty + 0.5) * TILE + rand(-10, 10);
      if (Math.hypot(x - this.player.x, y - this.player.y) < minD) continue;
      return { x, y };
    }
    return null;
  },
  spawnEnemy(type, x, y, spawnT = 0.5) {
    return this.addEnemy(type, clamp(x, TILE + 16, RW - TILE - 16), clamp(y, TILE + 16, RH - TILE - 16), false, spawnT);
  },
  markSeen(id) {
    const m = this.meta;
    if (m.seen.includes(id)) return false;
    m.seen.push(id);
    if (ALL_ITEMS.every(i => m.seen.includes(i.id))) this.unlock('collector');
    this.saveMeta();
    return true;
  },
  giveItem(id) {
    const it = ITEM_BY_ID[id],
      p = this.player;
    it.apply(p);
    p.items.push(id);
    const isNew = this.markSeen(id);
    this.toast = { icon: it.icon, title: it.name, desc: it.desc, t: 3.2, isNew };
    if (p.items.length >= 10) this.unlock('arsenal');
    Sfx.play('item');
    this.spark(p.x, p.y, '#fde047', 26, 240, 4);
  },
  giveActive(k) {
    const p = this.player,
      def = ACTIVE_BY_ID[k.id];
    if (p.active) {
      // l'ancien objet actif reste au sol
      this.room.pickups.push({
        type: 'active',
        id: p.active.id,
        charge: p.active.charge,
        x: k.x,
        y: k.y,
        cool: true,
        pedestal: k.pedestal,
      });
    }
    p.active = { id: def.id, charge: k.charge ?? def.charge, max: def.charge };
    const isNew = this.markSeen(def.id);
    this.toast = { icon: def.icon, title: def.name, desc: `${def.desc} — touche ${'{active}'}`, t: 3.4, isNew, active: true };
    Sfx.play('item');
    this.spark(p.x, p.y, '#fde047', 26, 240, 4);
  },
  useActive() {
    const p = this.player,
      a = p.active;
    if (!a) return;
    if (a.charge < a.max) {
      Sfx.play('deny');
      this.addText(p.x, p.y - 30, 'Pas encore chargé', '#94a3b8', 13);
      return;
    }
    if (a.id === 'potion' && p.hp >= p.maxHp) {
      Sfx.play('deny');
      this.addText(p.x, p.y - 30, 'Déjà en pleine forme', '#94a3b8', 13);
      return;
    }
    a.charge = 0;
    Sfx.play('active');
    switch (a.id) {
      case 'hourglass':
        this.timeWarp = 5;
        break;
      case 'potion':
        p.hp = Math.min(p.maxHp, p.hp + 2);
        this.spark(p.x, p.y, '#ef4444', 16, 160, 3);
        break;
      case 'aegis':
        p.iframes = Math.max(p.iframes, 3);
        p.shield = 3;
        break;
      case 'firetome':
        for (let i = 0; i < 16; i++) {
          const ang = (i * TAU) / 16;
          this.bullets.push({
            friendly: true,
            x: p.x,
            y: p.y,
            vx: Math.cos(ang) * 420,
            vy: Math.sin(ang) * 420,
            r: 9,
            dmg: p.dmg * 1.5 + 3,
            life: 1,
            pierce: true,
            hit: new Set(),
            bounces: 0,
            color: '#f97316',
          });
        }
        this.shake(6);
        break;
      case 'megabomb':
        this.bombs.push({ x: p.x, y: p.y + 4, t: 1.2, max: 1.2, r: 160, big: true });
        break;
    }
  },
  onBombPlaced() {
    this.bombsPlaced++;
    if (this.tut && TUTORIAL_STEPS[this.tut.step] === 'bomb') this.advanceTutorial();
  },
  onPlayerHurt() {
    if (!Settings.reduceFlash) this.flash = 0.4;
    if (this.room && this.room.type === 'boss') this.bossHit = true;
  },

  // ---------------- TUTORIEL ----------------
  advanceTutorial() {
    const t = this.tut;
    if (!t) return;
    t.step++;
    t.t = 0;
    Sfx.play('click');
    // l'étape bombe est sautée s'il n'y a plus de bombe
    if (TUTORIAL_STEPS[t.step] === 'bomb' && this.player.bombs <= 0) t.step++;
    if (t.step >= TUTORIAL_STEPS.length) this.finishTutorial(true);
  },
  finishTutorial(done) {
    this.tut = null;
    this.meta.tutorialDone = true;
    this.saveMeta();
    if (done) this.toast = { icon: '🎓', title: 'Tutoriel terminé', desc: 'Bonne descente !', t: 2.5 };
  },
  updateTutorial(dt) {
    const t = this.tut,
      p = this.player;
    if (!t) return;
    t.t += dt;
    const step = TUTORIAL_STEPS[t.step];
    if ((step === 'move' && p.traveled > 160) || (step === 'shoot' && p.shots >= 6) || (step === 'dash' && p.dashes >= 1))
      this.advanceTutorial();
  },

  computeField() {
    const f = this.field;
    f.fill(9999);
    const p = this.player;
    const sx = clamp(Math.floor(p.x / TILE), 0, COLS - 1),
      sy = clamp(Math.floor(p.y / TILE), 0, ROWS - 1);
    const q = [sx + sy * COLS];
    f[q[0]] = 0;
    let h = 0;
    while (h < q.length) {
      const i = q[h++],
        x = i % COLS,
        y = (i / COLS) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          ni = nx + ny * COLS;
        if (this.room.solidFor(nx, ny, false) || f[ni] !== 9999) continue;
        f[ni] = f[i] + 1;
        q.push(ni);
      }
    }
  },

  // ---------------- EFFETS ----------------
  shake(n) {
    if (Settings.shake) this.shakeAmt = Math.max(this.shakeAmt, n);
  },
  spark(x, y, color, n = 8, spd = 150, size = 3, life = 0.5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU),
        s = rand(0.3, 1) * spd;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.5, 1) * life,
        max: life,
        size: rand(0.6, 1.2) * size,
        color,
      });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  },
  addText(x, y, str, color = '#fff', size = 14) {
    this.texts.push({ x, y, str, color, size, life: 0.8 });
  },
  enemyShot(x, y, a, spd, r = 7, color = '#f43f5e') {
    if (this.nightmare) spd *= 1.15;
    this.bullets.push({ friendly: false, x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r, life: 6, color });
    Sfx.play('eshoot');
  },
  fallingRock(x, y) {
    this.hazards.push({ kind: 'rock', x, y, r: 34, t: rand(0.8, 1.3), max: 1.3 });
  },
  lobBomb(x0, y0, tx, ty) {
    const x = clamp(tx, TILE + 20, RW - TILE - 20),
      y = clamp(ty, TILE + 20, RH - TILE - 20);
    this.hazards.push({ kind: 'lob', x0, y0, x, y, r: 46, t: 1, max: 1 });
    Sfx.play('lob');
  },
  explode(x, y, radius, dmg, isBomb = false) {
    Sfx.play('boom');
    this.shake(isBomb ? 14 : 6);
    this.spark(x, y, '#fb923c', isBomb ? 40 : 22, isBomb ? 340 : 260, 5, 0.6);
    this.spark(x, y, '#fde047', 14, 160, 4, 0.4);
    if (isBomb) this.spark(x, y, '#44403c', 16, 120, 8, 0.9);
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: radius, color: '#fed7aa', ring: true });
    let killed = 0;
    for (const e of this.enemies) {
      if (e.spawnT > 0 || e.dead || e.invuln) continue;
      if (dist(e, { x, y }) < radius + e.r) {
        this.damageEnemy(e, dmg, e.x - x, e.y - y);
        if (e.dead) killed++;
      }
    }
    if (isBomb && killed >= 3) this.unlock('bomb3');
    const room = this.room;
    if (room.breakRocks(x, y, radius)) {
      this.spark(x, y, this.theme.rockHi, 14, 200, 5);
      this.computeField();
    }
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
    if (Math.random() < p.crit) {
      d *= 2.5;
      crit = true;
    }
    e.hp -= d;
    e.flash = 0.09;
    if (!e.boss) {
      const k = Math.hypot(kx, ky) || 1,
        kb = e.elite ? 70 : 150;
      e.kx += (kx / k) * kb;
      e.ky += (ky / k) * kb;
    }
    if (Settings.dmgNumbers || crit)
      this.addText(
        e.x + rand(-8, 8),
        e.y - e.r - 6,
        crit ? Math.round(d) + '!' : String(Math.round(d * 10) / 10),
        crit ? '#fde047' : '#fff',
        crit ? 18 : 13,
      );
    Sfx.play('hit');
    if (e.hp <= 0) this.killEnemy(e);
  },
  killEnemy(e) {
    e.dead = true;
    const p = this.player,
      st = this.meta.stats;
    this.spark(e.x, e.y, e.def.color, e.boss ? 60 : 16, e.boss ? 380 : 200, e.boss ? 7 : 4, 0.7);
    Sfx.play('kill');
    this.shake(e.boss ? 22 : e.elite ? 8 : 3);
    if (e.elite) this.hitstop = 0.05;
    this.stats.kills++;
    if (st.kills + this.stats.kills >= 1000) this.unlock('butcher');
    if (p.lifesteal && Math.random() < p.lifesteal && p.hp < p.maxHp) {
      p.hp++;
      this.addText(p.x, p.y - 26, '+♥', '#f87171', 16);
    }
    if (e.elite) {
      this.stats.elites++;
      if (st.elites + this.stats.elites >= 25) this.unlock('elites');
      for (let i = randi(2, 3); i > 0; i--) this.dropCoin(e.x, e.y);
      if (Math.random() < 0.4)
        this.room.pickups.push({ type: choice(['bomb', 'key']), x: e.x, y: e.y, vx: rand(-80, 80), vy: rand(-80, 80) });
    } else if (!e.boss && Math.random() < 0.08 + p.luck * 0.04) this.dropCoin(e.x, e.y);
    if (e.def.split) for (let i = 0; i < 2; i++) this.spawnEnemy('slime', e.x + (i ? 14 : -14), e.y, 0.05);
    if (e.boss) this.onBossDeath(e);
  },
  onBossDeath(e) {
    const p = this.player;
    this.stats.bosses++;
    this.slowT = 1.3;
    this.hitstop = 0.12;
    Sfx.play('boom');
    this.unlock('boss1');
    if (!this.bossHit) this.unlock('nohit');
    if (p.hp === 1) this.unlock('clutch');
    if (this.daily) this.unlock('daily');
    for (const o of this.enemies)
      if (o !== e && !o.dead) {
        o.dead = true;
        this.spark(o.x, o.y, o.def.color, 10, 150, 3);
      }
    this.bullets = this.bullets.filter(b => b.friendly);
    this.hazards.length = 0;
    for (let i = 1; i <= 4; i++)
      this.later(i * 0.15, () => {
        this.spark(e.x + rand(-40, 40), e.y + rand(-40, 40), '#fde047', 20, 260, 5);
        Sfx.play('kill');
      });
    this.room.locked = false;
    this.room.cleared = true;
    this.chargeActive();
    this.updateMusic();
    if (this.floor >= MAX_FLOOR) {
      this.victoryT = 2.5;
      return;
    }
    this.room.trapdoor = { x: RW / 2, y: RH / 2 - 30 };
    this.placeReward(this.room.plan.items[0], RW / 2 - 140, RH / 2 + 60);
    this.room.pickups.push({ type: 'heart', x: RW / 2 + 140, y: RH / 2 + 60 });
  },
  chargeActive() {
    const a = this.player.active;
    if (a && a.charge < a.max) {
      a.charge++;
      if (a.charge === a.max) this.addText(this.player.x, this.player.y - 34, 'Objet actif prêt !', '#fde047', 14);
    }
  },
  dropCoin(x, y) {
    this.room.pickups.push({ type: 'coin', x, y, vx: rand(-140, 140), vy: rand(-140, 140) });
  },
  dropLoot(x, y, type) {
    this.room.pickups.push({ type, x, y, vx: rand(-160, 160), vy: rand(-160, 160) });
  },
  openChest(k) {
    const R = Math.random();
    k.open = true;
    Sfx.play('chest');
    this.spark(k.x, k.y - 10, k.gold ? '#fde047' : '#d6d3d1', 20, 200, 4);
    if (k.gold && R < 0.4 && this.pool.length) {
      this.room.pickups.push({ type: 'item', id: this.pool.pop(), x: k.x, y: k.y + 50 });
    } else if (k.gold && R < 0.6 && this.activePool.length) {
      const id = this.activePool.pop();
      this.room.pickups.push({ type: 'active', id, charge: ACTIVE_BY_ID[id].charge, x: k.x, y: k.y + 50 });
    } else {
      const n = k.gold ? randi(3, 5) : randi(2, 4);
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        this.dropLoot(k.x, k.y + 10, r < 0.45 ? 'coin' : r < 0.65 ? 'bomb' : r < 0.8 ? 'key' : 'heart');
      }
    }
  },

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
    this.inRun = false;
    this.dying = 0;
    const m = this.meta,
      st = m.stats,
      r = this.stats;
    const souls = Math.round((this.floor * 12 + r.kills + r.bosses * 25 + r.secrets * 10 + (win ? 100 : 0)) * (this.nightmare ? 1.5 : 1));
    m.souls += souls;
    st.kills += r.kills;
    st.bosses += r.bosses;
    st.time += r.time;
    st.secrets += r.secrets;
    st.elites += r.elites;
    st.bestFloor = Math.max(st.bestFloor, win ? MAX_FLOOR + 1 : this.floor);
    if (win) {
      st.wins++;
      if (this.nightmare) st.nightmareWins++;
      if (!st.fastWin || r.time < st.fastWin) st.fastWin = r.time;
      this.unlock('win');
      this.unlock('win_' + this.player.char.id);
      if (this.nightmare) this.unlock('nightmare');
      if (r.time < 720) this.unlock('fast');
    } else st.deaths++;
    const unlocks = [];
    for (const ch of CHARACTERS) {
      if (ch.unlock && !m.unlocked.includes(ch.id) && ch.unlock.check(m)) {
        m.unlocked.push(ch.id);
        unlocks.push(ch);
      }
    }
    const run = {
      floor: this.floor,
      kills: r.kills,
      bosses: r.bosses,
      secrets: r.secrets,
      time: r.time,
      win,
      nightmare: this.nightmare,
    };
    const entry = {
      score: computeScore(run),
      char: this.player.char.id,
      floor: this.floor,
      win,
      time: r.time,
      seed: this.seed,
      nightmare: this.nightmare,
      daily: this.daily,
      date: new Date().toISOString().slice(0, 10),
    };
    const rank = recordRun(m.board, entry);
    this.saveMeta();
    this.lastRun = {
      ...run,
      souls,
      score: entry.score,
      rank,
      seed: this.seed,
      daily: this.daily,
      items: this.player.items.slice(),
      unlocks,
      char: this.player.char,
    };
    this.setState(win ? 'credits' : 'dead');
    Sfx.play(win ? 'victory' : 'death');
    if (unlocks.length) this.later(0.9, () => Sfx.play('unlock'));
  },

  // ---------------- MISE À JOUR ----------------
  update(dt) {
    Input.gameplay = this.state === 'playing';
    Input.poll();
    this.t += dt;
    this.stateT += dt;
    this.fps = lerp(this.fps, 1 / Math.max(dt, 0.001), 0.05);
    this.fade = Math.max(0, this.fade - dt);
    this.updateAchToast(dt);
    Music.update();
    if (Input.act('mute')) Sfx.toggleMute();
    if (Input.act('fullscreen') && !this.seedEdit) this.toggleFullscreen();
    for (const m of this.menuEmbers) {
      m.y -= m.v * dt;
      if (m.y < -5) {
        m.y = H + 5;
        m.x = rand(0, W);
      }
    }
    if (this.state !== 'playing') {
      for (const d of this.delayed) {
        d.t -= dt;
        if (d.t <= 0) {
          d.done = true;
          d.fn();
        }
      }
      this.delayed = this.delayed.filter(d => !d.done);
    }

    if (this.state === 'playing') {
      if (Input.act('pause') && this.stateT > 0.1 && !this.dying) {
        this.setState('paused');
        return;
      }
      this.updatePlay(dt);
      return;
    }
    if (this.state === 'credits') {
      this.creditsT += dt;
      if ((Input.act('confirm') || Input.act('back') || Input.clicked) && this.stateT > 0.8) this.setState('victory');
      else if (this.creditsT > 30) this.setState('victory');
      return;
    }
    if (this.seedEdit) {
      this.updateSeedEdit();
      return;
    }
    if (this.state === 'paused' && Input.act('pause') && this.stateT > 0.1) {
      this.setState('playing');
      return;
    }
    this.updateMenuNav();
  },

  // Saisie de seed au clavier
  updateSeedEdit() {
    for (const ch of Input.typed) if (/[a-z0-9]/i.test(ch) && this.seedEdit.length < 12) this.seedEdit += ch.toUpperCase();
    if (Input.keys.has('Backspace') && Input.pressed.has('Backspace')) this.seedEdit = this.seedEdit.slice(0, -1);
    if (Input.pressed.has('Enter') || Input.pressed.has('NumpadEnter')) {
      this.runOpts.seed = sanitizeSeed(this.seedEdit);
      this.runOpts.daily = false;
      this.seedEdit = null;
      Sfx.play('click');
    } else if (Input.pressed.has('Escape')) {
      this.seedEdit = null;
      Sfx.play('click');
    }
  },
  editSeed() {
    if (Input.lastDevice === 'touch' || Input.lastDevice === 'pad') {
      const v = window.prompt('Seed de la partie (lettres et chiffres) :', this.runOpts.seed || '');
      if (v !== null) {
        this.runOpts.seed = sanitizeSeed(v);
        this.runOpts.daily = false;
      }
      return;
    }
    this.seedEdit = this.runOpts.seed || '';
  },

  updateMenuNav() {
    const B = this.buttons;
    if (Input.clicked) {
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (Input.mouse.x >= b.x && Input.mouse.x <= b.x + b.w && Input.mouse.y >= b.y && Input.mouse.y <= b.y + b.h) {
          this.focus = i;
          if (b.disabled) Sfx.play('deny');
          else {
            Sfx.play('click');
            b.action();
          }
          return;
        }
      }
    }
    if (!B.length) return;
    if (this.focus >= B.length) this.focus = 0;
    const cur = B[this.focus];
    const horiz = (Input.act('left') ? -1 : 0) + (Input.act('right') ? 1 : 0);
    if (horiz && cur && cur.onAdjust) {
      cur.onAdjust(horiz);
      Sfx.play('move');
    } else {
      const d = (Input.act('up') ? -1 : 0) + (Input.act('down') ? 1 : 0) + horiz;
      if (d) {
        this.focus = (this.focus + d + B.length) % B.length;
        Sfx.play('move');
      }
    }
    if (Input.act('confirm') && this.stateT > 0.4 && cur) {
      if (cur.disabled) Sfx.play('deny');
      else {
        Sfx.play('click');
        cur.action();
      }
      return;
    }
    if (Input.act('back') && this.stateT > 0.1) {
      if (this.state === 'paused') this.setState('playing');
      else if (this.state === 'settings') this.setState(this.settingsReturn);
      else if (this.state === 'controls') this.setState('settings');
      else if (['meta', 'codex', 'select'].includes(this.state)) this.setState('menu');
    }
  },

  updatePlay(rawDt) {
    const p = this.player,
      room = this.room;
    if (this.hitstop > 0) {
      this.hitstop -= rawDt;
      return;
    }
    let dt = rawDt;
    if (this.dying > 0) {
      this.dying -= rawDt;
      if (this.dying <= 0) {
        this.gameOver(false);
        return;
      }
      dt *= 0.3;
    } else if (this.slowT > 0) {
      this.slowT -= rawDt;
      dt *= 0.35;
    }
    // le sablier ralentit tout sauf le joueur
    if (this.timeWarp > 0) this.timeWarp -= rawDt;
    const edt = this.timeWarp > 0 ? dt * 0.35 : dt;

    if (!this.dying) this.stats.time += rawDt;
    this.updateFx(dt);
    for (const d of this.delayed) {
      d.t -= rawDt;
      if (d.t <= 0) {
        d.done = true;
        d.fn();
      }
    }
    this.delayed = this.delayed.filter(d => !d.done);

    if (this.trans) {
      this.trans.t += rawDt;
      if (!this.trans.done && this.trans.t >= 0.18) {
        this.trans.done = true;
        this.trans.action();
      }
      if (this.trans.t >= 0.36) this.trans = null;
      return;
    }
    if (this.victoryT > 0) {
      this.victoryT -= rawDt;
      if (this.victoryT <= 0) {
        this.gameOver(true);
        return;
      }
    }

    if (!this.dying) {
      p.update(dt, this);
      this.updateTutorial(dt);
    }

    // portes
    if (!room.locked && !this.dying) {
      const m = TILE * 0.42;
      for (const d in room.doors) {
        if (room.hidden[d]) continue;
        const out =
          (d === 'left' && p.x < m) || (d === 'right' && p.x > RW - m) || (d === 'up' && p.y < m) || (d === 'down' && p.y > RH - m);
        if (out) {
          const n = this.neighbor(room, d);
          this.trans = { t: 0, done: false, action: () => this.enterRoom(n, d) };
          Sfx.play('door');
          return;
        }
      }
    }

    this.fieldT -= dt;
    if (this.fieldT <= 0) {
      this.fieldT = 0.15;
      this.computeField();
    }

    // pointes
    if (room.spikes.length) {
      const before = this.spikeLevel();
      this.spikeT += edt;
      const lvl = this.spikeLevel();
      if (lvl === 1 && before < 1) Sfx.play('spike');
      if (lvl === 1 && !this.dying && room.spikeAt(p.x, p.y + 6)) p.hurt(1, this);
    }

    // ennemis
    for (const e of this.enemies) {
      e.update(edt, this);
      if (e.spawnT > 0 || e.dead) continue;
      const d = dist(e, p);
      if (!e.invuln && e.z < 25 && d < e.r + p.r * 0.75) p.hurt(e.contact, this);
      if (p.dashTime > 0 && p.dashDmg && !p.dashHit.has(e) && d < e.r + p.r + 6) {
        p.dashHit.add(e);
        this.damageEnemy(e, p.dmg * 2, e.x - p.x, e.y - p.y);
      }
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.boss || a.spawnT > 0) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.boss || b.spawnT > 0 || a.fly !== b.fly) continue;
        const d = dist(a, b),
          min = a.r + b.r;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2,
            nx = (b.x - a.x) / d,
            ny = (b.y - a.y) / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }

    // orbes
    if (p.orbitals > 0 && p.hp > 0) {
      for (let i = 0; i < p.orbitals; i++) {
        const a = this.t * 3 + (i * TAU) / p.orbitals,
          o = { x: p.x + Math.cos(a) * 48, y: p.y + Math.sin(a) * 48 };
        for (const e of this.enemies) {
          if (e.spawnT > 0 || e.dead || e.invuln || e.orbCd > 0) continue;
          if (dist(e, o) < e.r + 10) {
            e.orbCd = 0.3;
            this.damageEnemy(e, 2 + p.dmg * 0.5, e.x - p.x, e.y - p.y);
          }
        }
        for (const b of this.bullets)
          if (!b.friendly && !b.dead && dist(b, o) < b.r + 10) {
            b.dead = true;
            this.spark(b.x, b.y, '#a5b4fc', 4, 80, 2);
          }
      }
    }

    this.updateBullets(dt, edt);

    // bombes
    for (const b of this.bombs) {
      b.t -= dt;
      if (Math.random() < 0.3)
        this.particles.push({
          x: b.x + 10,
          y: b.y - 22,
          vx: rand(-20, 20),
          vy: rand(-60, -20),
          life: 0.3,
          max: 0.3,
          size: 2.5,
          color: '#fde047',
        });
      if (b.t <= 0) {
        b.dead = true;
        this.explode(b.x, b.y, b.r, (b.big ? 30 : 14) + this.floor * 3, true);
      }
    }
    this.bombs = this.bombs.filter(b => !b.dead);

    // dangers : pierres qui tombent et bombes lancées
    for (const h of this.hazards) {
      h.t -= edt;
      if (h.t <= 0) {
        h.dead = true;
        if (h.kind === 'lob') {
          Sfx.play('boom');
          this.spark(h.x, h.y, '#fb923c', 22, 240, 4, 0.5);
          this.particles.push({ x: h.x, y: h.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: h.r, color: '#fed7aa', ring: true });
          this.shake(5);
        } else {
          this.shake(4);
          this.spark(h.x, h.y, '#a8a29e', 12, 180, 4);
        }
        if (dist(h, p) < h.r + p.r * 0.6) p.hurt(1, this);
      }
    }
    this.hazards = this.hazards.filter(h => !h.dead);
    this.enemies = this.enemies.filter(e => !e.dead);

    if (!this.dying) this.updatePickups(dt);

    // salle nettoyée
    if (room.locked && this.enemies.length === 0) this.onRoomCleared();

    // trappe
    if (room.trapdoor && !this.dying && dist(room.trapdoor, p) < 28) {
      room.trapdoor = null;
      Sfx.play('stairs');
      this.trans = {
        t: 0,
        done: false,
        action: () => {
          this.floor++;
          this.loadFloor();
        },
      };
    }

    if (p.coins >= 50) this.unlock('rich');
    if (p.hp > 0 && p.hp <= 2) {
      this.hbT -= rawDt;
      if (this.hbT <= 0) {
        this.hbT = 1;
        Sfx.play('heartbeat');
      }
    }
    if (Input.act('map')) this.bigMap = !this.bigMap;
  },
  spikeLevel() {
    const ph = this.spikeT % SPIKE_CYCLE;
    if (ph < 1.4) return 0;
    if (ph < 1.8) return 0.35;
    return 1;
  },
  onRoomCleared() {
    const room = this.room,
      p = this.player;
    if (room.type === 'challenge' && room.waveIdx < room.plan.waves.length - 1) {
      room.waveIdx++;
      this.spawnWave(room.plan.waves[room.waveIdx]);
      this.banner = { title: `Vague ${room.waveIdx + 1}`, sub: 'Défi', t: 1.6, boss: true };
      Sfx.play('wave');
      return;
    }
    room.locked = false;
    room.cleared = true;
    Sfx.play('clear');
    this.chargeActive();
    if (room.type === 'challenge') {
      this.unlock('challenge');
      this.placeReward(room.plan.items[0], RW / 2, RH / 2);
      room.pickups.push({ type: 'chest', gold: true, x: RW / 2, y: RH / 2 + 110 });
      this.toast = { icon: '⚔️', title: 'Défi réussi !', desc: 'La salle te récompense.', t: 2.6 };
    } else if (room.type === 'normal') {
      const r = Math.random(),
        luck = p.luck,
        c = { x: RW / 2, y: RH / 2 };
      if (r < 0.1 + luck * 0.05) room.pickups.push({ type: 'heart', ...c });
      else if (r < 0.18 + luck * 0.05) room.pickups.push({ type: 'bomb', ...c });
      else if (r < 0.26 + luck * 0.05) room.pickups.push({ type: 'key', ...c });
      else if (r < 0.32 + luck * 0.05) room.pickups.push({ type: 'chest', gold: false, ...c });
      else if (r < 0.35 + luck * 0.05) room.pickups.push({ type: 'chest', gold: true, ...c });
      else if (r < 0.62 + luck * 0.1) for (let i = randi(1, 2 + luck); i > 0; i--) this.dropCoin(c.x, c.y);
    }
    this.updateMusic();
  },

  updateBullets(dt, edt) {
    const p = this.player,
      room = this.room;
    const solid = (x, y) => room.solidFor(Math.floor(x / TILE), Math.floor(y / TILE), false);
    for (const b of this.bullets) {
      if (b.dead) continue;
      const bdt = b.friendly ? dt : edt;
      b.life -= bdt;
      if (b.friendly && b.homing) {
        let best = null,
          bd = 380;
        for (const e of this.enemies) {
          if (e.spawnT > 0 || e.dead) continue;
          const d = dist(b, e);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (best) {
          const cur = Math.atan2(b.vy, b.vx),
            want = angle(b, best);
          const diff = ((want - cur + Math.PI * 3) % TAU) - Math.PI;
          const na = cur + clamp(diff, -7 * bdt, 7 * bdt),
            sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }
      }
      const nx = b.x + b.vx * bdt,
        ny = b.y + b.vy * bdt;
      if (solid(nx, ny)) {
        if (b.bounces > 0) {
          b.bounces--;
          const sx = solid(nx, b.y),
            sy = solid(b.x, ny);
          if (sx) b.vx *= -1;
          if (sy) b.vy *= -1;
          if (!sx && !sy) {
            b.vx *= -1;
            b.vy *= -1;
          }
        } else {
          this.killBullet(b);
          continue;
        }
      } else {
        b.x = nx;
        b.y = ny;
      }
      if (b.life <= 0) {
        this.killBullet(b);
        continue;
      }
      if (b.friendly) {
        for (const e of this.enemies) {
          if (e.spawnT > 0 || e.dead || e.invuln || e.z > 30) continue;
          if (b.hit && b.hit.has(e)) continue;
          if (dist(b, e) < e.r + b.r) {
            this.damageEnemy(e, b.dmg, b.vx, b.vy);
            if (b.pierce) b.hit.add(e);
            else {
              this.killBullet(b);
              break;
            }
          }
        }
      } else if (dist(b, p) < p.r * 0.7 + b.r && p.canBeHit()) {
        p.hurt(1, this);
        b.dead = true;
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
    const p = this.player,
      room = this.room;
    for (const k of room.pickups) {
      if (k.vx !== undefined) {
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        const fr = Math.pow(0.02, dt);
        k.vx *= fr;
        k.vy *= fr;
        k.x = clamp(k.x, TILE + 10, RW - TILE - 10);
        k.y = clamp(k.y, TILE + 10, RH - TILE - 10);
      }
      const d = dist(k, p);
      if (k.cool && d > 60) k.cool = false;
      switch (k.type) {
        case 'coin':
          if (d < 90) {
            const a = angle(k, p);
            k.x += Math.cos(a) * 320 * dt;
            k.y += Math.sin(a) * 320 * dt;
          }
          if (d < p.r + 10) {
            k.dead = true;
            p.coins++;
            Sfx.play('coin');
            this.addText(p.x, p.y - 24, '+1', '#fbbf24');
          }
          break;
        case 'bomb':
        case 'key':
          if (d < p.r + 14) {
            k.dead = true;
            if (k.type === 'bomb') p.bombs++;
            else p.keys++;
            Sfx.play('coin');
            this.addText(p.x, p.y - 24, k.type === 'bomb' ? '+1 bombe' : '+1 clé', '#e5e7eb');
          }
          break;
        case 'heart':
          if (d < p.r + 12 && p.hp < p.maxHp) {
            k.dead = true;
            p.hp = Math.min(p.maxHp, p.hp + 2);
            Sfx.play('heart');
            this.spark(k.x, k.y, '#ef4444', 12, 140, 3);
          }
          break;
        case 'item':
          if (d < p.r + 18) {
            k.dead = true;
            this.giveItem(k.id);
          }
          break;
        case 'active':
          if (d < p.r + 18 && !k.cool) {
            k.dead = true;
            this.giveActive(k);
          }
          break;
        case 'chest':
          k.denyT = (k.denyT || 0) - dt;
          if (!k.open && d < p.r + 24 && k.denyT <= 0) {
            if (k.gold && p.keys <= 0) {
              k.denyT = 1.2;
              Sfx.play('locked');
              this.addText(k.x, k.y - 40, 'Il faut une clé', '#fca5a5', 15);
            } else {
              if (k.gold) p.keys--;
              this.openChest(k);
            }
          }
          break;
        case 'shop':
          k.denyT = (k.denyT || 0) - dt;
          if (d < p.r + 18 && k.denyT <= 0) this.buy(k);
          break;
      }
    }
    room.pickups = room.pickups.filter(k => !k.dead);
  },
  buy(k) {
    const p = this.player;
    const full = k.kind === 'heart' && p.hp >= p.maxHp;
    if (p.coins < k.price || full) {
      k.denyT = 1.2;
      Sfx.play('deny');
      this.addText(k.x, k.y - 40, full ? 'Déjà en pleine forme' : "Pas assez d'or", '#fca5a5', 15);
      return;
    }
    p.coins -= k.price;
    k.dead = true;
    Sfx.play('buy');
    if (k.kind === 'heart') {
      p.hp = Math.min(p.maxHp, p.hp + 2);
      this.spark(k.x, k.y, '#ef4444', 12, 140, 3);
    } else if (k.kind === 'bomb') p.bombs++;
    else if (k.kind === 'key') p.keys++;
    else if (k.kind === 'active') this.giveActive({ id: k.id, x: k.x, y: k.y });
    else this.giveItem(k.id);
  },

  updateFx(dt) {
    for (const q of this.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= Math.pow(0.05, dt);
      q.vy *= Math.pow(0.05, dt);
      q.life -= dt;
    }
    this.particles = this.particles.filter(q => q.life > 0);
    for (const q of this.texts) {
      q.y -= 40 * dt;
      q.life -= dt;
    }
    this.texts = this.texts.filter(q => q.life > 0);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    this.flash = Math.max(0, this.flash - dt);
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
    }
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
  },
};
