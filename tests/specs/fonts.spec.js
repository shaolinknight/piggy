// 2.49: the Classic look's fonts come from the app itself; Google Fonts isn't asked for anything.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

test('Classic fonts load from the app, not from Google @screens', async function ({ page, app }) {
  var google = [], own = [];
  page.on('request', function (r) {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) google.push(r.url());
    if (/\/fonts\/.+\.woff2$/.test(r.url())) own.push(r.url().replace(/^.*\/fonts\//, ''));
  });
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await page.evaluate(function () { return document.fonts.ready; });
  var ok = await page.evaluate(function () {
    return { body: document.fonts.check('500 16px "DM Sans"'), head: document.fonts.check('600 32px "Fraunces"'),
      loaded: (function () { var l = []; document.fonts.forEach(function (x) { if (x.status === 'loaded') l.push(x.family.replace(/"/g, '') + ' ' + x.weight); }); return l; })() };
  });
  expect(ok.body).toBe(true);
  expect(ok.head).toBe(true);
  expect(ok.loaded).toEqual(expect.arrayContaining(['DM Sans 400 700', 'Fraunces 500 600']));
  expect(own).toEqual(expect.arrayContaining(['dm-sans-latin.woff2', 'fraunces-latin.woff2']));
  expect(google).toEqual([]);
});
