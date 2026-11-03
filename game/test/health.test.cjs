'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');

test('campaign regeneration and Q syringe respect damage, recharge, death and remapped lean',async()=>{
  const THREE=await import('three');const {Player}=await import('../src/actors/player.js');
  const physics={boxBlocked:()=>false,waterLevel:()=>-100,moveBody(){},raycast:()=>null,forEachInRect(){},terrainH:()=>0};let cues=0;
  const G={physics,weapons:{adsT:0,def:{move:1},cooking:null},settings:{sens:1,fov:74},audio:{footstep(){},heartbeat(){}},director:{noise(){}},fx:{splash(){}},zoneAt:()=>({indoor:true}),lights:{lightAt:()=>.2},camera:new THREE.PerspectiveCamera(),hud:{damageFrom(){},stimUsed(){cues++;}},stats:{damageTaken:0},diff:{dmgTaken:1},vm:{land(){}},time:0,onPlayerDeath(){}};
  const p=new Player(G);p.surface=()=> 'grass';p.tryMantle=()=>false;
  const tick=(dt,pressed=[],down=[])=>{G.time+=dt;p.update(dt,{mouseDX:0,mouseDY:0,down:k=>down.includes(k),pressed:k=>pressed.includes(k)});};
  tick(.01,['KeyQ']);assert.equal(p.stimReadyAt,0,'does not use a charge with full health');
  p.takeDamage(60);tick(4.4);assert.equal(p.hp,40);tick(.2);assert(p.hp>40&&p.hp<100);
  tick(.01,['KeyQ']);assert.equal(p.hp,100);assert.equal(cues,1);const ready=p.stimReadyAt;
  p.takeDamage(50);tick(.01,['KeyQ']);assert.equal(p.hp,50);assert.equal(cues,1);
  G.time=ready/1000;p.hp=50;tick(.01,['KeyQ']);assert.equal(p.hp,100);assert.equal(cues,2);
  tick(.05,[],['KeyH']);assert(p.leanT<0,'left lean remains available on H');
  p.reset(new THREE.Vector3(),0);assert.equal(p.stimReadyAt,0);p.hp=10;p.dead=true;tick(.01,['KeyQ']);assert.equal(p.hp,10);assert.equal(cues,2);
});

test('syringe model plays briefly in the viewmodel and guides the existing left hand',async()=>{
  const THREE=await import('three');const {ViewModel}=await import('../src/actors/viewmodel.js');
  const vm=new ViewModel({flash:new THREE.Texture()});vm.set('SD9');let hand;
  vm.fps={basePose:()=>null,hasPose:()=>true,setVisible(){},update(matrix,key,opts){hand=opts.leftTarget?.clone();}};
  const st={id:'SD9',adsT:0,sprintT:0,tacticalT:0,crouch:0,speed:0,onGround:true,mouseDX:0,mouseDY:0,lean:0,time:0,reload:null,swap:0,melee:0,grenade:0,scopeW:false,loaded:true};
  vm.showStim();vm.update(.1,st);assert.equal(vm.stim.visible,true);assert(hand);assert.deepEqual(hand.toArray(),vm.stim.position.toArray());
  vm.update(1,st);assert.equal(vm.stim.visible,false);
});

test('multiplayer command requests a syringe only while injured and ready',async()=>{
  const {Multiplayer}=await import('../src/multiplayer/client.js');
  const mp=Object.assign(Object.create(Multiplayer.prototype),{seq:0,weapon:'SD9',self:{hp:40,maxHp:100,stimReadyAt:0,robot:false},stimRequestedUntil:2000,now:()=>1000,G:{input:{down:()=>false,mouse:()=>false},player:{yaw:0,pitch:0}}});
  assert.equal(mp.command(true).useStim,true);assert.equal(mp.command(false).useStim,false);
  mp.self.hp=100;assert.equal(mp.command(true).useStim,false);
  mp.self.hp=40;mp.self.stimReadyAt=3000;assert.equal(mp.command(true).useStim,false);
  mp.self.stimReadyAt=0;mp.self.robot=true;assert.equal(mp.command(true).useStim,false);
});
