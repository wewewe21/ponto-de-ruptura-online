// Animação do chefe: clipes gerados pelo Kimodo (texto→movimento, esqueleto SOMA de 30 juntas) são
// retargeteados em tempo real para o esqueleto Mixamo do robô, com camadas procedurais por cima
// (torção do tronco e cabeça independentes, IK dos braços para empunhar a arma).
import * as THREE from 'three';

const SRC_PAR = [-1, 0, 1, 2, 3, 4, 5, 6, 6, 6, 3, 10, 11, 12, 13, 13, 3, 16, 17, 18, 19, 19, 0, 22, 23, 24, 0, 26, 27, 28];
// osso Mixamo -> junta Kimodo (a rotação global da junta Kimodo define a do osso)
const MAP = { Hips: 0, Spine: 1, Spine1: 2, Spine2: 3, Neck: 5, Head: 6, LeftShoulder: 10, LeftArm: 11, LeftForeArm: 12, LeftHand: 13, RightShoulder: 16, RightArm: 17, RightForeArm: 18, RightHand: 19, LeftUpLeg: 22, LeftLeg: 23, LeftFoot: 24, LeftToeBase: 25, RightUpLeg: 26, RightLeg: 27, RightFoot: 28, RightToeBase: 29 };
const HUMAN_HIP = 0.93; // altura do quadril do esqueleto Kimodo em pé (m)
const NO_XZ = new Set(['idle', 'walk', 'run', 'aim', 'roar', 'slam', 'stomp', 'land', 'crouch', 'crouch_walk', 'look', 'throw', 'flinch', 'stagger']);

const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };

export async function loadBossClips(url = './assets/anims/boss_kimodo.json') {
  const j = await (await fetch(url)).json();
  const clips = {};
  for (const [name, c] of Object.entries(j.clips)) clips[name] = { name, frames: c.frames, fps: j.fps, rot: b64(c.rot), root: b64(c.root), dur: c.frames / j.fps, noXZ: NO_XZ.has(name) };
  return clips;
}

