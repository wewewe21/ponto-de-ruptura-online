'use strict';
const test=require('node:test');const assert=require('node:assert/strict');

test('medals display each rapid-kill tier and play different cues without voices',async()=>{
  const {Medals}=await import('../src/game/medals.js');
  const old=global.document,children={strong:{},small:{},'.medal-icons':{}};
  const el={hidden:true,offsetWidth:20,querySelector:q=>children[q],classList:{toggle(){},remove(){},add(){}}};
  global.document={getElementById:()=>el};let now=10000;const cues=[];
  const medals=new Medals({medal:(...args)=>cues.push(args)},()=>now);
  try {
    for(const title of ['ABATE','DOUBLE KILL','TRIPLE KILL','QUADRUPLE KILL','MULTIPLE KILL']){medals.kill();assert.equal(children.strong.textContent,title);now+=1000;}
    assert.deepEqual(cues.map(c=>c[0]),[1,2,3,4,5]);
    now+=5001;medals.kill();assert.equal(children.strong.textContent,'ABATE');
    medals.nuke();assert.equal(children.strong.textContent,'NUKE');assert.deepEqual(cues.at(-1),[1,true]);
    medals.reset();assert.equal(el.hidden,true);
  } finally {medals.reset();global.document=old;}
});

test('nuke sequence is synchronized for pilot, spectators and reconnects and clears after the match',async()=>{
  const {NukeCinematic}=await import('../src/multiplayer/nuke-cinematic.js');
  const old=global.document,code={};const el={hidden:true,dataset:{},querySelector:()=>code};global.document={getElementById:()=>el};
  const sounds=[],cin=new NukeCinematic({audio:{medal:()=>sounds.push('medal'),sfx:s=>sounds.push(s)}});
  const nuke={player:'pilot',startedAt:1000};
  try {
    cin.update(nuke,'playing','pilot',1000);assert.equal(el.dataset.stage,'phone');assert.equal(code.textContent,'___');
    cin.update(nuke,'playing','pilot',1800);assert.equal(code.textContent,'1__');
    cin.update(nuke,'playing','pilot',2300);assert.equal(code.textContent,'11_');
    cin.update(nuke,'playing','pilot',2900);assert.equal(code.textContent,'113');
    cin.update(nuke,'playing','other',3000);assert.equal(el.dataset.stage,'alert');
    cin.update(nuke,'playing','other',4000);assert.equal(el.dataset.stage,'missile');
    cin.update(nuke,'playing','other',8000);assert.equal(el.dataset.stage,'blast');assert.ok(sounds.includes('boom_big'));
    cin.update(nuke,'intermission','other',11500);assert.equal(el.hidden,true);
  } finally {global.document=old;}
});

test('online kill event shows medals without playing a voice line',async()=>{
  const {Multiplayer}=await import('../src/multiplayer/client.js');const calls=[];
  const mp=Object.assign(Object.create(Multiplayer.prototype),{active:true,id:'self',feed:[],now:()=>123,G:{medals:{kill:n=>calls.push(['medal',n])}},markHit:k=>calls.push(['hit',k]),speakMatch:()=>calls.push(['voice'])});
  mp.event({type:'kill',killer:'self',name:'Alpha',victimName:'Bravo',multi:3});
  assert.deepEqual(calls,[['hit',true],['medal',3]]);
});
