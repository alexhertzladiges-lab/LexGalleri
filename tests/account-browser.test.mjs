// Real browser + real PHP/MySQL integration. Every account and factor is a
// disposable synthetic fixture; no real gallery, credentials or media are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const binary=[process.env.TEST_BROWSER,process.env.CHROME_BIN,'/usr/bin/chromium','/usr/bin/google-chrome','/opt/google/chrome/chrome'].find(path=>path&&existsSync(path));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const exited=child=>child.exitCode!==null||child.signalCode!==null;
function waitExit(child,timeout){
  if(exited(child))return Promise.resolve(true);
  return new Promise(resolve=>{const done=()=>{clearTimeout(timer);resolve(true);};const timer=setTimeout(()=>{child.off('exit',done);resolve(false);},timeout);child.once('exit',done);});
}

async function fixture(){
  const child=spawn(process.env.TEST_PHP_BINARY||'php',[join(root,'tests/account-browser-fixture.php')],{cwd:root,env:process.env,stdio:['pipe','pipe','pipe']});
  let output='',diagnostics='';child.stderr.on('data',part=>diagnostics+=part.toString());
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('PHP browser fixture did not start: '+diagnostics.slice(-1000))),25000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('PHP browser fixture exited '+code+': '+diagnostics.slice(-1000)));});
    child.stdout.on('data',part=>{output+=part.toString();const end=output.indexOf('\n');if(end!==-1){clearTimeout(timer);try{resolve(JSON.parse(output.slice(0,end)));}catch{reject(Error('Invalid disposable fixture ready message'));}}});
  }).catch(error=>{child.stdin.end();child.kill('SIGTERM');throw error;});
  return {...ready,close:async()=>{
    if(!exited(child)){child.stdin.end('\n');if(!await waitExit(child,8000)){child.kill('SIGTERM');throw Error('PHP browser fixture did not clean up');}}
    if(child.exitCode!==0)throw Error('PHP browser fixture cleanup failed: '+diagnostics.slice(-1000));
  }};
}

async function chrome(){
  const profile=await mkdtemp(join(tmpdir(),'lexgalleri-account-chrome-'));
  const child=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let diagnostics='';
  const address=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Chromium did not start: '+diagnostics.slice(-1000))),15000);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(Error('Chromium exited '+code+': '+diagnostics.slice(-1000)));});
    child.stderr.on('data',part=>{diagnostics+=part.toString();const match=diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  }).catch(async error=>{child.kill('SIGKILL');await rm(profile,{recursive:true,force:true});throw error;});
  const socket=new WebSocket(address);let serial=0;const pending=new Map();
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(!data.id)return;const item=pending.get(data.id);if(!item)return;pending.delete(data.id);clearTimeout(item.timer);if(data.error)item.reject(Error(data.error.message));else item.resolve(data.result);});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'}),session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  const call=(method,params={})=>send(method,params,session);
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const wait=async(expression,label)=>{const until=Date.now()+12000;while(Date.now()<until){if(await evaluate(expression))return;await pause(50);}throw Error('Browser wait timed out: '+label);};
  const submit=async(selector,values)=>evaluate(`(()=>{const form=document.querySelector(${JSON.stringify(selector)});if(!form)throw Error('Form missing');for(const [name,value] of Object.entries(${JSON.stringify(values)})){const input=form.elements.namedItem(name);if(!input)throw Error('Field missing: '+name);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}form.requestSubmit();})()`);
  return {call,evaluate,wait,submit,close:async()=>{
    try{await send('Browser.close');}catch{}socket.close();
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Browser closed'));}pending.clear();
    if(!exited(child)&&!await waitExit(child,3000))child.kill('SIGKILL');
    await rm(profile,{recursive:true,force:true});
  }};
}

function totp(secret){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const bytes=[];
  for(const character of secret){const digit=alphabet.indexOf(character);if(digit<0)throw Error('Invalid synthetic TOTP key');value=(value<<5)|digit;bits+=5;if(bits>=8){bits-=8;bytes.push((value>>>bits)&255);}value&=(1<<bits)-1;}
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const hash=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=hash[19]&15;
  return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}

