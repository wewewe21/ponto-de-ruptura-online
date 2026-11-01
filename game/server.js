'use strict';
const {createGameServer} = require('./server/http.cjs');
if(require.main===module){
  createGameServer().then(async app=>{
    const address=await app.listen();console.log(`Ponto de Ruptura em http://localhost:${address.port}`);
    let stopping=false;
    const stop=()=>{if(stopping)return;stopping=true;const timeout=setTimeout(()=>process.exit(1),10000);timeout.unref();app.close().then(()=>process.exit(0));};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
  }).catch(error=>{console.error('Falha ao iniciar servidor:',error.message);process.exitCode=1;});
}
module.exports={createGameServer};
