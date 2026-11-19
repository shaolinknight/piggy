// What moves, and how, during everyday interactions. For each one it records every property that animates (CSS
// transitions, CSS animations and element.animate()) and flags any that isn't transform or opacity: those make the
// browser redo layout or repaint on every frame, which is what stutters on a phone. In Chromium (4× slower CPU) it
// also records frame times and long animation frames.
//
//   node perf/motion.js [--out perf/out/motion.json] [--site ../some/copy/of/public] [--runs 5]
'use strict';
var fs = require('fs');
var path = require('path');
var pw = require('playwright');
var server = require('../support/server');
var MockSheet = require('../support/mock-sheet').MockSheet;
var boot = require('../support/boot');

function arg(k, d) { var i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; }
var OUT = path.resolve(__dirname, arg('out', 'out/motion.json'));
var SITE = arg('site') ? path.resolve(arg('site')) : undefined;
var RUNS = +arg('runs', 1);
var CHEAP = { transform: 1, opacity: 1, translate: 1, scale: 1, rotate: 1, visibility: 1, offset: 1, easing: 1, composite: 1 };

// in the page: note every property that starts animating, and every frame's length
function probe() {
  // recording from the very start when asked (to catch what the first render animates)
  var P = window.__motion = { list: [], frames: [], loaf: [], recording: sessionStorage.getItem('__motionRec') === '1' };
  sessionStorage.removeItem('__motionRec');
  function who(el) {
    if (!el || !el.tagName) return '?';
    var id = el.id ? '#' + el.id : '', c = el.classList && el.classList.length ? '.' + Array.prototype.slice.call(el.classList, 0, 2).join('.') : '';
    return (el.tagName.toLowerCase() + id + c).slice(0, 40);
  }
  function add(kind, el, props) { if (P.recording) props.forEach(function (p) { P.list.push({ kind: kind, el: who(el), prop: p }); }); }
  document.addEventListener('transitionrun', function (e) { add('css-transition', e.target, [e.propertyName]); }, true);
  document.addEventListener('animationstart', function (e) {
    var props = [];
    try {
      // document-wide, so an animation on a ::before / ::after layer is found too
      document.getAnimations().forEach(function (a) {
        if (a.animationName !== e.animationName || !a.effect || a.effect.target !== e.target) return;
        a.effect.getKeyframes().forEach(function (k) { Object.keys(k).forEach(function (p) { if (props.indexOf(p) < 0 && !/^(offset|easing|composite|computedOffset)$/.test(p)) props.push(p); }); });
      });
    } catch (x) {}
    add('css-animation ' + e.animationName + (e.pseudoElement ? ' ' + e.pseudoElement : ''), e.target, props.length ? props : ['?']);
  }, true);
  var anim = Element.prototype.animate;
  Element.prototype.animate = function (kf) {
    var props = [];
    (Array.isArray(kf) ? kf : [kf]).forEach(function (k) { Object.keys(k || {}).forEach(function (p) { if (props.indexOf(p) < 0 && !/^(offset|easing|composite)$/.test(p)) props.push(p); }); });
    add('animate()', this, props);
    return anim.apply(this, arguments);
  };
  var last = null;
  (function tick(t) { if (P.recording && last !== null) P.frames.push(t - last); last = t; requestAnimationFrame(tick); })(performance.now());
  try { new PerformanceObserver(function (l) { if (P.recording) l.getEntries().forEach(function (e) { P.loaf.push(e.duration); }); }).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) {}
}

var STEPS = [
  ['Open the app (warm)', null],
  ['Open a Month group', async function (page) { await page.locator('#view [data-act="mgrp"]').first().tap(); }],
  ['Tab: Month → Activity', async function (page) { await page.tap('.tab[data-v="activity"]'); }],
  ['Tap an entry (edit form opens)', async function (page) { await page.locator('#view button.tx[data-act="edit"]').first().tap(); }],
  ['Close the edit form', async function (page) { await page.locator('#view [data-act="fcancel"]').first().tap(); }],
  ['Tap + (New entry sheet)', async function (page) { await page.tap('#fab'); }],
  ['Save a new entry (row appears)', async function (page) {
    await page.fill('#f_a', '3.21'); await page.fill('#f_v', 'Motion Probe');
    await page.tap('#f_quick button >> nth=0');
    await page.evaluate(function () { window.__motion.list = []; window.__motion.frames = []; window.__motion.loaf = []; });
    await page.tap('#f_save');
  }],
  ['Tab: Activity → Plan', async function (page) { await page.tap('.tab[data-v="plan"]'); }],
  ['Tab: Plan → Trends', async function (page) { await page.tap('.tab[data-v="trends"]'); }]
];

