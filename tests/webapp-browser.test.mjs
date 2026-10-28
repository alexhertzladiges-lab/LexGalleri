// Optional real-browser smoke tests. Node 22+ and a local Chromium/Chrome are
// enough; no npm dependencies, database, family files or hosting account needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile, mkdtemp, rm, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const binary=[process.env.TEST_BROWSER,process.env.CHROME_BIN,'/usr/bin/chromium','/usr/bin/google-chrome','/opt/google/chrome/chrome'].find(path=>path && existsSync(path));
const base='/LexGalleri';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function screenshot(call,name){
  if(!process.env.LEXGALLERI_VIEWER_SCREENSHOTS)return;
  await mkdir(process.env.LEXGALLERI_VIEWER_SCREENSHOTS,{recursive:true});
  const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(process.env.LEXGALLERI_VIEWER_SCREENSHOTS,name),Buffer.from(capture.data,'base64'));
}

async function fixture({permissions=false,member=false,mediaDelete=false,themePackages=false,galleryCreate=false}={}){
  const requests=[];let denied=false, disconnected=false;
  const galleryId='a'.repeat(32);
  const otherGalleryId='c'.repeat(32),memberId='b'.repeat(32),grantWrites=[],pendingGrantWrites=[];
  const deleteRequests=[],pendingDeletes=[],deleted=new Set();
  let holdGrantWrites=false,holdDeletes=false,otherRevoked=false,mediaDeleteCapability=mediaDelete;
  const defaultTheme={version:1,name:'Nordisk',colors:{background:'#f7f6f2',surface:'#ffffff',text:'#263b34',accent:'#416c57'},font:'sans',radius:16,density:'comfortable'};
  const activeThemeId='e'.repeat(32),inactiveThemeId='9'.repeat(32),themeDeleteRequests=[],pendingThemeDeletes=[];
  const createdGalleryId='7'.repeat(32),galleryCreates=[],pendingGalleryCreates=[],createdGalleries=[];
  let galleryCreateCapability=galleryCreate,holdGalleryCreates=false;
  let themeDeleteCapability=themePackages,holdThemeDeletes=false,currentThemeId=themePackages?activeThemeId:'default';
  let installedThemes=[{id:'default',theme:defaultTheme},{id:activeThemeId,theme:{...defaultTheme,name:'Syntetisk aktiv pakke',colors:{...defaultTheme.colors,accent:'#735a88'},radius:27}},{id:inactiveThemeId,theme:{...defaultTheme,name:'Syntetisk anden pakke',radius:9}}];
  const activeTheme=()=>installedThemes.find(theme=>theme.id===currentThemeId)?.theme||defaultTheme;
  let grants=[{user_id:memberId,gallery_id:galleryId,upload:0,download:0,gps:0}];
  const photos=Array.from({length:60},(_,index)=>({
    id:(index+1).toString(16).padStart(32,'0'),gallery_id:galleryId,
    title:'Familie '+String(index+1).padStart(2,'0'),mime:'image/jpeg',
    place:'Syntetisk test',uploader_name:'Testkonto',uploaded:'2020-01-01T00:00:'+String(index%60).padStart(2,'0')+'Z',
    taken:'',precision:'unknown',lat:null,lon:null,favorite:false,
  }));
  photos[0].mime='video/mp4';
  const otherPhotos=[{...photos[1],id:'d'.repeat(31)+'1',gallery_id:otherGalleryId,title:'Privat syntetisk minde',favorite:true}];
  const video=Buffer.from((await readFile(join(root,'tests','fixtures','tiny.mp4.b64'),'utf8')).replace(/\s/g,''),'base64');
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
    if(url.pathname===base+'/api/status'){
      const capabilities={...(mediaDeleteCapability?{media_delete:true}:{}),...(themeDeleteCapability?{theme_delete:true}:{}),...(galleryCreateCapability?{gallery_create:true}:{})};
      json({setup:false,account_security_version:1,account_security_ready:true,...(Object.keys(capabilities).length?{capabilities}:{})});return;
    }
    if(url.pathname===base+'/api/me'){json(member?{id:memberId,admin:0,name:'Syntetisk medlem'}:{id:'f'.repeat(32),admin:1,name:'Testkonto'});return;}
    if(url.pathname===base+'/api/theme'){json(activeTheme());return;}
    if(themePackages&&url.pathname===base+'/api/admin/themes'){json(installedThemes);return;}
    const themeDeletion=url.pathname.match(new RegExp('^'+base+'/api/admin/themes/([a-f0-9]{32}|default)$'));
    if(themePackages&&themeDeletion&&req.method==='DELETE'){
      themeDeleteRequests.push(themeDeletion[1]);
      if(member){json({detail:'Kun administrator'},403);return;}
      if(!themeDeleteCapability){json({detail:'Ikke fundet'},404);return;}
      if(themeDeletion[1]==='default'){json({detail:'Standardpakken kan ikke slettes'},400);return;}
      const finish=error=>{
        if(error){json({detail:error},503);return;}
        const reset=currentThemeId===themeDeletion[1];if(reset)currentThemeId='default';
        installedThemes=installedThemes.filter(theme=>theme.id!==themeDeletion[1]);json({ok:true,theme:activeTheme(),reset_to_default:reset});
      };
      if(holdThemeDeletes)pendingThemeDeletes.push(finish);else finish();return;
    }
    if(url.pathname===base+'/api/galleries'&&req.method==='POST'){
      let text='';for await(const part of req)text+=part;const fields=JSON.parse(text);galleryCreates.push(fields);
      if(member&&!galleryCreateCapability){json({detail:'Kun administrator'},403);return;}
      const finish=error=>{if(error){json({detail:error},503);return;}createdGalleries.push({id:createdGalleryId,name:fields.name,description:fields.description,count:0,cover:null});json({id:createdGalleryId});};
      if(holdGalleryCreates)pendingGalleryCreates.push(finish);else finish();return;
    }
    if(url.pathname===base+'/api/galleries'&&req.method==='GET'){
      const visiblePhotos=photos.filter(photo=>!deleted.has(photo.id));
      json([{id:galleryId,name:'Syntetisk galleri',description:'Kun genererede testdata',count:visiblePhotos.length,cover:mediaDelete?visiblePhotos[0]?.id??null:null},...(permissions||member&&!otherRevoked?[{id:otherGalleryId,name:member?'Privat syntetisk galleri':'Et andet galleri',description:member?'Beskrivelse kun for inviterede':'Kun genererede testdata',count:member?37:0,cover:null}]:[]),...createdGalleries]);return;
    }
    if(permissions&&url.pathname===base+'/api/admin/users'){
      json({users:[{id:'f'.repeat(32),admin:1,name:'Testkonto',email:'admin@example.test'},{id:memberId,admin:0,name:'Syntetisk medlem',email:'member@example.test'}],grants});return;
    }
    if(permissions&&url.pathname===base+'/api/admin/grants'&&req.method==='PUT'){
      let text='';for await(const part of req)text+=part;const fields=JSON.parse(text);grantWrites.push(fields);
      const finish=error=>{
        if(error){json({detail:error},503);return;}
        grants=grants.filter(grant=>grant.user_id!==fields.user_id||grant.gallery_id!==fields.gallery_id);
        if(fields.view)grants.push({user_id:fields.user_id,gallery_id:fields.gallery_id,upload:Number(fields.upload),download:Number(fields.download),gps:Number(fields.gps)});
        json({ok:true});
      };
      if(holdGrantWrites)pendingGrantWrites.push(finish);else finish();return;
    }
    if(url.pathname===base+'/api/galleries/'+galleryId+'/photos'){
      json(denied?{detail:'Du har ikke adgang'}:{photos:photos.filter(photo=>!deleted.has(photo.id)),permissions:{upload:false,download:true,gps:true,video:true}},denied?403:200);return;
    }
    if(member&&url.pathname===base+'/api/galleries/'+otherGalleryId+'/photos'){
      json(otherRevoked?{detail:'Du har ikke adgang'}:{photos:otherPhotos,permissions:{upload:false,download:false,gps:false,video:false}},otherRevoked?403:200);return;
    }
    if(createdGalleries.length&&url.pathname===base+'/api/galleries/'+createdGalleryId+'/photos'){
      json({photos:[],permissions:{upload:true,download:true,gps:true,video:true}});return;
    }
    const deletion=url.pathname.match(new RegExp('^'+base+'/api/photos/([a-f0-9]{32})$'));
    if(deletion&&req.method==='DELETE'){
      deleteRequests.push(deletion[1]);
      if(member){json({detail:'Kun administrator'},403);return;}
      if(!mediaDeleteCapability){json({detail:'Ikke fundet'},404);return;}
      const finish=error=>{if(error){json({detail:error},503);return;}deleted.add(deletion[1]);json({ok:true});};
      if(holdDeletes)pendingDeletes.push(finish);else finish();return;
    }
    if(new RegExp('^'+base+'/api/photos/[a-f0-9]{32}/image$').test(url.pathname)){
      const id=url.pathname.split('/').at(-2);
      if(denied||member&&otherRevoked&&otherPhotos.some(photo=>photo.id===id)){json({detail:'Du har ikke adgang'},403);return;}
      if(deleted.has(id)){json({detail:'Foto findes ikke'},404);return;}
      send('image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#dce9e2"/><circle cx="925" cy="180" r="80" fill="#e5be77"/><path d="M0 480 285 180 650 520 930 310 1200 510V800H0Z" fill="#779c8a"/><path d="M0 580 340 390 620 650 950 455 1200 610V800H0Z" fill="#416c57"/><path d="M0 620Q380 565 620 680T1200 650V800H0Z" fill="#83aab1"/><path d="M0 735Q390 650 700 740T1200 720V800H0Z" fill="#c3d5ce"/></svg>');return;
    }
    if(new RegExp('^'+base+'/api/photos/[a-f0-9]{32}/video$').test(url.pathname)){
      if(denied){json({detail:'Du har ikke adgang'},403);return;}
      if(deleted.has(url.pathname.split('/').at(-2))){json({detail:'Foto findes ikke'},404);return;}
      res.setHeader('Accept-Ranges','bytes');send('video/mp4',video);return;
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
  return {origin:'http://127.0.0.1:'+server.address().port,requests,galleryId,otherGalleryId,memberId,photoId:photos[0].id,stillPhotoId:photos[1].id,otherPhotoId:otherPhotos[0].id,grantWrites,deleteRequests,activeThemeId,inactiveThemeId,themeDeleteRequests,createdGalleryId,galleryCreates,
    holdGrantWrites:()=>{holdGrantWrites=true;},releaseGrantWrite:error=>{assert(pendingGrantWrites.length,'a grant request must be pending');pendingGrantWrites.shift()(error);},
    holdDeletes:()=>{holdDeletes=true;},releaseDelete:error=>{assert(pendingDeletes.length,'a media deletion must be pending');pendingDeletes.shift()(error);},
    holdThemeDeletes:()=>{holdThemeDeletes=true;},releaseThemeDelete:error=>{assert(pendingThemeDeletes.length,'a package deletion must be pending');pendingThemeDeletes.shift()(error);},disableThemeDelete:()=>{themeDeleteCapability=false;},enableThemeDelete:()=>{themeDeleteCapability=true;},
    holdGalleryCreates:()=>{holdGalleryCreates=true;},releaseGalleryCreate:error=>{assert(pendingGalleryCreates.length,'a gallery creation must be pending');pendingGalleryCreates.shift()(error);},disableGalleryCreate:()=>{galleryCreateCapability=false;},
    revokeOtherGallery:()=>{otherRevoked=true;},allowOtherGallery:()=>{otherRevoked=false;},disableMediaDelete:()=>{mediaDeleteCapability=false;},
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
    const closePhoto=()=>run("new Promise(resolve=>{const dialog=document.querySelector('#modal');if(!dialog.open){resolve(true);return;}dialog.addEventListener('close',()=>resolve(true),{once:true});document.querySelector('#close-modal').click();})");
    await call('Page.navigate',{url:site.origin+base+'/'});
    await wait("!!document.querySelector('[data-gallery]')",'gallery startup');
    await run("document.querySelector('[data-gallery]').click()");
    await wait("document.querySelectorAll('[data-photo]').length===60",'gallery contents');
    await run("document.querySelector('#search-photo').value='Familie';document.querySelector('#search-photo').dispatchEvent(new Event('input'));document.querySelector('#sort').value='uploaded';document.querySelector('#sort').dispatchEvent(new Event('change'))");
    await pause(250);
    await run("const opener=document.querySelectorAll('[data-photo]')[8];opener.scrollIntoView({block:'center'});opener.focus({preventScroll:true});window.__grid=document.querySelector('#photo-grid');window.__images=[...__grid.querySelectorAll('img')];window.__scroll=scrollY;opener.click()");
    await wait("document.querySelector('#modal').open",'photo overlay');
    await wait("document.querySelector('#modal img').complete",'large photo');
    await t.test('compact viewer overlays accessible arrows and keeps metadata collapsed without reloading media',async()=>{
      const layout=await run("(()=>{const stage=document.querySelector('.photo-stage'),image=stage.querySelector('img'),panel=document.querySelector('#photo-info'),toggle=document.querySelector('#photo-info-toggle');const rect=stage.getBoundingClientRect(),media=image.getBoundingClientRect();window.__viewerMedia=image;return{compact:document.querySelector('#modal').classList.contains('photo-dialog'),hidden:panel.hidden,display:getComputedStyle(panel).display,expanded:toggle.getAttribute('aria-expanded'),controls:toggle.getAttribute('aria-controls'),arrows:['prev','next'].map(id=>{const button=document.getElementById(id),r=button.getBoundingClientRect();return{width:r.width,height:r.height,inside:stage.contains(button)&&r.left>=rect.left&&r.right<=rect.right&&r.top>=rect.top&&r.bottom<=rect.bottom,insideMedia:r.left+r.width/2>=media.left&&r.right-r.width/2<=media.right&&r.top+r.height/2>=media.top&&r.bottom-r.height/2<=media.bottom,label:button.getAttribute('aria-label'),text:button.textContent.trim()};})};})()");
      assert(layout.compact);assert(layout.hidden);assert.equal(layout.display,'none');assert.equal(layout.expanded,'false');assert.equal(layout.controls,'photo-info');
      for(const arrow of layout.arrows){assert(arrow.width>=44&&arrow.height>=44,'overlay arrows must remain usable touch targets');assert(arrow.inside&&arrow.insideMedia,'arrow centers must be inside the displayed media');assert(arrow.label&&arrow.text.length<=2,'arrows use accessible labels rather than a space-consuming text row');}
      await screenshot(call,'compact-viewer-desktop.png');
      const before=site.requests.filter(path=>path.includes('/image?size=view')||path.endsWith('/photos')).length;
      await run("document.querySelector('#photo-info-toggle').click()");
      const info=await run("({hidden:document.querySelector('#photo-info').hidden,expanded:document.querySelector('#photo-info-toggle').getAttribute('aria-expanded'),same:__viewerMedia===document.querySelector('.photo-stage img'),text:document.querySelector('#photo-info').textContent,actionInside:!!document.querySelector('#photo-info #favorite')&&!!document.querySelector('#photo-info #edit-photo'),arrowsOutside:!document.querySelector('#photo-info #prev,#photo-info #next')})");
      assert.equal(info.hidden,false);assert.equal(info.expanded,'true');assert(info.same&&info.actionInside&&info.arrowsOutside);
      for(const label of ['Optaget','Sted','Uploadet af','Uploadtidspunkt','Testkonto'])assert(info.text.includes(label));
      await screenshot(call,'compact-viewer-info.png');
      await run("document.querySelector('#photo-info-toggle').click()");
      assert(await run("document.querySelector('#photo-info').hidden&&__viewerMedia===document.querySelector('.photo-stage img')"));
      assert.equal(site.requests.filter(path=>path.includes('/image?size=view')||path.endsWith('/photos')).length,before,'Info must not fetch or recreate the photo or gallery');
    });
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
    await t.test('overlay and keyboard arrows respect endpoints and leave editing fields alone',async()=>{
      await run("document.querySelectorAll('[data-photo]')[0].click()");await wait("document.querySelector('#modal').open",'first photo');
      assert.equal(await run("document.querySelector('#prev').disabled"),true);
      let before=site.requests.filter(path=>path.endsWith('/photos')).length;
      await run("document.querySelector('#prev').click()");await pause(50);assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,before,'disabled previous arrow must not request an invalid image');
      await run("window.__firstMedia=document.querySelector('.photo-stage img');document.querySelector('#modal').focus()");
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39,nativeVirtualKeyCode:39});
      await wait("document.querySelector('.photo-stage img')!==__firstMedia",'keyboard next photo');assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,before+1);assert(await run("document.querySelector('#photo-info').hidden"),'the next photo starts with its information collapsed');
      await run("window.__secondMedia=document.querySelector('.photo-stage img');document.querySelector('#modal').focus()");
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37,nativeVirtualKeyCode:37});
      await wait("document.querySelector('.photo-stage img')!==__secondMedia",'keyboard previous photo');assert.equal(await run("document.querySelector('#prev').disabled"),true);
      await run("document.querySelector('#photo-info-toggle').click();document.querySelector('#edit-photo').click()");await wait("!!document.querySelector('#edit')",'photo metadata editor');
      before=site.requests.filter(path=>path.endsWith('/photos')).length;
      await run("document.querySelector('#edit input[name=title]').focus()");
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39,nativeVirtualKeyCode:39});await pause(50);
      assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,before);assert(await run("!!document.querySelector('#edit')&&!document.querySelector('#modal').classList.contains('photo-dialog')"));
      await closePhoto();
      await run("document.querySelectorAll('[data-photo]')[59].click()");await wait("document.querySelector('#modal').open&&!!document.querySelector('#photo-video')",'last photo/video');
      assert.equal(await run("document.querySelector('#next').disabled"),true);
      before=site.requests.filter(path=>path.endsWith('/photos')).length;await run("document.querySelector('#next').click()");await pause(50);assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,before);
      await closePhoto();
    });
    await t.test('video Info preserves the player and native video keyboard controls',async()=>{
      await run("document.querySelector('[data-photo=\""+site.photoId+"\"]').click()");await wait("document.querySelector('#modal').open&&!!document.querySelector('#photo-video')&&document.querySelector('#photo-video').readyState>=2",'video metadata');
      await run("window.__video=document.querySelector('#photo-video');window.__pauseCalls=0;window.__nativePause=__video.pause.bind(__video);__video.pause=()=>{__pauseCalls++;__nativePause();};__video.currentTime=0.25");
      await wait("document.querySelector('#photo-video').currentTime>=0.2",'video seek');const before=site.requests.filter(path=>path.endsWith('/video')||path.endsWith('/photos')).length;
      await run("document.querySelector('#photo-info-toggle').click()");
      assert(await run("__video===document.querySelector('#photo-video')&&__video.currentTime>=0.2&&__pauseCalls===0"));
      await run("document.querySelector('#photo-info-toggle').click();__video.focus()");
      await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39,nativeVirtualKeyCode:39});await pause(50);
      assert(await run("__video===document.querySelector('#photo-video')&&__pauseCalls===0"));assert.equal(site.requests.filter(path=>path.endsWith('/video')||path.endsWith('/photos')).length,before);
      await closePhoto();
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
      await run("document.querySelectorAll('[data-photo]')[8].click()");await wait("document.querySelector('#modal').open&&document.querySelector('.photo-stage img')?.complete",'mobile photo viewer');
      const viewer=await run("(()=>{const dialog=document.querySelector('#modal').getBoundingClientRect(),stage=document.querySelector('.photo-stage').getBoundingClientRect();return{width:innerWidth,left:dialog.left,right:dialog.right,hidden:document.querySelector('#photo-info').hidden,arrows:['prev','next'].map(id=>{const b=document.getElementById(id),r=b.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{width:r.width,height:r.height,inside:r.left>=stage.left&&r.right<=stage.right&&r.top>=stage.top&&r.bottom<=stage.bottom,clickable:top===b||b.contains(top)};})};})()");
      assert(viewer.left>=0&&viewer.right<=viewer.width&&viewer.hidden);for(const arrow of viewer.arrows)assert(arrow.width>=44&&arrow.height>=44&&arrow.inside&&arrow.clickable,'mobile overlay arrows must be visible and tappable inside the image');
      await screenshot(call,'compact-viewer-mobile.png');
      await run("document.querySelector('#photo-info-toggle').click()");assert.equal(await run("document.querySelector('#photo-info').hidden"),false);
      assert(await run("document.querySelector('#modal').getBoundingClientRect().right<=innerWidth"));await closePhoto();
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

