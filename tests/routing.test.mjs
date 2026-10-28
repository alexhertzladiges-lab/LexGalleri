// Real Apache rewrite integration against an isolated document root. No network
// request leaves localhost; the production hostname is only an HTTP Host value.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {request as httpRequest,createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,cp,rm,chmod,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const apache=[process.env.TEST_APACHE_BINARY,'/usr/sbin/apache2','/usr/local/apache2/bin/httpd'].find(file=>file&&existsSync(file));
const modules=process.env.TEST_APACHE_MODULES||['/usr/lib/apache2/modules','/usr/local/apache2/modules'].find(existsSync);
const php=process.env.TEST_ROUTING_PHP||spawnSync('which',['php'],{encoding:'utf8'}).stdout.trim();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function stopped(child){return child.exitCode!==null||child.signalCode!==null;}
async function unusedPort(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
function request(port,path,method='GET',body='',host='lexan.dk'){
  return new Promise((resolve,reject)=>{
    const req=httpRequest({host:'127.0.0.1',port,path,method,headers:{Host:host,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:5000},response=>{
      const chunks=[];response.on('data',part=>chunks.push(part));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
    });req.once('error',reject);req.once('timeout',()=>req.destroy(Error('Synthetic Apache request timeout')));req.end(body);
  });
}
async function readable(path){await chmod(path,0o755);for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())await readable(file);else await chmod(file,entry.name==='index.php'?0o755:0o644);}}
async function fixture(names,rewriteBase=false){
  const directory=await mkdtemp(join(tmpdir(),'lexgalleri-routing-'));await chmod(directory,0o755);
  const docroot=join(directory,'public'),run=join(directory,'run');await mkdir(docroot,{mode:0o755});await mkdir(run,{mode:0o777});await chmod(run,0o777);
  const stub=name=>'#!'+php+'\n<?php\necho "Content-Type: application/json\\r\\n\\r\\n";echo json_encode(["physical"=>'+JSON.stringify(name)+',"uri"=>getenv("REQUEST_URI"),"method"=>getenv("REQUEST_METHOD"),"body"=>file_get_contents("php://stdin")]);\n';
  await writeFile(join(docroot,'.htaccess'),(rewriteBase?'RewriteEngine On\nRewriteBase /public/\n':'')+await readFile(process.env.TEST_ROUTING_ROOT_RULES||join(root,'hosting/root/.htaccess'),'utf8')+'\nRewriteRule ^old-note$ /unrelated.txt [END]\n');
  await writeFile(join(docroot,'unrelated.txt'),'unrelated site content');
  await mkdir(join(docroot,'subsite'));
  await writeFile(join(docroot,'subsite','.htaccess'),'RewriteEngine On\nRewriteRule ^old-note$ /subsite/child.txt [END]\n');
  await writeFile(join(docroot,'subsite','child.txt'),'unrelated child site content');
  await writeFile(join(docroot,'index.php'),stub('root'),{mode:0o755});
  for(const name of names){const target=join(docroot,name);await cp(join(root,'public'),target,{recursive:true});await chmod(target,0o755);await chmod(join(target,'static'),0o755);await writeFile(join(target,'index.php'),stub(name),{mode:0o755});await chmod(join(target,'index.php'),0o755);}
  await readable(docroot);
  const port=await unusedPort(),conf=join(directory,'httpd.conf');
  const load=['mpm_event','authz_core','authz_host','mime','dir','rewrite','headers','cgid','alias'].map(name=>'LoadModule '+name+'_module "'+modules+'/mod_'+name+'.so"').join('\n');
  await writeFile(conf,`ServerRoot "${directory}"
DefaultRuntimeDir "${run}"
PidFile "${run}/httpd.pid"
Listen ${process.env.TEST_APACHE_BIND||'127.0.0.1'}:${port}
ServerName lexan.dk
User www-data
Group www-data
${load}
ErrorLog "${directory}/error.log"
LogLevel ${process.env.TEST_ROUTING_TRACE?'rewrite:trace3':'warn'}
DocumentRoot "${docroot}"
DirectoryIndex index.php
TypesConfig /etc/mime.types
ScriptSock "${run}/cgisock"
<Directory "${docroot}">
  AllowOverride All
  Options +ExecCGI -Indexes
  AddHandler cgi-script .php
  Require all granted
</Directory>
`);
  let diagnostics='';const child=spawn(apache,['-f',conf,'-DFOREGROUND'],{env:{...process.env,TEST_ROUTING_FIXTURE_DIR:directory,TEST_ROUTING_LISTEN_PORT:String(port)},stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',part=>diagnostics+=part.toString());
  let launchError;child.once('error',error=>{launchError=error;});
  let ready=false;for(let i=0;i<120;i++){if(launchError)throw launchError;if(stopped(child))break;try{ready=(await request(port,'/unrelated.txt','GET','','other.example.test')).status===200;break;}catch{}await delay(100);}
  if(!ready){child.kill('SIGTERM');let error='';try{error=await readFile(join(directory,'error.log'),'utf8');}catch{}await delay(300);await rm(directory,{recursive:true,force:true});throw Error('Apache fixture did not start: '+diagnostics+' '+error.slice(-3000));}
  return {port,request:(...args)=>request(port,...args),close:async()=>{if(!stopped(child))child.kill('SIGTERM');for(let i=0;i<60&&!stopped(child);i++)await delay(50);if(!stopped(child))child.kill('SIGKILL');await delay(50);if(process.env.TEST_ROUTING_TRACE)console.log('Synthetic Apache trace directory:',directory);else await rm(directory,{recursive:true,force:true});}};
}

test('real Apache: lowercase gallery aliases, canonical redirects and public assets',{
  skip:apache&&modules&&php?false:'Install apache2 and PHP or set TEST_APACHE_BINARY/TEST_APACHE_MODULES/TEST_ROUTING_PHP',timeout:90000,
},async t=>{
  for(const {names,rewriteBase} of [{names:['LexGalleri']},{names:['lexgalleri']},{names:['LexGalleri','lexgalleri']},{names:['LexGalleri'],rewriteBase:true}]){
    await t.test('physical folders: '+names.join(' + ')+(rewriteBase?' with existing RewriteBase /public/':''),async()=>{
      const f=await fixture(names,rewriteBase);try{
        for(const [path,target] of [['/','/lexgalleri/'],['/index.php','/lexgalleri/'],['/lexgalleri','/lexgalleri/'],['/LexGalleri','/lexgalleri/'],['/LexGalleri/','/lexgalleri/'],['/LexGalleri/api/status','/lexgalleri/api/status']]){
          const r=await f.request(path+'?invite=synthetic%2Btoken&next=1');assert.equal(r.status,308,path+' '+JSON.stringify(r.headers));assert.equal(r.headers.location,'https://lexan.dk'+target+'?invite=synthetic%2Btoken&next=1',path);
        }
        const www=await f.request('/?probe=1','HEAD','','www.lexan.dk');assert.equal(www.status,308);assert.equal(www.headers.location,'https://lexan.dk/lexgalleri/?probe=1');assert.equal(www.body.length,0);
        const hostPort=await f.request('/','GET','','LEXAN.DK:443');assert.equal(hostPort.status,308);assert.equal(hostPort.headers.location,'https://lexan.dk/lexgalleri/');
        const postRoot=await f.request('/lexgalleri','POST','{"synthetic":"root post"}');assert.equal(postRoot.status,308);assert.equal(postRoot.headers.location,'https://lexan.dk/lexgalleri/');
        const post=await f.request('/LexGalleri/api/login?test=1','POST','{"synthetic":"body preserved"}');assert.equal(post.status,308);assert.equal(post.headers.location,'https://lexan.dk/lexgalleri/api/login?test=1');
        const expected=names.includes('lexgalleri')?'lexgalleri':'LexGalleri';
        const api=await f.request('/lexgalleri/api/status?probe=one%2Btwo');assert.equal(api.status,200);assert.equal(api.headers.location,undefined);const echo=JSON.parse(api.body);assert.equal(echo.physical,expected);assert.equal(echo.uri,'/lexgalleri/api/status?probe=one%2Btwo');
        const posted=await f.request('/lexgalleri/api/login?test=1','POST','{"synthetic":"body preserved"}');assert.equal(posted.status,200);assert.deepEqual(JSON.parse(posted.body),{physical:expected,uri:'/lexgalleri/api/login?test=1',method:'POST',body:'{"synthetic":"body preserved"}'});
        for(const [asset,mime] of [['static/app.js',/javascript/],['static/pwa.js',/javascript/],['static/qrcode.js',/javascript/],['static/style.css',/text\/css/],['static/icon.svg',/image\/svg\+xml/],['static/icon-192.png',/image\/png/],['static/icon-512.png',/image\/png/],['static/apple-touch-icon.png',/image\/png/],['manifest.webmanifest',/application\/manifest\+json/],['service-worker.js',/javascript/]]){
          const r=await f.request('/lexgalleri/'+asset);assert.equal(r.status,200,asset);assert.match(r.headers['content-type'],mime,asset);assert.deepEqual(r.body,await readFile(join(root,'public',asset)),asset+' exact public bytes');
          if(['manifest.webmanifest','service-worker.js','static/app.js','static/style.css'].includes(asset))assert.match(r.headers['cache-control']||'',/no-cache/,asset);
        }
        const hidden=await f.request('/lexgalleri/.htaccess');assert(!hidden.body.includes(Buffer.from('# BEGIN LexGalleri')));assert(!hidden.body.includes(Buffer.from('Options -Indexes')),'hidden configuration is not served');
        const unrelated=await f.request('/unrelated.txt');assert.equal(unrelated.status,200);assert.equal(unrelated.body.toString(),'unrelated site content');
        const preserved=await f.request('/old-note');assert.equal(preserved.status,200);assert.equal(preserved.body.toString(),'unrelated site content','existing root rules remain active');
        const child=await f.request('/subsite/old-note');assert.equal(child.status,200);assert.equal(child.body.toString(),'unrelated child site content','existing child rewrite rules are not overridden by inherited parent rules');
        const otherHost=await f.request('/','GET','','other.example.test');assert.equal(otherHost.status,200);assert.equal(JSON.parse(otherHost.body).physical,'root');assert.equal(otherHost.headers.location,undefined,'the domain block does not rewrite unrelated hosts');
      }finally{await f.close();}
    });
  }
});
