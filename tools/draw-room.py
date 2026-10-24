#!/usr/bin/env python3
"""Draws the placeholder room (6 cube faces, 1024x1024 SVG each) into assets/room/.
Moth's painted panorama can replace these later: see tools/equirect-to-cubemap.py.
Palette: cream #E8E4D8 paper #F1EDE2 sage #A6B89A forest #54664A moss #3A4A33 ink #1A1A18
"""
import pathlib
OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "room"
OUT.mkdir(parents=True, exist_ok=True)
CREAM, PAPER, SAGE, FOREST, MOSS, INK = "#E8E4D8", "#F1EDE2", "#A6B89A", "#54664A", "#3A4A33", "#1A1A18"
WOOD, WOOD2, GOLD = "#B08A5E", "#8A6A48", "#C9A45C"
HAND = "font-family:'Bradley Hand','Segoe Print','Comic Sans MS',cursive"
SERIF = "font-family:Georgia,'Times New Roman',serif"

def svg(body, bg=CREAM):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
            f'<rect width="1024" height="1024" fill="{bg}"/>{body}</svg>')

def wall_base():
    # wallpaper dots, wainscot, chair rail, baseboard, crown
    dots = (f'<defs><pattern id="wp" width="48" height="96" patternUnits="userSpaceOnUse">'
            f'<circle cx="12" cy="12" r="2.2" fill="{SAGE}" opacity=".35"/><circle cx="36" cy="60" r="2.2" fill="{SAGE}" opacity=".35"/></pattern></defs>'
            f'<rect y="32" width="1024" height="600" fill="url(#wp)"/>')
    panels = "".join(f'<rect x="{x+14}" y="672" width="98" height="280" rx="6" fill="none" stroke="{FOREST}" stroke-opacity=".35" stroke-width="3"/>'
                     for x in range(0, 1024, 128))
    return (dots + f'<rect y="640" width="1024" height="384" fill="{SAGE}"/>' + panels +
            f'<rect y="628" width="1024" height="18" fill="{FOREST}"/><rect y="976" width="1024" height="48" fill="{MOSS}"/>'
            f'<rect width="1024" height="26" fill="{FOREST}"/><rect y="26" width="1024" height="6" fill="{MOSS}" opacity=".5"/>')

def desk(x0, x1, top=660):
    return (f'<rect x="{x0}" y="{top}" width="{x1-x0}" height="26" rx="4" fill="{WOOD}"/>'
            f'<rect x="{x0+14}" y="{top+26}" width="{x1-x0-28}" height="170" fill="{WOOD2}"/>'
            f'<rect x="{x0+30}" y="{top+44}" width="{(x1-x0)//2-50}" height="56" rx="4" fill="none" stroke="{MOSS}" stroke-width="3" opacity=".6"/>'
            f'<circle cx="{x0+(x1-x0)//4}" cy="{top+72}" r="5" fill="{GOLD}"/>'
            f'<rect x="{x0+20}" y="{top+196}" width="18" height="120" fill="{MOSS}"/><rect x="{x1-38}" y="{top+196}" width="18" height="120" fill="{MOSS}"/>')

def monitor(x, y, w, h, screen, content=""):
    return (f'<rect x="{x+w//2-14}" y="{y+h}" width="28" height="{660-y-h}" fill="{INK}"/>'
            f'<rect x="{x+w//2-50}" y="652" width="100" height="10" rx="4" fill="{INK}"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{INK}"/>'
            f'<rect x="{x+10}" y="{y+10}" width="{w-20}" height="{h-20}" rx="4" fill="{screen}"/>{content}')

def sticky(x, y, color="#F3D98B", rot=0, w=40, text=""):
    t = f'<text x="{w/2}" y="{w*0.6}" text-anchor="middle" font-size="{w*0.28}" fill="{INK}" style="{HAND}">{text}</text>' if text else \
        f'<path d="M6 {w*0.35}h{w-12}M6 {w*0.55}h{w-16}M6 {w*0.75}h{w-20}" stroke="{INK}" stroke-opacity=".45" stroke-width="2"/>'
    return f'<g transform="translate({x} {y}) rotate({rot})"><rect width="{w}" height="{w}" fill="{color}"/><rect width="{w}" height="6" fill="#000" opacity=".06"/>{t}</g>'

