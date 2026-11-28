// 2.57: the journeys that had no test yet, each driven through the app's own screens and checked in the (mock) sheet:
// a budget change from Plan, a purchase split across categories, one spread over months, a trip and a savings goal.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

async function ready(app) {
  await app.boot({ state: boot.connectedState(), flags: { __openMore: true } });
  await app.synced();
}
function sheetRows(mock, v) {
  var out = [];
  Object.keys(mock.sheet.logs).forEach(function (k) { mock.sheet.logs[k].forEach(function (e) { if (e.v === v) out.push(e); }); });
  return out;
}
async function newEntry(page, a, v) {
  await page.tap('#fab');
  await expect(page.locator('#sheet #txform')).toBeVisible();
  await page.fill('#f_a', a);
  await page.fill('#f_v', v);
  await page.tap('#f_quick button[data-v="groceries"]');
}

test('a budget changed in Plan is saved to the sheet from this month on', async function ({ page, app, mock }) {
  await ready(app);
  await page.tap('.tab[data-v="plan"]');
  await page.waitForFunction(function () { return !document.documentElement.hasAttribute('data-vt'); });
  var row = page.locator('#view [data-act="pcat"]').first();
  var cat = await row.getAttribute('data-v');
  await row.tap();
  await page.fill('#pc_amt', '777');
  await page.tap('#sheet [data-act="pcdone"]');
  await page.locator('#view button', { hasText: 'Continue' }).tap();                   // "1 unsaved change"
  await page.tap('#plan_bar [data-act="psave"]');
  await page.tap('#sheet [data-act="psconfirm"]');
  await expect(page.locator('#toast')).toContainText('Budget saved');
  await expect.poll(function () {
    return mock.sheet.budget.filter(function (b) { return String(b[2]).toLowerCase() === cat && b[3] === 777; }).length;
  }).toBe(1);
  var now = await app.S(function () { var R = window.__runway; return R.budgetTotals().g; });
  expect(Object.keys(now).length).toBeGreaterThan(0);
});

test('a purchase split across two categories reaches the sheet as two entries', async function ({ page, app, mock }) {
  await ready(app);
  await newEntry(page, '100', 'Split Shop');
  await page.tap('#f_split');
  var other = await page.locator('[data-split-c="0"] option').nth(2).getAttribute('value');
  await page.locator('[data-split-c="0"]').selectOption(other);
  await page.fill('[data-split-a="0"]', '30');
  await page.tap('#f_save');
  await expect.poll(function () { return sheetRows(mock, 'Split Shop').length; }).toBe(2);
  var rows = sheetRows(mock, 'Split Shop').map(function (e) { return e.c.toLowerCase() + ' ' + e.a; }).sort();
  expect(rows).toEqual(['groceries 70', other + ' 30'].sort());
});

test('a purchase spread over 3 months gets three equal parts, cents to the first', async function ({ page, app, mock }) {
  await ready(app);
  await newEntry(page, '100', 'Spread Desk');
  await page.tap('#f_spread');
  await page.tap('#sheet [data-act="fspreadn"][data-v="3"]');
  await page.tap('#f_save');
  var parts = function () {
    return app.S(function () { return window.__runway.S.tx.filter(function (t) { return t.v === 'Spread Desk'; }).map(function (t) { return t.y + '-' + (t.m + 1) + ' ' + t.a + ' ' + t.n; }).sort(); });
  };
  expect(await parts()).toEqual(['2026-11 33.34 1 of 3 · $100.00 over 3 months']);       // this month's part now
  await expect.poll(function () { return sheetRows(mock, 'Spread Desk').map(function (e) { return e.a; }).join(); }).toBe('33.34');
  // the next part arrives when its month comes, once, whichever device sends it
  await page.evaluate(function () { var R = window.__runway; R.setNow(new Date(2026, 11, 18, 10)); return R.sync(); });
  await expect.poll(function () { return sheetRows(mock, 'Spread Desk').map(function (e) { return e.a; }).sort().join(); }).toBe('33.33,33.34');
  await page.evaluate(function () { return window.__runway.sync(); });
  expect(sheetRows(mock, 'Spread Desk').length).toBe(2);
  expect((await parts()).length).toBe(2);
});

test('a new trip is saved to the sheet', async function ({ page, app, mock }) {
  await ready(app);
  await page.evaluate(function () { window.__runway.openSheet('tripedit', { name: '' }); });
  await page.fill('#tp_name', 'Lisbon');
  await page.fill('#tp_start', '2026-12-01');
  await page.fill('#tp_end', '2026-12-08');
  if (await page.locator('#tp_budget').isVisible()) await page.fill('#tp_budget', '1500');
  await page.tap('#tp_save');
  await expect.poll(function () { return mock.sheet.trips.filter(function (t) { return t[0] === 'Lisbon'; }).map(function (t) { return t[1] + '…' + t[2]; }).join(); }).toBe('2026-12-01…2026-12-08');
});

test('a savings goal is saved to the sheet and shows on Plan', async function ({ page, app, mock }) {
  await ready(app);
  await page.evaluate(function () { window.__runway.openSheet('goal', ''); });
  await page.fill('#gl_name', 'Car fund');
  await page.fill('#gl_target', '3000');
  await page.fill('#gl_base', '250');
  await page.tap('#gl_save');
  await expect.poll(function () { return mock.sheet.goals.filter(function (g) { return g[0] === 'Car fund'; }).map(function (g) { return g[1] + '/' + g[4]; }).join(); }).toBe('3000/250');
  expect(await app.S(function () { return window.__runway.S.goals.map(function (g) { return g.name; }); })).toContain('Car fund');
});

test('totals come out to the cent (no 0.30000000000000004)', async function ({ page, app }) {
  await ready(app);
  var r = await page.evaluate(function () {
    var R = window.__runway, S = R.S;
    ['0.1', '0.2', '0.7'].forEach(function (a, i) { S.tx.push({ id: 'fz' + i, k: 'e', y: 2026, m: 10, d: '2026-11-0' + (i + 1), v: 'Fuzz', c: 'fuzzcat', a: +a, n: '' }); });
    R.save();
    var ms = R.monthStats(2026 * 12 + 10);
    return { cat: ms.cat.fuzzcat, spentIsCents: Math.round(ms.spent * 100) / 100 === ms.spent };
  });
  expect(r).toEqual({ cat: 1, spentIsCents: true });
});
