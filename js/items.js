'use strict';
const ITEMS = [
  { id: 'heart', name: 'Cœur de géant', desc: '+1 cœur max et soins complets', icon: '❤️', apply: p => { p.maxHp += 2; p.hp = p.maxHp; } },
  { id: 'blade', name: 'Lame affûtée', desc: 'Dégâts +1.5', icon: '🗡️', apply: p => { p.dmg += 1.5; } },
  { id: 'trigger', name: 'Gâchette nerveuse', desc: 'Cadence de tir +33%', icon: '⚡', apply: p => { p.fireDelay *= 0.75; } },
  { id: 'boots', name: 'Bottes ailées', desc: 'Vitesse de déplacement +20%', icon: '👢', apply: p => { p.speed *= 1.2; } },
  { id: 'triple', name: 'Trident', desc: '2 projectiles de plus, dégâts -15%', icon: '🔱', apply: p => { p.multishot += 2; p.dmg *= 0.85; } },
  { id: 'pierce', name: 'Flèches spectrales', desc: 'Les tirs traversent les ennemis', icon: '👻', apply: p => { p.pierce = true; } },
  { id: 'homing', name: 'Œil chercheur', desc: 'Les tirs traquent les ennemis', icon: '👁️', apply: p => { p.homing = true; } },
  { id: 'bounce', name: 'Balles rebondissantes', desc: 'Les tirs rebondissent sur les murs', icon: '🏀', apply: p => { p.bounce = true; p.range += 0.3; } },
  { id: 'bomb', name: 'Poudre noire', desc: 'Les tirs explosent et brisent les rochers', icon: '💣', apply: p => { p.explosive = true; } },
  { id: 'vampire', name: 'Crocs vampiriques', desc: 'Chance de te soigner en tuant', icon: '🦇', apply: p => { p.lifesteal += 0.08; } },
  { id: 'big', name: 'Gros calibre', desc: 'Tirs plus gros, dégâts +25%', icon: '🔵', apply: p => { p.shotSize += 3; p.dmg *= 1.25; p.shotSpeed *= 0.92; } },
  { id: 'scope', name: 'Longue-vue', desc: 'Portée et vitesse des tirs augmentées', icon: '🔭', apply: p => { p.range += 0.3; p.shotSpeed += 140; } },
  { id: 'orb', name: 'Orbe gardien', desc: 'Un orbe tourne autour de toi et bloque les tirs', icon: '🌀', apply: p => { p.orbitals += 1; } },
  { id: 'orb2', name: 'Lune jumelle', desc: 'Encore un orbe gardien', icon: '🌙', apply: p => { p.orbitals += 1; } },
  { id: 'crit', name: 'Dé pipé', desc: '20% de coups critiques (x2.5)', icon: '🎲', apply: p => { p.crit += 0.2; } },
  { id: 'dashblade', name: 'Cape tranchante', desc: 'Le dash blesse et recharge plus vite', icon: '💨', apply: p => { p.dashDmg = true; p.dashCooldown *= 0.7; } },
  { id: 'luck', name: 'Trèfle', desc: 'Plus de pièces et de cœurs', icon: '🍀', apply: p => { p.luck += 1; } },
  { id: 'rage', name: 'Masque de rage', desc: 'Dégâts x1.6 quand il te reste 1 cœur ou moins', icon: '👺', apply: p => { p.rage = true; } },
  { id: 'mirror', name: 'Miroir', desc: 'Tire aussi vers l\'arrière', icon: '🪞', apply: p => { p.backshot = true; } },
  { id: 'coffee', name: 'Café noir', desc: 'Vitesse +10%, cadence +15%', icon: '☕', apply: p => { p.speed *= 1.1; p.fireDelay *= 0.87; } },
  { id: 'steak', name: 'Steak cru', desc: '+1 cœur max, dégâts +0.5', icon: '🥩', apply: p => { p.maxHp += 2; p.hp += 2; p.dmg += 0.5; } },
];
const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

const CHARACTERS = [
  {
    id: 'mage', name: 'Élyra', title: 'la Mage', desc: 'Équilibrée. Ses tirs magiques sont précis et réguliers.',
    body: '#2dd4bf', dark: '#0f766e', shot: '#67e8f9', orb: '#cffafe', stats: {},
  },
  {
    id: 'rogue', name: 'Nyx', title: 'la Rôdeuse', desc: 'Très rapide, mitraille ses ennemis, mais fragile. Commence avec 3 bombes.',
    body: '#f472b6', dark: '#9d174d', shot: '#f9a8d4', orb: '#fce7f3',
    stats: { maxHp: 4, speed: 295, fireDelay: 0.2, dmg: 2.4, bombs: 3, dashCooldown: 0.6, shotSize: 5 },
    unlock: { text: 'Vaincre un boss', check: m => m.stats.bosses >= 1 },
  },
  {
    id: 'knight', name: 'Aldric', title: 'le Chevalier', desc: 'Robuste et lent. Ses lances lourdes transpercent les ennemis.',
    body: '#fbbf24', dark: '#92400e', shot: '#fde68a', orb: '#fef3c7',
    stats: { maxHp: 10, speed: 215, fireDelay: 0.52, dmg: 6.5, pierce: true, shotSize: 8, range: 0.62 },
    unlock: { text: 'Atteindre l\'étage 3', check: m => m.stats.bestFloor >= 3 },
  },
];

const META_UPS = [
  { id: 'hp', name: 'Vitalité', desc: '+1 cœur de départ', max: 3, cost: l => 40 + l * 40, icon: '❤️' },
  { id: 'dmg', name: 'Force', desc: '+0.5 dégâts de départ', max: 4, cost: l => 30 + l * 30, icon: '🗡️' },
  { id: 'coins', name: 'Héritage', desc: '+5 pièces au départ', max: 3, cost: l => 25 + l * 25, icon: '🪙' },
  { id: 'dash', name: 'Agilité', desc: 'Dash 15% plus rapide à recharger', max: 2, cost: l => 50 + l * 50, icon: '💨' },
  { id: 'start', name: 'Relique', desc: 'Commence avec un objet aléatoire', max: 1, cost: () => 150, icon: '🎁' },
];