async function run(browserName) {
  var browser = await pw[browserName].launch(), site = await server.start({ dir: SITE });
  var ctx = await browser.newContext(boot.contextOptions({ phone: 'pro' }));
  var mock = new MockSheet(); await mock.attach(ctx);
  var page = await ctx.newPage();
  if (browserName === 'chromium') { var cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
  await page.addInitScript(probe);
  await boot.boot(page, site.url, { state: boot.connectedState(), clock: false });
  await boot.synced(page);
  var out = [];
  for (var i = 0; i < STEPS.length; i++) {
    var s = STEPS[i];
    if (!s[1]) { await page.evaluate(function () { sessionStorage.setItem('__motionRec', '1'); }); await page.reload(); }
    else {
      await page.evaluate(function () { var P = window.__motion; P.list = []; P.frames = []; P.loaf = []; P.recording = true; });
      await s[1](page);
    }
    await page.waitForTimeout(1500);
    var r = await page.evaluate(function () { var P = window.__motion; P.recording = false; return { list: P.list, frames: P.frames, loaf: P.loaf }; });
    var props = {};
    r.list.forEach(function (x) { var k = x.prop + (CHEAP[x.prop] ? '' : ' ⚠'); props[k] = (props[k] || 0) + 1; });
    var heavy = r.list.filter(function (x) { return !CHEAP[x.prop]; });
    var fr = r.frames.slice().sort(function (a, b) { return a - b; });
    out.push({ step: s[0], animations: r.list.length, layoutOrPaint: heavy.length,
      heavy: heavy.map(function (x) { return x.prop + ' on ' + x.el + ' (' + x.kind + ')'; }).filter(function (v, k, a) { return a.indexOf(v) === k; }),
      props: props, frames: fr.length, p95: fr.length ? Math.round(fr[Math.floor(fr.length * 0.95)] * 10) / 10 : null,
      worst: fr.length ? Math.round(fr[fr.length - 1] * 10) / 10 : null, over25: fr.filter(function (x) { return x > 25; }).length,
      longFrames: r.loaf.length, longFrameMs: Math.round(r.loaf.reduce(function (a, b) { return a + b; }, 0)) });
  }
  await browser.close(); await site.close();
  return out;
}

// several runs: what animates is the same every time; frame times take the median across runs
async function runs(name) {
  var all = [];
  for (var i = 0; i < RUNS; i++) all.push(await run(name));
  if (RUNS === 1) return all[0];
  function med(xs) { xs = xs.slice().sort(function (a, b) { return a - b; }); return xs[xs.length >> 1]; }
  return all[0].map(function (step, k) {
    var o = Object.assign({}, step);
    ['p95', 'worst', 'over25', 'longFrames', 'longFrameMs'].forEach(function (f) { o[f] = med(all.map(function (r) { return r[k][f]; })); });
    return o;
  });
}

(async function () {
  var res = { at: new Date().toISOString(), runs: RUNS, webkit: await runs('webkit'), chromium4x: await runs('chromium') };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log('step'.padEnd(34) + 'anims  layout/paint  | Chromium 4×: p95  worst  >25ms  long frames');
  res.webkit.forEach(function (w, i) {
    var c = res.chromium4x[i];
    console.log(w.step.padEnd(34) + String(w.animations).padStart(5) + String(w.layoutOrPaint).padStart(14) + '  |' +
      String(c.p95).padStart(17) + String(c.worst).padStart(7) + String(c.over25).padStart(7) + String(c.longFrames + ' (' + c.longFrameMs + ' ms)').padStart(14));
  });
  console.log('\nlayout/paint animations (WebKit):');
  res.webkit.forEach(function (w) { if (w.heavy.length) console.log('  ' + w.step + ': ' + w.heavy.join('; ')); });
  console.log('\nwrote ' + path.relative(process.cwd(), OUT));
})().catch(function (e) { console.error(e); process.exit(1); });
