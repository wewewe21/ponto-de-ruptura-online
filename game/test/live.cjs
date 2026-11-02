const assert=require('node:assert/strict');
const {WebSocket}=require('ws');
const {createGameServer}=require('../server.js');
const baseRules=require('../shared/rules.json');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=6000){const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Timeout: '+label);await wait(15);}}
async function client(url,roomId,name){
  const ws=new WebSocket(url.replace(/^http/,'ws')+'/ws',{origin:url});
  const c={ws,seq:0,state:null,events:[],controls:{forward:0,right:0,yaw:0,pitch:0,shoot:false}};
  ws.on('error',()=>{});
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.t==='welcome'){c.id=m.id;c.token=m.token;c.state=m.state;}if(m.t==='state')c.state=m;if(m.t==='event')c.events.push(m.event);if(m.t==='error')c.error=m.message;});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  ws.send(JSON.stringify({t:'join',roomId,name}));await until(()=>c.id,'welcome');
  c.interval=setInterval(()=>{if(ws.readyState===WebSocket.OPEN){ws.send(JSON.stringify({t:'input',seq:++c.seq,jump:false,sprint:false,crouch:false,reload:false,activateRobot:false,...c.controls}));c.controls.activateRobot=false;c.controls.reload=false;}},34);
  c.close=()=>{clearInterval(c.interval);ws.close();};return c;
}
async function publicCheck(url){
  const health=await fetch(url+'/health');assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
  for(const file of ['/','/src/main.js','/src/multiplayer/client.js','/vendor/three/build/three.module.js','/assets/models/boss_gun.glb'])assert.equal((await fetch(url+file,{method:'HEAD'})).status,200,file);
  const response=await fetch(url+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Verificação de conexão',maxPlayers:2})});assert.equal(response.status,201);const {room}=await response.json();
  const clients=[];try{const a=await client(url,room.id,'Verificação A');clients.push(a);const b=await client(url,room.id,'Verificação B');clients.push(b);await until(()=>a.state.players.length===2&&b.state.players.length===2,'both public snapshots');
    assert.notEqual(a.state.players.find(p=>p.id===a.id).team,b.state.players.find(p=>p.id===b.id).team);
    const first=a.state.players.find(p=>p.id===a.id);a.controls.right=1;await until(()=>a.state.players.find(p=>p.id===a.id).seq>=3,'public authoritative ack');a.controls.right=0;
    assert.equal(a.state.room.weather,b.state.room.weather);await weaponCheck(a,b);assert.equal(a.error,undefined);assert.equal(b.error,undefined);console.log('LIVE_PUBLIC_OK '+url);
  }finally{clients.forEach(c=>c.close());}
}
async function weaponCheck(a,b){
  for(const id of ['MK5','KR7','VK12','P19','KNIFE','AX50','SD9']){
    a.controls.weapon=id;
    await until(()=>a.state.players.find(p=>p.id===a.id)?.weapon===id&&b.state.players.find(p=>p.id===a.id)?.weapon===id,'shared weapon '+id);
    assert.equal(a.state.players.find(p=>p.id===a.id).ammo,baseRules.weapons[id].mag);
  }
}
async function localCheck(){
  const rules=structuredClone(baseRules);rules.respawnSeconds=.06;rules.spawnProtectionSeconds=0;rules.intermissionSeconds=.1;rules.scoreLimit=30;
  const app=await createGameServer({port:0,rules});const address=await app.listen();const url='http://127.0.0.1:'+address.port;const clients=[];
  try{
    const room=app.rooms.values().next().value;
    const a=await client(url,room.id,'Operador A');clients.push(a);const b=await client(url,room.id,'Operador B');clients.push(b);
    await until(()=>a.state.room.phase==='playing'&&b.state.players.length===2,'match start');
    const p=room.players.get(a.id),q=room.players.get(b.id);assert.notEqual(p.team,q.team);await weaponCheck(a,b);
    let lane;
    for(let x=-240;x<=-155&&!lane;x+=5)for(let z=40;z<=96&&!lane;z+=5){
      const clear=(x,z)=>!room.physics.boxBlocked(x-.95,.1,z-.95,x+.95,4.8,z+.95);
      if(clear(x,z)&&clear(x,z-6)&&!room.physics.raycast(x,1.65,z,0,0,-1,6,{}))lane={x,z};
    }
    assert.ok(lane,'real map has an open firing lane');
    function place(){Object.assign(p.body,{x:lane.x,y:0,z:lane.z,vy:0,onGround:true});Object.assign(q.body,{x:lane.x,y:0,z:lane.z-6,vy:0,onGround:true});p.protectedUntil=0;q.protectedUntil=0;a.controls.yaw=0;a.controls.pitch=p.robot?Math.atan2(1-rules.robot.eye,6):0;b.controls.yaw=Math.PI;b.controls.pitch=0;}
    async function eliminate(){await until(()=>!q.dead,'victim respawn');place();const kills=p.kills;a.controls.shoot=true;await until(()=>{if(p.ammo===0&&!p.reloadUntil)a.controls.reload=true;return p.kills===kills+1;},'authoritative hitscan kill');a.controls.shoot=false;}
    const startX=p.body.x;a.controls.right=1;await until(()=>Math.abs(p.body.x-startX)>.12,'socket movement');a.controls.right=0;
    for(let i=0;i<rules.robotStreak;i++)await eliminate();
    await until(()=>a.state.players.find(x=>x.id===a.id)?.robotReady,'robot reward snapshot');assert.equal(p.streakPoints,800);
    place();a.controls.activateRobot=true;await until(()=>p.robot,'robot activation');assert.equal(p.hp,900);assert.equal(p.robotReady,false);assert.equal(p.streak,0);
    await until(()=>b.state.players.find(x=>x.id===a.id)?.robot,'remote robot snapshot');
    await eliminate();assert.equal(p.streak,0);assert.equal(p.robotReady,false);
    await until(()=>!q.dead,'attacker respawn');place();b.controls.pitch=Math.atan2(2.5-rules.human.eye,6);b.controls.shoot=true;
    await until(()=>p.hp<900,'robot takes authoritative player damage');b.controls.shoot=false;room.kill(q,p);await until(()=>a.state.players.find(x=>x.id===a.id)?.dead,'destroyed robot snapshot');
    await until(()=>!p.dead,'pilot respawn');assert.equal(p.robot,false);assert.equal(p.hp,100);assert.equal(p.streak,0);assert.equal(p.robotReady,false);
    for(let i=0;i<rules.robotStreak;i++)await eliminate();assert.equal(p.robotReady,true,'pilot can earn again after destruction');
    const previous=room.round;room.endRound();await until(()=>room.round>previous,'next round');await until(()=>a.state.room.round===room.round&&b.state.room.round===room.round,'shared round snapshots');
    assert.equal(a.state.room.weather,b.state.room.weather);assert.equal(p.kills,0);assert.equal(p.streak,0);assert.equal(p.robot,false);
    assert.ok(a.events.some(e=>e.type==='shot'&&e.hit));assert.ok(a.events.some(e=>e.type==='kill'));assert.ok(a.events.some(e=>e.type==='robot'&&e.destroyed));assert.equal(a.error,undefined);assert.equal(b.error,undefined);
    console.log('LIVE_MULTIPLAYER_OK');
  }finally{clients.forEach(c=>c.close());await app.close();}
}
(process.env.GAME_URL?publicCheck(process.env.GAME_URL.replace(/\/$/,'')):localCheck()).catch(e=>{console.error(e);process.exitCode=1;});
