// Optional real-browser smoke tests. Node 22+ and a local Chromium/Chrome are
// enough; no npm dependencies, database, family files or hosting account needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const binary=[process.env.TEST_BROWSER,process.env.CHROME_BIN,'/usr/bin/chromium','/usr/bin/google-chrome','/opt/google/chrome/chrome'].find(path=>path && existsSync(path));
const base='/LexGalleri';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function fixture(){
  const requests=[];let denied=false, disconnected=false;
  const galleryId='a'.repeat(32);
  const photos=Array.from({length:60},(_,index)=>({
    id:(index+1).toString(16).padStart(32,'0'),gallery_id:galleryId,
    title:'Familie '+String(index+1).padStart(2,'0'),mime:'image/jpeg',
    place:'Syntetisk test',uploader_name:'Testkonto',uploaded:'2020-01-01T00:00:'+String(index%60).padStart(2,'0')+'Z',
    taken:'',precision:'unknown',lat:null,lon:null,favorite:false,
  }));
  const html='<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>LexGalleri browser test</title><link rel="manifest" href="'+base+'/manifest.webmanifest"><link rel="apple-touch-icon" href="'+base+'/static/apple-touch-icon.png"><link rel="stylesheet" href="'+base+'/static/style.css"><script src="'+base+'/static/app.js" defer></script><script src="'+base+'/static/pwa.js" defer></script></head><body><div id="app"></div><dialog id="modal"></dialog><div id="toast" role="status"></div></body></html>';
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');requests.push(url.pathname+url.search);
    if(disconnected){req.destroy();return;}
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(type,body,status=200)=>{res.writeHead(status,{'Content-Type':type});res.end(body);};
    const json=(body,status=200)=>send('application/json',JSON.stringify(body),status);
    if(url.pathname===base+'/'){
      res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
      send('text/html; charset=utf-8',html);return;
    }
    if(url.pathname===base+'/api/status'){json({setup:false});return;}
    if(url.pathname===base+'/api/me'){json({id:'f'.repeat(32),admin:1,name:'Testkonto'});return;}
    if(url.pathname===base+'/api/theme'){json({version:1,name:'Nordisk',colors:{background:'#f7f6f2',surface:'#ffffff',text:'#263b34',accent:'#416c57'},font:'sans',radius:16,density:'comfortable'});return;}
    if(url.pathname===base+'/api/galleries'){json([{id:galleryId,name:'Syntetisk galleri',description:'Kun genererede testdata',count:photos.length,cover:null}]);return;}
    if(url.pathname===base+'/api/galleries/'+galleryId+'/photos'){
      json(denied?{detail:'Du har ikke adgang'}:{photos,permissions:{upload:false,download:false,gps:false,video:false}},denied?403:200);return;
    }
    if(new RegExp('^'+base+'/api/photos/[a-f0-9]{32}/image$').test(url.pathname)){
      if(denied){json({detail:'Du har ikke adgang'},403);return;}
      send('image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100"><rect width="120" height="100" fill="#416c57"/></svg>');return;
    }
    const files=new Map([
      [base+'/manifest.webmanifest',['manifest.webmanifest','application/manifest+json']],
      [base+'/service-worker.js',['service-worker.js','text/javascript']],
      ...['app.js','pwa.js','style.css','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png'].map(file=>[base+'/static/'+file,['static/'+file,file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'image/png']]),
    ]);
    const file=files.get(url.pathname);
    if(file){try{send(file[1],await readFile(join(root,'public',file[0])));}catch{json({detail:'Missing test asset'},404);}return;}
    json({detail:'Ikke fundet'},404);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {origin:'http://127.0.0.1:'+server.address().port,requests,galleryId,photoId:photos[0].id,
    deny:()=>{denied=true;},disconnect:()=>{disconnected=true;},
    close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}),
  };
}