test('real PHP and Chromium: admin Authenticator enrollment and member profile management',{
  skip:process.env.LEXGALLERI_TEST!=='1'?'Set LEXGALLERI_TEST=1 and isolated TEST_DB_* settings':binary?false:'Set TEST_BROWSER to a Chrome/Chromium executable',timeout:120000,
},async t=>{
  const site=await fixture();let browser;
  try{
    browser=await chrome();const {evaluate:run,wait,submit,call}=browser;
    await call('Page.navigate',{url:site.origin+'/LexGalleri/'});await wait("!!document.querySelector('#auth')",'password login');
    await submit('#auth',{email:site.admin_email,password:site.admin_password});
    await wait("!!document.querySelector('#mfa-key') && !!document.querySelector('#mfa-qr svg')",'local Authenticator enrollment QR');
    assert.equal(await run("document.querySelector('[data-view=galleries]')===null"),true,'password alone cannot open the authenticated gallery');
    assert.equal(await run("fetch('/LexGalleri/api/galleries').then(r=>r.status)"),401,'real server denies pending admin access');
    assert(await run("typeof qrcode==='function' && document.querySelector('#mfa-qr svg').querySelectorAll('path').length>0"),'the local vendor renders an actual QR SVG');
    const secret=await run("document.querySelector('#mfa-key').value");assert(/^[A-Z2-7]{32}$/.test(secret),'enrollment uses a standard base32 secret');
    await submit('#mfa-form',{code:totp(secret)});await wait("document.querySelectorAll('.recovery-codes li').length===10",'one-time recovery code display');
    let codes=await run("[...document.querySelectorAll('.recovery-codes li')].map(node=>node.textContent)");assert(new Set(codes).size===10,'ten unique recovery codes are displayed');
    assert.equal(await run("document.querySelector('#mfa-key')===null && document.querySelector('#mfa-qr')===null"),true,'setup secrets are removed after confirmation');
    await run("document.querySelector('#recovery-saved').checked=true;document.querySelector('#recovery-saved').dispatchEvent(new Event('change'));document.querySelector('#recovery-continue').click()");
    await wait("!!document.querySelector('[data-view=profile]')",'authenticated gallery after confirmation');
    await t.test('own profile displays active Authenticator without exposing enrollment data',async()=>{
      await run("document.querySelector('[data-view=profile]').click()");await wait("!!document.querySelector('#mfa-replace')",'admin profile');
      assert(await run("document.querySelector('#content').textContent.includes('Aktiveret') && document.querySelector('#content').textContent.includes('browser-admin@example.test')"));
      assert.equal(await run("document.querySelector('#mfa-key')===null && document.querySelector('.recovery-codes')===null"),true);
    });
    const changedEmail='browser-member-updated@example.test',changedPassword='browser-member-new-password';
    await t.test('admin edits a member name, email and password through real step-up verification',async()=>{
      await run("document.querySelector('[data-view=people]').click()");await wait(`!!document.querySelector('[data-profile="${site.member_id}"]')`,'family member list');
      await run(`document.querySelector('[data-profile="${site.member_id}"]').click()`);await wait("!!document.querySelector('#profile-edit')",'member profile');
      await run("document.querySelector('#profile-edit').click()");await wait("!!document.querySelector('#account-edit')",'profile form');
      await submit('#account-edit',{name:'Browser Member Updated',email:changedEmail,password:changedPassword,password_confirmation:changedPassword,current_password:site.admin_password,mfa_code:codes.shift()});
      await wait("!document.querySelector('#modal').open && document.querySelector('.profile-summary')?.textContent.includes('browser-member-updated@example.test')",'saved member profile');
      assert(await run("document.querySelector('.account-profile').textContent.includes('Browser Member Updated')"));
      assert.equal(await run("document.querySelector('#account-edit')===null"),true,'private proof fields are removed after saving');
    });
    await t.test('returning admin login requires its second factor and accepts a saved recovery code',async()=>{
      await run("document.querySelector('#logout').click()");await wait("!!document.querySelector('#auth')",'logged out');
      await submit('#auth',{email:site.admin_email,password:site.admin_password});await wait("!!document.querySelector('#mfa-form')",'returning admin second factor');
      assert.equal(await run("document.querySelector('#mfa-key')===null && document.querySelector('[data-view=galleries]')===null"),true);
      await submit('#mfa-form',{code:codes.shift()});await wait("!!document.querySelector('[data-view=people]')",'admin recovery login');
      assert.equal(await run("document.querySelector('.recovery-codes')===null"),true,'previous recovery codes are not redisplayed');
    });
    await t.test('member uses updated credentials and sees only their own profile controls',async()=>{
      await run("document.querySelector('#logout').click()");await wait("!!document.querySelector('#auth')",'member login form');
      await submit('#auth',{email:changedEmail,password:changedPassword});await wait("!!document.querySelector('[data-view=profile]')",'member account');
      assert.equal(await run("document.querySelector('[data-view=people]')===null && document.querySelector('#mfa-form')===null"),true);
      await run("document.querySelector('[data-view=profile]').click()");await wait("!!document.querySelector('#profile-edit')",'member own profile');
      assert(await run("document.querySelector('.profile-summary').textContent.includes('browser-member-updated@example.test')"));
      assert.equal(await run("document.querySelector('#mfa-replace')===null && document.querySelector('#mfa-recovery-renew')===null"),true);
      assert.equal(await run(`fetch('/LexGalleri/api/admin/users/${site.member_id}').then(r=>r.status)`),403,'member cannot access admin profile API');
    });
    codes=[];
  }finally{try{if(browser)await browser.close();}finally{await site.close();}}
});
