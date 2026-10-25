#!/usr/bin/env python3
"""Placeholder SVG faces for the Gremlin Wing hallway and the six little side tunnels/rooms, plus the small
SVG props (wing signs, hatches) the personal rooms use. Moth's painted faces can replace any room later: drop
assets/world/<slug>/<face>.webp in and set "painted": true + "faces": "...{face}.webp" in world-data.json.
House rules: always lit, a clear way back on the back wall, cozy-odd, no logos, no forms.
Run: python3 tools/draw-wing.py"""
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "world"
HAND = "font-family:'Bradley Hand','Segoe Print','Comic Sans MS',cursive"
SERIF = "font-family:Georgia,'Times New Roman',serif"
INK = "#2b231d"

def svg(body, bg):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
            f'<defs><radialGradient id="glow"><stop offset="0" stop-color="#fff3c4" stop-opacity=".95"/><stop offset=".35" stop-color="#ffd98a" stop-opacity=".45"/>'
            f'<stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>'
            f'<radialGradient id="tglow"><stop offset="0" stop-color="#c8fff0" stop-opacity=".9"/><stop offset="1" stop-color="#7fe0c8" stop-opacity="0"/></radialGradient>'
            f'<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".3" stop-color="#000" stop-opacity="0"/>'
            f'<stop offset=".8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient></defs>'
            f'<rect width="1024" height="1024" fill="{bg}"/>{body}</svg>')

def txt(x, y, s, size=28, fill=INK, style=HAND, anchor="middle", extra=""):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" style="{style}" {extra}>{s}</text>'

def lamp(x, y, c="#c9a45c"):   # wall sconce, always on
    return (f'<circle cx="{x}" cy="{y}" r="120" fill="url(#glow)"/><rect x="{x-6}" y="{y+18}" width="12" height="40" rx="4" fill="{c}"/>'
            f'<path d="M{x-26} {y+18}h52l-10-40h-32z" fill="#f7e2a8" stroke="{c}" stroke-width="5"/>')

def hang_lamp(x, y, c="#c9a45c"):
    return (f'<line x1="{x}" y1="0" x2="{x}" y2="{y-30}" stroke="{c}" stroke-width="4"/><circle cx="{x}" cy="{y}" r="150" fill="url(#glow)"/>'
            f'<circle cx="{x}" cy="{y}" r="30" fill="#fff2c2" stroke="{c}" stroke-width="5"/>')

def wall(c1, c2, trim, base=930):
    return (f'<rect width="1024" height="{base}" fill="{c1}"/><rect y="{base}" width="1024" height="{1024-base}" fill="{c2}"/>'
            f'<rect y="{base-14}" width="1024" height="16" fill="{trim}"/><rect width="1024" height="1024" fill="url(#shade)"/>')

def floor_planks(c1, c2):
    o = f'<rect width="1024" height="1024" fill="{c1}"/>'
    for y in range(0, 1024, 86): o += f'<rect y="{y}" width="1024" height="4" fill="{c2}"/>'
    for i, y in enumerate(range(0, 1024, 86)):
        for x in range((i % 2) * 170, 1024, 340): o += f'<rect x="{x}" y="{y}" width="4" height="86" fill="{c2}"/>'
    return o

def ceiling(c1, beam, lamp_c="#c9a45c"):
    return (f'<rect width="1024" height="1024" fill="{c1}"/><rect x="0" y="470" width="1024" height="84" fill="{beam}"/>'
            f'<rect x="470" y="0" width="84" height="1024" fill="{beam}"/>' + hang_lamp(512, 512, lamp_c))

def door(x, w, h, color, frame, label, sub, knob="#c9a45c", round_top=True, base=930, extra=""):
    top = base - h; r = w / 2 if round_top else 18
    return (f'<rect x="{x-w/2-16}" y="{top-16}" width="{w+32}" height="{h+16}" rx="{r+16}" fill="{frame}"/>'
            f'<rect x="{x-w/2}" y="{top}" width="{w}" height="{h}" rx="{r}" fill="{color}"/>'
            f'<rect x="{x-w/2+22}" y="{top+r*0.8+30}" width="{w-44}" height="{h-r*0.8-80}" rx="10" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="5"/>'
            f'<circle cx="{x+w/2-30}" cy="{base-h/2+30}" r="11" fill="{knob}"/>{extra}'
            f'<rect x="{x-118}" y="{top-96}" width="236" height="68" rx="12" fill="#f4ead2" stroke="{frame}" stroke-width="5"/>'
            + txt(x, top-60, label, 26, INK, SERIF, extra='font-weight="700" letter-spacing="1"') + txt(x, top-38, sub, 17, "#5a4a3a"))

