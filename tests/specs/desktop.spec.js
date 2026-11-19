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

      await page.click('#insp [data-act="fcancel"]');                      // closing it: nothing is left floating
      if (s[0] < 1100) await expect(page.locator('#insp')).toBeHidden();
      else await expect(page.locator('#insp .iempty')).toBeVisible();
    });
  });
});
