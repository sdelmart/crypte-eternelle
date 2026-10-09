import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import './style.css';
import { W, H, view } from './core/utils.js';
import { Input } from './core/input.js';
import { Game } from './game/game.js';
import './game/draw.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  // plafonné à 2 : au-delà, le coût de rendu augmente sans gain visible
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
  canvas.width = Math.round(W * s * dpr);
  canvas.height = Math.round(H * s * dpr);
  view.scale = s * dpr;
  Game.onResize();
}

Game.canvas = canvas;
Game.init();
const autoPause = () => {
  if (Game.state === 'playing' && !Game.dying) Game.setState('paused');
};
addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});
Input.init(canvas);
addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  Game.update(dt);
  ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
  Game.draw(ctx);
  Input.endFrame();
  requestAnimationFrame(frame);
}

// Écran de chargement : le canvas ne déclenche pas le chargement des polices, on les demande explicitement
const FONTS = ['700 20px Cinzel', '900 40px Cinzel', '400 16px Outfit', '600 16px Outfit', '700 16px Outfit'];
Promise.all(FONTS.map(f => document.fonts.load(f)))
  .catch(() => {})
  .then(() => {
    document.getElementById('loader')?.classList.add('done');
    requestAnimationFrame(frame);
  });

// Accès de débogage, uniquement en développement
if (import.meta.env.DEV) window.__crypte = { Game, Input, view };
