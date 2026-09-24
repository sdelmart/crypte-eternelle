'use strict';
const fmtTime = s => { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

Object.assign(Game, {
  draw(ctx) {
    this.buttons = [];
    ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, W, H);
    const s = this.state;
    if (MENU_STATES.includes(s) || (s === 'settings' && this.settingsReturn === 'menu')) {
      this.drawBackdrop(ctx);
      ({ menu: this.drawMenu, meta: this.drawMeta, codex: this.drawCodex, select: this.drawSelect, settings: this.drawSettings })[s].call(this, ctx);
    } else {
      this.drawPlay(ctx);
      if (s === 'paused') this.drawPause(ctx);
      if (s === 'settings') { ctx.fillStyle = 'rgba(5,4,8,0.82)'; ctx.fillRect(0, 0, W, H); this.drawSettings(ctx); }
      if (s === 'dead' || s === 'victory') this.drawEnd(ctx);
    }
    if (this.fade > 0) { ctx.fillStyle = `rgba(7,6,11,${this.fade / 0.35})`; ctx.fillRect(0, 0, W, H); }
    const cursor = s === 'playing' && Input.lastDevice !== 'pad' ? 'none' : Input.lastDevice === 'pad' ? 'none' : 'default';
    if (this.canvas && this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  },

  // ---------- Widgets ----------
  addHit(x, y, w, h, action, opts = {}) {
    const i = this.buttons.length;
    const hover = Input.mouse.x >= x && Input.mouse.x <= x + w && Input.mouse.y >= y && Input.mouse.y <= y + h;
    if (hover && Input.mouseMoved) this.focus = i;
    this.buttons.push({ x, y, w, h, action, disabled: opts.disabled, onAdjust: opts.onAdjust });
    return this.focus === i;
  },
  button(ctx, x, y, w, h, label, action, opts = {}) {
    const focused = this.addHit(x, y, w, h, action, opts);
    const accent = opts.color || '#2dd4bf';
    ctx.save();
    if (focused && !opts.disabled) { ctx.shadowColor = accent; ctx.shadowBlur = 18; }
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = opts.disabled ? 'rgba(255,255,255,0.04)' : focused ? accent : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = opts.disabled ? 'rgba(255,255,255,0.1)' : accent; ctx.stroke();
    const fg = opts.disabled ? '#6b7280' : focused ? '#0b0a10' : '#fff';
    ctx.textBaseline = 'middle';
    if (opts.bar !== undefined) {
      const bx = x + w - 190, by = y + h / 2 - 5;
      ctx.fillStyle = focused ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.12)'; roundRect(ctx, bx, by, 130, 10, 5); ctx.fill();
      ctx.fillStyle = focused ? '#0b0a10' : accent; roundRect(ctx, bx, by, 130 * opts.bar, 10, 5); ctx.fill();
    }
    ctx.font = `600 ${opts.size || 20}px ${FONT}`; ctx.fillStyle = fg;
    if (opts.value !== undefined) {
      ctx.textAlign = 'left'; ctx.fillText(label, x + 20, y + h / 2 + 1);
      ctx.textAlign = 'right'; ctx.fillText(opts.value, x + w - 20, y + h / 2 + 1);
    } else { ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h / 2 + 1); }
    ctx.restore();
  },
  tooltip(ctx, x, y, title, desc, color = '#fde047') {
    ctx.font = `600 15px ${FONT}`;
    const tw = ctx.measureText(title).width; ctx.font = `13px ${FONT}`;
    const w = Math.max(tw, ctx.measureText(desc).width) + 24;
    const tx = clamp(x - w / 2, 8, W - w - 8), ty = clamp(y, 8, H - 54);
    ctx.fillStyle = 'rgba(10,8,16,0.94)'; roundRect(ctx, tx, ty, w, 46, 8); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    text(ctx, title, tx + w / 2, ty + 19, 15, color);
    text(ctx, desc, tx + w / 2, ty + 37, 13, '#e5e7eb', 'center', 'normal');
  },
  title(ctx, str, y, size = 44, color = '#f5f3ff', glow = '#a855f7') {
    ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 26;
    ctx.font = `900 ${size}px ${TFONT}`; ctx.textAlign = 'center'; ctx.fillStyle = color;
    ctx.fillText(str, W / 2, y);
    ctx.restore();
  },
  hint(ctx, str) { text(ctx, str, W / 2, H - 16, 12, '#6b7280', 'center', 'normal'); },

  // ---------------- EN JEU ----------------
  drawPlay(ctx) {
    const room = this.room, p = this.player;
    if (room.dirty) room.render(this.theme);
    ctx.save();
    if (this.shakeAmt > 0) ctx.translate(rand(-1, 1) * this.shakeAmt * 0.6, rand(-1, 1) * this.shakeAmt * 0.6);
    ctx.save(); ctx.translate(0, HUD_H);
    ctx.drawImage(room.canvas, 0, 0, RW, RH);
    this.drawDoors(ctx);

    if (room.type === 'start' && this.floor === 1) {
      ctx.globalAlpha = 0.3;
      const pad = Input.lastDevice === 'pad';
      text(ctx, pad ? 'Stick gauche : bouger   ·   Stick droit : tirer' : 'ZQSD : bouger   ·   Souris ou flèches : tirer', RW / 2, RH / 2 - 60, 18, '#fff', 'center', 'normal');
      text(ctx, pad ? 'A : dash   ·   X : bombe   ·   Start : pause' : 'Espace : dash   ·   E : bombe   ·   Tab : carte', RW / 2, RH / 2 - 32, 18, '#fff', 'center', 'normal');
      ctx.globalAlpha = 1;
    }
    if (room.type === 'shop') this.drawShopkeeper(ctx);
    if (room.type === 'secret') { ctx.globalAlpha = 0.25; text(ctx, '✦', RW / 2, RH / 2 - 90, 60, '#fde047'); ctx.globalAlpha = 1; }
    if (room.trapdoor) this.drawTrapdoor(ctx, room.trapdoor);
    for (const h of this.hazards) {
      const k = 1 - h.t / h.max;
      ctx.fillStyle = `rgba(0,0,0,${0.2 + k * 0.35})`; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * k, h.r * k * 0.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(239,68,68,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r, h.r * 0.5, 0, 0, TAU); ctx.stroke();
      if (k > 0.5) circle(ctx, h.x, h.y - (1 - k) * 400, 14, this.theme.rock);
    }
    for (const k of room.pickups) this.drawPickup(ctx, k);
    for (const b of this.bombs) {
      drawBomb(ctx, b, this.t);
      ctx.globalAlpha = 0.25 * (1 - b.t / b.max); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, 95, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }

    const actors = [...this.enemies, p].sort((a, b) => a.y - b.y);
    for (const a of actors) a === p ? drawPlayer(ctx, p, this.t) : drawEnemy(ctx, a, this);

    if (p.hp > 0) for (let i = 0; i < p.orbitals; i++) {
      const a = this.t * 3 + (i * TAU) / p.orbitals, x = p.x + Math.cos(a) * 48, y = p.y + Math.sin(a) * 48;
      ctx.globalAlpha = 0.3; circle(ctx, x, y, 14, '#818cf8'); ctx.globalAlpha = 1;
      circle(ctx, x, y, 8, '#a5b4fc'); circle(ctx, x - 2, y - 2, 3, '#fff');
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bullets) drawBullet(ctx, b);
    ctx.globalCompositeOperation = 'source-over';

    for (const q of this.particles) {
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a;
      if (q.ghost) { ctx.globalAlpha = a * 0.35; circle(ctx, q.x, q.y, q.size, q.color); }
      else if (q.ring) { ctx.strokeStyle = q.color; ctx.lineWidth = 4 * a; ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.2 - a * 0.7), 0, TAU); ctx.stroke(); }
      else { ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size); }
    }
    ctx.globalAlpha = 1;
    for (const q of this.texts) { ctx.globalAlpha = Math.min(1, q.life * 2); text(ctx, q.str, q.x, q.y, q.size, q.color); }
    ctx.globalAlpha = 1;

    const g = ctx.createRadialGradient(p.x, p.y, 120, p.x, p.y, 720);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${this.dying ? 0.85 : 0.6})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, RW, RH);

    this.drawNearbyLabel(ctx);
    this.drawMinimap(ctx, this.bigMap);
    ctx.restore();

    this.drawHUD(ctx);
    ctx.restore();

    if (this.bossRef && !this.bossRef.dead && this.enemies.includes(this.bossRef)) this.drawBossBar(ctx, this.bossRef);
    if (this.flash > 0) { ctx.fillStyle = `rgba(220,20,40,${this.flash * 0.45})`; ctx.fillRect(0, 0, W, H); }
    if (p.hp <= 2 && p.hp > 0) {
      const a = 0.18 + Math.sin(this.t * 6) * 0.08;
      const v = ctx.createRadialGradient(W / 2, H / 2, 250, W / 2, H / 2, 600);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(180,0,20,${a})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
    this.drawToast(ctx);
    this.drawBanner(ctx);
    if (this.trans) {
      const k = this.trans.t < 0.18 ? this.trans.t / 0.18 : 1 - (this.trans.t - 0.18) / 0.18;
      ctx.fillStyle = `rgba(7,6,11,${clamp(k, 0, 1)})`; ctx.fillRect(0, 0, W, H);
    }
    if (this.state === 'playing' && Input.lastDevice !== 'pad') this.drawCrosshair(ctx);
  },

  drawCrosshair(ctx) {
    const { x, y } = Input.mouse, c = this.player.char.body;
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
    const draw = () => {
      ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 5, y + dy * 5); ctx.lineTo(x + dx * 14, y + dy * 14); }
      ctx.stroke();
    };
    draw(); ctx.strokeStyle = c; ctx.lineWidth = 2; draw();
    circle(ctx, x, y, 1.5, '#fff');
    ctx.restore();
  },

  drawDoors(ctx) {
    const room = this.room;
    const col = { boss: '#dc2626', treasure: '#fbbf24', shop: '#38bdf8', secret: '#fde047' };
    for (const d in room.doors) {
      if (room.hidden[d]) continue;
      const D = DOORS[d], x = D.tx * TILE, y = D.ty * TILE;
      const frame = col[room.doorTypes[d]] || col[room.type] || this.theme.wallTop;
      ctx.save(); ctx.translate(x + TILE / 2, y + TILE / 2);
      ctx.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[d]);
      ctx.fillStyle = frame; ctx.fillRect(-TILE / 2 - 6, -TILE / 2, 8, TILE); ctx.fillRect(TILE / 2 - 2, -TILE / 2, 8, TILE);
      ctx.fillRect(-TILE / 2 - 6, -TILE / 2 - 2, TILE + 12, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-TILE / 2 + 2, -TILE / 2 + 6, TILE - 4, TILE / 2);
      if (room.locked) {
        ctx.fillStyle = '#44403c'; ctx.fillRect(-TILE / 2 + 2, -TILE / 2 + 6, TILE - 4, TILE - 8);
        ctx.fillStyle = '#78716c';
        for (let i = 0; i < 4; i++) ctx.fillRect(-TILE / 2 + 8 + i * 14, -TILE / 2 + 6, 5, TILE - 8);
        ctx.fillRect(-TILE / 2 + 2, -4, TILE - 4, 6);
      }
      const icon = { boss: '💀', treasure: '👑', shop: '🪙' }[room.doorTypes[d]];
      if (icon) { ctx.rotate(-{ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[d]); drawItemIcon(ctx, icon, 0, 0, 18); }
      ctx.restore();
    }
  },

  drawTrapdoor(ctx, t) {
    const pulse = 0.5 + Math.sin(this.t * 4) * 0.5;
    ctx.globalAlpha = 0.25 + pulse * 0.25; circle(ctx, t.x, t.y, 50, this.theme.accent); ctx.globalAlpha = 1;
    ctx.fillStyle = '#050407'; roundRect(ctx, t.x - 32, t.y - 32, 64, 64, 6); ctx.fill();
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#a16207'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(t.x - 16, t.y - 22 + i * 14); ctx.lineTo(t.x + 16, t.y - 22 + i * 14); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(t.x - 16, t.y - 30); ctx.lineTo(t.x - 16, t.y + 30); ctx.moveTo(t.x + 16, t.y - 30); ctx.lineTo(t.x + 16, t.y + 30); ctx.stroke();
    text(ctx, 'Descendre', t.x, t.y - 44, 14, this.theme.accent);
  },

  drawShopkeeper(ctx) {
    const x = RW / 2, y = TILE * 1.6 + Math.sin(this.t * 2) * 2;
    shadow(ctx, x, TILE * 1.6 + 22, 22);
    ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.moveTo(x - 24, y + 22); ctx.lineTo(x, y - 30); ctx.lineTo(x + 24, y + 22); ctx.closePath(); ctx.fill();
    circle(ctx, x, y - 4, 13, '#fde68a');
    circle(ctx, x - 5, y - 6, 2, '#000'); circle(ctx, x + 5, y - 6, 2, '#000');
    ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(x - 10, y + 2); ctx.quadraticCurveTo(x, y + 24, x + 10, y + 2); ctx.fill();
    ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.moveTo(x - 20, y - 10); ctx.lineTo(x, y - 44); ctx.lineTo(x + 20, y - 10); ctx.fill();
    text(ctx, 'Marché noir — marche sur un objet pour l\'acheter', x, TILE * 1.6 + 52, 14, '#93c5fd', 'center', 'normal');
  },

  drawPickup(ctx, k) {
    const bob = Math.sin(this.t * 3 + k.x) * 4;
    if (k.type === 'coin') { shadow(ctx, k.x, k.y + 8, 7); drawCoin(ctx, k.x, k.y + bob * 0.5, 7); return; }
    if (k.type === 'heart') { shadow(ctx, k.x, k.y + 12, 10); drawHeart(ctx, k.x, k.y - 10 + bob * 0.5, 20, 1); return; }
    if (k.type === 'bomb') { drawBomb(ctx, { x: k.x, y: k.y + bob * 0.4, t: 1, max: 1 }, 0); return; }
    const icon = k.id === 'heart' ? '❤️' : k.id === 'bomb' ? '💣' : ITEM_BY_ID[k.id].icon;
    if (k.type === 'item') {
      ctx.fillStyle = '#44403c'; ctx.fillRect(k.x - 20, k.y + 4, 40, 22);
      ctx.fillStyle = '#57534e'; ctx.fillRect(k.x - 24, k.y, 48, 8);
    } else {
      ctx.fillStyle = 'rgba(30,58,138,0.5)'; roundRect(ctx, k.x - 34, k.y - 34, 68, 72, 8); ctx.fill();
    }
    ctx.globalAlpha = 0.25 + Math.sin(this.t * 4) * 0.1; circle(ctx, k.x, k.y - 16 + bob, 24, '#fde047'); ctx.globalAlpha = 1;
    drawItemIcon(ctx, icon, k.x, k.y - 16 + bob, 30);
    if (k.type === 'shop') {
      drawCoin(ctx, k.x - 14, k.y + 26, 6);
      text(ctx, String(k.price), k.x + 6, k.y + 32, 16, this.player.coins >= k.price ? '#fde047' : '#f87171', 'center');
    }
  },

  drawNearbyLabel(ctx) {
    const p = this.player;
    for (const k of this.room.pickups) {
      if ((k.type !== 'item' && k.type !== 'shop') || dist(k, p) > 110) continue;
      const it = k.id === 'heart' ? { name: 'Cœur', desc: 'Rend 1 cœur' } : k.id === 'bomb' ? { name: 'Bombe', desc: 'Brise les rochers et révèle les passages secrets' } : ITEM_BY_ID[k.id];
      this.tooltip(ctx, k.x, k.y - 96, it.name, it.desc);
    }
  },

  drawMinimap(ctx, big) {
    const cur = this.room, R = big ? 4 : 2, cw = big ? 34 : 18, ch = big ? 24 : 12, gap = big ? 6 : 3;
    const n = R * 2 + 1, w = n * (cw + gap) + gap, h = n * (ch + gap) + gap;
    const x0 = big ? (RW - w) / 2 : RW - w - 10, y0 = big ? (RH - h) / 2 : 10;
    ctx.fillStyle = big ? 'rgba(5,4,8,0.88)' : 'rgba(5,4,8,0.55)';
    roundRect(ctx, x0 - 4, y0 - 4, w + 8, h + 8, 8); ctx.fill();
    const vis = r => {
      if (r.visited) return true;
      return DIRS.some(d => { if (!r.doors[d]) return false; const nb = this.neighbor(r, d); return nb && nb.visited && !nb.hidden[OPP[d]]; });
    };
    const icons = { boss: '💀', treasure: '👑', shop: '🪙', secret: '✦' };
    for (const r of this.dungeon.rooms.values()) {
      const dx = r.gx - cur.gx, dy = r.gy - cur.gy;
      if (Math.abs(dx) > R || Math.abs(dy) > R || !vis(r)) continue;
      const x = x0 + gap + (dx + R) * (cw + gap), y = y0 + gap + (dy + R) * (ch + gap);
      ctx.fillStyle = r === cur ? '#f5f5f4' : r.visited ? '#6b6580' : '#2e2a3a';
      roundRect(ctx, x, y, cw, ch, 3); ctx.fill();
      if (icons[r.type] && r !== cur) {
        if (r.type === 'secret') text(ctx, '✦', x + cw / 2, y + ch / 2 + (big ? 6 : 4), big ? 16 : 10, '#fde047');
        else drawItemIcon(ctx, icons[r.type], x + cw / 2, y + ch / 2 + 1, big ? 16 : 10);
      }
    }
    if (big) text(ctx, 'CARTE', RW / 2, y0 - 14, 16, '#e5e7eb');
  },

  drawHUD(ctx) {
    const p = this.player;
    const g = ctx.createLinearGradient(0, 0, 0, HUD_H);
    g.addColorStop(0, '#14111d'); g.addColorStop(1, '#0c0a12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = this.theme.accent; ctx.globalAlpha = 0.4; ctx.fillRect(0, HUD_H - 2, W, 2); ctx.globalAlpha = 1;
    for (let i = 0; i < p.maxHp / 2; i++) drawHeart(ctx, 26 + i * 28, 7, 22, clamp(p.hp - i * 2, 0, 2) / 2);
    drawCoin(ctx, 22, 47, 8);
    text(ctx, String(p.coins), 36, 53, 17, '#fde047', 'left');
    drawItemIcon(ctx, '💣', 84, 47, 15);
    text(ctx, String(p.bombs), 96, 53, 17, '#e5e7eb', 'left');
    const k = p.dashT > 0 ? 1 - p.dashT / p.dashCooldown : 1;
    text(ctx, 'DASH', 136, 53, 11, '#94a3b8', 'left');
    ctx.fillStyle = '#1f2937'; roundRect(ctx, 172, 45, 64, 8, 4); ctx.fill();
    ctx.fillStyle = k >= 1 ? p.char.body : p.char.dark; roundRect(ctx, 172, 45, 64 * k, 8, 4); ctx.fill();
    ctx.font = `700 17px ${TFONT}`; ctx.textAlign = 'center'; ctx.fillStyle = this.theme.accent;
    ctx.fillText(`Étage ${this.floor} · ${this.theme.name}`, W / 2, 28);
    text(ctx, `${fmtTime(this.stats.time)}   ·   ☠ ${this.stats.kills}`, W / 2, 50, 13, '#94a3b8', 'center', 'normal');
    const per = 12;
    let hovered = null;
    p.items.forEach((id, i) => {
      const x = W - 20 - (i % per) * 24, y = 18 + Math.floor(i / per) * 26;
      drawItemIcon(ctx, ITEM_BY_ID[id].icon, x, y, 18);
      if (Math.abs(Input.mouse.x - x) < 12 && Math.abs(Input.mouse.y - y) < 12) hovered = { id, x, y };
    });
    if (hovered && this.state === 'playing') { const it = ITEM_BY_ID[hovered.id]; this.tooltip(ctx, hovered.x - 60, hovered.y + 18, it.name, it.desc); }
  },

  drawBossBar(ctx, b) {
    const w = 520, x = (W - w) / 2, y = H - 38;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; roundRect(ctx, x - 6, y - 24, w + 12, 44, 8); ctx.fill();
    ctx.font = `700 14px ${TFONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fecaca'; ctx.fillText(b.def.name, W / 2, y - 7);
    ctx.fillStyle = '#3f0d12'; roundRect(ctx, x, y, w, 12, 5); ctx.fill();
    const gr = ctx.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#dc2626'); gr.addColorStop(1, '#f97316');
    ctx.fillStyle = gr; roundRect(ctx, x, y, (w * Math.max(0, b.hp)) / b.maxHp, 12, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + w / 2 - 1, y, 2, 12);
  },

  drawToast(ctx) {
    const t = this.toast; if (!t) return;
    const a = Math.min(1, t.t * 2, (3.2 - t.t) * 5);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.font = `13px ${FONT}`;
    const w = Math.max(320, ctx.measureText(t.desc).width + 100), x = (W - w) / 2, y = HUD_H + 16;
    ctx.fillStyle = 'rgba(10,8,16,0.92)'; roundRect(ctx, x, y, w, 58, 10); ctx.fill();
    ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2; ctx.stroke();
    drawItemIcon(ctx, t.icon, x + 34, y + 30, 30);
    text(ctx, t.title, x + 64, y + 25, 18, '#fde047', 'left');
    text(ctx, t.desc, x + 64, y + 45, 13, '#e5e7eb', 'left', 'normal');
    if (t.isNew) {
      ctx.fillStyle = '#a855f7'; roundRect(ctx, x + w - 78, y + 10, 66, 18, 9); ctx.fill();
      text(ctx, 'NOUVEAU', x + w - 45, y + 23, 11, '#fff');
    }
    ctx.globalAlpha = 1;
  },

  drawBanner(ctx) {
    const b = this.banner; if (!b) return;
    const a = Math.min(1, b.t * 1.5, (2.6 - b.t) * 4);
    ctx.globalAlpha = clamp(a, 0, 1);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, H / 2 - 64, W, 108);
    text(ctx, b.sub.toUpperCase(), W / 2, H / 2 - 24, 15, b.boss ? '#f87171' : this.theme.accent);
    ctx.save(); ctx.font = `900 42px ${TFONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.shadowColor = b.boss ? '#dc2626' : this.theme.accent; ctx.shadowBlur = 20;
    ctx.fillText(b.title, W / 2, H / 2 + 22); ctx.restore();
    ctx.globalAlpha = 1;
  },

  // ---------------- MENUS ----------------
  drawBackdrop(ctx) {
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H / 2, 700);
    g.addColorStop(0, '#2a1a3f'); g.addColorStop(1, '#07060b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.07; circle(ctx, W / 2, 175, 150 + Math.sin(this.t) * 6, '#a855f7'); ctx.globalAlpha = 1;
    for (const m of this.menuEmbers) { ctx.globalAlpha = 0.5; circle(ctx, m.x, m.y, m.s, m.s > 2 ? '#fb923c' : '#c084fc'); }
    ctx.globalAlpha = 1;
  },

  drawMenu(ctx) {
    this.title(ctx, 'CRYPTE ÉTERNELLE', 160, 60);
    text(ctx, 'Descends. Survis. Recommence.', W / 2, 202, 18, '#c4b5fd', 'center', 'normal');
    const bx = W / 2 - 150, bw = 300;
    this.button(ctx, bx, 244, bw, 54, 'Jouer', () => this.setState('select'), { size: 24 });
    this.button(ctx, bx, 310, bw, 46, `Autel des âmes  ·  ${this.meta.souls} ✦`, () => this.setState('meta'), { color: '#a855f7', size: 17 });
    this.button(ctx, bx, 366, bw, 46, 'Grimoire', () => this.setState('codex'), { color: '#fbbf24', size: 17 });
    this.button(ctx, bx, 422, bw, 46, 'Paramètres', () => { this.settingsReturn = 'menu'; this.setState('settings'); }, { color: '#94a3b8', size: 17 });
    // personnages en vitrine
    CHARACTERS.forEach((c, i) => {
      if (!this.meta.unlocked.includes(c.id)) return;
      const fake = new Player(c); fake.x = 0; fake.y = 0; fake.aim = Math.PI / 2 + Math.sin(this.t + i) * 0.6; fake.moving = false;
      ctx.save(); ctx.translate(W / 2 - 330 + i * 40, 520 - (i % 2) * 20); ctx.scale(1.8, 1.8); drawPlayer(ctx, fake, this.t + i); ctx.restore();
    });
    const st = this.meta.stats;
    const best = st.wins ? `Crypte vaincue ${st.wins} fois` : st.bestFloor ? `Record : étage ${st.bestFloor}` : 'Aucune descente pour l\'instant';
    text(ctx, best, W / 2, 510, 15, '#94a3b8', 'center', 'normal');
    this.hint(ctx, Input.lastDevice === 'pad' ? 'Ⓐ valider  ·  croix : naviguer' : '↑↓ naviguer  ·  Entrée valider  ·  F plein écran  ·  M son');
    text(ctx, 'v1.1', W - 16, H - 16, 11, '#4b5563', 'right', 'normal');
  },

  drawSelect(ctx) {
    this.title(ctx, 'CHOISIS TON HÉROS', 90, 40);
    const cw = 270, gap = 22, x0 = (W - (cw * 3 + gap * 2)) / 2, y = 130, ch = 380;
    CHARACTERS.forEach((c, i) => {
      const unlocked = this.meta.unlocked.includes(c.id);
      const x = x0 + i * (cw + gap);
      const focused = this.addHit(x, y, cw, ch, () => {
        if (unlocked) this.newRun(c.id); else Sfx.play('deny');
      });
      ctx.save();
      if (focused) { ctx.shadowColor = c.body; ctx.shadowBlur = 24; }
      roundRect(ctx, x, y, cw, ch, 14); ctx.fillStyle = 'rgba(18,13,28,0.95)'; ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = focused ? 3 : 1.5; ctx.strokeStyle = focused ? c.body : 'rgba(255,255,255,0.15)'; ctx.stroke();
      ctx.restore();
      const fake = new Player(c); fake.x = 0; fake.y = 0; fake.moving = focused; fake.walkT = this.t;
      fake.aim = -0.35 + (focused ? Math.sin(this.t * 2) * 0.25 : 0);
      ctx.save(); ctx.translate(x + cw / 2 - 12, y + 88); ctx.scale(2.8, 2.8);
      if (!unlocked) ctx.filter = 'brightness(0.15)';
      drawPlayer(ctx, fake, this.t); ctx.restore();
      ctx.font = `900 26px ${TFONT}`; ctx.textAlign = 'center'; ctx.fillStyle = unlocked ? '#fff' : '#6b7280';
      ctx.fillText(unlocked ? c.name : '???', x + cw / 2, y + 176);
      text(ctx, unlocked ? c.title : 'Verrouillé', x + cw / 2, y + 198, 15, unlocked ? c.body : '#6b7280', 'center', 'normal');
      if (unlocked) {
        ctx.font = `13px ${FONT}`;
        wrapText(ctx, c.desc, cw - 36).forEach((l, j) => text(ctx, l, x + cw / 2, y + 228 + j * 18, 13, '#d4d4d8', 'center', 'normal'));
        const rows = [['Vie', '♥'.repeat(fake.maxHp / 2)], ['Dégâts', fake.dmg.toFixed(1)], ['Cadence', (1 / fake.fireDelay).toFixed(1) + '/s'], ['Vitesse', Math.round(fake.speed)]];
        rows.forEach(([k, v], j) => {
          text(ctx, k, x + 30, y + 296 + j * 20, 13, '#94a3b8', 'left', 'normal');
          text(ctx, String(v), x + cw - 30, y + 296 + j * 20, 13, k === 'Vie' ? '#f87171' : '#fff', 'right');
        });
      } else {
        drawItemIcon(ctx, '🔒', x + cw / 2, y + 250, 34);
        text(ctx, c.unlock.text, x + cw / 2, y + 300, 15, '#fbbf24', 'center');
        text(ctx, 'pour débloquer', x + cw / 2, y + 320, 13, '#94a3b8', 'center', 'normal');
      }
    });
    this.button(ctx, W / 2 - 90, 540, 180, 44, '← Retour', () => this.setState('menu'), { color: '#94a3b8', size: 17 });
    this.hint(ctx, '← → choisir  ·  Entrée : commencer  ·  Échap : retour');
  },

  drawMeta(ctx) {
    this.title(ctx, 'AUTEL DES ÂMES', 86, 42, '#e9d5ff');
    text(ctx, `${this.meta.souls} âmes ✦`, W / 2, 124, 22, '#c084fc');
    text(ctx, 'Les âmes récoltées pendant tes descentes renforcent toutes tes prochaines parties.', W / 2, 154, 14, '#a1a1aa', 'center', 'normal');
    const cw = 168, gap = 12, total = META_UPS.length * cw + (META_UPS.length - 1) * gap, x0 = (W - total) / 2;
    META_UPS.forEach((u, i) => {
      const lvl = this.meta.up[u.id] || 0, maxed = lvl >= u.max, cost = u.cost(lvl);
      const x = x0 + i * (cw + gap), y = 190;
      ctx.fillStyle = 'rgba(20,14,32,0.9)'; roundRect(ctx, x, y, cw, 290, 12); ctx.fill();
      ctx.strokeStyle = maxed ? '#fde047' : '#6d28d9'; ctx.lineWidth = 2; ctx.stroke();
      drawItemIcon(ctx, u.icon, x + cw / 2, y + 50, 40);
      text(ctx, u.name, x + cw / 2, y + 102, 18, '#fff');
      ctx.font = `13px ${FONT}`;
      wrapText(ctx, u.desc, cw - 24).forEach((l, j) => text(ctx, l, x + cw / 2, y + 130 + j * 18, 13, '#d4d4d8', 'center', 'normal'));
      for (let k = 0; k < u.max; k++) {
        const px = x + cw / 2 - ((u.max - 1) * 18) / 2 + k * 18;
        circle(ctx, px, y + 196, 6, k < lvl ? '#c084fc' : '#3f3f46');
      }
      this.button(ctx, x + 14, y + 224, cw - 28, 44, maxed ? 'MAX' : `${cost} ✦`, () => {
        this.meta.souls -= cost; this.meta.up[u.id] = lvl + 1; this.saveMeta(); Sfx.play('item');
      }, { disabled: maxed || this.meta.souls < cost, color: '#a855f7', size: 18 });
    });
    this.button(ctx, W / 2 - 90, 530, 180, 44, '← Retour', () => this.setState('menu'), { color: '#94a3b8', size: 17 });
  },

  drawCodex(ctx) {
    this.title(ctx, 'GRIMOIRE', 80, 42, '#fef3c7', '#f59e0b');
    const seen = this.meta.seen;
    text(ctx, `Objets découverts : ${seen.length} / ${ITEMS.length}`, W / 2, 114, 16, '#fbbf24', 'center', 'normal');
    const cols = 7, cs = 60, gap = 10, gx = 60, gy = 145;
    let tip = null;
    ITEMS.forEach((it, i) => {
      const x = gx + (i % cols) * (cs + gap), y = gy + Math.floor(i / cols) * (cs + gap);
      const known = seen.includes(it.id);
      const focused = this.addHit(x, y, cs, cs, () => {});
      roundRect(ctx, x, y, cs, cs, 10);
      ctx.fillStyle = focused ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)'; ctx.fill();
      ctx.strokeStyle = focused ? '#fbbf24' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = focused ? 2 : 1; ctx.stroke();
      if (known) drawItemIcon(ctx, it.icon, x + cs / 2, y + cs / 2 + 1, 28);
      else text(ctx, '?', x + cs / 2, y + cs / 2 + 9, 26, '#4b5563');
      if (focused) tip = { x: x + cs / 2, y: y + cs + 6, it, known };
    });
    // statistiques
    const st = this.meta.stats, sx = 590, sy = 145;
    ctx.fillStyle = 'rgba(20,14,32,0.9)'; roundRect(ctx, sx, sy, 310, 200, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(251,191,36,0.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `700 18px ${TFONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fef3c7'; ctx.fillText('Chroniques', sx + 155, sy + 30);
    const rows = [
      ['Descentes', st.runs], ['Victoires', st.wins], ['Morts', st.deaths], ['Ennemis vaincus', st.kills],
      ['Boss vaincus', st.bosses], ['Record', st.bestFloor > MAX_FLOOR ? 'Crypte vaincue' : st.bestFloor ? 'Étage ' + st.bestFloor : '—'],
      ['Victoire la plus rapide', st.fastWin ? fmtTime(st.fastWin) : '—'],
    ];
    rows.forEach(([k, v], i) => {
      text(ctx, k, sx + 20, sy + 58 + i * 20, 13, '#a1a1aa', 'left', 'normal');
      text(ctx, String(v), sx + 290, sy + 58 + i * 20, 13, '#fff', 'right');
    });
    this.button(ctx, W / 2 - 90, 540, 180, 44, '← Retour', () => this.setState('menu'), { color: '#94a3b8', size: 17 });
    if (tip) {
      if (tip.known) this.tooltip(ctx, tip.x, tip.y, tip.it.name, tip.it.desc);
      else this.tooltip(ctx, tip.x, tip.y, '???', 'Trouve cet objet pendant une descente', '#6b7280');
    }
  },

  drawSettings(ctx) {
    this.title(ctx, 'PARAMÈTRES', 110, 40, '#e5e7eb', '#64748b');
    const x = W / 2 - 230, w = 460, h = 48;
    const vol = (key, label, y) => this.button(ctx, x, y, w, h, label, () => { Settings[key] = Settings[key] >= 1 ? 0 : Math.round((Settings[key] + 0.1) * 10) / 10; saveSettings(); }, {
      value: Math.round(Settings[key] * 100) + '%', bar: Settings[key], color: '#94a3b8', size: 17,
      onAdjust: d => { Settings[key] = clamp(Math.round((Settings[key] + d * 0.1) * 10) / 10, 0, 1); saveSettings(); },
    });
    const tog = (key, label, y) => this.button(ctx, x, y, w, h, label, () => { Settings[key] = !Settings[key]; saveSettings(); },
      { value: Settings[key] ? 'Oui' : 'Non', color: '#94a3b8', size: 17, onAdjust: () => { Settings[key] = !Settings[key]; saveSettings(); } });
    vol('music', 'Musique', 160);
    vol('sfx', 'Effets sonores', 218);
    tog('shake', 'Tremblements d\'écran', 276);
    tog('dmgNumbers', 'Chiffres de dégâts', 334);
    this.button(ctx, x, 392, w, h, 'Plein écran', () => this.toggleFullscreen(), { value: document.fullscreenElement ? 'Oui' : 'Non', color: '#94a3b8', size: 17 });
    this.button(ctx, W / 2 - 90, 470, 180, 44, '← Retour', () => this.setState(this.settingsReturn), { color: '#94a3b8', size: 17 });
    this.hint(ctx, '← → ajuster  ·  Échap : retour');
  },

  drawPause(ctx) {
    ctx.fillStyle = 'rgba(5,4,8,0.78)'; ctx.fillRect(0, 0, W, H);
    this.title(ctx, 'PAUSE', 150, 52, '#fff', this.theme.accent);
    this.button(ctx, W / 2 - 130, 190, 260, 48, 'Reprendre', () => this.setState('playing'));
    this.button(ctx, W / 2 - 130, 248, 260, 48, 'Paramètres', () => { this.settingsReturn = 'paused'; this.setState('settings'); }, { color: '#94a3b8' });
    this.button(ctx, W / 2 - 130, 306, 260, 48, this.confirmQuit ? 'Vraiment abandonner ?' : 'Abandonner', () => {
      if (this.confirmQuit) this.gameOver(false); else this.confirmQuit = true;
    }, { color: '#ef4444', size: this.confirmQuit ? 17 : 20 });
    const p = this.player;
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; roundRect(ctx, W / 2 - 280, 384, 560, 190, 12); ctx.fill();
    text(ctx, `${p.char.name} ${p.char.title}`, W / 2, 410, 16, p.char.body);
    const stats = [
      ['Dégâts', (p.rage && p.hp <= 2 ? p.dmg * 1.6 : p.dmg).toFixed(1)], ['Cadence', (1 / p.fireDelay).toFixed(1) + '/s'],
      ['Vitesse', Math.round(p.speed)], ['Portée', p.range.toFixed(2)], ['Critique', Math.round(p.crit * 100) + '%'], ['Tirs', p.multishot + (p.backshot ? '+1' : '')],
    ];
    stats.forEach(([k, v], i) => {
      const x = W / 2 - 250 + (i % 3) * 180, y = 442 + Math.floor(i / 3) * 28;
      text(ctx, k, x, y, 14, '#94a3b8', 'left', 'normal'); text(ctx, String(v), x + 80, y, 15, '#fff', 'left');
    });
    let tip = null;
    p.items.forEach((id, i) => {
      const x = W / 2 - (p.items.length - 1) * 15 + i * 30, y = 532;
      drawItemIcon(ctx, ITEM_BY_ID[id].icon, x, y, 22);
      if (Math.abs(Input.mouse.x - x) < 14 && Math.abs(Input.mouse.y - y) < 14) tip = { x, y, it: ITEM_BY_ID[id] };
    });
    if (!p.items.length) text(ctx, 'Aucun objet pour l\'instant', W / 2, 537, 13, '#6b7280', 'center', 'normal');
    if (tip) this.tooltip(ctx, tip.x, tip.y - 62, tip.it.name, tip.it.desc);
  },

  drawEnd(ctx) {
    const r = this.lastRun, win = r.win;
    const a = clamp(this.stateT * 2, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = win ? 'rgba(20,12,4,0.88)' : 'rgba(12,2,6,0.88)'; ctx.fillRect(0, 0, W, H);
    this.title(ctx, win ? 'VICTOIRE' : 'TU ES MORT', 128, 58, win ? '#fde047' : '#f87171', win ? '#fbbf24' : '#dc2626');
    text(ctx, win ? 'La Liche est tombée. La crypte est libérée.' : `${r.char.name} est tombé${r.char.id === 'knight' ? '' : 'e'} à l'étage ${r.floor} — ${THEMES[(r.floor - 1) % THEMES.length].name}`, W / 2, 168, 17, '#e5e7eb', 'center', 'normal');
    const rows = [['Ennemis vaincus', r.kills], ['Boss vaincus', r.bosses], ['Secrets trouvés', r.secrets], ['Temps', fmtTime(r.time)], ['Âmes récoltées', `+${r.souls} ✦`]];
    rows.forEach(([k, v], i) => {
      text(ctx, k, W / 2 - 150, 216 + i * 30, 16, '#a1a1aa', 'left', 'normal');
      text(ctx, String(v), W / 2 + 150, 216 + i * 30, 17, i === rows.length - 1 ? '#c084fc' : '#fff', 'right');
    });
    r.items.forEach((id, i) => drawItemIcon(ctx, ITEM_BY_ID[id].icon, W / 2 - (r.items.length - 1) * 15 + i * 30, 372, 22));
    let by = 408;
    if (r.unlocks.length) {
      const c = r.unlocks[0], pulse = 0.6 + Math.sin(this.t * 4) * 0.4;
      ctx.fillStyle = `rgba(168,85,247,${0.15 + pulse * 0.1})`; roundRect(ctx, W / 2 - 220, 396, 440, 40, 10); ctx.fill();
      text(ctx, `✦ Nouveau héros débloqué : ${c.name} ${c.title} !`, W / 2, 422, 16, '#e9d5ff');
      by = 452;
    }
    this.button(ctx, W / 2 - 250, by, 240, 50, 'Rejouer', () => this.newRun(r.char.id));
    this.button(ctx, W / 2 + 10, by, 240, 50, 'Changer de héros', () => this.setState('select'), { color: '#a855f7', size: 18 });
    this.button(ctx, W / 2 - 250, by + 62, 240, 44, 'Autel des âmes', () => this.setState('meta'), { color: '#a855f7', size: 17 });
    this.button(ctx, W / 2 + 10, by + 62, 240, 44, 'Menu', () => this.setState('menu'), { color: '#94a3b8', size: 17 });
    ctx.globalAlpha = 1;
  },
});
