import * as THREE from 'three';
const SHOT_SOUND = { SD9: 'SD9', MK5: 'SD9', KR7: 'KR7', VK12: 'VK12', AX50: 'VK12', P19: 'P19', DE50: 'VK12' };
import { createSoldier } from '../actors/soldier.js';
import { hasMeshSoldier } from '../actors/meshsoldier.js';
import { BossAnimator } from '../actors/bossanim.js';
import { cloneRobotAssets, loadRobotAssets, poseRobotArms, disposeRobotAssets } from './robot-view.js';

export const TEAM_COLORS = Object.freeze({ alpha: 0x51dcff, bravo: 0xffa455 });
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function nameLabel(player, robot) {
  // visual limpo: só o nome (com contorno) e um pontinho da cor da equipe; sem caixa
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 40;
  const ctx = canvas.getContext('2d'), color = player.team === 'alpha' ? '#51dcff' : '#ffa455';
  const name = String(player.name || 'Operador').slice(0, 20) + (robot ? ' · MX-9' : '');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 21px sans-serif'; ctx.lineJoin = 'round';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(name, 128, 21, 232);
  ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillText(name, 128, 21, 232);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(128, 36, 2.6, 0, Math.PI * 2); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true, fog: false }));
  sprite.scale.set(robot ? 2.6 : 1.5, robot ? 0.4 : 0.235, 1); sprite.userData.base = [sprite.scale.x, sprite.scale.y];
  return sprite;
}

export class RobotAvatar {
  constructor(G, template) {
    this.G = G; this.assets = cloneRobotAssets(template);
    this.rig = this.assets.rig; this.gun = this.assets.gun; this.root = this.rig.model;
    this.anim = new BossAnimator(this.rig, template.clips); this.anim.play('idle', { fade: 0 });
    this.dead = false; this.recoil = 0; this.flashT = 0;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.level.T.flash || null, color: 0xffbe75, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.position.copy(this.gun.userData.anchors.muzzle); this.flash.scale.setScalar(0.9); this.gun.add(this.flash);
    G.scene.add(this.root, this.gun);
  }
  setPose(pos, yaw) { this.root.position.copy(pos); this.root.rotation.y = yaw; }
  muzzleFlash() { this.recoil = 1; this.flashT = 0.06; }
  die() {
    if (this.dead) return;
    this.dead = true; this.flashT = 0; this.flash.material.opacity = 0;
    this.root.updateMatrixWorld(true); this.gun.updateWorldMatrix(true, true);
    this.rig.bones.RightHand.attach(this.gun);
    this.anim.play('die', { loop: false, speed: 0.85, fade: 0.15, restart: true });
  }
  animate(dt, speed) {
    this.recoil *= Math.exp(-10 * dt); this.flashT = Math.max(0, this.flashT - dt);
    this.flash.material.opacity = this.flashT > 0 ? 1 : 0;
    if (!this.dead) {
      const sp = this._spd = (this._spd ?? speed) + (speed - (this._spd ?? speed)) * Math.min(1, dt * 6);
      const g = this._gait || (this._gait = 'idle'); let gait = g;
      if (g === 'idle') { if (sp > 0.5) gait = 'walk'; } else if (g === 'walk') { if (sp > 3.5) gait = 'run'; } else if (sp < 2.6) gait = 'walk';
      this._lowT = sp < 0.22 ? (this._lowT || 0) + dt : 0; if (g !== 'idle' && this._lowT > 0.2) gait = 'idle';
      this._gaitT = (this._gaitT || 0) + dt; if (gait !== g && this._gaitT < 0.3) gait = g; if (gait !== g) { this._gait = gait; this._gaitT = 0; }
      const moving = this._gait !== 'idle';
      this.anim.play(this._gait || 'idle', { speed: moving ? THREE.MathUtils.clamp(sp / (this._gait === 'run' ? 9.6 : 4.9), 0.45, 1.4) : 0.8, fade: 0.25 });
    }
    this.rig.setHips(this.anim.update(dt)); this.root.updateMatrixWorld(true);
    if (!this.dead) {
      const yaw = this.root.rotation.y;
      const aim = new THREE.Quaternion().setFromEuler(new THREE.Euler(-(this.aimPitch || 0), yaw, 0, 'YXZ'));
      const chest = this.rig.bones.Spine2.getWorldPosition(new THREE.Vector3());
      const mount = new THREE.Vector3(-0.35, -1.1, 1.25 - this.recoil * 0.12).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      this.gun.position.copy(chest).add(mount); this.gun.quaternion.copy(aim);
      poseRobotArms(this.rig, this.gun, yaw);
    }
    this.root.updateMatrixWorld(true);
  }
  dispose() {
    this.flash.removeFromParent(); this.flash.material.dispose(); disposeRobotAssets(this.assets);
  }
}

