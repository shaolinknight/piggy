// Opening the app: the saved copy paints first, the sheet's copy replaces it, and a sheet that
// can't be reached never takes the saved data off the screen.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

var HERO = '#view .card.hero';

// A phone that has synced before: boot once against the mock, then reload with the saved copy.
async function syncedOnce(app) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
}

test('opens from the saved copy and paints it before the sheet answers', async function ({ page, app, mock }) {
  await syncedOnce(app);
  mock.latency = 4000;
  var pulls = mock.count('pull');
  function answered() { return mock.log.filter(function (l) { return l.action === 'pull' && l.status !== 'pending'; }).length; }
  await page.reload();
  await expect(page.locator(HERO)).toBeVisible();
  // painted from the saved copy: no pull has been answered since the reload, but every entry is already there
  expect(answered()).toBe(pulls);
  expect(await app.S(function () { return window.__runway.S.tx.length; })).toBe(mock.rows());
  await expect(page.locator('.skel')).toHaveCount(0);
  await expect.poll(function () { return mock.count('pull'); }).toBe(pulls + 1);
});

test('first-ever load shows the skeleton, then the data', async function ({ page, app, mock }) {
  mock.latency = 1500;
  await app.boot({ state: boot.connectedState() });
  await expect(page.locator('#view .skel')).toBeVisible();
  await expect(page.locator(HERO)).toHaveCount(0);
  await expect(page.locator(HERO)).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#view .skel')).toHaveCount(0);
  expect(await app.S(function () { return window.__runway.S.tx.length; })).toBe(mock.rows());
});

test('a stale saved copy is replaced by the pull', async function ({ page, app, mock }) {
  await syncedOnce(app);
  // meanwhile, on the computer: a new entry this month, and an old one deleted
  mock.sheet.logs.e2026.unshift({ m: 10, v: 'Changed On Mac', c: 'groceries', a: 77.77, n: '', d: '2026-11-17', tr: '', fs: '', ow: 0, pb: '' });
  var gone = mock.sheet.logs.e2025.pop();
  var t0 = await app.now();
  await page.reload();
  await app.synced(t0);
  var s = await app.S(function () {
    var S = window.__runway.S;
    return { n: S.tx.length, mac: S.tx.filter(function (t) { return t.v === 'Changed On Mac'; }).length };
  });
  expect(s.mac).toBe(1);
  expect(s.n).toBe(mock.rows());
  var stillThere = await page.evaluate(function (g) {
    return window.__runway.S.tx.filter(function (t) { return t.y === 2025 && t.m === g.m && t.v === g.v && t.a === g.a && t.d === g.d; }).length;
  }, gone);
  expect(stillThere).toBe(0);
  // and it's on screen
  await page.tap('.tab[data-v="activity"]');
  await expect(page.locator('#view').getByText('Changed On Mac').first()).toBeVisible();
});

for (var mode of ['offline', 'http500', 'error']) {
  (function (mode) {
    test('a failed pull (' + mode + ') shows an error and keeps the saved data on screen', async function ({ page, app, mock }) {
      await syncedOnce(app);
      mock.fail(mode === 'error' ? { error: 'Exception: Service Spreadsheets timed out' } : mode, { action: 'pull' });
      await page.reload();
      await expect(page.locator('#syncTxt')).toHaveText('Sync issue');
      await expect(page.locator(HERO)).toBeVisible();
      var s = await app.S(function () { var S = window.__runway.S; return { n: S.tx.length, err: S.syncErr }; });
      expect(s.n).toBe(mock.rows());
      expect(s.err).toMatch(mode === 'error' ? /timed out/ : /Couldn.t reach the sheet/);
    });
  })(mode);
}

test('a pull that never answers times out after 25 s and keeps the saved data', async function ({ page, app, mock }) {
  await syncedOnce(app);
  mock.fail('timeout', { action: 'pull' });
  await page.reload();
  await expect.poll(function () { return mock.log.some(function (l) { return l.status === 'held'; }); }).toBe(true);
  await page.clock.fastForward(26000);
  await expect(page.locator('#syncTxt')).toHaveText('Sync issue');
  expect(await app.S(function () { return window.__runway.S.syncErr; })).toMatch(/took too long/);
  await expect(page.locator(HERO)).toBeVisible();
});
