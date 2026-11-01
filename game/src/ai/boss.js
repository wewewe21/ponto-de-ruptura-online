// Chefe: COLOSSO MX-9, robô gigante. Chega do céu numa cena cinematográfica, empunha um fuzil pesado e
// ataca com rajadas, pisão, golpe duplo e salva de mísseis. Animação vem do Kimodo (retarget em tempo real);
// a cabeça é um osso independente (gira sozinha). Interface compatível com o que o Diretor/Armas esperam de um alvo.
import * as THREE from 'three';
import { clamp, lerp, rand, angleWrap, raySphere } from '../core/utils.js';
import { loadBossModel, loadBossGun } from '../actors/bossmodel.js';
import { BossAnimator, loadBossClips } from '../actors/bossanim.js';
import { solveArm, worldQ, HAND_R, HAND_L } from '../actors/ik.js';

export const BOSS_LAND = new THREE.Vector3(-206, 0, 76);
const NAME = 'COLOSSO MX-9';
const CFG = {
  hp: 1800, armor: { head: 0.6, body: 0.55, legs: 0.3 }, rocketTaken: 0.9,
  walk: 2.5, run: 5.2, turn: 1.25,
  fire: { rpm: 640, dmg: 11, burst: [12, 20], pause: [1.1, 2.0], acc: 0.3 },
  stomp: { r: 8.5, dmg: 36 }, slam: { r: 6.5, dmg: 52, reach: 3.6 },
  missileCd: 13, missileN: 3,
};
const WALK_REF = 4.9, RUN_REF = 9.6; // m/s do clipe a velocidade 1 (já escalado para o tamanho do robô)
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

export async function loadBossAssets() {
  const [rig, clips, gun] = await Promise.all([loadBossModel({ height: 5.0 }), loadBossClips(), loadBossGun(2.3)]);
  return { rig, clips, gun };
}

// ---------------- interface (HUD do chefe + letterbox) ----------------
function ensureUI() {
  if (document.getElementById('boss')) return;
  const st = document.createElement('style');
  st.textContent = `
  #boss{position:fixed;left:50%;top:max(72px,9vh);transform:translateX(-50%);width:min(620px,70vw);z-index:6;pointer-events:none;opacity:0;transition:opacity .5s;font-family:'Barlow Condensed',sans-serif;color:#e8e2d4;text-align:center}
  #boss.on{opacity:1}
  #boss-name{font-family:'Saira Stencil One','Barlow Condensed',sans-serif;letter-spacing:.22em;font-size:clamp(14px,1.7vw,22px);text-shadow:0 2px 8px #000;margin-bottom:5px}
  #boss-sub{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.2em;color:#ff8a3d;margin-top:4px;opacity:.85}
  #boss-bar{position:relative;height:14px;background:rgba(10,10,10,.72);border:1px solid rgba(255,255,255,.28);box-shadow:0 0 18px rgba(0,0,0,.7)}
  #boss-lag{position:absolute;inset:0 auto 0 0;background:#f2e3c0;opacity:.85;width:100%}
  #boss-fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#c2410c,#ff7a1a);width:100%}
  #boss-mark{position:absolute;top:-3px;bottom:-3px;left:50%;width:2px;background:rgba(255,255,255,.7)}
  #cine{position:fixed;inset:0;z-index:7;pointer-events:none;visibility:hidden}
  #cine.on{visibility:visible}
  #cine i{position:absolute;left:0;right:0;height:12vh;background:#000;transition:transform .8s cubic-bezier(.2,.7,.2,1)}
  #cine i:first-child{top:0;transform:translateY(-100%)} #cine i:nth-child(2){bottom:0;transform:translateY(100%)}
  #cine.on i:first-child,#cine.on i:nth-child(2){transform:none}
  #cine-title{position:absolute;left:0;right:0;bottom:2.2vh;text-align:center;font-family:'Saira Stencil One','Barlow Condensed',sans-serif;color:#f0e6d0;letter-spacing:.35em;font-size:clamp(16px,2.4vw,34px);opacity:0;transition:opacity .6s;text-shadow:0 0 18px rgba(255,100,20,.6)}
  #cine-title small{display:block;font-family:'IBM Plex Mono',monospace;font-size:clamp(9px,1vw,13px);letter-spacing:.3em;color:#ff8a3d;margin-top:4px}
  #cine-title.on{opacity:1}
  #cine-skip{position:absolute;right:2vw;top:13vh;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.2em;color:#cfc8b8;opacity:.0;transition:opacity .4s}
  #cine-skip.on{opacity:.7}
  body.cinema #hud{display:none!important}`;
  document.head.appendChild(st);
  const b = document.createElement('div'); b.id = 'boss';
  b.innerHTML = `<div id="boss-name">${NAME}</div><div id="boss-bar"><div id="boss-lag"></div><div id="boss-fill"></div><div id="boss-mark"></div></div><div id="boss-sub">UNIDADE DE ASSALTO PESADO — BLINDAGEM CORPORAL · PONTO FRACO: CABEÇA</div>`;
  document.body.appendChild(b);
  const c = document.createElement('div'); c.id = 'cine';
  c.innerHTML = `<i></i><i></i><div id="cine-title">${NAME}<small>UNIDADE DE ASSALTO PESADO</small></div><div id="cine-skip">[ESPAÇO] PULAR</div>`;
  document.body.appendChild(c);
}
const $ = (id) => document.getElementById(id);

