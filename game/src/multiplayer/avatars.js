import * as THREE from 'three';
import { createSoldier } from '../actors/soldier.js';
import { hasMeshSoldier } from '../actors/meshsoldier.js';
import { BossAnimator } from '../actors/bossanim.js';
import { cloneRobotAssets, loadRobotAssets, poseRobotArms, disposeRobotAssets } from './robot-view.js';

export const TEAM_COLORS = Object.freeze({ alpha: 0x51dcff, bravo: 0xffa455 });
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function nameLabel(player, robot) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
  const ctx = canvas.getContext('2d'), color = player.team === 'alpha' ? '#51dcff' : '#ffa455';
  ctx.fillStyle = 'rgba(3,10,17,.84)'; ctx.fillRect(5, 5, 502, 102);
  ctx.fillStyle = color; ctx.fillRect(5, 5, 6, 102);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`${String(player.team).toUpperCase()}${robot ? ' · COLOSSO' : ''}`, 256, 31);
  ctx.font = 'bold 34px sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText(String(player.name || 'Operador').slice(0, 24), 256, 76, 470);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(robot ? 3.7 : 2.7, robot ? 0.81 : 0.59, 1);
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
    if (!this.dead) this.anim.play(speed > 3.1 ? 'run' : speed > 0.2 ? 'walk' : 'idle', { speed: speed > 0.2 ? THREE.MathUtils.clamp(speed / (speed > 3.1 ? 9.6 : 4.9), 0.45, 1.4) : 0.8, fade: 0.25 });
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
      const speed = Math.hypot(avatar.pos.x - oldX, avatar.pos.z - oldZ) / Math.max(dt, 0.001);
      avatar.model.aimPitch = avatar.player.pitch || 0;
      avatar.model.setPose(avatar.pos, avatar.yaw); avatar.model.animate(dt, speed, avatar.player.crouch ? 1 : 0, this.time);
      avatar.label.position.copy(avatar.pos).y += avatar.robot ? 5.65 : 2.2;
      const labelSize = Math.max(1, Math.min(90, avatar.pos.distanceTo(this.G.camera.position)) / 18);
      avatar.label.scale.set((avatar.robot ? 3.7 : 2.7) * labelSize, (avatar.robot ? 0.81 : 0.59) * labelSize, 1);
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
      this.G.fx?.tracer(from, to, event.robot ? 0xffc18a : 0xbbe3ff, 340, event.robot ? 8 : 5);
      this.G.audio?.shot(event.robot ? 'RPL2' : 'KR7', from, { vol: event.robot ? 0.9 : 0.6 });
      this.G.fx?.flashLight(from, event.robot ? 0xffa060 : 0xffd5a0, event.robot ? 180 : 80, 0.04);
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
