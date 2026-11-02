// Mapa completo da UHE Pedra Funda. Coordenadas: X leste, Z sul (norte = -Z), Y para cima.
// Crista da barragem em y = 0. Vale a jusante em y = -70. Reservatório em y = -3.
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { addInstanced, blobShadow } from './env3d.js';
import { makeMaterials, Batcher, subtractBoxes } from './builder.js';
import { fbm, smoothstep, lerp, mulberry32, clamp } from '../core/utils.js';

const MAT_TYPE = { concrete: 'concrete', concreteDark: 'concrete', floor: 'concrete', asphalt: 'concrete', rock: 'concrete', metal: 'metal', metalDark: 'metal', hazard: 'metal', olive: 'metal', oliveDark: 'metal', jammer: 'metal', panel: 'metal', wood: 'wood', plywood: 'wood', sandbag: 'sand', glass: 'glass', fence: 'metal', grate: 'metal' };

// ---------- terreno ----------
function gorgeWidth(z) {
  if (z > 12) return 100 + (z - 12) * 0.18;
  if (z < -50) return 100 + (-50 - z) * 1.2;
  return 100;
}
const FLAT = [
  [-252, -140, 22, 112], [-165, -94, -50, 32], [-175, -150, -50, 30], [-262, -100, 92, 112],
  [94, 215, -62, 150], [-112, -94, -40, 16],
];
function flatMask(x, z) {
  let m = 0;
  for (const [x0, x1, z0, z1] of FLAT) {
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
    const d = Math.sqrt(dx * dx + dz * dz);
    m = Math.max(m, 1 - smoothstep(0, 10, d));
  }
  return m;
}
export function terrainFn(x, z) {
  const ax = Math.abs(x);
  let bank = 0;
  if (x < -255) bank += (-255 - x) * 0.6;
  if (x > 215) bank += (x - 215) * 0.7;
  bank += smoothstep(105, 205, z) * smoothstep(-120, -180, x) * 14;
  if (z > 150 && x > 0) bank += (z - 150) * 0.35;
  if (z > 236) bank += (z - 236) * 0.8;
  if (z < -280) bank += (-280 - z) * 0.3;
  const n = (fbm(x * 0.025 + 7, z * 0.025 - 3, 4) - 0.5) * 7 + (fbm(x * 0.1, z * 0.1, 2) - 0.5) * 1.2;
  bank += n * (1 - flatMask(x, z));
  const floor = z > 0 ? -70 + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 6 : -45;
  const gw = gorgeWidth(z);
  const c = smoothstep(gw - 3, gw + 5, ax);
  return lerp(floor, bank, c);
}