def bench(x, y, w=300, c="#8a6a48"):
    return (f'<rect x="{x-w/2}" y="{y}" width="{w}" height="26" rx="8" fill="{c}"/><rect x="{x-w/2}" y="{y-90}" width="{w}" height="18" rx="8" fill="{c}"/>'
            f'<rect x="{x-w/2+20}" y="{y+26}" width="18" height="70" fill="{c}"/><rect x="{x+w/2-38}" y="{y+26}" width="18" height="70" fill="{c}"/>'
            f'<rect x="{x-w/2+10}" y="{y-72}" width="14" height="72" fill="{c}"/><rect x="{x+w/2-24}" y="{y-72}" width="14" height="72" fill="{c}"/>'
            f'<rect x="{x-w/2+40}" y="{y-24}" width="{w/2-50}" height="24" rx="10" fill="#c96f4a"/>')

def window(x, y, w, h, sky="#bfe0f2", frame="#6b4f36", cloud=True):
    o = f'<rect x="{x-w/2-14}" y="{y-h/2-14}" width="{w+28}" height="{h+28}" rx="{w/2}" fill="{frame}"/><rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="{w/2-10}" fill="{sky}"/>'
    if cloud: o += f'<g fill="#fff" opacity=".9"><ellipse cx="{x-20}" cy="{y}" rx="60" ry="22"/><ellipse cx="{x+20}" cy="{y-14}" rx="40" ry="24"/></g>'
    return o + f'<rect x="{x-4}" y="{y-h/2}" width="8" height="{h}" fill="{frame}"/>'

def sock(x, y, c, rot=0, s=1):
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({s})"><path d="M-14 -40h28v40q0 18 18 18h10q14 0 14 14t-14 14h-34q-22 0-22-24z" fill="{c}" stroke="{INK}" stroke-opacity=".5" stroke-width="3"/>'
            f'<rect x="-14" y="-40" width="28" height="9" fill="#fff" opacity=".7"/></g>')

def jar(x, y, label="", glow="#fff3a6", w=64, h=84):
    return (f'<circle cx="{x}" cy="{y}" r="38" fill="{glow}" opacity=".35"/><rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="14" fill="#dff2ee" fill-opacity=".55" stroke="#7a9a94" stroke-width="4"/>'
            f'<rect x="{x-w/2+6}" y="{y-h/2-12}" width="{w-12}" height="14" rx="4" fill="#b08a5e"/><circle cx="{x}" cy="{y+6}" r="13" fill="{glow}"/>'
            + (f'<rect x="{x-30}" y="{y+18}" width="60" height="18" fill="#f4ead2"/>' + txt(x, y + 32, label, 13) if label else ""))

def shelf(y, x0=60, x1=964, c="#8a6a48"):
    return f'<rect x="{x0}" y="{y}" width="{x1-x0}" height="18" rx="4" fill="{c}"/>'

def books(x0, x1, y, palette, seed=1):
    o, x, i = "", x0, seed
    while x < x1 - 20:
        w = 22 + (i * 7) % 18; h = 90 + (i * 13) % 50
        o += f'<rect x="{x}" y="{y-h}" width="{w}" height="{h}" rx="3" fill="{palette[i % len(palette)]}" stroke="{INK}" stroke-opacity=".25" stroke-width="2"/>'
        x += w + 3; i += 1
    return o

def mushroom(x, y, s=1, c="#ff9f6b"):
    return (f'<circle cx="{x}" cy="{y-30*s}" r="{70*s}" fill="url(#tglow)"/><rect x="{x-8*s}" y="{y-30*s}" width="{16*s}" height="{34*s}" rx="6" fill="#f4ead2"/>'
            f'<path d="M{x-38*s} {y-26*s}q38 -60 76 0z" fill="{c}"/><circle cx="{x-12*s}" cy="{y-40*s}" r="{6*s}" fill="#fff"/><circle cx="{x+14*s}" cy="{y-36*s}" r="{5*s}" fill="#fff"/>')