test('real Chromium: gallery permissions report pending, saved and failed changes inside the open dialog',{
  skip:binary?false:'Set TEST_BROWSER to a Chromium/Chrome executable for the optional browser smoke test',timeout:90000,
},async t=>{
  const site=await fixture({permissions:true});let browser;
  try{
    browser=await chrome();const {evaluate:run,wait,call}=browser;
    const form=id=>'document.querySelector('+JSON.stringify('.grant[data-g="'+id+'"]')+')';
    const first=form(site.galleryId),second=form(site.otherGalleryId);
    const feedback=form=>form+".querySelector('.grant-feedback')";
    const state=(form,name)=>feedback(form)+'.dataset.state==='+JSON.stringify(name);
    const reopen=async()=>{
      await run("new Promise(resolve=>{const dialog=document.querySelector('#modal');dialog.addEventListener('close',()=>resolve(true),{once:true});document.querySelector('#close-modal').click();})");
      await run('document.querySelector('+JSON.stringify('[data-user="'+site.memberId+'"]')+').click()');
      await wait('!!'+first,'reopened permission forms');
    };
    const visible=async(form,scroll=true)=>{
      if(scroll)await run(feedback(form)+".scrollIntoView({block:'center'})");
      return run("(()=>{const element="+feedback(form)+",rect=element.getBoundingClientRect(),style=getComputedStyle(element),top=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return{insideModal:element.closest('dialog').matches(':modal'),visible:rect.width>0&&rect.height>0&&rect.top>=0&&rect.bottom<=innerHeight&&style.display!=='none'&&style.visibility==='visible'&&(top===element||element.contains(top)),text:element.textContent,role:element.getAttribute('role'),live:element.getAttribute('aria-live')};})()");
    };
    const waitForWrites=async count=>{
      const until=Date.now()+5000;while(site.grantWrites.length<count&&Date.now()<until)await pause(20);
      assert.equal(site.grantWrites.length,count,'save must send exactly one request');
    };
    await call('Page.navigate',{url:site.origin+base+'/'});
    await wait("!!document.querySelector('[data-gallery]')",'gallery startup');
    await run("document.querySelector('[data-view=people]').click()");
    await wait('!!document.querySelector('+JSON.stringify('[data-user="'+site.memberId+'"]')+')','member administration');
    await run('document.querySelector('+JSON.stringify('[data-user="'+site.memberId+'"]')+').click()');
    await wait('!!'+first,'permission forms');site.holdGrantWrites();

    await t.test('pending requests disable their controls and only a successful response confirms the save',async()=>{
      await run(first+'.querySelector("button[type=submit]").scrollIntoView({block:"end"})');
      await run('(()=>{const f='+first+';f.elements.upload.click();f.requestSubmit();f.requestSubmit();})()');
      await wait(state(first,'saving'),'pending permission save');await waitForWrites(1);
      const pending=await run('(()=>{const f='+first+';return{busy:f.getAttribute("aria-busy"),disabled:[...f.querySelectorAll("input,button[type=submit]")].every(element=>element.disabled),text:f.querySelector(".grant-feedback").textContent,otherEnabled:!'+second+'.querySelector("button[type=submit]").disabled};})()');
      assert.equal(pending.busy,'true');assert(pending.disabled&&pending.otherEnabled);assert.equal(pending.text,'Gemmer rettigheder…');
      assert.deepEqual(site.grantWrites[0],{user_id:site.memberId,gallery_id:site.galleryId,view:true,upload:true,download:false,gps:false});
      site.releaseGrantWrite();await wait(state(first,'success'),'acknowledged permission save');
      const saved=await visible(first,false);assert(saved.insideModal&&saved.visible,'saved feedback must be visible above the native dialog backdrop without scrolling after save');
      assert.equal(saved.text,'Rettighederne er gemt.');assert.equal(saved.role,'status');assert.equal(saved.live,'polite');
      assert(await run(first+'.getAttribute("aria-busy")==="false"&&![...'+first+'.querySelectorAll("input,button[type=submit]")].some(element=>element.disabled)'));
      assert.equal(site.requests.filter(path=>path===base+'/api/admin/users').length,1,'an acknowledged save must not depend on a second admin-list request');
      await reopen();assert(await run(first+'.elements.upload.checked&&'+first+'.elements.view.checked'),'reopening must retain the acknowledged rights');
    });

    await t.test('new edits clear stale success, failed writes remain visible and retry can succeed',async()=>{
      await run(first+'.elements.upload.click()');
      await wait(state(first,'changed'),'unsaved permission change');assert.equal(await run(feedback(first)+'.textContent'),'Ændringerne er ikke gemt.');
      await run(first+'.requestSubmit()');await wait(state(first,'saving'),'second permission save');await waitForWrites(2);
      site.releaseGrantWrite('Midlertidig forbindelsesfejl');await wait(state(first,'error'),'failed permission save');
      const failed=await visible(first);assert(failed.insideModal&&failed.visible);assert.equal(failed.text,'Rettighederne kunne ikke gemmes: Midlertidig forbindelsesfejl');
      assert(await run('!'+first+'.querySelector("button[type=submit]").disabled&&!'+first+'.elements.upload.checked'),'failure must allow retry and retain the attempted values');
      await reopen();assert(await run(first+'.elements.upload.checked'),'a failed write must not alter the acknowledged rights');
      await run(first+'.elements.upload.click();'+first+'.requestSubmit()');await wait(state(first,'saving'),'permission retry');await waitForWrites(3);
      site.releaseGrantWrite();await wait(state(first,'success'),'successful permission retry');
      await run(first+'.elements.gps.click()');await wait(state(first,'changed'),'editing after saved feedback');
      assert.equal(await run(feedback(first)+'.textContent'),'Ændringerne er ikke gemt.');
    });

    await t.test('each gallery keeps its own status and the confirmation remains visible on mobile',async()=>{
      await run(second+'.elements.view.click();'+second+'.elements.upload.click();'+second+'.requestSubmit()');
      await wait(state(second,'saving'),'other gallery save');await waitForWrites(4);
      assert(await run(state(first,'changed')),'saving another gallery must not replace the first gallery status');
      site.releaseGrantWrite();await wait(state(second,'success'),'other gallery confirmation');
      assert(await run(state(first,'changed')));
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
      const mobile=await visible(second);assert(mobile.insideModal&&mobile.visible,'mobile confirmation must be readable inside the open dialog');
      assert(await run('document.querySelector("#modal").getBoundingClientRect().right<=innerWidth'));
      await reopen();assert(await run('!'+first+'.elements.upload.checked&&!'+first+'.elements.gps.checked&&'+second+'.elements.view.checked&&'+second+'.elements.upload.checked'),'only acknowledged changes must survive reopening');
    });

    await t.test('removing gallery access is acknowledged and reflected when the dialog is reopened',async()=>{
      await run(first+'.elements.view.click();'+first+'.requestSubmit()');await wait(state(first,'saving'),'gallery access removal');await waitForWrites(5);
      site.releaseGrantWrite();await wait(state(first,'success'),'gallery removal confirmation');
      assert((await visible(first)).visible);await reopen();
      assert(await run('[...'+first+'.querySelectorAll("input")].every(element=>!element.checked)'),'removed access must reopen without stale permissions');
      assert(await run(second+'.elements.view.checked&&'+second+'.elements.upload.checked'),'removal must not affect the other gallery');
    });
  }finally{if(browser)await browser.close();await site.close();}
});

