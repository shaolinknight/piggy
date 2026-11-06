// Piggy service worker: opens instantly and works offline.
// The app page comes from the phone's copy first; a fresh copy is fetched in the background
// and used next time (the app reloads itself when one arrives right after opening). Calls to your
// Google Sheet are never cached — the app keeps its own queue and syncs when you're back online.
//
// Hosts like Cloudflare redirect "/index.html" to "/". Safari refuses to show a page that a service
// worker answers with a redirected response, so the page is always fetched as "./" and every copy
// is re-made as a plain response before it is stored or served.
var CACHE = 'piggy-shell-4';
var PAGE = './';
var FILES = ['./manifest.webmanifest', './icon-192.png', './icon-512.png'];

// a copy of a response with no redirect history, safe to hand to the browser
function clean(res) {
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then(function (b) {
    return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}
function getPage() {
  return fetch(PAGE, { cache: 'no-cache' }).then(clean);
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    var page = getPage().then(function (res) { if (res && res.ok) return c.put(PAGE, res); });
    var rest = Promise.all(FILES.map(function (f) {
      return fetch(f, { cache: 'no-cache' }).then(clean).then(function (res) { if (res && res.ok) return c.put(f, res); }).catch(function () {});
    }));
    return Promise.all([page, rest]);
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf('piggy-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function tell(msg) { self.clients.matchAll().then(function (cs) { cs.forEach(function (c) { c.postMessage(msg); }); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;          // your sheet: always live
  if (/\/script\.txt$/.test(url.pathname)) return;                                // the script people copy: always the latest

  // the app page: stored copy now, fresh copy for next time
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(PAGE).then(function (hit) {
        if (hit && hit.redirected) hit = null;                                    // never serve an old redirected copy
        var oldText = hit ? hit.clone().text() : Promise.resolve('');
        var fresh = getPage().then(function (res) {
          if (!res || !res.ok) return res;
          return res.clone().text().then(function (txt) {
            return oldText.then(function (old) {
              if (txt === old) return res;
              return c.put(PAGE, new Response(txt, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).then(function () {
                if (hit) tell({ type: 'updated' });
                return res;
              });
            });
          });
        }).catch(function () { return hit || fetch(req); });
        if (hit) { e.waitUntil(fresh); return hit; }
        return fresh;
      });
    }).catch(function () { return fetch(req); }));
    return;
  }

  // fonts and the app's own files: stored copy first, refreshed in the background
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit && hit.redirected) hit = null;
        var net = fetch(req).then(clean).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        if (hit) { e.waitUntil(net); return hit; }
        return net;
      });
    }));
  }
});
