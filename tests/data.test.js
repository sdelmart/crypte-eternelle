import { describe, it, expect } from 'vitest';
import { ITEMS, ACTIVES, ALL_ITEMS, CHARACTERS, META_UPS } from '../src/data/items.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { Player } from '../src/world/entities.js';

const NUMERIC = ['hp', 'maxHp', 'speed', 'dmg', 'fireDelay', 'shotSpeed', 'range', 'shotSize', 'multishot', 'dashCooldown'];

describe('objets', () => {
  it('les identifiants sont uniques', () => {
    const ids = ALL_ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ITEMS.map(i => [i.id, i]))('%s garde des statistiques valides', (id, item) => {
    for (const c of CHARACTERS) {
      const p = new Player(c);
      item.apply(p);
      for (const k of NUMERIC) {
        expect(Number.isFinite(p[k]), `${k} doit être un nombre`).toBe(true);
        expect(p[k], `${k} doit rester positif`).toBeGreaterThan(0);
      }
      expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    }
  });

  it('tous les objets cumulés restent jouables', () => {
    const p = new Player(CHARACTERS[0]);
    for (const it of ITEMS) it.apply(p);
    expect(p.fireDelay).toBeGreaterThan(0.05);
    expect(p.multishot).toBeLessThanOrEqual(5);
  });

  it('les objets actifs ont une charge et une description', () => {
    for (const a of ACTIVES) {
      expect(a.charge).toBeGreaterThan(0);
      expect(a.desc.length).toBeGreaterThan(5);
    }
  });
});

describe('héros et progression', () => {
  it('chaque héros a des couleurs et des stats cohérentes', () => {
    for (const c of CHARACTERS) {
      const p = new Player(c);
      expect(p.maxHp % 2).toBe(0);
      expect(p.hp).toBe(p.maxHp);
      expect(c.body).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('les héros à débloquer ont une condition', () => {
    for (const c of CHARACTERS.slice(1)) expect(typeof c.unlock.check).toBe('function');
  });
  it('le coût des améliorations augmente avec le niveau', () => {
    for (const u of META_UPS) for (let l = 1; l < u.max; l++) expect(u.cost(l)).toBeGreaterThanOrEqual(u.cost(l - 1));
  });
  it('les succès ont un identifiant unique', () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