test('real Chromium: members see freshly authorized galleries and revoked metadata disappears from navigation',{
  skip:binary?false:'Set TEST_BROWSER to a Chromium/Chrome executable for the optional browser smoke test',timeout:90000,
},async t=>{
  const site=await fixture({member:true,mediaDelete:true});let browser;
  try{
    browser=await chrome();const {evaluate:run,wait,call}=browser;
    const galleryButton=id=>'document.querySelector('+JSON.stringify('[data-gallery="'+id+'"]')+')';
    const photoButton=id=>'document.querySelector('+JSON.stringify('[data-photo="'+id+'"]')+')';
    const close=()=>run("new Promise(resolve=>{const dialog=document.querySelector('#modal');dialog.addEventListener('close',()=>resolve(true),{once:true});document.querySelector('#close-modal').click();})");
    const hidden=async()=>{
      const overview=await run("({count:document.querySelectorAll('[data-gallery]').length,text:document.querySelector('#content').textContent,revoked:!!"+galleryButton(site.otherGalleryId)+"})");
      assert.equal(overview.count,1);assert.equal(overview.revoked,false);
      for(const text of ['Privat syntetisk galleri','Beskrivelse kun for inviterede','37 billeder','Privat syntetisk minde'])assert(!overview.text.includes(text),'revoked metadata must leave the rendered page: '+text);
    };
    await call('Page.navigate',{url:site.origin+base+'/'});await wait("document.querySelectorAll('[data-gallery]').length===2",'two authorized member galleries');

    await t.test('normal members have no delete action even when the backend supports it',async()=>{
      await run(galleryButton(site.galleryId)+'.click()');await wait('!!'+photoButton(site.stillPhotoId),'member gallery');
      await run(photoButton(site.stillPhotoId)+'.click()');await wait('document.querySelector("#modal").open','member viewer');
      await run('document.querySelector("#photo-info-toggle").click()');
      assert(await run('!document.querySelector("#delete-photo")&&!document.querySelector("#edit-photo")'));
      assert.equal(site.deleteRequests.length,0);await close();
      await run('document.querySelector("#back").click()');await wait("document.querySelectorAll('[data-gallery]').length===2",'member overview');
    });

    await t.test('Back refreshes gallery grants and timeline/favorites never fetch a revoked gallery',async()=>{
      await run(galleryButton(site.otherGalleryId)+'.click()');await wait('!!'+photoButton(site.otherPhotoId),'gallery before access revocation');
      site.revokeOtherGallery();const before=site.requests.filter(path=>path===base+'/api/galleries').length;
      await run('document.querySelector("#back").click()');await wait("!!document.querySelector('#gallery-grid')&&document.querySelectorAll('[data-gallery]').length===1",'filtered overview after Back');
      assert(site.requests.filter(path=>path===base+'/api/galleries').length>before,'Back must ask the server for current gallery grants');await hidden();
      const revokedRequests=site.requests.filter(path=>path===base+'/api/galleries/'+site.otherGalleryId+'/photos').length;
      for(const view of ['timeline','favorites']){
        const before=site.requests.filter(path=>path===base+'/api/galleries').length;
        await run('document.querySelector('+JSON.stringify('[data-view="'+view+'"]')+').click()');await wait('!!document.querySelector("#photo-grid")','refreshed '+view);
        assert(site.requests.filter(path=>path===base+'/api/galleries').length>before,view+' must refresh grants before collecting photos');
        assert.equal(site.requests.filter(path=>path===base+'/api/galleries/'+site.otherGalleryId+'/photos').length,revokedRequests,view+' must not fetch a revoked gallery');
        assert(await run('!document.querySelector("#content").textContent.includes("Privat syntetisk minde")'));
      }
      const beforeOverview=site.requests.filter(path=>path===base+'/api/galleries').length;
      await run('document.querySelector("[data-view=galleries]").click()');await wait('!!document.querySelector("#gallery-grid")','explicit gallery navigation');await hidden();
      assert(site.requests.filter(path=>path===base+'/api/galleries').length>beforeOverview);
    });

    await t.test('a stale direct photo click handles denied access and returns to a clean authorized overview',async()=>{
      site.allowOtherGallery();await run('document.querySelector("[data-view=galleries]").click()');await wait("document.querySelectorAll('[data-gallery]').length===2",'newly restored member access');
      await run(galleryButton(site.otherGalleryId)+'.click()');await wait('!!'+photoButton(site.otherPhotoId),'restored gallery contents');
      site.revokeOtherGallery();await run(photoButton(site.otherPhotoId)+'.click()');
      await wait("!!document.querySelector('#gallery-grid')&&document.querySelectorAll('[data-gallery]').length===1",'safe denied-access recovery');await hidden();
      assert(await run('!document.querySelector("#modal").open'));
      assert.match(await run('document.querySelector("#toast").textContent'),/ikke længere adgang/);
    });
  }finally{if(browser)await browser.close();await site.close();}
});

