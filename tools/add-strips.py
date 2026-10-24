#!/usr/bin/env python3
"""Add approved Gremlin Diaries strips to diaries.html, comics.html and the office wall.

ONE NEW STRIP (the usual case):
  python3 tools/add-strips.py /path/gremlin-diaries-2026-10-25.png --title "Coffee Run" \
      [--alt "Six-panel comic: ..."] [--episode 4]

  - The release date comes from the filename (gremlin-diaries-YYYY-MM-DD[-vN].png).
  - Episode defaults to (highest existing episode + 1) for a new date.
  - Writes assets/strips/<name>.webp (max 1000px wide, never cropped) + a 300px -thumb.webp.
  - Adds or updates the entry in strips.json (newest first). diaries.html and comics.html read it live.
  - Re-hangs the office gallery wall with the newest 3 strips (gallery-1 = newest).
    Each wall slot keeps its own upside-down prank, so the gag stays on gallery-2.
    Use --no-wall to leave the office wall alone.

A WHOLE FOLDER (backfill):
  python3 tools/add-strips.py /workspace/gremlin-diaries/site-copies
  - Highest -vN revision per date wins; anything ending in -surprise is always skipped.
  - Keeps titles/alt text already in strips.json; new ones get "[Title - fill in]".

Other flags: --dry-run (show what would change, write nothing).
Needs: pip install pillow
"""
import argparse, json, re, sys, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "strips"
PAT = re.compile(r"^gremlin-diaries-(\d{4}-\d{2}-\d{2})(?:-v(\d+))?\.(png|jpe?g|webp)$", re.I)
SURPRISE = re.compile(r"-surprise\.(png|jpe?g|webp)$", re.I)
GALLERY = ["gallery-1", "gallery-2", "gallery-3"]

def convert(src, date, dry):
    if dry: return
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert("RGB")
    full = im.copy(); full.thumbnail((1000, 100000), Image.LANCZOS)   # width-limited only: never cropped
    full.save(OUT / f"gremlin-diaries-{date}.webp", "WEBP", quality=80, method=6)
    th = im.copy(); th.thumbnail((300, 100000), Image.LANCZOS)
    th.save(OUT / f"gremlin-diaries-{date}-thumb.webp", "WEBP", quality=72, method=6)

def pick(path):
    p = pathlib.Path(path)
    files = [p] if p.is_file() else sorted(p.iterdir())
    best = {}
    for f in files:
        if SURPRISE.search(f.name):
            print("skipping (surprise, never published):", f.name); continue
        m = PAT.match(f.name)
        if not m:
            if p.is_file(): sys.exit(f"Filename must look like gremlin-diaries-YYYY-MM-DD.png (got {f.name})")
            continue
        date, rev = m.group(1), int(m.group(2) or 1)
        if date not in best or rev > best[date][0]: best[date] = (rev, f)
    return best

def rehang_wall(strips, dry):
    path = ROOT / "office-data.json"
    data = json.loads(path.read_text())
    old = {s.get("slot"): s for s in data.get("strips", [])}
    wall = []
    for slot, s in zip(GALLERY, strips[:3]):
        prev = old.get(slot, {})
        e = {k: s[k] for k in ("filename", "thumb", "date", "episode", "title", "alt") if k in s}
        e["slot"] = slot
        e["upside_down"] = bool(prev.get("upside_down"))          # the prank belongs to the slot
        if prev.get("prank_note"): e["prank_note"] = prev["prank_note"]
        wall.append(e)
    data["strips"] = wall
    print("office wall:", ", ".join(f"{w['slot']}={w['date']}{' (upside down)' if w['upside_down'] else ''}" for w in wall))
    if not dry: path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path", nargs="?", default="/workspace/gremlin-diaries/site-copies", help="a strip PNG, or a folder of them")
    ap.add_argument("--title"); ap.add_argument("--alt"); ap.add_argument("--episode", type=int)
    ap.add_argument("--no-wall", action="store_true", help="don't re-hang the office gallery wall")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    best = pick(a.path)
    if not best: sys.exit("No gremlin-diaries-YYYY-MM-DD.png files found.")
    if (a.title or a.alt or a.episode) and len(best) != 1: sys.exit("--title/--alt/--episode only work with a single strip file.")

    mpath = ROOT / "strips.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {"strips": []}
    by_file = {s["filename"]: s for s in manifest.setdefault("strips", [])}
    for date, (rev, src) in sorted(best.items()):
        fn = f"assets/strips/gremlin-diaries-{date}.webp"
        is_new = fn not in by_file
        next_ep = max([s.get("episode") or 0 for s in by_file.values()] + [0]) + 1
        e = by_file.get(fn) or {"filename": fn, "date": date, "episode": next_ep,
                                "title": "[Title - fill in]", "alt": "[Describe the strip - fill in]"}
        e["date"] = date
        if a.title: e["title"] = a.title.strip()
        if a.episode: e["episode"] = a.episode
        if a.alt: e["alt"] = a.alt.strip()
        elif is_new and a.title: e["alt"] = f"Gremlin Diaries comic strip: {e['title']}."
        convert(src, date, a.dry_run)
        e["thumb"] = f"assets/strips/gremlin-diaries-{date}-thumb.webp"
        if not a.dry_run: e["width"], e["height"] = Image.open(ROOT / fn).size
        by_file[fn] = e
        print(("added " if is_new else "updated ") + f"{src.name} -> {fn}  (Episode {e['episode']}: {e['title']}, {date})")
        if "fill in" in e["title"]: print("  ! title is still a placeholder: re-run with --title \"...\"")
    manifest["strips"] = sorted(by_file.values(), key=lambda s: (s["date"], s.get("episode") or 0), reverse=True)
    if not a.dry_run: mpath.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print("strips.json lists", len(manifest["strips"]), "strips" + (" (dry run, nothing written)" if a.dry_run else ""))
    if not a.no_wall: rehang_wall(manifest["strips"], a.dry_run)

if __name__ == "__main__":
    main()
