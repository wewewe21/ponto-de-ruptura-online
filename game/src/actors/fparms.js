// Braços em primeira pessoa com a malha do soldado (manga + luva com a textura gerada) e IK nas empunhaduras da arma.
// Recorta os triângulos dos braços E das mãos da malha do soldado e os liga a um esqueleto próprio, posicionado atrás/abaixo da câmera.
// O rig do soldado não tem dedos: a mão (rígida, em T-pose) ganha dois ossos extras de "dedos" (ponto médio e ponta), com pesos
// pela posição ao longo da mão, para poder fechar em volta da empunhadura.
import * as THREE from 'three';
import { meshSoldiers } from './meshsoldier.js';
import { solveArm, worldQ, HAND_R, HAND_L } from './ik.js';
import { smoothstep } from '../core/utils.js';

const NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const PARENT = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot' };
const ARM = new Set(['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftHand', 'RightHand']);
const RY_PI = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i]));

// Por lado: ossos de dedos adicionais (índices logo após os 22 do rig).
const FINGER = { Left: ['LeftFingers1', 'LeftFingers2'], Right: ['RightFingers1', 'RightFingers2'] };
const ALL = [...NAMES, ...FINGER.Left, ...FINGER.Right];
for (let i = NAMES.length; i < ALL.length; i++) IDX[ALL[i]] = i;

// Mede a mão rígida da malha: pulso, direção dos dedos, comprimento e pontos de articulação dos dedos.
function measureHand(g, side) {
  const p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const hb = IDX[side + 'Hand'], pts = [];
  for (let i = 0; i < p.count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (si.array[i * 4 + k] === hb) w += sw.array[i * 4 + k];
    if (w > 0.3) pts.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  }
  if (pts.length < 20) return null;
  const sg = side === 'Left' ? 1 : -1;
  // direção: do pulso (extremo interno) à ponta (extremo externo), no plano XY
  const c = pts.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const axis = new THREE.Vector3(sg, 0, 0);
  const proj = pts.map((v) => v.clone().sub(c).dot(axis));
  const ord = proj.map((t, i) => [t, i]).sort((a, b) => a[0] - b[0]);
  const n = ord.length, take = Math.max(8, Math.floor(n * 0.15));
  const inner = new THREE.Vector3(), outer = new THREE.Vector3();
  for (let i = 0; i < take; i++) { inner.add(pts[ord[i][1]]); outer.add(pts[ord[n - 1 - i][1]]); }
  inner.multiplyScalar(1 / take); outer.multiplyScalar(1 / take);
  const d = outer.clone().sub(inner); d.z = 0; d.normalize();
  const t = (v) => v.clone().sub(inner).dot(d);
  const L = Math.max(...pts.map(t));
  const at = (lo, hi) => {
    const a = new THREE.Vector3(); let m = 0;
    for (const v of pts) { const tt = t(v) / L; if (tt >= lo && tt <= hi) { a.add(v); m++; } }
    return m ? a.multiplyScalar(1 / m) : inner.clone().addScaledVector(d, L * (lo + hi) / 2);
  };
  const wrist = at(-1, 0.12);
  return { wrist, d, L, f1: at(0.34, 0.46), f2: at(0.64, 0.76), t: (v) => v.clone().sub(wrist).dot(d) / L };
}

