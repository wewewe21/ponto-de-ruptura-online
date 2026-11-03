'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

test('microphone requires explicit activation and stops if the room is left during permission prompt',async()=>{
  const {VoiceChat}=await import('../src/multiplayer/voice-chat.js');
  const old={navigator:global.navigator,window:global.window,document:global.document};
  let resolve,stopped=0,calls=0;
  Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(){calls++;return new Promise(r=>resolve=r);}}}});
  global.window={RTCPeerConnection:function(){}};global.document={getElementById(){return null;}};
  try{
    const mp={connected:true,players:[],socket:null},voice=new VoiceChat(mp);
    assert.equal(calls,0);const promise=voice.enable();assert.equal(calls,1);
    mp.connected=false;voice.close();resolve({getTracks:()=>[{stop(){stopped++;}}]});
    assert.equal(await promise,false);assert.equal(stopped,1);assert.equal(voice.stream,null);
  }finally{Object.defineProperty(global,'navigator',{configurable:true,value:old.navigator});global.window=old.window;global.document=old.document;}
});

test('sniper reload returns smoothly to the resting pose while cycling the bolt',async()=>{
  const THREE=await import('three');const {reloadPose,makeReloadState}=await import('../src/actors/reloadanim.js');
  const gun={leftHome:new THREE.Vector3(0,0,0),extra:{boltPivot:new THREE.Vector3(0,0,0),boltBall:new THREE.Vector3(.1,.1,.1)},magHand:()=>new THREE.Vector3(.2,-.1,.1)};
  const r=makeReloadState();let previous=null,maxStep=0,maxLift=0,maxBack=0;
  for(let i=0;i<=1000;i++){reloadPose('AX50',i/1000,true,gun,r);if(previous)maxStep=Math.max(maxStep,r.L.distanceTo(previous));previous=r.L.clone();maxLift=Math.max(maxLift,r.lift);maxBack=Math.max(maxBack,r.back);}
  assert(maxStep<.015);assert(maxLift>.99);assert(maxBack>.99);assert(r.L.length()<1e-8);assert.equal(r.lift,0);assert.equal(r.back,0);
});

test('looping skeletal clips keep continuity and remain in range after a delayed frame',async()=>{
  const THREE=await import('three');const {BossAnimator}=await import('../src/actors/bossanim.js');
  const anim=Object.create(BossAnimator.prototype);anim.srcQ2=Array.from({length:30},()=>new THREE.Quaternion());
  const frames=30,rot=new Float32Array(frames*120),root=new Float32Array(frames*3);
  for(let i=0;i<frames;i++){const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),i/frames);for(let j=0;j<30;j++){const k=i*120+j*4;rot[k]=q.x;rot[k+1]=q.y;rot[k+2]=q.z;rot[k+3]=q.w;}}
  const clip={name:'walk',dur:1,fps:30,frames,rot,root,noXZ:true};
  const out=Array.from({length:30},()=>new THREE.Quaternion());
  const st={clip,t:.999999,speed:1,loop:true};anim._sample(st,out);const before=out[0].clone();
  anim._advance(st,.000001,false);anim._sample(st,out);assert(before.angleTo(out[0])<.001);
  anim._advance(st,4.5,false);assert(st.t>=0&&st.t<clip.dur);
});