async function chrome(){
  const profile=await mkdtemp(join(tmpdir(),'lexgalleri-chromium-'));
  const child=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let diagnostics='';
  const address=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Chromium did not start: '+diagnostics.slice(-1000))),15000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Chromium exited '+code+': '+diagnostics.slice(-1000)));});
    child.stderr.on('data',chunk=>{diagnostics+=chunk.toString();const match=diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  }).catch(async error=>{child.kill('SIGKILL');await rm(profile,{recursive:true,force:true});throw error;});
  const socket=new WebSocket(address);let serial=0;const pending=new Map();
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(!data.id)return;const item=pending.get(data.id);if(!item)return;pending.delete(data.id);clearTimeout(item.timer);if(data.error)item.reject(Error(data.error.message));else item.resolve(data.result);});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'});
  const session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  const call=(method,params={})=>send(method,params,session);
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  // A headless browser cannot show Chrome's native installation prompt. Exercise
  // the explicit manual-help path while separately validating the real manifest.
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();event.stopImmediatePropagation();});"});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const wait=async(expression,label)=>{const until=Date.now()+12000;while(Date.now()<until){if(await evaluate(expression))return;await pause(50);}throw Error('Browser wait timed out: '+label);};
  return {call,evaluate,wait,close:async()=>{
    try{await send('Browser.close');}catch{}socket.close();
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Browser closed'));}pending.clear();
    if(child.exitCode===null){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),pause(3000)]);if(child.exitCode===null)child.kill('SIGKILL');}
    await rm(profile,{recursive:true,force:true});
  }};
}

