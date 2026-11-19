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

// a computer that shows scrollbars: opening a side panel pins the page and its scrollbar goes, but nothing behind the
// panel may move sideways, and the panel and its dimmed backdrop still reach the window's edge
test.describe('side panel, 1280×720 with a scrollbar', function () {
  test.use({ viewport: { width: 1280, height: 720 }, screen: { width: 1280, height: 720 }, hasTouch: false, isMobile: false });
  test('the page behind doesn’t shift when a panel opens or closes @chromium', async function ({ page, app }) {
    await app.boot({ state: boot.connectedState() });
    await app.synced();
    function pos() {
      return page.evaluate(function () {
        var c = document.querySelector('#view .card').getBoundingClientRect();
        return { left: Math.round(c.left), right: Math.round(c.right), bar: innerWidth - document.documentElement.clientWidth };
      });
    }
    var before = await pos();
    expect(before.bar, 'the page shows a scrollbar').toBeGreaterThan(0);
    await page.click('.top [data-act="settings"]');
    await expect(page.locator('#sheet.on')).toBeVisible();
    await page.waitForTimeout(500);
    var open = await pos();
    expect({ left: open.left, right: open.right }).toEqual({ left: before.left, right: before.right });
    var edge = await page.evaluate(function () { return [document.getElementById('sheet').getBoundingClientRect().right, document.getElementById('scrim').getBoundingClientRect().right, innerWidth]; });
    expect(edge[0]).toBe(edge[2]);
    expect(edge[1]).toBe(edge[2]);
    await page.evaluate(function () { window.__runway.closeSheet(); });
    await page.waitForTimeout(500);
    expect(await pos()).toEqual(before);
  });
});

// bars pinned to the window (Plan's "1 change · Review & save") stay put too when a panel opens over them
test.describe('Plan bar, 1280×720 with a scrollbar', function () {
  test.use({ viewport: { width: 1280, height: 720 }, screen: { width: 1280, height: 720 }, hasTouch: false, isMobile: false });
  test('Review & save opens without the change bar moving @chromium', async function ({ page, app }) {
    await app.boot({ state: { v: 1, demo: true, tx: [], outbox: [], welcomed: true, toured: true, hu: 2026 * 12 + 10, cfg: {} } });
    await page.click('.tab[data-v="plan"]');
    await page.waitForFunction(function () { return !document.documentElement.hasAttribute('data-vt'); });
    await page.locator('#view [data-act="pgogrp"]').first().click();
    await page.evaluate(function () { var R = window.__runway; R.S.plan.vals.rent = { g: 'bills', a: 9999 }; R.render(); });
    var bar = page.locator('#plan_bar .pbar');
    await expect(bar).toBeVisible();
    expect(await page.evaluate(function () { return innerWidth - document.documentElement.clientWidth; }), 'the page shows a scrollbar').toBeGreaterThan(0);
    var before = await bar.boundingBox();
    await page.click('#plan_bar [data-act="psave"]');
    await expect(page.locator('#sheet.on')).toBeVisible();
    await page.waitForTimeout(500);
    var open = await bar.boundingBox();
    expect(Math.round(open.x)).toBe(Math.round(before.x));
  });
});

// a mouse press that starts during the tab cross-fade and lets go after it has ended still clicks what's under it
['', ' @chromium'].forEach(function (tag) {
  test.describe('quick click after a tab switch, 1280×720', function () {
    test.use({ viewport: { width: 1280, height: 720 }, screen: { width: 1280, height: 720 }, hasTouch: false, isMobile: false });
    test('a press during the cross-fade, released after it, isn’t lost' + tag, async function ({ page, app }) {
      await app.boot({ state: { v: 1, demo: true, tx: [], outbox: [], welcomed: true, toured: true, hu: 2026 * 12 + 10, cfg: {} } });
      await page.addStyleTag({ content: 'html[data-vt]::view-transition-old(root),html[data-vt]::view-transition-new(root){animation-duration:.6s !important}' });
      await page.click('.tab[data-v="plan"]');
      await page.waitForFunction(function () { return !document.documentElement.hasAttribute('data-vt'); });
      var box = await page.locator('#view [data-act="pgogrp"]').first().boundingBox();
      await page.click('.tab[data-v="month"]');
      await page.waitForFunction(function () { return !document.documentElement.hasAttribute('data-vt'); });
      await page.click('.tab[data-v="plan"]');                                  // the cross-fade starts…
      await page.waitForTimeout(150);
      expect(await page.evaluate(function () { return document.documentElement.hasAttribute('data-vt'); })).toBe(true);
      await page.mouse.move(box.x + 30, box.y + box.height / 2);
      await page.mouse.down();                                                 // …the press lands on it…
      await page.waitForTimeout(700);                                          // …and lets go after it's over
      await page.mouse.up();
      await expect.poll(function () { return page.evaluate(function () { return window.__runway.S.plan.step; }); }).toBe('edit');
    });
  });
});

// a popup opened on top of another (Bills from Settings) has a Back button that returns to it
test.describe('Settings → Bills, 1280×720', function () {
  test.use({ viewport: { width: 1280, height: 720 }, screen: { width: 1280, height: 720 }, hasTouch: false, isMobile: false });
  test('Bills opened from Settings goes Back to Settings', async function ({ page, app }) {
    await app.boot({ state: boot.connectedState() });
    await app.synced();
    await page.click('.top [data-act="settings"]');
    await expect(page.locator('#sheet.on')).toBeVisible();
    var open = page.locator('#sheet [data-act="recur"]').first();
    if (!(await open.isVisible())) {                                          // it may live inside a closed section
      var sec = page.locator('#sheet details[data-sec]:has([data-act="recur"]) > summary').first();
      await sec.click();
    }
    await page.locator('#sheet [data-act="recur"]').first().click();
    await expect(page.locator('#sheet .shead h2')).toHaveText('Recurring bills');
    await expect(page.locator('#sheet .shead [data-act="sback"]')).toHaveText('Back');
    await page.locator('#sheet .shead [data-act="sback"]').click();
    await expect(page.locator('#sheet .shead h2')).toHaveText('Settings');
  });
});