def plant_small(x, y):
    return (f'<path d="M{x} {y} q-30 -40 -6 -70 M{x} {y} q10 -60 40 -64 M{x} {y} q-8 -50 -40 -40" stroke="{FOREST}" stroke-width="9" fill="none" stroke-linecap="round"/>'
            f'<ellipse cx="{x-8}" cy="{y-70}" rx="14" ry="8" fill="{FOREST}"/><ellipse cx="{x+38}" cy="{y-64}" rx="14" ry="8" fill="{SAGE}"/><ellipse cx="{x-40}" cy="{y-42}" rx="13" ry="7" fill="{FOREST}"/>'
            f'<path d="M{x-24} {y} h48 l-6 40 h-36z" fill="#C26E4A"/>')

# ---------- FRONT (yaw 0): the desk row ----------
front = wall_base()
front += (f'<rect x="352" y="80" width="320" height="78" rx="10" fill="{WOOD2}"/><rect x="362" y="90" width="300" height="58" rx="6" fill="{WOOD}"/>'
          f'<text x="512" y="126" text-anchor="middle" font-size="23" fill="{PAPER}" style="{SERIF}" letter-spacing="2">THE GREMLIN OFFICE</text>'
          f'<text x="512" y="145" text-anchor="middle" font-size="13" fill="{PAPER}" style="{SERIF};font-style:italic">est. whenever</text>')
# Grimble desk (left)
front += desk(80, 470)
front += monitor(170, 460, 220, 150, "#DCE6D6",
    f'<text x="196" y="500" font-size="18" fill="{MOSS}" style="{HAND}">today:</text>'
    f'<text x="196" y="530" font-size="17" fill="{INK}" style="{HAND}">&#9744; breathe first</text>'
    f'<text x="196" y="556" font-size="17" fill="{INK}" style="{HAND}">&#9744; drink water</text>'
    f'<text x="196" y="582" font-size="17" fill="{INK}" style="{HAND}">&#9745; be kind</text>')
front += sticky(378, 470, "#F3D98B", 14, 38)  # poem behind Grimble's monitor
front += (f'<rect x="100" y="606" width="56" height="54" rx="4" fill="{WOOD2}"/><rect x="104" y="614" width="48" height="44" fill="{PAPER}"/>'
          f'<rect x="118" y="600" width="20" height="10" rx="3" fill="{INK}"/>'  # clipboard
          f'<rect x="410" y="606" width="40" height="52" rx="6" fill="{PAPER}" stroke="{FOREST}" stroke-width="4"/><path d="M450 618 q20 4 0 28" stroke="{FOREST}" stroke-width="6" fill="none"/>'
          f'<text x="430" y="638" text-anchor="middle" font-size="13" fill="{FOREST}" style="{SERIF}">H&#8322;O</text>')
front += (f'<rect x="126" y="250" width="150" height="110" rx="4" fill="{PAPER}" stroke="{FOREST}" stroke-width="6"/>'
          f'<text x="201" y="292" text-anchor="middle" font-size="18" fill="{FOREST}" style="{SERIF}">HR says:</text>'
          f'<text x="201" y="322" text-anchor="middle" font-size="17" fill="{INK}" style="{HAND}">mistakes are</text>'
          f'<text x="201" y="344" text-anchor="middle" font-size="17" fill="{INK}" style="{HAND}">just drafts</text>')
# bin between desks
front += f'<path d="M488 880 h48 l-6 96 h-36z" fill="{FOREST}"/>' + "".join(f'<circle cx="{c}" cy="{cy}" r="11" fill="{PAPER}" stroke="{INK}" stroke-opacity=".3"/>' for c, cy in ((500, 872), (522, 866), (512, 852)))
# Noodle desk (right)
front += desk(554, 944)
cells = "".join(f'<rect x="{652+i*36}" y="{486+j*22}" width="34" height="20" fill="{"#F2B880" if (i*3+j)%5==0 else "#FBE7CF"}"/>' for i in range(5) for j in range(4))
front += monitor(640, 460, 210, 150, "#FBE7CF", cells + f'<text x="745" y="588" text-anchor="middle" font-size="18" fill="#B4532A" style="{HAND}">it&#39;s fine!!!</text>')
front += sticky(612, 478, "#9FD3C7", -12, 38)  # poem behind Noodle's monitor
front += (f'<rect x="880" y="600" width="18" height="60" rx="4" fill="#B4532A"/><rect x="884" y="588" width="10" height="14" fill="{INK}"/>'
          f'<rect x="570" y="630" width="56" height="30" fill="{PAPER}" stroke="{INK}" stroke-opacity=".3"/><rect x="574" y="618" width="52" height="14" fill="{PAPER}" stroke="{INK}" stroke-opacity=".3" transform="rotate(-5 600 625)"/>')
