// Armas em GLB (geradas com IA) para o viewmodel. Cada arma é descrita por uma ficha (GUN_SPECS) com as medidas do modelo
// normalizado (comprimento = 1 no eixo X, base em y = 0) e é montada num "gun" compatível com o ViewModel:
//   { group, muzzle, mag, extra, sight, rightHome, leftHome, setMagDrop, magHand, ... }   (espaço da arma: cano em -Z, +Y para cima)
// Para acrescentar uma arma nova: ponha o GLB em assets/models/weapons e acrescente uma ficha aqui (e a definição em weapons.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { splitMesh } from './gunmodel.js';
import { clipToScope } from '../render/scopeclip.js';

// file: arquivo em assets/models/weapons; flip: a boca do cano fica em +X no modelo; len: comprimento em metros
// origin: ponto do modelo que vira a origem (linha do cano, perto do receptor); right/left: onde as mãos seguram
// holo: onde montar a mira holográfica (null = a arma já tem a sua luneta); mag/slide: região (x,y do modelo) que forma a peça móvel
export const GUN_SPECS = {
  MK5: {
    file: 'smg', flip: false, len: 0.9, handScale: 0.6, rightWrist: [0, 0, 0.06], origin: [0.05, 0.355], muzzle: [-0.5, 0.355], right: [0.092, 0.22], left: [-0.08, 0.28],
    holo: [0.0, 0.392], riser: 0.022, mag: { x: [0.03, 0.16], y: [-1, 0.2], pivot: [0.095, 0.2] }, rightCurl: [1.0, 1.0], leftCurl: [0.8, 0.9],
  },
  P19: {   // Glock brasileira: mira de ferro (sem holográfica); `scope` aqui é o ponto de visada (entre a massa e o raio de mira)
    file: 'glock', flip: false, len: 0.36, handScale: 0.6, rightWrist: [0, 0, 0.035], leftWrist: [0, 0, 0.05], origin: [0.03, 0.527], muzzle: [-0.5, 0.612], right: [0.30, 0.28], left: [0.21, 0.2], leftLat: -0.03,
    holo: null, scope: [0.365, 0.697], slide: { y: [0.552, 1], travel: 0.05 },
    rightCurl: [1.0, 1.1], leftCurl: [0.9, 1.0],
  },
  AX50: {   // sniper brasileira (cano para -X no modelo): `scope` = centro da lente da ocular
    file: 'sniper_br', flip: false, len: 1.15, handScale: 0.6, rightWrist: [0, 0, 0.07], origin: [0.02, 0.14], muzzle: [-0.5, 0.168], right: [0.208, 0.063], left: [-0.07, 0.118],
    holo: null, scope: [0.206, 0.221], scopeLat: 0.03, rightCurl: [0.9, 1.0], leftCurl: [0.7, 0.8],
    mag: { x: [-0.045, 0.065], y: [-1, 0.1], pivot: [0.01, 0.1] },
    bolt: { box: [0.07, 0.135, 0.09, 0.17, 0.005], pivot: [0.08, 0.158], ball: [0.113, 0.113, -0.055] },   // alavanca do ferrolho (do lado esquerdo) e a bola onde a mão segura
  },
  DE50: {   // pistola pesada (modelo antigo da P-19): mesma pose da Glock; `like` = ocupa o mesmo lugar na mão (posição/escala feitas no Blender)
    file: 'pistol', like: 'P19', flip: false, len: 0.42, handScale: 0.6, rightWrist: [0, 0, 0.035], leftWrist: [0, 0, 0.05], origin: [0.139, 0.492], muzzle: [-0.5, 0.528], right: [0.37, 0.28], left: [0.28, 0.2], leftLat: -0.03,
    holo: [0.08, 0.585], holoScale: 0.6, mag: { x: [0.25, 0.5], y: [-1, 0.12], pivot: [0.36, 0.12] }, slide: { y: [0.43, 1], travel: 0.045 },
    rightCurl: [1.0, 1.1], leftCurl: [0.9, 1.0],
  },
  VK12: {
    file: 'scifi', flip: true, len: 1.05, handScale: 0.6, rightWrist: [0, 0, 0.07], origin: [0.0, 0.171], muzzle: [0.5, 0.171], right: [-0.322, 0.072], left: [0.06, 0.1],
    holo: [-0.12, 0.31], mag: { x: [-0.14, -0.03], y: [-1, 0.12], pivot: [-0.085, 0.12] }, rightCurl: [1.0, 1.0], leftCurl: [0.8, 0.9],
  },
};

