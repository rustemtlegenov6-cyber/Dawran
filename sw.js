const C='ms3d-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;
 e.respondWith(fetch(r).then(x=>{if(x.ok&&(r.url.includes('three.min.js')||new URL(r.url).origin===location.origin)){const y=x.clone();caches.open(C).then(c=>c.put(r,y));}return x;}).catch(()=>caches.match(r)));});
