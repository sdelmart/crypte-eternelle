import { describe, it, expect } from 'vitest';
import { TILE, clamp, lerp, makeRng, hashSeed, sanitizeSeed, dailySeed, randomSeed, resolveTiles, moveEntity } from '../src/core/utils.js';

// Salle minimale : un mur plein en colonne 5
const wallRoom = {
  solidFor: (tx, ty) => tx === 5 || tx < 0 || ty < 0 || tx > 14 || ty > 8,
};

describe('maths', () => {
  it('clamp et lerp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });
});

describe('aléatoire reproductible', () => {
  it('une même seed donne la même suite', () => {
    const a = makeRng(42),
      b = makeRng(42);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    expect(sa).toEqual(sb);
  });
  it('des seeds différentes donnent des suites différentes', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });
  it('randi reste dans les bornes', () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.randi(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
  it('shuffle conserve les éléments', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    expect(makeRng(3).shuffle(arr.slice()).sort()).toEqual(arr);
  });
});

describe('seeds', () => {
  it('hashSeed est stable', () => {
    expect(hashSeed('CRYPTE')).toBe(hashSeed('CRYPTE'));
    expect(hashSeed('A')).not.toBe(hashSeed('B'));
  });
  it('sanitizeSeed nettoie la saisie', () => {
    expect(sanitizeSeed(' ab-c 12! ')).toBe('ABC12');
    expect(sanitizeSeed('x'.repeat(30))).toHaveLength(12);
    expect(sanitizeSeed(null)).toBe('');
  });
  it('dailySeed dépend uniquement de la date', () => {
    expect(dailySeed(new Date(2026, 9, 9))).toBe('JOUR20261009');
    expect(dailySeed(new Date(2026, 0, 1, 23, 59))).toBe(dailySeed(new Date(2026, 0, 1, 0, 1)));
  });
  it('randomSeed a la bonne longueur et un alphabet lisible', () => {
    const s = randomSeed();
    expect(s).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe('collisions', () => {
  it('un cercle qui chevauche un mur est repoussé', () => {
    const e = { x: 5 * TILE - 5, y: 100, r: 14 };
    expect(resolveTiles(e, wallRoom, false)).toBe(true);
    expect(e.x).toBeLessThanOrEqual(5 * TILE - 14 + 0.001);
  });
  it('un déplacement très rapide ne traverse pas un mur', () => {
    const e = { x: 3 * TILE, y: 100, r: 14 };
    const hit = moveEntity(e, 800, 0, wallRoom, false);
    expect(hit).toBe(true);
    expect(e.x).toBeLessThan(5 * TILE);
  });
});
