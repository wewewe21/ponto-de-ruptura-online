// Carrega o modelo GLB do fuzil e o prepara para o viewmodel: orientação (cano em -Z), escala,
// pivô no centro do receptor e o carregador separado (para a animação de recarga).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const RIFLE_URL = './assets/models/rifle.glb';

// Medidas do modelo original (unidades do arquivo): cano em -X, coronha em +X, base do carregador em y=0.
const SRC = {
  center: new THREE.Vector3(0.05, 0.27, 0),   // centro do receptor na linha do cano
  muzzleX: -0.5, sightX: 0.1, sightY: 0.355, gripX: 0.2, gripY: 0.14, handguardX: -0.22, handguardY: 0.2,
  mag: { x0: -0.07, x1: 0.09, y1: 0.2 },      // região (centro do triângulo) que forma o carregador
};

function splitMesh(mesh, inRegion) {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const idx = g.index ? g.index.array : null;
  const triCount = (idx ? idx.length : pos.count) / 3;
  const a = { p: [], n: [], u: [] }, b = { p: [], n: [], u: [] };
  const vi = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k);
  for (let t = 0; t < triCount; t++) {
    let cx = 0, cy = 0;
    for (let k = 0; k < 3; k++) { const i = vi(t, k); cx += pos.getX(i); cy += pos.getY(i); }
    const dst = inRegion(cx / 3, cy / 3) ? a : b;
    for (let k = 0; k < 3; k++) {
      const i = vi(t, k);
      dst.p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (nor) dst.n.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      if (uv) dst.u.push(uv.getX(i), uv.getY(i));
    }
  }
  const make = (d) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
    if (d.n.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3));
    if (d.u.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.u, 2));
    const m = new THREE.Mesh(geo, mesh.material); m.frustumCulled = false; return m;
  };
  return { mag: make(a), body: make(b) };
}

let loading = null;
export function loadRifleScene(url = RIFLE_URL) {
  if (!loading) loading = new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene);
  return loading;
}

// Monta um "gun" compatível com buildGun(): { group, sight, muzzle, mag, extra, leftHome, rightHome }.
// scale = comprimento total desejado em metros; tint multiplica a cor do material (variações de arma).
export function makeRifleGun(src, { length = 0.85, tint = 0xffffff } = {}) {
  const s = length / 1.0;
  const root = new THREE.Group();
  const pivot = new THREE.Group(); pivot.rotation.y = -Math.PI / 2; pivot.scale.setScalar(s); root.add(pivot);
  const holder = new THREE.Group(); holder.position.set(-SRC.center.x, -SRC.center.y, 0); pivot.add(holder);
  const body = new THREE.Group(); holder.add(body);
  const mat0 = (() => { let m = null; src.traverse((o) => { if (o.isMesh && !m) m = o; }); return m; })();
  const mat = mat0.material.clone(); mat.color.multiply(new THREE.Color(tint)); mat.metalness = 0.25; mat.roughness = 0.65;
  mat0.updateWorldMatrix(true, false);
  const geoSrc = new THREE.Mesh(mat0.geometry, mat);
  const { mag, body: rest } = splitMesh(geoSrc, (x, y) => x > SRC.mag.x0 && x < SRC.mag.x1 && y < SRC.mag.y1);
  body.add(rest);
  // o carregador gira em torno do topo (encaixe) — o pivô fica na altura da abertura do carregador
  const magPivot = new THREE.Group(); magPivot.position.set(0.02, SRC.mag.y1, 0); holder.add(magPivot);
  mag.position.set(-0.02, -SRC.mag.y1, 0); magPivot.add(mag);
  const toGun = (x, y) => new THREE.Vector3(0, (y - SRC.center.y) * s, (x - SRC.center.x) * s);
  const out = {
    group: root, muzzle: new THREE.Object3D(), mag: magPivot, extra: { isModel: true },
    sight: toGun(SRC.sightX, SRC.sightY),
    muzzleAt: toGun(SRC.muzzleX - 0.02, SRC.center.y),
    rightHome: toGun(SRC.gripX, SRC.gripY),
    leftHome: toGun(SRC.handguardX, SRC.handguardY - 0.05),
    magRest: magPivot.position.clone(),
  };
  out.setMagDrop = (d) => { magPivot.position.y = out.magRest.y - d * 0.3; magPivot.rotation.z = d * 0.35; };
  const magBase = toGun(SRC.center.x, 0.06);
  out.magHand = (d) => new THREE.Vector3(magBase.x, magBase.y - d * 0.28 * s, magBase.z);
  out.muzzle.position.copy(out.muzzleAt);
  root.add(out.muzzle);
  root.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  return out;
}
