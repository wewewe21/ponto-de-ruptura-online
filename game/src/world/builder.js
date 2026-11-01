// Batcher de geometria estática (UV em espaço de mundo) e registro de materiais.
import * as THREE from 'three';

import { applyPBR } from './pbr.js';
export function makeMaterials(T, P = {}) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    concrete: std({ map: T.concrete, roughness: 0.6, color: 0xc2c6ca }),
    concreteDark: std({ map: T.concrete, roughness: 0.48, color: 0x8b9095 }),
    floor: std({ map: T.floor, roughness: 0.42, color: 0xb0b2b4 }),
    asphalt: std({ map: T.asphalt, roughness: 0.3, color: 0xcccccc }),
    metal: std({ map: T.metal, roughness: 0.45, metalness: 0.55, color: 0xc8ccd0 }),
    metalDark: std({ map: T.metal, roughness: 0.5, metalness: 0.6, color: 0x6c7074 }),
    hazard: std({ map: T.hazard, roughness: 0.5 }),
    wood: std({ map: T.wood, roughness: 0.8 }),
    plywood: std({ map: T.plywood, roughness: 0.8 }),
    sandbag: std({ map: T.sandbag, roughness: 0.95 }),
    rock: std({ map: T.rock, roughness: 0.85, color: 0xa8a8a8 }),
    grate: std({ map: T.grate, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }),
    fence: std({ map: T.fence, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }),
    glass: std({ color: 0x223040, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.3, depthWrite: false }),
    panel: std({ map: T.panel, emissiveMap: T.panelE, emissive: 0xffffff, emissiveIntensity: 2.0, roughness: 0.4 }),
    window: std({ map: T.window, roughness: 0.15, metalness: 0.3 }),
    windowLit: std({ map: T.window, emissive: 0xffbb66, emissiveIntensity: 2.2, emissiveMap: T.window }),
    jammer: std({ map: T.jammer, roughness: 0.6 }),
    black: std({ color: 0x141518, roughness: 0.8 }),
    rubber: std({ color: 0x0c0c0d, roughness: 0.95 }),
    olive: std({ color: 0x3a4030, roughness: 0.6, metalness: 0.25 }),
    oliveDark: std({ color: 0x23271d, roughness: 0.7, metalness: 0.2 }),
    tarp: std({ color: 0x2f3a2a, roughness: 0.9, side: THREE.DoubleSide }),
    helipad: std({ map: T.helipad, roughness: 0.5 }),
    redPaint: std({ color: 0x8a1c14, roughness: 0.5 }),
    whitePaint: std({ color: 0xbfc2c0, roughness: 0.5 }),
    lampSodium: std({ color: 0x111111, emissive: 0xffa94d, emissiveIntensity: 9 }),
    lampWhite: std({ color: 0x111111, emissive: 0xdde8ff, emissiveIntensity: 9 }),
    lampRed: std({ color: 0x111111, emissive: 0xff2a1a, emissiveIntensity: 9 }),
    lampGreen: std({ color: 0x111111, emissive: 0x3dff7a, emissiveIntensity: 6 }),
    lampOff: std({ color: 0x2a2a2a, roughness: 0.3 }),
    foliage: std({ color: 0x18241a, roughness: 0.95 }),
    bark: std({ color: 0x2a2219, roughness: 0.95 }),
    graffiti: std({ map: T.graffiti, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.6 }),
  };
  for (const k of Object.keys(T.container)) M['cont_' + k] = std({ map: T.container[k], roughness: 0.55, metalness: 0.4 });
  // texturas PBR geradas substituem as procedurais onde existirem
  applyPBR(M.concrete, P.concrete, { normal: 0.8, rough: 1.0 });
  applyPBR(M.concreteDark, P.concrete_dark || P.concrete, { normal: 0.9, rough: 0.9 });
  applyPBR(M.floor, P.floor, { normal: 0.7, rough: 0.9 });
  applyPBR(M.asphalt, P.asphalt, { normal: 0.9, rough: 0.7 });
  applyPBR(M.metal, P.metal, { normal: 1.0, rough: 1.0 }); applyPBR(M.metalDark, P.metal, { normal: 1.0, rough: 1.0 });
  applyPBR(M.wood, P.wood, { normal: 0.8, rough: 1.0 });
  // as texturas geradas são mais claras que as procedurais: escurece o tint para manter o clima noturno
  if (P.floor) M.floor.color.multiplyScalar(0.7);
  if (P.concrete) M.concrete.color.multiplyScalar(0.78);
  if (P.concrete_dark || P.concrete) M.concreteDark.color.multiplyScalar(0.8);
  if (P.asphalt) M.asphalt.color.multiplyScalar(0.62);
  applyPBR(M.sandbag, P.sandbag, { normal: 1.0, rough: 1.0 });
  applyPBR(M.rock, P.rock, { normal: 1.2, rough: 1.0 });
  if (P.container) {
    const tint = { red: 0xd06a52, blue: 0x5d86c4, green: 0x6f9460, grey: 0xaeb2b6 };
    for (const k of Object.keys(T.container)) { const m = M['cont_' + k]; applyPBR(m, P.container, { normal: 1.0, rough: 1.0 }); m.color.setHex(tint[k] || 0xcccccc); }
  }
  M.signCache = new Map();
  M.sign = (text, sub, bg, fg, stripe) => {
    const key = text + '|' + sub + '|' + bg;
    if (!M.signCache.has(key)) M.signCache.set(key, std({ map: T.sign(text, sub, bg, fg, stripe), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }));
    return M.signCache.get(key);
  };
  return M;
}

