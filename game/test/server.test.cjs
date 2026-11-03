'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {WebSocket}=require('ws');
const {Room,chooseWeather,validateInput}=require('../server/match.cjs');
const {createGameServer}=require('../server.js');
const baseRules=require('../shared/rules.json');
const fixture=()=>({cols:[],ramps:[],terrain:{minX:-100,minZ:-100,size:200,n:2,h:[0,0,0,0]},spawns:{alpha:[[0,0,8,0]],bravo:[[0,0,-8,Math.PI]]}});
function rules(changes={}) {return {...structuredClone(baseRules),arena:{minX:-20,maxX:20,minZ:-20,maxZ:20},...changes};}
async function harness(changes={},world=fixture()) {
  let time=100000;const r=rules(changes),room=await Room.create(world,r,{now:()=>time,random:()=>0});
  const a=room.join('Alpha'),b=room.join('Bravo');
  const h={room,a,b,advance(ms){time+=ms;return time;},tick(ms=1000/r.tickRate){time+=ms;room.tick(1/r.tickRate,time);},now:()=>time};
  h.advance(2100);return h;
}
function command(seq,extra={}){return {t:'input',seq,forward:0,right:0,yaw:0,pitch:0,...extra};}
function aim(p,v) {p.yaw=Math.atan2(-(v.body.x-p.body.x),-(v.body.z-p.body.z));p.pitch=Math.atan2(v.body.y+v.body.h*0.65-(p.body.y+(p.robot?baseRules.robot.eye:baseRules.human.eye)),Math.hypot(v.body.x-p.body.x,v.body.z-p.body.z));}
function eliminate(h,killer=h.a,victim=h.b) {
  aim(killer,victim);victim.protectedUntil=0;
  while(!victim.dead){if(killer.ammo===0){killer.reloadUntil=h.now()+1;h.tick(2);}h.advance(130);h.room.shoot(killer,h.now());}
}
test('balanced team joins, capacity, reconnect reservation and public flattened protocol',async()=>{
  const h=await harness({maxPlayers:4});const c=h.room.join('<Charlie>'),d=h.room.join('Delta');
  assert.deepEqual([h.a.team,h.b.team,c.team,d.team],['alpha','bravo','alpha','bravo']);
  assert.equal(c.name,'Charlie');assert.throws(()=>h.room.join('Fifth'),/cheia/);
  h.room.disconnect(c.id);assert.equal(h.room.join('changed',c.token).id,c.id);
  const state=h.room.snapshot();assert.equal(state.t,'state');assert.equal(state.room.phase,'playing');
  const keys=['id','name','team','x','y','z','vy','onGround','yaw','pitch','hp','maxHp','robot','robotDropAt','dead','respawnAt','protectedUntil','kills','deaths','points','streak','streakPoints','robotReady','nukeStreak','nukeReady','ammo','weapon','reloadUntil','seq','loadout','loadoutNext','crouch','slideT','sdx','sdz','sprinting','tacticalT','tacticalCooldown'].sort();
  assert.deepEqual(Object.keys(state.players[0]).sort(),keys);assert.equal(JSON.stringify(state).includes(h.a.token),false);
});
test('shared authoritative movement collides, obeys arena and acknowledges one queued command per tick',async()=>{
  const w=fixture();w.cols.push({minX:-3,maxX:3,minY:0,maxY:4,minZ:3,maxZ:4});
  const h=await harness({},w);
  for(let seq=0;seq<50;seq++){assert(h.room.enqueue(h.a,command(seq,{forward:1,sprint:true})));h.tick();}
  assert(h.a.body.z>=4+baseRules.human.radius-0.001);assert(h.a.body.z<8);
  for(let seq=50;seq<56;seq++)h.room.enqueue(h.a,command(seq,{right:1}));
  h.tick();assert.equal(h.a.seq,50);assert.equal(h.a.queue.length,5);
  h.a.body.x=19.6;h.room.enqueue(h.a,command(56,{right:1}));
  for(let i=0;i<6;i++)h.tick();assert(h.a.body.x<=20-baseRules.human.radius);
  const before=h.a.body.x;h.advance(300);h.tick();assert.equal(h.a.body.x,before);
});
test('input validation rejects forged values, bounds queues/rates and discards client authority',async()=>{
  const h=await harness();
  for(const bad of [command(0,{forward:2}),command(0,{yaw:NaN}),command(0,{pitch:5}),command(0,{seq:-1}),command(0,{shoot:1})])assert.equal(validateInput(bad),null);
  assert(h.room.enqueue(h.a,command(0,{hp:9999,x:5000,points:9999,robotReady:true,damage:9999})));
  h.tick();assert.equal(h.a.hp,100);assert.equal(h.a.robotReady,false);assert.equal(h.a.points,0);assert.equal(h.a.body.x,0);
  assert.equal(h.room.enqueue(h.a,command(0)),false);
  for(let i=1;i<=59;i++)assert(h.room.enqueue(h.a,command(i)));
  assert.equal(h.a.queue.length,6);assert.equal(h.room.enqueue(h.a,command(60)),false);
  h.advance(1000);assert(h.room.enqueue(h.a,command(61)));
});
test('authoritative hits kill, score the team and respawn after server deadline',async()=>{
  const h=await harness();eliminate(h);
  assert.equal(h.b.hp,0);assert.equal(h.b.dead,true);assert.equal(h.b.deaths,1);
  assert.equal(h.a.kills,1);assert.equal(h.a.points,100);assert.equal(h.room.scores.alpha,1);
  assert.equal(h.room.events.filter(e=>e.type==='kill').length,1);
  h.tick(2999);assert(h.b.dead);h.tick(2);assert(!h.b.dead);assert.equal(h.b.hp,100);assert(h.b.protectedUntil>h.now());
});
test('friendly fire is blocked by living teammate; spawn protection and world walls prevent damage',async()=>{
  const h=await harness();const c=h.room.join('Charlie');
  c.body.x=0;c.body.z=0;c.protectedUntil=0;h.a.yaw=0;h.a.pitch=0;
  h.room.shoot(h.a,h.now());assert.equal(c.hp,100);assert.equal(h.b.hp,100);
  c.body.x=10;h.b.protectedUntil=h.now()+500;h.advance(120);h.room.shoot(h.a,h.now());assert.equal(h.b.hp,100);
  h.b.protectedUntil=0;h.room.physics.add(-2,0,-1,2,5,1);h.advance(120);h.room.shoot(h.a,h.now());assert.equal(h.b.hp,100);
  assert.equal(h.room.scores.alpha,0);
});
test('cooldown and reload use server times and magazine limits',async()=>{
  const h=await harness();h.a.yaw=Math.PI/2;
  assert(h.room.shoot(h.a,h.now()));assert.equal(h.a.ammo,29);assert.equal(h.room.shoot(h.a,h.now()),false);
  h.advance(100);assert(h.room.shoot(h.a,h.now()));assert.equal(h.a.ammo,28);
  h.room.enqueue(h.a,command(0,{reload:true,yaw:Math.PI/2}));h.tick();assert(h.a.reloadUntil>h.now());
  h.advance(1000);assert.equal(h.room.shoot(h.a,h.now()),false);assert.equal(h.a.ammo,28);
  h.tick(1101);assert.equal(h.a.reloadUntil,0);assert.equal(h.a.ammo,30);
  h.a.ammo=0;h.advance(200);assert.equal(h.room.shoot(h.a,h.now()),false);
});
test('weapon choice is validated, ammo is kept per weapon, damage and range follow the weapon and the knife is melee-only',async()=>{
  const h=await harness();let seq=0;
  assert.equal(validateInput(command(0,{weapon:'AX50'})).weapon,'AX50');
  for(const bad of [{weapon:5},{weapon:'123456789'}])assert.equal(validateInput(command(0,bad)),null);
  const pick=(id)=>{h.room.enqueue(h.a,command(++seq,{weapon:id}));h.tick();};
  for (const invalid of ['RPL2', '__proto__', 'toString']) { pick(invalid); assert.equal(h.a.weapon,'SD9'); }
  pick('P19');assert.equal(h.a.weapon,'P19');assert.equal(h.a.ammo,17);
  assert.equal(h.room.shoot(h.a,h.now()),false);                                  // troca em andamento
  h.advance(500);assert(h.room.shoot(h.a,h.now()));assert.equal(h.a.ammo,16);
  pick('SD9');assert.equal(h.a.ammo,30);pick('P19');assert.equal(h.a.ammo,16);    // munição guardada por arma
  pick('AX50');assert.equal(h.a.weapon,'P19');   // fora do loadout: recusada
  h.a.loadout={primary:'AX50',secondary:'P19'};pick('AX50');h.advance(500);aim(h.a,h.b);h.b.protectedUntil=0;
  assert(h.room.shoot(h.a,h.now()));assert.equal(h.b.dead,true);assert.equal(h.a.ammo,4);   // sniper: um tiro mata
  assert.equal(h.room.events.filter(e=>e.type==='shot').pop().weapon,'AX50');
  const k=await harness();k.room.enqueue(k.a,command(1,{weapon:'KNIFE'}));k.tick();k.advance(500);
  aim(k.a,k.b);k.b.protectedUntil=0;assert(k.room.shoot(k.a,k.now()));assert.equal(k.b.hp,100);        // a 16 m: fora do alcance
  k.b.body.x=k.a.body.x;k.b.body.z=k.a.body.z-1.5;aim(k.a,k.b);k.advance(700);
  assert(k.room.shoot(k.a,k.now()));assert.equal(k.b.hp,40);assert.equal(k.a.ammo,0);
  k.room.enqueue(k.a,command(2,{reload:true}));k.tick();assert.equal(k.a.reloadUntil,0);              // faca não recarrega
});
test('robot reward requires infantry streak and points, consumes reward, robot kills cannot recharge, destroyed resets and can re-earn',async()=>{
  const h=await harness({robotStreak:2,robotPoints:300});
  assert.equal(h.room.activate(h.a,h.now()),false);
  for(let i=0;i<2;i++){eliminate(h);h.tick(3001);h.advance(2100);}
  assert.equal(h.a.streak,2);assert.equal(h.a.streakPoints,200);assert.equal(h.a.robotReady,false);
  eliminate(h);assert.equal(h.a.robotReady,true);
  assert(h.room.activate(h.a,h.now()));assert.equal(h.a.robot,true);assert.equal(h.a.hp,900);assert.equal(h.a.robotReady,false);assert.equal(h.a.streak,0);
  for(let i=0;i<3;i++){h.tick(3001);h.advance(2100);eliminate(h);}
  assert.equal(h.a.robotReady,false);assert.equal(h.a.streakPoints,0);
  h.tick(3001);h.advance(2100);h.a.hp=26;eliminate(h,h.b,h.a);
  assert(h.a.dead);assert.equal(h.a.streak,0);assert.equal(h.a.robotReady,false);assert(h.room.events.some(e=>e.type==='robot'&&e.destroyed));
  h.tick(3001);h.advance(2100);assert.equal(h.a.robot,false);assert.equal(h.a.hp,100);
  for(let i=0;i<3;i++){eliminate(h);h.tick(3001);h.advance(2100);}
  assert.equal(h.a.robotReady,true);assert(h.room.activate(h.a,h.now()));
});
test('death loses an unused robot reward and activation refuses insufficient headroom',async()=>{
  const h=await harness({robotStreak:1,robotPoints:100});eliminate(h);assert(h.a.robotReady);
  h.room.physics.add(-2,2,6,2,3,10);assert.equal(h.room.activate(h.a,h.now()),false);assert(h.a.robotReady);
  h.room.kill(h.b,h.a,h.now());assert.equal(h.a.robotReady,false);assert.equal(h.a.streakPoints,0);
});
test('nuke requires fifteen consecutive kills, survives robot activation, and ends the match for its caller',async()=>{
  const h=await harness({scoreLimit:100,roundSeconds:600,intermissionSeconds:2});
  assert.equal(h.room.activateNuke(h.a,h.now()),false);
  for(let i=0;i<14;i++){h.room.kill(h.a,h.b,h.now());h.room.spawn(h.b,h.now());h.advance(1000);}
  assert.equal(h.a.nukeStreak,14);assert.equal(h.a.nukeReady,false);
  assert(h.room.activate(h.a,h.now()));assert.equal(h.a.nukeStreak,14,'Colosso does not consume nuclear streak');
  h.room.kill(h.a,h.b,h.now());assert.equal(h.a.nukeStreak,15);assert(h.a.nukeReady);
  assert.equal(h.room.events.filter(e=>e.type==='kill').at(-1).nukeEarned,true);
  const snapshot=h.room.snapshot();assert.equal(snapshot.players.find(p=>p.id===h.a.id).nukeReady,true);
  assert.equal(validateInput(command(0,{activateNuke:'yes'})),null);
  assert(h.room.enqueue(h.a,command(1,{activateNuke:true})));h.tick(6000);
  assert.equal(h.room.nuke,null,'stale commands expire');
  assert(h.room.enqueue(h.a,command(2,{activateNuke:true})));h.tick();
  assert.equal(h.room.nuke.player,h.a.id);assert.equal(h.a.nukeReady,false);assert.equal(h.room.activateNuke(h.b,h.now()),false);
  const started=h.room.nuke.startedAt;h.tick(10499);assert.equal(h.room.phase,'playing');h.tick(2);
  assert.equal(h.room.phase,'intermission');assert.equal(h.room.nuke.name,'Alpha');assert.equal(h.room.nuke.startedAt,started);
  h.tick(2001);assert.equal(h.room.nuke,null);assert.equal(h.a.nukeStreak,0);assert.equal(h.a.nukeReady,false);
});
test('nuclear progress resets on death and rapid-kill awards reset after five seconds',async()=>{
  const h=await harness({scoreLimit:100});
  h.room.kill(h.a,h.b,h.now());assert.equal(h.room.events.at(-1).multi,1);h.room.spawn(h.b,h.now());
  h.advance(1000);h.room.kill(h.a,h.b,h.now());assert.equal(h.room.events.at(-1).multi,2);h.room.spawn(h.b,h.now());
  h.advance(5001);h.room.kill(h.a,h.b,h.now());assert.equal(h.room.events.at(-1).multi,1);h.room.spawn(h.b,h.now());
  h.room.kill(h.b,h.a,h.now());assert.equal(h.a.nukeStreak,0);assert.equal(h.a.multiKills,0);assert.equal(h.a.nukeReady,false);
});
test('robot activation rejects obstacles along the descent and does not consume the reward',async()=>{
  const h=await harness(),p=h.a;p.robotReady=true;
  h.room.physics.add(-2,12,6,2,14,10);assert.equal(h.room.activate(p,h.now()),false);assert.equal(p.robotReady,true);
  const open=await harness(),q=open.a;q.robotReady=true;q.body.onGround=false;
  assert.equal(open.room.activate(q,open.now()),false);assert.equal(q.robotReady,true);
});
test('robot arrival is synchronized, stationary and protected until the pilot takes control',async()=>{
  const h=await harness(),p=h.a,enemy=h.b; p.robotReady=true;
  const start=h.now(),before={x:p.body.x,y:p.body.y,z:p.body.z};assert(h.room.activate(p,start));
  assert.equal(p.robotDropAt,start);assert.equal(p.protectedUntil,start+baseRules.robot.dropDurationMs);
  assert.equal(h.room.snapshot().players.find(x=>x.id===p.id).robotDropAt,start);
  assert(h.room.enqueue(p,command(1,{forward:1,sprint:true,shoot:true,reload:true})));h.tick();
  assert.deepEqual({x:p.body.x,y:p.body.y,z:p.body.z},before);assert.equal(p.ammo,baseRules.robot.mag);assert.equal(p.reloadUntil,0);
  aim(enemy,p);h.advance(200);assert(h.room.shoot(enemy,h.now()));assert.equal(p.hp,baseRules.robot.hp);
  h.advance(baseRules.robot.dropDurationMs);assert(h.room.enqueue(p,command(2,{forward:1,shoot:true})));h.tick();
  assert.notEqual(p.body.z,before.z);assert.equal(p.ammo,baseRules.robot.mag-1);
});
test('weighted weather frequencies, score end, intermission and round reset are deterministic',async()=>{
  const r=rules(),counts={};for(let i=0;i<1000;i++){const id=chooseWeather(r,()=>i/1000);counts[id]=(counts[id]||0)+1;}
  assert.deepEqual(counts,{day_clear:600,day_cloudy:250,sunset:100,rain:50});
  const h=await harness({scoreLimit:1,roundSeconds:10,intermissionSeconds:2});eliminate(h);
  assert.equal(h.room.phase,'intermission');assert.equal(h.room.nextRoundAt,h.now()+2000);
  h.room.random=()=>0.99;
  h.tick(2001);assert.equal(h.room.round,2);assert.equal(h.room.phase,'playing');assert.equal(h.room.weather,'rain');assert.equal(h.room.scores.alpha,0);assert.equal(h.a.kills,0);
  h.tick(10001);assert.equal(h.room.phase,'intermission');h.room.disconnect(h.b.id);h.tick(2001);assert.equal(h.room.phase,'waiting');
});
test('reconnect expires and disconnected player cannot be shot',async()=>{
  const h=await harness();h.room.disconnect(h.b.id);h.a.yaw=0;h.a.pitch=0;h.room.shoot(h.a,h.now());assert.equal(h.b.hp,100);
  h.tick(15001);assert.equal(h.room.players.has(h.b.id),false);assert.notEqual(h.room.join('New',h.b.token).id,h.b.id);
});
test('new joins fill the smaller active team while reconnect keeps the reserved team',async()=>{
  const h=await harness();const c=h.room.join('Charlie');assert.equal(c.team,'alpha');
  h.room.disconnect(h.a.id);h.room.disconnect(c.id);
  const d=h.room.join('Delta');assert.equal(d.team,'alpha');
  assert.equal(h.room.join('Again',c.token).team,'alpha');
});
test('sole-player warmup moves, shoots and reloads authoritatively but scores nothing and resets spawn on round start',async()=>{
  let time=100000;
  const room=await Room.create(fixture(),rules(),{now:()=>time,random:()=>0}),p=room.join('Warmup');
  const spawnZ=p.body.z;
  assert.equal(room.phase,'waiting');
  assert(room.enqueue(p,command(0,{forward:1,shoot:true})));
  time+=1000/30;room.tick(1/30,time);
  assert(p.body.z<spawnZ);assert.equal(p.seq,0);assert.equal(p.ammo,29);
  assert.equal(room.events.some(e=>e.type==='shot'),true);assert.equal(room.events.some(e=>e.type==='kill'),false);   // atira no aquecimento, mas nada pontua
  p.robotReady=true;assert.equal(room.activate(p,time),false);assert.equal(p.robot,false);assert.equal(p.robotReady,true);
  room.kill(null,p,time);assert.equal(p.dead,false);assert.equal(p.deaths,0);assert.equal(p.points,0);assert.equal(room.scores.alpha,0);
  p.ammo=29;assert(room.enqueue(p,command(1,{reload:true})));
  time+=1000/30;room.tick(1/30,time);assert(p.reloadUntil>time);assert.equal(p.seq,1);
  time+=2200;room.tick(1/30,time);assert.equal(p.ammo,30);assert.equal(p.reloadUntil,0);
  room.join('Opponent');assert.equal(room.phase,'playing');assert.equal(p.body.z,spawnZ);assert.equal(p.robotReady,false);assert.equal(p.queue.length,0);
  room.endRound(time);const before={...p.body};assert(room.enqueue(p,command(2,{forward:1,shoot:true})));
  time+=1000/30;room.tick(1/30,time);assert.deepEqual(p.body,before);assert.equal(p.ammo,30);
});
async function appHarness(t,options={}) {
  const app=await createGameServer({port:0,host:'127.0.0.1',world:fixture(),rules:rules(),...options});
  t.after(()=>app.close());const address=await app.listen();return {app,url:`http://127.0.0.1:${address.port}`,wsurl:`ws://127.0.0.1:${address.port}/ws`};
}
function message(ws,predicate=()=>true){return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{cleanup();reject(new Error('WS message timed out'));},3000);
  const onMessage=data=>{const value=JSON.parse(data.toString());if(predicate(value)){cleanup();resolve(value);}};
  const onClose=()=>{cleanup();reject(new Error('WS closed before expected message'));};
  const cleanup=()=>{clearTimeout(timeout);ws.off('message',onMessage);ws.off('close',onClose);};ws.on('message',onMessage);ws.on('close',onClose);
});}
async function connect(url){const ws=new WebSocket(url);await once(ws,'open');return ws;}
test('real HTTP rooms and WebSockets join, synchronize, reject malformed and ignore forged health',async t=>{
  const {app,url,wsurl}=await appHarness(t);
  assert.equal((await(await fetch(`${url}/health`)).json()).status,'ok');
  const created=await fetch(`${url}/api/rooms`,{method:'POST',body:JSON.stringify({name:'Unit Room',maxPlayers:2})});assert.equal(created.status,201);
  const room=(await created.json()).room;const a=await connect(wsurl),b=await connect(wsurl);t.after(()=>{a.terminate();b.terminate();});
  let p=message(a,v=>v.t==='welcome');a.send(JSON.stringify({t:'join',roomId:room.id,name:'one'}));const welcome=await p;
  p=message(b,v=>v.t==='welcome');b.send(JSON.stringify({t:'join',roomId:room.id,name:'two'}));const other=await p;
  assert.notEqual(welcome.state.players[0].team,other.state.players.find(v=>v.id===other.id).team);
  p=message(a,v=>v.t==='state'&&v.players.length===2);const state=await p;assert.equal(state.room.phase,'playing');
  a.send(JSON.stringify(command(0,{hp:9999,robotReady:true})));p=message(a,v=>v.t==='state'&&v.players.find(p=>p.id===welcome.id).seq===0);
  const after=(await p).players.find(v=>v.id===welcome.id);assert.equal(after.hp,100);assert.equal(after.robotReady,false);
  p=message(a,v=>v.t==='error');a.send('{bad');assert.match((await p).message,/inválida/);
  const closed=once(a,'close');a.send('null');a.send('[]');assert.equal((await closed)[0],1008);
  assert.equal(app.rooms.get(room.id).players.get(welcome.id).connected,false);
});
test('nuke activation is relayed over real sockets to both players and a late joiner gets the same timeline',async t=>{
  const {app,wsurl}=await appHarness(t);const room=app.createRoom();
  const a=await connect(wsurl),b=await connect(wsurl);t.after(()=>{a.terminate();b.terminate();});
  let result=message(a,v=>v.t==='welcome');a.send(JSON.stringify({t:'join',roomId:room.id,name:'Nuclear'}));const wa=await result;
  result=message(b,v=>v.t==='welcome');b.send(JSON.stringify({t:'join',roomId:room.id,name:'Testemunha'}));const wb=await result;
  const pa=room.players.get(wa.id),pb=room.players.get(wb.id);
  for(let i=0;i<15;i++){room.kill(pa,pb);room.spawn(pb);}
  assert.equal(pa.nukeReady,true);
  const eventA=message(a,v=>v.t==='event'&&v.event.type==='nuke'),eventB=message(b,v=>v.t==='event'&&v.event.type==='nuke');
  const stateB=message(b,v=>v.t==='state'&&v.room.nuke?.player===wa.id);
  let seq=0;a.send(JSON.stringify(command(seq++,{activateNuke:true})));
  const retry=setInterval(()=>a.readyState===WebSocket.OPEN&&a.send(JSON.stringify(command(seq++,{activateNuke:true}))),100);t.after(()=>clearInterval(retry));
  const [ea,eb,state]=await Promise.all([eventA,eventB,stateB]);clearInterval(retry);
  assert.equal(ea.event.startedAt,eb.event.startedAt);assert.equal(state.room.nuke.name,'Nuclear');
  const c=await connect(wsurl);t.after(()=>c.terminate());result=message(c,v=>v.t==='welcome');
  c.send(JSON.stringify({t:'join',roomId:room.id,name:'Reforço'}));
  const rejoined=await result;assert.equal(rejoined.state.room.nuke.startedAt,ea.event.startedAt);
});
test('HTTP serves original campaign, caching, compressed source and byte ranges without production write endpoint',async t=>{
  const {url}=await appHarness(t);
  const campaign=await fetch(url);assert.equal(campaign.status,200);assert.match(await campaign.text(),/html/i);
  const source=await fetch(`${url}/src/world/physics.js`);assert.equal(source.headers.get('content-encoding'),'gzip');assert.match(await source.text(),/class Physics/);
  const cached=await fetch(`${url}/src/world/physics.js`,{headers:{'If-None-Match':source.headers.get('etag')}});assert.equal(cached.status,304);
  const range=await fetch(`${url}/src/world/physics.js`,{headers:{Range:'bytes=0-9'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,10);
  assert.equal((await fetch(`${url}/server.js`)).status,404);
  assert.equal((await fetch(`${url}/__save?path=assets/evil.txt`,{method:'POST',body:'evil'})).status,405);
  assert.equal((await fetch(`${url}/src/%00evil`)).status,403);
  const invalid=await fetch(`${url}/api/rooms`,{method:'POST',body:'{'});assert.equal(invalid.status,400);
  const tooBig=await fetch(`${url}/api/rooms`,{method:'POST',body:'a'.repeat(3000)});assert.equal(tooBig.status,413);
  const badRoom=await fetch(`${url}/api/rooms`,{method:'POST',body:JSON.stringify({maxPlayers:999})});assert.equal(badRoom.status,400);
});
test('WebSocket payload/rate bounds, invalid path and heartbeat cleanup work',async t=>{
  const {app,wsurl}=await appHarness(t,{heartbeatMs:40});
  const oversized=await connect(wsurl);let closed=once(oversized,'close');oversized.send('x'.repeat(3000));assert.equal((await closed)[0],1009);
  const spam=await connect(wsurl);closed=once(spam,'close');for(let i=0;i<70;i++)spam.send(JSON.stringify({t:'input',seq:i}));assert.equal((await closed)[0],1008);
  const silent=new WebSocket(wsurl,{autoPong:false});await once(silent,'open');closed=once(silent,'close');await closed;
  assert.equal(app.wss.clients.has(silent),false);
  const bad=new WebSocket(wsurl.replace('/ws','/bad'));bad.on('error',()=>{});const [,response]=await once(bad,'unexpected-response');assert.equal(response.statusCode,403);bad.terminate();
});
test('voice signalling is delivered only to its intended player in the same room',async t=>{
  const {app,wsurl}=await appHarness(t);const room=app.createRoom(),other=app.createRoom();
  const a=await connect(wsurl),b=await connect(wsurl),c=await connect(wsurl);
  t.after(()=>{a.terminate();b.terminate();c.terminate();});
  async function join(ws,roomId,name){const p=message(ws,v=>v.t==='welcome');ws.send(JSON.stringify({t:'join',roomId,name}));return p;}
  const one=await join(a,room.id,'one'),two=await join(b,room.id,'two'),three=await join(c,other.id,'three');
  let leaked=false;c.on('message',raw=>{try{if(JSON.parse(raw).t==='voice')leaked=true;}catch{}});
  const offer=message(b,v=>v.t==='voice');
  a.send(JSON.stringify({t:'voice',to:two.id,from:'forged',kind:'offer',side:'in',description:{type:'offer',sdp:'v=0'}}));
  assert.deepEqual(await offer,{t:'voice',from:one.id,kind:'offer',side:'in',description:{type:'offer',sdp:'v=0'}});
  a.send(JSON.stringify({t:'voice',to:three.id,kind:'offer',side:'in',description:{type:'offer',sdp:'v=0'}}));
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(leaked,false);
});
test('startup rejects an invalid manifest and room count is bounded',async t=>{
  await assert.rejects(createGameServer({world:{}}),/manifest/);
  const {app,url}=await appHarness(t,{rules:rules({maxRooms:2})});app.createRoom();assert.throws(()=>app.createRoom(),/Limite/);
  const response=await fetch(`${url}/api/rooms`);assert.equal((await response.json()).rooms.length,2);
});
test('shot events flag headshots and only confirm hits that really dealt damage',async()=>{
  const h=await harness();h.b.protectedUntil=0;
  const aimAt=(p,v,f)=>{p.yaw=Math.atan2(-(v.body.x-p.body.x),-(v.body.z-p.body.z));p.pitch=Math.atan2(v.body.y+v.body.h*f-(p.body.y+baseRules.human.eye),Math.hypot(v.body.x-p.body.x,v.body.z-p.body.z));};
  const lastShot=()=>h.room.events.filter(e=>e.type==='shot').pop();
  aimAt(h.a,h.b,0.55);assert(h.room.shoot(h.a,h.now()));assert.equal(lastShot().dealt,true);assert.equal(lastShot().head,false);
  h.advance(300);aimAt(h.a,h.b,0.95);assert(h.room.shoot(h.a,h.now()));assert.equal(lastShot().dealt,true);assert.equal(lastShot().head,true);
  h.advance(300);h.b.protectedUntil=h.now()+1000;assert(h.room.shoot(h.a,h.now()));assert.equal(lastShot().hit,h.b.id);assert.equal(lastShot().dealt,false);assert.equal(lastShot().head,false);
});
test('hit volume is a body cylinder plus head sphere (no phantom hits on empty box corners) and rewinds targets for lag compensation',async()=>{
  const h=await harness();h.b.protectedUntil=0;const a=h.a.body,b=h.b.body,eye=baseRules.human.eye;
  const place=(dx)=>{b.x=a.x+dx;b.z=a.z-10;b.y=a.y;h.a.yaw=0;h.a.pitch=Math.atan2(b.y+1.0-(a.y+eye),10);h.advance(300);};
  place(0.2);assert(h.room.shoot(h.a,h.now()));assert.equal(h.room.events.filter(e=>e.type==='shot').pop().dealt,true);   // dentro do corpo
  place(0.36);assert(h.room.shoot(h.a,h.now()));assert.equal(h.room.events.filter(e=>e.type==='shot').pop().hit,null);        // canto vazio da caixa antiga
  // compensação de lag: o alvo estava em x+0 há 200 ms e agora está 3 m ao lado
  place(0);h.b.hist=[{t:h.now()-200,x:b.x,y:b.y,z:b.z,h:b.h},{t:h.now(),x:b.x+3,y:b.y,z:b.z,h:b.h}];b.x+=3;
  h.a.view=undefined;assert(h.room.shoot(h.a,h.now()));assert.equal(h.room.events.filter(e=>e.type==='shot').pop().hit,null);
  h.advance(300);h.b.hist=[{t:h.now()-200,x:b.x-3,y:b.y,z:b.z,h:b.h},{t:h.now(),x:b.x,y:b.y,z:b.z,h:b.h}];h.a.view=h.now()-200;
  assert(h.room.shoot(h.a,h.now()));assert.equal(h.room.events.filter(e=>e.type==='shot').pop().hit,h.b.id);
});
test('crouching halves speed and lowers the body, sprint+crouch starts a decaying slide, standing or jumping cancels it, and ceilings keep you crouched',async()=>{
  const h=await harness();const b=h.a.body,{stepBody}=require('../shared/movement.js');
  const phys=h.room.physics,rules=baseRules,dt=1/30;
  const run=(input,n)=>{for(let i=0;i<n;i++)stepBody(phys,b,{forward:1,right:0,yaw:0,...input},dt,false,rules);};
  b.x=-200;b.z=80;b.y=phys.groundHeight?phys.groundHeight(b.x,b.z,5,0.2):b.y;b.vy=0;b.onGround=true;
  run({sprint:true},10);assert.equal(b.sprinting,true);const z0=b.z;
  run({sprint:true,crouch:true},1);assert(b.slideT>0&&b.slideT<=0.8);assert.equal(b.h,1.05);
  run({sprint:true,crouch:true},12);const slid=z0-b.z;assert(slid>1.5,'deslizou '+slid);   // bem mais que andar agachado
  run({crouch:true},30);assert.equal(b.slideT,0);assert.equal(b.crouched,true);
  const z1=b.z;run({crouch:true},30);assert(Math.abs((z1-b.z)-rules.human.speed*0.5)<0.2);   // agachado: metade da velocidade
  run({crouch:false},2);assert.equal(b.h,rules.human.height);assert.equal(b.crouched,false);
  run({sprint:true},10);run({sprint:true,crouch:true},2);assert(b.slideT>0);run({sprint:true,crouch:false},1);assert.equal(b.slideT,0);   // levantar cancela
});
test('tactical sprint stays active indefinitely, is replicated, and can be restarted immediately',async()=>{
  const h=await harness();const p=h.a;let seq=0;
  const send=extra=>{assert(h.room.enqueue(p,command(seq++,{forward:1,sprint:true,...extra})));h.tick();};
  send({tactical:true});assert(p.body.tacticalT>0);assert.equal(p.body.tacticalCooldown,0);
  for(let i=0;i<300;i++)send({});assert.equal(p.body.tacticalT,1);
  const state=h.room.snapshot().players.find(x=>x.id===p.id);assert(state.tacticalT>0);assert.equal(state.tacticalCooldown,0);
  send({crouch:true});assert(p.body.slideT>0);assert.equal(p.body.tacticalT,0);
  send({crouch:false,tactical:true});assert.equal(p.body.slideT,0);assert.equal(p.body.tacticalT,1);
  send({sprint:false});assert.equal(p.body.tacticalT,0);
  assert.equal(validateInput(command(seq,{tactical:'yes'})),null);
});
test('aiming at the head centre is a headshot (the body cylinder must not shadow the head sphere), standing and crouched',async()=>{
  const h=await harness();h.b.protectedUntil=0;const a=h.a.body,b=h.b.body,eye=baseRules.human.eye;
  const shootAt=(y)=>{b.x=a.x;b.z=a.z-10;b.y=a.y;h.a.yaw=0;h.a.pitch=Math.atan2(b.y+y-(a.y+eye),10);h.advance(300);assert(h.room.shoot(h.a,h.now()));const e=h.room.events.filter(e=>e.type==='shot').pop();h.b.hp=100;return e;};
  b.h=1.8;for(const y of [1.5,1.6,1.65,1.72,1.8]){const e=shootAt(y);assert.equal(e.hit,h.b.id,'hit '+y);assert.equal(e.head,true,'head '+y);}
  for(const y of [0.3,0.9,1.3]){const e=shootAt(y);assert.equal(e.hit,h.b.id,'body '+y);assert.equal(e.head,false,'body '+y);}
  b.crouched=true;b.h=1.05;h.b.hist=[];   // agachado: cabeça ~0,9
  const crouchShot=(y)=>{b.x=a.x;b.z=a.z-10;b.y=a.y;b.crouched=true;b.h=1.05;h.a.yaw=0;h.a.pitch=Math.atan2(b.y+y-(a.y+eye),10);h.advance(300);assert(h.room.shoot(h.a,h.now()));return h.room.events.filter(e=>e.type==='shot').pop();};
  assert.equal(crouchShot(0.92).head,true);assert.equal(crouchShot(0.4).head,false);
});

test('loadout: choose primary and secondary, only those and the knife are usable, new choice applies on the next spawn (instantly in warmup), headshots always do more damage',async()=>{
  const h=await harness();const room=h.room,a=h.a;
  assert.deepEqual(a.loadout,{primary:'SD9',secondary:'P19'});
  assert.deepEqual(room.sanitizeLoadout({primary:'RPL2',secondary:'hack'}),{primary:'SD9',secondary:'P19'});
  room.setLoadout(a,{primary:'MK5',secondary:'DE50'});                              // partida em andamento: só no próximo reaparecimento
  assert.equal(a.weapon,'SD9');assert.deepEqual(a.loadoutNext,{primary:'MK5',secondary:'DE50'});
  room.kill(h.b,a,h.now());h.tick(3100);h.tick(2);
  assert.equal(a.dead,false);assert.equal(a.weapon,'MK5');assert.deepEqual(a.loadout,{primary:'MK5',secondary:'DE50'});assert.equal(a.loadoutNext,null);assert.equal(a.ammo,32);
  let seq=100;const pick=(id)=>{room.enqueue(a,command(++seq,{weapon:id}));h.tick();};
  pick('SD9');assert.equal(a.weapon,'MK5');pick('DE50');assert.equal(a.weapon,'DE50');assert.equal(a.ammo,7);pick('KNIFE');assert.equal(a.weapon,'KNIFE');
  // cabeça: dano multiplicado (DE50: 62 no corpo, 124 na cabeça = um tiro só)
  const aimAt=(p,v,f)=>{p.yaw=Math.atan2(-(v.body.x-p.body.x),-(v.body.z-p.body.z));p.pitch=Math.atan2(v.body.y+v.body.h*f-(p.body.y+baseRules.human.eye),Math.hypot(v.body.x-p.body.x,v.body.z-p.body.z));};
  h.b.protectedUntil=0;h.advance(600);pick('DE50');h.advance(600);aimAt(a,h.b,0.5);assert(room.shoot(a,h.now()));assert.equal(h.b.hp,100-62);
  h.b.hp=100;h.advance(600);aimAt(a,h.b,0.96);assert(room.shoot(a,h.now()));assert.equal(h.b.dead,true);
  assert.equal(room.events.filter(e=>e.type==='kill').pop().head,true);
});
test('warmup: loadout change applies immediately without moving the player',async()=>{
  let time=100000;const room=await Room.create(fixture(),rules(),{now:()=>time,random:()=>0}),p=room.join('Solo',undefined,{primary:'AX50',secondary:'DE50'});
  assert.equal(p.weapon,'AX50');assert.equal(room.phase,'waiting');const z=p.body.z;
  room.setLoadout(p,{primary:'MK5',secondary:'P19'});assert.equal(p.weapon,'MK5');assert.equal(p.body.z,z);assert.deepEqual(p.loadout,{primary:'MK5',secondary:'P19'});
});
