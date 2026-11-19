// Every tab renders at each iPhone size with no sideways scroll and no console errors.
// Tagged @screens so it also runs in the 375 (dark, reduced motion) and 402 projects.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

var TABS = ['month', 'activity', 'plan', 'trends'];

async function noSideScroll(page) {
  var w = await page.evaluate(function () { return { doc: document.documentElement.scrollWidth, vw: window.innerWidth }; });
  expect(w.doc, 'page is wider than the screen').toBeLessThanOrEqual(w.vw);
}

for (var fsize of ['m', 'xl']) {
  (function (fsize) {
    test('every tab fits the screen, text size ' + fsize + ' @screens', async function ({ page, app }, info) {
      var st = boot.connectedState();
      await app.boot({ state: st });
      await app.synced();
      if (fsize !== 'm') {
        await page.evaluate(function (fs) { window.__runway.S.cfg.fsize = fs; window.__runway.save(); }, fsize);
        await page.reload();
        await app.synced();
      }
      for (var tab of TABS) {
        await page.tap('.tab[data-v="' + tab + '"]');
        await expect(page.locator('.tab.on')).toHaveAttribute('data-v', tab);
        await page.waitForTimeout(400);                       // let the tab slide finish
        await noSideScroll(page);
        await page.screenshot({ path: info.outputPath(tab + '-' + fsize + '.png') });
      }
      await page.tap('#fab');
      await expect(page.locator('#sheet #txform')).toBeVisible();
      await page.waitForTimeout(500);
      await noSideScroll(page);
      // 2.51: the popup's top (handle, title, Close) is on screen, also with larger text (which zooms the page)
      var top = await page.evaluate(function () { return document.getElementById('sheet').getBoundingClientRect().top; });
      expect(top, 'the popup starts above the top of the screen').toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: info.outputPath('add-' + fsize + '.png') });
    });
  })(fsize);
}
