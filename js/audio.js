'use strict';
const Settings = Object.assign({ music: 0.6, sfx: 0.8, shake: true, dmgNumbers: true }, Store.get('crypte_settings', {}));
function saveSettings() { Store.set('crypte_settings', Settings); Sfx.applyVolumes(); }

// ---------- Primitives audio ----------
function osc(ctx, dest, t, f, d, type = 'square', v = 0.2, f2 = null) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + d + 0.03);
}
let NOISE_BUF = null;
function noise(ctx, dest, t, d, v = 0.2, freq = 1200, type = 'lowpass') {
  if (!NOISE_BUF) {
    NOISE_BUF = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = NOISE_BUF.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = NOISE_BUF;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5, d + 0.05);
}
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

// ---------- Effets sonores ----------
const Sfx = {
  ctx: null, master: null, musicBus: null, muted: false, last: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain(); this.master.connect(comp);
      this.musicBus = this.ctx.createGain(); this.musicBus.connect(comp);
      this.applyVolumes();
    } catch (e) { this.ctx = null; }
  },
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : Settings.sfx * 0.4, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.muted ? 0 : Settings.music * 0.28 * (Music.ducked ? 0.35 : 1), t, 0.08);
  },
  toggleMute() { this.muted = !this.muted; this.applyVolumes(); },
  tone(f, d, type, v, f2 = null, delay = 0) { osc(this.ctx, this.master, this.ctx.currentTime + delay, f, d, type, v, f2); },
  noise(d, v, freq, delay = 0, type) { noise(this.ctx, this.master, this.ctx.currentTime + delay, d, v, freq, type); },
  play(name) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const gap = { eshoot: 0.06, hit: 0.03, shoot: 0.04, coin: 0.03 }[name] || 0;
    if (gap && this.last[name] && now - this.last[name] < gap) return;
    this.last[name] = now;
    switch (name) {
      case 'shoot': this.tone(720, 0.07, 'square', 0.05, 360); break;
      case 'eshoot': this.tone(330, 0.12, 'triangle', 0.08, 160); break;
      case 'hit': this.tone(220, 0.07, 'sawtooth', 0.09, 90); break;
      case 'kill': this.noise(0.18, 0.18, 1600); this.tone(260, 0.14, 'square', 0.08, 50); break;
      case 'hurt': this.tone(160, 0.35, 'sawtooth', 0.25, 40); this.noise(0.25, 0.22, 700); break;
      case 'dash': this.noise(0.14, 0.12, 3200); this.tone(300, 0.1, 'sine', 0.08, 900); break;
      case 'coin': this.tone(988, 0.06, 'square', 0.09); this.tone(1319, 0.14, 'square', 0.09, null, 0.06); break;
      case 'heart': this.tone(523, 0.1, 'sine', 0.2); this.tone(784, 0.2, 'sine', 0.2, null, 0.1); break;
      case 'item': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.18, null, i * 0.08)); break;
      case 'secret': [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.2, null, i * 0.09)); break;
      case 'buy': this.tone(880, 0.08, 'square', 0.1); this.tone(1175, 0.18, 'square', 0.1, null, 0.08); break;
      case 'deny': this.tone(140, 0.18, 'square', 0.12); break;
      case 'door': this.tone(200, 0.2, 'triangle', 0.18, 400); this.noise(0.15, 0.1, 500); break;
      case 'clear': [392, 523, 659].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.15, null, i * 0.07)); break;
      case 'boom': this.noise(0.5, 0.35, 600); this.tone(90, 0.4, 'sine', 0.3, 30); break;
      case 'fuse': this.noise(0.08, 0.05, 5000, 0, 'highpass'); break;
      case 'place': this.tone(180, 0.08, 'triangle', 0.15, 120); break;
      case 'boss': this.tone(70, 1.2, 'sawtooth', 0.2, 55); this.tone(105, 1.2, 'sawtooth', 0.12, 82); break;
      case 'stairs': [659, 523, 392, 262].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.18, null, i * 0.1)); break;
      case 'click': this.tone(600, 0.04, 'square', 0.06); break;
      case 'move': this.tone(420, 0.03, 'square', 0.04); break;
      case 'heartbeat': this.tone(60, 0.12, 'sine', 0.35, 40); this.tone(55, 0.12, 'sine', 0.3, 38, 0.18); break;
      case 'unlock': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, null, i * 0.1)); break;
      case 'death': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.15, null, i * 0.2)); break;
      case 'victory': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.18, null, i * 0.13)); break;
    }
  },
};