// Placas finas com faces duplicadas e opostas deixam normais zeradas (pontos brancos estourados com centro preto).
// Repara só esses vértices com a normal de uma face válida.
function repairNormals(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, idx = geo.index;
  if (!n) return;
  const bad = new Set();
  for (let i = 0; i < n.count; i++) if (!(n.getX(i) ** 2 + n.getY(i) ** 2 + n.getZ(i) ** 2 > 0.25)) bad.add(i);
  if (!bad.size) return;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0, count = idx ? idx.count : p.count; i < count && bad.size; i += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k));
    if (!ids.some((j) => bad.has(j))) continue;
    a.fromBufferAttribute(p, ids[0]); b.fromBufferAttribute(p, ids[1]); c.fromBufferAttribute(p, ids[2]);
    b.sub(a).cross(c.sub(a));
    if (!(b.lengthSq() > 1e-14)) continue;
    b.normalize();
    for (const j of ids) if (bad.has(j)) { n.setXYZ(j, b.x, b.y, b.z); bad.delete(j); }
  }
  for (const j of bad) n.setXYZ(j, 0, 1, 0);
  n.needsUpdate = true;
}

// Onde o modelo de cada arma foi deixado no Blender (matriz no espaço da arma, de assets/poses/fps_poses.json).
let _placements = null;
export function loadPlacements() {
  _placements ||= fetch('./assets/poses/fps_poses.json').then((r) => (r.ok ? r.json() : null)).then((j) => Object.fromEntries(Object.entries((j && j.weapons) || {}).filter(([, v]) => v.model).map(([k, v]) => [k, v.model]))).catch(() => ({}));
  return _placements;
}

const cache = new Map();
export function loadWeaponGLB(name) {
  if (!cache.has(name)) cache.set(name, new GLTFLoader().loadAsync(`./assets/models/weapons/${name}.glb`).then((g) => { g.scene.traverse((o) => { if (o.isMesh) repairNormals(o.geometry); }); return g.scene; }));
  return cache.get(name);
}

// textura do retículo holográfico: anel com pontos de mira e ponto central, vermelho
let _reticle = null;
export function reticleTexture() {
  if (_reticle) return _reticle;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.shadowColor = '#ff2a10'; g.shadowBlur = 10;
  g.strokeStyle = '#ff3a22'; g.fillStyle = '#ff3a22'; g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, 74, 0, Math.PI * 2); g.stroke();
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { g.save(); g.rotate(a); g.fillRect(-3, -96, 6, 22); g.restore(); }
  g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
  _reticle = new THREE.CanvasTexture(c); _reticle.colorSpace = THREE.SRGBColorSpace; _reticle.anisotropy = 4;
  return _reticle;
}
export function makeReticle(size = 0.03) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: reticleTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(2.2, 1.0, 0.9) }));
  m.renderOrder = 5; m.frustumCulled = false;
  return m;
}

const HOUSING = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.5, metalness: 0.6 });
const GLASS = new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.05, depthWrite: false });
// mira holográfica aberta: tubo retangular vazado (janela larga, moldura fina), vidro quase invisível e retículo vermelho no centro.
// Origem na base do trilho; o centro óptico fica em (0, centerY, 0).
export function makeHoloSight(scale = 1, riser = 0) {
  const root = new THREE.Group(), g = new THREE.Group(); g.position.y = riser; root.add(g);
  if (riser > 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, riser, 0.06), HOUSING); m.position.y = riser / 2; root.add(m); }
  const bx = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), HOUSING); m.position.set(x, y, z); g.add(m); return m; };
  const W = 0.056, H = 0.046, T = 0.0034, D = 0.04, cy = 0.012 + H / 2;
  bx(0.034, 0.01, 0.08, 0, 0.005, 0);                       // base e garras do trilho
  bx(T, H, D, -W / 2 + T / 2, cy, 0); bx(T, H, D, W / 2 - T / 2, cy, 0);   // paredes laterais
  bx(W, T, D, 0, cy + H / 2 - T / 2, 0); bx(W, T * 1.4, D, 0, cy - H / 2 + T * 0.7, 0);   // teto e chão
  bx(0.016, 0.012, 0.03, 0, 0.012 + 0.003, 0.0);            // pedestal
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, H - 2 * T), GLASS); glass.position.set(0, cy, 0.012); g.add(glass);
  const ret = makeReticle((H - 2 * T) * 0.95); ret.position.set(0, cy, 0.004); g.add(ret);
  root.scale.setScalar(scale);
  return { group: root, centerY: (cy + riser) * scale, ret };
}

