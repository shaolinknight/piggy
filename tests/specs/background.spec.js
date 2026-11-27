// 2.55: a picture behind the app (Settings → Appearance → Background), with frosted glass that can be turned off.
// Plain keeps Piggy exactly as it was; a picture sets light or dark to match it; the choice syncs like the other looks.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

var SCENES = ['nyc', 'tokyo', 'paris', 'sf', 'spring', 'summer', 'autumn', 'winter'];

async function openLook(page) {
  await page.tap('header [data-act="settings"]');
  await page.locator('#sheet details[data-sec="look"] > summary').tap();
  await expect(page.locator('#sheet .bgsws')).toBeVisible();
}
function look(page) {
  return page.evaluate(function () {
    var r = document.documentElement, card = document.querySelector('#view .card');
    return { bg: r.getAttribute('data-bg'), glass: r.getAttribute('data-glass'), tone: r.getAttribute('data-tone'),
      meta: document.querySelector('meta[name=theme-color]').getAttribute('content'),
      cardBg: card ? getComputedStyle(card).backgroundColor : null };
  });
}

test('picking a picture, turning glass off, and going back to plain', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  var plain = await look(page);
  expect(plain.bg).toBeNull();
  expect(plain.glass).toBeNull();

  await openLook(page);
  await page.locator('#sheet [data-act="bg"][data-v="nyc"]').tap();
  await expect(page.locator('#sheet [data-act="bg"][data-v="nyc"]')).toHaveAttribute('aria-pressed', 'true');
  var nyc = await look(page);
  expect(nyc).toMatchObject({ bg: 'nyc', glass: 'on', tone: 'dark', meta: '#141944' });          // a night city: dark, whatever the phone is set to
  await expect(page.locator('#sheet [data-act="mode"]')).toHaveCount(0);                         // light/dark is the picture's
  await expect(page.locator('#sheet details[data-sec="look"] > summary span')).toContainText('New York');

  await page.locator('#sheet [data-act="glass"][data-v="off"]').tap();
  var off = await look(page);
  expect(off.glass).toBeNull();
  expect(off.cardBg).toMatch(/^rgb\(/);                                                          // solid cards again

  await page.locator('#sheet [data-act="bg"][data-v="spring"]').tap();
  expect(await look(page)).toMatchObject({ bg: 'spring', glass: null, tone: 'light' });          // glass stays off until you turn it on

  await page.locator('#sheet [data-act="bg"][data-v=""]').tap();
  expect(await look(page)).toMatchObject({ bg: null, glass: null, meta: plain.meta, cardBg: plain.cardBg });
  await expect(page.locator('#sheet [data-act="mode"]').first()).toBeVisible();

  // the choice goes to the sheet with the other looks
  await page.locator('#sheet [data-act="bg"][data-v="autumn"]').tap();
  await page.evaluate(function () { return window.__runway.sync(); });
  await expect.poll(function () { return mock.sheet.prefs && mock.sheet.prefs.cfg && mock.sheet.prefs.cfg.bg; }).toBe('autumn');
  expect(mock.sheet.prefs.cfg.glass).toBe('off');
});

test('a picture chosen on another device arrives with the sheet', async function ({ page, app, mock }) {
  mock.sheet.prefs = Object.assign({}, mock.sheet.prefs, { cfg: Object.assign({}, (mock.sheet.prefs || {}).cfg, { bg: 'winter', glass: 'on' }), at: Date.now() });
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await expect.poll(function () { return look(page).then(function (l) { return l.bg + '/' + l.glass + '/' + l.tone; }); }).toBe('winter/on/light');
});

test('every picture is there to load', async function ({ page, app }) {
  await app.boot({ state: boot.connectedState() });
  var files = SCENES.concat(['petals', 'leaves', 'snow']).map(function (s) { return 'scenes/' + s + '.svg'; });
  var codes = await page.evaluate(function (fs) {
    return Promise.all(fs.map(function (u) { return fetch(u).then(function (r) { return r.status + ' ' + (r.headers.get('content-type') || ''); }); }));
  }, files);
  codes.forEach(function (c, i) { expect(c, files[i]).toMatch(/^200 image\/svg\+xml/); });
});