# Noodle's chair (in front of desk)
front += (f'<rect x="700" y="700" width="140" height="150" rx="30" fill="#E07B39"/><rect x="712" y="712" width="116" height="40" rx="14" fill="#F2A066"/>'
          f'<rect x="690" y="840" width="160" height="34" rx="14" fill="#C9662C"/><rect x="760" y="874" width="20" height="60" fill="{INK}"/>'
          f'<path d="M700 950 h140" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>'
          + "".join(f'<circle cx="{c}" cy="962" r="11" fill="{INK}"/>' for c in (702, 770, 838)) +
          f'<path d="M730 780 l14 -10 l6 16 l14 -12" stroke="{PAPER}" stroke-width="4" fill="none"/>')
front += plant_small(930, 610)
(OUT / "front.svg").write_text(svg(front))

# ---------- RIGHT (yaw 90): the gallery ----------
right = wall_base()
right += f'<rect y="150" width="1024" height="8" fill="{WOOD2}"/>'
for cx, top in ((150, 200), (620, 200), (870, 200)):  # strings to strip slots (frames are drawn by the app)
    right += f'<path d="M{cx} 158 L{cx-60} {top} M{cx} 158 L{cx+60} {top}" stroke="{INK}" stroke-width="2" opacity=".5"/>'
# Mona Grimsa (original parody by "Moth")
right += (f'<path d="M385 158 L330 250 M385 158 L440 250" stroke="{INK}" stroke-width="2" opacity=".5"/>'
          f'<rect x="296" y="244" width="178" height="240" rx="6" fill="{GOLD}"/><rect x="306" y="254" width="158" height="220" fill="#8C7A3E"/>'
          f'<rect x="314" y="262" width="142" height="204" fill="#5E6B47"/>'
          f'<path d="M314 330 q40 -20 70 0 t72 -6 v60 h-142z" fill="#7C8A5A"/><path d="M330 400 q20 -30 50 -20" stroke="#A9A26B" stroke-width="5" fill="none"/>'
          f'<path d="M340 466 q-6 -70 45 -96 q51 26 45 96z" fill="{MOSS}"/>'  # robe
          f'<path d="M352 300 q33 -44 66 0 l6 70 h-78z" fill="#2B2A1E"/>'  # veil/hair
          f'<path d="M347 312 l-26 -22 l30 8z M423 312 l26 -22 l-30 8z" fill="#B7B98A"/>'  # gremlin ears
          f'<ellipse cx="385" cy="328" rx="26" ry="32" fill="#C9C79A"/>'
          f'<ellipse cx="375" cy="322" rx="5" ry="3.5" fill="{INK}"/>'   # the one remaining eye
          f'<path d="M390 322 q6 -2 12 0" stroke="#B5B386" stroke-width="2" fill="none"/>'  # where the other eye was
          f'<path d="M376 344 q10 6 20 0" stroke="#6E5A3A" stroke-width="2.5" fill="none"/>'
          f'<path d="M362 420 q24 14 48 0 q-6 -12 -24 -10 q-18 -2 -24 10z" fill="#C9C79A"/>'  # folded hands
          f'<g transform="rotate(8 448 262)"><rect x="436" y="252" width="34" height="30" fill="#F3D98B"/><text x="453" y="266" text-anchor="middle" font-size="8" fill="{INK}" style="{HAND}">eye out</text><text x="453" y="276" text-anchor="middle" font-size="8" fill="{INK}" style="{HAND}">back @2</text></g>')
right += (f'<rect x="362" y="548" width="300" height="56" rx="4" fill="{WOOD2}"/><rect x="368" y="554" width="288" height="44" rx="3" fill="{GOLD}" opacity=".85"/>'
          f'<text x="512" y="574" text-anchor="middle" font-size="16" fill="{INK}" style="{SERIF}">GREMLIN DIARIES</text>'
          f'<text x="512" y="592" text-anchor="middle" font-size="12" fill="{INK}" style="{SERIF};font-style:italic">the permanent collection (rotates daily)</text>')
