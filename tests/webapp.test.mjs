import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(read('public/manifest.webmanifest'));
const workerSource=read('public/service-worker.js'),installerSource=read('public/static/pwa.js');

test('manifest installs at the current root or subdirectory without an invitation URL',()=>{
  for(const base of ['https://example.test/','https://example.test/LexGalleri/']){
    const url=new URL('manifest.webmanifest',base);
    for(const key of ['id','scope','start_url'])assert.equal(new URL(manifest[key],url).href,base);
    for(const icon of manifest.icons){assert(new URL(icon.src,url).href.startsWith(base+'static/'));assert.equal(icon.type,'image/png');}
  }
  assert.equal(manifest.display,'standalone');assert.equal(manifest.lang,'da');
  assert(!JSON.stringify(manifest).includes('invite'));
});
test('install icons have real PNG payloads and required sizes',()=>{
  for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]){
    const data=fs.readFileSync(new URL('../public/static/'+name,import.meta.url));
    assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size);
  }
});
function worker(scope,fetcher=async()=>new Response('network')){
  const handlers=new Map(),calls=[];
  const self={registration:{scope},addEventListener:(name,fn)=>handlers.set(name,fn),skipWaiting:async()=>calls.push('skipWaiting'),clients:{claim:async()=>calls.push('claim')}};
  vm.runInNewContext(workerSource,{self,URL,Response,fetch:fetcher});
  function request(path,options={}){
    const req={url:new URL(path,scope).href,method:'GET',mode:'navigate',credentials:'include',...options};let reply;
    handlers.get('fetch')({request:req,respondWith(value){reply=value;}});return {req,reply};
  }
  return {handlers,calls,request};
}
test('worker installs and activates without reloading clients',async()=>{
  const f=worker('https://example.test/LexGalleri/');
  for(const name of ['install','activate']){let task;f.handlers.get(name)({waitUntil(value){task=value;}});await task;}
  assert.deepEqual(f.calls,['skipWaiting','claim']);
});
test('worker never intercepts API, private media, writes, assets or another installation',()=>{
  const f=worker('https://example.test/LexGalleri/');
  for(const path of ['api/me','api/photos/abc/image?size=original','api/photos/abc/video','static/app.js','manifest.webmanifest','../other/']){
    assert.equal(f.request(path).reply,undefined,path);
  }
  assert.equal(f.request('./',{method:'POST'}).reply,undefined);
  assert.equal(f.request('./',{mode:'cors'}).reply,undefined);
  assert.equal(f.request('https://other.test/LexGalleri/').reply,undefined);
});
test('online navigation forwards the original request and preserves access failures',async()=>{
  let forwarded;const response=new Response('Access denied',{status:403});
  const f=worker('https://example.test/LexGalleri/',async req=>{forwarded=req;return response;});
  const r=f.request('./?invite=synthetic-token');assert.equal(await r.reply,response);assert.equal(forwarded,r.req);
});
test('offline message contains no invitation token, account data or cached family files',async()=>{
  for(const scope of ['https://example.test/','https://example.test/LexGalleri/']){
    const f=worker(scope,async()=>{throw Error('network down');});
    const response=await f.request('./?invite=synthetic-token').reply,html=await response.text();
    assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert(html.includes('Ingen forbindelse'));assert(!html.includes('synthetic-token'));assert(!html.includes('?invite='));
    assert(html.includes('href="'+new URL(scope).pathname+'"'));assert(response.headers.get('content-security-policy').includes("default-src 'none'"));
  }
});
function installer({base='/LexGalleri',secure=true,standalone=false,appleStandalone=false,workerSupport=true}={}){
  const elements=[],events=new Map(),mediaEvents=new Map(),registrations=[];
  const make=tag=>({tag,children:[],attributes:{},open:false,hidden:false,disabled:false,textContent:'',listeners:new Map(),
    append(...nodes){this.children.push(...nodes);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(name,fn){this.listeners.set(name,fn);},showModal(){this.open=true;},close(){this.open=false;}});
  const document={currentScript:{src:'https://example.test'+base+'/static/pwa.js?v=version'},createElement:make,createTextNode:text=>({textContent:text}),body:{append(...nodes){elements.push(...nodes);}}};
  const display={matches:standalone,addEventListener:(name,fn)=>mediaEvents.set(name,fn)};
  const navigator={standalone:appleStandalone};
  if(workerSupport)navigator.serviceWorker={register:async(...args)=>{registrations.push(args);}};
  const window={isSecureContext:secure,matchMedia:()=>display,addEventListener:(name,fn)=>events.set(name,fn)};
  vm.runInNewContext(installerSource,{document,navigator,window,URL});
  return {elements,events,mediaEvents,display,registrations,button:elements.find(x=>x.id==='pwa-install'),help:elements.find(x=>x.id==='pwa-install-help')};
}
test('installer registers only the current installation and bypasses worker script caching',()=>{
  for(const base of ['', '/LexGalleri']){
    const f=installer({base});assert.equal(f.registrations[0][0],base+'/service-worker.js');
    assert.equal(f.registrations[0][1].scope,base+'/');assert.equal(f.registrations[0][1].updateViaCache,'none');
    assert.equal(f.button.hidden,false);assert.equal(f.button.attributes['aria-controls'],f.help.id);
  }
});
test('unsupported or insecure browser keeps ordinary gallery behavior',()=>{
  for(const options of [{secure:false},{workerSupport:false}]){const f=installer(options);assert.equal(f.elements.length,0);assert.equal(f.registrations.length,0);}
});
test('installed app hides installation controls in browser and iOS standalone modes',()=>{
  for(const options of [{standalone:true},{appleStandalone:true}])assert.equal(installer(options).button.hidden,true);
  const f=installer();f.display.matches=true;f.mediaEvents.get('change')();assert.equal(f.button.hidden,true);
});
test('manual installation opens a separate help dialog without touching gallery nodes',async()=>{
  const f=installer();await f.button.listeners.get('click')();assert.equal(f.help.open,true);
  assert.equal(f.help.attributes['aria-labelledby'],'pwa-install-title');assert.equal(f.elements.length,2);
  const close=f.help.children[0].children[1];close.onclick();assert.equal(f.help.open,false);
});
test('native install prompt is used once and accepted installation hides its button',async()=>{
  const f=installer();let prompted=0,prevented=0;
  f.events.get('beforeinstallprompt')({preventDefault(){prevented++;},prompt:async()=>prompted++,userChoice:Promise.resolve({outcome:'accepted'})});
  await f.button.listeners.get('click')();assert.equal(prompted,1);assert.equal(prevented,1);assert.equal(f.button.hidden,true);assert.equal(f.button.disabled,false);
});
test('dismissed or failing installation leaves the gallery usable',async()=>{
  const f=installer();f.events.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{},userChoice:Promise.resolve({outcome:'dismissed'})});
  await f.button.listeners.get('click')();assert.equal(f.button.hidden,false);assert.equal(f.button.disabled,false);
  await f.button.listeners.get('click')();assert.equal(f.help.open,true);
  const g=installer();g.events.get('beforeinstallprompt')({preventDefault(){},prompt:async()=>{throw Error('browser refused');}});
  await g.button.listeners.get('click')();assert.equal(g.help.open,true);assert.equal(g.button.disabled,false);
});
test('browser installation event closes help and hides duplicate install controls',async()=>{
  const f=installer();await f.button.listeners.get('click')();f.events.get('appinstalled')();assert.equal(f.help.open,false);assert.equal(f.button.hidden,true);
});
