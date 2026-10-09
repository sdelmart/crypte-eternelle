// Dimensions logiques
export const TILE = 64,
  COLS = 15,
  ROWS = 9,
  W = 960,
  H = 640,
  HUD_H = 64;
export const RW = COLS * TILE,
  RH = ROWS * TILE;
export const view = { scale: 1 };

export const DOORS = {
  up: { tx: 7, ty: 0, dx: 0, dy: -1 },
  down: { tx: 7, ty: 8, dx: 0, dy: 1 },
  left: { tx: 0, ty: 4, dx: -1, dy: 0 },
  right: { tx: 14, ty: 4, dx: 1, dy: 0 },
};
export const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const DIRS = ['up', 'down', 'left', 'right'];
export const TAU = Math.PI * 2;

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const choice = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const lerp = (a, b, t) => a + (b - a) * t;

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Générateur pseudo-aléatoire reproductible, avec les mêmes helpers que le hasard global. */
export function makeRng(seed) {
  const next = mulberry32(seed >>> 0);
  return {
    next,
    rand: (a, b) => a + next() * (b - a),
    randi: (a, b) => Math.floor(a + next() * (b - a + 1)),
    chance: p => next() < p,
    choice: arr => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/** Hachage FNV-1a d'une chaîne vers un entier 32 bits. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomSeed(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  return s;
}
export function sanitizeSeed(str) {
  return String(str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}
export function dailySeed(date = new Date()) {
  const y = date.getFullYear(),
    m = String(date.getMonth() + 1).padStart(2, '0'),
    d = String(date.getDate()).padStart(2, '0');
  return `JOUR${y}${m}${d}`;
}

export const Store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* stockage indisponible */
    }
  },
};

// Collision cercle / grille de tuiles
export function resolveTiles(e, room, fly) {
  let hit = false;
  const r = e.r;
  const x0 = Math.floor((e.x - r) / TILE),
    x1 = Math.floor((e.x + r) / TILE);
  const y0 = Math.floor((e.y - r) / TILE),
    y1 = Math.floor((e.y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!room.solidFor(tx, ty, fly)) continue;
      const bx = tx * TILE,
        by = ty * TILE;
      const cx = clamp(e.x, bx, bx + TILE),
        cy = clamp(e.y, by, by + TILE);
      const dx = e.x - cx,
        dy = e.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.x += (dx / d) * (r - d);
        e.y += (dy / d) * (r - d);
      } else {
        const l = e.x - bx,
          rr = bx + TILE - e.x,
          t = e.y - by,
          b = by + TILE - e.y;
        const m = Math.min(l, rr, t, b);
        if (m === l) e.x = bx - r;
        else if (m === rr) e.x = bx + TILE + r;
        else if (m === t) e.y = by - r;
        else e.y = by + TILE + r;
      }
    }
  }
  return hit;
}

export function moveEntity(e, dx, dy, room, fly) {
  let hit = false;
  // sous-pas pour éviter de traverser les murs à grande vitesse
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (e.r * 0.8)));
  for (let i = 0; i < steps; i++) {
    e.x += dx / steps;
    if (resolveTiles(e, room, fly)) hit = true;
    e.y += dy / steps;
    if (resolveTiles(e, room, fly)) hit = true;
  }
  return hit;
}

export function lineClear(a, b, room, fly) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.ceil(d / 16);
  for (let i = 1; i < n; i++) {
    const x = lerp(a.x, b.x, i / n),
      y = lerp(a.y, b.y, i / n);
    if (room.solidFor(Math.floor(x / TILE), Math.floor(y / TILE), fly)) return false;
  }
  return true;
}
