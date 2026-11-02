// Braços em primeira pessoa (FPS Arms.fbx → assets/models/fps_arms.glb, 51 ossos com dedos) nas poses feitas à mão no Blender
// (assets/poses/fps_poses.json, uma por arma: ver tools/blender/*). Só quem joga vê estes braços; os outros jogadores
// continuam vendo o modelo 3D do soldado (actors/meshsoldier.js).
//
// Como funciona: para cada osso, a pose do Blender vira uma transformação rígida D = (pose no mundo) · (repouso no mundo)⁻¹, no espaço do viewmodel.
// Quando a arma se mexe (balanço, mira, recarga...), mão e dedos acompanham a arma como um corpo rígido (D' = ΔArma · D) e o
// braço/antebraço são resolvidos por IK de dois ossos entre o ombro (fixo) e o pulso, preservando a torção da pose original.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const san = (n) => THREE.PropertyBinding.sanitizeNodeName(n);
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const POSE_KEY = { KR7: 'SD9' };    // armas que compartilham a pose

function aboutPoint(q, p, out) {          // rotação q em torno do ponto p
  out.makeRotationFromQuaternion(q);
  _v.copy(p).applyMatrix4(out).sub(p).negate();        // t = p - R p
  out.setPosition(_v);
  return out;
}

