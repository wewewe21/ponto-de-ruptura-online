// Armas em primeira pessoa (modelos procedurais) + animação procedural: sway, bob, ADS, coice,
// corrida, recarga com troca de pente, troca de arma, faca, granada.
import * as THREE from 'three';
import { clamp, lerp, damp, smoothstep } from '../core/utils.js';
import { loadRifleScene, makeRifleGun } from './gunmodel.js';
import { FPArms } from './fparms.js';

const C = {
  poly: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.62, metalness: 0.15 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.38, metalness: 0.7 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x7a6a50, roughness: 0.7, metalness: 0.1 }),
  od: new THREE.MeshStandardMaterial({ color: 0x3d4232, roughness: 0.7, metalness: 0.1 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.85 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4f4a38, roughness: 0.9 }),
  watch: new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.4, emissive: 0x06140e, emissiveIntensity: 0.4 }),
  dot: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  lens: new THREE.MeshStandardMaterial({ color: 0x0a1520, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.45 }),
  brass: new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: 0.35, metalness: 0.8 }),
  green: new THREE.MeshBasicMaterial({ color: 0x3dff7a }),
  blade: new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.25, metalness: 0.9 }),
};
function box(parent, w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  parent.add(m); return m;
}
function cylZ(parent, r, len, x, y, z, mat, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); parent.add(m); return m;
}

