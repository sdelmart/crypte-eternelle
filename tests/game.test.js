import { describe, it, expect, beforeEach } from 'vitest';
import { Game, computeScore, recordRun, loadMeta, MAX_FLOOR } from '../src/game/game.js';
import { Input } from '../src/core/input.js';

/** Fait jouer une partie complète sans affichage : le joueur est invincible et les ennemis tombent vite. */
function autoplay(charId, opts = {}) {
  Game.runOpts = { nightmare: false, daily: false, seed: '', ...opts };
  Game.newRun(charId);
  const p = Game.player;
  for (let f = 1; f <= MAX_FLOOR && Game.inRun; f++) {
    const floorNo = Game.floor;
    for (const room of [...Game.dungeon.rooms.values()]) {
      if (Game.floor !== floorNo || !Game.inRun) break;
      Game.enterRoom(room, 'left');
      for (let i = 0; i < 1200 && Game.inRun && Game.floor === floorNo; i++) {
        p.iframes = 5;
        p.hp = p.maxHp;
        Game.state = 'playing';
        const e = Game.enemies[0];
        Input.mouse.down = !!e;
        if (e) {
          Input.mouse.x = e.x;
          Input.mouse.y = e.y + 64;
          if (i % 30 === 0) Game.damageEnemy(e, 80, 1, 0);
        }
        Game.updatePlay(1 / 60);
        Game.trans = null;
        Game.hitstop = 0;
        if (!Game.enemies.length && !Game.hazards.length && i > 60) break;
      }
    }
    if (!Game.inRun) break;
    if (Game.floor === floorNo && Game.floor < MAX_FLOOR) {
      Game.floor++;
      Game.loadFloor();
    } else if (Game.floor >= MAX_FLOOR) {
      // laisse s'écouler le ralenti et le délai de victoire après le dernier boss
      for (let i = 0; i < 600 && Game.state === 'playing'; i++) Game.updatePlay(1 / 30);
    }
  }
  Input.mouse.down = false;
}

beforeEach(() => {
  Game.meta = loadMeta({});
  Game.meta.tutorialDone = true;
  Game.init();
  Game.meta.tutorialDone = true;
});

describe('partie complète (sans affichage)', () => {
  it.each(['mage', 'rogue', 'knight'])('%s termine la crypte sans erreur', charId => {
    Game.meta.unlocked = ['mage', 'rogue', 'knight'];
    autoplay(charId);
    expect(Game.state).toBe('credits');
    expect(Game.lastRun.win).toBe(true);
    expect(Game.meta.stats.wins).toBe(1);
    expect(Game.meta.board).toHaveLength(1);
    expect(Game.meta.ach).toContain('win');
  });

  it('le mode Cauchemar renforce les ennemis', () => {
    Game.meta.stats.wins = 1;
    Game.runOpts = { nightmare: true, daily: false, seed: 'NM1' };
    Game.newRun('mage');
    const room = [...Game.dungeon.rooms.values()].find(r => r.type === 'normal');
    Game.enterRoom(room, 'left');
    const hard = Game.enemies[0];
    Game.runOpts = { nightmare: false, daily: false, seed: 'NM1' };
    Game.newRun('mage');
    Game.enterRoom(
      [...Game.dungeon.rooms.values()].find(r => r.type === 'normal'),
      'left',
    );
    const normal = Game.enemies.find(e => e.type === hard.type && e.elite === hard.elite);
    expect(hard.maxHp).toBeCloseTo(normal.maxHp * 1.5);
  });

  it('une même seed donne le même donjon et les mêmes objets', () => {
    const plan = () =>
      [...Game.dungeon.rooms.values()]
        .map(r => ({ type: r.type, x: r.gx, y: r.gy, plan: JSON.stringify(r.plan) }))
        .sort((a, b) => a.x - b.x || a.y - b.y);
    Game.runOpts = { nightmare: false, daily: false, seed: 'PARTAGE' };
    Game.newRun('mage');
    const a = plan();
    Game.newRun('rogue');
    expect(plan()).toEqual(a);
  });

  it('la mort mène à l’écran de fin et compte dans les statistiques', () => {
    Game.newRun('mage');
    Game.player.iframes = 0;
    Game.player.hurt(99, Game);
    for (let i = 0; i < 200 && Game.state === 'playing'; i++) Game.updatePlay(1 / 60);
    expect(Game.state).toBe('dead');
    expect(Game.meta.stats.deaths).toBe(1);
  });
});

describe('score et classement', () => {
  const run = over => ({ floor: 3, kills: 50, bosses: 2, secrets: 1, time: 600, win: false, nightmare: false, ...over });
  it('une victoire rapporte plus qu’une défaite', () => {
    expect(computeScore(run({ win: true, floor: 5 }))).toBeGreaterThan(computeScore(run({ floor: 5 })));
  });
  it('gagner plus vite rapporte plus', () => {
    expect(computeScore(run({ win: true, time: 500 }))).toBeGreaterThan(computeScore(run({ win: true, time: 900 })));
  });
  it('le mode Cauchemar multiplie le score', () => {
    expect(computeScore(run({ nightmare: true }))).toBe(Math.round(computeScore(run()) * 1.5));
  });
  it('le classement garde les 10 meilleures parties, triées', () => {
    const board = [];
    for (let i = 0; i < 15; i++) recordRun(board, { score: i * 100 });
    expect(board).toHaveLength(10);
    expect(board[0].score).toBe(1400);
    expect(board.every((e, i) => i === 0 || board[i - 1].score >= e.score)).toBe(true);
    expect(recordRun(board, { score: 1 })).toBe(0);
    expect(recordRun(board, { score: 9999 })).toBe(1);
  });
});

describe('sauvegarde', () => {
  it('une ancienne sauvegarde est complétée sans perte', () => {
    const m = loadMeta({ souls: 120, up: { hp: 1 }, stats: { runs: 4 } });
    expect(m.souls).toBe(120);
    expect(m.up.hp).toBe(1);
    expect(m.stats.runs).toBe(4);
    expect(m.stats.elites).toBe(0);
    expect(m.unlocked).toEqual(['mage']);
    expect(m.board).toEqual([]);
  });
});
