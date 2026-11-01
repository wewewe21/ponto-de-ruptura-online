// Texturas PBR geradas (Krea 2): cor + normal + rugosidade, tileáveis. Carrega o que existir; o resto cai no procedural.
import * as THREE from 'three';

const NAMES = ['concrete', 'concrete_dark', 'floor', 'asphalt', 'metal', 'rust', 'container', 'wood', 'ground', 'grass', 'rock', 'gravel', 'sandbag', 'grate', 'skyclouds'];

export async function loadPBR(renderer) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (url, srgb) => new Promise((res) => loader.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.generateMipmaps = true;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    res(t);
  }, undefined, () => res(null)));
  const P = {};
  await Promise.all(NAMES.map(async (n) => {
    const [c, nm, r] = await Promise.all([load(`./assets/tex/${n}_c.jpg`, true), load(`./assets/tex/${n}_n.jpg`, false), load(`./assets/tex/${n}_r.jpg`, false)]);
    if (c) P[n] = { map: c, normalMap: nm, roughnessMap: r };
  }));
  return P;
}

// aplica um conjunto PBR a um material padrão (mantém cor/tint e valores escalares do material)
export function applyPBR(mat, p, { normal = 0.9, rough = 1 } = {}) {
  if (!p) return mat;
  mat.map = p.map;
  if (p.normalMap) { mat.normalMap = p.normalMap; mat.normalScale = new THREE.Vector2(normal, normal); }
  if (p.roughnessMap) { mat.roughnessMap = p.roughnessMap; mat.roughness = rough; }
  mat.needsUpdate = true;
  return mat;
}
