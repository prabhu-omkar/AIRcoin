import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const profile=path.resolve('.edge-city-check');
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--remote-debugging-port=9224','--no-first-run',
  '--disable-background-networking','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  `--user-data-dir=${profile}`,'http://127.0.0.1:5174/'
],{windowsHide:true,stdio:'ignore'});
let socket,send;
try{
  let page;
  for(let i=0;i<40&&!page;i++){
    try{page=(await(await fetch('http://127.0.0.1:9224/json')).json()).find(p=>p.url.startsWith('http://127.0.0.1:5174'));}catch{}
    if(!page)await delay(500);
  }
  if(!page)throw Error('Browser did not start');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});
  let id=0;const pending=new Map();
  socket.on('message',raw=>{const m=JSON.parse(raw);if(!m.id)return;const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result);}});
  send=(method,params={})=>new Promise((r,j)=>{const n=++id;const timer=setTimeout(()=>j(Error(`Timeout: ${method}`)),20000);pending.set(n,{r,j,timer});socket.send(JSON.stringify({id:n,method,params}));});
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value;};
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<40;i++){if(await evaluate('!!window.__aircoinGame?.scene?.getScene("DelhiScene")?.vehicles?.length'))break;await delay(500);}
  const result=await evaluate(`(()=>{
    const s=window.__aircoinGame.scene.getScene('DelhiScene');
    const errors=[];let maxDrift=0;
    for(let step=0;step<7200;step++){
      s.updateSignals(step*1000/60);const old=s.vehicles.map(v=>v.progress);s.updateTraffic(1000/60);
      s.vehicles.forEach((v,i)=>{const r=s.routes[v.routeIndex];const x=r.startX+(r.endX-r.startX)*v.progress,y=r.startY+(r.endY-r.startY)*v.progress;maxDrift=Math.max(maxDrift,Math.hypot(v.sprite.x-x,v.sprite.y-y));if(v.speed<0)errors.push('negative speed');if(v.progress<old[i]&&old[i]<.99)errors.push('reverse motion');if(v.progress<0||v.progress>1)errors.push('out of route');});
    }
    return {buildings:s.buildings.size,vehicles:s.vehicles.length,routes:s.routes.length,maxDrift,errors:errors.slice(0,5),frames:s.textures.get('delhi-city').getFrameNames()};
  })()`);
  console.log(JSON.stringify(result));
  if(result.errors.length||result.maxDrift>0.001)throw Error('Traffic invariant failed');
  await delay(1000);
  await fs.writeFile('preview-city-final.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate(`document.querySelectorAll('.scenario-switch button')[1].click()`);
  await delay(1800);
  console.log('CLEAN_SCENARIO='+await evaluate(`window.__aircoinGame.scene.getScene('DelhiScene').scenario`));
  console.log('PLANTS_INIT='+await evaluate(`[...window.__aircoinGame.scene.getScene('DelhiScene').plants.values()].reduce((n,p)=>n+p.length,0)`));
}finally{
  if(send)try{await send('Browser.close');}catch{}
  socket?.close();browser.kill();
}
