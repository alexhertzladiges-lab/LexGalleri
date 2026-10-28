import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../public/static/app.js', import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'');
function fixture(){
 const elements=new Map();
 const doc={currentScript:{src:'https://example.test/LexGalleri/static/app.js'},querySelector(q){if(!elements.has(q)){const classes=new Set(),attributes=new Map();elements.set(q,{innerHTML:'',style:{},listeners:new Map(),classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,force){const on=force??!classes.has(value);if(on)classes.add(value);else classes.delete(value);return on;}},setAttribute:(key,value)=>attributes.set(key,String(value)),getAttribute:key=>attributes.get(key)??null,addEventListener(type,handler){this.listeners.set(type,handler)},close(){this.open=false;this.listeners.get('close')?.();},showModal(){this.open=true;},open:false});}return elements.get(q)},querySelectorAll(){return[]},documentElement:{style:{setProperty(){}}},body:{style:{}}};
 const ctx=vm.createContext({document:doc,URL,setTimeout,clearTimeout,console,FormData,Blob});vm.runInContext(source,ctx);
 vm.runInContext("me={admin:true};view='lychee';globalThis.draws=[];globalThis.messages=[];lycheeDraw=()=>draws.push('paint');toast=s=>messages.push(s)",ctx);
 return{ctx,elements,run:s=>vm.runInContext(s,ctx)};
}
function status(state){return{configured:true,migration_needed:false,source_version:'6.6.12',job:{id:'job-1',state,totals:{photos:1,pending:state==='completed'?0:1,imported:state==='completed'?1:0},preview:[]}}}
function drawnFixture(data,options={}){
 const f=fixture();vm.runInContext(source.slice(source.indexOf('function lycheeDraw('),source.indexOf('async function lycheeLoop(')),f.ctx);f.ctx.job=data;f.ctx.sessionOptions=options;f.run("lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',transferMode:'copy',confirmed:false,data:job,...sessionOptions};lycheeSession=session;lycheeDraw(session)");return f;
}
function renderStatus(data,options={}){return drawnFixture(data,options).elements.get('#lychee-import').innerHTML;}
function moveStatus(state){const data=status(state);data.move_available=true;data.move_migration_needed=false;data.job.transfer_mode='move';data.job.mode_locked=['running','paused','completed'].includes(state);data.job.moved_files=state==='completed'?1:0;return data;}
test('unconfigured importer explains both files without claiming database tables are missing', () => {
 const html=renderStatus({configured:false,migration_needed:true,source_version:'6.6.12',job:null});
 assert(html.includes('Gør importøren klar'));
 assert(html.includes('<code>lychee-import.php</code>'));
 assert(html.includes('<code>config/lychee-import.php</code>'));
 assert(html.includes('ved siden af <code>app.php</code>'));
 assert(html.includes('<code>true</code> uden anførselstegn'));
 assert(!html.includes('Importtabellerne mangler'));
 assert(!html.includes('data-lychee="scan"'));
});
test('configured importer shows a confirmed missing database migration', () => {
 const html=renderStatus({configured:true,migration_needed:true,source_version:'6.6.12',job:null});
 assert(html.includes('Importtabellerne mangler'));
 assert(!html.includes('Gør importøren klar'));
 assert(!html.includes('data-lychee="scan"'));
});
test('configured importer with installed tables offers the initial preview', () => {
 const html=renderStatus({configured:true,migration_needed:false,source_version:'6.6.12',job:null});
 assert(html.includes('Lav prøvevisning'));
 assert(html.includes('data-lychee="scan"'));
 assert(!html.includes('Importtabellerne mangler'));
 assert(!html.includes('Gør importøren klar'));
});
test('status preview does not start copying', async () => {
 const f=fixture(),calls=[];f.ctx.testApi=async(...args)=>{calls.push(args);return status('preview')};f.run('api=globalThis.testApi');await f.run('lycheeView()');assert.equal(calls.length,1);assert.equal(calls[0][0],'/admin/lychee-import');
});
test('revisiting a running job requires explicit resume', async () => {
 const f=fixture(),calls=[];f.ctx.testApi=async(...args)=>{calls.push(args);return status('running')};f.run('api=globalThis.testApi');await f.run('lycheeView()');assert.equal(calls.length,1);
});
test('navigation stops further batches and stale DOM writes', async () => {
 const f=fixture(),calls=[];let finish;f.ctx.testApi=(...args)=>{calls.push(args);return new Promise(r=>{finish=r})};f.ctx.job=status('running');f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',data:job};lycheeSession=session;globalThis.work=lycheeAction(session,'continue')");
 assert.equal(calls.length,1);const paints=f.ctx.draws.length;f.run("stopLycheeView();view='galleries'");finish(status('running'));await f.ctx.work;assert.equal(calls.length,1);assert.equal(f.ctx.draws.length,paints);
});
test('errors stop the loop without automatic retry', async () => {
 const f=fixture(),calls=[];f.ctx.testApi=async(...args)=>{calls.push(args);throw Error('test network failure')};f.ctx.job=status('running');f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',data:job};lycheeSession=session");await f.run("lycheeAction(session,'continue')");assert.equal(calls.length,1);assert.equal(f.ctx.session.busy,false);assert.equal(f.ctx.session.error,'test network failure');
});
test('explicit start confirms current job and advances one batch at a time', async () => {
 const f=fixture(),calls=[];f.ctx.testApi=async(...args)=>{calls.push(args);if(args[0].endsWith('/start'))return status('running');if(args[0].endsWith('/step'))return status('completed');return[]};f.ctx.job=status('preview');f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',confirmed:true,data:job};lycheeSession=session");await f.run("lycheeAction(session,'start')");assert.deepEqual(calls.map(a=>a[0]),['/admin/lychee-import/start','/admin/lychee-import/step','/galleries']);assert.equal(calls[0][2].confirm,true);assert.equal(calls[0][2].job_id,'job-1');assert.equal(calls[0][2].transfer_mode,'copy');
});
test('pause waits for current batch then pauses without another copy request', async () => {
 const f=fixture(),calls=[];let finish;f.ctx.testApi=(...args)=>{calls.push(args);return args[0].endsWith('/step')?new Promise(r=>{finish=r}):Promise.resolve(status('paused'))};f.ctx.job=status('running');f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',data:job};lycheeSession=session;globalThis.work=lycheeAction(session,'continue')");f.ctx.session.stopRequested=true;finish(status('running'));await f.ctx.work;assert.deepEqual(calls.map(a=>a[0]),['/admin/lychee-import/step','/admin/lychee-import/pause']);
});
test('preview titles are escaped', async () => {
 const f=fixture();vm.runInContext(source.slice(source.indexOf('function lycheeDraw('),source.indexOf('async function lycheeLoop(')),f.ctx);f.ctx.job=status('preview');f.ctx.job.job.preview=[{title:'<img src=x onerror=alert(1)>',count:3}];f.run("lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',data:job};lycheeDraw(session)");const html=f.elements.get('#lychee-import').innerHTML;assert(!html.includes('<img src=x'));assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});
