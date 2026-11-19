// 2.54: a bill can be marked paid from its own popup (tap it in Month's Bills): early, while its due date is still
// coming up, or any time when it has no due date. Undo takes the payment back out.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect;
var OUT = process.env.SHOTS;          // set to a folder to keep screenshots of the popup

var demo = { state: { v: 1, demo: true, tx: [], outbox: [], welcomed: true, toured: true, hu: 2026 * 12 + 10, cfg: {} } };
async function openBill(page, c) {
  var g = page.locator('#view [data-act="mgrp"]').filter({ hasText: 'Bills' }).first();
  if ((await g.getAttribute('aria-expanded')) !== 'true') await g.tap();
  await page.locator('#view .brw[data-v="' + c + '"]').tap();
  await expect(page.locator('#sheet .catbill')).toBeVisible();
  await page.waitForTimeout(450);
}
function paidIn(page, c) {
  return page.evaluate(function (c) { return window.__runway.S.tx.filter(function (t) { return t.c === c && t.y === 2026 && t.m === 10; }).map(function (t) { return { a: t.a, d: t.d }; }); }, c);
}

test('a bill with no due date can be marked paid, and Undo takes it back', async function ({ page, app }) {
  await app.boot(demo);
  await openBill(page, 'car insurance');
  if (OUT) await page.screenshot({ path: OUT + '/no-due-date.png' });
  var btn = page.locator('#sheet .cbpay [data-act="catpaid"]');
  await expect(btn).toHaveText('Mark paid');
  await btn.tap();
  await expect(page.locator('#toastTxt')).toHaveText('car insurance paid · $120.00');
  expect(await paidIn(page, 'car insurance')).toEqual([{ a: 120, d: '2026-11-18' }]);
  await expect(page.locator('#sheet .cbpay')).toHaveCount(0);                  // nothing left to mark
  await expect(page.locator('#view .brw[data-v="car insurance"]')).toContainText('✓ paid');
  await page.tap('#toastBtn');                                                 // Undo
  expect(await paidIn(page, 'car insurance')).toEqual([]);
  await expect(page.locator('#sheet .cbpay [data-act="catpaid"]')).toBeVisible();
});

test('a bill due later this month can be marked paid early', async function ({ page, app }) {
  await app.boot(demo);
  await page.evaluate(function () { var R = window.__runway; R.S.recur.push({ name: 'Car insurance', c: 'car insurance', a: 120, day: 25 }); R.save(); R.render(); });
  await openBill(page, 'car insurance');
  if (OUT) await page.screenshot({ path: OUT + '/due-later.png' });
  await expect(page.locator('#sheet .cbpay span')).toHaveText('due Nov 25 · in 7 days');
  var btn = page.locator('#sheet .cbpay [data-act="billpay"]');
  await expect(btn).toHaveText('Mark paid early');
  await btn.tap();
  await expect(page.locator('#toastTxt')).toHaveText('Car insurance paid · $120.00');
  expect(await paidIn(page, 'car insurance')).toEqual([{ a: 120, d: '2026-11-18' }]);    // logged today, not on the 25th
  await expect(page.locator('#sheet .cbpay')).toHaveCount(0);
  await expect(page.locator('#view .brw[data-v="car insurance"]')).toContainText('✓ paid');
  if (OUT) await page.screenshot({ path: OUT + '/after.png' });
});

test('a paid bill has nothing to mark', async function ({ page, app }) {
  await app.boot(demo);
  await openBill(page, 'rent');
  await expect(page.locator('#sheet .cbpay')).toHaveCount(0);
});
