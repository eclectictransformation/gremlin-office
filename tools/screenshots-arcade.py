#!/usr/bin/env python3
"""Smoke test + screenshots for the playable arcade cabinets in world.html (games/*.js).
Server on :8765 (python3 -m http.server 8765), `pip install playwright`. Usage: python3 tools/screenshots-arcade.py
Saves screenshots/arcade-*.png and prints a pass/fail line per check."""
import pathlib, sys
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"; OUT.mkdir(exist_ok=True)
URL = "http://127.0.0.1:8765/world.html?noprompt#arcade"
errors, fails = [], []

def ok(cond, label):
    print(("PASS " if cond else "FAIL ") + label)
    if not cond: fails.append(label)
def page_for(b, w, h, mobile=False):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and "404" not in m.text and "Failed to load resource" not in m.text and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    return pg
def shot(pg, name): pg.screenshot(path=str(OUT / f"arcade-{name}.png")); print("shot", name)
def hit(pg, item_id, touch=False):
    r = pg.evaluate("id => { const b = document.querySelector(`[data-id=\"${id}\"]`).getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; }", item_id)
    if touch: pg.touchscreen.tap(r[0], r[1])
    else: pg.mouse.move(r[0], r[1]); pg.wait_for_timeout(200); pg.mouse.down(); pg.wait_for_timeout(60); pg.mouse.up()
def canvas_xy(pg, x, y):
    """logical 320x240 -> page coords"""
    return pg.evaluate("([x,y]) => { const b = document.querySelector('.arcade-overlay canvas').getBoundingClientRect(); return [b.x + x/320*b.width, b.y + y/240*b.height]; }", [x, y])
def mode(pg): return pg.evaluate("GremlinArcade.mode")
def sim(pg, steps, dt=0.05):
    """fast-forward the running game (same update() the loop calls) so soft endings can be reached quickly"""
    return pg.evaluate("([n, dt]) => { const g = GremlinArcade.game; for (let i = 0; i < n && GremlinArcade.mode === 'play'; i++) g.update(dt); return GremlinArcade.mode; }", [steps, dt])
def start_game(pg, idx, touch=False):
    sel = f".arcade-overlay .menu li:nth-child({idx}) button"
    pg.wait_for_selector(sel + ":not([disabled])", timeout=5000)
    if touch: pg.tap(sel)
    else: pg.click(sel)
    pg.wait_for_timeout(300); ok(mode(pg) == "play", f"game {idx} starts")
def open_cab(pg, cab, touch=False):
    pg.evaluate(f"GremlinWorld.look('{cab}')"); pg.wait_for_timeout(1300)
    hit(pg, cab, touch); pg.wait_for_selector(".arcade-overlay:not([hidden]) .menu-item:not([disabled])", timeout=6000); pg.wait_for_timeout(500)
