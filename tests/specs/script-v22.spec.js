// 2.53 with script v22: the script remembers tabs that haven't changed. A refresh you ask for and the daily full read
// tell it to read every tab anyway; ordinary opens don't.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

test.use({ mockOptions: { v: 22 } });

function pulls(mock, n) { return mock.log.slice(n).filter(function (l) { return l.action === 'pull'; }); }

test('only a refresh you ask for, or the daily read, asks for every tab', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  var n = mock.log.length, t0 = await app.now();
  await page.reload();
  await app.synced(t0);
  expect(pulls(mock, n).every(function (p) { return !p.fresh; })).toBe(true);           // an ordinary open

  n = mock.log.length; t0 = await app.now();
  await page.locator('#refreshBtn').dispatchEvent('click');                             // pull down to refresh
  await app.synced(t0);
  expect(pulls(mock, n)[0].fresh).toBe(true);

  await page.evaluate(function () { window.__runway.S.pullFull = Date.now() - 25 * 3600e3; return window.__runway.save(); });
  n = mock.log.length; t0 = await app.now();
  await page.reload();                                                                  // a day later
  await app.synced(t0);
  expect(pulls(mock, n)[0].fresh).toBe(true);
  expect(pulls(mock, n)[0].since).toBe('');
});

test('an older script (v21) is never asked for "fresh"', async function ({ page, app, mock }) {
  mock.v = 21;
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  var n = mock.log.length, t0 = await app.now();
  await page.locator('#refreshBtn').dispatchEvent('click');
  await app.synced(t0);
  expect(pulls(mock, n)[0].fresh).toBe(false);
});
