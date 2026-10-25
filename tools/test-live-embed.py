#!/usr/bin/env python3
"""Go-live check: world.html inside the diaries.html "Visit the Office" pop-up, inside a cross-site host page
(stand-in for eclectictransformation.com/comics). Needs the site on 127.0.0.1:8765 and the host stand-in
(tools/live-host-comics.html + live-host-direct.html, copied as comics.html/direct.html into a folder served on localhost:8766), which is a different *site*, so storage is partitioned
the same way it is live. No Gremlin Names are created: every write RPC is intercepted and flagged.
Usage: python3 tools/test-live-embed.py"""
import pathlib, json
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"; OUT.mkdir(exist_ok=True)
HOST = "http://localhost:8766/"
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
READS = {"gw_leaderboard", "gw_stats", "gw_guestbook", "gw_load_progress"}
BLOCK_STORAGE = """(() => { if (!/world\\.html/.test(location.pathname) || window.self === window.top) return;
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }); })();"""
problems, results = [], []
def check(cond, msg):
    results.append(("PASS" if cond else "FAIL") + "  " + msg); print(results[-1], flush=True)
    if not cond: problems.append(msg)

def ctx_for(b, dev, block=False):
    w, h, mob = dev
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
    if block: ctx.add_init_script(BLOCK_STORAGE)
    def rpc(route):
        fn = route.request.url.rsplit("/", 1)[-1]
        if fn in READS: route.continue_()
        else: problems.append(f"write RPC attempted: {fn}"); route.fulfill(status=503, body="{}")
    ctx.route("**/rest/v1/rpc/**", rpc)
    return ctx

def watch(pg, tag, errs):
    pg.on("console", lambda m: m.type == "error" and errs.append(f"{tag} console: {m.text}"))
    pg.on("pageerror", lambda e: errs.append(f"{tag} pageerror: {e}"))
    pg.on("response", lambda r: r.status >= 400 and "favicon" not in r.url and errs.append(f"{tag} {r.status}: {r.url}"))

def world_frame(pg):
    for _ in range(100):
        for f in pg.frames:
            if "world.html" in f.url: return f
        pg.wait_for_timeout(100)
    raise RuntimeError("world frame never appeared")
def diaries_frame(pg): return next(f for f in pg.frames if "diaries.html" in f.url)

def in_view(pg, frame, sel):
    """Is frame's element fully on the visitor's screen and actually the thing under the pointer?"""
    el = frame.locator(sel).first
    bb = el.bounding_box()   # page coordinates
    if not bb: return False, None
    vw, vh = pg.viewport_size["width"], pg.viewport_size["height"]
    on = bb["x"] >= 0 and bb["y"] >= 0 and bb["x"] + bb["width"] <= vw + 1 and bb["y"] + bb["height"] <= vh + 1
    hit = frame.evaluate("s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return !!t && (t === e || e.contains(t)); }", sel)
    return on and hit, bb

def open_popup(pg, mob):
    d = diaries_frame(pg)
    btn = d.locator("#open-office"); btn.scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    if mob: btn.tap()
    else: btn.click()
    f = world_frame(pg)
    f.wait_for_function("window.GremlinWorld && !GremlinWorld.busy && document.getElementById('loading').hidden !== false || true")
    f.wait_for_selector("#room-name", state="attached"); pg.wait_for_timeout(1800)
    return d, f