test('real Chromium: administrators confirm photo and MP4 removal without reloading the surviving gallery',{
  skip:binary?false:'Set TEST_BROWSER to a Chromium/Chrome executable for the optional browser smoke test',timeout:90000,
},async t=>{
  const site=await fixture({mediaDelete:true});let browser;
  try{
    browser=await chrome();const {evaluate:run,wait,call}=browser;
    const photo=id=>'document.querySelector('+JSON.stringify('[data-photo="'+id+'"]')+')';
    const open=async id=>{await run(photo(id)+'.click()');await wait('document.querySelector("#modal").open','media viewer');};
    const confirm=()=>run('document.querySelector("#delete-photo").click();document.querySelector("#delete-photo-submit").click();document.querySelector("#delete-photo-submit").click()');
    const waitForDeletes=async count=>{const until=Date.now()+5000;while(site.deleteRequests.length<count&&Date.now()<until)await pause(20);assert.equal(site.deleteRequests.length,count,'deletion must send exactly one request per confirmation');};
    const assertSurvivors=async deletedIds=>{
      assert(await run('__deleteGrid===document.querySelector("#photo-grid")'),'delete must retain the existing gallery grid');
      assert(await run('__deleteImages.filter(image=>!'+JSON.stringify(deletedIds)+'.includes(image.closest("[data-photo]").dataset.photo)).every(image=>image.isConnected&&image===document.querySelector(\'[data-photo="\'+image.closest("[data-photo]").dataset.photo+\'"] img\'))'),'surviving thumbnail elements must be retained');
    };
    await call('Page.navigate',{url:site.origin+base+'/'});await wait("!!document.querySelector('[data-gallery]')",'administrator overview');
    await run('document.querySelector("[data-gallery]").click()');await wait("document.querySelectorAll('[data-photo]').length===60",'administrator gallery');
    await run('window.__deleteGrid=document.querySelector("#photo-grid");window.__deleteImages=[...__deleteGrid.querySelectorAll("img")]');site.holdDeletes();

    await t.test('the delete action stays inside Info and cancellation preserves the selected photo',async()=>{
      await open(site.stillPhotoId);
      assert(await run('document.querySelector("#photo-info").hidden&&document.querySelector("#delete-photo").getClientRects().length===0'),'delete must not consume the compact viewer toolbar');
      await run('document.querySelector("#photo-info-toggle").click();document.querySelector("#delete-photo").click()');
      assert(await run('!document.querySelector("#delete-photo-confirm").hidden&&document.querySelector("#delete-photo-cancel")&&document.querySelector("#delete-photo-submit")'));
      await run('document.querySelector("#delete-photo-cancel").click()');
      assert(await run('document.querySelector("#delete-photo-confirm").hidden&&document.querySelector("#modal").open&&!!'+photo(site.stillPhotoId)));
      assert.equal(site.deleteRequests.length,0);
    });

    await t.test('pending deletion prevents duplicate requests and a failed response keeps the photo and its card',async()=>{
      await run('window.__deleteMedia=document.querySelector(".photo-stage img");window.__deleteCard='+photo(site.stillPhotoId)+'.closest(".photo")');
      await confirm();await wait('document.querySelector("#delete-photo-submit").disabled','pending photo deletion');await waitForDeletes(1);
      assert.equal(site.deleteRequests[0],site.stillPhotoId);
      assert(await run('document.querySelector("#delete-photo-cancel").disabled&&document.querySelector("#delete-photo-status").textContent.includes("Sletter")'));
      site.releaseDelete('Syntetisk serverfejl');await wait('document.querySelector("#delete-photo-status").textContent.includes("Kunne ikke slette")','failed photo deletion');
      const error=await run('(()=>{const e=document.querySelector("#delete-photo-status");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{visible:!!e.closest("dialog:modal")&&(top===e||e.contains(top)),text:e.textContent};})()');
      assert(error.visible);assert.match(error.text,/Syntetisk serverfejl/);
      assert(await run('__deleteMedia===document.querySelector(".photo-stage img")&&__deleteCard==='+photo(site.stillPhotoId)+'.closest(".photo")&&!document.querySelector("#delete-photo-submit").disabled'));
      assert.equal(await run('document.querySelectorAll("[data-photo]").length'),60);await assertSurvivors([]);
    });

    await t.test('an acknowledged photo deletion removes only that card and updates the count',async()=>{
      const before=site.requests.filter(path=>path.endsWith('/photos')).length;
      await run('document.querySelector("#delete-photo-submit").click()');await waitForDeletes(2);site.releaseDelete();
      await wait('!document.querySelector("#modal").open&&document.querySelectorAll("[data-photo]").length===59','successful photo deletion');
      assert(await run('!'+photo(site.stillPhotoId)));await assertSurvivors([site.stillPhotoId]);
      assert.match(await run('document.querySelector("#gallery-media-count").textContent'),/^59 billeder$/);
      assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,before,'photo deletion must not refetch gallery contents');
      assert(await run('galleries.find(g=>g.id==='+JSON.stringify(site.galleryId)+').count===59'));
    });

    await t.test('MP4 deletion stops the player, clears the cover and preserves remaining thumbnail nodes',async()=>{
      await open(site.photoId);await wait('!!document.querySelector("#photo-video")','MP4 player');
      await run('(()=>{window.__deletedVideo=document.querySelector("#photo-video");window.__deletePauseCalls=0;const pause=__deletedVideo.pause.bind(__deletedVideo);__deletedVideo.pause=()=>{__deletePauseCalls++;pause();};})()');
      await run('document.querySelector("#photo-info-toggle").click()');
      assert.equal(await run('document.querySelector("#delete-photo").textContent'),'Slet video');
      const before=site.requests.filter(path=>path.endsWith('/photos')).length;
      await confirm();await waitForDeletes(3);assert.equal(site.deleteRequests[2],site.photoId);site.releaseDelete();
      await wait('!document.querySelector("#modal").open&&document.querySelectorAll("[data-photo]").length===58','successful MP4 deletion');
      assert(await run('__deletedVideo.paused&&__deletePauseCalls>0'));await assertSurvivors([site.stillPhotoId,site.photoId]);
      assert.equal(site.requests.filter(path=>path.endsWith('/photos')).length,before,'video deletion must not refetch gallery contents');
      assert.match(await run('document.querySelector("#gallery-media-count").textContent'),/^58 billeder$/);
      assert(await run('(()=>{const g=galleries.find(g=>g.id==='+JSON.stringify(site.galleryId)+');return g.count===58&&g.cover!=='+JSON.stringify(site.photoId)+';})()'),'deleted media must not remain the cached gallery cover');
    });

    await t.test('an older backend without the capability never exposes the delete action',async()=>{
      site.disableMediaDelete();await call('Page.reload');await wait("!!document.querySelector('[data-gallery]')",'older backend overview');
      await run('document.querySelector("[data-gallery]").click()');await wait('document.querySelectorAll("[data-photo]").length===58','remaining media after reload');
      const id=await run('document.querySelector("[data-photo]").dataset.photo');await open(id);await run('document.querySelector("#photo-info-toggle").click()');
      assert(await run('!document.querySelector("#delete-photo")&&!!document.querySelector("#edit-photo")'));
      assert.equal(site.deleteRequests.length,3);
    });
  }finally{if(browser)await browser.close();await site.close();}
});