test('completed jobs allow rescan and escape the first 50 issues', async () => {
 const f=fixture();vm.runInContext(source.slice(source.indexOf('function lycheeDraw('),source.indexOf('async function lycheeLoop(')),f.ctx);f.ctx.job=status('completed');f.ctx.job.job.issues=Array.from({length:51},(_,i)=>({source_photo_id:`photo-${i}`,title:'<script>title</script>',error:'<img src=x>',status:'missing'}));f.run("lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',data:job};lycheeDraw(session)");const html=f.elements.get('#lychee-import').innerHTML;assert(html.includes('data-lychee="scan"'));assert(html.includes('photo-49'));assert(!html.includes('photo-50'));assert(html.includes('&lt;script&gt;title&lt;/script&gt;'));assert(html.includes('&lt;img src=x&gt;'));assert(!html.includes('<script>'));
});
test('source details escape metadata, use named fields, and are admin only', async () => {
 const f=fixture();f.ctx.photo={import_source:{version:'6.6.12',owner_name:'<b>Owner</b>',description:'<script>description</script>',tags:['one','<tag>'],source_photo_id:'photo-1',uploads_root:'/private/path',db_password:'do-not-display'}};let html=f.run('lycheePhotoProvenance(photo)');assert(html.includes('&lt;b&gt;Owner&lt;/b&gt;'));assert(html.includes('&lt;script&gt;description&lt;/script&gt;'));assert(html.includes('&lt;tag&gt;'));assert(!html.includes('/private/path'));assert(!html.includes('do-not-display'));assert(html.includes('administratoren, der udførte overførslen'));f.run('me.admin=false');assert.equal(f.run('lycheePhotoProvenance(photo)'),'');
});
test('capped album preview states that all albums will be copied', async () => {
 const f=fixture();vm.runInContext(source.slice(source.indexOf('function lycheeDraw('),source.indexOf('async function lycheeLoop(')),f.ctx);f.ctx.job=status('preview');f.ctx.job.job.totals.albums=120;f.ctx.job.job.preview=[{title:'First album',count:3}];f.run("lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',data:job};lycheeDraw(session)");const html=f.elements.get('#lychee-import').innerHTML;assert(html.includes('Viser 1 af 120 albummer'));assert(html.includes('kopieringen omfatter alle albummer'));
});
test('a legacy backend keeps copy available and explains that move needs an update',()=>{
 const html=renderStatus(status('preview'));
 assert(html.includes('<option value="copy" selected>'));
 assert.match(html,/<option value="move"[^>]*disabled>/);
 assert(html.includes('opdaterede private importør'));
 assert(html.includes('Originalerne bliver i Lychee'));
});
test('an unavailable move displays its escaped reason and migration step',()=>{
 const data=status('preview');data.move_available=false;data.move_migration_needed=true;data.move_unavailable_reason='<img src=x> mangler';
 const html=renderStatus(data);
 assert(html.includes('&lt;img src=x&gt; mangler'));
 assert(!html.includes('<img src=x>'));
 assert(html.includes('003_lychee_move.sql'));
 assert(html.includes('Lav ny prøvevisning'));
});
test('choosing move changes its explanation and requires a new confirmation',()=>{
 const f=drawnFixture(moveStatus('preview'));
 f.elements.get('#lychee-confirm').onchange({target:{checked:true}});
 assert.equal(f.ctx.session.confirmed,true);
 assert.equal(f.elements.get('#lychee-start').disabled,false);
 f.elements.get('#lychee-transfer-mode').onchange({target:{value:'move'}});
 const html=f.elements.get('#lychee-import').innerHTML;
 assert.equal(f.ctx.session.transferMode,'move');
 assert.equal(f.ctx.session.confirmed,false);
 assert.equal(f.elements.get('#lychee-confirm').checked,false);
 assert.equal(f.elements.get('#lychee-start').disabled,true);
 assert(html.includes('Originalerne flyttes til LexGalleri'));
 assert(html.includes('Start flytning'));
 assert(html.includes('vil flytte originalerne fra Lychee til LexGalleri'));
 assert(html.includes('plads til nye visningsbilleder og miniaturer'));
 assert(!html.includes('Originalerne bliver i Lychee'));
});
test('changing back to copy clears the move confirmation too',()=>{
 const f=drawnFixture(moveStatus('preview'),{transferMode:'move',confirmed:true});
 f.elements.get('#lychee-transfer-mode').onchange({target:{value:'copy'}});
 assert.equal(f.ctx.session.transferMode,'copy');
 assert.equal(f.ctx.session.confirmed,false);
 assert.equal(f.elements.get('#lychee-start').disabled,true);
 assert(f.elements.get('#lychee-import').innerHTML.includes('Originalerne bliver i Lychee'));
});
test('an unconfirmed preview never starts an import',async()=>{
 const f=fixture(),calls=[];f.ctx.job=moveStatus('preview');f.ctx.testApi=async(...args)=>{calls.push(args);return moveStatus('running')};
 f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',transferMode:'move',confirmed:false,data:job};lycheeSession=session");
 await f.run("lycheeAction(session,'start')");assert.equal(calls.length,0);
});
test('a confirmed move starts with the selected mode and advances only after start',async()=>{
 const f=fixture(),calls=[];f.ctx.job=moveStatus('preview');f.ctx.testApi=async(...args)=>{calls.push(args);if(args[0].endsWith('/start'))return moveStatus('running');if(args[0].endsWith('/step'))return moveStatus('completed');return[]};
 f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',transferMode:'move',confirmed:true,data:job};lycheeSession=session");
 await f.run("lycheeAction(session,'start')");
 assert.deepEqual(calls.map(a=>a[0]),['/admin/lychee-import/start','/admin/lychee-import/step','/galleries']);
 assert.equal(calls[0][2].transfer_mode,'move');assert.equal(calls[0][2].confirm,true);
});
test('resuming a locked move preserves its mode despite a stale local copy selection',async()=>{
 const f=fixture(),calls=[];f.ctx.job=moveStatus('paused');f.ctx.job.move_available=false;f.ctx.testApi=async(...args)=>{calls.push(args);if(args[0].endsWith('/start'))return moveStatus('running');if(args[0].endsWith('/step'))return moveStatus('completed');return[]};
 f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',transferMode:'copy',confirmed:false,data:job};lycheeSession=session");
 await f.run("lycheeAction(session,'start')");
 assert.equal(calls[0][2].transfer_mode,'move');
 const html=renderStatus(f.ctx.job,{transferMode:'copy'});
 assert(html.includes('Fortsæt flytning'));
 assert(html.includes('Flytning sat på pause'));
});
test('move becoming unavailable never silently starts copying',async()=>{
 const f=fixture(),calls=[];f.ctx.job=moveStatus('preview');f.ctx.job.move_available=false;f.ctx.job.move_unavailable_reason='Ny prøvevisning kræves';f.ctx.testApi=async(...args)=>{calls.push(args);return[]};
 f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',transferMode:'move',confirmed:true,data:job};lycheeSession=session");
 await f.run("lycheeAction(session,'start')");
 assert.equal(calls.length,0);assert.equal(f.ctx.session.error,'Ny prøvevisning kræves');
});
test('a locked move preview displays the stored mode and moved-original count',()=>{
 const data=moveStatus('preview');data.job.mode_locked=true;data.job.moved_files=4;
 const html=renderStatus(data,{transferMode:'copy'});
 assert(!html.includes('id="lychee-transfer-mode"'));
 assert(html.includes('Overførselsmetode: <strong>Flyt originalerne</strong>'));
 assert(html.includes('<strong>4</strong> originaler flyttet'));
 assert(html.includes('Start flytning'));
});

