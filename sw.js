/* ARIZA SAT: guarda la app en el móvil para que abra rápido y sin cobertura.

   EL NOMBRE DE LA CACHÉ LLEVA LA VERSIÓN DENTRO, Y NO ES UN DETALLE.
   Hasta el 15-10-2026 se llamaba 'ariza-sat-v3' y no cambiaba nunca. Como el
   paso de activación solo borra las cachés con OTRO nombre, la caché vieja no se
   tiraba jamás: se quedaba ahí hasta que una recarga la pisara, y si una fallaba
   o el aparato reabría la aplicación sin recargar, seguía sirviendo una versión
   de hace semanas. David perdió dos ratos por esto, buscando en la aplicación
   cosas que estaban publicadas pero que su aparato no tenía.

   Ahora cada entrega estrena caché y la anterior se borra sola al activarse.

   LA VERSIÓN DE AQUÍ TIENE QUE SER LA MISMA QUE LA DE index.html. El banco de
   pruebas lo comprueba y se pone en rojo si se despistan: si no coincidieran,
   la caché no se renovaría al entregar y volveríamos al mismo problema. */
const VERSION = '2026.10.21-3';
const CACHE = 'ariza-sat-' + VERSION;
const SHELL = ['./index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  /* Se borra TODA caché que no sea la de esta versión. Con el nombre fijo de
     antes, esta línea no borraba nunca nada. */
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

/* La comprobación de versión nueva pide /index.html?v=<marca de tiempo>. Esa URL
   cambia en cada comprobación: si se guardara, la caché crecería sin parar con
   copias enteras de la aplicación. Nunca se guarda. */
const esComprobacionDeVersion = url =>
  url.origin === location.origin && url.search && /(^|\/)index\.html$/.test(url.pathname);

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;            // datos y fotos: siempre en directo
  if (esComprobacionDeVersion(url)) return;                    // siempre a la red, nunca a la caché
  if (req.mode === 'navigate') {
    // Siempre pide la versión nueva al servidor, saltándose la caché del navegador.
    e.respondWith(fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
      .then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put('./index.html', c)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com' || url.hostname.startsWith('fonts.')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
      return r;
    })));
  }
});