const CARGO_FIX = { ry: 0, y: 0 };   // orientação do modelo do caminhão (nariz em +Z)
export function buildLevel(G) {
  const { scene, physics } = G;
  const T = makeTextures();
  const M = makeMaterials(T, G.pbr || {});
  const B = new Batcher(scene, M);
  const rng = mulberry32(42);
  const ENV = G.env || {};
  const envItems = {};   // nome do modelo → [{ m, x, z }] (instanciados no fim)
  const envAdd = (name, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
    (envItems[name] || (envItems[name] = [])).push({ m, x, z });
  };
  const R = (a = 0, b = 1) => a + rng() * (b - a);
  const L = {
    T, M, points: {}, zones: [], jammers: [], searchlights: [], vlights: [], dyn: {},
    destructibles: [], interactables: [], ammoCrates: [], intel: [], animated: [], beams: [], doors: {},
    alarmLights: {}, fluorescents: [], weaponPickups: [],
  };
  G.level = L;

  // ---------- helpers ----------
  const solid = (x0, y0, z0, x1, y1, z1, mat, o = {}) => {
    if (!o.noVisual) B.box(x0, y0, z0, x1, y1, z1, mat, o.uv, o.unit, o.faces);
    if (o.noCollide) return null;
    return physics.add(x0, y0, z0, x1, y1, z1, { mat: o.mt || MAT_TYPE[mat] || 'concrete', cover: o.cover, thin: o.thin, noGround: o.noGround, noRay: o.noRay, map: o.map !== false, noMantle: o.noMantle });
  };
  const invis = (x0, y0, z0, x1, y1, z1) => physics.add(x0, y0, z0, x1, y1, z1, { noRay: true, noGround: true, map: false, invisible: true, noMantle: true });
  const cyl = (x, y, z, r, h, mat, seg = 16, rt) => {
    const g = new THREE.CylinderGeometry(rt ?? r, r, h, seg);
    B.geometry(g, new THREE.Matrix4().makeTranslation(x, y + h / 2, z), mat);
  };
  const cylZ = (x, y, z, r, len, mat, seg = 12) => {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
    B.geometry(g, m, mat);
  };
  const cylX = (x, y, z, r, len, mat, seg = 12) => {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
    B.geometry(g, m, mat);
  };
  const plane = (x, y, z, w, h, rotY, mat, parent = scene) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    parent.add(m);
    return m;
  };
  const vlight = (x, y, z, color, intensity, range, o = {}) => {
    const v = { pos: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity, range, enabled: true, flicker: o.flicker || 0, pulse: o.pulse || 0, priority: o.priority || 1, glow: null, phase: R(0, 10), group: o.group, stealth: o.stealth !== false };
    if (o.glow !== false) {
      const sm = new THREE.SpriteMaterial({ map: T.soft, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: o.glowOpacity ?? 0.55, fog: true });
      const s = new THREE.Sprite(sm);
      s.position.copy(v.pos); s.scale.setScalar(o.glowSize || 1.6);
      scene.add(s); v.glow = s; v.glowBase = sm.opacity;
    }
    L.vlights.push(v);
    return v;
  };
  const lampPost = (x, z, dir = 1, broken = false, y = 0) => {
    solid(x - 0.12, y, z - 0.12, x + 0.12, y + 7, z + 0.12, 'metalDark', { cover: null });
    B.box(x - 0.08, y + 6.9, z, x + 0.08, y + 7.05, z + dir * 1.6, 'metalDark');
    B.box(x - 0.25, y + 6.75, z + dir * 1.3, x + 0.25, y + 6.9, z + dir * 1.9, broken ? 'lampOff' : 'lampSodium');
    if (!broken) return vlight(x, y + 6.5, z + dir * 1.6, 0xffa94d, 350, 26, { glowSize: 2.6, flicker: rng() < 0.2 ? 0.6 : 0 });
    return null;
  };
  const crate = (x, y, z, s = 1.2, hp = 60) => destructible(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, 'wood', hp, { cover: s > 1 ? 'low' : 'low', thin: true });
  const sandbags = (x0, z0, x1, z1, h = 1.0, y = 0) => solid(x0, y, z0, x1, y + h, z1, 'sandbag', { cover: 'low', mt: 'sand' });
  const jersey = (x, z, alongX = true, y = 0) => {
    const [hx, hz] = alongX ? [1.6, 0.35] : [0.35, 1.6];
    if (ENV.prop_barrier) {
      solid(x - hx, y, z - hz, x + hx, y + 1.08, z + hz, 'concreteDark', { cover: 'low', noVisual: true });
      const sz = ENV.prop_barrier.size, k = 3.2 / Math.max(sz.x, sz.z);
      envAdd('prop_barrier', x, y, z, alongX ? (sz.x >= sz.z ? 0 : Math.PI / 2) : (sz.x >= sz.z ? Math.PI / 2 : 0), k, 1.08 / sz.y, k);
      return;
    }
    solid(x - hx, y, z - hz, x + hx, y + 1.08, z + hz, 'concreteDark', { cover: 'low' });
  };
  const container = (x, y, z, alongX, color, open = false) => {
    const [hx, hz] = alongX ? [3.05, 1.22] : [1.22, 3.05];
    solid(x - hx, y, z - hz, x + hx, y + 2.6, z + hz, 'cont_' + color, { cover: 'high', mt: 'metal' });
  };
  const barrel = (x, y, z, explosive = false) => {
    if (explosive) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), M.redPaint);
      mesh.position.set(x, y + 0.45, z); mesh.castShadow = true; scene.add(mesh);
      const c = physics.add(x - 0.3, y, z - 0.3, x + 0.3, y + 0.9, z + 0.3, { mat: 'metal', hp: 25, mesh, explosive: true, cover: 'low' });
      L.destructibles.push(c);
      return c;
    }
    cyl(x, y, z, 0.3, 0.9, 'oliveDark', 10);
    return physics.add(x - 0.3, y, z - 0.3, x + 0.3, y + 0.9, z + 0.3, { mat: 'metal', cover: 'low' });
  };
  function destructible(x0, y0, z0, x1, y1, z1, mat, hp, o = {}) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    const mesh = new THREE.Mesh(g, M[mat]);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    const c = physics.add(x0, y0, z0, x1, y1, z1, { mat: MAT_TYPE[mat] || 'wood', hp, maxHp: hp, mesh, cover: o.cover, thin: o.thin });
    L.destructibles.push(c);
    return c;
  }
  // parede ao longo de X (z fixo) com aberturas [{a,b,y0,y1}]
  const wallX = (x0, x1, z, y0, y1, t, mat, openings = [], o = {}) => {
    const voids = openings.map((op) => [op.a, op.y0 ?? y0, z - t, op.b, op.y1 ?? y1, z + t]);
    for (const p of subtractBoxes([x0, y0, z - t / 2, x1, y1, z + t / 2], voids)) solid(p[0], p[1], p[2], p[3], p[4], p[5], mat, { cover: 'high', ...o });
  };
  const wallZ = (z0, z1, x, y0, y1, t, mat, openings = [], o = {}) => {
    const voids = openings.map((op) => [x - t, op.y0 ?? y0, op.a, x + t, op.y1 ?? y1, op.b]);
    for (const p of subtractBoxes([x - t / 2, y0, z0, x + t / 2, y1, z1], voids)) solid(p[0], p[1], p[2], p[3], p[4], p[5], mat, { cover: 'high', ...o });
  };
  const stairs = (x0, x1, z0, z1, axis, yA, yB, mat = 'metalDark', rails = true) => {
    // yA na extremidade mínima do eixo, yB na máxima
    physics.addRamp(x0, x1, z0, z1, axis, yA, yB);
    const len = axis === 'z' ? z1 - z0 : x1 - x0;
    const rise = Math.abs(yB - yA);
    const n = Math.max(2, Math.round(rise / 0.3));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const y = lerp(yA, yB, (t0 + t1) / 2);
      if (axis === 'z') B.box(x0, y - 0.15, z0 + len * t0, x1, y + 0.02, z0 + len * t1, mat, 1);
      else B.box(x0 + len * t0, y - 0.15, z0, x0 + len * t1, y + 0.02, z1, mat, 1);
    }
    if (rails) {
      // corrimão (visual) dos dois lados
      const N = 6;
      for (let i = 0; i <= N; i++) {
        const t = i / N, y = lerp(yA, yB, t);
        if (axis === 'z') { const z = z0 + len * t; B.box(x0 - 0.04, y, z - 0.03, x0 + 0.02, y + 1.05, z + 0.03, 'metal'); B.box(x1 - 0.02, y, z - 0.03, x1 + 0.04, y + 1.05, z + 0.03, 'metal'); }
        else { const x = x0 + len * t; B.box(x - 0.03, y, z0 - 0.04, x + 0.03, y + 1.05, z0 + 0.02, 'metal'); B.box(x - 0.03, y, z1 - 0.02, x + 0.03, y + 1.05, z1 + 0.04, 'metal'); }
      }
    }
  };
  const railing = (x0, z0, x1, z1, y, hazard = true) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    if (alongX) {
      B.box(Math.min(x0, x1), y + 1.0, z0 - 0.04, Math.max(x0, x1), y + 1.08, z0 + 0.04, hazard ? 'hazard' : 'metal', 1);
      B.box(Math.min(x0, x1), y + 0.5, z0 - 0.03, Math.max(x0, x1), y + 0.55, z0 + 0.03, 'metal');
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1.5) B.box(x - 0.03, y, z0 - 0.03, x + 0.03, y + 1.05, z0 + 0.03, 'metal');
      physics.add(Math.min(x0, x1), y, z0 - 0.06, Math.max(x0, x1), y + 1.1, z0 + 0.06, { noRay: true, mat: 'metal', map: false, noMantle: true });
      invis(Math.min(x0, x1), y + 1.1, z0 - 0.06, Math.max(x0, x1), y + 3, z0 + 0.06);
    } else {
      B.box(x0 - 0.04, y + 1.0, Math.min(z0, z1), x0 + 0.04, y + 1.08, Math.max(z0, z1), hazard ? 'hazard' : 'metal', 1);
      B.box(x0 - 0.03, y + 0.5, Math.min(z0, z1), x0 + 0.03, y + 0.55, Math.max(z0, z1), 'metal');
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z += 1.5) B.box(x0 - 0.03, y, z - 0.03, x0 + 0.03, y + 1.05, z + 0.03, 'metal');
      physics.add(x0 - 0.06, y, Math.min(z0, z1), x0 + 0.06, y + 1.1, Math.max(z0, z1), { noRay: true, mat: 'metal', map: false, noMantle: true });
      invis(x0 - 0.06, y + 1.1, Math.min(z0, z1), x0 + 0.06, y + 3, Math.max(z0, z1));
    }
  };
  const sign = (x, y, z, rotY, text, sub = '', w = 2.4, colors) => {
    const m = plane(x, y, z, w, w / 2, rotY, M.sign(text, sub, ...(colors || [])));
    m.receiveShadow = true;
    return m;
  };
  const graffiti = (x, y, z, rotY, w = 4) => plane(x, y, z, w, w / 2, rotY, M.graffiti);
  const truck = (x, z, rotY, o = {}) => {
    // caminhão militar: cabine + caçamba com lona. Colisor como AABB aproximada
    const grp = new THREE.Group();
    const GLBC = ENV.truck_cargo;
    const add = (w, h, d, px, py, pz, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M[mat]); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; m.visible = !GLBC; grp.add(m); return m; };
    if (GLBC) { const tm = new THREE.Mesh(GLBC.geo, GLBC.mat); tm.castShadow = tm.receiveShadow = true; const fix = new THREE.Group(); fix.rotation.y = CARGO_FIX.ry; fix.position.y = CARGO_FIX.y; fix.add(tm); grp.add(fix); grp.add(blobShadow(T, 3.8, 8.6)); }
    add(2.4, 1.0, 7.2, 0, 1.0, 0, 'oliveDark');
    add(2.4, 1.5, 2.2, 0, 2.2, 2.4, 'olive');
    add(2.2, 0.6, 0.05, 0, 2.4, 3.51, 'glass');
    if (!o.noTarp) add(2.4, 1.9, 4.6, 0, 2.45, -1.2, 'tarp'); else add(2.4, 0.5, 4.6, 0, 1.75, -1.2, 'olive');
    for (const [wx, wz] of [[-1.1, 2.4], [1.1, 2.4], [-1.1, -1.0], [1.1, -1.0], [-1.1, -2.6], [1.1, -2.6]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 14), M.rubber);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.5, wz); w.visible = !GLBC; grp.add(w);
    }
    grp.position.set(x, 0, z); grp.rotation.y = rotY;
    scene.add(grp);
    const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
    const hx = 1.2 * c + 3.6 * s, hz = 1.2 * s + 3.6 * c;
    physics.add(x - hx, 0, z - hz, x + hx, o.noTarp ? 2.0 : 3.3, z + hz, { mat: 'metal', cover: 'high' });
    return grp;
  };
  const tree = [];
  const rock = (x, z, s) => {
    const y = physics.terrainH(x, z) ?? 0;
    if (ENV.rock_big) {
      const k = s * 1.15; envAdd('rock_big', x, y - 0.12 * k, z, R(0, 6.28), k * R(0.9, 1.3), k * R(0.6, 0.95), k * R(0.9, 1.3));
      physics.add(x - s * 0.8, y - 1, z - s * 0.8, x + s * 0.8, y + s * 0.9, z + s * 0.8, { mat: 'concrete', cover: s > 1.3 ? 'high' : 'low' });
      return;
    }
    const g = new THREE.DodecahedronGeometry(s, 0);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + s * 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(0, 3), R(0, 3), R(0, 3))), new THREE.Vector3(1, R(0.5, 0.8), R(0.8, 1.2)));
    B.geometry(g, m, 'rock');
    physics.add(x - s * 0.8, y - 1, z - s * 0.8, x + s * 0.8, y + s * 0.9, z + s * 0.8, { mat: 'concrete', cover: s > 1.3 ? 'high' : 'low' });
  };

  // ---------- terreno ----------
  {
    const size = 1200, n = 301, minX = -600, minZ = -600;
    const H = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) H[iz * n + ix] = terrainFn(minX + (ix * size) / (n - 1), minZ + (iz * size) / (n - 1));
    physics.setTerrain(minX, minZ, size, n, H);
    const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const ix = i % n, iz = Math.floor(i / n);
      pos.setY(i, H[iz * n + ix]);
      pos.setX(i, minX + (ix * size) / (n - 1));
      pos.setZ(i, minZ + (iz * size) / (n - 1));
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const ny = nor.getY(i);
      const rockiness = smoothstep(0.85, 0.6, ny);
      const x = pos.getX(i), z = pos.getZ(i);
      const mud = fbm(x * 0.05, z * 0.05, 2);
      const r = lerp(lerp(0.75, 0.95, mud), 1.25, rockiness), g = lerp(lerp(0.8, 1.0, mud), 1.2, rockiness), b = lerp(lerp(0.7, 0.85, mud), 1.25, rockiness);
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      uv.setXY(i, x / 6, z / 6);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ map: (G.pbr && G.pbr.ground ? G.pbr.ground.map : T.ground), vertexColors: true, roughness: 0.82 });
    if (G.pbr && G.pbr.ground) { mat.normalMap = G.pbr.ground.normalMap; mat.normalScale = new THREE.Vector2(0.9, 0.9); mat.roughnessMap = G.pbr.ground.roughnessMap; }
    // rocha nas encostas íngremes: mistura via onBeforeCompile
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.rockMap = { value: (G.pbr && G.pbr.rock ? G.pbr.rock.map : T.rock) };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D rockMap;')
        .replace('#include <map_fragment>', `
          vec4 g0 = texture2D( map, vMapUv );
          vec4 r0 = texture2D( rockMap, vMapUv * 0.7 );
          float rk = clamp((vColor.r - 1.0) * 4.0, 0.0, 1.0);
          diffuseColor *= mix(g0, r0 * 1.15, rk);
        `);
    };
    const terr = new THREE.Mesh(geo, mat);
    terr.receiveShadow = true;
    scene.add(terr);
    L.terrainMesh = terr;
  }

  // ---------- água ----------
  {
    const wm = new THREE.MeshStandardMaterial({ color: 0x0b161c, roughness: 0.12, metalness: 0.35, normalMap: T.waterN, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.94 });
    T.waterN.repeat.set(60, 60);
    const res = new THREE.Mesh(new THREE.PlaneGeometry(1200, 600), wm);
    res.rotation.x = -Math.PI / 2; res.position.set(0, -3, -310); scene.add(res);
    const riv = new THREE.Mesh(new THREE.PlaneGeometry(400, 600), wm);
    riv.rotation.x = -Math.PI / 2; riv.position.set(0, -67.5, 330); scene.add(riv);
    L.waterMat = wm;
    physics.water.push({ minX: -600, maxX: 600, minZ: -600, maxZ: -10.5, level: -3 });
    physics.water.push({ minX: -200, maxX: 200, minZ: 36, maxZ: 640, level: -67.5 });
  }

  // ---------- BARRAGEM ----------
  // corpo superior com vazios (galeria, saída, poço do elevador, vãos do vertedouro)
  const voids = [
    [38, -22, -7, 98, -18, -3],          // galeria de inspeção
    [94, -22, -3, 98, -18, 10.1],        // saída para a face jusante
    [38, -22, -7, 42, 0.1, -3],          // poço do elevador
    [50, -12, -10.1, 90, 0.1, 10.1],     // vãos do vertedouro
    [60, -22, -9, 65, -19, -7],          // nicho
    [75, -22, -3, 80, -19, -1],          // nicho
  ];
  for (const p of subtractBoxes([-100, -22, -10, 100, 0, 10], voids)) solid(p[0], p[1], p[2], p[3], p[4], p[5], p[4] > -0.5 ? 'concrete' : 'concreteDark', { cover: null });
  solid(-100, -70, -10, 100, -22, 35, 'concreteDark', { cover: null });
  // face jusante inclinada (visual) abaixo do degrau
  solid(-100, -70, 35, 100, -40, 42, 'concreteDark', { cover: null, noCollide: true });
  // pista asfaltada na crista (visual)
  B.box(-100, 0, -6, 50, 0.03, 6, 'asphalt');
  B.box(90, 0, -6, 100, 0.03, 6, 'asphalt');
  for (let x = -96; x < 50; x += 8) B.box(x, 0.031, -0.12, x + 4, 0.035, 0.12, 'whitePaint');
  // muretas (cobertura baixa) + paredes invisíveis
  const parapet = (x0, x1, z0, z1) => { solid(x0, 0, z0, x1, 1.1, z1, 'concrete', { cover: 'low', noMantle: true }); invis(x0, 1.1, z0, x1, 3.2, z1); };
  parapet(-100, 50, -10, -9.4); parapet(-100, 50, 9.4, 10);
  parapet(90, 100, -10, -9.4); parapet(90, 92, 9.4, 10); parapet(95.5, 100, 9.4, 10);
  for (let x = -96; x < 50; x += 6) B.box(x, 1.1, -10, x + 0.12, 1.14, -9.4, 'hazard', 1);
  // transições crista <-> ponte do vertedouro
  invis(49.8, 0, -10, 50.2, 3.2, -6); invis(49.8, 0, 6, 50.2, 3.2, 10);
  invis(89.8, 0, -10, 90.2, 3.2, -6); invis(89.8, 0, 6, 90.2, 3.2, 10);
  // vertedouro: pilares, ponte, comportas
  for (const px of [50, 60, 70, 80, 90]) solid(px - 1, -12, -14, px + 1, -1.2, 12, 'concrete', { cover: 'high' });
  L.dyn.bridge = [];
  for (const [a, b] of [[50, 60], [60, 70], [70, 80], [80, 90]]) {
    const deck = new THREE.Group();
    const mk = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M[mat]); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; deck.add(m); };
    mk(b - a, 1.2, 12, (a + b) / 2, -0.6, 0, 'concrete');
    mk(b - a, 0.03, 12, (a + b) / 2, 0.015, 0, 'asphalt');
    mk(b - a, 1.0, 0.25, (a + b) / 2, 0.5, -6, 'concrete');
    mk(b - a, 1.0, 0.25, (a + b) / 2, 0.5, 6, 'concrete');
    scene.add(deck);
    const cols = [
      physics.add(a, -1.2, -6, b, 0, 6, { mat: 'concrete' }),
      physics.add(a, 0, -6.15, b, 1.0, -5.85, { mat: 'concrete', cover: 'low', noMantle: true }),
      physics.add(a, 0, 5.85, b, 1.0, 6.15, { mat: 'concrete', cover: 'low', noMantle: true }),
      invis(a, 1.0, -6.15, b, 3.2, -5.85), invis(a, 1.0, 5.85, b, 3.2, 6.15),
    ];
    L.dyn.bridge.push({ a, b, deck, cols });
  }
  // fundo dos vãos (soleira) e comportas
  L.dyn.gates = [];
  for (const [a, b] of [[51, 59], [61, 69], [71, 79], [81, 89]]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(b - a, 11, 0.6), M.metalDark);
    g.position.set((a + b) / 2, -6.5, -11.5); g.castShadow = true; scene.add(g);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.5, 0.62), M.hazard);
    stripe.position.set(0, 5.2, 0); g.add(stripe);
    L.dyn.gates.push({ mesh: g, base: -6.5, open: 0 });
  }
  // água do vertedouro (aparece quando as comportas abrem)
  {
    const fm = new THREE.MeshStandardMaterial({ map: T.foam, transparent: true, opacity: 0, color: 0xcfe0e8, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide, emissive: 0x223038, emissiveIntensity: 0.4 });
    T.foam.repeat.set(4, 2);
    const grp = new THREE.Group();
    // lâmina descendo pelos vãos e pela face
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(40, 23), fm); s1.rotation.x = -Math.PI / 2 + 0.45; s1.position.set(70, -7.5, -1); grp.add(s1);
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 11), fm); s2.position.set(70, -17, 10.6); grp.add(s2);
    const s3 = new THREE.Mesh(new THREE.PlaneGeometry(40, 25), fm); s3.rotation.x = -Math.PI / 2; s3.position.set(70, -21.6, 23); grp.add(s3);
    const s4 = new THREE.Mesh(new THREE.PlaneGeometry(40, 48), fm); s4.position.set(70, -46, 36); grp.add(s4);
    scene.add(grp);
    L.dyn.spill = { group: grp, mat: fm, on: 0 };
    invis(90.6, -22, 10, 91, -15, 36); // não deixa entrar na cascata
  }
  // degrau jusante (onde a galeria sai)
  invis(100, -22, 10, 100.5, -15, 37);
  invis(91, -22, 35.5, 100, -15, 36);
  // água subindo na galeria
  {
    const fm = new THREE.MeshStandardMaterial({ color: 0x0d1c1a, roughness: 0.1, metalness: 0.3, normalMap: T.waterN, transparent: true, opacity: 0.88 });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 17.2), fm);
    fl.rotation.x = -Math.PI / 2; fl.position.set(68, -23, 1.5);
    scene.add(fl);
    const zone = { minX: 38, maxX: 98, minZ: -7, maxZ: 10.2, level: -23 };
    physics.water.push(zone);
    L.dyn.flood = { mesh: fl, level: -23, zone };
  }

  // ---------- torre das comportas (J3) ----------
  {
    // pernas
    for (const p of subtractBoxes([36, 0, -9.5, 44, 12, -2], [[38, 0, -7, 42, 12.1, -3]])) solid(...p, 'concrete', { cover: 'high' });
    solid(36, 0, 3, 44, 12, 9.5, 'concrete', { cover: 'high' });
    B.box(36, 3.5, -2, 44, 12, 3, 'concrete');
    physics.add(36, 3.5, -2, 44, 12, 3, { mat: 'concrete' });
    // casa de máquinas no topo (piso com o poço do elevador)
    for (const p of subtractBoxes([35, 12, -10, 45, 12.5, 10], [[38, 11.9, -7, 42, 12.6, -3]])) solid(...p, 'concrete', { cover: null });
    // abertura do poço no piso
    L.dyn.shaftCover = null;
    wallZ(-10, 10, 35, 12.5, 17.5, 0.4, 'metal', [{ a: -4, b: 4, y0: 14, y1: 16 }]);
    wallZ(-10, 10, 45, 12.5, 17.5, 0.4, 'metal', [{ a: -9.5, b: -7.5, y0: 12.5, y1: 15 }, { a: 0, b: 6, y0: 14, y1: 16 }]);
    wallX(35, 45, -10, 12.5, 17.5, 0.4, 'metal', [{ a: 37, b: 43, y0: 14, y1: 16 }]);
    wallX(35, 45, 10, 12.5, 17.5, 0.4, 'metal', [{ a: 37, b: 43, y0: 14, y1: 16 }]);
    // teto com alçapão
    for (const p of subtractBoxes([35, 17.5, -10, 45, 18, 10], [[35.5, 17.4, -9.6, 42.6, 18.1, -7.9]])) solid(...p, 'concrete', { cover: null });
    railing(35, -10, 45, -10, 18); railing(35, 10, 45, 10, 18); railing(35, -10, 35, 10, 18); railing(45, -10, 45, 10, 18);
    // rampa interna para o teto
    stairs(36, 44.4, -9.6, -7.9, 'x', 18, 12.5, 'metalDark', false);
    // escada externa (crista -> casa de máquinas)
    stairs(45.2, 48, -7, 5.6, 'z', 12.5, 0);   // o pé da escada fica 4 m antes da borda da crista (antes ficava a 0,4 m dela e não dava para entrar)
    solid(45.2, 12, -12, 48, 12.5, -7, 'grate', { cover: null, mt: 'metal' });
    invis(48, 0, -12, 48.3, 16, 9.6); // corrimão externo
    railing(45.2, -12, 48, -12, 12.5);
    invis(44.8, 12.5, -12.1, 45.2, 15.5, -10);
    // maquinário das comportas
    for (const z of [-2, 2.5, 7]) { cylX(40, 13.6, z, 1.0, 6, 'metalDark'); solid(37, 12.5, z - 0.9, 43, 14.6, z + 0.9, 'metalDark', { noVisual: true, cover: 'low' }); }
    solid(43.4, 12.5, 0.5, 44.6, 14, 4, 'panel', { cover: 'low' });
    vlight(40, 16.8, 2, 0xdde8ff, 160, 12, { glowSize: 1 });
    // luz de obstrução no topo (guia)
    B.box(39.8, 18, 6.8, 40.2, 20, 7.2, 'metal');
    L.towerBeacon = vlight(40, 20.2, 7, 0xff2a1a, 30, 10, { pulse: 1.2, glowSize: 2.4, stealth: false });
    sign(45.22, 14.6, -4.5, Math.PI / 2, 'TORRE CG', 'COMPORTAS 01–04', 2.2);
    // elevador
    const car = new THREE.Group();
    const mk = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M[mat]); m.position.set(x, y, z); m.castShadow = true; car.add(m); };
    mk(3.9, 0.3, 3.9, 0, -0.15, 0, 'metal');
    mk(3.9, 0.1, 3.9, 0, 3.3, 0, 'metalDark');
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) mk(0.12, 3.3, 0.12, x, 1.65, z, 'hazard');
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), M.lampWhite); cl.position.set(0, 3.2, 0); car.add(cl);
    car.position.set(40, 12.5, -5);
    scene.add(car);
    const carCol = physics.add(38.05, 12.2, -6.95, 41.95, 12.5, -3.05, { mat: 'metal' });
    L.dyn.elevator = { car, col: carCol, y: 12.5, top: 12.5, bottom: -22, moving: false };
    L.points.elevator = new THREE.Vector3(40, 12.5, -5);
    L.points.elevatorPanel = new THREE.Vector3(42, 13.4, -5);
  }

  // ---------- galeria de inspeção ----------
  {
    B.box(38, -22, -7, 98, -21.98, -3, 'floor');
    for (let x = 44; x < 98; x += 10) {
      vlight(x, -18.5, -5, 0x3dff7a, 45, 11, { glowSize: 0.8, flicker: 0.15 });
      B.box(x - 0.3, -18.15, -5.1, x + 0.3, -18.0, -4.9, 'lampGreen');
    }
    // tubulação e bombas
    cylX(68, -18.6, -6.6, 0.25, 60, 'metal');
    cylX(68, -18.9, -6.6, 0.18, 60, 'rust' in M ? 'rust' : 'metalDark');
    solid(52, -22, -6.9, 54, -20.6, -5.8, 'metalDark', { cover: 'low' });
    solid(70, -22, -3.9, 72, -20.8, -3.05, 'metalDark', { cover: 'low' });
    solid(84, -22, -6.95, 86.5, -20.4, -5.8, 'metalDark', { cover: 'low' });
    crate(61.5, -22, -4.2, 1.1); crate(89, -22, -6.2, 1.0);
    sign(48, -20, -6.98, 0, 'GALERIA G-2', 'INSPEÇÃO  →  SAÍDA JUSANTE', 2.2);
    sign(97.98, -20, -5, -Math.PI / 2, 'SAÍDA →', 'FACE JUSANTE', 1.6);
    L.points.galleryStart = new THREE.Vector3(44, -22, -5);
    L.points.galleryExit = new THREE.Vector3(96, -22, 11);
    L.zones.push({ name: 'gallery', minX: 37, maxX: 98.5, minY: -23, maxY: -17, minZ: -8, maxZ: 10.5, indoor: true, ambient: 0.12, reverb: 'tunnel' });
  }
  // ---------- escadaria da face jusante ----------
  stairs(96, 99.5, 12, 34, 'z', -22, -11);
  solid(92, -11.4, 34, 99.5, -11, 37.5, 'grate', { cover: null });
  stairs(92, 95.5, 12, 34, 'z', 0, -11);
  solid(92, -0.4, 10, 95.5, 0, 12, 'concrete', { cover: null });
  invis(99.6, -22, 12, 99.9, 2, 37.6); invis(91.6, -22, 10, 92, 2, 37.6);
  invis(95.5, -22, 12, 96, 2, 34); invis(92, -11, 37.5, 99.6, -8, 37.8);
  invis(95.5, -1, 12, 106, 3, 12.4);
  for (let z = 14; z < 36; z += 5) { B.box(95.6, -22, z - 0.1, 95.9, -11, z + 0.1, 'metalDark'); }
  L.points.stairsTop = new THREE.Vector3(94, 0, 11);

  // ---------- torres de tomada (ninhos de atirador) ----------
  for (const [tx, tz] of [[-50, -40], [20, -45]]) {
    cyl(tx, -45, tz, 5, 55, 'concrete', 20);
    physics.add(tx - 4, -45, tz - 4, tx + 4, 10, tz + 4, { mat: 'concrete' });
    solid(tx - 5.5, 10, tz - 5.5, tx + 5.5, 10.4, tz + 5.5, 'grate', { cover: null });
    railing(tx - 5.5, tz - 5.5, tx + 5.5, tz - 5.5, 10.4); railing(tx - 5.5, tz + 5.5, tx + 5.5, tz + 5.5, 10.4);
    railing(tx - 5.5, tz - 5.5, tx - 5.5, tz + 5.5, 10.4); railing(tx + 5.5, tz - 5.5, tx + 5.5, tz + 5.5, 10.4);
    solid(tx - 1.2, 10.4, tz - 1.2, tx + 1.2, 13, tz + 1.2, 'metalDark', { cover: 'high' });
    // passarela até a crista
    solid(tx - 1.5, -0.5, tz + 4, tx + 1.5, 0, -10, 'grate', { cover: null });
    vlight(tx, 13.3, tz, 0xff2a1a, 20, 8, { pulse: 1, glowSize: 1.4, stealth: false });
  }
  L.points.sniperA = new THREE.Vector3(-50, 10.4, -37);
  L.points.sniperB = new THREE.Vector3(20, 10.4, -42);

  // ---------- conteúdo da crista (J2) ----------
  {
    for (let x = -90; x < 50; x += 20) { lampPost(x, -9.2, 1, x === -30 || x === 30); lampPost(x + 10, 9.2, -1, x === -70); }
    lampPost(95, -9.2, 1); lampPost(95, 9.2, -1);
    jersey(-86, -3); jersey(-86, 4); jersey(-74, 0, false); jersey(-52, 6); jersey(-40, -5); jersey(-34, 3, false);
    jersey(-10, -6); jersey(12, 5); jersey(26, -3, false); jersey(31, 6);
    sandbags(-80, -8.8, -77, -5); sandbags(-80, 5, -77, 8.8);
    truck(-60, -3.5, 0.35);
    // ninho de metralhadora
    sandbags(-22.5, -0.5, -21.8, 4.5, 1.15); sandbags(-22.5, -0.5, -19, 0.2, 1.15); sandbags(-22.5, 3.8, -19, 4.5, 1.15);
    L.points.mgNest = new THREE.Vector3(-20.5, 0, 2);
    // caminhão com o jammer 2
    truck(0, 3, Math.PI / 2, { noTarp: true });
    container(-5, 0, -6.4, true, 'grey');
    for (const [x, z] of [[-46, -1], [-44, 7.6], [-15, -7.8], [5, -2], [18, 7.6], [40.5, -0.5]]) crate(x, 0, z, 1.2);
    barrel(-58, 0, 7.5, true); barrel(-12, 0, -2.8, true); barrel(22, 0, -7.5, true);
    // guindaste pórtico
    for (const z of [-8.2, 7.4]) solid(19, 0, z, 21, 12, z + 0.8, 'hazard', { cover: 'high', uv: 2 });
    B.box(18.5, 12, -8.6, 21.5, 13.4, 8.6, 'metalDark');
    B.box(19.3, 10.6, -1, 20.7, 12, 1, 'metal');
    solid(18.5, 12, -8.6, 21.5, 13.4, 8.6, 'metalDark', { noVisual: true, cover: null });
    for (const z of [-7, 7]) B.box(-100, 0.03, z - 0.1, 50, 0.08, z + 0.1, 'metalDark');
    graffiti(-5, 1.5, -5.15, 0, 3.6);
    sign(-92, 1.9, -9.35, 0, 'UHE PEDRA FUNDA', 'CRISTA — COTA 412,00 m', 2.6);
    sign(-90, 1.5, 9.35, Math.PI, 'PERIGO', 'QUEDA — NÃO ULTRAPASSE', 1.6);
    L.zones.push({ name: 'crest', minX: -100, maxX: 100, minY: -1, maxY: 30, minZ: -10, maxZ: 10, indoor: false, ambient: 0.22, reverb: 'outdoor' });
  }

  // ---------- praça oeste ----------
  solid(-112, -1, -40, -96, 0, 14, 'floor', { cover: null });
  invis(-112, 0, 14, -96, 3, 14.5);
  lampPost(-104, -20, 1); lampPost(-104, 6, -1, true);
  jersey(-104, -12, true); crate(-108, 0, -28); crate(-108, 0, -26.6, 1.0);
  // barricada que fecha a estrada do reservatório
  container(-108, 0, -33.5, false, 'red'); container(-102, 0, -33.5, false, 'blue');
  invis(-112, 0, -40, -96, 4, -37);

  // ---------- CASA DE MÁQUINAS ----------
  {
    const X0 = -150, X1 = -110, Z0 = -30, Z1 = 25, H = 18;
    solid(X0, -1, Z0, X1, 0, Z1, 'floor', { cover: null });
    wallX(X0, X1, Z1, 0, H, 0.6, 'concrete', [{ a: -134, b: -126, y0: 0, y1: 6 }, { a: -148, b: -136, y0: 11, y1: 15 }, { a: -124, b: -112, y0: 11, y1: 15 }]);
    wallX(X0, X1, Z0, 0, H, 0.6, 'concrete', [{ a: -125, b: -121, y0: 0, y1: 3 }, { a: -148, b: -128, y0: 11, y1: 15 }]);
    wallZ(Z0, Z1, X0, 0, H, 0.6, 'concrete', [{ a: -26, b: 21, y0: 11, y1: 15 }]);
    wallZ(Z0, Z1, X1, 0, H, 0.6, 'concrete', [{ a: -22, b: -18, y0: 0, y1: 3 }, { a: -26, b: 21, y0: 11, y1: 15 }]);
    // vidros das janelas altas (visual)
    for (const [x, z, w, r] of [[-142, 25.3, 12, 0], [-118, 25.3, 12, 0], [-138, -30.3, 20, 0]]) plane(x, 13, z, w, 4, r, M.glass);
    solid(X0 - 0.5, H, Z0 - 0.5, X1 + 0.5, H + 0.6, Z1 + 0.5, 'concreteDark', { cover: null });
    // pilares
    for (let z = -25; z <= 20; z += 15) { solid(X0 + 0.3, 0, z - 0.5, X0 + 1.3, H, z + 0.5, 'concrete', { cover: 'high' }); solid(X1 - 1.3, 0, z - 0.5, X1 - 0.3, H, z + 0.5, 'concrete', { cover: 'high' }); }
    // turbinas / geradores
    L.dyn.turbines = [];
    for (const z of [-17, -2, 13]) {
      cyl(-130, 0, z, 4.3, 0.6, 'hazard', 28);
      cyl(-130, 0.6, z, 4.1, 2.6, 'metal', 28);
      cyl(-130, 3.2, z, 3.0, 1.0, 'metalDark', 24);
      physics.add(-133.8, 0, z - 3.8, -126.2, 3.2, z + 3.8, { mat: 'metal', cover: 'high' });
      physics.add(-132.6, 3.2, z - 2.6, -127.4, 4.2, z + 2.6, { mat: 'metal' });
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.6, 16), M.metalDark);
      ex.position.set(-130, 5.0, z); ex.castShadow = true; scene.add(ex);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), M.lampGreen); lamp.position.set(1.2, 0.6, 0); ex.add(lamp);
      physics.add(-131.4, 4.2, z - 1.4, -128.6, 5.8, z + 1.4, { mat: 'metal' });
      L.dyn.turbines.push({ mesh: ex, z, speed: 1.5, lamp });
      sign(-125.7, 1.8, z, Math.PI / 2, 'UG-0' + (z === -17 ? 1 : z === -2 ? 2 : 3), 'UNIDADE GERADORA  120 MW', 2, ['#e2e2dc', '#111', '#d9a40d']);
    }
    // passarela oeste + norte (y = 6)
    stairs(-149.4, -146.4, 12, 22, 'z', 6, 0);
    solid(-149.4, 5.8, -29.4, -146.4, 6, 12, 'grate', { cover: null });
    solid(-149.4, 5.8, -29.4, -112, 6, -26.4, 'grate', { cover: null });
    railing(-146.4, -26.4, -146.4, 12, 6); railing(-146.4, -26.4, -112, -26.4, 6);
    for (let z = -26; z < 12; z += 6) B.box(-146.6, 0, z - 0.1, -146.4, 5.8, z + 0.1, 'metalDark');
    for (let x = -145; x < -112; x += 6) B.box(x - 0.1, 0, -26.6, x + 0.1, 5.8, -26.4, 'metalDark');
    // ponte rolante (cai no set piece)
    {
      const beam = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(38, 1.6, 1.4), M.hazard); beam.add(b1);
      const hoist = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.2), M.metalDark); hoist.position.set(-3, -1.4, 0); beam.add(hoist);
      beam.position.set(-130, 15, -9); beam.traverse((m) => { if (m.isMesh) m.castShadow = true; });
      scene.add(beam);
      L.dyn.craneBeam = { group: beam, falling: false, t: 0, done: false, cols: [] };
      // Colisão da ponte rolante caída: segue a viga inclinada, fatia por fatia (um único bloco de 1,6 m de altura criava uma parede
      // invisível embaixo da ponta que fica no alto). Onde a viga está acima de ~2 m dá para passar por baixo.
      L.setCraneCol = (on) => {
        const cb = L.dyn.craneBeam;
        for (const c of cb.cols) physics.remove(c);
        cb.cols = [];
        if (!on) return;
        cb.group.updateMatrixWorld(true);
        const box = (cx, cy, cz, hx, hy, hz) => {
          const b = new THREE.Box3();
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) b.expandByPoint(new THREE.Vector3(cx + sx * hx, cy + sy * hy, cz + sz * hz).applyMatrix4(cb.group.matrixWorld));
          cb.cols.push(physics.add(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, { mat: 'metal', cover: b.max.y < 2 && b.min.y < 0.3 ? 'low' : null }));
        };
        for (let x = -18; x <= 18; x += 2) box(x, 0, 0, 1, 0.8, 0.7);       // viga: 38 x 1,6 x 1,4
        box(-3, -1.4, 0, 1.2, 0.9, 1.1);                                     // talha
      };
      for (const z of [-10.2, -7.8]) B.box(X0 + 0.6, 15.9, z - 0.3, X1 - 0.6, 16.4, z + 0.3, 'metalDark');
    }
    // consoles, caixotes e barris
    solid(-118, 0, 8, -114, 1.1, 10, 'panel', { cover: 'low' });
    solid(-118, 0, -6, -114, 1.1, -4, 'panel', { cover: 'low' });
    solid(-144, 0, 16, -141, 1.1, 18, 'panel', { cover: 'low' });
    for (const [x, z] of [[-139, 21], [-120, 19], [-122, 2], [-138, -9], [-121, -12], [-142, -24], [-118, -24], [-136, 5]]) crate(x, 0, z, 1.3);
    crate(-139, 1.3, 21, 1.1);
    barrel(-124, 0, 21, true); barrel(-140, 0, -2.6, true); barrel(-123.5, 0, -27, false); barrel(-122.8, 0, -27.8, false);
    sandbags(-117, -20, -116.3, -14, 1.1);
    // luzes: fluorescentes (antes do alarme) e emergência vermelha (depois)
    for (const z of [-20, 0, 18]) for (const x of [-140, -120]) {
      B.box(x - 2, 16.6, z - 0.15, x + 2, 16.75, z + 0.15, 'lampWhite');
      L.fluorescents.push(vlight(x, 16.2, z, 0xc8dcff, 700, 30, { glow: false, group: 'ph_fluor' }));
    }
    L.alarmLights.powerhouse = [];
    for (const [x, z] of [[-112, -20], [-148, 0], [-130, 24]]) {
      const v = vlight(x, 8, z, 0xff2a1a, 0, 22, { pulse: 2.5, glowSize: 2, group: 'ph_alarm', stealth: false });
      v.enabled = false; L.alarmLights.powerhouse.push(v);
    }
    // porta leste (breach)
    {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 4), M.metalDark);
      door.position.set(-110, 1.5, -20); scene.add(door);
      const hz = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 4), M.hazard); hz.position.set(0, 0.8, 0); door.add(hz);
      const col = physics.add(-110.3, 0, -22, -109.7, 3, -18, { mat: 'metal' });
      L.doors.powerhouseEast = { mesh: door, col, open: false };
    }
    graffiti(-149.65, 4, 6, Math.PI / 2, 5);
    graffiti(-120, 3.2, 24.65, Math.PI, 4);
    sign(-130, 7.2, 25.35, 0, 'CASA DE MÁQUINAS', 'ACESSO RESTRITO', 3.2);
    sign(-109.65, 3.7, -20, Math.PI / 2, 'CRISTA →', 'SAÍDA LESTE', 1.8);
    sign(-123, 3.6, -30.35, Math.PI, 'SAÍDA NORTE', 'ESTRADA DO RESERVATÓRIO', 1.8);
    L.zones.push({ name: 'powerhouse', minX: X0, maxX: X1, minY: -1, maxY: H, minZ: Z0, maxZ: Z1, indoor: true, ambient: 0.32, reverb: 'hall' });
    L.points.phInside = new THREE.Vector3(-130, 0, 20);
    L.points.phExit = new THREE.Vector3(-108, 0, -20);
    L.points.phSouthDoor = new THREE.Vector3(-130, 0, 27);
    L.points.phNorthDoor = new THREE.Vector3(-123, 0, -33);
    L.points.rpgSpot = new THREE.Vector3(-147.9, 6, -18);
  }
  // estrada do reservatório (rota de flanco até a porta norte)
  {
    B.box(-172, 0, -46, -160, 0.03, 30, 'asphalt');
    B.box(-172, 0, -46, -112, 0.03, -36, 'asphalt');
    for (let z = 20; z > -40; z -= 20) lampPost(-174, z, 1, z === 0);
    lampPost(-140, -46.5, 1);
    jersey(-150, -40); truck(-135, -41, Math.PI / 2 + 0.1);
    container(-158, 0, -10, false, 'green');
  }

  // ---------- SUBESTAÇÃO (J1) ----------
  {
    B.box(-248, 0, 26, -150, 0.03, 96, 'floor', 6);
    const transformer = (x, z) => {
      if (ENV.prop_transformer) {
        solid(x - 2.2, 0, z - 1.6, x + 2.2, 3.6, z + 1.6, 'metalDark', { cover: 'high', noVisual: true });
        physics.add(x - 2.2, 0.3, z - 2.2, x + 2.2, 3.2, z + 2.2, { mat: 'metal', noRay: true, map: false });
        const sz = ENV.prop_transformer.size, k = Math.min(4.6 / sz.x, 3.4 / sz.z);
        envAdd('prop_transformer', x, 0, z, 0, k, 1, k);
        B.box(x - 2.25, 0, z - 1.65, x + 2.25, 0.4, z + 1.65, 'hazard', 1);
        return;
      }
      solid(x - 2.2, 0, z - 1.6, x + 2.2, 3.6, z + 1.6, 'metalDark', { cover: 'high' });
      for (let i = -1.9; i <= 1.9; i += 0.38) { B.box(x + i - 0.04, 0.3, z - 2.2, x + i + 0.04, 3.2, z - 1.6, 'metalDark'); B.box(x + i - 0.04, 0.3, z + 1.6, x + i + 0.04, 3.2, z + 2.2, 'metalDark'); }
      physics.add(x - 2.2, 0.3, z - 2.2, x + 2.2, 3.2, z + 2.2, { mat: 'metal', noRay: true, map: false });
      for (const dx of [-1.3, 0, 1.3]) { cyl(x + dx, 3.6, z, 0.18, 1.3, 'whitePaint', 8); cyl(x + dx, 4.9, z, 0.3, 0.12, 'metalDark', 8); }
      B.box(x - 2.25, 0, z - 1.65, x + 2.25, 0.4, z + 1.65, 'hazard', 1);
    };
    for (const x of [-232, -217, -202, -187]) transformer(x, 46);
    for (const x of [-232, -217, -187]) transformer(x, 68);
    for (const x of [-225, -205]) transformer(x, 86);
    // pórticos de linha
    for (const x of [-232, -202, -172]) {
      solid(x - 0.3, 0, 31.7, x + 0.3, 14, 32.3, 'metalDark', { cover: null });
      solid(x - 0.3, 0, 37.7, x + 0.3, 14, 38.3, 'metalDark', { cover: null });
      B.box(x - 0.25, 13.4, 31.7, x + 0.25, 14, 38.3, 'metalDark');
    }
    // cabos até a casa de máquinas
    for (const zz of [33, 35, 37]) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-232, 13.5, zz), new THREE.Vector3(-202, 12.2, zz), new THREE.Vector3(-172, 13.5, zz), new THREE.Vector3(-150, 15, 20)]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x0a0a0a })));
    }
    // contêineres e pilhas
    container(-170, 0, 44, true, 'red'); container(-170, 0, 52, true, 'blue');
    container(-244, 0, 60, false, 'green'); container(-244, 2.6, 60, false, 'grey');
    container(-160, 0, 88, false, 'grey');
    for (const [x, z] of [[-210, 56], [-194, 57], [-225, 77], [-212, 76], [-180, 62], [-196, 88], [-240, 88], [-165, 70]]) crate(x, 0, z, 1.25);
    crate(-210, 0, 57.4, 1.0); crate(-194, 1.25, 57, 1.0);
    barrel(-178, 0, 47, false); barrel(-178.7, 0, 47.5, false); barrel(-238, 0, 75, true);
    sandbags(-206, 62, -198, 63, 1.0);
    // casa de comando (painel de alarme)
    wallX(-182, -166, 70, 0, 3.6, 0.3, 'concrete', [{ a: -172, b: -169, y0: 1.2, y1: 2.4 }]);
    wallX(-182, -166, 82, 0, 3.6, 0.3, 'concrete', [{ a: -178, b: -175, y0: 1.2, y1: 2.4 }]);
    wallZ(70, 82, -182, 0, 3.6, 0.3, 'concrete', [{ a: 74, b: 76, y0: 0, y1: 2.4 }]);
    wallZ(70, 82, -166, 0, 3.6, 0.3, 'concrete', [{ a: 75, b: 77, y0: 0, y1: 2.4 }]);
    solid(-182.3, 3.6, 69.7, -165.7, 3.9, 82.3, 'concreteDark', { cover: null });
    solid(-181.5, 0, 71, -179.5, 1.0, 74, 'panel', { cover: 'low' });
    solid(-171, 0, 79.5, -168, 0.8, 81.5, 'wood', { cover: 'low' });
    L.points.alarmYard = new THREE.Vector3(-179, 0, 72.5);
    L.points.intel1 = new THREE.Vector3(-169.5, 0.85, 80.5);
    sign(-174, 3, 69.83, Math.PI, 'CASA DE COMANDO', 'SUBESTAÇÃO 230 kV', 2.2);
    sign(-215, 2.4, 44.38, Math.PI, 'PERIGO', 'ALTA TENSÃO — 230 kV', 1.6, ['#d9a40d', '#111', '#111']);
    sign(-217, 2.4, 70.22, 0, 'PERIGO', 'ALTA TENSÃO — 230 kV', 1.6, ['#d9a40d', '#111', '#111']);
    graffiti(-165.85, 1.8, 79, Math.PI / 2, 3.5);
    // holofotes do pátio (apagados: sem energia)
    for (const [x, z] of [[-245, 30], [-152, 30], [-245, 94]]) { solid(x - 0.15, 0, z - 0.15, x + 0.15, 9, z + 0.15, 'metalDark'); B.box(x - 0.6, 9, z - 0.3, x + 0.6, 9.6, z + 0.3, 'lampOff'); }
    L.zones.push({ name: 'yard', minX: -250, maxX: -148, minY: -1, maxY: 30, minZ: 26, maxZ: 96, indoor: false, ambient: 0.08, dark: true, reverb: 'outdoor' });
  }

  // ---------- PERÍMETRO ----------
  {
    const fence = (x0, x1, z) => {
      B.box(x0, 0, z - 0.03, x1, 3, z + 0.03, 'fence', 2.5);
      for (let x = x0; x <= x1; x += 3) B.box(x - 0.05, 0, z - 0.05, x + 0.05, 3.4, z + 0.05, 'metalDark');
      // arame farpado
      B.box(x0, 3.3, z - 0.02, x1, 3.36, z + 0.02, 'metalDark');
      physics.add(x0, 0, z - 0.1, x1, 3.5, z + 0.1, { noRay: true, mat: 'metal', map: true, noMantle: true });
      invis(x0, 3.5, z - 0.1, x1, 5, z + 0.1);
    };
    fence(-258, -238, 100); fence(-233.5, -161, 100); fence(-145, -128, 100);
    // brecha (cerca cortada, pedaço caído)
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3), M.fence); flap.position.set(-235.8, 0.15, 101.4); flap.rotation.x = -Math.PI / 2 + 0.15; scene.add(flap);
    L.points.breach = new THREE.Vector3(-235.8, 0, 100);
    // portão aberto
    for (const [x, rot] of [[-161, -1.2], [-145, 1.2 + Math.PI]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), M.fence); g.position.set(x + (rot < 0 ? 1.5 : -1.5), 1.5, 102.5); g.rotation.y = rot; scene.add(g);
    }
    // estrada de terra acompanhando o relevo
    {
      const pts = [], idx = [], uvs = [];
      let k = 0;
      for (let z = 96; z <= 236; z += 2) {
        for (const x of [-160, -146]) { pts.push(x, physics.terrainH(x, z) + 0.06, z); uvs.push(x / 6, z / 6); }
        if (z > 96) { const b = k - 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        k += 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const road = new THREE.Mesh(g, M.asphalt); road.receiveShadow = true; scene.add(road);
    }
    solid(-162, 0, 99.6, -161, 4.4, 100.4, 'concrete'); solid(-145, 0, 99.6, -144, 4.4, 100.4, 'concrete');
    B.box(-162, 4.0, 99.85, -144, 4.25, 100.15, 'metalDark');
    L.points.gate = new THREE.Vector3(-153, 0, 100);
    // guarita
    wallX(-141, -137, 103, 0, 2.8, 0.2, 'whitePaint', [{ a: -140, b: -138, y0: 1.1, y1: 2.2 }]);
    wallX(-141, -137, 107, 0, 2.8, 0.2, 'whitePaint');
    wallZ(103, 107, -141, 0, 2.8, 0.2, 'whitePaint', [{ a: 104, b: 106, y0: 0, y1: 2.2 }]);
    wallZ(103, 107, -137, 0, 2.8, 0.2, 'whitePaint', [{ a: 104, b: 106, y0: 1.1, y1: 2.2 }]);
    solid(-141.3, 2.8, 102.7, -136.7, 3.0, 107.3, 'metalDark');
    truck(-166, 108, 0.1);
    sandbags(-158, 92, -154, 93); sandbags(-152, 92, -148, 93);
    jersey(-150, 108, true); jersey(-157, 112, true);
    lampPost(-163, 98, 1); lampPost(-143, 98, 1);
    sign(-153, 4.9, 100.2, 0, 'UHE PEDRA FUNDA', 'ÁREA DE SEGURANÇA — IDENTIFIQUE-SE', 3.4);
    // torres de vigia com holofote
    const watchtower = (x, z) => {
      for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) solid(x + dx - 0.12, 0, z + dz - 0.12, x + dx + 0.12, 6, z + dz + 0.12, 'metalDark', { cover: null });
      solid(x - 1.8, 6, z - 1.8, x + 1.8, 6.25, z + 1.8, 'wood', { cover: null });
      for (const [a, b2, c, d] of [[-1.8, -1.8, 1.8, -1.7], [-1.8, 1.7, 1.8, 1.8], [-1.8, -1.8, -1.7, 1.8], [1.7, -1.8, 1.8, 1.8]]) solid(x + a, 6.25, z + b2, x + c, 7.3, z + d, 'plywood', { cover: 'low', thin: true });
      for (const [dx, dz] of [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]]) B.box(x + dx - 0.06, 7.3, z + dz - 0.06, x + dx + 0.06, 9, z + dz + 0.06, 'metalDark');
      solid(x - 2.1, 9, z - 2.1, x + 2.1, 9.2, z + 2.1, 'metalDark');
      return new THREE.Vector3(x, 6.25, z);
    };
    L.points.towerW = watchtower(-212, 96);
    L.points.towerE = watchtower(-133, 96);
  }

  // ---------- FLORESTA / LZ ----------
  {
    const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 3, 6);
    const cone1 = new THREE.ConeGeometry(2.6, 6.5, 7), cone2 = new THREE.ConeGeometry(1.9, 5, 7);
    const trees = [];
    for (let i = 0; i < 2600 && trees.length < 420; i++) {
      const x = R(-300, -100), z = R(104, 300);
      if (x > -164 && x < -142) continue; // estrada
      if (Math.hypot(x + 200, z - 192) < 13) continue; // clareira da LZ
      if (z < 112 && x > -240) continue;
      if (Math.abs(x - gorgeWidth(z) * -1) < 10 || x > -(gorgeWidth(z) + 6)) continue;
      if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 4.2)) continue;
      trees.push([x, z, R(0.8, 1.35)]);
    }
    // mais árvores na margem leste (encosta) para silhueta
    for (let i = 0; i < 900 && trees.length < 560; i++) {
      const x = R(205, 320), z = R(-120, 160);
      if (trees.some((t) => Math.hypot(t[0] - x, t[1] - z) < 5)) continue;
      trees.push([x, z, R(0.9, 1.4)]);
    }
    const useGLB = !!(ENV.tree_pine1 || ENV.tree_pine2);
    if (useGLB) {
      // árvores 3D (variações de pinheiro/abeto e algumas mortas) — a física/cobertura continua a mesma
      trees.forEach(([x, z, sc]) => {
        const y = physics.terrainH(x, z);
        const r = R(0, 1);
        const name = r < 0.07 && ENV.tree_dead ? 'tree_dead' : r < 0.55 && ENV.tree_pine2 ? 'tree_pine2' : ENV.tree_pine1 ? 'tree_pine1' : 'tree_pine2';
        envAdd(name, x, y - 0.15, z, R(0, 6.28), sc * R(0.85, 1.15), sc * R(0.9, 1.25), sc * R(0.85, 1.15));
        if (x < -100) physics.add(x - 0.3 * sc, y - 1, z - 0.3 * sc, x + 0.3 * sc, y + 8 * sc, z + 0.3 * sc, { mat: 'wood', cover: 'high', map: false });
      });
      // arbustos no sub-bosque
      if (ENV.tree_bush) for (let i = 0, put = 0; i < 1800 && put < 320; i++) {
        const x = R(-300, -100), z = R(104, 300);
        if (x > -166 && x < -140) continue; if (Math.hypot(x + 200, z - 192) < 9) continue; if (z < 110 && x > -240) continue;
        if (x > -(gorgeWidth(z) + 6)) continue;
        envAdd('tree_bush', x, physics.terrainH(x, z) - 0.05, z, R(0, 6.28), R(0.7, 1.7), R(0.7, 1.4), R(0.7, 1.7)); put++;
      }
    }
    const n = useGLB ? 0 : trees.length;
    const trunks = new THREE.InstancedMesh(trunkG, M.bark, n), c1 = new THREE.InstancedMesh(cone1, M.foliage, n), c2 = new THREE.InstancedMesh(cone2, M.foliage, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    if (!useGLB) trees.forEach(([x, z, sc], i) => {
      const y = physics.terrainH(x, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R(0, 6));
      s.set(sc, sc, sc);
      m.compose(p.set(x, y + 1.5 * sc, z), q, s); trunks.setMatrixAt(i, m);
      m.compose(p.set(x, y + 5 * sc, z), q, s); c1.setMatrixAt(i, m);
      m.compose(p.set(x, y + 8.2 * sc, z), q, s); c2.setMatrixAt(i, m);
      if (x < -100) physics.add(x - 0.3 * sc, y - 1, z - 0.3 * sc, x + 0.3 * sc, y + 8 * sc, z + 0.3 * sc, { mat: 'wood', cover: 'high', map: false });
    });
    for (const im of [trunks, c1, c2]) { im.castShadow = true; im.receiveShadow = true; im.count = n; scene.add(im); }
    for (let i = 0; i < 46; i++) {
      const x = R(-255, -112), z = R(112, 228);
      if (x > -164 && x < -142) continue;
      if (x > -(gorgeWidth(z) + 6)) continue;
      rock(x, z, R(0.7, 2.0));
    }
    L.points.lz = new THREE.Vector3(-200, physics.terrainH(-200, 192), 192);
    L.points.crash = new THREE.Vector3(-246, physics.terrainH(-246, 132), 132);
  }

  // ---------- MARGEM LESTE ----------
  {
    solid(96, -1, -12, 114, 0, 12, 'floor', { cover: null });
    B.box(100, 0, -6, 160, 0.03, 6, 'asphalt');
    B.box(150, 0, 6, 160, 0.03, 150, 'asphalt');
    B.box(140, 0, -60, 150, 0.03, -24, 'asphalt');
    // ALOJAMENTOS / REFEITÓRIO
    {
      const X0 = 112, X1 = 140, Z0 = 16, Z1 = 40, H = 4.5;
      solid(X0, -0.3, Z0, X1, 0.05, Z1, 'floor', { cover: null });
      wallZ(Z0, Z1, X0, 0, H, 0.3, 'concrete', [{ a: 26, b: 29, y0: 0, y1: 2.6 }, { a: 33, b: 36, y0: 1.2, y1: 2.4 }]);
      wallZ(Z0, Z1, X1, 0, H, 0.3, 'concrete', [{ a: 22, b: 25, y0: 1.2, y1: 2.4 }]);
      wallX(X0, X1, Z0, 0, H, 0.3, 'concrete', [{ a: 124, b: 127, y0: 0, y1: 2.6 }, { a: 131, b: 136, y0: 1.2, y1: 2.4 }, { a: 115, b: 119, y0: 1.2, y1: 2.4 }]);
      wallX(X0, X1, Z1, 0, H, 0.3, 'concrete', [{ a: 132, b: 135, y0: 0, y1: 2.6 }]);
      wallZ(Z0, Z1, 124, 0, H, 0.25, 'whitePaint', [{ a: 30, b: 32.5, y0: 0, y1: 2.5 }, { a: 20, b: 22.5, y0: 0, y1: 2.5 }]);
      solid(X0 - 0.3, H, Z0 - 0.3, X1 + 0.3, H + 0.35, Z1 + 0.3, 'concreteDark', { cover: null });
      // beliches e armários (alojamento)
      for (const z of [18.5, 23.5, 34, 38]) { solid(113, 0, z - 0.6, 117, 1.6, z + 0.6, 'metal', { cover: 'high' }); }
      for (let z = 17; z < 39; z += 1.1) if (z < 25 || z > 33) B.box(122.6, 0, z, 123.6, 2, z + 1, 'metalDark');
      physics.add(122.6, 0, 16.5, 123.6, 2, 25, { mat: 'metal', cover: 'high' });
      physics.add(122.6, 0, 33, 123.6, 2, 39.5, { mat: 'metal', cover: 'high' });
      // refeitório: mesas
      for (const [x, z] of [[128, 21], [128, 27], [128, 33], [135, 21], [135, 27], [135, 33]]) {
        solid(x - 2, 0, z - 0.6, x + 2, 0.78, z + 0.6, 'wood', { cover: 'low', unit: true });
      }
      solid(137.8, 0, 36, 139.8, 1.2, 39.6, 'metal', { cover: 'low' });
      for (const [x, z] of [[118, 28], [133, 28], [128, 37]]) vlight(x, 4.1, z, 0xffe2b0, 160, 14, { glowSize: 0.8 });
      for (const [x, z] of [[118, 28], [133, 28], [128, 37]]) B.box(x - 0.6, 4.35, z - 0.15, x + 0.6, 4.45, z + 0.15, 'lampWhite');
      L.points.intel2 = new THREE.Vector3(128, 0.82, 27);
      sign(112.35 - 0.5, 3.4, 27.5, -Math.PI / 2, 'ALOJAMENTOS', 'REFEITÓRIO', 2.2);
      graffiti(139.8, 2, 30, -Math.PI / 2, 4);
      L.zones.push({ name: 'barracks', minX: X0, maxX: X1, minY: -1, maxY: H, minZ: Z0, maxZ: Z1, indoor: true, ambient: 0.4, reverb: 'room' });
    }
    // SALA DE CONTROLE
    {
      const X0 = 114, X1 = 146, Z0 = -24, Z1 = 4, H = 6;
      solid(X0, -0.3, Z0, X1, 0.05, Z1, 'floor', { cover: null });
      wallZ(Z0, Z1, X0, 0, H, 0.35, 'concrete', [{ a: -12, b: -9, y0: 0, y1: 2.6 }, { a: -22, b: -14, y0: 1.2, y1: 4.2 }, { a: -7, b: 2, y0: 1.2, y1: 4.2 }]);
      wallZ(Z0, Z1, X1, 0, H, 0.35, 'concrete', [{ a: -10, b: -7, y0: 0, y1: 2.6 }]);
      wallX(X0, X1, Z0, 0, H, 0.35, 'concrete', [{ a: 118, b: 142, y0: 1.2, y1: 4.2 }]);
      wallX(X0, X1, Z1, 0, H, 0.35, 'concrete', [{ a: 128, b: 132, y0: 0, y1: 2.8 }, { a: 117, b: 125, y0: 1.2, y1: 4.2 }, { a: 135, b: 143, y0: 1.2, y1: 4.2 }]);
      solid(X0 - 0.4, H, Z0 - 0.4, X1 + 0.4, H + 0.4, Z1 + 0.4, 'concreteDark', { cover: null });
      // vidros (atravessáveis)
      for (const [a, b] of [[-22, -14], [-7, 2]]) solid(X0 - 0.05, 1.2, a, X0 + 0.05, 4.2, b, 'glass', { cover: null, thin: true, mt: 'glass', noVisual: false });
      solid(118, 1.2, Z0 - 0.05, 142, 4.2, Z0 + 0.05, 'glass', { cover: null, thin: true, mt: 'glass' });
      // consoles (fileiras)
      for (const z of [-15, -9, -3]) { solid(119, 0, z - 0.6, 128, 1.05, z + 0.6, 'panel', { cover: 'low' }); solid(132, 0, z - 0.6, 141, 1.05, z + 0.6, 'panel', { cover: 'low' }); }
      solid(130, 0, -22, 138, 1.3, -20.4, 'panel', { cover: 'low' });
      B.box(130, 1.3, -22, 138, 2.6, -21.7, 'panel');
      L.points.masterConsole = new THREE.Vector3(134, 0, -19.6);
      // painel mímico na parede
      B.box(120, 3, -23.8, 130, 5.4, -23.6, 'panel');
      // armário de armas (RPL-2)
      solid(144.6, 0, -4, 145.8, 2.2, -1, 'metalDark', { cover: 'high' });
      L.points.rocketLocker = new THREE.Vector3(144, 0, -2.5);
      L.points.ammoControl = new THREE.Vector3(117, 0, 1.5);
      L.controlLights = [];
      for (const [x, z] of [[123, -18], [137, -18], [123, -5], [137, -5]]) {
        L.controlLights.push(vlight(x, 5.6, z, 0xd8ecff, 220, 16, { glowSize: 0.8, group: 'ctrl' }));
        B.box(x - 1, 5.9, z - 0.2, x + 1, 6.0, z + 0.2, 'lampWhite');
      }
      L.controlLights.push(vlight(134, 2.2, -20, 0x22d0d0, 25, 9, { glow: false, group: 'ctrl' }));
      sign(130, 3.6, 4.4, 0, 'SALA DE CONTROLE', 'CENTRO DE OPERAÇÃO DA USINA', 2.6);
      L.zones.push({ name: 'control', minX: X0, maxX: X1, minY: -1, maxY: H, minZ: Z0, maxZ: Z1, indoor: true, ambient: 0.45, reverb: 'room' });
      L.points.control = new THREE.Vector3(130, 0, -10);
      L.points.controlDoor = new THREE.Vector3(130, 0, 6);
    }
    // pátio entre os prédios
    for (const [x, z] of [[118, 10], [124, 12.5], [140, 9.5], [146, 12]]) solid(x - 1.2, 0, z - 0.6, x + 1.2, 0.9, z + 0.6, 'concreteDark', { cover: 'low' });
    truck(152, 22, 0.05);
    for (const [x, z] of [[136, 13], [109, 22], [109, 35]]) crate(x, 0, z, 1.25);
    lampPost(110, 8, 1); lampPost(148, 8, -1); lampPost(155, 40, 1, true); lampPost(155, 80, 1); lampPost(145, -40, 1);
    jersey(155, 60, false); jersey(152, 100, true); jersey(158, 120, true); sandbags(150, 70, 154, 71);
    container(165, 0, 45, false, 'red'); container(170, 0, 70, true, 'blue');
    // HELIPONTO
    {
      solid(160, -0.5, -16, 186, 0.3, 10, 'helipad', { cover: null, unit: true });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        vlight(173 + Math.cos(a) * 12, 0.45, -3 + Math.sin(a) * 12, i % 2 ? 0x3dff7a : 0xf0f0ff, 3, 4, { glowSize: 0.6, stealth: false, priority: 0.2 });
      }
      L.points.helipad = new THREE.Vector3(173, 0.3, -3);
      sign(160.2, 1.4, 12, 0, 'HELIPONTO', 'H-01', 1.6);
    }
    // cais norte
    B.box(100, -1.0, -58, 108, -0.6, -52, 'wood');
    B.box(108, -0.6, -57, 122, 0.02, -53, 'wood');
    L.points.dock = new THREE.Vector3(124, 0, -50);
    L.points.southRoad = new THREE.Vector3(155, 0, 120);
    L.points.coruja = new THREE.Vector3(250, physics.terrainH(250, 15) + 1.6, 15);
    L.zones.push({ name: 'east', minX: 96, maxX: 230, minY: -1, maxY: 40, minZ: -80, maxZ: 160, indoor: false, ambient: 0.22, reverb: 'outdoor' });
  }

  // ---------- limites invisíveis ----------
  invis(-264, -2, -60, -262, 40, 240); invis(-264, -2, 236, -100, 40, 238);
  invis(-264, -2, -62, -110, 40, -55);
  for (let z = 14; z < 236; z += 8) { const gw = gorgeWidth(z + 4); invis(-(gw + 7), -5, z, -(gw + 5), 30, z + 8); }
  invis(96, -2, -62, 230, 40, -60); invis(214, -2, -62, 216, 60, 160); invis(96, -2, 150, 216, 40, 152);
  for (let z = 12; z < 152; z += 8) { const gw = gorgeWidth(z + 4); invis(gw + 5, -5, z, gw + 7, 30, z + 8); }
  for (let z = -62; z < -10; z += 6) { const gw = gorgeWidth(z + 3); invis(gw + 4, -5, z, gw + 6, 30, z + 6); }
  invis(-100, 0, 12, -96, 3, 14.5);

  // ---------- jammers ----------
  const makeJammer = (id, x, y, z, name) => {
    const grp = new THREE.Group();
    const mk = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; grp.add(m); return m; };
    mk(new THREE.BoxGeometry(1.2, 0.9, 0.8), M.jammer, 0, 0.45, 0);
    mk(new THREE.BoxGeometry(0.9, 0.7, 0.7), M.oliveDark, 1.3, 0.35, 0.1);
    mk(new THREE.CylinderGeometry(0.05, 0.08, 5.5, 6), M.metalDark, 0, 3.6, 0);
    for (const [ry, h] of [[0, 4.4], [1.2, 5.2], [2.4, 6.0]]) {
      const arm = mk(new THREE.BoxGeometry(1.4, 0.06, 0.06), M.metalDark, 0, h, 0); arm.rotation.y = ry;
      for (const s of [-0.7, 0.7]) { const a = mk(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), M.black, Math.cos(ry) * s, h + 0.45, -Math.sin(ry) * s); }
    }
    const leds = [];
    for (const h of [0.95, 6.4]) { leds.push(mk(new THREE.BoxGeometry(0.16, 0.16, 0.16), M.lampRed, 0, h, 0)); }
    grp.position.set(x, y, z);
    scene.add(grp);
    physics.add(x - 0.6, y, z - 0.4, x + 1.75, y + 0.9, z + 0.45, { mat: 'metal', cover: 'low' });
    const light = vlight(x, y + 1.6, z, 0xff2a1a, 70, 9, { pulse: 2, glowSize: 1.2, stealth: false });
    const j = { id, name, pos: new THREE.Vector3(x, y, z), group: grp, leds, light, progress: 0, disabled: false, radius: 2.6 };
    L.jammers.push(j);
    return j;
  };
  makeJammer(1, -202, 0, 62, 'Subestação');
  makeJammer(2, -2.2, 2.0, 3.0, 'Crista');
  makeJammer(3, 40, 18, 2, 'Torre das comportas');

  // ---------- holofotes (virtuais, com cone visível) ----------
  const beamMat = (color, strength = 0.22) => makeBeamMaterial(color, strength);
  const searchlight = (x, y, z, baseYaw, sweep, pitch, o = {}) => {
    const len = o.len || 45, ang = o.angle || 0.2;
    const geo = new THREE.ConeGeometry(Math.tan(ang) * len, len, 24, 1, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(geo, beamMat(0xdde8ff));
    cone.material.uniforms.uLen.value = len;
    cone.position.set(x, y, z);
    scene.add(cone);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.7, 12), M.metalDark);
    head.rotation.x = Math.PI / 2; const hg = new THREE.Group(); hg.add(head); hg.position.set(x, y, z); scene.add(hg);
    const lens = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: 0xeef4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    lens.scale.setScalar(2.2); scene.add(lens);
    const sl = { pos: new THREE.Vector3(x, y, z), yaw: baseYaw, baseYaw, sweep, pitch, basePitch: pitch, speed: o.speed || 0.25, phase: R(0, 6), angle: ang, range: len, cone, head: hg, lens, enabled: true, intensity: o.intensity || 900, target: null, color: 0xdde8ff, dir: new THREE.Vector3(), owner: null };
    L.searchlights.push(sl);
    return sl;
  };
  L.slTowerW = searchlight(-212, 7.6, 97.2, 0, 0.9, -0.24);
  L.slTowerE = searchlight(-133, 7.6, 97.2, 0, 0.9, -0.24);
  L.slCrest = searchlight(20, 11.6, 0, -Math.PI / 2, 0.5, -0.2, { len: 60, speed: 0.18 });
  L.slIntake = searchlight(-50, 13.2, -36, 0.5, 0.7, -0.22, { len: 55 });

  // ---------- caixas de munição e intel ----------
  const ammoCrate = (x, y, z) => {
    if (ENV.prop_ammo) { const sz = ENV.prop_ammo.size, k = 1.05 / Math.max(sz.x, sz.z); envAdd('prop_ammo', x, y, z, R(-0.25, 0.25), k, 0.5 / sz.y, k); }
    else { B.box(x - 0.5, y, z - 0.3, x + 0.5, y + 0.45, z + 0.3, 'olive'); B.box(x - 0.52, y + 0.3, z - 0.32, x + 0.52, y + 0.36, z + 0.32, 'hazard', 1); }
    physics.add(x - 0.5, y, z - 0.3, x + 0.5, y + 0.45, z + 0.3, { mat: 'metal', cover: 'low' });
    L.ammoCrates.push({ pos: new THREE.Vector3(x, y + 0.45, z), used: false });
  };
  ammoCrate(-176, 0, 66); ammoCrate(-106, 0, -16); ammoCrate(33, 0, 7.5); ammoCrate(117, 0, 1.5); ammoCrate(110, 0, 30); ammoCrate(143, 0, -15);
  const intel = (p, title, text) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.42), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, emissive: 0x332a10, emissiveIntensity: 0.6 }));
    m.position.copy(p); m.rotation.y = R(0, 3); scene.add(m);
    L.intel.push({ pos: p.clone(), mesh: m, title, text, taken: false });
  };
  intel(L.points.intel1, 'Ordem de operação — Os Afogados', 'J1 na subestação, J2 na crista, J3 na torre CG. O J3 não é só um bloqueador: se cair, o sinal dispara a sequência das comportas. Ninguém toca no J3. — B.');
  intel(new THREE.Vector3(-115.5, 1.12, 9), 'Diário do engenheiro de turno', '"Eles chegaram às 21h. O homem que manda conhece cada válvula daqui pelo nome. Disse que o pai dele morreu em Velhaia, na enchente de 96. Pediu que eu ensinasse a sequência de fundo."');
  intel(L.points.intel2, 'Mapa rabiscado da galeria G-2', 'Galeria G-2 liga o poço do elevador da torre CG à face jusante. Comportas de fundo inundam a galeria em menos de 2 minutos. Anotação: "boa rota de fuga — se a água deixar".');

  // ---------- pontos utilitários ----------
  L.points.yardCenter = new THREE.Vector3(-205, 0, 60);
  L.points.crestWest = new THREE.Vector3(-96, 0, 0);
  L.points.crestEast = new THREE.Vector3(96, 0, 0);
  L.points.towerBase = new THREE.Vector3(46, 0, 9);
  L.points.towerRoof = new THREE.Vector3(40, 18, 0);
  L.points.machineHouse = new THREE.Vector3(40, 12.5, 4);

  B.build();
  L.batcher = B;

  // destrutíveis (caixotes, barris)
  L.damageDestructible = (c, dmg, point) => {
    if (!c.active || c.hp === undefined) return;
    c.hp -= dmg;
    if (c.hp > 0) return;
    physics.remove(c);
    if (c.mesh) scene.remove(c.mesh);
    const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2, cz = (c.minZ + c.maxZ) / 2;
    const fx = G.fx;
    if (fx) {
      const col = c.mat === 'wood' ? [0.35, 0.26, 0.16] : [0.3, 0.3, 0.3];
      for (let i = 0; i < 26; i++) fx.norm.spawn(cx + R(-0.4, 0.4), cy + R(-0.3, 0.3), cz + R(-0.4, 0.4), R(-4, 4), R(1, 6), R(-4, 4), R(0.6, 1.4), R(0.08, 0.2), col[0], col[1], col[2], 1, 12, 0.6);
      for (let i = 0; i < 10; i++) fx.norm.spawn(cx, cy, cz, R(-1, 1), R(0.5, 2), R(-1, 1), R(1, 2), R(0.5, 1), 0.3, 0.28, 0.25, 0.4, -0.2, 1, 1);
    }
    G.audio && G.audio.impact(new THREE.Vector3(cx, cy, cz), c.mat === 'wood' ? 'wood' : 'metal');
    if (c.explosive) setTimeout(() => G.weapons.explode(new THREE.Vector3(cx, c.minY + 0.3, cz), 'barrel', 'player'), 120);
  };

  // ---------- animações do nível ----------
  L.update = (dt, time) => {
    for (const t of L.dyn.turbines) t.mesh.rotation.y += t.speed * dt;
    if (L.waterMat) { T.waterN.offset.x = time * 0.004; T.waterN.offset.y = time * 0.011; }
    const sp = L.dyn.spill;
    if (sp.on > 0) { T.foam.offset.y -= dt * 1.8; sp.mat.opacity = Math.min(0.85, sp.mat.opacity + dt * 0.25); }
    for (const g of L.dyn.gates) { g.mesh.position.y = lerp(g.mesh.position.y, g.base + g.open * 10.5, Math.min(1, dt * 0.25)); }
    // feixe da ponte rolante caindo
    const cb = L.dyn.craneBeam;
    if (cb.falling && !cb.done) {
      cb.t += dt;
      const t = Math.min(1, cb.t / 1.25);
      cb.group.position.y = 15 - (15 - 0.8) * t * t;
      cb.group.rotation.z = -0.22 * t; cb.group.rotation.x = 0.1 * t;
      if (t >= 1) { cb.done = true; cb.onLand && cb.onLand(); }
    }
    // jammers piscando
    for (const j of L.jammers) {
      const on = !j.disabled && Math.sin(time * 6 + j.id) > 0;
      for (const l of j.leds) l.material = on ? M.lampRed : M.lampOff;
    }
    // elevador
    const el = L.dyn.elevator;
    if (el.moving) {
      el.y = Math.max(el.bottom, el.y - dt * el.speed);
      el.car.position.y = el.y;
      physics.moveTo(el.col, 38.05, el.y - 0.3, -6.95, 41.95, el.y, -3.05);
      if (el.y <= el.bottom) { el.moving = false; el.onArrive && el.onArrive(); }
    }
  };
  // ---------- decoração 3D (geradores, holofotes, barris, caixas, tendas) ----------
  {
    const decor = (name, x, z, rot, w, d, h, cover = 'low') => {
      const m = ENV[name]; if (!m) return;
      const y = physics.groundHeight(x, z, 6, 0.1); const gy = y > -1e8 ? y : 0;
      const k = Math.min(w / m.size.x, d / m.size.z, 4);
      envAdd(name, x, gy, z, rot, k, k, k);
      const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot)), hw = (w * c + d * sn) / 2, hd = (w * sn + d * c) / 2;
      physics.add(x - hw, gy, z - hd, x + hw, gy + h, z + hd, { mat: 'metal', cover });
    };
    // subestação
    decor('prop_generator', -174, 66.6, 0.1, 2.4, 1.3, 1.5);
    decor('prop_barrel', -238, 36, 0.4, 1.5, 1.5, 1.0); decor('prop_barrel', -160, 56, 1.2, 1.5, 1.5, 1.0); decor('prop_barrel', -233, 92, 2.0, 1.5, 1.5, 1.0);
    decor('prop_crate', -242, 44, 0.2, 1.6, 1.6, 1.4); decor('prop_crate', -166, 36, 0.5, 1.6, 1.6, 1.4);
    decor('prop_floodlight', -241, 30.5, 0.5, 1.2, 1.2, 3.6, 'high'); decor('prop_floodlight', -157, 30.5, -0.5, 1.2, 1.2, 3.6, 'high'); decor('prop_floodlight', -241, 92, 2.4, 1.2, 1.2, 3.6, 'high');
    // margem leste / pátio do alojamento
    decor('prop_generator', 146, -12, 1.5, 2.4, 1.3, 1.5); decor('prop_barrel', 137, 44, 0.8, 1.5, 1.5, 1.0);
    decor('prop_tent', 118, 48, 0.3, 4.2, 3.2, 2.4, 'high'); decor('prop_crate', 148, 22, 0.9, 1.6, 1.6, 1.4);
    decor('prop_floodlight', 148, 40, 2.8, 1.2, 1.2, 3.6, 'high');
  }
  // modelos 3D instanciados (árvores, arbustos, pedras, transformadores)
  L.envMeshes = [];
  for (const [name, items] of Object.entries(envItems)) {
    if (!ENV[name]) continue;
    const tree = name.startsWith('tree_') && name !== 'tree_bush';
    L.envMeshes.push(...addInstanced(scene, ENV[name], items, { cell: tree ? 55 : 80, cast: name !== 'tree_bush', receive: true }));
  }
  return L;
}

