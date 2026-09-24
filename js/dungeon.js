'use strict';
const THEMES = [
  { name: 'Les Caves',  floor: '#26222f', floor2: '#2a2634', wall: '#3a3250', wallTop: '#5b4f78', rock: '#575066', rockHi: '#7a7290', accent: '#6ee7b7' },
  { name: 'La Crypte',  floor: '#1d2824', floor2: '#212e29', wall: '#2c463b', wallTop: '#4c7563', rock: '#48584f', rockHi: '#6c8579', accent: '#a3e635' },
  { name: 'Les Forges', floor: '#2b1e1b', floor2: '#31221e', wall: '#522d27', wallTop: '#8a4a3a', rock: '#5e4640', rockHi: '#86645a', accent: '#fb923c' },
  { name: 'Le Glacier', floor: '#1b2432', floor2: '#1f2939', wall: '#2c425e', wallTop: '#4f76a3', rock: '#4a5b73', rockHi: '#7690b3', accent: '#7dd3fc' },
  { name: 'Le Néant',   floor: '#1c1327', floor2: '#20162d', wall: '#381d58', wallTop: '#6d3aa8', rock: '#4a3465', rockHi: '#7152a0', accent: '#e879f9' },
];

class Room {
  constructor(gx, gy, type) {
    this.gx = gx; this.gy = gy; this.type = type;
    this.doors = {}; this.doorTypes = {}; this.hidden = {};
    this.visited = false; this.spawned = false; this.locked = false;
    this.cleared = type !== 'normal' && type !== 'boss';
    this.pickups = []; this.trapdoor = null;
    this.seed = Math.floor(Math.random() * 1e9);
    this.canvas = null; this.dirty = true;
  }
  build() {
    const t = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) row.push(x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? 1 : 0);
      t.push(row);
    }
    for (const d in this.doors) if (!this.hidden[d]) t[DOORS[d].ty][DOORS[d].tx] = 0;
    this.tiles = t;
    if (this.type === 'normal') this.placeRocks();
    // décor déterministe
    const R = mulberry32(this.seed);
    this.decor = [];
    for (let i = 0; i < 14; i++) {
      this.decor.push({ x: TILE + R() * (RW - TILE * 2), y: TILE + R() * (RH - TILE * 2), k: Math.floor(R() * 4), s: 0.6 + R() * 0.8, a: R() * TAU });
    }
  }
  canRock(x, y) {
    if (x <= 0 || y <= 0 || x >= COLS - 1 || y >= ROWS - 1) return false;
    if (Math.abs(x - 7) <= 1 && Math.abs(y - 4) <= 1) return false;
    if (Math.abs(y - 4) <= 1 && (x <= 2 || x >= COLS - 3)) return false;
    if (Math.abs(x - 7) <= 1 && (y <= 1 || y >= ROWS - 2)) return false;
    return true;
  }
  placeRocks() {
    const base = this.tiles;
    for (let attempt = 0; attempt < 40; attempt++) {
      const t = base.map(r => r.slice());
      const put = (x, y) => {
        for (const [a, b] of [[x, y], [COLS - 1 - x, y], [x, ROWS - 1 - y], [COLS - 1 - x, ROWS - 1 - y]])
          if (this.canRock(a, b)) t[b][a] = 2;
      };
      const pattern = choice(['scatter', 'scatter', 'pillars', 'clusters', 'wall', 'none']);
      if (pattern === 'scatter') { for (let i = randi(2, 4); i > 0; i--) put(randi(1, 6), randi(1, 3)); }
      else if (pattern === 'pillars') { put(3, 2); put(5, 2); if (Math.random() < 0.5) put(3, 3); }
      else if (pattern === 'clusters') { const x = randi(2, 4), y = randi(1, 2); put(x, y); put(x + 1, y); put(x, y + 1); }
      else if (pattern === 'wall') { const y = randi(2, 3); for (let x = randi(2, 3); x <= 5; x++) put(x, y); }
      if (this.connected(t)) { this.tiles = t; return; }
    }
  }
  connected(t) {
    let total = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (t[y][x] === 0) total++;
    const seen = new Set(['7,4']); const q = [[7, 4]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen.has(k) || t[ny][nx] !== 0) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen.size === total;
  }
  isDoorTile(tx, ty) { return (tx === 7 && (ty === 0 || ty === 8)) || (ty === 4 && (tx === 0 || tx === 14)); }
  solidFor(tx, ty, fly) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    const v = this.tiles[ty][tx];
    if (v === 1) return true;
    if (v === 2) return !fly;
    if (this.locked && this.isDoorTile(tx, ty)) return true;
    return false;
  }
  revealDoor(dir) {
    this.hidden[dir] = false;
    this.tiles[DOORS[dir].ty][DOORS[dir].tx] = 0;
    this.dirty = true;
  }
  breakRocks(x, y, radius) {
    let broke = false;
    for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) {
      if (this.tiles[ty][tx] !== 2) continue;
      if (Math.hypot((tx + 0.5) * TILE - x, (ty + 0.5) * TILE - y) < radius + TILE * 0.4) { this.tiles[ty][tx] = 0; broke = true; }
    }
    if (broke) this.dirty = true;
    return broke;
  }

  render(theme) {
    const S = RENDER_SCALE;
    const c = this.canvas || (this.canvas = document.createElement('canvas'));
    c.width = Math.ceil(RW * S); c.height = Math.ceil(RH * S);
    const x = c.getContext('2d');
    x.setTransform(S, 0, 0, S, 0, 0);
    const R = mulberry32(this.seed + 7);
    // sol
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      x.fillStyle = (tx + ty) % 2 ? theme.floor : theme.floor2;
      x.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      x.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 3; i++) x.fillRect(tx * TILE + R() * 60, ty * TILE + R() * 60, 3, 3);
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1;
      x.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
    }
    // décor
    for (const d of this.decor) {
      x.save(); x.translate(d.x, d.y); x.rotate(d.a); x.scale(d.s, d.s);
      if (d.k === 0) { // fissure
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.beginPath();
        x.moveTo(-14, 0); x.lineTo(-4, 3); x.lineTo(2, -2); x.lineTo(14, 4); x.moveTo(2, -2); x.lineTo(6, -10); x.stroke();
      } else if (d.k === 1) { // mousse
        x.fillStyle = theme.accent; x.globalAlpha = 0.08;
        for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(R() * 20 - 10, R() * 20 - 10, 4 + R() * 6, 0, TAU); x.fill(); }
      } else if (d.k === 2) { // os
        x.fillStyle = 'rgba(220,210,190,0.18)'; x.fillRect(-9, -2, 18, 4);
        x.beginPath(); x.arc(-9, -2, 3, 0, TAU); x.arc(-9, 2, 3, 0, TAU); x.arc(9, -2, 3, 0, TAU); x.arc(9, 2, 3, 0, TAU); x.fill();
      } else { // cailloux
        x.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(R() * 16 - 8, R() * 16 - 8, 1.5 + R() * 2, 0, TAU); x.fill(); }
      }
      x.restore();
    }
    // ombre intérieure des murs
    const sh = (x0, y0, x1, y1) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; };
    x.fillStyle = sh(0, TILE, 0, TILE + 28); x.fillRect(TILE, TILE, RW - TILE * 2, 28);
    x.fillStyle = sh(TILE, 0, TILE + 20, 0); x.fillRect(TILE, TILE, 20, RH - TILE * 2);
    x.fillStyle = sh(RW - TILE, 0, RW - TILE - 20, 0); x.fillRect(RW - TILE - 20, TILE, 20, RH - TILE * 2);
    // murs
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      if (this.tiles[ty][tx] !== 1) continue;
      const px = tx * TILE, py = ty * TILE;
      x.fillStyle = theme.wall; x.fillRect(px, py, TILE, TILE);
      x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 2;
      for (let r = 0; r < 4; r++) {
        const yy = py + r * 16;
        x.beginPath(); x.moveTo(px, yy); x.lineTo(px + TILE, yy); x.stroke();
        const off = (r % 2) * 16;
        for (let k = off; k < TILE; k += 32) { x.beginPath(); x.moveTo(px + k, yy); x.lineTo(px + k, yy + 16); x.stroke(); }
      }
      // arête éclairée vers l'intérieur
      x.fillStyle = theme.wallTop;
      if (ty < ROWS - 1 && this.tiles[ty + 1][tx] !== 1) x.fillRect(px, py + TILE - 6, TILE, 6);
      if (tx < COLS - 1 && this.tiles[ty][tx + 1] !== 1 && ty > 0 && ty < ROWS - 1) x.fillRect(px + TILE - 5, py, 5, TILE);
      if (tx > 0 && this.tiles[ty][tx - 1] !== 1 && ty > 0 && ty < ROWS - 1) x.fillRect(px, py, 5, TILE);
      if (ty > 0 && this.tiles[ty - 1][tx] !== 1) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(px, py, TILE, 5); }
    }
    // murs fissurés (indices de salle secrète)
    for (const d in this.hidden) {
      if (!this.hidden[d]) continue;
      const D = DOORS[d], cx = D.tx * TILE + TILE / 2, cy = D.ty * TILE + TILE / 2;
      x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 2.5; x.beginPath();
      x.moveTo(cx - 18, cy - 20); x.lineTo(cx - 6, cy - 6); x.lineTo(cx - 12, cy + 6); x.lineTo(cx - 2, cy + 20);
      x.moveTo(cx - 6, cy - 6); x.lineTo(cx + 10, cy - 12); x.lineTo(cx + 20, cy - 4);
      x.moveTo(cx - 12, cy + 6); x.lineTo(cx + 8, cy + 10); x.lineTo(cx + 16, cy + 22);
      x.stroke();
    }
    // rochers
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      if (this.tiles[ty][tx] !== 2) continue;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.beginPath(); x.ellipse(cx, cy + 20, 28, 10, 0, 0, TAU); x.fill();
      x.fillStyle = theme.rock; x.beginPath();
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, rr = 24 + R() * 7;
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.85;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.closePath(); x.fill();
      x.fillStyle = theme.rockHi; x.beginPath(); x.ellipse(cx - 6, cy - 9, 12, 7, -0.4, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + 2, cy - 4); x.lineTo(cx + 9, cy + 6); x.stroke();
    }
    this.dirty = false;
  }
}

