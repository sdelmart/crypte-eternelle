import { W, H, HUD_H } from './utils.js';
import { Settings } from './settings.js';
import { Sfx } from './audio.js';

// Actions reconfigurables (codes physiques : indépendants de la disposition AZERTY / QWERTY)
export const ACTIONS = ['up', 'down', 'left', 'right', 'dash', 'bomb', 'active', 'map'];
export const ACTION_LABELS = {
  up: 'Haut',
  down: 'Bas',
  left: 'Gauche',
  right: 'Droite',
  dash: 'Dash',
  bomb: 'Bombe',
  active: 'Objet actif',
  map: 'Carte',
};

// Touches fixes (menus et raccourcis)
const FIXED = {
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'Space', 'NumpadEnter'],
  back: ['Escape', 'Backspace'],
  fullscreen: ['KeyF'],
  mute: ['KeyM'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
};
// Manette, disposition standard (Xbox / PlayStation)
const PADMAP = {
  dash: [0, 5, 7],
  bomb: [2, 4],
  active: [3],
  pause: [9],
  map: [8],
  confirm: [0],
  back: [1],
  up: [12],
  down: [13],
  left: [14],
  right: [15],
};
const DEADZONE = 0.25;

// Noms affichés des touches. La disposition réelle est lue quand le navigateur le permet.
const NAMED = {
  Space: 'Espace',
  ShiftLeft: 'Maj G',
  ShiftRight: 'Maj D',
  ControlLeft: 'Ctrl G',
  ControlRight: 'Ctrl D',
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  Tab: 'Tab',
  Enter: 'Entrée',
  Backspace: 'Retour',
  CapsLock: 'Verr. Maj',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const AZERTY = { KeyQ: 'A', KeyA: 'Q', KeyW: 'Z', KeyZ: 'W', Semicolon: 'M', KeyM: ',' };
let layoutMap = null;
let guessAzerty = typeof navigator !== 'undefined' && /^fr/i.test(navigator.language || '');

export function keyLabel(code) {
  if (!code) return '—';
  if (NAMED[code]) return NAMED[code];
  if (layoutMap && layoutMap.get(code)) return layoutMap.get(code).toUpperCase();
  if (guessAzerty && AZERTY[code]) return AZERTY[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Pavé ' + code.slice(6);
  return code;
}

// Commandes tactiles (coordonnées logiques)
export const TOUCH_BUTTONS = [
  { id: 'dash', x: W - 62, y: H - 236, r: 38, icon: '💨' },
  { id: 'bomb', x: W - 62, y: H - 146, r: 34, icon: '💣' },
  { id: 'active', x: W - 150, y: H - 290, r: 32, icon: '✦' },
  { id: 'pause', x: W - 34, y: HUD_H + 112, r: 22, icon: '⏸' },
];

export const Input = {
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: W / 2, y: H / 2, down: false },
  clicked: false,
  mouseMoved: false,
  lastDevice: 'mouse',
  gameplay: false,
  capture: null,
  typed: [],
  pad: { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, down: new Set(), pressed: new Set(), nav: new Set(), prevNav: { x: 0, y: 0 } },
  touch: { sticks: new Map(), move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, pressed: new Set(), held: new Set(), buttonPointers: new Map() },

  init(canvas) {
    this.canvas = canvas;
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard
        .getLayoutMap()
        .then(m => {
          layoutMap = m;
          guessAzerty = false;
        })
        .catch(() => {});
    }
    addEventListener('keydown', e => {
      Sfx.init();
      this.lastDevice = 'keys';
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code);
        return;
      }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.key && e.key.length === 1) this.typed.push(e.key);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.touch.sticks.clear();
      this.touch.held.clear();
    });

    const toLogical = e => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
    };
    canvas.addEventListener('pointerdown', e => {
      Sfx.init();
      const p = toLogical(e);
      if (e.pointerType === 'touch') {
        e.preventDefault();
        this.lastDevice = 'touch';
        canvas.setPointerCapture?.(e.pointerId);
        this.touchStart(e.pointerId, p);
        return;
      }
      this.lastDevice = 'mouse';
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      if (e.button === 0) {
        this.mouse.down = true;
        this.clicked = true;
      }
    });
    canvas.addEventListener('pointermove', e => {
      const p = toLogical(e);
      if (e.pointerType === 'touch') {
        this.touchMove(e.pointerId, p);
        return;
      }
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouseMoved = true;
      this.lastDevice = 'mouse';
    });
    const up = e => {
      if (e.pointerType === 'touch') this.touchEnd(e.pointerId);
      else if (e.button === 0) this.mouse.down = false;
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },

  // ---------- Tactile ----------
  touchStart(id, p) {
    const T = this.touch;
    if (!this.gameplay) {
      // dans les menus, un appui = un clic
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.clicked = true;
      this.mouseMoved = true;
      return;
    }
    for (const b of TOUCH_BUTTONS) {
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 12) {
        T.pressed.add(b.id);
        T.held.add(b.id);
        T.buttonPointers.set(id, b.id);
        return;
      }
    }
    if (p.y < HUD_H) {
      // appui sur le haut de l'écran : carte
      T.pressed.add('map');
      return;
    }
    const side = p.x < W / 2 ? 'move' : 'aim';
    for (const s of T.sticks.values()) if (s.side === side) return;
    T.sticks.set(id, { side, ox: p.x, oy: p.y, x: p.x, y: p.y });
    this.updateSticks();
  },
  touchMove(id, p) {
    const s = this.touch.sticks.get(id);
    if (!s) return;
    s.x = p.x;
    s.y = p.y;
    // le socle suit le doigt s'il s'éloigne trop
    const dx = s.x - s.ox,
      dy = s.y - s.oy,
      d = Math.hypot(dx, dy),
      max = 70;
    if (d > max) {
      s.ox = s.x - (dx / d) * max;
      s.oy = s.y - (dy / d) * max;
    }
    this.updateSticks();
  },
  touchEnd(id) {
    const T = this.touch;
    T.sticks.delete(id);
    const b = T.buttonPointers.get(id);
    if (b) {
      T.held.delete(b);
      T.buttonPointers.delete(id);
    }
    this.updateSticks();
  },
  updateSticks() {
    const T = this.touch;
    T.move = { x: 0, y: 0 };
    T.aim = { x: 0, y: 0 };
    for (const s of T.sticks.values()) {
      let x = (s.x - s.ox) / 60,
        y = (s.y - s.oy) / 60;
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      if (l < 0.15) x = y = 0;
      T[s.side] = { x, y };
    }
  },

  // ---------- Manette ----------
  poll() {
    const P = this.pad;
    P.pressed.clear();
    P.nav.clear();
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    if (!gp) {
      P.move.x = P.move.y = P.aim.x = P.aim.y = 0;
      P.down.clear();
      return;
    }
    const dz = v => (Math.abs(v) < DEADZONE ? 0 : v);
    P.move.x = dz(gp.axes[0] || 0);
    P.move.y = dz(gp.axes[1] || 0);
    P.aim.x = dz(gp.axes[2] || 0);
    P.aim.y = dz(gp.axes[3] || 0);
    const now = new Set();
    gp.buttons.forEach((b, i) => {
      if (b.pressed || b.value > 0.5) now.add(i);
    });
    for (const i of now) if (!P.down.has(i)) P.pressed.add(i);
    P.down = now;
    const nx = Math.abs(P.move.x) > 0.6 ? Math.sign(P.move.x) : 0,
      ny = Math.abs(P.move.y) > 0.6 ? Math.sign(P.move.y) : 0;
    if (ny && ny !== P.prevNav.y) P.nav.add(ny < 0 ? 'up' : 'down');
    if (nx && nx !== P.prevNav.x) P.nav.add(nx < 0 ? 'left' : 'right');
    P.prevNav = { x: nx, y: ny };
    if (now.size || P.move.x || P.move.y || P.aim.x || P.aim.y) {
      this.lastDevice = 'pad';
      Sfx.init();
    }
  },

  // ---------- Requêtes ----------
  /** Action maintenue (déplacement) */
  held(action) {
    return this.keys.has(Settings.keys[action]);
  },
  down(...codes) {
    return codes.some(k => this.keys.has(k));
  },
  /** Action déclenchée cette image (clavier, manette ou tactile) */
  act(name) {
    const bound = Settings.keys[name];
    if (bound && this.pressed.has(bound)) return true;
    if (FIXED[name] && FIXED[name].some(k => this.pressed.has(k))) return true;
    if (PADMAP[name] && PADMAP[name].some(i => this.pad.pressed.has(i))) return true;
    if (this.touch.pressed.has(name)) return true;
    return this.pad.nav.has(name);
  },
  endFrame() {
    this.pressed.clear();
    this.touch.pressed.clear();
    this.clicked = false;
    this.mouseMoved = false;
    this.typed.length = 0;
  },
};
