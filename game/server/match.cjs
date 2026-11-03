'use strict';
const { randomUUID, randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

let engine;
async function loadEngine() {
  return engine ||= Promise.all([
    import(pathToFileURL(path.join(__dirname, '../src/world/physics.js')).href),
    import(pathToFileURL(path.join(__dirname, '../shared/movement.js')).href),
  ]).then(([p, m]) => ({ Physics: p.Physics, stepBody: m.stepBody }));
}
function chooseWeather(rules, random = Math.random) {
  const choices = rules.weather.filter(w => w.weight > 0);
  let roll = Math.max(0, Math.min(0.999999999, random())) * choices.reduce((n, w) => n + w.weight, 0);
  for (const w of choices) { roll -= w.weight; if (roll < 0) return w.id; }
  return choices[0].id;
}
function validateWorld(world) {
  if (!world || !Array.isArray(world.cols) || !Array.isArray(world.ramps) || !world.terrain ||
      !['alpha', 'bravo'].every(t => Array.isArray(world.spawns?.[t]) && world.spawns[t].length &&
        world.spawns[t].every(s => Array.isArray(s) && s.length >= 4 && s.every(Number.isFinite))))
    throw new Error('Arena world manifest is missing or invalid');
  const t = world.terrain;
  if (![t.minX, t.minZ, t.size, t.n].every(Number.isFinite) || t.n < 2 || t.size <= 0 ||
      !Array.isArray(t.h) || t.h.length !== t.n * t.n || !t.h.every(Number.isFinite))
    throw new Error('Arena terrain is invalid');
  for (const c of world.cols) if (!['minX','maxX','minY','maxY','minZ','maxZ'].every(k => Number.isFinite(c[k])))
    throw new Error('Arena collider is invalid');
  return world;
}
function validateInput(v) {
  if (!v || v.t !== 'input' || !Number.isSafeInteger(v.seq) || v.seq < 0 || v.seq > 2147483647) return null;
  if (!['forward','right','yaw','pitch'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))) return null;
  if (Math.abs(v.forward) > 1 || Math.abs(v.right) > 1 || Math.abs(v.yaw) > 1e6 || Math.abs(v.pitch) > Math.PI / 2) return null;
  const clean = { seq: v.seq, forward: v.forward, right: v.right, yaw: v.yaw % (Math.PI * 2), pitch: v.pitch };
  if (v.view !== undefined) { if (typeof v.view !== 'number' || !Number.isFinite(v.view)) return null; clean.view = v.view; }
  if (v.weapon !== undefined) { if (typeof v.weapon !== 'string' || v.weapon.length > 8) return null; clean.weapon = v.weapon; }
  for (const k of ['jump','sprint','crouch','shoot','reload','activateRobot']) {
    if (v[k] !== undefined && typeof v[k] !== 'boolean') return null;
    clean[k] = v[k] === true;
  }
  return clean;
}
// Acerto do soldado: tronco/pernas = cilindro vertical, cabeça = esfera (bem mais justo que a caixa inteira, que pegava os cantos vazios).
const HIT = { bodyR: 0.3, headR: 0.19, headDrop: 0.15 };
function raySphere(o, d, cx, cy, cz, r, limit) {
  const ox = o[0] - cx, oy = o[1] - cy, oz = o[2] - cz, b = ox * d[0] + oy * d[1] + oz * d[2], c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c; if (disc < 0) return null;
  const t = -b - Math.sqrt(disc); return t >= 0 && t <= limit ? t : (c < 0 ? 0 : null);
}
function rayCylinder(o, d, cx, cz, r, y0, y1, limit) {
  let best = null; const ox = o[0] - cx, oz = o[2] - cz, a = d[0] * d[0] + d[2] * d[2];
  const take = (t) => { if (t >= 0 && t <= limit && (best === null || t < best)) best = t; };
  if (a > 1e-10) {
    const b = 2 * (ox * d[0] + oz * d[2]), c = ox * ox + oz * oz - r * r, disc = b * b - 4 * a * c;
    if (disc >= 0) { const s = Math.sqrt(disc); for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) { const y = o[1] + d[1] * t; if (y >= y0 && y <= y1) take(t); } }
  }
  if (Math.abs(d[1]) > 1e-10) for (const y of [y0, y1]) { const t = (y - o[1]) / d[1], x = ox + d[0] * t, z = oz + d[2] * t; if (x * x + z * z <= r * r) take(t); }
  return best;
}
function rayBox(origin, dir, min, max, limit) {
  let near = 0, far = limit;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-8) { if (origin[i] < min[i] || origin[i] > max[i]) return null; }
    else {
      const a = (min[i] - origin[i]) / dir[i], b = (max[i] - origin[i]) / dir[i];
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (far < near) return null;
    }
  }
  return near <= limit ? near : null;
}

