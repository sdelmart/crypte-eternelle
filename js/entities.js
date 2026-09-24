'use strict';
class Player {
  constructor(char = CHARACTERS[0]) {
    Object.assign(this, {
      x: RW / 2, y: RH / 2, r: 14, vx: 0, vy: 0,
      hp: 6, maxHp: 6, speed: 250, dmg: 3.5, fireDelay: 0.32, shotSpeed: 560, range: 0.7, shotSize: 6,
      multishot: 1, pierce: false, homing: false, bounce: false, explosive: false, lifesteal: 0, crit: 0,
      orbitals: 0, dashDmg: false, luck: 0, rage: false, backshot: false, bombs: 1,
      coins: 0, items: [], fireT: 0, dashT: 0, dashTime: 0, dashCooldown: 0.9, dashDir: { x: 1, y: 0 },
      iframes: 0, aim: 0, moving: false, dashHit: new Set(), walkT: 0,
    }, char.stats);
    this.char = char;
    this.hp = this.maxHp;
  }
  canBeHit() { return this.hp > 0 && this.iframes <= 0 && this.dashTime <= 0; }
  update(dt, g) {
    let mx = (Input.down('KeyD') ? 1 : 0) - (Input.down('KeyA') ? 1 : 0);
    let my = (Input.down('KeyS') ? 1 : 0) - (Input.down('KeyW') ? 1 : 0);
    let ml = Math.hypot(mx, my);
    if (ml) { mx /= ml; my /= ml; }
    const pm = Input.pad.move, pml = Math.hypot(pm.x, pm.y);
    if (pml > ml) { const k = Math.min(1, pml) / pml; mx = pm.x * k; my = pm.y * k; ml = Math.min(1, pml); }
    this.moving = ml > 0;
    if (this.moving) this.walkT += dt;

    const ax = (Input.down('ArrowRight') ? 1 : 0) - (Input.down('ArrowLeft') ? 1 : 0);
    const ay = (Input.down('ArrowDown') ? 1 : 0) - (Input.down('ArrowUp') ? 1 : 0);
    const pa = Input.pad.aim;
    let shooting = false;
    if (ax || ay) { this.aim = Math.atan2(ay, ax); shooting = true; }
    else if (Math.hypot(pa.x, pa.y) > 0.35) { this.aim = Math.atan2(pa.y, pa.x); shooting = true; }
    else if (Input.lastDevice !== 'pad') { this.aim = Math.atan2(Input.mouse.y - HUD_H - this.y, Input.mouse.x - this.x); shooting = Input.mouse.down; }
    else if (this.moving) this.aim = Math.atan2(my, mx);

    this.dashT -= dt;
    if (Input.act('dash') && this.dashT <= 0) {
      this.dashDir = ml ? { x: mx / ml, y: my / ml } : { x: Math.cos(this.aim), y: Math.sin(this.aim) };
      this.dashTime = 0.17; this.dashT = this.dashCooldown; this.dashHit.clear();
      Sfx.play('dash');
    }
    if (Input.act('bomb')) {
      if (this.bombs > 0) { this.bombs--; g.bombs.push({ x: this.x, y: this.y + 4, t: 1.5, max: 1.5 }); Sfx.play('place'); }
      else Sfx.play('deny');
    }
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashDir.x * 820; this.vy = this.dashDir.y * 820;
      g.particles.push({ x: this.x, y: this.y, vx: 0, vy: 0, life: 0.2, max: 0.2, size: this.r, color: this.char.body, ghost: true });
    } else {
      const k = 1 - Math.exp(-dt * 14);
      this.vx += (mx * this.speed - this.vx) * k;
      this.vy += (my * this.speed - this.vy) * k;
    }
    moveEntity(this, this.vx * dt, this.vy * dt, g.room, false);
    this.iframes -= dt; this.fireT -= dt;
    if (shooting && this.fireT <= 0) { this.fireT = this.fireDelay; this.fire(g); }
  }
  fire(g) {
    const n = this.multishot, spread = 0.2, angles = [];
    for (let i = 0; i < n; i++) angles.push(this.aim + (i - (n - 1) / 2) * spread);
    if (this.backshot) angles.push(this.aim + Math.PI);
    const color = this.explosive ? '#fb923c' : this.homing ? '#f0abfc' : this.char.shot;
    for (const a of angles) {
      g.bullets.push({
        friendly: true, x: this.x + Math.cos(a) * this.r, y: this.y + Math.sin(a) * this.r,
        vx: Math.cos(a) * this.shotSpeed, vy: Math.sin(a) * this.shotSpeed,
        r: this.shotSize, dmg: this.dmg, life: this.range, pierce: this.pierce, hit: this.pierce ? new Set() : null,
        homing: this.homing, bounces: this.bounce ? 3 : 0, explosive: this.explosive, color,
      });
    }
    Sfx.play('shoot');
  }
  hurt(n, g) {
    if (!this.canBeHit()) return;
    this.hp = Math.max(0, this.hp - n); this.iframes = 1.1;
    g.shake(10); g.flash = 0.4; g.hitstop = 0.06;
    Sfx.play('hurt');
    g.spark(this.x, this.y, '#ef4444', 18, 220, 4);
    if (this.hp <= 0) g.startDeath();
  }
}

