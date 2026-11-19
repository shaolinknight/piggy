# Piggy tests

Nothing in this folder ships to the site. It needs Node 18+.

```bash
cd tests
npm install
npx playwright install webkit chromium
npx playwright test           # behaviour tests, WebKit at iPhone sizes (~1 min)
npm run perf                  # performance baseline -> perf/baseline.json (~15 min; --runs 1 for a quick look)
```

## What's here

- `support/server.js`: serves `../public` the way Cloudflare does (gzip/brotli, ETag + 304, `/index.html` → `/`), and lets a test "deploy" a new file in memory.
- `support/sheet-data.js`: a made-up sheet with about 3,000 entries from Jan 2022 to the frozen date, plus grids, budget rows, trips, bills, settings and goals. It's seeded, so it's the same every run.
- `support/mock-sheet.js`: answers the app's sheet calls with the same shapes as script v19, including `oid` de-duplication.
  - Latency: `mock.latency = 1500`, or set it per action.
  - Failures: `mock.fail('offline' | 'timeout' | 'http500' | 'lost' | {error})`.
  - Transport: Playwright routing by default. Use `mock.listen()` for a real local server, needed whenever the service worker is on.
- `support/boot.js` + `support/fixtures.js`: open the app on an iPhone-sized touch screen.
  - The date is frozen at 2026-11-18 10:00 America/Denver.
  - The `window.__no*` first-run flags are set.
  - The saved state is injected.
  - Any console error fails the test.
- `specs/`: behaviour that every phase must keep passing. They run in WebKit at iPhone sizes, except tests tagged `@chromium`: those run in Chromium with real scrollbars, because headless WebKit can't draw one that takes up room (a Mac set to show scrollbars).
- `script/`: the sheet script (`public/script.txt`) run against a small fake of Google's services (`fake-gas.js`). It checks that tabs remembered between reads (v22) give exactly what a full read gives, and are read again whenever they may have changed. `npm run test:script`; `npm test` runs it before the browser tests.
- `perf/motion.js`: what each everyday interaction animates (anything other than transform/opacity is flagged), with frame times in Chromium at 4× slower CPU. `perf/motion-before.json` is 2.49, before Phase 2.
- `perf/run.js`: the baseline measurements (see the report it prints). Behind an HTTPS proxy, run it with `NODE_USE_ENV_PROXY=1` so the `--preview` header check can reach Cloudflare.

## Two things that will bite you

- **With the service worker on, WebKit sends the page's requests past Playwright's routing.** For that reason, behaviour tests block the worker. Tests that need it (`service-worker.spec.js`, warm perf runs) use their own server and `mock.listen()`.
- **The app's code is wrapped in a function, so `VERSION`, `S` and the rest aren't globals.** Use `window.__runway`.
