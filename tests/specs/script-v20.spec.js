// 2.49 with script v20: when nothing changed, the sheet answers "same as before" without reading its tabs.
// Anything that might have changed still gets a full read.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

test.use({ mockOptions: { v: 20 } });

var HERO = '#view .card.hero';
function pulls(mock, n) { return mock.log.slice(n).filter(function (l) { return l.action === 'pull'; }); }
var SENT = [];                                     // everything the last reopen sent
async function reopen(page, app, mock) {
  if (!mock.latency) mock.latency = 600;           // time to mark what the saved copy drew before the sheet answers
  var n = mock.log.length, t0 = await app.now();
  await page.reload();
  await expect(page.locator(HERO)).toBeVisible();
  await page.evaluate(function () { document.querySelector('#view .card.hero').setAttribute('data-test-mark', '1'); });
  await app.synced(t0);
  await page.waitForTimeout(200);
  SENT = mock.log.slice(n);
  return pulls(mock, n);
}
// connected, and past the one-off settings update after connecting
async function settled(page, app, mock) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  for (var i = 0; i < 5; i++) { await reopen(page, app, mock); if (SENT.length === 1 && SENT[0].status === 'same') return; }
  throw new Error('never got a "same as before" answer');
}

test('an unchanged sheet answers "same as before" and nothing is redrawn', async function ({ page, app, mock }) {
  await settled(page, app, mock);
  var p = await reopen(page, app, mock);
  expect(p.length).toBe(1);
  expect(p[0].since).toBeTruthy();
  expect(p[0].status).toBe('same');
  expect(p[0].bytes).toBeLessThan(200);
  await expect(page.locator(HERO + '[data-test-mark]')).toHaveCount(1);
  expect(await page.evaluate(function () { return window.__runway.S.tx.length; })).toBe(mock.rows());
});

test('an edit made by hand in the sheet is read in full on the next open', async function ({ page, app, mock }) {
  await settled(page, app, mock);
  mock.sheet.logs.e2026.unshift({ m: 10, v: 'Typed In Sheet', c: 'groceries', a: 3, n: '', d: '2026-11-18', tr: '', fs: '', ow: 0, pb: '' });
  mock.touch();
  var p = await reopen(page, app, mock);
  expect(p[0].status).toBe('ok');
  await expect(page.locator(HERO + '[data-test-mark]')).toHaveCount(0);
  expect(await page.evaluate(function () { return window.__runway.S.tx.some(function (t) { return t.v === 'Typed In Sheet'; }); })).toBe(true);
});

test('saving an entry reads the sheet in full right away, so the next open is "same as before"', async function ({ page, app, mock }) {
  await settled(page, app, mock);
  var n = mock.log.length;
  await page.tap('#fab');
  await page.fill('#f_a', '2.22');
  await page.fill('#f_v', 'Saved From Phone');
  await page.tap('#f_quick button[data-v="groceries"]');
  await page.tap('#f_save');
  await expect.poll(function () { var p = pulls(mock, n); return p.length && p[p.length - 1].status; }, { timeout: 15000 }).toBe('ok');
  await app.synced(await app.now() - 5000);
  var p = await reopen(page, app, mock);
  expect(p[0].status).toBe('same');
  var t = await page.evaluate(function () { return window.__runway.S.tx.filter(function (t) { return t.v === 'Saved From Phone'; }); });
  expect(t.length).toBe(1);
  expect(t[0].p).toBeFalsy();                     // the sheet's own copy (with its row), not the phone's placeholder
});

test('without the watcher, every open reads everything', async function ({ page, app, mock }) {
  await settled(page, app, mock);
  mock.watch = false;
  var p = await reopen(page, app, mock);
  expect(p[0].status).toBe('ok');
});

test('pull down to refresh, and once a day, read everything', async function ({ page, app, mock }) {
  await settled(page, app, mock);
  var n = mock.log.length, t0 = await app.now();
  await page.locator('#refreshBtn').dispatchEvent('click');
  await app.synced(t0);
  expect(pulls(mock, n)[0].since).toBe('');

  await page.evaluate(function () { window.__runway.S.pullFull = Date.now() - 25 * 3600e3; return window.__runway.save(); });
  var p = await reopen(page, app, mock);
  expect(p[0].since).toBe('');
  expect(p[0].status).toBe('ok');
});

test('a refused save still gets the sheet’s full answer', async function ({ page, app, mock }) {
  await settled(page, app, mock);
  mock.fail({ error: 'not_found' }, { action: 'update', times: 1 });
  await page.tap('.tab[data-v="activity"]');
  await page.locator('#view button.tx[data-act="edit"]').first().tap();
  await page.fill('#f_a', '654.00');
  var n = mock.log.length;
  await page.tap('#f_save');
  await expect(page.locator('#toastTxt')).toHaveText(/Skipped/);
  await app.synced(await app.now() - 5000);
  await expect.poll(function () { var p = pulls(mock, n); return p.length && p[0].status; }, { timeout: 15000 }).toBe('ok');
  await app.synced(await app.now() - 5000);
  expect(await page.evaluate(function () { return window.__runway.S.tx.filter(function (t) { return t.a === 654; }).length; })).toBe(0);
});