function buildGun(id, T) {
  const g = new THREE.Group();
  const out = { group: g, sight: new THREE.Vector3(0, 0.09, 0), muzzle: new THREE.Object3D(), mag: null, extra: {} };
  const F = id === 'SD9' ? C.tan : C.poly;
  if (id === 'SD9' || id === 'KR7') {
    box(g, 0.058, 0.085, 0.3, 0, 0, 0, F);
    box(g, 0.048, 0.02, 0.38, 0, 0.052, -0.04, C.metal);
    const hgLen = id === 'SD9' ? 0.22 : 0.28;
    box(g, 0.066, 0.072, hgLen, 0, 0.005, -0.15 - hgLen / 2, F);
    for (let i = 0; i < 4; i++) box(g, 0.068, 0.012, 0.03, 0, 0.0, -0.18 - i * 0.05, C.metal);
    cylZ(g, 0.011, 0.2, 0, 0.005, -0.15 - hgLen - 0.08, C.metal);
    if (id === 'SD9') { cylZ(g, 0.021, 0.2, 0, 0.005, -0.15 - hgLen - 0.24, C.metal, 16); out.muzzle.position.set(0, 0.005, -0.15 - hgLen - 0.35); }
    else { cylZ(g, 0.017, 0.05, 0, 0.005, -0.15 - hgLen - 0.2, C.metal); out.muzzle.position.set(0, 0.005, -0.15 - hgLen - 0.24); }
    out.mag = new THREE.Group();
    box(out.mag, 0.042, 0.17, 0.075, 0, -0.085, 0, id === 'SD9' ? C.poly : C.metal, 0.18);
    out.mag.position.set(0, -0.04, -0.07); g.add(out.mag);
    box(g, 0.038, 0.1, 0.05, 0, -0.085, 0.09, C.poly, -0.35);
    box(g, 0.045, 0.075, 0.2, 0, -0.012, 0.26, F);
    box(g, 0.05, 0.1, 0.04, 0, -0.03, 0.36, C.poly);
    box(g, 0.012, 0.02, 0.05, 0.035, 0.03, 0.05, C.metal);
    // mira
    if (id === 'SD9') {
      box(g, 0.05, 0.045, 0.075, 0, 0.085, -0.03, C.poly);
      box(g, 0.05, 0.004, 0.06, 0, 0.11, -0.05, C.poly);
      box(g, 0.004, 0.035, 0.06, -0.024, 0.093, -0.05, C.poly); box(g, 0.004, 0.035, 0.06, 0.024, 0.093, -0.05, C.poly);
      out.sight.set(0, 0.093, -0.05);
    } else {
      cylZ(g, 0.02, 0.05, 0, 0.088, -0.02, C.poly, 14);
      box(g, 0.024, 0.02, 0.04, 0, 0.065, -0.02, C.metal);
      out.sight.set(0, 0.088, -0.02);
    }
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.016, 16), C.lens); lens.position.copy(out.sight).add(new THREE.Vector3(0, 0, -0.02)); g.add(lens);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 8), C.dot); dot.position.copy(out.sight).add(new THREE.Vector3(0, 0, -0.05)); g.add(dot);
    out.extra.dot = dot;
    // lanterna IR / laser
    box(g, 0.025, 0.025, 0.06, 0.042, 0.01, -0.22, C.poly);
  } else if (id === 'VK12') {
    box(g, 0.06, 0.09, 0.36, 0, 0, 0, C.od);
    box(g, 0.068, 0.075, 0.32, 0, 0.005, -0.34, C.od);
    cylZ(g, 0.013, 0.32, 0, 0.005, -0.66, C.metal);
    cylZ(g, 0.02, 0.06, 0, 0.005, -0.84, C.metal);
    out.muzzle.position.set(0, 0.005, -0.88);
    cylZ(g, 0.024, 0.32, 0, 0.1, -0.05, C.poly, 16);
    cylZ(g, 0.032, 0.06, 0, 0.1, -0.22, C.poly, 16);
    cylZ(g, 0.03, 0.05, 0, 0.1, 0.12, C.poly, 16);
    box(g, 0.02, 0.05, 0.03, 0, 0.065, -0.08, C.metal); box(g, 0.02, 0.05, 0.03, 0, 0.065, 0.05, C.metal);
    out.sight.set(0, 0.1, 0.12);
    out.mag = new THREE.Group(); box(out.mag, 0.045, 0.1, 0.08, 0, -0.05, 0, C.metal); out.mag.position.set(0, -0.04, -0.06); g.add(out.mag);
    box(g, 0.04, 0.1, 0.05, 0, -0.085, 0.1, C.poly, -0.35);
    box(g, 0.05, 0.1, 0.26, 0, -0.01, 0.3, C.od);
  } else if (id === 'BRK8') {
    box(g, 0.06, 0.08, 0.26, 0, 0, 0, C.metal);
    cylZ(g, 0.016, 0.52, 0, 0.022, -0.39, C.metal);
    cylZ(g, 0.014, 0.42, 0, -0.022, -0.33, C.metal);
    out.muzzle.position.set(0, 0.022, -0.66);
    const pump = box(g, 0.055, 0.05, 0.18, 0, -0.025, -0.28, C.poly);
    out.extra.pump = pump;
    box(g, 0.04, 0.1, 0.05, 0, -0.08, 0.09, C.poly, -0.35);
    box(g, 0.05, 0.08, 0.24, 0, -0.02, 0.26, C.poly);
    box(g, 0.006, 0.02, 0.01, 0, 0.05, -0.6, C.metal);
    box(g, 0.03, 0.025, 0.012, 0, 0.052, 0.08, C.metal);
    out.sight.set(0, 0.058, 0.08);
    out.mag = new THREE.Group(); box(out.mag, 0.02, 0.02, 0.06, 0, 0, 0, new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.5 })); out.mag.position.set(0.02, -0.05, 0.0); g.add(out.mag);
    out.mag.visible = false;
  } else if (id === 'P19') {
    const slide = box(g, 0.03, 0.032, 0.19, 0, 0.02, -0.04, C.metal);
    out.extra.slide = slide;
    box(g, 0.028, 0.03, 0.15, 0, -0.008, -0.05, C.poly);
    box(g, 0.03, 0.11, 0.05, 0, -0.07, 0.03, C.poly, -0.25);
    box(g, 0.004, 0.012, 0.008, 0, 0.042, -0.125, C.metal);
    box(g, 0.02, 0.01, 0.008, 0, 0.042, 0.045, C.metal);
    out.sight.set(0, 0.046, 0.045);
    out.muzzle.position.set(0, 0.02, -0.145);
    out.mag = new THREE.Group(); box(out.mag, 0.025, 0.1, 0.04, 0, -0.05, 0, C.metal, -0.25); out.mag.position.set(0, -0.03, 0.03); g.add(out.mag);
  } else if (id === 'RPL2') {
    cylZ(g, 0.045, 1.0, 0, 0, -0.15, C.od, 16);
    cylZ(g, 0.055, 0.12, 0, 0, 0.33, C.poly, 16);
    box(g, 0.035, 0.1, 0.05, 0, -0.08, 0.05, C.poly, -0.3);
    box(g, 0.03, 0.08, 0.04, 0, -0.07, -0.2, C.poly);
    box(g, 0.03, 0.05, 0.06, -0.06, 0.055, -0.1, C.poly);
    box(g, 0.005, 0.02, 0.005, -0.06, 0.088, -0.12, C.metal);
    out.sight.set(-0.06, 0.088, -0.05);
    const war = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 12), C.od);
    war.rotation.x = -Math.PI / 2; war.position.set(0, 0, -0.76); g.add(war);
    out.extra.warhead = war;
    out.muzzle.position.set(0, 0, -0.7);
    out.mag = new THREE.Group(); g.add(out.mag);
  } else if (id === 'LASER') {
    box(g, 0.08, 0.09, 0.2, 0, 0, -0.05, C.od);
    cylZ(g, 0.03, 0.05, 0.015, 0.0, -0.17, C.poly, 16);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), C.green); lens.position.set(0.015, 0, -0.196); lens.rotation.y = Math.PI; g.add(lens);
    box(g, 0.035, 0.1, 0.05, 0, -0.09, 0.03, C.poly, -0.2);
    box(g, 0.03, 0.03, 0.06, -0.01, 0.06, 0.02, C.poly);
    out.sight.set(-0.01, 0.075, 0.03);
    out.muzzle.position.set(0.015, 0, -0.2);
    out.mag = new THREE.Group(); g.add(out.mag);
  }
  g.add(out.muzzle);
  // flash do cano
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flash, color: 0xffd090, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  fl.scale.setScalar(0.22); fl.visible = false;
  out.muzzle.add(fl);
  out.flash = fl;
  g.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  return out;
}

