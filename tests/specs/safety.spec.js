// 2.56 "safety first": nothing you enter is lost or misdated without Piggy saying so, the passcode stays out of web
// addresses (script v23), and a backup file can't open the sheet by itself or replace everything with one stray tap.
'use strict';
var fs = require('fs');
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

function pulls(mock, n) { return mock.log.slice(n || 0).filter(function (l) { return l.action === 'pull'; }); }
async function addEntry(page, o) {
  await page.tap('#fab');
  await expect(page.locator('#sheet #txform')).toBeVisible();
  await page.fill('#f_a', o.a);
  await page.fill('#f_v', o.v);
  await page.tap('#f_quick button[data-v="groceries"]');
  await page.tap('#f_save');
}
function inSheet(mock, v) {
  return Object.keys(mock.sheet.logs).reduce(function (n, k) { return n + mock.sheet.logs[k].filter(function (e) { return e.v === v; }).length; }, 0);
}

test.describe('script v23', function () {
  test.use({ mockOptions: { v: 23 } });
  test('reads are sent as a POST, so the passcode is never in a web address', async function ({ page, app, mock }) {
    await app.boot({ state: boot.connectedState() });
    await app.synced();
    var n = mock.log.length, t0 = await app.now();
    await page.locator('#refreshBtn').dispatchEvent('click');
    await app.synced(t0);
    var p = pulls(mock, n);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every(function (x) { return x.method === 'POST'; })).toBe(true);
    expect(p[0].fresh).toBe(true);                                                  // a refresh you asked for still reads everything
  });
});

test('an older script (v22) is still read with a GET', async function ({ page, app, mock }) {
  mock.v = 22;
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  var n = mock.log.length, t0 = await app.now();
  await page.locator('#refreshBtn').dispatchEvent('click');
  await app.synced(t0);
  expect(pulls(mock, n).every(function (x) { return x.method === 'GET'; })).toBe(true);
});

test('the sheet pausing after wrong passcodes is explained in plain words', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  mock.fail({ error: 'locked' }, { action: 'pull' });
  await page.evaluate(function () { return window.__runway.sync().catch(function () {}); });
  await expect.poll(function () { return app.S(function () { return window.__runway.S.syncErr; }); }).toMatch(/Too many wrong passcodes/);
});

test('when the phone refuses to save, Piggy says so and sends the change to the sheet', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await page.evaluate(function () {
    Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
  });
  await addEntry(page, { a: '3.21', v: 'Full Phone' });
  await expect(page.locator('#toast')).toContainText('can’t save on this phone', { timeout: 15000 });     // it waits for the Undo toast first
  await expect.poll(function () { return inSheet(mock, 'Full Phone'); }).toBe(1);       // it reached the sheet anyway
  await expect(page.locator('#syncBtn')).toHaveAttribute('aria-label', 'Can’t save on this phone');
});

test('an entry made just after midnight gets the new day, even with Piggy left open', async function ({ page, app }) {
  await app.boot({ state: boot.connectedState({ hu: 2027 * 12 }), today: '2027-01-01T06:58:30Z' });   // 23:58:30 in Denver; no month heads-up
  await app.synced();
  await page.clock.runFor(120000);                                                // midnight passes with the app open
  await page.tap('#fab');
  await expect(page.locator('#f_d')).toHaveValue('2027-01-01');
});

test('a backup file leaves out the sheet address and passcode', async function ({ page, app }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await page.tap('header [data-act="settings"]');
  await page.locator('#sheet details[data-sec="backup"] > summary').tap();
  var dl = page.waitForEvent('download');
  await page.locator('#sheet [data-act="export"]').tap();
  var file = JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
  expect(file.cfg.url).toBeUndefined();
  expect(file.cfg.pass).toBeUndefined();
  expect(file.tx.length).toBeGreaterThan(0);
});

test('restoring a backup takes a second tap, keeps the sheet connection, and can be undone', async function ({ page, app }, info) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  var before = await app.S(function () { var S = window.__runway.S; return { n: S.tx.length, url: S.cfg.url }; });
  var backup = { v: 1, demo: false, tx: [{ id: 'b1', k: 'e', y: 2026, m: 10, d: '2026-11-02', v: 'From Backup', c: 'groceries', a: 9.99, n: '' }], outbox: [], cfg: { mode: 'light' } };
  var file = info.outputPath('backup.json');
  fs.writeFileSync(file, JSON.stringify(backup));

  await page.tap('header [data-act="settings"]');
  await page.locator('#sheet details[data-sec="backup"] > summary').tap();
  var imp = page.locator('#sheet [data-act="import"]');
  var opened = false;
  page.on('filechooser', function () { opened = true; });
  await imp.tap();
  await expect(imp).toHaveText(/Tap again/);                                     // the first tap only asks
  expect(opened).toBe(false);
  var chooser = page.waitForEvent('filechooser');
  await imp.tap();
  await (await chooser).setFiles(file);
  await expect(page.locator('#toast')).toContainText('Backup restored');
  var after = await app.S(function () { var S = window.__runway.S; return { n: S.tx.length, v: S.tx[0] && S.tx[0].v, url: S.cfg.url }; });
  expect(after).toEqual({ n: 1, v: 'From Backup', url: before.url });              // still connected to the same sheet

  await page.locator('#toastBtn').tap();                                         // Undo
  await expect.poll(function () { return app.S(function () { return window.__runway.S.tx.length; }); }).toBe(before.n);
});

test('a saved copy that can’t be read is set aside, not overwritten', async function ({ page, app }) {
  await app.boot({ state: '{"tx":[{"id":"x1", broken' });
  await expect(page.locator('#toast')).toContainText('couldn’t read');
  expect(await page.evaluate(function () { return localStorage.getItem('runway.v1.damaged'); })).toBe('{"tx":[{"id":"x1", broken');
  expect(await app.saved()).not.toBeNull();                                      // and Piggy started fresh beside it
});
