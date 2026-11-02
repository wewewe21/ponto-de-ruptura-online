// Reduz a malha de um GLB do Tripo/Trellis preservando UV e recalculando normais.
// Uso (numa pasta temporária com: npm i @gltf-transform/core meshoptimizer): node decimate_glb.mjs entrada.glb saida.glb 20000
// node decimate.mjs <in.glb> <out.glb> <triangulos-alvo>
import { NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';

const [, , src, dst, tris] = process.argv;
await MeshoptSimplifier.ready;
const io = new NodeIO();
const doc = await io.read(src);
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const posA = prim.getAttribute('POSITION'), uvA = prim.getAttribute('TEXCOORD_0');
    const pos = new Float32Array(posA.getArray()), uv = new Float32Array(uvA.getArray());
    let idx = prim.getIndices() ? new Uint32Array(prim.getIndices().getArray()) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
    // solda por posição+uv (ignora normais, que serão recalculadas)
    const key = new Map(), remap = new Uint32Array(pos.length / 3);
    const keep = [];
    for (let i = 0; i < pos.length / 3; i++) {
      const k = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)},${Math.round(uv[i * 2] * 4096)},${Math.round(uv[i * 2 + 1] * 4096)}`;
      let j = key.get(k);
      if (j === undefined) { j = keep.length; key.set(k, j); keep.push(i); }
      remap[i] = j;
    }
    const P = new Float32Array(keep.length * 3), U = new Float32Array(keep.length * 2);
    keep.forEach((o, n) => { P.set(pos.subarray(o * 3, o * 3 + 3), n * 3); U.set(uv.subarray(o * 2, o * 2 + 2), n * 2); });
    idx = idx.map((i) => remap[i]);
    console.log('antes', idx.length / 3, 'tris,', keep.length, 'verts');
    const target = Math.floor(Number(tris) * 3);
    const [out] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, U, 2, [2.5, 2.5], null, target, 0.2, ['Prune', 'Permissive']);
    // compacta
    const used = new Map(), P2 = [], U2 = [], I2 = new Uint32Array(out.length);
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      let j = used.get(v);
      if (j === undefined) { j = P2.length / 3; used.set(v, j); P2.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); U2.push(U[v * 2], U[v * 2 + 1]); }
      I2[i] = j;
    }
    // normais suaves (média por posição)
    const nv = P2.length / 3, acc = new Map(), N = new Float32Array(nv * 3);
    const pk = (i) => `${Math.round(P2[i * 3] * 1e5)},${Math.round(P2[i * 3 + 1] * 1e5)},${Math.round(P2[i * 3 + 2] * 1e5)}`;
    for (let t = 0; t < I2.length; t += 3) {
      const a = I2[t], b = I2[t + 1], c = I2[t + 2];
      const ux = P2[b * 3] - P2[a * 3], uy = P2[b * 3 + 1] - P2[a * 3 + 1], uz = P2[b * 3 + 2] - P2[a * 3 + 2];
      const vx = P2[c * 3] - P2[a * 3], vy = P2[c * 3 + 1] - P2[a * 3 + 1], vz = P2[c * 3 + 2] - P2[a * 3 + 2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      for (const i of [a, b, c]) { const k = pk(i); const s = acc.get(k) || [0, 0, 0]; s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; acc.set(k, s); }
    }
    for (let i = 0; i < nv; i++) { const s = acc.get(pk(i)) || [0, 1, 0]; const l = Math.hypot(...s) || 1; N[i * 3] = s[0] / l; N[i * 3 + 1] = s[1] / l; N[i * 3 + 2] = s[2] / l; }
    console.log('depois', out.length / 3, 'tris,', nv, 'verts');
    posA.setArray(new Float32Array(P2)); uvA.setArray(new Float32Array(U2));
    prim.getAttribute('NORMAL').setArray(N);
    const ia = prim.getIndices();
    if (ia) ia.setArray(nv > 65535 ? I2 : new Uint16Array(I2)); else console.warn('sem índices');
  }
}
await io.write(dst, doc);
