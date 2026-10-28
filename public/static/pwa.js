'use strict';
// Installation is independent of the gallery dialog and its authenticated data.
(() => {
  const script=document.currentScript;
  if(!script || !window.isSecureContext || !('serviceWorker' in navigator))return;
  const base=new URL(script.src).pathname.replace(/\/static\/pwa\.js$/,'');
  const display=window.matchMedia('(display-mode: standalone)');
  let installPrompt=null,installed=false;
  const standalone=()=>installed || display.matches || navigator.standalone===true;
  const button=document.createElement('button');
  button.id='pwa-install';button.type='button';button.className='pwa-install secondary';button.textContent='Installér app';
  button.setAttribute('aria-haspopup','dialog');
  button.setAttribute('aria-controls','pwa-install-help');
  const help=document.createElement('dialog');help.id='pwa-install-help';help.className='pwa-install-help';
  help.setAttribute('aria-labelledby','pwa-install-title');
  const head=document.createElement('div');head.className='dialog-head';
  const heading=document.createElement('h2');heading.id='pwa-install-title';heading.textContent='LexGalleri på hjemmeskærmen';
  const close=document.createElement('button');close.type='button';close.className='secondary';close.textContent='✕';close.setAttribute('aria-label','Luk installationshjælp');close.onclick=()=>help.close();
  head.append(heading,close);
  const content=document.createElement('div');content.className='dialog-content';
  const paragraph=(label,text)=>{const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=label+' ';p.append(strong,document.createTextNode(text));return p;};
  content.append(
    paragraph('iPhone og iPad:','Åbn LexGalleri i Safari. Vælg Del → Føj til hjemmeskærm. Slå Åbn som webapp til, hvis valget vises, og tryk Tilføj.'),
    paragraph('Android:','Åbn LexGalleri i Chrome. Vælg browsermenuen → Installér app eller Føj til startskærm.'),
    paragraph('PC:','Brug installationsikonet i adresselinjen eller browsermenuen i Chrome eller Edge.'),
    paragraph('Når appen er installeret:','Åbn LexGalleri fra det nye ikon, og log ind. Billeder og videoer kræver internet.')
  );
  help.append(head,content);document.body.append(button,help);
  const update=()=>{button.hidden=standalone();if(button.hidden && help.open)help.close();};
  display.addEventListener?.('change',update);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;update();});
  window.addEventListener('appinstalled',()=>{installed=true;installPrompt=null;update();});
  button.addEventListener('click',async()=>{
    if(!installPrompt){if(!help.open)help.showModal();return;}
    const prompt=installPrompt;installPrompt=null;button.disabled=true;
    try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')installed=true;}
    catch{if(!help.open)help.showModal();}
    finally{button.disabled=false;update();}
  });
  update();
  // Register on a public path within this installation only. The worker never
  // stores account data or media and never forces a page/import to reload.
  navigator.serviceWorker.register(base+'/service-worker.js',{scope:base+'/',updateViaCache:'none'}).catch(()=>{
    // Manual Add to Home Screen remains available when a browser blocks workers.
  });
})();
