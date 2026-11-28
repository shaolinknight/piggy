// 2.50: everyday interactions animate only transform and opacity (layout and paint animations stutter on a phone),
// and the things that open and close still open and close.
'use strict';
var f = require('../support/fixtures');
var test = f.test, expect = f.expect, boot = f.boot;

// every property that starts animating: CSS transitions, CSS animations (also on ::before/::after) and element.animate()
function recorder() {
  var seen = window.__animated = [];
  function add(el, p, how) { seen.push(p + ' on ' + (el.id ? '#' + el.id : el.className && el.className.baseVal === undefined ? '.' + String(el.className).split(' ')[0] : el.tagName) + ' (' + how + ')'); }
  document.addEventListener('transitionrun', function (e) { add(e.target, e.propertyName, 'transition'); }, true);
  document.addEventListener('animationstart', function (e) {
    document.getAnimations().forEach(function (a) {
      if (a.animationName !== e.animationName || !a.effect || a.effect.target !== e.target) return;
      a.effect.getKeyframes().forEach(function (k) { Object.keys(k).forEach(function (p) { if (!/^(offset|easing|composite|computedOffset)$/.test(p)) add(e.target, p, 'animation ' + e.animationName); }); });
    });
  }, true);
  var anim = Element.prototype.animate;
  Element.prototype.animate = function (kf) {
    var el = this;
    (Array.isArray(kf) ? kf : [kf]).forEach(function (k) { Object.keys(k || {}).forEach(function (p) { if (!/^(offset|easing|composite)$/.test(p)) add(el, p, 'animate()'); }); });
    return anim.apply(this, arguments);
  };
}
var CHEAP = /^(transform|opacity|visibility|translate|scale|rotate)\b/;
function heavy(page) { return page.evaluate(function () { return window.__animated.slice(); }).then(function (l) { return l.filter(function (x) { return !CHEAP.test(x); }); }); }

test('everyday interactions animate only transform and opacity', async function ({ page, app }) {
  await page.addInitScript(recorder);
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await page.reload();                                                     // opening the app (bars grow)
  await app.synced(await app.now() - 60000);
  await page.waitForTimeout(800);

  var group = page.locator('#view [data-act="mgrp"]').first();             // a Month group opens, then closes
  await group.tap();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#view .mgroup.open .mgbody').first()).toBeVisible();
  await page.waitForTimeout(400);
  await group.tap();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await page.waitForTimeout(400);

  await page.tap('.tab[data-v="activity"]');                               // an entry opens for editing, then closes
  await page.locator('#view button.tx[data-act="edit"]').nth(1).tap();
  await expect(page.locator('#sheet #txform')).toBeVisible();
  await page.waitForTimeout(400);
  await page.locator('#sheet [data-act="fcancel"]').tap();
  await expect(page.locator('#sheet #txform')).toHaveCount(0);
  await page.waitForTimeout(400);

  await page.tap('#fab');                                                  // a new entry arrives in the list
  await page.fill('#f_a', '4.04'); await page.fill('#f_v', 'Motion Test');
  await page.tap('#f_quick button >> nth=0');
  await page.tap('#f_save');
  await expect(page.locator('#view').getByText('Motion Test').first()).toBeVisible();
  await page.waitForTimeout(1500);

  expect(await heavy(page)).toEqual([]);
});

test('fold-out sections in Settings open and close, and only fade and glide', async function ({ page, app }) {
  await page.addInitScript(recorder);
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  await page.tap('header [data-act="settings"]');
  var sec = await page.locator('#sheet details[data-sec]:not([open])').first().getAttribute('data-sec');
  var d = page.locator('#sheet details[data-sec="' + sec + '"]');            // pinned: it won't match ":not([open])" once open
  await expect(d).toBeVisible();
  await d.locator(':scope > summary').tap();
  await expect(d).toHaveAttribute('open', '');
  await page.waitForTimeout(400);
  await d.locator(':scope > summary').tap();
  await expect(d).not.toHaveAttribute('open', '');
  await page.waitForTimeout(400);
  expect(await heavy(page)).toEqual([]);
});

test('a tap during the tab cross-fade isn’t lost', async function ({ page, app }) {
  await app.boot({ state: boot.connectedState() });
  await app.synced();
  // slow the cross-fade right down so the tap surely lands inside it
  await page.addStyleTag({ content: 'html[data-vt]::view-transition-old(root),html[data-vt]::view-transition-new(root){animation-duration:3s !important}' });
  await page.tap('.tab[data-v="activity"]');
  await page.waitForTimeout(300);
  expect(await page.evaluate(function () { return document.documentElement.getAttribute('data-vt'); })).not.toBeNull();
  var box = await page.locator('#view button.tx[data-act="edit"]').first().boundingBox();
  await page.touchscreen.tap(box.x + 40, box.y + box.height / 2);
  await expect(page.locator('#sheet #txform')).toBeVisible();
});
