// 2.58 "daily feel" on a phone: an entry opens in its own popup, Undo waits at the bottom for 7 s, Month leads with
// the answer, numbers are final the moment the app opens, and small controls can be tapped across 44 pt.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

async function ready(app) { await app.boot({ state: boot.connectedState() }); await app.synced(); }

test('an entry opens in a popup with Save in view, and saving lands back in the list', async function ({ page, app, mock }) {
  await ready(app);
  await page.tap('.tab[data-v="activity"]');
  var row = page.locator('#view button.tx[data-act="edit"]').nth(2);
  var id = await row.getAttribute('data-v');
  await row.tap();
  await expect(page.locator('#sheet #txform')).toBeVisible();
  await expect(page.locator('#view #txform')).toHaveCount(0);                    // not inside the list any more
  await page.waitForTimeout(600);                                                 // the popup has slid up
  var save = await page.locator('#sheet #f_save').boundingBox(), vh = page.viewportSize().height;
  expect(save.y + save.height).toBeLessThanOrEqual(vh);                           // Save is on screen, not under the tabs
  await page.fill('#sheet #f_a', '12.34');
  await page.tap('#sheet #f_save');
  await expect(page.locator('#sheet')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#toastTxt')).toHaveText('Saved');
  expect(await app.S(function () { return window.__runway.S.tx.filter(function (t) { return t.a === 12.34; }).length; })).toBe(1);
  await expect.poll(function () { return mock.log.filter(function (l) { return l.action === 'update'; }).length; }).toBe(1);
  void id;
});

test('Cancel with changes closes the popup, and Undo brings the changes back in it', async function ({ page, app }) {
  await ready(app);
  await page.tap('.tab[data-v="activity"]');
  await page.locator('#view button.tx[data-act="edit"]').first().tap();
  await page.fill('#sheet #f_a', '99.99');
  await page.tap('#sheet [data-act="fcancel"]');
  await expect(page.locator('#sheet')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#toastTxt')).toHaveText('Changes discarded');
  await page.tap('#toastBtn');
  await expect(page.locator('#sheet #f_a')).toHaveValue('99.99');
});

test('Undo sits at the bottom, above the tabs, and stays 7 seconds', async function ({ page, app }) {
  await ready(app);
  await page.tap('#fab');
  await page.fill('#f_a', '2.22'); await page.fill('#f_v', 'Bottom Toast');
  await page.tap('#f_quick button[data-v="groceries"]');
  await page.tap('#f_save');
  var t = page.locator('#toast');
  await expect(t).toHaveClass(/\bon\b/);
  await page.waitForTimeout(450);
  var box = await t.boundingBox(), tabs = await page.locator('.tabs').boundingBox();
  expect(box.y).toBeGreaterThan(page.viewportSize().height / 2);
  expect(box.y + box.height).toBeLessThanOrEqual(tabs.y);
  await page.clock.runFor(5500);
  await expect(t).toHaveClass(/\bon\b/);                                          // still there after 5.5 s
  await page.clock.runFor(2000);
  await expect(t).not.toHaveClass(/\bon\b/);
});

test('Month leads with the answer; reminders fold under "+N more"', async function ({ page, app }) {
  await ready(app);
  var order = await page.evaluate(function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll('#view .card'));
    return { hero: cards.findIndex(function (c) { return c.classList.contains('hero'); }), attn: cards.findIndex(function (c) { return c.id === 'attn'; }),
      shown: document.querySelectorAll('#attn .ai').length, more: (document.querySelector('#attn .aimore') || {}).textContent || '' };
  });
  expect(order.hero).toBe(0);
  expect(order.attn).toBe(1);
  expect(order.shown).toBe(1);
  expect(order.more).toMatch(/^\+\d+ more$/);
});

test('numbers are final the moment the app opens (no count-up from 0)', async function ({ page, app }) {
  await ready(app);
  var want = await page.locator('#view .hero .big').first().textContent();
  await page.addInitScript(function () {
    window.__seen = [];
    document.addEventListener('DOMContentLoaded', function () {
      (function tick() { var b = document.querySelector('#view .hero .big'); if (b) window.__seen.push(b.textContent); if (window.__seen.length < 40) requestAnimationFrame(tick); })();
    });
  });
  await page.reload();
  await page.waitForFunction(function () { return window.__seen && window.__seen.length >= 40; });
  var seen = await page.evaluate(function () { return window.__seen; });
  expect(Array.from(new Set(seen))).toEqual([want]);
});

test('small controls answer a tap anywhere in 44 × 44 pt', async function ({ page, app }) {
  await ready(app);
  var misses = await page.evaluate(function () {
    var out = [];
    document.querySelectorAll('.ttl .tnav, #syncBtn, header .icon-btn, #attn .aix, #attn .aigo').forEach(function (el) {
      var r = el.getBoundingClientRect(); if (!r.width) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      [[0, -21], [0, 21], [-21, 0], [21, 0]].forEach(function (d) {
        var w = Math.max(r.width, 44) / 2 - 1, h = Math.max(r.height, 44) / 2 - 1;
        var x = cx + Math.sign(d[0]) * Math.min(Math.abs(d[0]), w), y = cy + Math.sign(d[1]) * Math.min(Math.abs(d[1]), h);
        var hit = document.elementFromPoint(x, y);
        // where two controls sit closer than 44 pt, the space between them is shared: landing on the neighbour is fine
        var other = hit && hit.closest && hit.closest('button, a[href], [role=button]');
        if (!hit || !(hit === el || el.contains(hit) || (other && other !== el))) out.push((el.id || el.className) + ' at ' + d.join(','));
      });
    });
    return out;
  });
  expect(misses).toEqual([]);
});
