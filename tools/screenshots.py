#!/usr/bin/env python3
"""Headless smoke test + screenshots. Needs a local server on :8765 and `pip install playwright`."""
import sys, pathlib
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"; OUT.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:8765/"
CHROME = "/usr/bin/google-chrome"
errors = []
def page_for(b, w, h, mobile=False):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1,
                        is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    reqs = []; pg.on("request", lambda r: reqs.append(r.url))
    return pg, reqs
with sync_playwright() as p:
    # GPU (SwiftShader) compositing: the default headless software compositor mis-clips CSS 3D planes
    b = p.chromium.launch(executable_path=CHROME, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg, reqs = page_for(b, 1280, 800)
    pg.goto(BASE + "office-classic.html"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "desktop-01-desks.png"))
    # hover reveal glow on a hidden hotspot
    pg.hover('[data-id="poem-grimble"]'); pg.wait_for_timeout(400)
    pg.screenshot(path=str(OUT / "desktop-02-hover-glow.png"))
    pg.click('[data-id="poem-grimble"]'); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(OUT / "desktop-03-poem-card.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    # drag to the gallery (turn right ~90deg)
    pg.mouse.move(900, 400); pg.mouse.down(); 
    for i in range(20): pg.mouse.move(900 - i * 30, 400)
    pg.mouse.up(); pg.wait_for_timeout(1500)
    pg.evaluate("GremlinOffice.turnTo(90, 2, 1)"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "desktop-04-gallery.png"))
    pg.click('[data-id="mona-grimsa"]'); pg.wait_for_timeout(1300)
    pg.screenshot(path=str(OUT / "desktop-05-mona-card.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    pg.click('button.strip.upside'); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "desktop-06-upside-down-strip.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    for yaw, name in ((180, "07-window-nook"), (270, "08-print-corner")):
        pg.evaluate(f"GremlinOffice.turnTo({yaw}, -2, 1)"); pg.wait_for_timeout(1800)
        pg.screenshot(path=str(OUT / f"desktop-{name}.png"))
    pg.evaluate("GremlinOffice.turnTo(250, 55, 1)"); pg.wait_for_timeout(1800)
    pg.screenshot(path=str(OUT / "desktop-09-ceiling.png"))
    pg.click("#btn-explore"); pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT / "desktop-10-explore-list.png"))
    pg.keyboard.press("Escape")
    # keyboard: Tab focuses hotspots and turns the camera
    pg.evaluate("GremlinOffice.turnTo(0, 0, 1)"); pg.wait_for_timeout(1500)
    pg.focus("#viewport"); 
    for _ in range(3): pg.keyboard.press("Tab")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "desktop-11-keyboard-focus.png"))
    print("focused:", pg.evaluate("document.activeElement.getAttribute('aria-label')"))
    pg.evaluate("document.body.classList.add('reveal')"); pg.wait_for_timeout(300)
    pg.evaluate("GremlinOffice.turnTo(0, -6, 1)"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "desktop-12-show-secrets.png"))
    ext = [u for u in reqs if not u.startswith(BASE)]
    print("desktop requests:", len(reqs), "external:", ext)

    pg, reqs = page_for(b, 390, 844, mobile=True)
    pg.goto(BASE + "office-classic.html"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "phone-01-desks.png"))
    pg.tap('[data-id="noodle-chair"]'); pg.wait_for_timeout(1400)
    pg.screenshot(path=str(OUT / "phone-02-tap-card.png"))
    pg.tap("#card .card-close"); pg.wait_for_timeout(800)
    pg.evaluate("GremlinOffice.turnTo(90, 2, 1)"); pg.wait_for_timeout(1600)
    pg.screenshot(path=str(OUT / "phone-03-gallery.png"))
    pg.tap("#btn-explore"); pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT / "phone-04-explore-list.png"))
    pg.tap("#explore .card-close")
    pg.goto(BASE + "comics.html"); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(OUT / "phone-05-comics.png"))
    pg.evaluate("document.getElementById('track').scrollTo({left:99999,behavior:'instant'})"); pg.wait_for_timeout(900)
    pg.evaluate("document.querySelectorAll('.strip-scroll')[2].scrollTop=500"); pg.wait_for_timeout(500)
    pg.screenshot(path=str(OUT / "phone-06-comics-tall-strip-scrolled.png"))
    pg.tap(".card:last-child .card-foot button"); pg.wait_for_timeout(900)
    pg.screenshot(path=str(OUT / "phone-07-comics-full-size.png"))
    ext = [u for u in reqs if not u.startswith(BASE)]
    print("phone requests:", len(reqs), "external:", ext)

    pg, reqs = page_for(b, 1280, 800)
    pg.goto(BASE + "comics.html"); pg.wait_for_timeout(1200)
    pg.screenshot(path=str(OUT / "desktop-13-comics.png"))
    pg.set_content('<body style="margin:0;font-family:sans-serif;background:#fff"><iframe src="' + BASE + 'comics.html" style="width:100%;height:560px;border:0" title="Gremlin Diaries"></iframe></body>')
    pg.wait_for_timeout(1500); pg.screenshot(path=str(OUT / "desktop-15-comics-embedded-560px.png"))
    # embed test: iframe at 100% x 600
    pg.set_content('<body style="margin:0;font-family:sans-serif;background:#fff"><p style="padding:8px">Host page (eclectictransformation.com stand-in)</p>'
                   '<iframe src="' + BASE + 'office-classic.html" style="width:100%;height:600px;border:0" title="The Gremlin Office"></iframe></body>')
    pg.wait_for_timeout(2000)
    pg.screenshot(path=str(OUT / "desktop-14-embedded-iframe-600px.png"))
    b.close()
print("errors:", errors)
