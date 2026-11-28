// 2.58 fix: entries from the sheet are named after their row, and a new entry above one moves it down a row. Editing
// an entry while the sheet's copy arrives (with a new entry from another device above it) must still change that
// entry, once, and leave its neighbours alone. Before the fix, Save wrote over the neighbour: the edited entry was on
// the sheet twice and the neighbour was gone.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

function all(mock) { var out = []; Object.keys(mock.sheet.logs).forEach(function (k) { mock.sheet.logs[k].forEach(function (e) { out.push(e); }); }); return out; }

['popup', 'computer'].forEach(function (where) {
  test.describe(where, function () {
    if (where === 'computer') test.use({ viewport: { width: 1280, height: 800 }, screen: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
    test('a note changed while the sheet refreshes underneath is saved on that entry only (' + where + ')', async function ({ page, app, mock }) {
      await app.boot({ state: boot.connectedState(), flags: { __openMore: true } });
      await app.synced();
      await page.locator('.tab[data-v="activity"]').click();
      await page.waitForTimeout(600);
      var row = page.locator('#view button.tx[data-act="edit"]').nth(3);
      var title = (await row.locator('b').first().textContent()).trim();
      var before = all(mock), target = before.filter(function (e) { return e.v === title; }).length;
      if (where === 'computer') await row.click(); else await row.tap();
      var form = where === 'computer' ? '#insp' : '#sheet';
      await expect(page.locator(form + ' #f_n')).toBeVisible();

      // meanwhile another device adds an entry at the top of this month, and Piggy picks up the sheet's copy
      mock.add({ k: 'e', y: 2026, m: 10, v: 'Other Device', c: 'gas', a: 1.5, d: '2026-11-18' });
      if (mock.touch) mock.touch();
      var t0 = await app.now();
      await page.evaluate(function () { return window.__runway.sync(true); });
      await app.synced(t0);

      await page.fill(form + ' #f_n', 'just the note');
      if (where === 'computer') await page.click(form + ' #f_save'); else await page.tap(form + ' #f_save');
      await expect.poll(function () { return mock.log.filter(function (l) { return l.action === 'update'; }).length; }).toBe(1);
      var after = all(mock);
      expect(after.length).toBe(before.length + 1);                                     // only the other device's entry is new
      expect(after.filter(function (e) { return e.v === title; }).length).toBe(target);   // the edited one isn't doubled
      expect(after.filter(function (e) { return e.v === title && e.n === 'just the note'; }).length).toBe(1);
      // and every entry that was there before is still there, unchanged apart from the note
      var key = function (e) { return e.m + '|' + e.v + '|' + e.c + '|' + e.a; };
      expect(after.map(key).filter(function (k) { return k !== '10|Other Device|gas|1.5'; }).sort()).toEqual(before.map(key).sort());
    });
  });
});

test('ids stay unique and stable across refreshes', async function ({ page, app, mock }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  var ids1 = await app.S(function () { var m = {}; window.__runway.S.tx.forEach(function (t) { m[t.v + '|' + t.a + '|' + t.d] = t.id; }); return m; });
  mock.add({ k: 'e', y: 2026, m: 10, v: 'Top Of Month', c: 'gas', a: 2, d: '2026-11-18' });
  if (mock.touch) mock.touch();
  var t0 = await app.now();
  await page.evaluate(function () { return window.__runway.sync(true); });
  await app.synced(t0);
  var r = await app.S(function () {
    var m = {}, ids = {}, dup = 0;
    window.__runway.S.tx.forEach(function (t) { m[t.v + '|' + t.a + '|' + t.d] = t.id; if (ids[t.id]) dup++; ids[t.id] = 1; });
    return { m: m, dup: dup };
  });
  expect(r.dup).toBe(0);
  var changed = Object.keys(ids1).filter(function (k) { return r.m[k] !== ids1[k]; });
  expect(changed).toEqual([]);
});
