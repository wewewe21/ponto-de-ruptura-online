// Coreografia de recarga das armas com as mãos: devolve, para o tempo normalizado t (0..1) da recarga, quanto a arma se inclina,
// onde cada mão vai (deslocamento no espaço da arma, em metros; x direita, y cima, z para trás) e o estado das peças (pente, ferrolho, ferrolho da pistola).
// Usado por ViewModel (campanha e online). Os tempos são frações da recarga; cada arma tem a sua sequência.
import * as THREE from 'three';
import { smoothstep as S } from '../core/utils.js';

const _v = new THREE.Vector3();
// quadros-chave [t, x, y, z] com suavização entre eles
function keys(t, ks, out) {
  if (t <= ks[0][0]) return out.set(ks[0][1], ks[0][2], ks[0][3]);
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const a = ks[i - 1], b = ks[i], k = S(a[0], b[0], t);
      return out.set(a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k);
    }
  }
  const l = ks[ks.length - 1]; return out.set(l[1], l[2], l[3]);
}

export function makeReloadState() {
  return { px: 0, py: 0, pz: 0, rx: 0, rz: 0, L: new THREE.Vector3(), R: new THREE.Vector3(), lq: new THREE.Quaternion(), rq: new THREE.Quaternion(),
    magDrop: 0, magVisible: true, lift: 0, back: 0, slide: null };
}

const _e = new THREE.Euler(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const POUCH = [0.03, -0.30, 0.14];

export function reloadPose(id, t, empty, g, r) {
  r.px = r.py = r.pz = r.rx = r.rz = 0; r.magDrop = 0; r.magVisible = true; r.lift = r.back = 0; r.slide = null;
  r.L.set(0, 0, 0); r.R.set(0, 0, 0); r.lq.identity(); r.rq.identity();
  const home = g.leftHome, tilt = (a, b) => S(0, a, t) * (1 - S(b, 1, t));

  if (id === 'AX50') {
    // ferrolho do lado esquerdo: a mão esquerda segura a bola, levanta e puxa; troca o pente; fecha o ferrolho
    const k = tilt(0.1, 0.9);
    r.rz = 0.2 * k; r.rx = 0.07 * k; r.py = -0.02 * k;
    r.lift = S(0.1, 0.22, t) * (1 - S(0.82, 0.92, t)); r.back = S(0.22, 0.34, t) * (1 - S(0.72, 0.8, t));
    const pivot = g.extra.boltPivot, ball = g.extra.boltBall;
    if (pivot && ball && g.leftHome) {
      const th = -r.lift * 1.2, c = Math.cos(th), s = Math.sin(th);
      _a.copy(ball).sub(pivot); _b.set(_a.x * c - _a.y * s, _a.x * s + _a.y * c, _a.z).add(pivot); _b.z += r.back * 0.1;
      _b.sub(home);                                                       // deslocamento da mão até a bola do ferrolho
    } else _b.set(0, 0.05, 0.15);
    const magOff = g.magHand ? _a.copy(g.magHand(0)).sub(home) : _a.set(0, -0.05, 0.09);
    const mx = magOff.x, my = magOff.y, mz = magOff.z;
    keys(t, [[0.28, 0, 0, 0], [0.4, mx, my, mz], [0.46, mx, my, mz], [0.52, mx, my - 0.1, mz], [0.57, POUCH[0], POUCH[1], POUCH[2]], [0.6, POUCH[0], POUCH[1] + 0.02, POUCH[2]], [0.66, mx, my - 0.07, mz], [0.7, mx, my + 0.01, mz], [0.74, mx, my, mz]], r.L);
    const wBall = S(0, 0.1, t) * (1 - S(0.28, 0.36, t)) + S(0.72, 0.78, t) * (1 - S(0.93, 1, t));
    const wMag = S(0.28, 0.4, t) * (1 - S(0.7, 0.76, t));
    const mag = r.L.clone();
    r.L.set(_b.x * wBall + mag.x * wMag, _b.y * wBall + mag.y * wMag, _b.z * wBall + mag.z * wMag);
    r.magDrop = S(0.42, 0.5, t) * (1 - S(0.6, 0.7, t)); r.magVisible = !(t > 0.5 && t < 0.58);
    // mão direita: acompanha o coice do ferrolho e relaxa o dedo
    r.R.set(0, 0.004 * r.lift, 0.012 * r.back);
    _e.set(0, 0, -0.15 * r.lift); r.lq.setFromEuler(_e);                  // a esquerda gira o pulso ao levantar o ferrolho
    return r;
  }

  if (id === 'P19' || id === 'DE50') {
    // pistola: a mão de apoio desce até a base da empunhadura, puxa o pente, busca outro e o encaixa; empunhadura inclina
    const k = tilt(0.14, 0.88);
    r.rz = 0.33 * k; r.rx = 0.2 * k; r.py = -0.03 * k;
    keys(t, [[0.0, 0, 0, 0], [0.12, 0, -0.1, 0.03], [0.22, 0, -0.12, 0.03], [0.34, 0, -0.26, 0.04], [0.46, 0.03, -0.36, 0.12], [0.58, 0.02, -0.3, 0.1],
      [0.68, 0, -0.14, 0.03], [0.76, 0, -0.1, 0.03], [0.84, 0, -0.06, 0.0], [0.95, 0, 0, 0]], r.L);
    _e.set(0.5 * S(0.1, 0.2, t) * (1 - S(0.7, 0.8, t)), 0, 0); r.lq.setFromEuler(_e);
    if (empty) r.slide = S(0.66, 0.72, t) * (1 - S(0.8, 0.86, t));   // a culatra recua e solta
    r.R.set(0, 0.006 * Math.sin(S(0.3, 0.7, t) * Math.PI), 0);
    if (g.mag) { r.magDrop = S(0.26, 0.38, t) * (1 - S(0.62, 0.72, t)); r.magVisible = !(t > 0.4 && t < 0.54); }   // DE50 tem pente separado (a Glock não)
    return r;
  }

  // fuzis, submetralhadora e DMR: mão esquerda vai ao pente, puxa, busca outro, encaixa; se estava vazio, a direita puxa o ferrolho
  const k = tilt(0.15, 0.85);
  r.rz = 0.28 * k; r.rx = 0.12 * k; r.py = -0.02 * k;
  const magOff = g.magHand ? _a.copy(g.magHand(0)).sub(home) : _a.set(0, -0.06, 0.06);
  const mx = magOff.x, my = magOff.y, mz = magOff.z;
  keys(t, [[0, 0, 0, 0], [0.1, mx, my, mz], [0.2, mx, my, mz], [0.3, mx, my - 0.1, mz], [0.42, POUCH[0], POUCH[1], POUCH[2]], [0.54, POUCH[0], POUCH[1] + 0.02, POUCH[2]],
    [0.66, mx, my - 0.07, mz], [0.74, mx, my + 0.01, mz], [0.8, mx, my + 0.01, mz], [0.92, 0, 0, 0]], r.L);
  r.magDrop = S(0.2, 0.34, t) * (1 - S(0.62, 0.74, t)); r.magVisible = !(t > 0.36 && t < 0.54);
  _e.set(0, 0, 0.25 * S(0.05, 0.2, t) * (1 - S(0.74, 0.9, t))); r.lq.setFromEuler(_e);
  if (empty) {
    const b = S(0.78, 0.84, t) * (1 - S(0.86, 0.94, t));
    r.R.set(0, 0.01 * b, 0.07 * b); r.rz += 0.1 * b;
  }
  return r;
}
