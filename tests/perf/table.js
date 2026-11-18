// Prints baseline.json as plain tables (medians). Run on its own: `node perf/table.js [file.json]`.
'use strict';
function pad(s, n) { s = s == null ? '–' : String(s); return s.length >= n ? s : s + new Array(n - s.length + 1).join(' '); }
function lpad(s, n) { s = s == null ? '–' : String(s); return s.length >= n ? s : new Array(n - s.length + 1).join(' ') + s; }
function ms(x) { return x == null ? '–' : Math.round(x) + ' ms'; }
function kb(x) { return x == null ? '–' : (Math.round(x / 102.4) / 10) + ' KB'; }
function table(title, cols, rows) {
  var w = cols.map(function (c, i) { return Math.max(c.length, rows.reduce(function (m, r) { return Math.max(m, String(r[i] == null ? '–' : r[i]).length); }, 0)); });
  console.log('\n' + title);
  console.log(cols.map(function (c, i) { return i ? lpad(c, w[i]) : pad(c, w[i]); }).join('  '));
  console.log(w.map(function (n) { return new Array(n + 1).join('-'); }).join('  '));
  rows.forEach(function (r) { console.log(r.map(function (c, i) { return i ? lpad(c, w[i]) : pad(c, w[i]); }).join('  ')); });
}

