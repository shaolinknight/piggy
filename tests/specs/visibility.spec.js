// 2.57: when changes can't reach the sheet, the phone says so in words, keeps a short record of what went wrong, and
// speaks up once when something has been waiting more than a day. Copy details never carries the passcode or address.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;
var mockSheet = require('../support/mock-sheet');

test('offline: "1 change waiting to send" in words, and the problem is in Sync status', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await expect(page.locator('#stuckbar')).toBeHidden();
  mock.fail('offline');
  await page.tap('#fab');
  await page.fill('#f_a', '4.20');
  await page.fill('#f_v', 'Stuck Coffee');
  await page.tap('#f_quick button[data-v="groceries"]');
  await page.tap('#f_save');
  await expect(page.locator('#stuckbar')).toHaveText(/^Offline · 1 change waiting to send/);
  await expect(page.locator('#syncDot')).toHaveClass(/err/);
  expect(await page.evaluate(function () { return document.documentElement.scrollWidth - innerWidth; })).toBe(0);

  await page.locator('#stuckbar').tap();
  await expect(page.locator('#sheet #st_log')).toContainText('Couldn’t reach the sheet');
  await expect(page.locator('#sheet')).toContainText('Add Stuck Coffee $4.20');

  await page.evaluate(function () {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: function (t) { window.__copied = t; return Promise.resolve(); } } });
  });
  await page.locator('#sheet [data-act="copydetails"]').tap();
  await expect(page.locator('#toast')).toContainText('Copied');
  var txt = await page.evaluate(function () { return window.__copied; });
  expect(txt).toMatch(/^Piggy 2\.\d+ · sheet script \d+/);
  expect(txt).toMatch(/Waiting: \d+ \(add/);
  expect(txt).toContain('Couldn’t reach the sheet');
  expect(txt).not.toContain(mockSheet.PASS);
  expect(txt).not.toContain('script.google');

  mock.heal();                                                                    // back online: the line goes away
  await page.evaluate(function () { window.__runway.closeSheet(); return window.__runway.sync(); });
  await expect(page.locator('#stuckbar')).toBeHidden();
});

test('a change waiting more than a day gets a word once, with a way to see why', async function ({ page, app, mock }) {
  var twoDaysAgo = new Date('2026-11-16T09:00:00-07:00').getTime();
  var tx = { id: 'L9_old', k: 'e', y: 2026, m: 10, d: '2026-11-16', v: 'Old Lunch', c: 'restaurants', a: 12.5, n: '' };
  mock.fail('offline');
  await app.boot({ state: boot.connectedState({ tx: [tx], outbox: [{ oid: 'o9_' + twoDaysAgo.toString(36) + 'abcde', op: 'add', tid: tx.id, tx: tx }] }) });
  await expect(page.locator('#toast')).toContainText('1 change hasn’t reached your sheet since Monday');
  await page.locator('#toastBtn').tap();                                         // "See why"
  await expect(page.locator('#sheet')).toContainText('Waiting since');
  await expect(page.locator('#sheet')).toContainText('Add Old Lunch $12.50');
  // only once each time Piggy is opened
  await page.evaluate(function () { window.__runway.closeSheet(); return window.__runway.sync(); });
  await page.waitForTimeout(1600);
  await expect(page.locator('#toast')).not.toHaveClass(/\bon\b/);
});

test.describe('computer', function () {
  test.use({ viewport: { width: 1280, height: 800 }, screen: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  test('a wide window keeps the words in the header, not on a line of their own', async function ({ page, app, mock }) {
    await app.boot({ state: boot.connectedState() });
    await app.synced();
    mock.fail('offline');
    await page.evaluate(function () { window.__runway.S.outbox.push({ oid: 'o1_x', op: 'prefs' }); return window.__runway.sync(); });
    await expect(page.locator('#syncTxt')).toHaveText(/waiting/);
    await expect(page.locator('#syncTxt')).toBeVisible();
    await expect(page.locator('#stuckbar')).toBeHidden();
  });
});
