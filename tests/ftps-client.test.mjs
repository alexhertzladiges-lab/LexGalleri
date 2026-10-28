import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { posix } from 'node:path';
import { plan } from '../scripts/ftps-plan.mjs';

const binary = process.env.LEXGALLERI_TEST_LFTP || 'lftp';
const env = {
  FTPS_HOST:'ftps.example.test', FTPS_USERNAME:'gallery-user', FTPS_PORT:'21',
  GITHUB_SHA:'a'.repeat(40), GITHUB_RUN_ID:'123', GITHUB_RUN_ATTEMPT:'1',
};
function preparation() {
  const lines=plan(env).trim().split('\n');
  const begin=lines.indexOf('pwd')+1;
  const end=lines.findIndex(line=>line.startsWith('put '));
  assert(begin>0 && end>begin, 'the real plan must prepare the public folder before uploads');
  return lines.slice(begin,end).join('\n');
}

// A local control-channel fixture, deliberately matching the webhotel's 550
// response to MKD when a directory already exists. No real FTPS credentials or
// server are used. Production TLS requirements remain covered by plan tests.
async function ftpFixture({staticExists=true, allowCreate=true}={}) {
  const dirs=new Set(['/']);
  if(staticExists)dirs.add('/static');
  const commands=[], sockets=new Set();
  const server=createServer(socket=>{
    sockets.add(socket);
    let buffer='', cwd='/';
    socket.setEncoding('utf8');
    socket.on('close',()=>sockets.delete(socket));
    socket.on('error',()=>{});
    const reply=line=>socket.write(line+'\r\n');
    reply('220 Synthetic gallery test FTP');
    socket.on('data',chunk=>{
      buffer+=chunk;
      let end;
      while((end=buffer.indexOf('\n'))!==-1) {
        const line=buffer.slice(0,end).replace(/\r$/,'');
        buffer=buffer.slice(end+1);
        const space=line.indexOf(' ');
        const name=(space===-1?line:line.slice(0,space)).toUpperCase();
        const argument=space===-1?'':line.slice(space+1);
        commands.push({name,argument,cwd});
        if(name==='USER')reply('331 Password required');
        else if(name==='PASS')reply('230 Logged in');
        else if(name==='SYST')reply('215 UNIX Type: L8');
        else if(name==='FEAT')socket.write('211-Features\r\n UTF8\r\n211 End\r\n');
        else if(name==='PWD' || name==='XPWD')reply('257 "'+cwd+'" is current directory');
        else if(name==='CWD') {
          const target=posix.resolve(cwd,argument);
          if(dirs.has(target)){cwd=target;reply('250 Directory changed');}
          else reply('550 No such directory');
        } else if(name==='MKD' || name==='XMKD') {
          const target=posix.resolve(cwd,argument);
          if(dirs.has(target))reply("550 Can't create directory: File exists");
          else if(!allowCreate)reply('550 Permission denied');
          else {dirs.add(target);reply('257 "'+target+'" created');}
        } else if(name==='SITE' && argument.startsWith('CHMOD ')) {
          const target=posix.resolve(cwd,argument.split(' ').slice(2).join(' '));
          reply(dirs.has(target)?'200 Permissions changed':'550 No such directory');
        } else if(name==='QUIT') {
          reply('221 Goodbye');
          socket.end();
        } else if(['OPTS','TYPE','NOOP','CLNT'].includes(name))reply('200 OK');
        else reply('502 Unsupported synthetic command');
      }
    });
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return {
    port:server.address().port, commands, dirs,
    close:async()=>{
      for(const socket of sockets)socket.destroy();
      await new Promise(resolve=>server.close(resolve));
    },
  };
}
function runClient(fixture,commands) {
  const script=[
    'set cmd:fail-exit true',
    'set net:max-retries 1',
    'set net:timeout 2',
    'set ftp:ssl-allow false', // Test-only loopback server; not the production plan.
    'open -u test-user,test-password ftp://127.0.0.1:'+fixture.port,
    commands,
    'pwd',
    'bye',
  ].join('\n');
  return new Promise(resolve=>execFile(binary,['--norc','-c',script],
    {timeout:10000,maxBuffer:65536},(error,stdout,stderr)=>resolve({
      code:error?(error.code??1):0, signal:error?.signal, stdout, stderr,
    })));
}
function assertClientAtRoot(result,fixture) {
  assert.equal(result.code,0,result.stderr || 'lftp did not exit successfully');
  const remote=new URL(result.stdout.trim());
  assert.equal(remote.hostname,'127.0.0.1');
  assert.equal(remote.port,String(fixture.port));
  assert.equal(remote.pathname,'/','lftp must return to the public account root before uploads');
  const chmod=fixture.commands.find(command=>command.name==='SITE' && command.argument.startsWith('CHMOD '));
  assert(chmod,'the real preparation must set public directory permissions');
  const target=posix.resolve(chmod.cwd,chmod.argument.split(' ').slice(2).join(' '));
  assert.equal(target,'/static','chmod must target the root static folder, not a nested static/static');
}

test('real lftp reuses an existing static directory without MKD',async t=>{
  const fixture=await ftpFixture();
  t.after(()=>fixture.close());
  const result=await runClient(fixture,preparation());
  assertClientAtRoot(result,fixture);
  assert.equal(fixture.commands.filter(command=>['MKD','XMKD'].includes(command.name)).length,0,
    'an existing folder must never receive the failing MKD command');
});
test('real lftp creates a missing static directory and returns to the account root',async t=>{
  const fixture=await ftpFixture({staticExists:false});
  t.after(()=>fixture.close());
  const result=await runClient(fixture,preparation());
  assertClientAtRoot(result,fixture);
  const mkdir=fixture.commands.filter(command=>['MKD','XMKD'].includes(command.name));
  assert.equal(mkdir.length,1);
  assert.equal(posix.resolve(mkdir[0].cwd,mkdir[0].argument),'/static');
});
test('real lftp stops before activation if the static directory cannot be created',async t=>{
  const fixture=await ftpFixture({staticExists:false,allowCreate:false});
  t.after(()=>fixture.close());
  const result=await runClient(fixture,preparation()+'\nquote RNFR should-not-run');
  assert.notEqual(result.code,0,'permission errors must not be ignored');
  assert(fixture.commands.some(command=>['MKD','XMKD'].includes(command.name)));
  assert(!fixture.commands.some(command=>['STOR','RNFR','RNTO'].includes(command.name)),
    'a preparation failure must prevent uploads and activation');
});