test('real Chromium: administrators delete design packages with confirmation and restore the active server theme',{
  skip:binary?false:'Set TEST_BROWSER to a Chromium/Chrome executable for the optional browser smoke test',timeout:90000,
},async t=>{
  const site=await fixture({themePackages:true});let browser;
  try{
    browser=await chrome();const {evaluate:run,wait,call}=browser;
    const node=(attribute,id)=>'document.querySelector('+JSON.stringify('['+attribute+'="'+id+'"]')+')';
    const card=id=>node('data-theme-card',id),trigger=id=>node('data-theme-delete',id),box=id=>node('data-theme-delete-confirm',id),submit=id=>node('data-theme-delete-submit',id),cancel=id=>node('data-theme-delete-cancel',id),status=id=>node('data-theme-delete-status',id);
    const openDesign=async()=>{await wait('!!document.querySelector("[data-view=design]")','administrator navigation');await run('document.querySelector("[data-view=design]").click()');await wait('document.querySelectorAll("[data-theme-card]").length===3','installed packages');};
    const radius=()=>run('getComputedStyle(document.documentElement).getPropertyValue("--radius").trim()');
    const waitForDeletes=async count=>{const until=Date.now()+5000;while(site.themeDeleteRequests.length<count&&Date.now()<until)await pause(20);assert.equal(site.themeDeleteRequests.length,count,'package confirmation must send exactly one request');};
    await call('Page.navigate',{url:site.origin+base+'/'});await openDesign();

    await t.test('standard packages and older backends expose no delete action',async()=>{
      assert(await run('!!'+card('default')+'&&!'+trigger('default')+'&&!!'+trigger(site.activeThemeId)+'&&!!'+trigger(site.inactiveThemeId)));
      site.disableThemeDelete();await call('Page.reload');await openDesign();
      assert.equal(await run('document.querySelectorAll("[data-theme-delete]").length'),0,'missing theme_delete capability must hide all package delete actions');
      assert.equal(site.themeDeleteRequests.length,0);
      site.enableThemeDelete();await call('Page.reload');await openDesign();
      assert.equal(await radius(),'27px');
      await run('window.__defaultPackage='+card('default')+';window.__activePackage='+card(site.activeThemeId)+';window.__otherPackage='+card(site.inactiveThemeId));site.holdThemeDeletes();
    });

    await t.test('cancellation and a failed request preserve the package and the preview',async()=>{
      await run(trigger(site.inactiveThemeId)+'.click()');assert(await run('!'+box(site.inactiveThemeId)+'.hidden'));
      await run(cancel(site.inactiveThemeId)+'.click()');assert(await run(box(site.inactiveThemeId)+'.hidden&&__otherPackage.isConnected'));
      assert.equal(site.themeDeleteRequests.length,0);
      await run(node('data-preview',site.inactiveThemeId)+'.click()');assert.equal(await radius(),'9px');
      await run(trigger(site.inactiveThemeId)+'.click();'+submit(site.inactiveThemeId)+'.click();'+submit(site.inactiveThemeId)+'.click()');await waitForDeletes(1);
      assert.equal(site.themeDeleteRequests[0],site.inactiveThemeId);
      assert(await run('[...'+card(site.inactiveThemeId)+'.querySelectorAll("button")].every(button=>button.disabled)&&!'+trigger(site.activeThemeId)+'.disabled'),'only the pending package must be disabled');
      site.releaseThemeDelete('Syntetisk serverfejl');await wait(status(site.inactiveThemeId)+'.textContent.includes("Kunne ikke slette designpakken")','failed package deletion');
      const error=await run('(()=>{const element='+status(site.inactiveThemeId)+';element.scrollIntoView({block:"center"});const rect=element.getBoundingClientRect(),top=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return{visible:top===element||element.contains(top),text:element.textContent};})()');
      assert(error.visible);assert.match(error.text,/Syntetisk serverfejl/);assert.equal(await radius(),'9px');
      assert(await run('__otherPackage.isConnected&&!'+submit(site.inactiveThemeId)+'.disabled&&'+card(site.inactiveThemeId)+'===__otherPackage'));
    });

    await t.test('deleting an inactive package keeps the other cards and applies the actual active theme',async()=>{
      await run(submit(site.inactiveThemeId)+'.click()');await waitForDeletes(2);site.releaseThemeDelete();
      await wait('!'+card(site.inactiveThemeId),'removed inactive package');
      assert(await run('__defaultPackage.isConnected&&__activePackage.isConnected&&'+card('default')+'===__defaultPackage&&'+card(site.activeThemeId)+'===__activePackage'));
      assert.equal(await radius(),'27px','the server active theme replaces an uncommitted preview');
      assert.equal(await run('document.querySelector("#theme-delete-feedback").textContent'),'Pakken er slettet. Det aktive design er bevaret.');
      assert.equal(await run('document.querySelector("#theme-delete-feedback").getAttribute("role")'),'status');
    });

    await t.test('deleting the active package applies the standard theme and keeps the protected standard card',async()=>{
      await run(trigger(site.activeThemeId)+'.click();'+submit(site.activeThemeId)+'.click()');await waitForDeletes(3);site.releaseThemeDelete();
      await wait('!'+card(site.activeThemeId),'removed active package');assert.equal(await radius(),'16px');
      assert.equal(await run('getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()'),'#416c57');
      assert(await run('__defaultPackage.isConnected&&'+card('default')+'===__defaultPackage&&!'+trigger('default')));
      assert.equal(await run('document.querySelectorAll("[data-theme-card]").length'),1);
      assert.equal(await run('document.querySelector("#theme-delete-feedback").textContent'),'Pakken er slettet. Standarddesignet er nu aktivt.');
    });
  }finally{if(browser)await browser.close();await site.close();}
});

