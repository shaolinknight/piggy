// Piggy's performance baseline. Runs every measurement N times (default 5), keeps the median, writes
// perf/baseline.json and prints a table.
//
//   node perf/run.js                       everything, 5 runs each (~15 min)
//   node perf/run.js --runs 1              a quick look
//   node perf/run.js --only weight,storage  some sections (weight, webkit, chromium, interactions, storage, lighthouse, install)
//   node perf/run.js --preview https://…   also run Lighthouse on a Cloudflare preview and read its response headers
//   node perf/run.js --out other.json      write somewhere else (to compare a branch against baseline.json)
//   node perf/run.js --site ../some/dir     measure a copy of the site instead of ../public
//
// "cold": a new browser profile — no service worker, nothing cached, only the sheet connection saved (no data yet),
//         so the app shows its skeleton until the sheet answers. (Truly empty storage means sample data, no sheet.)
// "warm": the service worker controls the page and the app's saved copy holds the full realistic sheet (~3,000 entries).
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var zlib = require('zlib');
var pw = require('playwright');
var server = require('../support/server');
var MockSheet = require('../support/mock-sheet').MockSheet;
var boot = require('../support/boot');
var instrument = require('./instrument');

var ARGS = parseArgs(process.argv.slice(2));
var RUNS = +ARGS.runs || 5;
var ONLY = ARGS.only ? ARGS.only.split(',') : null;
var OUT = path.resolve(__dirname, ARGS.out || 'baseline.json');
var SITE = ARGS.site ? path.resolve(ARGS.site) : path.join(__dirname, '..', '..', 'public');
var LATENCIES = [0, 1500, 4000];
var PULL_LATENCY = 1500;                    // the pull latency for the main startup numbers
var SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 1.6 * 1e6 / 8 * 0.9, uploadThroughput: 750 * 1e3 / 8 * 0.9 };   // DevTools' "Slow 4G"

function want(s) { return !ONLY || ONLY.indexOf(s) >= 0; }
function parseArgs(a) { var o = {}; for (var i = 0; i < a.length; i++) if (/^--/.test(a[i])) { o[a[i].slice(2)] = a[i + 1] && !/^--/.test(a[i + 1]) ? a[++i] : true; } return o; }
function median(xs) { xs = xs.filter(function (x) { return typeof x === 'number' && !isNaN(x); }).sort(function (a, b) { return a - b; }); if (!xs.length) return null; var m = xs.length >> 1; return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2; }
function pct(xs, p) { xs = xs.slice().sort(function (a, b) { return a - b; }); return xs.length ? xs[Math.min(xs.length - 1, Math.floor(p / 100 * xs.length))] : null; }
function r1(x) { return x == null ? null : Math.round(x * 10) / 10; }
function kb(n) { return n == null ? null : Math.round(n / 102.4) / 10; }
function log(s) { process.stdout.write(s + '\n'); }
// median of every numeric field across runs (and keep the raw runs)
function summarize(runs) {
  var out = { median: {}, runs: runs };
  Object.keys(runs[0] || {}).forEach(function (k) { if (typeof runs[0][k] === 'number' || runs[0][k] === null) out.median[k] = r1(median(runs.map(function (r) { return r[k]; }))); });
  return out;
}

// ---- the perf server adds three timing marks around the app's inline script (in its own copy; the app is untouched)
function marks(p, buf) {
  if (p !== '/index.html') return buf;
  var s = buf.toString();
  var a = s.replace("<script>\n(function () {\n'use strict';\n", "<script>performance.mark('js:before')</script>\n<script>\n(function () {\n'use strict';\nperformance.mark('js:start');\n");
  var b = a.replace('\nboot();\n})();', "\nperformance.mark('js:end');\nboot();\n})();");
  if (a === s || b === a) log('  ! could not place the script timing marks (the page layout changed); parse/exec times will be missing');
  return b;
}

