const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Room}=require('../server/match.cjs');
const rules=require('../shared/rules.json');
const world=require('../shared/arena-world.json');
const root=path.join(__dirname,'..','..');

test('real substation manifest has clear infantry and robot spawns on both teams',async()=>{
  const room=await Room.create(world,rules);
  assert.ok(world.cols.length>50);
  for(const team of ['alpha','bravo'])for(const[x,y,z]of world.spawns[team]){
    assert.ok(x>rules.arena.minX&&x<rules.arena.maxX&&z>rules.arena.minZ&&z<rules.arena.maxZ);
    assert.equal(room.physics.boxBlocked(x-.9,y+.1,z-.9,x+.9,y+4.8,z+.9),false,`${team} spawn obstructed at ${x},${z}`);
  }
});

test('client prediction reconciles acknowledged movement and drops commands at death/intermission',async()=>{
  const {Multiplayer}=await import('../src/multiplayer/client.js');
  const {Physics}=await import('../src/world/physics.js');
  const THREE=await import('three');
  const nodes=new Map();const oldDocument=global.document;
  global.document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{},style:{}});return nodes.get(id);}};
  try{
    const physics=new Physics();physics.add(-260,-1,20,-140,0,115);
    const mp=Object.assign(Object.create(Multiplayer.prototype),{id:'self',rules,pending:[],seq:0,firstSnapshot:true,renderPos:new THREE.Vector3(),G:{physics,player:{body:{},pos:new THREE.Vector3()},weather:{setMatchWeather(){}}},updateScoreboard(){},toast(){}});
    const player={id:'self',x:-230,y:0,z:90,vy:0,onGround:true,yaw:0,pitch:0,hp:100,robot:false,dead:false,seq:0};
    const room={round:1,weather:'day_clear',phase:'playing'};
    mp.snapshot({room,players:[player]});
    mp.pending=[{seq:1,forward:1,right:0,yaw:0},{seq:2,forward:1,right:0,yaw:0}];
    mp.snapshot({room,players:[{...player,seq:1,z:89.86}]});
    assert.equal(mp.pending.length,1);assert.ok(Math.abs(mp.G.player.body.z-89.72)<1e-7);
    mp.snapshot({room:{...room,phase:'intermission'},players:[{...player,seq:1,z:89.86}]});
    assert.equal(mp.pending.length,0);assert.equal(mp.G.player.body.z,89.86);
    mp.pending=[{seq:3,forward:1,right:0,yaw:0}];
    mp.snapshot({room,players:[{...player,dead:true}]});assert.equal(mp.pending.length,0);
  }finally{global.document=oldDocument;}
});

test('old socket callbacks cannot corrupt the new connection or resurrect a departed session',async()=>{
  const {Multiplayer}=await import('../src/multiplayer/client.js');
  const original={WebSocket:global.WebSocket,location:global.location,document:global.document};
  const sockets=[];const nodes=new Map();
  class FakeSocket{static OPEN=1;constructor(){this.readyState=1;sockets.push(this);}send(){}close(){this.readyState=3;}}
  global.WebSocket=FakeSocket;global.location={protocol:'http:',host:'localhost:8080'};
  global.document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{}});return nodes.get(id);}};
  const mp=Object.assign(Object.create(Multiplayer.prototype),{roomId:'room',name:'player',intentionalClose:false,active:true,notice(){},snapshot(){},retries:0,pending:[]});
  try{
    mp.connect();const old=sockets[0];old.onopen();
    mp.connect();const current=sockets[1];current.onopen();
    current.onmessage({data:JSON.stringify({t:'welcome',id:'new-player',token:'new-token',state:{}})});
    old.onclose();assert.equal(mp.connected,true);assert.equal(mp.id,'new-player');
    old.onmessage({data:JSON.stringify({t:'welcome',id:'old-player',token:'old-token',state:{}})});
    assert.equal(mp.id,'new-player');assert.equal(mp.token,'new-token');
    mp.intentionalClose=true;current.onmessage({data:JSON.stringify({t:'welcome',id:'resurrected',state:{}})});assert.equal(mp.id,'new-player');
    current.onclose();
  }finally{clearTimeout(mp.reconnectTimer);for(const s of sockets)s.onclose?.();Object.assign(global,original);}
});

test('audio init keeps effect method callable and routes effect nodes to a separate gain bus',async()=>{
  const {GameAudio}=await import('../src/core/audio.js');
  const old={window:global.window,fetch:global.fetch};
  const node=()=>{const n={connect(target){assert.equal(typeof target,'object');return target;},disconnect(){}};for(const k of ['gain','threshold','ratio','attack','release','frequency','Q'])n[k]={value:0,setTargetAtTime(){}};return n;};
  class AudioContext{constructor(){this.sampleRate=100;this.currentTime=0;this.destination=node();}createGain(){return node();}createDynamicsCompressor(){return node();}createBiquadFilter(){return node();}createConvolver(){return node();}createBuffer(c,n){return{getChannelData(){return new Float32Array(n);}};}}
  global.window={AudioContext};global.fetch=async()=>({json:async()=>({})});
  try{const a=new GameAudio();a._startAmbience=()=>{};a._startMusic=()=>{};a._onBank=()=>{};a.init();assert.equal(typeof a.sfx,'function');assert.equal(typeof a.sfxBus.connect,'function');assert.equal(a.sfx('boss_death'),false);}
  finally{Object.assign(global,old);}
});

test('leaving a robot session restores campaign ally visibility and infantry collision dimensions',async()=>{
  const {Multiplayer}=await import('../src/multiplayer/client.js');
  const original={document:global.document,location:global.location,history:global.history};
  const nodes=new Map();global.document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,{hidden:false});return nodes.get(id);}};
  global.location={href:'http://localhost:8080/?sala=test'};global.history={replaceState(){}};
  const ally={model:{root:{visible:false},gun:{visible:false}}};
  const uniforms=Object.fromEntries(['uFade','uDamage','uNVG'].map(k=>[k,{value:1}]));
  const mp=Object.assign(Object.create(Multiplayer.prototype),{G:{player:{body:{r:.9,h:4.8,step:.6},zone:{name:'gallery'}},input:{unlock(){}},weather:{clearMatchWeather(){}},weapons:{reset(){}},vm:{set(){}},hud:{show(){}},post:{uniforms}},allyVisibility:[{ally,root:true,gun:true}],pending:[],openLobby(){}});
  try{mp.leave();assert.equal(ally.model.root.visible,true);assert.equal(ally.model.gun.visible,true);assert.deepEqual(mp.G.player.body,{r:.32,h:1.8,step:.5});assert.equal(mp.G.player.zone,null);assert.equal(mp.G.state,'title');assert.equal(mp.socket,null);}
  finally{Object.assign(global,original);}
});

test('all shipped audio manifest and UI image assets exist for deployment',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'game/assets/audio/manifest.json')));
  for(const group of Object.values(manifest))for(const file of group.files)assert.ok(fs.existsSync(path.join(root,'game',file)),file);
  const source=fs.readFileSync(path.join(root,'game/index.html'),'utf8')+'\n'+fs.readFileSync(path.join(root,'game/ui.css'),'utf8');
  for(const match of source.matchAll(/(?:\.\/)?assets\/[\w./-]+\.(?:jpg|png|webp)/g))assert.ok(fs.existsSync(path.join(root,'game',match[0])),match[0]);
  for(const file of ['vendor/three/build/three.module.js','vendor/three/addons/loaders/GLTFLoader.js','vendor/three/addons/utils/SkeletonUtils.js'])assert.ok(fs.existsSync(path.join(root,'game',file)),file);
});
