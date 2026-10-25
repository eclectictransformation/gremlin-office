#!/usr/bin/env python3
"""Smoke test + screenshots for world.html (Gremlin World sample). Server on :8765, `pip install playwright`.
Usage: python3 tools/screenshots-world.py [--svg]   (--svg forces the drawn placeholder rooms)"""
import sys, pathlib
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"; OUT.mkdir(exist_ok=True)
SVG = "--svg" in sys.argv
BASE = "http://127.0.0.1:8765/"
URL = BASE + "world.html" + ("?art=svg" if SVG else "")
TAG = "world-svg-" if SVG else "world-"
errors = []

def hit(page, item_id, touch=False):
    """Click an item at its on-screen centre (Playwright's own click scrolls 3D items oddly)."""
    r = page.evaluate("id => { const e = document.querySelector(`[data-id=\"${id}\"]`); const b = e.getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; }", item_id)
    if touch: page.touchscreen.tap(r[0], r[1])
    else:
        page.mouse.move(r[0], r[1]); page.wait_for_timeout(250)
        page.mouse.down(); page.wait_for_timeout(60); page.mouse.up()

def page_for(b, w, h, mobile=False):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and "404" not in m.text and "Failed to load resource" not in m.text and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    return pg
def shot(pg, name): pg.screenshot(path=str(OUT / f"{TAG}{name}.png")); print("shot", name)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = page_for(b, 1280, 800)
    pg.goto(URL); pg.wait_for_timeout(2500)
    # hub: look at the supply-closet door (tunnel entrance), hover so its tag shows
    pg.evaluate("GremlinWorld.look('to-tunnel')"); pg.wait_for_timeout(1500)
    pg.hover('[data-id="to-tunnel"]'); pg.wait_for_timeout(500)
    shot(pg, "01-hub-doorway")
    hit(pg, 'to-tunnel'); pg.wait_for_timeout(900)
    shot(pg, "02-transition")
    pg.wait_for_timeout(700); pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
    shot(pg, "03-tunnel")
    EGG = "tiny-door" if SVG else "patience-jar"
    pg.evaluate(f"GremlinWorld.look('{EGG}')"); pg.wait_for_timeout(1600)
    shot(pg, "04-tunnel-wall")
    hit(pg, EGG); pg.wait_for_timeout(1500)
    shot(pg, "05-egg-" + EGG)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
    pg.evaluate("GremlinWorld.look('sock-dot')"); pg.wait_for_timeout(1600)
    hit(pg, 'sock-dot'); pg.wait_for_timeout(1300)
    shot(pg, "06-game-sock-found")
    pg.evaluate("GremlinWorld.look('to-gallery')"); pg.wait_for_timeout(1200)
    hit(pg, 'to-gallery'); pg.wait_for_timeout(700); pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
    shot(pg, "07-gallery")
    hit(pg, 'mona'); pg.wait_for_timeout(1300)
    shot(pg, "08-egg-mona-wink")
    pg.wait_for_timeout(1500); shot(pg, "09-egg-mona-card")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    if not SVG:
        # the painted-only rooms: archive (down the gallery hatch), rooftop (up the ladder), arcade (tiny tunnel door)
        pg.evaluate("GremlinWorld.look('to-archive')"); pg.wait_for_timeout(1400)
        shot(pg, "13-gallery-hatch")
        hit(pg, 'to-archive'); pg.wait_for_timeout(700); pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
        shot(pg, "14-archive")
        pg.evaluate("GremlinWorld.look('strip-0')"); pg.wait_for_timeout(1300)
        hit(pg, 'strip-0'); pg.wait_for_timeout(1500); shot(pg, "15-archive-strip-card")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
        pg.evaluate("GremlinWorld.look('to-rooftop')"); pg.wait_for_timeout(1400)
        hit(pg, 'to-rooftop'); pg.wait_for_timeout(700); pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
        shot(pg, "16-rooftop")
        pg.evaluate("GremlinWorld.look('tea-table')"); pg.wait_for_timeout(1300)
        hit(pg, 'tea-table'); pg.wait_for_timeout(1500); shot(pg, "17-rooftop-tea-card")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
        pg.evaluate("GremlinWorld.travel('tunnel')"); pg.wait_for_timeout(700); pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
        pg.evaluate("GremlinWorld.look('to-arcade')"); pg.wait_for_timeout(1400)
        hit(pg, 'to-arcade'); pg.wait_for_timeout(700); pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
        shot(pg, "18-arcade")
        pg.evaluate("GremlinWorld.look('claw')"); pg.wait_for_timeout(1300)
        hit(pg, 'claw'); pg.wait_for_timeout(1500); shot(pg, "19-arcade-claw-card")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(700)
    pg.click("#btn-map"); pg.wait_for_timeout(500); shot(pg, "10-map"); pg.keyboard.press("Escape")
    # collect the remaining socks the quick way, visiting each room
    for room, sock in (("gallery", "sock-grimble"), ("tunnel", "sock-pip"), ("office", "sock-noodle")) + (("arcade", "sock-vesper"),):
        if pg.evaluate("GremlinWorld.room") != room:
            pg.evaluate(f"GremlinWorld.travel('{room}')"); pg.wait_for_timeout(700); pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
        pg.evaluate(f"GremlinWorld.look('{sock}')"); pg.wait_for_timeout(1400)
        if sock == "sock-noodle": shot(pg, "11-game-spot-a-sock")
        hit(pg, sock); pg.wait_for_timeout(1200)
        print(" ", room, sock, pg.evaluate("(()=>{const e=document.querySelector('[data-id=\"%s\"]');if(!e)return 'gone';const b=e.getBoundingClientRect();const t=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return t.className+' '+[b.x|0,b.y|0]})()" % sock), pg.evaluate("document.getElementById('sock-count').textContent"), pg.evaluate("GremlinWorld.busy"))
    pg.wait_for_timeout(1800)
    shot(pg, "12-prize")
    print("socks:", pg.evaluate("document.getElementById('sock-count').textContent"))
    pg.wait_for_selector("#prize:not([hidden])", timeout=8000); pg.click("#prize-close"); pg.wait_for_timeout(300)
    pg.click("#btn-back"); pg.wait_for_timeout(700); pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900); print("after back:", pg.evaluate("GremlinWorld.room"))

    m = page_for(b, 390, 844, mobile=True)
    m.goto(URL); m.wait_for_timeout(2500)
    shot(m, "phone-01-hub")
    m.evaluate("GremlinWorld.look('to-tunnel')"); m.wait_for_timeout(1500)
    hit(m, 'to-tunnel', touch=True); m.wait_for_timeout(700); m.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); m.wait_for_timeout(900)
    shot(m, "phone-02-tunnel")
    # swipe to look around
    m.evaluate("GremlinWorld.look('kettle')"); m.wait_for_timeout(1500)
    hit(m, 'kettle', touch=True); m.wait_for_timeout(1500)
    shot(m, "phone-03-kettle-card")
    m.tap("#card .card-close"); m.wait_for_timeout(600)
    m.evaluate("GremlinWorld.travel('gallery')"); m.wait_for_timeout(700); m.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=15000); m.wait_for_timeout(900)
    shot(m, "phone-04-gallery")
    m.tap("#btn-map"); m.wait_for_timeout(500); shot(m, "phone-05-map")
    b.close()
print("errors:", errors)
