// Modelo procedural de soldado (cores por vértice, 5 malhas por soldado) + animação + hitboxes.
import * as THREE from 'three';
import { clamp, lerp, rand } from '../core/utils.js';
import { makeBeamMaterial } from '../world/level.js';
import { MeshSoldier, hasMeshSoldier } from './meshsoldier.js';
let flashlightBeam = null;

const STYLES = {
  enemy: { uniform: 0x2b2d2a, uniform2: 0x3a3b33, vest: 0x1f2120, skin: 0x8a6a55, head: 'balaclava', helmet: 0x1c1d1c, band: 0x8a1c14, gun: 'rifle', gear: 0x2a2620 },
  enemy2: { uniform: 0x3b3a30, uniform2: 0x2d2c25, vest: 0x2a2a22, skin: 0x7a5a45, head: 'cap', helmet: 0x26261f, band: 0x8a1c14, gun: 'rifle', gear: 0x332e25 },
  sniper: { uniform: 0x2a2e24, uniform2: 0x353a2c, vest: 0x22261d, skin: 0x7a5a45, head: 'hood', helmet: 0x2a2e24, band: 0x8a1c14, gun: 'sniper', gear: 0x2a2e24 },
  heavy: { uniform: 0x2a2a2a, uniform2: 0x202020, vest: 0x161616, skin: 0x555555, head: 'visor', helmet: 0x111111, band: 0x8a1c14, gun: 'lmg', gear: 0x1a1a1a, bulky: true },
  shield: { uniform: 0x2e2f2b, uniform2: 0x262722, vest: 0x1d1e1c, skin: 0x8a6a55, head: 'helmet', helmet: 0x1c1d1c, band: 0x8a1c14, gun: 'pistol', gear: 0x262622 },
  ally1: { uniform: 0x5a5440, uniform2: 0x4a4636, vest: 0x3d3a2c, skin: 0x8f6c55, head: 'helmetNvg', helmet: 0x4b4838, band: 0x2f3a24, gun: 'rifle', gear: 0x3a3829 },
  ally2: { uniform: 0x4c5440, uniform2: 0x3f4636, vest: 0x34392b, skin: 0xb08a70, head: 'helmetNvg', helmet: 0x464c38, band: 0x2f3a24, gun: 'carbine', gear: 0x343a29 },
};

