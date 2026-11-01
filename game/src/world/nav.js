// Grade de navegação gerada automaticamente sobre a física (várias camadas por coluna)
// + A* com heap binário + suavização por linha de caminhada.
export class NavGrid {
  constructor(physics) {
    this.P = physics;
    this.step = 2;
    this.xs = []; this.ys = []; this.zs = [];
    this.adj = [];
    this.cols = new Map();
  }
  _key(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }

  _surfaces(x, z) {
    const P = this.P, ys = [];
    const th = P.terrainH(x, z);
    if (th > -1e8) ys.push(th);
    P.forEachInRect(x - 0.01, z - 0.01, x + 0.01, z + 0.01, (c) => { if (!c.noGround && !c.noCollide && !c.invisible) ys.push(c.maxY); });
    for (const r of P.ramps) if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) ys.push(P.rampHeight(r, x, z));
    ys.sort((a, b) => a - b);
    const out = [];
    for (const y of ys) if (!out.length || y - out[out.length - 1] > 0.15) out.push(y);
    return out;
  }
  _clear(x, y, z) {
    const P = this.P;
    if (P.terrainH(x, z) > y + 0.3) return false;
    let ok = true;
    P.forEachInRect(x - 0.35, z - 0.35, x + 0.35, z + 0.35, (c) => {
      if (!ok || c.noCollide) return;
      if (c.maxY > y + 0.3 && c.minY < y + 1.7) ok = false;
    });
    return ok;
  }
  build(regions) {
    const s = this.step;
    for (const R of regions) {
      for (let x = Math.ceil(R.minX / s) * s; x <= R.maxX; x += s)
        for (let z = Math.ceil(R.minZ / s) * s; z <= R.maxZ; z += s) {
          const ix = Math.round(x / s), iz = Math.round(z / s);
          const key = this._key(ix, iz);
          let list = this.cols.get(key);
          for (const y of this._surfaces(x, z)) {
            if (y < R.minY || y > R.maxY) continue;
            if (list && list.some((i) => Math.abs(this.ys[i] - y) < 0.3)) continue;
            if (!this._clear(x, y, z)) continue;
            const id = this.xs.length;
            this.xs.push(x); this.ys.push(y); this.zs.push(z); this.adj.push([]);
            if (!list) { list = []; this.cols.set(key, list); }
            list.push(id);
          }
        }
    }
    // arestas
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    const n = this.xs.length;
    for (let a = 0; a < n; a++) {
      const ix = Math.round(this.xs[a] / s), iz = Math.round(this.zs[a] / s);
      for (const [dx, dz] of dirs) {
        const list = this.cols.get(this._key(ix + dx, iz + dz));
        if (!list) continue;
        for (const b of list) {
          if (Math.abs(this.ys[b] - this.ys[a]) > 1.6) continue;
          if (this._walkable(this.xs[a], this.ys[a], this.zs[a], this.xs[b], this.ys[b], this.zs[b])) {
            const cost = Math.hypot(this.xs[b] - this.xs[a], this.ys[b] - this.ys[a], this.zs[b] - this.zs[a]);
            this.adj[a].push(b, cost); this.adj[b].push(a, cost);
          }
        }
      }
    }
    this.count = n;
    this.g = new Float32Array(n); this.f = new Float32Array(n);
    this.parent = new Int32Array(n); this.seen = new Uint32Array(n); this.closed = new Uint32Array(n);
    this.gen = 1;
    this.heap = new Int32Array(n + 16);
  }
  _walkable(ax, ay, az, bx, by, bz) {
    const P = this.P;
    const top = Math.max(ay, by) + 0.35;
    for (const t of [0.25, 0.5, 0.75]) {
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, ey = ay + (by - ay) * t;
      const gy = P.groundHeight(x, z, top, 0.05);
      if (Math.abs(gy - ey) > 0.55) return false;
      let blocked = false;
      P.forEachInRect(x - 0.3, z - 0.3, x + 0.3, z + 0.3, (c) => {
        if (blocked || c.noCollide) return;
        if (c.maxY > gy + 0.45 && c.minY < gy + 1.6) blocked = true;
      });
      if (blocked) return false;
    }
    return true;
  }
  nearest(x, y, z, maxR = 3) {
    const s = this.step;
    const ix = Math.round(x / s), iz = Math.round(z / s);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= maxR; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const list = this.cols.get(this._key(ix + dx, iz + dz));
        if (!list) continue;
        for (const i of list) {
          const dy = this.ys[i] - y;
          if (dy > 1.2 || dy < -2.5) continue;
          const d = Math.hypot(this.xs[i] - x, this.zs[i] - z) + Math.abs(dy) * 3 + (this.adj[i].length ? 0 : 50);
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  }
  // A*. Retorna lista de pontos {x,y,z} ou null
  findPath(sx, sy, sz, tx, ty, tz, maxIter = 9000) {
    const s = this.nearest(sx, sy, sz), t = this.nearest(tx, ty, tz);
    if (s < 0 || t < 0) return null;
    if (s === t) return [{ x: tx, y: ty, z: tz }];
    const gen = ++this.gen;
    const { g, f, parent, seen, closed, heap, xs, ys, zs, adj } = this;
    let hs = 0;
    const h = (i) => Math.hypot(xs[i] - xs[t], ys[i] - ys[t], zs[i] - zs[t]);
    const push = (i) => {
      let k = hs++; heap[k] = i;
      while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; }
    };
    const pop = () => {
      const top = heap[0]; heap[0] = heap[--hs];
      let k = 0;
      for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hs && f[heap[l]] < f[heap[m]]) m = l; if (r < hs && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; const tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m; }
      return top;
    };
    g[s] = 0; f[s] = h(s); parent[s] = -1; seen[s] = gen; push(s);
    let found = false, iter = 0, bestNode = s, bestH = f[s];
    while (hs > 0 && iter++ < maxIter) {
      const c = pop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      if (c === t) { found = true; break; }
      const hc = f[c] - g[c];
      if (hc < bestH) { bestH = hc; bestNode = c; }
      const a = adj[c];
      for (let k = 0; k < a.length; k += 2) {
        const nb = a[k];
        if (closed[nb] === gen) continue;
        const ng = g[c] + a[k + 1];
        if (seen[nb] !== gen || ng < g[nb]) { seen[nb] = gen; g[nb] = ng; f[nb] = ng + h(nb); parent[nb] = c; push(nb); }
      }
    }
    const end = found ? t : bestNode;
    if (!found && bestH > 25) return null;
    const ids = [];
    for (let c = end; c !== -1; c = parent[c]) ids.push(c);
    ids.reverse();
    const pts = ids.map((i) => ({ x: xs[i], y: ys[i], z: zs[i] }));
    if (found) pts.push({ x: tx, y: ty, z: tz });
    return this._smooth(pts);
  }
  _smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 10);
      while (j > i + 1 && !this.segmentClear(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
  segmentClear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / 1.0));
    const P = this.P;
    let prevY = a.y;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const gy = P.groundHeight(x, z, prevY + 0.55, 0.05);
      if (gy < prevY - 0.6 || gy < -1e8) return false;
      let blocked = false;
      P.forEachInRect(x - 0.32, z - 0.32, x + 0.32, z + 0.32, (c) => {
        if (blocked || c.noCollide) return;
        if (c.maxY > gy + 0.45 && c.minY < gy + 1.6) blocked = true;
      });
      if (blocked) return false;
      prevY = gy;
    }
    return Math.abs(prevY - b.y) < 0.8 || n === 1;
  }
  randomNear(x, y, z, radius) {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      const i = this.nearest(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 2);
      if (i >= 0 && this.adj[i].length) return { x: this.xs[i], y: this.ys[i], z: this.zs[i] };
    }
    return null;
  }
}