// monta o gun a partir da ficha. flash: sprite do cano (do ViewModel)
// matriz que leva o modelo (espaço do GLB) para o espaço da arma, antes do ajuste feito no Blender
export function baseMatrix(spec) {
  const s = spec.len, rotY = spec.flip ? Math.PI / 2 : -Math.PI / 2;
  return new THREE.Matrix4().makeRotationY(rotY).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-spec.origin[0], -spec.origin[1], 0));
}
export function makeGlbGun(src, spec, placement = null) {
  const s = spec.len, sign = spec.flip ? -1 : 1, rotY = spec.flip ? Math.PI / 2 : -Math.PI / 2;
  const [ox, oy] = spec.origin;
  let mesh0 = null; src.traverse((o) => { if (o.isMesh && !mesh0) mesh0 = o; });
  const mat = mesh0.material.clone(); mat.envMapIntensity = 0.6;   // parafusos muito metálicos estouravam em pontos brancos
  if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
  if (spec.scope) clipToScope(mat);   // aro da luneta cortado em faixa fina quando se olha pela lente
  // posição no espaço da arma de um ponto (x,y) do modelo
  const toGun = (x, y, lat = 0) => new THREE.Vector3(lat, (y - oy) * s, sign * (x - ox) * s);
  // ajuste feito no Blender: matriz do modelo na arma = D · base. Se o modelo foi movido/girado/redimensionado lá, aplica igual aqui.
  let D = null;
  if (placement) {
    const base = new THREE.Matrix4().makeRotationY(rotY).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-ox, -oy, 0));
    const d = new THREE.Matrix4().fromArray(placement).multiply(base.invert());
    if (d.elements.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-5)) D = d;
  }
  const fix = (v) => (D ? v.applyMatrix4(D) : v);
  // peça: grupo no espaço da arma, posicionado no ponto pivô (px,py) do modelo
  const part = (mesh, px, py) => {
    const outer = new THREE.Group(); outer.position.copy(toGun(px, py));
    const pivot = new THREE.Group(); pivot.rotation.y = rotY; pivot.scale.setScalar(s); outer.add(pivot);
    const holder = new THREE.Group(); holder.position.set(-px, -py, 0); pivot.add(holder); holder.add(mesh);
    return outer;
  };
  const root = new THREE.Group(), mroot = new THREE.Group(); root.add(mroot);
  if (D) { mroot.matrixAutoUpdate = false; mroot.matrix.copy(D); }
  const base = new THREE.Mesh(mesh0.geometry, mat);
  let body = base, magOuter = null, slideOuter = null, boltOuter = null;
  const inMag = spec.mag ? (x, y) => x > spec.mag.x[0] && x < spec.mag.x[1] && y > spec.mag.y[0] && y < spec.mag.y[1] : null;
  const inSlide = spec.slide ? (x, y) => y > spec.slide.y[0] && y < spec.slide.y[1] : null;
  const inBolt = spec.bolt ? (x, y, z) => x > spec.bolt.box[0] && x < spec.bolt.box[1] && y > spec.bolt.box[2] && y < spec.bolt.box[3] && z > spec.bolt.box[4] : null;
  const parts = [];
  if (inMag) { const r = splitMesh(new THREE.Mesh(mesh0.geometry, mat), inMag); parts.push(['mag', r.mag]); body = r.body; }
  if (inSlide) { const r = splitMesh(body, inSlide); parts.push(['slide', r.mag]); body = r.body; }
  if (inBolt) { const r = splitMesh(body, inBolt); parts.push(['bolt', r.mag]); body = r.body; }
  body.material = mat; mroot.add(part(body, ox, oy));
  for (const [kind, mesh] of parts) {
    mesh.material = mat;
    if (kind === 'mag') { magOuter = part(mesh, ...spec.mag.pivot); mroot.add(magOuter); }
    else if (kind === 'bolt') { boltOuter = part(mesh, ...spec.bolt.pivot); mroot.add(boltOuter); }
    else { slideOuter = part(mesh, ox, oy); mroot.add(slideOuter); }
  }
  const out = {
    group: root, muzzle: new THREE.Object3D(), mag: magOuter, extra: { isModel: true },
    sight: spec.scope ? fix(toGun(spec.scope[0], spec.scope[1], spec.scopeLat || 0)) : new THREE.Vector3(0, 0.07, 0),
    rightHome: fix(toGun(...spec.right)), leftHome: fix(toGun(...spec.left, spec.leftLat || 0)),
    rightCurl: spec.rightCurl, leftCurl: spec.leftCurl, handScale: spec.handScale, rightWrist: spec.rightWrist && new THREE.Vector3(...spec.rightWrist), leftWrist: spec.leftWrist && new THREE.Vector3(...spec.leftWrist),
  };
  out.muzzle.position.copy(toGun(...spec.muzzle)); mroot.add(out.muzzle);
  if (magOuter) {
    const rest = magOuter.position.clone(), magBase = fix(toGun(spec.mag.pivot[0], 0.02));
    out.setMagDrop = (d) => { magOuter.position.y = rest.y - d * 0.2; magOuter.rotation.x = -d * 0.3; };
    out.magHand = (d) => new THREE.Vector3(magBase.x, magBase.y - d * 0.2, magBase.z);
  }
  if (boltOuter) {
    const rest = boltOuter.position.clone();
    out.setBolt = (lift, back) => { boltOuter.rotation.z = -lift * 1.2; boltOuter.position.z = rest.z + back * 0.1; };   // levanta (gira em torno do eixo do cano) e recua
    out.extra.boltPivot = fix(toGun(spec.bolt.pivot[0], spec.bolt.pivot[1])); out.extra.boltBall = fix(toGun(spec.bolt.ball[0], spec.bolt.ball[1], spec.bolt.ball[2]));
  }
  if (slideOuter) { out.extra.slide = slideOuter; out.extra.slideBase = 0; out.extra.slideTravel = spec.slide.travel; }
  if (spec.holo) {
    const h = makeHoloSight(spec.holoScale || 1, spec.riser || 0);
    const at = toGun(spec.holo[0], spec.holo[1]); h.group.position.copy(at); mroot.add(h.group);
    out.sight = fix(new THREE.Vector3(at.x, at.y + h.centerY, at.z));
    out.extra.holo = h;
  }
  root.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  return out;
}