const cache = new Map();
function addBox(arr, w, h, d, x, y, z, color, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const shade = 0.9 + Math.random() * 0.15; col[i * 3] = c.r * shade; col[i * 3 + 1] = c.g * shade; col[i * 3 + 2] = c.b * shade; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  arr.push(g.toNonIndexed ? g.toNonIndexed() : g);
}
function merge(arr) {
  let n = 0;
  for (const g of arr) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of arr) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.computeBoundingSphere();
  return m;
}
function buildGeometry(styleName) {
  if (cache.has(styleName)) return cache.get(styleName);
  const S = STYLES[styleName];
  const b = S.bulky ? 1.18 : 1;
  const up = [];
  // tronco (origem nos quadris, frente = +Z)
  addBox(up, 0.36 * b, 0.22, 0.22 * b, 0, 0.05, 0, S.uniform2);
  addBox(up, 0.4 * b, 0.42, 0.24 * b, 0, 0.36, 0, S.uniform);
  addBox(up, 0.44 * b, 0.36, 0.3 * b, 0, 0.38, 0.01, S.vest);
  for (const x of [-0.13, 0, 0.13]) addBox(up, 0.1, 0.12, 0.06, x * b, 0.3, 0.17 * b, S.gear);
  addBox(up, 0.3 * b, 0.34, 0.14, 0, 0.36, -0.2 * b, S.gear);
  addBox(up, 0.06, 0.06, 0.32, -0.15, 0.6, 0, S.band);
  // cabeça
  addBox(up, 0.11, 0.08, 0.11, 0, 0.6, 0, S.skin);
  const hy = 0.72;
  if (S.head === 'balaclava') { addBox(up, 0.2, 0.24, 0.22, 0, hy, 0.01, 0x151515); addBox(up, 0.16, 0.05, 0.02, 0, hy + 0.03, 0.12, S.skin); }
  else if (S.head === 'cap') { addBox(up, 0.19, 0.22, 0.21, 0, hy, 0.01, S.skin); addBox(up, 0.21, 0.07, 0.23, 0, hy + 0.12, 0.0, 0x222420); addBox(up, 0.18, 0.02, 0.1, 0, hy + 0.09, 0.15, 0x222420); }
  else if (S.head === 'hood') { addBox(up, 0.23, 0.27, 0.25, 0, hy + 0.01, -0.01, S.uniform); addBox(up, 0.15, 0.1, 0.02, 0, hy, 0.12, 0x101010); }
  else if (S.head === 'visor') { addBox(up, 0.26, 0.3, 0.27, 0, hy + 0.02, 0, S.helmet); addBox(up, 0.22, 0.12, 0.03, 0, hy + 0.01, 0.14, 0x0d1520); }
  else {
    addBox(up, 0.19, 0.22, 0.21, 0, hy, 0.01, S.head === 'helmet' ? 0x151515 : S.skin);
    addBox(up, 0.25, 0.13, 0.26, 0, hy + 0.12, -0.005, S.helmet);
    if (S.head === 'helmetNvg') { addBox(up, 0.06, 0.06, 0.08, 0, hy + 0.1, 0.16, 0x1a1a1a); addBox(up, 0.1, 0.05, 0.08, 0, hy + 0.04, 0.18, 0x1a1a1a); }
  }
  // braços em pose de mira
  addBox(up, 0.11, 0.3, 0.11, -0.25 * b, 0.42, 0.08, S.uniform, -0.9);
  addBox(up, 0.1, 0.28, 0.1, -0.17, 0.33, 0.33, S.uniform, -1.4);
  addBox(up, 0.11, 0.3, 0.11, 0.25 * b, 0.42, 0.05, S.uniform, -0.6);
  addBox(up, 0.1, 0.26, 0.1, 0.16, 0.3, 0.24, S.uniform, -1.2);
  addBox(up, 0.08, 0.08, 0.1, -0.08, 0.3, 0.46, 0x161616);
  addBox(up, 0.08, 0.08, 0.1, 0.12, 0.26, 0.32, 0x161616);
  // arma
  const gx = 0.06, gy = 0.33;
  if (S.gun === 'pistol') { addBox(up, 0.04, 0.12, 0.2, 0.12, gy - 0.02, 0.4, 0x111111); }
  else {
    const len = S.gun === 'sniper' ? 1.15 : S.gun === 'lmg' ? 1.05 : S.gun === 'carbine' ? 0.78 : 0.88;
    addBox(up, 0.06, 0.1, len, gx, gy, 0.22 + len / 2 - 0.25, 0x141414);
    addBox(up, 0.04, 0.16, 0.06, gx, gy - 0.1, 0.25, 0x141414);
    addBox(up, 0.05, 0.08, 0.22, gx, gy, -0.08, 0x141414);
    if (S.gun === 'lmg') addBox(up, 0.14, 0.14, 0.14, gx, gy - 0.12, 0.35, 0x2a2a20);
    else addBox(up, 0.05, 0.18, 0.08, gx, gy - 0.12, 0.38, 0x141414);
    if (S.gun === 'sniper') addBox(up, 0.06, 0.06, 0.28, gx, gy + 0.09, 0.3, 0x0a0a0a);
    if (S.gun === 'carbine') addBox(up, 0.05, 0.05, 0.18, gx, gy, 0.22 + len - 0.2, 0x0a0a0a);
  }
  const upper = merge(up);
  const thigh = [], shin = [];
  addBox(thigh, 0.16 * b, 0.46, 0.17 * b, 0, -0.23, 0, S.uniform2);
  addBox(thigh, 0.1, 0.12, 0.05, 0.06, -0.2, 0.09, S.gear);
  addBox(shin, 0.14 * b, 0.42, 0.15 * b, 0, -0.21, 0, S.uniform2);
  addBox(shin, 0.15 * b, 0.1, 0.24, 0, -0.43, 0.04, 0x161512);
  addBox(shin, 0.16, 0.12, 0.17, 0, -0.02, 0.03, S.gear);
  const r = { upper, thigh: merge(thigh), shin: merge(shin) };
  cache.set(styleName, r);
  return r;
}

const matCache = new Map();
function soldierMat(flash = false) {
  const k = flash ? 'f' : 'n';
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, emissive: flash ? 0x661111 : 0x000000 }));
  return matCache.get(k);
}

