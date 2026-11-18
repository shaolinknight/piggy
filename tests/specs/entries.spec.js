// Adding, editing and deleting entries: the screen changes at once, the change goes to the sheet
// exactly once, and Undo puts things back (on the phone and in the sheet).
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

async function ready(app) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
}
async function addEntry(page, o) {
  await page.tap('#fab');
  await expect(page.locator('#sheet #txform')).toBeVisible();
  await page.fill('#f_a', o.a);
  await page.fill('#f_v', o.v);
  await page.tap('#f_quick button[data-v="' + (o.c || 'groceries') + '"]');
  await page.tap('#f_save');
}
function inSheet(mock, v) {
  return Object.keys(mock.sheet.logs).reduce(function (n, k) { return n + mock.sheet.logs[k].filter(function (e) { return e.v === v; }).length; }, 0);
}
function local(page, v) {
  return page.evaluate(function (v) { return window.__runway.S.tx.filter(function (t) { return t.v === v; }).length; }, v);
}
// open the newest entry in Activity for editing
async function openNewest(page) {
  await page.tap('.tab[data-v="activity"]');
  var row = page.locator('#view button.tx[data-act="edit"]').first();
  var id = await row.getAttribute('data-v');
  await row.tap();
  await expect(page.locator('#view #txform')).toBeVisible();
  return id;
}

test('add an entry: shows at once, reaches the sheet once, Undo takes it back', async function ({ page, app, mock }) {
  await ready(app);
  mock.latency = 1500;                                      // the sheet is slow: the screen must not wait for it
  await addEntry(page, { a: '12.34', v: 'Test Add' });
  await expect(page.locator('#toastTxt')).toHaveText('Added $12.34 · groceries');
  await expect(page.locator('#sheet')).not.toHaveClass(/\bon\b/);
  expect(await local(page, 'Test Add')).toBe(1);
  expect(inSheet(mock, 'Test Add')).toBe(0);                // not there yet…
  await expect.poll(function () { return inSheet(mock, 'Test Add'); }, { timeout: 15000 }).toBe(1);   // …then exactly once

  await page.tap('#toastBtn');                              // Undo
  expect(await local(page, 'Test Add')).toBe(0);
  await expect.poll(function () { return inSheet(mock, 'Test Add'); }, { timeout: 15000 }).toBe(0);
  expect(mock.applied.filter(function (a) { return a.action === 'add'; }).length).toBe(1);
  expect(mock.applied.filter(function (a) { return a.action === 'delete'; }).length).toBe(1);
});

test('edit an entry: the new amount shows and is sent; Undo restores it', async function ({ page, app, mock }) {
  await ready(app);
  var id = await openNewest(page);
  var before = await page.evaluate(function (id) { var t = window.__runway.S.tx.filter(function (x) { return x.id === id; })[0]; return { a: t.a, v: t.v }; }, id);
  await page.fill('#f_a', '999.99');
  await page.tap('#f_save');
  await expect(page.locator('#toastBtn')).toHaveText('Undo');
  await expect(page.locator('#view #txform')).toHaveCount(0);
  await expect(page.locator('#view').getByText('$999.99').first()).toBeVisible();
  await expect.poll(function () { return mock.sheet.logs.e2026.filter(function (e) { return e.v === before.v && e.a === 999.99; }).length; }).toBe(1);

  await page.tap('#toastBtn');
  await expect(page.locator('#toastTxt')).toHaveText('Undone');
  await expect.poll(function () { return mock.sheet.logs.e2026.filter(function (e) { return e.a === 999.99; }).length; }).toBe(0);
  expect(mock.applied.filter(function (a) { return a.action === 'update'; }).length).toBe(2);
  expect(await page.evaluate(function () { return window.__runway.S.tx.filter(function (t) { return t.a === 999.99; }).length; })).toBe(0);
});

test('delete an entry: two taps to confirm, gone at once; Undo brings it back', async function ({ page, app, mock }) {
  await ready(app);
  var id = await openNewest(page);
  var t = await page.evaluate(function (id) { var t = window.__runway.S.tx.filter(function (x) { return x.id === id; })[0]; return { a: t.a, v: t.v, c: t.c }; }, id);
  var n0 = mock.rows();
  await page.tap('#f_del');
  await expect(page.locator('#f_del')).toHaveText('Sure? Tap again');
  expect(await page.evaluate(function (id) { return !!window.__runway.S.tx.filter(function (x) { return x.id === id; }).length; }, id)).toBe(true);
  await page.tap('#f_del');
  await expect(page.locator('#toastTxt')).toHaveText(/^Deleted \$[\d,.]+ · /);
  await expect.poll(function () { return mock.rows(); }).toBe(n0 - 1);

  await page.tap('#toastBtn');
  await expect.poll(function () { return mock.rows(); }).toBe(n0);
  expect(await local(page, t.v)).toBeGreaterThan(0);
});