// escala UV padrão (metros por repetição)
const UVS = { concrete: 4, concreteDark: 4, floor: 4, asphalt: 6, metal: 2, metalDark: 2, hazard: 1, wood: 1.2, plywood: 2.4, sandbag: 1.6, rock: 6, grate: 1, fence: 2.5, cont_red: 2.6, cont_blue: 2.6, cont_green: 2.6, cont_grey: 2.6 };

export class Batcher {
  constructor(scene, M) {
    this.scene = scene; this.M = M;
    this.batches = new Map();
    this.meshes = [];
  }
  _b(key) {
    let b = this.batches.get(key);
    if (!b) { b = { pos: [], nor: [], uv: [], idx: [] }; this.batches.set(key, b); }
    return b;
  }
  _quad(b, p, n, uv) {
    const base = b.pos.length / 3;
    for (let i = 0; i < 4; i++) { b.pos.push(p[i][0], p[i][1], p[i][2]); b.nor.push(n[0], n[1], n[2]); b.uv.push(uv[i][0], uv[i][1]); }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // caixa com UV em espaço de mundo (ou unitário por face)
  box(x0, y0, z0, x1, y1, z1, key, uvScale, unit = false, faces = 63) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const b = this._b(key);
    const s = uvScale || UVS[key] || 3;
    const U = (u, v) => (unit ? null : [u / s, v / s]);
    const q = (p, n, uvw) => this._quad(b, p, n, unit ? [[0, 0], [1, 0], [1, 1], [0, 1]] : uvw);
    if (faces & 1) q([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [U(-z1, y0), U(-z0, y0), U(-z0, y1), U(-z1, y1)]);
    if (faces & 2) q([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [U(z0, y0), U(z1, y0), U(z1, y1), U(z0, y1)]);
    if (faces & 4) q([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [U(x0, -z1), U(x1, -z1), U(x1, -z0), U(x0, -z0)]);
    if (faces & 8) q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1)]);
    if (faces & 16) q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [U(x0, y0), U(x1, y0), U(x1, y1), U(x0, y1)]);
    if (faces & 32) q([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [U(-x1, y0), U(-x0, y0), U(-x0, y1), U(-x1, y1)]);
  }
  // geometria arbitrária (cilindros etc.) transformada por matriz
  geometry(geo, matrix, key) {
    const b = this._b(key);
    const g = geo.index ? geo : geo;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const base = b.pos.length / 3;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      b.pos.push(v.x, v.y, v.z); b.nor.push(n.x, n.y, n.z);
      if (uv) b.uv.push(uv.getX(i), uv.getY(i)); else b.uv.push(0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) b.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
  }
  build() {
    for (const [key, b] of this.batches) {
      if (!b.pos.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      geo.computeBoundingSphere();
      const mat = typeof key === 'string' ? this.M[key] : key;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = !mat.transparent && !String(key).startsWith('lamp');
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.batches.clear();
  }
}

// subtrai caixas "vazias" de uma caixa sólida. box = [x0,y0,z0,x1,y1,z1]
export function subtractBoxes(box, voids) {
  let parts = [box];
  for (const v of voids) {
    const next = [];
    for (const p of parts) {
      const [ax0, ay0, az0, ax1, ay1, az1] = p;
      const [vx0, vy0, vz0, vx1, vy1, vz1] = v;
      if (vx1 <= ax0 || vx0 >= ax1 || vy1 <= ay0 || vy0 >= ay1 || vz1 <= az0 || vz0 >= az1) { next.push(p); continue; }
      const ix0 = Math.max(ax0, vx0), ix1 = Math.min(ax1, vx1);
      const iy0 = Math.max(ay0, vy0), iy1 = Math.min(ay1, vy1);
      const iz0 = Math.max(az0, vz0), iz1 = Math.min(az1, vz1);
      if (ax0 < ix0) next.push([ax0, ay0, az0, ix0, ay1, az1]);
      if (ix1 < ax1) next.push([ix1, ay0, az0, ax1, ay1, az1]);
      if (az0 < iz0) next.push([ix0, ay0, az0, ix1, ay1, iz0]);
      if (iz1 < az1) next.push([ix0, ay0, iz1, ix1, ay1, az1]);
      if (ay0 < iy0) next.push([ix0, ay0, iz0, ix1, iy0, iz1]);
      if (iy1 < ay1) next.push([ix0, iy1, iz0, ix1, ay1, iz1]);
    }
    parts = next;
  }
  return parts;
}
