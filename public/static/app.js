'use strict';
const BASE=new URL(document.currentScript.src).pathname.replace(/\/static\/app\.js$/, '');
const $=(q,el=document)=>el.querySelector(q),A=$('#app'),M=$('#modal');
let me,galleries=[],photos=[],current=null,view='galleries',permissions={},themes=[],activeTheme;
let photoViewerGeneration=0;
let photoViewerNavigation=null;
let accountGeneration=0,profileGeneration=0,privateAccountDialog=false;
let navigationGeneration=0,serverCapabilities={};
let galleryDeleteState=null;
let passwordControlSequence=0;
let galleryNewsTimer=null,galleryNewsBusy=false;
let requestedGalleryId=galleryIdFromHash(location.hash);
function galleryIdFromHash(hash){return /^#gallery=([a-f0-9]{32})$/.exec(hash||'')?.[1]||null;}
function galleryShareUrl(id){
  if(!/^[a-f0-9]{32}$/.test(id))throw Error('Gallerilinket kunne ikke bekræftes');
  const url=new URL(BASE+'/',location.origin);url.hash='gallery='+id;return url.href;
}
async function consumeGalleryLink(){
  const id=requestedGalleryId;if(!id||!me)return;
  requestedGalleryId=null;history.replaceState({},'',BASE+'/');
  if(!galleries.some(g=>g.id===id)){toast('Galleriet kunne ikke åbnes. Bed administratoren kontrollere din adgang.');return;}
  await openGallery(id);
}
function shareLinkDialog(payload,invitation){
  modal(invitation?'Del invitation':'Del galleri',`<div class="dialog-content"><p>Del linket i Signal ved at indsætte det i en samtale. På telefoner med en delingsmenu kan du vælge Signal dér.</p><p>${invitation?'Dette er et personligt invitationslink. Send det kun til den gæst, invitationen er oprettet til.':'Linket giver ikke adgang i sig selv. Modtageren skal logge ind og have adgang til galleriet.'}</p><label>Link<input id="shared-link" readonly value="${esc(payload.url)}"></label><button id="copy-shared-link" type="button">Kopiér link</button><p id="shared-link-status" role="status"></p></div>`);
  privateAccountDialog=invitation;
  const account=accountGeneration,generation=photoViewerGeneration,field=$('#shared-link');
  const active=()=>me&&account===accountGeneration&&generation===photoViewerGeneration&&M.open&&$('#shared-link')===field;
  $('#copy-shared-link').onclick=async()=>{
    if(!active())return;
    try{await navigator.clipboard.writeText(payload.url);if(active())$('#shared-link-status').textContent='Linket er kopieret. Indsæt det i Signal.';}
    catch{if(active()){field.focus();field.select();$('#shared-link-status').textContent='Markér og kopiér linket, og indsæt det i Signal.';}}
  };
}
async function shareLink(payload,{invitation=false,active=()=>true}={}){
  if(!me||invitation&&!me.admin||!active())return;
  const account=accountGeneration;
  const valid=()=>me&&account===accountGeneration&&(!invitation||me.admin)&&active();
  if(typeof navigator.share==='function'&&globalThis.isSecureContext===true){
    try{await navigator.share(payload);return;}
    catch(error){if(error?.name==='AbortError'||!valid())return;}
  }
  if(valid())shareLinkDialog(payload,invitation);
}
function shareGallery(gallery){
  if(!gallery||!me||current?.id!==gallery.id)return;
  return shareLink({title:gallery.name,text:'Se galleriet i LexGalleri. Du skal logge ind og have adgang.',url:galleryShareUrl(gallery.id)},{active:()=>current?.id===gallery.id&&view==='galleries'});
}
function memberSharingAvailable(){return !!me&&serverCapabilities.member_gallery_sharing===true&&permissions.share_members===true;}
async function memberSharingDialog(gallery){
  if(!memberSharingAvailable()||current?.id!==gallery.id)return;
  modal('Del med medlemmer',`<div class="dialog-content member-sharing"><p>Vælg blandt eksisterende medlemmer. De får læseadgang til dette galleri. Kun admin kan invitere nye medlemmer ind i LexGalleri.</p><label>Søg medlem<input id="member-share-search" type="search" maxlength="100" placeholder="Søg på navn" autocomplete="off"></label><div id="member-share-list" class="member-share-list"></div><p id="member-share-count" role="status"></p><p id="member-share-status" role="status"></p><div class="share-actions"><button id="member-share-save" type="button" disabled>Giv valgte læseadgang</button><button class="secondary" id="member-share-clear" type="button">Ryd valg</button><button class="secondary" id="member-share-refresh" type="button">Opdatér liste</button><button class="secondary" id="member-share-signal" type="button">Del link via Signal</button></div><div id="member-share-owner"></div></div>`);
  privateAccountDialog=true;
  const account=accountGeneration,generation=photoViewerGeneration,root=$('.member-sharing'),list=$('#member-share-list'),status=$('#member-share-status'),search=$('#member-share-search'),selected=new Map();
  const active=()=>me&&account===accountGeneration&&generation===photoViewerGeneration&&M.open&&$('.member-sharing')===root&&current?.id===gallery.id;
  let data=null,busy=false,sequence=0,timer=null;
  const state=()=>{
    if(!active())return;
    $('#member-share-count').textContent=selected.size+' valgte · højst 50 ad gangen';
    $('#member-share-save').disabled=busy||selected.size===0;$('#member-share-clear').disabled=busy;$('#member-share-refresh').disabled=busy;$('#member-share-signal').disabled=busy;search.disabled=busy;
    root.querySelectorAll('[data-share-member]').forEach(input=>input.disabled=busy||input.dataset.hasAccess==='true');
    if($('#member-owner-save')){$('#member-owner-select').disabled=busy;$('#member-owner-confirm').disabled=busy;$('#member-owner-save').disabled=busy||!$('#member-owner-confirm').checked||($('#member-owner-select').value||null)===data?.owner_id;}
  };
  const load=async()=>{
    if(!active()||busy)return;const request=++sequence;status.textContent='Henter medlemmer…';
    try{
      const reply=await api('/galleries/'+gallery.id+'/members?q='+encodeURIComponent(search.value));
      if(!active()||busy||request!==sequence)return;
      if(!Array.isArray(reply?.members)||typeof reply.can_assign_owner!=='boolean'||reply.members.some(m=>!m||typeof m.name!=='string'||!/^[a-f0-9]{32}$/.test(m.id)||typeof m.has_access!=='boolean'))throw Error('Medlemslisten kunne ikke bekræftes');
      data=reply;list.innerHTML=data.members.map(member=>`<label class="member-share-row"><input type="checkbox" data-share-member="${esc(member.id)}" data-has-access="${member.has_access}" ${member.has_access?'disabled checked':selected.has(member.id)?'checked':''}><span>${esc(member.name)}</span>${member.has_access?'<small>Har adgang</small>':''}</label>`).join('')||'<p>Ingen medlemmer fundet. Nye medlemmer skal inviteres af admin.</p>';
      list.querySelectorAll('[data-share-member]').forEach(input=>{
        if(input.dataset.hasAccess==='true')selected.delete(input.dataset.shareMember);
        input.onchange=()=>{if(busy)return;const member=data.members.find(m=>m.id===input.dataset.shareMember);if(!member||member.has_access)return;if(input.checked&&selected.size>=50){input.checked=false;status.textContent='Vælg højst 50 medlemmer ad gangen.';return;}if(input.checked)selected.set(member.id,member.name);else selected.delete(member.id);state();};
      });
      const owner=$('#member-share-owner');owner.innerHTML='';
      if(me.admin&&data.can_assign_owner){
        const options=data.members.filter(m=>m.id!==data.owner_id).map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
        owner.innerHTML=`<details class="member-owner-tools"><summary>Galleriets ejer · ${esc(data.owner?.name||'Ikke udpeget')}</summary><p>Admin kan udpege ejeren, også for ældre gallerier. Den valgte ejer får fuld galleriadgang: upload, redigering, originaler og GPS samt mulighed for at dele med eksisterende medlemmer. Eksisterende adgang bevares ved overdragelse.</p><label>Vælg ejer<select id="member-owner-select"><option value="" ${!data.owner_id?'selected':''}>Ingen medlemsejer</option>${data.owner_id?`<option value="${esc(data.owner_id)}" selected>${esc(data.owner?.name||'Tidligere medlem')} · nuværende ejer</option>`:''}${options}</select></label><label class="check"><input id="member-owner-confirm" type="checkbox">Jeg bekræfter ændringen af ejerskab og rettigheder</label><button class="secondary" id="member-owner-save" type="button" disabled>Gem ejer</button></details>`;
        $('#member-owner-select').onchange=state;$('#member-owner-confirm').onchange=state;
        $('#member-owner-save').onclick=async()=>{
          if(!active()||busy||!me.admin||!$('#member-owner-confirm').checked)return;
          const user_id=$('#member-owner-select').value||null,expected_owner_id=data.owner_id;
          busy=true;sequence++;state();
          try{const reply=await api('/admin/galleries/'+gallery.id+'/owner','PUT',{user_id,expected_owner_id});if(reply?.ok!==true)throw Error('Ejerskabet kunne ikke bekræftes');if(!active())return;busy=false;await load();if(active())status.textContent='Galleriets ejer er opdateret.';}
          catch(error){if(active())status.textContent=error.message;}
          finally{busy=false;state();}
        };
      }
      status.textContent=data.has_more?'Viser de første 100 navne. Søg for at finde flere.':'';state();
    }catch(error){if(active()&&request===sequence)status.textContent=error.message;}
  };
  search.oninput=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>load(),250);};
  $('#member-share-clear').onclick=()=>{if(busy)return;selected.clear();list.querySelectorAll('[data-share-member]').forEach(input=>{if(input.dataset.hasAccess!=='true')input.checked=false;});state();};
  $('#member-share-refresh').onclick=()=>load();
  $('#member-share-signal').onclick=()=>{if(active()&&!busy)shareGallery(gallery);};
  $('#member-share-save').onclick=async()=>{
    if(!active()||busy||!selected.size)return;
    const user_ids=[...selected.keys()];busy=true;sequence++;state();
    try{
      const reply=await api('/galleries/'+gallery.id+'/members','POST',{user_ids});if(reply?.ok!==true||!Number.isInteger(reply.added))throw Error('Adgangen kunne ikke bekræftes');
      if(!active())return;selected.clear();busy=false;await load();if(active())status.textContent=reply.added+' medlemmer har fået læseadgang. Du kan nu sende linket via Signal. Ingen besked er sendt automatisk.';
    }catch(error){if(active())status.textContent=error.message;}
    finally{busy=false;state();}
  };
  await load();state();
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,method='GET',body){const opt={method};if(body instanceof FormData)opt.body=body;else if(body!==undefined){opt.headers={'Content-Type':'application/json'};opt.body=JSON.stringify(body)}const r=await fetch(BASE+'/api'+path,opt);let b;try{b=await r.json()}catch{throw Error('Serveren kunne ikke svare')}if(!r.ok){const error=Error(b.detail||'Der opstod en fejl');error.status=r.status;throw error}return b}
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',4500)}
function applyTheme(t){
  activeTheme=t;
  // Refresh the unmodified original palette even during the public-first
  // upgrade. Preserve every administrator-created/customized palette.
  const old={background:'#f7f6f2',surface:'#ffffff',text:'#263b34',accent:'#416c57'};
  const colors=t.name==='Nordisk'&&Object.entries(old).every(([k,v])=>t.colors[k]?.toLowerCase()===v)?{background:'#f8f4ed',surface:'#fffcf8',text:'#253d33',accent:'#a54f3d'}:t.colors;
  for(const[k,v]of Object.entries(colors))document.documentElement.style.setProperty('--'+k,v);
  document.documentElement.style.setProperty('--radius',t.radius+'px');document.documentElement.style.setProperty('--gap',t.density==='compact'?'12px':'22px');document.body.style.fontFamily=t.font==='serif'?'Georgia,serif':'Arial,sans-serif'}