// ---- one page load, measured
// done when the sheet's answer has been used: redrawn, or (2.49+, nothing changed) just saved
function untilFresh(page) {
  return page.waitForFunction(function () {
    var T = window.__perf, p = T && T.fetch.filter(function (f) { return f.action === 'pull'; })[0];
    return p && p.json && (T.view.some(function (v) { return v.at > p.json; }) || T.setItems.some(function (s) { return s.at > p.json; }));
  }, null, { timeout: 90000 }).then(function () { return page.waitForTimeout(400); });
}
async function collect(page) {
  var d = await page.evaluate(function () {
    var m = {}; performance.getEntriesByType('mark').forEach(function (e) { m[e.name] = e.startTime; });
    var paint = {}; performance.getEntriesByType('paint').forEach(function (e) { paint[e.name] = e.startTime; });
    var nav = performance.getEntriesByType('navigation')[0] || {};
    return { T: window.__perf, marks: m, paint: paint, nav: { responseEnd: nav.responseEnd, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, workerStart: nav.workerStart, transferSize: nav.transferSize },
      controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller) };
  });
  var T = d.T, first = T.view[0] || {}, p = T.fetch.filter(function (f) { return f.action === 'pull'; })[0] || {};
  var fresh = T.view.filter(function (v) { return p.json && v.at > p.json; })[0] || {};
  var done = T.setItems.filter(function (s) { return p.json && s.at > p.json; })[0] || {};
  if (fresh.at == null && done.at != null) fresh = { at: done.at, same: true };     // nothing changed: the screen was already right
  var lt = T.longtasks.filter(function (t) { return t.at < (fresh.at || Infinity) + 100; });
  return {
    controlled: d.controlled ? 1 : 0,
    htmlReceived: d.nav.responseEnd,
    firstPaint: d.paint['first-paint'] != null ? d.paint['first-paint'] : d.paint['first-contentful-paint'],
    firstContentfulPaint: d.paint['first-contentful-paint'],
    scriptParse: d.marks['js:start'] != null ? d.marks['js:start'] - d.marks['js:before'] : null,
    scriptExec: d.marks['js:end'] != null ? d.marks['js:end'] - d.marks['js:start'] : null,
    bootStart: T.getItem,
    firstRender: first.at,
    bootToFirstRender: first.at != null && T.getItem != null ? first.at - T.getItem : null,
    skeleton: first.skel ? 1 : 0,
    heroInDom: T.hero,
    pullSent: p.start, pullAnswered: p.headers, pullParsed: p.json,
    freshRender: fresh.at,
    renderToFresh: fresh.at != null && first.at != null ? fresh.at - first.at : null,
    pullToFreshJs: fresh.at != null && p.json != null ? fresh.at - p.json : null,       // apply the pull, save, render
    redrawn: fresh.at != null && !fresh.same ? 1 : 0,
    saves: T.setItems.length, saveMsMax: T.setItems.length ? Math.max.apply(null, T.setItems.map(function (s) { return s.ms; })) : null,
    longTasks: lt.length, longTaskMs: lt.reduce(function (s, t) { return s + t.ms; }, 0), longTaskMax: lt.length ? Math.max.apply(null, lt.map(function (t) { return t.ms; })) : 0
  };
}

async function newContext(browser, o) {
  var ctx = await browser.newContext(boot.contextOptions({ serviceWorkers: 'allow', phone: 'pro' }));
  if (o && o.blockFonts) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, function (r) { return r.abort(); });
  return ctx;
}
async function newPage(ctx, o) {
  var page = await ctx.newPage();
  await boot.prepare(page, { clock: false, state: o.state });
  await page.addInitScript(instrument, { today: boot.TODAY });
  if (o.throttle) {
    var cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    page.__cdp = cdp;
  }
  page.on('pageerror', function (e) { log('  ! page error: ' + e.message); });
  return page;
}

