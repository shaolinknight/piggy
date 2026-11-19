# Piggy setup notes

Piggy is the app in `public/` (deployed by Cloudflare). Your data lives in your Google Sheet, which Piggy reaches through the script in `public/script.txt` (pasted into the sheet's Apps Script editor).

## Updating the sheet script (keeps your passcode and web app URL)

1. Open your sheet → **Extensions → Apps Script**.
2. Find the line `var PASSCODE = '…';` and copy your passcode somewhere safe.
3. Open `script.txt` from Piggy's site (for example `https://<your Piggy address>/script.txt`), select all, copy.
4. In the Apps Script editor, select everything, paste over it, and put your passcode back into the `var PASSCODE = '…';` line. Press **Save**.
5. **Deploy → Manage deployments** → the pencil icon → **Version: New version** → **Deploy**. If Google asks to review permissions, allow them.

6. **Once, the first time you update to script 21 or later:** at the top of the Apps Script editor, pick **piggySetup** in the function list (next to **Run**), press **Run**, and allow what Google asks. The log should say "All set". This lets the script notice edits you make by hand in the sheet, so Piggy can skip re-reading it when nothing changed. Without it, everything still works; Piggy just reads the whole sheet each time.

The web app URL doesn't change, so there's nothing to change in Piggy.

Don't use Settings → "Copy the script" for this: that button is for setting up a new sheet and puts a new passcode in the script.

## What's new in 2.54

- **The computer layout fits any window.** In Activity, an entry you open keeps Delete / Cancel / Save in view:
  - In a short window the fields scroll and the buttons stay pinned at the panel's foot (a Mac hides scrollbars, so they used to look cut off).
  - The panel now starts at the top of the page and is never taller than the window. The search bar moved into the list's column to make room.
  - Between 960 and 1099 px wide (about half a laptop screen) the panel used to sit under the whole list. It now floats over the list's right side while an entry is open.
  - The table follows its own width: when it's narrow, Details steps aside so store and category stay readable.
  - Phones and the iPad-size layout are unchanged.
- No sheet script change (still v22).

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-28`)

## What's new in 2.53

- **Sheet script v22: full reads only re-read what changed.**
  - Each expense or income tab has a stamp that moves when the app saves into it. A tab whose stamp hasn't moved comes from Google's script cache (kept up to 6 hours) instead of being read again. A yearly grid also follows its year's tabs, and the budget follows the "everything" stamp.
  - Any change made by hand in the sheet, rows or tabs added or removed, and budget or trip changes move one stamp for everything. A hand edit can't always say which tab it was in, so it's treated as everything.
  - Settings, goals and bills don't disturb the cache.
  - Pull-to-refresh, the daily full read, a refused save, and any read before the hand-edit watcher is on read every tab.
  - Updating: paste as described above. No new permission, and no need to run `piggySetup` again if the watcher is already on (Apps Script → Triggers lists `piggyChanged`).
- **A change the sheet can never accept no longer blocks the queue.** Errors the script returns for the change itself are dropped with a message:
  - `bad_prefs`, `bad_year`, `bad_request`;
  - `no_tab`, `no_budget_found`;
  - `no_room_for_column`, `no_room_for_trip_column`.

  Google's own hiccups keep retrying. A wrong passcode still holds everything, on purpose.
- **A tap during the tab cross-fade is no longer lost.** It ends the cross-fade and goes to what's under your finger.
- **Tests:**
  - `tests/script/` runs the real sheet script against a fake of Google's services (`npm run test:script`, 12 checks).
  - New browser tests for the queue, the cross-fade tap, and when Piggy asks for a fresh read.

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-27`)
- `public/script.txt` (script v22)

## What's new in 2.52

Phase 4 (haptics).

- **One kind of tap everywhere.** On iPhone it was already one pulse; the two names only differed on Android. Piggy taps:
  - when something is saved (with Undo) and when a delete asks "Sure? Tap again";
  - when a swipe has gone far enough to act: delete or change a row, close a popup, go back from the edge, change month or Plan step, pull to refresh;
  - on press-and-hold of a name suggestion, and when you turn haptics on.
