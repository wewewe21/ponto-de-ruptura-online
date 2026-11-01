// IK de dois ossos em espaço-mundo e orientação das mãos em relação à arma (usado pelo chefe e pelos soldados).
import * as THREE from 'three';
import { clamp } from '../core/utils.js';
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export function worldQ(o, out) { return o.getWorldQuaternion(out); }
export function aimBone(bone, childPos, desired, pivot) {
  _v.copy(childPos).sub(pivot).normalize();
  _v2.copy(desired).sub(pivot).normalize();
  _q.setFromUnitVectors(_v, _v2);
  worldQ(bone, _q2).premultiply(_q);
  const pq = worldQ(bone.parent, new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(_q2));
  bone.updateMatrixWorld(true);
}
export function solveArm(upper, fore, hand, target, pole) {
  const S = upper.getWorldPosition(new THREE.Vector3()), E0 = fore.getWorldPosition(new THREE.Vector3()), H0 = hand.getWorldPosition(new THREE.Vector3());
  const l1 = S.distanceTo(E0), l2 = E0.distanceTo(H0);
  const axis = target.clone().sub(S); const d = clamp(axis.length(), 0.05, (l1 + l2) * 0.999); axis.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  const E = S.clone().addScaledVector(axis, a).addScaledVector(pd, h);
  aimBone(upper, E0, E, S);
  const E1 = fore.getWorldPosition(new THREE.Vector3()), H1 = hand.getWorldPosition(new THREE.Vector3());
  aimBone(fore, H1, S.clone().addScaledVector(axis, d), E1);
}
export const quatFromFN = (f, n) => { const t = new THREE.Vector3().crossVectors(f, n); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, n, t)); };
// orientação da mão em relação ao fuzil (dedos para a frente, palma para dentro / para cima)
export const HAND_R = quatFromFN(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)).multiply(quatFromFN(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)).invert());
export const HAND_L = quatFromFN(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)).multiply(quatFromFN(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)).invert());

