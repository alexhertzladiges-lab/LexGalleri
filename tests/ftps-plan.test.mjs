import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connection, plan } from '../scripts/ftps-plan.mjs';
const env = { FTPS_HOST:'ftps.example.test', FTPS_USERNAME:'gallery-user', FTPS_PORT:'21', GITHUB_SHA:'a'.repeat(40), GITHUB_RUN_ID:'123', GITHUB_RUN_ATTEMPT:'1' };
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
test('only four public code files are staged before activation', () => {
  const lines=plan({...env,FTPS_PASSWORD:'never-in-plan'}).trim().split('\n');
  assert.deepEqual(lines.filter(l=>l.startsWith('put ')).map(l=>l.split('"')[1]),['public/static/style.css','public/static/app.js','public/.htaccess','public/index.php']);
  assert.equal(lines.filter(l=>l.startsWith('mv ')).length,4);
  assert(lines.findIndex(l=>l.startsWith('mv '))>lines.findLastIndex(l=>l.startsWith('put ')));
  assert.equal(lines.filter(l=>l.startsWith('chmod 644 ')).length,4);
  assert(!/private|schema\.sql|app\.php|config|originals|previews|thumbnails|sessions|never-in-plan|^rm |^rmdir |^!|mirror/m.test(lines.join('\n')));
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