// cold: a new profile for every run
async function coldRuns(browser, site, mock, o) {
  var out = [];
  for (var i = 0; i < RUNS; i++) {
    mock.latency = { pull: PULL_LATENCY };
    var ctx = await newContext(browser, o);
    var page = await newPage(ctx, { state: boot.connectedState({ url: mock.url }), throttle: o.throttle });
    await page.goto(site.url);
    await untilFresh(page);
    out.push(await collect(page));
    await ctx.close();
  }
  return summarize(out);
}

// warm: one profile, installed and synced, then reopened; the first reopen of each batch is a warm-up
async function warmRuns(browser, site, mock, o) {
  var ctx = await newContext(browser, o);
  var page = await newPage(ctx, { state: boot.connectedState({ url: mock.url }), throttle: o.throttle });
  mock.latency = 0;
  await page.goto(site.url);
  await untilFresh(page);
  await page.waitForFunction(function () { return !!navigator.serviceWorker.controller; }, null, { timeout: 30000 });
  var res = {};
  for (var li = 0; li < LATENCIES.length; li++) {
    mock.latency = { pull: LATENCIES[li] };
    var runs = [];
    for (var i = 0; i <= RUNS; i++) {
      await page.reload();
      await untilFresh(page);
      if (i) runs.push(await collect(page));
    }
    res['pull' + LATENCIES[li]] = summarize(runs);
  }
  return { ctx: ctx, page: page, byLatency: res };
}

// ---- interactions, on a warm page
async function watch(page, kind, arg) {
  // started before the tap; resolves with when the finger went down, when the result first showed, and when it settled
  return page.evaluate(function (a) {
    var T = window.__perf, n0 = T.down.length, t0 = performance.now();
    function shown() {
      if (a.kind === 'sheet') { var s = document.getElementById('sheet'); return s.classList.contains('on') && !!document.getElementById('txform'); }
      if (a.kind === 'tab') return document.getElementById('view').getAttribute('data-v') === a.arg;
      if (a.kind === 'row') { var bs = document.querySelectorAll('#view button.tx'); for (var i = 0; i < bs.length; i++) if (bs[i].textContent.indexOf(a.arg) >= 0) return true; return false; }
      return false;
    }
    function moving() {
      return document.getAnimations().some(function (x) {
        var ct = x.effect && x.effect.getComputedTiming ? x.effect.getComputedTiming() : null;
        return x.playState === 'running' && ct && ct.endTime !== Infinity;
      });
    }
    return new Promise(function (res) {
      var down = null, show = null;
      (function tick() {
        var now = performance.now();
        if (now - t0 > 8000) return res({ down: down, shown: show, settled: null, timeout: true });
        if (down === null && T.down.length > n0) down = T.down[n0];
        if (down !== null && show === null && shown()) show = now;
        if (show !== null && !moving()) return res({ down: down, shown: show, settled: now });
        requestAnimationFrame(tick);
      })();
    });
  }, { kind: kind, arg: arg });
}
// tap → shown / settled, or nothing if the watcher gave up (null - null would read as a misleading 0)
function span(r) { return { toShown: r.down != null && r.shown != null ? r.shown - r.down : null, toSettled: r.down != null && r.settled != null ? r.settled - r.down : null }; }
async function interactions(page) {
  var sheet = [], tab = [], save = [];
  await page.evaluate(function () { window.__runway.closeSheet(); });
  for (var i = 0; i <= RUNS; i++) {
    var w = watch(page, 'sheet');
    await page.tap('#fab');
    var r = await w;
    if (i) sheet.push(span(r));
    await page.evaluate(function () { window.__runway.closeSheet(); });
    await page.waitForTimeout(700);
  }
  for (i = 0; i <= RUNS; i++) {
    await page.tap('.tab[data-v="month"]'); await page.waitForTimeout(700);
    w = watch(page, 'tab', 'activity');
    await page.tap('.tab[data-v="activity"]');
    r = await w;
    if (i) tab.push(span(r));
  }
  await page.waitForTimeout(700);
  for (i = 0; i <= RUNS; i++) {
    var vendor = 'Perf Save ' + i + '-' + Date.now() % 1000;
    await page.tap('#fab');
    await page.waitForSelector('#sheet #txform');
    await page.waitForTimeout(600);
    await page.fill('#f_a', String(1 + i + 0.01 * i));
    await page.fill('#f_v', vendor);
    await page.tap('#f_quick button >> nth=0');
    w = watch(page, 'row', vendor);
    await page.tap('#f_save');
    r = await w;
    if (i) save.push(span(r));
    await page.waitForTimeout(900);
  }
  var scroll = await page.evaluate(function () {
    var R = window.__runway;
    R.UI.tab = 'activity'; R.UI.lim = 100000; R.UI.q = '';
    window.scrollTo(0, 0);
    var t0 = performance.now(); R.render(); var renderMs = performance.now() - t0;
    var rows = document.querySelectorAll('#view button.tx').length;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    return new Promise(function (res) {
      // let the render settle, then scroll at a steady 3,000 px/s for 2 s and record every frame
      setTimeout(function () {
        var start = null, last = null, frames = [];
        (function step(ts) {
          if (start === null) { start = ts; last = ts; }
          else { frames.push(ts - last); last = ts; }
          var el = ts - start;
          window.scrollTo(0, Math.min(max, el * 3));
          if (el < 2000) requestAnimationFrame(step);
          else res({ renderMs: renderMs, rows: rows, scrollable: max, frames: frames });
        })(performance.now());
      }, 1000);
    });
  });
  var fr = scroll.frames;
  return {
    openAddSheet: summarize(sheet), monthToActivity: summarize(tab), saveToRow: summarize(save),
    activityScroll: { rows: scroll.rows, renderAllRowsMs: r1(scroll.renderMs), scrollablePx: scroll.scrollable, frames: fr.length,
      fps: r1(fr.length / (fr.reduce(function (a, b) { return a + b; }, 0) / 1000)), p50: r1(pct(fr, 50)), p95: r1(pct(fr, 95)), max: r1(Math.max.apply(null, fr)),
      over25ms: fr.filter(function (x) { return x > 25; }).length, over50ms: fr.filter(function (x) { return x > 50; }).length }
  };
}

