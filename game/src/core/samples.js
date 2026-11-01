// Banco de amostras (sons gerados pelo Stable Audio 3): decodifica, apara o silêncio inicial, normaliza o pico
// e toca com variação de tom. Também tem o loop com crossfade (ambientes) e o cache LRU das trilhas longas.
import { clamp, rand } from './utils.js';

const BASE = './assets/audio/';

export class SampleBank {
  constructor(ctx) {
    this.ctx = ctx;
    this.sets = new Map();   // nome → [{ buf, gain, start, dur }]
    this.manifest = null;
    this.ready = false;
    this.pending = new Map();
    this.music = new Map();  // nome → { buf } (LRU)
    this.musicOrder = [];
  }
  async init() {
    try {
      this.manifest = await (await fetch(BASE + 'manifest.json', { cache: 'no-cache' })).json();
    } catch (e) { console.warn('Sem banco de sons; usando síntese.', e); return; }
    // efeitos e loops curtos: decodifica tudo em segundo plano, aos poucos (não trava o jogo)
    const names = Object.keys(this.manifest).filter((n) => this.manifest[n].group !== 'music');
    const prio = ['shot_', 'imp_', 'step_', 'whiz', 'boom_', 'hit_', 'mag_', 'amb_rain', 'amb_wind'];
    names.sort((a, b) => prio.findIndex((p) => a.startsWith(p)) - prio.findIndex((p) => b.startsWith(p)) || 0);
    this.ready = true;
    (async () => { for (const n of names) { await this.load(n); await new Promise((r) => setTimeout(r, 0)); } })();
  }
  async _decode(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url);
    const ab = await r.arrayBuffer();
    return await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
  }
  // apara silêncio inicial e calcula o ganho de normalização (pico → 0,9)
  _prep(buf, group) {
    let peak = 0, start = 0;
    const ch = buf.getChannelData(0), n = ch.length;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i += 3) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
    if (group === 'sfx') {
      const thr = Math.max(0.01, peak * 0.03);
      for (let i = 0; i < n; i++) if (Math.abs(ch[i]) > thr) { start = Math.max(0, i - Math.floor(buf.sampleRate * 0.004)); break; }
    }
    return { buf, gain: peak > 0.0001 ? 0.9 / peak : 1, start: start / buf.sampleRate, dur: buf.duration };
  }
  async load(name) {
    if (this.sets.has(name)) return this.sets.get(name);
    if (this.pending.has(name)) return this.pending.get(name);
    const m = this.manifest && this.manifest[name];
    if (!m) return null;
    const p = (async () => {
      const arr = [];
      for (const f of m.files) { try { arr.push(this._prep(await this._decode(f), m.group)); } catch (e) { /* arquivo ausente */ } }
      this.sets.set(name, arr.length ? arr : null);
      this.pending.delete(name);
      return arr.length ? arr : null;
    })();
    this.pending.set(name, p);
    return p;
  }
  has(name) { const s = this.sets.get(name); return !!(s && s.length); }
  pick(name) { const s = this.sets.get(name); return s && s.length ? s[Math.floor(Math.random() * s.length)] : null; }
  // toca uma amostra em "out". opts: rate (tom), vol, at (tempo absoluto), maxDur (corte com fade), offset
  play(name, out, opts = {}) {
    const smp = this.pick(name);
    if (!smp) return null;
    const C = this.ctx, t = opts.at ?? C.currentTime;
    const src = C.createBufferSource(); src.buffer = smp.buf;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + rand(-(opts.jitter ?? 0.04), opts.jitter ?? 0.04));
    const g = C.createGain(); g.gain.value = smp.gain * (opts.vol ?? 1);
    src.connect(g).connect(out);
    const off = smp.start + (opts.offset || 0);
    src.start(t, off);
    const avail = (smp.dur - off) / src.playbackRate.value;
    const dur = Math.min(opts.maxDur ?? avail, avail);
    if (dur < avail - 0.02) { g.gain.setValueAtTime(g.gain.value, t + dur - 0.08); g.gain.linearRampToValueAtTime(0.0001, t + dur); src.stop(t + dur + 0.02); }
    return { src, g, dur };
  }
  musicGain(name) { return (this.mgain && this.mgain[name]) || 0.6; }
  // ---- trilhas (decodifica sob demanda, mantém no máximo 4) ----
  async music_buffer(name) {
    if (this.music.has(name)) { this.musicOrder = this.musicOrder.filter((x) => x !== name).concat(name); return this.music.get(name); }
    const m = this.manifest && this.manifest[name];
    if (!m) return null;
    const key = 'm:' + name;
    if (this.pending.has(key)) return this.pending.get(key);
    const p = (async () => {
      try {
        const buf = await this._decode(m.files[0]);
        this.music.set(name, buf); this.musicOrder.push(name);
        // normalização por RMS (as trilhas têm dinâmicas diferentes): alvo ≈ -19 dBFS, sem passar de pico 0,9
        { const d = buf.getChannelData(0); let sum = 0, pk = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; sum += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); n++; } const rms = Math.sqrt(sum / n) || 0.1; (this.mgain || (this.mgain = {}))[name] = Math.min(0.11 / rms, 0.95 / (pk || 1)); }
        while (this.musicOrder.length > 4) { const old = this.musicOrder.shift(); if (!this.keep || !this.keep.has(old)) this.music.delete(old); }
        return buf;
      } catch (e) { return null; } finally { this.pending.delete(key); }
    })();
    this.pending.set(key, p);
    return p;
  }
}

// Loop sem emenda: duas fontes alternadas com crossfade igual-potência. dest recebe o resultado.
export class CrossLoop {
  constructor(ctx, buf, dest, { xf = 1.5, vol = 1, start = 0, end = null, norm = 1 } = {}) {
    this.ctx = ctx; this.buf = buf; this.dest = dest; this.xf = Math.min(xf, buf.duration * 0.3);
    this.start = start; this.end = end || buf.duration; this.norm = norm; this.alive = true;
    this.out = ctx.createGain(); this.out.gain.value = vol; this.out.connect(dest);
    this.voices = [];
    this._spawn(ctx.currentTime + 0.02, true);
    this.timer = setInterval(() => this._tick(), 200);
  }
  _spawn(at, first = false) {
    const C = this.ctx, src = C.createBufferSource(); src.buffer = this.buf;
    const g = C.createGain();
    const len = this.end - this.start, xf = this.xf;
    // primeira vez: sem fade-in; depois: fade-in de xf; sempre fade-out nos últimos xf
    g.gain.setValueAtTime(first ? this.norm : 0.0001, at);
    if (!first) g.gain.linearRampToValueAtTime(this.norm, at + xf);
    g.gain.setValueAtTime(this.norm, at + len - xf);
    g.gain.linearRampToValueAtTime(0.0001, at + len);
    src.connect(g).connect(this.out);
    src.start(at, this.start, len); src.stop(at + len + 0.05);
    this.voices.push(src);
    this.nextAt = at + len - xf;
    src.onended = () => { this.voices = this.voices.filter((v) => v !== src); };
  }
  _tick() {
    if (!this.alive) return;
    if (this.ctx.currentTime + 0.5 > this.nextAt) this._spawn(this.nextAt);
  }
  stop(fade = 0.6) {
    this.alive = false; clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t); this.out.gain.setValueAtTime(this.out.gain.value, t); this.out.gain.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => { this.voices.forEach((v) => { try { v.stop(); } catch (e) {} }); try { this.out.disconnect(); } catch (e) {} }, fade * 1000 + 100);
  }
}
