'use strict';
const FONT = '"Outfit", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const TFONT = '"Cinzel", Georgia, serif';

function circle(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function shadow(ctx, x, y, rx, a = 0.35) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.38, 0, 0, TAU); ctx.fill(); }
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

function drawHeart(ctx, x, y, s, fill) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  };
  path(); ctx.fillStyle = '#2a1520'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
  if (fill > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(x - s, y - 2, fill >= 1 ? s * 2 : s, s + 4); ctx.clip();
    path(); ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x - s * 0.25, y + s * 0.25, s * 0.1, s * 0.07, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function drawCoin(ctx, x, y, r) {
  circle(ctx, x, y, r, '#b45309');
  circle(ctx, x, y - 1, r, '#fbbf24');
  circle(ctx, x, y - 1, r * 0.6, '#f59e0b');
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - r * 0.35, y - r * 0.6, r * 0.25, r * 0.5);
}

function drawPlayer(ctx, p, t) {
  if (p.hp <= 0) return;
  const C = p.char;
  shadow(ctx, p.x, p.y + p.r * 0.9, p.r);
  if (p.iframes > 0 && p.dashTime <= 0 && Math.floor(p.iframes * 18) % 2 === 0) return;
  const bob = p.moving ? Math.sin(p.walkT * 14) * 1.8 : Math.sin(t * 3) * 0.8;
  const ax = Math.cos(p.aim), ay = Math.sin(p.aim);
  ctx.save(); ctx.translate(p.x, p.y + bob);
  const weapon = () => {
    ctx.lineCap = 'round';
    if (C.id === 'knight') {
      ctx.strokeStyle = '#d6d3d1'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(ax * 4 - ay * 11, ay * 4 + ax * 11); ctx.lineTo(ax * 34 - ay * 9, ay * 34 + ax * 9); ctx.stroke();
      circle(ctx, ax * 34 - ay * 9, ay * 34 + ax * 9, 3.5, C.shot);
    } else if (C.id === 'rogue') {
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ax * 8 - ay * 11 * s, ay * 8 + ax * 11 * s); ctx.lineTo(ax * 22 - ay * 12 * s, ay * 22 + ax * 12 * s); ctx.stroke(); }
    } else {
      ctx.strokeStyle = '#a16207'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(ax * 6 - ay * 10, ay * 6 + ax * 10); ctx.lineTo(ax * 26 - ay * 8, ay * 26 + ax * 8); ctx.stroke();
      ctx.globalAlpha = 0.35; circle(ctx, ax * 28 - ay * 8, ay * 28 + ax * 8, 9, C.shot);
      ctx.globalAlpha = 1; circle(ctx, ax * 28 - ay * 8, ay * 28 + ax * 8, 4.5, C.orb);
    }
  };
  if (ay < 0) weapon();
  if (C.id === 'rogue') { // écharpe
    ctx.strokeStyle = C.dark; ctx.lineWidth = 5; ctx.beginPath();
    ctx.moveTo(-ax * 6, -ay * 6 + 4); ctx.quadraticCurveTo(-ax * 18, -ay * 18 + 8 + Math.sin(t * 10) * 3, -ax * 26, -ay * 22 + 4); ctx.stroke();
  }
  ctx.fillStyle = C.dark;
  ctx.beginPath(); ctx.moveTo(-p.r, 2); ctx.quadraticCurveTo(0, p.r * 1.6, p.r, 2); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
  circle(ctx, 0, 0, p.r, C.body);
  circle(ctx, -3, -4, p.r * 0.55, 'rgba(255,255,255,0.18)');
  if (C.id === 'knight') {
    ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(-3, -p.r + 1); ctx.quadraticCurveTo(0, -p.r - 12, 8, -p.r - 6); ctx.lineTo(3, -p.r + 2); ctx.fill();
    circle(ctx, ax * 4, ay * 3 - 2, p.r * 0.62, '#57534e');
    ctx.fillStyle = '#0b1220'; ctx.save(); ctx.translate(ax * 5, ay * 3 - 2); ctx.rotate(p.aim + Math.PI / 2);
    if (ay > -0.6) ctx.fillRect(-6, -2, 12, 3);
    ctx.restore();
  } else {
    circle(ctx, ax * 4, ay * 3 - 2, p.r * 0.62, '#0b1220');
    const ex = ax * 6, ey = ay * 4 - 2, px = -ay * 3.6, py = ax * 3.6;
    if (ay > -0.6) {
      circle(ctx, ex + px, ey + py, 2.2, C.orb);
      circle(ctx, ex - px, ey - py, 2.2, C.orb);
    }
  }
  if (ay >= 0) weapon();
  ctx.restore();
  if (p.dashT > 0) {
    const k = 1 - p.dashT / p.dashCooldown;
    ctx.globalAlpha = 0.7; ctx.strokeStyle = C.body; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawBomb(ctx, b, t) {
  const k = 1 - b.t / b.max, pulse = 1 + Math.sin(t * (10 + k * 30)) * 0.08 * (0.5 + k);
  shadow(ctx, b.x, b.y + 12, 13);
  ctx.save(); ctx.translate(b.x, b.y); ctx.scale(pulse, pulse);
  circle(ctx, 0, 0, 13, Math.sin(t * (8 + k * 30)) > 0.4 ? '#7f1d1d' : '#1c1917');
  circle(ctx, -4, -4, 4, 'rgba(255,255,255,0.25)');
  ctx.fillStyle = '#57534e'; ctx.fillRect(-4, -17, 8, 6);
  ctx.strokeStyle = '#a8a29e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(6, -24, 10, -22); ctx.stroke();
  circle(ctx, 10, -22, 3 + Math.random() * 2, '#fde047');
  ctx.restore();
}

function eyes(ctx, e, g, sp, y, size = 3, col = '#111') {
  const a = angle(e, g.player), ox = Math.cos(a) * 2, oy = Math.sin(a) * 2;
  circle(ctx, -sp + ox * 0.5, y, size + 1.5, '#fff'); circle(ctx, sp + ox * 0.5, y, size + 1.5, '#fff');
  circle(ctx, -sp + ox, y + oy, size, col); circle(ctx, sp + ox, y + oy, size, col);
}

const BODY = {
  slime(ctx, e, g, c) {
    const sq = Math.sin(e.t * 8 + e.seed) * 0.08;
    ctx.scale(1 + sq, 1 - sq);
    ctx.fillStyle = c; ctx.beginPath();
    ctx.moveTo(-e.r, e.r * 0.6);
    ctx.bezierCurveTo(-e.r * 1.1, -e.r * 0.9, e.r * 1.1, -e.r * 0.9, e.r, e.r * 0.6);
    ctx.quadraticCurveTo(0, e.r * 0.9, -e.r, e.r * 0.6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(-e.r * 0.4, -e.r * 0.25, e.r * 0.2, e.r * 0.12, -0.6, 0, TAU); ctx.fill();
    eyes(ctx, e, g, e.r * 0.32, 0, e.r * 0.14);
  },
  bat(ctx, e, g, c) {
    const f = Math.sin(e.t * 22) * 0.7;
    ctx.fillStyle = '#3b2a4f';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(s * e.r * 2.1, -e.r * (0.3 + f)); ctx.lineTo(s * e.r * 1.4, e.r * 0.2); ctx.lineTo(s * e.r * 0.9, e.r * 0.5 - f * 4);
      ctx.closePath(); ctx.fill();
    }
    circle(ctx, 0, 0, e.r * 0.8, c);
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-4, -e.r - 4); ctx.lineTo(0, -6); ctx.moveTo(6, -6); ctx.lineTo(4, -e.r - 4); ctx.lineTo(0, -6); ctx.fill();
    circle(ctx, -3.5, -1, 2.2, '#fde047'); circle(ctx, 3.5, -1, 2.2, '#fde047');
  },
  archer(ctx, e, g, c) {
    const a = angle(e, g.player);
    if (e.state === 'aim') { ctx.globalAlpha = 0.4 + Math.sin(e.t * 40) * 0.2; circle(ctx, 0, 0, e.r + 7, '#ef4444'); ctx.globalAlpha = 1; }
    circle(ctx, 0, 0, e.r, c);
    ctx.fillStyle = '#b8ad8a'; ctx.fillRect(-e.r * 0.5, e.r * 0.35, e.r, e.r * 0.4);
    circle(ctx, -5, -2, 4, '#1c1917'); circle(ctx, 5, -2, 4, '#1c1917');
    circle(ctx, -5, -2, 1.5, '#ef4444'); circle(ctx, 5, -2, 1.5, '#ef4444');
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, e.r, a - 1, a + 1); ctx.stroke();
  },
  charger(ctx, e, g, c) {
    if (e.state === 'windup') ctx.translate(rand(-2, 2), rand(-2, 2));
    const a = e.state === 'charge' || e.state === 'windup' ? e.ca || 0 : angle(e, g.player);
    ctx.rotate(a);
    ctx.fillStyle = '#f5f5f4';
    ctx.beginPath(); ctx.moveTo(e.r * 0.4, -e.r * 0.7); ctx.lineTo(e.r * 1.35, -e.r * 0.9); ctx.lineTo(e.r * 0.7, -e.r * 0.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(e.r * 0.4, e.r * 0.7); ctx.lineTo(e.r * 1.35, e.r * 0.9); ctx.lineTo(e.r * 0.7, e.r * 0.2); ctx.fill();
    circle(ctx, 0, 0, e.r, c);
    circle(ctx, -3, 0, e.r * 0.75, 'rgba(0,0,0,0.15)');
    const col = e.state === 'windup' || e.state === 'charge' ? '#fde047' : '#fca5a5';
    circle(ctx, e.r * 0.45, -5, 3, col); circle(ctx, e.r * 0.45, 5, 3, col);
  },
  spinner(ctx, e, g, c) {
    ctx.save(); ctx.rotate(e.t * 3);
    ctx.fillStyle = '#b45309';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(e.r * 0.7, -5); ctx.lineTo(e.r * 1.35, 0); ctx.lineTo(e.r * 0.7, 5); ctx.fill();
    }
    ctx.restore();
    circle(ctx, 0, 0, e.r, c);
    const k = Math.max(0, 1 - e.timer / 0.6);
    circle(ctx, 0, 0, e.r * 0.5, '#fff7ed'); circle(ctx, 0, 0, e.r * 0.3, k > 0 ? `rgb(${200 + 55 * k},${80 - 60 * k},20)` : '#7c2d12');
  },
  ghost(ctx, e, g, c) {
    ctx.globalAlpha *= 0.55 + Math.sin(e.t * 3) * 0.2;
    ctx.fillStyle = c; ctx.beginPath();
    ctx.arc(0, -2, e.r, Math.PI, 0);
    for (let i = 0; i <= 4; i++) ctx.lineTo(e.r - (i * e.r * 2) / 4, e.r + (i % 2 ? -4 : 3) + Math.sin(e.t * 6 + i) * 2);
    ctx.closePath(); ctx.fill();
    circle(ctx, -5, -3, 3.5, '#0f172a'); circle(ctx, 5, -3, 3.5, '#0f172a');
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.ellipse(0, 6, 3, 4, 0, 0, TAU); ctx.fill();
  },
  kingslime(ctx, e, g, c) {
    BODY.slime(ctx, e, g, e.hp < e.maxHp * 0.5 ? '#4ade80' : c);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.moveTo(-22, -e.r * 0.55); ctx.lineTo(-24, -e.r * 0.95); ctx.lineTo(-11, -e.r * 0.75); ctx.lineTo(0, -e.r * 1.05);
    ctx.lineTo(11, -e.r * 0.75); ctx.lineTo(24, -e.r * 0.95); ctx.lineTo(22, -e.r * 0.55); ctx.closePath(); ctx.fill();
    circle(ctx, 0, -e.r * 0.72, 4, '#ef4444');
  },
  eye(ctx, e, g, c) {
    const ph2 = e.hp < e.maxHp * 0.5;
    ctx.globalAlpha *= 0.3; circle(ctx, 0, 0, e.r + 12 + Math.sin(e.t * 4) * 4, ph2 ? '#ef4444' : '#a855f7'); ctx.globalAlpha /= 0.3;
    circle(ctx, 0, 0, e.r, ph2 ? '#fecaca' : c);
    ctx.strokeStyle = 'rgba(220,38,38,0.55)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3; ctx.beginPath();
      ctx.moveTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
      ctx.quadraticCurveTo(Math.cos(a + 0.2) * e.r * 0.75, Math.sin(a + 0.2) * e.r * 0.75, Math.cos(a) * e.r * 0.55, Math.sin(a) * e.r * 0.55); ctx.stroke();
    }
    const a = angle(e, g.player);
    const ix = Math.cos(a) * e.r * 0.35, iy = Math.sin(a) * e.r * 0.35;
    circle(ctx, ix, iy, e.r * 0.45, ph2 ? '#dc2626' : '#7c3aed');
    circle(ctx, ix, iy, e.r * 0.22, '#000');
    circle(ctx, ix - 5, iy - 6, 4, 'rgba(255,255,255,0.8)');
  },
  golem(ctx, e, g, c) {
    if (e.state === 'windup' || e.state === 'slamwind') ctx.translate(rand(-3, 3), rand(-3, 3));
    const arm = e.state === 'slamwind' ? -18 : Math.sin(e.t * 5) * 4;
    ctx.fillStyle = '#6b7280';
    roundRect(ctx, -e.r - 14, -8 + arm, 18, 30, 6); ctx.fill();
    roundRect(ctx, e.r - 4, -8 + arm, 18, 30, 6); ctx.fill();
    ctx.fillStyle = c; roundRect(ctx, -e.r, -e.r, e.r * 2, e.r * 1.9, 14); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; roundRect(ctx, -e.r, e.r * 0.3, e.r * 2, e.r * 0.6, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-20, -30); ctx.lineTo(-8, -12); ctx.lineTo(-14, 4); ctx.moveTo(18, 10); ctx.lineTo(8, 24); ctx.stroke();
    const glow = e.state === 'stun' ? '#57534e' : e.hp < e.maxHp * 0.5 ? '#ef4444' : '#fb923c';
    ctx.fillStyle = glow; ctx.fillRect(-18, -16, 12, 6); ctx.fillRect(6, -16, 12, 6);
    if (e.state === 'stun') { ctx.fillStyle = '#fde047'; ctx.font = `bold 18px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('✦ ✦', Math.sin(e.t * 8) * 6, -e.r - 10); }
  },
  lich(ctx, e, g, c) {
    ctx.globalAlpha *= 0.25; circle(ctx, 0, 0, e.r + 18 + Math.sin(e.t * 3) * 5, '#7c3aed'); ctx.globalAlpha *= 4;
    ctx.fillStyle = '#2e1065';
    ctx.beginPath(); ctx.moveTo(-e.r, e.r * 1.3); ctx.lineTo(-e.r * 0.6, -e.r * 0.4); ctx.lineTo(e.r * 0.6, -e.r * 0.4); ctx.lineTo(e.r, e.r * 1.3);
    for (let i = 0; i < 5; i++) ctx.lineTo(e.r - (i + 0.5) * (e.r * 2) / 5, e.r * 1.3 + (i % 2 ? 8 : 0) + Math.sin(e.t * 5 + i) * 3);
    ctx.closePath(); ctx.fill();
    circle(ctx, 0, -e.r * 0.5, e.r * 0.62, '#e7e5e4');
    ctx.fillStyle = '#4c1d95'; ctx.beginPath(); ctx.arc(0, -e.r * 0.5, e.r * 0.72, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(0, -e.r * 1.5); ctx.closePath(); ctx.fill();
    const ec = e.hp < e.maxHp * 0.5 ? '#f43f5e' : '#c084fc';
    circle(ctx, -6, -e.r * 0.5, 4, '#000'); circle(ctx, 6, -e.r * 0.5, 4, '#000');
    circle(ctx, -6, -e.r * 0.5, 2.2, ec); circle(ctx, 6, -e.r * 0.5, 2.2, ec);
    ctx.strokeStyle = '#a16207'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.r * 0.9, -e.r); ctx.lineTo(e.r * 0.9, e.r * 1.2); ctx.stroke();
    circle(ctx, e.r * 0.9, -e.r - 4, 6 + Math.sin(e.t * 6) * 1.5, ec);
  },
};

function drawEnemy(ctx, e, g) {
  const spawning = e.spawnT > 0;
  const k = spawning ? 1 - e.spawnT / e.spawnMax : 1;
  if (spawning) {
    ctx.save(); ctx.strokeStyle = g.theme.accent; ctx.globalAlpha = 0.7 * (1 - k); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (2 - k), 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.2 - k * 0.5), 0, TAU); ctx.stroke();
    ctx.restore();
  }
  shadow(ctx, e.x, e.y + e.r * 0.85, e.r * (1 - Math.min(0.5, e.z / 300)) * k, e.fly ? 0.2 : 0.35);
  if (e.elite && !spawning) {
    ctx.globalAlpha = 0.35 + Math.sin(e.t * 6) * 0.12;
    circle(ctx, e.x, e.y - (e.fly ? 6 : 0), e.r + 9, '#fbbf24');
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(e.x, e.y - e.z - (e.fly ? 6 + Math.sin(e.t * 4 + e.seed) * 3 : 0));
  ctx.globalAlpha = k * e.alpha;
  ctx.scale(k, k);
  const col = e.flash > 0 ? '#ffffff' : e.def.color;
  BODY[e.def.body](ctx, e, g, col);
  ctx.restore();
  if (!e.boss && e.hp < e.maxHp && !spawning) {
    const w = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 14, w, 4);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(e.x - w / 2, e.y - e.r - 14, (w * Math.max(0, e.hp)) / e.maxHp, 4);
  }
}

function drawBullet(ctx, b) {
  ctx.globalAlpha = 0.3; circle(ctx, b.x, b.y, b.r * 2, b.color);
  ctx.globalAlpha = 1; circle(ctx, b.x, b.y, b.r, b.color);
  circle(ctx, b.x, b.y, b.r * 0.5, '#fff');
}

function drawItemIcon(ctx, icon, x, y, size) {
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  ctx.fillText(icon, x, y);
  ctx.textBaseline = 'alphabetic';
}

function text(ctx, str, x, y, size, color = '#fff', align = 'center', weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = align;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(str, x + 2, y + 2);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function wrapText(ctx, str, maxW) {
  const words = str.split(' '), lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