function mediaPhoto(overrides={}){return{id:'photo-1',gallery_id:'gallery-1',mime:'video/mp4',title:'Video fra haven',taken:'2026-07-14T12:30',precision:'exact',place:'Haven',lat:null,lon:null,uploader_name:'Familien',uploaded:'2026-07-15T09:00:00Z',favorite:false,...overrides};}
async function mediaFixture(rights,overrides={}){
 const f=fixture(),calls=[];f.ctx.photo=mediaPhoto(overrides);f.ctx.testApi=async(...args)=>{calls.push(args);return{permissions:rights}};
 f.run('api=globalThis.testApi;me={admin:false};photos=[photo]');await f.run('showPhoto(photo.id)');
 return{...f,calls,html:f.elements.get('#modal').innerHTML};
}
test('gallery grids use lazy authenticated thumbnails and label videos without loading them',()=>{
 const f=fixture();f.ctx.media=[mediaPhoto({title:'<script>Video</script>',taken:'<bad-date>'}),mediaPhoto({id:'photo-2',mime:'image/jpeg',title:'Et foto'})];
 f.run('drawPhotos(media)');const html=f.elements.get('#photo-grid').innerHTML;
 assert.equal((html.match(/class="video-badge"/g)||[]).length,1);
 assert(html.includes('▶ Video'));
 assert(html.includes('src="/LexGalleri/api/photos/photo-1/image"'));
 assert.equal((html.match(/loading="lazy"/g)||[]).length,2);
 assert(html.includes('&lt;script&gt;Video&lt;/script&gt;'));
 assert(html.includes('&lt;bad'));
 assert(!html.includes('<script>'));
 assert(!html.includes('<video'));
 assert(!html.includes('/video"'));
});
test('video playback renders native controls only with explicit permission and escapes displayed metadata',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{id:'photo-"<>&',title:'<img src=x onerror="bad">',taken:'<time>T12:30',import_source:{description:'<script>source</script>'}});
 assert.match(f.html,/<video id="photo-video" controls playsinline preload="metadata"/);
 assert(f.html.includes('poster="/LexGalleri/api/photos/photo-%22%3C%3E%26/image?size=view"'));
 assert(f.html.includes('src="/LexGalleri/api/photos/photo-%22%3C%3E%26/video"'));
 assert(f.html.includes('aria-label="&lt;img src=x onerror=&quot;bad&quot;&gt;"'));
 assert(f.html.includes('&lt;time&gt; kl. 12:30'));
 assert(f.html.includes('Hent original med metadata'));
 assert(!f.html.includes('autoplay'));
 assert(!f.html.includes('<img src=x'));
 assert(!f.html.includes('<script>'));
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0][0],'/galleries/gallery-1/photos');
});
test('missing, denied, or truthy nonboolean video permission never renders a video source',async()=>{
 for(const rights of [{},{video:false,download:true,gps:false},{video:false,download:false,gps:true},{video:'true',download:true,gps:true}]){
  const f=await mediaFixture(rights);
  assert(!f.html.includes('<video'));
  assert(!f.html.includes('/video"'));
  assert(f.html.includes('src="/LexGalleri/api/photos/photo-1/image?size=view"'));
  assert(f.html.includes('Du har ikke adgang til at afspille denne video'));
  assert(!f.elements.get('#photo-video')?.listeners.has('error'));
  assert.equal(f.calls.length,1);
  assert.equal(f.html.includes('Hent original med metadata'),!!(rights.download&&rights.gps));
 }
});
test('ordinary photos retain the image viewer even when video playback is permitted',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{mime:'image/jpeg'});
 assert(f.html.includes('<img src="/LexGalleri/api/photos/photo-1/image?size=view"'));
 assert(f.html.includes('Historien bag billedet'));
 assert(!f.html.includes('<video'));
 assert(!f.html.includes('adgang til at afspille'));
});
test('compact viewer keeps overlay arrows on the media and all metadata behind one collapsed Info control',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{mime:'image/jpeg',title:'Sommer i haven',place:'Haven'});
 assert.equal(f.elements.get('#modal').classList.contains('photo-dialog'),true);
 assert.match(f.html,/class="photo-stage"/);
 assert.match(f.html,/id="photo-info-toggle"[^>]*aria-expanded="false"/);
 assert.match(f.html,/aria-controls="photo-info"/);
 assert.match(f.html,/<[^>]*id="photo-info"[^>]*hidden/);
 const info=f.html.indexOf('id="photo-info"'),before=f.html.slice(0,info),details=f.html.slice(info);
 assert(before.includes('id="prev"')&&before.includes('id="next"'));
 assert.match(before,/aria-label="Forrige[^"]*"/);assert.match(before,/aria-label="Næste[^"]*"/);
 assert(!before.includes('<dl>'));assert(!before.includes('Uploadet af'));assert(!before.includes('id="favorite"'));
 for(const expected of ['Sommer i haven','Optaget','Sted','Uploadet af','Uploadtidspunkt','id="favorite"','Hent original med metadata'])assert(details.includes(expected),expected);
 assert.equal(f.elements.get('#prev').disabled,true);assert.equal(f.elements.get('#next').disabled,true);
});
test('Info expands in place without replacing media, pausing video or issuing requests',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true});const toggle=f.elements.get('#photo-info-toggle'),panel=f.elements.get('#photo-info'),player=f.elements.get('#photo-video'),dialog=f.elements.get('#modal');
 toggle.setAttribute('aria-expanded','false');panel.hidden=true;let pauses=0,replacements=0;player.pause=()=>pauses++;
 const html=dialog.innerHTML;Object.defineProperty(dialog,'innerHTML',{get:()=>html,set:()=>replacements++});const calls=f.calls.length;
 toggle.onclick();assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
 toggle.onclick();assert.equal(panel.hidden,true);assert.equal(toggle.getAttribute('aria-expanded'),'false');
 assert.equal(f.elements.get('#photo-video'),player);assert.equal(replacements,0);assert.equal(pauses,0);assert.equal(f.calls.length,calls);
});
test('arrow navigation respects photo boundaries and keyboard focus without rebuilding the gallery',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{mime:'image/jpeg'});f.ctx.other=mediaPhoto({id:'photo-2',mime:'image/jpeg',title:'Næste syntetiske billede'});f.run('photos.push(other)');await f.run('showPhoto(photo.id)');
 const dialog=f.elements.get('#modal'),keydown=dialog.listeners.get('keydown');assert.equal(typeof keydown,'function');
 const event=(key,blocked=false)=>({key,defaultPrevented:false,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,target:{closest:()=>blocked?{}:null},preventDefault(){this.prevented=true;}});
 const count=f.calls.length;await f.elements.get('#prev').onclick();assert.equal(f.calls.length,count,'the first arrow must stay within bounds');
 for(const blocked of [true]){const input=event('ArrowRight',blocked);await keydown(input);assert.equal(f.calls.length,count);assert(!input.prevented);}
 for(const flags of [{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true},{defaultPrevented:true},{repeat:true}]){const modified={...event('ArrowRight'),...flags};await keydown(modified);assert.equal(f.calls.length,count);assert(!modified.prevented);}
 const next=event('ArrowRight');await keydown(next);await Promise.resolve();assert.equal(f.calls.length,count+1);assert(next.prevented);assert(dialog.innerHTML.includes('Næste syntetiske billede'));
 assert.equal(f.elements.get('#next').disabled,true);assert.equal(f.elements.get('#prev').disabled,false);
 await f.elements.get('#next').onclick();assert.equal(f.calls.length,count+1,'the last arrow must stay within bounds');
 const previous=event('ArrowLeft');await keydown(previous);await Promise.resolve();assert.equal(f.calls.length,count+2);assert(previous.prevented);
 f.run("modal('Redigér','<input>')");assert.equal(dialog.classList.contains('photo-dialog'),false);const generic=event('ArrowRight');await keydown(generic);assert.equal(f.calls.length,count+2);
});
test('previous and next follow the filtered and sorted thumbnail order',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{mime:'image/jpeg'});
 f.ctx.second=mediaPhoto({id:'photo-2',mime:'image/jpeg',title:'Vises først'});f.ctx.hidden=mediaPhoto({id:'photo-3',mime:'image/jpeg',title:'Skjult af søgning'});
 f.run('photos.push(second,hidden);drawPhotos([second,photo])');
 f.ctx.document.querySelectorAll=q=>q==='[data-photo]'?[...f.elements.get('#photo-grid').innerHTML.matchAll(/data-photo="([^"]+)"/g)].map(match=>({dataset:{photo:match[1]}})):[];
 await f.run('showPhoto(second.id)');
 assert.equal(f.elements.get('#prev').disabled,true);assert.equal(f.elements.get('#next').disabled,false);
 const before=f.calls.length;await f.elements.get('#next').onclick();assert.equal(f.calls.length,before+1);
 assert.equal(f.elements.get('#prev').disabled,false);assert.equal(f.elements.get('#next').disabled,true);
 assert(!f.elements.get('#modal').innerHTML.includes('Skjult af søgning'));
 await f.elements.get('#next').onclick();assert.equal(f.calls.length,before+1,'navigation must not enter a photo filtered out of the current grid');
});
test('native playback errors show a download suggestion only when original download is allowed',async()=>{
 for(const rights of [{video:true,download:true,gps:true},{video:true,download:true,gps:false}]){
  const f=await mediaFixture(rights),player=f.elements.get('#photo-video'),message=f.elements.get('#video-playback-error');
  assert(f.html.includes('id="video-playback-error" class="media-notice" role="status" hidden'));
  player.listeners.get('error')();
  assert.equal(message.hidden,false);
  assert(message.textContent.includes('Browseren kan ikke afspille denne video.'));
  assert.equal(message.textContent.includes('Hent originalen'),!!(rights.download&&rights.gps));
 }
});
test('closing or replacing the modal pauses video playback',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true});let pauses=0,renders=0;
 f.elements.get('#photo-video').pause=()=>pauses++;f.ctx.testRender=async()=>renders++;f.run('render=globalThis.testRender');
 f.elements.get('#modal').close();
 assert.equal(pauses,1);assert.equal(renders,0);
 f.run("modal('En anden dialog','<p>Indhold</p>')");
 assert.equal(pauses,2);
});
test('closing the photo overlay keeps loaded thumbnails, search, sort and scroll without requests',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{mime:'image/jpeg'});
 f.run("view='galleries';current={id:'gallery-1'}");
 const grid=f.elements.get('#photo-grid')||f.run("$('#photo-grid')"),search=f.run("$('#search-photo')"),sort=f.run("$('#sort')");
 const image={src:'/LexGalleri/api/photos/photo-1/image',complete:true};grid.innerHTML='<article>Loaded thumbnail</article>';grid.images=[image];grid.scrollTop=830;search.value='sommer';sort.value='uploaded';
 let renders=0;f.ctx.testRender=async()=>renders++;f.run('render=globalThis.testRender');const initialCalls=f.calls.length;
 f.elements.get('#modal').close();
 assert.equal(renders,0);assert.equal(f.calls.length,initialCalls);
 assert.equal(f.elements.get('#photo-grid'),grid);assert.equal(grid.images[0],image);assert.equal(grid.innerHTML,'<article>Loaded thumbnail</article>');
 assert.equal(search.value,'sommer');assert.equal(sort.value,'uploaded');assert.equal(grid.scrollTop,830);
});
test('the close button uses the same lightweight close behavior as native Escape',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true});let closes=0,renders=0;
 f.ctx.testRender=async()=>renders++;f.run('render=globalThis.testRender');const initialCalls=f.calls.length;
 f.elements.get('#modal').close=()=>{closes++;f.elements.get('#modal').open=false;f.elements.get('#modal').listeners.get('close')()};
 f.elements.get('#close-modal').onclick();
 assert.equal(closes,1);assert.equal(renders,0);assert.equal(f.calls.length,initialCalls);
});
test('toggling a favorite updates its caption without replacing the loaded image or viewer',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{mime:'image/jpeg'});f.run("view='galleries';current={id:'gallery-1'}");
 const title={textContent:''},details={textContent:''},caption={children:[title,details]},image={complete:true};
 const button={dataset:{photo:'photo-1'},querySelector:q=>q==='.caption'?caption:null,image};
 f.ctx.document.querySelectorAll=q=>q==='[data-photo]'?[button]:[];
 const modal=f.elements.get('#modal'),html=modal.innerHTML;let replacements=0;
 Object.defineProperty(modal,'innerHTML',{get:()=>html,set:()=>replacements++});
 await f.elements.get('#favorite').onclick();
 assert.equal(f.ctx.photo.favorite,true);assert.equal(details.textContent,'♥ 2026');assert.equal(title.textContent,'Video fra haven');
 assert.equal(button.image,image);assert.equal(replacements,0);assert.equal(f.calls.length,2);assert.equal(f.calls[1][0],'/photos/photo-1/favorite');
 assert.equal(f.elements.get('#favorite').textContent,'♥ Fjern favorit');
});
test('unfavoriting removes only that card on close and leaves the other thumbnail loaded',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{mime:'image/jpeg',favorite:true});
 f.ctx.other=mediaPhoto({id:'photo-2',favorite:true});f.run("view='favorites';current=null;photos.push(other)");
 const removed=[],image1={complete:true},image2={complete:true};
 const buttons=['photo-1','photo-2'].map((id,i)=>({dataset:{photo:id},image:i?image2:image1,querySelector:()=>({children:[{},{}]}),closest:()=>({remove:()=>removed.push(id)})}));
 f.ctx.document.querySelectorAll=q=>q==='[data-photo]'?buttons:[];
 const grid=f.run("$('#photo-grid')");grid.innerHTML='Two existing thumbnail nodes';
 await f.elements.get('#favorite').onclick();assert.deepEqual(removed,[]);
 f.elements.get('#modal').close();
 assert.deepEqual(removed,['photo-1']);assert.equal(buttons[1].image,image2);assert.equal(grid.innerHTML,'Two existing thumbnail nodes');
 assert.equal(f.run('photos.length'),1);assert.equal(f.calls.length,2);assert.equal(f.elements.get('#photo-count').textContent,'1 billeder, du har adgang til');
});
test('a favorite toggled off and on before closing retains the same card',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true},{favorite:true});f.run("view='favorites';current=null");
 let removed=0;const button={dataset:{photo:'photo-1'},querySelector:()=>({children:[{},{}]}),closest:()=>({remove:()=>removed++})};
 f.ctx.document.querySelectorAll=q=>q==='[data-photo]'?[button]:[];
 await f.elements.get('#favorite').onclick();await f.elements.get('#favorite').onclick();
 f.elements.get('#modal').close();assert.equal(removed,0);assert.equal(f.run('photos.length'),1);assert.equal(f.ctx.photo.favorite,true);assert.equal(f.calls.length,3);
});
test('a delayed favorite request cannot change the next photo dialog or submit twice',async()=>{
 const f=await mediaFixture({video:true,download:true,gps:true});const first=f.elements.get('#favorite');let finish,calls=0;
 f.ctx.delayedApi=()=>{calls++;return new Promise(resolve=>{finish=resolve})};f.run('api=globalThis.delayedApi');
 const pending=first.onclick();assert.equal(first.disabled,true);await first.onclick();assert.equal(calls,1);
 const next={textContent:'♡ Gem som favorit'};f.elements.set('#favorite',next);
 finish({});await pending;
 assert.equal(first.textContent,'♥ Fjern favorit');assert.equal(first.disabled,false);assert.equal(next.textContent,'♡ Gem som favorit');assert.equal(f.ctx.photo.favorite,true);
});
test('closing during a delayed next-photo request never reopens the viewer or loads another image',async()=>{
 for(const close of ['close','cancel','button']){
  const f=await mediaFixture({video:true,download:true,gps:true});f.ctx.other=mediaPhoto({id:'photo-2',title:'Next photo'});f.run('photos.push(other)');await f.run('showPhoto(photo.id)');
  let finish,opens=0;f.ctx.delayedApi=()=>new Promise(resolve=>{finish=resolve});f.run('api=globalThis.delayedApi');
  const dialog=f.elements.get('#modal'),original=dialog.innerHTML;dialog.showModal=()=>opens++;
  const pending=f.elements.get('#next').onclick();
  if(close==='button')f.elements.get('#close-modal').onclick();else if(close==='close')dialog.close();else{dialog.listeners.get('cancel')();dialog.close();}
  finish({permissions:{video:true,download:true,gps:true}});await pending;
  assert.equal(dialog.innerHTML,original);assert.equal(opens,0);
 }
});
test('an older photo request cannot replace a newer dialog or a changed gallery',async()=>{
 for(const replace of ['dialog','gallery']){
  const f=await mediaFixture({video:true,download:true,gps:true});let finish;
  f.ctx.delayedApi=()=>new Promise(resolve=>{finish=resolve});f.run('api=globalThis.delayedApi');const pending=f.run('showPhoto(photo.id)');
  if(replace==='dialog')f.run("modal('Ny dialog','<p>Behold dette indhold</p>')");else f.run("current={id:'another-gallery'}");
  const currentHtml=f.elements.get('#modal').innerHTML;finish({permissions:{video:true}});await pending;
  assert.equal(f.elements.get('#modal').innerHTML,currentHtml);
 }
});
test('the import preview explains MP4 support before any transfer starts',()=>{
 const data={configured:true,migration_needed:false,job:null};
 assert(renderStatus(data).includes('JPEG, PNG, WebP og MP4-videoer kan importeres'));
 assert(renderStatus(moveStatus('preview'),{transferMode:'move'}).includes('JPEG, PNG, WebP og MP4-videoer understøttes'));
});
test('active-file progress escapes its label and formats bounded MB and GB values',()=>{
 const data=moveStatus('running');data.job.media_progress={label:'<img src=x> Kontrollerer video',done_bytes:512*1024**2,total_bytes:2*1024**3};
 let html=renderStatus(data,{transferMode:'move'});
 assert(html.includes('&lt;img src=x&gt; Kontrollerer video · 0,5 af 2 GB'));
 assert(html.includes('max="2147483648" value="536870912" aria-label="Fremdrift for aktuel fil"'));
 assert(!html.includes('<img src=x>'));
 data.job.media_progress={label:'Kopierer video',done_bytes:3*1024**2,total_bytes:2*1024**2};html=renderStatus(data);
 assert(html.includes('Kopierer video · 2 af 2 MB'));
 assert(html.includes('max="2097152" value="2097152"'));
 data.job.media_progress.done_bytes=-1;html=renderStatus(data);
 assert(html.includes('Kopierer video · 0 af 2 MB'));
 assert(html.includes('max="2097152" value="0"'));
});
test('invalid or unavailable active-file progress is omitted without changing transfer controls',()=>{
 for(const media_progress of [null,{}, {label:'Video',done_bytes:1,total_bytes:0},{label:'Video',done_bytes:Infinity,total_bytes:1024},{label:'Video',done_bytes:1,total_bytes:NaN},{label:'Video',done_bytes:1,total_bytes:Number.MAX_SAFE_INTEGER+1},{label:'Video',done_bytes:1.5,total_bytes:1024}]){
  const data=moveStatus('preview');data.job.media_progress=media_progress;const html=renderStatus(data,{transferMode:'move'});
  assert(!html.includes('lychee-media-progress'));
  assert(html.includes('Start flytning'));
  assert(html.includes('id="lychee-confirm"'));
 }
});
