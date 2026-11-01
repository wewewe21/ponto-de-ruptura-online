// Áudio: banco de amostras do Stable Audio 3 (armas, impactos, explosões, passos, ambientes, trilhas) com
// síntese procedural como reserva se um arquivo faltar. Posicional, reverb por ambiente, música dinâmica por estado.
import { clamp, rand } from './utils.js';
import { SampleBank, CrossLoop } from './samples.js';

const GUNS = {
  SD9: { sup: true, thump: 85, nf: 900, len: 0.06, vol: 0.55 },
  KR7: { thump: 105, nf: 2400, len: 0.11, crack: 0.8, vol: 1.0, tail: 0.9 },
  VK12: { thump: 75, nf: 2000, len: 0.16, crack: 1.0, vol: 1.25, tail: 1.5 },
  BRK8: { thump: 55, nf: 1500, len: 0.2, crack: 0.5, vol: 1.3, tail: 1.2 },
  P19: { thump: 140, nf: 3000, len: 0.07, crack: 0.6, vol: 0.8, tail: 0.6 },
  RPL2: { thump: 45, nf: 900, len: 0.5, crack: 0.2, vol: 1.2, tail: 1.6 },
  AK: { thump: 95, nf: 2100, len: 0.12, crack: 0.8, vol: 0.95, tail: 1.0 },
  LMG: { thump: 80, nf: 1900, len: 0.12, crack: 0.9, vol: 1.05, tail: 1.1 },
  MG: { thump: 62, nf: 1700, len: 0.14, crack: 1.0, vol: 1.2, tail: 1.3 },
  PISTOL: { thump: 150, nf: 2900, len: 0.07, crack: 0.5, vol: 0.7, tail: 0.6 },
  SNIPER: { thump: 70, nf: 2200, len: 0.2, crack: 1.2, vol: 1.3, tail: 1.8 },
  BOSS: { thump: 52, nf: 1300, len: 0.2, crack: 1.1, vol: 1.45, tail: 1.8 },
  MINIGUN: { thump: 90, nf: 2600, len: 0.05, crack: 0.5, vol: 0.7, tail: 0.5 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.voices = 0;
    this.music = { intensity: 0, target: 0 };
    this.vol = { master: 0.85, music: 0.55, sfx: 1 };
    this.tts = false;
    this.env = 'outdoor';
    this.loops = {};
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = C.createGain(); this.master.gain.value = this.vol.master;
    const comp = C.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp).connect(C.destination);
    this.sfx = C.createGain(); this.sfx.connect(this.master);
    this.amb = C.createGain(); this.amb.connect(this.master);
    this.musicBus = C.createGain(); this.musicBus.gain.value = this.vol.music; this.musicBus.connect(this.master);
    this.radioBus = C.createGain(); this.radioBus.gain.value = 0.9;
    const rbp = C.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 1800; rbp.Q.value = 0.7;
    this.radioBus.connect(rbp).connect(this.master);
    // ensurdecimento (flash/explosão)
    this.deafen = C.createBiquadFilter(); this.deafen.type = 'lowpass'; this.deafen.frequency.value = 20000;
    this.sfx.disconnect(); this.sfx.connect(this.deafen).connect(this.master);
    // ruídos base
    const mk = (len, fn) => { const b = C.createBuffer(2, C.sampleRate * len, C.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); fn(d); } return b; };
    this.white = mk(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.brown = mk(3, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    // reverbs
    const ir = (dur, decay, bright) => mk(dur, (d) => { for (let i = 0; i < d.length; i++) { const t = i / C.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / dur, decay) * (bright ? 1 : 0.7); } });
    this.rev = {};
    for (const [k, dur, dec] of [['outdoor', 2.4, 3.5], ['hall', 3.2, 2.2], ['tunnel', 2.0, 2.6], ['room', 0.9, 3]]) {
      const cv = C.createConvolver(); cv.buffer = ir(dur, dec, k !== 'outdoor');
      const g = C.createGain(); g.gain.value = k === 'outdoor' ? 1 : 0;
      cv.connect(g).connect(this.master);
      this.rev[k] = { cv, g };
    }
    this.revSend = C.createGain(); this.revSend.gain.value = 0.35;
    for (const k in this.rev) this.revSend.connect(this.rev[k].cv);
    this._startAmbience();
    this._startMusic();
    this.bank = new SampleBank(C);
    this.bank.init().then(() => this._onBank());
  }
  _onBank() {
    // música pode começar já; chuva/vento trocam por amostras quando decodificadas
    this._musicReady = true;
    this.musicMode && this.setMusic(this.musicMode, true);
    Promise.all(['amb_rain', 'amb_rain_metal', 'amb_wind'].map((n) => this.bank.load(n))).then(() => this._swapAmbience());
  }
  // toca amostra; devolve true se havia amostra (senão o chamador sintetiza)
  _s(name, out, o) { return !!(this.bank && this.bank.ready && this.bank.has(name) && this.bank.play(name, out, o)); }
  get t() { return this.ctx.currentTime; }
  setEnv(name) {
    if (!this.ctx || name === this.env) return;
    this.env = name;
    for (const k in this.rev) this.rev[k].g.gain.setTargetAtTime(k === name ? 1 : 0, this.t, 0.3);
    const indoor = name !== 'outdoor';
    this.loops.rainHi && this.loops.rainHi.f.frequency.setTargetAtTime(indoor ? 500 : (this._sampleAmb ? 12000 : 6000), this.t, 0.3);
    this.loops.rainHi && this.loops.rainHi.g.gain.setTargetAtTime(indoor ? (name === 'tunnel' ? 0.0 : 0.05) : this._rainGain || 0.18, this.t, 0.4);
    this.loops.wind && this.loops.wind.g.gain.setTargetAtTime(indoor ? 0.015 : (this._sampleAmb ? 0.28 : 0.08), this.t, 0.5);
  }
  listener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener, p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    this.camPos = p;
  }
  _out(pos, vol = 1, ref = 6) {
    const C = this.ctx;
    const g = C.createGain(); g.gain.value = vol;
    if (!pos) { g.connect(this.sfx); g.connect(this.revSend); return g; }
    const pan = C.createPanner();
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = 1.1; pan.maxDistance = 2000;
    if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y, pos.z);
    const d = this.camPos ? Math.hypot(pos.x - this.camPos.x, pos.y - this.camPos.y, pos.z - this.camPos.z) : 10;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(20000 / (1 + d / 35), 400, 20000);
    g.connect(lp).connect(pan).connect(this.sfx);
    const send = C.createGain(); send.gain.value = clamp(0.3 + d / 120, 0.3, 1.2); g.connect(send).connect(this.revSend);
    return g;
  }
  _noise(out, t0, dur, type, freq, q, vol, attack = 0.001, buf) {
    const C = this.ctx;
    const s = C.createBufferSource(); s.buffer = buf || this.white;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t0, rand(0, 1)); s.stop(t0 + dur + 0.05);
    return f;
  }
  _tone(out, t0, dur, type, f0, f1, vol, attack = 0.002) {
    const C = this.ctx;
    const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  _voice(n = 1) { if (this.voices > 46) return false; this.voices += n; setTimeout(() => (this.voices -= n), 600); return true; }

  // ---------- armas ----------
  shot(kind, pos = null, opts = {}) {
    if (!this.ctx || !this._voice()) return;
    const SMP = { SD9: 'shot_sd9', KR7: 'shot_kr7', VK12: 'shot_vk12', BRK8: 'shot_brk8', P19: 'shot_p19', RPL2: 'shot_rpl2', AK: 'shot_ak', LMG: 'shot_lmg', MG: 'shot_mg', PISTOL: 'shot_p19', SNIPER: 'shot_sniper', MINIGUN: 'shot_minigun', BOSS: 'shot_boss' };
    const sn = SMP[kind] || 'shot_kr7';
    if (this.bank && this.bank.ready && this.bank.has(sn)) {
      const now = this.t, last = (this._lastShot || (this._lastShot = {}))[kind + (pos ? 'p' : 'l')] ?? -9;
      this._lastShot[kind + (pos ? 'p' : 'l')] = now;
      const rapid = now - last < 0.4;
      const vol = { SD9: 0.9, KR7: 1.0, VK12: 1.1, BRK8: 1.1, P19: 0.8, RPL2: 1.1, AK: 0.9, LMG: 0.95, MG: 1.0, PISTOL: 0.7, SNIPER: 1.2, MINIGUN: 0.7, BOSS: 1.3 }[kind] ?? 1;
      const out2 = this._out(pos, (opts.vol || 1) * (pos ? 1.6 : 1) * vol, pos ? 8 : 6);
      this.bank.play(sn, out2, { jitter: 0.05, maxDur: rapid ? 0.85 : undefined });
      return;
    }
    const p = GUNS[kind] || GUNS.KR7, t = this.t;
    const out = this._out(pos, (opts.vol || 1) * (pos ? 1.6 : 1));
    if (p.sup) {
      this._noise(out, t, p.len, 'lowpass', p.nf, 0, p.vol * 0.7);
      this._tone(out, t, 0.06, 'sine', p.thump * 1.6, p.thump * 0.6, p.vol * 0.5);
      this._tone(out, t + 0.012, 0.012, 'square', 2400, 2400, 0.06);
      this._tone(out, t + 0.05, 0.02, 'square', 1500, 1200, 0.04);
      return;
    }
    const d = pos && this.camPos ? Math.hypot(pos.x - this.camPos.x, pos.z - this.camPos.z) : 0;
    this._noise(out, t, p.len, 'bandpass', p.nf * rand(0.92, 1.08), 0.8, p.vol);
    this._noise(out, t, p.len * 0.6, 'lowpass', 900, 0, p.vol * 0.8);
    this._tone(out, t, 0.14, 'sine', p.thump * 2.2, p.thump * 0.5, p.vol * 1.1);
    if (p.crack && d < 80) this._noise(out, t, 0.018, 'highpass', 3500, 0, p.vol * p.crack * 0.8);
    // cauda (eco do vale / salão)
    this._noise(this.revSend, t + 0.02, p.tail || 0.6, 'lowpass', 600, 0, p.vol * 0.35 * (pos ? 0.7 : 1), 0.02, this.brown);
  }
  dryFire() { if (!this.ctx) return; if (this._s('dryfire', this._out(null, 0.5), {})) return; const o = this._out(null, 0.4); this._tone(o, this.t, 0.02, 'square', 1800, 1600, 0.2); }
  mech(kind) {
    // sons de manuseio: magOut, magIn, bolt, pump, shell, swap, pin, ads
    if (!this.ctx) return;
    const MS = { magOut: 'mag_out', magIn: 'mag_in', bolt: 'bolt', pump: 'pump', shell: 'shell', swap: 'swap', pin: 'pin', ads: 'ads', nvgOn: 'nvg_on', nvgOff: 'nvg_off', knife: 'knife', melee: 'melee', laser: 'laser', beep: 'beep', interact: 'interact', pickup: 'pickup' };
    if (MS[kind] && this._s(MS[kind], this._out(null, { ads: 0.25, swap: 0.35, shell: 0.25, beep: 0.4, interact: 0.45, laser: 0.4 }[kind] ?? 0.55), { jitter: 0.03 })) return;
    const o = this._out(null, 0.5), t = this.t;
    const M = {
      magOut: () => { this._noise(o, t, 0.05, 'bandpass', 2200, 3, 0.4); this._tone(o, t, 0.03, 'triangle', 900, 700, 0.15); },
      magIn: () => { this._noise(o, t, 0.04, 'bandpass', 2800, 3, 0.5); this._tone(o, t + 0.02, 0.03, 'square', 1300, 1100, 0.18); },
      bolt: () => { this._noise(o, t, 0.06, 'bandpass', 3500, 2, 0.5); this._noise(o, t + 0.12, 0.05, 'bandpass', 2600, 2, 0.6); },
      pump: () => { this._noise(o, t, 0.08, 'bandpass', 1800, 2, 0.5); this._noise(o, t + 0.13, 0.07, 'bandpass', 2300, 2, 0.6); },
      shell: () => { this._tone(o, t, 0.06, 'triangle', 1400, 900, 0.2); this._noise(o, t, 0.04, 'bandpass', 3000, 3, 0.3); },
      swap: () => { this._noise(o, t, 0.1, 'bandpass', 1200, 1, 0.25); },
      pin: () => { this._tone(o, t, 0.05, 'triangle', 3200, 2800, 0.15); this._noise(o, t + 0.06, 0.05, 'highpass', 4000, 0, 0.2); },
      ads: () => { this._noise(o, t, 0.08, 'bandpass', 700, 1, 0.12); },
      nvgOn: () => { this._tone(o, t, 0.4, 'sine', 3000, 7500, 0.04, 0.05); this._noise(o, t, 0.05, 'bandpass', 2000, 3, 0.2); },
      nvgOff: () => { this._tone(o, t, 0.25, 'sine', 6000, 1500, 0.03, 0.02); this._noise(o, t, 0.05, 'bandpass', 2000, 3, 0.2); },
      knife: () => { this._noise(o, t, 0.12, 'highpass', 3000, 0, 0.35, 0.03); this._noise(o, t + 0.1, 0.08, 'lowpass', 500, 0, 0.6); },
      melee: () => { this._noise(o, t, 0.1, 'lowpass', 400, 0, 0.9); this._tone(o, t, 0.1, 'sine', 120, 50, 0.6); },
      laser: () => { this._tone(o, t, 0.12, 'square', 1200, 1200, 0.05); this._tone(o, t + 0.15, 0.12, 'square', 1600, 1600, 0.05); },
      beep: () => { this._tone(o, t, 0.08, 'sine', 1400, 1400, 0.12); },
      interact: () => { this._tone(o, t, 0.05, 'triangle', 700, 900, 0.1); },
      pickup: () => { this._noise(o, t, 0.08, 'bandpass', 1500, 2, 0.4); this._tone(o, t + 0.05, 0.05, 'triangle', 1100, 1400, 0.1); },
    };
    M[kind] && M[kind]();
  }
  hit(kind) {
    if (!this.ctx) return;
    if (this._s(kind === 'head' ? 'hit_head' : kind === 'kill' ? 'hit_kill' : kind === 'armor' ? 'hit_armor' : 'hit_body', this._out(null, kind === 'body' || !kind ? 0.22 : 0.35), { jitter: 0.03, maxDur: 0.5 })) return;
    const o = this._out(null, 0.6), t = this.t;
    if (kind === 'head') { this._tone(o, t, 0.12, 'triangle', 2800, 2400, 0.25); this._noise(o, t, 0.03, 'highpass', 5000, 0, 0.3); }
    else if (kind === 'kill') { this._tone(o, t, 0.1, 'sine', 900, 500, 0.3); this._noise(o, t, 0.04, 'bandpass', 2500, 2, 0.4); }
    else if (kind === 'armor') { this._tone(o, t, 0.08, 'square', 1700, 1500, 0.1); }
    else { this._noise(o, t, 0.03, 'bandpass', 3500, 2, 0.4); this._tone(o, t, 0.03, 'triangle', 1900, 1700, 0.1); }
  }
  impact(pos, mat) {
    if (!this.ctx || !this._voice()) return;
    const IM = { metal: 'imp_metal', wood: 'imp_wood', flesh: 'imp_flesh', water: 'imp_water', glass: 'imp_glass' }[mat] || 'imp_concrete';
    if (this._s(IM, this._out(pos, 0.38, 3), { jitter: 0.08, maxDur: 0.9 })) return;
    const o = this._out(pos, 0.35, 3), t = this.t;
    if (mat === 'metal') { this._tone(o, t, 0.12, 'triangle', rand(1800, 3200), rand(1200, 2000), 0.18); this._noise(o, t, 0.03, 'highpass', 3000, 0, 0.3); }
    else if (mat === 'flesh') this._noise(o, t, 0.06, 'lowpass', 600, 0, 0.6);
    else if (mat === 'water') this._noise(o, t, 0.12, 'bandpass', 1400, 1, 0.4);
    else if (mat === 'glass') { this._noise(o, t, 0.2, 'highpass', 4000, 0, 0.4); this._tone(o, t, 0.15, 'triangle', 4200, 3800, 0.08); }
    else this._noise(o, t, 0.05, 'bandpass', mat === 'wood' ? 900 : 1600, 1.5, 0.5);
  }
  whiz(pos) {
    if (!this.ctx || !this._voice()) return;
    if (this._s('whiz', this._out(pos, 0.9, 2), { jitter: 0.1, maxDur: 0.7 })) return;
    const o = this._out(pos, 0.9, 2), t = this.t;
    this._noise(o, t, 0.012, 'highpass', 5000, 0, 1.0);
    const f = this._noise(o, t + 0.005, 0.12, 'bandpass', 4500, 4, 0.5);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
  }
  explosion(pos, size = 1) {
    if (!this.ctx) return;
    const d = this.camPos ? Math.hypot(pos.x - this.camPos.x, pos.y - this.camPos.y, pos.z - this.camPos.z) : 20;
    const t = this.t + d / 340;
    {
      const nm = size >= 1.15 ? 'boom_big' : 'boom_small';
      const bo = this._out(pos, (size >= 1.15 ? 1.5 : 1.3) * Math.min(1.4, 0.7 + size * 0.5), 12);
      if (this.bank && this.bank.ready && this.bank.has(nm)) {
        this.bank.play(nm, bo, { at: t, jitter: 0.05, rate: size > 1.5 ? 0.9 : 1 });
        if (d > 140 && this.bank.has('boom_far')) this.bank.play('boom_far', this._out(pos, 0.9, 40), { at: t + 0.2 });
        if (d < 14) this.ring(1.2);
        return;
      }
    }
    const o = this._out(pos, 2.2 * size, 12);
    this._noise(o, t, 1.4 * size, 'lowpass', 1800, 0, 1.0, 0.003, this.brown).frequency.exponentialRampToValueAtTime(90, t + 1.2);
    this._tone(o, t, 0.8, 'sine', 70, 28, 1.2);
    this._noise(o, t, 0.08, 'highpass', 2500, 0, d < 60 ? 0.8 : 0.1);
    for (let i = 0; i < 6; i++) this._noise(o, t + 0.2 + Math.random() * 0.8, 0.04, 'bandpass', rand(1500, 4000), 3, 0.15);
    this._noise(this.revSend, t + 0.05, 3 * size, 'lowpass', 300, 0, 0.6, 0.05, this.brown);
    if (d < 14) this.ring(1.2);
  }
  ring(dur = 2) {
    if (!this.ctx) return;
    const t = this.t;
    this.deafen.frequency.cancelScheduledValues(t);
    this.deafen.frequency.setValueAtTime(500, t); this.deafen.frequency.exponentialRampToValueAtTime(20000, t + dur * 1.6);
    const o = this._out(null, 0.05);
    this._tone(o, t, dur, 'sine', 3800, 3700, 0.6, 0.01);
  }
  thunder(dist) {
    if (!this.ctx) return;
    const t = this.t + dist / 340 * 0.5;
    const o = this.amb;
    if (this.bank && this.bank.ready && this.bank.has('thunder') && this.bank.play(dist < 600 ? 'thunder' : 'thunder_far', o, { at: t, jitter: 0.06, vol: dist < 600 ? 1.0 : 0.8 })) return;
    if (dist < 600) this._noise(o, t, 0.4, 'highpass', 1500, 0, 0.4, 0.002);
    const f = this._noise(o, t + 0.05, rand(3, 5.5), 'lowpass', dist < 600 ? 900 : 350, 0, dist < 600 ? 1.0 : 0.6, 0.08, this.brown);
    f.frequency.exponentialRampToValueAtTime(80, t + 4);
    for (let i = 0; i < 4; i++) this._noise(o, t + rand(0.3, 2.5), rand(0.6, 1.4), 'lowpass', 220, 0, rand(0.3, 0.6), 0.1, this.brown);
  }
  footstep(surface, vol = 1) {
    if (!this.ctx) return;
    const FS = { water: 'step_water', metal: 'step_metal', grass: 'step_grass', gravel: 'step_gravel' }[surface] || 'step_concrete';
    if (this._s(FS, this._out(null, 0.2 * vol), { jitter: 0.1, maxDur: 0.5 })) return;
    const o = this._out(null, 0.28 * vol), t = this.t;
    if (surface === 'water') { this._noise(o, t, 0.25, 'bandpass', 1100, 1, 0.6, 0.01); this._noise(o, t + 0.05, 0.2, 'highpass', 2500, 0, 0.25); }
    else if (surface === 'metal') { this._noise(o, t, 0.06, 'bandpass', 900, 2, 0.6); this._tone(o, t, 0.12, 'triangle', rand(380, 460), 300, 0.1); }
    else if (surface === 'grass') { this._noise(o, t, 0.12, 'bandpass', 700, 0.8, 0.5, 0.01); this._noise(o, t, 0.08, 'highpass', 3000, 0, 0.15); }
    else { this._noise(o, t, 0.07, 'lowpass', 700, 0, 0.6); this._noise(o, t, 0.05, 'highpass', 2500, 0, 0.18); }
  }
  enemyStep(pos, heavy) {
    if (!this.ctx || !this._voice()) return;
    if (this._s(heavy ? 'step_heavy' : 'step_concrete', this._out(pos, heavy ? 0.42 : 0.2, 2), { jitter: 0.1, maxDur: 0.5 })) return;
    const o = this._out(pos, heavy ? 0.5 : 0.22, 2), t = this.t;
    this._noise(o, t, heavy ? 0.12 : 0.07, 'lowpass', heavy ? 400 : 650, 0, 0.6);
  }
  heartbeat() {
    if (!this.ctx) return;
    if (this._s('heartbeat', this._out(null, 0.6), { jitter: 0.02 })) return;
    const o = this._out(null, 0.5), t = this.t;
    this._tone(o, t, 0.12, 'sine', 60, 45, 0.9); this._tone(o, t + 0.22, 0.12, 'sine', 55, 40, 0.6);
  }
  grenadeBounce(pos) { if (!this.ctx) return; if (this._s('grenade_bounce', this._out(pos, 0.5, 3), { jitter: 0.08, maxDur: 0.6 })) return; const o = this._out(pos, 0.4, 3); this._tone(o, this.t, 0.06, 'triangle', rand(700, 1100), 500, 0.25); }
  // rugido grave do chefe: serra filtrada + ruído, com vibrato lento
  roar(pos, dur = 2.2) {
    if (!this.ctx) return;
    if (this._s('boss_roar', this._out(pos, 1.9, 25), { jitter: 0.03 })) return;
    const o = this._out(pos, 1.6, 25), t = this.t, c = this.ctx;
    for (const [f0, f1, type, v] of [[62, 34, 'sawtooth', 0.5], [93, 51, 'square', 0.25], [41, 26, 'sine', 0.8]]) {
      const os = c.createOscillator(); os.type = type; os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const lfo = c.createOscillator(); lfo.frequency.value = 17; const lg = c.createGain(); lg.gain.value = f0 * 0.06; lfo.connect(lg).connect(os.frequency);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(900, t + dur * 0.3); lp.frequency.linearRampToValueAtTime(200, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      os.connect(lp).connect(g).connect(o); os.start(t); lfo.start(t); os.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    }
    this._noise(o, t, dur, 'bandpass', 420, 0.6, 0.7, 0.15, this.brown);
    this._noise(this.revSend, t, dur + 1.5, 'lowpass', 300, 0, 0.5, 0.1, this.brown);
  }
  // passo/impacto pesado
  thud(pos, size = 1) {
    if (!this.ctx) return;
    if (this._s(size >= 2 ? 'boss_slam' : 'boss_step', this._out(pos, 1.3 * Math.min(size, 1.6), 14), { jitter: 0.05 })) return;
    const o = this._out(pos, 1.5 * size, 14), t = this.t;
    this._tone(o, t, 0.5, 'sine', 70, 24, 1.1 * size);
    this._noise(o, t, 0.22, 'lowpass', 700, 0, 0.9 * size, 0.002, this.brown);
    this._noise(o, t, 0.05, 'highpass', 2000, 0, 0.3 * size);
  }
  mortarIncoming(pos) {
    if (!this.ctx) return;
    if (this._s('incoming', this._out(pos, 0.9, 30), { jitter: 0.03 })) return;
    const o = this._out(pos, 0.7, 30), t = this.t;
    const os = this.ctx.createOscillator(); os.type = 'sine'; os.frequency.setValueAtTime(2200, t); os.frequency.exponentialRampToValueAtTime(500, t + 1.4);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
    os.connect(g).connect(o); os.start(t); os.stop(t + 1.5);
  }
  flashbang(pos) { if (!this.ctx) return; if (this._s('flashbang', this._out(pos, 1.2, 10), {})) { this.ring(2); return; } this.explosion(pos, 0.5); }
  // efeito genérico por nome do banco (posicional se houver pos); devolve false se a amostra não existir
  sfx(name, pos = null, opts = {}) { if (!this.ctx) return false; return this._s(name, this._out(pos, (opts.vol ?? 1) * (pos ? 1.4 : 0.8), opts.ref ?? 10), opts); }
  ui(name) { if (this.ctx && this.bank && this.bank.ready) this._s(name, this._out(null, { ui_click: 0.5, ui_hover: 0.25, ui_start: 0.9, checkpoint: 0.7, objective: 0.6, jammer_off: 0.9, support_ready: 0.6 }[name] ?? 0.6), { jitter: name.startsWith('ui_') ? 0.02 : 0.01 }); }
  sniperDistant() { if (!this.ctx) return; if (this._s('shot_sniper', this._out(null, 0.5), { rate: 0.8, maxDur: 2.5 })) return; const o = this.amb, t = this.t; this._noise(o, t, 0.02, 'highpass', 3000, 0, 0.4); this._noise(o, t + 0.25, 1.4, 'lowpass', 500, 0, 0.4, 0.01, this.brown); }

  // ---------- rádio ----------
  squelch(end = false) {
    if (!this.ctx) return;
    if (this._s(end ? 'radio_off' : 'radio_on', this.radioBus, { jitter: 0.03, maxDur: 0.5 })) return;
    const t = this.t;
    this._noise(this.radioBus, t, end ? 0.12 : 0.08, 'bandpass', 2600, 1, 0.35);
    if (!end) this._tone(this.radioBus, t, 0.05, 'sine', 1900, 1900, 0.08);
  }
  speak(text, speaker) {
    if (!this.tts || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR';
      const P = { TROVÃO: [0.7, 1.0], FAÍSCA: [1.35, 1.15], ATALAIA: [1.05, 0.98], CORUJA: [0.6, 0.9], BARQUEIRO: [0.5, 0.85], 'CORVO-1': [1.25, 1.1] }[speaker] || [1, 1];
      u.pitch = P[0]; u.rate = P[1] * 1.08; u.volume = 0.9;
      const v = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('pt'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  stopSpeech() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} }

  // ---------- loops ----------
  _loop(buf, type, freq, vol, out) {
    const C = this.ctx;
    const s = C.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = C.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(out || this.amb); s.start();
    return { s, f, g };
  }
  // troca os ruídos de chuva/vento por loops de amostra com crossfade (mantém .f/.g que o resto do código usa)
  _sampleLoopNode(name, type, freq, vol, dest, opts = {}) {
    const C = this.ctx, smp = this.bank.pick(name);
    if (!smp) return null;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = C.createGain(); g.gain.value = vol;
    f.connect(g).connect(dest || this.amb);
    const cl = new CrossLoop(C, smp.buf, f, { xf: opts.xf ?? 2, norm: smp.gain, start: 0 });
    return { s: { stop() { cl.stop(0.2); } }, f, g, cl };
  }
  _swapAmbience() {
    if (!this.bank.has('amb_rain')) return;
    const L = this.loops;
    for (const k of ['rainHi', 'rainLo', 'wind']) { const o = L[k]; if (o) { try { o.s.stop(); } catch (e) {} o.g.gain.value = 0; } }
    L.rainHi = this._sampleLoopNode('amb_rain', 'lowpass', 9000, 0.0);
    L.rainLo = this.bank.has('amb_rain_metal') ? this._sampleLoopNode('amb_rain_metal', 'lowpass', 1400, 0.0) : this._sampleLoopNode('amb_rain', 'lowpass', 700, 0.0);
    if (this.bank.has('amb_wind')) L.wind = this._sampleLoopNode('amb_wind', 'lowpass', 1200, 0.0);
    this._sampleAmb = true;
    const indoor = this.env !== 'outdoor';
    L.rainHi.f.frequency.value = indoor ? 500 : 12000; L.rainHi.g.gain.value = indoor ? 0.05 : (this._rainGain || 0.3);
    L.rainLo.g.gain.value = indoor ? 0.1 : 0.2;
    if (L.wind) L.wind.g.gain.value = indoor ? 0.015 : 0.28;
  }
  _startAmbience() {
    this.loops.rainHi = this._loop(this.white, 'highpass', 6000, 0.18);
    this.loops.rainLo = this._loop(this.brown, 'lowpass', 900, 0.12);
    this.loops.wind = this._loop(this.brown, 'bandpass', 350, 0.08);
    this.loops.wind.f.Q.value = 0.6;
  }
  positionalLoop(name, pos, kind, vol = 1) {
    if (!this.ctx) return null;
    if (this.loops[name]) return this.loops[name];
    const C = this.ctx;
    const pan = C.createPanner();
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = kind === 'spill' ? 25 : 6; pan.rolloffFactor = 1.2;
    const setPos = (p) => { if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z); };
    setPos(pos);
    const g = C.createGain(); g.gain.value = 0;
    g.connect(pan).connect(this.sfx);
    const nodes = [];
    const LS = { turbine: 'amb_turbine', spill: 'amb_spill', heli: 'amb_heli', jammer: 'amb_jammer', alarm: 'amb_alarm', fire: 'amb_fire', engine: 'amb_engine' }[kind];
    if (LS && this.bank && this.bank.ready && this.bank.has(LS)) {
      const smp = this.bank.pick(LS);
      const cl = new CrossLoop(C, smp.buf, g, { xf: Math.min(2, smp.dur * 0.2), norm: smp.gain });
      nodes.push({ stop() { cl.stop(0.3); } });
    } else if (kind === 'turbine') {
      for (const [f, v] of [[50, 0.4], [100, 0.25], [150, 0.08]]) { const o = C.createOscillator(); o.frequency.value = f; const og = C.createGain(); og.gain.value = v; o.connect(og).connect(g); o.start(); nodes.push(o); }
      const n = this._loop(this.brown, 'lowpass', 300, 0.3, g); nodes.push(n.s);
    } else if (kind === 'spill') {
      const n = this._loop(this.brown, 'lowpass', 1200, 1.2, g); nodes.push(n.s);
      const n2 = this._loop(this.white, 'bandpass', 900, 0.25, g); nodes.push(n2.s);
    } else if (kind === 'heli') {
      const n = this._loop(this.brown, 'lowpass', 500, 1.0, g); nodes.push(n.s);
      const lfo = C.createOscillator(); lfo.frequency.value = 17; const lg = C.createGain(); lg.gain.value = 0.7;
      lfo.connect(lg).connect(n.g.gain); lfo.start(); nodes.push(lfo);
      const tone = C.createOscillator(); tone.frequency.value = 85; tone.type = 'sawtooth'; const tg = C.createGain(); tg.gain.value = 0.05; tone.connect(tg).connect(g); tone.start(); nodes.push(tone);
    } else if (kind === 'jammer') {
      const o = C.createOscillator(); o.type = 'square'; o.frequency.value = 120; const og = C.createGain(); og.gain.value = 0.03; o.connect(og).connect(g); o.start(); nodes.push(o);
      const o2 = C.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 2400; const lf = C.createOscillator(); lf.frequency.value = 6; const lfg = C.createGain(); lfg.gain.value = 600; lf.connect(lfg).connect(o2.frequency); lf.start();
      const o2g = C.createGain(); o2g.gain.value = 0.012; o2.connect(o2g).connect(g); o2.start(); nodes.push(o2, lf);
    } else if (kind === 'alarm') {
      const o = C.createOscillator(); o.type = 'sawtooth'; const lf = C.createOscillator(); lf.frequency.value = 0.45; const lfg = C.createGain(); lfg.gain.value = 260; o.frequency.value = 720;
      lf.connect(lfg).connect(o.frequency); const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5;
      o.connect(f).connect(g); o.start(); lf.start(); nodes.push(o, lf);
    } else if (kind === 'fire') {
      const n = this._loop(this.brown, 'lowpass', 600, 0.6, g); nodes.push(n.s);
      const n2 = this._loop(this.white, 'bandpass', 2500, 0.06, g); nodes.push(n2.s);
    } else if (kind === 'engine') {
      const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 48; const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; const og = C.createGain(); og.gain.value = 0.25;
      o.connect(f).connect(og).connect(g); o.start(); nodes.push(o);
    }
    g.gain.setTargetAtTime(vol, this.t, 0.5);
    const L = { g, pan, setPos, nodes, stop: () => { g.gain.setTargetAtTime(0, this.t, 0.4); setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch (e) {} }), 2500); delete this.loops[name]; } };
    this.loops[name] = L;
    return L;
  }
  stopLoop(name) { this.loops[name] && this.loops[name].stop && this.loops[name].stop(); }
  setRain(intensity, indoor) {
    if (!this.ctx) return;
    const k = this._sampleAmb ? 2.2 : 1;
    this._rainGain = (0.08 + intensity * 0.16) * k;
    if (!indoor) this.loops.rainHi.g.gain.setTargetAtTime(this._rainGain, this.t, 1);
    this.loops.rainLo.g.gain.setTargetAtTime(indoor ? 0.05 * k : (0.06 + intensity * 0.1) * k * 0.5, this.t, 1);
  }

  // ---------- música dinâmica ----------
  _startMusic() {
    const C = this.ctx;
    // pad de tensão
    this.pad = C.createGain(); this.pad.gain.value = 0.0;
    const pf = C.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 420; pf.Q.value = 2;
    this.pad.connect(pf).connect(this.musicBus);
    this.padFilter = pf;
    for (const [f, d] of [[55, -7], [55, 6], [82.4, 3], [65.4, -4]]) { const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; const g = C.createGain(); g.gain.value = 0.07; o.connect(g).connect(this.pad); o.start(); }
    const lfo = C.createOscillator(); lfo.frequency.value = 0.05; const lg = C.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(pf.frequency); lfo.start();
    this.pulseG = C.createGain(); this.pulseG.gain.value = 0; this.pulseG.connect(this.musicBus);
    this.drumG = C.createGain(); this.drumG.gain.value = 0; this.drumG.connect(this.musicBus);
    this.bpm = 96; this.nextBeat = this.t + 0.1; this.beat = 0;
    this._musicTimer = setInterval(() => this._schedule(), 40);
  }
  _schedule() {
    if (!this.ctx) return;
    if (this._trackPlaying) { this.pad.gain.setTargetAtTime(0, this.t, 0.5); this.pulseG.gain.setTargetAtTime(0, this.t, 0.5); this.drumG.gain.setTargetAtTime(0, this.t, 0.5); this.nextBeat = this.t + 1; return; }
    const spb = 60 / this.bpm / 2;
    while (this.nextBeat < this.t + 0.15) {
      const t = this.nextBeat, b = this.beat % 32;
      // pulso grave (colcheias)
      if (this.music.intensity > 0.2) {
        const notes = [55, 55, 55, 58.3, 55, 55, 49, 51.9];
        this._tone(this.pulseG, t, spb * 0.9, 'sawtooth', notes[Math.floor(b / 4) % 8], notes[Math.floor(b / 4) % 8], 0.18, 0.005);
      }
      if (this.music.intensity > 0.55) {
        if (b % 8 === 0 || b % 8 === 5) this._tone(this.drumG, t, 0.35, 'sine', 120, 38, 0.9, 0.003);
        if (b % 8 === 4) { this._noise(this.drumG, t, 0.2, 'bandpass', 1600, 0.8, 0.45); this._tone(this.drumG, t, 0.12, 'triangle', 200, 120, 0.3); }
        if (b % 2 === 1) this._noise(this.drumG, t, 0.04, 'highpass', 7000, 0, 0.08);
        if (b % 32 >= 28) this._tone(this.drumG, t, 0.2, 'sine', 160 - (b % 4) * 20, 70, 0.5);
      }
      this.nextBeat += spb; this.beat++;
    }
    const I = (this.music.intensity += (this.music.target - this.music.intensity) * 0.02);
    this.pad.gain.setTargetAtTime(0.18 + I * 0.12, this.t, 0.5);
    this.padFilter.Q.value = 2 + I * 6;
    this.pulseG.gain.setTargetAtTime(I > 0.2 ? clamp((I - 0.2) * 2, 0, 0.9) : 0, this.t, 0.5);
    this.drumG.gain.setTargetAtTime(I > 0.55 ? clamp((I - 0.55) * 2.5, 0, 1) : 0, this.t, 0.4);
  }
  // modo: menu | stealth | tension | combat | boss | defense | extract | victory | death | off
  setMusic(mode, force = false) {
    this.musicMode = mode;
    if (!this.ctx || !this._musicReady) return;
    const MAP = { menu: 'mus_menu', stealth: 'mus_stealth', tension: 'mus_tension', combat: 'mus_combat', boss: 'mus_boss', defense: 'mus_defense', extract: 'mus_extract', victory: 'mus_victory', death: 'mus_death', off: null };
    const name = MAP[mode];
    if (name === this._curTrack && !force) return;
    this._curTrack = name;
    const seq = (this._trackSeq = (this._trackSeq || 0) + 1);
    const prev = this._trackNode;
    if (prev) { prev.stop(name ? 2.4 : 1.0); this._trackNode = null; }
    if (!name) { this._trackPlaying = false; return; }
    this.bank.music_buffer(name).then((buf) => {
      if (!buf || seq !== this._trackSeq) return;
      const C = this.ctx, once = name === 'mus_victory' || name === 'mus_death';
      const out = C.createGain(); out.gain.value = 0.0001; out.connect(this.musicBus);
      const t = this.t;
      out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(1, t + (once ? 0.3 : 2.4));
      const fadeOut = (stopFn) => (f = 1) => { const n = this.t; out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.linearRampToValueAtTime(0.0001, n + f); setTimeout(stopFn, f * 1000 + 100); };
      let node;
      if (once) {
        const src = C.createBufferSource(); src.buffer = buf; src.connect(out); src.start(t);
        node = { stop: fadeOut(() => { try { src.stop(); } catch (e) {} }) };
      } else {
        const cl = new CrossLoop(C, buf, out, { xf: 3, norm: this.bank.musicGain(name) });
        node = { stop: fadeOut(() => cl.stop(0.1)) };
      }
      this._trackNode = node; this._trackPlaying = true;
      // pré-carrega as faixas vizinhas
      const nx = { stealth: ['mus_tension', 'mus_combat'], tension: ['mus_combat', 'mus_stealth'], combat: ['mus_tension', 'mus_stealth'], menu: ['mus_stealth'] }[mode];
      if (nx) nx.forEach((n, i) => setTimeout(() => this.bank.music_buffer(n), 1500 + i * 2500));
    });
  }
  stinger(kind = 'good') {
    if (!this.ctx) return;
    const t = this.t, o = this.musicBus;
    const chord = kind === 'good' ? [110, 138.6, 164.8, 220] : [98, 116.5, 146.8, 185];
    for (const f of chord) { this._tone(o, t, 2.8, 'sawtooth', f, f, 0.05, 0.4); this._tone(o, t, 2.8, 'sawtooth', f * 1.003, f * 1.003, 0.04, 0.4); }
    this._tone(o, t, 1.4, 'sine', 55, 40, 0.5, 0.01);
  }
  setVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.musicBus.gain.value = this.vol.music;
  }
}
