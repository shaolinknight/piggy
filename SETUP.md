# Piggy setup notes

Piggy is the app in `public/` (deployed by Cloudflare). Your data lives in your Google Sheet, which Piggy reaches through the script in `public/script.txt` (pasted into the sheet's Apps Script editor).

## Updating the sheet script (keeps your passcode and web app URL)

1. Open your sheet → **Extensions → Apps Script**.
2. Find the line `var PASSCODE = '…';` and copy your passcode somewhere safe.
3. Open `script.txt` from Piggy's site (for example `https://<your Piggy address>/script.txt`), select all, copy.
4. In the Apps Script editor, select everything, paste over it, and put your passcode back into the `var PASSCODE = '…';` line. Press **Save**.
5. **Deploy → Manage deployments** → the pencil icon → **Version: New version** → **Deploy**. If Google asks to review permissions, allow them.

The web app URL doesn't change, so there's nothing to change in Piggy.

Don't use Settings → "Copy the script" for this: that button is for setting up a new sheet and puts a new passcode in the script.

## What's new in 2.49

Phase 1 (speed).

- **Calmer opening.** When nothing changed in the sheet since the last time, Piggy keeps the screen as it is after checking in, instead of rebuilding and redrawing everything.
- **Faster checking in with script v20.** The script keeps a "last changed" stamp, updated by:
  - saves from the app;
  - typing in the sheet;
  - adding or removing rows or tabs by hand (a watcher the script installs itself).

  When nothing changed, it answers "same as before" without reading any tab. Piggy still reads everything:
  - once a day;
  - when you pull down to refresh;
  - after a save the sheet refused.

  Works with the old script (v19) too, just without the speed-up.
- **A settings update no longer holds up checking in.** When only a settings update is waiting, Piggy asks for the sheet at the same time instead of after it.
- **Classic fonts come with the app** instead of from Google Fonts, so a fresh open doesn't wait on Google.

Files changed:
- `public/index.html`
- `public/sw.js` (cache `piggy-shell-23`)
- `public/script.txt` (script v20)
- `public/fonts/`: DM Sans and Fraunces, with their OFL licences
- `public/_headers` (font caching)
- `wrangler.jsonc` (`previews` block, for branch preview links)
