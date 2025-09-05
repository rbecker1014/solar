const CACHE='solar-pwa-v1';
const CORE=[
  '/index.html','/app.core.js',
  '/tabs/kpi.js','/tabs/charts.js','/tabs/data.js','/tabs/entry.js','/tabs/settings.js',
  '/icons/icon-192.png','/icons/icon-512.png','/manifest.webmanifest'
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));});
self.addEventListener('fetch',e=>{
  e.respondWith(
    caches.match(e.request).then(r=>r || fetch(e.request).then(resp=>{
      const copy=resp.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return resp;
    }).catch(()=>r))
  );
});