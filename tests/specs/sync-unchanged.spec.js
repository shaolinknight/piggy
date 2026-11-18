// 2.49: when the sheet hasn't changed since the last open, the screen isn't rebuilt (nothing jumps under your finger),
// but anything that changed — in the sheet, a refused save, a refresh you asked for, a reconnect — is used in full.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

var HERO = '#view .card.hero';

// synced and settled: reopen until an open sends nothing but the pull. (The first open after connecting sends a one-off
// settings update for the sheet's device list, and the open after that sees the sheet it changed, as on the owner's phone.)
async function settled(page, app, mock) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  for (var i = 0; i < 4; i++) {
    var n = mock.log.length, t0 = await app.now();
    await page.reload();
    await app.synced(t0);
    await page.waitForTimeout(300);
    var sent = mock.log.slice(n).map(function (l) { return l.action; });
    if (sent.join() === 'pull' && i) return;
  }
  throw new Error('the app never settled: it keeps sending changes');
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
  await settled(page, app, mock);
  var pulls = mock.count('pull');
  await reopenMarked(page, app, mock);
  expect(mock.count('pull')).toBe(pulls + 1);
  await expect(page.locator(HERO + '[data-test-mark]')).toHaveCount(1);       // not redrawn
  await expect(page.locator('#syncTxt')).not.toHaveText('Sync issue');
});

test('a change in the sheet is still picked up on the next open', async function ({ page, app, mock }) {
  await settled(page, app, mock);
  mock.sheet.logs.e2026.unshift({ m: 10, v: 'Edited On Mac', c: 'groceries', a: 12, n: '', d: '2026-11-18', tr: '', fs: '', ow: 0, pb: '' });
  await reopenMarked(page, app, mock);
  await expect(page.locator(HERO + '[data-test-mark]')).toHaveCount(0);       // redrawn with the sheet's data
  expect(await page.evaluate(function () { return window.__runway.S.tx.some(function (t) { return t.v === 'Edited On Mac'; }); })).toBe(true);
});

test('pull down to refresh rebuilds from the sheet even when nothing changed', async function ({ page, app, mock }) {
  await settled(page, app, mock);
  await page.evaluate(function () { document.querySelector('#view .card.hero').setAttribute('data-test-mark', '1'); });
  var t0 = await app.now();
  await page.locator('#refreshBtn').dispatchEvent('click');               // the same full refresh as pulling down
  await app.synced(t0);
  await expect(page.locator('#toastTxt')).toHaveText('Up to date');
  await expect(page.locator(HERO + '[data-test-mark]')).toHaveCount(0);
});

test('disconnecting and reconnecting the same sheet shows the sheet, not the sample numbers', async function ({ page, app, mock }) {
  var M = require('../support/mock-sheet');
  await settled(page, app, mock);
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

test('a slow settings update doesn’t hold up the sheet’s data', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  // the next open sends a settings update (this phone's version, for the sheet's device list); make it slow
  mock.latency = { prefs: 2500 };
  var t0 = await app.now(), n = mock.log.length;
  await page.reload();
  await app.synced(t0);
  var after = mock.log.slice(n), prefs = after.filter(function (l) { return l.action === 'prefs'; })[0], pull = after.filter(function (l) { return l.action === 'pull'; })[0];
  expect(prefs).toBeTruthy();
  expect(pull.at - prefs.at).toBeLessThan(1000);                           // asked for together, not 2.5 s later
  expect(await page.evaluate(function () { return window.__runway.S.outbox.length; })).toBe(0);
});

test('queued entries still reach the sheet before its data is asked for', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  mock.latency = { add: 1500 };
  await page.tap('#fab');
  await page.fill('#f_a', '7.77');
  await page.fill('#f_v', 'Queued First');
  await page.tap('#f_quick button[data-v="groceries"]');
  await page.tap('#f_save');
  await expect.poll(function () { return mock.applied.some(function (a) { return a.action === 'add'; }); }, { timeout: 15000 }).toBe(true);
  var addAt = mock.log.filter(function (l) { return l.action === 'add'; })[0].at;
  await expect.poll(function () { return mock.log.some(function (l) { return l.action === 'pull' && l.at > addAt; }); }).toBe(true);
  expect(mock.log.some(function (l) { return l.action === 'pull' && l.at > addAt && l.at < addAt + 1400; })).toBe(false);
  await app.synced();
  expect(await page.evaluate(function () { return window.__runway.S.tx.filter(function (t) { return t.v === 'Queued First'; }).length; })).toBe(1);
});