const ENEMIES = {
  slime:    { name: 'Gluant', hp: 10, r: 15, speed: 85, color: '#5fd068', ai: 'chase', body: 'slime' },
  bigslime: { name: 'Gros gluant', hp: 26, r: 24, speed: 58, color: '#a855f7', ai: 'chase', body: 'slime', split: true },
  bat:      { hp: 6, r: 12, speed: 150, color: '#7c5c9e', ai: 'bat', fly: true, body: 'bat' },
  archer:   { hp: 12, r: 15, speed: 75, color: '#d9cfae', ai: 'archer', body: 'archer' },
  charger:  { hp: 18, r: 18, speed: 60, color: '#c2553a', ai: 'charger', body: 'charger' },
  spinner:  { hp: 20, r: 17, speed: 45, color: '#f59e0b', ai: 'spinner', body: 'spinner' },
  ghost:    { hp: 14, r: 15, speed: 70, color: '#cbd5e1', ai: 'ghost', fly: true, body: 'ghost' },
};
const BOSSES = {
  kingslime: { name: 'Le Roi Gluant', hp: 170, r: 46, color: '#5fd068', ai: 'kingslime', body: 'kingslime', contact: 2 },
  eye:       { name: 'L\'Œil du Néant', hp: 210, r: 38, color: '#f1f1f1', ai: 'eye', body: 'eye', fly: true, contact: 2, speed: 60 },
  golem:     { name: 'Le Golem Ancien', hp: 260, r: 42, color: '#8a8f98', ai: 'golem', body: 'golem', contact: 2 },
  lich:      { name: 'La Liche Éternelle', hp: 360, r: 30, color: '#a78bfa', ai: 'lich', body: 'lich', fly: true, contact: 2 },
};
const ENEMY_POOLS = [
  ['slime', 'slime', 'bat', 'archer', 'bigslime'],
  ['slime', 'bat', 'archer', 'charger', 'spinner', 'bigslime'],
  ['bat', 'archer', 'charger', 'spinner', 'ghost', 'bigslime'],
  ['archer', 'charger', 'spinner', 'ghost', 'bigslime', 'bat'],
  ['charger', 'spinner', 'ghost', 'archer', 'bigslime', 'bat'],
];

class Enemy {
  constructor(type, x, y, floor, isBoss, elite = false) {
    const def = isBoss ? BOSSES[type] : ENEMIES[type];
    const scale = (isBoss ? 1 + 0.22 * (floor - 1) : 1 + 0.28 * (floor - 1)) * (elite ? 2.2 : 1);
    Object.assign(this, {
      type, def, x, y, r: def.r, hp: def.hp * scale, maxHp: def.hp * scale,
      speed: (def.speed || 0) * (1 + 0.05 * (floor - 1)), fly: !!def.fly, contact: def.contact || 1,
      ai: def.ai, boss: !!isBoss, t: 0, state: 'idle', timer: rand(0.8, 1.8), pt: 0, cnt: 0,
      vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, spawnT: isBoss ? 1.2 : 0.7, spawnMax: isBoss ? 1.2 : 0.7,
      z: 0, seed: rand(0, 100), dirSign: Math.random() < 0.5 ? -1 : 1, orbCd: 0, alpha: 1,
      invuln: false, dead: false, hitWall: false, elite,
    });
    if (elite) { this.r *= 1.2; this.speed *= 1.1; }
  }
  update(dt, g) {
    if (this.spawnT > 0) { this.spawnT -= dt; return; }
    this.t += dt; this.flash -= dt; this.orbCd -= dt;
    AI[this.ai](this, dt, g);
    const decay = Math.pow(0.002, dt);
    this.kx *= decay; this.ky *= decay;
    this.hitWall = moveEntity(this, (this.vx + this.kx) * dt, (this.vy + this.ky) * dt, g.room, this.fly);
  }
}