- **Turning them off:** Settings → This phone → Haptics → Off. This is per device, so it doesn't change your other devices.
- **A closed entry sheet no longer keeps its form in the page.** Opening an entry afterwards put a second entry form (same ids) on the page; harmless today, but the kind of thing that once made saves go nowhere.
- **New tests:**
  - `tests/specs/haptics.spec.js` checks one tap per save or confirm, no phantom clicks, focus kept, and Off silences everything.
  - `tests/specs/entries.spec.js` checks only one entry form is on the page at a time.

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-26`)

## What's new in 2.51

Phase 3 (polish).

- **Larger text no longer pushes popups off the screen.** The text-size setting zooms the page, which also multiplied every screen-based size. With Larger text, the New entry sheet started 69–88 px above the top of the screen, hiding its title and Close.
  - The zoom is now published as `--z`, and screen-based sizes divide by it.
  - The screen tests check the popup's top is on screen at every size and text size.
- **Screen-based sizes use `dvh`** (the height you can actually see between Safari's bars), with `vh` as the fallback.
- **Status bar and splash colours** start as the default palette's background everywhere (the page meta tag and the manifest); Piggy still switches to your palette before it draws anything.
- **Wide layout (Mac):** the sidebars keep their scrolling to themselves.
- **Audit, no change needed:**
  - Every fixed bar, popup and toast already allows for the notch and home bar.
  - The main page's own bounce stays off, so Piggy's pull-to-refresh works.
  - The keyboard-fit motion of the entry sheet is unchanged; it needs real-phone judgement.

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-25`)
- `public/manifest.webmanifest`

## What's new in 2.50

Phase 2 (motion). Everyday animations now move only things the phone's graphics chip can draw by itself (position and fade); none of them resize or repaint the page on every frame any more.

- **Opening an entry, adding one, swiping one away, dismissing a reminder, and opening a Month group or a Settings section** used to animate height. Now the section opens at once, what's below glides from where it was, and the new content fades in.
- **Tab switches use a View Transition** (iOS 18+). The old screen holds still while the new tab is drawn, then the two cross-fade. With reduced motion, or on an older phone, the old slide-in is kept.
- **Progress bars** grow by scaling instead of animating their width.
- **Highlights and the loading shimmer** fade or slide a layer instead of animating background colours.
- **Popups** (the entry sheet and the category picker) rise on the iOS curve.
- A new test (`tests/specs/motion.spec.js`) fails if any of these animate anything other than transform or opacity.

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-24`)

## What's new in 2.49

Phase 1 (speed).

- **Calmer opening.** When nothing changed in the sheet since the last time, Piggy keeps the screen as it is after checking in, instead of rebuilding and redrawing everything.
- **Faster checking in with script v21** (run `piggySetup` once, see above). The script keeps a "last changed" stamp, updated by:
  - saves from the app;
  - typing in the sheet;
  - adding or removing rows or tabs by hand (a watcher the script installs itself).

  When nothing changed, it answers "same as before" without reading any tab. Piggy still reads everything:
  - once a day;
  - when you pull down to refresh;
  - after a save the sheet refused.

  Works with the old script (v19) too, just without the speed-up. Piggy now waits up to 45 s for the sheet (it was 25 s), since a full read of a real sheet can take 7–14 s and sometimes longer.
- **A settings update no longer holds up checking in.** When only a settings update is waiting, Piggy asks for the sheet at the same time instead of after it.
- **Classic fonts come with the app** instead of from Google Fonts, so a fresh open doesn't wait on Google.

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-23`)
- `public/script.txt` (script v21)
- `public/fonts/`: DM Sans and Fraunces, with their OFL licences
- `public/_headers` (font caching)
- `wrangler.jsonc` (`previews` block, for branch preview links)
