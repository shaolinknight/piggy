// Piggy service worker: opens instantly and works offline.
// The app page comes from the phone's copy first; a fresh copy is fetched in the background
// and used next time (the app offers "Reload" when one arrives). Calls to your Google Sheet are
// never cached — the app keeps its own queue and syncs when you're back online.
var CACHE = 'piggy-shell-1';
var SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
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

  // the app page: cached copy now, fresh copy for next time
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match('./index.html').then(function (hit) {
        var oldText = hit ? hit.clone().text() : Promise.resolve('');      // read before the page uses the copy
        var fresh = fetch('./index.html', { cache: 'no-cache' }).then(function (res) {
          if (!res || !res.ok) return res;
          var copy = res.clone();
          return copy.text().then(function (txt) {
            return oldText.then(function (old) {
              if (txt !== old) {
                return c.put('./index.html', new Response(txt, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).then(function () {
                  if (hit) tell({ type: 'updated' });
                  return res;
                });
              }
              return res;
            });
          });
        }).catch(function () { return hit; });
        if (hit) { e.waitUntil(fresh); return hit; }
        return fresh;
      });
    }));
    return;
  }

  // fonts and the app's own files: cached copy first, refreshed in the background
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
        if (hit) { e.waitUntil(net); return hit; }
        return net;
      });
    }));
  }
});