def footprint(x, y, rot, word):
    return (f'<g transform="translate({x} {y}) rotate({rot})"><ellipse rx="22" ry="34" fill="#f6e7c3" opacity=".9"/>'
            + "".join(f'<circle cx="{dx}" cy="-44" r="7" fill="#f6e7c3" opacity=".9"/>' for dx in (-14, 0, 14))
            + txt(0, 70, word, 26, "#f6e7c3") + '</g>')

def write(slug, faces):
    # Moth painted the six side rooms (Oct 25); their old drawn placeholders are only written with --placeholders (to /tmp, never over the paintings)
    if slug != "wing":
        if "--placeholders" not in sys.argv: return
        d = pathlib.Path("/tmp/wing-placeholders") / slug; d.mkdir(parents=True, exist_ok=True)
        for k, v in faces.items(): (d / f"{k}.svg").write_text(v)
        return
    d = ROOT / slug; d.mkdir(parents=True, exist_ok=True)
    for k, v in faces.items(): (d / f"{k}.svg").write_text(v)
    print("wrote", slug, sorted(faces))

# ---------------- The Gremlin Wing (hallway off the Office) ----------------
C1, C2, TR = "#efe6d2", "#7a5b3e", "#54664A"
def wing_wall(body): return svg(wall(C1, C2, TR) + '<rect y="560" width="1024" height="16" fill="#cbbd9c"/>' + body, C1)
wingfront = wing_wall(lamp(512, 300) +
    door(300, 230, 470, "#8b5e34", "#5d3d22", "GRIMBLE", "The Listening Burrow", extra='<circle cx="300" cy="610" r="34" fill="#f3d98b" opacity=".6"/>') +
    door(724, 230, 470, "#7fb069", "#3f6b35", "PIP", "The Idea Greenhouse", extra='<path d="M640 560h168M640 660h168M724 470v400" stroke="#e8f6d8" stroke-width="6" opacity=".7"/>'))
wingright = wing_wall(lamp(512, 300) +
    door(300, 230, 470, "#a99bc4", "#6c5a8c", "MOTH", "The Lantern Loft", extra='<circle cx="300" cy="560" r="26" fill="#ffe2a0"/><circle cx="300" cy="560" r="60" fill="url(#glow)"/>') +
    door(724, 230, 470, "#f2ead8", "#3c3c3c", "DOT", "The Back-Room Press", round_top=False,
         extra='<rect x="630" y="500" width="40" height="300" fill="#36b5d8" opacity=".75"/><rect x="684" y="500" width="40" height="300" fill="#e2468c" opacity=".75"/><rect x="738" y="500" width="40" height="300" fill="#f5c400" opacity=".75"/>'))
wingleft = wing_wall(lamp(512, 300) +
    door(300, 230, 470, "#e0a930", "#8a5d12", "NOODLE", "The Dispatch Loft", extra='<circle cx="300" cy="580" r="44" fill="#1f3550" stroke="#c9a45c" stroke-width="8"/><circle cx="290" cy="570" r="4" fill="#fff"/>') +
    door(724, 230, 470, "#6e4a7e", "#432a4f", "VESPER", "The Returns Bin", extra='<rect x="684" y="600" width="80" height="20" rx="4" fill="#c9a45c"/><rect x="692" y="606" width="64" height="6" fill="#2b1d30"/>'))
