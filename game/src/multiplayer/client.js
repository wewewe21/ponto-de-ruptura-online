import * as THREE from 'three';
import { stepBody } from '../../shared/movement.js';
import { SprintTap } from '../../shared/tactical.js';
import { applyWorldFlags } from '../world/level.js';
import { RemoteAvatars } from './avatars.js';
import { RobotView } from './robot-view.js';
import { VoiceChat } from './voice-chat.js';
import { WEAPONS } from '../actors/weapons.js';
import { codeLabel } from '../core/keybinds.js';
// opções de loadout (o servidor valida a mesma lista em shared/rules.json): [id, descrição]
export const LOADOUT_OPTIONS = {
  primary: [['SD9', 'Carabina equilibrada, boa em qualquer distância'], ['KR7', 'Fuzil de dano alto, um pouco mais lento'], ['MK5', 'Submetralhadora: cadência altíssima, curto alcance'], ['VK12', 'DMR semiautomático de tiro forte'], ['AX50', 'Sniper com luneta: um tiro no corpo quase mata, na cabeça mata']],
  secondary: [['P19', 'Glock: rápida e leve, dano menor'], ['DE50', 'Pistola pesada: lenta, dano alto; na cabeça é um tiro só']],
};
const DEFAULT_LOADOUT = { primary: 'SD9', secondary: 'P19' };
function readLoadout() {
  try {
    const l = JSON.parse(localStorage.getItem('pdr-loadout') || 'null');
    const ok = (list, id) => list.some(([x]) => x === id);
    if (l && ok(LOADOUT_OPTIONS.primary, l.primary) && ok(LOADOUT_OPTIONS.secondary, l.secondary)) return { primary: l.primary, secondary: l.secondary };
  } catch (e) {}
  return { ...DEFAULT_LOADOUT };
}
import { MP_VOICE_LINES } from './voice-lines.js';