class Room {
  static async create(world, rules, options = {}) { return new Room(world, rules, await loadEngine(), options); }
  constructor(world, rules, engine, options = {}) {
    validateWorld(world);
    this.rules = rules; this.world = world; this.stepBody = engine.stepBody;
    this.now = options.now || Date.now; this.random = options.random || Math.random;
    this.id = options.id || randomUUID(); this.name = options.name || 'Subestação';
    this.maxPlayers = options.maxPlayers || rules.maxPlayers;
    this.players = new Map(); this.events = []; this.onEvent = options.onEvent || (() => {});
    this.physics = new engine.Physics();
    for (const c of world.cols) this.physics.add(c.minX,c.minY,c.minZ,c.maxX,c.maxY,c.maxZ,c);
    for (const r of world.ramps) this.physics.addRamp(r.minX,r.maxX,r.minZ,r.maxZ,r.axis,r.y0,r.y1,r);
    const t = world.terrain; this.physics.setTerrain(t.minX,t.minZ,t.size,t.n,t.h);
    this.phase = 'waiting'; this.round = 0; this.endsAt = 0; this.nextRoundAt = 0;
    this.weather = chooseWeather(rules, this.random); this.scores = { alpha: 0, bravo: 0 };
    this.lastActive = this.now(); this.eventSeq = 0;
  }
  summary() { return {id:this.id,name:this.name,players:[...this.players.values()].filter(p => p.connected).length,maxPlayers:this.maxPlayers,phase:this.phase,weather:this.weather}; }
  join(name, token, loadout) {
    const now = this.now();
    if (token) {
      const old = [...this.players.values()].find(p => p.token === token && !p.connected && now - p.disconnectedAt <= 15000);
      if (old) { old.connected = true; old.queue = []; old.input = null; old.lastReceived = now; this.lastActive = now; return old; }
    }
    if (this.players.size >= this.maxPlayers) throw new Error('Sala cheia');
    const alpha = [...this.players.values()].filter(p => p.connected && p.team === 'alpha').length;
    const bravo = [...this.players.values()].filter(p => p.connected && p.team === 'bravo').length;
    const team = alpha <= bravo ? 'alpha' : 'bravo';
    const p = { id:randomUUID(), token:randomBytes(24).toString('hex'), name:String(name || 'Soldado').replace(/[\x00-\x1f\x7f<>]/g,'').trim().slice(0,24) || 'Soldado',team,
      connected:true,queue:[],input:null,lastReceived:now,acceptedSeq:-1,seq:-1,kills:0,deaths:0,points:0,streak:0,streakPoints:0,robotReady:false,
      rateStart:now,rateCount:0,lastShot:-Infinity,robot:false,dead:false,loadout:null,loadoutNext:this.sanitizeLoadout(loadout) };
    this.players.set(p.id,p); this.spawn(p,now); this.lastActive = now;
    if (this.phase === 'waiting' && this.connectedCount() >= 2) this.startRound(now);
    return p;
  }
  // loadout (principal + secundária): valores fora da lista permitida voltam para o padrão
  sanitizeLoadout(l) {
    const o=this.rules.loadouts||{},d=o.default||{primary:'SD9',secondary:'P19'};
    return {primary:Array.isArray(o.primary)&&o.primary.includes(l&&l.primary)?l.primary:d.primary,secondary:Array.isArray(o.secondary)&&o.secondary.includes(l&&l.secondary)?l.secondary:d.secondary};
  }
  // vale no próximo reaparecimento; no aquecimento (sozinho na sala) vale na hora, sem mover o jogador
  setLoadout(p,l,now=this.now()) {
    p.loadoutNext=this.sanitizeLoadout(l);
    if(!p.robot&&!p.dead&&this.phase==='waiting')this.applyLoadout(p,now);
  }
  applyLoadout(p,now) {
    p.loadout=p.loadoutNext||p.loadout||this.sanitizeLoadout(null);p.loadoutNext=null;
    p.weapon=p.loadout.primary;p.ammoBy=this.freshAmmo();p.lastShotBy={};p.ammo=p.ammoBy[p.weapon];p.reloadUntil=0;p.lastShot=-Infinity;p.switchUntil=now+(this.rules.swapSeconds||0.45)*1000;
  }
  freshAmmo() { return Object.fromEntries(Object.entries(this.rules.weapons||{}).map(([id,w])=>[id,w.mag])); }
  // configuração de combate do jogador: o Colosso usa a do robô; senão a da arma empunhada (SD9 = regra humana original)
  combat(p) { return p.robot?this.rules.robot:(this.rules.weapons&&this.rules.weapons[p.weapon])||this.rules.human; }
  switchWeapon(p,id,now) {
    if(p.robot||p.dead||!this.rules.weapons||!Object.hasOwn(this.rules.weapons,id)||id===p.weapon)return false;
    const lo=p.loadout||this.sanitizeLoadout(null);if(id!=='KNIFE'&&id!==lo.primary&&id!==lo.secondary)return false;   // só a principal, a secundária e a faca do loadout
    p.ammoBy[p.weapon]=p.ammo;p.lastShotBy[p.weapon]=p.lastShot;p.weapon=id;p.ammo=p.ammoBy[id];p.lastShot=p.lastShotBy[id]??-Infinity;p.reloadUntil=0;p.switchUntil=now+(this.rules.swapSeconds||0.45)*1000;return true;
  }
  connectedCount() { return [...this.players.values()].filter(p => p.connected).length; }
  disconnect(id) { const p = this.players.get(id); if (p) {p.connected=false;p.disconnectedAt=this.now();p.queue=[];p.input=null;} }
  enqueue(p, value) {
    const now = this.now(), input = validateInput(value);
    if (!input || !p.connected || input.seq <= p.acceptedSeq) return false;
    if (now - p.rateStart >= 1000) {p.rateStart=now;p.rateCount=0;}
    if (++p.rateCount > 60) return false;
    p.acceptedSeq=input.seq;p.lastReceived=now;
    if (p.queue.length >= 6) p.queue.shift();
    p.queue.push({...input,receivedAt:now}); return true;
  }
  emit(type, data) {
    const event = {type,id:`${this.id}:${++this.eventSeq}`,...data};
    this.events.push(event); if(this.events.length>100) this.events.shift(); this.onEvent(event); return event;
  }
  spawn(p, now = this.now()) {
    const points = this.world.spawns[p.team];
    // Prefer a spawn away from living enemies; randomize ties to avoid a fixed spawn trap.
    const start = Math.floor(this.random()*points.length) % points.length;
    let chosen = points[start], best = -Infinity;
    for (let i=0;i<points.length;i++) {
      const s=points[(start+i)%points.length];
      const enemies=[...this.players.values()].filter(e=>e.team!==p.team&&!e.dead&&e.connected&&e.body);
      const distance=enemies.length?Math.min(...enemies.map(e=>Math.hypot(s[0]-e.body.x,s[2]-e.body.z))):0;
      if(distance>best){best=distance;chosen=s;}
    }
    const cfg=this.rules.human;
    p.body={x:chosen[0],y:chosen[1],z:chosen[2],vy:0,r:cfg.radius,h:cfg.height,step:0.5,onGround:true};
    p.yaw=chosen[3];p.pitch=0;p.hp=cfg.hp;p.maxHp=cfg.hp;p.robot=false;p.dead=false;
    p.respawnAt=0;p.protectedUntil=now+this.rules.spawnProtectionSeconds*1000;
    p.loadout=p.loadoutNext||p.loadout||this.sanitizeLoadout(null);p.loadoutNext=null;   // o loadout escolhido vale a cada reaparecimento
    p.weapon=p.loadout.primary;p.ammoBy=this.freshAmmo();p.lastShotBy={};p.ammo=p.ammoBy[p.weapon];p.switchUntil=0;
    p.reloadUntil=0;p.lastShot=-Infinity;p.queue=[];p.input=null;
    this.emit('respawn',{player:p.id});
  }
  startRound(now=this.now()) {
    this.phase='playing';this.round++;this.endsAt=now+this.rules.roundSeconds*1000;this.nextRoundAt=0;
    this.scores={alpha:0,bravo:0};this.weather=chooseWeather(this.rules,this.random);
    for(const p of this.players.values()) {p.kills=0;p.deaths=0;p.points=0;p.streak=0;p.streakPoints=0;p.robotReady=false;this.spawn(p,now);}
    this.emit('round',{phase:this.phase,round:this.round,weather:this.weather});
  }
  endRound(now=this.now()) {
    if(this.phase!=='playing')return;
    this.phase='intermission';this.endsAt=0;this.nextRoundAt=now+this.rules.intermissionSeconds*1000;
    for(const p of this.players.values()){p.queue=[];p.input=null;}
    this.emit('round',{phase:this.phase,round:this.round,scores:{...this.scores}});
  }
  activate(p,now) {
    if(this.phase!=='playing'||!p.robotReady||p.robot||p.dead)return false;
    const cfg=this.rules.robot,b=p.body;
    if(this.physics.boxBlocked(b.x-cfg.radius,b.y+0.65,b.z-cfg.radius,b.x+cfg.radius,b.y+cfg.height,b.z+cfg.radius))return false;
    p.robotReady=false;p.streak=0;p.streakPoints=0;p.robot=true;p.hp=cfg.hp;p.maxHp=cfg.hp;
    b.r=cfg.radius;b.h=cfg.height;b.step=0.6;p.ammo=cfg.mag;p.reloadUntil=0;p.lastShot=now;
    p.protectedUntil=0;this.emit('robot',{player:p.id,active:true});return true;
  }
  kill(killer,victim,now=this.now(),head=false) {
    if(this.phase!=='playing'||victim.dead || (killer && killer.team === victim.team))return;
    const wasRobot=victim.robot;victim.hp=0;victim.dead=true;victim.deaths++;victim.respawnAt=now+this.rules.respawnSeconds*1000;
    victim.streak=0;victim.streakPoints=0;victim.robotReady=false;victim.queue=[];victim.input=null;victim.reloadUntil=0;
    if(killer&&killer.team!==victim.team&&killer.id!==victim.id) {
      killer.kills++;killer.points+=this.rules.killPoints;this.scores[killer.team]++;
      if(!killer.robot) {killer.streak++;killer.streakPoints+=this.rules.killPoints;
        if(killer.streak>=this.rules.robotStreak&&killer.streakPoints>=this.rules.robotPoints)killer.robotReady=true;}
    }
    this.emit('kill',{killer:killer?.id||null,victim:victim.id,name:killer?.name||'Ambiente',victimName:victim.name,team:killer?.team||null,head:!!head});
    if(wasRobot)this.emit('robot',{player:victim.id,active:false,destroyed:true});
    if(Math.max(this.scores.alpha,this.scores.bravo)>=this.rules.scoreLimit)this.endRound(now);
  }
  // posição que o alvo tinha quando o atirador viu o disparo (compensação de lag, no máximo 350 ms para trás)
  rewound(other,when) {
    const b=other.body,h=other.hist;if(!h||!h.length||!(when<h[h.length-1].t))return {x:b.x,y:b.y,z:b.z,h:b.h};
    for(let i=h.length-1;i>=0;i--){if(h[i].t<=when){const a=h[i],c=h[i+1];if(!c||Math.hypot(c.x-a.x,c.z-a.z)>3)return a;const k=(when-a.t)/Math.max(1,c.t-a.t);
      return {x:a.x+(c.x-a.x)*k,y:a.y+(c.y-a.y)*k,z:a.z+(c.z-a.z)*k,h:a.h+(c.h-a.h)*k};}}
    return h[0];
  }
  shoot(p,now) {
    const cfg=this.combat(p),melee=!!cfg.melee;
    if((this.phase!=='playing'&&this.phase!=='waiting')||p.dead||p.reloadUntil||(!melee&&p.ammo<=0)||now<(p.switchUntil||0)||now-p.lastShot+0.001<60000/cfg.rpm)return false;
    p.lastShot=now;if(!melee)p.ammo--;p.protectedUntil=0;
    const eye=(p.robot?this.rules.robot:this.rules.human).eye;
    const origin=[p.body.x,p.body.y+(p.robot?eye:Math.min(eye,p.body.h-0.15)),p.body.z];
    const dir=[-Math.sin(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch),-Math.cos(p.yaw)*Math.cos(p.pitch)];
    const wall=this.physics.raycast(...origin,...dir,cfg.range,{noWater:true});
    let distance=wall?wall.t:cfg.range,victim=null,head=false;
    const when=Number.isFinite(p.view)?Math.max(now-350,Math.min(p.view,now)):now;
    for(const other of this.players.values()) {
      if(other.id===p.id||other.dead||!other.connected)continue;
      const b=other.body,q=this.rewound(other,when);let t=null,isHead=false;
      if(other.robot)t=rayBox(origin,dir,[q.x-b.r,q.y,q.z-b.r],[q.x+b.r,q.y+q.h,q.z+b.r],distance);
      else {
        const th=raySphere(origin,dir,q.x,q.y+q.h-HIT.headDrop,q.z,HIT.headR,distance),tb=rayCylinder(origin,dir,q.x,q.z,HIT.bodyR,q.y,q.y+q.h-HIT.headDrop-HIT.headR,distance);
        if(th!==null&&(tb===null||th<=tb)){t=th;isHead=true;}else t=tb;
      }
      if(t!==null&&t<distance){distance=t;victim=other;head=isHead;}
    }
    const end=origin.map((v,i)=>v+dir[i]*distance);
    const dealt=!!victim&&victim.team!==p.team&&now>=victim.protectedUntil;   // só confirma acerto que realmente tirou vida
    this.emit('shot',{player:p.id,origin,end,hit:victim?.id||null,dealt,head:dealt&&head,robot:p.robot,weapon:p.robot?'ROBOT':p.weapon});
    const dmg=Math.round(cfg.damage*(head?(cfg.head||this.rules.headDefault||1.5):1));   // tiro na cabeça sempre dá mais dano
    if(dealt){victim.hp=Math.max(0,victim.hp-dmg);if(victim.hp===0)this.kill(p,victim,now,head);}
    return true;
  }
  tick(dt=1/this.rules.tickRate,now=this.now()) {
    for(const [id,p] of this.players)if(!p.connected&&now-p.disconnectedAt>15000)this.players.delete(id);
    if(this.connectedCount())this.lastActive=now;
    if(this.phase==='intermission'&&now>=this.nextRoundAt) {
      if(this.connectedCount()>=2)this.startRound(now);
      else{this.phase='waiting';this.nextRoundAt=0;this.emit('round',{phase:this.phase,round:this.round});}
    }
    if(this.phase==='waiting'&&this.connectedCount()>=2)this.startRound(now);
    if(this.phase==='intermission')return;
    if(this.phase==='playing'&&now>=this.endsAt){this.endRound(now);return;}
    for(const p of this.players.values()) {
      if(!p.connected)continue;
      if(p.dead){if(now>=p.respawnAt)this.spawn(p,now);continue;}
      if(p.reloadUntil&&now>=p.reloadUntil){p.ammo=this.combat(p).mag;p.reloadUntil=0;}
      let fresh=false;
      while(p.queue.length&&now-p.queue[0].receivedAt>250)p.queue.shift();
      if(p.queue.length){p.input=p.queue.shift();p.seq=p.input.seq;fresh=true;}
      let input=p.input;
      if(!input||now-input.receivedAt>250)input={forward:0,right:0,yaw:p.yaw,pitch:p.pitch};
      p.yaw=input.yaw;p.pitch=input.pitch;
      this.stepBody(this.physics,p.body,{...input,jump:fresh&&input.jump},dt,p.robot,this.rules);
      (p.hist||(p.hist=[])).push({t:now,x:p.body.x,y:p.body.y,z:p.body.z,h:p.body.h});while(p.hist.length&&now-p.hist[0].t>1000)p.hist.shift();
      if(p.body.y < -80){if(this.phase==='playing')this.kill(null,p,now);else this.spawn(p,now);continue;}
      if(fresh&&input.activateRobot)this.activate(p,now);
      if(fresh&&input.weapon)this.switchWeapon(p,input.weapon,now);
      const cfg=this.combat(p);
      if(fresh&&input.reload&&!p.reloadUntil&&!cfg.melee&&p.ammo<cfg.mag)p.reloadUntil=now+cfg.reloadSeconds*1000;
      if(input.shoot){p.view=input.view;this.shoot(p,now);}
      if(this.phase==='intermission')break;
    }
  }
  snapshot() {
    return {t:'state',serverTime:this.now(),room:{id:this.id,name:this.name,phase:this.phase,round:this.round,endsAt:this.endsAt,nextRoundAt:this.nextRoundAt,weather:this.weather,scores:{...this.scores},scoreLimit:this.rules.scoreLimit},
      players:[...this.players.values()].filter(p=>p.connected).map(p=>({id:p.id,name:p.name,team:p.team,x:p.body.x,y:p.body.y,z:p.body.z,vy:p.body.vy,onGround:p.body.onGround,yaw:p.yaw,pitch:p.pitch,hp:p.hp,maxHp:p.maxHp,robot:p.robot,dead:p.dead,respawnAt:p.respawnAt,protectedUntil:p.protectedUntil,kills:p.kills,deaths:p.deaths,points:p.points,streak:p.streak,streakPoints:p.streakPoints,robotReady:p.robotReady,ammo:p.ammo,weapon:p.weapon,reloadUntil:p.reloadUntil,seq:p.seq,loadout:p.loadout,loadoutNext:p.loadoutNext,crouch:!!p.body.crouched,slideT:p.body.slideT||0,sdx:p.body.sdx||0,sdz:p.body.sdz||0,sprinting:!!p.body.sprinting}))};
  }
}
module.exports={Room,Match:Room,loadEngine,chooseWeather,validateWorld,validateInput,rayBox,rayCylinder,raySphere,HIT};
