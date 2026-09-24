'use strict';
// e.code est indépendant de la disposition : ZQSD en AZERTY = KeyW/KeyA/KeyS/KeyD
const KEYMAP = {
  dash: ['Space', 'ShiftLeft', 'ShiftRight'], bomb: ['KeyE'], pause: ['Escape', 'KeyP'], map: ['Tab'],
  confirm: ['Enter', 'Space'], back: ['Escape', 'Backspace'],
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  fullscreen: ['KeyF'], mute: ['KeyM'],
};
// Disposition standard (Xbox / PlayStation)
const PADMAP = {
  dash: [0, 5, 7], bomb: [2, 4], pause: [9], map: [8], confirm: [0], back: [1],
  up: [12], down: [13], left: [14], right: [15],
};
const DEADZONE = 0.25;

const Input = {
  keys: new Set(), pressed: new Set(),
  mouse: { x: W / 2, y: H / 2, down: false }, clicked: false, mouseMoved: false,
  lastDevice: 'mouse',
  pad: { connected: false, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, down: new Set(), pressed: new Set(), nav: new Set(), prevNav: { x: 0, y: 0 } },
  init(canvas) {
    addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keys';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
      Sfx.init();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * W / r.width;
      this.mouse.y = (e.clientY - r.top) * H / r.height;
    };
    canvas.addEventListener('mousemove', e => { pos(e); this.mouseMoved = true; this.lastDevice = 'mouse'; });
    canvas.addEventListener('mousedown', e => {
      pos(e); this.lastDevice = 'mouse';
      if (e.button === 0) { this.mouse.down = true; this.clicked = true; }
      Sfx.init();
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('gamepadconnected', () => { this.pad.connected = true; });
    addEventListener('gamepaddisconnected', () => { this.pad.connected = false; });
  },
  poll() {
    const P = this.pad;
    P.pressed.clear(); P.nav.clear();
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    if (!gp) { P.move.x = P.move.y = P.aim.x = P.aim.y = 0; P.down.clear(); return; }
    P.connected = true;
    const dz = v => (Math.abs(v) < DEADZONE ? 0 : v);
    P.move.x = dz(gp.axes[0] || 0); P.move.y = dz(gp.axes[1] || 0);
    P.aim.x = dz(gp.axes[2] || 0); P.aim.y = dz(gp.axes[3] || 0);
    const now = new Set();
    gp.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) now.add(i); });
    for (const i of now) if (!P.down.has(i)) P.pressed.add(i);
    P.down = now;
    // stick gauche comme croix directionnelle dans les menus
    const nx = Math.abs(P.move.x) > 0.6 ? Math.sign(P.move.x) : 0, ny = Math.abs(P.move.y) > 0.6 ? Math.sign(P.move.y) : 0;
    if (ny && ny !== P.prevNav.y) P.nav.add(ny < 0 ? 'up' : 'down');
    if (nx && nx !== P.prevNav.x) P.nav.add(nx < 0 ? 'left' : 'right');
    P.prevNav = { x: nx, y: ny };
    if (now.size || P.move.x || P.move.y || P.aim.x || P.aim.y) { this.lastDevice = 'pad'; Sfx.init(); }
  },
  down(...c) { return c.some(k => this.keys.has(k)); },
  hit(...c) { return c.some(k => this.pressed.has(k)); },
  act(name) {
    if (KEYMAP[name] && KEYMAP[name].some(k => this.pressed.has(k))) return true;
    if (PADMAP[name] && PADMAP[name].some(i => this.pad.pressed.has(i))) return true;
    return this.pad.nav.has(name);
  },
  endFrame() { this.pressed.clear(); this.clicked = false; this.mouseMoved = false; },
};