wingback = wing_wall(lamp(240, 280) + lamp(800, 280) +
    door(512, 250, 640, "#3f5a3a", "#2c3f28", "THE OFFICE", "back the way you came", round_top=False,
         extra='<rect x="462" y="420" width="100" height="56" fill="#f4ead2"/>' + txt(512, 444, "GREMLINS", 16, INK, SERIF) + txt(512, 466, "ONLY", 16, INK, SERIF)) +
    # see-through iPad on a stand (Bryan appears only as a hologram on it)
    '<rect x="822" y="700" width="16" height="200" fill="#8a8a80"/><rect x="770" y="890" width="120" height="16" rx="6" fill="#8a8a80"/>'
    '<rect x="742" y="560" width="176" height="140" rx="14" fill="#cfefff" fill-opacity=".35" stroke="#9fb7c4" stroke-width="6"/>'
    '<ellipse cx="830" cy="690" rx="50" ry="10" fill="#9ff0ff" opacity=".6"/><path d="M806 690l14-80h20l14 80z" fill="#9ff0ff" opacity=".35"/>'
    + txt(830, 630, "hi!", 26, "#3aa7c4") +
    '<rect x="96" y="560" width="200" height="150" rx="8" fill="#c9a273"/><rect x="108" y="572" width="176" height="126" rx="4" fill="#f6efdc"/>'
    + txt(196, 610, "Gremlin Wing", 24, INK, SERIF) + txt(196, 642, "knock gently.", 20) + txt(196, 672, "every room has", 18) + txt(196, 694, "a way back here", 18))
wingfloor = svg(floor_planks("#b08a5e", "#8a6a48") + '<rect x="372" y="0" width="280" height="1024" fill="#a2463a"/><rect x="392" y="0" width="240" height="1024" fill="none" stroke="#f3d98b" stroke-width="6" stroke-dasharray="20 14"/>'
                + txt(512, 560, "wipe your paws", 30, "#f3d98b"), "#b08a5e")
write("wing", {"front": wingfront, "right": wingright, "left": wingleft, "back": wingback, "floor": wingfloor, "ceiling": svg(ceiling("#f4ecd9", "#c9b48f"), "#f4ecd9")})

# ---------------- Cool-Off Corridor (off Grimble's burrow) ----------------
W1, W2 = "#d9b98a", "#7a5634"
def co(body): return svg(wall(W1, W2, "#6b4a2c") + body, W1)
cofront = co(lamp(160, 330) + lamp(864, 330) +
    '<path d="M180 930L400 520h224l220 410z" fill="#c8a272" opacity=".6"/>' + window(512, 380, 230, 260, sky="#cfe6f5") + bench(512, 800, 340))
coside = lambda flip: co(lamp(256, 330) + lamp(768, 330) + txt(512, 640, "in..." if flip else "out...", 44, "#7a5634", HAND, extra='opacity=".55"'))
coback = co(lamp(200, 330) + lamp(824, 330) +
    '<ellipse cx="512" cy="660" rx="200" ry="290" fill="#5d3d22"/><ellipse cx="512" cy="660" rx="176" ry="266" fill="#ffe7b0"/>'
    '<ellipse cx="512" cy="700" rx="120" ry="200" fill="#f6c97a" opacity=".6"/>' + txt(512, 330, "back to the Burrow", 30, "#5d3d22"))
cofloor = svg(floor_planks("#a77b4f", "#8a6038") + "".join(footprint(430 + (i % 2) * 160, 900 - i * 170, 0, "in..." if i % 2 == 0 else "out...") for i in range(6)), "#a77b4f")
write("cooloff", {"front": cofront, "right": coside(True), "left": coside(False), "back": coback, "floor": cofloor, "ceiling": svg(ceiling("#e6cfa6", "#8a6a48"), "#e6cfa6")})

# ---------------- Root tunnel (greenhouse <-> rooftop) ----------------
R1, R2 = "#6b4a32", "#4a3222"
def roots(seed):
    o = ""
    for i in range(7):
        x = 60 + ((i * 151 + seed * 97) % 900)
        o += f'<path d="M{x} 0 q{40 - i*9} 220 {-30 + i*7} 420 t{20 + i*5} 420" stroke="#8a6040" stroke-width="{14 - i}" fill="none" stroke-linecap="round"/>'
    return o
def rt(body, seed): return svg(f'<rect width="1024" height="1024" fill="{R1}"/>' + roots(seed) + '<rect width="1024" height="1024" fill="url(#shade)"/>' + body, R1)
rtfront = rt(mushroom(200, 900, 1.3) + mushroom(830, 920, 1.1, "#7fe0c8") +
    '<ellipse cx="512" cy="260" rx="190" ry="150" fill="#bfe8ff"/><ellipse cx="512" cy="260" rx="190" ry="150" fill="url(#glow)"/>'
    + "".join(f'<rect x="452" y="{360 + i*110}" width="120" height="14" rx="6" fill="#a87b4f"/>' for i in range(5)) +
    '<path d="M450 360v570M574 360v570" stroke="#8a6040" stroke-width="16"/>' + txt(512, 110, "up to the Rooftop Garden", 30, "#f4ead2"), 1)
