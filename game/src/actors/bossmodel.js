// Modelo do chefe (robô gigante): carrega o FBX rigado no Mixamo, SEPARA a cabeça do corpo
// (reponderação da pele + pivô no centro do capacete) e normaliza escala/pés. Também prepara a arma.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const BOSS_URL = './assets/models/robot_rigged.fbx';
export const BOSS_GLB_URL = './assets/models/robot_rigged.glb';   // versão compacta (8 MB) do FBX; o FBX continua como reserva
export const BOSS_GUN_URL = './assets/models/boss_gun.glb';

// Região do capacete no espaço original do FBX (unidades do arquivo, robô ≈ 75 de altura, olhando para +Z).
const HEAD = { center: [0, 12.8, 50.5], radii: [4.4, 4.2, 4.5], inner: 0.8, outer: 1.1, pivot: [0, 12.2, 50.4] };

// Todos os vértices dentro do elipsoide passam a seguir 100% o osso Head; a borda faz transição suave.
// O que o Mixamo já pesava na cabeça (aro superior/antena) continua com ela.
function separateHead(mesh, bones) {
  const g = mesh.geometry, n = g.attributes.position.count;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  mesh.updateMatrixWorld(true); mesh.skeleton.update();
  const sk = mesh.skeleton.bones;
  const H = sk.indexOf(bones.Head), N = sk.indexOf(bones.Neck);
  const v = new THREE.Vector3(), c = HEAD.center, r = HEAD.radii;
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    const d = Math.hypot((v.x - c[0]) / r[0], (v.y - c[1]) / r[1], (v.z - c[2]) / r[2]);
    let t = 1 - Math.min(1, Math.max(0, (d - HEAD.inner) / (HEAD.outer - HEAD.inner)));
    if (t <= 0) continue;
    t = t * t * (3 - 2 * t);
    const idx = [], wt = []; let oldH = 0, rest = 0;
    for (let k = 0; k < 4; k++) {
      const b = si.array[i * 4 + k], w = sw.array[i * 4 + k];
      if (w <= 0) continue;
      if (b === H) oldH += w; else { idx.push(b); wt.push(w); rest += w; }
    }
    const head = Math.max(oldH, t), left = 1 - head;
    const out = [[H, head]];
    if (rest > 1e-5) {
      const order = idx.map((b, j) => [b, wt[j]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const s = order.reduce((a, x) => a + x[1], 0);
      for (const [b, w] of order) out.push([b, left * w / s]);
    } else if (left > 1e-5) out.push([N, left]);
    for (let k = 0; k < 4; k++) { si.array[i * 4 + k] = out[k] ? out[k][0] : 0; sw.array[i * 4 + k] = out[k] ? out[k][1] : 0; }
  }
  si.needsUpdate = true; sw.needsUpdate = true;
  // pivô da cabeça: do osso (atrás do pescoço) para o centro do capacete, mantendo a pele idêntica em repouso
  const root = bones.Hips.parent; root.updateMatrixWorld(true);
  const sub = []; bones.Head.traverse((b) => { if (b.isBone && sk.includes(b)) sub.push(b); });
  const oldW = sub.map((b) => b.matrixWorld.clone());
  bones.Head.position.copy(bones.Head.parent.worldToLocal(new THREE.Vector3(...HEAD.pivot)));
  root.updateMatrixWorld(true);
  sub.forEach((b, i) => { const k = sk.indexOf(b); mesh.skeleton.boneInverses[k].premultiply(b.matrixWorld.clone().invert().multiply(oldW[i])); });
}

export async function loadBossModel({ height = 5.0 } = {}) {
  let fbx;
  try { fbx = (await new GLTFLoader().loadAsync(BOSS_GLB_URL)).scene; } catch (e) { fbx = await new FBXLoader().loadAsync(BOSS_URL); }
  let mesh = null; const bones = {};
  fbx.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; if (o.isBone) bones[o.name.replace('mixamorig', '')] = o; });
  fbx.updateMatrixWorld(true);
  separateHead(mesh, bones);
  // material PBR com a textura original
  const old = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (old.map) old.map.colorSpace = THREE.SRGBColorSpace;
  mesh.material = new THREE.MeshStandardMaterial({ map: old.map, roughness: 0.72, metalness: 0.3, envMapIntensity: 0.8 });
  mesh.frustumCulled = false; mesh.castShadow = true;
  // repouso (T-pose) no espaço do FBX, antes de escalar
  fbx.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const hipsP = bones.Hips.getWorldPosition(new THREE.Vector3());
  const k = height / (box.max.y - box.min.y);
  const rest = {};
  for (const name in bones) {
    const b = bones[name];
    rest[name] = { localQ: b.quaternion.clone(), localP: b.position.clone(), worldQ: b.getWorldQuaternion(new THREE.Quaternion()) };
  }
  const feetOffset = new THREE.Vector3(-hipsP.x * k, -box.min.y * k, -hipsP.z * k);
  fbx.scale.setScalar(k); fbx.position.copy(feetOffset);
  const model = new THREE.Group(); model.add(fbx);
  model.updateMatrixWorld(true);
  const hipsModel = bones.Hips.getWorldPosition(new THREE.Vector3());
  const tmp = new THREE.Vector3();
  const rig = { model, fbx, mesh, bones, rest, scale: k, hipsRest: hipsModel, hipHeight: hipsModel.y, height };
  // posiciona o quadril em espaço-modelo (metros) = repouso + deslocamento da animação
  rig.setHips = (off) => { model.updateMatrixWorld(true); tmp.copy(hipsModel).add(off); bones.Hips.position.copy(bones.Hips.parent.worldToLocal(model.localToWorld(tmp))); };
  return rig;
}

// Arma do chefe (GLB) — cano em +X no arquivo; devolve grupo com cano em +Z e posições úteis (em metros).
export async function loadBossGun(length = 2.3) {
  const gltf = await new GLTFLoader().loadAsync(BOSS_GUN_URL);
  const g = new THREE.Group(), inner = gltf.scene;
  inner.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; if (o.material) { o.material.metalness = 0.35; o.material.roughness = 0.7; } } });
  inner.scale.setScalar(length); inner.rotation.y = -Math.PI / 2; // cano: +X do arquivo -> +Z
  g.add(inner);
  // âncoras (metros, +Z = cano): mão direita no punho, esquerda sob o guarda-mão, boca do cano
  const L = length;
  g.userData.anchors = { gripR: new THREE.Vector3(0, 0.085 * L, -0.315 * L), gripL: new THREE.Vector3(0, 0.1 * L, 0.075 * L), muzzle: new THREE.Vector3(0, 0.18 * L, 0.52 * L) };
  g.userData.length = L;
  return g;
}