module.exports = function (R) {
  var m = R.meta || {};
  console.log('\nPiggy performance baseline — ' + m.at + ' — median of ' + m.runs + ' runs');
  console.log(m.machine + ' · Playwright ' + m.playwright + ' · WebKit ' + (m.webkit || '–') + ' · Chromium ' + (m.chromium || '–'));
  console.log('Mock sheet: ' + m.rows + ' entries, pull answer ' + m.pullJsonKB + ' KB');

  if (R.weight) {
    var W = R.weight;
    table('Page weight', ['part', 'raw', 'gzip', 'brotli'], [
      ['index.html (' + W.lines + ' lines)', kb(W.indexHtml.raw), kb(W.indexHtml.gzip), kb(W.indexHtml.brotli)],
      ['  inline JS', kb(W.js.raw), kb(W.js.gzip), kb(W.js.brotli)],
      ['  CSS', kb(W.css.raw), kb(W.css.gzip), kb(W.css.brotli)],
      ['  base64 (all)', kb(W.base64.raw), kb(W.base64.gzip), kb(W.base64.brotli)],
      ['sw.js', kb(W['sw.js']), '', ''],
      ['manifest + icons', kb(W['manifest.webmanifest'] + W['icon-192.png'] + W['icon-512.png']), '', ''],
      ['Google Fonts CSS (as sent to WebKit)', kb(W.networkColdWebKit.fontCss), '', ''],
      ['Google Fonts files (' + W.networkColdWebKit.fontFiles + ')', kb(W.networkColdWebKit.fontFileBytes), '', ''],
      ['everything on a cold open (transfer)', kb(W.networkColdWebKit.totalTransfer), '', '']
    ]);
  }

  var keys = [['htmlReceived', 'HTML received'], ['firstContentfulPaint', 'first (contentful) paint'], ['scriptParse', 'inline script: load + parse + compile'],
    ['scriptExec', 'inline script: top-level run'], ['bootToFirstRender', 'boot() → first render() (parse saved copy, migrate, draw)'],
    ['firstRender', 'first render() done'], ['heroInDom', 'Month hero card in the DOM'], ['pullSent', 'pull sent'], ['pullAnswered', 'pull answered'],
    ['renderToFresh', 'first render → fresh data on screen'], ['pullToFreshJs', '  of which: apply pull + save + redraw'], ['freshRender', 'fresh data on screen'],
    ['longTasks', 'long tasks > 50 ms (Chromium)'], ['longTaskMs', '  total long-task time'], ['longTaskMax', '  longest task']];
  ['webkit', 'chromium'].forEach(function (b) {
    var B = R[b]; if (!B || !B.cold) return;
    var cols = ['ms from page start', 'cold', 'cold, no fonts'].concat(Object.keys(B.warm).map(function (k) { return 'warm, pull ' + (+k.slice(4) / 1000) + ' s'; }));
    var rows = keys.map(function (k) {
      return [k[1], B.cold.median[k[0]], B.coldNoFonts.median[k[0]]].concat(Object.keys(B.warm).map(function (w) { return B.warm[w].median[k[0]]; }));
    }).filter(function (r) { return r.slice(1).some(function (x) { return x != null; }); });
    table(b === 'webkit' ? 'Startup — WebKit, 390×844' : 'Startup — Chromium, 4× CPU throttle + Slow 4G, 390×844', cols, rows);
  });

  ['webkit', 'chromium'].forEach(function (b) {
    var I = R[b] && R[b].interactions; if (!I) return;
    table('Interactions — ' + b + (b === 'chromium' ? ' (4× CPU)' : ''), ['tap → …', 'shown', 'settled (animations done)'], [
      ['+ → New entry sheet', ms(I.openAddSheet.median.toShown), ms(I.openAddSheet.median.toSettled)],
      ['Month → Activity', ms(I.monthToActivity.median.toShown), ms(I.monthToActivity.median.toSettled)],
      ['Save → row in Activity', ms(I.saveToRow.median.toShown), ms(I.saveToRow.median.toSettled)]
    ]);
    var s = I.activityScroll;
    console.log('  Activity with all ' + s.rows + ' rows: render ' + ms(s.renderAllRowsMs) + '; 2 s scroll: ' + s.frames + ' frames, ' + s.fps + ' fps, frame p50 ' + s.p50 + ' / p95 ' + s.p95 + ' / max ' + s.max + ' ms, ' + s.over25ms + ' frames > 25 ms, ' + s.over50ms + ' > 50 ms');
  });

  ['webkit', 'chromium'].forEach(function (b) {
    var S = R[b] && R[b].storage; if (!S) return;
    var S2 = b === 'webkit' && R.webkit.storage2x;
    table('Saved copy (localStorage) — ' + b + (b === 'chromium' ? ' (4× CPU)' : ''), ['', 'today (~5 yrs)'].concat(S2 ? ['2× data (~10 yrs)'] : []), [
      ['entries', S.entries].concat(S2 ? [S2.entries] : []),
      ['size', kb(S.chars) + ' chars'].concat(S2 ? [kb(S2.chars) + ' chars'] : []),
      ['% of 5 MB (if counted as UTF-16)', S.pctOf5MB_utf16 + '%'].concat(S2 ? [S2.pctOf5MB_utf16 + '%'] : []),
      ['JSON.parse', ms(S.parseMs)].concat(S2 ? [ms(S2.parseMs)] : []),
      ['JSON.stringify', ms(S.stringifyMs)].concat(S2 ? [ms(S2.stringifyMs)] : []),
      ['save() (stringify + setItem)', ms(S.saveMs)].concat(S2 ? [ms(S2.saveMs)] : []),
      ['IndexedDB put (object)', ms(S.idbPutObjectMs)].concat(S2 ? [ms(S2.idbPutObjectMs)] : []),
      ['IndexedDB get (object)', ms(S.idbGetObjectMs)].concat(S2 ? [ms(S2.idbGetObjectMs)] : [])
    ]);
    console.log('  biggest parts: ' + S.biggest.join(', ') + ' (of which each entry’s "original" copy: ' + S.txOriginalCopyKB + ' KB)');
  });

  if (R.lighthouse) {
    Object.keys(R.lighthouse).forEach(function (k) {
      var L = R.lighthouse[k].median;
      table('Lighthouse (' + k + ', mobile)', ['Perf', 'A11y', 'Best pr.', 'FCP', 'LCP', 'TBT', 'CLS', 'Speed Index'],
        [[L.performance, L.accessibility, L.bestPractices, ms(L.fcp), ms(L.lcp), ms(L.tbt), L.cls, ms(L.speedIndex)]]);
      if (R.lighthouse[k].failingAudits) console.log('  audits below 90: ' + R.lighthouse[k].failingAudits.join('; '));
    });
  }
  if (R.previewHeaders) console.log('\nPreview response headers: ' + JSON.stringify(R.previewHeaders));
  if (R.install) {
    var I2 = R.install;
    console.log('\nInstallability');
    console.log('  manifest: ' + JSON.stringify(I2.manifest));
    console.log('  head: ' + JSON.stringify(I2.head));
    console.log('  service worker controls page: ' + I2.head.swControls + ' · works offline: ' + I2.worksOffline + ' · Chromium installability errors: ' + (I2.chromiumInstallabilityErrors.join(', ') || 'none'));
  }
};

if (require.main === module) module.exports(JSON.parse(require('fs').readFileSync(process.argv[2] || require('path').join(__dirname, 'baseline.json'), 'utf8')));
