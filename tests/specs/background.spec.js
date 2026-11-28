// 2.55: Settings → Appearance: pick a look from Colors, Cities or Seasons. A city or season is a picture behind the app,
// with a day and a night version that follow Light / dark, and frosted glass that can be turned off. A colour look
// keeps Piggy exactly as it was. The choice syncs like the other looks.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

var SCENES = ['nyc', 'tokyo', 'paris', 'sf', 'spring', 'summer', 'autumn', 'winter'];

async function openLook(page) {
  await page.tap('header [data-act="settings"]');
  await page.locator('#sheet details[data-sec="look"] > summary').tap();
  await expect(page.locator('#sheet [data-act="looktab"]').first()).toBeVisible();
}
function look(page) {
  return page.evaluate(function () {
    var r = document.documentElement, card = document.querySelector('#view .card:not(.hero)');
    return { bg: r.getAttribute('data-bg'), glass: r.getAttribute('data-glass'), tone: r.getAttribute('data-tone'),
      pic: (r.style.getPropertyValue('--sc').match(/scenes\/([a-z]+-(?:day|night))\.svg/) || [])[1] || null,
      meta: document.querySelector('meta[name=theme-color]').getAttribute('content'),
      cardBg: card ? getComputedStyle(card).backgroundColor : null };
  });
}

test('colors, cities and seasons; day and night; glass off; back to a colour', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  var plain = await look(page);
  expect(plain).toMatchObject({ bg: null, glass: null, pic: null, tone: 'light' });

  await openLook(page);
  await expect(page.locator('#sheet [data-act="looktab"][data-v="colors"]')).toHaveClass(/\bon\b/);   // a colour look opens on Colors
  await page.locator('#sheet [data-act="looktab"][data-v="cities"]').tap();
  await expect(page.locator('#sheet [data-act="bg"]')).toHaveCount(4);
  await page.locator('#sheet [data-act="bg"][data-v="nyc"]').tap();
  await expect(page.locator('#sheet [data-act="bg"][data-v="nyc"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await look(page)).toMatchObject({ bg: 'nyc', glass: 'on', tone: 'light', pic: 'nyc-day', meta: '#a9c9ec' });   // the phone is light: daytime
  await expect(page.locator('#sheet details[data-sec="look"] > summary span')).toContainText('New York');

  await page.locator('#sheet [data-act="mode"][data-v="dark"]').tap();                          // dark: the same city at night
  expect(await look(page)).toMatchObject({ bg: 'nyc', tone: 'dark', pic: 'nyc-night', meta: '#141944' });

  await page.locator('#sheet [data-act="glass"][data-v="off"]').tap();
  var off = await look(page);
  expect(off.glass).toBeNull();
  expect(off.cardBg).toMatch(/^rgb\(/);                                                         // solid cards again

  await page.locator('#sheet [data-act="looktab"][data-v="seasons"]').tap();
  await page.locator('#sheet [data-act="bg"][data-v="winter"]').tap();
  expect(await look(page)).toMatchObject({ bg: 'winter', glass: null, pic: 'winter-night' });   // glass stays off until turned on

  await page.locator('#sheet [data-act="mode"][data-v="light"]').tap();
  await page.locator('#sheet [data-act="looktab"][data-v="colors"]').tap();
  await page.locator('#sheet [data-act="pal"]').first().tap();                                  // a colour: no picture
  expect(await look(page)).toMatchObject({ bg: null, glass: null, pic: null, tone: 'light' });

  // the choice goes to the sheet with the other looks
  await page.locator('#sheet [data-act="looktab"][data-v="seasons"]').tap();
  await page.locator('#sheet [data-act="bg"][data-v="autumn"]').tap();
  await page.evaluate(function () { return window.__runway.sync(); });
  await expect.poll(function () { return mock.sheet.prefs && mock.sheet.prefs.cfg && mock.sheet.prefs.cfg.bg; }).toBe('autumn');
  expect(mock.sheet.prefs.cfg.glass).toBe('off');
});

test('a picture chosen on another device arrives with the sheet', async function ({ page, app, mock }) {
  mock.sheet.prefs = Object.assign({}, mock.sheet.prefs, { cfg: Object.assign({}, (mock.sheet.prefs || {}).cfg, { bg: 'paris', glass: 'on' }), at: Date.now() });
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await expect.poll(function () { return look(page).then(function (l) { return l.bg + '/' + l.glass + '/' + l.pic; }); }).toBe('paris/on/paris-day');
});

test('with frosted glass, screens never fade (a fade would show the picture sharp before the frost)', async function ({ page, app }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await page.evaluate(function () { var R = window.__runway; R.S.cfg.bg = 'nyc'; R.S.cfg.glass = 'on'; R.save(); R.render(); });
  await page.reload();
  await app.synced(await app.now() - 60000);
  // the lowest opacity the screen reaches while something changes
  function watch() {
    return page.evaluate(function () {
      window.__minOp = 1; window.__vt = false;
      var v = document.getElementById('view'), end = performance.now() + 600;
      (function tick() {
        window.__minOp = Math.min(window.__minOp, +getComputedStyle(v).opacity);
        if (document.documentElement.hasAttribute('data-vt')) window.__vt = true;
        if (performance.now() < end) requestAnimationFrame(tick);
      })();
    });
  }
  function result() { return page.waitForTimeout(650).then(function () { return page.evaluate(function () { return { min: window.__minOp, vt: window.__vt }; }); }); }
  await watch();
  await page.locator('[data-act="mprev"]').first().tap();                                 // the month before: a new screen
  expect(await result()).toEqual({ min: 1, vt: false });
  await watch();
  await page.tap('.tab[data-v="activity"]');                                                     // another tab
  expect(await result()).toEqual({ min: 1, vt: false });
  await expect(page.locator('.tab[data-v="activity"]')).toHaveClass(/\bon\b/);
});

test('every picture, day and night, is there to load', async function ({ page, app }) {
  await app.boot({ state: boot.connectedState() });
  var files = [];
  SCENES.forEach(function (s) { files.push('scenes/' + s + '-day.svg', 'scenes/' + s + '-night.svg'); });
  files.push('scenes/petals.svg', 'scenes/leaves.svg', 'scenes/snow.svg');
  var codes = await page.evaluate(function (fs) {
    return Promise.all(fs.map(function (u) { return fetch(u).then(function (r) { return r.status + ' ' + (r.headers.get('content-type') || ''); }); }));
  }, files);
  codes.forEach(function (c, i) { expect(c, files[i]).toMatch(/^200 image\/svg\+xml/); });
});
