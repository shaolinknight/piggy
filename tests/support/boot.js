// Opening Piggy the way the tests and perf runs need it: an iPhone-sized touch screen, the date frozen,
// first-run popups off, the sheet answered by the mock, and a saved copy of the app's data (or none).
'use strict';
var mockSheet = require('./mock-sheet');

var TODAY = '2026-11-18T10:00:00';              // a Wednesday in the middle of a month with data
var TZ = 'America/Denver';
var KEY = 'runway.v1';
var PHONES = { se: { width: 375, height: 667 }, pro: { width: 390, height: 844 }, pro17: { width: 402, height: 874 } };

// what a connected phone has saved before it has ever synced
// (extra.url: the sheet URL to use, e.g. a mock's local `url`; the Google-style mock URL otherwise)
function connectedState(extra) {
  extra = Object.assign({}, extra);
  var url = extra.url || mockSheet.URL; delete extra.url;
  var s = { v: 1, demo: false, tx: [], outbox: [], lastSync: 0, syncErr: '', welcomed: true, toured: true, hu: 2026 * 12 + 10,
    cfg: { url: url, pass: mockSheet.PASS } };
  Object.keys(extra || {}).forEach(function (k) { s[k] = extra[k]; });
  return s;
}

function contextOptions(o) {
  o = o || {};
  var vp = PHONES[o.phone || 'pro'] || o.viewport || PHONES.pro;
  return {
    viewport: vp, screen: vp, hasTouch: true, isMobile: o.isMobile !== false,
    deviceScaleFactor: o.deviceScaleFactor || 1,
    colorScheme: o.colorScheme || 'light', reducedMotion: o.reducedMotion || 'no-preference',
    timezoneId: TZ, locale: 'en-US', serviceWorkers: o.serviceWorkers || 'block'
  };
}

// Init flags the app already reads, plus the saved state (written once per tab, so reloads see what the app saved).
async function prepare(page, o) {
  o = o || {};
  var flags = Object.assign({ __noWelcome: true, __noTour: true, __noBillPrompt: true, __noNews: true, __noPad: true }, o.flags || {});
  var state = o.state === undefined ? null : typeof o.state === 'string' ? o.state : JSON.stringify(o.state);
  await page.addInitScript(function (a) {
    Object.keys(a.flags).forEach(function (k) { window[k] = a.flags[k]; });
    try {
      if (a.state !== null && !sessionStorage.getItem('__seeded')) { localStorage.setItem(a.key, a.state); sessionStorage.setItem('__seeded', '1'); }
    } catch (e) {}
  }, { flags: flags, state: state, key: KEY });
  if (o.clock !== false) await page.clock.install({ time: new Date(o.today || TODAY) });
}

async function boot(page, base, o) {
  o = o || {};
  await prepare(page, o);
  await page.goto(base + (o.query || ''));
  await page.waitForFunction(function () { return window.__runway && window.__runway.S; });
  return page;
}

// Read and write what the app has saved.
function saved(page) { return page.evaluate(function (k) { return JSON.parse(localStorage.getItem(k) || 'null'); }, KEY); }
function savedRaw(page) { return page.evaluate(function (k) { return localStorage.getItem(k); }, KEY); }

// Wait until the app has finished a sync (nothing left to send and a successful pull after `since`).
function synced(page, since) {
  return page.waitForFunction(function (t) { var S = window.__runway.S; return S.lastSync > t && !S.outbox.length; }, since || 0);
}

module.exports = { TODAY: TODAY, TZ: TZ, KEY: KEY, PHONES: PHONES, connectedState: connectedState, contextOptions: contextOptions,
  prepare: prepare, boot: boot, saved: saved, savedRaw: savedRaw, synced: synced };
