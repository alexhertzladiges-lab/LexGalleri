'use strict';

// Installation provides an app window, not an offline copy of family files.
// Deliberately no CacheStorage, IndexedDB, precaching or saved API responses.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function offlinePage(startPath) {
  const safePath=startPath.replace(/[&<>"']/g, character => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[character]));
  const page=`<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#416c57"><title>LexGalleri · Ingen forbindelse</title>
<style>body{margin:0;background:#f7f6f2;color:#263b34;font:16px/1.7 Arial,sans-serif}main{box-sizing:border-box;max-width:440px;margin:15vh auto;padding:28px}p{margin:0 0 28px}h1{font:38px Georgia,serif;margin:14px 0}a{display:inline-block;padding:12px 20px;border-radius:9px;background:#416c57;color:#fff;text-decoration:none}a:focus-visible{outline:3px solid #263b34;outline-offset:4px}.brand{font:24px Georgia,serif}</style></head>
<body><main><div class="brand">◈ LexGalleri</div><h1>Ingen forbindelse.</h1><p>Opret forbindelse til internettet for at åbne familiens private galleri.</p><a href="${safePath}">Prøv igen</a></main></body></html>`;
  return new Response(page, {status:503, headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'no-referrer',
  }});
}

self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET' || request.mode!=='navigate')return;
  const url=new URL(request.url), scope=new URL(self.registration.scope);
  // Only the app's document has an offline message. API, image, video and asset
  // requests use the browser's normal network path and retain authentication.
  if(url.origin!==scope.origin || url.pathname!==scope.pathname)return;
  event.respondWith(fetch(request).catch(() => offlinePage(scope.pathname)));
});
