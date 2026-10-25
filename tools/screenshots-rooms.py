#!/usr/bin/env python3
"""Gremlin Wing test: every room, every exit (clicked), every egg / set piece / mini-game, at 1280x800 and 390x844.
Fails on console errors, page errors or any 4xx/5xx response. Screenshots: screenshots/rooms-<slug>-*.png
Server on :8765. Usage: python3 tools/screenshots-rooms.py [--quick]"""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
W = json.loads((ROOT / "world-data.json").read_text())
WING = ["wing", "burrow", "corridor", "greenhouse", "roots", "someday", "lantern", "press", "proof", "dispatch", "lostfound", "returns", "stacks"]
BASE = "http://127.0.0.1:8765/world.html?noprompt"
errors, bad, warn = [], [], []
def page_for(b, w, h, mobile=False):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("response", lambda r: r.status >= 400 and bad.append(f"{r.status} {r.url}"))
    return pg
def shot(pg, name): pg.screenshot(path=str(OUT / f"rooms-{name}.png")); print("  shot", name)
def idle(pg):
    try: pg.wait_for_function("window.GremlinWorld && !GremlinWorld.busy", timeout=45000)
    except Exception: errors.append(f"still busy after 45s in {pg.evaluate('GremlinWorld.room')}")
def go(pg, room):
    if pg.evaluate("GremlinWorld.room") != room:
        pg.evaluate(f"GremlinWorld.travel('{room}')"); pg.wait_for_timeout(500); idle(pg); pg.wait_for_timeout(500)
    pg.evaluate("GremlinWorld.closeCard(); GremlinWorld.hideBubble()")
def center(pg, iid):
    return pg.evaluate("""id => { const e = document.querySelector(`[data-id="${id}"]`); if (!e) return null; const b = e.getBoundingClientRect();
      const x = b.x + b.width/2, y = b.y + b.height/2, t = document.elementFromPoint(x, y); return [x, y, !!(t && (t === e || e.contains(t))), t ? (t.dataset.id || t.className) : null]; }""", iid)
def hit(pg, iid, touch=False):
    pg.evaluate(f"GremlinWorld.look('{iid}')"); pg.wait_for_timeout(500)
    last = None
    for _ in range(40):  # wait for the camera to settle (big turns take longer than a fixed sleep)
        v = pg.evaluate("[Math.round(GremlinWorld.view.yaw*10), Math.round(GremlinWorld.view.pitch*10)]")
        if v == last: break
        last = v; pg.wait_for_timeout(150)
    pg.wait_for_timeout(200)
    c = center(pg, iid)
    if not c: raise RuntimeError("no element " + iid)
    if not c[2]: warn.append(f"{pg.evaluate('GremlinWorld.room')}:{iid} covered by {c[3]}")
    if touch: pg.touchscreen.tap(c[0], c[1])
    else: pg.mouse.move(c[0], c[1]); pg.wait_for_timeout(120); pg.mouse.down(); pg.wait_for_timeout(50); pg.mouse.up()
def state(pg): return pg.evaluate("({card: !document.querySelector('#card').hidden, bubble: !document.querySelector('#bubble').hidden, game: GremlinWorld.gameOpen, room: GremlinWorld.room})")
def wait_shown(pg, ms=4000):
    try: pg.wait_for_function("!document.querySelector('#card').hidden || !document.querySelector('#bubble').hidden", timeout=ms); return True
    except Exception: return False
def close_all(pg):
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300); pg.evaluate("GremlinWorld.closeCard(); GremlinWorld.hideBubble()")

