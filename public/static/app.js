'use strict';
const BASE=new URL(document.currentScript.src).pathname.replace(/\/static\/app\.js$/, '');
const $=(q,el=document)=>el.querySelector(q),A=$('#app'),M=$('#modal');
let me,galleries=[],photos=[],current=null,view='galleries',permissions={},themes=[],activeTheme;
let photoViewerGeneration=0;
let photoViewerNavigation=null;
let accountGeneration=0,profileGeneration=0,privateAccountDialog=false;
let navigationGeneration=0,serverCapabilities={};
let galleryDeleteState=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,method='GET',body){const opt={method};if(body instanceof FormData)opt.body=body;else if(body!==undefined){opt.headers={'Content-Type':'application/json'};opt.body=JSON.stringify(body)}const r=await fetch(BASE+'/api'+path,opt);let b;try{b=await r.json()}catch{throw Error('Serveren kunne ikke svare')}if(!r.ok){const error=Error(b.detail||'Der opstod en fejl');error.status=r.status;throw error}return b}
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',4500)}
function applyTheme(t){activeTheme=t;for(const[k,v]of Object.entries(t.colors))document.documentElement.style.setProperty('--'+k,v);document.documentElement.style.setProperty('--radius',t.radius+'px');document.documentElement.style.setProperty('--gap',t.density==='compact'?'12px':'22px');document.body.style.fontFamily=t.font==='serif'?'Georgia,serif':'Arial,sans-serif'}
function stopPhotoVideo(){$('#photo-video')?.pause?.()}
function modal(title,html,photo=false){
  cancelGalleryDeleteConfirmation();
  photoViewerGeneration++;photoViewerNavigation=null;privateAccountDialog=false;stopPhotoVideo();
  M.classList?.toggle('photo-dialog',photo);M.classList?.remove('photo-info-open');M.setAttribute?.('aria-labelledby','modal-title');
  M.innerHTML=`<div class="dialog-head${photo?' photo-toolbar':''}"><h2 id="modal-title"${photo?' class="photo-viewer-title"':''}>${esc(title)}</h2>${photo?'<button class="secondary" id="photo-info-toggle" type="button" aria-expanded="false" aria-controls="photo-info"><span aria-hidden="true">ⓘ</span> Info</button>':''}<button class="secondary" id="close-modal" type="button" aria-label="Luk">✕</button></div>${html}`;
  $('#close-modal').onclick=()=>{cancelGalleryDeleteConfirmation();photoViewerGeneration++;M.close()};if(!M.open)M.showModal();
}
function formHandler(id,fn){$(id).onsubmit=async e=>{e.preventDefault();const btn=$('button[type=submit]',e.target);if(btn)btn.disabled=true;try{await fn(Object.fromEntries(new FormData(e.target)))}catch(err){const out=$('.error',e.target);if(out)out.textContent=err.message;else toast(err.message)}finally{if(btn)btn.disabled=false}}}
function clearAccountWorkspace(){
  cancelGalleryDeleteConfirmation();galleryDeleteState=null;
  accountGeneration++;profileGeneration++;navigationGeneration++;photoViewerGeneration++;stopLycheeView();stopPhotoVideo();galleries=[];photos=[];current=null;view='galleries';
  if(M.open)M.close();M.innerHTML='';privateAccountDialog=false;
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
  me={id:result.id,name:result.name,email:result.email,admin:result.admin};
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
  A.innerHTML=`<div class="login"><div class="brand">◈ Lex<span>Galleri</span></div><div class="eyebrow">Administrator · ekstra beskyttelse</div><h1>${enrollment?'Tilføj Authenticator.':'Bekræft dit login.'}</h1><p>${enrollment?'Tilføj LexGalleri i fx Google Authenticator eller Microsoft Authenticator. Bekræft med den sekscifrede kode, før du får adgang.':'Åbn din Authenticator-app, og indtast en ny sekscifret kode. Du kan også bruge en ubrugt reservekode.'}</p><div id="mfa-setup">${enrollment?'<p role="status">Gør opsætningen klar…</p>':''}</div><form id="mfa-form"><label>${enrollment?'Kode fra Authenticator':'Kode fra Authenticator eller reservekode'}<input name="code" type="text" autocomplete="one-time-code" ${enrollment?'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"':'maxlength="64" autocapitalize="off" spellcheck="false"'} required></label><p class="muted">En kode kan kun bruges én gang. Vent på en ny kode i appen, hvis du lige har brugt den.</p><div class="error" id="mfa-error" role="alert"></div><button type="submit" ${enrollment?'disabled':''}>${enrollment?'Bekræft Authenticator':'Log ind'} →</button></form><button class="secondary" id="mfa-cancel" type="button">Annullér og log ud</button></div>`;
  $('#mfa-cancel').onclick=accountSignOut;
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
function auth(setup=false,invite=null,prefill=''){clearAccountWorkspace();me=null;A.innerHTML=`<div class="login"><div class="brand">◈ Lex<span>Galleri</span></div><div class="eyebrow">Kun for jer</div><h1>${setup?'Et hjem til jeres minder.':invite?'Du er inviteret.':'Velkommen hjem.'}</h1><p class="muted">${setup?'Opret familiens administrator for at komme i gang.':invite?'Vælg en adgangskode på mindst 12 tegn. Har du allerede en konto, skal du bruge dens adgangskode.':'Log ind og find tilbage til de øjeblikke, I deler.'}</p><form id="auth">${setup?'<label>Opsætningsnøgle<input name="token" type="password" required></label><label>Dit navn<input name="name" autocomplete="name" required></label>':''}${invite?'':`<label>E-mail<input name="email" type="email" autocomplete="email" value="${esc(prefill)}" required></label>`}<label>Adgangskode<input name="password" type="password" autocomplete="${setup||invite?'new-password':'current-password'}" minlength="${setup||invite?12:1}" required></label><div class="error" role="alert"></div><button type="submit">${setup?'Opret familiearkiv':invite?'Acceptér invitation':'Log ind'} →</button></form><p class="muted" style="font-size:12px;margin-top:26px">Private billeder. Fælles minder.</p></div>`;formHandler('#auth',async b=>{if(invite)b.token=invite;const result=await api(setup?'/setup':invite?'/accept':'/login','POST',b);await authResult(result,true)})}
async function init(){try{const s=await api('/status');serverCapabilities=s.capabilities&&typeof s.capabilities==='object'?s.capabilities:{};if(s.account_security_version!==1||(!s.setup&&s.account_security_ready!==true))return accountMaintenance();const token=new URLSearchParams(location.search).get('invite');if(token)return auth(false,token);if(s.setup)return auth(true);try{me=await api('/me')}catch(error){if(error.status&&error.status!==401)throw error;let pending;try{pending=await api('/mfa/status')}catch(problem){if(problem.status&&![401,404].includes(problem.status))throw problem;return auth()}return mfaGate(pending)}await start()}catch(e){A.innerHTML='<div class="login"><h1>Kunne ikke starte</h1><p>'+esc(e.message)+'</p></div>'}}
async function start(){const generation=++navigationGeneration,account=accountGeneration;const theme=await api('/theme');if(generation!==navigationGeneration||account!==accountGeneration||!me)return;const list=await api('/galleries');if(generation!==navigationGeneration||account!==accountGeneration||!me)return;applyTheme(theme);galleries=list;shell();await render()}
function shell(){A.innerHTML=`<div class="shell"><aside><div class="brand">◈ Lex<span>Galleri</span></div><button data-view="galleries">▧ &nbsp; Gallerier</button><button data-view="timeline">◷ &nbsp; Tidslinje</button><button data-view="favorites">♡ &nbsp; Favoritter</button><button data-view="profile">♙ &nbsp; Min profil</button>${me.admin?'<button data-view="people">♧ &nbsp; Familie & gæster</button><button data-view="design">◐ &nbsp; Design</button><button data-view="deletions">⌫ &nbsp; Sletteønsker</button>':''}<div class="foot"><span class="badge">🔒 Privat familiearkiv</span><p>Et lille sted til<br>de store øjeblikke.</p><button id="logout">Log ud</button></div></aside><main><div class="top"><span>VORES FÆLLES MINDER</span><span><span class="avatar">${esc(me.name[0])}</span>${esc(me.name)} ${me.admin?'· Admin':''} <button id="mobile-logout" class="secondary" aria-label="Log ud">↪</button></span></div><div id="content"></div></main></div>`;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigateView(b.dataset.view));const logout=async()=>{stopLycheeView();await api('/logout','POST');location.reload()};if($('#logout'))$('#logout').onclick=logout;$('#mobile-logout').onclick=logout}
async function render(){if(view!=='lychee')stopLycheeView();document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const C=$('#content');if(view==='galleries'&&!current){C.innerHTML=`<div class="heading"><div><div class="eyebrow">Saml på øjeblikkene</div><h1 style="margin:12px 0">Jeres gallerier</h1><p class="muted">Små hverdage. Store oplevelser. Alt det, I gerne vil huske.</p></div>${me.admin||serverCapabilities.gallery_create===true?'<button id="new-gallery">＋ Nyt galleri</button>':''}</div><div class="tools"><input id="search-gallery" placeholder="Søg i gallerier…" aria-label="Søg i gallerier"><span class="muted">${galleries.length} gallerier · privat adgang</span></div><div id="gallery-grid" class="grid"></div>`;const draw=()=>{$('#gallery-grid').innerHTML=galleries.filter(g=>g.name.toLowerCase().includes($('#search-gallery').value.toLowerCase())).map(g=>`<article class="card"><button data-gallery="${g.id}">${g.cover?`<img class="cover" src="${BASE}/api/photos/${g.cover}/image" loading="lazy" alt="">`:'<div class="cover placeholder">◈</div>'}<div class="card-body"><h3>${esc(g.name)}</h3><p class="muted">${esc(g.description||'Et sted til jeres minder')}</p><span class="badge">${g.count} billeder</span> <span class="badge">🔒 Begrænset adgang</span></div></button></article>`).join('')||'<div class="empty"><h2>Her begynder minderne</h2><p>Gallerier vises her, når de er oprettet og delt med dig.</p></div>';document.querySelectorAll('[data-gallery]').forEach(b=>b.onclick=()=>openGallery(b.dataset.gallery))};draw();$('#search-gallery').oninput=draw;if($('#new-gallery'))$('#new-gallery').onclick=newGallery;
}else if(current){await galleryView()}else if(view==='timeline'||view==='favorites'){await collectionView()}else if(view==='profile'){await profileView()}else if(view==='people'){await peopleView()}else if(view==='design'){await designView()}else if(view==='deletions'&&me.admin){await deletionRequestsView()}else if(view==='lychee'&&me.admin){await lycheeView()}}
function newGallery(){
  const account=accountGeneration;
  modal('Et nyt kapitel',`<div class="dialog-content"><form id="new"><label>Galleriets navn<input name="name" required maxlength="100" placeholder="Fx Sommer ved Vesterhavet"></label><label>Beskrivelse<textarea name="description" rows="3" maxlength="1000"></textarea></label><p class="muted">${me.admin?'Kun admin har adgang fra start. Del det bagefter med familien.':'Du og admin har adgang fra start. Admin kan dele galleriet med familien.'}</p><div class="error" role="alert"></div><button type="submit">Opret galleri</button></form></div>`);
  const generation=photoViewerGeneration;
  formHandler('#new',async fields=>{
    await api('/galleries','POST',fields);
    if(account!==accountGeneration||!me)return;
    if(generation!==photoViewerGeneration){toast('Galleriet er oprettet.');return;}
    M.close();await refreshGalleryView('galleries');
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
  if(M.open)M.close();
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
  content.innerHTML=`<button class="secondary" id="back">← Alle gallerier</button><div class="heading" style="margin-top:26px"><div><div class="eyebrow">🔒 Privat galleri</div><h1 style="margin:12px 0">${esc(requestGallery.name)}</h1><p class="muted">${esc(requestGallery.description)} · <span id="gallery-media-count">${photos.length} billeder</span></p></div><div class="gallery-actions">${permissions.upload?'<button id="upload">＋ Tilføj billeder</button><input id="files" type="file" multiple accept="image/jpeg,image/png,image/webp" hidden>':''}${galleryDeletionToggleMarkup()}</div></div><div class="tools"><input id="search-photo" placeholder="Søg efter titel, sted eller uploader…" aria-label="Søg i billeder"><select id="sort" aria-label="Sortering"><option value="taken">Optaget · nyeste først</option><option value="uploaded">Senest uploadet</option></select></div><div id="upload-status" role="status"></div>${galleryDeletionToolsMarkup()}<div id="photo-grid" class="photo-grid"></div>`;
  $('#back').onclick=()=>refreshGalleryView('galleries');drawPhotos(photos);
  bindGalleryDelete(requestGallery);
  const filter=()=>{if(galleryDeleteState?.active){galleryDeleteState.selected.clear();$('#gallery-delete-feedback').textContent='Markeringerne er nulstillet, fordi søgningen eller sorteringen blev ændret.';}const q=$('#search-photo').value.toLowerCase(),key=$('#sort').value;drawPhotos(photos.filter(photo=>[photo.title,photo.place,photo.uploader_name].join(' ').toLowerCase().includes(q)).sort((a,b)=>(b[key]||'').localeCompare(a[key]||'')));};
  $('#search-photo').oninput=filter;$('#sort').onchange=filter;
  if($('#upload')){
    const upload=$('#upload'),status=$('#upload-status');upload.onclick=()=>$('#files').click();
    $('#files').onchange=async event=>{
      const files=[...event.target.files],errors=[];upload.disabled=true;
      for(let i=0;i<files.length;i++){
        status.textContent=`Uploader ${i+1} af ${files.length}: ${files[i].name}`;
        const form=new FormData();form.append('file',files[i]);
        try{await api('/galleries/'+requestGallery.id+'/photos','POST',form);}catch(error){errors.push(files[i].name+': '+error.message);}
      }
      if(!galleryRequestActive(generation,account,requestView,requestGallery))return;
      await galleryView();
      const list=await api('/galleries');if(!galleryRequestActive(generation,account,requestView,requestGallery))return;
      galleries=list;toast(errors.length?errors.join(' · '):`${files.length} billeder uploadet`);
    };
  }
}
async function deletionRequestsView(){
  const generation=navigationGeneration,account=accountGeneration,content=$('#content');
  if(!me?.admin)return;
  content.innerHTML='<div class="heading"><div><h1>Sletteønsker</h1><p>Medlemmer markerer egne billeder og videoer. Filerne slettes først, når du godkender.</p></div></div>';
  if(serverCapabilities.media_delete_requests!==true){content.insertAdjacentHTML('beforeend','<div class="panel"><p role="status">Godkendelse af sletning er ikke aktiveret endnu. Installér den nye private app.php og SQL-migrering 005.</p><a href="https://github.com/alexhertzladiges-lab/LexGalleri/blob/main/ACCOUNTS.md#markering-til-sletning-og-admins-godkendelse" target="_blank" rel="noopener">Se installationsvejledningen</a></div>');return;}
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
      cancel.onclick=()=>{if(!pending)M.close();};
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
          if(dialogActive()){stopPhotoVideo();M.close();}
        }catch(error){if(dialogActive()){status.textContent='Handlingen kunne ikke gennemføres: '+error.message;status.classList.add('error');}else if(active())$('#deletion-request-feedback').textContent='Handlingen kunne ikke gennemføres: '+error.message;}
        finally{pending=false;card.dataset.pending='false';card.querySelectorAll('button').forEach(button=>button.disabled=false);if(dialogActive()){submit.disabled=false;cancel.disabled=false;}}
      };
    };
  }
}
function date(p){return p.taken?(p.precision==='circa'?'ca. ':'')+p.taken.replace('T',' kl. '):'Dato ukendt'}
function photoPath(p){return BASE+'/api/photos/'+encodeURIComponent(String(p.id??''))}
function photoMedia(p,rights){
  const path=photoPath(p),title=esc(p.title);
  if(p.mime!=='video/mp4')return `<img src="${path}/image?size=view" alt="${title}">`;
  if(rights.video!==true)return `<div class="viewer-media"><img src="${path}/image?size=view" alt="${title}"><p class="media-notice" role="status">Du har ikke adgang til at afspille denne video. Kontakt administratoren for at få adgang.</p></div>`;
  return `<div class="viewer-media"><video id="photo-video" controls playsinline preload="metadata" poster="${path}/image?size=view" src="${path}/video" aria-label="${title}"></video><p id="video-playback-error" class="media-notice" role="status" hidden></p></div>`;
}
function bindPhotoVideo(p,rights){
  if(p.mime!=='video/mp4'||rights.video!==true)return;
  const player=$('#photo-video'),message=$('#video-playback-error');
  if(!player||!message)return;
  player.addEventListener('error',()=>{message.textContent='Browseren kan ikke afspille denne video.'+(rights.download&&rights.gps?' Hent originalen for at åbne den i en anden afspiller.':' Prøv en anden browser.');message.hidden=false});
}
function drawPhotos(ps){$('#photo-grid').innerHTML=ps.map(p=>`<article class="photo"><button data-photo="${esc(p.id)}"><span class="photo-image"><img src="${photoPath(p)}/image" alt="${esc(p.title)}" loading="lazy">${p.mime==='video/mp4'?'<span class="video-badge">▶ Video</span>':''}</span><span class="caption"><span>${esc(p.title)}</span><span>${p.favorite?'♥':''} ${esc(p.taken?p.taken.slice(0,4):'')}</span></span>${deletionRequestBadge(p)}</button></article>`).join('')||'<div class="empty"><h2>Plads til flere minder</h2><p>Der er endnu ingen billeder at vise her.</p></div>';document.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{const state=galleryDeleteState;if(galleryDeleteActive(state)&&state.active){if(state.pending||!galleryDeletionEligible(photos.find(photo=>photo.id===b.dataset.photo)||{}))return;if(state.selected.has(b.dataset.photo))state.selected.delete(b.dataset.photo);else state.selected.add(b.dataset.photo);syncGalleryDelete(state);return;}showPhoto(b.dataset.photo).catch(error=>toast(error.message));});if(galleryDeleteActive(galleryDeleteState))syncGalleryDelete(galleryDeleteState);}
function galleryDeleteActive(state){
  return !!state&&state===galleryDeleteState&&state.account===accountGeneration&&state.navigation===navigationGeneration&&current===state.gallery&&state.grid===$('#photo-grid')&&galleryDeletionAllowed();
}
function galleryDeletionAllowed(){return !!me&&(me.admin?serverCapabilities.media_delete===true:serverCapabilities.media_delete_requests===true);}
function galleryDeletionToggleMarkup(){
  if(!me.admin&&serverCapabilities.media_delete_requests!==true)return '';
  return `<button class="secondary" id="gallery-delete-toggle" type="button" aria-expanded="false" ${galleryDeletionAllowed()?'aria-controls="gallery-delete-tools"':'disabled'}>${me.admin?'Slet billeder':'Markér til sletning'}</button>${galleryDeletionAllowed()?'':'<p class="muted" role="status">Sletning er ikke aktiveret endnu.</p>'}`;
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
  modal(state.requestOnly?'Markér til sletning':'Slet valgte billeder og videoer',`<div class="dialog-content" id="gallery-delete-confirm"><p>Du er ved at ${state.requestOnly?'markere':'slette'} <strong id="gallery-delete-total"></strong> fra <strong>${esc(state.gallery.name)}</strong>. ${state.requestOnly?'Filerne bliver liggende, indtil admin godkender sletningen.':'Handlingen kan ikke fortrydes her.'}</p><ul id="gallery-delete-list" class="gallery-delete-list"></ul>${state.requestOnly?'':'<p>Andre placeringer af samme billede eller video i andre gallerier bevares.</p>'}<p id="gallery-delete-status" role="status" aria-live="polite" aria-atomic="true"></p><div class="gallery-delete-actions"><button id="gallery-delete-submit" class="danger" type="button">${state.requestOnly?'Send til godkendelse':'Bekræft sletning'}</button><button id="gallery-delete-cancel" class="secondary" type="button">Annullér</button></div></div>`);
  const confirmation={cancelled:false,generation:photoViewerGeneration,remaining:chosen};state.confirmation=confirmation;
  const submit=$('#gallery-delete-submit'),cancel=$('#gallery-delete-cancel'),status=$('#gallery-delete-status'),list=$('#gallery-delete-list'),total=$('#gallery-delete-total');
  const active=()=>galleryDeleteActive(state)&&state.confirmation===confirmation&&!confirmation.cancelled&&confirmation.generation===photoViewerGeneration&&M.open;
  const showRemaining=()=>{total.textContent=confirmation.remaining.length+' filer';list.innerHTML=confirmation.remaining.map(photo=>`<li>${esc(photo.title)} <span class="muted">(${photo.mime==='video/mp4'?'Video':'Billede'})</span></li>`).join('');};showRemaining();
  cancel.onclick=()=>{confirmation.cancelled=true;M.close();};
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
        state.active=false;state.selected.clear();$('#gallery-delete-feedback').textContent=completed+(state.requestOnly?' filer er markeret til sletning og afventer admins godkendelse.':' filer er slettet fra galleriet.');confirmation.cancelled=true;M.close();
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
  for(const button of document.querySelectorAll('[data-photo]')){
    if(button.dataset.photo!==p.id)continue;
    const caption=$('.caption',button);
    if(caption?.children[0])caption.children[0].textContent=p.title;
    if(caption?.children[1])caption.children[1].textContent=(p.favorite?'♥ ':'')+(p.taken?p.taken.slice(0,4):'');
  }
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
      if(generation===photoViewerGeneration&&M.open){stopPhotoVideo();M.close();}
      toast(photo.mime==='video/mp4'?'Videoen er slettet fra galleriet.':'Billedet er slettet fra galleriet.');
    }catch(error){if(generation===photoViewerGeneration&&account===accountGeneration){status.textContent='Kunne ikke slette: '+(error?.message||'Prøv igen.');status.classList.add('error');}}
    finally{pending=false;buttons.forEach(([button,disabled])=>button.disabled=disabled);confirmation.setAttribute('aria-busy','false');}
  };
}
function photoDetails(p,rights){
  return `<div class="details" id="photo-info" hidden><div class="eyebrow">${p.mime==='video/mp4'?'Historien bag videoen':'Historien bag billedet'}</div>${photoDeleteMarkup(p)}<h2>${esc(p.title)}</h2><dl><dt>Optaget</dt><dd>${esc(date(p))}</dd><dt>Sted</dt><dd>${esc(p.place||'Ikke angivet')}</dd>${p.lat!==null?`<dt>GPS</dt><dd>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</dd>`:''}<dt>Uploadet af</dt><dd>${esc(p.uploader_name)}</dd><dt>Uploadtidspunkt</dt><dd>${esc(new Date(p.uploaded).toLocaleString('da-DK'))}</dd></dl>${lycheePhotoProvenance(p)}<button id="favorite" class="secondary" type="button">${p.favorite?'♥ Fjern favorit':'♡ Gem som favorit'}</button>${rights.download&&rights.gps?`<p><a href="${photoPath(p)}/image?size=original" download>↓ Hent original med metadata</a></p>`:''}${me.admin?'<p><button class="secondary" id="edit-photo" type="button">Redigér oplysninger</button></p>':''}</div>`;
}
async function showPhoto(id){
  const generation=++photoViewerGeneration,account=accountGeneration,requestView=view,requestGallery=current,p=photos.find(p=>p.id===id);if(!p)return;
  let b;try{b=await api('/galleries/'+p.gallery_id+'/photos');}
  catch(error){if(generation!==photoViewerGeneration||account!==accountGeneration||view!==requestView||current!==requestGallery)return;if(error.status===403||error.status===404){await galleryAccessLost();return;}throw error;}
  if(generation!==photoViewerGeneration||account!==accountGeneration||view!==requestView||current!==requestGallery)return;
  const rights=b.permissions,previousFocus=document.activeElement?.id;
  modal('Billedvisning',`<div class="viewer"><div class="photo-stage">${photoMedia(p,rights)}<button class="photo-nav photo-prev" id="prev" type="button" aria-label="Forrige billede" title="Forrige billede"><span aria-hidden="true">‹</span></button><button class="photo-nav photo-next" id="next" type="button" aria-label="Næste billede" title="Næste billede"><span aria-hidden="true">›</span></button></div>${photoDetails(p,rights)}</div>`,true);
  bindPhotoVideo(p,rights);
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
  if($('#edit-photo'))$('#edit-photo').onclick=()=>editPhoto(p);
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
function editPhoto(p){modal('Redigér billedets historie',`<div class="dialog-content"><form id="edit"><label>Titel<input name="title" value="${esc(p.title)}" required></label><div class="row"><label>Datopræcision<select name="precision">${[['unknown','Ukendt'],['exact','Dato og klokkeslæt'],['day','Dag'],['month','Måned'],['year','År'],['circa','Cirka år']].map(([v,n])=>`<option value="${v}" ${p.precision===v?'selected':''}>${n}</option>`).join('')}</select></label><label>Dato<input name="taken" value="${esc(p.taken)}" placeholder="2026-07-14T12:30"></label></div><p class="muted">Formater: 2026-07-14T12:30 · 2026-07-14 · 2026-07 · 2026. Tom ved ukendt dato.</p><label>Sted<input name="place" value="${esc(p.place)}"></label><div class="row"><label>Breddegrad<input name="lat" type="number" step="any" min="-90" max="90" value="${p.lat??''}"></label><label>Længdegrad<input name="lon" type="number" step="any" min="-180" max="180" value="${p.lon??''}"></label></div><div class="error"></div><button type="submit">Gem oplysninger</button></form></div>`);formHandler('#edit',async b=>{b.lat=b.lat===''?null:Number(b.lat);b.lon=b.lon===''?null:Number(b.lon);await api('/photos/'+p.id,'PATCH',b);M.close();await render();toast('Oplysninger gemt')})}
function profileMarkup(profile,own,security){
  const count=Number(profile.upload_count),uploads=Number.isSafeInteger(count)&&count>=0?count:0;
  const memberships=Array.isArray(profile.galleries)?profile.galleries:[],canEdit=own||!!me?.admin;
  return `<div class="heading"><div><div class="eyebrow">${own?'Din konto':'Familiens konti'}</div><h1>${own?'Min profil':esc(profile.name)}</h1><p class="muted">Kontaktoplysninger og adgang til familiens gallerier.</p></div>${canEdit?'<button id="profile-edit">Redigér profil</button>':''}</div>${own?'':'<p><button id="profile-back" class="secondary">← Familie & gæster</button></p>'}<div class="panel account-profile"><h2>${esc(profile.name)}</h2><dl class="profile-summary"><dt>E-mail</dt><dd>${esc(profile.email)}</dd><dt>Rolle</dt><dd>${profile.admin?'Administrator':'Medlem / gæst'}</dd><dt>Uploadede billeder og videoer</dt><dd>${uploads}</dd>${profile.admin?`<dt>Authenticator</dt><dd>${profile.mfa_enabled?'Aktiveret':'Skal sættes op ved login'}</dd>`:''}</dl></div><div class="panel"><h2>Gallerier og rettigheder</h2>${profile.admin?'<p>Administratorer har adgang til alle gallerier og indstillinger.</p>':''}<ul class="profile-galleries">${memberships.map(g=>`<li><strong>${esc(g.name)}</strong><span>Se galleri${g.upload?' · Uploade billeder':''}${g.download?' · Hente originaler':''}${g.gps?' · Se præcis GPS':''}</span></li>`).join('')||'<li>Der er endnu ikke delt gallerier med denne konto.</li>'}</ul></div>${own&&profile.admin?`<div class="panel"><h2>Login og Authenticator</h2><p>Administratorlogin kræver din adgangskode og en kode fra Authenticator. Opbevar reservekoderne et privat sted, adskilt fra telefonen.</p><p>Ubrugte reservekoder: <strong>${Math.max(0,Math.floor(Number(security?.recovery_codes_remaining)||0))}</strong></p><div class="security-actions"><button id="mfa-recovery-renew" class="secondary">Nye reservekoder</button><button id="mfa-replace" class="secondary">Skift Authenticator</button></div></div>`:''}`;
}
async function profileView(id=null){
  const own=!id||id===me.id;if(!own&&!me.admin)throw Error('Du har ikke adgang til andre profiler');
  const generation=++profileGeneration,requestView=view,content=$('#content');
  content.innerHTML='<p role="status">Henter profilen…</p>';
  try{
    const [profile,security]=await Promise.all([api(own?'/profile':'/admin/users/'+encodeURIComponent(id)),own&&me.admin?api('/security/mfa'):Promise.resolve(null)]);
    if(generation!==profileGeneration||view!==requestView)return;
    content.innerHTML=profileMarkup(profile,own,security);
    if($('#profile-edit'))$('#profile-edit').onclick=()=>editAccountProfile(profile,own);
    if($('#profile-back'))$('#profile-back').onclick=()=>peopleView().catch(error=>toast(error.message));
    if($('#mfa-recovery-renew'))$('#mfa-recovery-renew').onclick=()=>accountSecurityAction('recovery-codes');
    if($('#mfa-replace'))$('#mfa-replace').onclick=()=>accountSecurityAction('replace');
  }catch(error){if(generation===profileGeneration&&view===requestView)content.innerHTML='<div class="panel"><h2>Profilen kunne ikke hentes</h2><p class="error" role="alert">'+esc(error.message)+'</p></div>';}
}
function accountProofFields(){
  return `<label>${me.admin?'Din administratoradgangskode':'Din nuværende adgangskode'}<input type="password" name="current_password" autocomplete="current-password" required maxlength="72"></label>${me.admin?'<label>Ny kode fra Authenticator eller reservekode<input type="text" name="mfa_code" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" required maxlength="64"></label><p class="muted">Brug en ny kode fra din egen Authenticator. En allerede brugt kode accepteres ikke igen.</p>':''}`;
}
function editAccountProfile(profile,own){
  if(!own&&!me.admin)return;
  modal(own?'Redigér min profil':'Redigér profil · '+profile.name,`<div class="dialog-content"><form id="account-edit"><label>Navn<input name="name" value="${esc(profile.name)}" autocomplete="name" maxlength="100" required></label><label>E-mail<input name="email" type="email" value="${esc(profile.email)}" autocomplete="email" maxlength="254" required></label><label>Ny adgangskode<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72"></label><label>Gentag ny adgangskode<input name="password_confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="72"></label><p class="muted">Lad de nye adgangskodefelter være tomme for at beholde adgangskoden. Ændringer logger denne konto ud på dens enheder.</p>${accountProofFields()}<div class="error" role="alert"></div><button type="submit">Gem profil</button></form></div>`);
  privateAccountDialog=true;const generation=photoViewerGeneration;
  formHandler('#account-edit',async fields=>{
    if(fields.password!==fields.password_confirmation)throw Error('De nye adgangskoder er ikke ens');
    const body={name:fields.name,email:fields.email,current_password:fields.current_password};
    if(fields.password)body.password=fields.password;if(me.admin)body.mfa_code=fields.mfa_code;
    const response=await api(own?'/profile':'/admin/users/'+encodeURIComponent(profile.id),'PATCH',body);
    if(response.reauthentication_required===true){auth(false,null,response.user?.email||fields.email);toast('Profilen er opdateret. Log ind igen med de nye oplysninger.');return;}
    if(generation!==photoViewerGeneration){toast('Profilen er opdateret');return;}
    M.close();await profileView(own?null:profile.id);toast('Profilen er opdateret');
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
async function peopleView(){profileGeneration++;const data=await api('/admin/users');$('#content').innerHTML=`<div class="heading"><div><div class="eyebrow">Kun dem, I vælger</div><h1>Familie & gæster</h1><p class="muted">Adgang styres separat for hvert galleri.</p></div><button id="invite">＋ Invitér en gæst</button></div><div class="panel"><h2>Familiens konti</h2>${data.users.map(u=>`<div class="user-row"><strong>${esc(u.name)}</strong> <span class="badge">${u.admin?'Administrator':'Gæst / medlem'}</span><br><span class="muted">${esc(u.email)}</span><br><button class="secondary" data-profile="${esc(u.id)}">Se/redigér profil</button>${!u.admin?`<br><button class="secondary" data-user="${u.id}">Redigér gallerirettigheder</button>`:'<p class="muted">Fuld adgang til alle gallerier og indstillinger.</p>'}</div>`).join('')}</div><div class="panel"><h2>Sådan fungerer invitationer</h2><p>Opret et personligt engangslink til ét galleri. Linket udløber efter 7 dage. Send det selv til gæsten. Eksisterende konti kan få flere gallerier her i adminpanelet.</p><p class="muted">Originalfiler kan indeholde GPS-data. Download af originaler og afspilning af videoer kræver derfor både download- og GPS-adgang.</p></div>`;$('#invite').onclick=inviteForm;document.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>profileView(button.dataset.profile));document.querySelectorAll('[data-user]').forEach(button=>button.onclick=()=>galleryAccessForm(data.users.find(u=>u.id===button.dataset.user),data))}
function galleryAccessForm(user,data){
  modal('Adgang · '+user.name,`<div class="dialog-content">${galleries.map(g=>{const a=data.grants.find(a=>a.user_id===user.id&&a.gallery_id===g.id)||{};return `<form class="grant" data-g="${g.id}" aria-label="Adgang til ${esc(g.name)}"><h3>${esc(g.name)}</h3>${[['view','Se galleri',!!a.gallery_id],['upload','Uploade billeder',a.upload],['download','Hente originaler',a.download],['gps','Se præcis GPS',a.gps]].map(([k,n,v])=>`<label class="check"><input type="checkbox" name="${k}" ${v?'checked':''}>${n}</label>`).join('')}<div class="grant-feedback" role="status" aria-live="polite" aria-atomic="true"></div><button type="submit">Gem adgang</button><hr></form>`}).join('')||'<p>Opret først et galleri.</p>'}</div>`);
  document.querySelectorAll('.grant').forEach(form=>{
    const button=$('button[type=submit]',form),feedback=$('.grant-feedback',form),keys=['view','upload','download','gps'];
    const controls=keys.map(key=>form.elements[key]);
    const report=(message,state)=>{feedback.textContent=message;feedback.dataset.state=state;};
    form.onchange=()=>report('Ændringerne er ikke gemt.','changed');
    form.onsubmit=async event=>{
      event.preventDefault();if(button.disabled)return;
      const values=Object.fromEntries(keys.map(key=>[key,form.elements[key].checked]));
      const payload={user_id:user.id,gallery_id:form.dataset.g,...values};
      button.disabled=true;button.textContent='Gemmer…';controls.forEach(control=>control.disabled=true);
      form.setAttribute('aria-busy','true');report('Gemmer rettigheder…','saving');
      try{
        const result=await api('/admin/grants','PUT',payload);
        if(result?.ok!==true)throw Error('Serveren kunne ikke bekræfte ændringen.');
        data.grants=data.grants.filter(grant=>grant.user_id!==user.id||grant.gallery_id!==payload.gallery_id);
        if(values.view)data.grants.push({user_id:user.id,gallery_id:payload.gallery_id,upload:Number(values.upload),download:Number(values.download),gps:Number(values.gps)});
        report('Rettighederne er gemt.','success');
      }catch(error){report('Rettighederne kunne ikke gemmes: '+(error?.message||'Prøv igen.'),'error');}
      finally{button.disabled=false;button.textContent='Gem adgang';controls.forEach(control=>control.disabled=false);form.setAttribute('aria-busy','false');}
    };
  });
}
function inviteForm(){modal('Invitér en gæst',`<div class="dialog-content"><form id="invite-form"><label>Navn<input name="name" required></label><label>E-mail<input type="email" name="email" required></label><label>Galleri<select name="gallery_id" required>${galleries.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>${[['upload','Må uploade billeder'],['download','Må hente originaler'],['gps','Må se præcise GPS-positioner']].map(([k,n])=>`<label class="check"><input type="checkbox" name="${k}">${n}</label>`).join('')}<div class="error"></div><button type="submit">Opret invitationslink</button></form></div>`);formHandler('#invite-form',async b=>{for(const k of ['upload','download','gps'])b[k]=b[k]==='on';const v=await api('/admin/invitations','POST',b);modal('Invitationen er klar',`<div class="dialog-content"><p>Send dette link privat til gæsten. Det kan bruges én gang og udløber efter 7 dage.</p><label>Personligt invitationslink<input id="invite-link" readonly value="${esc(location.origin+v.path)}"></label><button id="copy-link">Kopiér link</button></div>`);$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#invite-link').value);toast('Link kopieret')}catch{$('#invite-link').select()}}})}
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
async function designView(){const generation=navigationGeneration,account=accountGeneration,requestView=view,requestGallery=current;const list=await api('/admin/themes');if(!galleryRequestActive(generation,account,requestView,requestGallery))return;themes=list;$('#content').innerHTML=`<div class="heading"><div><div class="eyebrow">Gør arkivet til jeres</div><h1>Design & udtryk</h1><p class="muted">Installér en designpakke, prøv den, og aktivér den for hele familien.</p></div><button id="theme-upload">＋ Upload designpakke</button><input id="theme-file" type="file" accept=".json,.zip" hidden></div><p id="theme-delete-feedback" class="theme-delete-feedback" role="status" aria-live="polite" aria-atomic="true"></p><div class="grid" id="theme-grid">${themes.map(x=>`<article class="card" data-theme-card="${esc(x.id)}"><div class="theme-swatch" style="background:${x.theme.colors.background}">${Object.values(x.theme.colors).map(v=>`<span style="background:${v};border:1px solid #8883"></span>`).join('')}</div><div class="theme-card"><h2>${esc(x.theme.name)}</h2><p class="muted">${x.theme.font==='serif'?'Klassisk':'Enkel'} typografi · ${x.theme.radius}px hjørner</p><button class="secondary" data-preview="${x.id}">Forhåndsvis</button><button data-activate="${x.id}">Aktivér</button>${themeDeleteMarkup(x)}</div></article>`).join('')}</div><div class="panel" style="margin-top:25px"><h2>Jeres egen designpakke</h2><p>En JSON-fil eller en ZIP med én fil: <code>theme.json</code>. Pakken styrer fire farver, skrifttype, hjørner og afstand. Admin kan skifte tilbage til standardtemaet når som helst.</p><button id="download-theme" class="secondary">↓ Hent eksempelpakke</button> <button id="cancel-preview" class="secondary">Gendan aktivt design</button><p class="muted" style="margin-top:15px">Forhåndsvisning gælder kun denne side, indtil du aktiverer temaet.</p></div>`;bindThemeDelete();document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{applyTheme(themes.find(t=>t.id===b.dataset.preview).theme);toast('Forhåndsvisning · ikke aktiveret')});document.querySelectorAll('[data-activate]').forEach(b=>b.onclick=async()=>{try{await api('/admin/themes/'+b.dataset.activate+'/activate','POST');applyTheme(await api('/theme'));toast('Designet er aktiveret for alle')}catch(e){toast(e.message)}});$('#cancel-preview').onclick=async()=>applyTheme(await api('/theme'));$('#theme-upload').onclick=()=>$('#theme-file').click();$('#theme-file').onchange=async e=>{if(!e.target.files[0])return;const f=new FormData();f.append('file',e.target.files[0]);try{await api('/admin/themes','POST',f);await designView();toast('Designpakke installeret. Klar til forhåndsvisning.')}catch(err){toast(err.message)}};$('#download-theme').onclick=()=>{const blob=new Blob([JSON.stringify(themes[0].theme,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='theme.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}
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

M.addEventListener('keydown',photoViewerKeydown);
M.addEventListener('cancel',()=>{cancelGalleryDeleteConfirmation();photoViewerGeneration++;photoViewerNavigation=null});
M.addEventListener('close',()=>{if(M.open)return;photoViewerGeneration++;photoViewerNavigation=null;stopPhotoVideo();removeUnselectedFavorites();if(privateAccountDialog){M.innerHTML='';privateAccountDialog=false}});
init();