export class FPArms {
  // devolve null se a malha do soldado ainda não carregou
  static create(scene, style = 'ally1') {
    const S = meshSoldiers.soldiers[style] || meshSoldiers.soldiers.enemy || Object.values(meshSoldiers.soldiers)[0];
    if (!S) return null;
    return new FPArms(scene, S);
  }
  constructor(scene, S) {
    this.S = S;
    const g = S.geo, p = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const idx = g.index ? g.index.array : null, tri = (idx ? idx.length : p.count) / 3;
    const armName = (k) => NAMES[k];
    const armW = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (ARM.has(armName(si.array[i * 4 + k]))) w += sw.array[i * 4 + k]; return w; };
    const hands = { Left: measureHand(g, 'Left'), Right: measureHand(g, 'Right') };
    this.hands = hands;
    const P = [], N = [], U = [], SI = [], SW = [];
    const vi = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k);
    const pv = new THREE.Vector3();
    for (let t = 0; t < tri; t++) {
      const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
      if ((armW(a) + armW(b) + armW(c)) / 3 < 0.7) continue;
      for (const i of [a, b, c]) {
        pv.set(p.getX(i), p.getY(i), p.getZ(i));
        P.push(pv.x, pv.y, pv.z); if (nor) N.push(nor.getX(i), nor.getY(i), nor.getZ(i)); if (uv) U.push(uv.getX(i), uv.getY(i));
        // pesos: o osso da mão reparte sua influência com os dois ossos de dedos
        const list = [];
        for (let k = 0; k < 4; k++) list.push([si.array[i * 4 + k], sw.array[i * 4 + k]]);
        for (const side of ['Left', 'Right']) {
          const H = hands[side]; if (!H) continue;
          const e = list.find((x) => x[0] === IDX[side + 'Hand']); if (!e || e[1] <= 0) continue;
          const tt = H.t(pv), a1 = smoothstep(0.3, 0.5, tt), a2 = smoothstep(0.58, 0.85, tt);
          const w = e[1]; e[1] = w * (1 - a1);
          list.push([IDX[FINGER[side][0]], w * a1 * (1 - a2)], [IDX[FINGER[side][1]], w * a1 * a2]);
        }
        list.sort((x, y) => y[1] - x[1]);
        const top = list.slice(0, 4), sum = top.reduce((s, x) => s + x[1], 0) || 1;
        for (const [bi, bw] of top) { SI.push(bi); SW.push(bw / sum); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (N.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (U.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.3, 0), 3);
    // juntas do esqueleto de primeira pessoa: as do rig, com o pulso e os dedos ajustados à malha da mão
    const J = {}; for (const k of Object.keys(S.J)) J[k] = S.J[k].slice();
    this.rest = {};
    for (const side of ['Left', 'Right']) {
      const H = hands[side]; if (!H) continue;
      J[side + 'Hand'] = [H.wrist.x, H.wrist.y, H.wrist.z];
      J[FINGER[side][0]] = [H.f1.x, H.f1.y, H.f1.z]; J[FINGER[side][1]] = [H.f2.x, H.f2.y, H.f2.z];
      // alinha o eixo da mão (inclinado para baixo na T-pose) ao eixo X do osso: a correção entra na orientação da mão
      const sg = side === 'Left' ? 1 : -1;
      const ang = Math.atan2(0, sg) - Math.atan2(H.d.y, H.d.x);
      this.rest[side] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
      // o antebraço termina no pulso: leva a junta do cotovelo para o eixo real do braço (a média do rig ignora a inclinação em Z)
      const fa = J[side + 'ForeArm'], ar = J[side + 'Arm'];
      const k = (fa[0] - ar[0]) / ((H.wrist.x - ar[0]) || 1);
      fa[2] = ar[2] + (H.wrist.z - ar[2]) * k;
    }
    // esqueleto
    this.root = new THREE.Group();
    this.bones = {}; const all = [];
    for (const nm of ALL) { const b = new THREE.Bone(); b.name = 'fp_' + nm; this.bones[nm] = b; all.push(b); }
    const parentOf = (nm) => PARENT[nm] || (nm.endsWith('Fingers1') ? nm.slice(0, -8) + 'Hand' : nm.endsWith('Fingers2') ? nm.slice(0, -1) + '1' : null);
    for (const nm of ALL) {
      const par = parentOf(nm), b = this.bones[nm], j = J[nm];
      if (!par) { b.position.set(...j); this.root.add(b); } else { const pj = J[par]; b.position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]); this.bones[par].add(b); }
    }
    this.root.updateMatrixWorld(true);
    this.mat = S.mat.clone(); this.mat.color.setScalar(0.8); this.mat.envMapIntensity = 0.2; this.mat.metalness = 0; this.mat.roughness = 1;
    this.mesh = new THREE.SkinnedMesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.bind(new THREE.Skeleton(all), new THREE.Matrix4());
    // modelo olha +Z; a câmera do viewmodel olha -Z → gira 180°; ombros ~20 cm para os lados, 18 cm abaixo do olho
    this.root.rotation.y = Math.PI;
    const arm = J.LeftArm, K = 1.5;      // braços maiores que o natural; os ombros ficam à frente e abaixo da câmera para as mãos alcançarem a arma sem mangas enormes
    this.root.scale.setScalar(K);
    this.root.position.set(0, -0.55 - K * arm[1], K * arm[2] - 0.78);   // ombros bem abaixo da câmera: as pontas cortadas das mangas ficam fora da tela
    scene.add(this.root);
    this.visible = true;
    this.curl = { Left: [0.8, 0.8], Right: [1.0, 0.9] };   // ângulos atuais (rad) das duas juntas dos dedos
  }
  setVisible(v) { this.root.visible = v; this.visible = v; }
  // g: grupo da arma (espaço do viewmodel, cano em -Z); anchors: { rightHome, leftHome, rightCurl, leftCurl } no espaço da arma
  update(g, anchors, leftOverride) {
    if (!this.visible) return;
    g.updateWorldMatrix(true, true);
    this.root.updateMatrixWorld(true);
    const b = this.bones;
    const hs = anchors.handScale ?? 0.6;   // mãos um pouco menores em armas compactas
    b.RightHand.scale.setScalar(hs); b.LeftHand.scale.setScalar(hs);
    // o punho fica um pouco atrás da empunhadura (a mão se estende para a frente a partir dele)
    const rOff = anchors.rightWrist || _v.set(0, 0.0, 0.09), rT = g.localToWorld(anchors.rightHome.clone().add(rOff));
    const lOff = anchors.leftWrist || new THREE.Vector3(0, 0.0, 0.14), lT = g.localToWorld((leftOverride || anchors.leftHome || anchors.rightHome).clone().add(lOff));
    solveArm(b.RightArm, b.RightForeArm, b.RightHand, rT, new THREE.Vector3(0.5, -1, 0.4));
    solveArm(b.LeftArm, b.LeftForeArm, b.LeftHand, lT, new THREE.Vector3(-0.5, -1, 0.4));
    const gq = worldQ(g, _q.identity()).clone().multiply(RY_PI);   // referencial com o cano em +Z
    for (const [hb, hq, side] of [[b.RightHand, HAND_R, 'Right'], [b.LeftHand, HAND_L, 'Left']]) {
      const q = gq.clone().multiply(hq); if (this.rest[side]) q.multiply(this.rest[side]);
      // o modelo está girado 180° (root.rotation.y): a orientação desejada é mundial, a dos ossos é relativa ao pai
      hb.quaternion.copy(worldQ(hb.parent, new THREE.Quaternion()).invert().multiply(q));
      hb.updateMatrixWorld(true);
    }
    // dedos: fecham em volta da empunhadura (ângulos suavizados)
    for (const [side, want] of [['Left', anchors.leftCurl || [0.7, 0.9]], ['Right', anchors.rightCurl || [1.0, 1.0]]]) {
      const c = this.curl[side], sg = side === 'Left' ? -1 : 1;
      c[0] += (want[0] - c[0]) * 0.35; c[1] += (want[1] - c[1]) * 0.35;
      b[FINGER[side][0]].rotation.set(0, 0, sg * c[0]); b[FINGER[side][1]].rotation.set(0, 0, sg * c[1]);
      b[FINGER[side][0]].updateMatrixWorld(true);
    }
  }
}
