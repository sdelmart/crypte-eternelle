import { TILE, W, H, HUD_H, RW, RH, DOORS, OPP, DIRS, TAU, rand, clamp, dist, lerp } from '../core/utils.js';
import { Settings, saveSettings, DEFAULT_KEYS } from '../core/settings.js';
import { Sfx } from '../core/audio.js';
import { Input, ACTIONS, ACTION_LABELS, TOUCH_BUTTONS, keyLabel } from '../core/input.js';
import { ITEM_BY_ID, ACTIVE_BY_ID, ALL_ITEMS, CHARACTERS, META_UPS, anyItem } from '../data/items.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { THEMES } from '../world/dungeon.js';
import { Player } from '../world/entities.js';
import {
  FONT,
  TFONT,
  circle,
  shadow,
  roundRect,
  drawHeart,
  drawCoin,
  drawPlayer,
  drawBomb,
  drawEnemy,
  drawBullet,
  drawItemIcon,
  drawKey,
  drawChest,
  drawSpikes,
  text,
  wrapText,
} from '../render/render.js';
import { Game, MAX_FLOOR, MENU_STATES, TUTORIAL_STEPS } from './game.js';

export const fmtTime = s => {
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const DOOR_ROT = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
const DOOR_COLORS = { boss: '#dc2626', treasure: '#fbbf24', shop: '#38bdf8', secret: '#fde047', challenge: '#a855f7' };
const DOOR_ICONS = { boss: '💀', treasure: '👑', shop: '🪙', challenge: '⚔️' };
const CREDITS = [
  ['title', 'CRYPTE ÉTERNELLE'],
  ['gap'],
  ['head', 'Conception, programmation et design'],
  ['line', 'Scott'],
  ['gap'],
  ['head', 'Musique et effets sonores'],
  ['line', 'Générés en temps réel avec la Web Audio API'],
  ['gap'],
  ['head', 'Polices'],
  ['line', 'Cinzel — Natanael Gama'],
  ['line', 'Outfit — Rodrigo Fuenzalida'],
  ['line', 'SIL Open Font License'],
  ['gap'],
  ['head', 'Outils'],
  ['line', 'JavaScript, Canvas 2D, Vite, Vitest, ESLint, Prettier'],
  ['gap'],
  ['gap'],
  ['title', "Merci d'avoir joué !"],
];

/** Texte d'une touche selon l'appareil utilisé */
function bindText(action) {
  const pad = { dash: 'A', bomb: 'X', active: 'Y', map: 'Select' };
  if (Input.lastDevice === 'pad') return pad[action] || action;
  if (Input.lastDevice === 'touch') return { dash: '💨', bomb: '💣', active: '✦', map: 'haut de l’écran' }[action] || action;
  return keyLabel(Settings.keys[action]);
}

Object.assign(Game, {
  draw(ctx) {
    this.buttons = [];
    ctx.fillStyle = '#07060b';
    ctx.fillRect(0, 0, W, H);
    const s = this.state;
    const overMenu = (s === 'settings' || s === 'controls') && this.settingsReturn === 'menu';
    if (MENU_STATES.includes(s) || overMenu) {
      this.drawBackdrop(ctx);
      const fn = {
        menu: this.drawMenu,
        meta: this.drawMeta,
        codex: this.drawCodex,
        select: this.drawSelect,
        settings: this.drawSettings,
        controls: this.drawControls,
      }[s];
      fn.call(this, ctx);
    } else if (s === 'credits') {
      this.drawBackdrop(ctx);
      this.drawCredits(ctx);
    } else {
      this.drawPlay(ctx);
      if (s === 'paused') this.drawPause(ctx);
      if (s === 'settings' || s === 'controls') {
        ctx.fillStyle = 'rgba(5,4,8,0.85)';
        ctx.fillRect(0, 0, W, H);
        (s === 'settings' ? this.drawSettings : this.drawControls).call(this, ctx);
      }
      if (s === 'dead' || s === 'victory') this.drawEnd(ctx);
    }
    this.drawAchToast(ctx);
    if (Settings.showFps) text(ctx, `${Math.round(this.fps)} FPS`, 8, H - 8, 11, '#94a3b8', 'left', 'normal');
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(7,6,11,${this.fade / 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
    const hide = Input.lastDevice === 'pad' || Input.lastDevice === 'touch' || s === 'playing';
    const cursor = hide ? 'none' : 'default';
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
    if (focused && !opts.disabled) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 18;
    }
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = opts.disabled ? 'rgba(255,255,255,0.04)' : focused ? accent : 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = opts.disabled ? 'rgba(255,255,255,0.1)' : accent;
    ctx.stroke();
    const fg = opts.disabled ? '#6b7280' : focused ? '#0b0a10' : '#fff';
    ctx.textBaseline = 'middle';
    if (opts.bar !== undefined) {
      const bx = x + w - 190,
        by = y + h / 2 - 5;
      ctx.fillStyle = focused ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.12)';
      roundRect(ctx, bx, by, 130, 10, 5);
      ctx.fill();
      ctx.fillStyle = focused ? '#0b0a10' : accent;
      roundRect(ctx, bx, by, 130 * opts.bar, 10, 5);
      ctx.fill();
    }
    ctx.font = `600 ${opts.size || 20}px ${FONT}`;
    ctx.fillStyle = fg;
    if (opts.value !== undefined) {
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 18, y + h / 2 + 1);
      ctx.textAlign = 'right';
      ctx.fillText(opts.value, x + w - 18, y + h / 2 + 1);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    }
    ctx.restore();
  },
  tooltip(ctx, x, y, title, desc, color = '#fde047') {
    ctx.font = `600 15px ${FONT}`;
    const tw = ctx.measureText(title).width;
    ctx.font = `13px ${FONT}`;
    const w = Math.max(tw, ctx.measureText(desc).width) + 24;
    const tx = clamp(x - w / 2, 8, W - w - 8),
      ty = clamp(y, 8, H - 54);
    ctx.fillStyle = 'rgba(10,8,16,0.94)';
    roundRect(ctx, tx, ty, w, 46, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, title, tx + w / 2, ty + 19, 15, color);
    text(ctx, desc, tx + w / 2, ty + 37, 13, '#e5e7eb', 'center', 'normal');
  },
  title(ctx, str, y, size = 44, color = '#f5f3ff', glow = '#a855f7') {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 26;
    ctx.font = `900 ${size}px ${TFONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(str, W / 2, y);
    ctx.restore();
  },
  hint(ctx, str) {
    if (Input.lastDevice === 'touch') return;
    text(ctx, str, W / 2, H - 16, 12, '#6b7280', 'center', 'normal');
  },
  panel(ctx, x, y, w, h, stroke = 'rgba(255,255,255,0.12)') {
    ctx.fillStyle = 'rgba(18,13,28,0.92)';
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  },

  // ---------------- EN JEU ----------------
  drawPlay(ctx) {
    const room = this.room,
      p = this.player;
    if (room.dirty) room.render(this.theme);
    ctx.save();
    if (this.shakeAmt > 0) ctx.translate(rand(-1, 1) * this.shakeAmt * 0.6, rand(-1, 1) * this.shakeAmt * 0.6);
    ctx.save();
    ctx.translate(0, HUD_H);
    ctx.drawImage(room.canvas, 0, 0, RW, RH);
    this.drawDoors(ctx);
    if (room.spikes.length) {
      const lvl = this.spikeLevel();
      for (const sp of room.spikes) drawSpikes(ctx, sp.tx, sp.ty, lvl);
    }

    if (room.type === 'shop') this.drawShopkeeper(ctx);
    if (room.type === 'secret') {
      ctx.globalAlpha = 0.25;
      text(ctx, '✦', RW / 2, RH / 2 - 90, 60, '#fde047');
      ctx.globalAlpha = 1;
    }
    if (room.trapdoor) this.drawTrapdoor(ctx, room.trapdoor);
    for (const h of this.hazards) this.drawHazard(ctx, h);
    for (const k of room.pickups) this.drawPickup(ctx, k);
    for (const b of this.bombs) {
      drawBomb(ctx, b, this.t);
      ctx.globalAlpha = 0.25 * (1 - b.t / b.max);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const actors = [...this.enemies, p].sort((a, b) => a.y - b.y);
    for (const a of actors) {
      if (a === p) drawPlayer(ctx, p, this.t);
      else drawEnemy(ctx, a, this);
    }

    if (p.hp > 0)
      for (let i = 0; i < p.orbitals; i++) {
        const a = this.t * 3 + (i * TAU) / p.orbitals,
          x = p.x + Math.cos(a) * 48,
          y = p.y + Math.sin(a) * 48;
        ctx.globalAlpha = 0.3;
        circle(ctx, x, y, 14, '#818cf8');
        ctx.globalAlpha = 1;
        circle(ctx, x, y, 8, '#a5b4fc');
        circle(ctx, x - 2, y - 2, 3, '#fff');
      }

    if (!Settings.contrastShots) ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bullets) if (b.friendly) drawBullet(ctx, b);
    ctx.globalCompositeOperation = Settings.contrastShots ? 'source-over' : 'lighter';
    for (const b of this.bullets) if (!b.friendly) drawBullet(ctx, b);
    ctx.globalCompositeOperation = 'source-over';

    for (const q of this.particles) {
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a;
      if (q.ghost) {
        ctx.globalAlpha = a * 0.35;
        circle(ctx, q.x, q.y, q.size, q.color);
      } else if (q.ring) {
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 4 * a;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (1.2 - a * 0.7), 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
    }
    ctx.globalAlpha = 1;
    for (const q of this.texts) {
      ctx.globalAlpha = Math.min(1, q.life * 2);
      text(ctx, q.str, q.x, q.y, q.size, q.color);
    }
    ctx.globalAlpha = 1;

    const g = ctx.createRadialGradient(p.x, p.y, 120, p.x, p.y, 720);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${this.dying ? 0.85 : 0.6})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, RW, RH);
    if (this.timeWarp > 0) {
      ctx.fillStyle = `rgba(56,189,248,${0.1 * Math.min(1, this.timeWarp)})`;
      ctx.fillRect(0, 0, RW, RH);
    }

    this.drawNearbyLabel(ctx);
    this.drawMinimap(ctx, this.bigMap);
    this.drawActiveBox(ctx);
    ctx.restore();

    this.drawHUD(ctx);
    ctx.restore();

    if (this.bossRef && !this.bossRef.dead && this.enemies.includes(this.bossRef)) this.drawBossBar(ctx, this.bossRef);
    if (this.flash > 0 && !Settings.reduceFlash) {
      ctx.fillStyle = `rgba(220,20,40,${this.flash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (p.hp <= 2 && p.hp > 0) {
      const a = Settings.reduceFlash ? 0.16 : 0.18 + Math.sin(this.t * 6) * 0.08;
      const v = ctx.createRadialGradient(W / 2, H / 2, 250, W / 2, H / 2, 600);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(180,0,20,${a})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.state === 'playing' && Input.lastDevice === 'touch') this.drawTouchControls(ctx);
    this.drawTutorial(ctx);
    this.drawToast(ctx);
    this.drawBanner(ctx);
    if (this.trans) {
      const k = this.trans.t < 0.18 ? this.trans.t / 0.18 : 1 - (this.trans.t - 0.18) / 0.18;
      ctx.fillStyle = `rgba(7,6,11,${clamp(k, 0, 1)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.state === 'playing' && (Input.lastDevice === 'mouse' || Input.lastDevice === 'keys')) this.drawCrosshair(ctx);
  },

  drawHazard(ctx, h) {
    const k = 1 - h.t / h.max;
    if (h.kind === 'lob') {
      ctx.globalAlpha = 0.25 + k * 0.35;
      circle(ctx, h.x, h.y, h.r * (0.4 + k * 0.6), '#ef4444');
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const bx = lerp(h.x0, h.x, k),
        by = lerp(h.y0, h.y, k) - Math.sin(k * Math.PI) * 130;
      drawBomb(ctx, { x: bx, y: by, t: h.t, max: h.max }, this.t);
      return;
    }
    ctx.fillStyle = `rgba(0,0,0,${0.2 + k * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, h.r * k, h.r * k * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(239,68,68,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, h.r, h.r * 0.5, 0, 0, TAU);
    ctx.stroke();
    if (k > 0.5) circle(ctx, h.x, h.y - (1 - k) * 400, 14, this.theme.rock);
  },

  drawCrosshair(ctx) {
    const { x, y } = Input.mouse,
      c = this.player.char.body;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    const draw = () => {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        ctx.moveTo(x + dx * 5, y + dy * 5);
        ctx.lineTo(x + dx * 14, y + dy * 14);
      }
      ctx.stroke();
    };
    draw();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    draw();
    circle(ctx, x, y, 1.5, '#fff');
    ctx.restore();
  },

  drawTouchControls(ctx) {
    const T = Input.touch,
      p = this.player;
    const stick = (ox, oy, x, y, active) => {
      ctx.globalAlpha = active ? 0.35 : 0.14;
      circle(ctx, ox, oy, 60, '#fff');
      ctx.globalAlpha = active ? 0.7 : 0.25;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, 60, 0, TAU);
      ctx.stroke();
      const d = Math.hypot(x - ox, y - oy),
        k = d > 60 ? 60 / d : 1;
      circle(ctx, ox + (x - ox) * k, oy + (y - oy) * k, 26, p.char.body);
      ctx.globalAlpha = 1;
    };
    const sticks = [...T.sticks.values()];
    const mv = sticks.find(s => s.side === 'move'),
      am = sticks.find(s => s.side === 'aim');
    if (mv) stick(mv.ox, mv.oy, mv.x, mv.y, true);
    else stick(130, H - 130, 130, H - 130, false);
    if (am) stick(am.ox, am.oy, am.x, am.y, true);
    else stick(W - 260, H - 120, W - 260, H - 120, false);
    for (const b of TOUCH_BUTTONS) {
      if (b.id === 'active' && !p.active) continue;
      const held = T.held.has(b.id);
      ctx.globalAlpha = held ? 0.55 : 0.3;
      circle(ctx, b.x, b.y, b.r, b.id === 'pause' ? '#000' : '#1e1b2e');
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = b.id === 'dash' ? p.char.body : '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (b.id === 'active') {
        const a = p.active,
          def = ACTIVE_BY_ID[a.id];
        drawItemIcon(ctx, def.icon, b.x, b.y, 24);
        ctx.strokeStyle = a.charge >= a.max ? '#fde047' : '#64748b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + (TAU * a.charge) / a.max);
        ctx.stroke();
      } else if (b.id === 'pause') text(ctx, 'II', b.x, b.y + 6, 16, '#fff');
      else drawItemIcon(ctx, b.icon, b.x, b.y, b.r * 0.8);
      if (b.id === 'bomb') text(ctx, String(p.bombs), b.x + b.r - 4, b.y + b.r - 2, 14, '#fff');
      if (b.id === 'dash' && p.dashT > 0) {
        ctx.strokeStyle = p.char.body;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashT / p.dashCooldown));
        ctx.stroke();
      }
    }
  },

  drawTutorial(ctx) {
    if (!this.tut || this.state !== 'playing') return;
    const step = TUTORIAL_STEPS[this.tut.step];
    const touch = Input.lastDevice === 'touch',
      pad = Input.lastDevice === 'pad';
    const move = touch
      ? 'Glisse ton pouce à gauche de l’écran pour te déplacer'
      : pad
        ? 'Utilise le stick gauche pour te déplacer'
        : `Déplace-toi avec ${['up', 'left', 'down', 'right'].map(a => keyLabel(Settings.keys[a])).join(' ')}`;
    const shoot = touch
      ? 'Glisse ton pouce à droite de l’écran pour viser et tirer'
      : pad
        ? 'Vise et tire avec le stick droit'
        : 'Vise avec la souris et maintiens le clic (ou les flèches) pour tirer';
    const msg = {
      move,
      shoot,
      dash: `Fais un dash avec ${bindText('dash')} : tu es invincible pendant le dash`,
      bomb: `Pose une bombe avec ${bindText('bomb')} : elles brisent les rochers et ouvrent les passages secrets`,
      explore: 'Franchis une porte pour explorer le donjon',
    }[step];
    if (!msg) return;
    const a = Math.min(1, this.tut.t * 3);
    ctx.globalAlpha = a;
    ctx.font = `600 16px ${FONT}`;
    const w = Math.min(W - 40, ctx.measureText(msg).width + 60),
      x = (W - w) / 2,
      y = H - 112;
    ctx.fillStyle = 'rgba(10,8,16,0.88)';
    roundRect(ctx, x, y, w, 58, 12);
    ctx.fill();
    ctx.strokeStyle = this.player.char.body;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, `TUTORIEL  ${this.tut.step + 1} / ${TUTORIAL_STEPS.length}`, W / 2, y + 20, 11, this.player.char.body);
    text(ctx, msg, W / 2, y + 43, 16, '#fff', 'center', '600');
    ctx.globalAlpha = 1;
  },

  drawDoors(ctx) {
    const room = this.room;
    for (const d in room.doors) {
      if (room.hidden[d]) continue;
      const D = DOORS[d],
        x = D.tx * TILE,
        y = D.ty * TILE;
      const frame = DOOR_COLORS[room.doorTypes[d]] || DOOR_COLORS[room.type] || this.theme.wallTop;
      ctx.save();
      ctx.translate(x + TILE / 2, y + TILE / 2);
      ctx.rotate(DOOR_ROT[d]);
      ctx.fillStyle = frame;
      ctx.fillRect(-TILE / 2 - 6, -TILE / 2, 8, TILE);
      ctx.fillRect(TILE / 2 - 2, -TILE / 2, 8, TILE);
      ctx.fillRect(-TILE / 2 - 6, -TILE / 2 - 2, TILE + 12, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(-TILE / 2 + 2, -TILE / 2 + 6, TILE - 4, TILE / 2);
      if (room.locked) {
        ctx.fillStyle = '#44403c';
        ctx.fillRect(-TILE / 2 + 2, -TILE / 2 + 6, TILE - 4, TILE - 8);
        ctx.fillStyle = '#78716c';
        for (let i = 0; i < 4; i++) ctx.fillRect(-TILE / 2 + 8 + i * 14, -TILE / 2 + 6, 5, TILE - 8);
        ctx.fillRect(-TILE / 2 + 2, -4, TILE - 4, 6);
      }
      const icon = DOOR_ICONS[room.doorTypes[d]];
      if (icon) {
        ctx.rotate(-DOOR_ROT[d]);
        drawItemIcon(ctx, icon, 0, 0, 18);
      }
      ctx.restore();
    }
  },

  drawTrapdoor(ctx, t) {
    const pulse = 0.5 + Math.sin(this.t * 4) * 0.5;
    ctx.globalAlpha = 0.25 + pulse * 0.25;
    circle(ctx, t.x, t.y, 50, this.theme.accent);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#050407';
    roundRect(ctx, t.x - 32, t.y - 32, 64, 64, 6);
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(t.x - 16, t.y - 22 + i * 14);
      ctx.lineTo(t.x + 16, t.y - 22 + i * 14);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(t.x - 16, t.y - 30);
    ctx.lineTo(t.x - 16, t.y + 30);
    ctx.moveTo(t.x + 16, t.y - 30);
    ctx.lineTo(t.x + 16, t.y + 30);
    ctx.stroke();
    text(ctx, 'Descendre', t.x, t.y - 44, 14, this.theme.accent);
  },

  drawShopkeeper(ctx) {
    const x = RW / 2,
      y = TILE * 1.6 + Math.sin(this.t * 2) * 2;
    shadow(ctx, x, TILE * 1.6 + 22, 22);
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.moveTo(x - 24, y + 22);
    ctx.lineTo(x, y - 30);
    ctx.lineTo(x + 24, y + 22);
    ctx.closePath();
    ctx.fill();
    circle(ctx, x, y - 4, 13, '#fde68a');
    circle(ctx, x - 5, y - 6, 2, '#000');
    circle(ctx, x + 5, y - 6, 2, '#000');
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 2);
    ctx.quadraticCurveTo(x, y + 24, x + 10, y + 2);
    ctx.fill();
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.moveTo(x - 20, y - 10);
    ctx.lineTo(x, y - 44);
    ctx.lineTo(x + 20, y - 10);
    ctx.fill();
    text(ctx, "Marché noir — marche sur un objet pour l'acheter", x, TILE * 1.6 + 52, 14, '#93c5fd', 'center', 'normal');
  },

  pickupIcon(k) {
    if (k.kind === 'heart' || k.id === 'heart') return '❤️';
    if (k.kind === 'bomb') return '💣';
    if (k.kind === 'key') return '🔑';
    return anyItem(k.id).icon;
  },
  drawPickup(ctx, k) {
    const bob = Math.sin(this.t * 3 + k.x) * 4;
    switch (k.type) {
      case 'coin':
        shadow(ctx, k.x, k.y + 8, 7);
        drawCoin(ctx, k.x, k.y + bob * 0.5, 7);
        return;
      case 'heart':
        shadow(ctx, k.x, k.y + 12, 10);
        drawHeart(ctx, k.x, k.y - 10 + bob * 0.5, 20, 1);
        return;
      case 'bomb':
        drawBomb(ctx, { x: k.x, y: k.y + bob * 0.4, t: 1, max: 1 }, 0);
        return;
      case 'key':
        shadow(ctx, k.x, k.y + 10, 9);
        drawKey(ctx, k.x, k.y + bob * 0.5, 1.1);
        return;
      case 'chest':
        drawChest(ctx, k.x, k.y, k.gold, k.open, this.t);
        if (k.gold && !k.open) drawKey(ctx, k.x + 26, k.y - 26, 0.7);
        return;
    }
    if (k.type === 'item' || (k.type === 'active' && k.pedestal)) {
      ctx.fillStyle = '#44403c';
      ctx.fillRect(k.x - 20, k.y + 4, 40, 22);
      ctx.fillStyle = '#57534e';
      ctx.fillRect(k.x - 24, k.y, 48, 8);
    } else if (k.type === 'shop') {
      ctx.fillStyle = 'rgba(30,58,138,0.5)';
      roundRect(ctx, k.x - 34, k.y - 34, 68, 72, 8);
      ctx.fill();
    } else shadow(ctx, k.x, k.y + 10, 14);
    const isActive = k.type === 'active' || k.kind === 'active';
    ctx.globalAlpha = 0.25 + Math.sin(this.t * 4) * 0.1;
    circle(ctx, k.x, k.y - 16 + bob, 24, isActive ? '#38bdf8' : '#fde047');
    ctx.globalAlpha = 1;
    if (k.kind === 'key') drawKey(ctx, k.x - 2, k.y - 16 + bob, 1.4);
    else drawItemIcon(ctx, this.pickupIcon(k), k.x, k.y - 16 + bob, 30);
    if (k.type === 'shop') {
      drawCoin(ctx, k.x - 14, k.y + 26, 6);
      text(ctx, String(k.price), k.x + 6, k.y + 32, 16, this.player.coins >= k.price ? '#fde047' : '#f87171', 'center');
    }
  },

  drawNearbyLabel(ctx) {
    const p = this.player;
    for (const k of this.room.pickups) {
      if (!['item', 'shop', 'active'].includes(k.type) || dist(k, p) > 110) continue;
      let it;
      if (k.kind === 'heart') it = { name: 'Cœur', desc: 'Rend 1 cœur' };
      else if (k.kind === 'bomb') it = { name: 'Bombe', desc: 'Brise les rochers et révèle les passages secrets' };
      else if (k.kind === 'key') it = { name: 'Clé', desc: 'Ouvre les coffres dorés' };
      else it = anyItem(k.id);
      const isActive = k.type === 'active' || k.kind === 'active';
      this.tooltip(ctx, k.x, k.y - 96, isActive ? `${it.name} · objet actif` : it.name, it.desc, isActive ? '#7dd3fc' : '#fde047');
    }
  },

  drawMinimap(ctx, big) {
    const cur = this.room,
      R = big ? 4 : 2,
      cw = big ? 34 : 18,
      ch = big ? 24 : 12,
      gap = big ? 6 : 3;
    const n = R * 2 + 1,
      w = n * (cw + gap) + gap,
      h = n * (ch + gap) + gap;
    const x0 = big ? (RW - w) / 2 : RW - w - 10,
      y0 = big ? (RH - h) / 2 : 10;
    ctx.fillStyle = big ? 'rgba(5,4,8,0.88)' : 'rgba(5,4,8,0.55)';
    roundRect(ctx, x0 - 4, y0 - 4, w + 8, h + 8, 8);
    ctx.fill();
    const vis = r => {
      if (r.visited) return true;
      return DIRS.some(d => {
        if (!r.doors[d]) return false;
        const nb = this.neighbor(r, d);
        return nb && nb.visited && !nb.hidden[OPP[d]];
      });
    };
    const icons = { boss: '💀', treasure: '👑', shop: '🪙', challenge: '⚔️' };
    for (const r of this.dungeon.rooms.values()) {
      const dx = r.gx - cur.gx,
        dy = r.gy - cur.gy;
      if (Math.abs(dx) > R || Math.abs(dy) > R || !vis(r)) continue;
      const x = x0 + gap + (dx + R) * (cw + gap),
        y = y0 + gap + (dy + R) * (ch + gap);
      ctx.fillStyle = r === cur ? '#f5f5f4' : r.visited ? '#6b6580' : '#2e2a3a';
      roundRect(ctx, x, y, cw, ch, 3);
      ctx.fill();
      if (r !== cur) {
        if (r.type === 'secret') text(ctx, '✦', x + cw / 2, y + ch / 2 + (big ? 6 : 4), big ? 16 : 10, '#fde047');
        else if (icons[r.type]) drawItemIcon(ctx, icons[r.type], x + cw / 2, y + ch / 2 + 1, big ? 16 : 10);
      }
    }
    if (big) text(ctx, 'CARTE', RW / 2, y0 - 14, 16, '#e5e7eb');
  },

  drawActiveBox(ctx) {
    const a = this.player.active;
    if (!a || Input.lastDevice === 'touch') return;
    const def = ACTIVE_BY_ID[a.id],
      x = 10,
      y = RH - 70,
      ready = a.charge >= a.max;
    ctx.fillStyle = 'rgba(5,4,8,0.7)';
    roundRect(ctx, x, y, 62, 62, 10);
    ctx.fill();
    ctx.strokeStyle = ready ? '#fde047' : '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (ready) {
      ctx.globalAlpha = 0.25 + Math.sin(this.t * 5) * 0.1;
      circle(ctx, x + 31, y + 27, 22, '#fde047');
      ctx.globalAlpha = 1;
    }
    drawItemIcon(ctx, def.icon, x + 31, y + 27, 28);
    for (let i = 0; i < a.max; i++) {
      const w = (50 - (a.max - 1) * 3) / a.max;
      ctx.fillStyle = i < a.charge ? (ready ? '#fde047' : '#38bdf8') : '#1f2937';
      ctx.fillRect(x + 6 + i * (w + 3), y + 50, w, 6);
    }
    text(ctx, bindText('active'), x + 72, y + 58, 13, '#94a3b8', 'left');
  },

  drawHUD(ctx) {
    const p = this.player;
    const g = ctx.createLinearGradient(0, 0, 0, HUD_H);
    g.addColorStop(0, '#14111d');
    g.addColorStop(1, '#0c0a12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = this.nightmare ? '#dc2626' : this.theme.accent;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, HUD_H - 2, W, 2);
    ctx.globalAlpha = 1;
    for (let i = 0; i < p.maxHp / 2; i++) drawHeart(ctx, 26 + i * 28, 7, 22, clamp(p.hp - i * 2, 0, 2) / 2);
    drawCoin(ctx, 22, 47, 8);
    text(ctx, String(p.coins), 36, 53, 17, '#fde047', 'left');
    drawItemIcon(ctx, '💣', 80, 47, 15);
    text(ctx, String(p.bombs), 92, 53, 17, '#e5e7eb', 'left');
    drawKey(ctx, 132, 47, 0.75);
    text(ctx, String(p.keys), 146, 53, 17, '#e5e7eb', 'left');
    const k = p.dashT > 0 ? 1 - p.dashT / p.dashCooldown : 1;
    text(ctx, 'DASH', 182, 53, 11, '#94a3b8', 'left');
    ctx.fillStyle = '#1f2937';
    roundRect(ctx, 216, 45, 56, 8, 4);
    ctx.fill();
    ctx.fillStyle = k >= 1 ? p.char.body : p.char.dark;
    roundRect(ctx, 216, 45, 56 * k, 8, 4);
    ctx.fill();
    ctx.font = `700 17px ${TFONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.theme.accent;
    ctx.fillText(`Étage ${this.floor} · ${this.theme.name}`, W / 2, 28);
    const tags = [fmtTime(this.stats.time), `☠ ${this.stats.kills}`];
    if (this.nightmare) tags.push('Cauchemar');
    if (this.daily) tags.push('Défi du jour');
    text(ctx, tags.join('   ·   '), W / 2, 50, 13, this.nightmare ? '#fca5a5' : '#94a3b8', 'center', 'normal');
    const per = 12;
    let hovered = null;
    p.items.forEach((id, i) => {
      const x = W - 20 - (i % per) * 24,
        y = 18 + Math.floor(i / per) * 26;
      drawItemIcon(ctx, ITEM_BY_ID[id].icon, x, y, 18);
      if (Math.abs(Input.mouse.x - x) < 12 && Math.abs(Input.mouse.y - y) < 12) hovered = { id, x, y };
    });
    if (hovered && this.state === 'playing' && Input.lastDevice === 'mouse') {
      const it = ITEM_BY_ID[hovered.id];
      this.tooltip(ctx, hovered.x - 60, hovered.y + 18, it.name, it.desc);
    }
  },

  drawBossBar(ctx, b) {
    const w = 520,
      x = (W - w) / 2,
      y = H - 38;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, x - 6, y - 24, w + 12, 44, 8);
    ctx.fill();
    ctx.font = `700 14px ${TFONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fecaca';
    ctx.fillText(b.def.name, W / 2, y - 7);
    ctx.fillStyle = '#3f0d12';
    roundRect(ctx, x, y, w, 12, 5);
    ctx.fill();
    const gr = ctx.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, '#dc2626');
    gr.addColorStop(1, '#f97316');
    ctx.fillStyle = gr;
    roundRect(ctx, x, y, (w * Math.max(0, b.hp)) / b.maxHp, 12, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x + w / 2 - 1, y, 2, 12);
  },

  drawToast(ctx) {
    const t = this.toast;
    if (!t) return;
    const desc = t.desc.replace('{active}', bindText('active'));
    const a = Math.min(1, t.t * 2, (3.2 - t.t) * 5);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.font = `13px ${FONT}`;
    const w = Math.max(320, ctx.measureText(desc).width + 100),
      x = (W - w) / 2,
      y = HUD_H + 16;
    ctx.fillStyle = 'rgba(10,8,16,0.92)';
    roundRect(ctx, x, y, w, 58, 10);
    ctx.fill();
    ctx.strokeStyle = t.active ? '#7dd3fc' : '#fde047';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawItemIcon(ctx, t.icon, x + 34, y + 30, 30);
    text(ctx, t.title, x + 64, y + 25, 18, t.active ? '#7dd3fc' : '#fde047', 'left');
    text(ctx, desc, x + 64, y + 45, 13, '#e5e7eb', 'left', 'normal');
    if (t.isNew) {
      ctx.fillStyle = '#a855f7';
      roundRect(ctx, x + w - 78, y + 10, 66, 18, 9);
      ctx.fill();
      text(ctx, 'NOUVEAU', x + w - 45, y + 23, 11, '#fff');
    }
    ctx.globalAlpha = 1;
  },

  drawAchToast(ctx) {
    const t = this.achToast;
    if (!t) return;
    const a = clamp(Math.min(t.t * 3, (3.6 - t.t) * 4), 0, 1);
    const w = 300,
      x = W - w - 14 + (1 - a) * 40,
      y = this.state === 'playing' || this.state === 'paused' ? HUD_H + 84 : 14;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(20,12,4,0.95)';
    roundRect(ctx, x, y, w, 58, 10);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawItemIcon(ctx, t.a.icon, x + 30, y + 30, 26);
    text(ctx, 'SUCCÈS DÉBLOQUÉ', x + 56, y + 22, 11, '#f59e0b', 'left');
    text(ctx, t.a.name, x + 56, y + 43, 16, '#fff', 'left');
    ctx.globalAlpha = 1;
  },

  drawBanner(ctx) {
    const b = this.banner;
    if (!b) return;
    const a = Math.min(1, b.t * 1.5, (2.6 - b.t) * 4);
    ctx.globalAlpha = clamp(a, 0, 1);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.65)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H / 2 - 64, W, 108);
    text(ctx, b.sub.toUpperCase(), W / 2, H / 2 - 24, 15, b.boss ? '#f87171' : this.theme.accent);
    ctx.save();
    ctx.font = `900 42px ${TFONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = b.boss ? '#dc2626' : this.theme.accent;
    ctx.shadowBlur = 20;
    ctx.fillText(b.title, W / 2, H / 2 + 22);
    ctx.restore();
    ctx.globalAlpha = 1;
  },

  // ---------------- MENUS ----------------
  drawBackdrop(ctx) {
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H / 2, 700);
    g.addColorStop(0, '#2a1a3f');
    g.addColorStop(1, '#07060b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.07;
    circle(ctx, W / 2, 175, 150 + Math.sin(this.t) * 6, '#a855f7');
    ctx.globalAlpha = 1;
    for (const m of this.menuEmbers) {
      ctx.globalAlpha = 0.5;
      circle(ctx, m.x, m.y, m.s, m.s > 2 ? '#fb923c' : '#c084fc');
    }
    ctx.globalAlpha = 1;
  },

  drawMenu(ctx) {
    this.title(ctx, 'CRYPTE ÉTERNELLE', 150, 60);
    text(ctx, 'Descends. Survis. Recommence.', W / 2, 192, 18, '#c4b5fd', 'center', 'normal');
    const bx = W / 2 - 150,
      bw = 300;
    this.button(ctx, bx, 226, bw, 54, 'Jouer', () => this.setState('select'), { size: 24 });
    this.button(ctx, bx, 292, bw, 44, `Autel des âmes  ·  ${this.meta.souls} ✦`, () => this.setState('meta'), {
      color: '#a855f7',
      size: 17,
    });
    this.button(
      ctx,
      bx,
      346,
      bw,
      44,
      'Grimoire',
      () => {
        this.codexTab = 'items';
        this.setState('codex');
      },
      { color: '#fbbf24', size: 17 },
    );
    this.button(
      ctx,
      bx,
      400,
      bw,
      44,
      'Paramètres',
      () => {
        this.settingsReturn = 'menu';
        this.setState('settings');
      },
      { color: '#94a3b8', size: 17 },
    );
    if (Input.lastDevice === 'touch' && document.fullscreenEnabled && !document.fullscreenElement)
      this.button(ctx, bx, 454, bw, 40, 'Plein écran', () => this.toggleFullscreen(), { color: '#64748b', size: 16 });
    CHARACTERS.forEach((c, i) => {
      if (!this.meta.unlocked.includes(c.id)) return;
      const fake = new Player(c);
      fake.x = 0;
      fake.y = 0;
      fake.aim = Math.PI / 2 + Math.sin(this.t + i) * 0.6;
      ctx.save();
      ctx.translate(W / 2 - 330 + i * 40, 520 - (i % 2) * 20);
      ctx.scale(1.8, 1.8);
      drawPlayer(ctx, fake, this.t + i);
      ctx.restore();
    });
    const st = this.meta.stats;
    const best = st.wins
      ? `Crypte vaincue ${st.wins} fois`
      : st.bestFloor
        ? `Record : étage ${st.bestFloor}`
        : "Aucune descente pour l'instant";
    text(ctx, best, W / 2, 520, 15, '#94a3b8', 'center', 'normal');
    text(ctx, `Succès : ${this.meta.ach.length} / ${ACHIEVEMENTS.length}`, W / 2, 544, 13, '#a1a1aa', 'center', 'normal');
    this.hint(
      ctx,
      Input.lastDevice === 'pad' ? 'Ⓐ valider  ·  croix : naviguer' : '↑↓ naviguer  ·  Entrée valider  ·  F plein écran  ·  M son',
    );
    text(ctx, 'v1.2', W - 16, H - 16, 11, '#4b5563', 'right', 'normal');
  },

  drawSelect(ctx) {
    this.title(ctx, 'CHOISIS TON HÉROS', 74, 38);
    const cw = 270,
      gap = 22,
      x0 = (W - (cw * 3 + gap * 2)) / 2,
      y = 100,
      ch = 340;
    CHARACTERS.forEach((c, i) => {
      const unlocked = this.meta.unlocked.includes(c.id);
      const x = x0 + i * (cw + gap);
      const focused = this.addHit(x, y, cw, ch, () => {
        if (unlocked) this.newRun(c.id);
        else Sfx.play('deny');
      });
      ctx.save();
      if (focused) {
        ctx.shadowColor = c.body;
        ctx.shadowBlur = 24;
      }
      roundRect(ctx, x, y, cw, ch, 14);
      ctx.fillStyle = 'rgba(18,13,28,0.95)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = focused ? 3 : 1.5;
      ctx.strokeStyle = focused ? c.body : 'rgba(255,255,255,0.15)';
      ctx.stroke();
      ctx.restore();
      const fake = new Player(c);
      fake.x = 0;
      fake.y = 0;
      fake.moving = focused;
      fake.walkT = this.t;
      fake.aim = -0.35 + (focused ? Math.sin(this.t * 2) * 0.25 : 0);
      ctx.save();
      ctx.translate(x + cw / 2 - 12, y + 78);
      ctx.scale(2.6, 2.6);
      if (!unlocked) ctx.filter = 'brightness(0.15)';
      drawPlayer(ctx, fake, this.t);
      ctx.restore();
      ctx.font = `900 24px ${TFONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = unlocked ? '#fff' : '#6b7280';
      ctx.fillText(unlocked ? c.name : '???', x + cw / 2, y + 156);
      text(ctx, unlocked ? c.title : 'Verrouillé', x + cw / 2, y + 177, 15, unlocked ? c.body : '#6b7280', 'center', 'normal');
      if (unlocked) {
        ctx.font = `13px ${FONT}`;
        wrapText(ctx, c.desc, cw - 36).forEach((l, j) => text(ctx, l, x + cw / 2, y + 204 + j * 18, 13, '#d4d4d8', 'center', 'normal'));
        const rows = [
          ['Vie', '♥'.repeat(fake.maxHp / 2)],
          ['Dégâts', fake.dmg.toFixed(1)],
          ['Cadence', (1 / fake.fireDelay).toFixed(1) + '/s'],
          ['Vitesse', Math.round(fake.speed)],
        ];
        rows.forEach(([k, v], j) => {
          text(ctx, k, x + 30, y + 262 + j * 19, 13, '#94a3b8', 'left', 'normal');
          text(ctx, String(v), x + cw - 30, y + 262 + j * 19, 13, k === 'Vie' ? '#f87171' : '#fff', 'right');
        });
      } else {
        drawItemIcon(ctx, '🔒', x + cw / 2, y + 226, 34);
        text(ctx, c.unlock.text, x + cw / 2, y + 276, 15, '#fbbf24', 'center');
        text(ctx, 'pour débloquer', x + cw / 2, y + 296, 13, '#94a3b8', 'center', 'normal');
      }
    });
    // options de partie
    const o = this.runOpts,
      oy = 456,
      ow = 286,
      ogap = 14,
      ox = (W - (ow * 3 + ogap * 2)) / 2;
    const nmOk = this.nightmareUnlocked();
    this.button(
      ctx,
      ox,
      oy,
      ow,
      44,
      'Mode Cauchemar',
      () => {
        o.nightmare = !o.nightmare;
      },
      {
        value: !nmOk ? '🔒' : o.nightmare ? 'Oui' : 'Non',
        color: '#ef4444',
        size: 15,
        disabled: !nmOk,
        onAdjust: () => {
          if (nmOk) o.nightmare = !o.nightmare;
        },
      },
    );
    const seedLabel =
      this.seedEdit !== null
        ? (this.seedEdit || '') + (Math.floor(this.t * 2) % 2 ? '_' : ' ')
        : o.daily
          ? 'du jour'
          : o.seed || 'aléatoire';
    this.button(ctx, ox + ow + ogap, oy, ow, 44, 'Seed', () => this.editSeed(), { value: seedLabel, color: '#38bdf8', size: 15 });
    this.button(
      ctx,
      ox + (ow + ogap) * 2,
      oy,
      ow,
      44,
      'Défi du jour',
      () => {
        o.daily = !o.daily;
        if (o.daily) o.seed = '';
      },
      {
        value: o.daily ? 'Oui' : 'Non',
        color: '#f59e0b',
        size: 15,
        onAdjust: () => {
          o.daily = !o.daily;
        },
      },
    );
    if (this.seedEdit !== null)
      text(ctx, 'Tape une seed puis Entrée (Échap pour annuler)', W / 2, oy + 64, 13, '#7dd3fc', 'center', 'normal');
    else if (!nmOk)
      text(ctx, 'Termine la crypte une fois pour débloquer le mode Cauchemar', W / 2, oy + 64, 13, '#6b7280', 'center', 'normal');
    else if (o.nightmare)
      text(ctx, 'Ennemis plus résistants et plus rapides · âmes et score x1.5', W / 2, oy + 64, 13, '#fca5a5', 'center', 'normal');
    this.button(ctx, W / 2 - 90, 548, 180, 42, '← Retour', () => this.setState('menu'), { color: '#94a3b8', size: 16 });
    this.hint(ctx, '← → choisir  ·  Entrée : commencer  ·  Échap : retour');
  },

  drawMeta(ctx) {
    this.title(ctx, 'AUTEL DES ÂMES', 86, 42, '#e9d5ff');
    text(ctx, `${this.meta.souls} âmes ✦`, W / 2, 124, 22, '#c084fc');
    text(
      ctx,
      'Les âmes récoltées pendant tes descentes renforcent toutes tes prochaines parties.',
      W / 2,
      154,
      14,
      '#a1a1aa',
      'center',
      'normal',
    );
    const cw = 168,
      gap = 12,
      total = META_UPS.length * cw + (META_UPS.length - 1) * gap,
      x0 = (W - total) / 2;
    META_UPS.forEach((u, i) => {
      const lvl = this.meta.up[u.id] || 0,
        maxed = lvl >= u.max,
        cost = u.cost(lvl);
      const x = x0 + i * (cw + gap),
        y = 190;
      this.panel(ctx, x, y, cw, 290, maxed ? '#fde047' : '#6d28d9');
      drawItemIcon(ctx, u.icon, x + cw / 2, y + 50, 40);
      text(ctx, u.name, x + cw / 2, y + 102, 18, '#fff');
      ctx.font = `13px ${FONT}`;
      wrapText(ctx, u.desc, cw - 24).forEach((l, j) => text(ctx, l, x + cw / 2, y + 130 + j * 18, 13, '#d4d4d8', 'center', 'normal'));
      for (let k = 0; k < u.max; k++) {
        const px = x + cw / 2 - ((u.max - 1) * 18) / 2 + k * 18;
        circle(ctx, px, y + 196, 6, k < lvl ? '#c084fc' : '#3f3f46');
      }
      this.button(
        ctx,
        x + 14,
        y + 224,
        cw - 28,
        44,
        maxed ? 'MAX' : `${cost} ✦`,
        () => {
          this.meta.souls -= cost;
          this.meta.up[u.id] = lvl + 1;
          this.saveMeta();
          Sfx.play('item');
        },
        { disabled: maxed || this.meta.souls < cost, color: '#a855f7', size: 18 },
      );
    });
    this.button(ctx, W / 2 - 90, 530, 180, 44, '← Retour', () => this.setState('menu'), { color: '#94a3b8', size: 17 });
  },

  drawCodex(ctx) {
    this.title(ctx, 'GRIMOIRE', 70, 40, '#fef3c7', '#f59e0b');
    const tabs = [
      ['items', 'Objets'],
      ['ach', 'Succès'],
      ['board', 'Classement'],
      ['stats', 'Chroniques'],
    ];
    const tw = 160,
      tx0 = (W - tabs.length * tw - (tabs.length - 1) * 10) / 2;
    tabs.forEach(([id, label], i) => {
      const x = tx0 + i * (tw + 10),
        on = this.codexTab === id;
      this.button(
        ctx,
        x,
        92,
        tw,
        38,
        label,
        () => {
          this.codexTab = id;
        },
        { color: on ? '#fbbf24' : '#57534e', size: 16 },
      );
      if (on) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(x + 20, 134, tw - 40, 3);
      }
    });
    ({ items: this.drawCodexItems, ach: this.drawCodexAch, board: this.drawCodexBoard, stats: this.drawCodexStats })[this.codexTab].call(
      this,
      ctx,
    );
    this.button(ctx, W / 2 - 90, 576, 180, 42, '← Retour', () => this.setState('menu'), { color: '#94a3b8', size: 16 });
  },
  drawCodexItems(ctx) {
    const seen = this.meta.seen;
    text(
      ctx,
      `Objets découverts : ${ALL_ITEMS.filter(i => seen.includes(i.id)).length} / ${ALL_ITEMS.length}`,
      W / 2,
      164,
      15,
      '#fbbf24',
      'center',
      'normal',
    );
    const cols = 9,
      cs = 64,
      gap = 12,
      gx = (W - (cols * cs + (cols - 1) * gap)) / 2,
      gy = 182;
    let tip = null;
    ALL_ITEMS.forEach((it, i) => {
      const x = gx + (i % cols) * (cs + gap),
        y = gy + Math.floor(i / cols) * (cs + gap);
      const known = seen.includes(it.id),
        isActive = !!ACTIVE_BY_ID[it.id];
      const focused = this.addHit(x, y, cs, cs, () => {});
      roundRect(ctx, x, y, cs, cs, 10);
      ctx.fillStyle = focused ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = focused ? '#fbbf24' : isActive ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = focused ? 2 : 1;
      ctx.stroke();
      if (known) drawItemIcon(ctx, it.icon, x + cs / 2, y + cs / 2 + 1, 28);
      else text(ctx, '?', x + cs / 2, y + cs / 2 + 9, 26, '#4b5563');
      if (isActive) text(ctx, 'ACTIF', x + cs / 2, y + cs - 5, 9, '#7dd3fc');
      if (focused) tip = { x: x + cs / 2, y: y + cs + 6, it, known };
    });
    if (tip) {
      if (tip.known) this.tooltip(ctx, tip.x, tip.y, tip.it.name, tip.it.desc);
      else this.tooltip(ctx, tip.x, tip.y, '???', 'Trouve cet objet pendant une descente', '#6b7280');
    }
  },
  drawCodexAch(ctx) {
    const got = this.meta.ach;
    text(ctx, `Succès débloqués : ${got.length} / ${ACHIEVEMENTS.length}`, W / 2, 164, 15, '#fbbf24', 'center', 'normal');
    const cols = 3,
      cw = 290,
      ch = 56,
      gap = 10,
      gx = (W - (cols * cw + (cols - 1) * gap)) / 2,
      gy = 180;
    ACHIEVEMENTS.forEach((a, i) => {
      const x = gx + (i % cols) * (cw + gap),
        y = gy + Math.floor(i / cols) * (ch + 8),
        ok = got.includes(a.id);
      ctx.fillStyle = ok ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)';
      roundRect(ctx, x, y, cw, ch, 10);
      ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(245,158,11,0.6)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.save();
      if (!ok) ctx.globalAlpha = 0.35;
      drawItemIcon(ctx, a.icon, x + 28, y + ch / 2 + 1, 24);
      ctx.restore();
      text(ctx, a.name, x + 52, y + 24, 15, ok ? '#fde68a' : '#9ca3af', 'left');
      text(ctx, a.desc, x + 52, y + 43, 12, ok ? '#e5e7eb' : '#6b7280', 'left', 'normal');
    });
  },
  drawCodexBoard(ctx) {
    const b = this.meta.board;
    text(ctx, 'Tes 10 meilleures descentes', W / 2, 164, 15, '#fbbf24', 'center', 'normal');
    const cols = [
      ['#', 70, 'left'],
      ['Héros', 110, 'left'],
      ['Résultat', 260, 'left'],
      ['Temps', 470, 'right'],
      ['Score', 580, 'right'],
      ['Seed', 610, 'left'],
      ['Date', 890, 'right'],
    ];
    cols.forEach(([h, x, al]) => text(ctx, h, x, 198, 12, '#a1a1aa', al));
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(60, 206, W - 120, 1);
    if (!b.length) text(ctx, 'Aucune partie terminée pour le moment.', W / 2, 260, 15, '#6b7280', 'center', 'normal');
    b.forEach((r, i) => {
      const y = 232 + i * 32,
        c = CHARACTERS.find(ch => ch.id === r.char) || CHARACTERS[0];
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(60, y - 20, W - 120, 30);
      }
      text(ctx, String(i + 1), 70, y, 15, i === 0 ? '#fde047' : '#e5e7eb', 'left');
      circle(ctx, 116, y - 5, 6, c.body);
      text(ctx, c.name, 128, y, 14, '#e5e7eb', 'left', 'normal');
      const res = (r.win ? 'Victoire' : `Étage ${r.floor}`) + (r.nightmare ? ' · Cauchemar' : '') + (r.daily ? ' · Jour' : '');
      text(ctx, res, 260, y, 14, r.win ? '#86efac' : '#e5e7eb', 'left', 'normal');
      text(ctx, fmtTime(r.time), 470, y, 14, '#e5e7eb', 'right', 'normal');
      text(ctx, r.score.toLocaleString('fr-FR'), 580, y, 15, '#fde68a', 'right');
      text(ctx, r.seed, 610, y, 13, '#7dd3fc', 'left', 'normal');
      text(ctx, r.date.split('-').reverse().join('/'), 890, y, 13, '#94a3b8', 'right', 'normal');
    });
  },
  drawCodexStats(ctx) {
    const st = this.meta.stats;
    const rows = [
      ['Descentes', st.runs],
      ['Victoires', st.wins],
      ['Victoires en Cauchemar', st.nightmareWins],
      ['Morts', st.deaths],
      ['Ennemis vaincus', st.kills],
      ["Ennemis d'élite vaincus", st.elites],
      ['Boss vaincus', st.bosses],
      ['Salles secrètes trouvées', st.secrets],
      ['Record', st.bestFloor > MAX_FLOOR ? 'Crypte vaincue' : st.bestFloor ? 'Étage ' + st.bestFloor : '—'],
      ['Victoire la plus rapide', st.fastWin ? fmtTime(st.fastWin) : '—'],
      ['Temps de jeu total', fmtTime(st.time)],
    ];
    this.panel(ctx, W / 2 - 230, 160, 460, 390, 'rgba(251,191,36,0.4)');
    rows.forEach(([k, v], i) => {
      text(ctx, k, W / 2 - 200, 196 + i * 32, 15, '#a1a1aa', 'left', 'normal');
      text(ctx, String(v), W / 2 + 200, 196 + i * 32, 15, '#fff', 'right');
    });
  },

  drawSettings(ctx) {
    this.title(ctx, 'PARAMÈTRES', 64, 36, '#e5e7eb', '#64748b');
    const x = W / 2 - 240,
      w = 480,
      h = 37,
      step = 42;
    let y = 86;
    const row = () => {
      const r = y;
      y += step;
      return r;
    };
    const vol = (key, label) =>
      this.button(
        ctx,
        x,
        row(),
        w,
        h,
        label,
        () => {
          Settings[key] = Settings[key] >= 1 ? 0 : Math.round((Settings[key] + 0.1) * 10) / 10;
          saveSettings();
        },
        {
          value: Math.round(Settings[key] * 100) + '%',
          bar: Settings[key],
          color: '#94a3b8',
          size: 16,
          onAdjust: d => {
            Settings[key] = clamp(Math.round((Settings[key] + d * 0.1) * 10) / 10, 0, 1);
            saveSettings();
          },
        },
      );
    const tog = (key, label) => {
      const flip = () => {
        Settings[key] = !Settings[key];
        saveSettings();
      };
      this.button(ctx, x, row(), w, h, label, flip, { value: Settings[key] ? 'Oui' : 'Non', color: '#94a3b8', size: 16, onAdjust: flip });
    };
    vol('music', 'Musique');
    vol('sfx', 'Effets sonores');
    tog('shake', "Tremblements d'écran");
    tog('reduceFlash', 'Réduire les flashs');
    tog('contrastShots', 'Tirs ennemis contrastés');
    tog('dmgNumbers', 'Chiffres de dégâts');
    tog('showFps', 'Afficher les FPS');
    this.button(ctx, x, row(), w, h, 'Plein écran', () => this.toggleFullscreen(), {
      value: document.fullscreenElement ? 'Oui' : 'Non',
      color: '#94a3b8',
      size: 16,
    });
    this.button(ctx, x, row(), w, h, 'Touches du clavier', () => this.setState('controls'), { value: '›', color: '#94a3b8', size: 16 });
    const tutLabel = this.meta.tutorialDone ? 'Non' : 'Oui';
    this.button(
      ctx,
      x,
      row(),
      w,
      h,
      'Tutoriel à la prochaine partie',
      () => {
        this.meta.tutorialDone = !this.meta.tutorialDone;
        this.saveMeta();
      },
      { value: tutLabel, color: '#94a3b8', size: 16 },
    );
    this.button(ctx, W / 2 - 90, y + 8, 180, 40, '← Retour', () => this.setState(this.settingsReturn), { color: '#94a3b8', size: 16 });
    this.hint(ctx, '← → ajuster  ·  Échap : retour');
  },

  drawControls(ctx) {
    this.title(ctx, 'TOUCHES', 70, 36, '#e5e7eb', '#64748b');
    const x = W / 2 - 230,
      w = 460;
    ACTIONS.forEach((a, i) => {
      const listening = this.listening === a;
      this.button(
        ctx,
        x,
        96 + i * 46,
        w,
        40,
        ACTION_LABELS[a],
        () => {
          this.listening = a;
          Input.capture = code => {
            this.listening = null;
            if (code === 'Escape') return;
            // échange si la touche est déjà utilisée
            const other = ACTIONS.find(b => b !== a && Settings.keys[b] === code);
            if (other) Settings.keys[other] = Settings.keys[a];
            Settings.keys[a] = code;
            saveSettings();
            Sfx.play('click');
          };
        },
        { value: listening ? 'Appuie sur une touche…' : keyLabel(Settings.keys[a]), color: listening ? '#fbbf24' : '#94a3b8', size: 16 },
      );
    });
    const by = 96 + ACTIONS.length * 46 + 10;
    text(
      ctx,
      'Tir : souris ou flèches  ·  Pause : Échap  ·  Plein écran : F  ·  Son : M',
      W / 2,
      by + 6,
      13,
      '#94a3b8',
      'center',
      'normal',
    );
    this.button(
      ctx,
      W / 2 - 200,
      by + 24,
      190,
      40,
      'Réinitialiser',
      () => {
        Settings.keys = { ...DEFAULT_KEYS };
        saveSettings();
      },
      { color: '#ef4444', size: 16 },
    );
    this.button(
      ctx,
      W / 2 + 10,
      by + 24,
      190,
      40,
      '← Retour',
      () => {
        Input.capture = null;
        this.listening = null;
        this.setState('settings');
      },
      { color: '#94a3b8', size: 16 },
    );
  },

  drawPause(ctx) {
    ctx.fillStyle = 'rgba(5,4,8,0.78)';
    ctx.fillRect(0, 0, W, H);
    this.title(ctx, 'PAUSE', 120, 52, '#fff', this.theme.accent);
    let y = 150;
    const btn = (label, fn, opts) => {
      this.button(ctx, W / 2 - 130, y, 260, 44, label, fn, opts);
      y += 52;
    };
    btn('Reprendre', () => this.setState('playing'));
    btn(
      'Paramètres',
      () => {
        this.settingsReturn = 'paused';
        this.setState('settings');
      },
      { color: '#94a3b8' },
    );
    if (this.tut) btn('Passer le tutoriel', () => this.finishTutorial(false), { color: '#64748b', size: 17 });
    btn(
      this.confirmQuit ? 'Vraiment abandonner ?' : 'Abandonner',
      () => {
        if (this.confirmQuit) this.gameOver(false);
        else this.confirmQuit = true;
      },
      { color: '#ef4444', size: this.confirmQuit ? 17 : 20 },
    );
    const p = this.player;
    this.panel(ctx, W / 2 - 280, 384, 560, 196, 'rgba(255,255,255,0.08)');
    text(ctx, `${p.char.name} ${p.char.title}`, W / 2, 410, 16, p.char.body);
    const stats = [
      ['Dégâts', (p.rage && p.hp <= 2 ? p.dmg * 1.6 : p.dmg).toFixed(1)],
      ['Cadence', (1 / p.fireDelay).toFixed(1) + '/s'],
      ['Vitesse', Math.round(p.speed)],
      ['Portée', p.range.toFixed(2)],
      ['Critique', Math.round(p.crit * 100) + '%'],
      ['Tirs', p.multishot + (p.backshot ? '+1' : '')],
    ];
    stats.forEach(([k, v], i) => {
      const x = W / 2 - 250 + (i % 3) * 180,
        sy = 440 + Math.floor(i / 3) * 26;
      text(ctx, k, x, sy, 14, '#94a3b8', 'left', 'normal');
      text(ctx, String(v), x + 80, sy, 15, '#fff', 'left');
    });
    let tip = null;
    p.items.forEach((id, i) => {
      const x = W / 2 - (p.items.length - 1) * 15 + i * 30,
        iy = 520;
      drawItemIcon(ctx, ITEM_BY_ID[id].icon, x, iy, 22);
      if (Math.abs(Input.mouse.x - x) < 14 && Math.abs(Input.mouse.y - iy) < 14) tip = { x, y: iy, it: ITEM_BY_ID[id] };
    });
    if (!p.items.length) text(ctx, "Aucun objet pour l'instant", W / 2, 525, 13, '#6b7280', 'center', 'normal');
    text(ctx, `Seed : ${this.seed}`, W / 2, 564, 13, '#7dd3fc', 'center', 'normal');
    if (tip) this.tooltip(ctx, tip.x, tip.y - 62, tip.it.name, tip.it.desc);
  },

  drawCredits(ctx) {
    const t = this.creditsT,
      lineH = { title: 70, head: 34, line: 30, gap: 30 };
    let y = H + 40 - t * 42;
    ctx.save();
    for (const [kind, str] of CREDITS) {
      if (kind === 'title') {
        ctx.save();
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 24;
        ctx.font = `900 40px ${TFONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde68a';
        ctx.fillText(str, W / 2, y);
        ctx.restore();
      } else if (kind === 'head') text(ctx, str.toUpperCase(), W / 2, y, 14, '#c4b5fd');
      else if (kind === 'line') text(ctx, str, W / 2, y, 20, '#f5f5f4', 'center', 'normal');
      y += lineH[kind];
    }
    ctx.restore();
    // fondu haut et bas
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(7,6,11,1)');
    g.addColorStop(0.15, 'rgba(7,6,11,0)');
    g.addColorStop(0.85, 'rgba(7,6,11,0)');
    g.addColorStop(1, 'rgba(7,6,11,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (Input.lastDevice !== 'touch') text(ctx, 'Entrée pour passer', W - 20, H - 20, 12, '#6b7280', 'right', 'normal');
    else text(ctx, 'Touche l’écran pour passer', W - 20, H - 20, 12, '#6b7280', 'right', 'normal');
  },

  drawEnd(ctx) {
    const r = this.lastRun,
      win = r.win;
    const a = clamp(this.stateT * 2, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = win ? 'rgba(20,12,4,0.9)' : 'rgba(12,2,6,0.9)';
    ctx.fillRect(0, 0, W, H);
    this.title(ctx, win ? 'VICTOIRE' : 'TU ES MORT', 100, 54, win ? '#fde047' : '#f87171', win ? '#fbbf24' : '#dc2626');
    const where = `${r.char.name} est tombé${r.char.id === 'knight' ? '' : 'e'} à l'étage ${r.floor} — ${THEMES[(r.floor - 1) % THEMES.length].name}`;
    text(ctx, win ? 'La Liche est tombée. La crypte est libérée.' : where, W / 2, 136, 16, '#e5e7eb', 'center', 'normal');
    const badges = [r.nightmare && 'Cauchemar', r.daily && 'Défi du jour'].filter(Boolean).join(' · ');
    if (badges) text(ctx, badges, W / 2, 158, 13, '#fca5a5', 'center');
    const rows = [
      ['Ennemis vaincus', r.kills],
      ['Boss vaincus', r.bosses],
      ['Secrets trouvés', r.secrets],
      ['Temps', fmtTime(r.time)],
      ['Âmes récoltées', `+${r.souls} ✦`],
      ['Score', r.score.toLocaleString('fr-FR') + (r.rank ? `  (n° ${r.rank})` : '')],
    ];
    rows.forEach(([k, v], i) => {
      text(ctx, k, W / 2 - 160, 190 + i * 27, 15, '#a1a1aa', 'left', 'normal');
      text(ctx, String(v), W / 2 + 160, 190 + i * 27, 16, i === 4 ? '#c084fc' : i === 5 ? '#fde68a' : '#fff', 'right');
    });
    r.items.forEach((id, i) => drawItemIcon(ctx, ITEM_BY_ID[id].icon, W / 2 - (r.items.length - 1) * 14 + i * 28, 365, 20));
    let by = 392;
    if (r.unlocks.length) {
      const c = r.unlocks[0],
        pulse = 0.6 + Math.sin(this.t * 4) * 0.4;
      ctx.fillStyle = `rgba(168,85,247,${0.15 + pulse * 0.1})`;
      roundRect(ctx, W / 2 - 220, by, 440, 34, 10);
      ctx.fill();
      text(ctx, `✦ Nouveau héros débloqué : ${c.name} ${c.title} !`, W / 2, by + 23, 15, '#e9d5ff');
      by += 44;
    }
    this.button(
      ctx,
      W / 2 - 330,
      by,
      210,
      46,
      'Rejouer',
      () => {
        Object.assign(this.runOpts, { seed: '', daily: false, nightmare: r.nightmare });
        this.newRun(r.char.id);
      },
      { size: 18 },
    );
    this.button(
      ctx,
      W / 2 - 105,
      by,
      210,
      46,
      'Même seed',
      () => {
        Object.assign(this.runOpts, { seed: r.daily ? '' : r.seed, daily: r.daily, nightmare: r.nightmare });
        this.newRun(r.char.id);
      },
      { color: '#38bdf8', size: 18 },
    );
    this.button(ctx, W / 2 + 120, by, 210, 46, 'Changer de héros', () => this.setState('select'), { color: '#a855f7', size: 17 });
    this.button(ctx, W / 2 - 215, by + 56, 210, 40, 'Autel des âmes', () => this.setState('meta'), { color: '#a855f7', size: 16 });
    this.button(ctx, W / 2 + 5, by + 56, 210, 40, 'Menu', () => this.setState('menu'), { color: '#94a3b8', size: 16 });
    const seedFocus = this.addHit(W / 2 - 120, by + 104, 240, 26, () => {
      navigator.clipboard?.writeText(r.seed).then(
        () => {
          this.seedCopiedT = 2;
        },
        () => {},
      );
    });
    const copied = this.seedCopiedT > 0 && (this.seedCopiedT -= 1 / 60) > 0;
    text(
      ctx,
      copied ? 'Seed copiée !' : `Seed : ${r.seed}  (copier)`,
      W / 2,
      by + 122,
      14,
      seedFocus ? '#fde047' : '#7dd3fc',
      'center',
      'normal',
    );
    ctx.globalAlpha = 1;
  },
});
