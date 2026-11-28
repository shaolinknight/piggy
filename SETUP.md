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

## What's new in 2.57

- **Stuck changes are said in words on the phone.** When changes can't reach your sheet, a line appears under the header: "Offline · 1 change waiting to send" (or "Can't save on this phone"). Tap it for Sync status. It goes away by itself once everything is sent. On a computer the words stay in the header as before. (Beside the month they would squeeze its name, which is why the phone only showed a dot.)
- **Sync status keeps a short record of problems** (the last 30, on this device only; they don't sync), shows how long a change has been waiting, and has **Copy details**: a plain summary (version, script version, what's waiting, recent problems) to paste into a message. It never includes your passcode or sheet address.
- **A nudge after a day.** If a change has been waiting more than a day, Piggy says so once each time you open it ("1 change hasn't reached your sheet since Monday"), with **See why**.
- **Totals are rounded to the cent** as they're added up, so a category that's spent exactly its budget counts as exactly on budget (adding in floating point gave things like 0.30000000000000004).
- **New tests** for the journeys that had none: changing a budget in Plan, splitting a purchase across categories, spreading one over months (including the next part arriving when its month comes, once), a new trip, and a savings goal. Plus the error record, the stuck line and the one-day nudge.
- No sheet script change (still 23; 22 works too).

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-31`)

## What's new in 2.56 (sheet script 23)

- **Nothing is lost quietly when the phone is full.** If the phone ever refuses to save (its storage is full), Piggy says so, sends what's waiting to the sheet straight away, and the sync dot stays red ("Can't save on this phone") until saving works again. Piggy also asks the browser to keep its data when space runs low.
- **The right day after midnight.** With Piggy left open past midnight, a new entry used to be dated the day before. It now gets the new day, and the screen moves on to it (and to the new month on the 1st) by itself.
- **Safer backups** (Settings → Backup):
  - An exported file leaves out your sheet's address and passcode, so a backup that ends up somewhere else can't open your sheet. Restoring it keeps the sheet this phone is already connected to.
  - Import asks for a second tap ("Replace all? Tap again"), and the "Backup restored" message has **Undo**.
- **A damaged saved copy is set aside.** If what the phone saved can't be read, Piggy keeps it under its own name (`runway.v1.damaged`) instead of saving over it, and tells you to reconnect your sheet.
- **Sheet script 23** (optional, but recommended; Piggy keeps working with 22):
  - **A sheet that has seen many saves no longer gets stuck.** The script's list of finished changes outgrew Google's 9 KB limit for one setting after about 400 saves; from then on, each save was written to the sheet but reported as failed, so Piggy retried it and wrote it again. It now keeps the last 150, and a save is never reported as failed because of that list.
  - **The passcode stays out of web addresses.** Piggy reads the sheet with a POST (passcode in the body) instead of putting it in the address, where Google's logs keep it.
  - **Wrong passcodes are slowed down.** After 20 wrong passcodes in 10 minutes, the script refuses every request for 10 minutes. Piggy says "Too many wrong passcodes were tried…" and retries by itself.
  - To update: follow "Updating the sheet script" above (keep your passcode, then **Deploy → Manage deployments → New version**). No need to run piggySetup again.
  - If you see duplicate rows from before, they came from the stuck list; delete them in the sheet by hand.

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-30`)
- `public/script.txt` (script version 23)

## What's new in 2.55

- **Appearance has three kinds of look: Colors, Cities and Seasons.** Settings → Appearance opens on the kind you're using.
  - **Colors** are the colour looks you have now. Picking one means no picture, exactly as before (still the default).
  - **Cities:** New York, Tokyo, Paris, San Francisco. **Seasons:** spring, summer, autumn, winter. Each puts a picture behind the app that stays put while you scroll; the colour look you had keeps giving the accents.
  - **Every picture has a day and a night version.** They follow Light / dark (or your phone, with Match device): daytime skylines, the Eiffel Tower lit gold at night, a moonlit sea, snowy pines under the moon.
  - The phone's status bar takes the colour at the top of the picture.
  - A picture is only downloaded once you pick it (1 to 4 KB each), then the app keeps it for offline use.
- **Frosted glass.** With a picture, cards, lists, the tab bar and popups turn to frosted glass, so the picture shows through softly. Turn Frosted glass off to keep solid cards over the picture. If your phone's Reduce Transparency setting is on, cards stay solid.
  - With glass on, screens slide into place instead of cross-fading. A fade over frosted cards switches their blur off until it ends, which showed the picture sharp for a moment before the frost.
- Your choice syncs to your other devices with the rest of Appearance. No sheet script change (still v22): the script keeps new settings as they are.
- Speed: a picture alone costs nothing while scrolling. Frosted glass makes the phone blur the picture behind every card as you scroll; if scrolling ever feels less smooth, turn glass off.

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-29`)
- `public/scenes/` (new: the pictures, a day and a night file for each)

## What's new in 2.54

- **The computer layout fits any window.** In Activity, an entry you open keeps Delete / Cancel / Save in view:
  - In a short window the fields scroll and the buttons stay pinned at the panel's foot (a Mac hides scrollbars, so they used to look cut off).
    The bar sits exactly on the panel's edge however far you scroll, with nothing showing beneath it. In preview mode, the "Preview data" note now sits above the buttons.
    The New entry panel's Add bar (also on the phone) no longer creeps up 14 px when you scroll to the end.
  - The panel now starts at the top of the page and is never taller than the window. The search bar moved into the list's column to make room.
  - Between 960 and 1099 px wide (about half a laptop screen) the panel used to sit under the whole list. It now floats over the list's right side while an entry is open.
  - The table follows its own width: when it's narrow, Details steps aside so store and category stay readable.
- **Opening a side panel no longer nudges the page behind it.** On a Mac that shows scrollbars, the page used to jump sideways by the scrollbar's width whenever a panel opened (a category, Review & save, Settings…). The page now keeps its width, and the panel still reaches the window's edge. Bars pinned to the window (Plan's "1 change · Review & save", the message at the bottom) stay put too.
- **Mark a bill paid from its popup.** Tap a bill in Month → Bills. If it's due later this month and not paid, **Mark paid early** logs the payment today and ticks off that due date. If it has no due date, **Mark paid** logs its budgeted amount as the payment (today, or the last day of a past month you're looking at). Undo takes it back out. No sheet script change: it's an ordinary entry.
- **Back buttons on stacked popups.** A popup opened from another popup (Bills from Settings, for example) now shows **Back**, which returns to the one underneath, instead of Done closing both. On the phone too.
- **Quick clicks after switching tabs aren't lost.** A mouse press during the tab cross-fade, released just after it ended, used to go nowhere. It now clicks what's under the pointer.
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
