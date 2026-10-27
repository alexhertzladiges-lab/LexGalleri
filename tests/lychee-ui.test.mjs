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
 const f=fixture(),calls=[];f.ctx.testApi=async(...args)=>{calls.push(args);if(args[0].endsWith('/start'))return status('running');if(args[0].endsWith('/step'))return status('completed');return[]};f.ctx.job=status('preview');f.run("api=globalThis.testApi;lycheeGeneration=5;globalThis.session={generation:5,cancelled:false,busy:false,stopRequested:false,error:'',data:job};lycheeSession=session");await f.run("lycheeAction(session,'start')");assert.deepEqual(calls.map(a=>a[0]),['/admin/lychee-import/start','/admin/lychee-import/step','/galleries']);assert.equal(calls[0][2].confirm,true);assert.equal(calls[0][2].job_id,'job-1');
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
