'use strict';
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  function resize() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = W * s + 'px'; canvas.style.height = H * s + 'px';
    canvas.width = Math.round(W * s * dpr); canvas.height = Math.round(H * s * dpr);
    RENDER_SCALE = s * dpr;
    Game.onResize();
  }
  Game.canvas = canvas;
  Game.init();
  const autoPause = () => { if (Game.state === 'playing' && !Game.dying) Game.setState('paused'); };
  addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  Input.init(canvas);
  addEventListener('resize', resize);
  resize();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    Game.update(dt);
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    Game.draw(ctx);
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