// ---- storage: the saved copy's size, and what reading/writing it costs (localStorage today vs IndexedDB)
async function storage(page) {
  return page.evaluate(function (runs) {
    function med(f, n) { var xs = []; for (var i = 0; i < n; i++) { var t = performance.now(); f(); xs.push(performance.now() - t); } xs.sort(function (a, b) { return a - b; }); return xs[n >> 1]; }
    var raw = localStorage.getItem('runway.v1'), obj = JSON.parse(raw);
    var out = {
      chars: raw.length, utf8Bytes: new Blob([raw]).size, entries: obj.tx.length,
      pctOf5MB_utf16: Math.round(raw.length * 2 / (5 * 1024 * 1024) * 1000) / 10,
      pctOf5MB_chars: Math.round(raw.length / (5 * 1024 * 1024) * 1000) / 10,
      parseMs: med(function () { JSON.parse(raw); }, runs * 4),
      stringifyMs: med(function () { JSON.stringify(obj); }, runs * 4),
      getItemMs: med(function () { localStorage.getItem('runway.v1'); }, runs * 4),
      saveMs: med(function () { window.__runway.save(); }, runs * 4)
    };
    // biggest parts of the saved copy
    var parts = Object.keys(obj).map(function (k) { return [k, JSON.stringify(obj[k] === undefined ? null : obj[k]).length]; }).sort(function (a, b) { return b[1] - a[1]; });
    out.biggest = parts.slice(0, 6).map(function (p) { return p[0] + ' ' + Math.round(p[1] / 1024) + ' KB'; });
    out.txOriginalCopyKB = Math.round(JSON.stringify(obj.tx.map(function (t) { return t.o; })).length / 1024);
    return new Promise(function (res) {
      var rq = indexedDB.open('perf-test', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('s'); };
      rq.onsuccess = function () {
        var db = rq.result, put = [], get = [], i = 0;
        (function one() {
          if (i >= runs + 1) { db.close(); indexedDB.deleteDatabase('perf-test'); out.idbPutObjectMs = put.sort(function (a, b) { return a - b; })[put.length >> 1]; out.idbGetObjectMs = get.sort(function (a, b) { return a - b; })[get.length >> 1]; return res(out); }
          var t0 = performance.now(), tx = db.transaction('s', 'readwrite');
          tx.objectStore('s').put(obj, 'state');
          tx.oncomplete = function () {
            var t1 = performance.now(), r2 = db.transaction('s').objectStore('s').get('state');
            r2.onsuccess = function () { if (i) { put.push(t1 - t0); get.push(performance.now() - t1); } i++; one(); };
          };
        })();
      };
    });
  }, RUNS);
}