test('real Chromium: members create their own galleries without gaining administration controls',{
  skip:binary?false:'Set TEST_BROWSER to a Chromium/Chrome executable for the optional browser smoke test',timeout:90000,
},async t=>{
  const site=await fixture({member:true,galleryCreate:true});let browser;
  try{
    browser=await chrome();const {evaluate:run,wait,call}=browser;
    const created='document.querySelector('+JSON.stringify('[data-gallery="'+site.createdGalleryId+'"]')+')';
    const waitForCreates=async count=>{const until=Date.now()+5000;while(site.galleryCreates.length<count&&Date.now()<until)await pause(20);assert.equal(site.galleryCreates.length,count,'one submit must create one gallery request');};
    await call('Page.navigate',{url:site.origin+base+'/'});await wait('!!document.querySelector("#new-gallery")','member gallery creation');site.holdGalleryCreates();

    await t.test('the member form explains ownership and a failed request remains visible without a fake gallery',async()=>{
      assert(await run('!document.querySelector("[data-view=people]")&&!document.querySelector("[data-view=design]")'));
      await run('document.querySelector("#new-gallery").click()');await wait('!!document.querySelector("#new")','new member gallery form');
      assert.match(await run('document.querySelector("#new").textContent'),/Du og admin har adgang fra start/);
      await run('(()=>{const form=document.querySelector("#new");form.elements.name.value="Syntetisk eget galleri";form.elements.description.value="Oprettet af et medlem";form.querySelector("button[type=submit]").click();form.querySelector("button[type=submit]").click();})()');
      await waitForCreates(1);assert.deepEqual(site.galleryCreates[0],{name:'Syntetisk eget galleri',description:'Oprettet af et medlem'});
      assert(await run('document.querySelector("#new button[type=submit]").disabled&&!'+created));
      site.releaseGalleryCreate('Syntetisk oprettelsesfejl');await wait('document.querySelector("#new .error").textContent.includes("Syntetisk oprettelsesfejl")','gallery creation failure');
      assert(await run('document.querySelector("#modal").matches(":modal")&&!document.querySelector("#new button[type=submit]").disabled&&!'+created));
      assert.equal(await run('document.querySelectorAll("[data-gallery]").length'),2);
    });

    await t.test('an acknowledged member gallery appears in the overview and allows its creator to upload',async()=>{
      await run('document.querySelector("#new button[type=submit]").click()');await waitForCreates(2);site.releaseGalleryCreate();
      await wait('!document.querySelector("#modal").open&&!!'+created,'created member gallery card');
      const card=await run(created+'.textContent');assert(card.includes('Syntetisk eget galleri'));assert(card.includes('Oprettet af et medlem'));assert(card.includes('0 billeder'));
      assert(await run('!document.querySelector("[data-view=people]")&&!document.querySelector("[data-view=design]")'));
      await run(created+'.click()');await wait('!!document.querySelector("#upload")','creator upload permission');
      assert.equal(await run('document.querySelectorAll("[data-photo]").length'),0);
      assert.match(await run('document.querySelector("#content").textContent'),/Syntetisk eget galleri/);
    });

    await t.test('an older backend without gallery_create keeps member creation hidden',async()=>{
      site.disableGalleryCreate();await call('Page.reload');await wait('!!'+created,'existing creator gallery after reload');
      assert(await run('!document.querySelector("#new-gallery")&&!document.querySelector("[data-view=people]")&&!document.querySelector("[data-view=design]")'));
      assert.equal(site.galleryCreates.length,2);
    });
  }finally{if(browser)await browser.close();await site.close();}
});