function stopPhotoVideo(){$('#photo-video')?.pause?.()}
function addPasswordToggles(root){
  for(const input of root.querySelectorAll?.('input[type=password]')||[]){
    if(input.closest('.password-field'))continue;
    if(!input.id)input.id='password-field-'+(++passwordControlSequence);
    const label=input.parentElement?.tagName==='LABEL'?input.parentElement:null;
    const description=label?.textContent.trim()||'adgangskode';
    const field=document.createElement('div');field.className='password-field';
    if(label){const control=document.createElement('div');control.className='password-control';label.parentNode.insertBefore(control,label);control.append(label,field);label.htmlFor=input.id;field.append(input);}
    else{input.parentNode.insertBefore(field,input);field.append(input);}
    input.setAttribute('autocapitalize','none');input.setAttribute('autocorrect','off');input.spellcheck=false;
    const toggle=document.createElement('button');toggle.type='button';toggle.className='password-toggle';toggle.setAttribute('aria-controls',input.id);toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label','Vis '+description.toLowerCase());toggle.title='Vis '+description.toLowerCase();
    toggle.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="M3 3 21 21"/></svg>';
    toggle.onclick=event=>{event.preventDefault();const start=input.selectionStart,end=input.selectionEnd,visible=input.type==='password';input.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',(visible?'Skjul ':'Vis ')+description.toLowerCase());toggle.title=(visible?'Skjul ':'Vis ')+description.toLowerCase();field.classList.toggle('password-visible',visible);input.focus({preventScroll:true});if(start!==null&&end!==null)input.setSelectionRange(start,end);};
    field.append(toggle);
  }
  addAuthenticatorKeyboards(root);
}
function addAuthenticatorKeyboards(root){
  for(const input of root.querySelectorAll?.('input[name=code],input[name=mfa_code]')||[]){
    input.setAttribute('inputmode','numeric');input.setAttribute('enterkeyhint','done');
    if(input.dataset.authenticatorRecovery!=='true'||input.dataset.authenticatorReady==='true')continue;
    input.dataset.authenticatorReady='true';
    const label=input.parentElement?.tagName==='LABEL'?input.parentElement:null;
    if(!label)continue;
    if(!input.id)input.id='authenticator-code-'+(++passwordControlSequence);
    const control=document.createElement('div');control.className='authenticator-control';
    label.parentNode.insertBefore(control,label);control.append(label,input);label.htmlFor=input.id;label.textContent='Kode fra Authenticator';
    const button=document.createElement('button');button.type='button';button.className='secondary authenticator-mode-switch';button.textContent='Brug reservekode';button.setAttribute('aria-controls',input.id);button.setAttribute('aria-pressed','false');
    let recovery=false;
    button.onclick=event=>{event.preventDefault();recovery=!recovery;input.setAttribute('inputmode',recovery?'text':'numeric');input.setAttribute('autocomplete',recovery?'off':'one-time-code');label.textContent=recovery?'Reservekode':'Kode fra Authenticator';button.textContent=recovery?'Brug Authenticator':'Brug reservekode';button.setAttribute('aria-pressed',String(recovery));input.focus({preventScroll:true});};
    control.append(button);
  }
}
function modal(title,html,photo=false){
  grantDialog=null;
  cancelGalleryDeleteConfirmation();
  photoViewerGeneration++;photoViewerNavigation=null;privateAccountDialog=false;stopPhotoVideo();
  M.classList?.toggle('photo-dialog',photo);M.classList?.remove('photo-info-open');M.setAttribute?.('aria-labelledby','modal-title');
  M.innerHTML=`<div class="dialog-head${photo?' photo-toolbar':''}"><h2 id="modal-title"${photo?' class="photo-viewer-title"':''}>${esc(title)}</h2>${photo?'<button class="secondary" id="photo-info-toggle" type="button" aria-expanded="false" aria-controls="photo-info"><span aria-hidden="true">ⓘ</span> Info</button>':''}<button class="secondary" id="close-modal" type="button" aria-label="Luk">✕</button></div>${html}`;
  addPasswordToggles(M);$('#close-modal').onclick=requestDialogClose;if(!M.open)M.showModal();
}
function formHandler(id,fn){$(id).onsubmit=async e=>{e.preventDefault();const btn=$('button[type=submit]',e.target);if(btn)btn.disabled=true;try{await fn(Object.fromEntries(new FormData(e.target)))}catch(err){const out=$('.error',e.target);if(out)out.textContent=err.message;else toast(err.message)}finally{if(btn)btn.disabled=false}}}
function clearAccountWorkspace(){
  if(galleryNewsTimer!==null){clearInterval(galleryNewsTimer);galleryNewsTimer=null;}galleryNewsBusy=false;
  grantDialog=null;adminDirectoryData=null;cancelGalleryDeleteConfirmation();galleryDeleteState=null;
  accountGeneration++;profileGeneration++;navigationGeneration++;photoViewerGeneration++;stopLycheeView();stopPhotoVideo();galleries=[];photos=[];current=null;view='galleries';
  if(M.open)closeModal();M.innerHTML='';privateAccountDialog=false;
}
async function accountSignOut(){
  clearAccountWorkspace();me=null;A.innerHTML='<div class="login"><p role="status">Logger ud…</p></div>';
  let problem;try{await api('/logout','POST')}catch(error){problem=error}
  auth();
  if(problem)toast('Serveren kunne ikke bekræfte log ud. Prøv igen, når forbindelsen er tilbage.');
}
function accountMaintenance(){
  clearAccountWorkspace();me=null;
  A.innerHTML='<div class="login"><div class="brand">◈ Lex<span>Galleri</span></div><h1>Login opdateres.</h1><p>Administratoren er ved at gøre det nye login klar. Prøv igen, når opdateringen er afsluttet.</p><button id="account-refresh" type="button">Opdatér siden</button></div>';
  $('#account-refresh').onclick=()=>location.reload();
}
async function authResult(result,passwordStage=false){
  history.replaceState({},'',BASE+'/');
  if(result?.mfa_required===true){await mfaGate(result);return;}
  if(passwordStage&&result?.admin){accountMaintenance();try{await api('/logout','POST')}catch{}return;}
  if(typeof result?.id!=='string')throw Error('Login kunne ikke bekræftes');
  me={id:result.id,name:result.name,email:result.email,phone:result.phone,admin:result.admin};
  if(Array.isArray(result.recovery_codes)){recoveryCodesView(result.recovery_codes,()=>start());return;}
  await start();
}
function localAuthenticatorQr(uri){
  const target=$('#mfa-qr');if(!target)return;
  if(typeof uri!=='string'||!uri.startsWith('otpauth://totp/')||typeof qrcode!=='function'){target.textContent='Brug opsætningsnøglen nedenfor i din Authenticator-app.';return;}
  try{const image=qrcode(0,'M');image.addData(uri);image.make();target.innerHTML=image.createSvgTag({cellSize:4,margin:4,scalable:true});}
  catch{target.textContent='Brug opsætningsnøglen nedenfor i din Authenticator-app.';}
}
async function mfaGate(challenge){
  clearAccountWorkspace();me=null;const generation=accountGeneration;
  const enrollment=challenge?.mfa_enrollment_required===true;
  A.innerHTML=`<div class="login"><div class="brand">◈ Lex<span>Galleri</span></div><div class="eyebrow">Administrator · ekstra beskyttelse</div><h1>${enrollment?'Tilføj Authenticator.':'Bekræft dit login.'}</h1><p>${enrollment?'Tilføj LexGalleri i fx Google Authenticator eller Microsoft Authenticator. Bekræft med den sekscifrede kode, før du får adgang.':'Åbn din Authenticator-app, og indtast en ny sekscifret kode. Du kan også bruge en ubrugt reservekode.'}</p><div id="mfa-setup">${enrollment?'<p role="status">Gør opsætningen klar…</p>':''}</div><form id="mfa-form"><label>${enrollment?'Kode fra Authenticator':'Kode fra Authenticator eller reservekode'}<input name="code" type="text" autocomplete="one-time-code" ${enrollment?'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"':'inputmode="numeric" maxlength="64" autocapitalize="off" spellcheck="false" data-authenticator-recovery="true"'} required></label><p class="muted">En kode kan kun bruges én gang. Vent på en ny kode i appen, hvis du lige har brugt den.</p><div class="error" id="mfa-error" role="alert"></div><button type="submit" ${enrollment?'disabled':''}>${enrollment?'Bekræft Authenticator':'Log ind'} →</button></form><button class="secondary" id="mfa-cancel" type="button">Annullér og log ud</button></div>`;
  addAuthenticatorKeyboards(A);$('#mfa-cancel').onclick=accountSignOut;
  formHandler('#mfa-form',async fields=>{const reply=await api(enrollment?'/mfa/confirm':'/mfa/verify','POST',{code:fields.code});if(generation===accountGeneration)await authResult(reply)});
  if(!enrollment)return;
  try{
    const setup=await api('/mfa/setup','POST',{});if(generation!==accountGeneration)return;
    $('#mfa-setup').innerHTML=`<div id="mfa-qr" class="mfa-qr" aria-label="QR-kode til Authenticator"></div><label>Opsætningsnøgle<input id="mfa-key" class="mfa-key" readonly value="${esc(setup.secret)}" autocomplete="off" spellcheck="false"></label><p class="muted">Scan QR-koden i Authenticator. Du kan også vælge at indtaste opsætningsnøglen manuelt med tidsbaserede koder. Del ikke nøglen.</p>`;
    localAuthenticatorQr(setup.otpauth_uri);$('button[type=submit]',$('#mfa-form')).disabled=false;
  }catch(error){if(generation===accountGeneration){$('#mfa-setup').innerHTML='';$('#mfa-error').textContent=error.message;}}
}
function recoveryCodesView(codes,continueWith){
  if(!Array.isArray(codes)||!codes.length||codes.some(code=>typeof code!=='string'))throw Error('Reservekoderne kunne ikke vises. Prøv at oprette nye koder fra Min profil.');
  clearAccountWorkspace();const generation=accountGeneration;codes=codes.filter(code=>typeof code==='string');
  A.innerHTML=`<div class="login"><div class="brand">◈ Lex<span>Galleri</span></div><div class="eyebrow">Gem dem nu</div><h1>Dine reservekoder.</h1><p>Gem koderne et privat sted, adskilt fra telefonen. Hver kode kan bruges én gang, hvis du mister adgang til Authenticator. De vises kun nu.</p><ul class="recovery-codes">${codes.map(code=>`<li>${esc(code)}</li>`).join('')}</ul><div class="account-actions"><button id="recovery-copy" class="secondary" type="button">Kopiér koder</button><button id="recovery-download" class="secondary" type="button">Hent koder som tekstfil</button></div><label class="check"><input id="recovery-saved" type="checkbox">Jeg har gemt mine reservekoder et privat sted.</label><button id="recovery-continue" type="button" disabled>Fortsæt til LexGalleri →</button><button id="recovery-logout" class="secondary" type="button">Log ud</button></div>`;
  $('#recovery-copy').onclick=async()=>{try{await navigator.clipboard.writeText(codes.join('\n'));toast('Reservekoder kopieret')}catch{toast('Kopiér koderne fra listen, eller hent tekstfilen.')}};
  $('#recovery-download').onclick=()=>{const file=new Blob(['LexGalleri · reservekoder\nHver kode kan bruges én gang. Opbevar filen privat.\n\n'+codes.join('\n')+'\n'],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download='lexgalleri-reservekoder.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $('#recovery-saved').onchange=event=>{$('#recovery-continue').disabled=!event.target.checked};
  $('#recovery-continue').onclick=async()=>{if(!$('#recovery-saved').checked||generation!==accountGeneration)return;codes=[];A.innerHTML='';try{await continueWith()}catch(error){auth();toast(error.message)}};
  $('#recovery-logout').onclick=()=>{codes=[];return accountSignOut()};
}
function auth(setup=false,invite=null,prefill=''){clearAccountWorkspace();me=null;A.innerHTML=`<div class="login"><div class="brand">◈ Lex<span>Galleri</span></div><div class="eyebrow">Kun for jer</div><h1>${setup?'Et hjem til jeres minder.':invite?'Du er inviteret.':'Velkommen hjem.'}</h1><p class="muted">${setup?'Opret familiens administrator for at komme i gang.':invite?'Første gang vælger du en adgangskode på mindst 12 tegn. Har du allerede accepteret, bruger du den samme adgangskode. Linket bekræfter ikke ejerskabet af et telefonnummer; del det privat.':'Log ind og find tilbage til de øjeblikke, I deler.'}</p><form id="auth">${setup?'<label>Opsætningsnøgle<input name="token" type="password" required></label><label>Dit navn<input name="name" autocomplete="name" required></label>':''}${invite?'':`<label>${setup?'E-mail':'E-mail eller dansk telefonnummer'}<input name="email" type="${setup?'email':'text'}" autocomplete="username" value="${esc(prefill)}" required></label>`}<label>Adgangskode<input name="password" type="password" autocomplete="${setup||invite?'new-password':'current-password'}" minlength="${setup?12:1}" required></label><div class="error" role="alert"></div><button type="submit">${setup?'Opret familiearkiv':invite?'Acceptér invitation':'Log ind'} →</button></form><p class="muted" style="font-size:12px;margin-top:26px">Private billeder. Fælles minder.</p>${activityNotice()}</div>`;addPasswordToggles(A);formHandler('#auth',async b=>{if(invite)b.token=invite;else if(!setup&&!b.email.includes('@')){b.phone=b.email;delete b.email;}const result=await api(setup?'/setup':invite?'/accept':'/login','POST',b);await authResult(result,true)})}
async function init(){try{const s=await api('/status');serverCapabilities=s.capabilities&&typeof s.capabilities==='object'?s.capabilities:{};if(s.account_security_version!==1||(!s.setup&&s.account_security_ready!==true))return accountMaintenance();const token=new URLSearchParams(location.search).get('invite');if(token)return auth(false,token);if(s.setup)return auth(true);try{me=await api('/me')}catch(error){if(error.status&&error.status!==401)throw error;let pending;try{pending=await api('/mfa/status')}catch(problem){if(problem.status&&![401,404].includes(problem.status))throw problem;return auth()}return mfaGate(pending)}await start()}catch(e){A.innerHTML='<div class="login"><h1>Kunne ikke starte</h1><p>'+esc(e.message)+'</p></div>'}}
async function start(){const generation=++navigationGeneration,account=accountGeneration;const theme=await api('/theme');if(generation!==navigationGeneration||account!==accountGeneration||!me)return;const list=await api('/galleries');if(generation!==navigationGeneration||account!==accountGeneration||!me)return;applyTheme(theme);galleries=list;shell();await render();await consumeGalleryLink();startGalleryNewsPolling()}
function shell(){
  A.innerHTML=`<div class="shell compact-shell"><aside><div class="brand">◈ Lex<span>Galleri</span></div><nav class="primary-nav" aria-label="Hovedmenu"><button data-view="galleries"><span aria-hidden="true">▧</span><span>Gallerier</span></button><button data-view="timeline"><span aria-hidden="true">◷</span><span>Tidslinje</span></button><button data-view="favorites"><span aria-hidden="true">♡</span><span>Favoritter</span></button><button class="desktop-nav-only" data-view="profile">Min profil</button>${me.admin?'<button class="desktop-nav-only" data-view="admin" aria-controls="admin-subnav" aria-expanded="false">Administration</button>':''}<button id="more-menu" class="mobile-nav-only"><span aria-hidden="true">☰</span><span>Mere</span></button></nav><details class="account-menu" id="account-menu"><summary class="avatar" aria-label="Din konto">${esc((me.name||'?')[0])}</summary><div class="account-popover"><strong>${esc(me.name)}</strong><p>${me.admin?'Administrator':'Medlem'}</p><button class="secondary" id="account-profile" type="button">Min profil</button><button id="logout" type="button">Log ud</button><button id="mobile-logout" type="button">Log ud</button>${activityNotice()}</div></details>${me.admin?`<div class="admin-subnav" id="admin-subnav" hidden>${adminAreas.filter(([key])=>key!=='admin').map(([key,label])=>`<button type="button" data-view="${key}">${label}</button>`).join('')}</div>`:''}</aside><main><div id="content"></div></main></div>`;
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigateView(b.dataset.view));
  updateNewsNavigation();
  $('#logout').onclick=accountSignOut;$('#mobile-logout').onclick=accountSignOut;
  $('#account-profile').onclick=()=>{$('#account-menu').open=false;return navigateView('profile')};
  $('#more-menu').onclick=()=>{
    modal('Mere',`<div class="dialog-content more-actions"><button class="secondary" id="more-profile" type="button">Min profil</button>${me.admin?'<button class="secondary" id="more-admin" type="button">Administration</button>':''}<button class="secondary" id="more-logout" type="button">Log ud</button>${activityNotice()}</div>`);
    $('#more-profile').onclick=()=>{closeModal();return navigateView('profile')};
    if($('#more-admin'))$('#more-admin').onclick=()=>{closeModal();return navigateView('admin')};$('#more-logout').onclick=accountSignOut;
  };
}
function activityNotice(){return serverCapabilities.member_activity===true?'<p class="privacy-note">Admin kan se dine login og åbnede gallerier i 30 dage. Der gemmes ikke historik over åbning af enkeltbilleder, IP-adresser eller læsetid. Markering af viste galleribilleder bruges kun til dine påmindelser.</p>':'';}
function updateNewsNavigation(){
  if(serverCapabilities.gallery_news!==true)return;
  const tab=$('[data-view=galleries]');if(!tab)return;
  const count=galleries.reduce((sum,g)=>sum+(Number(g.new_count)||0),0);let badge=tab.querySelector('.nav-new');
  if(count&&!badge){badge=document.createElement('span');badge.className='nav-new';tab.append(badge);}
  if(badge){badge.hidden=count===0;badge.textContent=count>99?'99+':String(count);}
  tab.setAttribute('aria-label',count?'Gallerier, '+count+' nye billeder og videoer':'Gallerier');
}
function galleryNewsMarkup(){
  if(serverCapabilities.gallery_news!==true)return '';
  const changed=galleries.filter(g=>Number(g.new_count)>0),total=changed.reduce((sum,g)=>sum+Number(g.new_count),0);
  if(!total)return '';
  return `<button class="gallery-news" id="gallery-news" type="button"><span class="news-symbol" aria-hidden="true">✦</span><span><strong>${total} nye billeder og videoer</strong><small>I ${changed.length} ${changed.length===1?'galleri':'gallerier'} · se hvad der er kommet til</small></span><span aria-hidden="true">›</span></button>`;
}
function startGalleryNewsPolling(){
  if(galleryNewsTimer!==null){clearInterval(galleryNewsTimer);galleryNewsTimer=null;}
  if(serverCapabilities.gallery_news===true&&typeof setInterval==='function')galleryNewsTimer=setInterval(()=>refreshGalleryNews(),30000);
}
async function refreshGalleryNews(){
  if(galleryNewsBusy||!me||serverCapabilities.gallery_news!==true||document.visibilityState==='hidden')return;
  const account=accountGeneration,generation=navigationGeneration,gallery=current;
  galleryNewsBusy=true;
  try{
    const data=await api('/news'+(gallery?'?gallery_id='+encodeURIComponent(gallery.id):''));
    if(account!==accountGeneration||generation!==navigationGeneration||!me||current!==gallery)return;
    if(!Array.isArray(data.galleries)||!Array.isArray(data.photo_ids))throw Error('Nye billeder kunne ikke bekræftes');
    galleries=data.galleries;updateNewsNavigation();
    const slot=$('#gallery-news-slot');if(slot){slot.innerHTML=galleryNewsMarkup();const button=$('#gallery-news');if(button)button.onclick=()=>{const first=galleries.find(g=>Number(g.new_count)>0);if(first)openGallery(first.id)};}
    document.querySelectorAll('[data-gallery]').forEach(button=>{const badge=button.querySelector('.new-badge'),g=galleries.find(x=>x.id===button.dataset.gallery);if(badge){badge.hidden=!g||Number(g.new_count)<1;badge.textContent=(Number(g?.new_count)||0)+' nye';}});
    const notice=$('#gallery-live-news');if(notice&&gallery){
      const known=new Set(photos.map(p=>p.id)),arrived=data.photo_ids.filter(id=>!known.has(id)).length;
      notice.hidden=arrived===0;notice.innerHTML=arrived?`<button class="gallery-news" id="gallery-load-new" type="button"><strong>${arrived} nye billeder og videoer · Opdatér galleriet</strong></button>`:'';
      const trigger=$('#gallery-load-new');if(trigger)trigger.onclick=()=>galleryView();
    }
  }catch(error){
    if(account!==accountGeneration||generation!==navigationGeneration||!me)return;
    if(error.status===403&&gallery){await galleryAccessLost();return;}
    const slot=$('#gallery-news-slot');if(slot)slot.innerHTML='<p class="muted" role="status">Nye billeder kunne ikke opdateres. Prøv igen om lidt.</p>';
  }finally{if(account===accountGeneration)galleryNewsBusy=false;}
}
async function recordGalleryVisit(gallery,items,active){
  if(serverCapabilities.member_activity!==true||!active())return;
  const ids=items.filter(p=>p.is_new===true).map(p=>p.id),batches=[];
  for(let i=0;i<ids.length;i+=500)batches.push(ids.slice(i,i+500));if(!batches.length)batches.push([]);
  try{for(const photo_ids of batches){if(!active())return;await api('/galleries/'+gallery.id+'/visit','POST',{photo_ids});}}
  catch{if(active())toast('Nye billeder kunne ikke markeres som set. De bliver vist som nye igen.');}
}
function activityDate(value){if(!value)return 'Ingen registrering';const date=new Date(value.endsWith('Z')?value:value.replace(' ','T').slice(0,23)+'Z');return Number.isNaN(date.getTime())?'Ukendt tidspunkt':date.toLocaleString('da-DK',{dateStyle:'short',timeStyle:'short'});}
async function adminActivityView(userId=''){
  if(!me?.admin)return;
  const generation=navigationGeneration,account=accountGeneration;
  $('#content').innerHTML='<p role="status">Henter aktivitet og nye billeder…</p>';decorateAdmin('activity');
  if(serverCapabilities.member_activity!==true){$('#content').insertAdjacentHTML('beforeend','<div class="panel"><p>Aktivitet og nye billeder er ikke aktiveret. Installér migrering 008 og de private programfiler fra samme version.</p></div>');return;}
  let data;try{data=await api('/admin/activity'+(userId?'?user_id='+encodeURIComponent(userId):''));if(!Array.isArray(data.people)||!Array.isArray(data.events)||!Array.isArray(data.uploads))throw Error('Oversigten kunne ikke bekræftes');}
  catch(error){if(galleryRequestActive(generation,account,'activity',null))adminPageFailure('Aktiviteten kunne ikke hentes',error,()=>adminActivityView(userId));return;}
  if(!galleryRequestActive(generation,account,'activity',null)||!me?.admin)return;
  $('#content').innerHTML=`<div class="heading"><div><h2>Aktivitet og nyt</h2><p class="muted">Login og åbnede gallerier · seneste 30 dage</p></div><button class="secondary" id="activity-refresh" type="button">Opdatér</button></div><div class="panel"><label>Vis medlem<select id="activity-member"><option value="">Alle medlemmer</option>${data.people.map(p=>`<option value="${esc(p.id)}" ${p.id===userId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><div class="activity-members">${data.people.filter(p=>!userId||p.id===userId).map(p=>`<div class="activity-member"><strong>${esc(p.name)}</strong><span>Login: ${esc(activityDate(p.last_login))}</span><span>Galleri: ${esc(activityDate(p.last_gallery))}</span></div>`).join('')}</div></div><section class="panel"><h2>Seneste besøg</h2><ul class="activity-list">${data.events.map(e=>`<li><strong>${esc(e.name)}</strong><span>${e.kind==='login'?'Loggede ind':'Åbnede '+esc(e.gallery_name||'et fjernet galleri')}</span><time>${esc(activityDate(e.occurred_at))}</time></li>`).join('')||'<li>Ingen registreringer i perioden.</li>'}</ul><p class="muted">Højst 100 hændelser. Gentagne åbninger af samme galleri samles inden for fem minutter. En åbning beviser ikke, at indholdet er læst.</p></section><section class="panel"><h2>Seneste nye billeder og videoer</h2><ul class="activity-list">${data.uploads.map(p=>`<li><strong>${esc(p.title)}</strong><span>${esc(p.gallery_name)} · ${esc(p.uploader_name)}</span><time>${esc(activityDate(p.uploaded))}</time></li>`).join('')||'<li>Der er endnu ingen uploads.</li>'}</ul></section>`;
  decorateAdmin('activity');$('#activity-member').onchange=event=>adminActivityView(event.target.value);$('#activity-refresh').onclick=()=>adminActivityView(userId);
}
async function render(){if(isAdminView(view)&&!me?.admin){view='galleries';current=null;}updateAdminNavigation();if(view!=='lychee')stopLycheeView();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const C=$('#content');if(view==='galleries'&&!current){C.innerHTML=`<div class="heading gallery-heading"><div><h1>Gallerier</h1><p class="muted">${galleries.length} private gallerier</p></div>${me.admin||serverCapabilities.gallery_create===true?'<button id="new-gallery" type="button">＋ Nyt galleri</button>':''}</div><div id="gallery-news-slot">${galleryNewsMarkup()}</div><div class="tools gallery-tools"><input id="search-gallery" type="search" placeholder="Søg i gallerier…" aria-label="Søg i gallerier"><details class="gallery-more"><summary aria-label="Gallerihandlinger">•••</summary><div>${galleryDeletionOverviewMarkup()}</div></details></div><div id="gallery-grid" class="grid"></div>`;const draw=()=>{$('#gallery-grid').innerHTML=galleries.filter(g=>g.name.toLowerCase().includes($('#search-gallery').value.toLowerCase())).map(g=>`<article class="card album-card"><button data-gallery="${g.id}">${g.cover?`<img class="cover" src="${BASE}/api/photos/${g.cover}/image" loading="lazy" alt="">`:'<div class="cover placeholder">◈</div>'}<div class="card-body"><h3>${esc(g.name)}</h3><p class="muted">${esc(g.description||'Et sted til jeres minder')}</p><span class="album-count">${g.count} billeder</span> <span class="new-badge" ${Number(g.new_count)>0?'':'hidden'}>${Number(g.new_count)||0} nye</span></div></button></article>`).join('')||'<div class="empty"><h2>Her begynder minderne</h2><p>Gallerier vises her, når de er oprettet og delt med dig.</p></div>';document.querySelectorAll('[data-gallery]').forEach(b=>b.onclick=()=>openGallery(b.dataset.gallery))};draw();$('#search-gallery').oninput=draw;if($('#gallery-news'))$('#gallery-news').onclick=()=>{const first=galleries.find(g=>Number(g.new_count)>0);if(first)openGallery(first.id);};if($('#new-gallery'))$('#new-gallery').onclick=newGallery;if($('#gallery-delete-overview'))$('#gallery-delete-overview').onclick=()=>{const menu=document.querySelector('.gallery-more');if(menu)menu.open=false;chooseDeletionGallery();};
}else if(current){await galleryView()}else if(view==='timeline'||view==='favorites'){await collectionView()}else if(view==='profile'){await profileView()}else if(view==='admin'){await adminOverview()}else if(view==='people'){await peopleView()}else if(view==='admin-content'){adminContentView()}else if(view==='activity'){await adminActivityView()}else if(view==='admin-security'){await adminSecurityView()}else if(view==='design'){await designView()}else if(view==='deletions'&&me.admin){await deletionRequestsView()}else if(view==='lychee'&&me.admin){await lycheeView()}}
function newGallery(){
  const account=accountGeneration;
  modal('Et nyt kapitel',`<div class="dialog-content"><form id="new"><label>Galleriets navn<input name="name" required maxlength="100" placeholder="Fx Sommer ved Vesterhavet"></label><label>Beskrivelse<textarea name="description" rows="3" maxlength="1000"></textarea></label><p class="muted">${me.admin?'Kun admin har adgang fra start. Del det bagefter med familien.':'Du og admin har adgang fra start. Admin kan dele galleriet med familien.'}</p><div class="error" role="alert"></div><button type="submit">Opret galleri</button></form></div>`);
  const generation=photoViewerGeneration;
  formHandler('#new',async fields=>{
    await api('/galleries','POST',fields);
    if(account!==accountGeneration||!me)return;
    if(generation!==photoViewerGeneration){toast('Galleriet er oprettet.');return;}
    closeModal();await refreshGalleryView('galleries');
    if(account===accountGeneration&&me)toast('Galleriet er oprettet.');
  });
}
function galleryRequestActive(generation,account,requestView,requestGallery){
  return generation===navigationGeneration&&account===accountGeneration&&view===requestView&&current===requestGallery&&!!me;
}
function navigateView(nextView){
  if(['galleries','timeline','favorites'].includes(nextView))return refreshGalleryView(nextView);
  navigationGeneration++;photoViewerGeneration++;stopLycheeView();view=nextView;current=null;
  return render().catch(error=>toast(error.message));
}
async function refreshGalleryView(nextView='galleries'){
  const generation=++navigationGeneration,account=accountGeneration;
  photoViewerGeneration++;stopLycheeView();view=nextView;current=null;photos=[];permissions={};galleries=[];
  if(M.open)closeModal();
  const content=$('#content');content.innerHTML='<p role="status">Henter dine gallerier…</p>';
  try{
    const list=await api('/galleries');
    if(!galleryRequestActive(generation,account,nextView,null))return;
    if(!Array.isArray(list))throw Error('Serveren kunne ikke bekræfte dine gallerier.');
    galleries=list;await render();
  }catch(error){
    if(!galleryRequestActive(generation,account,nextView,null))return;
    galleries=[];photos=[];permissions={};
    content.innerHTML='<div class="panel"><h2>Gallerierne kunne ikke hentes</h2><p class="error" role="alert">'+esc(error.message)+'</p><button id="gallery-retry" type="button">Prøv igen</button></div>';
    $('#gallery-retry').onclick=()=>refreshGalleryView(nextView);
  }
}
async function collectionView(){
  const generation=navigationGeneration,account=accountGeneration,requestView=view,content=$('#content');
  photos=[];content.innerHTML='<p role="status">Henter dine billeder…</p>';
  const results=await Promise.all(galleries.map(async gallery=>{
    try{return{gallery_id:gallery.id,photos:(await api('/galleries/'+gallery.id+'/photos')).photos};}
    catch(error){if(error.status===403||error.status===404)return{gallery_id:gallery.id,photos:[],revoked:true};throw error;}
  }));
  if(!galleryRequestActive(generation,account,requestView,null))return;
  const revoked=new Set(results.filter(result=>result.revoked).map(result=>result.gallery_id));
  galleries=galleries.filter(gallery=>!revoked.has(gallery.id));photos=results.flatMap(result=>result.photos);
  if(view==='favorites')photos=photos.filter(photo=>photo.favorite);
  photos.sort((a,b)=>(b.taken||b.uploaded).localeCompare(a.taken||a.uploaded));
  content.innerHTML=`<div class="heading"><div><div class="eyebrow">${view==='timeline'?'På tværs af gallerier':'Dine udvalgte øjeblikke'}</div><h1>${view==='timeline'?'Tidslinjen':'Favoritter'}</h1><p class="muted" id="photo-count">${photos.length} billeder, du har adgang til</p></div></div><div id="photo-grid" class="photo-grid"></div>`;
  drawPhotos(photos);
}
async function galleryAccessLost(){
  const account=accountGeneration;await refreshGalleryView('galleries');
  if(account===accountGeneration&&me&&view==='galleries'&&!current)toast('Du har ikke længere adgang til dette galleri.');
}
async function openGallery(id){
  const gallery=galleries.find(gallery=>gallery.id===id);if(!gallery)return refreshGalleryView('galleries');
  navigationGeneration++;photoViewerGeneration++;view='galleries';current=gallery;
  try{await render();}catch(error){$('#content').innerHTML='<p class="error" role="alert">'+esc(error.message)+'</p>';}
}
// Decode only a local upload or the existing permission-checked video stream.
// No playback, audio, external service or persistent browser cache is involved.
async function captureVideoThumbnail(source){
  const video=document.createElement('video'),local=source instanceof Blob,url=local?URL.createObjectURL(source):source;
  video.muted=true;video.playsInline=true;video.preload='auto';
  let cancel;
  try{
    await new Promise((resolve,reject)=>{
      let timer=setTimeout(()=>reject(Error('Videoen kunne ikke læses i denne browser')),10000);
      const done=(error)=>{clearTimeout(timer);timer=null;video.onloadeddata=video.onseeked=video.onerror=null;error?reject(error):resolve();};
      cancel=()=>{if(timer!==null)done(Error('Miniaturen blev afbrudt'));};
      video.onerror=()=>done(Error('Videoformatet understøttes ikke af denne browser'));
      video.onloadeddata=()=>{
        video.onloadeddata=null;
        if(!video.videoWidth||!video.videoHeight){done(Error('Videoen mangler et læsbart billede'));return;}
        const target=Number.isFinite(video.duration)&&video.duration>0?Math.min(1,video.duration/2):0;
        if(target===0){done();return;}
        video.onseeked=()=>done();video.currentTime=target;
      };
      video.src=url;video.load();
    });
    const ratio=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*ratio));canvas.height=Math.max(1,Math.round(video.videoHeight*ratio));
    const context=canvas.getContext('2d');if(!context)throw Error('Browseren kan ikke lave et miniaturebillede');
    context.drawImage(video,0,0,canvas.width,canvas.height);
    const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.85));
    if(!image||image.size>1024*1024)throw Error('Miniaturebilledet kunne ikke klargøres');return image;
  }finally{cancel?.();video.pause();video.removeAttribute('src');video.load();if(local)URL.revokeObjectURL(url);}
}
async function makeVideoThumbnail(photo,rights){
  if(serverCapabilities.video_thumbnails!==true||!rights.video||!(me?.admin||rights.edit))return;
  const generation=photoViewerGeneration,account=accountGeneration,button=$('#video-thumbnail'),status=$('#video-thumbnail-status');
  const active=()=>generation===photoViewerGeneration&&account===accountGeneration&&!!me&&M.open;
  button.disabled=true;status.textContent='Laver miniaturebillede…';
  try{
    const image=await captureVideoThumbnail(photoPath(photo)+'/video');if(!active())return;
    const form=new FormData();form.append('file',image,'thumbnail.jpg');
    await api('/photos/'+encodeURIComponent(photo.id)+'/thumbnail','POST',form);if(!active())return;
    const card=document.querySelector('[data-photo="'+photo.id+'"] img');if(card)card.src=photoPath(photo)+'/image?size=thumb&v='+Date.now();
    const player=$('#photo-video');if(player)player.poster=photoPath(photo)+'/image?size=view&v='+Date.now();
    status.textContent='Miniaturebilledet er gemt.';
  }catch(error){if(active())status.textContent=error.message+' Prøv igen. Videoens original ændres ikke.';}
  finally{if(active())button.disabled=false;}
}
async function galleryView(){
  cancelGalleryDeleteConfirmation();galleryDeleteState=null;
  const requestGallery=current,generation=navigationGeneration,account=accountGeneration,requestView=view,content=$('#content');
  photos=[];permissions={};content.innerHTML='<p role="status">Henter billeder…</p>';
  let result;
  try{result=await api('/galleries/'+requestGallery.id+'/photos');}
  catch(error){
    if(!galleryRequestActive(generation,account,requestView,requestGallery))return;
    if(error.status===403||error.status===404){await galleryAccessLost();return;}
    throw error;
  }
  if(!galleryRequestActive(generation,account,requestView,requestGallery))return;
  photos=result.photos;permissions=result.permissions;
  content.innerHTML=`<button class="secondary" id="back">← Alle gallerier</button><div class="heading" style="margin-top:26px"><div><div class="eyebrow">🔒 Privat galleri</div><h1 id="gallery-title" style="margin:12px 0">${esc(requestGallery.name)}</h1><p class="muted"><span id="gallery-description">${esc(requestGallery.description)}</span> · <span id="gallery-media-count">${photos.length} billeder</span></p></div><div class="gallery-actions">${permissions.upload?'<button id="upload">＋ Tilføj billeder / video</button><input id="files" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,.mp4" hidden>':''}${memberSharingAvailable()?'<button class="secondary" id="member-sharing" type="button">Del med medlemmer</button>':''}<button class="secondary" id="share-gallery" type="button">Del via Signal</button><button class="secondary" id="copy-gallery-link" type="button">Kopiér link</button>${galleryEditButtonMarkup()}${galleryBulkMetadataButtonMarkup()}${wholeGalleryButtonMarkup()}${galleryDeletionToggleMarkup()}</div></div><div id="gallery-live-news" hidden></div><div class="tools"><input id="search-photo" placeholder="Søg efter titel, sted eller uploader…" aria-label="Søg i billeder"><select id="sort" aria-label="Sortering"><option value="taken">Optaget · nyeste først</option><option value="uploaded">Senest uploadet</option></select></div><p class="muted">Billeder: højst 25 MB. MP4-video: højst 100 MB pr. fil. Videoers afspilning afhænger af browserens understøttelse.</p><div id="upload-status" role="status"></div>${galleryDeletionToolsMarkup()}<div id="photo-grid" class="photo-grid"></div>`;
  $('#back').onclick=()=>refreshGalleryView('galleries');drawPhotos(photos);
  if($('#bulk-gallery-metadata'))$('#bulk-gallery-metadata').onclick=bulkGalleryMetadata;
  const wholeDelete=$('#whole-gallery-delete')||$('#whole-gallery-request');if(wholeDelete)wholeDelete.onclick=()=>wholeGalleryDialog(requestGallery);
  $('#share-gallery').onclick=()=>shareGallery(requestGallery);
  if($('#member-sharing'))$('#member-sharing').onclick=()=>memberSharingDialog(requestGallery);
  $('#copy-gallery-link').onclick=()=>{if(me&&current?.id===requestGallery.id)shareLinkDialog({url:galleryShareUrl(requestGallery.id)},false);};
  recordGalleryVisit(requestGallery,photos,()=>galleryRequestActive(generation,account,requestView,requestGallery));
  bindGalleryDelete(requestGallery);if($('#edit-gallery'))$('#edit-gallery').onclick=()=>editGallery(requestGallery);
  const filter=()=>{if(galleryDeleteState?.active){galleryDeleteState.selected.clear();$('#gallery-delete-feedback').textContent='Markeringerne er nulstillet, fordi søgningen eller sorteringen blev ændret.';}const q=$('#search-photo').value.toLowerCase(),key=$('#sort').value;drawPhotos(photos.filter(photo=>[photo.title,photo.place,photo.uploader_name].join(' ').toLowerCase().includes(q)).sort((a,b)=>(b[key]||'').localeCompare(a[key]||'')));};
  $('#search-photo').oninput=filter;$('#sort').onchange=filter;
  if($('#upload')){
    const upload=$('#upload'),status=$('#upload-status');upload.onclick=()=>$('#files').click();
    $('#files').onchange=async event=>{
      const files=[...event.target.files],errors=[];upload.disabled=true;
      for(let i=0;i<files.length;i++){
        const isVideo=/\.mp4$/i.test(files[i].name),limit=(isVideo?100:25)*1024*1024;
        if(files[i].size>limit){errors.push(files[i].name+': Filen må højst være '+(isVideo?100:25)+' MB');continue;}
        status.textContent=`Uploader ${i+1} af ${files.length}: ${files[i].name}`;
        const form=new FormData();form.append('file',files[i]);
        if(isVideo&&serverCapabilities.video_thumbnails===true){
          try{form.append('thumbnail',await captureVideoThumbnail(files[i]),'thumbnail.jpg');}
          catch{errors.push(files[i].name+': Browseren kunne ikke lave miniature; videoen uploades med standardikon.');}
        }
        if(!galleryRequestActive(generation,account,requestView,requestGallery))return;
        try{await api('/galleries/'+requestGallery.id+'/photos','POST',form);}catch(error){errors.push(files[i].name+': '+error.message);}
      }
      if(!galleryRequestActive(generation,account,requestView,requestGallery))return;
      await galleryView();
      const list=await api('/galleries');if(!galleryRequestActive(generation,account,requestView,requestGallery))return;
      galleries=list;toast(errors.length?errors.join(' · '):`${files.length} filer uploadet`);
    };
  }
}
async function deletionRequestsView(){
  const generation=navigationGeneration,account=accountGeneration,content=$('#content');
  if(!me?.admin)return;
  content.innerHTML='<div class="heading"><div><h1>Sletteønsker</h1><p>Medlemmer markerer egne billeder og videoer. Filerne slettes først, når du godkender.</p></div></div>';
  decorateAdmin('deletions');
  await wholeGalleryQueue(content,generation,account);
  if(!galleryRequestActive(generation,account,'deletions',null)||!me?.admin)return;
  if(serverCapabilities.media_delete_requests!==true){content.insertAdjacentHTML('beforeend','<div class="panel"><p role="status">Godkendelse af sletning er ikke aktiveret endnu. Opsætningen skal færdiggøres, før du kan behandle markeringer.</p><a href="https://github.com/alexhertzladiges-lab/LexGalleri/blob/main/ACCOUNTS.md#markering-til-sletning-og-admins-godkendelse" target="_blank" rel="noopener">Se installationsvejledningen</a></div>');return;}
  content.insertAdjacentHTML('beforeend','<p role="status" id="deletion-request-loading">Henter markeringer…</p>');
  const active=()=>galleryRequestActive(generation,account,'deletions',null)&&!!me?.admin;
  let requests;
  try{requests=await api('/admin/deletion-requests');if(!Array.isArray(requests))throw Error('Serveren kunne ikke bekræfte markeringerne.');}
  catch(error){if(active()){$('#deletion-request-loading').textContent='Kunne ikke hente markeringerne: '+error.message;$('#deletion-request-loading').className='error';}return;}
  if(!active())return;
  $('#deletion-request-loading').remove();
  content.insertAdjacentHTML('beforeend',`<p id="deletion-request-count" role="status">${requests.length} afventer godkendelse</p><p id="deletion-request-feedback" role="status" aria-live="polite"></p><div id="deletion-request-list">${requests.map(request=>`<article class="panel deletion-request-card" data-deletion-request="${esc(request.id)}"><h2>${esc(request.title)}</h2><p>${request.mime==='video/mp4'?'Video':'Billede'} i <strong>${esc(request.gallery_name||'Galleri')}</strong></p><p>Markeret af <strong>${esc(request.requester_name)}</strong> · ${esc(new Date(request.created).toLocaleString('da-DK'))}</p><div class="gallery-delete-actions"><button class="secondary" data-deletion-preview="${esc(request.id)}" type="button">Vis ${request.mime==='video/mp4'?'video':'billede'}</button><button class="danger" data-deletion-approve="${esc(request.id)}" type="button">Godkend sletning</button><button class="secondary" data-deletion-reject="${esc(request.id)}" type="button">Afvis</button></div></article>`).join('')}</div>`);
  const updateCount=()=>{$('#deletion-request-count').textContent=requests.length+' afventer godkendelse';};
  for(const request of requests){
    const card=Array.from(document.querySelectorAll('[data-deletion-request]')).find(element=>element.dataset.deletionRequest===request.id);
    $('[data-deletion-preview]',card).onclick=()=>{
      if(!active())return;
      const photo={id:request.photo_id,title:request.title,mime:request.mime};
      modal('Gennemse markering',`<div class="dialog-content"><h2>${esc(request.title)}</h2><p>${esc(request.requester_name)} · ${esc(request.gallery_name||'Galleri')}</p><div class="deletion-preview-media">${photoMedia(photo,{video:true})}</div></div>`);bindPhotoVideo(photo,{video:true,download:true,gps:true});
    };
    for(const action of ['approve','reject'])$('[data-deletion-'+action+']',card).onclick=()=>{
      if(!active()||card.dataset.pending==='true')return;
      const approve=action==='approve';
      modal(approve?'Godkend sletning':'Afvis sletning',`<div class="dialog-content" id="deletion-decision-confirm"><p>${approve?'Vil du godkende sletning af':'Vil du afvise sletning af'} <strong>${esc(request.title)}</strong> i <strong>${esc(request.gallery_name||'Galleri')}</strong>?</p><p>Markeret af ${esc(request.requester_name)}.</p><p>${approve?'Billedet eller videoen fjernes fra dette galleri. Handlingen kan ikke fortrydes her.':'Billedet eller videoen bevares, og markeringen fjernes.'}</p><p id="deletion-decision-status" role="status" aria-live="polite"></p><div class="gallery-delete-actions"><button id="deletion-decision-submit" class="${approve?'danger':'secondary'}" type="button">${approve?'Godkend sletning':'Afvis markering'}</button><button id="deletion-decision-cancel" class="secondary" type="button">Annullér</button></div></div>`);
      const dialogGeneration=photoViewerGeneration,submit=$('#deletion-decision-submit'),cancel=$('#deletion-decision-cancel'),status=$('#deletion-decision-status');let pending=false,resolved=false;
      const dialogActive=()=>active()&&M.open&&dialogGeneration===photoViewerGeneration;
      cancel.onclick=()=>{if(!pending)closeModal();};
      submit.onclick=async()=>{
        if(pending||resolved||!dialogActive())return;pending=true;submit.disabled=true;cancel.disabled=true;card.dataset.pending='true';status.textContent=approve?'Godkender sletning…':'Afviser markering…';status.classList.remove('error');
        card.querySelectorAll('button').forEach(button=>button.disabled=true);
        try{
          const result=await api('/admin/deletion-requests/'+encodeURIComponent(request.id)+'/'+action,'POST');
          if(result?.ok!==true||result.request?.status!==(approve?'approved':'rejected'))throw Error('Serveren kunne ikke bekræfte handlingen.');
          resolved=true;
          if(!active())return;
          requests=requests.filter(item=>item.id!==request.id);card.remove();updateCount();
          $('#deletion-request-feedback').textContent=approve?'Sletningen er godkendt. Filen er slettet fra galleriet.':'Markeringen er afvist. Filen er bevaret.';
          if(approve){const gallery=galleries.find(item=>item.id===request.gallery_id);if(gallery){gallery.count=Math.max(0,(Number(gallery.count)||0)-1);if(gallery.cover===request.photo_id)gallery.cover=null;}photos=photos.filter(photo=>photo.id!==request.photo_id);}
          if(dialogActive()){stopPhotoVideo();closeModal();}
        }catch(error){if(dialogActive()){status.textContent='Handlingen kunne ikke gennemføres: '+error.message;status.classList.add('error');}else if(active())$('#deletion-request-feedback').textContent='Handlingen kunne ikke gennemføres: '+error.message;}
        finally{pending=false;card.dataset.pending='false';card.querySelectorAll('button').forEach(button=>button.disabled=false);if(dialogActive()){submit.disabled=false;cancel.disabled=false;}}
      };
    };
  }
}
function galleryBulkMetadataButtonMarkup(){
  return me?.admin&&serverCapabilities.gallery_bulk_metadata===true?'<button class="secondary" id="bulk-gallery-metadata" type="button">Redigér alle billeder</button>':'';
}
function bulkGalleryMetadata(){
  if(!me?.admin||serverCapabilities.gallery_bulk_metadata!==true||!current)return;
  const account=accountGeneration,gallery=current;
  modal('Redigér oplysninger for hele galleriet',`<div class="dialog-content"><form id="gallery-bulk-form"><p>Vælg de oplysninger, der skal være ens på alle billeder og videoer i <strong>${esc(gallery.name)}</strong>. Felter uden flueben bevares.</p><fieldset id="bulk-fields"><label><input type="checkbox" data-bulk-field="date"> Dato og datopræcision</label><div data-bulk-controls="date"><label>Datopræcision<select name="precision" disabled>${[['day','Dag'],['exact','Dato og klokkeslæt'],['month','Måned'],['year','År'],['circa','Cirka år'],['unknown','Ukendt']].map(([v,label])=>`<option value="${v}">${label}</option>`).join('')}</select></label><label>Dato<input name="taken" placeholder="2026-11-01" disabled></label><p class="muted">Dag: 2026-11-01 · Tid: 2026-11-01T12:30 · Måned: 2026-11 · År: 2026. Tom ved ukendt dato.</p></div><label><input type="checkbox" data-bulk-field="place"> Sted</label><div data-bulk-controls="place"><label>Fælles sted<input name="place" maxlength="200" disabled></label></div><label><input type="checkbox" data-bulk-field="title"> Titel</label><div data-bulk-controls="title"><label>Fælles titel<input name="title" maxlength="200" required disabled></label><p class="muted">Den samme titel erstatter de nuværende titler.</p></div><label><input type="checkbox" data-bulk-field="gps"> GPS-koordinater</label><div data-bulk-controls="gps" class="row"><label>Breddegrad<input name="lat" type="number" step="any" min="-90" max="90" disabled></label><label>Længdegrad<input name="lon" type="number" step="any" min="-180" max="180" disabled></label></div><p class="muted">Et valgt tomt sted eller to tomme koordinater fjerner de pågældende oplysninger.</p></fieldset><p class="error" role="alert"></p><button type="submit" id="bulk-preview">Gennemgå ændringer</button><section id="bulk-review" class="panel" hidden><h3>Kontrollér ændringerne</h3><p id="bulk-review-count"></p><ul id="bulk-review-values"></ul><label>Skriv galleriets navn for at bekræfte<input id="bulk-confirm-name" autocomplete="off"></label><button type="button" id="bulk-apply">Gem på alle billeder og videoer</button></section><p id="bulk-status" role="status" aria-live="polite"></p></form></div>`);
  const generation=photoViewerGeneration,form=$('#gallery-bulk-form'),fields=$('#bulk-fields'),review=$('#bulk-review'),status=$('#bulk-status');let plan=null,pending=false;
  const active=()=>account===accountGeneration&&generation===photoViewerGeneration&&current?.id===gallery.id&&me?.admin&&form.isConnected&&M.open;
  const invalidate=()=>{plan=null;review.hidden=true;$('#bulk-confirm-name').value='';};
  const busy=value=>{pending=value;fields.disabled=value;$('#bulk-preview').disabled=value;$('#bulk-apply').disabled=value;$('#close-modal').disabled=value;};
  const blockClose=event=>{if(active()&&pending){event.preventDefault();event.stopImmediatePropagation();}};
  M.addEventListener('cancel',blockClose,true);M.addEventListener('close',()=>M.removeEventListener('cancel',blockClose,true),{once:true});
  for(const checkbox of form.querySelectorAll('[data-bulk-field]'))checkbox.onchange=()=>{invalidate();for(const input of form.querySelectorAll('[data-bulk-controls="'+checkbox.dataset.bulkField+'"] input,[data-bulk-controls="'+checkbox.dataset.bulkField+'"] select'))input.disabled=!checkbox.checked;};
  fields.addEventListener('input',invalidate);
  form.onsubmit=async event=>{
    event.preventDefault();if(pending||!active())return;invalidate();form.querySelector('.error').textContent='';
    const data=new FormData(form),changes={};
    for(const checkbox of form.querySelectorAll('[data-bulk-field]:checked')){
      const key=checkbox.dataset.bulkField;
      if(key==='date'){changes.taken=String(data.get('taken')||'');changes.precision=String(data.get('precision')||'');}
      else if(key==='gps'){changes.lat=data.get('lat')===''?null:Number(data.get('lat'));changes.lon=data.get('lon')===''?null:Number(data.get('lon'));}
      else changes[key]=String(data.get(key)||'');
    }
    if(!Object.keys(changes).length){form.querySelector('.error').textContent='Vælg mindst ét felt med flueben.';return;}
    busy(true);status.textContent='Henter gennemgang…';
    try{
      const reply=await api('/galleries/'+gallery.id+'/metadata-preview','POST',{changes});if(!active())return;
      if(!reply||typeof reply.token!=='string'||!Number.isInteger(reply.count)||reply.count<1||reply.gallery_id!==gallery.id||typeof reply.name!=='string'||!reply.changes)throw Error('Serveren kunne ikke bekræfte gennemgangen.');
      plan=reply;$('#bulk-review-count').textContent=reply.count+' billeder og videoer i '+reply.name+' omfattes af ændringen.';
      const labels={title:'Titel',taken:'Dato',precision:'Datopræcision',place:'Sted',lat:'Breddegrad',lon:'Længdegrad'};
      const precisionLabels={exact:'Dato og klokkeslæt',day:'Dag',month:'Måned',year:'År',circa:'Cirka år',unknown:'Ukendt'};
      $('#bulk-review-values').innerHTML=Object.entries(reply.changes).map(([key,value])=>'<li><strong>'+esc(labels[key]||key)+':</strong> '+esc(key==='precision'?(precisionLabels[value]||String(value)):value===null||value===''?'Fjernes / ukendt':String(value))+'</li>').join('');
      review.hidden=false;status.textContent='Intet er gemt endnu.';
    }catch(error){if(active()){form.querySelector('.error').textContent=error.message;status.textContent='';}}finally{if(active())busy(false);}
  };
  $('#bulk-apply').onclick=async()=>{
    if(pending||!active()||!plan)return;
    if($('#bulk-confirm-name').value!==plan.name){form.querySelector('.error').textContent='Skriv galleriets navn præcist for at bekræfte.';return;}
    const reviewed=plan;busy(true);form.querySelector('.error').textContent='';status.textContent='Gemmer de gennemgåede ændringer…';
    try{
      const reply=await api('/galleries/'+gallery.id+'/metadata-apply','POST',{token:reviewed.token,confirm_name:reviewed.name});if(!active())return;
      if(reply?.ok!==true||reply.gallery_id!==gallery.id||reply.count!==reviewed.count||!Number.isInteger(reply.changed))throw Error('Serveren kunne ikke bekræfte ændringen. Opdatér galleriet og kontrollér oplysningerne.');
      plan=null;closeModal();await galleryView();toast(reply.count+' billeder og videoer gennemgået; '+reply.changed+' ændret.');
    }catch(error){if(active()){invalidate();form.querySelector('.error').textContent=error.message;status.textContent='Opdatér galleriet ved tvivl. En ny gennemgang er påkrævet før et nyt forsøg.';}}finally{if(active())busy(false);}
  };
}
function galleryEditButtonMarkup(){
  if(!me?.admin&&permissions.edit!==true)return '';
  return `<button class="secondary" id="edit-gallery" type="button" ${serverCapabilities.gallery_edit===true?'':'disabled title="Redigering af gallerier er ikke aktiveret endnu"'}>Redigér galleri</button>`;
}
function editGallery(gallery){
  if(serverCapabilities.gallery_edit!==true||!me?.admin&&permissions.edit!==true)return;
  const account=accountGeneration,navigation=navigationGeneration;
  modal('Redigér galleri',`<div class="dialog-content"><form id="edit-gallery-form"><label>Galleriets navn<input name="name" value="${esc(gallery.name)}" maxlength="100" required></label><label>Beskrivelse<textarea name="description" rows="4" maxlength="1000">${esc(gallery.description)}</textarea></label><div class="error" role="alert"></div><button type="submit">Gem galleri</button></form></div>`);
  const generation=photoViewerGeneration;
  formHandler('#edit-gallery-form',async fields=>{
    const reply=await api('/galleries/'+encodeURIComponent(gallery.id),'PATCH',fields);if(reply?.ok!==true)throw Error('Serveren kunne ikke bekræfte ændringen.');
    if(account!==accountGeneration||!me)return;
    if(galleries.includes(gallery))Object.assign(gallery,fields);
    if(navigation===navigationGeneration&&current===gallery){$('#gallery-title').textContent=fields.name;$('#gallery-description').textContent=fields.description;}
    if(generation===photoViewerGeneration&&M.open)closeModal();toast('Galleriets oplysninger er gemt.');
  });
}
function date(p){return p.taken?(p.precision==='circa'?'ca. ':'')+p.taken.replace('T',' kl. '):'Dato ukendt'}
function photoPath(p){return BASE+'/api/photos/'+encodeURIComponent(String(p.id??''))}
async function checkedVideoRights(p,rights){
  // Private PHP programs are installed separately. An older gallery response
  // may omit or misreport the video flag even though the stream permits access.
  // Only the protected endpoint can confirm it; never infer access from flags.
  if(p.mime!=='video/mp4'||rights.video===true||(rights.video!==undefined&&rights.video!==false)||rights.download!==true||rights.gps!==true)return rights;
  try{
    const response=await fetch(photoPath(p)+'/video',{method:'HEAD',credentials:'same-origin',cache:'no-store',redirect:'error'});
    if(response.status===200&&/^video\/mp4(?:\s*;|\s*$)/i.test(response.headers.get('Content-Type')||''))return {...rights,video:true};
    const notice=response.status===401?'Dit login er udløbet. Log ind igen for at afspille videoen.':response.status===403?'Serveren afviser video-adgangen, selvom download og GPS er tilladt. Administratoren skal kontrollere installationen og rettighederne.':response.status===404?'Videoen er ikke tilgængelig på serveren. Kontakt administratoren.':'Video-adgangen kunne ikke bekræftes. Luk videoen, og prøv igen.';
    return {...rights,video:false,videoNotice:notice};
  }catch{return {...rights,video:false,videoNotice:'Forbindelsen til videoen kunne ikke bekræftes. Luk videoen, og prøv igen.'};}
}
function photoMedia(p,rights){
  const path=photoPath(p),title=esc(p.title);
  if(p.mime!=='video/mp4')return `<img src="${path}/image?size=view" alt="${title}">`;
  if(rights.video!==true)return `<div class="viewer-media"><img src="${path}/image?size=view" alt="${title}"><p class="media-notice" role="status">${esc(rights.videoNotice||'Du har ikke adgang til at afspille denne video. Kontakt administratoren for at få adgang.')}</p></div>`;
  return `<div class="viewer-media"><video id="photo-video" controls playsinline preload="metadata" poster="${path}/image?size=view" src="${path}/video" aria-label="${title}"></video><p id="video-playback-error" class="media-notice" role="status" hidden></p></div>`;
}
function bindPhotoVideo(p,rights){
  if(p.mime!=='video/mp4'||rights.video!==true)return;
  const player=$('#photo-video'),message=$('#video-playback-error');
  if(!player||!message)return;
  player.addEventListener('error',()=>{message.textContent='Browseren kan ikke afspille denne video.'+(rights.download&&rights.gps?' Hent originalen for at åbne den i en anden afspiller.':' Prøv en anden browser.');message.hidden=false});
}
// Group by the recorded calendar date without shifting it to the viewer's timezone.
// Partial/circa dates stay partial; missing capture dates use the upload date.
function timelineDate(photo){
  const value=String(photo.taken||photo.uploaded||'').slice(0,10);
  if(!/^[0-9]{4}(?:-[0-9]{2}){0,2}$/.test(value)||value.startsWith('0000'))return {key:'unknown',label:'Dato ukendt'};
  const day=value+(value.length===4?'-01-01':value.length===7?'-01':'');
  const parsed=new Date(day+'T12:00:00Z');
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,value.length)!==value)return {key:'unknown',label:'Dato ukendt'};
  const options=value.length===4?{year:'numeric'}:value.length===7?{month:'long',year:'numeric'}:{weekday:'long',day:'numeric',month:'long',year:'numeric'};
  let label=parsed.toLocaleDateString('da-DK',{...options,timeZone:'UTC'}).replace(' den ',' ');
  label=label[0].toLocaleUpperCase('da-DK')+label.slice(1);
  const circa=!!photo.taken&&photo.precision==='circa';
  return {key:(circa?'circa:':'')+value,label:(circa?'Ca. ':'')+label};
}
function groupTimelinePhotos(list,grid){
  // Move existing cards rather than recreating their loaded images or handlers.
  const cards=new Map([...grid.querySelectorAll('.photo')].map(card=>[card.querySelector('[data-photo]').dataset.photo,card]));
  const groups=new Map();
  for(const photo of list){const date=timelineDate(photo);if(!groups.has(date.key))groups.set(date.key,{...date,photos:[]});groups.get(date.key).photos.push(photo);}
  grid.replaceChildren();
  let index=0;
  for(const group of groups.values()){
    const section=document.createElement('section'),heading='timeline-date-'+index++;
    section.className='timeline-day';section.dataset.timelineDate=group.key;section.setAttribute('aria-labelledby',heading);
    section.innerHTML=`<header class="timeline-day-heading"><h2 id="${heading}">${esc(group.label)}</h2><span class="timeline-count">${group.photos.length} ${group.photos.length===1?'billede':'billeder'}</span></header><div class="timeline-photos"></div>`;
    const target=section.querySelector('.timeline-photos');
    for(const photo of group.photos){const card=cards.get(photo.id);if(card)target.append(card);}
    grid.append(section);
  }
}
function drawPhotos(ps){const grid=$('#photo-grid');grid.classList.toggle('timeline-groups',view==='timeline'&&!current);grid.innerHTML=ps.map(p=>`<article class="photo"><button data-photo="${esc(p.id)}"><span class="photo-image"><img src="${photoPath(p)}/image" alt="${esc(p.title)}" loading="lazy">${p.mime==='video/mp4'?'<span class="video-badge">▶ Video</span>':''}${p.is_new?'<span class="new-badge photo-new">Nyt</span>':''}</span><span class="caption"><span>${esc(p.title)}</span><span>${p.favorite?'♥':''} ${esc(p.taken?p.taken.slice(0,4):'')}</span></span>${deletionRequestBadge(p)}</button></article>`).join('')||'<div class="empty"><h2>Plads til flere minder</h2><p>Der er endnu ingen billeder at vise her.</p></div>';if(grid.classList.contains('timeline-groups')&&ps.length)groupTimelinePhotos(ps,grid);document.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{const state=galleryDeleteState;if(galleryDeleteActive(state)&&state.active){if(state.pending||!galleryDeletionEligible(photos.find(photo=>photo.id===b.dataset.photo)||{}))return;if(state.selected.has(b.dataset.photo))state.selected.delete(b.dataset.photo);else state.selected.add(b.dataset.photo);syncGalleryDelete(state);return;}showPhoto(b.dataset.photo).catch(error=>toast(error.message));});if(galleryDeleteActive(galleryDeleteState))syncGalleryDelete(galleryDeleteState);}
function galleryDeleteActive(state){
  return !!state&&state===galleryDeleteState&&state.account===accountGeneration&&state.navigation===navigationGeneration&&current===state.gallery&&state.grid===$('#photo-grid')&&galleryDeletionAllowed();
}
function galleryDeletionAllowed(){return !!me&&(me.admin?serverCapabilities.media_delete===true:serverCapabilities.media_delete_requests===true);}
function galleryDeletionOverviewMarkup(){
  if(!me.admin&&serverCapabilities.media_delete_requests!==true)return '';
  return `<button id="gallery-delete-overview" class="secondary" type="button" ${galleryDeletionAllowed()&&galleries.length?'':'disabled'}>${me.admin?'Slet billeder':'Markér billeder til sletning'}</button>`;
}
function chooseDeletionGallery(){
  if(!galleryDeletionAllowed()||!galleries.length)return;
  const account=accountGeneration;
  modal(me.admin?'Slet billeder':'Markér billeder til sletning',`<div class="dialog-content"><form id="gallery-delete-choose"><label>Vælg galleri<select name="gallery_id" id="gallery-delete-choice">${galleries.map(gallery=>`<option value="${esc(gallery.id)}">${esc(gallery.name)} · ${gallery.count} billeder</option>`).join('')}</select></label><p>${me.admin?'Du vælger billeder og videoer i næste trin. Intet slettes, før du har gennemgået og bekræftet listen.':'Du kan markere dine egne uploads. De bliver liggende, indtil admin godkender.'}</p><p class="error" role="alert"></p><button id="gallery-delete-open" type="submit">Vælg billeder</button></form></div>`);
  const generation=photoViewerGeneration;
  formHandler('#gallery-delete-choose',async fields=>{
    if(account!==accountGeneration||generation!==photoViewerGeneration||!M.open||!galleryDeletionAllowed())return;
    if(!galleries.some(gallery=>gallery.id===fields.gallery_id))throw Error('Vælg et galleri fra listen.');
    closeModal();await openGallery(fields.gallery_id);
    if(account!==accountGeneration||current?.id!==fields.gallery_id||!galleryDeleteActive(galleryDeleteState))return;
    $('#gallery-delete-toggle').click();$('#gallery-delete-tools').scrollIntoView?.({block:'start'});
  });
}
function galleryDeletionToggleMarkup(){
  if(!me.admin&&serverCapabilities.media_delete_requests!==true)return '';
  return `<button class="secondary" id="gallery-delete-toggle" type="button" aria-expanded="false" ${galleryDeletionAllowed()?'aria-controls="gallery-delete-tools"':'disabled'}>${me.admin?'Slet billeder':'Markér billeder til sletning'}</button>${galleryDeletionAllowed()?'':'<p class="muted" role="status">Sletning er ikke aktiveret endnu.</p>'}`;
}
function galleryDeletionToolsMarkup(){
  if(!galleryDeletionAllowed())return '';
  return `<section id="gallery-delete-tools" class="gallery-delete-tools" aria-label="Vælg billeder og videoer til sletning" hidden><p>${me.admin?'Klik på de billeder og videoer, du vil slette fra dette galleri.':'Du kan markere dine egne billeder og videoer til sletning. Filerne bliver liggende, indtil admin godkender. Andres uploads kan ikke markeres.'}</p><div class="gallery-delete-actions"><span id="gallery-delete-count" role="status" aria-live="polite">0 valgt</span><button id="gallery-delete-review" type="button" disabled>${me.admin?'Slet':'Markér'} valgte (0)</button><button id="gallery-delete-exit" class="secondary" type="button">Annullér</button></div></section><p id="gallery-delete-feedback" role="status" aria-live="polite"></p>`;
}
function galleryDeletionEligible(photo){return !!me&&(!!me.admin||photo.uploader===me.id&&photo.deletion_request?.status!=='pending');}
function deletionRequestBadge(photo){return photo.deletion_request?.status==='pending'?'<span class="deletion-request-badge">Markeret til sletning · afventer admin</span>':'';}
function updatePhotoDeletionMarker(photo){
  for(const button of document.querySelectorAll('[data-photo]')){
    if(button.dataset.photo!==photo.id)continue;
    $('.deletion-request-badge',button)?.remove();
    if(photo.deletion_request?.status==='pending'){const marker=document.createElement('span');marker.className='deletion-request-badge';marker.textContent='Markeret til sletning · afventer admin';button.append(marker);}
  }
}
function cancelGalleryDeleteConfirmation(){
  if(galleryDeleteState?.confirmation)galleryDeleteState.confirmation.cancelled=true;
}
function syncGalleryDelete(state){
  if(!galleryDeleteActive(state))return;
  state.grid.classList.toggle('delete-selecting',state.active);
  $('#gallery-delete-tools').hidden=!state.active;
  $('#gallery-delete-toggle').setAttribute('aria-expanded',String(state.active));
  $('#gallery-delete-toggle').disabled=state.pending;
  $('#gallery-delete-count').textContent=state.selected.size+' valgt';
  $('#gallery-delete-review').textContent=(state.requestOnly?'Markér':'Slet')+' valgte ('+state.selected.size+')';
  $('#gallery-delete-review').disabled=state.pending||!state.selected.size;
  $('#gallery-delete-exit').disabled=state.pending;
  for(const button of state.grid.querySelectorAll('[data-photo]')){
    const eligible=galleryDeletionEligible(photos.find(photo=>photo.id===button.dataset.photo)||{});
    if(state.active&&eligible){button.setAttribute('role','checkbox');button.setAttribute('aria-checked',String(state.selected.has(button.dataset.photo)));}
    else{button.removeAttribute('role');button.removeAttribute('aria-checked');}
    button.disabled=state.pending||state.active&&!eligible;
  }
}
function bindGalleryDelete(gallery){
  if(!galleryDeletionAllowed())return;
  const state={gallery,grid:$('#photo-grid'),account:accountGeneration,navigation:navigationGeneration,active:false,pending:false,requestOnly:!me.admin,selected:new Set(),confirmation:null};
  galleryDeleteState=state;
  const exit=()=>{if(state.pending)return;cancelGalleryDeleteConfirmation();state.active=false;state.selected.clear();syncGalleryDelete(state);$('#gallery-delete-toggle').focus({preventScroll:true});};
  $('#gallery-delete-toggle').onclick=()=>{if(!galleryDeleteActive(state)||state.pending)return;if(state.active){exit();return;}state.active=true;state.selected.clear();$('#gallery-delete-feedback').textContent='';syncGalleryDelete(state);};
  $('#gallery-delete-exit').onclick=exit;
  $('#gallery-delete-review').onclick=()=>reviewGalleryDelete(state);
}
function reviewGalleryDelete(state){
  if(!galleryDeleteActive(state)||!state.active||state.pending)return;
  const chosen=photos.filter(photo=>state.selected.has(photo.id)&&galleryDeletionEligible(photo));if(!chosen.length)return;
  modal(state.requestOnly?'Markér billeder til sletning':'Slet valgte billeder og videoer',`<div class="dialog-content" id="gallery-delete-confirm"><p>Du er ved at ${state.requestOnly?'markere':'slette'} <strong id="gallery-delete-total"></strong> fra <strong>${esc(state.gallery.name)}</strong>. ${state.requestOnly?'Filerne bliver liggende, indtil admin godkender sletningen.':'Handlingen kan ikke fortrydes her.'}</p><ul id="gallery-delete-list" class="gallery-delete-list"></ul>${state.requestOnly?'':'<p>Andre placeringer af samme billede eller video i andre gallerier bevares.</p>'}<p id="gallery-delete-status" role="status" aria-live="polite" aria-atomic="true"></p><div class="gallery-delete-actions"><button id="gallery-delete-submit" class="danger" type="button">${state.requestOnly?'Send til godkendelse':'Bekræft sletning'}</button><button id="gallery-delete-cancel" class="secondary" type="button">Annullér</button></div></div>`);
  const confirmation={cancelled:false,generation:photoViewerGeneration,remaining:chosen};state.confirmation=confirmation;
  const submit=$('#gallery-delete-submit'),cancel=$('#gallery-delete-cancel'),status=$('#gallery-delete-status'),list=$('#gallery-delete-list'),total=$('#gallery-delete-total');
  const active=()=>galleryDeleteActive(state)&&state.confirmation===confirmation&&!confirmation.cancelled&&confirmation.generation===photoViewerGeneration&&M.open;
  const showRemaining=()=>{total.textContent=confirmation.remaining.length+' filer';list.innerHTML=confirmation.remaining.map(photo=>`<li>${esc(photo.title)} <span class="muted">(${photo.mime==='video/mp4'?'Video':'Billede'})</span></li>`).join('');};showRemaining();
  cancel.onclick=()=>{confirmation.cancelled=true;closeModal();};
  submit.onclick=async()=>{
    if(!active()||state.pending||!confirmation.remaining.length)return;
    state.pending=true;submit.disabled=true;cancel.textContent='Stop efter denne fil';status.classList.remove('error');
    const controls=['#search-photo','#sort','#upload'].map(selector=>$(selector)).filter(Boolean).map(element=>[element,element.disabled]);controls.forEach(([element])=>element.disabled=true);syncGalleryDelete(state);
    let completed=0;
    try{
      while(confirmation.remaining.length&&active()){
        const photo=confirmation.remaining[0];status.textContent=(state.requestOnly?'Markerer: ':'Sletter: ')+photo.title;
        const result=await api('/photos/'+encodeURIComponent(photo.id)+(state.requestOnly?'/deletion-request':''),state.requestOnly?'POST':'DELETE');
        if(result?.ok!==true)throw Error('Serveren kunne ikke bekræfte '+(state.requestOnly?'markeringen.':'sletningen.'));
        if(state.requestOnly&&(result.request?.status!=='pending'||result.request?.photo_id!==photo.id))throw Error('Serveren kunne ikke bekræfte markeringen.');
        confirmation.remaining.shift();state.selected.delete(photo.id);completed++;
        if(state.account!==accountGeneration||!me)break;
        if(state.requestOnly){photo.deletion_request={id:result.request.id,status:'pending',created:result.request.created};if(current===state.gallery&&state.grid===$('#photo-grid'))updatePhotoDeletionMarker(photo);}
        else if(current===state.gallery&&state.grid===$('#photo-grid'))removeDeletedPhoto(photo,state.gallery);
        else{const cached=galleries.find(gallery=>gallery===state.gallery);if(cached){cached.count=Math.max(0,(Number(cached.count)||0)-1);if(cached.cover===photo.id)cached.cover=null;}}
        if(active()){showRemaining();syncGalleryDelete(state);}
      }
      if(active()&&!confirmation.remaining.length){
        state.active=false;state.selected.clear();$('#gallery-delete-feedback').textContent=completed+(state.requestOnly?' filer er markeret til sletning og afventer admins godkendelse.':' filer er slettet fra galleriet.');confirmation.cancelled=true;closeModal();
      }
    }catch(error){if(active()){showRemaining();status.textContent=(state.requestOnly?'Markeringen':'Sletningen')+' er stoppet. '+completed+(state.requestOnly?' filer er markeret':' filer er slettet')+' i dette forsøg. '+(error?.message||'Prøv igen.');status.classList.add('error');submit.textContent='Prøv igen ('+confirmation.remaining.length+')';}}
    finally{
      state.pending=false;controls.forEach(([element,disabled])=>element.disabled=disabled);
      if(galleryDeleteActive(state)){syncGalleryDelete(state);if(confirmation.cancelled&&state.active)$('#gallery-delete-feedback').textContent=(state.requestOnly?'Markeringen':'Sletningen')+' er stoppet. De resterende filer er stadig valgt.';}
      if(active()){submit.disabled=false;cancel.textContent='Annullér';}
    }
  };
}
// Keep the thumbnail elements and their loaded image bytes when a favorite is
// changed in the viewer. Closing a dialog never needs to rebuild this grid.
function updatePhotoCard(p){
  let dateChanged=false;
  for(const button of document.querySelectorAll('[data-photo]')){
    if(button.dataset.photo!==p.id)continue;
    const caption=$('.caption',button);
    if(caption?.children[0])caption.children[0].textContent=p.title;
    if(caption?.children[1])caption.children[1].textContent=(p.favorite?'♥ ':'')+(p.taken?p.taken.slice(0,4):'');
    const section=button.closest('[data-timeline-date]');
    if(section&&section.dataset.timelineDate!==timelineDate(p).key)dateChanged=true;
  }
  if(dateChanged&&view==='timeline'&&!current){photos.sort((a,b)=>(b.taken||b.uploaded).localeCompare(a.taken||a.uploaded));groupTimelinePhotos(photos,$('#photo-grid'));}
}
function removeUnselectedFavorites(){
  if(view!=='favorites'||current)return;
  const removed=new Set(photos.filter(p=>!p.favorite).map(p=>p.id));if(!removed.size)return;
  for(const button of document.querySelectorAll('[data-photo]'))if(removed.has(button.dataset.photo))button.closest('.photo')?.remove();
  photos=photos.filter(p=>p.favorite);const count=$('#photo-count');if(count)count.textContent=photos.length+' billeder, du har adgang til';
  if(!photos.length)$('#photo-grid').innerHTML='<div class="empty"><h2>Plads til flere minder</h2><p>Der er endnu ingen billeder at vise her.</p></div>';
}
function lycheePhotoProvenance(p){
  if(!me.admin||!p.import_source||typeof p.import_source!=='object')return '';
  const source=p.import_source;
  const sourceText=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'||typeof v==='number').join(', '):typeof value==='string'||typeof value==='number'?String(value):'';
  const fields=[['Lychee-ejer',sourceText(source.owner_name)||'Ikke angivet'],['Billed-id i Lychee',sourceText(source.source_photo_id)],['Beskrivelse',sourceText(source.description)],['Tags',sourceText(source.tags)],['Registreret i Lychee',sourceText(source.created_at)],['Optagetid i Lychee',sourceText(source.taken_at)],['Oprindelig tidszone',sourceText(source.taken_at_orig_tz)]];
  return `<details class="lychee-provenance"><summary>Fra Lychee${source.version?' '+esc(source.version):''}</summary><p class="muted">Registreringer bevaret ved import. Lychee-ejeren er ikke nødvendigvis den oprindelige uploader. I LexGalleri står administratoren, der udførte overførslen, som uploader.</p><dl>${fields.filter(([,value])=>value!=='').map(([label,value])=>`<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl></details>`;
}
function photoDeleteMarkup(photo){
  if(!me?.admin)return '';
  if(serverCapabilities.media_delete!==true)return '<p class="media-delete-unavailable" role="status">Sletning er ikke aktiveret endnu.</p>';
  const video=photo.mime==='video/mp4';
  return `<div class="media-delete"><button class="secondary" id="delete-photo" type="button">${video?'Slet video':'Slet billede'}</button><div id="delete-photo-confirm" class="media-delete-confirm" hidden><p>Vil du slette ${video?'videoen':'billedet'} <strong>${esc(photo.title)}</strong> fra dette galleri? Handlingen kan ikke fortrydes her.</p><p id="delete-photo-status" role="status" aria-live="polite" aria-atomic="true"></p><div class="media-delete-actions"><button id="delete-photo-submit" class="danger" type="button">Slet fra dette galleri</button><button id="delete-photo-cancel" class="secondary" type="button">Annullér</button></div></div></div>`;
}
function removeDeletedPhoto(photo,gallerySnapshot){
  photos=photos.filter(item=>item.id!==photo.id);
  const gallery=galleries.find(item=>item.id===photo.gallery_id);
  if(gallery){
    if(gallery===gallerySnapshot)gallery.count=Math.max(0,(Number(gallery.count)||0)-1);
    if(gallery.cover===photo.id)gallery.cover=photos.filter(item=>item.gallery_id===photo.gallery_id).sort((a,b)=>(b.uploaded||'').localeCompare(a.uploaded||''))[0]?.id||null;
  }
  for(const button of document.querySelectorAll('[data-photo]'))if(button.dataset.photo===photo.id)button.closest('.photo')?.remove();
  const count=$('#photo-count');if(count)count.textContent=photos.length+' billeder, du har adgang til';
  const galleryCount=$('#gallery-media-count');if(galleryCount&&current?.id===photo.gallery_id)galleryCount.textContent=photos.length+' billeder';
  for(const button of document.querySelectorAll('[data-gallery]')){
    if(button.dataset.gallery!==photo.gallery_id||!gallery)continue;
    const badge=$('.card-body .badge',button);if(badge)badge.textContent=gallery.count+' billeder';
    const cover=$('img.cover',button);
    if(cover){if(gallery.cover)cover.src=BASE+'/api/photos/'+encodeURIComponent(gallery.cover)+'/image';else cover.outerHTML='<div class="cover placeholder">◈</div>';}
  }
  const grid=$('#photo-grid');if(grid&&!grid.querySelector('[data-photo]'))grid.innerHTML='<div class="empty"><h2>Plads til flere minder</h2><p>Der er endnu ingen billeder at vise her.</p></div>';
}
function bindPhotoDelete(photo){
  if(!me?.admin||serverCapabilities.media_delete!==true)return;
  const trigger=$('#delete-photo');if(!trigger)return;
  const confirmation=$('#delete-photo-confirm'),submit=$('#delete-photo-submit'),cancel=$('#delete-photo-cancel'),status=$('#delete-photo-status');
  const generation=photoViewerGeneration,account=accountGeneration;let pending=false;
  trigger.onclick=()=>{confirmation.hidden=false;trigger.hidden=true;status.textContent='';confirmation.scrollIntoView?.({block:'nearest'});submit.focus?.();};
  cancel.onclick=()=>{if(pending)return;confirmation.hidden=true;trigger.hidden=false;trigger.focus?.({preventScroll:true});};
  submit.onclick=async()=>{
    if(pending)return;pending=true;
    const gallerySnapshot=galleries.find(item=>item.id===photo.gallery_id);
    const buttons=Array.from(M.querySelectorAll('button')).filter(button=>button.id!=='close-modal').map(button=>[button,button.disabled]);
    buttons.forEach(([button])=>button.disabled=true);confirmation.setAttribute('aria-busy','true');status.textContent='Sletter…';status.classList.remove('error');
    try{
      const result=await api('/photos/'+encodeURIComponent(photo.id),'DELETE');
      if(result?.ok!==true)throw Error('Serveren kunne ikke bekræfte sletningen.');
      if(account!==accountGeneration||!me)return;
      removeDeletedPhoto(photo,gallerySnapshot);
      if(generation===photoViewerGeneration&&M.open){stopPhotoVideo();closeModal();}
      toast(photo.mime==='video/mp4'?'Videoen er slettet fra galleriet.':'Billedet er slettet fra galleriet.');
    }catch(error){if(generation===photoViewerGeneration&&account===accountGeneration){status.textContent='Kunne ikke slette: '+(error?.message||'Prøv igen.');status.classList.add('error');}}
    finally{pending=false;buttons.forEach(([button,disabled])=>button.disabled=disabled);confirmation.setAttribute('aria-busy','false');}
  };
}
function photoDetails(p,rights){
  return `<div class="details" id="photo-info" hidden><div class="eyebrow">${p.mime==='video/mp4'?'Historien bag videoen':'Historien bag billedet'}</div>${photoDeleteMarkup(p)}<h2>${esc(p.title)}</h2><dl><dt>Optaget</dt><dd>${esc(date(p))}</dd><dt>Sted</dt><dd>${esc(p.place||'Ikke angivet')}</dd>${p.lat!==null?`<dt>GPS</dt><dd>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</dd>`:''}<dt>Uploadet af</dt><dd>${esc(p.uploader_name)}</dd><dt>Uploadtidspunkt</dt><dd>${esc(new Date(p.uploaded).toLocaleString('da-DK'))}</dd></dl>${lycheePhotoProvenance(p)}<button id="favorite" class="secondary" type="button">${p.favorite?'♥ Fjern favorit':'♡ Gem som favorit'}</button>${rights.download&&rights.gps?`<p><a href="${photoPath(p)}/image?size=original" download>↓ Hent original med metadata</a></p>`:''}${p.mime==='video/mp4'&&serverCapabilities.video_thumbnails===true&&rights.video&&(me.admin||rights.edit===true)?'<p><button class="secondary" id="video-thumbnail" type="button">Lav miniaturebillede fra video</button></p><p id="video-thumbnail-status" role="status" aria-live="polite"></p>':''}${me.admin||rights.edit===true?'<p><button class="secondary" id="edit-photo" type="button">Redigér oplysninger</button></p>':''}</div>`;
}
async function showPhoto(id){
  const generation=++photoViewerGeneration,account=accountGeneration,requestView=view,requestGallery=current,p=photos.find(p=>p.id===id);if(!p)return;
  let b;try{b=await api('/galleries/'+p.gallery_id+'/photos');}
  catch(error){if(generation!==photoViewerGeneration||account!==accountGeneration||view!==requestView||current!==requestGallery)return;if(error.status===403||error.status===404){await galleryAccessLost();return;}throw error;}
  if(generation!==photoViewerGeneration||account!==accountGeneration||view!==requestView||current!==requestGallery)return;
  const fresh=Array.isArray(b.photos)?b.photos.find(photo=>photo.id===id):null;
  if(fresh){Object.assign(p,fresh);updatePhotoCard(p);}
  const rights=await checkedVideoRights(p,b.permissions),previousFocus=document.activeElement?.id;
  if(generation!==photoViewerGeneration||account!==accountGeneration||view!==requestView||current!==requestGallery)return;
  modal('Billedvisning',`<div class="viewer"><div class="photo-stage">${photoMedia(p,rights)}<button class="photo-nav photo-prev" id="prev" type="button" aria-label="Forrige billede" title="Forrige billede"><span aria-hidden="true">‹</span></button><button class="photo-nav photo-next" id="next" type="button" aria-label="Næste billede" title="Næste billede"><span aria-hidden="true">›</span></button></div>${photoDetails(p,rights)}</div>`,true);
  bindPhotoVideo(p,rights);
  const thumbnailButton=$('#video-thumbnail');if(thumbnailButton)thumbnailButton.onclick=()=>makeVideoThumbnail(p,rights);
  const infoButton=$('#photo-info-toggle'),infoPanel=$('#photo-info');let infoOpen=false;infoPanel.hidden=true;
  infoButton.onclick=()=>{infoOpen=!infoOpen;infoPanel.hidden=!infoOpen;infoButton.setAttribute?.('aria-expanded',String(infoOpen));M.classList?.toggle('photo-info-open',infoOpen)};
  const favoriteButton=$('#favorite');
  favoriteButton.onclick=async()=>{if(favoriteButton.disabled)return;favoriteButton.disabled=true;try{await api('/photos/'+p.id+'/favorite','POST');p.favorite=!p.favorite;favoriteButton.textContent=p.favorite?'♥ Fjern favorit':'♡ Gem som favorit';updatePhotoCard(p)}catch(err){toast(err.message)}finally{favoriteButton.disabled=false}};
  const available=new Set(photos.map(photo=>photo.id));
  const visibleIds=Array.from(document.querySelectorAll('[data-photo]'),button=>button.dataset.photo).filter(photoId=>available.has(photoId));
  const sequence=visibleIds.includes(p.id)?visibleIds:photos.map(photo=>photo.id);
  const i=sequence.indexOf(p.id),prev=$('#prev'),next=$('#next');prev.disabled=i<=0;next.disabled=i<0||i===sequence.length-1;
  const navigate=async index=>{if(index<0||index>=sequence.length)return;try{await showPhoto(sequence[index])}catch(error){toast(error.message)}};
  prev.onclick=()=>navigate(i-1);next.onclick=()=>navigate(i+1);photoViewerNavigation={prev,next};
  if($('#edit-photo'))$('#edit-photo').onclick=()=>editPhoto(p,rights);
  bindPhotoDelete(p);
  // Replacing an open dialog removes its focused button. Restore focus inside
  // the viewer so consecutive arrow-key presses continue to reach the dialog.
  const focused=['prev','next','photo-info-toggle'].includes(previousFocus)?$('#'+previousFocus):infoButton;
  (focused&&!focused.disabled?focused:infoButton).focus?.({preventScroll:true});
}
function photoViewerKeydown(event){
  if(!photoViewerNavigation||!M.open||event.defaultPrevented||event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(event.target?.closest?.('input, textarea, select, [contenteditable], video'))return;
  const button=event.key==='ArrowLeft'?photoViewerNavigation.prev:event.key==='ArrowRight'?photoViewerNavigation.next:null;
  if(!button||button.disabled)return;event.preventDefault();return button.onclick();
}
function editPhoto(p,rights={edit:!!me?.admin,gps:!!me?.admin}){
  if(!me?.admin&&rights.edit!==true)return;
  const account=accountGeneration;
  modal('Redigér billedets historie',`<div class="dialog-content"><form id="edit"><label>Titel<input name="title" value="${esc(p.title)}" required maxlength="200"></label><div class="row"><label>Datopræcision<select name="precision">${[['unknown','Ukendt'],['exact','Dato og klokkeslæt'],['day','Dag'],['month','Måned'],['year','År'],['circa','Cirka år']].map(([v,n])=>`<option value="${v}" ${p.precision===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Dato<input name="taken" value="${esc(p.taken)}" placeholder="2026-07-14T12:30"></label></div><p class="muted">Formater: 2026-07-14T12:30 · 2026-07-14 · 2026-07 · 2026. Tom ved ukendt dato.</p><label>Sted<input name="place" value="${esc(p.place)}" maxlength="200"></label>${me.admin||rights.gps===true?`<div class="row"><label>Breddegrad<input name="lat" type="number" step="any" min="-90" max="90" value="${p.lat??''}"></label><label>Længdegrad<input name="lon" type="number" step="any" min="-180" max="180" value="${p.lon??''}"></label></div>`:''}<div class="error" role="alert"></div><button type="submit">Gem oplysninger</button></form></div>`);
  const generation=photoViewerGeneration;
  const initialLat=$('#edit input[name=lat]')?.value,initialLon=$('#edit input[name=lon]')?.value;
  formHandler('#edit',async fields=>{
    if('lat' in fields){if(fields.lat===initialLat&&fields.lon===initialLon){delete fields.lat;delete fields.lon;}else{fields.lat=fields.lat===''?null:Number(fields.lat);fields.lon=fields.lon===''?null:Number(fields.lon);}}
    const reply=await api('/photos/'+p.id,'PATCH',fields);if(reply?.ok!==true)throw Error('Serveren kunne ikke bekræfte ændringen.');
    if(account!==accountGeneration||!me)return;
    if(photos.includes(p)){Object.assign(p,fields);updatePhotoCard(p);}
    if(generation===photoViewerGeneration&&M.open)closeModal();toast('Oplysninger gemt');
  });
}
function profileMarkup(profile,own,security){
  const count=Number(profile.upload_count),uploads=Number.isSafeInteger(count)&&count>=0?count:0;
  const memberships=Array.isArray(profile.galleries)?profile.galleries:[],canEdit=own||!!me?.admin;
  return `<div class="heading"><div><div class="eyebrow">${own?'Din konto':'Familiens konti'}</div><h1>${own?'Min profil':esc(profile.name)}</h1><p class="muted">Kontaktoplysninger og adgang til familiens gallerier.</p></div><div class="gallery-actions">${canEdit?'<button id="profile-edit">Redigér profil</button>':''}${memberDeleteMarkup(profile)}</div></div>${own?'':'<p><button id="profile-back" class="secondary">← Personer og adgang</button></p>'}${own?activityNotice():''}<div class="panel account-profile"><h2>${esc(profile.name)}</h2><dl class="profile-summary"><dt>E-mail</dt><dd>${esc(profile.email||'Ikke angivet')}</dd>${profile.phone?`<dt>Telefon</dt><dd>${esc(profile.phone)}</dd>`:''}<dt>Rolle</dt><dd>${profile.admin?'Administrator':'Medlem / gæst'}</dd><dt>Uploadede billeder og videoer</dt><dd>${uploads}</dd>${profile.admin?`<dt>Authenticator</dt><dd>${profile.mfa_enabled?'Aktiveret':'Skal sættes op ved login'}</dd>`:''}</dl></div><div class="panel"><h2>Gallerier og rettigheder</h2>${profile.admin?'<p>Administratorer har adgang til alle gallerier og indstillinger.</p>':''}<ul class="profile-galleries">${memberships.map(g=>`<li><strong>${esc(g.name)}</strong><span>Se galleri${g.upload?' · Uploade billeder':''}${g.edit?' · Redigere galleri og billedoplysninger':''}${g.download?' · Hente originaler':''}${g.gps?' · Se præcis GPS':''}</span></li>`).join('')||'<li>Der er endnu ikke delt gallerier med denne konto.</li>'}</ul></div>${own&&profile.admin?`<div class="panel"><h2>Login og Authenticator</h2><p>Administratorlogin kræver din adgangskode og en kode fra Authenticator. Opbevar reservekoderne et privat sted, adskilt fra telefonen.</p><p>Ubrugte reservekoder: <strong>${Math.max(0,Math.floor(Number(security?.recovery_codes_remaining)||0))}</strong></p><div class="security-actions"><button id="mfa-recovery-renew" class="secondary">Nye reservekoder</button><button id="mfa-replace" class="secondary">Skift Authenticator</button></div></div>`:''}`;
}
async function profileView(id=null){
  const own=!id||id===me.id;if(!own&&!me.admin)throw Error('Du har ikke adgang til andre profiler');
  const generation=++profileGeneration,requestView=view,content=$('#content');
  content.innerHTML='<p role="status">Henter profilen…</p>';
  try{
    const [profile,security]=await Promise.all([api(own?'/profile':'/admin/users/'+encodeURIComponent(id)),own&&me.admin?api('/security/mfa'):Promise.resolve(null)]);
    if(generation!==profileGeneration||view!==requestView)return;
    content.innerHTML=profileMarkup(profile,own,security);if(isAdminView(view))decorateAdmin('people');
    if($('#profile-edit'))$('#profile-edit').onclick=()=>editAccountProfile(profile,own);bindMemberDelete(profile);
    if($('#profile-back'))$('#profile-back').onclick=()=>peopleView().catch(error=>toast(error.message));
    if($('#mfa-recovery-renew'))$('#mfa-recovery-renew').onclick=()=>accountSecurityAction('recovery-codes');
    if($('#mfa-replace'))$('#mfa-replace').onclick=()=>accountSecurityAction('replace');
  }catch(error){if(generation===profileGeneration&&view===requestView)content.innerHTML='<div class="panel"><h2>Profilen kunne ikke hentes</h2><p class="error" role="alert">'+esc(error.message)+'</p></div>';}
}
function accountProofFields(){
  return `<label>${me.admin?'Din administratoradgangskode':'Din nuværende adgangskode'}<input type="password" name="current_password" autocomplete="current-password" required maxlength="72"></label>${me.admin?'<label>Ny kode fra Authenticator eller reservekode<input type="text" name="mfa_code" inputmode="numeric" data-authenticator-recovery="true" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" required maxlength="64"></label><p class="muted">Brug en ny kode fra din egen Authenticator. En allerede brugt kode accepteres ikke igen.</p>':''}`;
}
function editAccountProfile(profile,own){
  if(!own&&!me.admin)return;
  modal(own?'Redigér min profil':'Redigér profil · '+profile.name,`<div class="dialog-content"><form id="account-edit"><label>Navn<input name="name" value="${esc(profile.name)}" autocomplete="name" maxlength="100" required></label><label>E-mail<input name="email" type="email" value="${esc(profile.email)}" autocomplete="email" maxlength="254" ${profile.admin?'required':''}></label>${serverCapabilities.reusable_phone_invitations?`<label>Telefonnummer<input name="phone" type="tel" value="${esc(profile.phone||'')}" maxlength="30"></label>`:''}<label>Ny adgangskode<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72"></label><label>Gentag ny adgangskode<input name="password_confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="72"></label><p class="muted">Lad de nye adgangskodefelter være tomme for at beholde adgangskoden. Ændringer logger denne konto ud på dens enheder.</p>${accountProofFields()}<div class="error" role="alert"></div><button type="submit">Gem profil</button></form></div>`);
  privateAccountDialog=true;const generation=photoViewerGeneration;
  formHandler('#account-edit',async fields=>{
    if(fields.password!==fields.password_confirmation)throw Error('De nye adgangskoder er ikke ens');
    const body={name:fields.name,email:fields.email,current_password:fields.current_password};
    if(serverCapabilities.reusable_phone_invitations)body.phone=fields.phone||'';if(fields.password)body.password=fields.password;if(me.admin)body.mfa_code=fields.mfa_code;
    const response=await api(own?'/profile':'/admin/users/'+encodeURIComponent(profile.id),'PATCH',body);
    if(response.reauthentication_required===true){auth(false,null,response.user?.email||response.user?.phone||fields.email);toast('Profilen er opdateret. Log ind igen med de nye oplysninger.');return;}
    if(generation!==photoViewerGeneration){toast('Profilen er opdateret');return;}
    closeModal();await profileView(own?null:profile.id);toast('Profilen er opdateret');
  });
}
function accountSecurityAction(action){
  if(!me.admin)return;
  const replace=action==='replace';
  modal(replace?'Skift Authenticator':'Opret nye reservekoder',`<div class="dialog-content"><form id="account-security"><p>${replace?'Tilføj din nye Authenticator, og bekræft den med en ny kode. Du får nye reservekoder efter bekræftelsen.':'De tidligere reservekoder bliver erstattet. Gem de nye koder, når de vises.'}</p>${accountProofFields()}<div class="error" role="alert"></div><button type="submit">${replace?'Fortsæt til opsætning':'Opret nye reservekoder'}</button></form></div>`);
  privateAccountDialog=true;const generation=photoViewerGeneration;
  formHandler('#account-security',async fields=>{
    const result=await api('/security/mfa/'+action,'POST',{current_password:fields.current_password,mfa_code:fields.mfa_code});
    if(result.mfa_required===true){await authResult(result);return;}
    if(generation!==photoViewerGeneration){toast('Reservekoderne er ændret. Opret nye koder igen, hvis du lukkede før de blev vist.');return;}
    recoveryCodesView(result.recovery_codes,async()=>{view='profile';await start()});
  });
}
function memberDeleteMarkup(member){
  if(!me?.admin||member.admin||member.id===me.id)return '';
  return `<button class="secondary member-delete-action" data-member-delete="${esc(member.id)}" type="button" ${serverCapabilities.member_delete===true?'':'disabled'}>Slet medlem</button>`;
}
function memberDeleteNotice(){
  return serverCapabilities.member_delete===true?'':'<p class="muted" role="status">Sletning af medlemmer er ikke aktiveret endnu. <a href="https://github.com/alexhertzladiges-lab/LexGalleri/blob/main/ACCOUNTS.md#slet-et-medlem" target="_blank" rel="noopener">Se installationsvejledningen</a>.</p>';
}
function bindMemberDelete(member){
  if(!me?.admin||member.admin||member.id===me.id||serverCapabilities.member_delete!==true)return;
  const trigger=Array.from(document.querySelectorAll('[data-member-delete]')).find(button=>button.dataset.memberDelete===member.id);
  if(trigger)trigger.onclick=()=>deleteMember(member);
}
function deleteMember(member){
  if(!me?.admin||member.admin||member.id===me.id||serverCapabilities.member_delete!==true)return;
  const account=accountGeneration,navigation=navigationGeneration,requestView=view,requestGallery=current,profile=profileGeneration;
  modal('Slet medlem',`<div class="dialog-content"><form id="delete-member"><p>Vil du slette <strong>${esc(member.name)}</strong> (${esc(member.email)})?</p><p>Kontoens login, invitationer, favoritter og galleriadgang fjernes. Billeder, videoer og uploadernavnet i historikken bevares.</p><p>Handlingen kan ikke fortrydes her. Personen kan senere inviteres som et nyt medlem.</p><p id="delete-member-status" role="status" aria-live="polite"></p><div class="gallery-delete-actions"><button id="delete-member-submit" class="danger" type="submit">Slet medlemmet</button><button id="delete-member-cancel" class="secondary" type="button">Annullér</button></div></form></div>`);
  const generation=photoViewerGeneration,submit=$('#delete-member-submit'),cancel=$('#delete-member-cancel'),status=$('#delete-member-status');let pending=false;
  const pageActive=()=>galleryRequestActive(navigation,account,requestView,requestGallery)&&profile===profileGeneration&&!!me?.admin;
  const dialogActive=()=>pageActive()&&generation===photoViewerGeneration&&M.open;
  cancel.onclick=()=>{if(!pending)closeModal();};
  $('#delete-member').onsubmit=async event=>{
    event.preventDefault();if(pending||!dialogActive())return;
    pending=true;submit.disabled=true;cancel.disabled=true;status.textContent='Sletter medlem…';status.classList.remove('error');
    try{
      const result=await api('/admin/users/'+encodeURIComponent(member.id),'DELETE',{confirm:true});
      if(result?.ok!==true||result.id!==member.id)throw Error('Serveren kunne ikke bekræfte sletningen.');
      if(!pageActive())return;
      if(dialogActive())closeModal();
      const row=Array.from(document.querySelectorAll('[data-member-row]')).find(element=>element.dataset.memberRow===member.id);
      if(adminDirectoryData){adminDirectoryData.users=adminDirectoryData.users.filter(u=>u.id!==member.id);adminDirectoryData.grants=adminDirectoryData.grants.filter(g=>g.user_id!==member.id);}
      if(row){row.remove();const count=$('#member-search-count');if(count)count.textContent=document.querySelectorAll('[data-member-row]').length+' personer';}else{await peopleView();if(account!==accountGeneration||navigation!==navigationGeneration||view!==requestView)return;}
      const feedback=$('#member-delete-feedback');if(feedback)feedback.textContent=member.name+' er slettet. Billeder og videoer er bevaret.';
    }catch(error){if(dialogActive()){status.textContent='Kunne ikke slette medlemmet: '+error.message;status.classList.add('error');}else if(pageActive()){const feedback=$('#member-delete-feedback');if(feedback)feedback.textContent='Kunne ikke slette medlemmet: '+error.message;}}
    finally{pending=false;if(dialogActive()){submit.disabled=false;cancel.disabled=false;}}
  };
}
function galleryAccessForm(user,data){
  if(!me?.admin||adminFlag(user.admin))return;
  const account=accountGeneration;
  const labels=[['view','Se galleri'],['upload','Uploade billeder'],...(serverCapabilities.multi_gallery_invitations===true?[['edit','Redigere galleri og billedoplysninger']]:[]),['download','Hente originaler'],['gps','Se præcis GPS']];
  const keys=labels.map(([key])=>key);
  modal('Galleriadgang · '+user.name,`<div class="dialog-content grant-workspace"><p>Vælg gallerier og handlinger for <strong>${esc(user.name)}</strong>. Ændringer træder i kraft, når serveren har bekræftet dem.</p><div class="grant-gallery-list">${galleries.map(g=>{const a=data.grants.find(a=>a.user_id===user.id&&a.gallery_id===g.id)||{};return `<form class="grant" data-g="${esc(g.id)}" aria-label="Adgang til ${esc(g.name)}"><h3>${esc(g.name)}</h3><div class="grant-rights">${labels.map(([key,label])=>`<label class="check"><input type="checkbox" name="${key}" ${(key==='view'?!!a.gallery_id:adminFlag(a[key]))?'checked':''}>${label}</label>`).join('')}</div><p class="grant-current-summary"></p><div class="grant-feedback" role="status" aria-live="polite" aria-atomic="true" data-state="success">Gemt</div><div class="grant-row-actions"><button type="submit">Gem adgang</button><button class="secondary" data-grant-reset type="button">Fortryd valg</button></div></form>`}).join('')||'<p>Opret først et galleri.</p>'}</div><aside class="grant-leave-warning" id="grant-leave-warning" hidden><h3>Du har ugemte ændringer</h3><p>Lukker du nu, bliver de ugemte valg ikke sendt til serveren.</p><button class="secondary" id="grant-stay" type="button">Bliv her</button><button class="danger" id="grant-discard-close" type="button">Luk uden at gemme</button></aside><div class="grant-savebar"><div id="grant-total-status" role="status" aria-live="polite">Alle viste rettigheder er hentet fra serveren.</div><div><button id="grant-save-all" type="button" disabled>Gem ændringer</button><button id="grant-reset-all" class="secondary" type="button" disabled>Fortryd ugemte valg</button></div></div></div>`);
  const generation=photoViewerGeneration;
  const active=()=>account===accountGeneration&&generation===photoViewerGeneration&&M.open&&!!me?.admin;
  const rows=Array.from(M.querySelectorAll('.grant')).map(form=>{
    const read=()=>Object.fromEntries(keys.map(key=>[key,!!form.elements[key].checked]));
    return {form,read,saved:read(),feedback:$('.grant-feedback',form),button:$('button[type=submit]',form),reset:$('[data-grant-reset]',form)};
  });
  const same=(a,b)=>keys.every(key=>a[key]===b[key]);
  const dirty=row=>!same(row.read(),row.saved);
  const changed=()=>rows.filter(dirty);
  const total=$('#grant-total-status'),all=$('#grant-save-all'),undo=$('#grant-reset-all');
  const dialog={busy:false,dirty:()=>changed().length>0};grantDialog=dialog;
  const dependency=row=>{const visible=row.form.elements.view.checked;keys.filter(key=>key!=='view').forEach(key=>{row.form.elements[key].disabled=dialog.busy||!visible;});row.form.elements.view.disabled=dialog.busy;};
  const summary=row=>{const values=row.read();$('.grant-current-summary',row.form).textContent=values.view?labels.filter(([key])=>key!=='view'&&values[key]).map(([,label])=>label).join(' · ')||'Kan se galleriet.':'Ingen adgang til dette galleri.';};
  const report=(row,message,state)=>{row.feedback.textContent=message;row.feedback.dataset.state=state;};
  const refresh=()=>{
    const count=changed().length;if(!count)$('#grant-leave-warning').hidden=true;all.disabled=dialog.busy||!count;undo.disabled=dialog.busy||!count;
    if(!dialog.busy)all.textContent=count?'Gem '+count+' '+(count===1?'galleri':'gallerier'):'Gem ændringer';
    for(const row of rows){dependency(row);summary(row);row.button.disabled=dialog.busy||!dirty(row);row.reset.disabled=dialog.busy||!dirty(row);row.form.setAttribute('aria-busy',String(dialog.busy));}
  };
  const updateDirectory=()=>{if(adminDirectoryData===data&&$('#admin-member-list'))drawDirectory(data,view==='admin');};
  const save=async selected=>{
    if(dialog.busy||!active())return;
    const pending=selected.filter(dirty);if(!pending.length)return;
    dialog.busy=true;refresh();all.textContent='Gemmer…';total.textContent='Gemmer valgte rettigheder…';let saved=0,failed=false;
    for(const row of pending){
      if(!active())break;
      const values=row.read(),payload={user_id:user.id,gallery_id:row.form.dataset.g,...values};
      report(row,'Gemmer rettigheder…','saving');row.button.textContent='Gemmer…';
      try{
        const result=await api('/admin/grants','PUT',payload);
        if(result?.ok!==true)throw Error('Serveren kunne ikke bekræfte ændringen.');
        if(account!==accountGeneration||!me?.admin)return;
        data.grants=data.grants.filter(g=>g.user_id!==user.id||g.gallery_id!==payload.gallery_id);
        if(values.view)data.grants.push({user_id:user.id,gallery_id:payload.gallery_id,...Object.fromEntries(keys.filter(key=>key!=='view').map(key=>[key,Number(values[key])]))});
        row.saved={...values};saved++;
        if(active())report(row,'Rettighederne er gemt.','success');
      }catch(error){failed=true;if(active())report(row,'Rettighederne kunne ikke gemmes: '+(error?.message||'Prøv igen.'),'error');break;}
      finally{row.button.textContent='Gem adgang';}
    }
    dialog.busy=false;
    if(!active())return;
    updateDirectory();refresh();
    total.textContent=failed?saved+' af '+pending.length+' gallerier gemt. De resterende valg er ikke gemt. Ret fejlen og prøv igen.':changed().length?saved+' '+(saved===1?'galleri gemt.':'gallerier gemt.')+' Der er stadig ugemte valg.':'Alle ændringer er gemt og bekræftet af serveren.';
    total.dataset.state=failed?'error':'success';
  };
  const reset=row=>{for(const key of keys)row.form.elements[key].checked=row.saved[key];report(row,'Gemt · ugemte valg er fortrudt.','success');};
  for(const row of rows){
    row.form.onchange=()=>{
      if(!row.form.elements.view.checked)keys.filter(key=>key!=='view').forEach(key=>row.form.elements[key].checked=false);
      const unsaved=dirty(row);report(row,unsaved?'Ændringerne er ikke gemt.':'Gemt',unsaved?'changed':'success');
      refresh();total.textContent=changed().length+' '+(changed().length===1?'galleri har':'gallerier har')+' ugemte ændringer.';total.dataset.state='changed';
    };
    row.form.onsubmit=event=>{event.preventDefault();return save([row]);};
    row.reset.onclick=()=>{reset(row);refresh();total.textContent=changed().length?'Der er stadig ugemte valg.':'Ugemte valg er fortrudt. De gemte rettigheder er bevaret.';};
  }
  all.onclick=()=>save(rows);
  undo.onclick=()=>{rows.filter(dirty).forEach(reset);refresh();total.textContent='Ugemte valg er fortrudt. De gemte rettigheder er bevaret.';total.dataset.state='success';};
  $('#grant-stay').onclick=()=>{$('#grant-leave-warning').hidden=true;};
  $('#grant-discard-close').onclick=()=>{if(dialog.busy)return;grantDialog=null;closeModal();};
  refresh();
}

function inviteForm(){
  if(!me?.admin)return;
  const multi=serverCapabilities.multi_gallery_invitations===true,account=accountGeneration;
  const rights=[['upload','Uploade billeder'],['edit','Redigere galleri og billedoplysninger'],['download','Hente originaler'],['gps','Se præcis GPS']];
  const selection=multi?`<div id="invite-galleries">${galleries.map(gallery=>`<fieldset class="invite-gallery" data-invite-gallery="${esc(gallery.id)}"><legend>${esc(gallery.name)}</legend><label class="check"><input type="checkbox" data-invite-right="view">Se galleri</label>${rights.map(([key,label])=>`<label class="check"><input type="checkbox" data-invite-right="${key}" disabled>${label}</label>`).join('')}</fieldset>`).join('')}</div><p id="invite-selection-count" role="status" aria-live="polite">0 gallerier valgt</p>`:`<p class="muted" role="status">Invitation til flere gallerier og redigeringsrettigheder er ikke aktiveret endnu. <a href="https://github.com/alexhertzladiges-lab/LexGalleri/blob/main/ACCOUNTS.md#invitation-til-flere-gallerier" target="_blank" rel="noopener">Se installationsvejledningen</a>.</p><label>Galleri<select name="gallery_id" required>${galleries.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></label>${rights.filter(([key])=>key!=='edit').map(([key,label])=>`<label class="check"><input type="checkbox" name="${key}">${label}</label>`).join('')}`;
  modal('Invitér en gæst',`<div class="dialog-content"><form id="invite-form"><label>Navn<input name="name" required maxlength="100"></label>${serverCapabilities.reusable_phone_invitations?'<label>Invitér via<select id="invite-contact" name="contact_type"><option value="email">E-mail</option><option value="phone">Telefonnummer</option></select></label>':''}<label id="invite-email-label">E-mail<input type="email" name="email" id="invite-email" required maxlength="254"></label>${serverCapabilities.reusable_phone_invitations?'<label id="invite-phone-label" hidden>Dansk telefonnummer<input type="tel" name="phone" id="invite-phone" maxlength="30" placeholder="8 cifre eller +45…" disabled></label><p class="muted">Linket deles af dig. Der sendes ikke automatisk SMS eller e-mail.</p>':''}<h3>Gallerier og rettigheder</h3>${selection}<p class="muted">Download af originaler og afspilning af videoer kræver både download- og GPS-adgang. Ændring af GPS-oplysninger kræver både redigering og GPS-adgang.</p><div class="error" role="alert"></div><button type="submit" ${galleries.length?'':'disabled'}>Opret invitationslink</button></form></div>`);
  const generation=photoViewerGeneration,form=$('#invite-form');let pending=false;
  const contact=$('#invite-contact');if(contact)contact.onchange=()=>{
    const phone=contact.value==='phone';$('#invite-email-label').hidden=phone;$('#invite-phone-label').hidden=!phone;
    $('#invite-email').disabled=phone;$('#invite-email').required=!phone;$('#invite-phone').disabled=!phone;$('#invite-phone').required=phone;
  };
  if(multi)form.querySelectorAll('[data-invite-gallery]').forEach(row=>{
    const view=$('[data-invite-right=view]',row);
    view.onchange=()=>{row.classList.toggle('selected',view.checked);row.querySelectorAll('[data-invite-right]').forEach(input=>{if(input===view)return;input.disabled=!view.checked;if(!view.checked)input.checked=false;});$('#invite-selection-count').textContent=form.querySelectorAll('[data-invite-right=view]:checked').length+' gallerier valgt';};
  });
  const active=()=>account===accountGeneration&&generation===photoViewerGeneration&&!!me?.admin&&M.open;
  form.onsubmit=async event=>{
    event.preventDefault();if(pending||!active())return;
    const values=new FormData(form),payload={name:values.get('name')};if(values.get('contact_type')==='phone')payload.phone=values.get('phone');else payload.email=values.get('email');
    if(multi){
      payload.galleries=Array.from(form.querySelectorAll('[data-invite-gallery]')).filter(row=>$('[data-invite-right=view]',row).checked).map(row=>({gallery_id:row.dataset.inviteGallery,...Object.fromEntries(rights.map(([key])=>[key,$('[data-invite-right='+key+']',row).checked]))}));
      if(!payload.galleries.length){$('.error',form).textContent='Vælg mindst ét galleri.';return;}
    }else{payload.gallery_id=values.get('gallery_id');for(const [key] of rights)if(key!=='edit')payload[key]=values.get(key)==='on';}
    const controls=Array.from(form.querySelectorAll('input,select,button')).map(element=>[element,element.disabled]);pending=true;controls.forEach(([element])=>element.disabled=true);$('.error',form).textContent='';
    try{
      const reply=await api('/admin/invitations','POST',payload);if(typeof reply?.path!=='string'||!reply.path.startsWith(BASE+'/?invite='))throw Error('Serveren kunne ikke bekræfte invitationslinket.');
      if(!active())return;
      const assigned=Array.isArray(reply.galleries)?reply.galleries:[{name:galleries.find(g=>g.id===payload.gallery_id)?.name,...payload}];
      modal('Invitationen er klar',`<div class="dialog-content"><p>Send dette personlige link privat til gæsten. ${reply.reusable?'Det kan åbnes igen med gæstens adgangskode, indtil det udløber efter 7 dage eller tilbagekaldes.':'Det kan bruges én gang og udløber efter 7 dage.'} Ingen SMS eller e-mail er sendt automatisk.</p><h3>Adgang fra starten</h3><ul class="invite-summary">${assigned.map(choice=>`<li><strong>${esc(choice.name)}</strong><span>Se galleri${rights.filter(([key])=>choice[key]).map(([,label])=>' · '+esc(label)).join('')}</span></li>`).join('')}</ul><label>Personligt invitationslink<input id="invite-link" readonly value="${esc(location.origin+reply.path)}"></label><div class="share-actions"><button id="copy-link">Kopiér link</button><button class="secondary" id="share-invitation" type="button">Del via Signal</button></div></div>`);privateAccountDialog=true;
      $('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#invite-link').value);toast('Link kopieret')}catch{$('#invite-link').select();}};
      const inviteLink=$('#invite-link').value;$('#share-invitation').onclick=()=>shareLink({title:'Invitation til LexGalleri',text:'Din personlige invitation til LexGalleri. Gem linket privat.',url:inviteLink},{invitation:true,active:()=>M.open&&$('#invite-link')?.value===inviteLink});
    }catch(error){if(active())$('.error',form).textContent=error.message;}
    finally{pending=false;controls.forEach(([element,disabled])=>element.disabled=disabled);}
  };
}
async function invitationList(){
  if(!me?.admin||!serverCapabilities.reusable_phone_invitations)return;
  const account=accountGeneration;modal('Invitationslinks','<div class="dialog-content"><p role="status">Henter invitationer…</p></div>');
  const generation=photoViewerGeneration;
  try{
    const invitations=await api('/admin/invitations');if(account!==accountGeneration||generation!==photoViewerGeneration||!me?.admin||!M.open)return;
    modal('Invitationslinks',`<div class="dialog-content"><p>Tilbagekaldelse lukker linket. Eksisterende kontoadgang ændres under personens galleriadgang. Gem det oprindelige link privat; serveren gemmer kun dets hash.</p><p id="invitation-status" role="status"></p>${invitations.map(inv=>`<article class="panel"><strong>${esc(inv.name)}</strong><p>${esc(inv.email||inv.phone||'')} · ${inv.accepted?'Accepteret':'Ikke accepteret'} · ${Number(inv.expires)*1000<=Date.now()?'Udløbet':'Udløber '+esc(new Date(Number(inv.expires)*1000).toLocaleString('da-DK'))}</p><button type="button" class="secondary" data-revoke-invite="${esc(inv.id)}">Tilbagekald link</button></article>`).join('')||'<p>Ingen invitationslinks.</p>'}</div>`);
    const active=photoViewerGeneration;
    M.querySelectorAll('[data-revoke-invite]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;
      try{await api('/admin/invitations/'+encodeURIComponent(button.dataset.revokeInvite),'DELETE');if(account===accountGeneration&&active===photoViewerGeneration&&M.open){button.closest('article').remove();$('#invitation-status').textContent='Linket er tilbagekaldt.';}}
      catch(error){if(account===accountGeneration&&active===photoViewerGeneration&&M.open){$('#invitation-status').textContent=error.message;button.disabled=false;}}
    });
  }catch(error){if(account===accountGeneration&&generation===photoViewerGeneration&&M.open)M.querySelector('[role=status]').textContent=error.message;}
}
function themeDeleteMarkup(packageItem){
  if(!me?.admin||serverCapabilities.theme_delete!==true||packageItem.id==='default')return '';
  return `<div class="theme-delete"><button class="secondary" data-theme-delete="${esc(packageItem.id)}" type="button">Slet pakke</button><div class="theme-delete-confirm" data-theme-delete-confirm="${esc(packageItem.id)}" hidden><p>Vil du slette designpakken <strong>${esc(packageItem.theme.name)}</strong>? Hvis pakken er aktiv, skiftes der til standarddesignet. Sletningen kan ikke fortrydes her.</p><p class="theme-delete-status" data-theme-delete-status="${esc(packageItem.id)}" role="status" aria-live="polite" aria-atomic="true"></p><div class="theme-delete-actions"><button class="danger" data-theme-delete-submit="${esc(packageItem.id)}" type="button">Slet pakken</button><button class="secondary" data-theme-delete-cancel="${esc(packageItem.id)}" type="button">Annullér</button></div></div></div>`;
}
function bindThemeDelete(){
  if(!me?.admin||serverCapabilities.theme_delete!==true)return;
  document.querySelectorAll('[data-theme-delete]').forEach(trigger=>{
    const card=trigger.closest('[data-theme-card]'),id=trigger.dataset.themeDelete,confirmation=$('[data-theme-delete-confirm]',card),submit=$('[data-theme-delete-submit]',card),cancel=$('[data-theme-delete-cancel]',card),status=$('[data-theme-delete-status]',card);
    let pending=false;
    trigger.onclick=()=>{confirmation.hidden=false;trigger.hidden=true;status.textContent='';confirmation.scrollIntoView?.({block:'nearest'});submit.focus?.();};
    cancel.onclick=()=>{if(pending)return;confirmation.hidden=true;trigger.hidden=false;trigger.focus?.({preventScroll:true});};
    submit.onclick=async()=>{
      if(pending)return;pending=true;
      const account=accountGeneration,buttons=Array.from(card.querySelectorAll('button')).map(button=>[button,button.disabled]);
      buttons.forEach(([button])=>button.disabled=true);confirmation.setAttribute('aria-busy','true');status.textContent='Sletter designpakken…';status.classList.remove('error');
      try{
        const result=await api('/admin/themes/'+encodeURIComponent(id),'DELETE');
        if(result?.ok!==true||!result.theme||typeof result.theme!=='object')throw Error('Serveren kunne ikke bekræfte sletningen.');
        if(account!==accountGeneration||!me)return;
        themes=themes.filter(item=>item.id!==id);card.remove();applyTheme(result.theme);
        const message=result.reset_to_default?'Pakken er slettet. Standarddesignet er nu aktivt.':'Pakken er slettet. Det aktive design er bevaret.';
        const feedback=$('#theme-delete-feedback');if(feedback)feedback.textContent=message;toast(message);
      }catch(error){if(account===accountGeneration){status.textContent='Kunne ikke slette designpakken: '+(error?.message||'Prøv igen.');status.classList.add('error');}}
      finally{pending=false;buttons.forEach(([button,disabled])=>button.disabled=disabled);confirmation.setAttribute('aria-busy','false');}
    };
  });
}
async function designView(){const generation=navigationGeneration,account=accountGeneration,requestView=view,requestGallery=current;const list=await api('/admin/themes');if(!galleryRequestActive(generation,account,requestView,requestGallery))return;themes=list;$('#content').innerHTML=`<div class="heading"><div><div class="eyebrow">Gør arkivet til jeres</div><h1>Design & udtryk</h1><p class="muted">Installér en designpakke, prøv den, og aktivér den for hele familien.</p></div><button id="theme-upload">＋ Upload designpakke</button><input id="theme-file" type="file" accept=".json,.zip" hidden></div><p id="theme-delete-feedback" class="theme-delete-feedback" role="status" aria-live="polite" aria-atomic="true"></p><div class="grid" id="theme-grid">${themes.map(x=>`<article class="card" data-theme-card="${esc(x.id)}"><div class="theme-swatch" style="background:${x.theme.colors.background}">${Object.values(x.theme.colors).map(v=>`<span style="background:${v};border:1px solid #8883"></span>`).join('')}</div><div class="theme-card"><h2>${esc(x.theme.name)}</h2><p class="muted">${x.theme.font==='serif'?'Klassisk':'Enkel'} typografi · ${x.theme.radius}px hjørner</p><button class="secondary" data-preview="${x.id}">Forhåndsvis</button><button data-activate="${x.id}">Aktivér</button>${themeDeleteMarkup(x)}</div></article>`).join('')}</div><div class="panel" style="margin-top:25px"><h2>Jeres egen designpakke</h2><p>En JSON-fil eller en ZIP med én fil: <code>theme.json</code>. Pakken styrer fire farver, skrifttype, hjørner og afstand. Admin kan skifte tilbage til standardtemaet når som helst.</p><button id="download-theme" class="secondary">↓ Hent eksempelpakke</button> <button id="cancel-preview" class="secondary">Gendan aktivt design</button><p class="muted" style="margin-top:15px">Forhåndsvisning gælder kun denne side, indtil du aktiverer temaet.</p></div>`;decorateAdmin('design');bindThemeDelete();document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{applyTheme(themes.find(t=>t.id===b.dataset.preview).theme);toast('Forhåndsvisning · ikke aktiveret')});document.querySelectorAll('[data-activate]').forEach(b=>b.onclick=async()=>{try{await api('/admin/themes/'+b.dataset.activate+'/activate','POST');applyTheme(await api('/theme'));toast('Designet er aktiveret for alle')}catch(e){toast(e.message)}});$('#cancel-preview').onclick=async()=>applyTheme(await api('/theme'));$('#theme-upload').onclick=()=>$('#theme-file').click();$('#theme-file').onchange=async e=>{if(!e.target.files[0])return;const f=new FormData();f.append('file',e.target.files[0]);try{await api('/admin/themes','POST',f);await designView();toast('Designpakke installeret. Klar til forhåndsvisning.')}catch(err){toast(err.message)}};$('#download-theme').onclick=()=>{const blob=new Blob([JSON.stringify(themes[0].theme,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='theme.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}
// Lychee import is driven in small, explicitly requested batches in this tab.
// Leaving this view invalidates the loop; an already requested batch may finish.
let lycheeGeneration=0,lycheeSession=null;
function stopLycheeView(){lycheeGeneration++;if(lycheeSession)lycheeSession.cancelled=true}
function lycheeActive(session){return !session.cancelled&&session.generation===lycheeGeneration&&view==='lychee'&&!!me?.admin&&!!$('#lychee-import')}
function lycheeCount(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0}
function lycheeMediaProgress(progress){
  if(!progress||typeof progress.label!=='string')return '';
  const total=Number(progress.total_bytes),rawDone=Number(progress.done_bytes);
  if(!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(rawDone))return '';
  const done=Math.min(total,Math.max(0,rawDone));
  const unit=total>=1024**3?'GB':total>=1024**2?'MB':'KB',divisor=unit==='GB'?1024**3:unit==='MB'?1024**2:1024;
  const format=value=>(value/divisor).toLocaleString('da-DK',{maximumFractionDigits:1});
  return `<div class="lychee-media-progress"><p class="status">${esc(progress.label)} · ${format(done)} af ${format(total)} ${unit}</p><progress max="${total}" value="${done}" aria-label="Fremdrift for aktuel fil"></progress></div>`;
}
const lycheeStateNames={scanning:'Finder albummer og billeder',preview:'Prøvevisning klar',running:'Kopiering i gang',paused:'Kopiering sat på pause',completed:'Import afsluttet',failed:'Import kræver gennemgang'};
function lycheeMode(session){
  const job=session.data?.job;
  if(job&&(job.mode_locked||['running','paused','completed'].includes(job.state)))return job.transfer_mode==='move'?'move':'copy';
  return session.transferMode==='move'?'move':'copy';
}
async function lycheeView(){
  stopLycheeView();
  const session={generation:lycheeGeneration,cancelled:false,busy:false,stopRequested:false,error:'',data:null,transferMode:'copy',confirmed:false};
  lycheeSession=session;
  $('#content').innerHTML='<div id="lychee-import"><p role="status">Henter importstatus…</p></div>';
  try{
    const data=await api('/admin/lychee-import');
    if(!lycheeActive(session))return;
    session.data=data;lycheeDraw(session);
  }catch(error){
    if(!lycheeActive(session))return;
    session.error=error.message;lycheeDraw(session);
  }
}
function lycheeDraw(session){
  if(!lycheeActive(session))return;
  const data=session.data,job=data?.job,totals=job?.totals||{},state=job?.state||'';
  const n=key=>lycheeCount(totals[key]);
  const finished=n('imported')+n('duplicate')+n('unsupported')+n('missing')+n('error');
  const total=n('photos');
  const isReady=!!data?.configured&&!data?.migration_needed;
  const mode=lycheeMode(session),moving=mode==='move',transfer=moving?'flytning':'kopiering';
  const moveAvailable=data?.move_available===true,modeLocked=!!job?.mode_locked;
  const startAllowed=!moving||modeLocked||moveAvailable;
  const stateName=moving&&state==='running'?'Flytning i gang':moving&&state==='paused'?'Flytning sat på pause':lycheeStateNames[state]||state||'Importstatus';
  const moveReason=typeof data?.move_unavailable_reason==='string'&&data.move_unavailable_reason?data.move_unavailable_reason:'Flytning kræver den opdaterede private importør og dens SQL-migrering.';
  const metrics=[['albums','Albummer'],['photos','Billedplaceringer'],['pending','Afventer'],['imported','Importeret'],['duplicate','Dubletter'],['unsupported','Ikke understøttet'],['missing','Manglende filer'],['error','Fejl']];
  let controls='';
  if(isReady&&!job)controls='<button data-lychee="scan">Lav prøvevisning</button>';
  if(isReady&&job&&!session.busy){
    if(state==='preview')controls=`${modeLocked?`<p>Overførselsmetode: <strong>${moving?'Flyt originalerne':'Kopiér originalerne'}</strong>. Metoden bevares, når importen fortsættes.</p>`:`<label style="flex-basis:100%;min-width:0">Overførselsmetode<select id="lychee-transfer-mode"><option value="copy" ${!moving?'selected':''}>Kopiér originalerne</option><option value="move" ${moving?'selected':''} ${!moveAvailable?'disabled':''}>Flyt originalerne</option></select></label>${!moveAvailable?`<p class="muted" role="status">${esc(moveReason)}${data?.move_migration_needed?' Importér 003_lychee_move.sql i LexGalleris database, og lav derefter en ny prøvevisning.':''} <a href="https://github.com/alexhertzladiges-lab/LexGalleri/blob/main/LYCHEE-IMPORT.md" target="_blank" rel="noopener">Se installationsvejledningen</a>.</p>`:''}`}<label class="check"><input type="checkbox" id="lychee-confirm" ${session.confirmed?'checked':''}>Jeg har gennemgået prøvevisningen og vil ${moving?'flytte originalerne fra Lychee til LexGalleri':'kopiere billederne'}.</label><button data-lychee="start" id="lychee-start" ${!session.confirmed||!startAllowed?'disabled':''}>Start ${transfer}</button><button class="secondary" data-lychee="scan">Lav ny prøvevisning</button>`;
    if(state==='scanning')controls='<button data-lychee="continue">Fortsæt prøvevisning</button>';
    if(state==='running')controls=`<button data-lychee="continue">Fortsæt ${transfer}</button> <button class="secondary" data-lychee="pause">Sæt på pause</button>`;
    if(state==='paused')controls=`<button data-lychee="start">Fortsæt ${transfer}</button>`;
    if(state==='completed')controls='<button class="secondary" data-lychee="scan">Lav ny prøvevisning</button>';
  }
  if(session.busy)controls=`<button class="secondary" data-lychee="stop" ${session.stopRequested?'disabled':''}>${session.stopRequested?'Stopper efter aktuel portion…':state==='scanning'?'Stop efter aktuel portion':'Pause efter aktuel portion'}</button>`;
  const rows=Array.isArray(job?.preview)?job.preview:[];
  const issues=Array.isArray(job?.issues)?job.issues.slice(0,50):[];
  const issueNames={unsupported:'Format understøttes ikke',missing:'Fil mangler',error:'Fejl',duplicate:'Dublet'};
  $('#lychee-import').innerHTML=`<div class="heading"><div><div class="eyebrow">Fra Lychee til familiens arkiv</div><h1>Import fra Lychee</h1><p class="muted">Til Lychee 6.6.12 · ingen opgradering nødvendig</p></div><button class="secondary" data-lychee="refresh" ${session.busy?'disabled':''}>Opdatér status</button></div>
    <div class="panel"><h2>${moving?'Originalerne flyttes til LexGalleri':'Originalerne bliver i Lychee'}</h2><p>${moving?'Når du starter flytningen, flyttes de understøttede originaler fra Lychees mapper til LexGalleri i små portioner. En fil i flere albummer genbruger samme original, så der ikke gemmes en ekstra originalkopi for hvert album. Der skal stadig være plads til nye visningsbilleder og miniaturer. Ikke-understøttede filer bliver i Lychee, og manglende filer registreres til gennemgang.':'Først laves en prøvevisning. Når du vælger at starte, kopieres de understøttede originaler i små portioner til LexGalleri, og der laves nye visningsbilleder.'} JPEG, PNG, WebP og MP4-videoer understøttes. De importerede gallerier får kun adgang for admin, indtil du selv deler dem.</p><p class="muted">Oplysninger fra Lychee gemmes i importhistorikken. Lychees ejer er ikke nødvendigvis den oprindelige uploader; i LexGalleri er det den administrator, der kører importen, som står for denne overførsel.</p></div>
    ${session.error?`<div class="panel lychee-problem" role="alert"><h2>Importen er stoppet her</h2><p>${esc(session.error)}</p><p class="muted">Ingen nye portioner startes automatisk. Opdatér status, og fortsæt, når problemet er løst.</p></div>`:''}
    ${data&&!data.configured?'<div class="panel"><h2>Gør importøren klar</h2><p>Kontrollér de to forskellige filer i den private mappe:</p><ul><li><code>lychee-import.php</code>: importmodulet, ved siden af <code>app.php</code>.</li><li><code>config/lychee-import.php</code>: den udfyldte kildekonfiguration.</li></ul><p>I konfigurationen skal <code>enabled</code> sættes til <code>true</code> uden anførselstegn.</p><p class="muted">Når filerne er på plads og konfigurationen er aktiveret, vælger du Opdatér status.</p></div>':''}
    ${data?.configured&&data?.migration_needed?'<div class="panel"><h2>Importtabellerne mangler</h2><p>Importér importørens SQL-migrering i LexGalleris database via phpMyAdmin med din egen adgang. Brug migrationsvejledningen til denne version; Lychees database skal ikke ændres.</p><p class="muted">Opdatér status bagefter. Første prøvevisning kopierer ingen billeder.</p></div>':''}
    ${job?`<div class="panel"><div class="lychee-status-head"><h2>${esc(stateName)}</h2><span class="badge">Lychee ${esc(data.source_version||'6.6.12')}</span></div><div class="lychee-metrics">${metrics.map(([key,label])=>`<div><strong>${n(key).toLocaleString('da-DK')}</strong><span>${label}</span></div>`).join('')}</div>
      ${state==='scanning'?'<progress aria-label="Prøvevisning indlæses"></progress>':total?`<progress max="${total}" value="${Math.min(total,finished)}" aria-label="Behandlede billedplaceringer"></progress><p class="muted status">${Math.min(total,finished).toLocaleString('da-DK')} af ${total.toLocaleString('da-DK')} billedplaceringer behandlet</p>`:''}
      ${lycheeMediaProgress(job.media_progress)}
      <p class="muted">Et billede eller en video kan høre til flere Lychee-albummer. Tælleren viser derfor billedplaceringer i albummer. Manglende filer, dubletter og formater, der ikke understøttes, registreres særskilt.</p>
      ${moving?`<p><strong>${lycheeCount(job.moved_files).toLocaleString('da-DK')}</strong> originaler flyttet. Én originalfil kan dække flere billedplaceringer.</p>`:''}
      ${state==='completed'?'<p>Gennemgå resultatet og eventuelle fejl, før du tager Lychee ud af brug. Gallerierne kan nu findes under Gallerier.</p>':''}
      ${state==='running'&&!session.busy?`<p>Vælg Fortsæt ${transfer} for at behandle næste portion. Der startes ingen nye portioner, mens du er væk fra denne side.</p>`:''}
      ${['preview','completed'].includes(state)?'<p class="muted">En ny prøvevisning kan finde nye eller reparerede poster. Gennemførte importposter bevares. Prøvevisningen flytter eller kopierer ingen billeder, og systemerne synkroniseres ikke løbende.</p>':''}
      <div class="lychee-controls">${controls}</div>
    </div>`:isReady?`<div class="panel"><h2>Begynd med et overblik</h2><p>Prøvevisningen læser Lychees albummer og metadata, så du kan gennemgå omfanget før overførsel. JPEG, PNG, WebP og MP4-videoer kan importeres. Andre formater vises særskilt i resultatet.</p><div class="lychee-controls">${controls}</div></div>`:''}
    ${rows.length?`<div class="panel"><h2>Albummer i prøvevisningen</h2>${rows.length<n('albums')?`<p class="muted">Viser ${rows.length.toLocaleString('da-DK')} af ${n('albums').toLocaleString('da-DK')} albummer. Tællerne og ${moving?'flytningen':'kopieringen'} omfatter alle albummer.</p>`:''}<div class="lychee-table-wrap"><table class="lychee-table"><thead><tr><th scope="col">Album / galleri</th><th scope="col">Billedplaceringer</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.title)}</td><td>${lycheeCount(row.count).toLocaleString('da-DK')}</td></tr>`).join('')}</tbody></table></div><p class="muted">Albumstier bevares i gallerinavnene. Nye gallerier er private for admin.</p></div>`:''}
    ${issues.length?`<div class="panel"><h2>Poster til gennemgang</h2><p class="muted">Her vises op til 50 poster med oplysninger fra den aktuelle import. Ret eventuelle problemer i kilden, og lav derefter en ny prøvevisning.</p><div class="lychee-table-wrap"><table class="lychee-table lychee-issues"><thead><tr><th scope="col">Billede</th><th scope="col">Lychee-id</th><th scope="col">Status</th><th scope="col">Oplysning</th></tr></thead><tbody>${issues.map(issue=>`<tr><td>${esc(issue.title||'Uden titel')}</td><td>${esc(issue.source_photo_id)}</td><td>${esc(issueNames[issue.status]||issue.status)}</td><td>${esc(issue.error||'Ingen yderligere oplysninger')}</td></tr>`).join('')}</tbody></table></div></div>`:''}`;
  document.querySelectorAll('[data-lychee]').forEach(button=>button.onclick=()=>{
    const action=button.dataset.lychee;
    if(action==='refresh'){lycheeView();return}
    if(action==='stop'){session.stopRequested=true;lycheeDraw(session);return}
    if(action==='start'&&state==='preview'&&!session.confirmed)return;
    lycheeAction(session,action);
  });
  if(state==='preview'&&!session.busy&&isReady){
    const confirm=$('#lychee-confirm'),start=$('#lychee-start'),selector=$('#lychee-transfer-mode');
    if(confirm){confirm.checked=!!session.confirmed;confirm.onchange=e=>{session.confirmed=!!e.target.checked;if(start)start.disabled=!session.confirmed||!startAllowed};}
    if(start)start.disabled=!session.confirmed||!startAllowed;
    if(!modeLocked&&selector)selector.onchange=e=>{session.transferMode=e.target.value==='move'&&moveAvailable?'move':'copy';session.confirmed=false;lycheeDraw(session)};
  }
}
async function lycheeLoop(session){
  while(lycheeActive(session)&&!session.stopRequested&&['scanning','running'].includes(session.data?.job?.state)){
    session.data=await api('/admin/lychee-import/step','POST',{job_id:session.data.job.id});
    if(!lycheeActive(session))return;
    lycheeDraw(session);
    if(['scanning','running'].includes(session.data?.job?.state))await new Promise(resolve=>setTimeout(resolve,150));
  }
  if(lycheeActive(session)&&session.stopRequested&&session.data?.job?.state==='running'){
    session.data=await api('/admin/lychee-import/pause','POST',{job_id:session.data.job.id});
  }
}
async function lycheeAction(session,action){
  if(!lycheeActive(session)||session.busy)return;
  if(action==='start'&&session.data?.job?.state==='preview'&&!session.confirmed)return;
  const transferMode=lycheeMode(session);
  if(action==='start'&&transferMode==='move'&&!session.data?.job?.mode_locked&&session.data?.move_available!==true){session.error=session.data?.move_unavailable_reason||'Flytning er ikke klar. Opdatér status og kontrollér opsætningen.';lycheeDraw(session);return;}
  if(action==='scan')session.confirmed=false;
  session.busy=true;session.stopRequested=false;session.error='';lycheeDraw(session);
  try{
    if(action==='scan')session.data=await api('/admin/lychee-import/scan','POST',{});
    else if(action==='start')session.data=await api('/admin/lychee-import/start','POST',{job_id:session.data.job.id,confirm:true,transfer_mode:transferMode});
    else if(action==='pause')session.data=await api('/admin/lychee-import/pause','POST',{job_id:session.data.job.id});
    else if(action!=='continue')throw Error('Ukendt importhandling');
    if(!lycheeActive(session))return;
    if(action!=='pause')await lycheeLoop(session);
    if(lycheeActive(session)&&session.data?.job?.state==='completed'){
      try{const updated=await api('/galleries');if(lycheeActive(session))galleries=updated}catch{if(lycheeActive(session))toast('Importen er afsluttet. Opdatér gallerierne for at se resultatet.')}
    }
  }catch(error){if(lycheeActive(session))session.error=error.message}
  finally{if(lycheeActive(session)){session.busy=false;lycheeDraw(session)}}
}

// Storage is an admin-only media budget; file measurement remains server-side.
let storageRequestSequence=0;
function storageBytes(value){
  if(!Number.isSafeInteger(value)||value<0)return 'Ikke opgjort';
  const units=[[1000000000,'GB'],[1000000,'MB'],[1000,'kB'],[1,'B']],unit=units.find(([size])=>value>=size)||units[3];
  return new Intl.NumberFormat('da-DK',{maximumFractionDigits:unit[0]===1?0:1}).format(value/unit[0])+' '+unit[1];
}
function storagePercent(bytes,limit){const value=bytes/limit*100;return value>0&&value<0.1?'<0,1 %':new Intl.NumberFormat('da-DK',{maximumFractionDigits:1}).format(value)+' %';}
function storageMountMarkup(){return me?.admin&&serverCapabilities.storage_overview===true?'<section class="panel storage-panel" id="storage-panel" aria-label="Medieplads"><p role="status">Henter pladsoversigt…</p></section>':'';}
function storagePayloadValid(data){return !!data&&Number.isSafeInteger(data.total_bytes)&&data.total_bytes>=0&&Number.isSafeInteger(data.limit_bytes)&&data.limit_bytes>0&&Number.isSafeInteger(data.scanned_at)&&typeof data.complete==='boolean'&&Array.isArray(data.galleries)&&data.galleries.every(g=>typeof g.id==='string'&&typeof g.name==='string'&&Number.isSafeInteger(g.bytes)&&g.bytes>=0);}
function storageSummaryMarkup(data){
  const percent=data.total_bytes/data.limit_bytes*100,state=!data.complete?'partial':percent>=100?'over':percent>=80?'warning':'normal',time=new Date(data.scanned_at*1000).toLocaleString('da-DK',{dateStyle:'short',timeStyle:'short'});
  const remaining=data.limit_bytes-data.total_bytes;
  return `<div class="storage-title"><h2>Medieplads</h2><div><button type="button" class="secondary" id="storage-refresh" aria-label="Opdatér pladsopgørelsen">Opdatér</button><button type="button" class="secondary" id="storage-limit-edit">Ret grænse</button></div></div><div class="storage-total storage-${state}"><strong>${data.complete?'':'Foreløbigt '}${esc(storageBytes(data.total_bytes))}<small> / ${esc(storageBytes(data.limit_bytes))}</small></strong><span>${esc(storagePercent(data.total_bytes,data.limit_bytes))}</span></div><progress class="storage-meter storage-${state}" max="100" value="${Math.min(100,percent)}" aria-label="${esc(storageBytes(data.total_bytes))} brugt af ${esc(storageBytes(data.limit_bytes))}"></progress><p class="storage-caption">${data.complete?remaining>=0?esc(storageBytes(remaining))+' til grænsen':esc(storageBytes(-remaining))+' over grænsen':'Delvis opgørelse: henvisninger eller samtidige filændringer kunne ikke medregnes fuldt.'}</p><details id="storage-detail"><summary>Fordeling pr. galleri (${data.galleries.length})</summary><div class="storage-gallery-list">${data.galleries.map(g=>`<div class="storage-gallery"><div><strong>${esc(g.name)}</strong><span>${esc(storageBytes(g.bytes))} · ${esc(storagePercent(g.bytes,data.limit_bytes))}</span></div><progress class="storage-meter" max="100" value="${Math.min(100,g.bytes/data.limit_bytes*100)}" aria-label="${esc(g.name)}: ${esc(storageBytes(g.bytes))}"></progress></div>`).join('')||'<p>Der er endnu ingen gallerier.</p>'}</div>${data.shared_bytes>0?'<p class="storage-note">Delte filer tælles kun én gang i totalen. Det samme indhold kan derfor indgå i flere gallerital.</p>':''}${data.other_bytes>0?`<p class="storage-note">${esc(storageBytes(data.other_bytes))} øvrige mediefiler og igangværende oprydning indgår i totalen.</p>`:''}</details><p class="storage-note">Originaler, visningsbilleder og miniaturer · opgjort ${esc(time)}. 1 GB = 1.000.000.000 bytes.</p>`;
}
async function loadStorageSummary(area,refresh=false){
  if(!me?.admin||view!==area||serverCapabilities.storage_overview!==true||!$('#storage-panel'))return;
  const request=++storageRequestSequence,account=accountGeneration,navigation=navigationGeneration,expanded=!!$('#storage-detail')?.open;
  const active=()=>request===storageRequestSequence&&account===accountGeneration&&navigation===navigationGeneration&&view===area&&!!me?.admin&&!!$('#storage-panel');
  $('#storage-panel').setAttribute('aria-busy','true');const button=$('#storage-refresh');if(button)button.disabled=true;
  try{
    const data=await api(refresh?'/admin/storage/refresh':'/admin/storage',refresh?'POST':'GET',refresh?{}:undefined);
    if(!active())return;if(!storagePayloadValid(data))throw Error('Serveren kunne ikke bekræfte pladsopgørelsen');
    $('#storage-panel').innerHTML=storageSummaryMarkup(data);$('#storage-detail').open=expanded;
    $('#storage-refresh').onclick=()=>loadStorageSummary(area,true);$('#storage-limit-edit').onclick=()=>storageLimitDialog(data,area);
  }catch(error){if(active()){$('#storage-panel').innerHTML='<h2>Medieplads</h2><p class="error" role="alert">'+esc(error.message)+'</p><button type="button" class="secondary" id="storage-retry">Prøv igen</button>';$('#storage-retry').onclick=()=>loadStorageSummary(area,true);}}
  finally{if(active())$('#storage-panel').setAttribute('aria-busy','false');}
}
function storageLimitDialog(data,area){
  if(!me?.admin)return;const account=accountGeneration;
  modal('Pladsgrænse for LexGalleri',`<div class="dialog-content"><form id="storage-limit-form"><label>Samlet grænse i GB<input name="limit_gb" type="number" min="0.001" max="100000" step="0.001" value="${data.limit_bytes/1000000000}" required inputmode="decimal"></label><p class="muted">Grænsen bruges til overblikket og stopper ikke uploads. Den ændrer ikke den aftalte diskplads på webhotellet.</p><div class="error" role="alert"></div><button type="submit">Gem grænse</button></form></div>`);
  const dialog=photoViewerGeneration;
  formHandler('#storage-limit-form',async fields=>{
    const result=await api('/admin/storage/limit','PUT',{limit_gb:fields.limit_gb});if(result?.ok!==true)throw Error('Grænsen kunne ikke bekræftes');
    if(account!==accountGeneration||!me?.admin)return;
    if(dialog===photoViewerGeneration&&M.open)closeModal();await loadStorageSummary(area);toast('Pladsgrænsen er gemt.');
  });
}
// Administration uses the existing account and gallery APIs.
const adminAreas=[['admin','Overblik'],['people','Personer og adgang'],['admin-content','Indhold'],['activity','Aktivitet og nyt'],['design','Udseende'],['deletions','Sletteønsker'],['admin-security','Drift og sikkerhed']];
let adminDirectoryData=null,grantDialog=null;
let pendingModalCloses=0;
function closeModal(){photoViewerGeneration++;photoViewerNavigation=null;if(M.open){pendingModalCloses++;M.close();}}
const adminFlag=value=>value===true||value===1||value==='1';
const isAdminView=value=>adminAreas.some(([key])=>key===value);
function adminStatus(text,state='neutral'){
  const symbol={ok:'✓',warning:'!',error:'!',saving:'…',neutral:'?'}[state]||'?';
  return `<span class="admin-status admin-status-${state}"><span aria-hidden="true">${symbol}</span>${esc(text)}</span>`;
}
function updateAdminNavigation(){
  const menu=$('#admin-subnav');if(menu)menu.hidden=!isAdminView(view);
  const entry=$('[data-view=admin]');if(entry){entry.classList.toggle('active',isAdminView(view));entry.setAttribute('aria-expanded',String(isAdminView(view)));}
}
function decorateAdmin(area=view){
  if(!me?.admin||!isAdminView(view))return;
  const content=$('#content');
  if(!$('#admin-heading'))content.insertAdjacentHTML('afterbegin',`<div class="admin-heading" id="admin-heading"><div><div class="eyebrow">Et overblik, der er til at handle på</div><h1>Administration</h1></div><label class="admin-area-label">Administrationsområde<select id="admin-area">${adminAreas.map(([key,label])=>`<option value="${key}" ${key===area?'selected':''}>${label}</option>`).join('')}</select></label></div>`);
  const selector=$('#admin-area');if(selector){selector.value=area;selector.onchange=()=>navigateView(selector.value);}
  updateAdminNavigation();
}
function directoryValid(data){return data&&Array.isArray(data.users)&&Array.isArray(data.grants);}
function memberAccessSummary(user,data){
  if(adminFlag(user.admin))return {text:'Fuld adgang',state:'ok',detail:'Administrator · Alle gallerier',names:galleries.map(g=>g.name),count:galleries.length};
  if(!Array.isArray(data?.grants))return {text:'Ikke kontrolleret',state:'neutral',detail:'Galleriadgang kunne ikke bekræftes',names:[],count:null};
  const ids=[...new Set(data.grants.filter(grant=>grant.user_id===user.id).map(grant=>grant.gallery_id))];
  const names=ids.map(id=>galleries.find(g=>g.id===id)?.name||'Galleri uden navn');
  return {text:ids.length?'Har galleriadgang':'Ingen galleriadgang',state:ids.length?'ok':'warning',detail:'Medlem · '+ids.length+' '+(ids.length===1?'galleri':'gallerier'),names,count:ids.length};
}
function memberCard(user,data,compact=false){
  const access=memberAccessSummary(user,data),names=access.names.slice(0,3),rest=access.names.length-names.length;
  return `<article class="member-card" data-member-row="${esc(user.id)}"><div class="member-card-main"><div class="member-avatar" aria-hidden="true">${esc((user.name||'?').trim().charAt(0).toUpperCase())}</div><div class="member-identity"><button class="member-name" data-profile="${esc(user.id)}" type="button">${esc(user.name)}</button><p class="member-email">${esc(user.email||user.phone||'')}</p><p class="member-role">${esc(access.detail)}</p>${names.length?`<p class="member-galleries">${names.map(esc).join(' · ')}${rest>0?' · +'+rest+' mere':''}</p>`:''}</div><div class="member-state">${adminStatus(access.text,access.state)}</div></div>${compact?'':`<div class="member-actions"><button class="secondary" data-profile="${esc(user.id)}" type="button">Profil</button>${!adminFlag(user.admin)?`<button class="secondary" data-user="${esc(user.id)}" type="button">Galleriadgang</button>${memberDeleteMarkup(user)}`:''}</div>`}</article>`;
}
function bindMemberCards(data){
  for(const user of data.users)bindMemberDelete(user);
  document.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>profileView(button.dataset.profile));
  document.querySelectorAll('[data-user]').forEach(button=>button.onclick=()=>{const user=data.users.find(u=>u.id===button.dataset.user);if(user)galleryAccessForm(user,data);});
}
function drawDirectory(data,compact=false){
  const list=$('#admin-member-list');if(!list||!me?.admin)return;
  const query=($('#member-search')?.value||'').trim().toLocaleLowerCase('da-DK'),filter=$('#member-filter')?.value||'all';
  const matches=data.users.filter(user=>{
    const access=memberAccessSummary(user,data),search=[user.name,user.email,user.phone,access.detail,...access.names].join(' ').toLocaleLowerCase('da-DK');
    return (!query||search.includes(query))&&(filter==='all'||filter==='admin'&&adminFlag(user.admin)||filter==='no-access'&&!adminFlag(user.admin)&&access.count===0);
  }).sort((a,b)=>(a.name||'').localeCompare(b.name||'','da-DK'));
  const shown=compact?matches.slice(0,6):matches;
  list.innerHTML=shown.map(user=>memberCard(user,data,compact)).join('')||'<div class="admin-empty"><h3>Ingen personer fundet</h3><p>Prøv et andet navn, en e-mail eller et galleri.</p></div>';
  const count=$('#member-search-count');if(count)count.textContent=compact&&matches.length>6?'Viser 6 af '+matches.length+' personer':matches.length+' '+(matches.length===1?'person':'personer');
  bindMemberCards(data);
}
function directoryMarkup(data,compact=false){
  return `<section class="panel admin-directory"><div class="admin-section-title"><div><h2>${compact?'Medlemmer':'Familiens konti'}</h2><p class="muted">Navn, kontakt og galleriadgang samlet ét sted.</p></div><span id="member-search-count" role="status"></span></div><div class="member-tools"><label class="member-search-label"><span>Søg medlem</span><input id="member-search" type="search" placeholder="Navn, e-mail, telefon eller galleri" autocomplete="off"></label>${compact?'':`<label>Vis<select id="member-filter"><option value="all">Alle personer</option><option value="admin">Administratorer</option><option value="no-access">Uden galleriadgang</option></select></label>`}</div><div id="admin-member-list" class="admin-member-list"></div>${compact?'<button class="admin-text-link" id="all-members" type="button">Vis alle medlemmer →</button>':''}</section>`;
}
function bindDirectory(data,compact=false){
  drawDirectory(data,compact);$('#member-search').oninput=()=>drawDirectory(data,compact);
  if($('#member-filter'))$('#member-filter').onchange=()=>drawDirectory(data,compact);
  if($('#all-members'))$('#all-members').onclick=()=>navigateView('people');
}
function adminPageFailure(title,error,retry){
  $('#content').innerHTML=`<section class="panel admin-load-error"><h2>${esc(title)}</h2><p class="error" role="alert">${esc(error?.message||'Prøv igen.')}</p><p>Ingen ændringer er gemt.</p><button id="admin-retry" class="secondary" type="button">Prøv igen</button></section>`;
  decorateAdmin();$('#admin-retry').onclick=retry;
}
async function adminOverview(){
  if(!me?.admin)return;
  const generation=navigationGeneration,account=accountGeneration;
  $('#content').innerHTML='<p role="status">Henter administrationen…</p>';decorateAdmin('admin');
  const [directory,requests]=await Promise.allSettled([api('/admin/users'),serverCapabilities.media_delete_requests===true?api('/admin/deletion-requests'):Promise.resolve(null)]);
  if(!galleryRequestActive(generation,account,'admin',null)||!me?.admin)return;
  if(directory.status!=='fulfilled'||!directoryValid(directory.value)){adminPageFailure('Medlemsoversigten kunne ikke hentes',directory.reason||Error('Serveren kunne ikke bekræfte konti og rettigheder.'),()=>navigateView('admin'));return;}
  const data=directory.value;adminDirectoryData=data;
  const pending=requests.status==='fulfilled'&&Array.isArray(requests.value)?requests.value.length:null;
  const without=data.users.filter(user=>!adminFlag(user.admin)&&memberAccessSummary(user,data).count===0).length;
  $('#content').innerHTML=`<div class="heading admin-page-intro"><div><h2>Overblik</h2><p class="muted">Familien, adgang og opgaver, der venter på dig.</p></div><button id="invite" type="button">＋ Invitér en person</button></div><div class="admin-overview-cards"><button class="panel admin-summary-card" id="overview-people" type="button"><span>Personer</span><strong>${data.users.length}</strong><small>${without?without+' uden galleriadgang':'Åbn personer og adgang'}</small></button><button class="panel admin-summary-card" id="overview-galleries" type="button"><span>Gallerier</span><strong>${galleries.length}</strong><small>Indhold og deling</small></button><button class="panel admin-summary-card" id="overview-deletions" type="button"><span>Sletteønsker</span><strong>${pending===null?'—':pending}</strong><small>${pending===null?'Status er ikke bekræftet':pending?'Afventer din godkendelse':'Ingen afventende sletteønsker'}</small></button></div>${storageMountMarkup()}${without?`<div class="admin-notice">${adminStatus('Adgang kræver et valg','warning')}<p>${without} ${without===1?'person har':'personer har'} ingen delte gallerier. Du kan tildele adgang under Personer og adgang.</p></div>`:''}${pending===null?'<p class="admin-quiet-status">Sletteønsker er ikke kontrolleret. Åbn området for at se status og eventuel opsætning.</p>':''}${directoryMarkup(data,true)}`;
  decorateAdmin('admin');bindDirectory(data,true);$('#invite').onclick=inviteForm;if(serverCapabilities.reusable_phone_invitations){$('#invite').insertAdjacentHTML('afterend','<button id="invitation-list" class="secondary" type="button">Invitationslinks</button>');$('#invitation-list').onclick=invitationList;}
  loadStorageSummary('admin');
  $('#overview-people').onclick=()=>navigateView('people');$('#overview-galleries').onclick=()=>navigateView('admin-content');$('#overview-deletions').onclick=()=>navigateView('deletions');
}
async function peopleView(){
  if(!me?.admin)return;
  profileGeneration++;const generation=navigationGeneration,account=accountGeneration,requestView=view,requestGallery=current;
  $('#content').innerHTML='<p role="status">Henter personer og adgang…</p>';decorateAdmin('people');
  let data;try{data=await api('/admin/users');if(!directoryValid(data))throw Error('Serveren kunne ikke bekræfte konti og rettigheder.');}
  catch(error){if(galleryRequestActive(generation,account,requestView,requestGallery))adminPageFailure('Personerne kunne ikke hentes',error,()=>navigateView('people'));return;}
  if(!galleryRequestActive(generation,account,requestView,requestGallery)||!me?.admin)return;
  adminDirectoryData=data;
  $('#content').innerHTML=`<div class="heading admin-page-intro"><div><h2>Personer og adgang</h2><p class="muted">Find en person, åbn profilen eller vælg personens gallerier.</p></div><button id="invite" type="button">＋ Invitér en person</button></div><p id="member-delete-feedback" role="status" aria-live="polite"></p>${memberDeleteNotice()}${directoryMarkup(data)}<details class="panel admin-help"><summary>Sådan fungerer konti og invitationer</summary><p>Listen viser oprettede konti. En invitation bliver først til en ny konto, når den accepteres. Invitationer til eksisterende konti kan give adgang til flere gallerier.</p><p>${serverCapabilities.reusable_phone_invitations?'Et personligt invitationslink kan åbnes igen med samme kontos adgangskode, indtil det udløber efter 7 dage eller tilbagekaldes. Genbesøg ændrer ikke personens rettigheder.':'Et personligt invitationslink kan bruges én gang og udløber efter 7 dage.'} Du vælger gallerier og rettigheder fra starten.</p><p>Originalfiler kan indeholde GPS-data. Download af originaler og afspilning af videoer kræver både download- og GPS-adgang.</p></details>`;
  decorateAdmin('people');bindDirectory(data);$('#invite').onclick=inviteForm;if(serverCapabilities.reusable_phone_invitations){$('#invite').insertAdjacentHTML('afterend','<button id="invitation-list" class="secondary" type="button">Invitationslinks</button>');$('#invitation-list').onclick=invitationList;}
}
function adminContentView(){
  if(!me?.admin)return;
  $('#content').innerHTML=`<div class="heading admin-page-intro"><div><h2>Indhold</h2><p class="muted">Åbn et galleri for at rette navn, tilføje medier eller vælge billeder til sletning.</p></div><button id="admin-new-gallery" type="button">＋ Nyt galleri</button></div><div class="panel admin-gallery-list">${galleries.map(g=>`<div class="admin-gallery-row"><div><h3>${esc(g.name)}</h3><p class="muted">${Math.max(0,Number(g.count)||0)} billeder og videoer</p></div><div class="gallery-delete-actions"><button class="secondary" type="button" data-admin-gallery="${esc(g.id)}">Åbn galleri</button>${serverCapabilities.gallery_delete===true?`<button class="danger" type="button" data-admin-gallery-delete="${esc(g.id)}">Slet galleri</button>`:''}</div></div>`).join('')||'<p>Der er endnu ingen gallerier.</p>'}</div><button class="secondary" id="admin-deletions" type="button">Gennemgå sletteønsker</button>`;
  decorateAdmin('admin-content');$('#admin-new-gallery').onclick=newGallery;$('#admin-deletions').onclick=()=>navigateView('deletions');document.querySelectorAll('[data-admin-gallery]').forEach(b=>b.onclick=()=>openGallery(b.dataset.adminGallery));document.querySelectorAll('[data-admin-gallery-delete]').forEach(b=>b.onclick=()=>wholeGalleryDialog({id:b.dataset.adminGalleryDelete}));
}
async function adminSecurityView(){
  if(!me?.admin)return;
  const generation=navigationGeneration,account=accountGeneration;
  $('#content').innerHTML='<p role="status">Kontrollerer opsætningen…</p>';decorateAdmin('admin-security');
  let status;try{status=await api('/status');if(status.account_security_version!==1||status.account_security_ready!==true)throw Error('Serveren kunne ikke bekræfte kontosikkerheden.');}
  catch(error){if(galleryRequestActive(generation,account,'admin-security',null))adminPageFailure('Status kunne ikke bekræftes',error,()=>navigateView('admin-security'));return;}
  if(!galleryRequestActive(generation,account,'admin-security',null)||!me?.admin)return;
  serverCapabilities=status.capabilities&&typeof status.capabilities==='object'?status.capabilities:{};
  const checks=[['gallery_create','Oprettelse af gallerier'],['gallery_edit','Redigering af gallerier'],['multi_gallery_invitations','Invitation til flere gallerier'],['media_delete_requests','Godkendelse af sletteønsker'],['member_delete','Sletning af medlemskonti'],['theme_delete','Sletning af designpakker']];
  $('#content').innerHTML=`<div class="heading admin-page-intro"><div><h2>Drift og sikkerhed</h2><p class="muted">Kontrolleret ${esc(new Date().toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'}))}. Status er de funktioner, serveren oplyser, at den understøtter.</p></div><button id="admin-status-refresh" class="secondary" type="button">Kontrollér igen</button></div>${storageMountMarkup()}<section class="panel"><h2>Din konto og Authenticator</h2><p>Se dine profiloplysninger, skift adgangskode og administrér Authenticator og reservekoder fra din profil.</p><button class="secondary" id="admin-own-security" type="button">Åbn min profil</button></section><section class="panel"><h2>Funktioner i installationen</h2><div class="admin-checks">${checks.map(([key,label])=>`<div class="admin-check"><span>${label}</span>${serverCapabilities[key]===true?adminStatus('Tilgængelig','ok'):adminStatus('Ikke bekræftet','neutral')}</div>`).join('')}</div><p class="muted">Ikke bekræftet betyder, at opsætningen skal undersøges, før funktionen kan regnes som klar.</p><a href="https://github.com/alexhertzladiges-lab/LexGalleri/blob/main/ACCOUNTS.md" target="_blank" rel="noopener">Åbn vejledningen til opsætning</a></section>`;
  decorateAdmin('admin-security');loadStorageSummary('admin-security');$('#admin-status-refresh').onclick=()=>navigateView('admin-security');$('#admin-own-security').onclick=()=>navigateView('profile');
}
function requestDialogClose(){
  if($('#whole-gallery-form')?.dataset?.wholeGalleryPending==='true')return;
  if(grantDialog?.busy)return;
  if(grantDialog?.dirty()){$('#grant-leave-warning').hidden=false;$('#grant-stay').focus();return;}
  cancelGalleryDeleteConfirmation();photoViewerGeneration++;closeModal();
}

if(typeof window!=='undefined')window.addEventListener('focus',()=>refreshGalleryNews());
if(typeof window!=='undefined')window.addEventListener('hashchange',()=>{const id=galleryIdFromHash(location.hash);if(!id)return;requestedGalleryId=id;if(me)consumeGalleryLink().catch(()=>toast('Galleriet kunne ikke åbnes. Prøv igen.'));});
if(typeof document!=='undefined')document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState!=='hidden')refreshGalleryNews()});
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(grantDialog?.dirty()){event.preventDefault();event.returnValue='';}});
M.addEventListener('keydown',photoViewerKeydown);
M.addEventListener('cancel',event=>{event?.preventDefault?.();if(grantDialog&&(grantDialog.busy||grantDialog.dirty())){requestDialogClose();return;}cancelGalleryDeleteConfirmation();closeModal();});
M.addEventListener('close',()=>{const handled=pendingModalCloses>0;if(handled)pendingModalCloses--;if(M.open)return;grantDialog=null;if(!handled)photoViewerGeneration++;photoViewerNavigation=null;stopPhotoVideo();removeUnselectedFavorites();if(privateAccountDialog){M.innerHTML='';privateAccountDialog=false}});
function wholeGalleryButtonMarkup(){
  if(me?.admin&&serverCapabilities.gallery_delete===true)return '<button id="whole-gallery-delete" class="danger" type="button">Slet galleri</button>';
  if(permissions.delete_request===true&&serverCapabilities.gallery_delete_requests===true)return '<button id="whole-gallery-request" class="secondary" type="button">Send galleri til sletning</button>';
  return '';
}
async function wholeGalleryDialog(gallery,requestId=null){
  const account=accountGeneration,navigation=navigationGeneration,admin=!!me?.admin;
  modal(admin?'Slet hele galleriet':'Send galleri til sletning','<p role="status">Henter galleriets oplysninger…</p>');
  const generation=photoViewerGeneration;
  const active=()=>account===accountGeneration&&navigation===navigationGeneration&&generation===photoViewerGeneration&&M.open&&!!me;
  let preview;
  try{preview=await api('/galleries/'+encodeURIComponent(gallery.id)+'/deletion');}
  catch(error){if(active())M.insertAdjacentHTML('beforeend','<p class="error" role="alert">'+esc(error.message)+'</p>');return;}
  if(!active())return;
  const pendingRequest=preview.request?.status==='pending',resume=preview.job?.status==='deleting';
  const wrapper=document.createElement('div');wrapper.className='dialog-content';wrapper.innerHTML=`<form id="whole-gallery-form"><h3>${esc(preview.name)}</h3><p>${Math.max(0,Number(preview.count)||0)} billeder og videoer.</p><p>${admin?'Hele galleriet, alle dets billeder og videoer samt adgangene til galleriet bliver slettet. Det kan ikke fortrydes her. Indhold i andre gallerier bevares.':pendingRequest?'Anmodningen afventer admin. Galleriet og indholdet er endnu ikke slettet.':'Galleriet og alle dets billeder og videoer sendes til sletning hos admin. Intet slettes, før admin godkender.'}</p>${admin&&!resume?'<label>Skriv galleriets navn for at bekræfte<input id="whole-gallery-name" name="confirm_name" autocomplete="off" required></label>':''}<p id="whole-gallery-progress" role="status" aria-live="polite">${resume?'Sletningen er påbegyndt. Genoptag for at færdiggøre den.':''}</p><p class="error" role="alert"></p><div class="gallery-delete-actions"><button type="submit" class="${admin?'danger':'secondary'}">${admin?(resume?'Genoptag sletning':'Slet hele galleriet'):pendingRequest?'Annullér sletteanmodning':'Send anmodning til admin'}</button><button id="whole-gallery-cancel" class="secondary" type="button">Luk</button></div></form>`;
  M.querySelector('[role=status]')?.remove();M.append(wrapper);
  const form=$('#whole-gallery-form'),submit=form.querySelector('button[type=submit]'),cancel=$('#whole-gallery-cancel'),close=$('#close-modal'),status=$('#whole-gallery-progress');
  let pending=false;
  cancel.onclick=()=>{if(!pending)closeModal();};
  form.onsubmit=async event=>{
    event.preventDefault();if(pending||!active())return;
    if(admin&&!resume&&$('#whole-gallery-name').value!==preview.name){form.querySelector('.error').textContent='Skriv galleriets navn præcist for at bekræfte.';return;}
    pending=true;form.dataset.wholeGalleryPending='true';submit.disabled=true;cancel.disabled=true;close.disabled=true;form.querySelector('.error').textContent='';
    try{
      if(!admin){
        const reply=await api('/galleries/'+gallery.id+'/deletion-request',pendingRequest?'DELETE':'POST',{});
        if(reply?.ok!==true||reply.request?.status!==(pendingRequest?'cancelled':'pending'))throw Error('Serveren kunne ikke bekræfte anmodningen. Opdatér galleriet før et nyt forsøg.');
        if(!active())return;closeModal();toast(pendingRequest?'Sletteanmodningen er annulleret.':'Galleriet er sendt til sletning hos admin.');return;
      }
      let body=resume?{job_id:preview.job.id}:{confirm_name:preview.name,version:preview.version,...(requestId?{request_id:requestId}:{})};
      while(active()){
        status.textContent='Sletter galleriets billeder og videoer…';
        const result=await api('/galleries/'+gallery.id,'DELETE',body);
        if(!active())return;
        if(result?.ok!==true||typeof result.done!=='boolean'||typeof result.job_id!=='string'||!Number.isInteger(result.processed)||!Number.isInteger(result.remaining))throw Error('Serveren kunne ikke bekræfte sletningen. Luk og genoptag fra Sletteønsker.');
        if(result.done){
          closeModal();galleries=galleries.filter(g=>g.id!==gallery.id);if(current?.id===gallery.id){current=null;photos=[];permissions={};}
          await refreshGalleryView('galleries');toast('Galleriet og dets indhold er slettet.');return;
        }
        status.textContent=result.processed+' slettet · '+result.remaining+' tilbage';body={job_id:result.job_id};
      }
    }catch(error){if(active()){form.querySelector('.error').textContent=error.message;status.textContent=admin?'Hvis sletningen er påbegyndt, kan den genoptages under Administration → Sletteønsker.':'';}}
    finally{pending=false;if(active()){form.dataset.wholeGalleryPending='false';submit.disabled=false;cancel.disabled=false;close.disabled=false;}}
  };
}
async function wholeGalleryQueue(content,generation,account){
  if(serverCapabilities.gallery_delete!==true)return;
  const active=()=>galleryRequestActive(generation,account,'deletions',null)&&!!me?.admin;
  const panel=document.createElement('section');panel.className='panel';panel.innerHTML='<h2>Hele gallerier</h2><p role="status">Henter sletteanmodninger og afbrudte sletninger…</p>';content.append(panel);
  try{
    const result=await api('/admin/gallery-deletion-requests');if(!active())return;
    if(!Array.isArray(result.requests)||!Array.isArray(result.deletions))throw Error('Listen kunne ikke bekræftes.');
    panel.innerHTML='<h2>Hele gallerier</h2><p class="error" role="alert"></p>'+(result.requests.length||result.deletions.length?'':'<p>Ingen afventende gallerier.</p>');
    for(const request of result.requests){
      const row=document.createElement('article');row.className='admin-gallery-row';row.innerHTML=`<div><h3>${esc(request.name)}</h3><p>Sendt af ${esc(request.requester_name)}</p></div><div class="gallery-delete-actions"><button class="danger" type="button" data-whole-approve>Gennemgå og slet galleri</button><button class="secondary" type="button" data-whole-reject>Afvis anmodning</button></div>`;panel.append(row);
      row.querySelector('[data-whole-approve]').onclick=()=>{if(active())wholeGalleryDialog({id:request.gallery_id},request.id);};
      const reject=row.querySelector('[data-whole-reject]');reject.onclick=async()=>{
        if(!active()||reject.disabled)return;reject.disabled=true;
        try{const reply=await api('/admin/galleries/'+request.gallery_id+'/deletion-reject','POST',{request_id:request.id});if(reply?.ok!==true)throw Error('Afvisningen kunne ikke bekræftes. Opdatér listen.');if(active()){row.remove();toast('Anmodningen er afvist. Galleriet er bevaret.');}}
        catch(error){if(active())panel.querySelector('.error').textContent=error.message;}finally{if(active())reject.disabled=false;}
      };
    }
    for(const job of result.deletions){
      const row=document.createElement('article');row.className='admin-gallery-row';row.innerHTML=`<div><h3>${esc(job.name)}</h3><p>Sletningen skal færdiggøres · ${Number(job.processed)||0} filer behandlet</p></div><button class="danger" type="button">Genoptag sletning</button>`;panel.append(row);row.querySelector('button').onclick=()=>{if(active())wholeGalleryDialog({id:job.gallery_id});};
    }
  }catch(error){if(active())panel.innerHTML='<h2>Hele gallerier</h2><p class="error" role="alert">'+esc(error.message)+'</p>';}
}

init();
