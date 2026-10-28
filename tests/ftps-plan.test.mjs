import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connection, plan } from '../scripts/ftps-plan.mjs';
const env = { FTPS_HOST:'ftps.example.test', FTPS_USERNAME:'gallery-user', FTPS_PORT:'21', GITHUB_SHA:'a'.repeat(40), GITHUB_RUN_ID:'123', GITHUB_RUN_ATTEMPT:'1' };
const publicFiles = [
  'static/icon.svg','static/icon-192.png','static/icon-512.png','static/apple-touch-icon.png',
  'manifest.webmanifest','service-worker.js','static/pwa.js','static/style.css','static/qrcode.js','static/app.js',
  '.htaccess','index.php',
];
test('requires explicit host, username and port; no other project credentials assumed', () => {
  assert.deepEqual(connection(env),{host:'ftps.example.test',user:'gallery-user',port:'21'});
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
