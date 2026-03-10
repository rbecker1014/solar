const CACHE='solar-pwa-v4';
const CORE_PATHS=[
  'index.html','app.core.js','pwa-install.js',
  'dist/output.css','chatbot.html',
  'tabs/kpi.js','tabs/charts.js','tabs/data.js','tabs/record.js','tabs/settings.js',
  'tabs/date-range.js','tabs/daily-data-store.js','tabs/cloud-config.js',
  'tabs/UserFriendlyFeedback.js',
  'icons/icon-192.png','icons/icon-512.png','manifest.webmanifest'
];
const CDN_URLS=[
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];
const BASE_PATH=self.location.pathname.replace(/service-worker\.js$/, '');
const CORE=CORE_PATHS.map(path=>new URL(`${BASE_PATH}${path}`, self.location.origin).toString());
const ALL_PRECACHE=[...CORE, ...CDN_URLS];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ALL_PRECACHE)));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(names=>
      Promise.all(names.filter(n=>n!==CACHE).map(n=>caches.delete(n)))
    ).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const networkFetch = fetch(e.request).then(resp=>{
        if(resp.ok){
          const copy=resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy));
        }
        return resp;
      }).catch(()=>cached);
      return cached || networkFetch;
    })
  );
});
