// Soldado em malha 3D (gerado com Krea 2 + Trellis 2) com rig automático e animações do Kimodo.
// Mesma interface do SoldierModel procedural (ele continua como reserva se os arquivos não carregarem).
//   - T-pose → esqueleto Mixamo ajustado à malha (juntas estimadas das fatias da geometria) → pesos por distância aos ossos.
//   - Clipes do Kimodo (idle/walk/run/agachado/morte...) retargeteados em tempo real (BossAnimator) + IK dos braços na arma.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, lerp, rand } from '../core/utils.js';
import { BossAnimator, loadBossClips } from './bossanim.js';
import { solveArm, worldQ, HAND_R, HAND_L } from './ik.js';
import { loadRifleScene, makeRifleGun } from './gunmodel.js';
import { loadBossGun } from './bossmodel.js';
import { makeBeamMaterial } from '../world/level.js';

const MODEL = { enemy: 'sol_rifleman', enemy2: 'sol_rifleman2', sniper: 'sol_sniper', heavy: 'sol_heavy', shield: 'sol_shield', ally1: 'sol_ally1', ally2: 'sol_ally2' };
// altura (m), giro (π se a malha olha para -Z), arma
const CFG = {
  enemy: { h: 1.80, gun: 'rifle', tint: 0x6a6a66 }, enemy2: { h: 1.78, gun: 'rifle', tint: 0x6a6a66 },
  sniper: { h: 1.80, gun: 'sniper', tint: 0x55584c }, heavy: { h: 1.92, gun: 'lmg' }, shield: { h: 1.82, gun: 'pistol' },
  ally1: { h: 1.82, gun: 'rifle', tint: 0xc8c0a8 }, ally2: { h: 1.72, gun: 'carbine', tint: 0xc8c0a8 },
};
const NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const PARENT = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot' };

const A = { ready: false, clips: null, soldiers: {}, rifle: null, bossGun: null, camera: null, flip: {} };
export const meshSoldiers = A;

// ---------------- carregamento e preparo da malha ----------------
function prepGeometry(gltfScene, style) {
  let mesh = null;
  gltfScene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, c = CFG[style];
  const s = c.h / (bb.max.y - bb.min.y);
  const flip = A.flip[style] ? Math.PI : 0;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(s, s, s);
  if (flip) geo.rotateY(flip);
  geo.computeVertexNormals && !geo.attributes.normal && geo.computeVertexNormals();
  geo.computeBoundingBox();
  return { geo, mat: mesh.material };
}

