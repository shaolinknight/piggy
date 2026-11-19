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
