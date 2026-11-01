import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { loadBossModel, loadBossGun } from '../actors/bossmodel.js';
import { BossAnimator, loadBossClips } from '../actors/bossanim.js';
import { solveArm, worldQ, HAND_R, HAND_L } from '../actors/ik.js';

let assetsPromise;
export function loadRobotAssets() {
  if (!assetsPromise) assetsPromise = Promise.all([
    loadBossModel({ height: 5 }), loadBossClips(), loadBossGun(2.3),
  ]).then(([rig, clips, gun]) => ({ rig, clips, gun })).catch((error) => { assetsPromise = null; throw error; });
  return assetsPromise;
}

// SkeletonUtils reconnects cloned skin to cloned bones; geometry/textures remain shared,
// while every animated transform, material and setHips closure belongs to this instance.
export function cloneRobotAssets(source) {
  const model = cloneSkeleton(source.rig.model), bones = {}, rest = {};
  let mesh;
  model.traverse((o) => {
    if (o.isBone) bones[o.name.replace('mixamorig', '')] = o;
    if (o.isSkinnedMesh && !mesh) mesh = o;
    if (o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
  });
  for (const [name, pose] of Object.entries(source.rig.rest)) {
    rest[name] = Object.fromEntries(Object.entries(pose).map(([k, v]) => [k, v.clone()]));
  }
  const hipsRest = source.rig.hipsRest.clone(), target = new THREE.Vector3();
  const rig = { model, fbx: model.children[0], bones, rest, mesh, height: source.rig.height, scale: source.rig.scale, hipHeight: source.rig.hipHeight, hipsRest };
  rig.setHips = (offset) => {
    model.updateWorldMatrix(true, true);
    target.copy(hipsRest).add(offset);
    bones.Hips.position.copy(bones.Hips.parent.worldToLocal(model.localToWorld(target)));
  };
  const gun = source.gun.clone(true);
  gun.traverse((o) => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); });
  gun.userData.anchors = Object.fromEntries(Object.entries(source.gun.userData.anchors).map(([k, v]) => [k, v.clone()]));
  return { rig, gun, clips: source.clips };
}

export function poseRobotArms(rig, gun, yaw = 0) {
  const b = rig.bones, rest = rig.rest;
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  gun.updateWorldMatrix(true, true);
  for (const [side, anchor, pole, handQ] of [
    ['Right', 'gripR', new THREE.Vector3(-1, -0.6, -0.2), HAND_R],
    ['Left', 'gripL', new THREE.Vector3(1, -0.5, -0.2), HAND_L],
  ]) {
    solveArm(b[side + 'Arm'], b[side + 'ForeArm'], b[side + 'Hand'], gun.localToWorld(gun.userData.anchors[anchor].clone()), pole.applyQuaternion(turn));
    const hb = b[side + 'Hand'];
    const q = gun.getWorldQuaternion(new THREE.Quaternion()).multiply(handQ).multiply(rest[side + 'Hand'].worldQ);
    hb.quaternion.copy(worldQ(hb.parent, new THREE.Quaternion()).invert().multiply(q));
    hb.updateMatrixWorld(true);
  }
}

// Keep original forearm/hand skin and UVs. Shoulder/upper-arm armor is enormous
// on Colosso and belongs outside an eye camera, including mixed elbow triangles.
export function robotArmGeometry(mesh) {
  const original = mesh.geometry, index = original.index;
  const skin = original.attributes.skinIndex, weight = original.attributes.skinWeight;
  const armBones = new Set();
  for (const bone of mesh.skeleton.bones) {
    if (/(Left|Right)ForeArm$/.test(bone.name)) bone.traverse((o) => { if (o.isBone) armBones.add(mesh.skeleton.bones.indexOf(o)); });
  }
  const strength = (i) => {
    let total = 0;
    for (let k = 0; k < 4; k++) if (armBones.has(skin.array[i * 4 + k])) total += weight.array[i * 4 + k];
    return total;
  };
  const triangles = [], count = index ? index.count : original.attributes.position.count;
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    if (Math.min(strength(a), strength(b), strength(c)) >= 0.9) triangles.push(a, b, c);
  }
  if (!triangles.length) throw new Error('Colosso rig contains no arm skin');
  const geometry = original.clone();
  geometry.clearGroups(); geometry.setIndex(triangles);
  return geometry;
}

export function disposeRobotAssets({ rig, gun }) {
  const materials = new Set();
  for (const object of [rig.model, gun]) object.traverse((o) => {
    if (o.material) for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material);
    if (o.isSkinnedMesh) o.skeleton.dispose();
  });
  for (const material of materials) material.dispose();
  rig.model.removeFromParent(); gun.removeFromParent();
}