def score(pg): return pg.evaluate("document.querySelector('.over-score').textContent")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = page_for(b, 1280, 800)
    pg.goto(URL); pg.wait_for_timeout(2500); pg.wait_for_function("window.GremlinWorld && GremlinWorld.room === 'arcade'", timeout=10000)
    pg.evaluate("GremlinWorld.turnTo(0, 2, 1)"); pg.wait_for_timeout(1400); shot(pg, "00-room-cabinets")

    # ---- cabinet 1: OFFICE OLYMPICS ----
    open_cab(pg, "cabinet-blue")
    ok(pg.evaluate("document.getElementById('arcade-title').textContent") == "OFFICE OLYMPICS", "blue cabinet opens Office Olympics")
    ok(pg.evaluate("document.querySelectorAll('.arcade-overlay .menu-item:not([disabled])').length") == 3, "3 games in the menu")
    shot(pg, "01-office-olympics-menu")
    yaw0 = pg.evaluate("GremlinWorld.view.yaw")
    pg.mouse.move(80, 400); pg.mouse.down(); pg.mouse.move(300, 420, steps=8); pg.mouse.up()   # drag on the dimmed backdrop edge
    pg.keyboard.down("ArrowRight"); pg.wait_for_timeout(400); pg.keyboard.up("ArrowRight")
    ok(abs(pg.evaluate("GremlinWorld.view.yaw") - yaw0) < 0.5, "world doesn't turn while the cabinet is open")
    ok(mode(pg) == "menu", "cabinet stays open when you drag beside it")

    # Desk Tennis: keys + mouse, then let the lazy stapler win softly
    start_game(pg, 1)
    y0 = pg.evaluate("GremlinArcade.game && 1")
    pg.keyboard.down("ArrowUp"); pg.wait_for_timeout(500); pg.keyboard.up("ArrowUp")
    cx, cy = canvas_xy(pg, 160, 150); pg.mouse.move(cx, cy); pg.wait_for_timeout(1800)
    shot(pg, "02-desk-tennis-play")
    pg.mouse.move(10, 10)
    pg.evaluate("(() => { const g = GremlinArcade.game; })()")
    m = sim(pg, 6000); ok(m == "over", "desk tennis reaches a soft ending"); pg.wait_for_timeout(400)
    print("   ", pg.evaluate("document.querySelector('.scr-over').innerText.replace(/\\n+/g,' | ')"))
    shot(pg, "03-desk-tennis-soft-over")
    pg.click(".arcade-overlay .again"); pg.wait_for_timeout(300); ok(mode(pg) == "play", "AGAIN? restarts")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300); ok(mode(pg) == "menu", "Esc goes back to the menu")

    # Paper Plane Toss: aim with keys, throw with space, drag-throw with the mouse
    start_game(pg, 2)
    pg.keyboard.down("ArrowRight"); pg.wait_for_timeout(300); pg.keyboard.up("ArrowRight")
    pg.keyboard.press("Space"); pg.wait_for_timeout(450)
    shot(pg, "04-paper-plane-play")
    sim(pg, 60)
    sx, sy = canvas_xy(pg, 120, 120); pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx - 50, sy + 40, steps=6); pg.mouse.up()
    for _ in range(8):
        if mode(pg) != "play": break
        sim(pg, 80); pg.keyboard.press("Space")
    sim(pg, 200); ok(mode(pg) == "over", "paper planes: round of 6 ends softly"); print("   ", score(pg))
    shot(pg, "05-paper-plane-over")
    pg.click(".arcade-overlay .tomenu"); pg.wait_for_timeout(300)

    # Stapler Stack: drop a few, then a wild one
    start_game(pg, 3)
    for i in range(4):
        if mode(pg) != "play": break
        pg.keyboard.press("Space"); sim(pg, 30); pg.wait_for_timeout(120 + 170 * i)
    pg.wait_for_timeout(300); shot(pg, "06-stapler-stack-play")
    for _ in range(40):
        if mode(pg) != "play": break
        pg.evaluate("GremlinArcade.game.press('action')"); sim(pg, 9 + _ * 4)
    ok(mode(pg) == "over", "stapler stack topples softly"); print("   ", score(pg))
    print("    stack:", score(pg))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200); pg.keyboard.press("Escape"); pg.wait_for_timeout(900)
    ok(mode(pg) == "closed" and pg.evaluate("document.querySelector('.arcade-overlay').hidden"), "Esc twice closes the cabinet")
    ok(pg.evaluate("document.activeElement && document.activeElement.dataset.id") == "cabinet-blue", "focus returns to the cabinet")

    # ---- cabinet 2: GARDEN GREMLINS ----
    open_cab(pg, "cabinet-red")
    ok(pg.evaluate("document.getElementById('arcade-title').textContent") == "GARDEN GREMLINS", "red cabinet opens Garden Gremlins")
    shot(pg, "07-garden-gremlins-menu")
    start_game(pg, 1)   # Hungry Vine
    pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(700); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(900)
    shot(pg, "08-hungry-vine-play")
    ok(sim(pg, 2000) == "over", "hungry vine naps instead of dying"); pg.wait_for_timeout(300)
    print("   ", pg.evaluate("document.querySelector('.scr-over').innerText.replace(/\\n+/g,' | ')"))
    shot(pg, "09-hungry-vine-nap")
    pg.click(".arcade-overlay .tomenu"); pg.wait_for_timeout(300)

    start_game(pg, 2)   # Sock Pairing: real clicks first, then brute-force pairs to win
    def card_xy(i): return canvas_xy(pg, 22 + (i % 4) * 66 + 29, 24 + (i // 4) * 70 + 31)
    x, y = card_xy(0); pg.mouse.click(x, y); pg.wait_for_timeout(250); x, y = card_xy(5); pg.mouse.click(x, y); pg.wait_for_timeout(300)
    shot(pg, "10-sock-pairing-play")
    sim(pg, 30)
    for i in range(12):
        for j in range(i + 1, 12):
            if mode(pg) != "play": break
            pg.evaluate("([a, b]) => { const g = GremlinArcade.game; const xy = i => [22 + (i % 4) * 66 + 29, 24 + Math.floor(i / 4) * 70 + 31]; g.pointer('down', ...xy(a)); g.pointer('down', ...xy(b)); }", [i, j]); sim(pg, 25)
    sim(pg, 60); ok(mode(pg) == "over", "sock pairing can be won"); print("   ", score(pg))
    shot(pg, "11-sock-pairing-win")
    pg.click(".arcade-overlay .tomenu"); pg.wait_for_timeout(300)

    start_game(pg, 3)   # Seed Packet Bonk
    pg.keyboard.press("Space"); pg.keyboard.down("ArrowLeft"); pg.wait_for_timeout(500); pg.keyboard.up("ArrowLeft"); pg.wait_for_timeout(700)
    shot(pg, "12-seed-bonk-play")
    for _ in range(6):
        if mode(pg) != "play": break
        sim(pg, 200); pg.keyboard.press("Space")
    ok(mode(pg) == "over", "seed bonk ends softly"); print("   ", score(pg))
    pg.click(".arcade-overlay .close"); pg.wait_for_timeout(800)
    ok(mode(pg) == "closed" and pg.evaluate("GremlinWorld.room") == "arcade", "Close returns to the arcade room")
    bests = pg.evaluate("Object.keys(localStorage).filter(k => k.includes('arcade-best')).map(k => k.replace('gremlin-world-arcade-best-','') + '=' + localStorage[k])")
    print("    bests:", bests); ok(len(bests) >= 4, "personal bests saved in localStorage")

    # prize hook: disabled by default -> nothing; enabled in-memory -> only "Prizes coming soon."
    open_cab(pg, "cabinet-blue"); start_game(pg, 3)
    pg.keyboard.press("Space"); sim(pg, 30); pg.keyboard.press("Space"); sim(pg, 400)
    for _ in range(40):
        if mode(pg) != "play": break
        pg.evaluate("GremlinArcade.game.press('action')"); sim(pg, 9 + _ * 4)
    ok(pg.evaluate("document.querySelector('.scr-prize').hidden"), "prize hook stays silent while disabled")
    pg.click(".arcade-overlay .tomenu")
    pg.evaluate("(() => { const g = GremlinWorld.data.arcade.machines['office-olympics'].games[2]; g.prize.enabled = true; g.prize.milestone.value = 1; })()")
    start_game(pg, 3); pg.keyboard.press("Space"); sim(pg, 30)
    for _ in range(40):
        if mode(pg) != "play": break
        pg.evaluate("GremlinArcade.game.press('action')"); sim(pg, 9 + _ * 4)
    txt = pg.evaluate("document.querySelector('.scr-prize').hidden ? '' : document.querySelector('.scr-prize').innerText")
    ok("Prizes coming soon" in txt, "enabled-with-no-code prize shows only the coming-soon note"); print("   ", txt.replace("\n", " | "))
    pg.screenshot(path="/tmp/arcade-prize-hook-test.png")
    pg.evaluate("GremlinWorld.data.arcade.machines['office-olympics'].games[2].prize.enabled = false")
    pg.click(".arcade-overlay .prize-ok"); pg.click(".arcade-overlay .close"); pg.wait_for_timeout(500)

    # ---- phone 390x844 (touch) ----
    m = page_for(b, 390, 844, mobile=True)
    m.goto(URL); m.wait_for_timeout(2500); m.wait_for_function("window.GremlinWorld && GremlinWorld.room === 'arcade'", timeout=10000)
    m.wait_for_timeout(9000)   # let the greeting bubble finish
    open_cab(m, "cabinet-red", touch=True)
    fits = m.evaluate("(() => { const r = document.querySelector('.arcade-overlay .cab').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; })()")
    ok(fits, "phone: cabinet fits inside the view")
    shot(m, "13-phone-garden-menu")
    start_game(m, 1, touch=True)
    m.tap(".cab-pad [data-k=down]"); m.wait_for_timeout(600)
    cx, cy = canvas_xy(m, 200, 120); m.touchscreen.tap(cx, cy); m.wait_for_timeout(700)
    shot(m, "14-phone-hungry-vine")
    m.tap(".arcade-overlay .back"); m.wait_for_timeout(300); ok(mode(m) == "menu", "phone: Back returns to the menu")
    m.tap(".arcade-overlay .close"); m.wait_for_timeout(800)
    open_cab(m, "cabinet-blue", touch=True)
    start_game(m, 1, touch=True)
    # drag the gremlin paddle with a finger (synthetic touch drag via CDP)
    cdp = m.context.new_cdp_session(m)
    x0, y0 = canvas_xy(m, 60, 200); x1, y1 = canvas_xy(m, 60, 60)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
    for k in range(1, 11): cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0, "y": y0 + (y1 - y0) * k / 10}]}); m.wait_for_timeout(40)
    m.wait_for_timeout(600); cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    m.wait_for_timeout(500); shot(m, "15-phone-desk-tennis")
    m.tap(".cab-pad [data-k=down]"); m.wait_for_timeout(300)
    start_game(m, 1, touch=True) if mode(m) == "menu" else None
    m.tap(".arcade-overlay .close"); m.wait_for_timeout(800); ok(mode(m) == "closed", "phone: Close works")
    m.goto("http://127.0.0.1:8765/world.html?noprompt#arcade"); m.wait_for_timeout(2500)
    open_cab(m, "cabinet-blue", touch=True); start_game(m, 2, touch=True)
    x0, y0 = canvas_xy(m, 150, 120); x1, y1 = canvas_xy(m, 100, 160)
    cdp = m.context.new_cdp_session(m)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y0}]})
    for k in range(1, 8): cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x0 + (x1 - x0) * k / 7, "y": y0 + (y1 - y0) * k / 7}]}); m.wait_for_timeout(30)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); m.wait_for_timeout(400)
    shot(m, "16-phone-paper-plane")
    b.close()
print("errors:", errors)
print("FAILS:", fails)
sys.exit(1 if errors or fails else 0)