function buildArms(isPistol) {
  const L = new THREE.Group(), R = new THREE.Group();
  box(R, 0.065, 0.075, 0.1, 0, -0.06, 0.08, C.glove, -0.3);
  box(R, 0.085, 0.085, 0.42, 0.03, -0.11, 0.33, C.sleeve, -0.25);
  box(L, 0.06, 0.06, 0.11, 0, -0.035, 0, C.glove, 0, 0, 0.3);
  box(L, 0.085, 0.085, 0.42, -0.06, -0.12, 0.22, C.sleeve, -0.3, 0.25);
  box(L, 0.07, 0.03, 0.05, -0.04, -0.06, 0.07, C.watch, -0.3, 0.25);
  return { L, R };
}

export class ViewModel {
  constructor(T) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0x8899aa, 0x222222, 0.6);
    this.dir = new THREE.DirectionalLight(0xc8d4ff, 0.5); this.dir.position.set(0.5, 1, 0.3);
    this.flashL = new THREE.PointLight(0xffb060, 0, 3, 2); this.flashL.position.set(0.1, -0.05, -0.8);
    this.scene.add(this.hemi, this.dir, this.flashL);
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.guns = {};
    this.T = T;
    for (const id of ['SD9', 'KR7', 'VK12', 'BRK8', 'P19', 'RPL2', 'LASER']) this._install(id, buildGun(id, T));
    // faca
    this.knife = new THREE.Group();
    box(this.knife, 0.02, 0.03, 0.12, 0, 0, 0.06, C.poly);
    box(this.knife, 0.006, 0.03, 0.17, 0, 0.005, -0.08, C.blade);
    const ka = buildArms(false); ka.R.position.set(0, 0, 0.1); this.knife.add(ka.R);
    this.knife.visible = false;
    this.scene.add(this.knife);
    // granada na mão
    this.nade = new THREE.Group();
    const nb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), C.od); this.nade.add(nb);
    const nh = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.02), C.metal); nh.position.set(0.02, 0.03, 0); this.nade.add(nh);
    const na = buildArms(false); na.L.position.set(0, -0.03, 0.04); this.nade.add(na.L);
    this.nade.visible = false;
    this.scene.add(this.nade);
    this.current = null;
    // estado de animação
    this.s = { sx: 0, sy: 0, bob: 0, kickZ: 0, kickR: 0, kickY: 0, land: 0, swayX: 0, swayY: 0 };
    this.v = new THREE.Vector3(); this.e = new THREE.Euler();
  }
  // Monta braços/mão esquerda no gun e o registra no rig (substitui o anterior, se houver).
  _install(id, gm) {
    const arms = buildArms(id === 'P19');
    gm.group.add(arms.R);
    if (gm.rightHome) arms.R.position.set(0, gm.rightHome.y + 0.06, gm.rightHome.z - 0.08);
    else arms.R.position.set(0, 0, id === 'P19' ? 0.03 : id === 'RPL2' ? 0.05 : 0.09);
    if (!gm.leftHome) gm.leftHome = id === 'P19' ? new THREE.Vector3(-0.015, -0.06, 0.02) : id === 'RPL2' ? new THREE.Vector3(0, -0.06, -0.2) : id === 'LASER' ? new THREE.Vector3(-0.05, -0.04, -0.08) : new THREE.Vector3(0, -0.035, id === 'VK12' ? -0.34 : -0.25);
    arms.L.position.copy(gm.leftHome);
    gm.group.add(arms.L);
    gm.arms = arms;
    // âncoras da mão direita para os braços 3D (espaço da arma)
    gm.fpR = gm.rightHome ? gm.rightHome.clone() : new THREE.Vector3(0, { VK12: -0.07, P19: -0.05, RPL2: -0.06, LASER: -0.06 }[id] ?? -0.07, { VK12: 0.12, P19: 0.03, RPL2: 0.06, LASER: 0.03 }[id] ?? 0.1);
    const old = this.guns[id];
    if (old) this.rig.remove(old.group);
    gm.group.visible = old ? old.group.visible : false;
    this.rig.add(gm.group);
    this.guns[id] = gm;
    if (this.currentId === id) this.current = gm;
  }
  // Troca os fuzis procedurais pelo modelo GLB (se falhar, mantém os procedurais).
  async useRifleModel() {
    try {
      const src = await loadRifleScene();
      for (const [id, opt] of [['SD9', { length: 0.78 }], ['KR7', { length: 0.84, tint: 0xb8b4a8 }]]) {
        const gm = makeRifleGun(src, opt);
        const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.flash, color: 0xffd090, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        fl.scale.setScalar(0.22); fl.visible = false; gm.muzzle.add(fl); gm.flash = fl;
        this._install(id, gm);
      }
      return true;
    } catch (e) { console.warn('Modelo do rifle indisponível, usando o procedural:', e); return false; }
  }
  // braços em malha 3D (depois que os soldados carregam); mantém os de caixa se falhar
  useFPArms() { try { this.fp = FPArms.create(this.scene, 'ally1'); return !!this.fp; } catch (e) { console.warn('Braços 3D indisponíveis', e); this.fp = null; return false; } }
  set(id) {
    for (const k in this.guns) this.guns[k].group.visible = k === id;
    this.current = this.guns[id];
    this.currentId = id;
  }
  kick(power = 1) {
    this.s.kickZ += 0.045 * power; this.s.kickR += 0.06 * power; this.s.kickY += (Math.random() - 0.5) * 0.02 * power;
    const g = this.current;
    if (g) { g.flash.visible = true; g.flash.material.rotation = Math.random() * 6; g.flash.scale.setScalar((0.16 + Math.random() * 0.12) * (this.currentId === 'SD9' ? 0.4 : 1)); this.flashT = 0.04; }
    this.flashL.intensity = this.currentId === 'SD9' ? 0.6 : 3;
  }
  aspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
  // st: estado vindo do controlador de armas
  update(dt, st) {
    const S = this.s, g = this.current;
    if (!g) return;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { g.flash.visible = false; this.flashL.intensity = 0; } }
    S.kickZ = damp(S.kickZ, 0, 14, dt); S.kickR = damp(S.kickR, 0, 12, dt); S.kickY = damp(S.kickY, 0, 10, dt);
    S.swayX = damp(S.swayX, clamp(-st.mouseDX * 0.0006, -0.04, 0.04), 8, dt);
    S.swayY = damp(S.swayY, clamp(st.mouseDY * 0.0006, -0.04, 0.04), 8, dt);
    S.land = damp(S.land, 0, 6, dt);
    const ads = st.adsT, sp = st.sprintT * (1 - ads);
    const moveAmt = clamp(st.speed / 4.2, 0, 1.6) * (st.onGround ? 1 : 0.2);
    S.bob += dt * (st.speed > 0.2 ? 6 + st.speed * 0.9 : 1.2);
    const bobA = (st.speed > 0.2 ? 0.012 : 0.002) * (1 - ads * 0.85) * (0.6 + moveAmt * 0.5) * (1 + sp * 1.2);
    const bx = Math.sin(S.bob) * bobA, by = Math.abs(Math.cos(S.bob)) * bobA * 0.8;
    // posições base
    const hip = st.id === 'P19' ? [0.13, -0.135, -0.3] : st.id === 'RPL2' ? [0.17, -0.12, -0.25] : st.id === 'LASER' ? [0.14, -0.15, -0.33] : [0.16, -0.175, -0.4];
    const adsDist = st.id === 'P19' ? 0.3 : st.id === 'VK12' ? 0.22 : st.id === 'RPL2' ? 0.2 : 0.3;
    const adsPos = [-g.sight.x, -g.sight.y, -adsDist - g.sight.z];
    let px = lerp(hip[0], adsPos[0], ads), py = lerp(hip[1], adsPos[1], ads), pz = lerp(hip[2], adsPos[2], ads);
    let rx = 0, ry = 0, rz = 0;
    // agachado: arma levemente inclinada
    rz += st.crouch * 0.04 * (1 - ads);
    // corrida
    px += sp * -0.06; py += sp * -0.05; pz += sp * 0.04; ry += sp * 0.75; rx += sp * -0.3; rz += sp * 0.25;
    // sway / bob / coice / pouso
    px += bx + S.swayX * (1 - ads * 0.7); py += by + S.swayY * (1 - ads * 0.7) - S.land;
    pz += S.kickZ * (1 - ads * 0.5); rx += S.kickR * (1 - ads * 0.4); py += S.kickR * 0.02 * ads; px += S.kickY;
    ry += S.swayX * 2; rx += S.swayY * 2;
    // inclinação (lean)
    rz += st.lean * -0.12;
    // respiração
    py += Math.sin(st.time * 1.6) * 0.002 * (1 - ads * 0.6);
    // recarga
    const L = g.arms.L;
    L.position.copy(g.leftHome);
    if (g.mag) { g.mag.visible = st.id !== 'BRK8'; }
    if (g.extra.warhead) g.extra.warhead.visible = st.loaded !== false;
    if (st.reload) {
      const t = st.reload.t, empty = st.reload.empty;
      if (st.id === 'BRK8') {
        const tilt = smoothstep(0, 0.1, t) * (1 - smoothstep(0.92, 1, t));
        rz += tilt * 0.5; rx += tilt * 0.25; py -= tilt * 0.03; px -= tilt * 0.02;
        const k = st.reload.shellPhase || 0;
        L.position.set(g.leftHome.x + 0.03 * tilt, g.leftHome.y - 0.08 * tilt + Math.sin(k * Math.PI) * 0.06, 0.05 * tilt + g.leftHome.z * (1 - tilt));
        g.mag.visible = tilt > 0.3; g.mag.position.set(0.02, -0.05 - Math.sin(k * Math.PI) * 0.03, 0.02);
      } else if (st.id === 'RPL2') {
        const d = Math.sin(clamp(t, 0, 1) * Math.PI);
        py -= d * 0.25; rx -= d * 0.6;
      } else {
        const tilt = smoothstep(0, 0.15, t) * (1 - smoothstep(0.85, 1, t));
        rz += tilt * 0.45; rx += tilt * 0.18; py -= tilt * 0.02;
        const out = smoothstep(0.12, 0.32, t), back = smoothstep(0.42, 0.62, t);
        const magDrop = out * (1 - back);
        const handToMag = smoothstep(0.08, 0.2, t) * (1 - smoothstep(0.6, 0.72, t));
        if (g.setMagDrop) { g.setMagDrop(magDrop); L.position.lerp(g.magHand(magDrop), handToMag); }
        else {
          if (g.mag) { g.mag.position.y = (st.id === 'P19' ? -0.03 : -0.04) - magDrop * 0.28; g.mag.rotation.x = magDrop * 0.4; }
          if (g.mag) L.position.lerp(new THREE.Vector3(g.mag.position.x - 0.01, g.mag.position.y - 0.1, g.mag.position.z), handToMag);
        }
        if (empty) {
          const b = smoothstep(0.7, 0.78, t) * (1 - smoothstep(0.8, 0.9, t));
          rz += b * 0.25; px -= b * 0.02;
          if (g.extra.slide) g.extra.slide.position.z = -0.04 + b * 0.04;
        }
      }
    }
    if (!st.reload && g.setMagDrop) g.setMagDrop(0);
    if (g.extra.pump) g.extra.pump.position.z = -0.28 + (st.pumpT || 0) * 0.08;
    if (g.extra.slide && !st.reload) g.extra.slide.position.z = -0.04 + (st.slideT || 0) * 0.04;
    // troca de arma
    if (st.swap) { const d = st.swap; py -= d * 0.32; rx -= d * 0.8; }
    // faca
    if (st.melee > 0) {
      const t = 1 - st.melee;
      py -= 0.25 * Math.sin(t * Math.PI); px += 0.08 * Math.sin(t * Math.PI);
      this.knife.visible = true;
      const th = Math.sin(clamp(t * 1.3, 0, 1) * Math.PI);
      this.knife.position.set(0.12 - th * 0.08, -0.12 + th * 0.04, -0.3 - th * 0.25);
      this.knife.rotation.set(-0.2 + th * 0.4, 0.4 - th * 0.3, -0.6 + th * 0.4);
    } else this.knife.visible = false;
    // granada
    if (st.grenade > 0) {
      const t = st.grenade;
      this.nade.visible = st.grenadeHold || t < 0.35;
      const wind = st.grenadeHold ? 1 : smoothstep(0.6, 0.0, t);
      this.nade.position.set(-0.14, -0.16 + wind * 0.1, -0.32 + (1 - wind) * -0.25);
      this.nade.rotation.set(0, 0, 0.3);
      py -= 0.12 * Math.min(1, t * 3);
    } else this.nade.visible = false;
    // visibilidade (luneta esconde arma)
    g.group.visible = !(st.scoped);
    this.rig.position.set(0, 0, 0);
    g.group.position.set(px, py, pz);
    g.group.rotation.set(rx, ry, rz);
    if (g.extra.dot) g.extra.dot.visible = ads > 0.6;
    if (this.fp) {
      const useFP = !(st.melee > 0) && !(st.grenade > 0) && g.group.visible;
      this.fp.setVisible(useFP);
      g.arms.L.visible = g.arms.R.visible = !useFP;
      if (useFP) this.fp.update(g.group, { rightHome: g.fpR, leftHome: g.leftHome }, g.arms.L.position);
    }
  }
  land(v) { this.s.land += Math.min(0.06, v * 0.006); }
  muzzleCam(out) { const g = this.current; if (!g) return out.set(0.15, -0.1, -0.8); g.muzzle.updateWorldMatrix(true, false); return g.muzzle.getWorldPosition(out); }
}
