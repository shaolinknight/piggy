# Piggy — project instructions for Claude Code

Piggy is a personal budgeting app used daily on one iPhone (installed with Add to Home Screen) and a Mac. It's a PWA with no backend server: the data lives in the owner's Google Sheet and is reached through a Google Apps Script web app. The goal now is to make it feel like a native iPhone app at $0, so speed and feel come before new features.

Read this whole file before you start any task.

## How the app is built

Confirm these against the repo the first time you open it, and update this section if anything differs.

- `site/` is what Cloudflare deploys (production from `main`, preview deploys from branches). Its contents:
  - **`site/index.html`** is the whole app. It's one file (~772 KB, ~10,450 lines): CSS in one `<style>` (~104 KB), JS in inline `<script>` (~650 KB), and icons as base64 (~12 KB). Plain ES5 (`var`, `function`, no modules, no framework, no build step). `var VERSION = '2.48'` sits near line 1412.
  - **`site/sw.js`** is the service worker. `var CACHE = 'piggy-shell-NN'` must go up by one every release. The app page is served cache-first and a fresh copy is fetched in the background. When the page text changes, the worker posts `{type:'updated'}` and the app reloads itself if it was opened in the last 15 seconds. Calls to `script.google(usercontent).com` and `script.txt` are never cached.
  - **`site/manifest.webmanifest`**: `display: standalone`, theme colour, icons.
  - **`site/script.txt`** is a copy of `Code.gs` that the app links to so people can paste it into their sheet. Keep it identical to `Code.gs`.
- **`Code.gs`** is the Apps Script backend (script `VERSION = 19`). It must always ship with `var PASSCODE = 'CHANGE-ME';`. Never commit a real passcode, sheet URL or deployment ID.
- **`SETUP.md`** holds the setup guide and a "What's new in X.YY" section for every release, newest first.

### Data flow (read this before touching loading or sync)

1. **Opening the app:** `boot()` (near line 9654) reads `STORE.get('runway.v1')`. That's localStorage, or `window.storage` when present. It parses the whole state object `S`, runs `migrate()`, calls `render()` straight away from the saved copy, then calls `sync()`. So the first paint already comes from the cache; nothing waits on the network.
2. **`sync()`** (near line 8118):
   - It sends `S.outbox` one operation at a time through `api()` (a POST with a JSON body, sent as text/plain to avoid a CORS preflight). Each operation carries an `oid` so the script can skip a change it already made.
   - Then it calls `api({action:'pull'})`, a GET with `?action=pull&pass=…`. The timeout is 25 s, or 120 s for heavy actions.
3. **`pull_()` in `Code.gs` reads every tab on every open:**
   - all yearly expense and income logs, every year (2022 to now), with each row as a compact array;
   - the yearly grids;
   - the "app budget" tab, trips, recurring bills, "app settings" (prefs JSON) and goals.

   That's one Apps Script cold start plus a full read. This is almost certainly the main "slow" step after the first paint. Measure it before assuming.
4. **Changes show instantly already:** `addTx`/edit/delete change `S` and re-render at once, push an operation into `S.outbox`, then call `flushSoon()`. Failures that can never succeed (`not_found`, `bad_entry`, …) are dropped with a toast; anything else retries on the next sync. There is no rollback path today; a failed save stays queued.
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
  - adds "What's new in X.YY" to `SETUP.md`, listing which files changed.

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

- **There's no test suite in the repo yet.** Phase 0 adds one under `tests/`: Playwright, with a mock of the Apps Script web app and a fetch shim, so no real sheet is needed.
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