right += f'<text x="70" y="600" font-size="15" fill="{FOREST}" style="{HAND}">please do not lick the art</text>'
right += (f'<text x="770" y="596" font-size="17" fill="#6B6B60" style="{HAND}" transform="rotate(-4 770 596)">b.n. &#8212; try this &#8594;</text>'
          f'<path d="M772 606 q40 10 100 -2" stroke="#6B6B60" stroke-width="2" fill="none"/>')
right += (f'<rect x="300" y="800" width="424" height="34" rx="8" fill="{WOOD}"/><rect x="320" y="834" width="22" height="120" fill="{WOOD2}"/><rect x="682" y="834" width="22" height="120" fill="{WOOD2}"/>'
          f'<rect x="300" y="790" width="424" height="12" rx="6" fill="{WOOD2}"/>')
(OUT / "right.svg").write_text(svg(right))

# ---------- BACK (yaw 180): window, Pip's desk, Vesper's books, corkboard ----------
back = wall_base()
# bookshelf
back += f'<rect x="40" y="180" width="220" height="800" fill="{WOOD2}"/><rect x="52" y="192" width="196" height="776" fill="#6E5238"/>'
cols = ["#7A5BA6", SAGE, FOREST, "#C26E4A", PAPER, "#9FD3C7", "#F3D98B", MOSS, "#B07CC6"]
for s, sy in enumerate(range(200, 960, 152)):
    x = 58; i = s * 3
    while x < 236:
        w = 14 + (i * 7) % 12; hgt = 110 + (i * 13) % 30
        back += f'<rect x="{x}" y="{sy+140-hgt}" width="{w}" height="{hgt}" fill="{cols[i % len(cols)]}"/>'
        x += w + 2; i += 1
    back += f'<rect x="52" y="{sy+140}" width="196" height="12" fill="{WOOD}"/>'
# window
back += (f'<rect x="320" y="160" width="380" height="410" rx="8" fill="{FOREST}"/>'
         f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6EFD9"/><stop offset="1" stop-color="#DCE6D2"/></linearGradient></defs>'
         f'<rect x="336" y="176" width="348" height="378" fill="url(#sky)"/>'
         f'<circle cx="600" cy="260" r="38" fill="#F3D98B" opacity=".9"/>'
         f'<path d="M336 430 q80 -70 170 -20 t178 -30 v174 h-348z" fill="{SAGE}"/>'
         f'<path d="M336 480 q100 -50 200 0 t148 -10 v84 h-348z" fill="{FOREST}"/>'
         f'<path d="M336 530 q120 -30 348 -10 v34 h-348z" fill="{MOSS}"/>'
         f'<path d="M420 250 q8 -8 16 0 q8 -8 16 0" stroke="{INK}" stroke-width="2.5" fill="none"/>'
         f'<rect x="504" y="176" width="12" height="378" fill="{FOREST}"/><rect x="336" y="358" width="348" height="12" fill="{FOREST}"/>'
         f'<rect x="306" y="566" width="408" height="16" rx="4" fill="{WOOD}"/>')
# Pip's desk + monitor covered in sticky notes
back += desk(300, 720, 664)
back += monitor(360, 470, 200, 150, "#DFF0EA",
    sticky(378, 488, "#F3D98B", -6, 34) + sticky(420, 520, "#9FD3C7", 8, 34) + sticky(470, 486, "#F2B880", 4, 34) + sticky(500, 540, "#F3D98B", -10, 30))
