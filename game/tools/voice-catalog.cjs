'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const acorn = require('acorn');
const ROOT = path.join(__dirname, '..');
const SPEAKERS = new Set(['TROVÃO','FAÍSCA','ATALAIA','CORUJA','BARQUEIRO','CORVO-1','HOSTIL','ECO']);
const normalize = s => String(s).normalize('NFC').replace(/\s+/g, ' ').trim();
const key = (speaker,text) => `${normalize(speaker)}|${normalize(text)}`;
const id = (speaker,text) => createHash('sha256').update(key(speaker,text)).digest('hex').slice(0,16);
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(n => walk(n,visit)); else if (value && typeof value === 'object') walk(value,visit);
}
function strings(node) {
  if (!node) return [];
  if (node.type === 'Literal' && typeof node.value === 'string') return [node.value];
  if (node.type === 'ConditionalExpression') return [...strings(node.consequent), ...strings(node.alternate)];
  if (node.type === 'ArrayExpression') return node.elements.flatMap(strings);
  return [];
}
function catalog() {
  const lines = new Map();
  function add(speaker,text,file,line) {
    if (!SPEAKERS.has(speaker) || !text?.trim()) return;
    const k=key(speaker,text);
    if (!lines.has(k)) lines.set(k,{id:id(speaker,text),speaker,text:normalize(text),sources:[]});
    const ref=`${file}:${line}`;if(!lines.get(k).sources.includes(ref))lines.get(k).sources.push(ref);
  }
  const files=['game/mission.js','game/support.js','ai/ally.js','ai/enemy.js','ai/director.js','ai/boss.js','multiplayer/voice-lines.js'];
  for(const file of files){
    const ast=acorn.parse(fs.readFileSync(path.join(ROOT,'src',file),'utf8'),{ecmaVersion:'latest',sourceType:'module',locations:true});
    const put=(s,t,n)=>add(s,t,'src/'+file,n.loc.start.line);
    walk(ast,n=>{
      if(n.type==='ArrayExpression'){
        const [s,t]=n.elements;
        if(s?.type==='Literal')for(const speaker of strings(s).filter(s=>SPEAKERS.has(s)))for(const text of strings(t))put(speaker,text,n);
      }
      if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&['say','subtitle'].includes(n.callee.property.name)){
        if(n.arguments.length===1&&file==='ai/boss.js')for(const t of strings(n.arguments[0]))put('TROVÃO',t,n);
        for(const s of strings(n.arguments[0]).filter(s=>SPEAKERS.has(s)))for(const t of strings(n.arguments[1]))put(s,t,n);
      }
      if(n.type==='VariableDeclarator'&&['CALL','CHATTER'].includes(n.id.name)&&file==='ai/enemy.js')walk(n.init,x=>{if(x.type==='Literal'&&typeof x.value==='string')put('HOSTIL',x.value,x);});
      if(n.type==='VariableDeclarator'&&n.id.name==='LINES'&&file==='ai/ally.js')walk(n.init,x=>{if(x.type==='Property'&&SPEAKERS.has(x.key.name))for(const t of strings(x.value))put(x.key.name,t,x);});
    });
  }
  return [...lines.values()].sort((a,b)=>a.speaker.localeCompare(b.speaker)||a.id.localeCompare(b.id));
}
module.exports={catalog,normalize,key,id};
if(require.main===module){const lines=catalog();console.log(JSON.stringify({count:lines.length,speakers:lines.reduce((o,l)=>(o[l.speaker]=(o[l.speaker]||0)+1,o),{})},null,2));}
