import { Store } from './utils.js';

export const DEFAULT_KEYS = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  dash: 'Space',
  bomb: 'KeyE',
  active: 'KeyQ',
  map: 'Tab',
};

const DEFAULTS = {
  music: 0.6,
  sfx: 0.8,
  shake: true,
  dmgNumbers: true,
  reduceFlash: false,
  contrastShots: false,
  showFps: false,
};

export const Settings = { ...DEFAULTS, ...Store.get('crypte_settings', {}) };
Settings.keys = { ...DEFAULT_KEYS, ...(Settings.keys || {}) };

const listeners = [];
export function onSettingsChange(fn) {
  listeners.push(fn);
}
export function saveSettings() {
  Store.set('crypte_settings', Settings);
  for (const fn of listeners) fn();
}