back += sticky(548, 478, "#F2B880", 16, 36)  # poem behind Pip's monitor
back += sticky(600, 610, "#9FD3C7", -8, 44, "idea!") + sticky(650, 618, "#F3D98B", 6, 40, "idea?")
back += "".join(sticky(330 + i * 64, 720 + (i % 2) * 40, ["#F3D98B", "#9FD3C7", "#F2B880"][i % 3], (i * 17) % 20 - 10, 34) for i in range(6))
# corkboard with notes + Bryan notes
back += (f'<rect x="780" y="220" width="216" height="260" rx="6" fill="{WOOD2}"/><rect x="790" y="230" width="196" height="240" fill="#C9A273"/>'
         + sticky(800, 246, "#F3D98B", -5, 44) + sticky(856, 300, "#9FD3C7", 7, 44) + sticky(930, 250, "#F2B880", 3, 40) + sticky(810, 400, "#9FD3C7", -9, 40) +
         f'<g transform="rotate(-6 880 380)"><rect x="840" y="356" width="96" height="62" fill="{PAPER}"/><text x="848" y="378" font-size="13" fill="#5B5B52" style="{HAND}">B.N.:</text><text x="848" y="398" font-size="13" fill="#5B5B52" style="{HAND}">don&#39;t forget</text><circle cx="888" cy="360" r="4" fill="#C0392B"/></g>'
         f'<g transform="rotate(5 940 440)"><rect x="905" y="410" width="74" height="52" fill="{PAPER}"/><text x="912" y="432" font-size="12" fill="#5B5B52" style="{HAND}">B.N. side</text><text x="912" y="450" font-size="12" fill="#5B5B52" style="{HAND}">thing #2</text><circle cx="942" cy="414" r="4" fill="#C0392B"/></g>')
# office plant, leaning toward Pip's desk
back += (f'<path d="M800 830 q-40 -120 -120 -170 M800 830 q-10 -140 -70 -230 M800 830 q20 -120 -10 -200 M800 830 q-60 -60 -130 -60" stroke="{FOREST}" stroke-width="10" fill="none" stroke-linecap="round"/>'
         + "".join(f'<ellipse cx="{x}" cy="{y}" rx="26" ry="12" fill="{c}" transform="rotate({r} {x} {y})"/>' for x, y, r, c in
                   ((680, 660, -30, FOREST), (730, 600, -50, SAGE), (790, 630, -70, FOREST), (670, 770, -10, SAGE), (720, 700, -35, FOREST), (760, 560, -60, FOREST)))
         + f'<path d="M760 830 h80 l-10 140 h-60z" fill="#C26E4A"/><rect x="755" y="822" width="90" height="16" rx="4" fill="#A85A3A"/>'
         + sticky(778, 880, "#9FD3C7", -6, 40))
(OUT / "back.svg").write_text(svg(back))

# ---------- LEFT (yaw 270): print corner, door, team wall, Moth's table ----------
left = wall_base()
left += (f'<rect x="70" y="150" width="270" height="70" rx="8" fill="{MOSS}"/>'
         f'<text x="205" y="184" text-anchor="middle" font-size="22" fill="{PAPER}" style="{SERIF}">DOT&#39;S PRINT SHOP</text>'
         f'<text x="205" y="206" text-anchor="middle" font-size="12" fill="{SAGE}" style="{SERIF};font-style:italic">open when the light is on</text>'
         f'<circle cx="320" cy="164" r="8" fill="#F3D98B"/>')
left += (f'<rect x="70" y="600" width="270" height="380" rx="12" fill="#D8D4C6"/><rect x="70" y="600" width="270" height="70" rx="12" fill="#C4BFAE"/>'
         f'<rect x="96" y="616" width="120" height="36" rx="4" fill="#9FB3A0"/><circle cx="292" cy="634" r="12" fill="{FOREST}"/><circle cx="256" cy="634" r="7" fill="#C26E4A"/>'
         f'<rect x="96" y="700" width="218" height="20" rx="4" fill="#B5B09F"/><rect x="104" y="690" width="200" height="12" fill="{PAPER}" stroke="{INK}" stroke-opacity=".2"/>'
         f'<rect x="96" y="760" width="218" height="190" rx="6" fill="#C4BFAE"/><rect x="120" y="800" width="170" height="14" rx="7" fill="#A8A392"/>'
         f'<rect x="100" y="560" width="110" height="40" fill="{PAPER}" stroke="{INK}" stroke-opacity=".2"/><rect x="104" y="548" width="110" height="14" fill="{PAPER}" stroke="{INK}" stroke-opacity=".2" transform="rotate(-3 159 555)"/>'
         f'<text x="155" y="586" text-anchor="middle" font-size="13" fill="{FOREST}" style="{HAND}">thank you!</text>')