def press(pg, loc, mob):
    loc.tap() if mob else loc.click()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=ARGS)
    for name, dev in [("desktop", (1280, 800, False)), ("phone", (390, 844, True))]:
        mob = dev[2]
        # ---------- normal browser: partitioned storage works ----------
        errs = []; ctx = ctx_for(b, dev); pg = ctx.new_page(); watch(pg, name, errs)
        pg.goto(HOST + "comics.html"); pg.wait_for_timeout(1500)
        d, f = open_popup(pg, mob)
        check("/world.html?embed" in f.url, f"{name}: pop-up iframe loads world.html?embed ({f.url})")
        f.wait_for_selector("#gw-signin:not([hidden])", timeout=6000)
        ok, bb = in_view(pg, f, "#gw-signin .gw-choices button"); check(ok, f"{name}: sign-in card visible + clickable in the pop-up ({bb})")
        check(f.evaluate("window.GW_STORAGE") == "local", f"{name}: localStorage available in the cross-site iframe")
        check(f.evaluate("getComputedStyle(document.querySelector('.t-world')).display") == "none", f"{name}: ?embed hides the duplicate 'Gremlin World' title")
        check(f.evaluate("document.getElementById('btn-popout').hidden"), f"{name}: no extra pop-out button when the host has one")
        pg.screenshot(path=str(OUT / f"live-{name}-signin.png")); print("saved", f"screenshots/live-{name}-signin.png")
        # usable: go to "New Gremlin Name", type (never submit), back out with Esc
        press(pg, f.locator("#gw-signin button", has_text="New Gremlin Name"), mob); pg.wait_for_timeout(400)
        inp = f.locator("#gw-signin input[name=gremlin-name]"); inp.fill("Test Typing Only")
        check(inp.input_value() == "Test Typing Only" and in_view(pg, f, "#gw-signin input[name=gremlin-name]")[0], f"{name}: Gremlin Name field typeable in the iframe")
        if not mob: pg.screenshot(path=str(OUT / f"live-{name}-signin-name.png")); print("saved", f"screenshots/live-{name}-signin-name.png")
        f.locator("#gw-signin input[name=gremlin-name]").press("Escape"); pg.wait_for_timeout(300)
        check(f.evaluate("!GremlinPlayer.isOpen()"), f"{name}: Esc closes the sign-in card (pop-up stays open)")
        check(not d.evaluate("document.getElementById('office-pop').hidden"), f"{name}: pop-up still open after closing the card")
        # guest play
        f.evaluate("GremlinPlayer.openSignin()"); pg.wait_for_timeout(400)
        press(pg, f.locator("#gw-signin button", has_text="Play as a guest"), mob); pg.wait_for_timeout(600)
        check(f.evaluate("localStorage.getItem('gremlin-world-player-choice')") == '"guest"', f"{name}: guest choice saved to iframe localStorage")
        room0 = f.locator("#room-name").inner_text()
        f.evaluate("GremlinWorld.look('to-tunnel')"); pg.wait_for_timeout(1500)
        r = f.evaluate("() => { const e = document.querySelector('[data-id=\"to-tunnel\"]'); const b = e.getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; }")
        fb = pg.locator("#d").bounding_box(); ib = d.locator("#office-iframe").bounding_box()
        x, y = ib["x"] + r[0], ib["y"] + r[1]
        if mob: pg.touchscreen.tap(x, y)
        else: pg.mouse.move(x, y); pg.wait_for_timeout(250); pg.mouse.down(); pg.wait_for_timeout(60); pg.mouse.up()
        pg.wait_for_timeout(900); f.wait_for_function("!GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
        room1 = f.locator("#room-name").inner_text()
        check(room1 != room0, f"{name}: guest can travel through the closet door ({room0} -> {room1}) with a real {'tap' if mob else 'click'}")
        # Headless Chrome quirk: a screenshot at device_scale_factor 2 after a room change leaves the nested cross-site
        # iframes ignoring later taps (events stop at the host's <iframe>; not reproducible without the screenshot).
        # So on the phone we take this shot last, after every tap-based check in this context.
        if not mob: pg.screenshot(path=str(OUT / f"live-{name}-guest-tunnel.png")); print("saved", f"screenshots/live-{name}-guest-tunnel.png")
        # Esc with nothing open closes the pop-up (desktop keyboard)
        if not mob:
            f.locator("#viewport").focus(); pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
            check(d.evaluate("document.getElementById('office-pop').hidden"), f"{name}: Esc inside the world closes the pop-up")
        else:
            press(pg, d.locator("#office-pop [data-close]"), mob); pg.wait_for_timeout(400)
            check(d.evaluate("document.getElementById('office-pop').hidden"), f"{name}: tapping Close shuts the pop-up")
        # reopen: remembered as guest => no sign-in card this time
        d, f = open_popup(pg, mob); pg.wait_for_timeout(600)
        check(not f.evaluate("GremlinPlayer.isOpen()"), f"{name}: reopening the pop-up remembers the guest (no sign-in card)")
        check(int(f.evaluate("(JSON.parse(localStorage.getItem('gremlin-world-visited')||'[]')).length")) >= 2, f"{name}: visited rooms persisted across pop-up reloads")
        # new window from the pop-up bar
        with ctx.expect_page() as np:
            press(pg, d.locator("#office-pop .tools a.ob"), mob)
        nw = np.value; watch(nw, name + " new-window", errs); nw.wait_for_load_state("load"); nw.wait_for_timeout(2200)
        check(nw.url.split("#")[0].endswith("/world.html") and nw.evaluate("!!window.GremlinWorld && document.body.classList.contains('standalone')"), f"{name}: pop-up 'New window' opens world.html standalone ({nw.url})")
        shared = nw.evaluate("localStorage.getItem('gremlin-world-player-choice')") == '"guest"'
        check(shared or (nw.evaluate("GremlinPlayer.isOpen()") and nw.locator("#gw-signin").is_visible()),
              f"{name}: new window either remembers the guest or shows the sign-in card (storage {'shared with' if shared else 'partitioned from'} the iframe)")
        nw.close()
        press(pg, d.locator("#office-pop [data-close]"), mob); pg.wait_for_timeout(300)
        with ctx.expect_page() as np:
            l = d.locator(".office a.btn"); l.scroll_into_view_if_needed(); press(pg, l, mob)
        nw = np.value; nw.wait_for_load_state("load"); nw.wait_for_timeout(1500)
        check(nw.url.split("#")[0].endswith("/world.html") and nw.evaluate("!!window.GremlinWorld"), f"{name}: section 'Open in a new window' opens world.html ({nw.url})")
        nw.close()
        # old links: index.html -> world.html with query + hash kept
        t = ctx.new_page(); watch(t, name + " redirect", errs); t.goto("http://127.0.0.1:8765/index.html?noprompt#tunnel"); t.wait_for_timeout(1500)
        check(t.url.endswith("/world.html?noprompt#tunnel"), f"{name}: index.html redirects to world.html keeping ?query#hash ({t.url})")
        t.goto("http://127.0.0.1:8765/office-classic.html"); t.wait_for_timeout(1200)
        check(t.evaluate("!!document.querySelector('#explore') && document.getElementById('loading').classList.contains('done') && document.querySelectorAll('#world .face').length > 0"), f"{name}: office-classic.html still loads the old office")
        t.close()
        if mob:   # the deferred phone shot: reopen (remembered guest), go through the closet door, snap
            d, f = open_popup(pg, mob); f.evaluate("GremlinWorld.look('to-tunnel')"); pg.wait_for_timeout(1300)
            f.evaluate("document.querySelector('[data-id=\"to-tunnel\"]').click()"); pg.wait_for_timeout(900); f.wait_for_function("!GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(1500)
            pg.screenshot(path=str(OUT / f"live-{name}-guest-tunnel.png")); print("saved", f"screenshots/live-{name}-guest-tunnel.png")
        check(not errs, f"{name}: no console/page errors or 4xx/5xx (normal storage) {errs}")
        ctx.close()

        # ---------- storage blocked inside the iframe (strict third-party settings) ----------
        errs = []; ctx = ctx_for(b, dev, block=True); pg = ctx.new_page(); watch(pg, name + " blocked", errs)
        pg.goto(HOST + "comics.html"); pg.wait_for_timeout(1500)
        d, f = open_popup(pg, mob)
        check(f.evaluate("window.GW_STORAGE") == "memory", f"{name}: blocked storage detected, in-memory fallback used")
        f.wait_for_selector("#gw-signin:not([hidden])", timeout=6000)
        check(f.locator(".gw-memory").is_visible() and f.locator(".gw-memory a").get_attribute("href").startswith("world.html"), f"{name}: sign-in card explains + offers a new window")
        pg.screenshot(path=str(OUT / f"live-{name}-storage-blocked.png")); print("saved", f"screenshots/live-{name}-storage-blocked.png")
        press(pg, f.locator("#gw-signin button", has_text="Play as a guest"), mob); pg.wait_for_timeout(500)
        check(not f.evaluate("GremlinPlayer.isOpen()"), f"{name}: guest play works with storage blocked")
        f.evaluate("GremlinWorld.look('to-tunnel')"); pg.wait_for_timeout(1300)
        f.evaluate("document.querySelector('[data-id=\"to-tunnel\"]').click()"); pg.wait_for_timeout(900); f.wait_for_function("!GremlinWorld.busy", timeout=15000)
        check(f.locator("#room-name").inner_text() != "The Office", f"{name}: travel works with storage blocked")
        check(not errs, f"{name}: no console/page errors (storage blocked) {errs}")
        ctx.close()

        # ---------- world.html framed directly, no ?embed: own pop-out button ----------
        errs = []; ctx = ctx_for(b, dev); pg = ctx.new_page(); watch(pg, name + " direct", errs)
        pg.goto(HOST + "direct.html"); f = world_frame(pg); pg.wait_for_timeout(2500)
        a = f.locator("#btn-popout")
        check(a.is_visible() and a.get_attribute("href") == "world.html", f"{name}: framed without ?embed shows a pop-out button")
        check(not errs, f"{name}: no errors (direct frame) {errs}")
        ctx.close()
    b.close()
print("\nPROBLEMS:" if problems else "\nALL GOOD", *problems, sep="\n")
