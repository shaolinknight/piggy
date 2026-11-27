# Piggy — project instructions for Claude Code

Piggy is a personal budgeting app used daily on one iPhone (installed with Add to Home Screen) and a Mac. It's a PWA with no backend server: the data lives in the owner's Google Sheet and is reached through a Google Apps Script web app. The goal now is to make it feel like a native iPhone app at $0, so speed and feel come before new features.

Read this whole file before you start any task.

## How the app is built

Confirm these against the repo the first time you open it, and update this section if anything differs.

(Checked in Phase 0 and refreshed at 2.54. The original notes described a `site/` folder and a root `Code.gs`; neither exists.)

- **`public/`** is what Cloudflare deploys: `wrangler.jsonc` serves `./public` as static assets. Production deploys from `main`; previews deploy from branches. Files belong **in `public/`**: v2.48 was once uploaded to the repo root by mistake, so it never deployed. Its contents:
  - **`public/index.html`** is the whole app. It's one file (~790 KB, ~10,640 lines):
    - CSS in one `<style>` (~101 KB);
    - JS in one inline `<script>` (~638 KB);
    - icons as base64 (~12 KB): the apple-touch-icon and favicon are inline `data:` PNGs.

    It's plain ES5 (`var`, `function`, no modules, no framework, no build step). `var VERSION = '2.55'` sits near line 1513. The whole script is wrapped in `(function () { 'use strict'; … boot(); })();`, so `VERSION`, `S`, `checkUpdate` and the rest are **not** globals. Reach them through `window.__runway`.
  - **`public/sw.js`** is the service worker. `var CACHE = 'piggy-shell-NN'` must go up by one every release.
    - The app page is served cache-first and a fresh copy is fetched in the background.
    - When the page text changes, the worker posts `{type:'updated'}`. The app reloads itself if it was opened in the last 15 seconds; otherwise it shows a "Reload" toast. The app also asks for the page every 30 minutes while it's open, and when you come back to it.
    - Calls to `script.google(usercontent).com` and `script.txt` are never cached.
    - The two default fonts in `public/fonts/` are precached and never refreshed (`public/_headers` marks them immutable). A font change needs a new file name.
  - **`public/scenes/`** (2.55): the background pictures (SVG). One loads only when picked (`S.cfg.bg`), and the service worker keeps it after its first load. `SCENES` in `index.html` lists them, each with its light or dark tone; `glassOn()` decides frosted glass (`S.cfg.glass`). Headless WebKit doesn't draw `backdrop-filter`, so check glass in Chromium screenshots (`tests/perf/glass.js` measures its scroll cost).
  - **`public/manifest.webmanifest`**: `display: standalone`, theme colour, icons (`icon-192.png`, `icon-512.png`).
  - **`public/script.txt`** **is** the Apps Script backend (script `VERSION = 22`); there is no separate `Code.gs` file in the repo. The app links to it so people can paste it into their sheet. It must always ship with `var PASSCODE = 'CHANGE-ME';`. Never commit a real passcode, sheet URL or deployment ID.
- **`SETUP.md`** (at the root, not in `public/`) tells the owner how to update the sheet script safely and lists "What's new" for each release.
- **`tests/`** holds the Playwright behaviour tests and the perf baseline. It's not deployed; see `tests/README.md`.

### Data flow (read this before touching loading or sync)

1. **Opening the app:** `boot()` (near line 9813) reads `STORE.get('runway.v1')`. That's localStorage, or `window.storage` when present. It parses the whole state object `S`, runs `migrate()`, calls `render()` straight away from the saved copy, then calls `sync()`. So the first paint already comes from the cache; nothing waits on the network.
2. **`sync()`** (near line 8221):
   - It sends `S.outbox` one operation at a time through `api()` (a POST with a JSON body, sent as text/plain to avoid a CORS preflight). Each operation carries an `oid` so the script can skip a change it already made.
   - Then it calls `api({action:'pull'})`, a GET with `?action=pull&pass=…` plus what `pullAsk()` adds. The pull's timeout is 45 s; other requests 25 s, or 120 s for heavy actions.
   - If the pull text matches the last one (`pullSig`), nothing is re-applied or redrawn.
3. **`pull_()` in `script.txt`** returns all yearly logs (2022 to now), the yearly grids, the "app budget" tab, trips, recurring bills, "app settings" (prefs JSON) and goals. A full read takes ~5–9 s in the script and 9–16 s round trip on the owner's iPhone. Since v20–v22 it avoids most of that:
   - **v20/v21 `since`:** the client sends the last `stamp`; if nothing changed (and the watcher trigger is installed, via the one-time `piggySetup`), the answer is just `{same:true}` (1.3–3.3 s round trip).
   - **v22 cache:** unchanged tabs come from `CacheService` (6 h), keyed by per-tab stamps; app saves bump only the tabs they touch, hand edits in the sheet bump everything. `fresh=1` (a refresh you ask for, and once a day) bypasses the cache.
   - The client sends `since` only when `S.scriptV >= 20` and `fresh` only when `>= 22`. `forgetPull()` clears the stamps on connect, disconnect, `startLocal` and import.
