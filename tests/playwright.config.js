// Behaviour tests run in WebKit (closest to iPhone Safari) at iPhone sizes. Chromium is only used by perf/.
'use strict';
var defineConfig = require('@playwright/test').defineConfig;
var boot = require('./support/boot');

var PORT = +process.env.PIGGY_PORT || 4173;

module.exports = defineConfig({
  testDir: './specs',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: Object.assign({ baseURL: 'http://127.0.0.1:' + PORT + '/', trace: 'off', browserName: 'webkit' }, boot.contextOptions()),
  webServer: { command: 'node support/server.js ' + PORT, url: 'http://127.0.0.1:' + PORT + '/', reuseExistingServer: true },
  projects: [
    { name: 'webkit-390', use: boot.contextOptions({ phone: 'pro' }), grepInvert: /@chromium/ },
    { name: 'webkit-375-dark', use: boot.contextOptions({ phone: 'se', colorScheme: 'dark', reducedMotion: 'reduce' }), grep: /@screens/ },
    { name: 'webkit-402', use: boot.contextOptions({ phone: 'pro17' }), grep: /@screens/ },
    // a Mac set to show scrollbars, and mouse timing: headless WebKit can't draw a scrollbar that takes up room, so these few run in Chromium
    // with its scrollbars left on
    { name: 'chromium-scrollbar', use: Object.assign(boot.contextOptions(), { browserName: 'chromium', launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } }), grep: /@chromium/ }
  ]
});
