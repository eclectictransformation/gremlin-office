#!/usr/bin/env python3
"""End-to-end test + screenshots for Gremlin Names, the quest journal, badges, the guestbook and Break Room Brawl.
Talks to the LIVE Supabase project, so it creates a real test player (printed at the end): delete it afterwards
(see README-world.md, "Resetting / cleaning up"). Server on :8765 (python3 -m http.server 8765), `pip install playwright`.
Usage: python3 tools/screenshots-login.py   -> screenshots/login-*.png, journal-*.png, brawl-*.png"""
import pathlib, random, re, sys
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).resolve().parent.parent / "screenshots"; OUT.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:8765/world.html"
NAME = "Tester %04d" % random.randint(0, 9999)
errors, fails = [], []

def ok(cond, label):
    print(("PASS " if cond else "FAIL ") + label, flush=True)
    if not cond: fails.append(label)
def ctx_for(b, w, h, mobile=False):
    c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    try: c.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://127.0.0.1:8765")
    except Exception: pass
    return c
def page_in(c, url):
    pg = c.new_page()
    pg.on("console", lambda m: m.type == "error" and "404" not in m.text and "Failed to load resource" not in m.text and "ERR_" not in m.text and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(url); pg.wait_for_function("window.GremlinWorld && window.GremlinPlayer", timeout=15000); pg.wait_for_timeout(1200)
    return pg
def shot(pg, name): pg.screenshot(path=str(OUT / f"{name}.png")); print("shot", name, flush=True)
def hit(pg, item_id, touch=False):
    r = pg.evaluate("id => { const b = document.querySelector(`[data-id=\"${id}\"]`).getBoundingClientRect(); return [b.x + b.width/2, b.y + b.height/2]; }", item_id)
    if touch: pg.touchscreen.tap(r[0], r[1])
    else: pg.mouse.move(r[0], r[1]); pg.wait_for_timeout(200); pg.mouse.down(); pg.wait_for_timeout(60); pg.mouse.up()
def ls(pg, k): return pg.evaluate("k => JSON.parse(localStorage.getItem('gremlin-world-' + k) || 'null')", k)
def view(pg): return pg.evaluate("(document.querySelector('#gw-signin .gw-body') || {dataset:{}}).dataset.view || null")
def visible(pg, sel): return pg.evaluate("s => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]') && e.getClientRects().length > 0; }", sel)
def sync(pg): pg.evaluate("GremlinPlayer.sync()"); pg.wait_for_function("GremlinPlayer.syncState !== 'busy'", timeout=10000); pg.wait_for_timeout(600)
def bot_jam(pg):
    """fast-forward Jam Buster, tapping all 9 printers every 50ms (empty taps reset the combo, so it's an honest-ish score)"""
    return pg.evaluate("""() => { const g = GremlinArcade.game; for (let n = 0; n < 2000 && GremlinArcade.mode === 'play'; n++) {
        g.update(0.05); if (n % 3) continue; for (let i = 0; i < 9; i++) g.pointer('down', 16 + 96 * (i % 3) + 48, 30 + 70 * Math.floor(i / 3) + 35); }
      return GremlinArcade.mode; }""")
def go(pg, room):
    for _ in range(3):
        pg.wait_for_function("!GremlinWorld.busy", timeout=15000)
        if pg.evaluate("GremlinWorld.room") == room: break
        pg.evaluate("r => GremlinWorld.travel(r)", room); pg.wait_for_timeout(700)
        pg.wait_for_function("!GremlinWorld.busy", timeout=15000); pg.wait_for_timeout(900)
    pg.wait_for_timeout(400)
def open_purple(pg, touch=False):
    pg.evaluate("GremlinPlayer.close()")
    go(pg, "arcade")
    pg.evaluate("GremlinWorld.look('cabinet-purple')"); pg.wait_for_timeout(1300)
    hit(pg, "cabinet-purple", touch); pg.wait_for_selector(".arcade-overlay:not([hidden]) .menu-item:not([disabled])", timeout=6000); pg.wait_for_timeout(700)
def menu_click(pg, text, touch=False):
    loc = pg.locator(".arcade-overlay .menu button", has_text=text).first
    loc.tap() if touch else loc.click(); pg.wait_for_timeout(400)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])

    # ---------- A: desktop, register ----------
    A = ctx_for(b, 1280, 800); a = page_in(A, BASE)
    a.wait_for_selector("#gw-signin:not([hidden])", timeout=5000); ok(view(a) == "choose", "first visit shows the sign-in card")
    ok(a.evaluate("document.querySelectorAll('#gw-signin .gw-choices button').length") == 3, "3 choices: guest / new name / I have a key")
    shot(a, "login-01-choose")
    a.click("#gw-signin button:has-text('New Gremlin Name')"); a.wait_for_selector("#gw-signin input[name=gremlin-name]")
    a.fill("#gw-signin input[name=gremlin-name]", "admin"); a.click("#gw-signin button[type=submit]")
    a.wait_for_function("document.querySelector('#gw-signin .gw-err').textContent.length > 0", timeout=10000)
    ok("taken" in a.text_content("#gw-signin .gw-err").lower() or "reserved" in a.text_content("#gw-signin .gw-err").lower() or len(a.text_content("#gw-signin .gw-err")) > 10, "reserved name refused: " + a.text_content("#gw-signin .gw-err"))
    a.fill("#gw-signin input[name=gremlin-name]", "x!"); a.click("#gw-signin button[type=submit]"); a.wait_for_timeout(200)
    ok("3" in a.text_content("#gw-signin .gw-err"), "too-short name refused locally")
    a.fill("#gw-signin input[name=gremlin-name]", NAME); shot(a, "login-02-pick-name")
    a.click("#gw-signin button[type=submit]"); a.wait_for_function("(document.querySelector('#gw-signin .gw-body')||{}).dataset.view === 'key-shown'", timeout=15000)
    key = a.text_content(".gw-key-code").strip()
    ok(re.fullmatch(r"[a-z]+-[a-z]+-[a-z]+", key) is not None, "server issued a three-word key: " + key)
    ok(a.is_disabled("#gw-signin button:has-text('Into the world')"), "continue is locked until the key is saved")
    shot(a, "login-03-key-shown")
    with a.expect_download() as dl: a.click("#gw-signin button:has-text('Download .txt')")
    path = dl.value.path(); txt = open(path).read()
    ok(key in txt and NAME in txt and dl.value.suggested_filename.endswith(".txt"), "download .txt contains name + key (" + dl.value.suggested_filename + ")")
    a.click("#gw-signin button:has-text('Copy key')"); a.wait_for_timeout(300)
    try: ok(a.evaluate("navigator.clipboard.readText()") == key, "copy puts the key on the clipboard")
    except Exception as e: print("note: clipboard read unavailable", e)
    ok(not a.is_disabled("#gw-signin button:has-text('Into the world')"), "continue unlocked after saving")
    a.click("#gw-signin button:has-text('Into the world')"); a.wait_for_timeout(800)
    ok(NAME in a.text_content("#btn-player") and "named" in a.get_attribute("#btn-player", "class"), "top bar shows the Gremlin Name")
    ok(ls(a, "player")["name"] == NAME and "key" not in ls(a, "player"), "only name + session token stored locally (no key)")

    # find a real sock by clicking it (office), plus a secret, then sync
    a.evaluate("GremlinWorld.look('sock-noodle')"); a.wait_for_timeout(1300); hit(a, "sock-noodle"); a.wait_for_timeout(900)
    ok("sock-noodle" in (ls(a, "socks") or []), "clicked sock recorded")
    a.evaluate("GremlinWorld.closeCard && GremlinWorld.closeCard()"); a.wait_for_timeout(300)
    go(a, 'tunnel')
    a.evaluate("GremlinWorld.look('chalk-wall')"); a.wait_for_timeout(1300); hit(a, "chalk-wall"); a.wait_for_timeout(900)
    a.evaluate("GremlinWorld.closeCard && GremlinWorld.closeCard()"); a.wait_for_timeout(300)
    ok("chalk-wall" in (ls(a, "found") or []), "clicked secret recorded")
    ok("first-door" in (ls(a, "badges") or {}), "badge earned for a second room (First Door)")
    shot(a, "journal-00-badge-toast")
    sync(a); ok(a.evaluate("GremlinPlayer.syncState") == "ok", "progress synced to the server")

    a.click("#btn-journal"); a.wait_for_selector("#gw-journal:not([hidden])"); a.wait_for_timeout(1500)
    jt = a.text_content("#gw-journal")
    ok("1/5" in jt.replace(" ", "") or "1 / 5" in jt, "journal shows socks 1/5")
    ok("???" in jt, "journal hides unfound things as ???")
    ok("Arcade" in jt and "Badges" in jt, "journal has arcade + badges sections")
    shot(a, "journal-01-desktop")
    a.evaluate("document.querySelector('#gw-journal .gw-box').scrollTop = 99999"); a.wait_for_timeout(400); shot(a, "journal-02-desktop-badges")
    a.evaluate("GremlinPlayer.close()")

    # ---------- B: phone, wrong key then right key, sync both ways ----------
    B = ctx_for(b, 390, 844, mobile=True); bp = page_in(B, BASE + "?noprompt")
    ok(not visible(bp, "#gw-signin"), "?noprompt skips the first-visit card")
    bp.tap("#btn-player"); bp.wait_for_selector("#gw-signin:not([hidden])"); bp.tap("#gw-signin button:has-text('I have a Gremlin Key')")
    bp.fill("#gw-signin input[name=gremlin-name]", NAME.upper()); bp.fill("#gw-signin input[name=gremlin-key]", "wrong-wrong-wrong")
    bp.tap("#gw-signin button[type=submit]"); bp.wait_for_function("document.querySelector('#gw-signin .gw-err').textContent.length > 0", timeout=10000)
    joke = bp.text_content("#gw-signin .gw-err"); ok(len(joke) > 20, "wrong key gives a Noodle joke: " + joke)
    ok(visible(bp, ".gw-guest-alt"), "wrong key offers 'Play as a guest instead'")
    shot(bp, "login-04-wrong-key-mobile")
    bp.fill("#gw-signin input[name=gremlin-key]", "  " + key.upper().replace("-", " ") + " "); bp.tap("#gw-signin button[type=submit]")
    bp.wait_for_function(f"document.querySelector('#btn-player').classList.contains('named')", timeout=10000); bp.wait_for_timeout(2500)
    ok("sock-noodle" in (ls(bp, "socks") or []) and "chalk-wall" in (ls(bp, "found") or []), "login on device 2 pulls the progress (key: any case/spaces)")
    bp.tap("#btn-journal"); bp.wait_for_selector("#gw-journal:not([hidden])"); bp.wait_for_timeout(1200); shot(bp, "journal-03-mobile")
    bp.evaluate("GremlinPlayer.close()")
    # device 2 finds another secret -> device 1 gets it after a sync
    go(bp, 'tunnel')
    bp.evaluate("GremlinWorld.look('printer-door')"); bp.wait_for_timeout(1300); hit(bp, "printer-door", touch=True); bp.wait_for_timeout(900)
    bp.evaluate("GremlinWorld.closeCard && GremlinWorld.closeCard()")
    ok("printer-door" in (ls(bp, "found") or []), "device 2 recorded a new secret")
    sync(bp); sync(a)
    ok("printer-door" in (ls(a, "found") or []) and "chalk-wall" in (ls(a, "found") or []), "two-device sync merges (device 1 now has device 2's find)")

    # ---------- Brawl on A: menu, a ranked game, board ----------
    open_purple(a)
    ok(a.text_content("#arcade-title") == "BREAK ROOM BRAWL", "purple cabinet opens Break Room Brawl")
    ok(a.locator(".arcade-overlay .menu button", has_text="Top 10").count() == 1, "menu has the Top 10 boards item")
    shot(a, "brawl-01-menu")
    menu_click(a, "Coffee Relay"); a.wait_for_timeout(1200); ok(a.evaluate("GremlinArcade.mode") == "play", "Coffee Relay starts")
    a.keyboard.down("ArrowLeft"); a.wait_for_timeout(700); a.keyboard.up("ArrowLeft"); shot(a, "brawl-02-coffee-relay")
    a.keyboard.press("Escape"); a.wait_for_timeout(500)
    if a.evaluate("GremlinArcade.mode") != "menu": a.evaluate("GremlinArcade.back()"); a.wait_for_timeout(400)
    menu_click(a, "Jam Buster"); a.wait_for_timeout(300); ok(a.evaluate("GremlinArcade.mode") == "play", "Jam Buster starts")
    a.evaluate("(() => { const g = GremlinArcade.game; for (let n = 0; n < 60; n++) { g.update(0.05); if (n % 3 == 0) for (let i = 0; i < 9; i++) g.pointer('down', 16 + 96 * (i % 3) + 48, 30 + 70 * Math.floor(i / 3) + 35); } })()")
    a.wait_for_timeout(300); shot(a, "brawl-03-jam-buster")
    ok(bot_jam(a) == "over", "Jam Buster ends")
    jam = int((re.findall(r"\d+", a.text_content(".over-score")) or ["0"])[0]); ok(jam > 0, f"scored {jam}")
    a.wait_for_function(f"document.querySelector('.over-board') && !document.querySelector('.over-board').hidden && document.querySelector('.over-board').textContent.includes({NAME!r})", timeout=15000)
    ok(True, "score submitted and shown on the shared board")
    shot(a, "brawl-04-board-after-game")
    a.locator(".scr-over button", has_text="MENU").first.click() if a.locator(".scr-over button", has_text="MENU").count() else a.evaluate("GremlinArcade.back()")
    a.wait_for_timeout(500); menu_click(a, "Top 10"); a.wait_for_timeout(800)
    a.locator(".scr-boards button", has_text="JAM BUSTER").first.click(); a.wait_for_timeout(1500)
    ok(NAME in a.text_content(".scr-boards"), "boards screen lists the player")
    shot(a, "brawl-05-boards-screen")
    a.evaluate("GremlinArcade.close()"); a.wait_for_timeout(600)
    ok("brawl-debut" in (ls(a, "badges") or {}) and "brawl-top10" in (ls(a, "badges") or {}), "Brawl badges earned")
    go(a, 'office'); go(a, 'arcade')
    a.evaluate("GremlinWorld.look('brawl-board')"); a.wait_for_timeout(1600)
    ok(NAME in a.text_content("[data-id=brawl-board]"), "chalk Brawl Board in the room shows the score")
    shot(a, "brawl-06-room-chalkboard")

    # ---------- guestbook ----------
    go(a, 'archive')
    a.evaluate("GremlinWorld.look('guestbook')"); a.wait_for_timeout(1300); hit(a, "guestbook"); a.wait_for_selector("#gw-guestbook:not([hidden]) select", timeout=8000)
    a.select_option("#gw-guestbook select", index=3); a.click("#gw-guestbook .gw-stampbtn >> nth=1")
    a.click("#gw-guestbook .gw-sign > .gw-btn"); a.wait_for_function(f"document.querySelector('#gw-guestbook .gw-entries').textContent.includes({NAME!r})", timeout=10000)
    ok(True, "guestbook signed and the entry shows")
    ok("tomorrow" in a.text_content("#gw-guestbook").lower(), "second signature today is refused (once a day)")
    shot(a, "journal-04-guestbook")
    a.evaluate("GremlinPlayer.close()")

    # ---------- logout + login on A ----------
    a.click("#btn-player"); a.wait_for_selector("#gw-signin:not([hidden])"); ok(view(a) == "account", "account view when logged in"); shot(a, "login-05-account")
    a.click("#gw-signin button:has-text('Log out')"); a.wait_for_timeout(2500)
    ok("named" not in a.get_attribute("#btn-player", "class") and not ls(a, "player") and not (ls(a, "socks") or []), "logout clears the device back to guest")
    a.click("#btn-player"); a.wait_for_selector("#gw-signin:not([hidden])"); a.click("#gw-signin button:has-text('I have a Gremlin Key')")
    a.fill("#gw-signin input[name=gremlin-name]", NAME.lower()); a.fill("#gw-signin input[name=gremlin-key]", key); shot(a, "login-06-key-login")
    a.click("#gw-signin button[type=submit]"); a.wait_for_function("document.querySelector('#btn-player').classList.contains('named')", timeout=10000); a.wait_for_timeout(2500)
    ok(len(ls(a, "found") or []) >= 2 and "sock-noodle" in (ls(a, "socks") or []), "logging back in restores progress")
    ok((ls(a, "arcade-best-jam-buster") or 0) == jam, "personal best restored after re-login (%s)" % ls(a, "arcade-best-jam-buster"))
    shot(a, "login-07-welcome-back")

    # ---------- C: guest on a phone ----------
    C = ctx_for(b, 390, 844, mobile=True); c = page_in(C, BASE + "#arcade")
    c.wait_for_selector("#gw-signin:not([hidden])"); shot(c, "login-08-choose-mobile")
    c.tap("#gw-signin button:has-text('Play as a guest')"); c.wait_for_timeout(500)
    ok(ls(c, "player-choice") == "guest" and "Guest" in c.text_content("#btn-player") or not visible(c, "#gw-signin"), "guest mode")
    open_purple(c, touch=True); shot(c, "brawl-07-menu-mobile")
    menu_click(c, "Jam Buster", touch=True); bot_jam(c); c.wait_for_timeout(800)
    ok(visible(c, ".scr-over .getname"), "guest sees 'get a Gremlin Name' instead of submitting")
    shot(c, "brawl-08-guest-prompt-mobile")
    c.tap(".scr-over .getname"); c.wait_for_timeout(800); ok(visible(c, "#gw-signin") and "Save my progress" in c.text_content("#gw-signin"), "GET A NAME opens sign-in with 'Save my progress'")
    c.evaluate("GremlinPlayer.close()")
    c.evaluate("GremlinArcade.close && GremlinArcade.close()"); c.wait_for_timeout(300)
    open_purple(c, touch=True); menu_click(c, "Desk Duel", touch=True); c.wait_for_timeout(1500); ok(c.evaluate("GremlinArcade.mode") == "play", "Desk Duel starts on touch"); shot(c, "brawl-09-desk-duel-mobile")
    c.evaluate("GremlinArcade.close()"); c.wait_for_timeout(300)
    c.tap("#btn-journal"); c.wait_for_selector("#gw-journal:not([hidden])"); c.wait_for_timeout(800); shot(c, "journal-05-guest-mobile")

    # ---------- D: offline ----------
    D = ctx_for(b, 1280, 800); d = page_in(D, BASE + "?offline")
    d.wait_for_selector("#gw-signin:not([hidden])"); d.click("#gw-signin button:has-text('New Gremlin Name')")
    d.fill("#gw-signin input[name=gremlin-name]", "Offline Ollie"); d.click("#gw-signin button[type=submit]")
    d.wait_for_function("document.querySelector('#gw-signin .gw-err').textContent.length > 0", timeout=12000)
    ok("guest" in d.text_content("#gw-signin .gw-err").lower() or len(d.text_content("#gw-signin .gw-err")) > 10, "offline: register explains + guest still works: " + d.text_content("#gw-signin .gw-err"))
    shot(d, "login-09-offline")
    d.evaluate("GremlinPlayer.close()"); d.click("#btn-journal"); d.wait_for_selector("#gw-journal:not([hidden])"); d.wait_for_timeout(1500)
    ok("Sock Hunt" in d.text_content("#gw-journal"), "offline: journal still works"); shot(d, "journal-06-offline")
    # E: a named player whose server is unreachable (route blocked): world keeps working locally
    E = ctx_for(b, 1280, 800); E.route(re.compile(r".*supabase\.co.*"), lambda r: r.abort())
    e = page_in(E, BASE + "?noprompt")
    e.evaluate("p => { localStorage.setItem('gremlin-world-player', JSON.stringify(p)); localStorage.setItem('gremlin-world-player-choice', JSON.stringify('named')); }", ls(a, "player"))
    e.reload(); e.wait_for_function("window.GremlinPlayer", timeout=15000); e.wait_for_timeout(1500)
    e.evaluate("GremlinWorld.look('sock-noodle')"); e.wait_for_timeout(1300); hit(e, "sock-noodle"); e.wait_for_timeout(800)
    ok("sock-noodle" in (ls(e, "socks") or []), "blocked server: finds still saved locally")
    e.evaluate("GremlinPlayer.sync()"); e.wait_for_timeout(9500)
    ok(e.evaluate("GremlinPlayer.syncState") in ("offline", "error"), "blocked server: sync marks itself offline (state=%s)" % e.evaluate("GremlinPlayer.syncState"))
    e.evaluate("GremlinWorld.closeCard && GremlinWorld.closeCard()"); e.click("#btn-player"); e.wait_for_timeout(500); shot(e, "login-10-blocked-server")

    print("\nTEST PLAYER:", NAME, "(delete it after review)")
    ok(not errors, "no console errors" + ("" if not errors else ": " + " | ".join(errors[:6])))
    b.close()
print("\n%d failures" % len(fails)); sys.exit(1 if fails else 0)
