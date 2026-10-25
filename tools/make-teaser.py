#!/usr/bin/env python3
"""Renders assets/office-teaser.webp (the room without its buttons) for diaries.html. Server on :8765."""
from playwright.sync_api import sync_playwright
from PIL import Image
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 960, "height": 480})
    pg.goto("http://127.0.0.1:8765/office-classic.html"); pg.wait_for_timeout(1200)
    pg.add_style_tag(content=".hud{display:none!important}")
    pg.evaluate("GremlinOffice.turnTo(20, -4, 0.85)"); pg.wait_for_timeout(1500)
    pg.screenshot(path="/tmp/teaser.png"); b.close()
im = Image.open("/tmp/teaser.png").convert("RGB"); im.thumbnail((720, 360))
im.save(ROOT / "assets" / "office-teaser.webp", "WEBP", quality=72, method=6); print(im.size)
