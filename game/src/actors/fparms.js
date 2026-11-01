// Braços em primeira pessoa com a malha do soldado (manga + luvas com a textura gerada) e IK nas empunhaduras da arma.
// Recorta só os triângulos dos braços da malha do soldado e os liga a um esqueleto próprio, posicionado atrás/abaixo da câmera.
import * as THREE from 'three';
import { meshSoldiers } from './meshsoldier.js';
import { solveArm, worldQ, HAND_R, HAND_L } from './ik.js';

const NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const PARENT = { Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm', LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot', RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot' };
const ARM = new Set(['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm']);   // a mão é substituída por uma luva (sem dedos individuais no rig)
const RY_PI = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

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
    const armW = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (ARM.has(NAMES[si.array[i * 4 + k]])) w += sw.array[i * 4 + k]; return w; };
    const P = [], N = [], U = [], SI = [], SW = [];
    const vi = (t, k) => (idx ? idx[t * 3 + k] : t * 3 + k);
    for (let t = 0; t < tri; t++) {
      const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
      if ((armW(a) + armW(b) + armW(c)) / 3 < 0.7) continue;
      for (const i of [a, b, c]) {
        P.push(p.getX(i), p.getY(i), p.getZ(i)); if (nor) N.push(nor.getX(i), nor.getY(i), nor.getZ(i)); if (uv) U.push(uv.getX(i), uv.getY(i));
        for (let k = 0; k < 4; k++) { SI.push(si.array[i * 4 + k]); SW.push(sw.array[i * 4 + k]); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    if (N.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (U.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.3, 0), 3);
    // esqueleto
    this.root = new THREE.Group();
    this.bones = {}; const all = [];
    for (const nm of NAMES) { const b = new THREE.Bone(); b.name = 'fp_' + nm; this.bones[nm] = b; all.push(b); }
    for (const nm of NAMES) {
      const par = PARENT[nm], b = this.bones[nm], j = S.J[nm];
      if (!par) { b.position.set(...j); this.root.add(b); } else { const pj = S.J[par]; b.position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]); this.bones[par].add(b); }
    }
    this.root.updateMatrixWorld(true);
    this.mat = S.mat.clone(); this.mat.color.setScalar(0.9); this.mat.envMapIntensity = 0.7;
    this.mesh = new THREE.SkinnedMesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.mesh.bind(new THREE.Skeleton(all), new THREE.Matrix4());
    // luvas táticas nas mãos: palma + bloco dos dedos levemente curvado (eixo do osso aponta para os dedos: ±X)
    const glove = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.8, metalness: 0.1 });
    const knuckle = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.6, metalness: 0.2 });
    for (const [nm, sx] of [['LeftHand', 1], ['RightHand', -1]]) {
      const hand = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.03, 0.082), glove); palm.position.set(sx * 0.05, 0, 0); hand.add(palm);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.07), knuckle); back.position.set(sx * 0.055, 0.019, 0); hand.add(back);
      // dedos: falange proximal para a frente + distal curvada para a palma (-Y), quatro dedos lado a lado em Z
      for (let i = 0; i < 4; i++) {
        const zz = (i - 1.5) * 0.02;
        const p1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.04, 3, 6), glove); p1.rotation.z = Math.PI / 2; p1.position.set(sx * 0.115, 0, zz); hand.add(p1);
        const p2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.035, 3, 6), glove); p2.position.set(sx * 0.152, -0.022, zz); p2.rotation.z = sx * 0.45; hand.add(p2);
      }
      const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.045, 3, 6), glove); th.position.set(sx * 0.06, -0.006, sx > 0 ? 0.05 : -0.05); th.rotation.z = Math.PI / 2; th.rotation.y = sx * 0.6; hand.add(th);
      this.bones[nm].add(hand);
    }
    // modelo olha +Z; a câmera do viewmodel olha -Z → gira 180°; ombros ~20 cm para os lados, 18 cm abaixo do olho
    this.root.rotation.y = Math.PI;
    const arm = S.J.LeftArm, K = 1.62;     // braços um pouco maiores que o natural: alcançam a empunhadura frontal
    this.root.scale.setScalar(K);
    this.root.position.set(0, -0.2 - K * arm[1], 0.0 + K * arm[2]);
    scene.add(this.root);
    this.visible = true;
  }
  setVisible(v) { this.root.visible = v; this.visible = v; }
  // g: grupo da arma (espaço do viewmodel, cano em -Z); anchors: { rightHome, leftHome } no espaço da arma
  update(g, anchors, leftOverride) {
    if (!this.visible) return;
    g.updateWorldMatrix(true, true);
    this.root.updateMatrixWorld(true);
    const b = this.bones;
    // o punho fica um pouco atrás da empunhadura (a luva se estende para a frente a partir dele)
    const rT = g.localToWorld(anchors.rightHome.clone().add(_v.set(0, 0.0, 0.09)));
    const lT = g.localToWorld((leftOverride || anchors.leftHome || anchors.rightHome).clone().add(_v.set(0, 0.0, 0.14)));
    solveArm(b.RightArm, b.RightForeArm, b.RightHand, rT, new THREE.Vector3(0.5, -1, 0.4));
    solveArm(b.LeftArm, b.LeftForeArm, b.LeftHand, lT, new THREE.Vector3(-0.5, -1, 0.4));
    const gq = worldQ(g, _q.identity()).clone().multiply(RY_PI);   // referencial com o cano em +Z
    for (const [hb, hq] of [[b.RightHand, HAND_R], [b.LeftHand, HAND_L]]) {
      const q = gq.clone().multiply(hq);
      // o modelo está girado 180° (root.rotation.y): a orientação desejada é mundial, a dos ossos é relativa ao pai
      hb.quaternion.copy(worldQ(hb.parent, new THREE.Quaternion()).invert().multiply(q));
      hb.updateMatrixWorld(true);
    }
  }
}
