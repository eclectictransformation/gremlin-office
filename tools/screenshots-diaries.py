#!/usr/bin/env python3
"""Smoke-test + screenshots for diaries.html. Usage: python3 tools/screenshots-diaries.py [base_url] [out_prefix]"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
PRE = sys.argv[2] if len(sys.argv) > 2 else "diaries"
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
problems = []
def watch(pg, tag):
    pg.on("console", lambda m: m.type == "error" and problems.append(f"{tag} console: {m.text}"))
    pg.on("requestfailed", lambda r: problems.append(f"{tag} failed: {r.url}"))
    pg.on("response", lambda r: r.status >= 400 and problems.append(f"{tag} {r.status}: {r.url}"))
    pg.on("request", lambda r: not r.url.startswith(BASE) and not r.url.startswith(("data:", "about:")) and problems.append(f"{tag} EXTERNAL: {r.url}"))
def shot(pg, name): pg.screenshot(path=str(OUT / f"{name}.png")); print("  saved", name)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=ARGS)
    for dev, vp, mobile in [("desktop", {"width": 1280, "height": 800}, False), ("phone", {"width": 390, "height": 844}, True)]:
        ctx = b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); watch(pg, dev)
        pg.goto(f"{BASE}/diaries.html"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(500)
        info = pg.evaluate("""() => ({latest: document.querySelector('#latest-title').textContent,
            meta: document.querySelector('#latest-meta').textContent,
            pills: [...document.querySelectorAll('.pill')].map(p => p.textContent),
            cards: [...document.querySelectorAll('.card')].map(c => c.querySelector('h4').textContent + ' | ' + c.querySelector('.meta').textContent),
            cropped: [...document.querySelectorAll('.strip-btn img')].filter(i => i.complete && Math.abs(i.clientHeight / i.clientWidth - i.naturalHeight / i.naturalWidth) > 0.02).length,
            hscroll: document.documentElement.scrollWidth > innerWidth})""")
        print(dev, json.dumps(info, indent=1))
        if info["cropped"] or info["hscroll"]: problems.append(f"{dev}: cropped={info['cropped']} hscroll={info['hscroll']}")
        shot(pg, f"{PRE}-{dev}-01-top")
        pg.click(".pill"); pg.wait_for_timeout(900); shot(pg, f"{PRE}-{dev}-02-archive")
        pg.locator(".office").scroll_into_view_if_needed(); pg.evaluate("scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(700)
        shot(pg, f"{PRE}-{dev}-03-visit-office")
        pg.click("#open-office"); pg.wait_for_timeout(2500)
        assert pg.evaluate("document.activeElement.matches('#office-pop [data-close]')"), "focus not moved into popup"
        for _ in range(4): pg.keyboard.press("Tab")
        assert pg.evaluate("document.querySelector('#office-pop').contains(document.activeElement)"), "focus escaped popup"
        shot(pg, f"{PRE}-{dev}-04-office-popup")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        assert pg.evaluate("document.querySelector('#office-pop').hidden"), "Esc did not close"
        assert pg.evaluate("document.activeElement.id === 'open-office'"), "focus not restored"
        # Esc from inside the office iframe should also close it
        pg.click("#open-office"); pg.wait_for_timeout(2500)
        pg.frame_locator("#office-iframe").locator("#viewport").focus() if pg.frame_locator("#office-iframe").locator("#viewport").count() else None
        pg.frame_locator("#office-iframe").locator("body").press("Escape"); pg.wait_for_timeout(400)
        if not pg.evaluate("document.querySelector('#office-pop').hidden"): problems.append(f"{dev}: Esc inside office iframe did not close popup")
        pg.evaluate("scrollTo(0,0)"); pg.click("#latest-btn"); pg.wait_for_timeout(900); shot(pg, f"{PRE}-{dev}-05-reader")
        pg.keyboard.press("Escape"); ctx.close()
    # embedded in a host page: fixed height, and auto-height via postMessage
    ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); watch(pg, "embed")
    host = f"""<!doctype html><body style="margin:0;background:#fff;font-family:sans-serif"><h1 style="padding:20px">Remixer /comics (test host)</h1>
<iframe id="fixed" src="{BASE}/diaries.html" style="width:100%;height:1000px;border:0" title="Gremlin Diaries"></iframe>
<h2 style="padding:20px">Auto-height version</h2>
<iframe id="auto" src="{BASE}/diaries.html" style="width:100%;height:1000px;border:0" title="Gremlin Diaries auto"></iframe>
<script>window.H=[];addEventListener('message',e=>{{if(e.data&&e.data.type==='gremlin-diaries-height'){{H.push(e.data.height);document.getElementById('auto').style.height=e.data.height+'px'}}}});</script></body>"""
    pg.route(f"{BASE}/__embed-test.html", lambda r: r.fulfill(body=host, content_type="text/html"))  # in-memory host page, never written to disk
    pg.goto(f"{BASE}/__embed-test.html"); pg.wait_for_timeout(2500)
    H = pg.evaluate("H"); print("height messages:", H[-6:], "count", len(H))
    if not H or len(H) > 30: problems.append(f"height messages look wrong: {len(H)}")
    fr = pg.frame_locator("#fixed"); fr.locator(".pill").first.click(); pg.wait_for_timeout(600)
    shot(pg, f"{PRE}-embed-01-fixed-height")
    auto = pg.locator("#auto"); auto.scroll_into_view_if_needed()
    pg.evaluate("document.getElementById('auto').contentWindow.document.querySelector('.office').scrollIntoView({block:'center'})") if False else None
    box = auto.bounding_box(); pg.mouse.wheel(0, box["height"] - 900); pg.wait_for_timeout(500)
    pg.frame_locator("#auto").locator("#open-office").click(); pg.wait_for_timeout(2500)
    shot(pg, f"{PRE}-embed-02-auto-height-popup")
    ctx.close(); b.close()
print("\nPROBLEMS:" if problems else "\nNo problems.", *problems, sep="\n  ")
