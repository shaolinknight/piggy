// Before/after table of the main numbers: `node perf/compare.js perf/baseline.json perf/out/phase1.json`
'use strict';
var path = require('path');
var A = require(path.resolve(process.argv[2] || path.join(__dirname, 'baseline.json')));
var B = require(path.resolve(process.argv[3]));

function get(o, p) { return p.split('.').reduce(function (x, k) { return x == null ? x : x[k]; }, o); }
function fmt(x) { return x == null ? '–' : typeof x === 'number' ? String(Math.round(x * 10) / 10) : String(x); }
var ROWS = [
  ['Page weight: index.html raw (KB)', 'weight.indexHtml.raw', 1 / 1024],
  ['Page weight: index.html brotli (KB)', 'weight.indexHtml.brotli', 1 / 1024],
  ['Cold open transfer, WebKit (KB)', 'weight.networkColdWebKit.totalTransfer', 1 / 1024],
  ['WebKit cold: first paint', 'webkit.cold.median.firstContentfulPaint'],
  ['WebKit cold: boot() starts', 'webkit.cold.median.bootStart'],
  ['WebKit cold: Month card in DOM', 'webkit.cold.median.heroInDom'],
  ['WebKit warm (pull 1.5 s): Month card in DOM', 'webkit.warm.pull1500.median.heroInDom'],
  ['WebKit warm (pull 1.5 s): sheet data used', 'webkit.warm.pull1500.median.freshRender'],
  ['WebKit warm (pull 1.5 s): apply + save + redraw', 'webkit.warm.pull1500.median.pullToFreshJs'],
  ['WebKit warm (pull 1.5 s): redrawn after pull', 'webkit.warm.pull1500.median.redrawn'],
  ['Chromium 4×/Slow 4G cold: first paint', 'chromium.cold.median.firstContentfulPaint'],
  ['Chromium 4×/Slow 4G cold: Month card in DOM', 'chromium.cold.median.heroInDom'],
  ['Chromium 4× warm (pull 1.5 s): apply + save + redraw', 'chromium.warm.pull1500.median.pullToFreshJs'],
  ['Chromium 4× warm (pull 1.5 s): long-task ms', 'chromium.warm.pull1500.median.longTaskMs'],
  ['Tap + → sheet shown (WebKit)', 'webkit.interactions.openAddSheet.median.toShown'],
  ['Month → Activity shown (WebKit)', 'webkit.interactions.monthToActivity.median.toShown'],
  ['Save → row shown (WebKit)', 'webkit.interactions.saveToRow.median.toShown'],
  ['save() ms (WebKit)', 'webkit.storage.saveMs'],
  ['Lighthouse local: Performance', 'lighthouse.local.median.performance'],
  ['Lighthouse local: FCP', 'lighthouse.local.median.fcp'],
  ['Lighthouse local: LCP', 'lighthouse.local.median.lcp']
];
var w = Math.max.apply(null, ROWS.map(function (r) { return r[0].length; }));
console.log('ms unless noted'.padEnd(w) + '      before       after');
ROWS.forEach(function (r) {
  var a = get(A, r[1]), b = get(B, r[1]), k = r[2] || 1;
  console.log(r[0].padEnd(w) + fmt(a == null ? a : a * k).padStart(12) + fmt(b == null ? b : b * k).padStart(12));
});