// faca: modelo na posição de "punho para a frente" (lâmina para -Z, gume para baixo). Origem no centro do cabo.
export function makeKnifeGun(src, len = 0.28) {
  let mesh0 = null; src.traverse((o) => { if (o.isMesh && !mesh0) mesh0 = o; });
  const mat = mesh0.material.clone(); mat.envMapIntensity = 1.1;
  if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
  const root = new THREE.Group();
  const orient = new THREE.Group(); orient.rotation.x = -Math.PI / 2; orient.scale.setScalar(len); root.add(orient);   // +Y do modelo → -Z (frente)
  const holder = new THREE.Group(); holder.position.set(0, -0.2, 0); orient.add(holder);
  holder.add(new THREE.Mesh(mesh0.geometry, mat));
  const out = {
    group: root, muzzle: new THREE.Object3D(), mag: null, extra: { isModel: true, knife: true }, sight: new THREE.Vector3(0, 0, 0),
    rightHome: new THREE.Vector3(0, -0.005, 0.02), leftHome: new THREE.Vector3(-0.3, -0.7, 0.3), rightCurl: [1.35, 1.4], leftCurl: [0.2, 0.2],
    rightWrist: new THREE.Vector3(0, 0.0, 0.1),
  };
  root.add(out.muzzle);
  root.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
  return out;
}
