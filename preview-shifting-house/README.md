# The Gremlin Office (prototype)

A tiny explorable office for eclectictransformation.com. It's plain HTML/CSS/JS with no build step,
no libraries and no network calls outside this folder.

- **Live: `world.html` (Gremlin World)** is the explorable site now. `index.html` just redirects there (meta refresh + JS
  `location.replace` that keeps `?query#room`, plus a fallback link).
- `office-classic.html` + `office.css` + `office.js`: the original single 360-degree room (CSS 3D cube), kept as-is.
- `diaries.html`: **the page Remixer's /comics iframes.** One featured strip (newest first) in a swipe/scroll carousel:
  big Older/Newer arrows, keyboard arrows, a thumbnail filmstrip and month pills that jump to that month's first strip.
  Click/tap a strip for the reader (title kept clear of the host's sticky header, fit or zoom, prev/next, "Full size" link),
  then a compact "Step into Gremlin World" block: "Open in a new window" (world.html) or a pop-up iframe (world.html?embed). Compact on purpose (about 950px tall on desktop,
  1160px on phone) and reports that height to the host page. Reads `strips.json` live; all CSS/JS is inline.
- `comics.html`: the older sideways-swipe archive (still works, newest first; tall strips scroll inside their card; tap for full size).
- `office-data.json`: **everything in the room** (strips on walls, Easter eggs, cards, links).
- `strips.json`: the comics archive manifest.
- `assets/room/*.svg`: the drawn placeholder room (made by `tools/draw-room.py`).
- `assets/strips/`: strips as ~1000px WebP plus 300px wall thumbnails. `assets/gremlins/`: team portraits.

## Run locally
    python3 -m http.server 8765    # then open http://localhost:8765/
(Opening the pages straight from disk won't load the JSON; it needs any web server.)

## Edit content (office-data.json)
- **Hang or rotate strips**: edit `strips[]`. Each strip has `filename`, `thumb`, `date`, `episode`, `title`, `alt`,
  `slot` (`gallery-1`/`gallery-2`/`gallery-3`; add more under `slots`), `upside_down` (the Noodle prank) and an optional `prank_note`.
  An empty slot shows a "next strip coming soon" frame.
- **Eggs/hotspots**: each item in `hotspots[]` has `id`, `type` (poem, bryan-note, helper, art, prank, character),
  `active` (false hides it), `area`, `label`, `position` {yaw, pitch}, `size` [w, h] in wall pixels,
  `style` (`hidden` = glows only on hover/focus, `framed` = visible picture, `clock`), and a `card`
  {title, text, optional `image`, `alt`, `link` {href, label}, `widget`: "breathe"}.
  Text with `[square brackets]` is highlighted yellow as a placeholder. `{localtime}` shows the visitor's time.
  A link with an empty `href` shows its label as a placeholder instead of a link.
- **Placing things**: open the office, press **D** (or add `?debug=1`) and point at a spot; it shows yaw/pitch.
  yaw 0 = desk wall, 90 = gallery, 180 = window nook, 270 = print corner; pitch 0 = eye level.

## Add a new strip (one command)
When a strip is approved, run:

    python3 tools/add-strips.py /path/to/gremlin-diaries-2026-10-25.png --title "Coffee Run" \
        --alt "Six-panel comic: Pip discovers the espresso machine..."     # --alt optional but kind

- The **release date comes from the filename** (`gremlin-diaries-YYYY-MM-DD.png`; a `-v2` revision replaces the earlier one).
- Episode = highest so far + 1 (override with `--episode N`).
- Writes `assets/strips/...webp` (max 1000px wide, never cropped) and a 300px thumb, then adds it to `strips.json`.
  `diaries.html` and `comics.html` pick it up automatically: the newest strip becomes the featured one and a new month gets its own pill.
- Re-hangs the office gallery wall with the newest 3 strips (gallery-1 = newest). The upside-down prank stays with
  wall slot gallery-2, so whatever strip lands there gets flipped. `--no-wall` leaves the wall alone.
- Files ending in `-surprise` are always skipped. `--dry-run` shows what would change without writing anything.
- Backfill a whole folder: `python3 tools/add-strips.py /workspace/gremlin-diaries/site-copies` (keeps titles already typed in).

Then publish: `git add -A && git commit -m "Strip: Coffee Run" && git push` (with GitHub Pages it's live in about a minute; see below).

## Swap in Moth's painted panorama
    python3 tools/equirect-to-cubemap.py moth-pano.jpg      # 2:1 equirectangular image
Then point `room.faces.*` in office-data.json at `assets/room/pano-*.jpg`. Hotspots keep their yaw/pitch;
nudge them with the D readout. Strip frames and framed portraits keep rendering on top.

## Screenshots / smoke test
    pip install playwright && python3 tools/screenshots.py            # the office (server running on :8765)
    python3 tools/screenshots-diaries.py                              # diaries.html: carousel, reader, popup, Remixer-like embed -> screenshots/v2-*
    python3 tools/make-teaser.py                                      # re-render assets/office-teaser.webp after room changes

## Embed on Remixer (/comics), done once
Paste into a Custom HTML / embed block. Replace YOUR-HOST (for example `bryan.github.io`).

    <iframe id="gremlin-diaries" src="https://YOUR-HOST/gremlin-office/diaries.html"
      title="Gremlin Diaries comics" loading="eager" allow="fullscreen"
      style="display:block;width:100%;height:1100px;max-height:none;border:0;"></iframe>
    <script>
      /* Optional: grow the iframe to fit the content so the page scrolls as one. */
      window.addEventListener("message", function (e) {
        if (e.origin !== "https://YOUR-HOST") return;
        if (!e.data || e.data.type !== "gremlin-diaries-height") return;
        var f = document.getElementById("gremlin-diaries");
        if (f && e.data.height > 300) f.style.height = e.data.height + "px";
      });
    </script>

- **Without the script** (or if Remixer strips scripts), the fixed 1100px works on desktop (the page is ~950px);
  on phones the page is ~1160px, so it would scroll a little inside the frame.
- **With the script**, the iframe fits the compact page (the page sends `{type:'gremlin-diaries-height', height}`, debounced, whenever its
  size changes; adding strips doesn't make it taller). The reader and office pop-up pin to the visible part of the frame and start
  96px down when embedded, so a sticky site header can't cover their titles.
- Remixer is only touched once. New strips show up through `strips.json`.

## Hosting
GitHub Pages: a public repo `gremlin-office`, Settings → Pages → Deploy from branch `main` / root.
Lives at `https://<user>.github.io/gremlin-office/`. A push publishes it in about a minute.