export class Boss {
  constructor(G, assets) {
    this.G = G; this.isBoss = true; this.armored = true; this.type = 'boss';
    ensureUI();
    this.rig = assets.rig; this.clips = assets.clips; this.gun = assets.gun;
    this.root = new THREE.Group(); this.root.add(this.rig.model); this.root.visible = false;
    G.scene.add(this.root, this.gun);
    this.gun.visible = false;
    this.anim = new BossAnimator(this.rig, this.clips);
    this.anim.onEvent = (name, a, b, wrapped) => this._clipEvent(name, a, b, wrapped);
    const m = this.rig.mesh.material;
    m.emissive = new THREE.Color(0x2a1c10); m.emissiveMap = m.map; m.emissiveIntensity = 0.55;
    // brilho do visor
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.level.T.soft, color: 0xff2a14, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.scale.setScalar(0.9); G.scene.add(this.glow);
    this.pos = new THREE.Vector3(); this.yaw = 0;
    this.body = { x: 0, y: 0, z: 0, vy: 0, r: 0.9, h: 4.8, onGround: true, step: 0.6 };
    this.lastKnown = new THREE.Vector3();
    // marcadores no chão (telégrafos) e anéis de choque
    this.tele = new THREE.Mesh(new THREE.RingGeometry(0.2, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tele.rotation.x = -Math.PI / 2; this.tele.visible = false; G.scene.add(this.tele);
    this.rings = [];
    this.rockets = [];
    this.spheres = [];
    this.reset();
  }
  reset() {
    const G = this.G;
    if (this.intro) { G.godMode = this.intro.godMode; G.director.ignorePlayer = false; G.cinematic = false; G.player.locked = false; this.intro = null; }
    this.hp = CFG.hp; this.maxHp = CFG.hp; this.lagHp = CFG.hp;
    this.dead = false; this.alive = false; this.state = 'off'; this.stateT = 0; this.enraged = false;
    this.root.visible = false; this.gun.visible = false; this.glow.visible = false; this.tele.visible = false;
    if (this.gun.parent !== G.scene) G.scene.attach(this.gun);
    this.canSee = false; this.seeT = 0; this.aimK = 0; this.twist = 0; this.headYaw = 0; this.headPitch = 0; this.recoil = 0;
    this.fireCd = 1; this.burstLeft = 0; this.acquireT = 0; this.stompCd = 4; this.missileCd = 9; this.staggerCd = 0; this.meleeLock = 0;
    this.path = null; this.pathIdx = 0; this.moveTarget = null; this.moveSpeed = 0; this.speedNow = 0; this.stuckT = 0; this.repathT = 0;
    this.footL = 1; this.footR = 1; this.dmgWindow = 0; this.allyT = 0;
    this.intro = null; this.hitFlash = 0; this.deathT = 0;
    for (const r of this.rockets) { G.scene.remove(r.mesh); r.fx && (r.fx.t = 0); }
    this.rockets = [];
    for (const r of this.rings) G.scene.remove(r.mesh);
    this.rings = [];
    this.anim.extra = {};
    $('boss') && $('boss').classList.remove('on');
    $('cine') && $('cine').classList.remove('on');
    document.body.classList.remove('cinema');
  }
  get anchors() { return this.gun.userData.anchors; }

  // ---------- entradas ----------
  startIntro(land = BOSS_LAND) {
    const G = this.G, pl = G.player;
    this.reset();
    this.alive = true;
    this.land = land.clone();
    this.body.x = land.x; this.body.y = land.y; this.body.z = land.z;
    this.pos.copy(land); this.yaw = Math.atan2(pl.pos.x - land.x, pl.pos.z - land.z);
    this.state = 'drop'; this.stateT = 0;
    this.root.visible = true; this.gun.visible = true; this.glow.visible = true;
    this.anim.play('land', { speed: 0, fade: 0, restart: true }); this.anim.cur.t = 1.88;
    this.intro = { t: 0, godMode: G.godMode, impact: false, roared: false, title: false, hold: 0.0, fadeIn: true };
    G.cinematic = true; pl.locked = true; G.godMode = true; G.director.ignorePlayer = true;
    document.body.classList.add('cinema'); $('cine').classList.add('on'); $('cine-skip').classList.remove('on');
    this.fall = { y0: 78, t0: 0.9, dur: 3.1 };
    G.post.uniforms.uFade.value = 1;
    this.fireTrail = [G.fx.addEmitter({ kind: 'fire', pos: new THREE.Vector3(), t: 5, scale: 0.9 }), G.fx.addEmitter({ kind: 'fire', pos: new THREE.Vector3(), t: 5, scale: 0.9 })];
    this.fallLight = G.fx.fxLights ? null : null;
    G.dialog.clear && G.dialog.clear();
    G.mission.seq([
      [0.9, ['ATALAIA', 'Martelo, radar com contato vindo de cima... algo enorme, em queda livre sobre o pátio!', 3]],
      [3.4, ['TROVÃO', 'Isso não é um helicóptero... TODOS PRA FORA DA ÁREA!', 3]],
    ]);
  }
  // pula/encerra a cena e entrega o controle
  endIntro() {
    const G = this.G, pl = G.player, it = this.intro;
    if (!it) return;
    if (!it.impact) this._impact(true);
    this.fireTrail && this.fireTrail.forEach((e) => (e.t = 0)); this.fireTrail = null;
    this.state = 'combat'; this.stateT = 0;
    this.pos.copy(this.land); this.body.x = this.land.x; this.body.z = this.land.z; this.body.y = this.land.y;
    this.anim.play('idle', { fade: 0.4 });
    G.cinematic = false; pl.locked = false; G.godMode = it.godMode; G.director.ignorePlayer = false;
    document.body.classList.remove('cinema'); $('cine').classList.remove('on'); $('cine-title').classList.remove('on'); $('cine-skip').classList.remove('on');
    G.post.uniforms.uFade.value = 0;
    pl.yaw = Math.atan2(-(this.pos.x - pl.pos.x), -(this.pos.z - pl.pos.z)); pl.pitch = 0.08;
    G.camera.rotation.set(pl.pitch, pl.yaw, 0);
    this.intro = null;
    $('boss').classList.add('on');
    G.hud.show(true);
    G.mission.say('TROVÃO', 'Alvo pesado! Ele é blindado — mirem na cabeça, no visor vermelho! Foguetes se tiverem!', 3);
    G.mission.after(5, () => G.mission.say('FAÍSCA', 'O corpo quase não sente balas. A cabeça, Eco! A cabeça!', 2));
  }
  _impact(silent) {
    const G = this.G, p = this.land, it = this.intro;
    it.impact = true; it.landT = it.t;
    this.pos.copy(p); this.fall = null;
    this.anim.play('land', { speed: 0.9, fade: 0, restart: true }); this.anim.cur.t = 1.95;
    G.fx.explosion(p.clone().add(_v.set(0, 0.3, 0)), 0.9);
    this._dust(p, 1.2);
    G.fx.sparks(p.clone().add(_v.set(0, 0.4, 0)), 60, 1.6);
    this.addRing(p, 22, 0.9, 0xffa060);
    G.fx.flashLight(p.clone().add(_v.set(0, 2, 0)), 0xffb070, 1600, 0.5);
    G.audio.thud(p, 3); G.audio.explosion(p, 1.4);
    G.director.noise(p, 140, 'explosion', 'boss');
    G.player.shake(1.2);
    if (!silent) this.camShake = 1.2;
    G.weather.strike && G.weather.strike(true);
    // crateras: derruba o que estiver por perto (destrutíveis)
    G.physics.forEachInRect(p.x - 7, p.z - 7, p.x + 7, p.z + 7, (c) => { if (c.hp !== undefined && c.active) G.level.damageDestructible(c, 400, new THREE.Vector3((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.minZ + c.maxZ) / 2)); });
  }

  // ---------- dano / alvo ----------
  eyePos(out = new THREE.Vector3()) { return this.rig.bones.Head.getWorldPosition(out); }
  headPos(out = new THREE.Vector3()) { return this.rig.bones.Head.getWorldPosition(out); }
  chestPos(out = new THREE.Vector3()) { return this.rig.bones.Spine2.getWorldPosition(out); }
  // Esferas de acerto presas aos ossos. A cabeça fica "enterrada" no tronco; por isso as esferas do peito ficam
  // mais baixas/atrás para o capacete (ponto fraco) continuar acertável de frente. Offsets em espaço do chefe (z = frente).
  _buildSpheres() {
    const b = this.rig.bones, S = this.spheres; S.length = 0;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const at = (n, r, part, ox = 0, oy = 0, oz = 0, n2 = null, k = 0.5) => {
      const p = b[n].getWorldPosition(new THREE.Vector3());
      if (n2) p.lerp(b[n2].getWorldPosition(new THREE.Vector3()), k);
      p.x += ox * cy + oz * sy; p.z += -ox * sy + oz * cy; p.y += oy;
      S.push({ p, r, part });
    };
    at('Head', 0.46, 'head', 0, 0.02, 0.05);
    at('Hips', 1.0, 'body'); at('Spine', 1.0, 'body', 0, 0, -0.1); at('Spine1', 1.05, 'body', 0, -0.25, -0.25); at('Spine2', 1.0, 'body', 0, -0.5, -0.35);
    at('Spine2', 0.95, 'body', 0, 0.35, -0.95);
    for (const side of ['Left', 'Right']) {
      at(side + 'Arm', 0.6, 'body', 0, -0.05, -0.1);
      at(side + 'ForeArm', 0.42, 'body'); at(side + 'Arm', 0.42, 'body', 0, 0, 0, side + 'ForeArm', 0.5); at(side + 'ForeArm', 0.38, 'body', 0, 0, 0, side + 'Hand', 0.5); at(side + 'Hand', 0.35, 'body');
      at(side + 'UpLeg', 0.7, 'legs'); at(side + 'UpLeg', 0.65, 'legs', 0, 0, 0, side + 'Leg', 0.5); at(side + 'Leg', 0.6, 'legs');
      at(side + 'Leg', 0.55, 'legs', 0, 0, 0, side + 'Foot', 0.5); at(side + 'Foot', 0.5, 'legs');
    }
  }
  raycast(o, d, maxT) {
    if (this.dead || !this.alive || this.state === 'off' || this.state === 'drop' || this.intro) return null;
    let best = null;
    for (const s of this.spheres) {
      const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, s.p.x, s.p.y, s.p.z, s.r, maxT);
      if (t >= 0 && t < maxT && (!best || t < best.t)) best = { t, part: s.part };
    }
    return best;
  }
  takeDamage(amount, part, dir, source, point, silent = false) {
    if (this.dead || !this.alive || this.intro) return false;
    const G = this.G;
    const explosive = source === 'explosion';
    const a = amount * (explosive ? CFG.rocketTaken : (CFG.armor[part] ?? CFG.armor.body));
    this.hp -= a; this.dmgWindow += a; this.hitFlash = 0.08;
    if (point && !explosive) { G.fx.sparks(point, part === 'head' ? 10 : 5, part === 'head' ? 0.8 : 0.4); }
    if (this.state === 'combat' || this.state === 'idle') { this.acquireT = Math.max(this.acquireT, 0.6); }
    if (this.hp <= 0) { this.hp = 0; this._die(); return true; }
    if (!this.enraged && this.hp <= this.maxHp * 0.5 && this.state !== 'phase') this._startPhase2();
    if (this.dmgWindow > 260 && this.staggerCd <= 0 && (this.state === 'combat')) { this.dmgWindow = 0; this.staggerCd = 9; this._startStagger(); }
    return false;
  }
  explosionHit(pos, radius, maxDmg) {
    if (this.dead || !this.alive || this.intro) return false;
    const c = this.chestPos(new THREE.Vector3());
    const d = Math.min(c.distanceTo(pos), pos.distanceTo(this.pos.clone().add(_v.set(0, 1.5, 0))));
    if (d > radius + 1.5) return false;
    const dmg = maxDmg * Math.pow(clamp(1 - d / (radius + 1.5), 0, 1), 1.0);
    return this.takeDamage(dmg, 'body', ZERO, 'explosion', null);
  }
  onShieldHit() {}

  // ---------- fluxo de estados ----------
  update(dt) {
    if (!this.alive) return;
    const G = this.G;
    this.stateT += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.staggerCd -= dt; this.stompCd -= dt; this.missileCd -= dt; this.meleeLock -= dt;
    this.dmgWindow = Math.max(0, this.dmgWindow - dt * 40);
    switch (this.state) {
      case 'drop': case 'land': case 'roar': this._introUpdate(dt); break;
      case 'combat': this._combat(dt); break;
      case 'stomp': case 'slam': this._melee(dt); break;
      case 'missiles': this._missiles(dt); break;
      case 'stagger': if (this.anim.done || this.stateT > 1.8) this._toCombat(); this._turn(dt, 0.5); break;
      case 'phase': this._phase(dt); break;
      case 'dying': this._dying(dt); break;
      default: break;
    }
    if (!this.dead || this.state === 'dying') this._moveBody(dt);
    this._rockets(dt);
    this._rings(dt);
    this._pose(dt);
    this._ui(dt);
    this._allies(dt);
  }
  _toCombat() { this.state = 'combat'; this.stateT = 0; this.anim.play('idle', { fade: 0.35 }); }

  // ----- cena -----
  _introUpdate(dt) {
    const G = this.G, it = this.intro, pl = G.player;
    if (!it) return;
    it.t += dt;
    const t = it.t, cam = G.camera, L = this.land;
    G.post.uniforms.uFade.value = it.fadeIn ? Math.max(0, 1 - t / 0.9) : 0;
    G.player.locked = true;
    if (t > 1.4) $('cine-skip').classList.add('on');
    if (G.input.pressed('Space') && t > 1.2) { this.endIntro(); return; }
    // --- queda ---
    if (this.state === 'drop') {
      const f = this.fall, k = clamp((t - f.t0) / f.dur, 0, 1);
      this.pos.set(L.x, f.y0 * (1 - k * k) + 0.0, L.z);
      this.pos.y = Math.max(0, this.pos.y);
      if (Math.abs(t - f.t0) < dt * 1.5) { G.audio.mortarIncoming(L); G.weather.strike && G.weather.strike(false); }
      if (t > 2.1 && !it.l2) { it.l2 = true; G.weather.strike && G.weather.strike(true); }
      this.yaw = Math.atan2(pl.pos.x - L.x, pl.pos.z - L.z);
      // jatos nos pés
      const bn = this.rig.bones;
      this.fireTrail && [bn.LeftFoot, bn.RightFoot].forEach((b, i) => { b.getWorldPosition(this.fireTrail[i].pos); this.fireTrail[i].t = 1; });
      if (k >= 1 && !it.impact) { this._impact(false); this.state = 'land'; this.stateT = 0; this.fireTrail && this.fireTrail.forEach((e) => (e.t = 0)); this.fireTrail = null; }
    }
    // --- câmeras ---
    const toP = _v.set(pl.pos.x - L.x, 0, pl.pos.z - L.z).normalize();
    const camPos = new THREE.Vector3(), look = new THREE.Vector3();
    if (this.state === 'drop') {
      camPos.copy(L).addScaledVector(toP, 24).setY(1.5);
      const bossHead = this.pos.clone().add(_v2.set(0, 2.6, 0));
      look.copy(bossHead); if (t < this.fall.t0) look.lerpVectors(L.clone().add(_v2.set(0, 55, 0)), bossHead, 0);
      cam.fov = lerp(58, 48, clamp(t / 4, 0, 1));
      this.camTarget = look.clone();
    } else {
      const ts = t - (it.landT ?? t);
      if (ts < 2.7) {
        // câmera baixa de lado
        const side = new THREE.Vector3(-toP.z, 0, toP.x);
        camPos.copy(L).addScaledVector(toP, 8).addScaledVector(side, 8 - ts * 0.8).setY(0.5 + ts * 0.45);
        look.copy(L).setY(1.3 + ts * 0.8);
        cam.fov = 58;
      } else {
        // herói: de frente, de baixo
        camPos.copy(L).addScaledVector(toP, 13 - (ts - 2.7) * 0.4).setY(0.9);
        const hd = this.eyePos(new THREE.Vector3()); look.copy(hd).y -= 1.1;
        cam.fov = 52;
        if (!it.roared) { it.roared = true; this.state = 'roar'; this.stateT = 0; this.anim.play('roar', { speed: 0.95, fade: 0.5, restart: true }); }
      }
      if (this.state === 'roar' || this.state === 'land') {
        // vira para o jogador
        const want = Math.atan2(pl.pos.x - L.x, pl.pos.z - L.z);
        this.yaw += clamp(angleWrap(want - this.yaw), -0.9 * dt, 0.9 * dt);
        if (this.state === 'roar' && this.stateT > 0.7 && !it.roarSnd) { it.roarSnd = true; G.audio.roar(this.pos, 2.6); G.weather.strike && G.weather.strike(true); this.camShake = 0.5; }
        if (this.state === 'roar' && this.stateT > 1.2 && !it.title) { it.title = true; $('cine-title').classList.add('on'); }
        if (this.state === 'roar' && this.stateT > 3.6) { this.endIntro(); return; }
      }
    }
    // tremor
    this.camShake = Math.max(0, (this.camShake || 0) - dt * 0.9);
    const sh = this.camShake * 0.25;
    cam.position.copy(camPos).add(_v3.set(rand(-sh, sh), rand(-sh, sh), rand(-sh, sh)));
    const keep = this.camTarget && this.state === 'drop' ? this.camTarget : look;
    cam.lookAt(keep); cam.rotation.z += rand(-sh, sh) * 0.1;
    cam.updateProjectionMatrix();
    if (this.state === 'land' && !it.landAnimDone && this.stateT > 0) { /* clipe de pouso toca sozinho */ }
  }

  // ----- combate -----
  _senses(dt) {
    const G = this.G, pl = G.player;
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.2;
      const eye = this.eyePos(_v); const tgt = pl.chestPos();
      const was = this.canSee;
      this.canSee = !G.director.smokeBlocks(eye, tgt) && G.physics.los(eye.x, eye.y, eye.z, tgt.x, tgt.y, tgt.z);
      if (this.canSee && !was) this.acquireT = 0;
    }
    if (this.canSee) this.lastKnown.copy(pl.pos);
    this.acquireT += dt;
  }
  _turn(dt, mult = 1) {
    const pl = this.G.player;
    const want = Math.atan2((this.canSee ? pl.pos.x : this.lastKnown.x) - this.pos.x, (this.canSee ? pl.pos.z : this.lastKnown.z) - this.pos.z);
    const turn = CFG.turn * (this.enraged ? 1.3 : 1) * mult;
    this.yaw += clamp(angleWrap(want - this.yaw), -turn * dt, turn * dt);
  }
  setMove(target, speed) {
    if (!target) { this.moveTarget = null; this.path = null; this.moveSpeed = 0; return; }
    if (this.moveTarget && this.moveTarget.distanceTo(target) < 2.5 && this.path) { this.moveSpeed = speed; return; }
    this.moveTarget = target.clone(); this.moveSpeed = speed; this.path = null; this.pathIdx = 0;
    this.G.director.requestPath(this);
  }
  _combat(dt) {
    const G = this.G, pl = G.player;
    this._senses(dt);
    if (pl.dead) { this.setMove(null); this.anim.play('idle'); return; }
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    this._turn(dt);
    const k = this.enraged ? 1.25 : 1;
    // movimento
    let want = null, sp = 0;
    if (!this.canSee && this.stateT > 0.5) { want = this.lastKnown; sp = CFG.run * 0.8 * k; }
    else if (dist > 7) { want = pl.pos; sp = (dist > 45 ? CFG.run : dist > 22 ? CFG.walk : CFG.walk * 0.75) * k; }
    if (want && Math.abs(angleWrap(Math.atan2(want.x - this.pos.x, want.z - this.pos.z) - this.yaw)) > 1.2) sp *= 0.35; // curva antes de andar
    this.setMove(want, sp);
    // ataques
    if (this.canSee && this.meleeLock <= 0) {
      if (dist < 9.5 && this.stompCd <= 0 && this.acquireT > 0.5) {
        const front = Math.abs(angleWrap(Math.atan2(dx, dz) - this.yaw)) < 0.5;
        return this._startMelee(dist < 7.5 && front && Math.random() < 0.5 ? 'slam' : 'stomp');
      }
    }
    if (this.canSee && this.missileCd <= 0 && dist > 11 && this.acquireT > 0.8) return this._startMissiles();
    this._fireLogic(dt, dist);
    // animação
    const sn = this.speedNow;
    if (sn > 3.8) this.anim.play('run', { speed: clamp(sn / RUN_REF, 0.3, 0.9), fade: 0.3 });
    else if (sn > 0.4) this.anim.play('walk', { speed: clamp(sn / WALK_REF, 0.25, 0.8), fade: 0.3 });
    else this.anim.play('idle', { speed: 0.8, fade: 0.4 });
  }
  _fireLogic(dt, dist) {
    const G = this.G, pl = G.player;
    this.fireCd -= dt;
    const aiming = this.canSee && dist < 75 && this.acquireT > 0.35;
    this.aimK = lerp(this.aimK, aiming ? 1 : 0.15, 1 - Math.exp(-dt * 4));
    if (!aiming || this.fireCd > 0 || this.aimK < 0.7) return;
    if (this.burstLeft <= 0) this.burstLeft = Math.round(rand(CFG.fire.burst[0], CFG.fire.burst[1]) * (this.enraged ? 1.4 : 1));
    this.burstLeft--;
    this.fireCd = this.burstLeft > 0 ? 60 / (CFG.fire.rpm * (this.enraged ? 1.2 : 1)) : rand(CFG.fire.pause[0], CFG.fire.pause[1]) * (this.enraged ? 0.7 : 1);
    this._shoot(dist);
  }
  muzzleWorld(out) { return this.gun.localToWorld(out.copy(this.anchors.muzzle)); }
  _shoot(dist) {
    const G = this.G, pl = G.player, muzzle = this.muzzleWorld(new THREE.Vector3());
    const tPos = pl.chestPos();
    let p = CFG.fire.acc * G.diff.acc * clamp(1.3 - dist / 70, 0.3, 1);
    if (pl.hSpeed > 3) p *= 0.7; if (pl.stance === 'crouch') p *= 0.85; else if (pl.stance === 'prone') p *= 0.6; if (pl.slide > 0) p *= 0.5;
    p *= clamp(0.4 + pl.visibility * 0.6, 0.4, 1);
    p *= clamp(0.25 + ((this.acquireT - 0.35) / 1.2) * 0.75, 0.25, 1);
    if (G.director.smokeBlocks(muzzle, tPos)) p *= 0.15;
    const hit = Math.random() < p;
    const aim = tPos.clone();
    if (!hit) aim.add(new THREE.Vector3(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.6, 2.4)));
    const dir = aim.clone().sub(muzzle).normalize();
    const maxD = muzzle.distanceTo(aim) + (hit ? 0 : 40);
    const wh = G.physics.raycast(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, hit ? Math.max(0.1, maxD - 0.3) : maxD, {});
    let end;
    if (wh) {
      end = new THREE.Vector3(wh.x, wh.y, wh.z);
      G.fx.impact(end, new THREE.Vector3(wh.nx, wh.ny, wh.nz), wh.water ? 'water' : wh.terrain ? 'concrete' : wh.col.mat);
      if (end.distanceTo(pl.eye) < 25) G.audio.impact(end, wh.col ? wh.col.mat : 'concrete');
      if (wh.col && wh.col.hp !== undefined) G.level.damageDestructible(wh.col, CFG.fire.dmg * 4, end);
    } else {
      end = muzzle.clone().addScaledVector(dir, maxD);
      if (hit) pl.takeDamage(CFG.fire.dmg * (this.enraged ? 1.2 : 1) * G.diff.dmg, this.pos, 'bullet');
    }
    const seg = end.clone().sub(muzzle), Ln = seg.length(); seg.divideScalar(Ln || 1);
    const closest = muzzle.clone().addScaledVector(seg, clamp(pl.eye.clone().sub(muzzle).dot(seg), 0, Ln));
    if (closest.distanceTo(pl.eye) < 2.4 && !(hit && !wh)) { pl.suppressHit(0.2); if (Math.random() < 0.6) G.audio.whiz(closest); }
    G.fx.tracer(muzzle, end, 0xff5a30, 330, 10);
    G.fx.muzzleFlash(muzzle, 2.2);
    G.audio.shot('BOSS', muzzle);
    this.recoil = 1;
    if (G.director.muzzleLightCd <= 0) { G.fx.flashLight(muzzle, 0xff7a40, 260, 0.06); G.director.muzzleLightCd = 0.05; }
  }

  // ----- ataques corpo a corpo -----
  _startMelee(kind) {
    const G = this.G;
    this.state = kind; this.stateT = 0; this.hit = false; this.setMove(null); this.moveSpeed = 0;
    this.melee = kind === 'stomp' ? { t0: 1.2, impact: 2.7, speed: 1.0 } : { t0: 0.2, impact: 2.5, speed: 1.0 };
    this.anim.play(kind, { loop: false, speed: this.melee.speed * (this.enraged ? 1.15 : 1), fade: 0.25, restart: true });
    this.anim.cur.t = this.melee.t0;
    this.aimK = 0;
    this.meleeCenter = new THREE.Vector3();
    this.tele.visible = true;
    this.say(kind === 'stomp' ? 'Ele vai pisar! Afastem!' : 'Ele vai esmagar! Rolem pro lado!');
    if (!G.audio.sfx('boss_servo', this.pos, { vol: 1.2, ref: 20 })) G.audio.roar(this.pos, 0.9);
  }
  _melee(dt) {
    const G = this.G, pl = G.player, c = this.state === 'stomp' ? CFG.stomp : CFG.slam;
    this.canSee = true; this._turn(dt, this.stateT < 0.8 ? 1.2 : 0.2);
    const sp = (this.melee.speed * (this.enraged ? 1.15 : 1));
    const elapsed = (this.anim.cur.t - this.melee.t0), toImpact = (this.melee.impact - this.anim.cur.t) / sp;
    // telégrafo
    const cx = this.state === 'slam' ? this.pos.x + Math.sin(this.yaw) * c.reach : this.pos.x, cz = this.state === 'slam' ? this.pos.z + Math.cos(this.yaw) * c.reach : this.pos.z;
    this.meleeCenter.set(cx, this.pos.y, cz);
    this.tele.position.set(cx, this.pos.y + 0.08, cz); this.tele.scale.setScalar(c.r);
    this.tele.material.opacity = clamp(0.15 + (1 - clamp(toImpact / 1.4, 0, 1)) * 0.5, 0, 0.7) * (0.7 + 0.3 * Math.sin(G.time * 18));
    if (!this.hit && this.anim.cur.t >= this.melee.impact) {
      this.hit = true; this.tele.visible = false;
      const p = this.meleeCenter.clone();
      G.audio.thud(p, 2.4); G.fx.sparks(p.clone().setY(p.y + 0.3), 40, 1.3);
      G.fx.explosion(p.clone(), 0.55);
      this._dust(p, 0.55);
      this.addRing(p, c.r * 1.2, 0.55, 0xffc080);
      G.director.noise(p, 80, 'explosion', 'boss');
      const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
      pl.shake(clamp(1.4 - d / 22, 0.1, 1.2));
      if (d < c.r && pl.pos.y - this.pos.y < 1.0) {
        pl.takeDamage(c.dmg * Math.pow(1 - d / c.r, 0.6) * G.diff.dmg + 8, p, 'explosion');
        if (pl.body) { const k = _v.set(pl.pos.x - p.x, 0, pl.pos.z - p.z).normalize().multiplyScalar(6 * (1 - d / c.r)); pl.body.vy = Math.max(pl.body.vy, 4); pl.vel.x += k.x; pl.vel.z += k.z; }
      }
    }
    if (this.anim.done || this.stateT > 3.2) { this.stompCd = (this.enraged ? 4.5 : 6.5) + rand(0, 2); this.meleeLock = 1.2; this.tele.visible = false; this._toCombat(); }
  }

  // ----- mísseis -----
  _startMissiles() {
    const G = this.G;
    this.state = 'missiles'; this.stateT = 0; this.setMove(null); this.shots = 0;
    this.missileCd = (this.enraged ? 9 : CFG.missileCd) + rand(0, 3);
    this.anim.play('idle', { speed: 0.8, fade: 0.3 });
    this.missileTarget = G.player.pos.clone();
    this.say('Travou o alvo! MÍSSEIS! Saiam da mira!');
    G.audio.mech && G.audio.mech('ads');
  }
  _missiles(dt) {
    const G = this.G, pl = G.player, n = CFG.missileN + (this.enraged ? 2 : 0);
    this.canSee = true; this._turn(dt, 0.6); this.aimK = lerp(this.aimK, 0.5, 0.1);
    // cada míssil mira a posição atual do jogador (com antecipação), então dá para correr para fora
    if (this.stateT > 1.1 && this.shots < n && this.stateT > 1.1 + this.shots * 0.38) {
      this.shots++;
      this._launchRocket(this.shots % 2 ? 'Left' : 'Right');
    }
    if (this.stateT > 1.1 + n * 0.38 + 0.8) this._toCombat();
  }
  _launchRocket(side) {
    const G = this.G, pl = G.player, b = this.rig.bones;
    const sp = b.Spine2.getWorldPosition(new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); // +x do modelo
    const from = sp.clone().addScaledVector(right, side === 'Left' ? 1.5 : -1.5).add(_v.set(0, 0.9, 0)).addScaledVector(_v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), -0.4);
    const lead = new THREE.Vector3(pl.vel.x, 0, pl.vel.z).multiplyScalar(0.35);
    const to = pl.pos.clone().add(lead).add(_v3.set(rand(-3.5, 3.5), 0, rand(-3.5, 3.5)));
    const T = 1.35, g = 16;
    const vel = to.clone().sub(from).divideScalar(T); vel.y = (to.y - from.y + 0.5 * g * T * T) / T;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
    mesh.position.copy(from); G.scene.add(mesh);
    const fx = G.fx.addEmitter({ kind: 'fire', pos: mesh.position, t: 6, scale: 0.35 });
    this.rockets.push({ mesh, vel, g, fx, life: 4 });
    if (!G.audio.sfx('boss_missile', from, { vol: 1.1, ref: 12 })) G.audio.shot('RPL2', from, { vol: 0.8 });
    G.fx.flashLight(from, 0xffa060, 400, 0.12); G.fx.sparks(from, 14, 0.8);
    G.audio.mortarIncoming(to);
    this.recoil = 0.6;
  }
  _rockets(dt) {
    const G = this.G;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt; r.vel.y -= r.g * dt;
      const prev = r.mesh.position.clone();
      r.mesh.position.addScaledVector(r.vel, dt);
      r.mesh.lookAt(r.mesh.position.clone().add(r.vel));
      r.mesh.rotateX(Math.PI / 2);
      r.fx.t = 1;
      const seg = r.mesh.position.clone().sub(prev), L = seg.length();
      let hit = null;
      if (L > 1e-4) { seg.divideScalar(L); const wh = G.physics.raycast(prev.x, prev.y, prev.z, seg.x, seg.y, seg.z, L + 0.2, {}); if (wh) hit = new THREE.Vector3(wh.x, wh.y, wh.z); }
      if (hit || r.life <= 0 || r.mesh.position.y < -2) {
        const p = hit || r.mesh.position.clone();
        G.scene.remove(r.mesh); r.fx.t = 0; this.rockets.splice(i, 1);
        this._blast(p, 6.5, 40);
      }
    }
  }
  _blast(p, radius, dmg) {
    const G = this.G, pl = G.player;
    G.fx.explosion(p, 1.2); G.audio.explosion(p, 1.2); G.director.noise(p, 120, 'explosion', 'boss');
    const d = p.distanceTo(pl.eye);
    if (d < radius && G.physics.los(p.x, p.y + 0.3, p.z, pl.eye.x, pl.eye.y - 0.6, pl.eye.z)) pl.takeDamage(dmg * Math.pow(1 - d / radius, 1.2) * G.diff.dmg + 6, p, 'rocket');
    pl.shake(clamp(1.1 - d / 40, 0, 1));
    G.physics.forEachInRect(p.x - radius, p.z - radius, p.x + radius, p.z + radius, (c) => { if (c.hp !== undefined && c.active) G.level.damageDestructible(c, 200, new THREE.Vector3((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, (c.minZ + c.maxZ) / 2)); });
    G.fx.addEmitter({ kind: 'fire', pos: p.clone(), t: 1.2, scale: 0.4 });
  }

  // ----- fases / reações / morte -----
  _startStagger() {
    this.state = 'stagger'; this.stateT = 0; this.setMove(null);
    this.anim.play('hit', { loop: false, speed: 1.1, fade: 0.1, restart: true });
    this.G.audio.thud(this.pos, 1.2);
  }
  _startPhase2() {
    const G = this.G;
    this.enraged = true; this.state = 'phase'; this.stateT = 0; this.setMove(null); this.tele.visible = false;
    this.anim.play('roar', { loop: false, speed: 1.0, fade: 0.2, restart: true });
    this.say('Ele está enfurecido! Cuidado com os mísseis!');
    G.audio.roar(this.pos, 2.4);
    G.director.dropAmmo && G.director.dropAmmo(G.player.pos.clone().add(_v.set(rand(-3, 3), 0, rand(-3, 3))));
    G.director.dropAmmo && G.director.dropAmmo(G.player.pos.clone().add(_v.set(rand(-3, 3), 0, rand(-3, 3))));
    G.weather.strike && G.weather.strike(true);
    this.missileCd = Math.min(this.missileCd, 5); this.stompCd = Math.min(this.stompCd, 3);
  }
  _phase(dt) {
    this.canSee = true; this._turn(dt, 0.4); this.aimK = 0;
    if (this.stateT > 1.5 && !this.phaseSnd) { this.phaseSnd = true; this.G.player.shake(0.8); this.addRing(this.pos, 16, 0.7, 0xff6030); this.G.audio.thud(this.pos, 2); }
    if (this.anim.done || this.stateT > 3.8) { this.phaseSnd = false; this._toCombat(); }
  }
  _die() {
    const G = this.G;
    this.dead = true; this.state = 'dying'; this.stateT = 0; this.setMove(null); this.tele.visible = false;
    for (const r of this.rockets) { G.scene.remove(r.mesh); r.fx.t = 0; } this.rockets = [];
    // Preserva a pegada atual e acompanha a mão desde o primeiro quadro da queda.
    this.rig.bones.RightHand.attach(this.gun);
    this.anim.play('die', { loop: false, speed: 0.75, fade: 0.2, restart: true });
    G.audio.roar(this.pos, 3); G.audio.sfx('boss_death', this.pos, { vol: 1.4, ref: 25 });
    G.hud.banner && G.hud.banner('COLOSSO ABATIDO', 'BLINDAGEM CRÍTICA — SISTEMAS EM COLAPSO', 'sup');
    G.mission.onBossKilled && G.mission.onBossKilled(this);
    $('boss').classList.remove('on');
    this.deathNext = 0.4;
  }
  _dying(dt) {
    const G = this.G;
    this.deathT += dt;
    this.deathNext -= dt;
    if (this.deathNext <= 0 && this.deathT < 6) {
      this.deathNext = rand(0.25, 0.6);
      const names = ['Spine2', 'Head', 'LeftArm', 'RightForeArm', 'Hips', 'LeftLeg'];
      const p = this.rig.bones[names[Math.floor(Math.random() * names.length)]].getWorldPosition(new THREE.Vector3());
      G.fx.explosion(p, 0.7); G.audio.explosion(p, 0.7); G.fx.sparks(p, 30, 1.2);
    }
    if (this.deathT > 1.0 && !this.deadFire) { this.deadFire = true; G.fx.addEmitter({ kind: 'fire', pos: this.chestPos(new THREE.Vector3()), t: 40, scale: 0.55 }); }
    if (this.anim.done && this.deathT > 3 && !this.settled) {
      this.settled = true; this.state = 'dead';
      G.audio.thud(this.pos, 2.2); this.G.player.shake(0.6);
      this.anim.cur.speed = 0;
    }
  }

  // ----- movimento -----
  _moveBody(dt) {
    const G = this.G, b = this.body;
    if (this.state === 'drop' || this.state === 'land' || this.state === 'roar' || this.state === 'dying' || this.state === 'dead') { this.speedNow = 0; return; }
    let vx = 0, vz = 0;
    if (this.moveTarget && this.moveSpeed > 0 && this.state === 'combat') {
      let wp = this.moveTarget;
      if (this.path && this.path.length) {
        while (this.pathIdx < this.path.length - 1 && Math.hypot(this.path[this.pathIdx].x - this.pos.x, this.path[this.pathIdx].z - this.pos.z) < 1.4) this.pathIdx++;
        wp = this.path[Math.min(this.pathIdx, this.path.length - 1)];
      }
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      // anda para onde o corpo aponta (robô pesado: não desliza de lado)
      const dirYaw = Math.atan2(dx, dz), diff = Math.abs(angleWrap(dirYaw - this.yaw));
      const sp = this.moveSpeed * clamp(1.4 - diff, 0, 1);
      vx = Math.sin(this.yaw) * sp; vz = Math.cos(this.yaw) * sp;
      if (diff > 0.35) { this.yaw += clamp(angleWrap(dirYaw - this.yaw), -CFG.turn * 1.2 * dt, CFG.turn * 1.2 * dt); }
      if (d < 0.8 && !this.path) { vx = 0; vz = 0; }
    }
    const before = this.pos.clone();
    G.physics.moveBody(b, vx * dt, vz * dt, dt, true);
    this.pos.set(b.x, b.y, b.z);
    const sn = before.distanceTo(this.pos) / Math.max(dt, 1e-4);
    this.speedNow = lerp(this.speedNow, sn, 1 - Math.exp(-dt * 6));
    if (this.moveTarget && this.moveSpeed > 1 && sn < 0.3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.2) { this.stuckT = 0; this.path = null; G.director.requestPath(this); }
  }

  // ----- pose, mira, IK, marcador, passos -----
  _pose(dt) {
    const G = this.G, rig = this.rig, b = rig.bones, pl = G.player;
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
    // torção do tronco e cabeça apontam para o alvo, independentes do corpo
    const armed = this.state !== 'dying' && this.state !== 'dead';
    const eye = this.eyePos(_v3);
    const tx = this.canSee || this.state === 'stomp' || this.state === 'slam' || this.state === 'roar' || this.state === 'phase' ? pl.eye : null;
    let relYaw = 0, pitch = 0;
    if (tx && armed || (this.state === 'roar' && tx)) {
      relYaw = angleWrap(Math.atan2(tx.x - this.pos.x, tx.z - this.pos.z) - this.yaw);
      pitch = Math.atan2(-(tx.y - eye.y), Math.hypot(tx.x - eye.x, tx.z - eye.z));
    }
    const wantTwist = this.state === 'combat' || this.state === 'missiles' ? clamp(relYaw * 0.7, -0.85, 0.85) : 0;
    this.twist = lerp(this.twist, wantTwist, 1 - Math.exp(-dt * 6));
    const wantHead = clamp(relYaw - this.twist, -0.9, 0.9);
    this.headYaw = lerp(this.headYaw, wantHead, 1 - Math.exp(-dt * 7));
    this.headPitch = lerp(this.headPitch, clamp(pitch, -0.35, 0.45), 1 - Math.exp(-dt * 6));
    const ex = this.anim.extra;
    ex.Spine1 = (ex.Spine1 || new THREE.Quaternion()).setFromAxisAngle(UP, this.twist);
    ex.Head = (ex.Head || new THREE.Quaternion()).setFromEuler(new THREE.Euler(this.headPitch, this.headYaw, 0, 'YXZ'));
    // clipe + quadril
    const off = this.anim.update(dt);
    rig.setHips(off);
    this.root.updateMatrixWorld(true);
    // passos pesados
    if (this.state === 'combat' && this.speedNow > 0.8) this._footsteps();
    // arma + braços
    if (armed) this._gunAndArms(dt);
    else if (this.state === 'dying' || this.state === 'dead') { /* a arma cai junto com a mão */ }
    this.root.updateMatrixWorld(true);
    // visor
    const hp = b.Head.getWorldPosition(new THREE.Vector3());
    const hq = worldQ(b.Head, new THREE.Quaternion()).multiply(this.rig.rest.Head.worldQ.clone().invert()).premultiply(_q2.setFromAxisAngle(UP, this.yaw));
    this.glow.position.copy(hp).add(_v2.set(0, -0.05, 0.3).applyQuaternion(hq));
    this.glow.material.opacity = this.dead ? Math.max(0, 0.6 - this.deathT * 0.2) : 0.9 + Math.sin(G.time * 5) * 0.1;
    this.glow.scale.setScalar(this.enraged ? 1.3 : 0.9);
    // flash de dano
    const m = this.rig.mesh.material; m.emissiveIntensity = 0.55 + this.hitFlash * 8;
    this._buildSpheres();
  }
  _gunAndArms(dt) {
    const G = this.G, pl = G.player, b = this.rig.bones, rest = this.rig.rest;
    const chest = b.Spine2.getWorldPosition(new THREE.Vector3());
    const yaw = this.yaw + this.twist;
    const Ry = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const aimPt = this.canSee ? pl.chestPos() : this.lastKnown.clone().setY(pl.eye.y - 0.3);
    const aimMount = chest.clone().add(new THREE.Vector3(-0.35, -1.1, 1.25).applyQuaternion(Ry));
    const lowMount = chest.clone().add(new THREE.Vector3(-0.45, -1.55, 0.9).applyQuaternion(Ry));
    const mount = lowMount.lerp(aimMount, this.aimK);
    const dirAim = aimPt.clone().sub(aimMount).normalize();
    const dirLow = new THREE.Vector3(0.0, -0.35, 1).normalize().applyQuaternion(Ry);
    const dir = dirLow.lerp(dirAim, this.aimK).normalize();
    this.recoil = Math.max(0, this.recoil - dt * 9);
    mount.addScaledVector(dir, -0.14 * this.recoil);
    this.gun.position.copy(mount);
    _m.lookAt(dir, ZERO, UP); this.gun.quaternion.setFromRotationMatrix(_m);
    this.gun.updateMatrixWorld(true);
    const gq = this.gun.quaternion;
    const A = this.anchors;
    const rT = this.gun.localToWorld(A.gripR.clone()), lT = this.gun.localToWorld(A.gripL.clone());
    solveArm(b.RightArm, b.RightForeArm, b.RightHand, rT, new THREE.Vector3(-1, -0.6, -0.2).applyQuaternion(Ry));
    solveArm(b.LeftArm, b.LeftForeArm, b.LeftHand, lT, new THREE.Vector3(1, -0.5, -0.2).applyQuaternion(Ry));
    for (const [hb, hq] of [[b.RightHand, HAND_R], [b.LeftHand, HAND_L]]) {
      const q = gq.clone().multiply(hq).multiply(rest[hb === b.RightHand ? 'RightHand' : 'LeftHand'].worldQ);
      hb.quaternion.copy(worldQ(hb.parent, new THREE.Quaternion()).invert().multiply(q));
      hb.updateMatrixWorld(true);
    }
    this.gun.visible = true;
  }
  _footsteps() {
    const G = this.G, b = this.rig.bones, pl = G.player;
    const yL = b.LeftFoot.getWorldPosition(new THREE.Vector3()), yR = b.RightFoot.getWorldPosition(new THREE.Vector3());
    const thr = this.pos.y + 0.8;
    for (const [foot, p, key] of [['L', yL, 'footL'], ['R', yR, 'footR']]) {
      const down = p.y < thr;
      if (down && this[key] === 0) {
        const d = p.distanceTo(pl.pos);
        G.audio.thud(p, 1.0); if (d < 45) pl.shake(clamp(0.5 - d / 90, 0, 0.5));
        G.fx.sparks(p.clone().setY(this.pos.y + 0.1), 6, 0.35);
        this._dust(p.clone().setY(this.pos.y), 0.22);
        G.director.noise(p, 25, 'step', 'boss');
      }
      this[key] = down ? 1 : 0;
      if (!down) this[key] = 0; else if (this[key] === 1 && !(this._was && this._was[key])) { /* já tratado */ }
    }
  }
  // poeira de impacto: anel de nuvens baixas e pardas que se espalha pelo chão
  _dust(p, k = 1) {
    const f = this.G.fx, n = Math.round(46 * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(3, 10) * (0.6 + k * 0.5), r0 = rand(0.5, 2) * k;
      f.norm.spawn(p.x + Math.cos(a) * r0, p.y + rand(0.2, 0.9), p.z + Math.sin(a) * r0, Math.cos(a) * sp, rand(0.2, 1.4), Math.sin(a) * sp, rand(2.2, 4.2), rand(1.6, 3.0) * (0.5 + k * 0.6), 0.4, 0.38, 0.34, 0.42, -0.08, 1.7, 0.9);
    }
    for (let i = 0; i < n / 3; i++) f.norm.spawn(p.x + rand(-1, 1) * k, p.y + 0.5, p.z + rand(-1, 1) * k, rand(-1.5, 1.5), rand(2, 5) * k, rand(-1.5, 1.5), rand(2.5, 4.5), rand(2, 3.5) * (0.5 + k * 0.5), 0.3, 0.29, 0.27, 0.35, -0.1, 1.2, 0.8);
  }
  addRing(pos, radius, dur, color) {
    const G = this.G;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, pos.y + 0.12, pos.z); G.scene.add(m);
    this.rings.push({ mesh: m, t: 0, dur, radius });
  }
  _rings(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = r.t / r.dur;
      r.mesh.scale.setScalar(1 + k * r.radius); r.mesh.material.opacity = 0.8 * (1 - k);
      if (k >= 1) { this.G.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
  }
  _clipEvent() {}
  say(text) { this.G.mission.say('TROVÃO', text, 2); }

  // aliados cutucam o chefe (sem roubar a cena)
  _allies(dt) {
    const G = this.G;
    if (this.state !== 'combat' && this.state !== 'stomp' && this.state !== 'slam' && this.state !== 'missiles') return;
    this.allyT -= dt;
    if (this.allyT > 0 || !G.allies) return;
    this.allyT = 1.3;
    const c = this.chestPos(new THREE.Vector3());
    for (const a of G.allies.list) {
      if (a.dead || !a.model || !a.model.root.visible) continue;
      const m = a.chestPos ? a.chestPos() : a.pos.clone().setY(a.pos.y + 1.3);
      const d = m.distanceTo(c);
      if (d > 70 || !G.physics.los(m.x, m.y, m.z, c.x, c.y, c.z)) continue;
      G.fx.tracer(m, c.clone().add(_v.set(rand(-0.6, 0.6), rand(-0.6, 0.6), 0)), 0x9fd0ff, 340, 7);
      G.audio.shot('KR7', m, { vol: 0.5 });
      this.takeDamage(7, 'body', ZERO, 'other', null);
    }
  }

  // ----- HUD -----
  _ui(dt) {
    const f = $('boss-fill'), l = $('boss-lag');
    if (!f) return;
    this.lagHp = this.lagHp > this.hp ? Math.max(this.hp, this.lagHp - this.maxHp * 0.12 * dt) : this.hp;
    f.style.width = (this.hp / this.maxHp * 100).toFixed(1) + '%';
    l.style.width = (this.lagHp / this.maxHp * 100).toFixed(1) + '%';
    const mk = $('boss-mark'); if (mk) mk.style.display = this.enraged ? 'none' : '';
  }
}
