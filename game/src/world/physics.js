// Mundo físico: colisores AABB numa grade espacial, rampas analíticas, heightfield de terreno,
// zonas de água. Fornece movimento de corpos, altura do chão e raycast (DDA na grade).
const GRAV = 22;

export class Physics {
  constructor() {
    this.cols = [];
    this.ramps = [];
    this.cell = 8;
    this.grid = new Map();
    this.stamp = 1;
    this.terrain = null;
    this.water = []; // {minX,maxX,minZ,maxZ,level}
  }
  _key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); }

  add(x0, y0, z0, x1, y1, z1, props = {}) {
    const c = {
      minX: Math.min(x0, x1), maxX: Math.max(x0, x1),
      minY: Math.min(y0, y1), maxY: Math.max(y0, y1),
      minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1),
      active: true, stamp: 0, id: this.cols.length, mat: 'concrete',
      ...props,
    };
    this.cols.push(c);
    this._insert(c);
    return c;
  }
  _insert(c) {
    const s = this.cell;
    c.cells = [];
    for (let ix = Math.floor(c.minX / s); ix <= Math.floor(c.maxX / s); ix++)
      for (let iz = Math.floor(c.minZ / s); iz <= Math.floor(c.maxZ / s); iz++) {
        const k = this._key(ix, iz);
        let l = this.grid.get(k);
        if (!l) { l = []; this.grid.set(k, l); }
        l.push(c);
        c.cells.push(l);
      }
  }
  remove(c) {
    if (!c || !c.active) return;
    c.active = false;
    for (const l of c.cells) { const i = l.indexOf(c); if (i >= 0) l.splice(i, 1); }
    c.cells = [];
  }
  restore(c) { if (c && !c.active) { c.active = true; this._insert(c); } }
  // move um colisor (portas, elevador)
  moveTo(c, x0, y0, z0, x1, y1, z1) {
    const was = c.active;
    if (was) this.remove(c);
    c.minX = x0; c.minY = y0; c.minZ = z0; c.maxX = x1; c.maxY = y1; c.maxZ = z1;
    if (was) { c.active = true; this._insert(c); }
  }

  addRamp(minX, maxX, minZ, maxZ, axis, y0, y1, props = {}) {
    const r = { minX, maxX, minZ, maxZ, axis, y0, y1, ...props };
    this.ramps.push(r);
    return r;
  }
  rampHeight(r, x, z) {
    const t = r.axis === 'x' ? (x - r.minX) / (r.maxX - r.minX) : (z - r.minZ) / (r.maxZ - r.minZ);
    return r.y0 + (r.y1 - r.y0) * Math.min(1, Math.max(0, t));
  }

  forEachInRect(minX, minZ, maxX, maxZ, fn) {
    const s = this.cell;
    const st = ++this.stamp;
    for (let ix = Math.floor(minX / s); ix <= Math.floor(maxX / s); ix++)
      for (let iz = Math.floor(minZ / s); iz <= Math.floor(maxZ / s); iz++) {
        const l = this.grid.get(this._key(ix, iz));
        if (!l) continue;
        for (let i = 0; i < l.length; i++) {
          const c = l[i];
          if (c.stamp === st) continue;
          c.stamp = st;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          fn(c);
        }
      }
  }

  setTerrain(minX, minZ, size, n, heights) {
    this.terrain = { minX, minZ, size, n, res: size / (n - 1), h: heights };
  }
  terrainH(x, z) {
    const T = this.terrain;
    if (!T) return -1e9;
    const fx = (x - T.minX) / T.res, fz = (z - T.minZ) / T.res;
    if (fx < 0 || fz < 0 || fx >= T.n - 1 || fz >= T.n - 1) return -1e9;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const n = T.n, h = T.h;
    const a = h[iz * n + ix], b = h[iz * n + ix + 1], c = h[(iz + 1) * n + ix], d = h[(iz + 1) * n + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  waterLevel(x, z) {
    let lv = -1e9;
    for (const w of this.water) if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ && w.level > lv) lv = w.level;
    return lv;
  }

  // maior superfície caminhável com y <= maxY
  groundHeight(x, z, maxY, r = 0.25) {
    let best = -1e9;
    const th = this.terrainH(x, z);
    if (th <= maxY + 0.05) best = th;
    this.forEachInRect(x - r, z - r, x + r, z + r, (c) => {
      if (c.noGround || c.noCollide) return;
      if (c.maxY <= maxY + 0.001 && c.maxY > best) best = c.maxY;
    });
    for (let i = 0; i < this.ramps.length; i++) {
      const rp = this.ramps[i];
      if (rp.disabled) continue;
      if (x < rp.minX || x > rp.maxX || z < rp.minZ || z > rp.maxZ) continue;
      const h = this.rampHeight(rp, x, z);
      if (h <= maxY + 0.35 && h > best) best = h;
    }
    return best;
  }

  // existe colisor sólido ocupando a caixa?
  boxBlocked(minX, minY, minZ, maxX, maxY, maxZ) {
    let hit = false;
    this.forEachInRect(minX, minZ, maxX, maxZ, (c) => {
      if (hit || c.noCollide) return;
      if (c.maxY > minY && c.minY < maxY) hit = true;
    });
    return hit;
  }

  // corpo: {x,y,z (pés), vy, r, h, onGround, step}
  moveBody(b, dx, dz, dt, gravity = true) {
    const step = b.step ?? 0.5;
    if (dx) { b.x += dx; this._resolve(b, 0, dx, step); }
    if (dz) { b.z += dz; this._resolve(b, 1, dz, step); }
    this._resolve(b, 2, 0, step);
    if (gravity) b.vy -= GRAV * dt;
    let ny = b.y + b.vy * dt;
    const g = this.groundHeight(b.x, b.z, b.y + step, b.r * 0.7);
    b.groundY = g;
    if (b.vy <= 0 && ny <= g) {
      b.landSpeed = -b.vy;
      ny = g; b.vy = 0; b.onGround = true;
    } else if (b.onGround && b.vy <= 0 && b.y - g < step && b.y - g >= 0) {
      ny = g; b.vy = 0; b.onGround = true; b.landSpeed = 0;
    } else {
      b.onGround = false;
    }
    if (b.vy > 0) {
      const top = ny + b.h;
      this.forEachInRect(b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r, (c) => {
        if (c.noCollide) return;
        if (c.minY >= b.y + b.h - 0.05 && c.minY < top) { ny = c.minY - b.h; b.vy = 0; }
      });
    }
    b.y = ny;
  }
  _resolve(b, axis, d, step) {
    const y0 = b.y + (b.onGround ? step * 0.98 : 0.05), y1 = b.y + b.h;
    this.forEachInRect(b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r, (c) => {
      if (c.noCollide) return;
      if (c.maxY <= y0 || c.minY >= y1) return;
      if (b.x + b.r <= c.minX || b.x - b.r >= c.maxX || b.z + b.r <= c.minZ || b.z - b.r >= c.maxZ) return;
      if (axis === 0) {
        if (d > 0) b.x = c.minX - b.r - 1e-4; else b.x = c.maxX + b.r + 1e-4;
      } else if (axis === 1) {
        if (d > 0) b.z = c.minZ - b.r - 1e-4; else b.z = c.maxZ + b.r + 1e-4;
      } else {
        // sem movimento: empurra pelo menor eixo de penetração
        const px1 = c.maxX - (b.x - b.r), px2 = (b.x + b.r) - c.minX;
        const pz1 = c.maxZ - (b.z - b.r), pz2 = (b.z + b.r) - c.minZ;
        const m = Math.min(px1, px2, pz1, pz2);
        if (m > 0.6) return; // dentro de algo grande: não teletransporta
        if (m === px1) b.x += px1 + 1e-4; else if (m === px2) b.x -= px2 + 1e-4;
        else if (m === pz1) b.z += pz1 + 1e-4; else b.z -= pz2 + 1e-4;
      }
    });
  }

  // Raycast. Retorna {t,x,y,z,nx,ny,nz,col,terrain,water} ou null
  raycast(ox, oy, oz, dx, dy, dz, maxD, opts) {
    const ignore = opts && opts.ignore;
    let bestT = maxD, best = null;
    const s = this.cell;
    let ix = Math.floor(ox / s), iz = Math.floor(oz / s);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const tDX = adx > 1e-9 ? s / adx : Infinity, tDZ = adz > 1e-9 ? s / adz : Infinity;
    let tMX = adx > 1e-9 ? (dx > 0 ? (ix + 1) * s - ox : ox - ix * s) / adx : Infinity;
    let tMZ = adz > 1e-9 ? (dz > 0 ? (iz + 1) * s - oz : oz - iz * s) / adz : Infinity;
    const st = ++this.stamp;
    const idx = 1 / dx, idy = 1 / dy, idz = 1 / dz;
    for (let it = 0; it < 400; it++) {
      const l = this.grid.get(this._key(ix, iz));
      if (l) {
        for (let i = 0; i < l.length; i++) {
          const c = l[i];
          if (c.stamp === st) continue;
          c.stamp = st;
          if (c.noRay || (ignore && ignore(c))) continue;
          // slab test
          let tmin = 0, tmax = bestT, n = -1, sgn = 0;
          let t1, t2, a, bb;
          if (adx < 1e-9) { if (ox < c.minX || ox > c.maxX) continue; }
          else {
            t1 = (c.minX - ox) * idx; t2 = (c.maxX - ox) * idx;
            a = Math.min(t1, t2); bb = Math.max(t1, t2);
            if (a > tmin) { tmin = a; n = 0; sgn = dx > 0 ? -1 : 1; }
            if (bb < tmax) tmax = bb;
            if (tmin > tmax) continue;
          }
          if (Math.abs(dy) < 1e-9) { if (oy < c.minY || oy > c.maxY) continue; }
          else {
            t1 = (c.minY - oy) * idy; t2 = (c.maxY - oy) * idy;
            a = Math.min(t1, t2); bb = Math.max(t1, t2);
            if (a > tmin) { tmin = a; n = 1; sgn = dy > 0 ? -1 : 1; }
            if (bb < tmax) tmax = bb;
            if (tmin > tmax) continue;
          }
          if (adz < 1e-9) { if (oz < c.minZ || oz > c.maxZ) continue; }
          else {
            t1 = (c.minZ - oz) * idz; t2 = (c.maxZ - oz) * idz;
            a = Math.min(t1, t2); bb = Math.max(t1, t2);
            if (a > tmin) { tmin = a; n = 2; sgn = dz > 0 ? -1 : 1; }
            if (bb < tmax) tmax = bb;
            if (tmin > tmax) continue;
          }
          if (n === -1) continue; // origem dentro do colisor
          if (tmin < bestT) {
            bestT = tmin;
            best = { t: tmin, col: c, nx: n === 0 ? sgn : 0, ny: n === 1 ? sgn : 0, nz: n === 2 ? sgn : 0 };
          }
        }
      }
      const tNext = Math.min(tMX, tMZ);
      if (bestT <= tNext || tNext > maxD) break;
      if (tMX < tMZ) { ix += stepX; tMX += tDX; } else { iz += stepZ; tMZ += tDZ; }
    }
    // água
    if (!(opts && opts.noWater) && dy < -1e-6) {
      for (const w of this.water) {
        const t = (w.level - oy) / dy;
        if (t <= 0 || t >= bestT) continue;
        const x = ox + dx * t, z = oz + dz * t;
        if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) {
          bestT = t; best = { t, col: null, water: true, nx: 0, ny: 1, nz: 0 };
        }
      }
    }
    // terreno (só se a origem estiver acima dele)
    if (this.terrain && !(opts && opts.noTerrain)) {
      const h0 = this.terrainH(ox, oz);
      if (oy > h0 - 0.05) {
        const lim = Math.min(bestT, 450);
        const stepLen = 1.5;
        let prevT = 0;
        for (let t = stepLen; t <= lim + stepLen; t += stepLen) {
          const tt = Math.min(t, lim);
          const y = oy + dy * tt, h = this.terrainH(ox + dx * tt, oz + dz * tt);
          if (y < h) {
            let lo = prevT, hi = tt;
            for (let k = 0; k < 7; k++) {
              const m = (lo + hi) / 2;
              if (oy + dy * m < this.terrainH(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
            }
            if (hi < bestT) { bestT = hi; best = { t: hi, col: null, terrain: true, nx: 0, ny: 1, nz: 0 }; }
            break;
          }
          prevT = tt;
          if (tt >= lim) break;
        }
      }
    }
    if (best) { best.x = ox + dx * best.t; best.y = oy + dy * best.t; best.z = oz + dz * best.t; }
    return best;
  }

  // linha de visão entre dois pontos
  los(ax, ay, az, bx, by, bz, opts) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-4) return true;
    const h = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, { noWater: true, ...(opts || {}) });
    return !h;
  }
}