// ---- page weight: what the page is made of, and what the browser actually downloaded on a cold open
function weight() {
  var html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  function sizes(s) { var b = Buffer.from(s); return { raw: b.length, gzip: zlib.gzipSync(b, { level: 6 }).length, brotli: zlib.brotliCompressSync(b).length, brotliQ4: zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }).length }; }
  var b64 = (html.match(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g) || []).join('');
  var css = (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('');
  var js = (html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) || []).join('');
  var b64InCss = (css.match(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g) || []).join('').length;
  var b64InJs = (js.match(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g) || []).join('').length;
  var out = { indexHtml: sizes(html), js: sizes(js), css: sizes(css), base64: sizes(b64), base64InCss: b64InCss, base64InJs: b64InJs,
    markupAndRest: html.length - js.length - css.length - (b64.length - b64InCss - b64InJs),
    lines: html.split('\n').length };
  ['sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'script.txt'].forEach(function (f) {
    var p = path.join(SITE, f); if (fs.existsSync(p)) out[f] = fs.statSync(p).size;
  });
  return out;
}
async function networkCold(browser, site) {
  var ctx = await newContext(browser, {}), page = await ctx.newPage(), list = [];
  await boot.prepare(page, { clock: false });
  page.on('requestfinished', function (rq) {
    rq.sizes().then(function (s) { list.push({ url: rq.url().replace(site.url, '/').slice(0, 110), type: rq.resourceType(), transfer: s.responseBodySize, headers: s.responseHeadersSize }); }).catch(function () {});
  });
  await page.goto(site.url);
  await page.waitForTimeout(3000);
  var resps = list.slice();
  await ctx.close();
  var fonts = resps.filter(function (x) { return /fonts\./.test(x.url); });
  return { requests: resps, fontCss: fonts.filter(function (x) { return /googleapis/.test(x.url); }).reduce(function (s, x) { return s + x.transfer; }, 0),
    fontFiles: fonts.filter(function (x) { return /gstatic/.test(x.url); }).length,
    fontFileBytes: fonts.filter(function (x) { return /gstatic/.test(x.url); }).reduce(function (s, x) { return s + x.transfer; }, 0),
    totalTransfer: resps.reduce(function (s, x) { return s + (x.transfer || 0); }, 0) };
}

