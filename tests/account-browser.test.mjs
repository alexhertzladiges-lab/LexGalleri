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
    let phoneLink;
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
    await t.test('admin creates a telephone invitation with real form validation and can inspect its status',async()=>{
      await run("document.querySelector('[data-view=people]').click()");await wait("!!document.querySelector('#invite')",'invite action');
      await run("document.querySelector('#invite').click()");await wait("!!document.querySelector('#invite-contact')",'phone selector');
      await run("const selector=document.querySelector('#invite-contact');selector.value='phone';selector.dispatchEvent(new Event('change'));const inviteView=document.querySelector('[data-invite-right=view]');inviteView.checked=true;inviteView.dispatchEvent(new Event('change'));const inviteRow=inviteView.closest('fieldset');inviteRow.querySelector('[data-invite-right=upload]').checked=true;");
      assert(await run("document.querySelector('#invite-email').disabled && !document.querySelector('#invite-email').required && document.querySelector('#invite-phone').required"),'hidden email cannot block a phone invitation');
      await submit('#invite-form',{name:'Phone Browser Guest',phone:'+45 20 00 00 03'});await wait("!!document.querySelector('#invite-link')",'telephone invitation acknowledgment');
      phoneLink=await run("document.querySelector('#invite-link').value");assert(phoneLink.startsWith(site.origin+'/LexGalleri/?invite='));
      assert(await run("document.querySelector('#modal').textContent.includes('åbnes igen')"));
      await run("document.querySelector('#close-modal').click();document.querySelector('#invitation-list').click()");await wait("!!document.querySelector('[data-revoke-invite]')",'invitation status listing');
      assert(await run("document.querySelector('#modal').textContent.includes('+4520000003')"));await run("document.querySelector('#close-modal').click()");
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
    await t.test('telephone invitation creates one account, reopens and supports ordinary phone login',async()=>{
      await run("document.querySelector('#logout').click()");await wait("!!document.querySelector('#auth')",'guest logout');
      await call('Page.navigate',{url:phoneLink});await wait("document.querySelector('#app').textContent.includes('Du er inviteret.')",'telephone acceptance');
      await submit('#auth',{password:'browser-phone-long-password'});await wait("!!document.querySelector('[data-gallery]')",'telephone gallery access');
      await run("document.querySelector('[data-gallery]').click()");await wait("!!document.querySelector('#files')",'member media upload');
      assert(await run("document.querySelector('#files').accept.includes('video/mp4') && document.querySelector('#content').textContent.includes('100 MB')"));
      await run("document.querySelector('#logout').click()");await wait("!!document.querySelector('#auth')",'phone logout');
      await call('Page.navigate',{url:phoneLink});await wait("document.querySelector('#app').textContent.includes('Du er inviteret.')",'reopen invitation');
      await submit('#auth',{password:'browser-phone-long-password'});await wait("!!document.querySelector('[data-view=profile]')",'reused invitation authenticated');
      await run("document.querySelector('#logout').click()");await wait("!!document.querySelector('#auth')",'phone normal login');
      await submit('#auth',{email:'20000003',password:'browser-phone-long-password'});await wait("!!document.querySelector('[data-view=profile]')",'phone login authenticated');
      await run("document.querySelector('[data-view=profile]').click()");await wait("document.querySelector('.profile-summary')?.textContent.includes('+4520000003')",'telephone profile');
    });
    await t.test('browser MP4 upload captures and stores a real frame without GPS or download rights',async()=>{
      await run("document.querySelector('[data-view=galleries]').click()");await wait("!!document.querySelector('[data-gallery]')",'phone gallery');
      await run("document.querySelector('[data-gallery]').click()");await wait("!!document.querySelector('#files')",'video upload input');
      const doc=await call('DOM.getDocument');const input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#files'});
      await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[site.video_path]});
      await wait("document.querySelectorAll('[data-photo]').length===1 && !document.querySelector('#upload').disabled",'MP4 uploaded with automatic still');
      const pixel=await run("(async()=>{const img=document.querySelector('[data-photo] img');await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(img,0,0,1,1);return Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data)})()");
      assert(pixel[0]<10&&pixel[1]<10&&pixel[2]<10,'the synthetic black video frame replaces the colored neutral poster');
      assert.equal(await run("fetch('/LexGalleri/api/photos/'+document.querySelector('[data-photo]').dataset.photo+'/video').then(r=>r.status)"),403,'frame upload does not grant original playback rights');
    });
    await t.test('an unreadable browser codec falls back to the existing neutral poster',async()=>{
      await run("(async()=>{const fallbackGallery=await api('/galleries','POST',{name:'Fallback video test'});await refreshGalleryView('galleries');await openGallery(fallbackGallery.id);globalThis.__captureFrame=captureVideoThumbnail;captureVideoThumbnail=async()=>{throw Error('Synthetic unsupported codec')};})()");
      const doc=await call('DOM.getDocument'),input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#files'});
      await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[site.video_path]});
      await wait("document.querySelectorAll('[data-photo]').length===1 && !document.querySelector('#upload').disabled",'fallback upload succeeds');
      const pixel=await run("(async()=>{captureVideoThumbnail=globalThis.__captureFrame;const img=document.querySelector('[data-photo] img');await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(img,0,0,1,1);return Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data)})()");
      assert(pixel[0]>20&&pixel[1]>20,'neutral placeholder remains when extraction is unavailable');
    });
    await t.test('admin can regenerate a stored MP4 thumbnail through the actual info button',async()=>{
      await run("document.querySelector('#logout').click()");await wait("!!document.querySelector('#auth')",'admin login');
      await submit('#auth',{email:site.admin_email,password:site.admin_password});await wait("!!document.querySelector('#mfa-form')",'admin factor');
      await submit('#mfa-form',{code:codes.shift()});await wait("!!document.querySelector('[data-gallery]')",'admin galleries');
      await run("document.querySelector('[data-gallery]').click()");await wait("!!document.querySelector('[data-photo]')",'admin video card');
      await run("document.querySelector('[data-photo]').click()");await wait("!!document.querySelector('#video-thumbnail')",'video thumbnail action');
      await run("document.querySelector('#photo-info-toggle').click();document.querySelector('#video-thumbnail').click()");
      await wait("document.querySelector('#video-thumbnail-status')?.textContent.includes('er gemt')",'persisted replacement frame');
      assert.equal(await run("document.querySelector('#video-thumbnail').disabled"),false);
    });
    await t.test('admin sees total/gallery media usage and changes the stored capacity on mobile and desktop',async()=>{
      await run("document.querySelector('#close-modal').click();document.querySelector('[data-view=admin]').click()");
      await wait("!!document.querySelector('#storage-limit-edit')",'admin media space');
      assert(await run("document.querySelector('#storage-panel').textContent.includes('25 GB')"));
      await run("document.querySelector('#storage-detail').open=true");
      assert(await run("document.querySelectorAll('.storage-gallery').length>=1 && document.querySelector('.storage-gallery').textContent.includes('%')"));
      for(const width of [320,390,1280]){
        await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
        const fits=await run("(()=>{const panel=document.querySelector('#storage-panel');return panel.scrollWidth<=panel.clientWidth+1&&[...panel.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44)})()");assert(fits,'space overview fits and its controls remain tappable at '+width+'px');
      }
      await run("document.querySelector('#storage-limit-edit').click()");await wait("!!document.querySelector('#storage-limit-form')",'capacity dialog');
      await submit('#storage-limit-form',{limit_gb:'30.5'});await wait("!document.querySelector('#modal').open && document.querySelector('#storage-panel')?.textContent.includes('30,5 GB')",'saved capacity');
      assert.equal(await run("api('/admin/storage').then(d=>d.limit_bytes)"),30500000000);
      await run("document.querySelector('#admin-area').value='admin-security';document.querySelector('#admin-area').dispatchEvent(new Event('change'))");await wait("document.querySelector('#storage-panel')?.textContent.includes('30,5 GB')",'same capacity under system overview');
      await run("document.querySelector('[data-view=galleries]').click()");await wait("!!document.querySelector('[data-gallery]')",'return to gallery');
      await run("document.querySelector('[data-gallery]').click()");await wait("!!document.querySelector('[data-photo]')",'return to video card');
      await run("document.querySelector('[data-photo]').click()");await wait("!!document.querySelector('#video-thumbnail')",'restore video actions');await run("document.querySelector('#photo-info-toggle').click()");
    });
    await t.test('logging out during frame extraction cannot submit a delayed thumbnail',async()=>{
      await run("globalThis.__posterPosts=0;globalThis.__posterApi=api;api=async(path,...args)=>{if(path.endsWith('/thumbnail'))globalThis.__posterPosts++;return globalThis.__posterApi(path,...args)};captureVideoThumbnail=()=>new Promise(resolve=>globalThis.__finishPoster=resolve);document.querySelector('#video-thumbnail').click()");
      await wait("typeof globalThis.__finishPoster==='function'",'pending thumbnail extraction');
      await run("accountSignOut()");await wait("!!document.querySelector('#auth')",'logout during generation');
      await run("globalThis.__finishPoster(new Blob(['synthetic'],{type:'image/jpeg'}))");
      assert.equal(await run("globalThis.__posterPosts"),0,'a stale account action cannot upload or restore the closed dialog');
    });
    codes=[];
  }finally{try{if(browser)await browser.close();}finally{await site.close();}}
});