function generateFloor(floor) {
  const size = 9, key = (x, y) => x + ',' + y;
  const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  for (let tries = 0; tries < 500; tries++) {
    const target = Math.min(8 + floor * 2 + randi(0, 2), 22);
    const cells = new Set([key(4, 4)]); const list = [[4, 4]];
    const nb = (x, y) => DIRS.reduce((n, d) => n + (cells.has(key(x + dv[d][0], y + dv[d][1])) ? 1 : 0), 0);
    let guard = 0;
    while (list.length < target && guard++ < 3000) {
      const [bx, by] = choice(list); const [dx, dy] = dv[choice(DIRS)];
      const nx = bx + dx, ny = by + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || cells.has(key(nx, ny))) continue;
      if (nb(nx, ny) > 1) continue;
      cells.add(key(nx, ny)); list.push([nx, ny]);
    }
    if (list.length < target) continue;
    // distances depuis le départ
    const distMap = new Map([[key(4, 4), 0]]); const q = [[4, 4]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const d of DIRS) {
        const k = key(x + dv[d][0], y + dv[d][1]);
        if (cells.has(k) && !distMap.has(k)) { distMap.set(k, distMap.get(key(x, y)) + 1); q.push([x + dv[d][0], y + dv[d][1]]); }
      }
    }
    const dead = list.filter(([x, y]) => !(x === 4 && y === 4) && nb(x, y) === 1)
      .sort((a, b) => distMap.get(key(b[0], b[1])) - distMap.get(key(a[0], a[1])));
    if (dead.length < 3 || distMap.get(key(dead[0][0], dead[0][1])) < 3) continue;
    const types = new Map();
    types.set(key(dead[0][0], dead[0][1]), 'boss');
    const rest = shuffle(dead.slice(1));
    types.set(key(rest[0][0], rest[0][1]), 'treasure');
    types.set(key(rest[1][0], rest[1][1]), 'shop');
    types.set(key(4, 4), 'start');

    const rooms = new Map();
    for (const [x, y] of list) rooms.set(key(x, y), new Room(x, y, types.get(key(x, y)) || 'normal'));
    for (const r of rooms.values()) {
      for (const d of DIRS) {
        const n = rooms.get(key(r.gx + dv[d][0], r.gy + dv[d][1]));
        if (n) { r.doors[d] = true; r.doorTypes[d] = n.type; }
      }
    }
    // salle secrète : case vide touchant le plus de salles (hors boss)
    let bestCell = null, bestN = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (rooms.has(key(x, y))) continue;
      const ns = DIRS.map(d => rooms.get(key(x + dv[d][0], y + dv[d][1]))).filter(Boolean);
      if (ns.some(n => n.type === 'boss' || n.type === 'start')) continue;
      const score = ns.length + Math.random() * 0.5;
      if (ns.length && score > bestN) { bestN = score; bestCell = [x, y]; }
    }
    if (bestCell) {
      const sr = new Room(bestCell[0], bestCell[1], 'secret');
      rooms.set(key(sr.gx, sr.gy), sr);
      for (const d of DIRS) {
        const n = rooms.get(key(sr.gx + dv[d][0], sr.gy + dv[d][1]));
        if (!n || n === sr) continue;
        sr.doors[d] = true; sr.doorTypes[d] = n.type;
        n.doors[OPP[d]] = true; n.doorTypes[OPP[d]] = 'secret'; n.hidden[OPP[d]] = true;
      }
    }
    for (const r of rooms.values()) r.build();
    return { rooms, start: rooms.get(key(4, 4)), theme: THEMES[(floor - 1) % THEMES.length] };
  }
  throw new Error('Génération du donjon impossible');
}
