import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=fs.readFileSync(new URL('../public/static/app.js', import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'');
function fixture(){
 const elements=new Map();
 const doc={currentScript:{src:'https://example.test/LexGalleri/static/app.js'},querySelector(q){if(!elements.has(q))elements.set(q,{innerHTML:'',style:{},addEventListener(){},close(){},showModal(){},open:false});return elements.get(q)},querySelectorAll(){return[]},documentElement:{style:{setProperty(){}}},body:{style:{}}};
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
