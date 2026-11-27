// 2.55: what a background picture and frosted glass cost while scrolling. Scrolls Month and Activity in Chromium at
// 4× slower CPU, with a plain background, a picture with glass, and a picture without, and records frame times.
// Headless Chromium draws without a graphics chip, so blur costs more here than on an iPhone: read it as a comparison.
//
//   node perf/glass.js [--out perf/out/glass.json] [--runs 3]
'use strict';
var fs = require('fs');
var path = require('path');
var pw = require('playwright');
var server = require('../support/server');
var MockSheet = require('../support/mock-sheet').MockSheet;
var boot = require('../support/boot');

function arg(k, d) { var i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; }
var OUT = path.resolve(__dirname, arg('out', 'out/glass.json'));
var RUNS = +arg('runs', 3);
var LOOKS = [['Plain', '', ''], ['New York, glass on', 'nyc', 'on'], ['New York, glass off', 'nyc', 'off'], ['Autumn, glass on', 'autumn', 'on']];

function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[Math.floor(s.length / 2)] : null; }

async function scrollRun(page) {
  return page.evaluate(function () {
    return new Promise(function (done) {
      var frames = [], last = null, y = 0, max = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo(0, 0);
      function tick(t) {
        if (last !== null) frames.push(t - last);
        last = t;
        y += 24;                                              // a steady flick: 24px a frame
        window.scrollTo(0, Math.min(y, max));
        if (y < Math.min(max, 3600)) requestAnimationFrame(tick); else done(frames);
      }
      requestAnimationFrame(tick);
    });
  });
}

async function one(look) {
  var browser = await pw.chromium.launch(), site = await server.start({});
  var ctx = await browser.newContext(boot.contextOptions({ phone: 'pro' }));
  var mock = new MockSheet(); await mock.attach(ctx);
  var page = await ctx.newPage();
  var cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await boot.boot(page, site.url, { state: boot.connectedState(), clock: false });
  await boot.synced(page);
  if (look[1]) {
    await page.evaluate(function (a) { var R = window.__runway; R.S.cfg.bg = a[0]; R.S.cfg.glass = a[1]; R.save(); }, [look[1], look[2]]);
    await page.reload(); await boot.synced(page, Date.now() - 60000);
  }
  await page.waitForTimeout(800);
  var out = {};
  out.month = await scrollRun(page);
  await page.tap('.tab[data-v="activity"]'); await page.waitForTimeout(900);
  out.activity = await scrollRun(page);
  await browser.close(); await site.close();
  return out;
}

(async function () {
  var res = [];
  for (var i = 0; i < LOOKS.length; i++) {
    var runs = [];
    for (var r = 0; r < RUNS; r++) runs.push(await one(LOOKS[i]));
    var row = { look: LOOKS[i][0] };
    ['month', 'activity'].forEach(function (k) {
      var p95 = runs.map(function (x) { var s = x[k].slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length * 0.95)]; });
      var slow = runs.map(function (x) { return x[k].filter(function (v) { return v > 25; }).length / x[k].length * 100; });
      row[k] = { p95: Math.round(median(p95) * 10) / 10, slowPct: Math.round(median(slow)) };
    });
    res.push(row);
    console.log(row.look.padEnd(22), 'Month p95', String(row.month.p95).padStart(5), 'ms', String(row.month.slowPct).padStart(3) + '% slow',
      ' | Activity p95', String(row.activity.p95).padStart(5), 'ms', String(row.activity.slowPct).padStart(3) + '% slow');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), runs: RUNS, looks: res }, null, 2));
  console.log('wrote ' + path.relative(process.cwd(), OUT));
})();
