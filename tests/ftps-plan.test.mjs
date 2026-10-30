import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync, chmodSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connection, plan } from '../scripts/ftps-plan.mjs';
import { preflightPlan, verifyBootstrap, verificationPlan, verifyPublicFiles } from '../scripts/ftps-integrity.mjs';
const env = { FTPS_HOST:'web3.e-studio.dk', FTPS_USERNAME:'chatgpt@lexan.dk', FTPS_PORT:'21', GITHUB_SHA:'a'.repeat(40), GITHUB_RUN_ID:'123', GITHUB_RUN_ATTEMPT:'1' };
const publicFiles = [
  'static/icon.svg','static/icon-192.png','static/icon-512.png','static/apple-touch-icon.png',
  'manifest.webmanifest','service-worker.js','static/pwa.js','static/style.css','static/qrcode.js','static/app.js',
  '.htaccess','index.php',
];
test('requires explicit host, username and port; no other project credentials assumed', () => {
  assert.deepEqual(connection(env),{host:'web3.e-studio.dk',user:'chatgpt@lexan.dk',port:'21'});
  assert.throws(()=>connection({}));
});
test('requires TLS, protected data/listings and certificate+hostname verification', () => {
  const lines=plan(env).trim().split('\n');
  for(const command of ['set ftp:ssl-force true','set ftp:ssl-auth TLS','set ftp:ssl-protect-data true','set ftp:ssl-protect-list true','set ssl:verify-certificate true','set ssl:check-hostname true']) assert(lines.indexOf(command)<lines.indexOf('cd "/"'));
  assert(!lines.some(l=>/ssl.*false/.test(l)));
});
test('read-only diagnosis stays at the restricted public root', () => {
  const p=plan(env,process.cwd(),true);
  assert.deepEqual(p.split('\n').filter(l=>l.startsWith('cd ')),['cd "/"']);
  assert(p.includes('cls -1\n'));
  assert(!/^(put|mv|mkdir|chmod|rm|rmdir|mirror|!) /m.test(p));
  assert(!p.includes('private'));
});
test('only the twelve public app files are staged before activation', () => {
  const lines=plan({...env,FTPS_PASSWORD:'never-in-plan'}).trim().split('\n');
  assert.deepEqual(lines.filter(l=>l.startsWith('put ')).map(l=>l.split('"')[1]),publicFiles.map(path=>'public/'+path));
  assert.deepEqual(lines.filter(l=>l.startsWith('mv ')).map(l=>l.split('"')[3]),publicFiles);
  assert.equal(lines.filter(l=>l.startsWith('mv ')).length,12);
  assert(lines.findIndex(l=>l.startsWith('mv '))>lines.findLastIndex(l=>l.startsWith('put ')));
  assert.equal(lines.filter(l=>l.startsWith('chmod 644 ')).length,12);
  assert(!/private|schema\.sql|app\.php|config|originals|previews|thumbnails|sessions|never-in-plan|^rm |^rmdir |^!|mirror/m.test(lines.join('\n')));
});
test('app metadata and icons activate before the entry point, which activates last', () => {
  const targets=plan(env).trim().split('\n').filter(line=>line.startsWith('mv ')).map(line=>line.split('"')[3]);
  assert.equal(targets.at(-1),'index.php');
  for(const dependency of ['manifest.webmanifest','service-worker.js','static/pwa.js','static/icon-192.png','static/icon-512.png','static/apple-touch-icon.png'])assert(targets.indexOf(dependency)<targets.indexOf('static/app.js'));
});
test('missing and symbolic-link app assets stop the plan before any transfer', () => {
  const root=mkdtempSync(join(tmpdir(),'lexgalleri-ftps-plan-'));
  try {
    mkdirSync(join(root,'public','static'),{recursive:true});
    for(const file of publicFiles)writeFileSync(join(root,'public',file),'synthetic public asset');
    assert.doesNotThrow(()=>plan(env,root));
    const icon=join(root,'public','static','icon-192.png');rmSync(icon);
    assert.throws(()=>plan(env,root),/Kodefil mangler eller er et symlink/);
    symlinkSync(join(root,'public','static','icon-512.png'),icon);
    assert.throws(()=>plan(env,root),/Kodefil mangler eller er et symlink/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('directory preparation stays bounded and returns to root before uploads', () => {
  const lines=plan(env).trim().split('\n');
  const firstUpload=lines.findIndex(line=>line.startsWith('put '));
  const prepare=lines.slice(lines.indexOf('pwd')+1,firstUpload);
  const directoryCommands=prepare.filter(line=>/^(cd|mkdir) /.test(line));
  assert(directoryCommands.length>0,'the public static directory must be prepared');
  for(const line of directoryCommands) {
    assert(!/^(mkdir|cd) .*\.\./.test(line));
    for(const quoted of line.matchAll(/"([^"]*)"/g))assert(['static','/'].includes(quoted[1]));
  }
  const lastCd=prepare.findLastIndex(line=>line.startsWith('cd '));
  assert.equal(prepare[lastCd],'cd "/"','uploads must be relative to the account root');
  assert(lastCd<prepare.indexOf('chmod 755 "static"'));
  assert(!prepare.some(line=>line.startsWith('mkdir ')),
    'an existing FTP directory must not receive an unconditional MKD');
});
test('all remote paths stay inside the account root; private/path env has no effect', () => {
  const p=plan({...env,FTPS_PRIVATE_PATH:'/forbidden',FTPS_PUBLIC_PATH:'/other-account'});
  assert.equal(p,plan(env));
  for(const line of p.trim().split('\n')) {
    for(const quoted of line.matchAll(/"([^"]*)"/g)) {
      if(line==='cd "/"') continue;
      assert(!quoted[1].startsWith('/'));
      assert(!quoted[1].split('/').includes('..'));
    }
  }
});
test('rejects connection/command injection and malformed workflow metadata', () => {
  for(const change of [{FTPS_HOST:'-e !bad'},{FTPS_USERNAME:'user\n!cmd'},{FTPS_PORT:'0'},{FTPS_PORT:'021'},{FTPS_PORT:'65536'},{FTPS_PORT:'-eBad'},{GITHUB_SHA:'main'},{GITHUB_RUN_ID:'x'}]) assert.throws(()=>plan({...env,...change}));
});

test('wrong project accounts, hosts and ports are rejected in both deployment and read-only diagnosis',()=>{
  for(const change of [{FTPS_HOST:'web7.e-studio.dk'},{FTPS_USERNAME:'chatgpt@other.example'},{FTPS_PORT:'990'}])for(const diagnostic of [false,true])assert.throws(()=>plan({...env,...change},process.cwd(),diagnostic),/godkendte LexGalleri-konto/);
});
test('identity preflight reads only the public entry point and performs no remote mutation',()=>{
  const p=preflightPlan(env,'/tmp/lexgalleri-test/existing-index.php');
  assert.deepEqual(p.split('\n').filter(line=>line.startsWith('get ')),['get "index.php" -o "/tmp/lexgalleri-test/existing-index.php"']);
  assert(!/^(put|mv|mkdir|chmod|rm|rmdir|mirror|!) /m.test(p));
  for(const bad of ['/tmp/a"\n!cmd','relative-path','/tmp/../private','/tmp/$other'])assert.throws(()=>preflightPlan(env,bad));
});
test('the public bootstrap must match the approved existing installation, not a symlink or another app',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'lexgalleri-root-'));
  try{
    const file=join(tmp,'index.php');copyFileSync('public/index.php',file);assert.doesNotThrow(()=>verifyBootstrap(file));
    writeFileSync(file,'<?php echo "another public application";');assert.throws(()=>verifyBootstrap(file),/før filændringer/);
    rmSync(file);symlinkSync(join(process.cwd(),'public/index.php'),file);assert.throws(()=>verifyBootstrap(file),/før filændringer/);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('post-transfer plan reads exactly the twelve public files and checks every SHA-256',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'lexgalleri-readback-'));
  try{
    const p=verificationPlan(env,tmp);assert.deepEqual(p.split('\n').filter(line=>line.startsWith('get ')).map(line=>line.split('"')[1]),publicFiles);
    assert(!/^(put|mv|mkdir|chmod|rm|rmdir|mirror|!) /m.test(p));
    for(const file of publicFiles){mkdirSync(join(tmp,file,'..'),{recursive:true});copyFileSync(join('public',file),join(tmp,file));}
    assert.equal(verifyPublicFiles(tmp),12);
    writeFileSync(join(tmp,'static/app.js'),'unexpected public bytes');assert.throws(()=>verifyPublicFiles(tmp),/SHA-256.*static\/app\.js/);
  }finally{rmSync(tmp,{recursive:true,force:true});}
});
function simulatedDeployment(scenario){
  const tmp=mkdtempSync(join(tmpdir(),'lexgalleri-deploy-fixture-')),bin=join(tmp,'bin'),log=join(tmp,'commands');mkdirSync(bin);
  const fake=`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');const text=fs.readFileSync(0,'utf8');fs.appendFileSync(process.env.TEST_FTPS_LOG,text);
for(const line of text.split('\\n')){const m=line.match(/^get "([^"]+)" -o "([^"]+)"$/);if(!m)continue;const [_,remote,local]=m;
fs.mkdirSync(path.dirname(local),{recursive:true});if(process.env.TEST_FTPS_CASE==='bad-root'&&local.endsWith('/existing-index.php'))fs.writeFileSync(local,'unrelated public entry');
else if(process.env.TEST_FTPS_CASE==='bad-file'&&local.includes('/verified/')&&remote==='static/app.js')fs.writeFileSync(local,'damaged public bytes');
else fs.copyFileSync(path.join(process.env.TEST_FTPS_SOURCE,'public',remote),local);}
`;
  writeFileSync(join(bin,'lftp'),fake);chmodSync(join(bin,'lftp'),0o700);
  const result=spawnSync('bash',['scripts/deploy-ftps.sh'],{cwd:process.cwd(),env:{...process.env,...env,PATH:bin+':'+process.env.PATH,FTPS_PASSWORD:'synthetic-password-not-a-server-credential',TEST_FTPS_CASE:scenario,TEST_FTPS_LOG:log,TEST_FTPS_SOURCE:process.cwd()},encoding:'utf8',timeout:20000});
  if(result.error){rmSync(tmp,{recursive:true,force:true});throw result.error;}
  const commands=readFileSync(log,'utf8');rmSync(tmp,{recursive:true,force:true});return{...result,commands};
}
test('deployment orchestration aborts before all writes when root identity is wrong',()=>{
  const r=simulatedDeployment('bad-root');assert.notEqual(r.status,0);assert.match(r.stderr,/før filændringer/);
  assert(!/^(put|mv|mkdir|chmod|rm|rmdir|mirror) |\|\| mkdir/m.test(r.commands));assert(!r.stdout.includes('overført'));
});
test('deployment succeeds only after read-back; a mismatched file prevents a success message',()=>{
  const good=simulatedDeployment('good');assert.equal(good.status,0,good.stderr);assert.match(good.stdout,/12 offentlige filer.*SHA-256/);
  const lines=good.commands.split('\n');assert(lines.findIndex(x=>x.startsWith('get "index.php"'))<lines.findIndex(x=>/put |chmod |mkdir /.test(x)));
  assert.equal(lines.filter(x=>x.startsWith('get ')).length,13);assert(!good.commands.includes('synthetic-password'));
  const bad=simulatedDeployment('bad-file');assert.notEqual(bad.status,0);assert.match(bad.stderr,/SHA-256/);assert(!bad.stdout.includes('overført og genlæst'));
});
