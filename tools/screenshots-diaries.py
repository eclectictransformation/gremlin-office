#!/usr/bin/env python3
"""Smoke-test + screenshots for diaries.html (v2 carousel).
Usage: python3 tools/screenshots-diaries.py [base_url] [out_prefix]     (server running on :8765)
Shots: default view, an older strip, the reader, the office popup, and the page embedded in a Remixer-like
host (sticky 80px header + the exact auto-height listener), at desktop 1280 and phone 390."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
PRE = sys.argv[2] if len(sys.argv) > 2 else "v2"
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
DEVICES = [("desktop", {"width": 1280, "height": 800}, False), ("phone", {"width": 390, "height": 844}, True)]
problems, report = [], {}
def watch(pg, tag):
    pg.on("console", lambda m: m.type == "error" and problems.append(f"{tag} console: {m.text}"))
    pg.on("pageerror", lambda e: problems.append(f"{tag} pageerror: {e}"))
    pg.on("requestfailed", lambda r: problems.append(f"{tag} failed: {r.url}"))
    pg.on("response", lambda r: r.status >= 400 and problems.append(f"{tag} {r.status}: {r.url}"))
    pg.on("request", lambda r: not r.url.startswith(BASE) and not r.url.startswith(("data:", "about:")) and problems.append(f"{tag} EXTERNAL: {r.url}"))
def shot(pg, name, **kw): pg.screenshot(path=str(OUT / f"{name}.png"), **kw); print("  saved", f"screenshots/{name}.png")
def check(cond, msg):
    if not cond: problems.append(msg)
STATE = """() => ({current: document.querySelector('.slide.is-current h2').textContent,
  meta: document.querySelector('.slide.is-current .slide-meta').textContent,
  count: document.querySelector('#count').textContent,
  pills: [...document.querySelectorAll('.pill')].map(p => p.textContent + (p.getAttribute('aria-current') === 'true' ? '*' : '')),
  thumbs: document.querySelectorAll('.thumb').length,
  pageH: Math.ceil(document.querySelector('#page').getBoundingClientRect().height),
  hscroll: document.documentElement.scrollWidth > innerWidth,
  distorted: [...document.querySelectorAll('.strip-btn img')].filter(i => i.complete && i.naturalWidth && Math.abs(i.clientHeight / i.clientWidth - i.naturalHeight / i.naturalWidth) > 0.02).length})"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=ARGS)
    for dev, vp, mobile in DEVICES:
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); watch(pg, dev)
        pg.goto(f"{BASE}/diaries.html"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(600)
        st = pg.evaluate(STATE); print(dev, json.dumps(st)); report[f"{dev} standalone page height"] = st["pageH"]
        check(st["meta"].startswith("Ep 3"), f"{dev}: newest not first ({st['meta']})")
        check(not st["hscroll"] and not st["distorted"], f"{dev}: hscroll={st['hscroll']} distorted={st['distorted']}")
        shot(pg, f"{PRE}-{dev}-a-newest")
        # (b) older strip: button on desktop, swipe-style scroll on phone, keyboard check on both
        if mobile:
            pg.click("#next2"); pg.wait_for_timeout(800)
        else:
            pg.click("#next"); pg.wait_for_timeout(800)
        st2 = pg.evaluate(STATE); check(st2["meta"].startswith("Ep 2"), f"{dev}: Older did not move ({st2['meta']})")
        shot(pg, f"{PRE}-{dev}-b-older")
        pg.focus("#track"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(800)
        check(pg.evaluate(STATE)["meta"].startswith("Ep 1"), f"{dev}: ArrowRight did not go older")
        pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(800)
        check(pg.evaluate(STATE)["meta"].startswith("Ep 2"), f"{dev}: ArrowLeft did not go newer")
        # swipe: scroll the track like a finger would and let snap settle
        pg.evaluate("document.querySelector('#track').scrollBy({left: document.querySelector('.slide').offsetWidth * 0.8, behavior: 'instant'})"); pg.wait_for_timeout(900)
        check(pg.evaluate(STATE)["meta"].startswith("Ep 1"), f"{dev}: swipe/scroll did not snap to the older strip")
        pg.click(".pill"); pg.wait_for_timeout(800)
        check(pg.evaluate(STATE)["meta"].startswith("Ep 3"), f"{dev}: month pill did not jump to the month's first strip")
        pg.click(".thumb:nth-child(2)"); pg.wait_for_timeout(800)
        # (c) reader on the current (older) strip
        pg.click(".slide.is-current .strip-btn"); pg.wait_for_timeout(700)
        check(pg.evaluate("document.activeElement.matches('#reader [data-close]')"), f"{dev}: focus not moved into reader")
        r = pg.evaluate("""() => { const t = document.querySelector('#reader-title').getBoundingClientRect(), i = document.querySelector('#reader-img').getBoundingClientRect();
            return {title: document.querySelector('#reader-title').textContent, titleTop: Math.round(t.top), imgBottom: Math.round(i.bottom), vh: innerHeight}; }""")
        print("  reader", r); check(r["imgBottom"] <= r["vh"], f"{dev}: reader image overflows ({r})")
        shot(pg, f"{PRE}-{dev}-c-reader")
        pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(400)
        check("Moth" not in pg.evaluate("document.querySelector('#reader-title').textContent"), f"{dev}: reader next did not move")
        pg.click("#r-zoom"); pg.wait_for_timeout(400); shot(pg, f"{PRE}-{dev}-c2-reader-zoomed")
        for _ in range(8): pg.keyboard.press("Tab")
        check(pg.evaluate("document.querySelector('#reader').contains(document.activeElement)"), f"{dev}: focus escaped reader")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        check(pg.evaluate("document.querySelector('#reader').hidden"), f"{dev}: Esc did not close reader")
        check(pg.evaluate("document.activeElement.matches('.slide.is-current .strip-btn')"), f"{dev}: focus not restored to the strip")
        check(pg.evaluate(STATE)["meta"].startswith("Ep 1"), f"{dev}: carousel not synced with reader")
        # office popup still works
        pg.click("#open-office"); pg.wait_for_timeout(2000); shot(pg, f"{PRE}-{dev}-e-office-popup")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        check(pg.evaluate("document.querySelector('#office-pop').hidden"), f"{dev}: Esc did not close office")
        ctx.close()

    # (d) embedded in a Remixer-like host: sticky 80px header + the exact listener (origin adapted to localhost)
    for dev, vp, mobile in DEVICES:
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); watch(pg, f"embed-{dev}")
        host = f"""<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#fff;font-family:sans-serif">
<header style="position:sticky;top:0;z-index:10;height:80px;background:#2b2b2b;color:#fff;display:flex;align-items:center;padding:0 24px;font:600 20px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)">eclectictransformation.com (test header, sticky 80px)</header>
<section style="padding:30px 24px 20px"><h1 style="margin:0">Comics</h1><p>Remixer page text above the embed.</p></section>
<iframe id="gremlin-diaries" src="{BASE}/diaries.html" title="Gremlin Diaries comics" loading="eager" allow="fullscreen"
  style="display:block;width:100%;height:1100px;max-height:none;border:0;"></iframe>
<section style="padding:40px 24px;height:600px;background:#eee">Remixer footer</section>
<script>
  window.H = [];
  window.addEventListener("message", function (e) {{
    if (e.origin !== location.origin) return;          /* live: "https://eclectictransformation.github.io" */
    if (!e.data || e.data.type !== "gremlin-diaries-height") return;
    H.push(e.data.height);
    var f = document.getElementById("gremlin-diaries");
    if (f && e.data.height > 300) f.style.height = e.data.height + "px";
  }});
</script></body></html>"""
        pg.route(f"{BASE}/__remixer-test.html", lambda r: r.fulfill(body=host, content_type="text/html"))  # in-memory, never written
        pg.goto(f"{BASE}/__remixer-test.html"); pg.wait_for_timeout(2500)
        H = pg.evaluate("H"); fh = pg.evaluate("document.getElementById('gremlin-diaries').getBoundingClientRect().height")
        print(f"embed-{dev} height messages:", H, "iframe height:", fh); report[f"{dev} posted heights"] = H
        check(H and abs(fh - H[-1]) < 1, f"embed-{dev}: iframe height not adjusted ({H}, {fh})")
        check(len(H) <= 4, f"embed-{dev}: too many height messages ({len(H)})")
        shot(pg, f"{PRE}-embed-{dev}-1-top")
        # scroll the host so the strip is under the sticky header, like a visitor mid-page, then open the reader
        pg.evaluate("scrollTo(0, 330)"); pg.wait_for_timeout(400)
        fr = pg.frame_locator("#gremlin-diaries"); fr.locator("#next" if not mobile else "#next2").click(); pg.wait_for_timeout(800)
        shot(pg, f"{PRE}-embed-{dev}-2-older")
        fr.locator(".slide.is-current .strip-btn").click(); pg.wait_for_timeout(1500)
        pos = pg.evaluate("""() => { const f = document.getElementById('gremlin-diaries'), fr = f.getBoundingClientRect(), d = f.contentDocument;
            const t = d.querySelector('#reader-title').getBoundingClientRect(), i = d.querySelector('#reader-img').getBoundingClientRect(), x = d.querySelector('[data-close]').getBoundingClientRect();
            return {title: d.querySelector('#reader-title').textContent, titleTopOnScreen: Math.round(fr.top + t.top), closeTopOnScreen: Math.round(fr.top + x.top),
                    imgBottomOnScreen: Math.round(fr.top + i.bottom), viewport: innerHeight, header: 80, hostScrollY: Math.round(scrollY)}; }""")
        print(f"embed-{dev} reader:", pos); report[f"{dev} embedded reader"] = pos
        check(pos["titleTopOnScreen"] >= 80 and pos["closeTopOnScreen"] >= 80, f"embed-{dev}: reader title/close covered by header ({pos})")
        check(pos["imgBottomOnScreen"] <= pos["viewport"], f"embed-{dev}: reader image runs off screen ({pos})")
        shot(pg, f"{PRE}-embed-{dev}-3-reader")
        ctx.close()

    # two months of data (in-memory copy of strips.json with a fake November strip) -> pills
    ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); watch(pg, "months")
    data = json.loads((OUT.parent / "strips.json").read_text()); fake = dict(data["strips"][0], date="2026-11-02", episode=4, title="(test) November strip")
    data["strips"].insert(0, fake)
    pg.route(f"{BASE}/strips.json", lambda r: r.fulfill(body=json.dumps(data), content_type="application/json"))
    pg.goto(f"{BASE}/diaries.html"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(500)
    pills = pg.evaluate(STATE)["pills"]; print("two-month pills:", pills); check(pills == ["November*", "October"], f"pills wrong: {pills}")
    pg.click(".pill:nth-child(2)"); pg.wait_for_timeout(800)
    st = pg.evaluate(STATE); check(st["meta"].startswith("Ep 3") and st["pills"] == ["November", "October*"], f"October pill jump wrong: {st}")
    shot(pg, f"{PRE}-test-two-months")
    ctx.close(); b.close()
print("\nREPORT:", json.dumps(report, indent=1))
print("\nPROBLEMS:" if problems else "\nNo problems.", *problems, sep="\n  ")