export class RobotView {
  static async create(G) { return new RobotView(G, cloneRobotAssets(await loadRobotAssets())); }
  constructor(G, assets) {
    this.G = G; this.assets = assets; this.rig = assets.rig; this.gun = assets.gun;
    this.scene = new THREE.Scene(); this.scene.environment = G.scene.environment;
    this.scene.environmentIntensity = 1.1;
    this.camera = new THREE.PerspectiveCamera(65, G.camera.aspect || 1, 0.12, 12);
    this.hemi = new THREE.HemisphereLight(0xcce6ff, 0x55534a, 3.2);
    this.dir = new THREE.DirectionalLight(0xffead2, 3.5); this.dir.position.set(-2, 4, 3);
    this.scene.add(this.hemi, this.dir, this.rig.model, this.gun);
    this.armGeometry = robotArmGeometry(this.rig.mesh); this.rig.mesh.geometry = this.armGeometry;
    this.rig.mesh.castShadow = false;
    this.rig.model.rotation.y = Math.PI;
    // The view scene is camera-relative. The world eye itself stays in main's movement code.
    this.rig.model.scale.setScalar(0.6);
    this.rig.model.position.y = -(G.rules?.robot?.eye ?? 4.1) * 0.6;
    this.gun.scale.setScalar(0.75);
    this.anim = new BossAnimator(this.rig, assets.clips); this.anim.play('idle', { fade: 0 });
    this.time = 0; this.recoil = 0; this.flashT = 0; this.reloadT = 0; this.lastYaw = null; this.lastPitch = null;
    this.sway = new THREE.Vector2();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.level?.T?.flash || null, color: 0xffd1a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.position.copy(this.gun.userData.anchors.muzzle); this.flash.scale.setScalar(0.65); this.gun.add(this.flash);
    this.update(0, {});
  }
  kick() { this.recoil = Math.min(1.4, this.recoil + 0.85); this.flashT = 0.055; }
  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  update(dt, { adsT = 0, speed = 0, shooting = false, reloading = false, yaw = 0, pitch = 0 } = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1); this.time += dt;
    const ads = THREE.MathUtils.clamp(adsT, 0, 1), move = Math.min(speed / 4.4, 1);
    this.recoil *= Math.exp(-12 * dt); this.flashT = Math.max(0, this.flashT - dt);
    this.flash.material.opacity = this.flashT > 0 ? 0.9 : 0;
    const turn = this.lastYaw === null ? 0 : THREE.MathUtils.euclideanModulo(yaw - this.lastYaw + Math.PI, Math.PI * 2) - Math.PI;
    const look = this.lastPitch === null ? 0 : pitch - this.lastPitch;
    this.lastYaw = yaw; this.lastPitch = pitch;
    this.sway.lerp(new THREE.Vector2(THREE.MathUtils.clamp(turn * -0.4, -0.04, 0.04), THREE.MathUtils.clamp(look * -0.3, -0.03, 0.03)), 1 - Math.exp(-14 * dt));
    this.anim.play(move > 0.12 ? 'walk' : 'idle', { speed: move > 0.12 ? 0.6 + move * 0.4 : 0.7, fade: 0.25 });
    this.rig.setHips(this.anim.update(dt));
    const bob = Math.sin(this.time * 7) * 0.018 * move * (1 - ads * 0.75);
    this.reloadT = THREE.MathUtils.damp(this.reloadT, reloading ? 1 : 0, 9, dt);
    const reload = this.reloadT * (0.22 + Math.sin(this.time * 4) * 0.035);
    // First-person framing keeps the original heavy gun readable below the aim line.
    this.gun.position.set(THREE.MathUtils.lerp(0.42, 0, ads) + this.sway.x, THREE.MathUtils.lerp(-0.92, -0.55, ads) + bob - reload + this.sway.y, -1.55 + this.recoil * 0.1);
    this.gun.rotation.set(this.recoil * -0.035 + reload * 0.5, Math.PI, reload * -0.6);
    this.rig.model.updateMatrixWorld(true); poseRobotArms(this.rig, this.gun, Math.PI);
    // Shot flashes come from authoritative kick events; holding the trigger adds only servo vibration.
    if (shooting && !reloading) this.gun.position.y += Math.sin(this.time * 90) * 0.002;
    this.scene.updateMatrixWorld(true);
  }
  dispose() {
    this.flash.removeFromParent(); this.flash.material.dispose();
    this.armGeometry.dispose(); disposeRobotAssets(this.assets); this.scene.clear();
  }
}