4. **Changes show instantly already:** `addTx`/edit/delete change `S` and re-render at once, push an operation into `S.outbox`, then call `flushSoon()`.
   - Failures that can never succeed (`NEVER_OK`, near line 8217: `not_found`, `bad_entry`, `bad_prefs`, `bad_year`, `bad_request`, `no_budget_tabs`, … plus `validation` and `unknown_action`) are dropped with a toast, so they never block what's queued behind them. The pull that follows then puts the sheet's copy back on screen; that is the only "rollback".
   - Anything else (offline, timeouts, passing Google errors, and a wrong passcode on purpose) stays at the head of the outbox and retries on every sync.
5. **Prefs** sync field by field (`prefsObj`, `prefsChanged`, the `chg` list, `keepUnchanged_` on the server). Lists such as bills and categories are merged by union on the client. Spread purchases (pay over N months) post each payment with a fixed `oid` `sp-<id>-<i>`.
6. **A first load with a sheet but no data yet** shows `skeletonHtml()` (see `firstLoad()`).

## Rules

- **Don't break the sheet connection.** The request and response shapes between `index.html` and `Code.gs` are a contract with a deployed script.
  - Any change to `Code.gs` only takes effect after the owner pastes it into Apps Script and deploys a new version by hand.
  - So client changes must keep working with the currently deployed script (v19). New server features must be optional, and the client must check `S.scriptV` before using them.
  - Ask before changing `Code.gs`.
- **Ask before anything risky or hard to undo**, for example:
  - changing how or where data is stored (localStorage → IndexedDB, a new key, a new state shape);
  - migrating saved data;
  - removing or renaming a feature or setting;
  - changing the sync protocol or the service worker's update strategy;
  - adding a build step or any dependency.
- **Free only.** No paid services, APIs or tools.
- **No secrets.** Never commit the sheet URL, passcode or Apps Script deployment ID; never print them in logs or screenshots either. For real-sheet measurements, read them from environment variables that aren't committed.
- **Never suggest connecting a bank.** The owner doesn't want it.
- **One branch per phase. Small commits,** one logical change each, with clear messages. Don't merge until the owner says it feels right on his iPhone.

## Owner decisions (standing; don't re-ask)

- **iPhone:** iOS 26, used from the Home Screen. Mac for the computer layout.
- **Sheet script changes are OK** when a feature needs them. Still ask first, keep the client working with older scripts (gate on `S.scriptV`), and give the owner the steps to paste and deploy. He updates it by hand (see `SETUP.md`).
- **Self-hosted fonts: yes** (done in 2.49).
- **On hold, don't do or re-propose:** a build or minify step, and moving storage to IndexedDB.
- **Haptics stay switchable off** (Settings → This phone → Haptics, per device). Any new haptic goes through `haptic()` so the switch covers it.
- **Computer layout must fit any laptop window**, short or narrow included: nothing cut off, buttons in view without hunting for a hidden scrollbar, pinned bars that don't shift, and nothing behind a panel moving when it opens (`tests/specs/desktop.spec.js`; the `@chromium` test runs in Chromium with real scrollbars).
- **Merging:** the owner says "merge" after trying the Cloudflare preview; only then fast-forward `main` and push.

## Code style (match what's there)

- **Plain ES5 in the single file:** `var`, function declarations, string-built HTML with `esc()` for anything user-supplied.
  - Clicks route through one delegated handler on `data-act` / `data-v` (`document.addEventListener('click', …)`, with a big `switch (act)`).
  - State is `S`, saved with `save()`. View state is `UI`; `render()` redraws the current tab.
  - Sheets (bottom popups) use `openSheet(kind, arg)`, `renderSheet()`, `closeSheet()` and `sheetBack()`.
  - Use `$(id)` for `getElementById`.
- **Comments explain why,** in plain words, as the existing ones do. Write no commented-out code and leave no debug logging behind.
- **Small, focused helpers.** Before writing a new one, check that one doesn't already exist. Many do: `money`, `r2`, `parseAmt`, `fadeIn`, `viewIn`, `slideView`, `glideTop`, `toast(msg, undo)`, `arm()` (two-step confirm), `haptic()`, `isPhone`/`isWide`/`isMouse`, `REDUCED`.
- **Motion:**
  - Animate only `transform` and `opacity`.
  - Use the easing constants `EASE_OUT = cubic-bezier(.2,.8,.2,1)` and `EASE_IOS = cubic-bezier(.32,.72,0,1)`.
  - No CSS `linear()` spring easing; it janks on iOS Safari.
  - Everything respects `prefers-reduced-motion`: the `REDUCED` flag (it updates live) plus the `@media (prefers-reduced-motion: reduce)` block, which swaps movement for fades rather than removing feedback.
