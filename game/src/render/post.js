// Pipeline: cena (HDR) + viewmodel -> bloom (pirâmide de 5 níveis) -> passe final com nitidez, ACES, gradação de cor,
// NVG, dano, supressão, flash, fade, luneta.
import * as THREE from 'three';

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.scale = 1;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.rt.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);
    this.aoEnabled = true; this.bloomEnabled = true;
    this.uniforms = {
      tScene: { value: this.rt.texture }, uTime: { value: 0 }, uNVG: { value: 0 }, uGain: { value: 11 },
      uGlare: { value: 0 }, uDamage: { value: 0 }, uFlash: { value: 0 }, uLowHealth: { value: 0 },
      uExposure: { value: 1.0 }, uSuppress: { value: 0 }, uFade: { value: 0 }, uAspect: { value: size.x / size.y },
      uUnder: { value: 0 }, uRes: { value: new THREE.Vector2(size.x, size.y) }, uScope: { value: 0 }, uSat: { value: 1 },
      tBloom: { value: null }, uFocus: { value: 0 }, tAO: { value: null }, uAOk: { value: 0.85 }, uBloom: { value: 0.32 }, uSharp: { value: 0.12 }, uGrade: { value: 1 }, uRain: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tScene, tBloom, tAO; uniform vec2 uRes; uniform float uAOk;
        uniform float uBloom, uSharp, uGrade, uRain, uFocus;
        uniform float uTime, uNVG, uGain, uGlare, uDamage, uFlash, uLowHealth, uExposure, uSuppress, uFade, uAspect, uUnder, uScope, uSat;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
        void main(){
          vec2 uv = vUv;
          if (uUnder > 0.0) uv += vec2(sin(uv.y*30.0+uTime*3.0), cos(uv.x*25.0+uTime*2.0)) * 0.004 * uUnder;
          vec2 dir = uv - 0.5;
          float ca = 0.00035 + uSuppress*0.004 + uDamage*0.003;
          vec3 col;
          col.r = texture2D(tScene, uv + dir*ca).r;
          col.g = texture2D(tScene, uv).g;
          col.b = texture2D(tScene, uv - dir*ca).b;
          if (uSuppress > 0.02) {
            vec3 b = vec3(0.0);
            vec2 px = 1.5 / uRes * (1.0 + uSuppress * 2.0);
            b += texture2D(tScene, uv + vec2(px.x, 0.0)).rgb; b += texture2D(tScene, uv - vec2(px.x, 0.0)).rgb;
            b += texture2D(tScene, uv + vec2(0.0, px.y)).rgb; b += texture2D(tScene, uv - vec2(0.0, px.y)).rgb;
            float edge = smoothstep(0.15, 0.7, length(dir));
            col = mix(col, b * 0.25, uSuppress * edge);
          }
          // nitidez adaptativa (CAS simplificado) — só fora do NVG
          if (uSharp > 0.0 && uNVG < 0.5) {
            vec2 px = 1.0 / uRes;
            vec3 n = texture2D(tScene, uv + vec2(0.0, px.y)).rgb, s = texture2D(tScene, uv - vec2(0.0, px.y)).rgb,
                 e = texture2D(tScene, uv + vec2(px.x, 0.0)).rgb, w = texture2D(tScene, uv - vec2(px.x, 0.0)).rgb;
            vec3 mn = min(min(n, s), min(e, w)), mx = max(max(n, s), max(e, w));
            vec3 amp = clamp(min(mn, 1.0 - mx) / max(mx, vec3(0.0001)), 0.0, 1.0);
            float wgt = -1.0 / mix(8.0, 5.0, uSharp * 4.0);
            vec3 sh = (col + (n + s + e + w) * wgt * vec3(1.0)) / (1.0 + 4.0 * wgt);
            col = mix(col, max(sh, 0.0), clamp(uSharp * 3.0, 0.0, 1.0) * 0.6);
          }
          // foco ao mirar: periferia levemente desfocada (profundidade de campo de lente)
          if (uFocus > 0.01 && uNVG < 0.5) {
            vec2 px = 2.2 / uRes; float e = smoothstep(0.10, 0.62, length(dir * vec2(uAspect, 1.0)));
            vec3 b = vec3(0.0);
            for (int k = 0; k < 8; k++) { float a = float(k) * 0.7853982; b += texture2D(tScene, uv + vec2(cos(a), sin(a)) * px * (1.0 + e * 3.5)).rgb; }
            col = mix(col, b * 0.125, e * uFocus * 0.9);
          }
          col *= mix(1.0, texture2D(tAO, uv).r, uAOk);
          col += texture2D(tBloom, uv).rgb * uBloom * (uNVG > 0.5 ? 0.35 : 1.0);
          col *= uExposure;
          float grainS = hash(uv * uRes + fract(uTime) * 917.0) - 0.5;
          if (uNVG > 0.5) {
            float l = dot(col, vec3(0.3, 0.59, 0.11)) * uGain + uGlare + 0.025;
            l = 1.0 - exp(-l * 1.4);
            l += grainS * 0.16 + (hash(uv * 0.5 * uRes + uTime) - 0.5) * 0.04;
            l = max(l, 0.0);
            vec3 nv = vec3(0.16, 1.0, 0.38) * l + vec3(0.01, 0.035, 0.015);
            nv = mix(nv, vec3(0.85, 1.0, 0.9), smoothstep(0.85, 1.2, l) * 0.6);
            float r = length(dir * vec2(uAspect, 1.0));
            nv *= smoothstep(0.78, 0.42, r);
            nv *= 0.92 + 0.08 * sin(uv.y * uRes.y * 1.2);
            col = nv;
          } else {
            col = aces(col);
            // gradação: sombras frias, altas-luzes quentes, curva S leve (cinematográfico, tom azul-petróleo/âmbar)
            float lg = dot(col, vec3(0.299, 0.587, 0.114));
            vec3 graded = mix(col * vec3(0.93, 1.0, 1.08), col * vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.75, lg));
            graded = graded * graded * (3.0 - 2.0 * graded) * 0.35 + graded * 0.65;
            col = mix(col, graded, uGrade);
            col = pow(col, vec3(1.0 / 2.2));
            float lum = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(vec3(lum), col, uSat * (1.0 - uLowHealth * 0.75));
            col += grainS * (0.045 - 0.03 * lum);
            float vig = smoothstep(0.95, 0.35, length(dir * vec2(uAspect * 0.8, 1.0)));
            col *= mix(0.7, 1.0, vig);
          }
          // dano / vida baixa
          float edge = smoothstep(0.25, 0.85, length(dir * vec2(uAspect * 0.75, 1.0)));
          col = mix(col, vec3(0.45, 0.0, 0.0), edge * clamp(uDamage * 0.8 + uLowHealth * 0.55 * (0.75 + 0.25 * sin(uTime * 6.0)), 0.0, 0.85));
          // água
          col = mix(col, col * vec3(0.3, 0.55, 0.5), uUnder * 0.8);
          // luneta
          if (uScope > 0.5) {
            vec2 sp = dir * vec2(uAspect, 1.0);
            float r = length(sp);
            float ring = smoothstep(0.375, 0.37, r);
            col *= ring;
            col *= mix(1.0, 0.75, smoothstep(0.2, 0.37, r));
            float lw = 0.0012;
            float cross = (step(abs(sp.x), lw) * step(0.012, abs(sp.y))) + (step(abs(sp.y), lw) * step(0.012, abs(sp.x)));
            float thick = (step(abs(sp.x), lw * 3.0) * step(0.18, abs(sp.y))) + (step(abs(sp.y), lw * 3.0) * step(0.18, abs(sp.x)));
            col = mix(col, vec3(0.0), clamp(cross + thick, 0.0, 1.0) * ring);
            col = mix(col, vec3(1.0, 0.15, 0.1), smoothstep(0.004, 0.002, r));
          }
          // flash / fade
          col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));
          col *= 1.0 - uFade;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    // ---- bloom ----
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.bloomDown = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uThr: { value: 0.0 }, uFirst: { value: 0 } }, depthTest: false, depthWrite: false, vertexShader: vs,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uPx; uniform float uThr, uFirst;
        vec3 pre(vec3 c){ float b = max(max(c.r, c.g), c.b); float k = max(b - uThr, 0.0) / max(b, 1e-4); return c * k; }
        void main(){
          vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
          c += texture2D(tSrc, vUv + uPx * vec2(-1.0, -1.0)).rgb; c += texture2D(tSrc, vUv + uPx * vec2(1.0, -1.0)).rgb;
          c += texture2D(tSrc, vUv + uPx * vec2(-1.0, 1.0)).rgb; c += texture2D(tSrc, vUv + uPx * vec2(1.0, 1.0)).rgb;
          c *= 1.0 / 8.0;
          if (uFirst > 0.5) c = pre(min(c, vec3(14.0)));
          gl_FragColor = vec4(c, 1.0);
        }` });
    this.bloomUp = new THREE.ShaderMaterial({
      uniforms: { tLow: { value: null }, tHigh: { value: null }, uPx: { value: new THREE.Vector2() }, uMix: { value: 1.0 } }, depthTest: false, depthWrite: false, vertexShader: vs,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tLow, tHigh; uniform vec2 uPx; uniform float uMix;
        void main(){
          vec3 c = texture2D(tLow, vUv).rgb * 4.0;
          c += texture2D(tLow, vUv + uPx * vec2(-1.0, 0.0)).rgb * 2.0; c += texture2D(tLow, vUv + uPx * vec2(1.0, 0.0)).rgb * 2.0;
          c += texture2D(tLow, vUv + uPx * vec2(0.0, -1.0)).rgb * 2.0; c += texture2D(tLow, vUv + uPx * vec2(0.0, 1.0)).rgb * 2.0;
          c += texture2D(tLow, vUv + uPx * vec2(-1.0, -1.0)).rgb; c += texture2D(tLow, vUv + uPx * vec2(1.0, -1.0)).rgb;
          c += texture2D(tLow, vUv + uPx * vec2(-1.0, 1.0)).rgb; c += texture2D(tLow, vUv + uPx * vec2(1.0, 1.0)).rgb;
          c *= 1.0 / 16.0;
          gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + c * uMix, 1.0);
        }` });
    // ---- SSAO (meia resolução): amostras em espiral no espaço de tela, ruído Bayer 4x4 desfeito por blur 4x4 ----
    this.aoMat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: this.rt.depthTexture }, uProjInv: { value: new THREE.Matrix4() }, uPx: { value: new THREE.Vector2() }, uFocal: { value: 600 }, uRadius: { value: 1.1 }, uInt: { value: 1.6 } },
      depthTest: false, depthWrite: false, vertexShader: vs,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tDepth; uniform mat4 uProjInv; uniform vec2 uPx; uniform float uFocal, uRadius, uInt;
        vec3 vp(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
        float bayer(vec2 p){ int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0)); float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0); return m[y * 4 + x] / 16.0; }
        void main(){
          float d0 = texture2D(tDepth, vUv).x;
          if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
          vec3 P = vp(vUv);
          vec3 px = vp(vUv + vec2(uPx.x, 0.0)), nx = vp(vUv - vec2(uPx.x, 0.0)), py = vp(vUv + vec2(0.0, uPx.y)), ny = vp(vUv - vec2(0.0, uPx.y));
          vec3 dx = abs(px.z - P.z) < abs(nx.z - P.z) ? px - P : P - nx;
          vec3 dy = abs(py.z - P.z) < abs(ny.z - P.z) ? py - P : P - ny;
          vec3 N = normalize(cross(dx, dy)); if (N.z < 0.0) N = -N;
          float ssr = uRadius * uFocal / max(-P.z, 0.3);
          ssr = min(ssr, 90.0);
          float rnd = bayer(gl_FragCoord.xy) * 6.2831853;
          float occ = 0.0; const int NS = 12;
          for (int i = 0; i < NS; i++) {
            float a = rnd + float(i) * 2.39996, rr = (float(i) + 0.5) / float(NS);
            vec2 off = vec2(cos(a), sin(a)) * rr * ssr * uPx;
            vec3 S = vp(vUv + off); vec3 v = S - P;
            float vv = dot(v, v), vn = dot(v, N) - 0.04;
            float w = max(uRadius * uRadius - vv, 0.0);
            occ += w * w * w * max(vn, 0.0) / (0.02 + vv);
          }
          occ = occ / float(NS) / (uRadius * uRadius * uRadius * uRadius * uRadius * uRadius) * uInt * 3.0;
          float fade = smoothstep(80.0, 25.0, -P.z);
          gl_FragColor = vec4(vec3(1.0 - clamp(occ, 0.0, 1.0) * fade), 1.0);
        }` });
    this.aoBlur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uPx: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, vertexShader: vs,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uPx;
        void main(){ float s = 0.0; for (int y = -2; y < 2; y++) for (int x = -2; x < 2; x++) s += texture2D(tSrc, vUv + (vec2(float(x), float(y)) + 0.5) * uPx).r; gl_FragColor = vec4(vec3(s / 16.0), 1.0); }` });
    this.bloomN = 5; this.bDown = []; this.bUp = [];
    this._makeBloomTargets(size.x, size.y);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  _makeBloomTargets(W, H) {
    for (const t of [...this.bDown, ...this.bUp]) t.dispose();
    this.bDown = []; this.bUp = [];
    let w = Math.max(2, Math.floor(W / 2)), h = Math.max(2, Math.floor(H / 2));
    for (let i = 0; i < this.bloomN; i++) {
      const o = { type: THREE.HalfFloatType, depthBuffer: false };
      this.bDown.push(new THREE.WebGLRenderTarget(w, h, o)); this.bUp.push(new THREE.WebGLRenderTarget(w, h, o));
      w = Math.max(2, Math.floor(w / 2)); h = Math.max(2, Math.floor(h / 2));
    }
    this.uniforms.tBloom.value = this.bUp[0].texture;
    // AO em meia resolução
    for (const t of [this.aoA, this.aoB]) t && t.dispose();
    const aw = Math.max(2, Math.floor(W / 2)), ah = Math.max(2, Math.floor(H / 2));
    const o = { type: THREE.HalfFloatType, depthBuffer: false };
    this.aoA = new THREE.WebGLRenderTarget(aw, ah, o); this.aoB = new THREE.WebGLRenderTarget(aw, ah, o);
    this.aoMat.uniforms.uPx.value.set(1 / aw, 1 / ah); this.aoBlur.uniforms.uPx.value.set(1 / aw, 1 / ah);
    this.uniforms.tAO.value = this.aoB.texture;
  }
  _ao(camera) {
    const r = this.r, q = this.quad;
    const u = this.aoMat.uniforms;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uFocal.value = 0.5 * this.aoA.height * camera.projectionMatrix.elements[5];
    q.material = this.aoMat; r.setRenderTarget(this.aoA); r.render(this.scene, this.cam);
    this.aoBlur.uniforms.tSrc.value = this.aoA.texture;
    q.material = this.aoBlur; r.setRenderTarget(this.aoB); r.render(this.scene, this.cam);
    q.material = this.mat;
  }
  _bloom() {
    const r = this.r, q = this.quad, N = this.bloomN;
    // descida
    let src = this.rt.texture, sw = this.rt.width, sh = this.rt.height;
    q.material = this.bloomDown;
    for (let i = 0; i < N; i++) {
      const t = this.bDown[i];
      this.bloomDown.uniforms.tSrc.value = src; this.bloomDown.uniforms.uPx.value.set(1 / sw, 1 / sh);
      this.bloomDown.uniforms.uFirst.value = i === 0 ? 1 : 0; this.bloomDown.uniforms.uThr.value = 1.9;
      r.setRenderTarget(t); r.render(this.scene, this.cam);
      src = t.texture; sw = t.width; sh = t.height;
    }
    // subida: up[N-1] = down[N-1]; up[i] = down[i] + tent(up[i+1])
    q.material = this.bloomUp;
    r.setRenderTarget(this.bUp[N - 1]); this.bloomUp.uniforms.tLow.value = this.bDown[N - 1].texture; this.bloomUp.uniforms.tHigh.value = this.bDown[N - 1].texture; this.bloomUp.uniforms.uMix.value = 0; this.bloomUp.uniforms.uPx.value.set(1 / this.bDown[N - 1].width, 1 / this.bDown[N - 1].height); r.render(this.scene, this.cam);
    for (let i = N - 2; i >= 0; i--) {
      const lo = this.bUp[i + 1];
      this.bloomUp.uniforms.tLow.value = lo.texture; this.bloomUp.uniforms.tHigh.value = this.bDown[i].texture; this.bloomUp.uniforms.uMix.value = 1.0;
      this.bloomUp.uniforms.uPx.value.set(1 / lo.width, 1 / lo.height);
      r.setRenderTarget(this.bUp[i]); r.render(this.scene, this.cam);
    }
    q.material = this.mat;
  }
  resize(w, h, pixelRatio) {
    const W = Math.floor(w * pixelRatio * this.scale), H = Math.floor(h * pixelRatio * this.scale);
    this.rt.setSize(W, H);
    this.uniforms.uAspect.value = w / h;
    this.uniforms.uRes.value.set(W, H);
    this._makeBloomTargets(W, H);
    if (this.whiteTex) this.whiteTex.needsUpdate = true;
  }
  render(scene, camera, vmScene, vmCamera) {
    const r = this.r;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    if (this.aoEnabled) this._ao(camera); else this.uniforms.tAO.value = this.whiteTex || (this.whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
    r.setRenderTarget(this.rt);
    if (vmScene) { r.clearDepth(); r.render(vmScene, vmCamera); }
    this.uniforms.uBloom.value = this.bloomEnabled ? 0.32 : 0.0;
    if (this.bloomEnabled) this._bloom();
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
