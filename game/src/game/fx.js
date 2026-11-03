// Partículas (faíscas, poeira, sangue, fumaça, fogo, respingos), traçantes, buracos de bala,
// emissores contínuos e luzes de efeito.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';

class ParticleSystem {
  constructor(G, N, tex, additive) {
    this.N = N;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3); this.alpha = new Float32Array(N); this.size = new Float32Array(N);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.grav = new Float32Array(N);
    this.drag = new Float32Array(N); this.grow = new Float32Array(N); this.a0 = new Float32Array(N);
    this.free = []; for (let i = N - 1; i >= 0; i--) this.free.push(i);
    this.alive = new Set();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { map: { value: tex }, uScale: { value: 800 }, fogColor: { value: G.scene.fog.color }, fogDensity: { value: 0.012 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uScale;
        varying vec3 vC; varying float vA; varying float vDepth;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z;
          gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; uniform float fogDensity; varying vec3 vC; varying float vA; varying float vDepth;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float f = 1.0 - exp(-fogDensity*fogDensity*vDepth*vDepth);
          vec3 c = mix(vC, fogColor, ${additive ? '0.0' : 'f'}); float a = t.a * vA * ${additive ? '(1.0 - f)' : '1.0'};
          if (a < 0.003) discard; gl_FragColor = vec4(c * ${additive ? 't.rgb' : '1.0'}, a); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.geo = g;
    G.scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav = 0, drag = 0, grow = 0) {
    let i = this.free.pop();
    if (i === undefined) return;
    this.alive.add(i);
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.a0[i] = a; this.alpha[i] = a; this.size[i] = size;
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt, wind) {
    for (const i of this.alive) {
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) { this.alive.delete(i); this.free.push(i); this.alpha[i] = 0; this.size[i] = 0; continue; }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += (this.vel[k] + wind.x * this.drag[i] * 0.3) * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += (this.vel[k + 2] + wind.y * this.drag[i] * 0.3) * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 12 + 0.2);
      this.size[i] += this.grow[i] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
  clear() { for (const i of this.alive) { this.alpha[i] = 0; this.size[i] = 0; this.free.push(i); } this.alive.clear(); }
}

export class FX {
  constructor(G) {
    this.G = G;
    const T = G.level.T;
    this.add = new ParticleSystem(G, 2500, T.soft, true);
    this.norm = new ParticleSystem(G, 3000, T.smoke, false);
    this.emitters = [];
    // traçantes
    this.tracerN = 80;
    this.tracers = [];
    const tg = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(this.tracerN * 6);
    this.tracerCol = new Float32Array(this.tracerN * 6);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerLines.frustumCulled = false;
    G.scene.add(this.tracerLines);
    // buracos de bala
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.25, 'rgba(10,10,10,0.9)'); gr.addColorStop(0.5, 'rgba(40,38,35,0.5)'); gr.addColorStop(1, 'rgba(40,38,35,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const dt = new THREE.CanvasTexture(c);
    this.decalN = 220; this.decalI = 0;
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), this.decalN);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    G.scene.add(this.decals);
    // luzes de efeito
    this.fxLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffa050, 0, 30, 2); G.scene.add(l); return { l, t: 0, dur: 0, peak: 0 }; });
    this.muzzle = new THREE.PointLight(0xffb060, 0, 14, 2);
    G.scene.add(this.muzzle);
    this.muzzleT = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
  }
  resize(h, fov) {
    const s = (h * 0.5) / Math.tan((fov * Math.PI) / 360);
    this.add.uniforms.uScale.value = s; this.norm.uniforms.uScale.value = s;
  }
  // ---------- efeitos ----------
  impact(p, n, mat) {
    const nx = n.x, ny = n.y, nz = n.z;
    if (mat === 'water') { this.splash(p, 1); return; }
    if (mat === 'flesh') return;
    const sp = mat === 'metal' ? 9 : mat === 'glass' ? 6 : 3;
    for (let i = 0; i < sp; i++) this.add.spawn(p.x, p.y, p.z, nx * rand(2, 6) + rand(-3, 3), ny * rand(2, 6) + rand(-1, 4), nz * rand(2, 6) + rand(-3, 3), rand(0.12, 0.35), rand(0.03, 0.06), 1, rand(0.6, 0.85), 0.35, 1, 9, 1);
    const [r, g, b] = mat === 'wood' ? [0.35, 0.27, 0.18] : mat === 'sand' ? [0.4, 0.36, 0.27] : mat === 'glass' ? [0.6, 0.7, 0.75] : [0.38, 0.38, 0.37];
    for (let i = 0; i < 4; i++) this.norm.spawn(p.x + nx * 0.1, p.y + ny * 0.1, p.z + nz * 0.1, nx * rand(0.5, 2) + rand(-0.5, 0.5), ny * rand(0.5, 2) + rand(0, 0.8), nz * rand(0.5, 2) + rand(-0.5, 0.5), rand(0.6, 1.3), rand(0.25, 0.5), r, g, b, 0.55, 0.5, 2.2, 0.6);
    for (let i = 0; i < 3; i++) this.norm.spawn(p.x, p.y, p.z, nx * rand(2, 5) + rand(-2, 2), ny * rand(2, 5) + rand(0, 3), nz * rand(2, 5) + rand(-2, 2), rand(0.4, 0.8), 0.05, r * 0.6, g * 0.6, b * 0.6, 1, 14, 0.5);
    this.decal(p, n);
  }
  decal(p, n) {
    const i = this.decalI++ % this.decalN;
    this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x, n.y, n.z));
    const s = rand(0.7, 1.3);
    this._m.compose(new THREE.Vector3(p.x + n.x * 0.012, p.y + n.y * 0.012, p.z + n.z * 0.012), this._q, new THREE.Vector3(s, s, s));
    this.decals.setMatrixAt(i, this._m);
    this.decals.count = Math.min(this.decalN, Math.max(this.decals.count, i + 1));
    this.decals.instanceMatrix.needsUpdate = true;
  }
  blood(p, dir, big = false) {
    const n = big ? 16 : 7;
    for (let i = 0; i < n; i++) this.norm.spawn(p.x, p.y, p.z, dir.x * rand(1, 4) + rand(-1.2, 1.2), dir.y * rand(1, 3) + rand(-0.5, 1.5), dir.z * rand(1, 4) + rand(-1.2, 1.2), rand(0.25, 0.6), rand(0.08, 0.22), 0.28, 0.02, 0.02, 0.9, 6, 1.5, 0.4);
  }
  splash(p, s = 1) {
    for (let i = 0; i < 8 * s; i++) this.norm.spawn(p.x, p.y, p.z, rand(-1.5, 1.5) * s, rand(2, 5) * s, rand(-1.5, 1.5) * s, rand(0.3, 0.7), rand(0.1, 0.25) * s, 0.7, 0.78, 0.82, 0.6, 12, 0.5, 0.5);
  }
  rainSplash(x, y, z) { this.add.spawn(x, y + 0.02, z, rand(-0.4, 0.4), rand(0.6, 1.4), rand(-0.4, 0.4), 0.18, 0.05, 0.45, 0.5, 0.55, 0.6, 9, 0, 0); }
  muzzleSmoke(p, dir, n = 3, s = 1) {
    for (let i = 0; i < n; i++) this.norm.spawn(p.x, p.y, p.z, dir.x * rand(0.8, 2.2) * s + rand(-0.2, 0.2), dir.y * rand(0.8, 2) * s + rand(0.25, 0.7), dir.z * rand(0.8, 2.2) * s + rand(-0.2, 0.2), rand(0.8, 1.6), rand(0.12, 0.22) * s, 0.6, 0.6, 0.6, 0.3, -0.3, 2.2, 0.7 * s);
  }
  shell(p, right, up) {
    this.add.spawn(p.x, p.y, p.z, right.x * rand(2, 3) + up.x * 1.5, right.y * 2 + up.y * rand(1.5, 2.5), right.z * rand(2, 3) + up.z * 1.5, 0.5, 0.025, 0.9, 0.7, 0.3, 0.8, 12, 0.2);
  }
  sparks(p, n = 20, s = 1) {
    for (let i = 0; i < n; i++) this.add.spawn(p.x, p.y, p.z, rand(-6, 6) * s, rand(0, 8) * s, rand(-6, 6) * s, rand(0.3, 1.0), rand(0.03, 0.07), 1, rand(0.55, 0.9), 0.3, 1, 9.8, 0.6);
  }
  explosion(p, scale = 1) {
    const s = scale;
    for (let i = 0; i < 26 * s; i++) this.add.spawn(p.x, p.y + 0.3, p.z, rand(-7, 7) * s, rand(1, 9) * s, rand(-7, 7) * s, rand(0.25, 0.6), rand(0.8, 2.0) * s, 1, rand(0.45, 0.75), 0.18, 1, 2, 3, 3);
    for (let i = 0; i < 30 * s; i++) this.norm.spawn(p.x + rand(-1, 1), p.y + rand(0, 1.5), p.z + rand(-1, 1), rand(-3, 3) * s, rand(1, 5) * s, rand(-3, 3) * s, rand(3, 7), rand(1.5, 3) * s, 0.12, 0.11, 0.1, 0.7, -0.4, 1.4, 1.2);
    for (let i = 0; i < 24 * s; i++) this.norm.spawn(p.x, p.y + 0.3, p.z, rand(-12, 12) * s, rand(4, 14) * s, rand(-12, 12) * s, rand(0.8, 1.8), rand(0.06, 0.14), 0.15, 0.13, 0.12, 1, 14, 0.3);
    this.sparks(p, 30 * s, 1.4 * s);
    this.flashLight(p, 0xffa050, 900 * s, 0.35);
  }
  flashLight(p, color, peak, dur) {
    const f = this.fxLights.reduce((a, b) => (a.t <= b.t ? a : b));
    f.l.position.set(p.x, p.y + 1, p.z); f.l.color.set(color); f.peak = peak; f.dur = dur; f.t = dur;
  }
  muzzleFlash(p, strength = 1) {
    this.muzzle.position.copy(p);
    this.muzzle.intensity = 60 * strength;
    this.muzzleT = 0.05;
  }
  smokeCloud(p, dur = 18) {
    this.emitters.push({ kind: 'smokeGrenade', pos: p.clone(), t: dur, acc: 0 });
    for (let i = 0; i < 40; i++) this.norm.spawn(p.x + rand(-1, 1), p.y + rand(0, 1), p.z + rand(-1, 1), rand(-3, 3), rand(0.2, 1.5), rand(-3, 3), rand(6, 10), rand(2.5, 4), 0.55, 0.57, 0.58, 0.65, -0.05, 0.6, 0.35);
  }
  addEmitter(e) { this.emitters.push(e); return e; }
  tracer(a, b, color = 0xffb060, speed = 380, len = 7) {
    const c = new THREE.Color(color);
    const dir = new THREE.Vector3().subVectors(b, a);
    const dist = dir.length();
    if (dist < 2) return;
    dir.divideScalar(dist);
    if (this.tracers.length >= this.tracerN) this.tracers.shift();
    this.tracers.push({ a: a.clone(), dir, dist, t: 0, speed, len: Math.min(len, dist), c });
  }
  clear() {
    this.add.clear(); this.norm.clear();
    this.emitters = this.emitters.filter((e) => e.persistent);
    this.tracers = [];
    this.decals.count = 0;
  }
  update(dt) {
    const wind = this.G.weather ? new THREE.Vector2(this.G.weather.windDir.x * (this.G.weather.windStrength || 4), this.G.weather.windDir.y * (this.G.weather.windStrength || 4)) : new THREE.Vector2();
    // emissores
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (e.t !== undefined) { e.t -= dt; if (e.t <= 0) { this.emitters.splice(i, 1); continue; } }
      if (e.disabled) continue;
      e.acc = (e.acc || 0) + dt;
      const p = e.pos;
      if (e.kind === 'fire') {
        while (e.acc > 0.03) { e.acc -= 0.03; const s = e.scale || 1;
          this.add.spawn(p.x + rand(-1, 1) * s, p.y + rand(0, 0.5), p.z + rand(-1, 1) * s, rand(-0.4, 0.4), rand(2, 4) * s, rand(-0.4, 0.4), rand(0.4, 0.9), rand(0.6, 1.4) * s, 1, rand(0.35, 0.6), 0.12, 0.9, -1, 1, -0.8);
          if (Math.random() < 0.35) this.norm.spawn(p.x + rand(-1, 1) * s, p.y + 1.5 * s, p.z + rand(-1, 1) * s, rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), rand(3, 6), rand(1, 2.5) * s, 0.06, 0.06, 0.06, 0.55, -0.2, 0.6, 1);
          if (Math.random() < 0.15) this.add.spawn(p.x, p.y + 1, p.z, rand(-2, 2), rand(3, 7), rand(-2, 2), rand(0.6, 1.5), 0.05, 1, 0.6, 0.2, 1, 3, 0.4);
        }
      } else if (e.kind === 'smokeGrenade') {
        while (e.acc > 0.12) { e.acc -= 0.12; this.norm.spawn(p.x + rand(-2.5, 2.5), p.y + rand(0, 2), p.z + rand(-2.5, 2.5), rand(-0.6, 0.6), rand(0.1, 0.5), rand(-0.6, 0.6), rand(5, 8), rand(3, 4.5), 0.52, 0.54, 0.55, 0.6, -0.04, 0.5, 0.25); }
      } else if (e.kind === 'mist') {
        while (e.acc > 0.05) { e.acc -= 0.05; this.norm.spawn(p.x + rand(-e.w, e.w), p.y + rand(0, 2), p.z + rand(-2, 2), rand(-1, 1), rand(1, 3), rand(0.5, 3), rand(2, 4), rand(2, 4), 0.6, 0.66, 0.7, 0.35, -0.2, 0.5, 1); }
      } else if (e.kind === 'steam') {
        while (e.acc > 0.06) { e.acc -= 0.06; this.norm.spawn(p.x, p.y, p.z, rand(-0.5, 0.5) + (e.dx || 0), rand(2, 4), rand(-0.5, 0.5), rand(1, 2), rand(0.4, 0.8), 0.7, 0.72, 0.75, 0.4, -0.5, 1, 1.5); }
      } else if (e.kind === 'flare') {
        while (e.acc > 0.04) { e.acc -= 0.04; this.add.spawn(p.x, p.y, p.z, rand(-0.5, 0.5), rand(0.5, 1.5), rand(-0.5, 0.5), 0.3, rand(0.3, 0.6), 1, 0.15, 0.1, 1, 0, 1, 0); this.norm.spawn(p.x, p.y, p.z, rand(-0.2, 0.2), rand(0.4, 1), rand(-0.2, 0.2), rand(2, 4), rand(0.4, 0.8), 0.6, 0.25, 0.22, 0.35, -0.1, 0.6, 0.6); }
      } else if (e.kind === 'sparkler') {
        while (e.acc > 0.25) { e.acc -= 0.25; if (Math.random() < 0.4) this.sparks(p, 8, 0.6); }
      }
    }
    this.add.update(dt, wind);
    this.norm.update(dt, wind);
    // traçantes
    const P = this.tracerPos, C = this.tracerCol;
    P.fill(0); C.fill(0);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt;
      if (tr.t * tr.speed - tr.len >= tr.dist) { this.tracers.splice(i, 1); continue; }
    }
    this.tracers.forEach((tr, i) => {
      const travel = tr.t * tr.speed;
      const head = Math.min(tr.dist, travel), tail = Math.max(0, Math.min(tr.dist, travel - tr.len));
      const k = i * 6;
      P[k] = tr.a.x + tr.dir.x * tail; P[k + 1] = tr.a.y + tr.dir.y * tail; P[k + 2] = tr.a.z + tr.dir.z * tail;
      P[k + 3] = tr.a.x + tr.dir.x * head; P[k + 4] = tr.a.y + tr.dir.y * head; P[k + 5] = tr.a.z + tr.dir.z * head;
      C[k] = tr.c.r * 0.2; C[k + 1] = tr.c.g * 0.2; C[k + 2] = tr.c.b * 0.2;
      C[k + 3] = tr.c.r * 3; C[k + 4] = tr.c.g * 3; C[k + 5] = tr.c.b * 3;
    });
    this.tracerLines.geometry.attributes.position.needsUpdate = true;
    this.tracerLines.geometry.attributes.color.needsUpdate = true;
    // luzes
    for (const f of this.fxLights) {
      if (f.t > 0) { f.t -= dt; f.l.intensity = f.peak * clamp(f.t / f.dur, 0, 1) ** 2; } else f.l.intensity = 0;
    }
    if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) this.muzzle.intensity = 0; }
    // névoa nas partículas
    const fogD = this.G.scene.fog.density;
    this.add.uniforms.fogDensity.value = fogD; this.norm.uniforms.fogDensity.value = fogD;
  }
}
