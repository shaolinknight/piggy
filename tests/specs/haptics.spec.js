// Haptics on iPhone: one kind of tap, flicked from a hidden switch. It can be turned off (Settings → This phone), the
// switch's own click must never reach the app as a "phantom tap", and it must not take focus from the box you're typing in.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

// haptic() only uses the switch on iPhone/iPad
test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });

// count the switch being flicked, and any of its clicks that get past the app's guard to the page
function counter() {
  window.__taps = 0; window.__leaks = 0;
  var click = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () { if (this.id === 'hapt') window.__taps++; return click.apply(this, arguments); };
  document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('#hapt')) window.__leaks++; }, true);
}
function taps(page) { return page.evaluate(function () { return { taps: window.__taps, leaks: window.__leaks }; }); }

async function addEntry(page, v) {
  await page.tap('#fab');
  await page.fill('#f_a', '2.50'); await page.fill('#f_v', v);
  await page.tap('#f_quick button >> nth=0');
  await page.tap('#f_save');
  await expect(page.locator('#toastBtn')).toHaveText('Undo');
}

test('saving and arming a delete each give one tap, with no phantom clicks', async function ({ page, app }) {
  await page.addInitScript(counter);
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await addEntry(page, 'Haptic One');
  expect((await taps(page)).taps).toBe(1);

  await page.waitForTimeout(100);
  await page.tap('.tab[data-v="activity"]');
  await page.locator('#view button.tx[data-act="edit"]').first().tap();
  await page.locator('#f_a').focus();
  await page.locator('#f_del').dispatchEvent('click');                     // first tap arms "Sure? Tap again"
  await expect(page.locator('#f_del')).toHaveText('Sure? Tap again');
  var t = await taps(page);
  expect(t.taps).toBe(2);
  expect(t.leaks).toBe(0);
  expect(await page.evaluate(function () { return document.activeElement && document.activeElement.id; })).toBe('f_a');   // focus stayed
});

test('turning haptics off in Settings silences every tap', async function ({ page, app }) {
  await page.addInitScript(counter);
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await page.tap('header [data-act="settings"]');
  await page.locator('#sheet details[data-sec="device"] > summary').tap();   // Settings → This phone
  var off = page.locator('#sheet [data-act="haptic"][data-v="off"]');
  await expect(off).toBeVisible();
  await off.dispatchEvent('click');
  await expect(off).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(function () { return window.__runway.S.cfg.haptic; })).toBe(false);
  await page.evaluate(function () { window.__runway.closeSheet(); });
  await page.waitForTimeout(400);

  await addEntry(page, 'Haptic Off');
  expect((await taps(page)).taps).toBe(0);

  await page.tap('header [data-act="settings"]');                           // and back on: the switch confirms with a tap
  if (!(await page.locator('#sheet details[data-sec="device"][open]').count())) await page.locator('#sheet details[data-sec="device"] > summary').tap();
  await page.locator('#sheet [data-act="haptic"][data-v="on"]').dispatchEvent('click');
  expect((await taps(page)).taps).toBe(1);
});