rtback = rt(mushroom(180, 880, 1.2, "#7fe0c8") + mushroom(860, 900, 1.3) +
    '<ellipse cx="512" cy="700" rx="220" ry="200" fill="#2f2016"/><ellipse cx="512" cy="700" rx="190" ry="170" fill="#bfe39a"/><ellipse cx="512" cy="700" rx="190" ry="170" fill="url(#glow)"/>'
    + txt(512, 450, "back to the Greenhouse", 30, "#f4ead2"), 2)
rtside = lambda s: rt(mushroom(260, 760, 1.4, "#ff9f6b") + mushroom(520, 820, 0.9, "#7fe0c8") + mushroom(760, 740, 1.2, "#ffd36b") + lamp(512, 300, "#a87b4f"), s)
write("roots", {"front": rtfront, "back": rtback, "left": rtside(3), "right": rtside(4),
                "floor": svg(f'<rect width="1024" height="1024" fill="#5a3d28"/>' + mushroom(300, 400, 1) + mushroom(700, 700, 1.2, "#7fe0c8") + '<path d="M512 0v1024" stroke="#7a5638" stroke-width="140" opacity=".5"/>', "#5a3d28"),
                "ceiling": rt(hang_lamp(512, 512, "#a87b4f"), 5)})

# ---------------- The Someday Shelf (side burrow off the greenhouse) ----------------
def brick(body):
    o = '<rect width="1024" height="1024" fill="#b5643f"/>'
    for r, y in enumerate(range(0, 1024, 56)):
        o += f'<rect y="{y}" width="1024" height="4" fill="#e3c9a8" opacity=".6"/>'
        for x in range((r % 2) * 60, 1024, 120): o += f'<rect x="{x}" y="{y}" width="4" height="56" fill="#e3c9a8" opacity=".6"/>'
    return svg(o + '<rect width="1024" height="1024" fill="url(#shade)"/>' + body, "#b5643f")
IDEAS = ["someday", "ukulele (for the plant)", "a hat for every sock", "rocking bench", "soup, but fancy", "a slower Monday", "kite day", "later", "maybe!"]
sdfront = brick(lamp(512, 140) + "".join(shelf(y) for y in (400, 620, 840)) +
    "".join(jar(130 + i * 108, y - 50, "someday" if (i + j) % 3 else "later", ["#fff3a6", "#c8f0ff", "#ffd2e0"][(i + j) % 3]) for j, y in enumerate((400, 620, 840)) for i in range(8)))