// ---- installability, checked by hand (the PWA category is gone from Lighthouse)
async function installability(site) {
  var browser = await pw.chromium.launch();
  var ctx = await browser.newContext(boot.contextOptions({ serviceWorkers: 'allow' })), page = await ctx.newPage();
  await boot.prepare(page, { clock: false });
  await page.goto(site.url);
  await page.waitForFunction(function () { return !!navigator.serviceWorker.controller; }, null, { timeout: 30000 }).catch(function () {});
  var head = await page.evaluate(function () {
    function attr(sel, a) { var e = document.querySelector(sel); return e ? e.getAttribute(a) : null; }
    return { manifestHref: attr('link[rel="manifest"]', 'href'), appleTouchIcon: attr('link[rel="apple-touch-icon"]', 'href'),
      appleCapable: attr('meta[name="apple-mobile-web-app-capable"]', 'content'), mobileCapable: attr('meta[name="mobile-web-app-capable"]', 'content'),
      statusBar: attr('meta[name="apple-mobile-web-app-status-bar-style"]', 'content'), appleTitle: attr('meta[name="apple-mobile-web-app-title"]', 'content'),
      themeColor: Array.prototype.map.call(document.querySelectorAll('meta[name="theme-color"]'), function (m) { return (m.getAttribute('media') || 'all') + ' ' + m.getAttribute('content'); }),
      viewport: attr('meta[name="viewport"]', 'content'), swControls: !!navigator.serviceWorker.controller };
    }).then(function (h) {
      if (h.appleTouchIcon && /^data:/.test(h.appleTouchIcon)) h.appleTouchIcon = 'inline ' + h.appleTouchIcon.slice(0, 22) + '… (' + h.appleTouchIcon.length + ' chars)';
      return h;
  });
  var manifest = null;
  if (head.manifestHref) manifest = await page.evaluate(function (h) { return fetch(h).then(function (r) { return r.json(); }); }, head.manifestHref).catch(function () { return null; });
  var cdp = await ctx.newCDPSession(page), errs = [];
  try { errs = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.map(function (e) { return e.errorId; }); } catch (e) { errs = ['(not available: ' + e.message + ')']; }
  await site.close();                             // the site can't be reached at all: does it still open?
  var offline = false;
  try { await page.reload({ timeout: 15000 }); offline = await page.locator('#view .card.hero').isVisible(); } catch (e) { offline = false; }
  await browser.close();
  return { head: head, manifest: manifest && { display: manifest.display, start_url: manifest.start_url, scope: manifest.scope, icons: (manifest.icons || []).map(function (i) { return i.sizes + (i.purpose ? ' ' + i.purpose : ''); }), theme_color: manifest.theme_color },
    chromiumInstallabilityErrors: errs, worksOffline: offline };
}