export class RemoteAvatars {
  constructor(G) {
    this.G = G; this.avatars = new Map(); this.players = []; this.corpses = [];
    this.time = 0; this.disposed = false; this.robotTemplate = null; this.robotLoading = false; this.retryAt = 0;
  }
  _robotAssets() {
    if (this.robotTemplate || this.robotLoading || this.time < this.retryAt) return;
    this.robotLoading = true;
    loadRobotAssets().then((assets) => { if (!this.disposed) this.robotTemplate = assets; }).catch((e) => {
      this.retryAt = this.time + 5; console.warn('Modelo Colosso online indisponível:', e);
    }).finally(() => { this.robotLoading = false; });
  }
  _make(player) {
    let model;
    if (player.robot) {
      if (!this.robotTemplate) { this._robotAssets(); return null; }
      model = new RobotAvatar(this.G, this.robotTemplate);
    } else {
      const preferred = player.team === 'alpha' ? 'ally1' : 'enemy';
      const style = hasMeshSoldier(preferred) ? preferred : ['ally1', 'enemy', 'enemy2'].find(hasMeshSoldier);
      if (!style) return null;
      model = createSoldier(this.G.scene, style, this.G.level.T);
    }
    const avatar = { model, robot: !!player.robot, player: { ...player }, target: new THREE.Vector3(player.x, player.y, player.z), pos: new THREE.Vector3(player.x, player.y, player.z), yaw: player.yaw + Math.PI, dead: false };
    model.setPose(avatar.pos, avatar.yaw); model.aimPitch = player.pitch || 0;
    model.animate(0, 0, 0, this.time);
    avatar.label = nameLabel(player, player.robot); this.G.scene.add(avatar.label);
    this._apply(avatar, player);
    return avatar;
  }
  _apply(avatar, player) {
    if (avatar.player.name !== player.name || avatar.player.team !== player.team) {
      this._labelDispose(avatar); avatar.label = nameLabel(player, player.robot); this.G.scene.add(avatar.label);
    }
    avatar.player = { ...player }; avatar.target.set(player.x, player.y, player.z);
    if (avatar.pos.distanceToSquared(avatar.target) > 100) avatar.pos.copy(avatar.target);
    if (player.dead && !avatar.dead) {
      avatar.dead = true; avatar.pos.copy(avatar.target); avatar.model.setPose(avatar.pos, avatar.yaw);
      // Infantry's default drop animation uses world coordinates. For remote corpses,
      // preserve the grip and parent the gun before the first death frame instead.
      if (!avatar.robot && avatar.model.bones?.RightHand) {
        avatar.model.root.updateMatrixWorld(true); avatar.model.bones.RightHand.attach(avatar.model.gun);
        avatar.model._dropGun = () => {};
      }
      avatar.model.die(-Math.sin(player.yaw), -Math.cos(player.yaw));
    }
    avatar.label.visible = !avatar.dead;
  }
  sync(players, selfId) {
    if (this.disposed) return;
    this.players = players; this.selfId = selfId;
    const ids = new Set();
    for (const player of players) {
      if (player.id === selfId) continue;
      ids.add(player.id); let avatar = this.avatars.get(player.id);
      if (avatar && (avatar.robot !== !!player.robot || avatar.dead && !player.dead)) {
        this.avatars.delete(player.id);
        if (avatar.dead) this.corpses.push({ avatar, ttl: 5 }); else this._dispose(avatar);
        avatar = null;
      }
      if (!avatar) { avatar = this._make(player); if (avatar) this.avatars.set(player.id, avatar); }
      else this._apply(avatar, player);
    }
    for (const [id, avatar] of this.avatars) if (!ids.has(id)) { this._dispose(avatar); this.avatars.delete(id); }
    // Bounded even during repeated respawns in a full room.
    while (this.corpses.length > 20) this._dispose(this.corpses.shift().avatar);
  }
  update(dt) {
    if (this.disposed) return;
    dt = Math.min(Math.max(dt, 0), 0.1); this.time += dt;
    // Assets can finish between snapshots; keep pending players eligible for creation.
    for (const player of this.players) if (player.id !== this.selfId && !this.avatars.has(player.id)) {
      const avatar = this._make(player); if (avatar) this.avatars.set(player.id, avatar);
    }
    for (const avatar of this.avatars.values()) {
      const oldX = avatar.pos.x, oldZ = avatar.pos.z;
      if (!avatar.dead) {
        avatar.pos.lerp(avatar.target, 1 - Math.exp(-16 * dt));
        avatar.yaw += angleDelta(avatar.yaw, avatar.player.yaw + Math.PI) * (1 - Math.exp(-20 * dt));
      }
      // velocidade estável: ignora teleportes e suaviza (os snapshots chegam 15×/s, a velocidade bruta oscila quadro a quadro)
      const step = Math.hypot(avatar.pos.x - oldX, avatar.pos.z - oldZ), raw = step > 3 ? 0 : step / Math.max(dt, 0.001);
      avatar.sp = (avatar.sp || 0) + (raw - (avatar.sp || 0)) * (1 - Math.exp(-dt / 0.14));
      const speed = avatar.sp;
      avatar.model.aimPitch = avatar.player.pitch || 0;
      avatar.model.setPose(avatar.pos, avatar.yaw); avatar.model.animate(dt, speed, avatar.player.crouch ? 1 : 0, this.time,
        avatar.robot ? undefined : { sliding: avatar.player.slideT > 0, tactical: avatar.player.tacticalT > 0 });
      avatar.label.position.copy(avatar.pos).y += avatar.robot ? 5.5 : 2.12;
      // só aparece de perto (some entre 18 e 28 m) e se não houver parede entre a câmera e a cabeça; não cresce com a distância
      const cam = this.G.camera.position, lp = avatar.label.position, d = lp.distanceTo(cam), range = avatar.robot ? 55 : 28;
      const clear = d < range && this.G.physics.los(cam.x, cam.y, cam.z, lp.x, lp.y - 0.2, lp.z);
      const fade = clear ? THREE.MathUtils.clamp((range - d) / (range * 0.35), 0, 1) : 0;
      const k = THREE.MathUtils.clamp(d / 9, 0.8, 1.6), base = avatar.label.userData.base;   // cresce só um pouco com a distância, para continuar legível de perto
      avatar.label.scale.set(base[0] * k, base[1] * k, 1);
      avatar.label.visible = !avatar.dead && fade > 0.02; avatar.label.material.opacity = fade * 0.9;
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const corpse = this.corpses[i]; corpse.ttl -= dt;
      corpse.avatar.model.animate(dt, 0, 0, this.time);
      if (corpse.ttl <= 0) { this._dispose(corpse.avatar); this.corpses.splice(i, 1); }
    }
  }
  event(event) {
    const playerId = event.player || event.actorId || event.id;
    if (this.disposed || event.type !== 'shot' || playerId === this.selfId) return;
    this.avatars.get(playerId)?.model.muzzleFlash();
    if (event.origin && event.end) {
      const from = new THREE.Vector3(...event.origin), to = new THREE.Vector3(...event.end);
      if (event.weapon !== 'KNIFE') {
        this.G.fx?.tracer(from, to, event.robot ? 0xffc18a : 0xbbe3ff, 340, event.robot ? 8 : 5);
        this.G.audio?.shot(event.robot ? 'RPL2' : (SHOT_SOUND[event.weapon] || 'KR7'), from, { vol: event.robot ? 0.9 : 0.6 });
      }
      this.G.fx?.flashLight(from, event.robot ? 0xffa060 : 0xffd5a0, event.robot ? 180 : 80, 0.04);
      if (event.weapon !== 'KNIFE') { const dir = new THREE.Vector3().subVectors(to, from).normalize(); this.G.fx?.muzzleSmoke?.(from.clone().addScaledVector(dir, 0.9).add(new THREE.Vector3(0, -0.2, 0)), dir, event.weapon === 'AX50' ? 4 : event.weapon === 'VK12' ? 3 : 2, event.weapon === 'AX50' ? 1.5 : 1); }
    }
    const victim = this.avatars.get(event.hit);
    if (victim && !victim.robot) victim.model.hitFlash();
  }
  _labelDispose(avatar) { avatar.label.removeFromParent(); avatar.label.material.map.dispose(); avatar.label.material.dispose(); }
  _dispose(avatar) {
    this._labelDispose(avatar);
    if (avatar.robot) avatar.model.dispose();
    else {
      avatar.model.gun.removeFromParent(); avatar.model.flash.material.dispose();
      avatar.model.skeleton?.dispose(); avatar.model.dispose(this.G.scene);
    }
  }
  dispose() {
    for (const avatar of this.avatars.values()) this._dispose(avatar);
    for (const corpse of this.corpses) this._dispose(corpse.avatar);
    this.avatars.clear(); this.corpses.length = 0; this.players = []; this.disposed = true;
  }
}
