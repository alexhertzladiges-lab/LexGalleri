import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../public/static/app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'');
const owner={id:'a'.repeat(32),name:'Administrator',email:'admin@example.test',admin:1};
const member={id:'b'.repeat(32),name:'Datter',email:'datter@example.test',admin:0};
function fixture(){
  const elements=new Map(),lists=new Map(),bindings=new Map(),calls=[],messages=[],historyCalls=[],reloads=[];
  const element=key=>{
    if(elements.has(key))return elements.get(key);
    const classes=new Set(),attributes=new Map();
    const node={innerHTML:'',textContent:'',open:false,checked:false,disabled:false,style:{},listeners:new Map(),
      classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,force){const on=force??!classes.has(value);if(on)classes.add(value);else classes.delete(value);return on;}},
      setAttribute(key,value){attributes.set(key,String(value));},getAttribute:key=>attributes.get(key)??null,
      querySelector(q){return element(key+' '+q);},addEventListener(name,fn){this.listeners.set(name,fn);},
      showModal(){this.open=true;},close(){this.open=false;this.listeners.get('close')?.();},pause(){},click(){this.onclick?.();}};
    elements.set(key,node);return node;
  };
  const document={currentScript:{src:'https://example.test/LexGalleri/static/app.js'},querySelector:element,querySelectorAll:q=>lists.get(q)||[],documentElement:{style:{setProperty(){}}},body:{style:{}},createElement:()=>({click(){}})};
  const ctx=vm.createContext({document,URL,URLSearchParams,FormData,Blob,setTimeout,clearTimeout,console,
    history:{replaceState(...args){historyCalls.push(args);}},location:{search:'',origin:'https://example.test',reload(){reloads.push(true);}},
    navigator:{clipboard:{writeText:async()=>{}}},bindings,calls,messages});
  vm.runInContext(source,ctx);
  const run=code=>vm.runInContext(code,ctx);
  ctx.owner=owner;ctx.member=member;
  run("me={...owner};view='profile';globalThis.starts=0;start=async()=>starts++;formHandler=(id,handler)=>bindings.set(id,handler);toast=message=>messages.push(message)");
  function api(handler){ctx.testApi=async(...args)=>{calls.push(args);return handler(...args);};run('api=globalThis.testApi');}
  return {ctx,run,elements,element,lists,bindings,calls,messages,historyCalls,reloads,api};
}
test('admin password login challenge cannot enter the gallery before Authenticator verification',async()=>{
  const f=fixture();f.api(async()=>{throw Error('No setup request for enrolled account');});
  f.ctx.reply={mfa_required:true,mfa_enrollment_required:false};await f.run('authResult(reply)');
  assert.equal(f.ctx.starts,0);assert.equal(f.run('me'),null);assert(f.element('#app').innerHTML.includes('Bekræft dit login.'));
  assert.equal(JSON.stringify(f.historyCalls[0]),JSON.stringify([{},'','/LexGalleri/']));assert.equal(f.calls.length,0);
  f.api(async(path,method,body)=>{assert.equal(path,'/mfa/verify');assert.equal(method,'POST');assert.equal(body.code,'123456');return owner;});
  await f.bindings.get('#mfa-form')({code:'123456'});
  assert.equal(f.ctx.starts,1);assert.equal(f.run('me.id'),owner.id);
});
test('enrollment uses only the private setup endpoint and escapes its manual key',async()=>{
  const f=fixture();f.api(async(path)=>{assert.equal(path,'/mfa/setup');return{secret:'SECRET"<unsafe>',otpauth_uri:'otpauth://totp/LexGalleri?secret=SYNTHETIC'};});
  f.ctx.reply={mfa_required:true,mfa_enrollment_required:true};await f.run('authResult(reply)');
  assert.equal(f.ctx.starts,0);const html=f.element('#mfa-setup').innerHTML;
  assert(html.includes('SECRET&quot;&lt;unsafe&gt;'));assert(!html.includes('value="SECRET"<unsafe>'));
  assert(f.element('#mfa-qr').textContent.includes('opsætningsnøglen'));assert.equal(f.calls.length,1);
});
test('local QR generation receives the setup URI without fetching an external service',()=>{
  const f=fixture(),seen=[];f.ctx.qrcode=(...args)=>{seen.push(args);return{addData(value){seen.push(value);},make(){seen.push('make');},createSvgTag(){return'<svg data-synthetic="true"></svg>';}};};f.ctx.uri='otpauth://totp/LexGalleri?secret=SYNTHETIC';
  f.run('localAuthenticatorQr(uri)');assert.equal(seen[1],f.ctx.uri);assert(f.element('#mfa-qr').innerHTML.startsWith('<svg'));assert.equal(f.calls.length,0);
});
test('cancelling enrollment prevents a delayed setup reply from restoring its secret',async()=>{
  const f=fixture();let finish;f.api(path=>path==='/mfa/setup'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({ok:true}));
  f.ctx.reply={mfa_required:true,mfa_enrollment_required:true};const pending=f.run('authResult(reply)');
  await f.run('accountSignOut()');finish({secret:'DO_NOT_REDISPLAY',otpauth_uri:'otpauth://totp/LexGalleri?secret=SYNTHETIC'});await pending;
  assert(!f.element('#app').innerHTML.includes('DO_NOT_REDISPLAY'));assert.equal(f.run('me'),null);assert.equal(f.ctx.starts,0);
});
test('cancel immediately invalidates a pending verification while logout is still in flight',async()=>{
  const f=fixture();f.ctx.reply={mfa_required:true,mfa_enrollment_required:false};await f.run('authResult(reply)');let verify,logout;
  f.api(path=>new Promise(resolve=>{if(path==='/mfa/verify')verify=resolve;else if(path==='/logout')logout=resolve;else throw Error('Unexpected path');}));
  const confirmation=f.bindings.get('#mfa-form')({code:'123456'}),cancellation=f.run('accountSignOut()');
  assert(f.element('#app').innerHTML.includes('Logger ud'));verify(owner);await confirmation;
  assert.equal(f.ctx.starts,0);assert.equal(f.run('me'),null);logout({ok:true});await cancellation;assert(f.element('#app').innerHTML.includes('Velkommen hjem.'));
});
test('restoring a pending login checks its status and does not fetch galleries',async()=>{
  const f=fixture();f.api(async path=>{if(path==='/status')return{setup:false,account_security_version:1,account_security_ready:true};if(path==='/me'){const error=Error('Pending');error.status=401;throw error;}if(path==='/mfa/status')return{mfa_required:true,mfa_enrollment_required:false};throw Error('Unexpected request '+path);});
  await f.run('init()');assert.deepEqual(f.calls.map(call=>call[0]),['/status','/me','/mfa/status']);assert.equal(f.ctx.starts,0);assert(f.element('#app').innerHTML.includes('Bekræft dit login.'));
});
test('enrollment recovery codes are displayed once and require acknowledgment before entering the gallery',async()=>{
  const f=fixture();f.ctx.reply={...owner,recovery_codes:['CODE-ONE','<CODE-TWO>'],password:'NEVER_KEEP',totp_secret:'NEVER_KEEP'};await f.run('authResult(reply)');
  assert.equal(f.ctx.starts,0);assert(f.element('#app').innerHTML.includes('&lt;CODE-TWO&gt;'));assert(!f.element('#app').innerHTML.includes('NEVER_KEEP'));assert.equal(f.run('me.password'),undefined);assert.equal(f.run('me.totp_secret'),undefined);
  await f.element('#recovery-continue').onclick();assert.equal(f.ctx.starts,0);
  f.element('#recovery-saved').checked=true;await f.element('#recovery-continue').onclick();assert.equal(f.ctx.starts,1);assert.equal(f.element('#app').innerHTML,'');
});
test('profile detail escapes member metadata and exposes controls only to self or admin',()=>{
  const f=fixture();f.ctx.profile={...member,name:'<script>Member</script>',email:'"unsafe@example.test',upload_count:5,galleries:[{name:'<img src=x>',upload:true,download:false,gps:false}]};
  let html=f.run('profileMarkup(profile,false,null)');assert(html.includes('&lt;script&gt;Member&lt;/script&gt;'));assert(html.includes('&lt;img src=x&gt;'));assert(html.includes('id="profile-edit"'));assert(!html.includes('id="mfa-replace"'));
  f.run('me={...member}');html=f.run('profileMarkup(profile,false,null)');assert(!html.includes('id="profile-edit"'));html=f.run('profileMarkup(profile,true,null)');assert(html.includes('id="profile-edit"'));assert(!html.includes('id="mfa-recovery-renew"'));
});
test('members cannot fetch another member profile',async()=>{
  const f=fixture();f.run('me={...member}');await assert.rejects(f.run('profileView(owner.id)'),/ikke adgang/);assert.equal(f.calls.length,0);
});
test('member password changes send only expected fields and return to login after session invalidation',async()=>{
  const f=fixture();f.run('me={...member}');f.api(async(path,method,body)=>{assert.equal(path,'/profile');assert.equal(method,'PATCH');assert.equal(body.password,'new-member-password');assert.equal(body.current_password,'old-member-password');assert.equal(body.password_confirmation,undefined);assert.equal(body.mfa_code,undefined);assert.equal(body.admin,undefined);return{user:{...member,email:'new@example.test'},reauthentication_required:true};});
  f.run('editAccountProfile(member,true)');assert(!f.element('#modal').innerHTML.includes('name="mfa_code"'));await f.bindings.get('#account-edit')({name:'Datter',email:'new@example.test',password:'new-member-password',password_confirmation:'new-member-password',current_password:'old-member-password',admin:1});
  assert.equal(f.run('me'),null);assert(f.element('#app').innerHTML.includes('value="new@example.test"'));assert(f.messages.some(message=>message.includes('Log ind igen')));
});
test('admin edits require the acting administrator password and a fresh factor',async()=>{
  const f=fixture();f.api(async(path,method,body)=>{if(method==='PATCH'){assert.equal(path,'/admin/users/'+member.id);assert.equal(body.current_password,'admin-password');assert.equal(body.mfa_code,'654321');assert.equal(body.password,undefined);return{user:member};}return member;});
  f.run('editAccountProfile(member,false)');const html=f.element('#modal').innerHTML;assert(html.includes('Din administratoradgangskode'));assert(html.includes('name="mfa_code"'));assert(!html.includes('value="admin-password"'));
  await f.bindings.get('#account-edit')({name:'Datter',email:member.email,password:'',password_confirmation:'',current_password:'admin-password',mfa_code:'654321'});assert.equal(f.calls[0][1],'PATCH');
});
test('mismatched new passwords and server duplicate-email failures do not imply success',async()=>{
  const f=fixture();f.run('editAccountProfile(member,false)');await assert.rejects(f.bindings.get('#account-edit')({password:'first-password',password_confirmation:'another-password'}),/ikke ens/);assert.equal(f.calls.length,0);
  f.api(async()=>{const error=Error('E-mailadressen er allerede i brug');error.status=409;throw error;});
  await assert.rejects(f.bindings.get('#account-edit')({name:'Datter',email:owner.email,password:'',password_confirmation:'',current_password:'admin-password',mfa_code:'123456'}),/allerede i brug/);assert.equal(f.messages.length,0);assert.equal(f.element('#modal').open,true);
});
test('closing account forms clears password and factor fields from the hidden dialog',()=>{
  const f=fixture();f.run('editAccountProfile(member,false)');assert(f.element('#modal').innerHTML.includes('current_password'));f.element('#modal').listeners.get('close')();assert.equal(f.element('#modal').innerHTML,'');assert.equal(f.run('privateAccountDialog'),false);
});
test('own administrator profile shows security actions and replacing Authenticator enters the pending gate',async()=>{
  const f=fixture();f.ctx.profile={...owner,mfa_enabled:true,upload_count:0,galleries:[]};const html=f.run('profileMarkup(profile,true,{recovery_codes_remaining:8})');assert(html.includes('id="mfa-recovery-renew"'));assert(html.includes('id="mfa-replace"'));assert(html.includes('<strong>8</strong>'));
  f.api(async path=>path==='/security/mfa/replace'?{mfa_required:true,mfa_enrollment_required:true}:{secret:'SYNTHETICKEY',otpauth_uri:'otpauth://totp/LexGalleri?secret=SYNTHETIC'});
  f.run("accountSecurityAction('replace')");await f.bindings.get('#account-security')({current_password:'admin-password',mfa_code:'654321'});assert.deepEqual(f.calls.map(call=>call[0]),['/security/mfa/replace','/mfa/setup']);assert.equal(f.ctx.starts,0);assert.equal(f.run('me'),null);assert(f.element('#app').innerHTML.includes('Tilføj Authenticator.'));
});
test('profile navigation is available to members while member administration stays admin-only',()=>{
  const f=fixture();f.run('me={...member};shell()');let html=f.element('#app').innerHTML;assert(html.includes('data-view="profile"'));assert(!html.includes('data-view="people"'));assert(!html.includes('data-view="lychee"'));
  f.run('me={...owner};shell()');html=f.element('#app').innerHTML;assert(html.includes('data-view="people"'));assert(!html.includes('data-view="lychee"'));
});
test('an old backend with an existing administrator cookie is blocked before account or gallery access',async()=>{
  const f=fixture();f.api(async path=>{if(path==='/status')return{setup:false};if(path==='/me')return owner;throw Error('Unexpected private request '+path);});
  await f.run('init()');assert.deepEqual(f.calls.map(call=>call[0]),['/status']);assert.equal(f.ctx.starts,0);assert.equal(f.run('me'),null);
  const html=f.element('#app').innerHTML;assert(html.includes('Login opdateres.'));assert(!html.includes('id="auth"'));assert(!html.includes('private/'));assert(!html.includes('SQL'));
  f.element('#account-refresh').onclick();assert.equal(f.reloads.length,1);
});
test('missing security tables block invitation login and normal login until the owner finishes installation',async()=>{
  const f=fixture();f.ctx.location.search='?invite=SYNTHETIC_PRIVATE_INVITE';f.api(async path=>{assert.equal(path,'/status');return{setup:false,account_security_version:1,account_security_ready:false};});
  await f.run('init()');assert.deepEqual(f.calls.map(call=>call[0]),['/status']);assert(f.element('#app').innerHTML.includes('Login opdateres.'));assert(!f.element('#app').innerHTML.includes('SYNTHETIC_PRIVATE_INVITE'));assert.equal(f.bindings.size,0);
});
test('first-time setup is available only from the new security-aware backend',async()=>{
  const f=fixture();f.api(async()=>({setup:true,account_security_version:1,account_security_ready:false}));await f.run('init()');
  assert(f.element('#app').innerHTML.includes('Opsætningsnøgle'));assert(f.bindings.has('#auth'));assert.deepEqual(f.calls.map(call=>call[0]),['/status']);
  const old=fixture();old.api(async()=>({setup:true}));await old.run('init()');assert(old.element('#app').innerHTML.includes('Login opdateres.'));assert.equal(old.bindings.size,0);
});
test('a full administrator returned directly by a password endpoint is logged out and never enters the app',async()=>{
  for(const options of [{setup:false,invite:null},{setup:true,invite:null},{setup:false,invite:'SYNTHETIC_PRIVATE_INVITE'}]){
    const f=fixture();f.ctx.options=options;f.api(async path=>path==='/logout'?{ok:true}:owner);f.run('auth(options.setup,options.invite)');
    await f.bindings.get('#auth')({email:owner.email,password:'admin-password',name:owner.name,token:'synthetic-setup'});
    assert.equal(f.ctx.starts,0);assert.equal(f.run('me'),null);assert(f.element('#app').innerHTML.includes('Login opdateres.'));assert.equal(f.calls.at(-1)[0],'/logout');
  }
});
test('a failed logout cannot turn an incompatible password-only administrator response into access',async()=>{
  const f=fixture();f.api(async()=>{throw Error('Network unavailable');});f.ctx.reply=owner;await f.run('authResult(reply,true)');
  assert.equal(f.ctx.starts,0);assert.equal(f.run('me'),null);assert(f.element('#app').innerHTML.includes('Login opdateres.'));
});
test('verified MFA administrators and password-authenticated members still enter normally',async()=>{
  const verified=fixture();verified.ctx.reply=owner;await verified.run('authResult(reply,false)');assert.equal(verified.ctx.starts,1);assert.equal(verified.run('me.id'),owner.id);
  const guest=fixture();guest.ctx.reply=member;await guest.run('authResult(reply,true)');assert.equal(guest.ctx.starts,1);assert.equal(guest.run('me.id'),member.id);
});
