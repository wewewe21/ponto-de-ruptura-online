// HUD em DOM/canvas: minimapa rotativo, bússola, objetivo, esquadrão, munição, granadas, suporte,
// mira dinâmica, hitmarker, indicadores de dano/detecção/granada, marcadores no mundo, legendas, mapa.
import * as THREE from 'three';
import { clamp } from '../core/utils.js';
import { codeLabel } from '../core/keybinds.js';

const $ = (id) => document.getElementById(id);
const SPK = { TROVÃO: '#a6d98f', FAÍSCA: '#f2c46b', ATALAIA: '#8fb8ff', CORUJA: '#c8a6ff', BARQUEIRO: '#ff7d6b', 'CORVO-1': '#7fe3e0', HOSTIL: '#e2574c', ECO: '#ffffff' };
const RADIO = new Set(['ATALAIA', 'CORUJA', 'CORVO-1', 'TROVÃO', 'FAÍSCA']);
const MAP = { x0: -285, z0: -95, w: 560, h: 345, ppm: 2 };

export class Dialog {
  constructor(G) { this.G = G; this.queue = []; this.cur = null; this.t = 0; }
  say(speaker, text, o = {}) {
    const line = { speaker, text, pri: o.priority ?? 1, dur: o.dur ?? Math.max(1.8, Math.min(6.5, text.length * 0.058 + 0.8)), short: o.short, radio: o.radio, pos: o.pos };
    if (this.cur && line.pri > this.cur.pri) { this.queue.unshift(line); this._next(); return; }
    if (o.short && (this.cur || this.queue.length > 1)) return;
    if (this.queue.length > 5) this.queue.shift();
    this.queue.push(line);
    if (!this.cur) this._next();
  }
  clear() { this.queue = []; this.cur = null; this.t = 0; this.G.hud.subtitle(null); this.G.audio.stopSpeech(); }
  _next() {
    this.G.audio.stopSpeech('dialogue');
    this.cur = this.queue.shift() || null;
    if (!this.cur) { this.G.hud.subtitle(null); return; }
    const line=this.cur, ally=this.G.allies?.byName?.[line.speaker];
    const near=ally&&this.G.player?.pos&&ally.pos.distanceTo(this.G.player.pos)<12;
    line.radio = line.radio ?? (near ? false : RADIO.has(line.speaker)||line.speaker==='BARQUEIRO');
    line.pos = line.pos || (near ? ally.pos.clone() : null);
    this.t = Math.max(line.dur,this.G.audio.speechDuration?.(line.text,line.speaker)||0)+.4;
    this.G.hud.subtitle(line.speaker,line.text,this.t+.3);
    if (line.radio) this.G.audio.squelch();
    this.G.audio.speak(line.text,line.speaker,{radio:line.radio,pos:line.pos,onStart:duration=>{
      if(this.cur!==line)return;this.t=duration+.18;this.G.hud.subtitle(line.speaker,line.text,this.t+.3);
    },onEnd:()=>{if(this.cur===line)this.t=Math.min(this.t,.18);}});
  }
  update(dt) {
    if (!this.cur) return;
    this.t -= dt;
    if (this.t <= 0) { if (this.cur.radio) this.G.audio.squelch(true); this._next(); }
  }
  get busy() { return !!this.cur || this.queue.length > 0; }
}

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = $('hud');
    this.mm = $('minimap').getContext('2d');
    this.cmp = $('compass').getContext('2d');
    this.ind = $('indicators').getContext('2d');
    this.hit = { t: 0, kind: 'hit' };
    this.dmg = [];
    this.toastT = 0; this.bannerT = 0; this.subT = 0; this.enemySubT = 0;
    this.markers = new Map();
    this.markerLayer = $('markers');
    this.objective = { title: '', text: '', sub: '' };
    this.objMarker = null; this.objLabel = '';
    this._buildMapImage();
    this.resize();
  }
  _buildMapImage() {
    const G = this.G, P = G.physics;
    const c = document.createElement('canvas');
    c.width = MAP.w * MAP.ppm; c.height = MAP.h * MAP.ppm;
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) {
      const wx = MAP.x0 + x / MAP.ppm, wz = MAP.z0 + y / MAP.ppm;
      const h = P.terrainH(wx, wz);
      const i = (y * c.width + x) * 4;
      let r, gg, b;
      const water = P.waterLevel(wx, wz);
      if (h < water - 0.3) { r = 14; gg = 28; b = 38; }
      else if (h < -20) { r = 10; gg = 12; b = 14; }
      else { const k = clamp(0.5 + h / 60, 0.3, 1); r = 34 * k + 8; gg = 40 * k + 8; b = 32 * k + 8; }
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tx = (x) => (x - MAP.x0) * MAP.ppm, tz = (z) => (z - MAP.z0) * MAP.ppm;
    // estradas
    g.fillStyle = 'rgba(70,72,74,0.9)';
    for (const r of G.level.roads || []) g.fillRect(tx(r[0]), tz(r[1]), (r[2] - r[0]) * MAP.ppm, (r[3] - r[1]) * MAP.ppm);
    // colisores
    for (const col of P.cols) {
      if (!col.active || col.map === false || col.invisible) continue;
      if (col.maxY < -2 || col.maxY - Math.max(col.minY, -3) < 0.5) continue;
      const w = (col.maxX - col.minX) * MAP.ppm, d = (col.maxZ - col.minZ) * MAP.ppm;
      if (w * d < 1.5) continue;
      const tall = col.maxY - col.minY > 2.5;
      g.fillStyle = col.cover === 'low' ? 'rgba(120,124,118,0.85)' : tall ? 'rgba(150,154,150,0.95)' : 'rgba(110,114,110,0.9)';
      g.fillRect(tx(col.minX), tz(col.minZ), Math.max(1, w), Math.max(1, d));
    }
    this.mapImg = c;
  }
  resize() {
    const ic = $('indicators');
    ic.width = innerWidth; ic.height = innerHeight;
    this.W = innerWidth; this.H = innerHeight;
  }
  show(v) { this.el.hidden = !v; }
  stimUsed() {
    this.G.vm?.showStim?.();
    const el = $('stim-use');
    if (el) { el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(this.stimTimer); this.stimTimer = setTimeout(() => el.classList.remove('on'), 900); }
    this.G.audio?.stim?.();
  }
  // ---------- notificações ----------
  toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('on'); this.toastT = 2.2; }
  banner(title, sub = '', kind = '') {
    const b = $('banner');
    b.innerHTML = `<div class="b-title">${title}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    b.className = 'on ' + kind; this.bannerT = 4;
    if (this.G.audio && this.G.audio.ctx) this.G.audio.ui(kind === 'cp' ? 'checkpoint' : kind === 'sup' ? 'support_ready' : 'objective');
  }
  subtitle(speaker, text, dur = 3, enemy = false) {
    if (enemy) {
      const e = $('esubs');
      e.innerHTML = `<span class="spk" style="color:${SPK.HOSTIL}">HOSTIL:</span> ${text}`;
      e.classList.add('on'); this.enemySubT = dur;
      return;
    }
    const s = $('subs');
    if (!speaker) { s.classList.remove('on'); return; }
    s.innerHTML = `<span class="spk" style="color:${SPK[speaker] || '#fff'}">${speaker}:</span> ${text}`;
    s.classList.add('on'); this.subT = dur;
  }
  setObjective(title, text, marker = null, label = '') {
    if (this._lastObj && this._lastObj !== title && this.G.audio && this.G.audio.ctx) this.G.audio.ui('objective');
    this._lastObj = title;
    this.objective = { title, text };
    $('obj-title').textContent = title;
    $('obj-text').textContent = text;
    this.objMarker = marker; this.objLabel = label;
    const o = $('objective'); o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash');
  }
  setObjectiveSub(t) { $('obj-sub').textContent = t || ''; }
  hitmarker(kind) { this.hit = { t: 0.22, kind }; }
  damageFrom(pos) { this.dmg.push({ pos: pos.clone(), t: 1.6 }); if (this.dmg.length > 6) this.dmg.shift(); }
  prompt(text, progress = -1) {
    const p = $('prompt');
    if (!text) { p.classList.remove('on'); return; }
    p.classList.add('on');
    $('prompt-text').innerHTML = this.G.mobile ? text.replace(/<b>F<\/b>/g, '<b>USAR</b>') : text;
    const ring = $('prompt-ring');
    ring.style.display = progress >= 0 ? 'block' : 'none';
    ring.style.setProperty('--p', Math.round(progress * 100));
  }
  // ---------- quadro ----------
  update(dt) {
    const G = this.G, p = G.player, W = G.weapons;
    const remaining = Math.max(0, Math.ceil(((p.stimReadyAt || 0) - G.time * 1000) / 1000));
    $('campaign-stim-status').textContent = remaining ? `${remaining}s` : `[${codeLabel(G.input.physical('KeyQ'))}] 1`;
    $('campaign-stim').classList.toggle('charging', remaining > 0);
    this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on');
    this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.remove('on');
    this.subT -= dt; if (this.subT <= 0) $('subs').classList.remove('on');
    this.enemySubT -= dt; if (this.enemySubT <= 0) $('esubs').classList.remove('on');
    // munição
    const d = W.def, A = W.A;
    $('w-name').textContent = d.name;
    if (d.laser) {
      const S = G.support.types[G.support.selected];
      $('w-mag').textContent = S ? S.charges : '-';
      $('w-res').textContent = S ? S.name : '';
    } else if (d.melee) {
      $('w-mag').textContent = '—'; $('w-res').textContent = ''; $('w-mag').classList.remove('low');
    } else {
      $('w-mag').textContent = A.mag;
      $('w-res').textContent = A.reserve;
      $('w-mag').classList.toggle('low', A.mag <= Math.ceil(d.mag * 0.25));
    }
    const low = !W.reload && !d.melee && !d.laser && d.mag > 0 && A.mag > 0 && A.mag <= Math.ceil(d.mag * 0.25);   // pente acabando: aviso pequeno e vermelho
    $('w-reload').classList.toggle('on', !!W.reload || low || (A.mag === 0 && !d.melee && !d.laser && d.mag > 0));
    $('w-reload').classList.toggle('lowwarn', low || (!W.reload && A.mag === 0 && !d.melee && !d.laser));
    $('w-reload').textContent = W.reload ? 'RECARREGANDO' : A.reserve <= 0 && A.mag === 0 ? 'SEM MUNIÇÃO' : low ? (A.reserve > 0 ? 'MUNIÇÃO BAIXA · R' : 'MUNIÇÃO BAIXA') : 'RECARREGUE [R]';
    $('g-frag').textContent = W.nades.frag;
    $('g-tac').textContent = W.nades[W.tactical];
    $('g-tac-name').textContent = W.tactical === 'flash' ? 'FLASH' : 'FUMAÇA';
    // suporte
    const sup = G.support;
    for (const k of ['drone', 'mortar', 'sniper']) {
      const T = sup.types[k], el = $('s-' + k);
      el.classList.toggle('locked', !T.unlocked);
      el.classList.toggle('sel', T.unlocked && sup.selected === k);
      el.querySelector('.n').textContent = T.unlocked ? `${T.charges}/${T.max}` : '—';
      el.querySelector('.cd').style.width = T.unlocked && T.charges < T.max ? `${(T.cdT / T.cd) * 100}%` : '0%';
    }
    // postura / NVG
    $('stance').dataset.s = p.stance;
    $('nvg-ind').classList.toggle('on', !!G.nvg);
    $('vis-ind').style.opacity = G.mission && G.mission.stealth && !G.director.anyAware() ? 1 : 0;
    $('vis-bar').style.width = `${clamp(p.visibility / 1.2, 0, 1) * 100}%`;
    // esquadrão
    const al = G.allies.list;
    $('sq-0').textContent = al[0].status; $('sq-1').textContent = al[1].status;
    $('sq-2').textContent = G.support.types.sniper.unlocked ? 'Overwatch' : 'Sem enlace';
    $('sq-row-2').classList.toggle('dim', !G.support.types.sniper.unlocked);
    // mira
    const ch = $('crosshair');
    const hide = d.melee || W.adsT > 0.5 || p.sprintT > 0.5 || W.busy && W.reload == null && W.swap > 0 || d.laser && W.adsT > 0.5 || p.dead;
    ch.style.opacity = hide ? 0 : 1;
    const spread = W.spreadDeg();
    const gap = Math.tan((spread * Math.PI) / 180) / Math.tan((G.camera.fov * Math.PI) / 360) * (this.H / 2);
    ch.style.setProperty('--gap', `${clamp(gap, 4, 120)}px`);
    $('laser-ret').style.opacity = d.laser && W.adsT > 0.5 ? 1 : 0;
    // hitmarker
    this.hit.t -= dt;
    const hm = $('hitmarker');
    hm.style.opacity = this.hit.t > 0 ? clamp(this.hit.t / 0.12, 0, 1) : 0;
    hm.dataset.k = this.hit.kind;
    // fôlego
    $('breath').style.opacity = p.underwater > 0.5 ? 1 : 0;
    $('breath-bar').style.width = `${clamp(p.breath / 8, 0, 1) * 100}%`;
    this.drawCompass();
    this.drawMinimap();
    this.drawIndicators(dt);
    this.drawMarkers();
  }
  bearing(x, z) { return Math.atan2(x - this.G.player.pos.x, -(z - this.G.player.pos.z)); }
  drawCompass() {
    const g = this.cmp, c = g.canvas, w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const heading = -this.G.player.yaw;
    const pxPerRad = w / 2.2;
    g.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center';
    const labels = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      let rel = ((a - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const x = w / 2 + rel * pxPerRad;
      if (x < 0 || x > w) continue;
      const fade = 1 - Math.abs(rel) / 1.1;
      g.globalAlpha = clamp(fade, 0, 1);
      if (labels[deg] !== undefined) { g.fillStyle = deg === 0 ? '#ffd27a' : '#e8ece6'; g.fillText(labels[deg], x, 15); g.fillRect(x - 0.5, 20, 1, 8); }
      else { g.fillStyle = '#c8ccc6'; g.fillRect(x - 0.5, 22, 1, 5); g.font = '500 10px "IBM Plex Mono", monospace'; g.fillText(String(deg), x, 15); g.font = '600 13px "Barlow Condensed", "Arial Narrow", sans-serif'; }
    }
    g.globalAlpha = 1;
    const m = this.objMarker;
    if (m) {
      const b = this.bearing(m.x, m.z);
      let rel = ((b - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const x = clamp(w / 2 + rel * pxPerRad, 8, w - 8);
      g.fillStyle = '#ffd27a';
      g.beginPath(); g.moveTo(x, 30); g.lineTo(x - 5, 36); g.lineTo(x, 42); g.lineTo(x + 5, 36); g.fill();
    }
    g.fillStyle = '#ffffff'; g.fillRect(w / 2 - 1, 0, 2, 6);
    g.font = '600 12px "IBM Plex Mono", monospace';
    const deg = Math.round(((heading * 180) / Math.PI + 720) % 360);
    g.fillText(String(deg).padStart(3, '0'), w / 2, h - 2);
  }
  drawMinimap() {
    const G = this.G, g = this.mm, c = g.canvas, s = c.width, p = G.player;
    const scale = 1.5;
    g.save();
    g.clearRect(0, 0, s, s);
    g.beginPath(); g.rect(0, 0, s, s); g.clip();
    g.fillStyle = '#0b0f12'; g.fillRect(0, 0, s, s);
    g.translate(s / 2, s / 2);
    g.rotate(p.yaw);
    const k = scale / MAP.ppm;
    g.globalAlpha = 0.92;
    g.drawImage(this.mapImg, (MAP.x0 - p.pos.x) * scale, (MAP.z0 - p.pos.z) * scale, this.mapImg.width * k, this.mapImg.height * k);
    g.globalAlpha = 1;
    const toM = (x, z) => [(x - p.pos.x) * scale, (z - p.pos.z) * scale];
    // jammers
    for (const j of G.level.jammers) {
      const [x, y] = toM(j.pos.x, j.pos.z);
      g.fillStyle = j.disabled ? '#5a6158' : '#ff4a3a';
      g.fillRect(x - 3, y - 3, 6, 6);
    }
    // inimigos (atirando sem supressor ou marcados)
    const marks = G.support.marksVisible();
    for (const e of G.director.enemies) {
      if (e.dead) continue;
      const vis = (G.time - e.firedT < 2) || (e.markedT > 0 && marks);
      if (!vis) continue;
      const [x, y] = toM(e.pos.x, e.pos.z);
      g.fillStyle = e.markedT > 0 ? '#ff6a4a' : '#e2574c';
      g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
    }
    for (const a of G.allies.list) {
      const [x, y] = toM(a.pos.x, a.pos.z);
      g.fillStyle = '#7fe08a'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
    }
    if (G.mission && G.mission.heli && G.mission.heli.group.visible) { const hp = G.mission.heli.group.position; const [x, y] = toM(hp.x, hp.z); g.fillStyle = '#7fe3e0'; g.fillRect(x - 4, y - 4, 8, 8); }
    if (this.objMarker) {
      let [x, y] = toM(this.objMarker.x, this.objMarker.z);
      const r = Math.hypot(x, y), lim = s / 2 - 8;
      if (r > lim) { x *= lim / r; y *= lim / r; }
      g.fillStyle = '#ffd27a'; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore();
    }
    g.restore();
    // jogador
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(s / 2, s / 2 - 7); g.lineTo(s / 2 - 5, s / 2 + 6); g.lineTo(s / 2, s / 2 + 3); g.lineTo(s / 2 + 5, s / 2 + 6); g.fill();
    // cone de visão
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath(); g.moveTo(s / 2, s / 2); g.arc(s / 2, s / 2, s * 0.45, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.fill();
    g.strokeStyle = 'rgba(232,236,230,0.35)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, s - 1, s - 1);
    g.fillStyle = '#e8ece6'; g.font = '600 11px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
    const nA = p.yaw - Math.PI / 2;
    g.fillText('N', s / 2 + Math.cos(nA) * (s / 2 - 9), s / 2 + Math.sin(nA) * (s / 2 - 9) + 4);
  }
  drawIndicators(dt) {
    const G = this.G, g = this.ind, p = G.player;
    g.clearRect(0, 0, this.W, this.H);
    const cx = this.W / 2, cy = this.H / 2;
    const heading = -p.yaw;
    // dano direcional
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i];
      d.t -= dt;
      if (d.t <= 0) { this.dmg.splice(i, 1); continue; }
      const rel = this.bearing(d.pos.x, d.pos.z) - heading - Math.PI / 2;
      g.strokeStyle = `rgba(220,40,30,${clamp(d.t / 1.6, 0, 1) * 0.85})`;
      g.lineWidth = 7;
      g.beginPath(); g.arc(cx, cy, 120, rel - 0.32, rel + 0.32); g.stroke();
    }
    // detecção (inimigos percebendo o jogador)
    for (const e of G.director.enemies) {
      if (e.dead) continue;
      let a = 0, col;
      if (e.unaware && e.aware > 0.04) { a = e.aware; col = a < 0.35 ? `rgba(240,240,230,${0.35 + a})` : `rgba(255,${Math.round(200 - a * 150)},40,${0.6 + a * 0.4})`; }
      else if (e.inCombat && e.canSee && e.pos.distanceTo(p.pos) < 60) { a = 1; col = 'rgba(230,60,40,0.85)'; }
      else continue;
      const rel = this.bearing(e.pos.x, e.pos.z) - heading - Math.PI / 2;
      const r = 92;
      const x = cx + Math.cos(rel) * r, y = cy + Math.sin(rel) * r;
      g.save(); g.translate(x, y); g.rotate(rel + Math.PI / 2);
      g.fillStyle = col;
      const s = 7 + a * 5;
      g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.9, s * 0.4); g.lineTo(0, 0); g.lineTo(-s * 0.9, s * 0.4); g.fill();
      g.restore();
    }
    // granadas inimigas próximas
    for (const pr of G.weapons.projectiles) {
      if (pr.type !== 'nade' || pr.kind !== 'frag' || pr.owner === 'player') continue;
      const d = pr.pos.distanceTo(p.pos);
      if (d > 9) continue;
      const rel = this.bearing(pr.pos.x, pr.pos.z) - heading - Math.PI / 2;
      const x = cx + Math.cos(rel) * 70, y = cy + Math.sin(rel) * 70;
      g.fillStyle = 'rgba(20,20,20,0.6)'; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill();
      g.strokeStyle = '#ff5040'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#ffd27a'; g.font = '700 16px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText('G', x, y + 5);
      g.save(); g.translate(cx + Math.cos(rel) * 92, cy + Math.sin(rel) * 92); g.rotate(rel + Math.PI / 2); g.fillStyle = '#ff5040'; g.beginPath(); g.moveTo(0, -7); g.lineTo(6, 4); g.lineTo(-6, 4); g.fill(); g.restore();
    }
    // feixe do designador
    const W = G.weapons;
    if (W.laserBeam > 0 && W.laserPoint) {
      const sp = W.laserPoint.clone().project(G.camera);
      if (sp.z < 1) { g.strokeStyle = `rgba(80,255,130,${G.nvg ? 0.9 : 0.25})`; g.lineWidth = G.nvg ? 2 : 1; g.beginPath(); g.moveTo(cx + 40, this.H); g.lineTo((sp.x * 0.5 + 0.5) * this.W, (-sp.y * 0.5 + 0.5) * this.H); g.stroke(); }
    }
  }
  _marker(key, cls) {
    let m = this.markers.get(key);
    if (!m) { m = document.createElement('div'); m.className = 'mk ' + cls; this.markerLayer.appendChild(m); this.markers.set(key, m); }
    m._used = true;
    return m;
  }
  _place(m, pos, clampEdge, label) {
    const G = this.G;
    const v = pos.clone().project(G.camera);
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * this.W, y = (-v.y * 0.5 + 0.5) * this.H;
    if (behind) { x = this.W - x; y = this.H - 20; }
    if (!clampEdge && (behind || x < 0 || x > this.W || y < 0 || y > this.H)) { m.style.display = 'none'; return; }
    x = clamp(x, 30, this.W - 30); y = clamp(y, 60, this.H - 60);
    m.style.display = 'block';
    m.style.transform = `translate(${x}px, ${y}px)`;
    if (label !== undefined && m._label !== label) { m.innerHTML = label; m._label = label; }
  }
  drawMarkers() {
    const G = this.G;
    for (const m of this.markers.values()) m._used = false;
    if (this.objMarker && !G.cinematic) {
      const m = this._marker('obj', 'obj');
      const d = Math.round(this.objMarker.distanceTo(G.player.pos));
      this._place(m, this.objMarker.clone().add(new THREE.Vector3(0, 1.2, 0)), true, `<i></i><b>${this.objLabel}</b><span>${d} m</span>`);
    }
    if (G.support.marksVisible()) for (const e of G.director.enemies) {
      if (e.dead || e.markedT <= 0) continue;
      const m = this._marker('e' + e.id, 'enemy');
      this._place(m, e.headPos().add(new THREE.Vector3(0, 0.5, 0)), false, '');
    }
    for (const a of G.allies.list) {
      const d = a.pos.distanceTo(G.player.pos);
      if (d > 45) continue;
      const m = this._marker('a' + a.name, 'ally');
      this._place(m, a.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), false, a.name);
      m.style.opacity = clamp(1 - d / 45, 0.3, 0.9);
    }
    for (const [k, m] of this.markers) if (!m._used) { m.remove(); this.markers.delete(k); }
  }
  // mapa completo
  drawFullMap() {
    const G = this.G, c = $('fullmap-canvas'), g = c.getContext('2d');
    const W = c.width = Math.min(innerWidth - 80, 1300), H = c.height = Math.round(W * (MAP.h / MAP.w));
    g.drawImage(this.mapImg, 0, 0, W, H);
    const s = W / MAP.w;
    const tm = (x, z) => [(x - MAP.x0) * s, (z - MAP.z0) * s];
    g.font = '700 15px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
    const labels = [['LZ', -200, 195], ['PERÍMETRO', -190, 106], ['SUBESTAÇÃO', -205, 30], ['CASA DE MÁQUINAS', -130, -36], ['CRISTA', -40, -16], ['TORRE CG', 40, -18], ['VERTEDOURO', 70, 20], ['ALOJAMENTOS', 126, 48], ['SALA DE CONTROLE', 130, -30], ['HELIPONTO', 173, -20], ['RESERVATÓRIO', 0, -70], ['VALE (−70 m)', 0, 120]];
    for (const [t, x, z] of labels) { const [px, py] = tm(x, z); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(t, px + 1, py + 1); g.fillStyle = '#d8ddd4'; g.fillText(t, px, py); }
    for (const j of G.level.jammers) { const [x, y] = tm(j.pos.x, j.pos.z); g.fillStyle = j.disabled ? '#6a7166' : '#ff4a3a'; g.fillRect(x - 5, y - 5, 10, 10); g.fillStyle = '#fff'; g.fillText('J' + j.id, x, y - 9); }
    if (this.objMarker) { const [x, y] = tm(this.objMarker.x, this.objMarker.z); g.fillStyle = '#ffd27a'; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-6, -6, 12, 12); g.restore(); }
    for (const a of G.allies.list) { const [x, y] = tm(a.pos.x, a.pos.z); g.fillStyle = '#7fe08a'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    const p = G.player; const [px, py] = tm(p.pos.x, p.pos.z);
    g.save(); g.translate(px, py); g.rotate(-p.yaw); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(-6, 7); g.lineTo(0, 3); g.lineTo(6, 7); g.fill(); g.restore();
  }
}