function chaseDir(e, g) {
  const p = g.player;
  const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
  const toP = () => { const a = angle(e, p); return { x: Math.cos(a), y: Math.sin(a) }; };
  if (e.fly || lineClear(e, p, g.room, false)) return toP();
  const f = g.field;
  let best = null, bd = f[ty * COLS + tx];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = tx + dx, ny = ty + dy;
    if (g.room.solidFor(nx, ny, false)) continue;
    if (dx && dy && (g.room.solidFor(tx + dx, ty, false) || g.room.solidFor(tx, ty + dy, false))) continue;
    const v = f[ny * COLS + nx];
    if (v < bd) { bd = v; best = { x: (nx + 0.5) * TILE, y: (ny + 0.5) * TILE }; }
  }
  if (!best) return toP();
  const a = angle(e, best);
  return { x: Math.cos(a), y: Math.sin(a) };
}

const AI = {
  chase(e, dt, g) {
    const d = chaseDir(e, g);
    e.vx = d.x * e.speed; e.vy = d.y * e.speed;
  },
  bat(e, dt, g) {
    const a = angle(e, g.player) + Math.sin(e.t * 3 + e.seed) * 1.2;
    e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed;
  },
  archer(e, dt, g) {
    const p = g.player, d = dist(e, p);
    e.timer -= dt;
    if (e.state === 'aim') {
      e.vx *= 0.8; e.vy *= 0.8;
      if (e.timer <= 0) {
        const a = angle(e, p);
        g.enemyShot(e.x, e.y, a, 270);
        if (g.floor >= 3) { g.enemyShot(e.x, e.y, a - 0.25, 270); g.enemyShot(e.x, e.y, a + 0.25, 270); }
        e.state = 'move'; e.timer = rand(1.6, 2.4);
      }
      return;
    }
    let dx, dy;
    if (d < 210) { const a = angle(p, e); dx = Math.cos(a); dy = Math.sin(a); }
    else if (d > 380) { const c = chaseDir(e, g); dx = c.x; dy = c.y; }
    else { const a = angle(e, p) + (Math.PI / 2) * e.dirSign; dx = Math.cos(a); dy = Math.sin(a); }
    if (e.hitWall) e.dirSign *= -1;
    e.vx = dx * e.speed; e.vy = dy * e.speed;
    if (e.timer <= 0 && lineClear(e, p, g.room, false)) { e.state = 'aim'; e.timer = 0.45; }
  },
  charger(e, dt, g) {
    const p = g.player;
    e.timer -= dt;
    if (e.state === 'windup') {
      e.vx = e.vy = 0; e.ca = angle(e, p);
      if (e.timer <= 0) { e.state = 'charge'; e.timer = 0.8; }
    } else if (e.state === 'charge') {
      e.vx = Math.cos(e.ca) * 470; e.vy = Math.sin(e.ca) * 470;
      if (e.hitWall || e.timer <= 0) {
        if (e.hitWall) { g.shake(4); g.spark(e.x, e.y, '#a8a29e', 8, 120, 3); }
        e.state = 'rest'; e.timer = 0.7; e.vx = e.vy = 0;
      }
    } else if (e.state === 'rest') {
      if (e.timer <= 0) { e.state = 'idle'; e.timer = rand(1, 2); }
    } else {
      const c = chaseDir(e, g);
      e.vx = c.x * e.speed; e.vy = c.y * e.speed;
      if (e.timer <= 0 && dist(e, p) < 420 && lineClear(e, p, g.room, false)) { e.state = 'windup'; e.timer = 0.55; }
    }
  },
  spinner(e, dt, g) {
    e.timer -= dt; e.wt = (e.wt || 0) - dt;
    if (e.wt <= 0 || e.hitWall) { e.wd = rand(0, TAU); e.wt = rand(1, 2); }
    e.vx = Math.cos(e.wd) * e.speed; e.vy = Math.sin(e.wd) * e.speed;
    if (e.timer <= 0) {
      const n = g.floor >= 3 ? 10 : 8;
      for (let i = 0; i < n; i++) g.enemyShot(e.x, e.y, e.t * 0.7 + (i * TAU) / n, 180, 7, '#fbbf24');
      e.timer = 2.3;
    }
  },
  ghost(e, dt, g) {
    const a = angle(e, g.player);
    e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed;
    e.timer -= dt;
    if (e.timer <= 0) { g.enemyShot(e.x, e.y, a, 230, 8, '#a5f3fc'); e.timer = rand(2.4, 3.4); }
  },

  // ---------- BOSS ----------
  kingslime(e, dt, g) {
    const p = g.player, ph2 = e.hp < e.maxHp * 0.5;
    e.vx = e.vy = 0;
    if (e.state === 'jump') {
      e.jt += dt;
      const k = Math.min(1, e.jt / e.jd);
      e.x = lerp(e.sx, e.tx, k); e.y = lerp(e.sy, e.ty, k);
      e.z = Math.sin(k * Math.PI) * 150;
      if (k >= 1) {
        e.z = 0; e.state = 'idle'; e.timer = ph2 ? 0.5 : 0.85;
        const n = ph2 ? 20 : 14, off = rand(0, 1);
        for (let i = 0; i < n; i++) g.enemyShot(e.x, e.y, off + (i * TAU) / n, 200, 8, '#86efac');
        g.shake(12); Sfx.play('boom'); g.spark(e.x, e.y + e.r * 0.5, '#5fd068', 24, 260, 5);
        e.cnt++;
        if (e.cnt % 3 === 0 && g.enemies.length < 7) {
          for (let i = 0; i < (ph2 ? 3 : 2); i++) g.spawnEnemy('slime', e.x + rand(-60, 60), e.y + rand(-40, 40), 0.3);
        }
      }
      return;
    }
    e.timer -= dt;
    if (e.timer <= 0) {
      e.state = 'jump'; e.jt = 0; e.jd = ph2 ? 0.6 : 0.78;
      e.sx = e.x; e.sy = e.y;
      e.tx = clamp(p.x + rand(-40, 40), TILE + e.r, RW - TILE - e.r);
      e.ty = clamp(p.y + rand(-40, 40), TILE + e.r, RH - TILE - e.r);
    }
  },
  eye(e, dt, g) {
    const p = g.player, ph2 = e.hp < e.maxHp * 0.5;
    if (!e.goal || dist(e, e.goal) < 20) e.goal = { x: rand(TILE * 2.5, RW - TILE * 2.5), y: rand(TILE * 2, RH - TILE * 2) };
    const a = angle(e, e.goal);
    e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed;
    e.timer -= dt; e.pt -= dt;
    switch (e.state) {
      case 'spiral':
        if (e.pt <= 0) {
          e.pt = ph2 ? 0.07 : 0.1;
          const arms = ph2 ? 3 : 2;
          for (let k = 0; k < arms; k++) g.enemyShot(e.x, e.y, e.t * 2.4 + (k * TAU) / arms, 200, 7, '#f472b6');
        }
        break;
      case 'aimed':
        if (e.pt <= 0) {
          e.pt = 0.6;
          const b = angle(e, p), n = ph2 ? 7 : 5;
          for (let i = 0; i < n; i++) g.enemyShot(e.x, e.y, b + (i - (n - 1) / 2) * 0.16, 300, 7, '#f43f5e');
        }
        break;
      case 'ring':
        if (e.pt <= 0) {
          e.pt = 0.7; e.cnt++;
          const n = ph2 ? 22 : 16;
          for (let i = 0; i < n; i++) g.enemyShot(e.x, e.y, ((i + (e.cnt % 2) * 0.5) * TAU) / n, 170, 8, '#c084fc');
        }
        break;
      default:
        if (e.timer <= 0) {
          e.state = choice(['spiral', 'aimed', 'ring']);
          e.timer = { spiral: 3.2, aimed: 2.4, ring: 2.4 }[e.state]; e.pt = 0; e.cnt = 0;
        }
        return;
    }
    if (e.timer <= 0) { e.state = 'idle'; e.timer = ph2 ? 0.6 : 1.1; }
  },
  golem(e, dt, g) {
    const p = g.player, ph2 = e.hp < e.maxHp * 0.5;
    e.timer -= dt;
    switch (e.state) {
      case 'windup':
        e.vx = e.vy = 0; e.ca = angle(e, p);
        if (e.timer <= 0) { e.state = 'charge'; e.timer = 1.6; }
        break;
      case 'charge':
        e.vx = Math.cos(e.ca) * (ph2 ? 600 : 500); e.vy = Math.sin(e.ca) * (ph2 ? 600 : 500);
        if (Math.random() < 0.5) g.particles.push({ x: e.x + rand(-20, 20), y: e.y + e.r * 0.7, vx: rand(-30, 30), vy: rand(-40, 0), life: 0.5, max: 0.5, size: 5, color: '#78716c' });
        if (e.hitWall) {
          e.state = 'stun'; e.timer = 1.1; e.vx = e.vy = 0;
          g.shake(16); Sfx.play('boom');
          const n = ph2 ? 16 : 12, off = rand(0, 1);
          for (let i = 0; i < n; i++) g.enemyShot(e.x, e.y, off + (i * TAU) / n, 190, 9, '#a8a29e');
          // pluie de pierres
          for (let i = 0; i < (ph2 ? 8 : 5); i++) g.fallingRock(rand(TILE * 1.5, RW - TILE * 1.5), rand(TILE * 1.5, RH - TILE * 1.5));
        } else if (e.timer <= 0) { e.state = 'idle'; e.timer = 1.4; }
        break;
      case 'stun':
        e.vx = e.vy = 0;
        if (e.timer <= 0) { e.state = 'idle'; e.timer = rand(1.4, 2.2); }
        break;
      case 'slamwind':
        e.vx = e.vy = 0;
        if (e.timer <= 0) { e.state = 'slam'; e.timer = 1.3; e.cnt = 0; e.pt = 0; }
        break;
      case 'slam':
        e.pt -= dt;
        if (e.pt <= 0 && e.cnt < 3) {
          e.pt = 0.35; e.cnt++;
          const n = 18;
          for (let i = 0; i < n; i++) g.enemyShot(e.x, e.y, e.cnt * 0.17 + (i * TAU) / n, 150 + e.cnt * 35, 8, '#fdba74');
          g.shake(7); Sfx.play('boom');
        }
        if (e.timer <= 0) { e.state = 'idle'; e.timer = 1.8; }
        break;
      default: {
        const a = angle(e, p), s = ph2 ? 90 : 65;
        e.vx = Math.cos(a) * s; e.vy = Math.sin(a) * s;
        if (e.timer <= 0) {
          e.nextSlam = !e.nextSlam;
          e.state = e.nextSlam ? 'slamwind' : 'windup';
          e.timer = e.state === 'windup' ? 0.7 : 0.6;
        }
      }
    }
  },
  lich(e, dt, g) {
    const p = g.player, ph2 = e.hp < e.maxHp * 0.5;
    e.timer -= dt; e.pt -= dt;
    e.vx = Math.cos(e.t * 0.9) * 40; e.vy = Math.sin(e.t * 1.3) * 30;
    switch (e.state) {
      case 'tele': {
        const k = e.timer / 0.9;
        e.alpha = k > 0.5 ? (k - 0.5) * 2 : (0.5 - k) * 2;
        e.invuln = e.alpha < 0.5;
        if (k <= 0.5 && !e.moved) {
          e.moved = true;
          for (let i = 0; i < 30; i++) {
            const x = rand(TILE * 2, RW - TILE * 2), y = rand(TILE * 2, RH - TILE * 2);
            if (Math.hypot(x - p.x, y - p.y) > 260) { e.x = x; e.y = y; break; }
          }
        }
        if (e.timer <= 0) { e.alpha = 1; e.invuln = false; e.state = 'idle'; e.timer = 0.5; }
        break;
      }
      case 'summon':
        if (e.pt <= 0 && !e.done) {
          e.done = true;
          for (let i = 0; i < 3; i++) g.spawnEnemy(ph2 && i === 0 ? 'ghost' : 'bat', e.x + Math.cos(i * 2.1) * 70, e.y + Math.sin(i * 2.1) * 70, 0.5);
        }
        if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.8; }
        break;
      case 'barrage':
        if (e.pt <= 0) {
          e.pt = ph2 ? 0.35 : 0.45;
          const b = angle(e, p);
          for (let i = 0; i < 7; i++) g.enemyShot(e.x, e.y, b + (i - 3) * 0.13, 290, 7, '#a78bfa');
        }
        if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.7; }
        break;
      case 'nova':
        if (e.pt <= 0) {
          e.pt = ph2 ? 0.09 : 0.12;
          for (let k = 0; k < 4; k++) {
            g.enemyShot(e.x, e.y, e.t * 2 + (k * TAU) / 4, 190, 7, '#e879f9');
            if (ph2) g.enemyShot(e.x, e.y, -e.t * 2 + (k * TAU) / 4, 160, 7, '#818cf8');
          }
        }
        if (e.timer <= 0) { e.state = 'idle'; e.timer = 0.8; }
        break;
      default:
        e.alpha = 1;
        if (e.timer <= 0) {
          e.state = choice(['tele', 'summon', 'barrage', 'nova', 'barrage', 'nova']);
          if (e.state === 'summon' && g.enemies.length > 5) e.state = 'nova';
          e.timer = { tele: 0.9, summon: 1.2, barrage: 2, nova: 2.6 }[e.state];
          e.pt = e.state === 'summon' ? 0.4 : 0; e.moved = false; e.done = false;
          if (e.state === 'tele') Sfx.play('dash');
        }
    }
  },
};
