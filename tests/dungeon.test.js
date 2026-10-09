import { describe, it, expect } from 'vitest';
import { DOORS, OPP, DIRS, makeRng } from '../src/core/utils.js';
import { generateFloor } from '../src/world/dungeon.js';

const key = r => `${r.gx},${r.gy}`;
const neighbor = (rooms, r, d) => rooms.get(`${r.gx + DOORS[d].dx},${r.gy + DOORS[d].dy}`);

/** Salles accessibles depuis le départ ; les passages secrets sont pris en compte si `withHidden` */
function reachable(floor, withHidden) {
  const seen = new Set([key(floor.start)]),
    q = [floor.start];
  while (q.length) {
    const r = q.pop();
    for (const d of DIRS) {
      if (!r.doors[d] || (!withHidden && r.hidden[d])) continue;
      const n = neighbor(floor.rooms, r, d);
      if (n && !seen.has(key(n))) {
        seen.add(key(n));
        q.push(n);
      }
    }
  }
  return seen;
}

const CASES = [];
for (let seed = 1; seed <= 120; seed++) for (let f = 1; f <= 5; f++) CASES.push([seed, f]);

describe('génération des étages', () => {
  it.each(CASES)('seed %i, étage %i : structure valide', (seed, f) => {
    const floor = generateFloor(f, makeRng(seed));
    const rooms = [...floor.rooms.values()];
    const count = t => rooms.filter(r => r.type === t).length;

    // salles obligatoires
    expect(count('start')).toBe(1);
    expect(count('boss')).toBe(1);
    expect(count('treasure')).toBe(1);
    expect(count('shop')).toBe(1);
    expect(count('secret')).toBeLessThanOrEqual(1);
    if (f === 1) expect(count('challenge')).toBe(0);

    for (const r of rooms) {
      for (const d of DIRS) {
        if (!r.doors[d]) continue;
        // portes symétriques
        const n = neighbor(floor.rooms, r, d);
        expect(n, `porte ${d} sans voisine`).toBeTruthy();
        expect(n.doors[OPP[d]]).toBe(true);
        // un passage caché mène toujours à la salle secrète
        if (r.hidden[d]) expect(n.type).toBe('secret');
      }
      // toutes les cases praticables d'une salle communiquent
      expect(r.connected(r.tiles)).toBe(true);
      // le centre reste libre (récompenses, trappe)
      expect(r.tiles[4][7]).toBe(0);
    }

    // le boss est au bout d'un cul-de-sac
    const boss = rooms.find(r => r.type === 'boss');
    expect(Object.keys(boss.doors)).toHaveLength(1);

    // tout est accessible sans bombe, sauf la salle secrète
    const open = reachable(floor, false);
    for (const r of rooms) expect(open.has(key(r))).toBe(r.type !== 'secret');
    expect(reachable(floor, true).size).toBe(rooms.length);
  });

  it('une même seed produit exactement le même étage', () => {
    const snap = fl =>
      [...fl.rooms.values()].map(r => ({ k: key(r), t: r.type, doors: Object.keys(r.doors).sort(), tiles: r.tiles.flat().join('') }));
    expect(snap(generateFloor(3, makeRng(1234)))).toEqual(snap(generateFloor(3, makeRng(1234))));
    expect(snap(generateFloor(3, makeRng(1234)))).not.toEqual(snap(generateFloor(3, makeRng(4321))));
  });

  it('les étages grandissent avec la profondeur', () => {
    const avg = f => {
      let n = 0;
      for (let s = 1; s <= 40; s++) n += generateFloor(f, makeRng(s)).rooms.size;
      return n / 40;
    };
    expect(avg(5)).toBeGreaterThan(avg(1));
  });
});
