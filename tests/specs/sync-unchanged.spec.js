// 2.49: when the sheet hasn't changed since the last open, the screen isn't rebuilt (nothing jumps under your finger),
// but anything that changed — in the sheet, a refused save, a refresh you asked for, a reconnect — is used in full.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

var HERO = '#view .card.hero';

// synced and settled. The first open after connecting also sends a one-off settings update (this phone's version, for
// the sheet's device list), so open once more to get past it, as on the owner's phone.
async function settled(page, app) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  var t0 = await app.now();
  await page.reload();
  await app.synced(t0);
}
// reopen with a slow sheet, and mark what the saved copy drew before the sheet answers
async function reopenMarked(page, app, mock) {
  mock.latency = 1200;
  var t0 = await app.now();
  await page.reload();
  await expect(page.locator(HERO)).toBeVisible();
  await page.evaluate(function () { document.querySelector('#view .card.hero').setAttribute('data-test-mark', '1'); });
  await app.synced(t0);
}

test('reopening with an unchanged sheet keeps the screen as it is', async function ({ page, app, mock }) {
  await settled(page, app);
  var pulls = mock.count('pull');
  await reopenMarked(page, app, mock);
  expect(mock.count('pull')).toBe(pulls + 1);
  await expect(page.locator(HERO + '[data-test-mark]')).toHaveCount(1);       // not redrawn
  await expect(page.locator('#syncTxt')).not.toHaveText('Sync issue');
});

test('a change in the sheet is still picked up on the next open', async function ({ page, app, mock }) {
  await settled(page, app);
  mock.sheet.logs.e2026.unshift({ m: 10, v: 'Edited On Mac', c: 'groceries', a: 12, n: '', d: '2026-11-18', tr: '', fs: '', ow: 0, pb: '' });
  await reopenMarked(page, app, mock);
  await expect(page.locator(HERO + '[data-test-mark]')).toHaveCount(0);       // redrawn with the sheet's data
  expect(await page.evaluate(function () { return window.__runway.S.tx.some(function (t) { return t.v === 'Edited On Mac'; }); })).toBe(true);
});

test('pull down to refresh rebuilds from the sheet even when nothing changed', async function ({ page, app, mock }) {
  await settled(page, app);
  await page.evaluate(function () { document.querySelector('#view .card.hero').setAttribute('data-test-mark', '1'); });
  var t0 = await app.now();
  await page.locator('#refreshBtn').dispatchEvent('click');               // the same full refresh as pulling down
  await app.synced(t0);
  await expect(page.locator('#toastTxt')).toHaveText('Up to date');
  await expect(page.locator(HERO + '[data-test-mark]')).toHaveCount(0);
});

test('disconnecting and reconnecting the same sheet shows the sheet, not the sample numbers', async function ({ page, app, mock }) {
  var M = require('../support/mock-sheet');
  await settled(page, app);
  await page.tap('header [data-act="settings"]');
  await page.locator('#sheet [data-act="disconnect"]').dispatchEvent('click');
  await page.locator('#sheet [data-act="disconnect"]').dispatchEvent('click');     // two-step confirm
  await expect(page.locator('#toastTxt')).toHaveText(/Disconnected/);
  expect(await page.evaluate(function () { return window.__runway.S.demo; })).toBe(true);

  await page.fill('#c_url', M.URL);
  await page.fill('#c_pass', M.PASS);
  await page.locator('#c_go').dispatchEvent('click');
  await expect(page.locator('#toastTxt')).toHaveText(/Connected to/);
  var s = await page.evaluate(function () { var S = window.__runway.S; return { demo: S.demo, n: S.tx.length, sample: S.tx.filter(function (t) { return t.demo; }).length }; });
  expect(s.demo).toBe(false);
  expect(s.sample).toBe(0);
  expect(s.n).toBe(mock.rows());
});