test('real Chromium: photo overlay retains loaded grid and the installable app keeps private data online',{
  skip:binary?false:'Set TEST_BROWSER to a Chromium/Chrome executable for the optional browser smoke test',timeout:90000,
},async t=>{
  const site=await fixture();let browser;
  try{
    browser=await chrome();const {evaluate:run,wait,call}=browser;
    await call('Page.navigate',{url:site.origin+base+'/'});
    await wait("!!document.querySelector('[data-gallery]')",'gallery startup');
    await run("document.querySelector('[data-gallery]').click()");
    await wait("document.querySelectorAll('[data-photo]').length===60",'gallery contents');
    await run("document.querySelector('#search-photo').value='Familie';document.querySelector('#search-photo').dispatchEvent(new Event('input'));document.querySelector('#sort').value='uploaded';document.querySelector('#sort').dispatchEvent(new Event('change'))");
    await pause(250);
    await run("const opener=document.querySelectorAll('[data-photo]')[8];opener.scrollIntoView({block:'center'});opener.focus({preventScroll:true});window.__grid=document.querySelector('#photo-grid');window.__images=[...__grid.querySelectorAll('img')];window.__scroll=scrollY;opener.click()");
    await wait("document.querySelector('#modal').open",'photo overlay');
    await wait("document.querySelector('#modal img').complete",'large photo');
    const countsBefore=new Map();for(const request of site.requests.filter(path=>/\/api\/photos\/[^/]+\/image$/.test(path)))countsBefore.set(request,(countsBefore.get(request)||0)+1);
    const apiBefore=site.requests.filter(path=>path.endsWith('/photos')).length;
    await run("document.querySelector('#close-modal').click()");
    await wait("!document.querySelector('#modal').open",'close overlay');await pause(200);
    const state=await run("({sameGrid:__grid===document.querySelector('#photo-grid'),sameImages:__images.every((image,index)=>image===document.querySelectorAll('#photo-grid img')[index]),search:document.querySelector('#search-photo').value,sort:document.querySelector('#sort').value,scrollDifference:Math.abs(scrollY-__scroll)})");
    assert(state.sameGrid && state.sameImages,'closing must retain the actual thumbnail DOM nodes');
    assert.equal(state.search,'Familie');assert.equal(state.sort,'uploaded');assert(state.scrollDifference<2,'closing preserves the current scroll position');
    assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,apiBefore,'closing must not request the photo list again');
    for(const [path,count] of countsBefore)assert.equal(site.requests.filter(request=>request===path).length,count,'closing must not reload an already loaded thumbnail');
    await t.test('Escape closes the same overlay without replacing the grid',async()=>{
      await run("document.querySelectorAll('[data-photo]')[8].click()");await wait("document.querySelector('#modal').open",'second photo overlay');
      const before=site.requests.filter(path=>path.endsWith('/photos')).length;
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
      await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
      await wait("!document.querySelector('#modal').open",'Escape close');await pause(100);
      assert(await run("__grid===document.querySelector('#photo-grid')"));
      assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,before);
    });
    await t.test('installation help is independent of the photo dialog and preserves the gallery',async()=>{
      await wait("!!document.querySelector('#pwa-install')",'installation button');
      const before=site.requests.filter(path=>path.endsWith('/photos')).length;
      await run("document.querySelector('#pwa-install').click()");await wait("document.querySelector('#pwa-install-help').open",'installation help');
      assert.match(await run("document.querySelector('#pwa-install-help').textContent"),/Safari/);
      await run("document.querySelector('#pwa-install-help button').click()");await wait("!document.querySelector('#pwa-install-help').open",'installation help close');
      assert(await run("__grid===document.querySelector('#photo-grid')"));
      assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,before);
    });
    await t.test('real manifest and icons resolve under the installation directory',async()=>{
      const manifest=await call('Page.getAppManifest');assert.equal(manifest.url,site.origin+base+'/manifest.webmanifest');assert.deepEqual(manifest.errors,[]);
      const data=JSON.parse(manifest.data);assert.equal(data.display,'standalone');assert.equal(new URL(data.start_url,manifest.url).pathname,base+'/');assert.equal(new URL(data.scope,manifest.url).pathname,base+'/');
      const dimensions=await run("Promise.all(['192','512'].map(size=>new Promise((resolve,reject)=>{const icon=new Image();icon.onload=()=>resolve([icon.naturalWidth,icon.naturalHeight]);icon.onerror=reject;icon.src='"+base+"/static/icon-'+size+'.png';})))");
      assert.deepEqual(dimensions,[[192,192],[512,512]]);
    });
    await t.test('mobile viewport keeps installation controls and help within the screen',async()=>{
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
      const screen=await run("({width:innerWidth,content:document.documentElement.scrollWidth,button:{left:document.querySelector('#pwa-install').getBoundingClientRect().left,right:document.querySelector('#pwa-install').getBoundingClientRect().right}})");
      assert(screen.content<=screen.width,'the gallery must not overflow a mobile viewport horizontally');assert(screen.button.left>=0 && screen.button.right<=screen.width);
      await run("document.querySelector('#pwa-install').click()");await wait("document.querySelector('#pwa-install-help').open",'mobile installation help');
      const help=await run("({left:document.querySelector('#pwa-install-help').getBoundingClientRect().left,right:document.querySelector('#pwa-install-help').getBoundingClientRect().right,width:innerWidth})");assert(help.left>=0 && help.right<=help.width);
      await run("document.querySelector('#pwa-install-help button').click()");
    });
    await t.test('controlled requests recheck revocation and create no offline private cache',async()=>{
      await wait("!!navigator.serviceWorker.controller",'service worker control');
      const scope=await run("navigator.serviceWorker.ready.then(registration=>registration.scope)");assert.equal(scope,site.origin+base+'/');
      const path=base+'/api/photos/'+site.photoId+'/image?size=view';
      assert.equal(await run("fetch("+JSON.stringify(path)+").then(response=>response.status)"),200);site.deny();
      assert.equal(await run("fetch("+JSON.stringify(path)+").then(response=>response.status)"),403,'the worker must not replay previously authorized media');
      assert.deepEqual(await run('caches.keys()'),[],'app installation must not store private media or API replies');
      site.disconnect();
      const failures=await run("Promise.all(["+JSON.stringify(base+'/api/galleries')+","+JSON.stringify(path)+"].map(path=>fetch(path).then(()=>false,()=>true)))");assert.deepEqual(failures,[true,true],'failed API/media requests must not become an offline HTML response');
      await call('Page.navigate',{url:site.origin+base+'/?invite=PRIVATE_TEST_TOKEN'});
      await wait("document.body.textContent.includes('Ingen forbindelse.')",'generic offline navigation');
      const offline=await run("({text:document.body.textContent,retry:document.querySelector('a').getAttribute('href')})");
      assert(!offline.text.includes('PRIVATE_TEST_TOKEN'));assert(!offline.text.includes('Familie 01'));assert.equal(offline.retry,base+'/');
      assert.deepEqual(await run('caches.keys()'),[]);
    });
  }finally{if(browser)await browser.close();await site.close();}
});