// feixe volumétrico falso: forte no ápice, some no fim e nas bordas (fresnel)
export function makeBeamMaterial(color, strength = 0.22) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uLen: { value: 45 } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ vT = position.z; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uStrength, uLen; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ float t = clamp(vT / uLen, 0.0, 1.0); float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
        float a = uStrength * pow(1.0 - t, 1.6) * (1.0 - edge * 0.85) * smoothstep(0.0, 0.03, t);
        gl_FragColor = vec4(uColor * a, 1.0); }`,
  });
}

export function setFlood(L, level) {
  const f = L.dyn.flood;
  f.level = level; f.zone.level = level; f.mesh.position.y = level;
  f.mesh.visible = level > -22.2;
}

// estado do mundo a partir das flags da missão (usado em checkpoints)
export function applyWorldFlags(G, f) {
  const L = G.level, P = G.physics;
  for (const j of L.jammers) {
    const off = !!f['jammer' + j.id];
    j.disabled = off; j.progress = off ? 1 : 0;
    j.light.enabled = !off;
  }
  // ponte
  const broken = !!f.bridgeBroken;
  for (const seg of L.dyn.bridge) {
    if (seg.a === 60 || seg.a === 70) {
      seg.deck.visible = !broken;
      for (const c of seg.cols) broken ? P.remove(c) : P.restore(c);
    }
  }
  if (L.dyn.rubble) L.dyn.rubble.visible = broken;
  for (const g of L.dyn.gates) g.open = f.gatesOpen && !f.gatesLocked ? 1 : 0;
  L.dyn.spill.on = f.gatesOpen && !f.gatesLocked ? 1 : 0;
  if (!L.dyn.spill.on) L.dyn.spill.mat.opacity = 0;
  // porta da casa de máquinas
  const d = L.doors.powerhouseEast;
  if (f.phDoorOpen) { d.mesh.visible = false; P.remove(d.col); } else { d.mesh.visible = true; P.restore(d.col); }
  // ponte rolante
  const cb = L.dyn.craneBeam;
  if (f.craneFallen) {
    cb.falling = true; cb.done = true;
    cb.group.position.y = 0.8; cb.group.rotation.z = -0.22; cb.group.rotation.x = 0.1;
    if (!cb.cols.length) L.setCraneCol(true);
  } else {
    cb.falling = false; cb.done = false; cb.t = 0;
    cb.group.position.y = 15; cb.group.rotation.set(0, 0, 0);
    L.setCraneCol(false);
  }
  // alarme da casa de máquinas
  for (const v of L.fluorescents) v.enabled = !f.phAlarm;
  for (const v of L.alarmLights.powerhouse) { v.enabled = !!f.phAlarm; v.intensity = f.phAlarm ? 420 : 0; }
  // energia da sala de controle
  for (const v of L.controlLights) v.enabled = !f.blackout;
  // elevador
  const el = L.dyn.elevator;
  el.moving = false;
  el.y = f.elevatorDown ? el.bottom : el.top;
  el.car.position.y = el.y;
  P.moveTo(el.col, 38.05, el.y - 0.3, -6.95, 41.95, el.y, -3.05);
  // água na galeria
  setFlood(L, f.floodLevel ?? -23);
  L.towerBeacon.enabled = true;
}