const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export class BossAnimator {
  constructor(rig, clips) {
    this.rig = rig; this.clips = clips;
    const { bones, rest } = rig;
    this.names = []; // ossos em ordem pai→filho
    const walk = (b) => { if (b.isBone) this.names.push(b.name.replace('mixamorig', '')); b.children.forEach(walk); };
    walk(bones.Hips);
    this.parentOf = {};
    for (const n of this.names) { const p = bones[n].parent; this.parentOf[n] = p && p.isBone ? p.name.replace('mixamorig', '') : null; }
    // rotação do nó pai do Hips (armadura) no espaço-modelo
    this.armQ = rest.Hips.worldQ.clone().multiply(rest.Hips.localQ.clone().invert());
    this.cur = { clip: null, t: 0, speed: 1, loop: true, done: false };
    this.fromActive = false; this.fade = 0; this.fadeT = 0;   // transição: parte da pose que estava na tela (nunca dá salto)
    this.poseQ = Array.from({ length: 30 }, () => new THREE.Quaternion()); this.fromQ = Array.from({ length: 30 }, () => new THREE.Quaternion());
    this.poseRoot = null; this.fromRoot = null;
    this.srcQ = Array.from({ length: 30 }, () => new THREE.Quaternion());
    this.srcQ2 = Array.from({ length: 30 }, () => new THREE.Quaternion());
    this.G = Array.from({ length: 30 }, () => new THREE.Quaternion());
    this.wq = {}; this.acc = {};
    for (const n of this.names) { this.wq[n] = new THREE.Quaternion(); this.acc[n] = new THREE.Quaternion(); }
    this.extra = {};          // delta de rotação (espaço-modelo) por osso; propaga para os descendentes
    this.hipsOffset = new THREE.Vector3();
    this.rootRatio = rig.hipHeight / HUMAN_HIP;
    this.onEvent = null;      // (clip, t0, t1, wrapped)
  }
  play(name, { loop = true, speed = 1, fade = 0.25, restart = false } = {}) {
    const clip = this.clips[name];
    if (!clip) return;
    if (this.cur.clip === clip && !restart && this.cur.loop === loop) { this.cur.speed = speed; return; }
    // congela a pose JÁ MISTURADA que está na tela como ponto de partida: trocar de clipe de novo no meio de uma transição continua suave
    this.fromActive = !!(this.poseRoot && fade > 0);
    if (this.fromActive) { for (let j = 0; j < 30; j++) this.fromQ[j].copy(this.poseQ[j]); this.fromRoot = this.poseRoot.slice(); }
    this.cur = { clip, t: 0, speed, loop, done: false };
    this.fade = fade; this.fadeT = 0;
  }
  get name() { return this.cur.clip ? this.cur.clip.name : null; }
  get done() { return this.cur.done; }
  get time01() { return this.cur.clip ? this.cur.t / this.cur.clip.dur : 0; }
  _loopLen(c) { return Math.min(0.2, c.dur * 0.25); }
  // clipes em laço: no fim, mistura com o começo (a volta do laço recomeça já nesse ponto), então não há estalo ao reiniciar
  _sample(st, out) {
    const c = st.clip; let r = this._sampleAt(c, st.t, out);
    const L = st.loop ? this._loopLen(c) : 0;
    if (L > 0 && st.t > c.dur - L) {
      const t2 = st.t - (c.dur - L), w = t2 / L, e = w * w * (3 - 2 * w), r2 = this._sampleAt(c, t2, this.srcQ2);
      for (let j = 0; j < 30; j++) out[j].slerp(this.srcQ2[j], e);
      r = [r[0] + (r2[0] - r[0]) * e, r[1] + (r2[1] - r[1]) * e, r[2] + (r2[2] - r[2]) * e, r[3]];
    }
    return r;
  }
  _sampleAt(c, t, out) {
    const f = Math.min(c.frames - 1.0001, Math.max(0, t * c.fps));
    const i = Math.floor(f), k = f - i, a = i * 120, b = Math.min(c.frames - 1, i + 1) * 120;
    for (let j = 0; j < 30; j++) {
      _qa.set(c.rot[a + j * 4], c.rot[a + j * 4 + 1], c.rot[a + j * 4 + 2], c.rot[a + j * 4 + 3]);
      _qb.set(c.rot[b + j * 4], c.rot[b + j * 4 + 1], c.rot[b + j * 4 + 2], c.rot[b + j * 4 + 3]);
      out[j].copy(_qa).slerp(_qb, k);
    }
    const ra = i * 3, rb = Math.min(c.frames - 1, i + 1) * 3;
    const L = (o) => c.root[ra + o] + (c.root[rb + o] - c.root[ra + o]) * k;
    return [L(0) - c.root[0], L(1), L(2) - c.root[2], c.noXZ];
  }
  _advance(st, dt, notify) {
    const c = st.clip; if (!c) return;
    const t0 = st.t; st.t += dt * st.speed;
    let wrapped = false;
    if (st.loop) { if (st.t >= c.dur) { const period = c.dur - this._loopLen(c); st.t = this._loopLen(c) + (st.t - c.dur) % period; wrapped = true; } }
    else if (st.t >= c.dur - 1 / c.fps) { st.t = c.dur - 1 / c.fps; st.done = true; }
    if (notify && this.onEvent) this.onEvent(c.name, t0 / c.dur, st.t / c.dur, wrapped);
  }
  // avalia a pose e escreve as rotações dos ossos; devolve o deslocamento do quadril (espaço-modelo, m)
  update(dt) {
    const { bones, rest } = this.rig;
    this._advance(this.cur, dt, true);
    let root = this._sample(this.cur, this.srcQ);
    if (this.fromActive && this.fade > 0) {
      this.fadeT += dt;
      const w = Math.min(1, this.fadeT / this.fade), e = w * w * (3 - 2 * w), r2 = this.fromRoot;
      for (let j = 0; j < 30; j++) { _qa.copy(this.fromQ[j]).slerp(this.srcQ[j], e); this.srcQ[j].copy(_qa); }
      root = [r2[0] + (root[0] - r2[0]) * e, r2[1] + (root[1] - r2[1]) * e, r2[2] + (root[2] - r2[2]) * e, root[3] && r2[3]];
      if (w >= 1) { this.fromActive = false; this.fade = 0; }
    }
    for (let j = 0; j < 30; j++) this.poseQ[j].copy(this.srcQ[j]); this.poseRoot = root.slice();   // pose final desta rodada (base da próxima transição)
    for (let j = 0; j < 30; j++) { if (SRC_PAR[j] < 0) this.G[j].copy(this.srcQ[j]); else this.G[j].copy(this.G[SRC_PAR[j]]).multiply(this.srcQ[j]); }
    for (const n of this.names) {
      const par = this.parentOf[n], own = this.extra[n];
      if (par) this.acc[n].copy(this.acc[par]); else this.acc[n].identity();
      if (own) this.acc[n].multiply(own);
    }
    for (const n of this.names) {
      const par = this.parentOf[n], pw = par ? this.wq[par] : this.armQ;
      const src = MAP[n];
      if (src !== undefined) this.wq[n].copy(this.acc[n]).multiply(this.G[src]).multiply(rest[n].worldQ);
      else this.wq[n].copy(pw).multiply(rest[n].localQ);
      bones[n].quaternion.copy(_q.copy(pw).invert().multiply(this.wq[n]));
    }
    const r = this.rootRatio;
    const dy = (root[1] - HUMAN_HIP) * r;
    this.hipsOffset.set(root[3] ? 0 : root[0] * r, dy, root[3] ? 0 : root[2] * r);
    return this.hipsOffset;
  }
}