export class SoldierModel {
  constructor(scene, style, T) {
    const geo = buildGeometry(style);
    this.style = style;
    this.root = new THREE.Group();
    this.hips = new THREE.Group(); this.hips.position.y = 0.95;
    this.root.add(this.hips);
    this.upper = new THREE.Mesh(geo.upper, soldierMat());
    this.hips.add(this.upper);
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(0.1 * side, 0, 0);
      const th = new THREE.Mesh(geo.thigh, soldierMat()); hip.add(th);
      const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee);
      const sh = new THREE.Mesh(geo.shin, soldierMat()); knee.add(sh);
      this.hips.add(hip);
      this.legs.push({ hip, knee, side });
    }
    this.root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    // flash do cano
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flash, color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.6); this.flash.visible = false;
    this.flash.position.set(0.06, 0.34, style === 'heavy' ? 1.0 : 0.95);
    this.hips.add(this.flash);
    this.phase = rand(0, 6);
    this.crouch = 0;
    this.dead = false; this.deathT = 0; this.fallDir = 1;
    this.flashT = 0;
    this.aimPitch = 0;
    this.lean = 0;
    scene.add(this.root);
  }
  addShield(T) {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.06), new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.4, metalness: 0.6 }));
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.07), new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.5 }));
    w.position.set(0, 0.35, 0.01);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.065), new THREE.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 0.6 }));
    t.position.set(0, -0.1, 0.01);
    g.add(s, w, t); g.position.set(-0.08, 0.15, 0.5);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.hips.add(g);
    this.shield = g;
  }
  addFlashlight(T) {
    const len = 16;
    const geo = new THREE.ConeGeometry(Math.tan(0.28) * len, len, 16, 1, true);
    geo.translate(0, -len / 2, 0); geo.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(geo, flashlightBeam || (flashlightBeam = makeBeamMaterial(0xfff2d0, 0.16)));
    cone.material.uniforms.uLen.value = len;
    cone.position.set(0.06, 0.4, 0.75);
    this.hips.add(cone);
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0xfff2d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    dot.scale.setScalar(0.32); dot.material.opacity = 0.75; dot.position.set(0.06, 0.4, 0.78);
    this.hips.add(dot);
    this.flashlight = { cone, dot };
  }
  addGlint(T) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0xe8f4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    s.position.set(0.06, 0.43, 0.42);
    s.scale.setScalar(1.2);
    this.hips.add(s);
    this.glint = s;
  }
  addStrobe(T) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0x9dffb0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    s.position.set(0, 0.92, -0.05); s.scale.setScalar(0.35);
    this.hips.add(s);
    this.strobe = s;
  }
  muzzleFlash() { this.flash.visible = true; this.flashT = 0.05; this.flash.material.rotation = Math.random() * 6; this.flash.scale.setScalar(0.45 + Math.random() * 0.4); }
  muzzleWorld(out) { return this.flash.getWorldPosition(out); }
  hitFlash() { this.upper.material = soldierMat(true); this._hf = 0.08; }
  setPose(pos, yaw) { this.root.position.copy(pos); this.root.rotation.y = yaw; }
  die(dirX, dirZ) {
    this.dead = true; this.deathT = 0;
    // cair na direção do impacto
    const local = Math.atan2(dirX, dirZ) - this.root.rotation.y;
    this.fallSide = Math.sin(local) * 0.6;
    this.fallDir = Math.cos(local) >= 0 ? 1 : -1;
    if (this.flashlight) { this.flashlight.cone.visible = false; this.flashlight.dot.visible = false; }
    if (this.glint) this.glint.visible = false;
  }
  // speed: m/s, crouch 0..1, aim: arma levantada
  animate(dt, speed, crouchTarget, time) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    if (this._hf > 0) { this._hf -= dt; if (this._hf <= 0) this.upper.material = soldierMat(false); }
    if (this.dead) {
      this.deathT += dt;
      const t = clamp(this.deathT / 0.55, 0, 1);
      const e = t * t;
      this.root.rotation.x = this.fallDir * -e * 1.45;
      this.root.rotation.z = this.fallSide * e;
      this.hips.position.y = lerp(0.95 - this.crouch * 0.35, 0.18, e);
      for (const L of this.legs) { L.hip.rotation.x = lerp(L.hip.rotation.x, -0.3, t); L.knee.rotation.x = lerp(L.knee.rotation.x, 0.6, t); }
      this.upper.rotation.x = lerp(this.upper.rotation.x, 0.3, t);
      return;
    }
    this.crouch = lerp(this.crouch, crouchTarget, Math.min(1, dt * 8));
    const c = this.crouch;
    const moving = Math.min(1, speed / 1.5);
    this.phase += dt * (speed > 0.1 ? 2.2 + speed * 1.6 : 0);
    const amp = (0.25 + Math.min(speed, 5) * 0.09) * moving;
    this.hips.position.y = 0.95 - c * 0.38 + Math.abs(Math.sin(this.phase)) * 0.04 * moving;
    for (const L of this.legs) {
      const p = this.phase + (L.side > 0 ? Math.PI : 0);
      const sw = Math.sin(p) * amp;
      L.hip.rotation.x = -sw - c * 1.15;
      L.knee.rotation.x = Math.max(0, -Math.cos(p)) * amp * 1.6 + c * 1.7;
    }
    this.upper.rotation.x = -this.aimPitch * 0.8 + c * 0.15 + Math.sin(this.phase * 2) * 0.02 * moving;
    this.upper.rotation.z = this.lean;
    this.upper.rotation.y = Math.sin(this.phase) * 0.06 * moving;
  }
  dispose(scene) {
    scene.remove(this.root);
  }
}
export { STYLES };

// escolhe o modelo: malha 3D gerada (com animações do Kimodo) quando carregada; senão o procedural
export function createSoldier(scene, style, T) { return hasMeshSoldier(style) ? new MeshSoldier(scene, style, T) : new SoldierModel(scene, style, T); }