const $ = (id) => document.getElementById(id);
const TEAM = { alpha: 'MARTELO', bravo: 'AFOGADOS' };
const escapeText = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export class Multiplayer {
  constructor(G) {
    this.G = G; this.voiceChat = new VoiceChat(this); this.active = false; this.connected = false; this.pending = []; this.seq = 0; this.acc = 0;
    this.players = []; this.offset = 0; this.feed = []; this.ping = 0; this.intentionalClose = true;
    this.renderPos = new THREE.Vector3(); this.robotView = null; this.weatherKey = null;
    this.loadout = readLoadout(); this.lo = null; this.weapon = this.loadout.primary; this.weaponAt = 0;
    this.lastFire = 0; this.crouch = false; this.jumpQueued = false; this.reloadQueued = false; this.robotQueued = false;
    this.tacticalTap = new SprintTap(); this.tacticalQueued = false;
    this.refreshController = null; this.refreshTimer = null;
    $('btn-online').onclick = () => this.openLobby();
    $('mp-back').onclick = () => this.closeLobby();
    $('mp-refresh').onclick = () => this.refreshRooms();
    $('mp-create').onsubmit = (e) => { e.preventDefault(); this.createRoom(); };
    $('mp-resume').onclick = () => { G.audio.init(); G.input.lock(); };
    G.input.onLockError = () => { if(this.active)$('mp-capture-hint').textContent='Deixe esta aba do jogo em primeiro plano e clique em JOGAR para capturar o mouse.'; };
    $('mp-leave').onclick = () => this.leave();
    $('mp-exit-match').onclick = () => this.leave();
    $('mp-copy').onclick = () => this.copyInvite();
    $('mp-robot').onclick = () => { this.robotQueued = true; G.input.lock(); };
    $('mp-player-name').value = localStorage.getItem('pdr-player-name') || '';
    $('mp-loadout-btn').onclick = () => this.openLoadout('lobby');
    $('mp-loadout').onclick = () => this.openLoadout('match');
    $('lo-close').onclick = () => { $('loadout').hidden = true; };
    this.updateLoadoutSummary();
    addEventListener('beforeunload', () => { this.voiceChat.close(); this.intentionalClose = true; this.socket?.close(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.connected) this.socket.send(JSON.stringify(this.command(false)));
    });
  }
  async init() {
    const r = await fetch('/shared/rules.json');
    if (!r.ok) throw new Error('Não foi possível carregar as regras online.');
    this.rules = await r.json();
    const room = new URL(location.href).searchParams.get('sala');
    if (room) { this.invitedRoom = room; this.openLobby(); }
  }
  now() { return Date.now() + this.offset; }
  notice(text, kind = '') { $('mp-status').textContent = text; $('mp-status').dataset.kind = kind; }
  async openLobby() {
    for (const id of ['title','briefing','chapters','settings','controls']) $(id).hidden = true;
    $('mp-lobby').hidden = false;
    this.G.state = 'title';
    await this.refreshRooms();
    clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => { if (!$('mp-lobby').hidden) this.refreshRooms(true); }, 8000);
  }
  closeLobby() {
    clearInterval(this.refreshTimer); this.refreshController?.abort();
    $('mp-lobby').hidden = true; $('title').hidden = false;
  }
  async refreshRooms(quiet = false) {
    this.refreshController?.abort(); const controller = new AbortController(); this.refreshController = controller;
    const timeout = setTimeout(() => controller.abort(), 65000);
    if (!quiet) this.notice('Buscando salas… O servidor gratuito pode levar um instante para despertar.');
    try {
      const r = await fetch('/api/rooms', { signal: controller.signal });
      if (!r.ok) throw new Error('Servidor indisponível. Tente atualizar as salas.');
      const { rooms } = await r.json();
      $('mp-room-list').replaceChildren();
      for (const room of rooms) {
        const b = document.createElement('button'); b.className = 'mp-room'; b.disabled = room.players >= room.maxPlayers;
        b.innerHTML = `<span><strong>${escapeText(room.name)}</strong><small>SUBESTAÇÃO · DEATHMATCH EM EQUIPES</small></span><span class="mp-room-meta"><b>${room.players} / ${room.maxPlayers}</b><small>${room.phase === 'intermission' ? 'PRÓXIMA PARTIDA' : room.players ? 'EM JOGO' : 'SALA ABERTA'}</small></span><span class="mp-room-arrow">↗</span>`;
        b.onclick = () => this.join(room.id); $('mp-room-list').appendChild(b);
      }
      if (!rooms.length) $('mp-room-list').textContent = 'Nenhuma sala aberta. Crie a primeira abaixo.';
      if (this.invitedRoom) {
        const invited = rooms.find((x) => x.id === this.invitedRoom);
        if (invited) { this.notice(`Convite para ${invited.name}. Escolha seu nome e entre na sala destacada.`); const buttons = $('mp-room-list').children; buttons[rooms.indexOf(invited)]?.classList.add('invited'); }
        else this.notice('Esta sala não está mais disponível. Entre em outra ou crie uma nova.');
      } else if (!quiet) this.notice('Escolha uma sala. Sua equipe é definida automaticamente para equilibrar os jogadores.');
    } catch (e) { if (controller === this.refreshController) this.notice(e.name === 'AbortError' ? 'O servidor demorou a responder. Clique em atualizar para tentar novamente.' : e.message, 'error'); }
    finally { clearTimeout(timeout); }
  }
  getName() {
    const name = $('mp-player-name').value.trim().slice(0,24) || 'Soldado';
    localStorage.setItem('pdr-player-name', name); return name;
  }
  async createRoom() {
    const button = $('mp-create-button'); button.disabled = true;
    try {
      const r = await fetch('/api/rooms', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:$('mp-room-name').value.trim() || 'Subestação',maxPlayers:12}) });
      const data = await r.json(); if (!r.ok) throw new Error(data.message || data.error || 'Não foi possível criar a sala.');
      this.join(data.room.id);
    } catch(e) { this.notice(e.message, 'error'); }
    finally { button.disabled = false; }
  }
  join(roomId) {
    if (this.joining || this.active) return;
    this.joining = true; this.roomId = roomId; this.name = this.getName(); this.token = null; this.retries = 0;
    this.intentionalClose = false; this.notice('Conectando à sala…');
    this.connect();
  }
  connect() {
    clearTimeout(this.reconnectTimer);
    const socket = this.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    const timeout = setTimeout(() => { if (socket.readyState !== WebSocket.OPEN) socket.close(); }, 20000);
    socket.onopen = () => { if (socket !== this.socket || this.intentionalClose) { socket.close(); return; } clearTimeout(timeout); socket.send(JSON.stringify({t:'join',roomId:this.roomId,name:this.name,token:this.token||undefined,loadout:this.loadout})); };
    socket.onmessage = (m) => {
      if (socket !== this.socket || this.intentionalClose) return;
      let data; try { data = JSON.parse(m.data); } catch { return; }
      if (data.t === 'welcome') {
        this.id = data.id; this.token = data.token; this.connected = true; this.joining = false; this.retries = 0;
        if (!this.active) this.enter();
        this.pending = []; this.firstSnapshot = true; this.snapshot(data.state);
        $('mp-connection').textContent = 'CONECTADO'; $('mp-connection').dataset.state = 'online';
      } else if (data.t === 'state') this.snapshot(data);
      else if (data.t === 'event') this.event(data.event);
      else if (data.t === 'voice') this.voiceChat.signal(data);
      else if (data.t === 'error') {
        const message = data.message || 'A conexão com a sala foi recusada.';
        if (!this.active) { this.intentionalClose = true; this.joining = false; this.notice(message, 'error'); socket.close(); }
        else this.toast(message);
      }
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      clearTimeout(timeout);
      if (socket !== this.socket) return;
      this.connected = false; this.voiceChat?.close();
      if (this.intentionalClose) return;
      $('mp-connection').textContent = 'RECONECTANDO…'; $('mp-connection').dataset.state = 'offline';
      if (++this.retries > 7) { if (this.active) this.leave(); this.joining = false; this.notice('Não foi possível reconectar. Escolha a sala novamente.', 'error'); return; }
      if (!this.active) this.notice('Aguardando o servidor… tentando novamente.');
      this.reconnectTimer = setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** (this.retries - 1)));
    };
  }
  enter() {
    const G = this.G; this.active = true; clearInterval(this.refreshTimer); this.refreshController?.abort();
    this.tacticalTap.reset(); this.tacticalQueued=false;
    G.mission.timers = []; G.dialog.clear(); G.director.clearAll(); G.boss?.reset();
    this.allyVisibility = G.allies.list.map((ally) => ({ally,root:ally.model.root.visible,gun:ally.model.gun?.visible}));
    for (const ally of G.allies.list) { ally.model.root.visible = false; if (ally.model.gun) ally.model.gun.visible = false; }
    applyWorldFlags(G, {}); G.nvg = false; G.cinematic = false; G.player.zone = null;
    for (const key of ['uSuppress','uGlare','uFlash','uLowHealth','uUnder','uScope','uDamage','uFade']) G.post.uniforms[key].value = 0;
    G.state = 'multiplayer'; G.hud.show(false); G.weapons.reset(); this.lo = { ...this.loadout }; this.applyWeapon(this.lo.primary, true);
    for (const id of ['title','briefing','pause','death','victory','settings','controls','chapters','mp-lobby','fullmap']) $(id).hidden = true;
    $('mp-hud').hidden = false; this.menu = true;
    this.avatars = new RemoteAvatars(G);
    this.makeBoundary();
    G.audio.init(); G.audio.tts=G.settings.voices; G.audio.setVolumes(); G.audio.setMusic('combat');
    this.voiceUntil=0;this.voicePriority=0;this.voiceSerial=0;
    this.robotViewPromise ||= RobotView.create(G).then((view) => { this.robotView = view; view.resize(G.camera.aspect); return view; }).catch((e) => { this.robotViewPromise = null; this.toast('Não foi possível carregar o Colosso. Atualize a página para tentar novamente.'); console.error(e); });
    const url = new URL(location.href); url.searchParams.set('sala', this.roomId); history.replaceState(null, '', url);
    G.input.lock();
  }
  muzzleWorld() { return this.G.vm.muzzleWorld(this.G.camera,new THREE.Vector3()); }
  // acerto: mira amarela + marcador em X (vermelho e maior na eliminação)
  markHit(kill) {
    const c=$('mp-crosshair'),h=$('mp-hitmarker');
    c.classList.add('hit');h.classList.add('on');h.classList.toggle('kill',!!kill);
    clearTimeout(this.hitTimer);this.hitTimer=setTimeout(()=>{c.classList.remove('hit');h.classList.remove('on','kill');},kill?420:170);
  }
  // troca a arma na tela (o servidor valida e passa a usar o dano/cadência/munição dela)
  applyWeapon(id, instant = false) {
    const G=this.G,W=G.weapons,lo=this.lo||this.loadout||DEFAULT_LOADOUT; this.weapon=id; this.weaponAt=performance.now();
    W.slots.primary=lo.primary; W.slots.secondary=lo.secondary;   // só a principal, a secundária e a faca do loadout
    if (id===lo.secondary) W.cur='secondary'; else if (id==='KNIFE') W.cur='melee'; else { if (id!==lo.primary) W.slots.primary=id; W.cur='primary'; }
    for (const x of [lo.primary, lo.secondary]) if (!W.ammo[x]) W.ammo[x]={mag:0,reserve:0};
    if (!W.ammo[id]) W.ammo[id]={mag:0,reserve:0};
    W.swap=instant?0:0.9; W.swapTo=null; W.reload=null; G.vm.set(W.id);
  }
  selectWeapon(input) {
    if (this.self.robot) return;
    let want = null;
    const lo = this.lo || this.loadout || DEFAULT_LOADOUT, order = [lo.primary, lo.secondary, 'KNIFE'];
    if (input.pressed('Digit1')) want = lo.primary;
    else if (input.pressed('Digit2')) want = lo.secondary;
    else if (input.pressed('Digit3')) want = 'KNIFE';
    if (!want && input.wheel) { const n = order.length, i = Math.max(0, order.indexOf(this.weapon)); want = order[(i + Math.sign(input.wheel) + n) % n]; }
    if (want && want !== this.weapon) {
      this.applyWeapon(want); this.G.audio.mech('swap'); this.reloadQueued = false;
    }
  }
  // ---------- loadout ----------
  updateLoadoutSummary() {
    const el = $('mp-loadout-sum'); if (!el) return;
    el.textContent = `${WEAPONS[this.loadout.primary].name} + ${WEAPONS[this.loadout.secondary].name} + faca`;
  }
  openLoadout(from) {
    this.loadoutFrom = from; $('loadout').hidden = false; this.renderLoadout();
  }
  chooseLoadout(slot, id) {
    this.loadout = { ...this.loadout, [slot]: id };
    try { localStorage.setItem('pdr-loadout', JSON.stringify(this.loadout)); } catch (e) {}
    this.updateLoadoutSummary();
    if (this.connected && this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ t: 'loadout', primary: this.loadout.primary, secondary: this.loadout.secondary }));
    this.renderLoadout();
  }
  renderLoadout() {
    const rules = this.rules && this.rules.weapons, inMatch = this.active && this.connected;
    const pending = inMatch && this.room && this.room.phase !== 'waiting' && this.lo && (this.lo.primary !== this.loadout.primary || this.lo.secondary !== this.loadout.secondary);
    $('lo-note').textContent = inMatch ? (pending ? 'Escolha salva: vale quando você reaparecer (depois de ser eliminado ou na próxima rodada).' : 'Escolha suas armas. Na partida, a mudança vale quando você reaparecer.') : 'Escolha suas armas antes de entrar: você já aparece com elas.';
    const bar = (v, max) => `<div class="lo-bar"><i style="width:${Math.max(6, Math.min(100, (v / max) * 100))}%"></i></div>`;
    for (const slot of ['primary', 'secondary']) {
      const box = $('lo-' + slot); box.replaceChildren();
      for (const [id, desc] of LOADOUT_OPTIONS[slot]) {
        const d = WEAPONS[id], r = rules && rules[id], b = document.createElement('button'); b.type = 'button'; b.className = 'lo-card' + (this.loadout[slot] === id ? ' on' : '');
        const stats = r ? `<div class="lo-bars"><span>DANO</span>${bar(r.damage, 110)}<span>CABEÇA</span>${bar(r.damage * (r.head || 1.5), 130)}<span>CADÊNCIA</span>${bar(r.rpm, 900)}</div>` : '';
        b.innerHTML = `<b>${d.name}</b><small>${desc}</small>${stats}`;
        b.onclick = () => this.chooseLoadout(slot, id); box.appendChild(b);
      }
    }
  }
  makeBoundary() {
    const a = this.rules.arena;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.minX,0.06,a.minZ),new THREE.Vector3(a.maxX,0.06,a.minZ),new THREE.Vector3(a.maxX,0.06,a.maxZ),new THREE.Vector3(a.minX,0.06,a.maxZ)]);
    this.boundary = new THREE.LineLoop(g,new THREE.LineBasicMaterial({color:0xe6a844,transparent:true,opacity:0.8})); this.G.scene.add(this.boundary);
  }
  snapshot(state) {
    if (!state?.room || !Array.isArray(state.players)) return;
    if (state.serverTime) this.offset = state.serverTime - Date.now();
    const self = state.players.find((p) => p.id === this.id); if (!self) return;
    const previous = this.self, previousRoom=this.room; this.self = self; this.players = state.players; this.room = state.room;
    this.voiceChat?.sync(state.players);
    this.updateVoice(previous,self,previousRoom,state.room);
    const key = `${state.room.round}:${state.room.weather}`;
    if (this.weatherKey !== key) { this.weatherKey = key; this.G.weather.setMatchWeather(state.room.weather); }
    const teleport = this.firstSnapshot || !previous || self.robot !== previous.robot || self.dead !== previous.dead || this.round !== state.room.round;
    this.snapAt = state.serverTime || this.snapAt; this.round = state.room.round; this.seq = Math.max(this.seq, self.seq);
    this.pending = teleport || self.dead || state.room.phase === 'intermission' ? [] : this.pending.filter((x) => x.seq > self.seq);
    const body = this.G.player.body;
    Object.assign(body,{x:self.x,y:self.y,z:self.z,vy:self.vy||0,onGround:self.onGround, r:self.robot?this.rules.robot.radius:this.rules.human.radius,h:self.robot?this.rules.robot.height:(self.crouch?1.05:this.rules.human.height),
      crouched:!!self.crouch,slideT:self.slideT||0,sdx:self.sdx||0,sdz:self.sdz||0,sprinting:!!self.sprinting,tacticalT:self.tacticalT||0,tacticalCooldown:self.tacticalCooldown||0});
    for (const input of this.pending) stepBody(this.G.physics,body,input,1/this.rules.tickRate,self.robot,this.rules);
    if (self.loadout && (!this.lo || self.loadout.primary!==this.lo.primary || self.loadout.secondary!==this.lo.secondary)) { this.lo = { ...self.loadout }; if (!self.robot) this.applyWeapon(self.weapon || this.lo.primary, true); }
    if (teleport && !self.robot && !self.dead && self.weapon) this.applyWeapon(self.weapon, true);   // reaparece com a arma do loadout
    this.loadoutNext = self.loadoutNext; if ($('loadout')?.hidden === false) this.renderLoadout();
    if (teleport) { this.G.player.yaw=self.yaw;this.G.player.pitch=self.pitch;this.renderPos.set(body.x,body.y,body.z);this.acc=0;this.crouch=false; }
    if (previous && self.hp < previous.hp) this.G.player.damagePulse = Math.min(0.65, this.G.player.damagePulse + 0.35);
    if (!previous?.robotReady && self.robotReady) this.toast('COLOSSO DISPONÍVEL · pressione B para assumir o controle');
    if (previous?.robot && !self.robot) this.toast('Colosso destruído. Faça outra sequência para conquistá-lo novamente.');
    this.G.player.hp = self.hp; this.G.player.dead = self.dead;
    if (!self.robot && self.weapon && self.weapon !== this.weapon && performance.now() - this.weaponAt > 1500) this.applyWeapon(self.weapon, true);
    this.avatars?.sync(state.players,this.id); this.firstSnapshot=false;
    this.updateScoreboard();
  }
  speakMatch(kind,priority=1) {
    const audio=this.G.audio,line=MP_VOICE_LINES[kind];if(!line||!audio?.speak)return;
    const now=this.now();if(now<(this.voiceUntil||0)&&priority<=(this.voicePriority||0))return;
    const [speaker,text]=line,serial=this.voiceSerial=(this.voiceSerial||0)+1;
    this.voicePriority=priority;this.voiceUntil=now+((audio.speechDuration?.(text,speaker)||text.length*.06+1)+.5)*1000;
    const subtitle=$('mp-voice-line');if(subtitle){subtitle.textContent=`${speaker}: ${text}`;subtitle.hidden=false;}
    audio.speak(text,speaker,{radio:speaker!=='ECO',channel:'multiplayer',onStart:duration=>{if(this.voiceSerial===serial)this.voiceUntil=this.now()+(duration+.2)*1000;},onEnd:()=>{if(this.voiceSerial===serial){this.voiceUntil=0;if(subtitle)subtitle.hidden=true;}}});
  }
  updateVoice(previous,self,oldRoom,room) {
    if(!this.G.audio?.speak)return;
    if(!previous||oldRoom?.phase!==room.phase||oldRoom?.round!==room.round){
      if(room.phase==='waiting')this.speakMatch('waiting',1);
      else if(room.phase==='playing')this.speakMatch('start',3);
      else if(room.phase==='intermission'){const opponent=self.team==='alpha'?'bravo':'alpha';this.speakMatch(room.scores.alpha===room.scores.bravo?'draw':room.scores[self.team]>room.scores[opponent]?'win':'loss',4);}
    }
    if(previous&&!previous.robotReady&&self.robotReady)this.speakMatch('ready',3);
    if(previous&&!previous.robot&&self.robot)this.speakMatch('pilot',4);
    if(previous&&!previous.dead&&self.dead)this.speakMatch(self.robot?'destroyed':'death',4);
    if(previous?.dead&&!self.dead)this.speakMatch('respawn',1);
      }
  command(enabled) {
    const I=this.G.input,P=this.G.player;
    return {t:'input',seq:++this.seq,forward:enabled?Number(I.down('KeyW'))-Number(I.down('KeyS')):0,right:enabled?Number(I.down('KeyD'))-Number(I.down('KeyA')):0,yaw:P.yaw,pitch:P.pitch,view:this.snapAt?Math.round(this.snapAt-50):undefined,
      sprint:!!(enabled&&I.down('ShiftLeft')),tactical:!!(enabled&&this.tacticalQueued&&!this.self.robot),crouch:!!(enabled&&this.crouch),jump:!!(enabled&&this.jumpQueued),shoot:!!(enabled&&I.mouse(0)),reload:!!(enabled&&this.reloadQueued),weapon:this.weapon,activateRobot:!!(enabled&&this.robotQueued&&this.robotView)};
  }
  update(dt) {
    if (!this.self) return;
    const G=this.G,P=G.player,I=G.input,now=this.now(),cfg=this.self.robot?this.rules.robot:this.rules.human;
    G.time+=dt; this.menu=!I.locked;
    const enabled=this.connected&&I.locked&&!this.self.dead&&this.room.phase!=='intermission';
    if(this.tacticalTap.update(dt,enabled&&I.pressed('ShiftLeft'))&&!this.self.robot)this.tacticalQueued=true;
    if (enabled) {
      const Wd=G.weapons.def,zm=this.self.robot?1.25:(Wd.zoom||1.25),adsK=G.weapons.adsT>0?THREE.MathUtils.lerp(1,1/zm*1.15,G.weapons.adsT):1;   // mesma sensibilidade do campo de visão normal, proporcional ao zoom
      const sens=0.0017*G.settings.sens*adsK;
      P.yaw-=I.mouseDX*sens; P.pitch=Math.max(-1.4,Math.min(1.4,P.pitch-I.mouseDY*sens*(G.settings.invertY?-1:1)));
      const sliding=P.body.slideT>0;
      // como na campanha: correr levanta (antes de agachar, para agachar correndo virar deslize); pular levanta e cancela o deslize
      if (this.crouch&&P.body.crouched&&!sliding&&I.down('ShiftLeft')&&I.down('KeyW')&&!this.self.robot) this.crouch=false;
      if (I.pressed('KeyC')||I.pressed('ControlLeft')) this.crouch=!this.crouch;
      if (this.crouch&&I.pressed('Space')) this.crouch=false;
      this.jumpQueued ||= I.pressed('Space'); this.reloadQueued ||= I.pressed('KeyR'); this.robotQueued ||= I.pressed('KeyB');
      if (I.pressed('KeyN')) G.nvg=!G.nvg;
      this.selectWeapon(I);
    }
    this.acc+=dt;
    const fixed=1/this.rules.tickRate;
    while(this.acc>=fixed) {
      this.acc-=fixed; const input=this.command(enabled);
      if(this.connected&&this.socket.readyState===WebSocket.OPEN&&this.room.phase!=='intermission'){ this.socket.send(JSON.stringify(input));if(!this.self.dead)this.pending.push(input);if(this.pending.length>90)this.pending.shift(); }
      if(!this.self.dead&&this.room.phase!=='intermission')stepBody(G.physics,P.body,input,fixed,this.self.robot,this.rules);
      this.jumpQueued=false;this.reloadQueued=false;this.robotQueued=false;this.tacticalQueued=false;
    }
    P.pos.set(P.body.x,P.body.y,P.body.z);
    const speed=enabled&&((I.down('KeyW')||I.down('KeyS')||I.down('KeyA')||I.down('KeyD')))?(P.body.tacticalT>0?cfg.tacticalSprint:I.down('ShiftLeft')?cfg.sprint:cfg.speed):0;
    P.hSpeed=speed;P.sprinting=!!P.body.sprinting;P.sprintT=THREE.MathUtils.damp(P.sprintT,P.sprinting?1:0,10,dt);
    P.tacticalPose=THREE.MathUtils.damp(P.tacticalPose||0,!this.self.robot&&P.body.tacticalT>0?1:0,9,dt);
    const slideNow=!this.self.robot&&P.body.slideT>0,crouchNow=!this.self.robot&&P.body.crouched;
    P.stance=crouchNow?'crouch':'stand';
    const eyeTarget=this.self.robot?cfg.eye:(crouchNow?0.98:cfg.eye)-(slideNow?0.25:0);   // a câmera desce suavemente ao agachar e mais ainda ao deslizar
    P.eyeH=this.self.robot?cfg.eye:THREE.MathUtils.damp(P.eyeH||cfg.eye,eyeTarget,12,dt);P.updateEye();
    this.slideRoll=THREE.MathUtils.damp(this.slideRoll||0,slideNow?0.05:0,10,dt);
    this.renderPos.lerp(P.pos,1-Math.exp(-25*dt));if(this.renderPos.distanceTo(P.pos)>3)this.renderPos.copy(P.pos);
    G.camera.position.copy(this.renderPos);G.camera.position.y+=P.eyeH;
    G.camera.rotation.set(P.pitch,P.yaw,this.slideRoll||0,'YXZ');
    G.weapons.recoil.update(dt,P);   // recuo da mira: sobe, segura e volta suave
    const W=G.weapons;W.adsT=THREE.MathUtils.damp(W.adsT,enabled&&I.mouse(2)&&(this.self.robot||(!W.def.melee&&!P.sprinting))?1:0,12,dt);
    const zoom=this.self.robot?1.25:(W.def.zoom||1.25);W.swap=Math.max(0,W.swap-dt/0.3);W.melee=Math.max(0,W.melee-dt/0.55);
    const targetFov=G.settings.fov/(W.def.scope&&!this.self.robot?1:(1+W.adsT*(zoom-1)))+(P.body.slideT>0?6:0);   // luneta: o zoom fica só na lenteG.camera.fov=THREE.MathUtils.damp(G.camera.fov,targetFov,12,dt);G.camera.updateProjectionMatrix();
    const reloading=this.self.reloadUntil>now;
    const reloadSecs=(this.self.robot?cfg:(this.rules.weapons&&this.rules.weapons[this.self.weapon])||cfg).reloadSeconds;
    W.reload=reloading?{t:Math.max(0,1-(this.self.reloadUntil-now)/(reloadSecs*1000)),empty:this.self.ammo===0}:null;
    W.A.mag=this.self.ammo;
    if(this.self.robot)this.robotView?.update(dt,{adsT:W.adsT,speed,shooting:enabled&&I.mouse(0)&&now-this.lastFire<140,reloading,yaw:P.yaw,pitch:P.pitch});
    else G.vm.update(dt,W.vmState(I,G.time));
    const daylight=this.room.weather?.startsWith('day_');
    G.vm.hemi.intensity=daylight?2.3:1.3;G.vm.dir.intensity=daylight?3:1.8;
    this.avatars?.update(dt);
    G.level.update(dt,G.time);G.weather.indoor=false;G.weather.update(dt);G.lights.update(dt,G.time);G.fx.update(dt);
    G.moon.position.set(P.pos.x-50,P.pos.y+110,P.pos.z-35);G.moon.target.position.copy(P.pos);
    G.audio.listener(G.camera);G.audio.setRain(G.weather.intensity,false);
    P.damagePulse=THREE.MathUtils.damp(P.damagePulse,0,3,dt);
    const U=G.post.uniforms;U.uTime.value=G.time;U.uNVG.value=G.nvg?1:0;U.uDamage.value=P.damagePulse;U.uLowHealth.value=!this.self.dead?Math.max(0,(cfg.hp*0.35-this.self.hp)/(cfg.hp*0.35)):0;
    U.uFade.value=this.self.dead?0.3:0;U.uExposure.value=daylight?1:1.2;U.uFocus.value=W.def.scope&&!this.self.robot?0:W.adsT;U.uScope.value=!this.self.robot&&W.def.scope&&W.adsT>0.92?1:0;U.uUnder.value=0;U.uFlash.value=0;
    $('mp-scoreboard').hidden=!(I.down('Tab')||this.room.phase==='intermission');
    this.updateHud();
  }
  event(e) {
    if(!this.active||!e)return;
    this.avatars?.event(e);
    if(e.type==='shot') {
      const origin=new THREE.Vector3(...e.origin),end=new THREE.Vector3(...e.end);
      if(e.player===this.id) {
        const def=WEAPONS[e.weapon];this.lastFire=this.now();
        if(e.weapon==='KNIFE'){ const W=this.G.weapons;W.melee=1;W.meleeSeq++;this.G.audio.mech('knife'); }
        else {
          this.G.fx.tracer(origin,end,e.robot?0xff9c3d:0xffcf88,450,e.robot?9:4);
          this.G.audio.shot(e.robot?'KR7':(def?def.sound:'SD9'));
          if(!e.robot&&def&&!def.melee){   // aviso sonoro de munição acabando (estimativa: o snapshot ainda não contou este tiro)
            const now=performance.now(),max=(this.rules.weapons[e.weapon]||{}).mag||def.mag;
            this.ammoEst=((this.ammoEstAt&&now-this.ammoEstAt<450&&this.ammoEstW===e.weapon)?this.ammoEst:(this.self.ammo|0))-1;this.ammoEstAt=now;this.ammoEstW=e.weapon;
            this.G.weapons.ammoCue(Math.max(0,this.ammoEst),max);
          }
          if(e.robot)this.robotView?.kick();else this.G.vm.kick(e.weapon==='AX50'?3.2:e.weapon==='VK12'?1.8:1);
          if(e.robot)this.G.player.pitch=Math.min(1.4,this.G.player.pitch+0.0035);
          else {
            const r=(def&&def.recoil)||{up:1,side:0.2,rand:0.3},W=this.G.weapons,mult=(1-W.adsT*0.4)*(this.crouch?0.85:1),i=this.shotIdx=(Date.now()-(this.lastShotAt||0)>350?0:(this.shotIdx||0)+1);this.lastShotAt=Date.now();
            const up=r.up*(i<6?1.15:0.85)*(1+(Math.random()-0.5)*r.rand),side=r.side*Math.sin(i*r.freq+r.phase)+(Math.random()-0.5)*r.rand*r.up*0.5;
            W.recoil.kick(up*mult*Math.PI/180,side*mult*Math.PI/180,e.weapon);
            this.G.fx.muzzleSmoke(this.muzzleWorld(),new THREE.Vector3().subVectors(end,origin).normalize(),e.weapon==='AX50'?4:e.weapon==='VK12'?3:2,e.weapon==='AX50'?1.5:1);
          }
        }
        if(e.dealt??e.hit){this.markHit(!!e.head);this.G.audio.hit(e.head?'headshot':'confirm');}
      }
    } else if(e.type==='kill') {
      this.feed.unshift({text:`${e.name||'Ambiente'}  ›  ${e.victimName||'Soldado'}`,time:this.now()});this.feed=this.feed.slice(0,4);
      if(e.killer===this.id){this.toast('+100 · ALVO ELIMINADO');this.markHit(true);if(!e.head)this.G.audio.hit('killshot');this.speakMatch('kill',0);}
    } else if(e.type==='robot'&&e.active&&e.player!==this.id){
      const pilot=this.players.find(p=>p.id===e.player);if(pilot)this.speakMatch(pilot.team===this.self?.team?'friendlyRobot':'enemyRobot',3);
    }
  }
  toast(text) { $('mp-toast').textContent=text;this.toastUntil=this.now()+4000; }
  updateHud() {
    const s=this.self,now=this.now(),r=this.room;
    $('mp-team').textContent=TEAM[s.team];$('mp-team').dataset.team=s.team;
    $('mp-alpha-score').textContent=r.scores.alpha;$('mp-bravo-score').textContent=r.scores.bravo;
    const seconds=Math.max(0,Math.ceil((((r.phase==='intermission'?r.nextRoundAt:r.endsAt)||now)-now)/1000));
    $('mp-clock').textContent=r.phase==='waiting'?'AGUARDANDO':`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
    $('mp-room-title').textContent=r.name;
    $('mp-weather').textContent=this.rules.weather.find(w=>w.id===r.weather)?.name||r.weather;
    $('mp-hp').textContent=`${s.hp} / ${s.maxHp}`;$('mp-health-fill').style.width=`${100*s.hp/s.maxHp}%`;
    const wdef=WEAPONS[this.weapon],lowMag=!s.robot&&wdef&&!wdef.melee&&s.ammo>0&&s.ammo<=Math.ceil((this.rules.weapons[this.weapon]?.mag||wdef.mag)*0.25)&&!(s.reloadUntil>now);
    $('mp-ammo').classList.toggle('low',lowMag);$('mp-reload-label').classList.toggle('low',lowMag||(!s.robot&&wdef&&!wdef.melee&&s.ammo===0));
    $('mp-ammo').textContent=!s.robot&&wdef&&wdef.melee?'—':s.ammo;$('mp-weapon-label').textContent=s.robot?'COLOSSO MX-9 · CANHÃO PESADO':(wdef?wdef.name:'CARABINA SD-9');
    $('mp-reload-label').textContent=!s.robot&&wdef&&wdef.melee?'[1] [2] [3] ARMAS':s.reloadUntil>now?'RECARREGANDO…':(lowMag?'MUNIÇÃO BAIXA':s.ammo===0?'SEM MUNIÇÃO · RECARREGUE':`[${codeLabel(this.G.input.physical('KeyR'))}] RECARREGAR`);
    $('mp-points').textContent=s.points;$('mp-streak-count').textContent=`${s.streak} / ${this.rules.robotStreak}`;
    $('mp-streak-fill').style.width=`${Math.min(100,s.streak/this.rules.robotStreak*100)}%`;
    $('mp-robot').hidden=!s.robotReady;$('mp-robot').disabled=!this.robotView;
    $('mp-robot').textContent=this.robotView?`[${codeLabel(this.G.input.physical('KeyB'))}] CONTROLAR COLOSSO`:'PREPARANDO COLOSSO…';
    $('mp-streak-label').textContent=s.robot?'COLOSSO ATIVO':s.robotReady?'RECOMPENSA CONQUISTADA':'8 ABATES SEGUIDOS · CONQUISTE O COLOSSO';
    $('mp-robot-frame').hidden=!s.robot;
    $('mp-crosshair').hidden=s.dead||r.phase==='intermission'||(!s.robot&&this.G.weapons.adsT>0.5);
    $('mp-feed').replaceChildren(...this.feed.filter(x=>now-x.time<7000).map(x=>{const p=document.createElement('div');p.textContent=x.text;return p;}));
    $('mp-toast').hidden=!(now<this.toastUntil);
    const voiceLine=$('mp-voice-line');if(voiceLine)voiceLine.hidden=now>=(this.voiceUntil||0);
    $('mp-waiting').hidden=r.phase!=='waiting';
    $('mp-dead').hidden=!s.dead;
    $('mp-respawn-time').textContent=Math.max(0,Math.ceil((s.respawnAt-now)/1000));
    $('mp-pause').hidden=!this.menu||s.dead||r.phase==='intermission';
    $('mp-intermission').hidden=r.phase!=='intermission';
    if(r.phase==='intermission'){$('mp-result').textContent=r.scores.alpha===r.scores.bravo?'EMPATE':r.scores[s.team]>r.scores[s.team==='alpha'?'bravo':'alpha']?'VITÓRIA':'DERROTA';$('mp-next-round').textContent=`Próxima partida em ${Math.ceil(seconds)}s · novo clima`;} 
  }
  updateScoreboard() {
    for(const team of ['alpha','bravo']) {
      const body=$(`mp-rows-${team}`);body.replaceChildren();
      for(const p of this.players.filter(p=>p.team===team).sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths)){
        const row=document.createElement('tr');if(p.id===this.id)row.className='self';
        for(const val of [`${p.name}${p.robot?' · MX-9':''}${p.id===this.id?' · VOCÊ':''}`,p.kills,p.deaths,p.points]){const cell=document.createElement('td');cell.textContent=val;row.appendChild(cell);}body.appendChild(row);
      }
    }
  }
  async copyInvite() {
    try{await navigator.clipboard.writeText(location.href);this.toast('Link da sala copiado. Compartilhe com seus amigos.');}catch{this.toast(`Convite: ${location.href}`);}
  }
  resize() { this.robotView?.resize(this.G.camera.aspect); }
  render() {
    const G=this.G,view=this.self?.robot&&this.robotView;
    const W=G.weapons,sc=G.scopeCam,scoped=!view&&G.post.uniforms.uScope.value>0.5&&W.def.scope;
    if(scoped){sc.position.copy(G.camera.position);sc.quaternion.copy(G.camera.quaternion);sc.aspect=G.camera.aspect;sc.fov=G.settings.fov/(W.def.zoom||4);sc.updateProjectionMatrix();}
    document.body.classList.toggle('scoped',!!scoped);
    G.post.render(G.scene,G.camera,this.self&&!this.self.dead?(view?view.scene:G.vm.scene):null,view?view.camera:G.vm.camera,scoped?sc:undefined);
  }
  leave() {
    this.G.audio?.stopSpeech?.();this.voiceUntil=0;this.voiceSerial=(this.voiceSerial||0)+1;
    this.tacticalTap?.reset();this.tacticalQueued=false;
    const G=this.G;this.voiceChat?.close();this.intentionalClose=true;this.active=false;this.connected=false;this.joining=false;clearTimeout(this.reconnectTimer);this.socket?.close();this.socket=null;
    this.avatars?.dispose();this.avatars=null;this.pending=[];this.self=null;this.players=[];this.weatherKey=null;
    if(this.boundary){G.scene.remove(this.boundary);this.boundary.geometry.dispose();this.boundary.material.dispose();this.boundary=null;}
    for(const saved of this.allyVisibility||[]){saved.ally.model.root.visible=saved.root;if(saved.ally.model.gun)saved.ally.model.gun.visible=saved.gun;}
    this.allyVisibility=[];G.player.body.r=0.32;G.player.body.h=1.8;G.player.body.step=0.5;G.player.zone=null;
    G.weather.clearMatchWeather();G.nvg=false;G.state='title';G.input.unlock();G.cinematic=false;G.post.uniforms.uFade.value=0;G.post.uniforms.uDamage.value=0;G.post.uniforms.uNVG.value=0;G.weapons.reset();G.vm.set('SD9');
    $('mp-hud').hidden=true;$('title').hidden=true;G.hud.show(false);const url=new URL(location.href);url.searchParams.delete('sala');history.replaceState(null,'',url);this.openLobby();
  }
}
