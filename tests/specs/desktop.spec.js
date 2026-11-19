// 2.54: on a computer, whatever the window size, an entry picked in Activity shows with Delete / Cancel / Save in view
// (pinned to the panel's foot when the fields don't fit), and the table's headings never run into each other.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

// a half-width window (panel floats over the list), a short laptop window, a common laptop size, and a big screen
var SIZES = [[1024, 640], [1100, 560], [1280, 620], [1440, 900], [1920, 1080]];

SIZES.forEach(function (s) {
  test.describe(s[0] + '×' + s[1], function () {
    test.use({ viewport: { width: s[0], height: s[1] }, screen: { width: s[0], height: s[1] }, hasTouch: false, isMobile: false });

    test('the picked entry’s buttons are in view and the table fits', async function ({ page, app }) {
      await app.boot({ state: boot.connectedState() });
      await app.synced();
      await page.click('.tab[data-v="activity"]');
      await page.waitForFunction(function () { return !document.documentElement.hasAttribute('data-vt'); });
      await page.locator('#view button.tx[data-act="edit"]').first().click();
      await expect(page.locator('#insp #txform')).toBeVisible();
      await page.waitForTimeout(300);                                       // the floating panel has risen into place
      var r = await page.evaluate(function () {
        var ins = document.getElementById('insp').getBoundingClientRect();
        var ok = ['f_del', 'f_save'].every(function (id) {
          var b = document.getElementById(id).getBoundingClientRect();
          return b.top >= 0 && b.bottom <= innerHeight && b.bottom <= ins.bottom + 0.5 && b.right <= innerWidth;
        });
        var heads = [].slice.call(document.querySelectorAll('#thead .th')).filter(function (e) { return e.offsetWidth; })
          .map(function (e) { var b = e.getBoundingClientRect(); return [b.left, b.left + e.scrollWidth]; });
        return { buttons: ok, overlap: heads.some(function (h, i) { return i && heads[i - 1][1] > h[0] + 1; }),
          sideways: document.documentElement.scrollWidth > innerWidth, scrolled: scrollY };
      });
      expect(r).toEqual({ buttons: true, overlap: false, sideways: false, scrolled: 0 });

      // the bar sits exactly on the panel's foot wherever the fields are scrolled: nothing peeks out beneath it, and
      // its own last line (the keyboard hint) isn't clipped
      for (var at of [0, 0.5, 1]) {
        var g = await page.evaluate(function (at) {
          var i = document.getElementById('insp'); i.scrollTop = at * (i.scrollHeight - i.clientHeight);
          var bar = i.querySelector('.form>.btns').getBoundingClientRect(), r = i.getBoundingClientRect(), edge = r.bottom - parseFloat(getComputedStyle(i).borderBottomWidth);
          var last = bar.bottom; [].forEach.call(i.querySelectorAll('.form>.btns > *'), function (e) { last = Math.max(last, e.getBoundingClientRect().bottom); });
          return { gap: Math.round(edge - bar.bottom), clipped: last > edge + 0.5 };
        }, at);
        expect(g, 'scrolled ' + at * 100 + '%').toEqual({ gap: 0, clipped: false });
      }

      await page.click('#insp [data-act="fcancel"]');                      // closing it: nothing is left floating
      if (s[0] < 1100) await expect(page.locator('#insp')).toBeHidden();
      else await expect(page.locator('#insp .iempty')).toBeVisible();
    });
  });
});

test.describe('preview data, 1280×620', function () {
  test.use({ viewport: { width: 1280, height: 620 }, screen: { width: 1280, height: 620 }, hasTouch: false, isMobile: false });
  test('nothing sits below the pinned buttons', async function ({ page, app }) {
    await app.boot({ state: { v: 1, demo: true, tx: [], outbox: [], welcomed: true, toured: true, hu: 2026 * 12 + 10, cfg: {} } });
    await page.click('.tab[data-v="activity"]');
    await page.waitForFunction(function () { return !document.documentElement.hasAttribute('data-vt'); });
    await page.locator('#view button.tx[data-act="edit"]').first().click();
    await expect(page.locator('#insp #txform')).toBeVisible();
    var g = await page.evaluate(function () {
      var i = document.getElementById('insp'); i.scrollTop = 1e6;
      var bar = i.querySelector('.form>.btns'), r = i.getBoundingClientRect();
      return { last: !bar.nextElementSibling, gap: Math.round(r.bottom - parseFloat(getComputedStyle(i).borderBottomWidth) - bar.getBoundingClientRect().bottom) };
    });
    expect(g).toEqual({ last: true, gap: 0 });
  });
});

// the New entry panel's pinned bar stays put as you scroll its fields (it used to rest 14px higher at the end)
[[1280, 620, false], [375, 667, true]].forEach(function (v) {
  test.describe('New entry, ' + v[0] + '×' + v[1], function () {
    test.use({ viewport: { width: v[0], height: v[1] }, screen: { width: v[0], height: v[1] }, hasTouch: v[2], isMobile: v[2] });
    test('the Add bar doesn’t move while scrolling', async function ({ page, app }) {
      await app.boot({ state: boot.connectedState() });
      await app.synced();
      if (v[2]) await page.tap('#fab'); else await page.click('#fab');
      await expect(page.locator('#sheet #txform')).toBeVisible();
      await page.waitForTimeout(500);                                       // the sheet has slid in
      for (var at of [0, 0.5, 1]) {
        var gap = await page.evaluate(function (at) {
          var sh = document.getElementById('sheet'); sh.scrollTop = at * (sh.scrollHeight - sh.clientHeight);
          return sh.getBoundingClientRect().bottom - parseFloat(getComputedStyle(sh).borderBottomWidth) - sh.querySelector('.btns.stickybar').getBoundingClientRect().bottom;
        }, at);
        expect(Math.abs(gap), 'scrolled ' + at * 100 + '%').toBeLessThan(1);
      }
    });
  });
});
