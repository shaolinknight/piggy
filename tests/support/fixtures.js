// Playwright fixtures: every test gets a fresh mock sheet routed into its context, a console-error
// collector that fails the test on any page error, and helpers to boot the app.
'use strict';
var base = require('@playwright/test');
var MockSheet = require('./mock-sheet').MockSheet;
var b = require('./boot');

var test = base.test.extend({
  mock: async function ({ context }, use) {
    var m = new MockSheet();
    await m.attach(context);
    await use(m);
    m.heal();
  },
  errors: async function ({ page }, use) {
    var errs = [];
    page.on('pageerror', function (e) { errs.push('pageerror: ' + e.message); });
    page.on('console', function (msg) {
      // a failed request to the (mocked) sheet is logged by the browser itself when a test makes it fail on purpose
      if (msg.type() === 'error' && !/script\.google|Failed to load resource|net::ERR|Load failed/i.test(msg.text())) errs.push('console: ' + msg.text());
    });
    await use(errs);
    base.expect(errs, 'console / page errors').toEqual([]);
  },
  // `mock` is listed so the sheet is always mocked: a test must never reach the real Google URL
  app: async function ({ page, baseURL, errors, mock }, use) {
    await use({
      boot: function (o) { return b.boot(page, baseURL, o); },
      saved: function () { return b.saved(page); },
      savedRaw: function () { return b.savedRaw(page); },
      synced: function (since) { return b.synced(page, since); },
      now: function () { return page.evaluate(function () { return Date.now(); }); },     // the page's (frozen-date) clock
      S: function (fn) { return page.evaluate(fn || function () { return window.__runway.S; }); },
      errors: errors
    });
  }
});

module.exports = { test: test, expect: base.expect, boot: b };
