'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');

test('mobile detection and analog joystick use touch capability, a dead zone and bounded axes',async()=>{
  const {isMobileTouch,stickVector}=await import('../src/core/touch-controls.js');
  const coarse={matchMedia:()=>({matches:true})},fine={matchMedia:()=>({matches:false})};
  assert(isMobileTouch({maxTouchPoints:5,userAgent:'Android'},coarse));
  assert(isMobileTouch({maxTouchPoints:5,userAgent:'iPhone'},fine));
  assert.equal(isMobileTouch({maxTouchPoints:0,userAgent:'Desktop'},fine),false);
  assert.deepEqual(stickVector(2,0,50),{right:0,forward:0,x:0,y:0});
  const v=stickVector(60,-80,50);assert(Math.abs(Math.hypot(v.right,v.forward)-1)<1e-10);assert(v.right>0&&v.forward>0);
  assert.equal(stickVector(0,-25,50).forward,.5);
});

test('touch actions remain logical with remapped keys, support simultaneous holds and release safely',async()=>{
  const original={addEventListener:global.addEventListener,document:global.document};global.addEventListener=()=>{};global.document={addEventListener(){}};
  try{
    const {Input}=await import('../src/core/input.js');const input=new Input({}, {mobile:true});
    input.setBinds({KeyW:'KeyI',Mouse0:'Mouse4'});await input.lock();assert.equal(input.locked,true);
    input.setTouchMove(.35,.7);assert.deepEqual(input.movement(),{right:.35,forward:.7});assert(input.down('KeyW'));
    input.setVirtual('Mouse0','finger1',true);input.setVirtual('Mouse0','finger2',true);assert(input.mouse(0)&&input.mousePressed(0));
    input.setVirtual('Mouse0','finger1',false);assert(input.mouse(0));input.endFrame();
    input.setVirtual('Mouse0','finger2',false);assert.equal(input.mouse(0),false);
    input.setVirtual('Mouse0','quick',true);input.setVirtual('Mouse0','quick',false);assert(input.mouse(0),'short taps persist for one frame');
    input.endFrame();assert.equal(input.mouse(0),false);input.unlock();assert.equal(input.locked,false);assert.deepEqual(input.movement(),{right:0,forward:0});
  }finally{Object.assign(global,original);}
});

test('touch controller handles joystick, aiming, fire, cancellation and rotation together',async()=>{
  const original={addEventListener:global.addEventListener,document:global.document,window:global.window};
  class Element {
    constructor(dataset={}){this.dataset=dataset;this.handlers={};this.hidden=false;this.style={};const values=new Set();this.classList={add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x),toggle:(x,on)=>on?values.add(x):values.delete(x)};}
    addEventListener(type,fn){(this.handlers[type]||= []).push(fn);}setPointerCapture(){}
    setAttribute(){}
    fire(type,data={}){for(const fn of this.handlers[type]||[])fn({pointerType:'touch',pointerId:1,clientX:50,clientY:50,preventDefault(){},...data});}
    getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
  }
  const ids=['touch-controls','touch-rotate','touch-stick','touch-stick-knob','touch-extra','touch-pause','touch-more','touch-special','touch-interact','touch-heal','touch-robot','touch-nuke','touch-hint'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const fire=new Element({action:'Mouse0'}),aim=new Element({action:'Mouse2'}),slide=new Element({action:'KeyC'}),buttons=[fire,aim,slide];
  nodes['touch-aim']=aim;
  nodes['touch-controls'].querySelectorAll=selector=>selector==='[data-action]'?buttons:selector==='.held'?buttons.filter(x=>x.classList.contains('held')):[];
  nodes['touch-extra'].querySelectorAll=()=>[];
  const canvas=new Element();global.addEventListener=()=>{};global.window={innerWidth:844,innerHeight:390,addEventListener(){}};
  global.document={getElementById:id=>nodes[id],addEventListener(){},hidden:false};
  try{
    const {Input}=await import('../src/core/input.js');const {TouchControls}=await import('../src/core/touch-controls.js');
    const input=new Input(canvas,{mobile:true});await input.lock();const G={input,state:'playing',player:{dead:false},cinematic:false};const controls=new TouchControls(G);controls.hintShown=true;controls.update();
    assert.equal(nodes['touch-controls'].hidden,false);
    nodes['touch-stick'].fire('pointerdown',{pointerId:11,clientX:50,clientY:8});assert(input.movement().forward>.9);assert(input.down('ShiftLeft'));
    aim.fire('pointerdown',{pointerId:15});aim.fire('pointerup',{pointerId:15});assert(input.mouse(2),'aim stays active after a tap');
    aim.fire('pointerdown',{pointerId:15});aim.fire('pointerup',{pointerId:15});input.endFrame();assert.equal(input.mouse(2),false);controls.update();
    fire.fire('pointerdown',{pointerId:12,clientX:700,clientY:200});assert(input.mouse(0));assert.equal(input.down('ShiftLeft'),false,'aiming/shooting ends automatic sprint');
    canvas.fire('pointerdown',{pointerId:13,clientX:400,clientY:140});canvas.fire('pointermove',{pointerId:13,clientX:410,clientY:145});assert.equal(input.mouseDX,30);assert.equal(input.mouseDY,15);
    slide.fire('pointerdown',{pointerId:14});assert(input.pressed('KeyC'));
    fire.fire('pointercancel',{pointerId:12});input.endFrame();controls.update();assert.equal(input.mouse(0),false);assert(input.down('ShiftLeft'));
    nodes['touch-stick'].fire('pointercancel',{pointerId:11});assert.deepEqual(input.movement(),{right:0,forward:0});
    window.innerWidth=390;window.innerHeight=844;controls.update();assert.equal(nodes['touch-rotate'].hidden,false);assert.equal(nodes['touch-controls'].hidden,true);assert.equal(input.down('KeyC'),false);
  }finally{Object.assign(global,original);}
});