// ---- Lighthouse (Chromium, mobile preset)
async function lighthouse(url, runs) {
  var lh = (await import('lighthouse')).default, launcher = await import('chrome-launcher');
  var out = [];
  for (var i = 0; i < runs; i++) {
    var chrome = await launcher.launch({ chromePath: pw.chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
    try {
      var r = await lh(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices'] });
      var a = r.lhr.audits, c = r.lhr.categories;
      out.push({ performance: c.performance.score * 100, accessibility: c.accessibility.score * 100, bestPractices: c['best-practices'].score * 100,
        fcp: a['first-contentful-paint'].numericValue, lcp: a['largest-contentful-paint'].numericValue, tbt: a['total-blocking-time'].numericValue,
        cls: a['cumulative-layout-shift'].numericValue, speedIndex: a['speed-index'].numericValue,
        renderBlocking: ((a['render-blocking-insight'] || a['render-blocking-resources'] || {}).details || {}).items ? ((a['render-blocking-insight'] || a['render-blocking-resources']).details.items.map(function (x) { return String(x.url).slice(0, 80); }).join(' | ')) : '' });
      if (!i) out.failing = Object.keys(a).filter(function (k) { return a[k].score !== null && a[k].score < 0.9 && a[k].scoreDisplayMode !== 'informative' && a[k].scoreDisplayMode !== 'notApplicable'; }).map(function (k) { return k + (a[k].displayValue ? ' (' + a[k].displayValue + ')' : ''); });
    } finally { await chrome.kill(); }
  }
  var s = summarize(out); s.failingAudits = out.failing; s.renderBlocking = out[0] && out[0].renderBlocking;
  return s;
}

async function previewHeaders(url) {
  var res = await fetch(url, { headers: { 'Accept-Encoding': 'br, gzip', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } });
  var h = {}; ['content-encoding', 'content-type', 'cache-control', 'etag', 'content-length', 'cf-cache-status', 'server'].forEach(function (k) { h[k] = res.headers.get(k); });
  var sw = await fetch(new URL('sw.js', url), { headers: { 'Accept-Encoding': 'br, gzip' } });
  return { status: res.status, headers: h, swCacheControl: sw.headers.get('cache-control') };
}

// ---- run everything
async function main() {
  var site = await server.start({ dir: SITE, transform: marks });
  for (var enc of ['br', 'gzip']) await fetch(site.url, { headers: { 'Accept-Encoding': enc } }).then(function (r) { return r.arrayBuffer(); });   // compress once up front
  var mock = new MockSheet(); await mock.listen();
  var result = { meta: { at: new Date().toISOString(), runs: RUNS, rows: mock.rows(), pullJsonKB: kb(JSON.stringify(mock.pullPayload()).length),
    machine: os.cpus()[0].model + ' × ' + os.cpus().length + ', ' + Math.round(os.totalmem() / 1e9) + ' GB, ' + os.platform(),
    playwright: require('playwright/package.json').version } };
  try {
    if (want('weight')) {
      log('page weight…');
      result.weight = weight();
      var wk = await pw.webkit.launch();
      result.weight.networkColdWebKit = await networkCold(wk, site);
      await wk.close();
    }
    var engines = [['webkit', {}], ['chromium', { throttle: true }]];
    for (var e = 0; e < engines.length; e++) {
      var name = engines[e][0], o = engines[e][1];
      if (!want(name) && !(want('interactions') || want('storage'))) continue;
      var browser = await pw[name].launch();
      result.meta[name] = browser.version();
      var R = result[name] = {};
      if (want(name)) {
        log(name + ': cold opens…');
        R.cold = await coldRuns(browser, site, mock, o);
        log(name + ': cold opens with Google Fonts blocked…');
        R.coldNoFonts = await coldRuns(browser, site, mock, Object.assign({ blockFonts: true }, o));
      }
      log(name + ': warm opens…');
      var warm = await warmRuns(browser, site, mock, o);
      if (want(name)) R.warm = warm.byLatency;
      mock.latency = 0;
      if (want('interactions')) { log(name + ': interactions…'); R.interactions = await interactions(warm.page); }
      if (want('storage')) { log(name + ': storage…'); R.storage = await storage(warm.page); }
      await warm.ctx.close();
      await browser.close();
    }
    if (want('storage')) {
      log('storage at twice the data (2017 to now, ~6,000 entries)…');
      var big = new MockSheet({ from: 2017 }); await big.listen();
      var b2 = await pw.webkit.launch(), ctx2 = await newContext(b2, {}), p2 = await newPage(ctx2, { state: boot.connectedState({ url: big.url }) });
      await p2.goto(site.url); await untilFresh(p2);
      result.webkit.storage2x = await storage(p2);
      result.webkit.storage2x.pullJsonKB = kb(JSON.stringify(big.pullPayload()).length);
      await b2.close(); await big.close();
    }
    if (want('lighthouse')) {
      log('lighthouse (local)…');
      result.lighthouse = { local: await lighthouse(site.url, RUNS) };
      if (ARGS.preview) { log('lighthouse (preview)…'); result.lighthouse.preview = await lighthouse(ARGS.preview, RUNS); }
    }
    if (ARGS.preview) result.previewHeaders = await previewHeaders(ARGS.preview).catch(function (err) { return { error: String(err.message || err) }; });
    if (want('install')) { log('installability…'); result.install = await installability(await server.start({ dir: SITE })); }
  } finally {
    await mock.close();
    await site.close().catch(function () {});
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  require('./table')(result);
  log('\nwrote ' + path.relative(process.cwd(), OUT));
}

main().catch(function (e) { console.error(e); process.exit(1); });
