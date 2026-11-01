// Modelos 3D do cenário (árvores, arbustos, pedras, props) gerados com Krea 2 + Trellis 2.
// Cada GLB vira { geo, mat } normalizado (base em y=0, centrado em xz, altura em metros) e é instanciado em blocos
// espaciais (InstancedMesh por célula → o frustum culling funciona por célula).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// altura-alvo (m) por modelo; w = em vez da altura, a maior dimensão horizontal
const SPEC = {
  tree_pine1: { h: 12 }, tree_pine2: { h: 10 }, tree_dead: { h: 8 }, tree_bush: { h: 1.3 }, rock_big: { h: 1.6 },
  prop_crate: { h: 1.4 }, prop_barrel: { h: 1.0 }, prop_sandbags: { h: 1.2 }, prop_barrier: { h: 1.1 }, prop_generator: { h: 1.5 },
  prop_floodlight: { h: 3.6 }, prop_transformer: { h: 3.6 }, prop_ammo: { h: 0.6 }, prop_tent: { h: 2.6 }, prop_container: { h: 2.6 },
  heli: { len: 15, dir: 'veh' }, truck: { len: 5.2, dir: 'veh' }, truck_cargo: { len: 7.6, dir: 'veh' },
};

// Folhas com faces duplicadas e opostas podem ter normais zeradas (NaN no shader e halos no bloom).
// Repara só os vértices afetados com a normal de uma face válida, preservando o restante do modelo.
function repairTreeNormals(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, idx = geo.index;
  if (!n) return;
  const invalid = new Set();
  for (let i = 0; i < n.count; i++) {
    if (!(n.getX(i) ** 2 + n.getY(i) ** 2 + n.getZ(i) ** 2 > 1e-12)) invalid.add(i);
  }
  if (!invalid.size) return;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0, count = idx ? idx.count : p.count; i < count && invalid.size; i += 3) {
    const ids = [0, 1, 2].map((k) => idx ? idx.getX(i + k) : i + k);
    if (!ids.some((j) => invalid.has(j))) continue;
    a.fromBufferAttribute(p, ids[0]); b.fromBufferAttribute(p, ids[1]); c.fromBufferAttribute(p, ids[2]);
    b.sub(a).cross(c.sub(a));
    if (!(b.lengthSq() > 1e-12)) continue;
    b.normalize();
    for (const j of ids) if (invalid.has(j)) { n.setXYZ(j, b.x, b.y, b.z); invalid.delete(j); }
  }
  n.needsUpdate = true;
}

export async function loadEnvModels() {
  const loader = new GLTFLoader();
  const E = {};
  await Promise.all(Object.keys(SPEC).map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`./assets/models/${SPEC[name].dir || 'env'}/${name}.glb`);
      let mesh = null; gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      mesh.updateWorldMatrix(true, false);
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (name.startsWith('tree_')) repairTreeNormals(geo);
      geo.computeBoundingBox();
      const bb = geo.boundingBox, sz0 = bb.getSize(new THREE.Vector3()), s = SPEC[name].len ? SPEC[name].len / Math.max(sz0.x, sz0.y, sz0.z) : SPEC[name].h / sz0.y;
      geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      geo.scale(s, s, s);
      if (name === 'heli') geo.rotateY(Math.PI);          // gerado com o nariz em +Z; no jogo o nariz do heli é -Z
      if (name === 'truck') geo.rotateY(Math.PI / 2);     // gerado com o nariz em -X; no jogo a frente é +Z
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      const mat = mesh.material;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.metalness = Math.min(mat.metalness ?? 0, name.startsWith('tree_') || name.startsWith('rock_') ? 0 : 0.5);
      if (name.startsWith('tree_') || name.startsWith('rock_')) mat.roughness = Math.max(mat.roughness ?? 0.9, 0.85);
      mat.envMapIntensity = 0.6;
      E[name] = { geo, mat, size: geo.boundingBox.getSize(new THREE.Vector3()) };
      if (name === 'heli') {
        // separa o rotor principal (mastro + pás) da fuselagem para poder girá-lo
        const cut = geo.boundingBox.max.y * 0.74, p = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal, idx = geo.index ? geo.index.array : null;
        const tris = (idx ? idx.length : p.count) / 3, vi = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k);
        const A = { p: [], n: [], u: [] }, B = { p: [], n: [], u: [] };
        for (let t = 0; t < tris; t++) {
          let cy = 0; for (let k = 0; k < 3; k++) cy += p.getY(vi(t, k)); cy /= 3;
          const d = cy > cut ? A : B;
          for (let k = 0; k < 3; k++) { const i = vi(t, k); d.p.push(p.getX(i), p.getY(i), p.getZ(i)); if (nor) d.n.push(nor.getX(i), nor.getY(i), nor.getZ(i)); if (uv) d.u.push(uv.getX(i), uv.getY(i)); }
        }
        const mk = (d) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3)); if (d.n.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3)); if (d.u.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.u, 2)); g.computeBoundingSphere(); g.computeBoundingBox(); return g; };
        E.heli.rotorGeo = mk(A); E.heli.geo = mk(B);
      }
    } catch (e) { /* modelo ausente: o nível usa o procedural */ }
  }));
  return E;
}

// instancia matrizes em células de `cell` metros. items: [{ m: Matrix4, x, z }]
export function addInstanced(scene, model, items, { cell = 70, cast = true, receive = true } = {}) {
  const groups = new Map();
  for (const it of items) {
    const k = Math.floor(it.x / cell) + ',' + Math.floor(it.z / cell);
    (groups.get(k) || groups.set(k, []).get(k)).push(it.m);
  }
  const out = [];
  for (const arr of groups.values()) {
    const im = new THREE.InstancedMesh(model.geo, model.mat, arr.length);
    arr.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = receive;
    im.computeBoundingSphere();
    scene.add(im); out.push(im);
  }
  return out;
}

// sombra de contato falsa (disco escuro suave) para veículos/props que não recebem sombra da lua à noite
let _blobMat = null;
export function blobShadow(T, w, l, opacity = 0.55) {
  if (!_blobMat) _blobMat = new THREE.MeshBasicMaterial({ map: T.soft, color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), _blobMat);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 1;
  return m;
}