export class FPSArms {
  static async create(scene) {
    const [gltf, poses] = await Promise.all([new GLTFLoader().loadAsync('./assets/models/fps_arms.glb'), fetch('./assets/poses/fps_poses.json').then((r) => { if (!r.ok) throw new Error('poses'); return r.json(); })]);
    return new FPSArms(scene, gltf.scene, poses);
  }
  constructor(scene, model, poses) {
    this.root = new THREE.Group(); this.root.add(model); scene.add(this.root);
    this.bones = {}; this.meshes = [];
    model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh) { o.frustumCulled = false; o.castShadow = false; this.meshes.push(o); for (const m of [].concat(o.material)) { m.envMapIntensity = 0.5; m.roughness = Math.max(m.roughness ?? 0.7, 0.7); m.metalness = 0; } }
    });
    this.root.updateMatrixWorld(true);
    // nomes do Blender -> osso do GLB
    this.names = poses.bones.map((b) => b.name);
    this.parentOf = Object.fromEntries(poses.bones.map((b) => [b.name, b.parent]));
    this.node = Object.fromEntries(this.names.map((n) => [n, this.bones[san(n)] || null]));
    this.restModel = {}; this.parentModel = {};
    for (const n of this.names) {
      const b = this.node[n]; if (!b) continue;
      this.restModel[n] = b.matrixWorld.clone();
      this.parentModel[n] = b.parent && !b.parent.isBone ? b.parent.matrixWorld.clone() : null;
    }
    // transformação do espaço do modelo para o espaço do viewmodel: só translação (a mesma para todos os ossos)
    const rest = (n) => new THREE.Matrix4().fromArray(poses.rest[n]);
    this.restVm = Object.fromEntries(this.names.map((n) => [n, rest(n)]));
    const probe = ['Arm_1.L', 'Arm_1.R', 'Hand_1.L', 'Hand_1.R'].filter((n) => this.node[n]);
    const t0 = new THREE.Vector3();
    const offs = probe.map((n) => new THREE.Vector3().setFromMatrixPosition(this.restVm[n]).sub(new THREE.Vector3().setFromMatrixPosition(this.restModel[n])));
    for (const o of offs) t0.add(o); t0.multiplyScalar(1 / Math.max(1, offs.length));
    this.placeErr = Math.max(0, ...offs.map((o) => o.distanceTo(t0)));
    this.P = new THREE.Matrix4().makeTranslation(t0.x, t0.y, t0.z); this.Pi = this.P.clone().invert();
    this.root.matrix.copy(this.P); this.root.matrixAutoUpdate = false; this.root.matrixWorldNeedsUpdate = true;
    // dados por arma
    this.poses = {};
    for (const [id, w] of Object.entries(poses.weapons)) {
      const gun = new THREE.Matrix4().fromArray(w.gun);
      const D = {}, Wp = {};
      for (const n of this.names) { Wp[n] = new THREE.Matrix4().fromArray(w.pose[n]); D[n] = Wp[n].clone().multiply(this.restVm[n].clone().invert()); }
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3(); gun.decompose(pos, quat, sc);
      this.poses[id] = { gun, gunInv: gun.clone().invert(), pos, quat, euler: new THREE.Euler().setFromQuaternion(quat, 'XYZ'), D, Wp };
    }
    this.visible = true;
    this._W = {}; this._D = {};
  }
  hasPose(id) { return !!this.poses[POSE_KEY[id] || id]; }
  basePose(id) { return this.poses[POSE_KEY[id] || id]; }
  setVisible(v) { this.root.visible = v; this.visible = v; }
  // gunMatrix: matriz do mundo (espaço do viewmodel) do grupo da arma; opts: { leftDelta: Vector3 (no espaço da arma), leftStatic, leftTarget: Vector3 (viewmodel) }
  update(gunMatrix, id, opts = {}) {
    const P = this.basePose(id); if (!P || !this.visible) return;
    const dG = new THREE.Matrix4().multiplyMatrices(gunMatrix, P.gunInv);       // ΔArma
    const D = this._D;
    for (const n of this.names) D[n] = P.D[n];                                   // começa na pose do Blender
    for (const side of ['L', 'R']) {
      const dS = side === 'L' ? this._leftDelta(dG, gunMatrix, P, opts) : dG;
      const S = _pos(P.Wp['Arm_1.' + side]), Ep = _pos(P.Wp['Arm_2.' + side]), Wp = _pos(P.Wp['Hand_1.' + side]);
      const l1 = S.distanceTo(Ep), l2 = Ep.distanceTo(Wp);
      const target = Wp.clone().applyMatrix4(dS);
      // cotovelo: ponto a l1 do ombro e l2 do alvo, no semiplano da pose original
      const hint = Ep.clone().sub(S); const u0 = Wp.clone().sub(S).normalize(); hint.addScaledVector(u0, -hint.dot(u0)).normalize();
      const axisV = target.clone().sub(S); const dist = THREE.MathUtils.clamp(axisV.length(), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002); axisV.normalize();
      const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const pd = hint.clone().addScaledVector(axisV, -hint.dot(axisV)); if (pd.lengthSq() < 1e-6) pd.set(0, -1, 0); pd.normalize();
      const E = S.clone().addScaledVector(axisV, a).addScaledVector(pd, h);
      const wristNew = S.clone().addScaledVector(axisV, dist);
      // braço: gira em torno do ombro até o novo cotovelo; antebraço: gira em torno do cotovelo até o pulso
      const q1 = new THREE.Quaternion().setFromUnitVectors(Ep.clone().sub(S).normalize(), E.clone().sub(S).normalize());
      const M1 = aboutPoint(q1, S, new THREE.Matrix4());
      const W1 = Wp.clone().applyMatrix4(M1);
      const q2 = new THREE.Quaternion().setFromUnitVectors(W1.clone().sub(E).normalize(), wristNew.clone().sub(E).normalize());
      const M2 = aboutPoint(q2, E, new THREE.Matrix4());
      D['Arm_1.' + side] = new THREE.Matrix4().multiplyMatrices(M1, P.D['Arm_1.' + side]);
      D['Arm_2.' + side] = new THREE.Matrix4().multiplyMatrices(M2, new THREE.Matrix4().multiplyMatrices(M1, P.D['Arm_2.' + side]));
      // mão e dedos: rígidos com a arma (com o pequeno ajuste se o IK não alcançou)
      const fix = new THREE.Matrix4().makeTranslation(wristNew.x - target.x, wristNew.y - target.y, wristNew.z - target.z);
      const hd = new THREE.Matrix4().multiplyMatrices(fix, dS);
      for (const n of this.names) if (n.endsWith('.' + side) && /^(Hand_|Finger_)/.test(n)) D[n] = new THREE.Matrix4().multiplyMatrices(hd, P.D[n]);
    }
    this._apply(D);
  }
  _leftDelta(dG, gunMatrix, P, opts) {
    if (opts.leftTarget) { const Wp = _pos(P.Wp['Hand_1.L']); return new THREE.Matrix4().makeTranslation(opts.leftTarget.x - Wp.x, opts.leftTarget.y - Wp.y, opts.leftTarget.z - Wp.z); }
    if (opts.leftStatic) { const e = opts.leftExtra; return e ? new THREE.Matrix4().makeTranslation(e.x, e.y, e.z) : new THREE.Matrix4(); }
    if (opts.leftDelta && opts.leftDelta.lengthSq() > 1e-8) {
      // translação no espaço da arma aplicada sobre a pose: G_agora · T(delta) · G_pose⁻¹
      const T = new THREE.Matrix4().makeTranslation(opts.leftDelta.x, opts.leftDelta.y, opts.leftDelta.z);
      return new THREE.Matrix4().multiplyMatrices(gunMatrix, T).multiply(P.gunInv);
    }
    return dG;
  }
  _apply(D) {
    // espaço do modelo: mundo desejado = P⁻¹ · D · P · repouso
    const W = this._W;
    for (const n of this.names) {
      const b = this.node[n]; if (!b) continue;
      _m.multiplyMatrices(this.Pi, D[n]).multiply(this.P);
      W[n] = new THREE.Matrix4().multiplyMatrices(_m, this.restModel[n]);
      const par = this.parentOf[n];
      const parentW = par && W[par] ? W[par] : (this.parentModel[n] || _m2.identity());
      b.matrix.copy(_m2.copy(parentW).invert().multiply(W[n]));
      b.matrixAutoUpdate = false; b.matrixWorldNeedsUpdate = true;
    }
    this.root.updateMatrixWorld(true);
  }
}

function _pos(m) { return new THREE.Vector3().setFromMatrixPosition(m); }
