# PinBoard Saver — Chrome Extension (Manifest V3)

A personal-use starter extension for collecting visible Pinterest media and exporting selected images to ZIP or PDF. It includes hover-to-save controls, previews, selection, and best-effort video URL detection.

## Install in Chrome

1. Extract `PinBoard_Saver.zip` to a normal folder.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Choose **Load unpacked**.
5. Select the extracted `PinBoard_Saver` folder — the one containing `manifest.json`.
6. If you previously installed an older build, click **Reload** on the extension, then refresh the Pinterest tab. Tabs that were open before installation may need a page refresh.
6. Open or refresh a Pinterest board. Scroll to load the pins you want.
7. Click the PinBoard Saver toolbar icon, press **Refresh**, select the previews, and choose **Export ZIP** or **Export PDF**.

## Features in this starter build

- Hover buttons on detected Pinterest pin cards to download an individual media URL.
- Collect visible images and best-effort video URLs from the current Pinterest page.
- **Auto-load board:** progressively scrolls the current board to trigger Pinterest lazy-loading, deduplicates media URLs, and stops after several rounds without new items or at a safety limit. Keep the popup open while it runs.
- Preview detected media in the popup and select/deselect items.
- Export selected media to a ZIP archive without a third-party library.
- Export selected images into a simple multi-page PDF.
- Section pages: navigate to a Pinterest section page, scroll to load its pins, then Refresh and export the visible media.

## Known limitations

- Pinterest changes its page markup frequently. Detection relies on public page DOM elements and may need selector updates.
- Bulk collection covers media currently loaded in the page; it does not automatically crawl every page or scroll indefinitely. Scroll down and press Refresh to collect more.
- “Section downloads” means exporting media from an opened section page; the extension does not yet discover and enumerate all sections from a board automatically.
- Video downloading is best-effort. A video may be served through segmented streaming, require authenticated requests, or expose no direct downloadable URL. Such videos may not export.
- PDF export includes images only. Video files are skipped in PDF output and can be included in ZIP if a direct media URL is available.
- Some image servers may block cross-origin fetches. Those files will be reported as unavailable; individual downloads may still work through Chrome's download manager.
- ZIP uses uncompressed entries to keep the implementation dependency-free, so large exports can be large.
- This project has not been verified against every Pinterest layout or Chrome version. Test with a small board first.
- Respect creators' rights and Pinterest's terms. Download only content you are permitted to save.

## Privacy

This extension does not send your pins or files to a remote server. Collection and export run locally in the browser. Chrome's download manager handles individual downloads.

## Project structure

- `manifest.json` — Manifest V3 configuration
- `content.js` / `content.css` — pin detection and hover controls
- `popup.html` / `popup.css` / `popup.js` — preview, selection, ZIP/PDF export
- `background.js` — individual downloads through Chrome's downloads API
- `icons/` — extension icons

## Troubleshooting

- If the popup says no media was found, make sure you are on `https://www.pinterest.com/`, refresh the tab, scroll until pin cards appear, then press Refresh in the popup.
- If hover buttons do not appear, reload the Pinterest tab after loading or reloading the extension.
- After editing extension files, return to `chrome://extensions`, click Reload on PinBoard Saver, then refresh Pinterest.
\n\n## Version 1.0.4 fixes\n\n- Adds on-demand content-script injection when a Pinterest tab was already open or the static content script did not attach.\n- Expands host matching to Pinterest subdomains and pinimg media hosts.\n- Improves the popup error message and page-host handling.\n\n## Version 1.0.4 updates\n\n- Adds an **Auto-load board** action that scrolls through the current Pinterest page and collects newly loaded pins. It stops after 8 rounds without new items or 160 scroll rounds, whichever comes first. It cannot guarantee every pin is accessible because Pinterest may virtualize content, require manual interaction, or throttle loading.\n
## Version 1.0.4 update

- ZIP exports now use the filename format `<Board Name> Board Download.zip`, based on the current page title.

## Version 1.0.4 update

- ZIP exports now use the board name itself as the archive filename (for example, `Logo_65_Birai.zip`). The name is derived from the Pinterest tab title, with a board-URL fallback.