- **Inputs are at least 16px,** or iOS zooms in. Tap targets are at least 44px.
- **Destructive actions** get two-step confirms (`arm`) and an Undo toast.
- **User-facing words are plain and friendly,** with no jargon. Every release:
  - adds an entry at the top of `NEWS` in `index.html` (the "What's new" popup after an update);
  - bumps `VERSION`;
  - bumps `CACHE` in `sw.js`;
  - adds "What's new in X.YY" to `SETUP.md`, listing which files changed (create `SETUP.md` the first time).

## iPhone lessons already paid for

These all shipped as bugs before. Don't reintroduce them.

- **Desktop browsers don't behave like iOS here.** Desktop Chromium has `navigator.vibrate`, focuses buttons when you click them, and never shows an on-screen keyboard. iPhone Safari differs on all three:
  - **Taps take focus away.** Tapping a button removes focus from the input you were in (it blurs). Never treat "focus went nowhere" as "the user left".
  - **Haptics need a workaround.** `haptic()` clicks a hidden `<input type="checkbox" switch>` (iOS 18+). That synthetic click and its focus events are swallowed at the `window` capture phase (`HAPT_BUSY`, `#hapt`). Keep it that way, or every capture-phase click handler will see phantom taps.
  - **Focusing an input scrolls the page.** iOS scrolls the page to "help" whenever an input gets focus. The sheet and the bottom search therefore focus inputs themselves on `touchend` with `focus({preventScroll:true})` (see `TAPF`).
- **The keyboard is a visual-viewport problem.** Sheets fit above it using `visualViewport` (`fitSheet`, `FULLH`). Measure the full height when the keyboard is down, never while it's moving.
- **One form at a time.** Two `#txform` / `#f_a` elements in the DOM made new entries silently save nothing. Ids must stay unique.
- **Ghost taps.** If something moves out from under a finger between `pointerdown` and `click`, the click lands on whatever is underneath. Guard against it, as the keypad does with `PAD_DOWN`.
- **Don't break position: sticky.** `html, body, #app` use `overflow-x: clip` (under `@supports`). `overflow-x: hidden` there breaks every sticky element.
- **Don't break offscreen rows.** Activity lists use `content-visibility: auto`. Anything that measures or scrolls to a row must make its list visible first (see `txEl`).

## Testing and verifying

- **The test suite lives in `tests/`** (Phase 0). It uses Playwright with a mock of the Apps Script web app, so no real sheet is needed.
  - Run it with `cd tests && npm install && npx playwright test`; run the perf baseline with `npm run perf` (it writes `tests/perf/baseline.json`).
  - Every phase must keep `tests/specs/` passing.
  - With the service worker on, WebKit sends page requests past Playwright's routing. Behaviour tests therefore block the worker; SW tests use `mock.listen()`.
  - The mock sheet's prefs set `hu` to the current month so the "Welcome to <month>" heads-up doesn't cover the screen.
- **Test in WebKit first** (`npx playwright install webkit`), at iPhone sizes (375×667, 390×844, 402×874), with `hasTouch` and `isMobile`, in light and dark, with reduced motion, and with the Extra-large text setting. Add Chromium only for Lighthouse and CPU-throttled timings.
- **Hooks the app already has for tests:**
  - init flags that silence first-run popups: `window.__noWelcome`, `__noTour`, `__noBillPrompt`, `__noNews`, `__noPad` / `__forcePad`;
  - `window.__runway`, which exposes `S`, `UI`, `save`, `render`, `closeSheet` and a few internals.

  Freeze the date with Playwright's clock (the app's month logic depends on it).
- **Every UI change** needs screenshots before and after, no console errors, and no sideways scroll at 375px.
- **Never claim something works without having run it.** WebKit in Playwright isn't an iPhone. It can't show the real keyboard, haptics, Add to Home Screen standalone mode, or ProMotion smoothness. Say plainly which checks need the owner's phone.

## Releasing a phase

1. Re-run the baseline measurements (`tests/perf/`) and put before/after numbers in the summary.
2. Read your own full diff as a skeptical reviewer: bugs, dead code, duplicated logic, leftover debug code, scope creep. Fix what you find, then re-run everything.
3. Bump `VERSION`, `NEWS`, `CACHE` and `SETUP.md`. Push the branch and get the Cloudflare preview URL.
4. Stop. Give the owner:
   - a short summary;
   - the numbers;
   - what you verified and how;
   - a checklist of what to try on his iPhone with the preview link.

   Merge only after he confirms.