left += (f'<rect x="400" y="290" width="224" height="690" rx="6" fill="{WOOD2}"/><rect x="414" y="304" width="196" height="676" fill="{MOSS}"/>'
         f'<rect x="436" y="330" width="152" height="250" rx="6" fill="none" stroke="{FOREST}" stroke-width="5"/><rect x="436" y="620" width="152" height="300" rx="6" fill="none" stroke="{FOREST}" stroke-width="5"/>'
         f'<circle cx="586" cy="640" r="12" fill="{GOLD}"/>'
         f'<rect x="446" y="392" width="132" height="76" rx="4" fill="{PAPER}"/>'
         f'<text x="512" y="420" text-anchor="middle" font-size="15" fill="{INK}" style="{SERIF}">GREMLINS ONLY</text>'
         f'<text x="512" y="444" text-anchor="middle" font-size="13" fill="{FOREST}" style="{HAND}">(humans welcome)</text>'
         f'<path d="M470 980 h84" stroke="#F3D98B" stroke-width="4" opacity=".6"/>')
left += f'<text x="830" y="186" text-anchor="middle" font-size="17" fill="{FOREST}" style="{SERIF};font-style:italic">Employees of the Month (every month)</text>'
left += (f'<path d="M680 600 L990 640 L990 666 L680 626z" fill="{WOOD}"/><rect x="700" y="640" width="14" height="330" fill="{MOSS}" transform="rotate(4 707 640)"/><rect x="950" y="660" width="14" height="310" fill="{MOSS}" transform="rotate(-4 957 660)"/>'
         f'<path d="M720 600 L900 623 L900 640 L720 617z" fill="{PAPER}"/><path d="M745 608 q30 -18 60 2 t60 4" stroke="{FOREST}" stroke-width="3" fill="none"/>'
         f'<path d="M960 560 l-40 -80 l-30 10" stroke="{INK}" stroke-width="6" fill="none"/><path d="M880 480 l40 -20 l10 30z" fill="{FOREST}"/>'
         f'<rect x="900" y="676" width="56" height="26" fill="{PAPER}" transform="rotate(-6 928 690)"/><text x="928" y="694" text-anchor="middle" font-size="11" fill="#5B5B52" style="{HAND}" transform="rotate(-6 928 690)">B.N.</text>')
(OUT / "left.svg").write_text(svg(left))

# ---------- FLOOR ----------
planks = "".join(f'<rect x="0" y="{y}" width="1024" height="62" fill="{"#B9966B" if (y//64)%2 else "#B08A5E"}"/>'
                 f'<path d="M{(y*7)%400+100} {y} v62 M{(y*13)%500+520} {y} v62" stroke="{WOOD2}" stroke-width="3"/>' for y in range(0, 1024, 64))
floor = planks + (f'<circle cx="512" cy="512" r="300" fill="{FOREST}"/><circle cx="512" cy="512" r="280" fill="{SAGE}"/>'
                  f'<circle cx="512" cy="512" r="220" fill="none" stroke="{PAPER}" stroke-width="10" stroke-dasharray="4 18"/>'
                  f'<text x="512" y="470" text-anchor="middle" font-size="48" fill="{MOSS}" style="{SERIF}">hello, human</text>'
                  f'<text x="512" y="530" text-anchor="middle" font-size="22" fill="{MOSS}" style="{SERIF};font-style:italic">wipe your paws</text>')
(OUT / "floor.svg").write_text(svg(floor, "#B08A5E"))

# ---------- CEILING ----------
ceil = "".join(f'<path d="M{v} 0 V1024 M0 {v} H1024" stroke="#D6D1C2" stroke-width="4"/>' for v in range(128, 1024, 128))
ceil += (f'<circle cx="512" cy="512" r="140" fill="#F6EBC8" opacity=".7"/><circle cx="512" cy="512" r="70" fill="{PAPER}" stroke="{FOREST}" stroke-width="8"/>'
         f'<g transform="rotate(-25 720 330)"><path d="M680 330 L780 310 L700 350z" fill="{PAPER}" stroke="{INK}" stroke-opacity=".4" stroke-width="2"/><path d="M700 350 L780 310 L720 336z" fill="#DAD5C6"/></g>')
(OUT / "ceiling.svg").write_text(svg(ceil, "#ECE8DD"))
print("wrote", [p.name for p in OUT.iterdir()])
