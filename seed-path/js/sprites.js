/* The Seed Path: everything you see is drawn here in code. No image files. */
(function () {
  const P = SEED.palette = {
    paper: "#F1EDE2", cream: "#FBF6EA", sage: "#A6B89A", forest: "#54664A", moss: "#3A4A33", ink: "#1A1A18",
    lav: "#B9A7D6", lavD: "#8E7BB5", peach: "#E8B77A", peachD: "#C98F52", dusk: "#5C6F96", duskD: "#3D4B6E",
    grass: "#9DB38E", grass2: "#99AF8A", grass3: "#A2B794", path: "#E2D6BC", path2: "#D6C8AA",
    water: "#7FA7B5", water2: "#9CBFCA", stone: "#9A9A8C", stoneD: "#6E6E62", glow: "#FBE3A0", rose: "#E7A9A0"
  };
  function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s || 0) * 982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  SEED.hash = hash;
  function shade(hex, f) {
    let n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const m = f < 0 ? 0 : 255, k = Math.abs(f);
    r = Math.round(r + (m - r) * k); g = Math.round(g + (m - g) * k); b = Math.round(b + (m - b) * k);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  SEED.shade = shade;

  /* ---------- Kin: parameterised 16x16 pixel creatures ---------- */
  const SHAPES = {
    round: { cx: 7.5, cy: 9.5, rx: 5.6, ry: 5.0 },
    tall:  { cx: 7.5, cy: 8.8, rx: 4.0, ry: 6.2 },
    wide:  { cx: 7.5, cy: 10.6, rx: 6.6, ry: 3.9 },
    drop:  { cx: 7.5, cy: 9.6, rx: 5.2, ry: 5.2 },
    sock:  { cx: 7.5, cy: 8.0, rx: 3.0, ry: 6.0 },
    cap:   { cx: 7.5, cy: 10.5, rx: 3.0, ry: 3.5 },
    long:  { cx: 7.5, cy: 10.5, rx: 6.8, ry: 3.2 },
    blob:  { cx: 7.5, cy: 9.8, rx: 6.0, ry: 4.8 }
  };
  function inShape(sh, x, y) {
    const s = SHAPES[sh], dx = (x - s.cx) / s.rx, dy = (y - s.cy) / s.ry;
    if (sh === "drop") { const w = s.rx * Math.min(1, Math.max(0.3, (y - 3.5) / 5)); return ((x - s.cx) / w) ** 2 + dy * dy <= 1; }
    if (sh === "sock") return (x >= 5 && x <= 10 && y >= 2 && y <= 11) || (y >= 10 && y <= 14 && x >= 5 && x <= 13 && !(x === 13 && (y === 10 || y === 14)));
    if (sh === "cap") return ((((x - 7.5) / 7.2) ** 2 + ((y - 6.5) / 4.2) ** 2 <= 1) && y <= 7) || (x >= 5 && x <= 10 && y >= 8 && y <= 14);
    if (sh === "blob") return Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dy), 2.4) <= 1;
    if (sh === "long") return dx * dx + dy * dy <= 1 || ((x - 4) / 3.2) ** 2 + ((y - 8.2) / 2.8) ** 2 <= 1;
    return dx * dx + dy * dy <= 1;
  }
  function buildKin(look) {
    const g = [...Array(16)].map(() => Array(16).fill(null));
    const sh = look.shape, S = SHAPES[sh], parts = look.parts || [];
    let top = 16, bot = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (inShape(sh, x, y)) { g[y][x] = look.body; top = Math.min(top, y); bot = Math.max(bot, y); }
    const set = (x, y, c, onlyEmpty) => { if (x < 0 || y < 0 || x > 15 || y > 15) return; if (onlyEmpty && g[y][x]) return; g[y][x] = c; };
    // belly
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x]) {
      const bx = (x - S.cx) / (S.rx * 0.55), by = (y - (S.cy + S.ry * 0.35)) / (S.ry * 0.45);
      if (bx * bx + by * by <= 1 && sh !== "cap" && sh !== "sock") g[y][x] = look.belly;
    }
    const A = look.accent, dark = shade(look.body, -0.45);
    if (parts.includes("stripes")) for (let y = top + 1; y <= bot; y++) if (y % 3 === 0) for (let x = 0; x < 16; x++) if (g[y][x] === look.body) g[y][x] = A;
    if (parts.includes("spots")) [[5, 0.3], [10, 0.45], [8, 0.15], [4, 0.6], [11, 0.75]].forEach(([x, f]) => { const y = Math.round(top + (bot - top) * f); if (g[y] && g[y][x] === look.body) g[y][x] = A; });
    if (sh === "cap") { for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) if (g[y][x]) g[y][x] = A; [[4, 4], [8, 3], [11, 5]].forEach(([x, y]) => { if (g[y][x]) g[y][x] = look.belly; }); }
    if (parts.includes("shell")) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 10, y - (S.cy - 1.2)); if (d <= 3.3) g[y][x] = d < 1.2 ? look.belly : d < 2.2 ? shade(A, -0.2) : A; }
    if (parts.includes("scarf")) { const y = Math.round(S.cy); for (let x = 0; x < 16; x++) if (g[y][x]) g[y][x] = A; }
    if (parts.includes("wings")) for (let y = Math.round(S.cy - 3); y <= Math.round(S.cy + 1); y++) { set(1, y, A, 1); set(2, y, A, 1); set(14, y, A, 1); set(13, y, A, 1); set(0, y - 1, shade(A, -0.2), 1); set(15, y - 1, shade(A, -0.2), 1); }
    if (parts.includes("ears")) { const t = top; set(4, t, A); set(4, t - 1, A); set(5, t - 1, A); set(11, t, A); set(11, t - 1, A); set(10, t - 1, A); }
    if (parts.includes("antennae")) { set(6, top - 1, dark); set(5, top - 2, dark); set(9, top - 1, dark); set(10, top - 2, dark); }
    if (parts.includes("leaf")) { set(8, top - 1, P.forest); set(8, top - 2, P.sage); set(9, top - 2, P.sage); set(9, top - 3, P.sage); }
    if (parts.includes("flame")) { set(7, top - 1, P.peach); set(8, top - 1, P.peach); set(7, top - 2, P.glow); set(8, top - 2, P.peach); set(8, top - 3, P.glow); }
    if (parts.includes("tail")) { const y = Math.round(S.cy + 1); set(14, y, A, 1); set(15, y - 1, A, 1); set(15, y - 2, A, 1); set(14, y - 3, A, 1); }
    if (parts.includes("handle")) { const y = Math.round(S.cy); for (let k = -2; k <= 1; k++) set(15, y + k, A, 1); set(14, y - 3, A, 1); set(14, y + 2, A, 1); }
    if (parts.includes("spikes")) for (let x = 2; x < 14; x += 2) { let y = 0; while (y < 16 && !g[y][x]) y++; set(x, y - 1, A); set(x + 1, y, A); }
    if (parts.includes("fluff")) for (let x = 1; x < 15; x += 3) { let y = 0; while (y < 16 && !g[y][x]) y++; set(x, y - 1, look.body); }
    if (parts.includes("petals")) for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; set(Math.round(7.5 + Math.cos(ang) * 7), Math.round(S.cy - 1 + Math.sin(ang) * 6.5), A, 1); set(Math.round(7.5 + Math.cos(ang) * 6.3), Math.round(S.cy - 1 + Math.sin(ang) * 5.8), A, 1); }
    if (parts.includes("fins")) { set(7, top - 1, A); set(8, top - 1, A); set(8, top - 2, A); }
    if (parts.includes("legs")) [3, 5, 10, 12].forEach(x => set(x, bot + 1, dark, 1));
    if (parts.includes("feet")) [5, 6, 9, 10].forEach(x => set(x, bot + 1, shade(look.body, -0.3), 1));
    // outline
    const out = g.map(r => r.slice());
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x]) {
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const yy = y + dy, xx = x + dx; return yy < 0 || yy > 15 || xx < 0 || xx > 15 || !g[yy][xx]; });
      if (edge) out[y][x] = shade(g[y][x], -0.32);
    }
    // face
    let ey = sh === "cap" ? 10 : sh === "sock" ? 5 : sh === "long" ? 8 : Math.round(S.cy - S.ry * 0.3);
    let ex1 = sh === "long" ? 3 : sh === "sock" ? 6 : 6, ex2 = sh === "long" ? 6 : sh === "sock" ? 9 : 9;
    const ink = P.ink, put = (x, y, c) => { if (out[y] && x >= 0 && x < 16) out[y][x] = c; };
    if (look.eyes === "sleepy") { put(ex1 - 1, ey, ink); put(ex1, ey, ink); put(ex2, ey, ink); put(ex2 + 1, ey, ink); }
    else if (look.eyes === "happy") { put(ex1 - 1, ey + 1, ink); put(ex1, ey, ink); put(ex1 + 1, ey + 1, ink); put(ex2 - 1, ey + 1, ink); put(ex2, ey, ink); put(ex2 + 1, ey + 1, ink); }
    else if (look.eyes === "tiny") { put(ex1, ey, ink); put(ex2, ey, ink); }
    else { put(ex1, ey, ink); put(ex1, ey + 1, ink); put(ex2, ey, ink); put(ex2, ey + 1, ink); }
    if (parts.includes("beak")) { put(7, ey + 2, P.peachD); put(8, ey + 2, P.peachD); }
    if (parts.includes("whiskers")) { put(2, ey + 2, P.stoneD); put(3, ey + 2, P.stoneD); put(12, ey + 2, P.stoneD); put(13, ey + 2, P.stoneD); }
    if (sh !== "long" && out[ey + 2] && out[ey + 2][ex1 - 2] && look.body !== P.rose) { put(ex1 - 2, ey + 2, P.rose); put(ex2 + 2, ey + 2, P.rose); }
    return out;
  }
  const cache = {};
  function gridCanvas(grid, sil) {
    const c = document.createElement("canvas"); c.width = 16; c.height = 16; const x = c.getContext("2d");
    for (let y = 0; y < 16; y++) for (let i = 0; i < 16; i++) if (grid[y][i]) { x.fillStyle = sil ? sil : grid[y][i]; x.fillRect(i, y, 1, 1); }
    return c;
  }
  SEED.kinSprite = function (kin, sil) {
    const key = kin.id + (sil ? ":s" : "");
    if (!cache[key]) cache[key] = gridCanvas(cache[kin.id + ":g"] || (cache[kin.id + ":g"] = buildKin(kin.look)), sil ? "#6F7D96" : null);
    return cache[key];
  };
  SEED.kinPortrait = function (kin, sil, size) {
    const c = document.createElement("canvas"); c.width = c.height = size || 96; const x = c.getContext("2d");
    x.imageSmoothingEnabled = false; x.drawImage(SEED.kinSprite(kin, sil), 0, 0, c.width, c.height); c.className = "pix"; return c;
  };

  /* ---------- You: a small hooded wanderer ---------- */
  const youRows = [
    "................",
    "......pppp......",
    ".....pPPPPp.....",
    "....pPccccPp....",
    "....pckcckcp....",
    "....pccccccp....",
    "....pcrccrcp....",
    ".....pccccp.....",
    "....ssssssss....",
    "...sffssssffs...",
    "...ssssssssss...",
    "....ssssssss....",
    "....ssssssss....",
    ".....cc..cc.....",
    ".....PP..PP.....",
    "................"
  ];
  const youCol = { p: P.peach, P: P.peachD, c: P.cream, k: P.ink, r: P.rose, s: P.sage, f: P.forest };
  function you(frame, back) {
    const c = document.createElement("canvas"); c.width = c.height = 16; const x = c.getContext("2d");
    youRows.forEach((row, y) => [...row].forEach((ch, i) => {
      if (ch === ".") return; let col = youCol[ch];
      if (back && y >= 3 && y <= 7 && ch !== "p") col = P.peachD;
      if (y >= 13 && frame === 1) { if (i < 8 && y === 14) return; }
      if (y >= 13 && frame === 2) { if (i > 8 && y === 14) return; }
      x.fillStyle = col; x.fillRect(i, y, 1, 1);
    }));
    return c;
  }
  SEED.you = { front: [you(0), you(1), you(2)], back: [you(0, 1), you(1, 1), you(2, 1)] };

  /* ---------- The Cloud guide ---------- */
  SEED.drawCloud = function (x, cx, cy, s, t) {
    x.save(); x.translate(cx, cy); x.scale(s, s);
    x.fillStyle = "rgba(61,75,110,0.15)"; x.beginPath(); x.ellipse(0, 9, 11, 2.5, 0, 0, 7); x.fill();
    x.fillStyle = P.cream;
    [[-6, 1, 5], [0, -2, 6.5], [6, 1, 5], [0, 3, 6]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); });
    x.fillStyle = P.ink; x.fillRect(-3, 0, 2, 1); x.fillRect(2, 0, 2, 1);
    x.fillStyle = P.rose; x.fillRect(-5, 2, 1, 1); x.fillRect(5, 2, 1, 1);
    x.restore();
  };

  /* ---------- Tiles ---------- */
  const SOLID = new Set(["#", "^", "~", "r", "h", "o", "f", "T", "l", "b", "g", "z"]);
  SEED.isSolidTile = ch => SOLID.has(ch);
  function grass(x, X, Y, tx, ty) {
    const h = hash(tx, ty, 1);
    x.fillStyle = h < 0.33 ? P.grass : h < 0.66 ? P.grass2 : P.grass3; x.fillRect(X, Y, 16, 16);
    x.fillStyle = "rgba(84,102,74,0.35)";
    for (let k = 0; k < 3; k++) { const a = hash(tx, ty, 10 + k); if (a < 0.6) x.fillRect(X + Math.floor(hash(tx, ty, 20 + k) * 14) + 1, Y + Math.floor(a * 26) % 14 + 1, 1, 2); }
  }
  SEED.drawTile = function (x, ch, tx, ty, t, area, still) {
    const X = tx * 16, Y = ty * 16, h = hash(tx, ty, 3);
    switch (ch) {
      case "=": case "L":
        x.fillStyle = P.path; x.fillRect(X, Y, 16, 16); x.fillStyle = P.path2;
        for (let k = 0; k < 4; k++) x.fillRect(X + Math.floor(hash(tx, ty, k) * 14), Y + Math.floor(hash(tx, ty, k + 9) * 14), 2, 1);
        if (ch === "L") { x.fillStyle = "rgba(251,227,160,0.45)"; x.fillRect(X, Y, 16, 16); }
        break;
      case "~": {
        x.fillStyle = P.water; x.fillRect(X, Y, 16, 16); x.fillStyle = P.water2;
        const o = still ? 0 : Math.floor((t * 2 + h * 8)) % 8;
        x.fillRect(X + ((3 + o) % 12), Y + 4, 4, 1); x.fillRect(X + ((10 + o) % 12), Y + 11, 3, 1);
        if (h > 0.85) { x.fillStyle = "#8FB07F"; x.beginPath(); x.arc(X + 8, Y + 8, 3.5, 0.4, 6); x.lineTo(X + 8, Y + 8); x.fill(); }
        break; }
      case "^":
        x.fillStyle = ty === 0 ? "#B9C9A8" : "#AFC29E"; x.fillRect(X, Y, 16, 16);
        x.fillStyle = "rgba(185,167,214,0.25)"; if (ty === 1) x.fillRect(X, Y + 12, 16, 4);
        break;
      default: grass(x, X, Y, tx, ty);
    }
    if (ch === ",") { const cols = [P.cream, P.lav, P.peach, P.glow]; for (let k = 0; k < 3; k++) { x.fillStyle = cols[Math.floor(hash(tx, ty, k + 30) * 4)]; const a = X + 2 + Math.floor(hash(tx, ty, k + 40) * 11), b = Y + 2 + Math.floor(hash(tx, ty, k + 50) * 11); x.fillRect(a, b, 2, 2); x.fillStyle = P.forest; x.fillRect(a, b + 2, 1, 1); } }
    if (ch === "R") { x.fillStyle = P.forest; for (let k = 0; k < 4; k++) x.fillRect(X + 3 + k * 3, Y + 4 + (k % 2) * 2, 1, 10); x.fillStyle = P.peachD; x.fillRect(X + 6, Y + 3, 1, 3); }
    if (ch === "M") { [[4, 9], [10, 6], [9, 12]].forEach(([a, b]) => { x.fillStyle = P.cream; x.fillRect(X + a, Y + b, 1, 3); x.fillStyle = P.lav; x.fillRect(X + a - 1, Y + b - 1, 3, 2); }); }
  };
  SEED.drawTall = function (x, ch, tx, ty, t, still) {   // things that sit on top of ground
    const X = tx * 16, Y = ty * 16, h = hash(tx, ty, 5);
    if (ch === "#") {
      x.fillStyle = "rgba(61,75,110,0.22)"; x.beginPath(); x.ellipse(X + 8, Y + 14, 7, 2.5, 0, 0, 7); x.fill();
      x.fillStyle = "#7A5E44"; x.fillRect(X + 7, Y + 10, 2, 5);
      x.fillStyle = h > 0.5 ? P.forest : "#4E6045"; x.beginPath(); x.arc(X + 8, Y + 7, 7, 0, 7); x.fill();
      x.fillStyle = h > 0.5 ? "#6B805E" : "#647A57"; x.beginPath(); x.arc(X + 6, Y + 5, 4, 0, 7); x.fill();
      x.fillStyle = "rgba(185,167,214,0.25)"; x.beginPath(); x.arc(X + 10, Y + 10, 3.5, 0, 7); x.fill();
    } else if (ch === "T") {
      x.fillStyle = "rgba(61,75,110,0.2)"; x.fillRect(X + 2, Y + 13, 12, 2);
      x.fillStyle = "#6B805E"; x.beginPath(); x.ellipse(X + 8, Y + 9, 7, 5.5, 0, 0, 7); x.fill();
      x.fillStyle = "#86A076"; x.beginPath(); x.ellipse(X + 6, Y + 7, 3.5, 2.5, 0, 0, 7); x.fill();
      if (h > 0.5) { x.fillStyle = P.lav; x.fillRect(X + 10, Y + 8, 2, 2); x.fillRect(X + 4, Y + 11, 2, 2); }
    } else if (ch === "r") {
      x.fillStyle = "rgba(61,75,110,0.2)"; x.beginPath(); x.ellipse(X + 8, Y + 13, 6, 2, 0, 0, 7); x.fill();
      x.fillStyle = P.stone; x.beginPath(); x.ellipse(X + 8, Y + 9, 6, 5, 0, 0, 7); x.fill();
      x.fillStyle = "#B4B4A6"; x.beginPath(); x.ellipse(X + 6, Y + 7, 3, 2, 0, 0, 7); x.fill();
      x.fillStyle = "#7F9A6E"; x.fillRect(X + 4, Y + 4 + Math.floor(h * 3), 5, 2);
    } else if (ch === "h" || ch === "o") {
      x.fillStyle = "#E9DFC9"; x.fillRect(X, Y, 16, 16);
      x.fillStyle = "#D8CBB0"; x.fillRect(X, Y + 15, 16, 1);
      if (ch === "o") { x.fillStyle = P.dusk; x.fillRect(X + 4, Y + 4, 8, 12); x.fillStyle = P.glow; x.fillRect(X + 10, Y + 10, 1, 1); }
      else if (h > 0.6) { x.fillStyle = P.glow; x.fillRect(X + 4, Y + 5, 6, 5); x.fillStyle = P.forest; x.fillRect(X + 6, Y + 5, 1, 5); x.fillRect(X + 4, Y + 7, 6, 1); }
    } else if (ch === "f") {
      x.fillStyle = "#8D7458"; x.fillRect(X + 7, Y + 3, 2, 12); x.fillStyle = P.cream; x.fillRect(X, Y + 4, 16, 1);
      const cs = [P.lav, P.sage, P.peach]; x.fillStyle = cs[Math.floor(h * 3)]; x.fillRect(X + 2, Y + 5, 3, 5); x.fillRect(X + 2, Y + 9, 5, 2);
      x.fillStyle = cs[(Math.floor(h * 3) + 1) % 3]; x.fillRect(X + 11, Y + 5, 3, 4);
    } else if (ch === "l") {
      x.fillStyle = "#5B4B3A"; x.fillRect(X + 7, Y + 6, 2, 9);
      x.fillStyle = P.glow; x.fillRect(X + 5, Y + 2, 6, 5); x.fillStyle = P.peachD; x.fillRect(X + 5, Y + 1, 6, 1);
    } else if (ch === "b") {
      x.fillStyle = "#8D7458"; x.fillRect(X + 1, Y + 6, 14, 3); x.fillRect(X + 1, Y + 3, 14, 2); x.fillRect(X + 2, Y + 9, 2, 5); x.fillRect(X + 12, Y + 9, 2, 5);
      x.fillStyle = "#7F9A6E"; x.fillRect(X + 3, Y + 3, 4, 1);
    } else if (ch === "g" || ch === "z") {
      x.fillStyle = "#5E7652"; x.beginPath(); x.ellipse(X + 8, Y + 9, 8, 7, 0, 0, 7); x.fill();
      x.fillStyle = "#7A9468"; x.beginPath(); x.ellipse(X + 7, Y + 7, 5, 3, 0, 0, 7); x.fill();
      x.fillStyle = P.ink; x.fillRect(X + 5, Y + 9, 2, 1); x.fillRect(X + 10, Y + 9, 2, 1);   // a sleeping hedge face
      if (ch === "z") { x.fillStyle = P.cream; x.fillRect(X + 12, Y + 2, 3, 1); x.fillRect(X + 13, Y + 3, 1, 1); x.fillRect(X + 12, Y + 4, 3, 1); }
    }
  };
  SEED.drawObject = function (x, o, t, still) {
    const X = o.x * 16, Y = o.y * 16;
    if (o.kind === "sign") {
      x.fillStyle = "#7A5E44"; x.fillRect(X + 7, Y + 8, 2, 7);
      x.fillStyle = "#C9AE86"; x.fillRect(X + 2, Y + 2, 12, 8); x.fillStyle = "#A68B64"; x.fillRect(X + 2, Y + 9, 12, 1);
      x.fillStyle = P.moss; x.fillRect(X + 4, Y + 4, 8, 1); x.fillRect(X + 4, Y + 6, 6, 1);
    } else if (o.kind === "mailbox") {
      x.fillStyle = "#7A5E44"; x.fillRect(X + 7, Y + 8, 2, 7);
      x.fillStyle = P.lav; x.fillRect(X + 3, Y + 3, 10, 6); x.fillStyle = P.lavD; x.fillRect(X + 3, Y + 8, 10, 1);
      x.fillStyle = P.peach; x.fillRect(X + 12, Y + 1, 1, 4); x.fillRect(X + 12, Y + 1, 3, 2);
    } else if (o.kind === "portal") {
      const w = still ? 0 : Math.sin(t * 1.2) * 1.2;
      x.fillStyle = "rgba(185,167,214,0.35)"; x.beginPath(); x.ellipse(X + 8, Y + 10, 9, 4, 0, 0, 7); x.fill();
      x.save(); x.translate(X + 8, Y + 2); x.rotate(w * 0.06);
      x.fillStyle = P.cream; x.fillRect(-3, 0, 6, 9); x.fillRect(-3, 7, 9, 5);
      x.fillStyle = P.lav; x.fillRect(-3, 0, 6, 2); x.fillRect(-3, 4, 6, 1);
      x.fillStyle = P.dusk; x.fillRect(-1, 8, 4, 3); x.restore();
    } else if (o.kind === "seed") {
      x.fillStyle = "#A68B64"; x.beginPath(); x.ellipse(X + 8, Y + 9, 7, 4, 0, 0, 7); x.fill();
      x.fillStyle = "#8D7458"; x.fillRect(X + 5, Y + 9, 2, 1); x.fillRect(X + 10, Y + 8, 2, 1);
      if (!still) { x.fillStyle = "rgba(251,227,160," + (0.25 + 0.2 * Math.sin(t * 1.4)) + ")"; x.beginPath(); x.arc(X + 8, Y + 8, 9, 0, 7); x.fill(); }
    }
  };
  SEED.drawGlint = function (x, tx, ty, t, bright, still) {
    const X = tx * 16 + 8, Y = ty * 16 + 9, a = still ? (bright ? 0.9 : 0.45) : (bright ? 0.6 : 0.25) + 0.3 * Math.max(0, Math.sin(t * 2.2));
    x.fillStyle = "rgba(255,250,225," + a + ")";
    x.fillRect(X - 1, Y - 4, 2, 8); x.fillRect(X - 4, Y - 1, 8, 2);
    if (bright) { x.fillStyle = "rgba(251,227,160,0.25)"; x.beginPath(); x.arc(X, Y, 7, 0, 7); x.fill(); }
  };
})();