// ---------- Musique procédurale ----------
const CHORDS = { m: [0, 3, 7], M: [0, 4, 7], d: [0, 3, 6] };
const TRACKS = {
  menu: { bpm: 72, root: 57, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']], drums: 0, seed: 3, arp: 2, lead: 'always' },
  f1:   { bpm: 104, root: 57, prog: [[0, 'm'], [0, 'm'], [-4, 'M'], [-5, 'M']], drums: 1, seed: 11, arp: 2 },
  f2:   { bpm: 96, root: 55, prog: [[0, 'm'], [5, 'm'], [-4, 'M'], [-5, 'm']], drums: 1, seed: 21, arp: 2 },
  f3:   { bpm: 118, root: 52, prog: [[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M']], drums: 2, seed: 31, arp: 1 },
  f4:   { bpm: 100, root: 59, prog: [[0, 'm'], [-4, 'M'], [5, 'm'], [-5, 'M']], drums: 1, seed: 41, arp: 2 },
  f5:   { bpm: 112, root: 54, prog: [[0, 'm'], [6, 'M'], [-4, 'M'], [-5, 'M']], drums: 2, seed: 51, arp: 1 },
  boss: { bpm: 148, root: 52, prog: [[0, 'm'], [0, 'm'], [1, 'M'], [-1, 'd']], drums: 3, seed: 61, arp: 1, lead: 'always' },
};
for (const k in TRACKS) {
  const tr = TRACKS[k], R = mulberry32(tr.seed), mel = [];
  for (let s = 0; s < 64; s++) {
    const on = s % 2 === 0 ? R() < 0.5 : R() < 0.12;
    mel.push(on ? Math.floor(R() * 6) : null);
  }
  tr.mel = mel;
}

const Music = {
  want: null, cur: null, track: null, step: 0, nextT: 0, ducked: false,
  play(name) { this.want = name; },
  duck(on) { if (this.ducked !== on) { this.ducked = on; Sfx.applyVolumes(); } },
  update() {
    const c = Sfx.ctx;
    if (!c) return;
    if (this.want !== this.cur) {
      this.cur = this.want; this.track = TRACKS[this.cur] || null;
      this.step = 0; this.nextT = c.currentTime + 0.08;
    }
    if (!this.track) return;
    if (this.nextT < c.currentTime - 0.25) this.nextT = c.currentTime + 0.05;
    const sd = 60 / this.track.bpm / 4;
    while (this.nextT < c.currentTime + 0.15) {
      this.schedule(this.step, this.nextT, sd);
      this.nextT += sd; this.step++;
    }
  },
  schedule(s, t, sd) {
    const tr = this.track, c = Sfx.ctx, out = Sfx.musicBus;
    const i = s % 16, bar = Math.floor(s / 16), [off, q] = tr.prog[bar % tr.prog.length];
    const root = tr.root + off, tones = CHORDS[q];
    // nappe
    if (i === 0) for (const tn of tones) osc(c, out, t, midi(root + tn - 12), sd * 16, 'sine', 0.035);
    // basse
    const bassHit = tr.drums >= 3 ? i % 2 === 0 : tr.drums === 2 ? [0, 6, 8, 14].includes(i) : [0, 8].includes(i);
    if (bassHit) osc(c, out, t, midi(root - 24), sd * (tr.drums >= 3 ? 1.6 : 3), 'triangle', 0.22);
    // arpège
    if (s % tr.arp === 0) {
      const k = Math.floor(s / tr.arp) % 4, n = root + tones[[0, 1, 2, 1][k]];
      osc(c, out, t, midi(n), sd * 1.5, tr.drums ? 'square' : 'sine', tr.drums ? 0.025 : 0.05);
    }
    // mélodie
    const leadOn = tr.lead === 'always' || Math.floor(s / 64) % 2 === 1;
    const m = tr.mel[s % 64];
    if (leadOn && m !== null) {
      const n = root + 12 + tones[m % 3] + 12 * Math.floor(m / 3);
      osc(c, out, t, midi(n), sd * 2.2, 'triangle', 0.07);
    }
    // batterie
    if (tr.drums) {
      const kick = tr.drums >= 3 ? [0, 4, 8, 10, 12] : tr.drums === 2 ? [0, 6, 8] : [0, 8];
      if (kick.includes(i)) osc(c, out, t, 150, 0.16, 'sine', 0.5, 40);
      if (tr.drums >= 2 && (i === 4 || i === 12)) { noise(c, out, t, 0.12, 0.16, 3500); osc(c, out, t, 190, 0.08, 'triangle', 0.1, 120); }
      if (tr.drums >= 3 ? true : i % 2 === 0 && i % 4 !== 0) noise(c, out, t, 0.03, tr.drums >= 3 ? 0.04 : 0.06, 7000, 'highpass');
    }
  },
};