// estima as juntas (em metros, espaço do modelo: pés em y=0, frente +Z) a partir das fatias da malha
function fitJoints(geo, H) {
  const p = geo.attributes.position, n = p.count, bb = geo.boundingBox;
  const J = {};
  // braços: média de y por faixa de |x| (só braços existem além do tronco)
  const maxX = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x));
  const pts = [];
  for (let i = 0; i < n; i++) { const x = Math.abs(p.getX(i)), y = p.getY(i); if (y > 0.5 * H && y < 0.98 * H && x > 0.25 * H) pts.push([x, y, p.getZ(i)]); }
  let a = 0.78 * H, b = 0, zc = 0;
  if (pts.length > 50) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, sz = 0;
    for (const [x, y, z] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; sz += z; }
    const m = pts.length, den = m * sxx - sx * sx;
    b = den > 1e-9 ? (m * sxy - sx * sy) / den : 0; a = (sy - b * sx) / m; zc = sz / m;
  }
  const armY = (x) => clamp(a + b * x, 0.55 * H, 0.95 * H);
  const shX = 0.115 * H, wristX = maxX * 0.86, elbX = (shX + wristX) / 2;
  // pernas: centro x de cada lado abaixo do joelho
  let lx = 0, ln = 0, rx = 0, rn = 0;
  for (let i = 0; i < n; i++) { if (p.getY(i) < 0.4 * H) { const x = p.getX(i); if (x > 0) { lx += x; ln++; } else { rx += x; rn++; } } }
  const legX = ln && rn ? (lx / ln - rx / rn) / 2 : 0.085 * H;
  const hipsY = 0.53 * H;
  J.Hips = [0, hipsY, 0];
  J.Spine = [0, 0.585 * H, 0]; J.Spine1 = [0, 0.66 * H, 0]; J.Spine2 = [0, 0.74 * H, 0];
  J.Neck = [0, 0.845 * H, 0.0]; J.Head = [0, 0.885 * H, 0.0]; J.HeadTop = [0, H, 0];
  for (const [side, sg] of [['Left', 1], ['Right', -1]]) {
    J[side + 'Shoulder'] = [sg * 0.05 * H, armY(0.1 * H) , zc * 0.2];
    J[side + 'Arm'] = [sg * shX, armY(shX), zc];
    J[side + 'ForeArm'] = [sg * elbX, armY(elbX), zc];
    J[side + 'Hand'] = [sg * wristX, armY(wristX), zc];
    J[side + 'HandTip'] = [sg * maxX, armY(maxX), zc];
    J[side + 'UpLeg'] = [sg * legX, hipsY - 0.02 * H, 0];
    J[side + 'Leg'] = [sg * legX, 0.285 * H, 0.01 * H];
    J[side + 'Foot'] = [sg * legX, 0.05 * H, 0];
    J[side + 'ToeBase'] = [sg * legX, 0.02 * H, 0.1 * H];
    J[side + 'ToeEnd'] = [sg * legX, 0.015 * H, 0.15 * H];
  }
  return J;
}

// segmentos de influência (a→b, raio) por osso
function segments(J, H) {
  const S = [];
  const add = (bone, a, b, r) => S.push({ bone, a: new THREE.Vector3(...J[a]), b: new THREE.Vector3(...J[b]), r });
  add('Hips', 'Hips', 'Spine', 0.07 * H); add('Spine', 'Spine', 'Spine1', 0.07 * H); add('Spine1', 'Spine1', 'Spine2', 0.07 * H);
  S.push({ bone: 'Spine2', a: new THREE.Vector3(...J.Spine2), b: new THREE.Vector3(...J.Neck), r: 0.08 * H });
  add('Neck', 'Neck', 'Head', 0.04 * H); add('Head', 'Head', 'HeadTop', 0.07 * H);
  for (const side of ['Left', 'Right']) {
    add(side + 'Shoulder', 'Spine2', side + 'Arm', 0.05 * H);
    add(side + 'Arm', side + 'Arm', side + 'ForeArm', 0.05 * H); add(side + 'ForeArm', side + 'ForeArm', side + 'Hand', 0.04 * H); add(side + 'Hand', side + 'Hand', side + 'HandTip', 0.035 * H);
    add(side + 'UpLeg', side + 'UpLeg', side + 'Leg', 0.07 * H); add(side + 'Leg', side + 'Leg', side + 'Foot', 0.055 * H);
    add(side + 'Foot', side + 'Foot', side + 'ToeBase', 0.04 * H); add(side + 'ToeBase', side + 'ToeBase', side + 'ToeEnd', 0.03 * H);
  }
  return S;
}
const _p = new THREE.Vector3(), _ab = new THREE.Vector3(), _ap = new THREE.Vector3();
function segDist(p, s) {
  _ab.copy(s.b).sub(s.a); _ap.copy(p).sub(s.a);
  const l2 = _ab.lengthSq(), t = l2 > 1e-9 ? clamp(_ap.dot(_ab) / l2, 0, 1) : 0;
  return _ap.sub(_ab.multiplyScalar(t)).length();
}
function skinGeometry(geo, J, H) {
  const S = segments(J, H), idx = NAMES.map((n) => n), bi = new Map(NAMES.map((n, i) => [n, i]));
  const p = geo.attributes.position, n = p.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const w = new Float32Array(S.length);
  for (let i = 0; i < n; i++) {
    _p.fromBufferAttribute(p, i);
    let tot = 0;
    for (let k = 0; k < S.length; k++) {
      let d = Math.max(0, segDist(_p, S[k]) - S[k].r * 0.35);
      // o tronco só é puxado por braços/pernas quando o vértice está de fato do lado deles
      w[k] = 1 / Math.pow(d + 0.012 * H, 4); tot += w[k];
    }
    // top 4
    const order = Array.from(w.keys()).sort((a, b) => w[b] - w[a]).slice(0, 4);
    let s4 = 0; for (const k of order) s4 += w[k];
    for (let j = 0; j < 4; j++) { const k = order[j]; si[i * 4 + j] = bi.get(S[k].bone); sw[i * 4 + j] = w[k] / s4; }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  void idx;
}

export async function loadSoldierAssets(flips = {}) {
  A.flip = flips;
  const loader = new GLTFLoader();
  const [clips, rifleScene, bossGun] = await Promise.all([loadBossClips('./assets/anims/soldier_kimodo.json'), loadRifleScene(), loadBossGun(1.15)]);
  A.clips = clips; A.rifle = rifleScene; A.bossGun = bossGun;
  const styles = Object.keys(MODEL);
  await Promise.all(styles.map(async (style) => {
    try {
      const gltf = await loader.loadAsync(`./assets/models/soldiers/${MODEL[style]}.glb`);
      const { geo, mat } = prepGeometry(gltf.scene, style);
      const H = CFG[style].h, J = fitJoints(geo, H);
      skinGeometry(geo, J, H);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.5, 0), H * 1.1);
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.metalness = Math.min(mat.metalness ?? 0, 0.3);
      A.soldiers[style] = { geo, mat, J, H };
    } catch (e) { console.warn('soldado indisponível:', style, e); }
  }));
  A.ready = Object.keys(A.soldiers).length > 0;
  return A.ready;
}
export function hasMeshSoldier(style) { return A.ready && !!A.soldiers[style] && !!A.clips; }

