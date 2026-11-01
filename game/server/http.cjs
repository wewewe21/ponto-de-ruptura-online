'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream');
const { WebSocketServer, WebSocket } = require('ws');
const { Room, loadEngine, validateWorld } = require('./match.cjs');
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.fbx':'application/octet-stream','.bin':'application/octet-stream','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.webp':'image/webp','.ktx2':'application/octet-stream','.ico':'image/x-icon','.woff2':'font/woff2'};
function json(res,status,value) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function readJSON(req) {
  return new Promise((resolve,reject)=>{
    let size=0,body='';
    req.on('data',chunk=>{size+=chunk.length;if(size>2048){reject(Object.assign(new Error('Corpo muito grande'),{status:413}));req.resume();}else body+=chunk;});
    req.on('end',()=>{try{resolve(JSON.parse(body));}catch{reject(Object.assign(new Error('JSON inválido'),{status:400}));}});
    req.on('error',reject);
  });
}
async function serveStatic(req,res,pathname,root) {
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  let rel;
  try{rel=decodeURIComponent(pathname);}catch{res.writeHead(400);res.end();return;}
  if(rel.includes('\0')||rel.includes('\\')||rel.split('/').some(p=>p.startsWith('.')||p==='..')){res.writeHead(403);res.end();return;}
  rel=rel==='/'?'index.html':rel.replace(/^\//,'');
  if(!/^(?:(?:index\.html|modelview\.html|ui\.css|favicon\.ico)$|(?:assets|src|shared|vendor|tools)\/)/.test(rel)){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  let stat;
  try { const actual=await fsp.realpath(file);if(!actual.startsWith(root+path.sep))throw new Error('outside');stat=await fsp.stat(actual);if(!stat.isFile())throw new Error('not file'); }
  catch{res.writeHead(404);res.end();return;}
  const ext=path.extname(file).toLowerCase(), etag=`W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const headers={'Content-Type':TYPES[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','ETag':etag,'Last-Modified':stat.mtime.toUTCString(),
    'Cache-Control':ext==='.html'||rel.startsWith('src/')||rel.startsWith('shared/')?'no-cache':'public, max-age=86400', 'Accept-Ranges':'bytes'};
  if(/\.(html|js|css|json|svg|gltf)$/.test(ext))headers.Vary='Accept-Encoding';
  if(req.headers['if-none-match']===etag){res.writeHead(304,headers);res.end();return;}
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){
    const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
    if(!m[1])start=Math.max(0,stat.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Number(m[2]);}
    end=Math.min(end,stat.size-1);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  }
  const encoding=(req.headers['accept-encoding']||'').split(',').some(v=>/^\s*gzip\s*(?:;\s*q\s*=\s*(?:1(?:\.0*)?|0\.[0-9]*[1-9][0-9]*))?\s*$/i.test(v));
  const compress=status===200&&stat.size>1024&&/\.(html|js|css|json|svg|gltf)$/.test(ext)&&encoding;
  if(compress){headers['Content-Encoding']='gzip';headers.Vary='Accept-Encoding';}else headers['Content-Length']=Math.max(0,end-start+1);
  res.writeHead(status,headers);
  if(req.method==='HEAD'||!stat.size){res.end();return;}
  const stream=fs.createReadStream(file,{start,end});
  const finish=error=>{if(error&&!res.destroyed)res.destroy(error);};
  if(compress)pipeline(stream,zlib.createGzip({level:4}),res,finish);else pipeline(stream,res,finish);
}
async function createGameServer(options={}) {
  const root=await fsp.realpath(options.root||path.join(__dirname,'..'));
  const rules=options.rules||JSON.parse(await fsp.readFile(path.join(__dirname,'../shared/rules.json'),'utf8'));
  const world=validateWorld(options.world||JSON.parse(await fsp.readFile(path.join(__dirname,'../shared/arena-world.json'),'utf8')));
  const engine=await loadEngine(),rooms=new Map(),now=options.now||Date.now,random=options.random||Math.random;
  const httpLimits=new Map();
  function limited(address) {
    let r=httpLimits.get(address);const time=now();
    if(!r||time-r.start>=60000){r={start:time,count:0};httpLimits.set(address,r);}
    return ++r.count>20;
  }
  let wss;
  const send=(ws,value)=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>256*1024){ws.close(1013,'Conexão lenta');return;}ws.send(JSON.stringify(value));}};
  function createRoom(settings={}) {
    if(rooms.size>=rules.maxRooms)throw new Error('Limite de salas atingido');
    const maxPlayers=settings.maxPlayers===undefined?rules.maxPlayers:settings.maxPlayers;
    if(!Number.isInteger(maxPlayers)||maxPlayers<2||maxPlayers>rules.maxPlayers)throw new Error(`maxPlayers deve estar entre 2 e ${rules.maxPlayers}`);
    if(settings.name!==undefined&&typeof settings.name!=='string')throw new Error('Nome inválido');
    const name=(settings.name||'Subestação').replace(/[\x00-\x1f\x7f<>]/g,'').trim().slice(0,40)||'Subestação';
    const room=new Room(world,rules,engine,{name,maxPlayers,now,random,onEvent:event=>{
      if(wss)for(const ws of wss.clients)if(ws.room===room)send(ws,{t:'event',event});
    }});
    rooms.set(room.id,room);return room;
  }
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'&&req.method==='GET'){json(res,200,{status:'ok',rooms:rooms.size,players:[...rooms.values()].reduce((n,r)=>n+r.connectedCount(),0)});return;}
      if(url.pathname==='/api/rooms'){
        if(req.method==='GET'){json(res,200,{rooms:[...rooms.values()].map(r=>r.summary())});return;}
        if(req.method==='POST'){
          if(limited(req.socket.remoteAddress)){json(res,429,{error:'Muitas salas criadas; tente mais tarde'});req.resume();return;}
          const body=await readJSON(req);
          if(!body||typeof body!=='object'||Array.isArray(body)){json(res,400,{error:'Dados inválidos'});return;}
          try{json(res,201,{room:createRoom(body).summary()});}catch(error){json(res,400,{error:error.message});}return;
        }
        res.writeHead(405,{Allow:'GET, POST'});res.end();return;
      }
      await serveStatic(req,res,url.pathname,root);
    }catch(error){if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Erro interno'});else res.destroy();}
  });
  server.requestTimeout=10000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
  wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head)=>{
    let ok=false;
    try{const url=new URL(req.url,'http://localhost');ok=url.pathname==='/ws'&&wss.clients.size<rules.maxRooms*rules.maxPlayers+20;
      if(req.headers.origin){const origin=new URL(req.headers.origin);ok=ok&&origin.host===req.headers.host;}
    }catch{}
    if(!ok){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',ws=>{
    ws.alive=true;ws.messageStart=now();ws.messages=0;ws.badMessages=0;
    const joinTimeout=setTimeout(()=>{if(!ws.player)ws.close(1008,'Entre em uma sala');},10000);joinTimeout.unref();
    ws.on('pong',()=>{ws.alive=true;});ws.on('error',()=>{});
    ws.on('message',(data,isBinary)=>{
      if(now()-ws.messageStart>=1000){ws.messageStart=now();ws.messages=0;}
      if(++ws.messages>65){ws.close(1008,'Limite de mensagens');return;}
      let value;
      try{if(isBinary)throw new Error();value=JSON.parse(data.toString());if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();}
      catch{send(ws,{t:'error',message:'Mensagem inválida'});if(++ws.badMessages>=3)ws.close(1008,'Mensagens inválidas');return;}
      if(value.t==='join'&&!ws.player){
        if(typeof value.roomId!=='string'||typeof value.name!=='string'||(value.token!==undefined&&typeof value.token!=='string')){send(ws,{t:'error',message:'Entrada inválida'});return;}
        const room=rooms.get(value.roomId);
        if(!room){send(ws,{t:'error',message:'Sala não encontrada'});return;}
        try{const p=room.join(value.name,value.token);ws.room=room;ws.player=p;clearTimeout(joinTimeout);send(ws,{t:'welcome',id:p.id,token:p.token,state:room.snapshot()});}
        catch(error){send(ws,{t:'error',message:error.message});}return;
      }
      if(value.t==='input'&&ws.player){if(!ws.room.enqueue(ws.player,value))send(ws,{t:'error',message:'Comando inválido ou fora de ordem'});return;}
      send(ws,{t:'error',message:'Comando desconhecido'});if(++ws.badMessages>=3)ws.close(1008,'Comandos inválidos');
    });
    ws.on('close',()=>{clearTimeout(joinTimeout);if(ws.room&&ws.player)ws.room.disconnect(ws.player.id);});
  });
  createRoom({name:'Subestação • Brasil'});
  const tickMs=1000/rules.tickRate;let previous=performance.now(),accumulator=0,snapshotAccum=0;
  const simulation=setInterval(()=>{
    const current=performance.now();accumulator+=Math.min(current-previous,5*tickMs);previous=current;
    let steps=0;
    while(accumulator>=tickMs&&steps++<5){for(const room of rooms.values())room.tick(1/rules.tickRate,now());accumulator-=tickMs;snapshotAccum+=tickMs;}
    if(snapshotAccum>=1000/rules.snapshotRate){snapshotAccum%=1000/rules.snapshotRate;for(const room of rooms.values()){
      const state=room.snapshot();for(const ws of wss.clients)if(ws.room===room)send(ws,state);
    }}
  },Math.max(5,Math.floor(tickMs/2)));simulation.unref();
  const housekeeping=setInterval(()=>{
    for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}
    for(const [id,room] of rooms)if(rooms.size>1&&!room.connectedCount()&&now()-room.lastActive>300000)rooms.delete(id);
    for(const [ip,r] of httpLimits)if(now()-r.start>60000)httpLimits.delete(ip);
  },options.heartbeatMs||15000);housekeeping.unref();
  let closing;
  function close(){return closing||=(async()=>{
    clearInterval(simulation);clearInterval(housekeeping);for(const ws of wss.clients)ws.terminate();
    await new Promise(resolve=>wss.close(resolve));
    if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  })();}
  async function listen(port=options.port??Number(process.env.PORT||8080),host=options.host||'0.0.0.0') {
    await new Promise((resolve,reject)=>{const onError=e=>{server.off('listening',onListen);reject(e);};const onListen=()=>{server.off('error',onError);resolve();};server.once('error',onError);server.once('listening',onListen);server.listen(port,host);});return server.address();
  }
  return {server,wss,rooms,rules,world,createRoom,listen,close};
}
module.exports={createGameServer,serveStatic};