sdleft = brick(lamp(800, 200) + '<rect x="200" y="300" width="420" height="440" rx="10" fill="#f4ead2" stroke="#6b4a32" stroke-width="8"/>'
    + txt(410, 360, "THIS MONTH", 30, INK, SERIF) + "".join(txt(250 + (i % 5) * 80, 420 + (i // 5) * 70, "Someday", 15) for i in range(25)))
sdright = brick(lamp(300, 200) + '<rect x="560" y="700" width="160" height="30" rx="10" fill="#8a6a48"/><rect x="580" y="730" width="20" height="200" fill="#8a6a48"/><rect x="680" y="730" width="20" height="200" fill="#8a6a48"/>'
    + shelf(560, 150, 870) + "".join(jar(210 + i * 110, 510, "", ["#fff3a6", "#c8f0ff", "#ffd2e0"][i % 3]) for i in range(6)))
sdback = brick(lamp(200, 250) + lamp(824, 250) + '<path d="M352 930V600a160 160 0 0 1 320 0v330z" fill="#3e2a1c"/><path d="M380 930V605a132 132 0 0 1 264 0v325z" fill="#bfe39a"/>'
    '<path d="M380 930V605a132 132 0 0 1 264 0v325z" fill="url(#glow)"/>' + txt(512, 420, "back to the Greenhouse", 30, "#fff4dc"))
write("someday", {"front": sdfront, "left": sdleft, "right": sdright, "back": sdback, "floor": svg(floor_planks("#a77b4f", "#8a6038"), "#a77b4f"), "ceiling": svg(ceiling("#c98a64", "#8a5a3c"), "#c98a64")})

# ---------------- The Proof Room (round reading nook off the press) ----------------
def paperwall(body, seed=0):
    o = '<rect width="1024" height="1024" fill="#efe6cf"/>'
    for i in range(18):
        x = 40 + ((i * 173 + seed * 61) % 900); y = 60 + ((i * 97 + seed * 31) % 700)
        o += f'<rect x="{x}" y="{y}" width="120" height="160" fill="#fbf6e8" stroke="#cdbf9e" stroke-width="3" transform="rotate({(i % 5) - 2} {x+60} {y+80})"/>'
    return svg(o + '<rect width="1024" height="1024" fill="url(#shade)"/>' + body, "#efe6cf")
prfront = paperwall(lamp(250, 260) + '<ellipse cx="512" cy="860" rx="260" ry="80" fill="#e2468c" opacity=".8"/><ellipse cx="512" cy="840" rx="240" ry="64" fill="#f19ab9"/>'
    '<rect x="380" y="380" width="260" height="320" fill="#fffdf6" stroke="#9a8a6a" stroke-width="5"/>'
    + txt(512, 440, "PROOF", 34, INK, SERIF) + txt(450, 520, "nice!", 26, "#36b5d8") + txt(560, 600, "tiny bit left?", 22, "#e2468c") + txt(470, 670, "yes :)", 26, "#c9a400"), 1)
prback = paperwall(lamp(220, 300) + lamp(804, 300) + '<path d="M332 930V560a180 180 0 0 1 360 0v370z" fill="#d8c8a0"/><path d="M362 930V565a150 150 0 0 1 300 0v365z" fill="#ffe9a8"/>'
    '<path d="M362 930V565a150 150 0 0 1 300 0v365z" fill="url(#glow)"/>' + txt(512, 360, "back to Dot's Press", 30, INK), 2)
prside = lambda s: paperwall(lamp(512, 280), s)
write("proof", {"front": prfront, "back": prback, "left": prside(3), "right": prside(4), "floor": svg(floor_planks("#b89466", "#93714c") + '<circle cx="512" cy="512" r="300" fill="#e7d3a8" stroke="#36b5d8" stroke-width="10" stroke-dasharray="6 18"/>', "#b89466"),
                "ceiling": paperwall(hang_lamp(512, 512), 5)})

# ---------------- Lost & Found (sock closet off the dispatch loft) ----------------
def closet(body): return svg(wall("#d7c2a0", "#6b4f36", "#4f3a28") + body, "#d7c2a0")
SOCKS = ["#e2468c", "#36b5d8", "#f5c400", "#7fb069", "#a99bc4", "#e07a3a", "#6e4a7e"]
TAGS = ["in a teapot", "sunbathing (rooftop)", "in the arcade claw", "inside a sock", "on the moon (maybe)", "in the compost, resting", "under a cushion", "in a library book", "on a train", "nobody knows"]
lffront = closet(lamp(512, 120) + "".join(
    f'<rect x="{90 + c*176}" y="{220 + r*230}" width="160" height="210" rx="10" fill="#8a6a48"/><rect x="{100 + c*176}" y="{230 + r*230}" width="140" height="190" rx="6" fill="#f2e6cc"/>'
    + sock(170 + c * 176, 340 + r * 230, SOCKS[(r * 5 + c) % 7], (c * 13) % 30 - 15)
    + f'<rect x="{110 + c*176}" y="{392 + r*230}" width="120" height="24" fill="#fff8e1" stroke="#c9a273"/>' + txt(170 + c * 176, 409 + r * 230, TAGS[(r * 5 + c) % 10], 13)
    for r in range(3) for c in range(5)))
lfleft = closet(lamp(250, 260) + '<rect x="520" y="560" width="300" height="24" fill="#8a6a48"/><rect x="650" y="584" width="40" height="330" fill="#8a6a48"/>'
    '<path d="M540 560l130-60 130 60z" fill="#f4ead2" stroke="#8a6a48" stroke-width="5"/><line x1="670" y1="500" x2="670" y2="560" stroke="#8a6a48" stroke-width="4"/>'
    + txt(670, 470, "the Lost &amp; Found book", 24, INK))
lfright = closet(lamp(700, 260) + "".join(sock(200 + i * 90, 600 + (i % 2) * 30, SOCKS[i % 7], i * 9 - 20) for i in range(5)) + '<path d="M150 540h500" stroke="#8a6a48" stroke-width="5"/>' + txt(400, 480, "drying line", 26))
lfback = closet(lamp(220, 300) + lamp(804, 300) + '<rect x="372" y="560" width="280" height="370" rx="20" fill="#5d3d22"/><rect x="392" y="580" width="240" height="350" rx="14" fill="#ffe2a0"/>'
    '<rect x="392" y="580" width="240" height="350" rx="14" fill="url(#glow)"/>' + sock(600, 900, "#e07a3a", 70) + txt(512, 520, "back to the Dispatch Loft", 28, INK)
    + '<rect x="700" y="420" width="200" height="70" rx="10" fill="#fff8e1" stroke="#c9a273" stroke-width="4"/>' + txt(800, 465, "WELCOME BACK", 24, INK, SERIF))
write("lostfound", {"front": lffront, "left": lfleft, "right": lfright, "back": lfback, "floor": svg(floor_planks("#9a7650", "#7a5634"), "#9a7650"), "ceiling": svg(ceiling("#e3d2b4", "#8a6a48"), "#e3d2b4")})

# ---------------- The Stacks Below (book tunnel under the returns bin) ----------------
PAL = ["#6e4a7e", "#8a3b4a", "#3d5a80", "#c9a45c", "#4f6b4a", "#a06a8c", "#2f4858"]
def stackwall(body, seed):
    o = '<rect width="1024" height="1024" fill="#3b2a3f"/>'
    for j, y in enumerate((260, 480, 700, 920)): o += shelf(y, 0, 1024, "#5d3d4a") + books(10, 1014, y, PAL, seed + j * 5)
    return svg(o + body, "#3b2a3f")
def floatlamp(x, y): return f'<circle cx="{x}" cy="{y}" r="110" fill="url(#glow)"/><circle cx="{x}" cy="{y}" r="26" fill="#fff0bd" stroke="#c9a45c" stroke-width="4"/>'
stfront = stackwall(floatlamp(230, 140) + floatlamp(800, 170) + '<rect x="372" y="300" width="280" height="630" rx="18" fill="#f4ead2"/><rect x="392" y="320" width="240" height="590" rx="10" fill="#fffaf0"/>'
    '<rect x="392" y="320" width="80" height="590" fill="#36b5d8" opacity=".25"/><rect x="472" y="320" width="80" height="590" fill="#e2468c" opacity=".2"/><rect x="552" y="320" width="80" height="590" fill="#f5c400" opacity=".25"/>'
    + txt(512, 290, "to Dot's Press", 30, "#fff4dc"), 1)
stback = stackwall(floatlamp(512, 150) + '<path d="M352 930V420h320v510z" fill="#2a1d2c"/>' + "".join(f'<rect x="{372 + i*12}" y="{880 - i*70}" width="{280 - i*24}" height="22" fill="#c9a273"/>' for i in range(7))
    + '<rect x="352" y="420" width="320" height="510" fill="url(#glow)"/>' + txt(512, 400, "up to the Returns Bin", 30, "#fff4dc"), 2)
stside = lambda s: stackwall(floatlamp(300, 360) + floatlamp(720, 600), s)
write("stacks", {"front": stfront, "back": stback, "left": stside(3), "right": stside(4),
                 "floor": svg(floor_planks("#5d4250", "#43303a") + '<path d="M512 0v1024" stroke="#8a3b4a" stroke-width="200" opacity=".55"/>', "#5d4250"),
                 "ceiling": svg('<rect width="1024" height="1024" fill="#2f2233"/>' + floatlamp(300, 300) + floatlamp(720, 420) + floatlamp(480, 760), "#2f2233")})

# ---------------- small props for the painted rooms ----------------
P = ROOT / "props"
def prop(name, w, h, body): (P / name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>')
prop("wing-sign.svg", 150, 100, '<line x1="40" y1="0" x2="40" y2="22" stroke="#6b4a2c" stroke-width="4"/><line x1="110" y1="0" x2="110" y2="22" stroke="#6b4a2c" stroke-width="4"/>'
     '<path d="M4 58l26-36h116v72H30z" fill="#c9a273" stroke="#6b4a2c" stroke-width="5"/>'
     f'<text x="88" y="54" font-size="19" text-anchor="middle" fill="{INK}" style="{SERIF}" font-weight="700">GREMLIN</text>'
     f'<text x="88" y="78" font-size="19" text-anchor="middle" fill="{INK}" style="{SERIF}" font-weight="700">WING</text>')
prop("tube-hatch.svg", 130, 130, '<circle cx="65" cy="65" r="60" fill="#b8892f" stroke="#7a5a1c" stroke-width="6"/><circle cx="65" cy="65" r="44" fill="#ffe2a0"/><circle cx="65" cy="65" r="44" fill="none" stroke="#7a5a1c" stroke-width="3" stroke-dasharray="4 6"/>'
     '<rect x="40" y="52" width="50" height="22" rx="11" fill="#2e8a8a"/><circle cx="20" cy="65" r="5" fill="#7a5a1c"/><circle cx="110" cy="65" r="5" fill="#7a5a1c"/>')
prop("book-hatch.svg", 150, 200, '<path d="M10 195V75a65 65 0 0 1 130 0v120z" fill="#6e4a7e" stroke="#3b2a3f" stroke-width="6"/><path d="M28 195V80a47 47 0 0 1 94 0v115z" fill="#ffe9a8"/>'
     + "".join(f'<rect x="{30 + i*15}" y="{150 - (i%3)*8}" width="12" height="{45 + (i%3)*8}" fill="{PAL[i%7]}"/>' for i in range(6)))
prop("skylight-hatch.svg", 220, 220, '<circle cx="110" cy="110" r="104" fill="#6b4a32"/><circle cx="110" cy="110" r="86" fill="#c9b6e4"/><circle cx="110" cy="110" r="86" fill="#ffd98a" opacity=".35"/>'
     '<path d="M24 110h172M110 24v172" stroke="#6b4a32" stroke-width="8"/><path d="M150 60a26 26 0 1 0 14 42a22 22 0 1 1-14-42z" fill="#fff8d8"/>')
prop("root-hole.svg", 220, 160, '<ellipse cx="110" cy="90" rx="104" ry="64" fill="#4a3222"/><ellipse cx="110" cy="92" rx="84" ry="48" fill="#2e1f15"/>'
     '<circle cx="70" cy="100" r="30" fill="#7fe0c8" opacity=".5"/><circle cx="150" cy="96" r="26" fill="#ff9f6b" opacity=".5"/>'
     '<path d="M60 120q-6-26 10-34q16 8 10 34z" fill="#7fe0c8"/><path d="M140 118q-6-24 10-30q16 6 10 30z" fill="#ff9f6b"/>'
     '<path d="M10 70q40-40 80-10M210 72q-40-44-84-8" stroke="#8a6040" stroke-width="10" fill="none" stroke-linecap="round"/>')
prop("crawl-hatch.svg", 170, 130, '<rect x="5" y="5" width="160" height="120" rx="12" fill="#8a6a48" stroke="#5d3d22" stroke-width="6"/><rect x="20" y="20" width="130" height="95" rx="6" fill="#e9dcf3"/>'
     '<rect x="20" y="20" width="130" height="95" rx="6" fill="#ffd98a" opacity=".4"/>' + "".join(f'<rect x="{30 + i*24}" y="{40 + (i%2)*6}" width="18" height="24" fill="#fffaf0" stroke="#9a8a6a" stroke-width="2"/>' for i in range(5))
     + f'<text x="85" y="100" font-size="13" text-anchor="middle" fill="{INK}" style="{HAND}">to the Lantern Loft</text>')
prop("lantern-glow.svg", 100, 100, '<circle cx="50" cy="50" r="48" fill="url(#g)"/><defs><radialGradient id="g"><stop offset="0" stop-color="#fff6cf" stop-opacity=".95"/><stop offset=".5" stop-color="#ffd27a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>')
print("props written")