// ---------------- instância ----------------
export class MeshSoldier {
  constructor(scene, style, T) {
    this.isMesh = true; this.scene = scene;
    const S = A.soldiers[style]; this.S = S; this.style = style; this.T = T;
    this.root = new THREE.Group();
    // esqueleto desta instância
    this.bones = {}; const all = [];
    for (const nm of NAMES) { const b = new THREE.Bone(); b.name = 'mixamorig' + nm; this.bones[nm] = b; all.push(b); }
    for (const nm of NAMES) {
      const par = PARENT[nm], b = this.bones[nm], j = S.J[nm];
      if (!par) { b.position.set(...j); this.root.add(b); } else { const pj = S.J[par]; b.position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]); this.bones[par].add(b); }
    }
    this.root.updateMatrixWorld(true);
    this.mat = S.mat.clone();
    { const k = 0.88 + Math.random() * 0.24; this.mat.color.setRGB(k, k * (0.96 + Math.random() * 0.08), k * (0.94 + Math.random() * 0.1)); }   // variação sutil de tom entre clones
    this.fl = false; this.fr = false;
    this.mesh = new THREE.SkinnedMesh(S.geo, this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = false;
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(all);
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    // rig para o animador do Kimodo (todas as juntas em T-pose alinhadas aos eixos do modelo)
    const rest = {};
    for (const nm of NAMES) rest[nm] = { localQ: new THREE.Quaternion(), worldQ: new THREE.Quaternion() };
    const hipsRest = new THREE.Vector3(...S.J.Hips);
    this.rig = { bones: this.bones, rest, hipHeight: S.J.Hips[1], setHips: (off) => { this.bones.Hips.position.copy(hipsRest).add(off); } };
    this.anim = new BossAnimator(this.rig, A.clips);
    this.anim.play('idle', { fade: 0 });
    this.anim.cur.t = Math.random() * 3;
    // arma
    this._buildGun();
    // interface do SoldierModel
    this.hips = { position: { y: 0.95 } };
    this.hipsBase = S.J.Hips[1] * 0.97;
    this.upper = this.mesh;
    this.phase = rand(0, 6); this.crouch = 0; this.dead = false; this.deathT = 0; this.flashT = 0; this.aimPitch = 0; this.lean = 0; this.t = 0; this.clipName = 'idle';
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.flash, color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.setScalar(0.5); this.flash.visible = false; this.flash.position.copy(this.muzzleLocal);
    this.gun.add(this.flash);
    scene.add(this.root);
    this.lod = 0; this._acc = 0;
    this._hf = 0;
  }
  _buildGun() {
    const c = CFG[this.style];
    let gm = null;
    if (c.gun === 'lmg') {
      const g = A.bossGun.clone(true); g.userData.anchors = A.bossGun.userData.anchors;
      gm = { group: g, rightHome: g.userData.anchors.gripR, leftHome: g.userData.anchors.gripL, muzzleAt: g.userData.anchors.muzzle };
    } else if (c.gun === 'pistol') {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.5 });
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.2), m); slide.position.set(0, 0.03, 0.04);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.045), m); grip.position.set(0, -0.03, -0.03); grip.rotation.x = 0.2;
      g.add(slide, grip);
      gm = { group: g, rightHome: new THREE.Vector3(0, -0.02, -0.03), leftHome: null, muzzleAt: new THREE.Vector3(0, 0.03, 0.15) };
    } else {
      const len = c.gun === 'sniper' ? 1.15 : c.gun === 'carbine' ? 0.78 : 0.9;
      const r = makeRifleGun(A.rifle, { length: len, tint: c.tint ?? 0xffffff });
      // o rifle do viewmodel aponta para -Z; aqui o cano deve apontar para +Z
      const w = new THREE.Group(); r.group.rotation.y = Math.PI; w.add(r.group);
      const fl = (v) => new THREE.Vector3(-v.x, v.y, -v.z);
      gm = { group: w, rightHome: fl(r.rightHome), leftHome: fl(r.leftHome), muzzleAt: fl(r.muzzleAt) };
    }
    this.gun = gm.group; this.gm = gm;
    this.muzzleLocal = gm.muzzleAt.clone();
    this.scene.add(this.gun);   // em espaço-mundo (posicionada a cada quadro pela IK)
    this.gun.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
  }
  addShield(T) {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.06), new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.4, metalness: 0.6 }));
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.07), new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.5 })); w.position.set(0, 0.35, 0.01);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.065), new THREE.MeshStandardMaterial({ color: 0xbfbfbf, roughness: 0.6 })); t.position.set(0, -0.1, 0.01);
    g.add(s, w, t); g.position.set(-0.08, 1.05, 0.5);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.root.add(g); this.shield = g;
  }
  addFlashlight(T) {
    const len = 16;
    const geo = new THREE.ConeGeometry(Math.tan(0.28) * len, len, 16, 1, true);
    geo.translate(0, -len / 2, 0); geo.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(geo, makeBeamMaterial(0xfff2d0, 0.16)); cone.material.uniforms.uLen.value = len;
    cone.position.copy(this.muzzleLocal).add(new THREE.Vector3(0, 0.05, -0.1));
    this.gun.add(cone);
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0xfff2d0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    dot.scale.setScalar(0.32); dot.material.opacity = 0.75; dot.position.copy(cone.position).add(new THREE.Vector3(0, 0, 0.05));
    this.gun.add(dot);
    this.flashlight = { cone, dot };
  }
  addGlint(T) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0xe8f4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    s.position.set(0, 0.1, 0.1); s.scale.setScalar(1.2);
    this.gun.add(s); this.glint = s;
  }
  addStrobe(T) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0x9dffb0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    s.scale.setScalar(0.35);
    this.bones.Spine2.add(s); s.position.set(0, 0.05, -0.2);
    this.strobe = s;
  }
  muzzleFlash() { this.flash.visible = true; this.flashT = 0.05; this.flash.material.rotation = Math.random() * 6; this.flash.scale.setScalar(0.4 + Math.random() * 0.35); }
  muzzleWorld(out) { this.gun.updateWorldMatrix(true, false); return this.gun.localToWorld(out.copy(this.muzzleLocal)); }
  hitFlash() {
    this.mat.emissive.setHex(0x661111); this._hf = 0.08;
    // reação ao tiro: de vez em quando o corpo se contrai (não a cada bala, senão a animação nunca anda)
    if (!this.dead && !(this.hitT > 0) && Math.random() < 0.35) { this.hitT = 0.5; this.anim.play('hit', { loop: false, speed: 1.5, fade: 0.06, restart: true }); }
  }
  setPose(pos, yaw) { this.root.position.copy(pos); this.root.rotation.y = yaw; }
  die(dirX, dirZ, silent = false) {
    this.dead = true; this.deathT = 0;
    const local = Math.atan2(dirX, dirZ) - this.root.rotation.y;
    // tiro vindo de frente → cai para trás; de trás → cai de bruços; senão, desaba
    const f = Math.cos(local);
    const clip = silent ? 'grabbed' : f > 0.35 ? 'die2' : f < -0.35 ? 'die1' : (Math.random() < 0.5 ? 'die3' : 'die1');   // abate silencioso: cede nos braços de quem o pega
    this.anim.play(clip, { loop: false, speed: 1.1, fade: 0.1, restart: true });
    this.gunDrop = 0;
    if (this.flashlight) { this.flashlight.cone.visible = false; this.flashlight.dot.visible = false; }
    if (this.glint) this.glint.visible = false;
  }
  // speed: m/s, crouchTarget 0..1
  animate(dt, speed, crouchTarget, time) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    if (this._hf > 0) { this._hf -= dt; if (this._hf <= 0) this.mat.emissive.setHex(0x000000); }
    if (this._frozen) return;   // cadáver já assentado: não recalcula mais
    // LOD de animação: longe da câmera atualiza menos
    const cam = A.camera; let d = 0;
    if (cam) d = Math.hypot(cam.position.x - this.root.position.x, cam.position.z - this.root.position.z);
    this._acc += dt;
    const step = this.dead ? 1 : d > 90 ? 3 : d > 50 ? 2 : 1;
    this._skip = (this._skip || 0) + 1;
    if (this._skip < step && !this.dead) return;
    this._skip = 0; const dtt = this._acc; this._acc = 0;
    this.mesh.visible = (d < 260 || !cam) && this.root.visible; this.gun.visible = this.mesh.visible && !this.hideGun;
    if (!this.mesh.visible) return;
    if (this.hitT > 0) this.hitT -= dtt;
    if (this.dead) { this.deathT += dtt; }
    else if (this.hitT > 0) { this.crouch = lerp(this.crouch, crouchTarget, Math.min(1, dtt * 8)); }
    else {
      this.crouch = lerp(this.crouch, crouchTarget, Math.min(1, dtt * 8));
      // histerese: a marcha só muda quando a velocidade passa bem do limite (e fica um tempo), então não pisca entre andar/correr/parar
      this.crouchOn = this.crouchOn ? this.crouch > 0.4 : this.crouch > 0.6;
      const sp = this._spd = (this._spd ?? speed) + (speed - (this._spd ?? speed)) * Math.min(1, dtt * 6);   // velocidade suavizada (decide a marcha e a velocidade do clipe)
      const g = this._gait || (this._gait = 'idle'), c = this.crouchOn;
      let gait = g;
      if (g === 'idle') { if (sp > 0.55) gait = 'walk'; }
      else if (g === 'walk') { if (sp > 3.7) gait = 'run'; }
      else if (g === 'run') { if (sp < 2.7) gait = 'walk'; }
      this._lowT = sp < 0.25 ? (this._lowT || 0) + dtt : 0;   // parar só depois de ~0,2 s realmente parado
      if (g !== 'idle' && this._lowT > 0.2) gait = 'idle';
      this._gaitT = (this._gaitT || 0) + dtt;
      if (gait !== g && this._gaitT < 0.3) gait = g;   // tempo mínimo entre trocas
      if (gait !== g) { this._gait = gait; this._gaitT = 0; }
      const moving = this._gait !== 'idle';
      const want = c ? (moving ? 'crouch_walk' : 'crouch') : this._gait;
      const ref = want === 'run' ? 2.9 : want === 'crouch_walk' ? 1.1 : 1.48;
      this.anim.play(want, { speed: moving ? clamp(sp / ref, 0.55, 1.5) : 1, fade: 0.25 });
    }
    this.hips.position.y = this.dead ? 0.2 : this.hipsBase * (1 - this.crouch * 0.4);
    this.root.updateMatrixWorld(true);
    const off = this.anim.update(dtt);
    this.rig.setHips(off);
    this.root.updateMatrixWorld(true);
    if (!this.dead && d < 40 && this._gait !== 'idle' && this.crouch < 0.5 && A.audio) this._steps();
    if (!this.dead && d < 75) this._gunAndArms();
    else if (this.dead) { this._dropGun(dtt); if (this.anim.done && this.deathT > 4) this._frozen = true; }
  }
  _steps() {
    const b = this.bones, y0 = this.root.position.y + 0.14, p = new THREE.Vector3();
    for (const [nm, key] of [['LeftFoot', 'fl'], ['RightFoot', 'fr']]) {
      b[nm].getWorldPosition(p);
      const down = p.y < y0;
      if (down && !this[key]) A.audio.enemyStep(p, this.style === 'heavy');
      this[key] = down;
    }
  }
  _gunAndArms() {
    const b = this.bones, g = this.gun;
    const yaw = this.root.rotation.y;
    const chest = b.Spine2.getWorldPosition(new THREE.Vector3());
    const Ry = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const Rp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.aimPitch);
    const R = Ry.clone().multiply(Rp);
    const pistol = CFG[this.style].gun === 'pistol';
    const c = this.crouch;
    const mount = chest.clone().add(new THREE.Vector3(pistol ? -0.18 : -0.12, pistol ? -0.1 : -0.2 - c * 0.05, pistol ? 0.4 : 0.32).applyQuaternion(Ry));
    g.position.copy(mount);
    g.quaternion.copy(R);
    g.updateMatrixWorld(true);
    const A_ = this.gm;
    const rT = g.localToWorld(A_.rightHome.clone());
    solveArm(b.RightArm, b.RightForeArm, b.RightHand, rT, new THREE.Vector3(-1, -0.7, -0.2).applyQuaternion(Ry));
    this._hand(b.RightHand, HAND_R, g.quaternion);
    if (A_.leftHome) {
      const lT = g.localToWorld(A_.leftHome.clone());
      solveArm(b.LeftArm, b.LeftForeArm, b.LeftHand, lT, new THREE.Vector3(1, -0.6, -0.2).applyQuaternion(Ry));
      this._hand(b.LeftHand, HAND_L, g.quaternion);
    }
  }
  _hand(hb, hq, gq) {
    const q = gq.clone().multiply(hq);   // rest worldQ = identidade
    hb.quaternion.copy(worldQ(hb.parent, new THREE.Quaternion()).invert().multiply(q));
    hb.updateMatrixWorld(true);
  }
  _dropGun(dt) {
    // a arma cai junto: segue a mão direita
    const hand = this.bones.RightHand.getWorldPosition(new THREE.Vector3());
    this.gun.position.lerp(hand, Math.min(1, dt * 6));
    this.gun.rotation.x += dt * 2; this.gun.rotation.x = Math.min(this.gun.rotation.x, 1.2);
    this.gun.position.y = Math.max(this.root.position.y + 0.08, this.gun.position.y - dt * 2);
  }
  dispose(scene) { scene.remove(this.root); scene.remove(this.gun); this.mat.dispose(); }
}
