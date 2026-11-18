// Updates: a new deploy reaches the phone by itself, the old cache is deleted, and there's no way to be
// stuck on an old copy. Each test runs its own copy of the site so it can "deploy" a new version mid-test.
// The service worker is on here (it's blocked in the other specs); the app runs on sample data, so no sheet is needed.
'use strict';
var f = require('../support/fixtures');
var server = require('../support/server');
var test = f.test, expect = f.expect, boot = f.boot;

test.use({ serviceWorkers: 'allow' });

var site;
test.beforeEach(async function () { site = await server.start(); });
test.afterEach(async function () { await site.close().catch(function () {}); });

// the version of the page that's running (the app's code is wrapped in a function, so it's read from the script itself)
function version(page) {
  return page.evaluate(function () {
    for (var i = 0; i < document.scripts.length; i++) { var m = /var VERSION = '([^']+)'/.exec(document.scripts[i].text); if (m) return m[1]; }
    return null;
  }).catch(function () { return null; });
}
function cacheNames(page) { return page.evaluate(function () { return caches.keys(); }).catch(function () { return null; }); }
function cacheNum(text) { return +/piggy-shell-(\d+)/.exec(text)[1]; }

async function installed(page) {
  await boot.prepare(page, { clock: false });
  await page.goto(site.url);
  await page.waitForFunction(function () { return !!navigator.serviceWorker.controller; });
  var sw = site.original('sw.js'), n = cacheNum(sw);
  await expect.poll(function () { return cacheNames(page); }).toEqual(['piggy-shell-' + n]);
  return { sw: sw, n: n, html: site.original('index.html'), v: await version(page) };
}
function newPage(html, v) { return html.replace(/var VERSION = '[^']+';/, "var VERSION = '" + v + "';"); }

test('a new deploy is picked up on the next open and the old cache is deleted', async function ({ page }) {
  var was = await installed(page);
  site.deploy('/index.html', newPage(was.html, '9.98'));
  site.deploy('/sw.js', was.sw.replace(/piggy-shell-\d+/, 'piggy-shell-' + (was.n + 1)));

  await page.reload();               // the stored (old) copy opens at once; the worker fetches the new one, says so,
                                     // and the app reloads itself because it was opened seconds ago
  await expect.poll(function () { return version(page); }, { timeout: 20000 }).toBe('9.98');
  await expect.poll(function () { return cacheNames(page); }, { timeout: 20000 }).toEqual(['piggy-shell-' + (was.n + 1)]);

  await page.reload();               // and it stays new
  expect(await version(page)).toBe('9.98');
});

test('a new page without a cache bump still arrives (no way to be stuck on an old copy)', async function ({ page }) {
  var was = await installed(page);
  site.deploy('/index.html', newPage(was.html, '9.97'));   // sw.js unchanged: the worker itself isn't updated

  await page.reload();
  await expect.poll(function () { return version(page); }, { timeout: 20000 }).toBe('9.97');
  expect(await cacheNames(page)).toEqual(['piggy-shell-' + was.n]);
  await page.reload();
  expect(await version(page)).toBe('9.97');
});

test('an app open for a while offers "Reload" instead of reloading under your finger', async function ({ page }) {
  await boot.prepare(page, { clock: true });
  await page.goto(site.url);
  await page.waitForFunction(function () { return !!navigator.serviceWorker.controller; });
  var html = site.original('index.html');
  site.deploy('/index.html', newPage(html, '9.96'));
  await page.clock.fastForward(31 * 60000);                // the app asks for the page every 30 minutes while it's open
  await expect(page.locator('#toastTxt')).toHaveText(/A new version of .+ is ready/);
  await expect(page.locator('#toastBtn')).toHaveText('Reload');
  expect(await version(page)).not.toBe('9.96');
  await page.tap('#toastBtn');
  await expect.poll(function () { return version(page); }, { timeout: 20000 }).toBe('9.96');
});

test('works offline once installed', async function ({ page }) {
  await installed(page);
  await site.close();                                       // the site can't be reached at all
  await page.reload();
  await expect(page.locator('#view .card.hero')).toBeVisible();
});