QUICK = "--quick" in sys.argv; MOBILE_ONLY = "--mobile-only" in sys.argv
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = page_for(b, 1280, 800)
    pg.goto(BASE); pg.wait_for_timeout(2500); idle(pg)
    # Office hub -> Wing through the old GREMLINS ONLY door
    hit(pg, "office-to-wing"); pg.wait_for_timeout(600); idle(pg); pg.wait_for_timeout(600)
    assert pg.evaluate("GremlinWorld.room") == "wing", "office door didn't open the wing"
    exits_ok, eggs_ok, games_ok = 0, 0, 0
    for room in ([] if MOBILE_ONLY else WING + ["office", "rooftop", "archive"]):
        print("room", room); go(pg, room); pg.wait_for_timeout(1200)
        items = W["rooms"][room]["items"]
        if room in WING:
            pg.evaluate("(() => { const v = GremlinWorld.data.rooms[GremlinWorld.room].startView || {}; GremlinWorld.turnTo(v.yaw || 0, v.pitch || 0, 1); })()"); pg.wait_for_timeout(1500)
            shot(pg, f"{room}-1")
        # exits: click every portal that leads to/from the wing rooms
        for it in items:
            if it["type"] != "portal": continue
            if room not in WING and it["to"] not in WING: continue
            go(pg, room); hit(pg, it["id"]); pg.wait_for_timeout(700); idle(pg); pg.wait_for_timeout(300)
            now = pg.evaluate("GremlinWorld.room")
            if now != it["to"]: errors.append(f"exit {room}:{it['id']} went to {now}, wanted {it['to']}")
            else: exits_ok += 1
            back = [x for x in W["rooms"][it["to"]]["items"] if x["type"] == "portal" and x["to"] == room] or ([1] if room == "office" else [])
            if not back: errors.append(f"no way back from {it['to']} to {room}")
        if room not in WING: continue
        go(pg, room)
        # set pieces first (they unlock showIf items)
        for it in items:
            if it["type"] == "setpiece":
                pg.evaluate("GremlinWorld.hideBubble()"); hit(pg, it["id"])
                if not wait_shown(pg): errors.append(f"set piece {it['id']} said nothing")
                close_all(pg)
        for it in items:
            if it["type"] == "egg":
                hidden = pg.evaluate(f"document.querySelector('[data-id=\"{it['id']}\"]').classList.contains('is-hidden')")
                if hidden: errors.append(f"egg {it['id']} still hidden (showIf {it.get('showIf')})"); continue
                taps = 1 + len(it.get("steps", {}).get("lines", []))
                for t in range(taps):
                    pg.evaluate("GremlinWorld.closeCard(); GremlinWorld.hideBubble()"); hit(pg, it["id"]); wait_shown(pg); pg.wait_for_timeout(400 if t == taps - 1 else 100)
                    if t < taps - 1: close_all(pg)
                st = state(pg)
                if not (st["card"] or st["bubble"]): errors.append(f"egg {it['id']} showed nothing")
                else: eggs_ok += 1
                if it.get("showIf") or it["id"] in ("greenhouse-plant", "press-radio", "returns-rain-window", "burrow-gremlish-plaque", "lantern-all-lit-egg", "returns-frog-chorus", "press-in-register", "wing-hologram", "corridor-plaque", "stacks-margins", "lostfound-book", "someday-calendar", "proof-sheet"):
                    shot(pg, f"{room}-egg-{it['id']}")
                close_all(pg)
        found = pg.evaluate("JSON.parse(localStorage.getItem('gremlin-world-found')||'[]')")
        for it in items:
            if it["type"] == "egg" and it["id"] not in found: errors.append(f"egg {it['id']} not recorded")
        # second screenshot: the room's centrepiece / animation
        key = {"wing": "wing-hologram", "burrow": "burrow-nice-things", "corridor": "corridor-bench", "greenhouse": "greenhouse-plant", "roots": "roots-to-rooftop",
               "someday": "someday-jars", "lantern": "lantern-moon-lamp", "press": "press-letterpress", "proof": "proof-sheet", "dispatch": "dispatch-board",
               "lostfound": "lostfound-cubbies", "returns": "returns-rain-window", "stacks": "stacks-to-press"}[room]
        pg.evaluate(f"GremlinWorld.look('{key}')"); pg.wait_for_timeout(1600); shot(pg, f"{room}-2")
        # mini-games
        for it in items:
            if it["type"] != "game": continue
            hit(pg, it["id"]); pg.wait_for_timeout(1600)
            if not state(pg)["game"]: errors.append(f"game {it['id']} didn't open"); continue
            g = it["game"]; tag = f"{room}-game-{it['id'].split('-', 1)[1]}"
            if g == "sort":
                pg.wait_for_timeout(2500); shot(pg, tag)
                for i in range(30):
                    if pg.query_selector(".rg-end"): break
                    pg.wait_for_timeout(700); pg.click(f".sort-tray >> nth={i % 6}")
                pg.wait_for_timeout(900)
            elif g == "lineup":
                pg.click(".line-tab >> nth=1"); pg.click(".line-pad button >> nth=3"); shot(pg, tag)
                pg.click("text=Print it anyway"); pg.wait_for_timeout(500)
            elif g == "shelve":
                for i in range(20):
                    if pg.query_selector(".rg-end"): break
                    pr = pg.query_selector(".sh-pile .sh-book.prank:not(.flap):not(.noodle)")
                    if pr: pr.click(); pg.wait_for_timeout(1600); continue
                    bk = pg.query_selector(".sh-pile .sh-book:not(.prank):not(.fall)")
                    if bk: bk.click()
                    pg.click(f".sh-shelf >> nth={i % 4}"); pg.wait_for_timeout(250)
                    if i == 4: shot(pg, tag)
                pg.wait_for_timeout(1300)
            elif g == "caption":
                if it["id"].endswith("-1"):
                    for i in range(5):
                        pg.click(".cap-choices button >> nth=0"); pg.wait_for_timeout(300)
                        if i == 0: shot(pg, tag)
                        pg.click(".cap-next button"); pg.wait_for_timeout(300)
                else:
                    pg.click(".cap-choices button >> nth=1"); pg.wait_for_timeout(300)
                    games_ok += 1; close_all(pg); continue
            elif g == "net":
                pg.wait_for_timeout(1500); shot(pg, tag)
                for i in range(20):
                    if pg.query_selector(".rg-end"): break
                    pg.click("text=Catch the nearest seed"); pg.wait_for_timeout(200)
            elif g == "breathe":
                if pg.query_selector("text=Skip the hold"): pg.click("text=Skip the hold")
                pg.click(".rg-foot >> text=Start"); pg.wait_for_timeout(2500); shot(pg, tag)
                if room == "corridor" and not QUICK: pg.wait_for_timeout(29000)
            end = pg.query_selector(".rg-end")
            if g != "breathe" or (room == "corridor" and not QUICK):
                if not end: errors.append(f"game {it['id']} never reached its gentle ending")
                else: shot(pg, tag + "-end")
            games_ok += 1
            close_all(pg)
            if pg.evaluate("GremlinWorld.gameOpen"): errors.append(f"game {it['id']} didn't close on Esc")
    # the map
    pg.click("#btn-map"); pg.wait_for_timeout(700); shot(pg, "map"); pg.keyboard.press("Escape")
    # mona's eye pops back in
    go(pg, "gallery"); hit(pg, "mona"); pg.wait_for_timeout(1500); shot(pg, "gallery-mona-eye"); close_all(pg)
    pg.context.close()

    # phone: every wing room, one portal tap, one game per room
    pg = page_for(b, 390, 844, mobile=True)
    pg.goto(BASE + "#wing"); pg.wait_for_timeout(2500); idle(pg)
    for room in WING:
        go(pg, room); pg.wait_for_timeout(1300); shot(pg, f"{room}-mobile")
        gm = [i for i in W["rooms"][room]["items"] if i["type"] == "game"]
        if gm:
            hit(pg, gm[0]["id"], touch=True); pg.wait_for_timeout(1700)
            if not state(pg)["game"]: errors.append(f"mobile: game {gm[0]['id']} didn't open")
            else: shot(pg, f"{room}-mobile-game")
            close_all(pg)
        back = [i for i in W["rooms"][room]["items"] if i["type"] == "portal"][0]
        hit(pg, back["id"], touch=True); pg.wait_for_timeout(700); idle(pg)
        if pg.evaluate("GremlinWorld.room") != back["to"]: errors.append(f"mobile: {room}:{back['id']} didn't travel")
    b.close()
print(f"\nexits clicked OK: {exits_ok}  eggs OK: {eggs_ok}  games OK: {games_ok}")
print("warnings (item centre covered by another element):", len(warn)); [print("  ", w) for w in warn]
print("HTTP errors:", len(bad)); [print("  ", x) for x in bad]
print("errors:", len(errors)); [print("  ", e) for e in errors]
sys.exit(1 if errors or bad else 0)