test('offline: the change is queued, survives a restart, then is sent once back online', async function ({ page, context, app, mock }) {
  await ready(app);
  await context.setOffline(true);
  await addEntry(page, { a: '4.50', v: 'Offline Coffee', c: 'coffee' });
  await expect(page.locator('#toastTxt')).toHaveText('Added $4.50 · coffee');
  await expect(page.locator('#syncTxt')).toHaveText(/^\d+ waiting$/);      // the entry (and a settings update) are queued
  var saved = await app.saved();
  expect(saved.outbox.filter(function (o) { return o.op === 'add'; }).length).toBe(1);
  expect(inSheet(mock, 'Offline Coffee')).toBe(0);

  // the app is closed and opened again while the sheet still can't be reached. (The page itself needs the network
  // here because tests run without the service worker; on the phone the worker would serve it offline.)
  mock.fail('offline');
  await context.setOffline(false);
  await page.reload();
  expect(await local(page, 'Offline Coffee')).toBe(1);
  await expect.poll(function () { return mock.log.some(function (l) { return l.status === 'offline'; }); }).toBe(true);
  await expect(page.locator('#syncTxt')).toHaveText(/^\d+ waiting$/);     // queued changes outrank "Sync issue" in the bar
  expect(inSheet(mock, 'Offline Coffee')).toBe(0);

  mock.heal();                                              // back online: "online" fires and the app syncs by itself
  await context.setOffline(true);
  await context.setOffline(false);
  await expect.poll(function () { return inSheet(mock, 'Offline Coffee'); }, { timeout: 15000 }).toBe(1);
  await app.synced();
  expect(await local(page, 'Offline Coffee')).toBe(1);
});

test('a save that can never succeed is dropped with a toast, and the sheet’s copy wins', async function ({ page, app, mock }) {
  await ready(app);
  mock.fail({ error: 'not_found' }, { action: 'update', times: 1 });
  await openNewest(page);
  await page.fill('#f_a', '321.00');
  await page.tap('#f_save');
  await expect(page.locator('#toastTxt')).toHaveText('A change couldn’t be matched to a sheet row (it was edited there). Skipped.');
  await app.synced();
  // no rollback of its own: the pull after the failed save puts the sheet's amount back
  expect(await page.evaluate(function () { return window.__runway.S.tx.filter(function (t) { return t.a === 321; }).length; })).toBe(0);

  mock.fail({ error: 'bad_entry' }, { action: 'add', times: 1 });
  await addEntry(page, { a: '8.00', v: 'Rejected Add' });
  await expect(page.locator('#toastTxt')).toHaveText('The sheet rejected a change: bad_entry');
  await app.synced();
  expect(await local(page, 'Rejected Add')).toBe(0);
  expect(inSheet(mock, 'Rejected Add')).toBe(0);
});

test('a retried change is not applied twice (oid)', async function ({ page, app, mock }) {
  await ready(app);
  mock.fail('lost', { action: 'add', times: 1 });           // the sheet adds it, but the answer never arrives
  await addEntry(page, { a: '15.00', v: 'Lost Answer' });
  await expect.poll(function () { return mock.count('add'); }).toBe(1);
  expect(inSheet(mock, 'Lost Answer')).toBe(1);
  await page.tap('#syncBtn');                               // retry (as the next open or "online" would)
  await expect.poll(function () { return mock.count('add'); }).toBe(2);
  await app.synced();
  var adds = mock.log.filter(function (l) { return l.action === 'add'; });
  expect(adds[0].oid).toBeTruthy();
  expect(adds[1].oid).toBe(adds[0].oid);                    // same change id the second time…
  expect(adds[1].status).toBe('ok');
  expect(inSheet(mock, 'Lost Answer')).toBe(1);             // …so the sheet still has it once
  expect(await local(page, 'Lost Answer')).toBe(1);
});
