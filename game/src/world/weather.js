// Tempestade: céu com nuvens, chuva na GPU, relâmpagos (luz, raio no céu, trovão), vento, névoa.
import * as THREE from 'three';
import { rand, clamp, lerp } from '../core/utils.js';
import { MATCH_WEATHER } from './match-weather.js';

export class Weather {
  constructor(G) {
    this.G = G;
    this.intensity = 0.6;      // 0..1 da tempestade
    this.flash = 0;            // brilho atual do relâmpago 0..1
    this.lastStrike = -99;     // tempo do último relâmpago
    this.nextStrike = 6;
    this.flashSeq = [];
    this.indoor = false;
    this.windDir = new THREE.Vector2(0.6, 0.25);
    this.time = 0;
    this.lightningDisabled = false;
    this._buildSky();
    this._buildRain();
    this._buildBolt();
    this._buildCityLights();
  }
  _buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uFlash: { value: 0 }, uStorm: { value: 0.6 }, uMatch: { value: 0 }, uLow: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() }, uCloudColor: { value: new THREE.Color() }, uCloudAmount: { value: 0 }, uSun: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, tCloud: { value: this.G.pbr && this.G.pbr.skyclouds ? this.G.pbr.skyclouds.map : null }, uHasCloud: { value: this.G.pbr && this.G.pbr.skyclouds ? 1 : 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `
        varying vec3 vDir; uniform float uTime, uFlash, uStorm, uHasCloud, uMatch, uCloudAmount;
        uniform vec3 uLow, uHigh, uCloudColor, uSun, uSunColor; uniform sampler2D tCloud;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=.5;} return s; }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 low = vec3(0.022, 0.028, 0.036), high = vec3(0.006, 0.008, 0.012);
          vec3 col = mix(low, high, smoothstep(0.0, 0.6, h));
          vec2 uv = d.xz / max(0.08, d.y + 0.15) * 0.6;
          float c = fbm(uv * 1.3 + vec2(uTime*0.012, uTime*0.004));
          float c2 = fbm(uv * 3.1 - vec2(uTime*0.02, 0.0));
          float clouds = smoothstep(0.35, 0.9, c*0.7 + c2*0.4);
          if (uHasCloud > 0.5) {
            // camadas de nuvem fotográficas (geradas): duas escalas derivando em direções diferentes
            vec2 cu = d.xz / max(0.10, d.y + 0.10) * 0.22;
            float t1 = dot(texture2D(tCloud, cu + vec2(uTime * 0.003, uTime * 0.001)).rgb, vec3(0.333));
            float t2 = dot(texture2D(tCloud, cu * 2.3 - vec2(uTime * 0.005, 0.0)).rgb, vec3(0.333));
            clouds = clamp(smoothstep(0.25, 0.8, t1 * 0.65 + t2 * 0.45), 0.0, 1.0);
          }
          col = mix(col, vec3(0.035,0.04,0.05), clouds * 0.8);
          // brilho das cidades no horizonte sul
          float south = smoothstep(0.3, 1.0, d.z) * smoothstep(0.18, -0.02, d.y);
          col += vec3(0.09, 0.05, 0.02) * south * 0.5;
          // relâmpago ilumina as nuvens por dentro
          col += vec3(0.55, 0.62, 0.8) * uFlash * (0.25 + clouds * 1.4) * smoothstep(-0.05, 0.3, h);
          if (uMatch > 0.5) {
            col = mix(uLow, uHigh, smoothstep(-0.02, 0.85, h));
            float cover = smoothstep(1.0-uCloudAmount, 1.25-uCloudAmount, clouds);
            col = mix(col, uCloudColor, cover * 0.85);
            float sunDot = max(0.0, dot(d, normalize(uSun)));
            col += uSunColor * (pow(sunDot, 1200.0) * 1.4 + pow(sunDot, 16.0) * 0.12) * (1.0-cover*0.92);
          }
          gl_FragColor = vec4(col, 1.0);
          if (uMatch > 0.5) gl_FragColor = linearToOutputTexel(gl_FragColor);
        }`,
    });
    this.skyMat = mat;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.sky = sky;
    this.G.scene.add(sky);
  }
  _buildRain() {
    const N = 9000, BOX = 50, H = 30;
    const offsets = new Float32Array(N * 2 * 3), ends = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * BOX, y = Math.random() * H, z = Math.random() * BOX;
      for (let k = 0; k < 2; k++) { offsets.set([x, y, z], (i * 2 + k) * 3); ends[i * 2 + k] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(offsets, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uOpacity: { value: 0.3 }, uFlash: { value: 0 }, uBox: { value: new THREE.Vector3(BOX, H, BOX) }, uDensity: { value: 1 }, uOffset: { value: new THREE.Vector3() } },
      vertexShader: `
        attribute float aEnd; uniform float uTime, uDensity; uniform vec3 uCam, uBox, uOffset; uniform vec2 uWind;
        varying float vA;
        void main(){
          vec3 vel = vec3(uWind.x, -24.0, uWind.y);
          vec3 p = position + uOffset;
          p = mod(p - uCam + uBox*0.5, uBox) + uCam - uBox*0.5;
          p -= normalize(vel) * 0.55 * aEnd;
          float d = length(p - uCam);
          float keep = step(0.00001, uDensity) * step(fract(position.x*13.7+position.z*7.3), uDensity);
          vA = (1.0 - aEnd*0.7) * smoothstep(25.0, 4.0, d) * smoothstep(0.4, 1.5, d) * keep;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform float uOpacity, uFlash; varying float vA;
        void main(){ gl_FragColor = vec4(vec3(0.62,0.68,0.78)*(1.0+uFlash*4.0), vA*uOpacity); }`,
    });
    const rain = new THREE.LineSegments(g, mat);
    rain.frustumCulled = false;
    this.rain = rain; this.rainMat = mat;
    this.G.scene.add(rain);
  }
  _buildBolt() {
    const mat = new THREE.LineBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, fog: false, depthWrite: false });
    this.boltMat = mat;
    this.bolt = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
    this.bolt.frustumCulled = false;
    this.G.scene.add(this.bolt);
  }
  _buildCityLights() {
    // luzes das cidades a jusante: o que está em jogo
    const pts = [], cols = [];
    for (let i = 0; i < 900; i++) {
      const cx = [-120, 60, 260, -300][i % 4], cz = [1500, 1900, 1650, 1750][i % 4];
      pts.push(cx + rand(-200, 200), -60 + rand(-4, 4), cz + rand(-120, 120));
      const w = Math.random();
      cols.push(1, 0.6 + w * 0.3, 0.3 + w * 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.75, depthWrite: false });
    this.cities = new THREE.Points(g, m);
    this.G.scene.add(this.cities);
  }
  strike(near = false) {
    if (this.matchWeather && !this.matchWeather.lightning) return;
    // sequência de 2-3 flashes
    const t = this.time;
    this.flashSeq = [{ t, v: 1 }, { t: t + 0.08, v: 0.25 }, { t: t + 0.16, v: 0.9 }];
    if (Math.random() < 0.5) this.flashSeq.push({ t: t + 0.32, v: 0.6 });
    this.lastStrike = t;
    const dist = near ? rand(250, 500) : rand(500, 2200);
    const ang = rand(0, Math.PI * 2);
    const cam = this.G.camera.position;
    const bx = cam.x + Math.cos(ang) * dist, bz = cam.z + Math.sin(ang) * dist;
    // raio no céu
    const pts = [];
    let x = bx, y = 260, z = bz;
    const segs = [];
    for (let i = 0; i < 18; i++) {
      const nx = x + rand(-18, 18), ny = y - rand(10, 22), nz = z + rand(-18, 18);
      segs.push(x, y, z, nx, ny, nz);
      if (Math.random() < 0.25) { segs.push(nx, ny, nz, nx + rand(-30, 30), ny - rand(15, 30), nz + rand(-30, 30)); }
      x = nx; y = ny; z = nz;
    }
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry();
    this.bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    this.G.audio && this.G.audio.thunder(dist);
    this.G.onLightning && this.G.onLightning(dist);
  }
  update(dt) {
    this.time += dt;
    const t = this.time, I = this.intensity;
    // agenda de relâmpagos
    if (!this.lightningDisabled && t > this.nextStrike) {
      this.strike(Math.random() < 0.3 + I * 0.3);
      this.nextStrike = t + lerp(26, 5, I) * rand(0.6, 1.4);
    }
    let f = 0;
    for (const s of this.flashSeq) { const dt2 = t - s.t; if (dt2 >= 0 && dt2 < 0.25) f = Math.max(f, s.v * (1 - dt2 / 0.25)); }
    this.flash = f;
    this.boltMat.opacity = f > 0.2 ? f : 0;
    // vento oscilando
    const gust = 0.5 + 0.5 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1);
    const wind = (3 + I * 6) * (0.6 + gust * 0.8);
    const cam = this.G.camera.position;
    const U = this.rainMat.uniforms;
    U.uTime.value = t; U.uCam.value.copy(cam);
    U.uWind.value.set(this.windDir.x * wind, this.windDir.y * wind);
    const o = U.uOffset.value, bx = U.uBox.value;
    o.x = (o.x + this.windDir.x * wind * dt) % bx.x;
    o.y = (o.y - 24 * dt) % bx.y;
    o.z = (o.z + this.windDir.y * wind * dt) % bx.z;
    U.uFlash.value = f;
    const dry = I <= 0;
    this.rain.visible = !dry && !this.indoor;
    U.uDensity.value = dry ? 0 : this.matchWeather ? I : clamp(0.45 + I * 0.6, 0, 1);
    U.uOpacity.value = this.indoor || dry ? 0 : this.matchWeather ? 0.24 : 0.26 + I * 0.12;
    this.windStrength = wind;
    this.skyMat.uniforms.uTime.value = t;
    this.skyMat.uniforms.uFlash.value = f;
    this.sky.position.copy(cam);
    // névoa e luz do relâmpago
    const fog = this.G.scene.fog;
    fog.density = lerp(0.0105, 0.016, I) * (1 - f * 0.5);
    fog.color.setRGB(0.028 + f * 0.25, 0.034 + f * 0.27, 0.045 + f * 0.33);
    const LB = this.G.lightBase || { hemi: 1.6, moon: 0.45 };
    // interiores e áreas sem energia recebem menos luz de céu
    const z = this.G.player && this.G.player.zone;
    const target = !z ? 1 : z.name === 'gallery' ? 0.12 : z.indoor ? 0.4 : z.dark ? 0.55 : 1;
    this.ambK = this.ambK === undefined ? target : this.ambK + (target - this.ambK) * Math.min(1, dt * 2.5);
    const fk = this.indoor ? 0.25 : 1;
    if (this.matchWeather) {
      const p = this.matchWeather;
      fog.density = p.fogDensity; fog.color.setHex(p.fog);
      this.G.moon.intensity = p.sun * Math.max(0.3, this.ambK);
      this.G.hemi.intensity = p.hemi * this.ambK;
      this.G.scene.environmentIntensity = p.environment * Math.max(0.15, this.ambK);
      return;
    }
    this.G.moon.intensity = (LB.moon + f * 3.2 * fk) * Math.max(0.3, this.ambK);
    this.G.hemi.intensity = (LB.hemi + f * 1.1 * fk) * this.ambK;
    this.G.scene.environmentIntensity = (0.7 + f * 1.5 * fk) * Math.max(0.15, this.ambK);
  }
  setMatchWeather(id) {
    const p = MATCH_WEATHER[id];
    if (!p) throw new RangeError(`Unknown match weather: ${id}`);
    const G = this.G;
    if (!this._campaignWeather) this._campaignWeather = {
      intensity: this.intensity, lightningDisabled: this.lightningDisabled,
      nextStrike: Math.max(0, this.nextStrike - this.time),
      hemi: G.hemi.color.clone(), ground: G.hemi.groundColor.clone(), moon: G.moon.color.clone(),
      hemiIntensity: G.hemi.intensity, moonIntensity: G.moon.intensity,
      environment: G.scene.environmentIntensity, fog: G.scene.fog.color.clone(), density: G.scene.fog.density,
      cities: this.cities.visible, ambK: this.ambK,
    };
    this.matchWeather = p; this.matchWeatherId = id; this.intensity = p.rain;
    this.lightningDisabled = !p.lightning; this.flashSeq = []; this.flash = 0; this.boltMat.opacity = 0;
    const U = this.skyMat.uniforms;
    U.uMatch.value = 1; U.uLow.value.setHex(p.skyLow); U.uHigh.value.setHex(p.skyHigh);
    U.uCloudColor.value.setHex(p.cloud); U.uCloudAmount.value = p.cloudAmount;
    U.uSun.value.set(-0.4, p.sunHeight, -0.28).normalize(); U.uSunColor.value.setHex(p.sunColor);
    G.hemi.color.setHex(p.hemiSky); G.hemi.groundColor.setHex(p.ground); G.moon.color.setHex(p.sunColor);
    this.cities.visible = false; this.ambK = undefined;
    this.update(0);
    return p;
  }
  clearMatchWeather() {
    const s = this._campaignWeather;
    if (!s) return;
    const G = this.G;
    this.matchWeather = null; this.matchWeatherId = null; this._campaignWeather = null;
    this.intensity = s.intensity; this.lightningDisabled = s.lightningDisabled;
    this.nextStrike = this.time + s.nextStrike; this.flashSeq = []; this.flash = 0;
    this.boltMat.opacity = 0; this.skyMat.uniforms.uMatch.value = 0; this.skyMat.uniforms.uFlash.value = 0;
    G.hemi.color.copy(s.hemi); G.hemi.groundColor.copy(s.ground); G.moon.color.copy(s.moon);
    G.hemi.intensity = s.hemiIntensity; G.moon.intensity = s.moonIntensity;
    G.scene.environmentIntensity = s.environment; G.scene.fog.color.copy(s.fog); G.scene.fog.density = s.density;
    this.cities.visible = s.cities; this.ambK = s.ambK;
    this.rain.visible = this.intensity > 0 && !this.indoor;
    this.rainMat.uniforms.uDensity.value = this.intensity <= 0 ? 0 : clamp(0.45 + this.intensity * 0.6, 0, 1);
    this.rainMat.uniforms.uOpacity.value = this.indoor || this.intensity <= 0 ? 0 : 0.26 + this.intensity * 0.12;
  }
}
