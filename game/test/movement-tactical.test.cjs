'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../shared/rules.json');

test('double tap respects the time window and must be repeated for another activation',async()=>{
  const {SprintTap}=await import('../shared/tactical.js');const tap=new SprintTap();
  assert.equal(tap.update(.016,true),false);assert.equal(tap.update(.2,false),false);assert.equal(tap.update(.016,true),true);
  assert.equal(tap.update(.016,true),false);assert.equal(tap.update(.5,false),false);assert.equal(tap.update(.016,true),false);
});

test('shared movement keeps tactical sprint indefinitely, with no cooldown and unchanged slide and robot restrictions',async()=>{
  const {stepBody}=await import('../shared/movement.js');
  const physics={boxBlocked:()=>false,moveBody(b,dx,dz){b.x+=dx;b.z+=dz;}};
  const make=()=>({x:-200,y:0,z:60,vy:0,onGround:true});
  const normal=make(),fast=make();const inp={forward:1,right:0,yaw:0,sprint:true};
  stepBody(physics,normal,inp,.1,false,rules);stepBody(physics,fast,{...inp,tactical:true},.1,false,rules);
  assert(fast.tacticalT>0);assert(fast.z<normal.z);assert(Math.abs(normal.z-fast.z-.22)<1e-8);
  for(let i=0;i<300;i++)stepBody(physics,fast,inp,.1,false,rules);
  assert.equal(fast.tacticalT,1,'still tactical after 30 seconds');assert.equal(fast.tacticalCooldown,0);
  stepBody(physics,fast,{...inp,crouch:true},.1,false,rules);assert(fast.slideT>0);assert.equal(fast.tacticalT,0);
  stepBody(physics,fast,{...inp,crouch:false,tactical:true},.1,false,rules);assert.equal(fast.slideT,0);assert.equal(fast.tacticalT,1,'can reactivate without waiting');
  stepBody(physics,fast,{...inp,sprint:false},.1,false,rules);assert.equal(fast.tacticalT,0,'releasing sprint ends it');
  const robot=make();stepBody(physics,robot,{...inp,tactical:true},.1,true,rules);assert.equal(robot.tacticalT,0);
  const delayed=make();stepBody(physics,delayed,{...inp,crouch:true},.1,false,rules);assert(delayed.slideT>0,'slide works when a prior sprint packet was delayed');
});

test('campaign slide cancels with crouch or jump and tactical sprint raises the weapon state',async()=>{
  const THREE=await import('three');const {Player}=await import('../src/actors/player.js');
  const physics={boxBlocked:()=>false,waterLevel:()=>-100,moveBody(b,dx,dz){b.x+=dx;b.z+=dz;},raycast:()=>null,forEachInRect(){},terrainH:()=>0};
  const G={physics,weapons:{adsT:0,def:{move:1},cooking:null},settings:{sens:1,fov:74},audio:{footstep(){},heartbeat(){}},director:{noise(){}},fx:{splash(){}},zoneAt:()=>({indoor:true}),lights:{lightAt:()=>.2},camera:new THREE.PerspectiveCamera(),hud:{damageFrom(){}},stats:{damageTaken:0},diff:{dmgTaken:1},vm:{land(){}},time:0};
  const p=new Player(G);p.surface=()=> 'grass';p.tryMantle=()=>false;
  const tick=(down,pressed=[])=>{G.time+=.05;p.update(.05,{mouseDX:0,mouseDY:0,down:k=>down.includes(k),pressed:k=>pressed.includes(k)});};
  tick(['KeyW','ShiftLeft'],['ShiftLeft']);tick(['KeyW']);tick(['KeyW','ShiftLeft'],['ShiftLeft']);assert(p.tactical);assert(p.tacticalPose>0);
  tick(['KeyW','ShiftLeft'],['KeyC']);assert(p.slide>0);assert.equal(p.stance,'crouch');
  tick(['KeyW','ShiftLeft'],['KeyC']);assert.equal(p.slide,0);assert.equal(p.stance,'stand');
  tick(['KeyW','ShiftLeft'],['KeyC']);assert(p.slide>0);tick(['KeyW','ShiftLeft'],['Space']);assert.equal(p.slide,0);assert.equal(p.stance,'stand');assert.equal(p.body.onGround,false);
});

test('remote soldiers receive the replicated tactical and slide states for their animation',async()=>{
  const THREE=await import('three');const {RemoteAvatars}=await import('../src/multiplayer/avatars.js');let observed;
  const model={setPose(){},animate(dt,speed,crouch,time,motion){observed=motion;}};
  const player={id:'other',yaw:0,pitch:0,crouch:true,slideT:.6,tacticalT:0};
  const avatar={model,robot:false,dead:false,player,pos:new THREE.Vector3(),target:new THREE.Vector3(),yaw:0,
    label:{position:new THREE.Vector3(),scale:new THREE.Vector3(),userData:{base:[1,1]},material:{}}};
  const manager=Object.assign(Object.create(RemoteAvatars.prototype),{G:{camera:{position:new THREE.Vector3()},physics:{los:()=>true}},players:[],avatars:new Map([['other',avatar]]),corpses:[],time:0,disposed:false});
  manager.update(.016);assert.deepEqual(observed,{sliding:true,tactical:false});
  player.slideT=0;player.tacticalT=1;manager.update(.016);assert.deepEqual(observed,{sliding:false,tactical:true});
});
