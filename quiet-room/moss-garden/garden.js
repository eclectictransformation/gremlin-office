/* The Moss Garden: a cozy top-down sandbox. No goals, no breath mechanic, no clock on screen.
   Garden space is a fixed grid (COLS x ROWS, long side first). On portrait screens the grid is drawn transposed,
   so the spring stays in the top-left corner and the same garden works on a phone, an iPad and a desktop.
   Water: a small, stable grid flow sim. Water lives ONLY in raked grooves (and dents), spreads about one tile a
   second from the spring, stops at stones, drains slowly from grooves that are cut off. Nothing can flood. */
(function () {
  "use strict";
  var Q = window.Quiet, GAME = "moss-garden", ART = "art/";
  var COLS = 40, ROWS = 22, N = COLS * ROWS, LT = 32;   // LT: offscreen layer pixels per tile
  var PAL = { sand: "#EADFC8", shade: "#D6C7A8", moss: "#6E8B4E", sage: "#A3B18A", stone: "#9A94A8", water: "#7FB7B0", peach: "#F2C48D", ink: "#3E4A3A" };
  var KINDS = {   // display size in design px (art is 2x), stones block water; weight slows pushing
    stone1: { art: "stone-1", w: 150, h: 150, r: 1.55, heavy: 1, stone: true },
    stone2: { art: "stone-2", w: 124, h: 124, r: 1.25, heavy: .6, stone: true },
    stone3: { art: "stone-3", w: 100, h: 100, r: 1.0, heavy: .3, stone: true },
    plank: { art: "bridge-plank", w: 192, h: 64 }, step: { art: "stepping-stone", w: 80, h: 80 },
    lantern: { art: "lantern", w: 80, h: 80, glow: "lantern-glow" }, moss: { art: "moss-clump", w: 96, h: 96 },
    fern: { art: "fern", w: 96, h: 96 }, statue: { art: "gremlin-statue", w: 96, h: 96 }, boat: { art: "leaf-boat", w: 64, h: 64, floats: true },
    shishi: { art: "shishi-odoshi", w: 120, h: 120, blocks: .75 }, spout: { art: "bamboo-spout", w: 88, h: 88, source: true }, barrel: { art: "rain-barrel", w: 96, h: 96, source: true }
  };
  var DEFAULT_STONES = [["stone1", 27.5, 7.5], ["stone2", 12.5, 14.5], ["stone3", 19.5, 4.5], ["stone2", 33.5, 15.5], ["stone3", 7.5, 7.5], ["stone1", 22.5, 16.5], ["stone3", 35.5, 4.5]];

  /* ---------- state ---------- */
  var S = { h: new Float32Array(N), t: new Uint8Array(N), d: new Uint8Array(N), moss: new Float32Array(N), fill: new Float32Array(N), objs: [], strokes: [], leg: new Uint8Array(N), met: 0, dug: new Uint8Array(N) };
  var srcMask = new Uint8Array(N), lab = new Int16Array(N), MAX_EXTRA_SOURCES = 2;   // the corner spring + up to two more (no count on screen)
  var BIN = { x: COLS - 1.55, y: ROWS - 1.45, r: 1.5 }, binOpen = 0, puffs = [], tumble = null;
  var dist = new Int16Array(N), blocked = new Uint8Array(N), head = 1, hist = [], uid = 1;
  var art = {}, sprites = {}, cv = document.getElementById("mg"), ctx = cv.getContext("2d");
  var L = {};   // layout
  var dirty = { groove: true, moss: true }, changed = false;
  function idx(x, y) { return y * COLS + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  function isSource(i) { return srcMask[i] > 0; }
  function inBin(x, y) { return Math.hypot(x - BIN.x, y - BIN.y) < BIN.r; }
  function channel(i) { return S.dug[i] > 0; }   // v2.1: only trowel-dug paths (and spring pools) carry water; rake lines are just lines

  function freshState() {
    S.h.fill(0); S.t.fill(0); S.d.fill(0); S.moss.fill(0); S.fill.fill(0); S.leg.fill(0); S.strokes = [{ k: 1, p: [2.1, 1.5, 2.7, 1.5, 3.3, 1.52, 3.9, 1.5, 4.6, 1.48] }];
    S.objs = DEFAULT_STONES.map(function (s) { return { id: uid++, k: s[0], x: s[1], y: s[2] }; });
    S.dug.fill(0); [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (p) { S.dug[idx(p[0], p[1])] = 2; });   // the little spring pool
    for (var x = 2; x < 5; x++) S.dug[idx(x, 1)] = 1;   // a short dug starter channel
    dirty.groove = dirty.moss = true;
  }
  function ensureSpring() { [[0, 0], [1, 0], [0, 1]].forEach(function (p) { S.dug[idx(p[0], p[1])] = 2; }); dirty.dug = true; }

  /* ---------- history: about 30 steps ---------- */
  function snap() { return { dug: S.dug.slice(), h: S.h.slice(), t: S.t.slice(), d: S.d.slice(), moss: S.moss.slice(), leg: S.leg.slice(), objs: JSON.parse(JSON.stringify(S.objs)), strokes: S.strokes.map(function (k) { return { k: k.k, p: k.p.slice() }; }) }; }
  function remember() { hist.push(snap()); if (hist.length > 30) hist.shift(); }
  function undo() {
    var s = hist.pop(); if (!s) { whisper("Nothing to undo just now."); return; }
    S.h = s.h; S.dug = s.dug || S.dug; dirty.dug = true; S.t = s.t; S.d = s.d; S.moss = s.moss; S.objs = s.objs; S.strokes = s.strokes; S.leg = s.leg; tumble = null; hand = null; drag = null; carry = null;
    dirty.groove = dirty.moss = true; touched(); whisper("Undone.");
  }

  /* ---------- saving (compact strings) ---------- */
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function enc() {
    var td = "", hh = "", mm = "";
    for (var i = 0; i < N; i++) { td += B64[S.t[i] * 16 + S.d[i]]; hh += B64[Math.round(Math.min(2, -S.h[i]) * 8)]; mm += B64[Math.round(Math.max(0, Math.min(1, S.moss[i])) * 63)]; }
    var lg = "", dg = ""; for (var j = 0; j < N; j++) { lg += S.leg[j] ? "1" : "0"; dg += S.dug[j]; }
    return { v: 2, cols: COLS, rows: ROWS, td: td, h: hh, m: mm, head: head, leg: lg, dug: dg, met: S.met ? 1 : 0,
      strokes: S.strokes.map(function (k) { return [k.k, k.p.map(function (v) { return Math.round(v * 20); })]; }),
      objs: S.objs.map(function (o) { var a = [o.k, +o.x.toFixed(2), +o.y.toFixed(2)]; if (o.r) a.push(o.r); return a; }) };
  }
  function dec(D) {
    if (!D || (D.v !== 1 && D.v !== 2) || D.cols !== COLS || D.rows !== ROWS || typeof D.td !== "string" || D.td.length !== N) return false;
    for (var i = 0; i < N; i++) { var a = B64.indexOf(D.td[i]); S.t[i] = Math.max(0, Math.min(2, a >> 4)); S.d[i] = a & 15; S.h[i] = -B64.indexOf(D.h[i]) / 8; S.moss[i] = B64.indexOf(D.m[i]) / 63; }
    S.objs = (D.objs || []).filter(function (o) { return KINDS[o[0]]; }).slice(0, 80).map(function (o) { return { id: uid++, k: o[0], x: clampX(+o[1] || 1), y: clampY(+o[2] || 1), r: (+o[3] || 0) & 7 }; });
    // v1 saves had no stroke list: keep their old painted tine stamps so nothing they raked disappears
    S.leg.fill(0); S.strokes = [];
    if (D.v === 1) { for (var a1 = 0; a1 < N; a1++) if (S.t[a1] === 1) S.leg[a1] = 1; }
    else {
      if (typeof D.leg === "string" && D.leg.length === N) for (var a2 = 0; a2 < N; a2++) S.leg[a2] = D.leg[a2] === "1" ? 1 : 0;
      (Array.isArray(D.strokes) ? D.strokes : []).forEach(function (k) { if (!Array.isArray(k) || (k[0] !== 1 && k[0] !== 3) || !Array.isArray(k[1])) return;
        var pts = k[1].slice(0, 4000).map(function (v) { return (+v || 0) / 20; }); if (pts.length >= 4) S.strokes.push({ k: k[0], p: pts.slice(0, pts.length - pts.length % 2) }); });
      S.met = D.met ? 1 : 0;
    }
    if (D.head >= 0 && D.head <= 5) setHead(D.head, true);
    // water paths: v2.1 saves carry them; older saves had raked channels carry water, so those become dug paths (nothing dries up)
    if (typeof D.dug === "string" && D.dug.length === N) { for (var a3 = 0; a3 < N; a3++) S.dug[a3] = Math.min(2, +D.dug[a3] || 0); }
    else { for (var a4 = 0; a4 < N; a4++) S.dug[a4] = S.h[a4] < -1.45 ? 2 : S.h[a4] < -.4 ? 1 : 0; }
    S.fill.fill(0); ensureSpring(); dirty.dug = true; dirty.groove = dirty.moss = true; return true;
  }
  var saveSoon = Q.debounce(function () { if (!changed) return; changed = false; Q.save(GAME, enc()); }, 4000);
  function touched() { changed = true; saveSoon(); }
  window.addEventListener("pagehide", function () { if (changed) { try { localStorage.setItem("gremlin-quiet-" + GAME + "-" + ((Q.session() || {}).name || "guest").toLowerCase(), JSON.stringify(enc())); } catch (e) {} } });

  /* ---------- art + soft procedural placeholders ---------- */
  var ART_NAMES = ["sand-texture", "moss-overlay", "water-texture", "garden-frame", "garden-frame-portrait", "rake-stamp-fine", "rake-stamp-swirl", "rake-stamp-smooth",
    "stone-1", "stone-2", "stone-3", "stepping-stone", "bridge-plank", "lantern", "lantern-glow", "moss-clump", "fern", "gremlin-statue", "leaf-boat",
    "icon-rake-fine", "icon-rake-swirl", "icon-rake-smooth", "icon-bridge-plank", "icon-stepping-stone", "icon-lantern", "icon-moss-clump", "icon-fern", "icon-gremlin-statue", "icon-leaf-boat", "icon-undo", "icon-fresh-garden"];   // shishi-odoshi, spout, rain barrel, compost bin and the wanderer are painted below in Moth's palette
  function mk(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function blob(g, cx, cy, rx, ry, col, seed) {   // a soft, slightly irregular painted blob
    var R = rnd(seed || 7); g.beginPath();
    for (var a = 0; a <= 24; a++) { var t = a / 24 * Math.PI * 2, k = 1 + (R() - .5) * .12; var x = cx + Math.cos(t) * rx * k, y = cy + Math.sin(t) * ry * k; a ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fillStyle = col; g.fill();
  }
  function placeholder(name, w, h) {
    var c = mk(w * 2, h * 2), g = c.getContext("2d"), W = w * 2, H = h * 2;
    g.save(); g.filter = "blur(3px)"; blob(g, W / 2 + 4, H / 2 + 8, W * .4, H * .36, "rgba(62,74,58,.22)", 3); g.restore();
    function stone(col, s) {
      var gr = g.createRadialGradient(W * .4, H * .38, 4, W / 2, H / 2, W * .45); gr.addColorStop(0, "#c9c4d4"); gr.addColorStop(.6, col); gr.addColorStop(1, "#77718a");
      blob(g, W / 2, H / 2, W * .42 * s, H * .38 * s, gr, 11);
    }
    if (/^stone/.test(name)) stone(PAL.stone, 1);
    else if (name === "stepping-stone") { stone("#a9a39a", .95); }
    else if (name === "bridge-plank") { g.fillStyle = "#b08a5e"; g.beginPath(); g.roundRect(W * .04, H * .2, W * .92, H * .6, 18); g.fill(); g.strokeStyle = "rgba(90,64,40,.45)"; g.lineWidth = 4; for (var i = 1; i < 6; i++) { g.beginPath(); g.moveTo(W * .04 + i * W * .153, H * .22); g.lineTo(W * .04 + i * W * .153, H * .78); g.stroke(); } }
    else if (name === "lantern") { stone("#a6a1ad", .9); var gl = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W * .22); gl.addColorStop(0, "#fff3d6"); gl.addColorStop(1, PAL.peach); blob(g, W / 2, H / 2, W * .18, H * .18, gl, 5); }
    else if (name === "lantern-glow") { var gg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); gg.addColorStop(0, "rgba(242,196,141,.75)"); gg.addColorStop(1, "rgba(242,196,141,0)"); g.clearRect(0, 0, W, H); g.fillStyle = gg; g.fillRect(0, 0, W, H); }
    else if (name === "moss-clump") { for (var m = 0; m < 9; m++) { var a2 = m / 9 * 6.28; blob(g, W / 2 + Math.cos(a2) * W * .18, H / 2 + Math.sin(a2) * H * .16, W * .2, H * .18, m % 2 ? PAL.moss : "#7d9a5a", 20 + m); } blob(g, W / 2, H / 2, W * .22, H * .2, "#86a364", 31); }
    else if (name === "fern") { g.strokeStyle = "#5f7d43"; g.lineCap = "round"; for (var f = 0; f < 7; f++) { var an = f / 7 * 6.28 + .3; g.lineWidth = 7; g.beginPath(); g.moveTo(W / 2, H / 2); var ex = W / 2 + Math.cos(an) * W * .42, ey = H / 2 + Math.sin(an) * H * .42; g.quadraticCurveTo(W / 2 + Math.cos(an + .3) * W * .3, H / 2 + Math.sin(an + .3) * H * .3, ex, ey); g.stroke();
        for (var l = 1; l < 6; l++) { var px = W / 2 + Math.cos(an) * W * .07 * l, py = H / 2 + Math.sin(an) * H * .07 * l; blob(g, px + Math.cos(an + 1.4) * 10, py + Math.sin(an + 1.4) * 10, 9, 5, "#7FA65A", l + f); blob(g, px + Math.cos(an - 1.4) * 10, py + Math.sin(an - 1.4) * 10, 9, 5, "#7FA65A", l + f + 9); } } }
    else if (name === "gremlin-statue") { stone("#a7a2b2", .8); blob(g, W * .36, H * .3, W * .08, H * .1, "#8f8a9c", 4); blob(g, W * .64, H * .3, W * .08, H * .1, "#8f8a9c", 6); g.fillStyle = PAL.ink; g.beginPath(); g.arc(W * .42, H * .48, 5, 0, 7); g.arc(W * .58, H * .48, 5, 0, 7); g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H * .55, 10, .3, 2.8); g.stroke(); }
    else if (name === "leaf-boat") { var lg = g.createLinearGradient(0, 0, W, H); lg.addColorStop(0, "#9bbf6a"); lg.addColorStop(1, "#5f8a45"); g.fillStyle = lg; g.beginPath(); g.moveTo(W * .1, H * .55); g.quadraticCurveTo(W * .45, H * .05, W * .92, H * .42); g.quadraticCurveTo(W * .5, H * .95, W * .1, H * .55); g.fill(); g.strokeStyle = "#4b6e36"; g.lineWidth = 3; g.beginPath(); g.moveTo(W * .14, H * .55); g.lineTo(W * .88, H * .44); g.stroke(); }
    else if (name === "bamboo-spout") { stone("#a39eab", .78); var bx = W * .2, by = H * .42;
      g.save(); g.translate(W / 2, H / 2); g.rotate(-.5); bamboo(g, -W * .36, -H * .07, W * .62, H * .14); g.restore();
      var wg = g.createRadialGradient(W * .74, H * .3, 2, W * .74, H * .3, W * .14); wg.addColorStop(0, "#d9f0ec"); wg.addColorStop(1, "rgba(127,183,176,.2)"); blob(g, W * .74, H * .3, W * .1, H * .08, wg, 9); }
    else if (name === "rain-barrel") { var rg = g.createRadialGradient(W * .42, H * .4, 4, W / 2, H / 2, W * .44); rg.addColorStop(0, "#c49a68"); rg.addColorStop(1, "#8a6440"); blob(g, W / 2, H / 2, W * .4, H * .4, rg, 13);
      g.strokeStyle = "rgba(62,74,58,.55)"; g.lineWidth = 5; g.beginPath(); g.arc(W / 2, H / 2, W * .36, 0, 7); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(W / 2, H / 2, W * .3, 0, 7); g.stroke();
      var wb = g.createRadialGradient(W * .44, H * .42, 2, W / 2, H / 2, W * .28); wb.addColorStop(0, "#bfe3dd"); wb.addColorStop(1, PAL.water); blob(g, W / 2, H / 2, W * .27, H * .27, wb, 21);
      g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 3; g.beginPath(); g.arc(W * .46, H * .46, W * .12, 3.6, 4.8); g.stroke(); }
    else if (name === "shishi-odoshi") { stone("#a39eab", .5); g.save(); g.translate(W / 2, H / 2); bamboo(g, -W * .4, -H * .08, W * .8, H * .16); g.restore(); }
    return c;
  }
  function bamboo(g, x, y, w, h) {   // a painted green bamboo tube with nodes and a soft highlight
    var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, "#a9c27a"); gr.addColorStop(.45, "#7f9f55"); gr.addColorStop(1, "#56733c");
    g.fillStyle = gr; g.beginPath(); g.roundRect(x, y, w, h, h * .45); g.fill();
    g.strokeStyle = "rgba(62,74,58,.55)"; g.lineWidth = Math.max(1.5, h * .12); for (var n = 1; n < 3; n++) { var nx = x + w * n / 3; g.beginPath(); g.moveTo(nx, y + h * .1); g.lineTo(nx, y + h * .9); g.stroke(); }
    g.strokeStyle = "rgba(255,250,230,.45)"; g.lineWidth = Math.max(1, h * .1); g.beginPath(); g.moveTo(x + h * .4, y + h * .28); g.lineTo(x + w - h * .4, y + h * .28); g.stroke();
    g.fillStyle = "#4a6233"; g.beginPath(); g.ellipse(x + w - h * .1, y + h / 2, h * .18, h * .42, 0, 0, 7); g.fill();
  }
  function sprite(kind) { var K = KINDS[kind]; return sprites[K.art] || (sprites[K.art] = art[K.art] || placeholder(K.art, K.w, K.h)); }
  function glowSprite() { return sprites.glow || (sprites.glow = art["lantern-glow"] || placeholder("lantern-glow", 192, 192)); }
  function sandTex() {
    if (art["sand-texture"]) return art["sand-texture"];
    var c = mk(512, 512), g = c.getContext("2d"), R = rnd(99); g.fillStyle = PAL.sand; g.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 9000; i++) { g.fillStyle = R() < .5 ? "rgba(214,199,168," + (R() * .5) + ")" : "rgba(255,250,238," + (R() * .5) + ")"; g.fillRect(R() * 512, R() * 512, 1 + R() * 2, 1 + R() * 2); }
    return c;
  }
  function waterTex() {
    if (art["water-texture"]) return art["water-texture"];
    var c = mk(256, 256), g = c.getContext("2d"); g.fillStyle = PAL.water; g.fillRect(0, 0, 256, 256); var R = rnd(5);
    for (var i = 0; i < 60; i++) { g.strokeStyle = "rgba(255,255,255," + (.08 + R() * .15) + ")"; g.lineWidth = 2; g.beginPath(); var x = R() * 256, y = R() * 256; g.moveTo(x, y); g.quadraticCurveTo(x + 20, y - 6, x + 40, y); g.stroke(); }
    return c;
  }
  function mossTex() {
    if (art["moss-overlay"]) return art["moss-overlay"];
    var c = mk(256, 256), g = c.getContext("2d"), R = rnd(3); g.fillStyle = PAL.moss; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 500; i++) { g.fillStyle = R() < .5 ? "rgba(163,177,138,.5)" : "rgba(80,104,58,.5)"; g.beginPath(); g.arc(R() * 256, R() * 256, 2 + R() * 4, 0, 7); g.fill(); }
    return c;
  }

  /* ---------- layout: landscape frame 1920x1080 or portrait 1080x1920 ---------- */
  function layout() {
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px";
    var man = (art._manifest || {}), port = H > W * 1.05;
    var DW = port ? 1080 : 1920, DH = port ? 1920 : 1080;
    var rect = port ? ((man.rects || {})["garden-frame-portrait"] || [90, 160, 900, 1500]) : ((man.rects || {})["garden-frame"] || [160, 110, 1600, 860]);
    if (!Array.isArray(rect)) rect = [rect.x, rect.y, rect.w, rect.h];
    var tray = document.getElementById("mg-tray").getBoundingClientRect().height + 12; document.getElementById("mg-whisper").style.bottom = (tray + 8) + "px";
    var s = Math.min(W / DW, (H - (port ? tray : Math.max(0, tray - 90))) / DH);
    var tr = port, gw = tr ? ROWS : COLS, gh = tr ? COLS : ROWS, T = Math.min(rect[2] / gw, rect[3] / gh);
    L = { dpr: dpr, W: W, H: H, DW: DW, DH: DH, s: s, ox: (W - DW * s) / 2, oy: port ? Math.max(0, (H - tray - DH * s) / 2) : (H - DH * s) / 2, tr: tr, T: T,
      R: rect, gx0: rect[0] + (rect[2] - gw * T) / 2, gy0: rect[1] + (rect[3] - gh * T) / 2 };
  }
  function g2d(x, y) { return L.tr ? [L.gx0 + y * L.T, L.gy0 + x * L.T] : [L.gx0 + x * L.T, L.gy0 + y * L.T]; }
  function scr2g(px, py) {   // map from the canvas's real on-screen box, so CSS scaling, DPR or a shifted viewport can't move a drop
    var r = cv.getBoundingClientRect(); if (r.width && r.height) { px = (px - r.left) * L.W / r.width; py = (py - r.top) * L.H / r.height; }
    var dx = (px - L.ox) / L.s - L.gx0, dy = (py - L.oy) / L.s - L.gy0; return L.tr ? [dy / L.T, dx / L.T] : [dx / L.T, dy / L.T]; }
  function g2scr(x, y) { var d = g2d(x, y); return [L.ox + d[0] * L.s, L.oy + d[1] * L.s]; }
  function clampX(x) { return Math.max(.6, Math.min(COLS - .6, x)); }
  function clampY(y) { return Math.max(.6, Math.min(ROWS - .6, y)); }

  /* ---------- the rake ---------- */
  function rakeCell(x, y, hd, ang) {
    if (!inb(x, y)) return; var i = idx(x, y); if (blocked[i]) return;
    if (hd === 4) { if (!S.dug[i]) { S.dug[i] = 1; dirty.dug = true; } return; }   // trowel: dig
    if (hd === 5) { if (S.dug[i] && !isSource(i)) { S.dug[i] = 0; dirty.dug = true; } return; }   // trowel: fill back in
    if (hd === 0) { S.h[i] = Math.min(0, S.h[i] * .2 + 0); if (S.h[i] > -.3) { S.h[i] = 0; S.t[i] = 0; S.leg[i] = 0; } return; }
    if (inBin(x + .5, y + .5)) return;
    if (hd === 1 || hd === 3) { if (S.t[i] !== 2) { S.t[i] = 1; S.d[i] = ang; S.leg[i] = 0; } }
    if (hd === 2) { S.t[i] = 2; S.d[i] = ang; }
  }
  function rakeAt(gx, gy, hd, ang) {
    var cx = Math.floor(gx), cy = Math.floor(gy);
    if (hd === 4) rakeCell(cx, cy, 4, ang);
    else if (hd === 5) { for (var fy = cy - 1; fy <= cy + 1; fy++) for (var fx = cx - 1; fx <= cx + 1; fx++) { var hx = fx + .5 - gx, hy = fy + .5 - gy; if (hx * hx + hy * hy <= .7) rakeCell(fx, fy, 5, ang); } }
    else if (hd === 1) rakeCell(cx, cy, 1, ang);
    else if (hd === 3) { for (var wy = cy - 1; wy <= cy + 1; wy++) for (var wx = cx - 1; wx <= cx + 1; wx++) { var ex = wx + .5 - gx, ey = wy + .5 - gy; if (ex * ex + ey * ey <= .62) rakeCell(wx, wy, 1, ang); } }
    else {
      if (hd === 0) eraseStrokes(gx, gy, 1.05); var r = hd === 2 ? 1 : 1.2; for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++) { var dx = x + .5 - gx, dy = y + .5 - gy; if (dx * dx + dy * dy <= r * r + .1) rakeCell(x, y, hd, ang); } }

    dirty.groove = true;
  }
  function rakeLine(a, b, hd) {
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (!rakeLine.started) curStroke = null; if (len < .01 && rakeLine.started) return;
    var ang = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % Math.PI) / Math.PI * 16) % 16;   // 16 directions over 180 degrees
    var n = Math.max(1, Math.ceil(len / .25));
    for (var k = 0; k <= n; k++) rakeAt(a[0] + dx * k / n, a[1] + dy * k / n, hd, ang);
    if (hd === 1 || hd === 3) { if (!curStroke || curStroke.k !== hd) strokeTo(a, hd); var m = Math.max(1, Math.ceil(len / .2)); for (var q = 1; q <= m; q++) strokeTo([a[0] + dx * q / m, a[1] + dy * q / m], hd); }
    rakeLine.started = true; touched();
  }
  /* real tine lines: every stroke is a list of points (about one every 6 px); tines are drawn as offset curves */
  var curStroke = null, MAX_PTS = 12000;
  function strokeTo(p, hd) {
    var x = Math.max(0, Math.min(COLS, p[0])), y = Math.max(0, Math.min(ROWS, p[1]));
    if (!curStroke || curStroke.k !== hd) { curStroke = { k: hd, p: [x, y] }; S.strokes.push(curStroke); trimStrokes(); return; }
    var q = curStroke.p, lx = q[q.length - 2], ly = q[q.length - 1]; if (Math.hypot(x - lx, y - ly) < .16) return;
    q.push(x, y); trimStrokes();
  }
  function trimStrokes() { var tot = 0; for (var i = S.strokes.length - 1; i >= 0; i--) { tot += S.strokes[i].p.length / 2; if (tot > MAX_PTS && S.strokes[i] !== curStroke) { S.strokes.splice(0, i + 1); break; } } }
  function eraseStrokes(gx, gy, r) {
    var out = [], hitAny = false;
    S.strokes.forEach(function (k) { var seg = [];
      for (var i = 0; i < k.p.length; i += 2) { var x = k.p[i], y = k.p[i + 1], w = k.k === 3 ? .45 : .12;
        if (Math.hypot(x - gx, y - gy) < r + w) { hitAny = true; if (seg.length >= 4) out.push({ k: k.k, p: seg }); seg = []; } else seg.push(x, y); }
      if (seg.length >= 4) out.push(seg.length === k.p.length ? k : { k: k.k, p: seg }); });
    if (hitAny) { S.strokes = out; curStroke = null; }
    for (var y = Math.floor(gy - r); y <= gy + r; y++) for (var x = Math.floor(gx - r); x <= gx + r; x++) if (inb(x, y) && Math.hypot(x + .5 - gx, y + .5 - gy) < r) S.leg[idx(x, y)] = 0;
  }

  /* ---------- water: a small, stable grid sim ---------- */
  var N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]], flowing = 0;
  function computeBlocked() {
    blocked.fill(0);
    S.objs.forEach(function (o) { var K = KINDS[o.k]; if (!K.stone && !K.blocks) return; var r = K.stone ? K.r * .85 : K.blocks;
      for (var y = Math.floor(o.y - r - 1); y <= o.y + r + 1; y++) for (var x = Math.floor(o.x - r - 1); x <= o.x + r + 1; x++) { if (!inb(x, y)) continue; var dx = x + .5 - o.x, dy = y + .5 - o.y; if (dx * dx + dy * dy < r * r) blocked[idx(x, y)] = 1; } });
  }
  function bfs() {
    dist.fill(-1); lab.fill(0); var q = [], h = 0;
    for (var s0 = 0; s0 < N; s0++) if (srcMask[s0] && channel(s0) && !blocked[s0]) { dist[s0] = 0; lab[s0] = srcMask[s0]; q.push(s0); }
    while (h < q.length) { var i = q[h++], x = i % COLS, y = (i / COLS) | 0;
      for (var k = 0; k < 8; k++) { var nx = x + N8[k][0], ny = y + N8[k][1]; if (!inb(nx, ny)) continue; var j = idx(nx, ny); if (dist[j] >= 0 || !channel(j) || blocked[j]) continue;
        if (k >= 4 && !channel(idx(x + N8[k][0], y)) && !channel(idx(x, y + N8[k][1]))) { /* diagonal step: allowed, grooves drawn at an angle are diagonal */ }
        dist[j] = dist[i] + 1; lab[j] = lab[i]; q.push(j); } }
  }
  function cellOf(x, y) { var cx = Math.floor(x), cy = Math.floor(y); return inb(cx, cy) ? idx(cx, cy) : -1; }
  function dig(i) { if (i < 0 || blocked[i]) return; if (S.dug[i] !== 2) { S.dug[i] = 2; dirty.dug = true; } }   // a little pool at a source or basin
  function shDir(o) { var a = (o.r || 0) * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; }
  function shOut(o) { var d = shDir(o); return [o.x + d[0] * 1.7, o.y + d[1] * 1.7]; }
  function computeSources() {
    srcMask.fill(0); [0, 1, COLS].forEach(function (i) { srcMask[i] = 1; });
    S.objs.forEach(function (o) {
      var K = KINDS[o.k];
      if (K.source && !(drag && drag.o === o) && o !== carry) { var c = cellOf(o.x, o.y); if (c < 0 || blocked[c]) return; dig(c, 1.6); srcMask[c] = 2 + (o.id % 200);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var n = cellOf(o.x + d[0], o.y + d[1]); if (n >= 0 && !S.dug[n] && !blocked[n]) { S.dug[n] = 1; dirty.dug = true; } }); }   // a little pool so it can join a groove
      if (o.k === "shishi" && !(drag && drag.o === o) && o !== carry) { var op = shOut(o), oc = cellOf(op[0], op[1]); if (oc >= 0 && !blocked[oc]) { dig(oc); if (o.out > 0) srcMask[oc] = o.lab || 300; } }
    });
  }
  /* shishi-odoshi: fills ~10 s (8-12), tips 0.6 s, pours, rocks back 1.2 s; its pour feeds the channel it points at */
  function shishiSim(o, dt) {
    if (!o.st) { o.st = "fill"; o.f = 0; o.ph = 0; o.dur = 8 + Math.random() * 4; o.out = 0; }
    if (o.out > 0) o.out = Math.max(0, o.out - dt);
    var fed = 0, flab = 0, op = shOut(o);
    if (!(drag && drag.o === o)) for (var y = Math.floor(o.y - 2); y <= o.y + 2; y++) for (var x = Math.floor(o.x - 2); x <= o.x + 2; x++) {
      if (!inb(x, y)) continue; var i = idx(x, y), d = Math.hypot(x + .5 - o.x, y + .5 - o.y);
      if (d > 1.9 || blocked[i] || Math.hypot(x + .5 - op[0], y + .5 - op[1]) < 1.3) continue;
      if (S.fill[i] > .9 && dist[i] >= 0 && lab[i] !== o.lab) { fed = 1; flab = lab[i]; }
    }
    o.fed = fed;
    if (o.st === "fill") { if (fed) { o.f += dt / o.dur; o.inlab = flab; } if (o.f >= 1) { o.f = 1; o.st = "tip"; o.ph = 0; } }
    else if (o.st === "tip") { o.ph += dt; if (o.ph >= .6) { o.st = "pour"; o.ph = 0; tok(); } }
    else if (o.st === "pour") { o.ph += dt; o.f = Math.max(0, 1 - o.ph / 1.0); o.lab = o.inlab || 300; o.out = 14; if (o.ph >= 1.0) { o.st = "reset"; o.ph = 0; } }
    else if (o.st === "reset") { o.ph += dt; if (o.ph >= 1.2) { o.st = "fill"; o.ph = 0; o.f = 0; o.dur = 8 + Math.random() * 4; } }
  }
  function sim(dt) {
    computeBlocked(); computeSources(); bfs(); flowing = 0;
    S.objs.forEach(function (o) { if (o.k === "shishi") shishiSim(o, dt); });
    var nf = S.fill.slice();
    for (var i = 0; i < N; i++) {
      var ch = channel(i) && !blocked[i];
      if (!ch) { nf[i] = Math.max(0, S.fill[i] - dt * .6); continue; }
      if (isSource(i)) { nf[i] = 1; continue; }
      if (dist[i] < 0) { nf[i] = Math.max(0, S.fill[i] - dt * .25); continue; }   // cut off: it drains away slowly
      if (S.fill[i] >= 1) continue;
      var x = i % COLS, y = (i / COLS) | 0, fed = false;
      for (var k = 0; k < 8 && !fed; k++) { var nx = x + N8[k][0], ny = y + N8[k][1]; if (inb(nx, ny)) { var j = idx(nx, ny); if (S.fill[j] >= .999 && dist[j] >= 0 && dist[j] < dist[i] + 1) fed = true; } }
      if (fed) { var deep = S.dug[i] === 2 ? .6 : 0; nf[i] = Math.min(1, S.fill[i] + dt / (1 + deep * 1.2)); flowing++; }   // ~1 tile a second; dips take a little longer (they pool)
    }
    S.fill = nf;
    // two streams meeting: one soft chime, the first time only
    if (!S.met) for (var a = 0; a < N && !S.met; a++) { if (S.fill[a] < .95 || !lab[a]) continue; var ax0 = a % COLS, ay0 = (a / COLS) | 0;
      for (var b = 0; b < 4; b++) { var bx = ax0 + N8[b][0], by = ay0 + N8[b][1]; if (!inb(bx, by)) continue; var bj = idx(bx, by);
        if (S.fill[bj] > .95 && lab[bj] && lab[bj] !== lab[a]) { S.met = 1; touched(); whisper("The streams found each other."); if (Q.sound.on) Q.sound.tone(784, .035, 2.5); break; } } }
    // moss greens along wet edges over a minute or two
    var mossGrew = false;
    for (var m = 0; m < N; m++) {
      if (channel(m) && S.fill[m] > .5) continue;
      var mx = m % COLS, my = (m / COLS) | 0, wet = 0;
      for (var q = 0; q < 8; q++) { var ax = mx + N8[q][0], ay = my + N8[q][1]; if (inb(ax, ay)) wet = Math.max(wet, S.fill[idx(ax, ay)]); }
      if (wet > .5 && S.moss[m] < 1) { S.moss[m] = Math.min(1, S.moss[m] + dt * wet / 80); mossGrew = true; }
    }
    if (mossGrew) { dirty.moss = true; mossTick += dt; if (mossTick > 20) { mossTick = 0; touched(); } }
    // leaf boats drift downstream, gently
    S.objs.forEach(function (o) {
      if (o.k !== "boat" || o === (drag && drag.o)) return;
      var cx = Math.floor(o.x), cy = Math.floor(o.y); if (!inb(cx, cy)) return; var i = idx(cx, cy);
      if (S.fill[i] < .6) { o.vx = 0; o.vy = 0; return; }
      var best = null, bd = dist[i];
      for (var k = 0; k < 8; k++) { var nx = cx + N8[k][0], ny = cy + N8[k][1]; if (!inb(nx, ny)) continue; var j = idx(nx, ny); if (S.fill[j] > .8 && dist[j] > bd) { bd = dist[j]; best = [nx + .5, ny + .5]; } }
      var tx = best ? best[0] : cx + .5, ty = best ? best[1] : cy + .5, dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy) || 1, sp = best ? .5 : .15;
      o.vx = dx / d * Math.min(sp, d / dt * .5); o.vy = dy / d * Math.min(sp, d / dt * .5); o.float = true;
    });
  }
  var mossTick = 0;

  /* ---------- layers (garden space) ---------- */
  var grooveC = mk(COLS * LT, ROWS * LT), mossC = mk(COLS * LT, ROWS * LT), waterC = mk(COLS * LT / 2, ROWS * LT / 2), waterM = mk(COLS * LT / 2, ROWS * LT / 2), mossMask = mk(COLS * LT, ROWS * LT);
  function drawGrooves() {
    var g = grooveC.getContext("2d"); g.clearRect(0, 0, grooveC.width, grooveC.height); g.lineCap = "round"; g.lineJoin = "round";
    function each(fn) { for (var i = 0; i < N; i++) if (S.t[i] || S.h[i] < -.2) fn(i, i % COLS, (i / COLS) | 0); }
    // soft trench shading: connect neighbouring groove cells
    [["rgba(150,128,92,.30)", 1.0, 0, 2], ["rgba(178,158,120,.45)", .72, 0, 1], ["rgba(255,250,236,.55)", .16, -.22, 1]].forEach(function (pass) {
      g.strokeStyle = pass[0]; g.fillStyle = pass[0];
      each(function (i, x, y) { if (!S.t[i] || (S.t[i] === 1 && !S.leg[i])) return; /* new rake strokes carry their own shading */ var w = (S.t[i] === 2 ? 1.15 : .62) * pass[1] * LT, cx = (x + .5) * LT, cy = (y + .5 + pass[2] * .3) * LT;
        g.lineWidth = w; g.beginPath(); g.arc(cx, cy, w / 2, 0, 7); g.fill();
        for (var k = 0; k < 8; k += (k < 4 ? 1 : 1)) { if (k === 1 || k === 3 || k === 5 || k === 7) continue; var nx = x + N8[k][0], ny = y + N8[k][1]; if (!inb(nx, ny) || !S.t[idx(nx, ny)]) continue;
          g.beginPath(); g.moveTo(cx, cy); g.lineTo((nx + .5) * LT, (ny + .5 + pass[2] * .3) * LT); g.stroke(); }
        if (pass[3] === 2) { var nx2 = x - 1, ny2 = y + 1; if (inb(nx2, ny2) && S.t[idx(nx2, ny2)]) { g.beginPath(); g.moveTo(cx, cy); g.lineTo((nx2 + .5) * LT, (ny2 + .5) * LT); g.stroke(); } }
      });
    });
    // tine marks: Moth's stamps if we have them, else painted lines
    each(function (i, x, y) {
      var t = S.t[i]; if (!t) { if (S.h[i] < -.2) { var dg = g.createRadialGradient((x + .5) * LT, (y + .5) * LT, 1, (x + .5) * LT, (y + .5) * LT, LT * .9); dg.addColorStop(0, "rgba(140,118,84,.35)"); dg.addColorStop(1, "rgba(140,118,84,0)"); g.fillStyle = dg; g.fillRect(x * LT - LT, y * LT - LT, LT * 3, LT * 3); } return; }
      var a = S.d[i] / 16 * Math.PI, cx = (x + .5) * LT, cy = (y + .5) * LT; g.save(); g.translate(cx, cy); g.rotate(a);
      if (t === 1) {
        if (!S.leg[i]) { g.restore(); return; }   // new raking draws real tine lines (below); old saves keep their stamps
        var st = art["rake-stamp-fine"];
        if (st) { g.globalAlpha = .75; g.drawImage(st, -LT * .62, -LT * .38, LT * 1.24, LT * .76); }
        else { g.strokeStyle = "rgba(160,138,100,.55)"; g.lineWidth = 1.6; for (var k2 = -1; k2 <= 1; k2++) { g.beginPath(); g.moveTo(-LT * .62, k2 * LT * .16); g.lineTo(LT * .62, k2 * LT * .16); g.stroke(); } }
      } else if ((x + y) % 2 === 0) {
        var sw = art["rake-stamp-swirl"];
        if (sw) { g.globalAlpha = .7; g.drawImage(sw, -LT * 1.05, -LT * 1.05, LT * 2.1, LT * 2.1); }
        else { g.strokeStyle = "rgba(160,138,100,.5)"; g.lineWidth = 1.6; for (var r = 4; r < LT; r += 6) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } }
      }
      g.restore();
    });
    drawStrokes(g);
    dirty.groove = false;
  }
  // tine geometry: fine rake 3 tines close together, wide rake 7 tines further apart (layer px; 32 px = one tile)
  var TINES = { 1: { n: 3, sp: 5, w: 2.4 }, 3: { n: 7, sp: 7.5, w: 3.2 } };
  function drawStrokes(g) {
    g.lineCap = "round"; g.lineJoin = "round";
    S.strokes.forEach(function (k) {
      var P = k.p, n = P.length / 2; if (n < 2) return; var T = TINES[k.k] || TINES[1], xs = [], ys = [];
      for (var i = 0; i < n; i++) { xs.push(P[i * 2] * LT); ys.push(P[i * 2 + 1] * LT); }
      // one Chaikin pass: curves come out as smooth as straights
      if (n > 2) { var cx = [xs[0]], cy = [ys[0]]; for (var c = 0; c < n - 1; c++) { cx.push(xs[c] * .75 + xs[c + 1] * .25, xs[c] * .25 + xs[c + 1] * .75); cy.push(ys[c] * .75 + ys[c + 1] * .25, ys[c] * .25 + ys[c + 1] * .75); } cx.push(xs[n - 1]); cy.push(ys[n - 1]); xs = cx; ys = cy; n = xs.length; }
      var nx = [], ny = [];
      for (var j = 0; j < n; j++) { var a = Math.max(0, j - 1), b = Math.min(n - 1, j + 1), dx = xs[b] - xs[a], dy = ys[b] - ys[a], l = Math.hypot(dx, dy) || 1; nx.push(-dy / l); ny.push(dx / l); }
      // light from the upper left: the upper-left wall of each groove is in shadow, the lower-right lip catches light
      [["rgba(255,251,240,.75)", T.w * .8, .9, .9], ["rgba(120,98,66,.42)", T.w, -.7, -.7], ["rgba(176,152,112,.55)", T.w * .6, 0, 0]].forEach(function (pass) {
        g.strokeStyle = pass[0]; g.lineWidth = pass[1];
        for (var t = 0; t < T.n; t++) { var off = (t - (T.n - 1) / 2) * T.sp; g.beginPath();
          for (var m = 0; m < n; m++) { var px = xs[m] + nx[m] * off + pass[2], py = ys[m] + ny[m] * off + pass[3]; m ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.stroke(); }
      });
    });
  }
  /* ---------- trowel paths: a damp, slightly darker dug line, smoothed like the water ---------- */
  var dugC = mk(COLS * LT, ROWS * LT), dugM = mk(COLS * LT, ROWS * LT), dugT = mk(COLS * LT, ROWS * LT), dpx = new Float32Array(N), dpy = new Float32Array(N);
  dirty.dug = true;
  function drawDug() {
    var m = dugM.getContext("2d"); m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, dugM.width, dugM.height); m.fillStyle = m.strokeStyle = "#000"; m.lineCap = "round";
    for (var i = 0; i < N; i++) { if (!S.dug[i]) continue; var x = i % COLS, y = (i / COLS) | 0, ax = (x + .5) * 2, ay = (y + .5) * 2, n = 2;
      for (var k = 0; k < 8; k++) { var tx = x + N8[k][0], ty = y + N8[k][1]; if (inb(tx, ty) && S.dug[idx(tx, ty)]) { ax += tx + .5; ay += ty + .5; n++; } }
      dpx[i] = ax / n * LT; dpy[i] = ay / n * LT; }
    for (var j = 0; j < N; j++) { if (!S.dug[j]) continue; var jx = j % COLS, jy = (j / COLS) | 0, r = LT * (S.dug[j] === 2 ? .55 : .34);
      m.beginPath(); m.arc(dpx[j], dpy[j], r, 0, 7); m.fill(); m.lineWidth = LT * .62;
      for (var q = 0; q < 8; q++) { var nx = jx + N8[q][0], ny = jy + N8[q][1]; if (!inb(nx, ny)) continue; var o = idx(nx, ny); if (!S.dug[o] || o < j) continue;
        if (q >= 4 && S.dug[idx(nx, jy)] && S.dug[idx(jx, ny)]) continue;
        m.beginPath(); m.moveTo(dpx[j], dpy[j]); m.lineTo(dpx[o], dpy[o]); m.stroke(); } }
    var g = dugC.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, dugC.width, dugC.height);
    function tint(col, ox, oy, blur) { var t = dugT.getContext("2d"); t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, dugT.width, dugT.height); t.filter = "blur(" + blur + "px)"; t.drawImage(dugM, 0, 0); t.filter = "none";
      t.globalCompositeOperation = "source-in"; t.fillStyle = col; t.fillRect(0, 0, dugT.width, dugT.height); t.globalCompositeOperation = "source-over"; g.drawImage(dugT, ox, oy); }
    tint("rgba(255,248,232,.7)", 2.5, 3, 2);      // the lit lower-right lip (light from the upper left)
    tint("rgba(112,92,62,.55)", -2, -2.5, 2);     // the shaded upper-left wall
    tint("rgba(188,168,132,.95)", 0, 0, 1.5);     // damp, darker sand in the bottom of the path
    if (!dugTex) { dugTex = mk(64, 64); var dt = dugTex.getContext("2d"), R = rnd(71); for (var s2 = 0; s2 < 260; s2++) { dt.fillStyle = R() < .5 ? "rgba(120,100,70,.18)" : "rgba(255,250,236,.16)"; dt.fillRect(R() * 64, R() * 64, 1 + R() * 2, 1 + R() * 2); } }
    g.globalCompositeOperation = "source-atop"; g.fillStyle = g.createPattern(dugTex, "repeat"); g.fillRect(0, 0, dugC.width, dugC.height); g.globalCompositeOperation = "source-over";
    dirty.dug = false;
  }
  var dugTex = null;
  var mossPat = null;
  function drawMoss() {
    var m = mossMask.getContext("2d"); m.clearRect(0, 0, mossMask.width, mossMask.height);
    for (var i = 0; i < N; i++) { var v = S.moss[i]; if (v < .04) continue; var x = (i % COLS + .5) * LT, y = (((i / COLS) | 0) + .5) * LT, r = LT * (.45 + v * .55);
      var gr = m.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(0,0,0," + Math.min(.95, v * 1.1) + ")"); gr.addColorStop(1, "rgba(0,0,0,0)"); m.fillStyle = gr; m.fillRect(x - r, y - r, r * 2, r * 2); }
    var g = mossC.getContext("2d"); g.clearRect(0, 0, mossC.width, mossC.height); g.globalCompositeOperation = "source-over"; g.filter = "blur(6px)"; g.drawImage(mossMask, 0, 0); g.filter = "none";   // one blur for the whole mask
    g.globalCompositeOperation = "source-in"; if (!mossPat) mossPat = g.createPattern(mossTex(), "repeat"); g.fillStyle = mossPat; g.fillRect(0, 0, mossC.width, mossC.height); g.globalCompositeOperation = "source-over";
    dirty.moss = false;
  }
  var waterPat = null, wpx = new Float32Array(N), wpy = new Float32Array(N);
  function drawWater(time) {
    var wc = waterC.getContext("2d"), g = waterM.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, waterM.width, waterM.height); g.setTransform(.5, 0, 0, .5, 0, 0);   // half resolution: it is soft anyway, and four times cheaper g.globalCompositeOperation = "source-over";
    g.lineCap = "round"; g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.filter = "none";
    // smooth the cell centres (each wet cell leans toward its wet neighbours) so diagonal streams read as curves, not stairs
    for (var s1 = 0; s1 < N; s1++) { if (S.fill[s1] < .02) continue; var sx = s1 % COLS, sy = (s1 / COLS) | 0, ax = (sx + .5) * 2, ay = (sy + .5) * 2, wn = 2;
      for (var s2 = 0; s2 < 8; s2++) { var tx = sx + N8[s2][0], ty = sy + N8[s2][1]; if (inb(tx, ty) && S.fill[idx(tx, ty)] >= .02) { ax += tx + .5; ay += ty + .5; wn++; } }
      wpx[s1] = ax / wn * LT; wpy[s1] = ay / wn * LT; }
    for (var i = 0; i < N; i++) {
      var f = S.fill[i]; if (f < .02) continue; var x = i % COLS, y = (i / COLS) | 0, cx = wpx[i], cy = wpy[i], deep = S.dug[i] === 2 ? .45 : 0;
      g.globalAlpha = Math.min(1, .35 + f * .65);
      var r = LT * (.34 + deep * .5) * (.4 + .6 * f); g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      for (var k = 0; k < 8; k++) { var nx = x + N8[k][0], ny = y + N8[k][1]; if (!inb(nx, ny)) continue; var j = idx(nx, ny); if (S.fill[j] < .02) continue;
        var fj = S.fill[j], reach;
        if (f >= .999 && fj >= .999) { if (j < i) continue; reach = 1; }
        else if (fj >= .999) reach = f; else continue;   // a filling cell grows out of its full neighbour
        if (k >= 4 && S.fill[idx(nx, y)] >= .02 && S.fill[idx(x, ny)] >= .02) continue;   // skip the diagonal across an already-wet corner
        g.lineWidth = LT * .6; g.beginPath(); g.moveTo(wpx[j], wpy[j]); g.lineTo(wpx[j] + (cx - wpx[j]) * reach, wpy[j] + (cy - wpy[j]) * reach); g.stroke(); }
    }
    g.globalAlpha = 1;
    // blur the whole mask once (blurring every shape separately was what made it slow)
    wc.setTransform(1, 0, 0, 1, 0, 0); wc.globalCompositeOperation = "source-over"; wc.clearRect(0, 0, waterC.width, waterC.height); wc.filter = "blur(2px)"; wc.drawImage(waterM, 0, 0); wc.filter = "none";
    g = wc; g.setTransform(.5, 0, 0, .5, 0, 0); g.globalCompositeOperation = "source-in";
    if (!waterPat) waterPat = g.createPattern(waterTex(), "repeat");
    var off = Q.still() ? 0 : (time / 1000 * 6) % 512; g.translate(off, off * .4); g.fillStyle = waterPat; g.fillRect(-off, -off, COLS * LT + 512, ROWS * LT + 512);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over";
  }

  /* ---------- frame (Moth's art or a soft painted border) ---------- */
  var frameP = {};
  function frameImg() {
    var key = L.tr ? "garden-frame-portrait" : "garden-frame"; if (art[key]) return art[key]; if (frameP[key]) return frameP[key];
    var c = mk(L.DW, L.DH), g = c.getContext("2d"), r = L.R; g.fillStyle = "#6f8758"; g.fillRect(0, 0, L.DW, L.DH);
    var R = rnd(42); for (var i = 0; i < 260; i++) { var x = R() * L.DW, y = R() * L.DH; if (x > r[0] + 20 && x < r[0] + r[2] - 20 && y > r[1] + 20 && y < r[1] + r[3] - 20) continue; blob(g, x, y, 30 + R() * 50, 24 + R() * 40, ["#7d9a5a", "#5f7a49", "#A3B18A", "#9A94A8", "#8a8597"][i % 5], i + 1); }
    g.globalCompositeOperation = "destination-out"; g.filter = "blur(10px)"; g.beginPath(); g.roundRect(r[0] + 8, r[1] + 8, r[2] - 16, r[3] - 16, 36); g.fill(); g.filter = "none"; g.globalCompositeOperation = "source-over";
    var sg = g.createRadialGradient(r[0] - 10, r[1] - 20, 4, r[0] - 10, r[1] - 20, 80); sg.addColorStop(0, "#a9dcd5"); sg.addColorStop(1, PAL.water); blob(g, r[0] - 20, r[1] - 25, 70, 50, sg, 77);
    return (frameP[key] = c);
  }

  /* ---------- drawing ---------- */
  var sandPat = null, cursor = { x: 5.5, y: 5.5, show: false }, hand = null, drag = null, rakeDown = false, kbRake = false;
  function draw(time) {
    if (dirty.groove) drawGrooves(); if (dirty.dug) drawDug(); if (dirty.moss && (time - (draw.mt || -1e9) > 800 || dirty.mossNow)) { draw.mt = time; dirty.mossNow = false; drawMoss(); } drawWater(time);
    var g = ctx; g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    var bg = g.createLinearGradient(0, 0, 0, L.H); bg.addColorStop(0, "#5f7650"); bg.addColorStop(1, "#4c6042"); g.fillStyle = bg; g.fillRect(0, 0, L.W, L.H);
    g.translate(L.ox, L.oy); g.scale(L.s, L.s);
    // sand
    if (!sandPat) sandPat = g.createPattern(sandTex(), "repeat");
    g.save(); g.fillStyle = PAL.sand; g.fillRect(L.R[0] - 30, L.R[1] - 30, L.R[2] + 60, L.R[3] + 60); g.translate(L.R[0], L.R[1]); g.scale(.75, .75); g.fillStyle = sandPat; g.fillRect(-40, -40, L.R[2] / .75 + 80, L.R[3] / .75 + 80); g.restore();
    // garden-space layers
    g.save(); g.translate(L.gx0, L.gy0); if (L.tr) g.transform(0, 1, 1, 0, 0, 0); g.scale(L.T / LT, L.T / LT);
    g.drawImage(mossC, 0, 0); g.drawImage(grooveC, 0, 0); g.drawImage(dugC, 0, 0); g.globalAlpha = .92; g.drawImage(waterC, 0, 0, COLS * LT, ROWS * LT); g.globalAlpha = 1;
    g.restore();
    drawFootprints(g, time);
    // objects, back to front
    var objs = S.objs.slice().sort(function (a, b) { var pa = g2d(a.x, a.y), pb = g2d(b.x, b.y); return (KINDS[a.k].floats ? 1 : 0) - (KINDS[b.k].floats ? 1 : 0) || pa[1] - pb[1]; });
    var bob = Q.still() ? 0 : Math.sin(time / 1400);
    objs.forEach(function (o) { var K = KINDS[o.k], p = g2d(o.x, o.y), sp = sprite(o.k), lift = (drag && drag.o === o) || carry === o ? 1.08 : 1;
      if (K.glow) { g.globalAlpha = .55 + (Q.still() ? 0 : .08 * Math.sin(time / 2600)); var gs = glowSprite(); g.drawImage(gs, p[0] - 96, p[1] - 96, 192, 192); g.globalAlpha = 1; }
      if (o.k === "shishi") { drawShishi(g, o, p, lift, time); return; }
      g.save(); g.translate(p[0], p[1] + (K.floats && o.float ? bob * 2 : 0)); if (K.floats && o.float && !Q.still()) g.rotate(Math.sin(time / 2100 + o.id) * .08);
      g.drawImage(sp, -K.w / 2 * lift, -K.h / 2 * lift, K.w * lift, K.h * lift); g.restore(); });
    // the frame on top (inner sand area is transparent)
    g.drawImage(frameImg(), 0, 0, L.DW, L.DH);
    drawBin(g, time); drawWanderer(g, time);
    // keyboard cursor + held item
    if (hand) { var hp = g2d(hand.x, hand.y), K2 = KINDS[hand.k]; g.globalAlpha = .7; g.drawImage(sprite(hand.k), hp[0] - K2.w / 2, hp[1] - K2.h / 2, K2.w, K2.h); g.globalAlpha = 1; }
    if (cursor.show) { var cp = g2d(cursor.x, cursor.y); g.strokeStyle = kbRake ? PAL.moss : PAL.ink; g.lineWidth = 4; g.setLineDash(kbRake ? [] : [10, 8]); g.beginPath(); g.arc(cp[0], cp[1], L.T * .9, 0, 7); g.stroke(); g.setLineDash([]); }
  }

  /* ---------- pointer play ---------- */
  function hit(gx, gy) {
    for (var i = S.objs.length - 1; i >= 0; i--) { var o = S.objs[i], K = KINDS[o.k], rw = (K.w / 2) / L.T, rh = (K.h / 2) / L.T; if (L.tr) { var t = rw; rw = rh; rh = t; }
      if (Math.abs(gx - o.x) < rw * .85 && Math.abs(gy - o.y) < rh * .85) return o; }
    return null;
  }
  function overTray(px, py) { var r = document.getElementById("mg-tray").getBoundingClientRect(); return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom; }
  var lastG = null, pid = null, carry = null;   // carry: a placed item picked up with a tap, set down with the next tap
  cv.addEventListener("pointerdown", function (e) {
    if (pid !== null) return; pid = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    cursor.show = false; var gp = scr2g(e.clientX, e.clientY);
    if (W && hitWanderer(gp)) { pid = null; wandererTap(); return; }
    if (hand) { placeHand(gp); pid = null; return; }
    var o = hit(gp[0], gp[1]);
    if (carry) { var co = carry; carry = null; if (inBin(gp[0], gp[1])) { compost(co); pid = null; return; } co.x = clampX(gp[0]); co.y = clampY(gp[1]); co.vx = co.vy = 0; touched(); pid = null; whisper("Set down."); return; }
    if (o) { remember(); drag = { o: o, dx: 0, dy: 0, tx: o.x, ty: o.y, sx: o.x, sy: o.y, gx: gp[0], gy: gp[1], moved: 0 }; return; }
    if (inBin(gp[0], gp[1])) { pid = null; whisper("The compost bin. Drag anything you don't need onto it."); return; }
    remember(); rakeDown = true; rakeLine.started = false; lastG = gp; rakeT = gp; rakeLine(gp, gp, head); sound.rake();
  });
  cv.addEventListener("pointermove", function (e) {
    if (e.pointerId !== pid) return; var gp = scr2g(e.clientX, e.clientY);
    if (drag) { drag.tx = clampX(gp[0] + drag.dx); drag.ty = clampY(gp[1] + drag.dy); drag.px = e.clientX; drag.py = e.clientY; drag.moved = Math.max(drag.moved, Math.hypot(gp[0] - drag.gx, gp[1] - drag.gy)); return; }
    if (rakeDown) rakeT = gp;
  });
  function up(e) {
    if (e.pointerId !== pid) return; pid = null;
    if (drag) { endDrag(overTray(e.clientX, e.clientY)); }
    if (rakeDown && rakeT) { rakeLine(lastG, rakeT, head); }
    rakeDown = false; rakeT = null;
  }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  function endDrag(toTray) {
    var o = drag.o, K = KINDS[o.k];
    if (inBin(drag.tx, drag.ty) || inBin(o.x, o.y)) { compost(o); drag = null; return; }
    if (o.k !== "shishi" && drag.moved != null && drag.moved < .25) { o.x = drag.sx; o.y = drag.sy; carry = o; drag = null; whisper("Picked up. Tap where it should go, or on the compost bin."); return; }
    if (o.k === "shishi" && drag.moved != null && drag.moved < .3) { o.x = drag.sx; o.y = drag.sy; o.r = ((o.r || 0) + 1) & 7; hist.pop(); drag = null; whisper("It will pour that way now."); touched(); return; }
    if (toTray && !K.stone) { S.objs = S.objs.filter(function (x) { return x !== o; }); whisper("Back on the shelf."); }
    else if (K.stone) {   // a stone leaves a small dent where it sat
      if (Math.hypot(drag.tx - drag.sx, drag.ty - drag.sy) > .6) { var cx = Math.floor(drag.sx), cy = Math.floor(drag.sy); if (inb(cx, cy)) { var i = idx(cx, cy); if (!S.t[i]) S.h[i] = Math.min(S.h[i], -.7); } dirty.groove = true; }
      o.x = o.x; }
    o.x = clampX(drag.tx); o.y = clampY(drag.ty);   // settle exactly under the finger or cursor, not where the ease had reached
    drag.done = true; drag = null; touched();
  }
  // stones ease toward where you pull them; heavy ones a little slower
  function moveObjs(dt) {
    binOpen += ((drag && inBin(drag.tx, drag.ty) ? 1 : 0) - binOpen) * Math.min(1, dt * 6);
    if (drag) { var o = drag.o, K = KINDS[o.k], k = K.stone ? (6 - K.heavy * 3.6) : 12; o.x += (drag.tx - o.x) * Math.min(1, dt * k); o.y += (drag.ty - o.y) * Math.min(1, dt * k); }
    S.objs.forEach(function (b) { if (b.k === "boat" && b !== (drag && drag.o) && b !== carry && (b.vx || b.vy)) { b.x = clampX(b.x + b.vx * dt); b.y = clampY(b.y + b.vy * dt); } });
  }

  /* ---------- the shelf (drag from the tray, or tap then tap the sand) ---------- */
  var ghost = null;
  function placeHand(gp) {
    if (!hand) return; var x = clampX(gp ? gp[0] : hand.x), y = clampY(gp ? gp[1] : hand.y);
    var K = KINDS[hand.k];
    if (K.source && S.objs.filter(function (o) { return KINDS[o.k].source; }).length >= MAX_EXTRA_SOURCES) { whisper("The garden has enough springs for now. You can move one, or compost one."); hand = null; trayOn(null); return; }
    if (inBin(x, y)) { hand = null; trayOn(null); return; }
    remember(); S.objs.push({ id: uid++, k: hand.k, x: x, y: y, r: 0 }); hand = null; trayOn(null); touched();
    if (K.source) whisper("A new spring. Dig a path from it with the trowel."); else if (hand === null && x && K.blocks) whisper("Dig a path to it with the trowel. Tap it to turn where it pours.");
  }
  function trayOn(kind) { document.querySelectorAll(".mg-item").forEach(function (b) { b.classList.toggle("on", b.dataset.kind === kind); }); }
  document.querySelectorAll(".mg-item").forEach(function (b) {
    var down = null;
    b.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }; try { b.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
    b.addEventListener("pointermove", function (e) {
      if (!down || e.pointerId !== down.id) return;
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down.moved = true; ghost = document.createElement("div"); ghost.className = "mg-ghost"; ghost.style.backgroundImage = b.querySelector(".mg-ic").style.backgroundImage; document.body.appendChild(ghost); }
      if (ghost) { ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; }
    });
    b.addEventListener("pointerup", function (e) {
      if (!down) return; var d = down; down = null;
      if (ghost) { ghost.remove(); ghost = null; }
      if (d.moved) { if (!overTray(e.clientX, e.clientY)) { hand = { k: b.dataset.kind, x: 0, y: 0 }; placeHand(scr2g(e.clientX, e.clientY)); } return; }
      pick(b.dataset.kind);
    });
    b.addEventListener("pointercancel", function () { down = null; if (ghost) { ghost.remove(); ghost = null; } });
    b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(b.dataset.kind, true); } });
  });
  function pick(kind, kb) {
    if (hand && hand.k === kind) { hand = null; trayOn(null); return; }
    hand = { k: kind, x: cursor.x, y: cursor.y }; trayOn(kind);
    if (kb) { cursor.show = true; cv.focus(); whisper("Move with the arrow keys, then Space to set it down."); } else whisper("Tap the sand to set it down.");
  }
  cv.addEventListener("pointermove", function (e) { if (pid === null && e.pointerType === "mouse" && (hand || carry)) { var gp = scr2g(e.clientX, e.clientY); if (hand) { hand.x = gp[0]; hand.y = gp[1]; } if (carry) { carry.x = clampX(gp[0]); carry.y = clampY(gp[1]); } binOpen = carry && inBin(gp[0], gp[1]) ? 1 : binOpen; } });

  /* ---------- tools ---------- */
  function setHead(hd, quiet) {
    head = hd; document.querySelectorAll(".mg-tool").forEach(function (b) { var on = +b.dataset.head === hd; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    if (!quiet) { whisper(hd === 4 ? "The trowel: dig a path for the water." : hd === 5 ? "Fill: press a dug path back into sand." : hd === 1 ? "The small rake: fine, close lines." : hd === 3 ? "The wide rake: broad, even lines." : hd === 2 ? "Wide swirls." : "Smooth: brush lines away."); touched(); }
  }
  document.querySelectorAll(".mg-tool").forEach(function (b) { b.addEventListener("click", function () { setHead(+b.dataset.head); }); });
  document.getElementById("mg-undo").addEventListener("click", undo);
  document.getElementById("mg-fresh").addEventListener("click", fresh);
  function fresh() {
    Q.card({ title: "Smooth it all out?", text: "The stones go back to their places and the sand is raked smooth. You can undo this.", buttons: [
      { label: "Keep my garden", fn: function () {} },
      { label: "Smooth it out", primary: true, id: "mg-fresh-yes", fn: function () { remember(); freshState(); dirty.mossNow = true; touched(); whisper("A fresh garden."); } }] });
  }

  /* ---------- keyboard: arrow cursor, Space to pick up / put down, Enter to lower the rake ---------- */
  document.addEventListener("keydown", function (e) {
    if (document.querySelector(".q-cardwrap")) return;
    var tag = (e.target.tagName || "").toLowerCase(); if (tag === "input") return;
    var k = e.key, mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if ((k === "z" || k === "Z") && !e.altKey) { e.preventDefault(); undo(); return; }
    if (k >= "1" && k <= "6" && k.length === 1) { setHead({ 1: 1, 2: 3, 3: 2, 4: 0, 5: 4, 6: 5 }[k]); return; }
    if (e.target !== cv && e.target !== document.body) return;
    if (mv) {
      e.preventDefault(); cursor.show = true; var sx = mv[0] * .5, sy = mv[1] * .5, gx = L.tr ? sy : sx, gy = L.tr ? sx : sy;   // screen arrows -> garden directions
      var from = [cursor.x, cursor.y]; cursor.x = clampX(cursor.x + gx); cursor.y = clampY(cursor.y + gy);
      if (hand) { hand.x = cursor.x; hand.y = cursor.y; }
      if (drag) { drag.tx = cursor.x; drag.ty = cursor.y; }
      if (kbRake) rakeLine(from, [cursor.x, cursor.y], head);
      return;
    }
    if (k === " ") {
      e.preventDefault(); cursor.show = true;
      if (hand) { placeHand([cursor.x, cursor.y]); return; }
      if (drag) { drag.tx = cursor.x; drag.ty = cursor.y; var dd = drag; setTimeout(function () { if (drag === dd) endDrag(false); }, 500); whisper("Set down."); return; }
      var o = hit(cursor.x, cursor.y); if (o) { remember(); drag = { o: o, dx: 0, dy: 0, tx: o.x, ty: o.y, sx: o.x, sy: o.y }; cursor.x = o.x; cursor.y = o.y; whisper("Picked up. Arrow keys to move, Space to set it down."); }
      else whisper("Nothing here to pick up. Enter lowers the rake.");
      return;
    }
    if (k === "Enter") { e.preventDefault(); cursor.show = true; kbRake = !kbRake; if (kbRake) { remember(); rakeLine.started = false; rakeLine([cursor.x, cursor.y], [cursor.x, cursor.y], head); } whisper(kbRake ? "Rake down. Move with the arrow keys." : "Rake up."); }
    if (k === "Delete" || k === "Backspace") { if (drag) { var dd2 = drag; drag = null; compost(dd2.o); } }
  });

  /* ---------- whispers, soft controls, time, sound ---------- */
  var wT; function whisper(t) { var w = document.getElementById("mg-whisper"); w.textContent = t; w.classList.add("on"); clearTimeout(wT); wT = setTimeout(function () { w.classList.remove("on"); }, 3200); }
  Q.softControls(document.getElementById("q-soft"));
  Q.bindStill(document.getElementById("mg-still"));
  var session = { len: 0, start: 0, ended: false };
  function elapsed() { return (performance.now() - session.start) * Q.timeScale; }
  document.getElementById("mg-time").addEventListener("click", function () { whisper(Q.timeLeftSentence(session.len ? Math.max(0, session.len * 60000 - elapsed()) : null)); });
  var sound = { trickle: null,
    toggle: function () { var on = !Q.sound.on; if (on && !this.trickle) { this.trickle = Q.sound.noise(900); this.wind = Q.sound.noise(320); this.hush = Q.sound.noise(1600); if (this.wind) Q.sound.ramp(this.wind.gain, .12, 3); } Q.sound.set(on);
      var b = document.getElementById("mg-sound"); b.textContent = "Sound: " + (on ? "on" : "off"); b.setAttribute("aria-pressed", on); },
    tick: function () { var sh = S.objs.some(function (o) { return o.k === "shishi" && o.fed && o.st === "fill"; }); if (this.trickle && Q.sound.on) Q.sound.ramp(this.trickle.gain, Math.min(.35, flowing * .05 + (S.fill[0] ? .04 : 0) + (sh ? .05 : 0)), 2); },
    hush: null,
    rake: function () { if (Q.sound.on && Math.random() < .3) Q.sound.tone(196 + Math.random() * 60, .02, 2); } };
  document.getElementById("mg-sound").addEventListener("click", function () { sound.toggle(); });
  function endCard() {
    session.ended = true;
    Q.card({ title: "Your garden will be here when you come back.", buttons: [
      { label: "Keep tending", primary: true, id: "mg-keep", fn: function () { session.len = 0; } },
      { label: "Leave", href: "../", id: "mg-leave-card" }], escape: false });
    Q.save(GAME, enc());
  }

  /* ---------- the loop ---------- */
  var last = performance.now(), acc = 0, sTick = 0;
  function frame(now) {
    var dt = Math.min(.1, (now - last) / 1000) * Q.timeScale; last = now;
    acc += dt; while (acc >= .1) { sim(.1); acc -= .1; }
    moveObjs(Math.min(.1, dt)); rakeFollow(Math.min(.1, dt)); wanderUpdate(Math.min(.1, dt)); puffUpdate(Math.min(.1, dt));
    sTick += dt; if (sTick > 1) { sTick = 0; sound.tick(); }
    if (session.len && !session.ended && elapsed() >= session.len * 60000) endCard();
    if (innerWidth !== L.W || innerHeight !== L.H) layout();   // phones resize without always firing "resize" (URL bar, rotation)
    draw(now); requestAnimationFrame(frame);
  }
  window.addEventListener("resize", function () { layout(); }); if (window.visualViewport) visualViewport.addEventListener("resize", function () { layout(); });

  /* ---------- the rake follows the pointer softly (lerp ~0.2) so lines curve smoothly ---------- */
  var rakeT = null, hushV = 0;
  function rakeFollow(dt) {
    var sp = 0;
    if (rakeDown && rakeT && lastG) { var k = 1 - Math.pow(.8, dt * 60), nx = lastG[0] + (rakeT[0] - lastG[0]) * k, ny = lastG[1] + (rakeT[1] - lastG[1]) * k;
      sp = Math.hypot(nx - lastG[0], ny - lastG[1]) / Math.max(dt, .001); if (sp > .02) { rakeLine(lastG, [nx, ny], head); lastG = [nx, ny]; } }
    // sand hush: volume follows drag speed, fades about 0.3 s after you stop
    var c = Q.sound.ctx && Q.sound.on && sound.hush ? Q.sound.ctx() : null;
    if (c) { var v = Math.min(.18, sp * .02); if (Math.abs(v - hushV) > .005) { hushV = v; sound.hush.gain.gain.setTargetAtTime(v, c.currentTime, v > 0 ? .08 : .1); } }
  }
  /* ---------- small percussive sounds (only when sound is on) ---------- */
  function knock(freq, vol, len) {
    if (!Q.sound.on) return; var c = Q.sound.ctx(), m = Q.sound.master && Q.sound.master(); if (!c || !m) return;
    var o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(), t = c.currentTime; o.type = "triangle";
    o.frequency.setValueAtTime(freq * 1.25, t); o.frequency.exponentialRampToValueAtTime(freq, t + .05); f.type = "lowpass"; f.frequency.value = freq * 3;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    o.connect(f); f.connect(g); g.connect(m); o.start(t); o.stop(t + len + .05);
  }
  var tokOn = true; try { tokOn = localStorage.getItem("gw-mg-tok") !== "0"; } catch (e) {}
  function tok() { if (tokOn) knock(330, .05, .35); }   // warm, low, quieter than the ambience
  /* ---------- compost bin ---------- */
  function compost(o) {
    var p = g2d(o.x, o.y); S.objs = S.objs.filter(function (x) { return x !== o; });
    tumble = { k: o.k, x: p[0], y: p[1], t: 0 }; binOpen = 1; dirty.groove = true; touched();
    setTimeout(function () { knock(110, .09, .5); var b = g2d(BIN.x, BIN.y), n = Q.still() ? 4 : 10;
      for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + (Math.random() - .5) * 2.2; puffs.push({ x: b[0], y: b[1] - L.T * .4, vx: Math.cos(a) * (14 + Math.random() * 20), vy: Math.sin(a) * (18 + Math.random() * 24), t: 0, c: i % 3 ? "rgba(214,199,168," : "rgba(110,139,78," }); } }, Q.still() ? 0 : 450);
    whisper("Back to the earth.");
  }
  function puffUpdate(dt) {
    if (tumble) { tumble.t += dt / (Q.still() ? .3 : .5); if (tumble.t >= 1) tumble = null; }
    puffs.forEach(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 10 * dt; }); puffs = puffs.filter(function (p) { return p.t < 1.4; });
    if (!drag && !tumble) binOpen += (0 - binOpen) * Math.min(1, dt * 3);
  }
  function drawBin(g, time) {
    var b = g2d(BIN.x, BIN.y), u = L.T * 1.15;
    g.save(); g.translate(b[0], b[1]);
    softShadow(g, 6, 9, u * 1.15, u * .9, .3);
    var wg = g.createLinearGradient(-u, -u, u, u); wg.addColorStop(0, "#a7845a"); wg.addColorStop(1, "#7a5b3b");
    g.fillStyle = wg; g.beginPath(); g.roundRect(-u, -u * .75, u * 2, u * 1.6, u * .25); g.fill();
    g.strokeStyle = "rgba(62,48,30,.45)"; g.lineWidth = 3; for (var i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-u * .9, i * u * .28 + u * .05); g.lineTo(u * .9, i * u * .28 + u * .05); g.stroke(); }
    // dark soil and a leaf inside, seen when the lid lifts
    blob(g, 0, -u * .2, u * .78, u * .42, "#5b4a35", 8); blob(g, -u * .3, -u * .3, u * .2, u * .1, PAL.moss, 4); blob(g, u * .25, -u * .15, u * .16, u * .08, PAL.peach, 6);
    // the lid hinges at the back and lifts while something is held over the bin
    var lift = binOpen; g.save(); g.translate(0, -u * .75); g.scale(1, Math.max(.12, 1 - lift * .85));
    var lg = g.createLinearGradient(0, 0, 0, u * 1.5); lg.addColorStop(0, "#8f6c46"); lg.addColorStop(1, "#6f5235");
    g.fillStyle = lg; g.beginPath(); g.roundRect(-u * 1.05, 0, u * 2.1, u * 1.5, u * .25); g.fill();
    g.fillStyle = "rgba(255,240,210,.25)"; g.fillRect(-u * .9, u * .12, u * 1.8, 4);
    blob(g, -u * .55, u * .2, u * .32, u * .14, PAL.moss, 12); blob(g, -u * .3, u * .15, u * .22, u * .1, "#86a364", 13);
    g.restore();
    // a tiny sprout on the lid so it reads as compost, not trash
    if (lift < .5) { g.strokeStyle = "#5f7d43"; g.lineWidth = 3; g.lineCap = "round"; g.beginPath(); g.moveTo(u * .45, -u * .05); g.quadraticCurveTo(u * .5, -u * .35, u * .4, -u * .5); g.stroke(); blob(g, u * .3, -u * .5, u * .14, u * .07, "#7FA65A", 3); blob(g, u * .55, -u * .42, u * .13, u * .07, "#7FA65A", 9); }
    g.restore();
    if (tumble) { var K = KINDS[tumble.k], t = tumble.t, e = t * t, x = tumble.x + (b[0] - tumble.x) * e, y = tumble.y + (b[1] - u * .3 - tumble.y) * e - Math.sin(t * Math.PI) * L.T * (Q.still() ? 0 : 1);
      g.save(); g.globalAlpha = 1 - t * .8; g.translate(x, y); if (!Q.still()) g.rotate(t * 2.2); var sc = 1 - t * .7; g.drawImage(sprite(tumble.k), -K.w / 2 * sc, -K.h / 2 * sc, K.w * sc, K.h * sc); g.restore(); }
    puffs.forEach(function (p) { var a = Math.max(0, 1 - p.t / 1.4) * .7; g.fillStyle = p.c + a + ")"; g.beginPath(); g.arc(p.x, p.y, 4 + p.t * 9, 0, 7); g.fill(); });
  }
  /* ---------- shishi-odoshi, painted live so it can tip ---------- */
  function softShadow(g, x, y, rx, ry, a) {   // a blurred-looking shadow without a per-frame canvas filter
    g.save(); g.translate(x, y); g.scale(1, ry / rx); var sg = g.createRadialGradient(0, 0, 0, 0, 0, rx); sg.addColorStop(0, "rgba(62,74,58," + a + ")"); sg.addColorStop(.6, "rgba(62,74,58," + a * .6 + ")"); sg.addColorStop(1, "rgba(62,74,58,0)");
    g.fillStyle = sg; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
  }
  function ease(t) { return t * t; } function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function drawShishi(g, o, p, lift, time) {
    var op = shOut(o), q = g2d(op[0], op[1]), ang = Math.atan2(q[1] - p[1], q[0] - p[0]), u = L.T, still = Q.still();
    var tilt = 0; if (!still) { if (o.st === "tip") tilt = ease(o.ph / .6); else if (o.st === "pour") tilt = 1; else if (o.st === "reset") tilt = 1 - easeOut(o.ph / 1.2); }
    // a stone basin where the water lands
    softShadow(g, q[0] + 4, q[1] + 6, u * .8, u * .65, .25);
    var sg = g.createRadialGradient(q[0] - 6, q[1] - 6, 2, q[0], q[1], u * .7); sg.addColorStop(0, "#c9c4d4"); sg.addColorStop(1, "#8a8597"); blob(g, q[0], q[1], u * .62, u * .5, sg, 17);
    var basinW = o.out > 0 ? Math.min(1, o.out / 3) : 0; blob(g, q[0], q[1], u * .38, u * .3, "rgba(127,183,176," + (.35 + basinW * .6) + ")", 19);
    g.save(); g.translate(p[0], p[1]); g.scale(lift, lift);
    softShadow(g, 5, 8, u * 1.45, u * .65, .25);
    g.rotate(ang);
    // the two posts and the pivot pin
    g.fillStyle = "#6f5235"; g.beginPath(); g.roundRect(-u * .12, -u * .62, u * .24, u * .3, 4); g.roundRect(-u * .12, u * .32, u * .24, u * .3, 4); g.fill();
    // the tube: the pour end dips down (looks longer and lower), the back end lifts
    var Lh = u * 1.4, dip = tilt * u * .18; g.save(); g.translate(dip, tilt * 3); g.scale(1 + tilt * .06, 1);
    bamboo(g, -Lh, -u * .26, Lh * 2, u * .52);
    // water in the cup: fills slowly
    var f = o.f || 0; if (f > .02) { g.fillStyle = "rgba(127,183,176," + (.4 + f * .5) + ")"; g.beginPath(); g.ellipse(Lh - u * .05, 0, u * .12, u * .32 * Math.min(1, f + .2), 0, 0, 7); g.fill(); }
    g.restore();
    g.fillStyle = "#3E4A3A"; g.beginPath(); g.arc(0, 0, u * .08, 0, 7); g.fill();
    g.restore();
    // the pour: a soft ribbon from the lip to the basin
    var pr = 0; if (o.st === "pour") pr = still ? .6 : Math.sin(Math.min(1, o.ph / 1.0) * Math.PI); else if (still && o.out > 12) pr = .5;
    if (pr > .02) { var lx = p[0] + Math.cos(ang) * u * 1.3, ly = p[1] + Math.sin(ang) * u * 1.3; g.strokeStyle = "rgba(190,228,222," + pr * .85 + ")"; g.lineWidth = u * .16; g.lineCap = "round";
      g.beginPath(); g.moveTo(lx, ly); g.quadraticCurveTo((lx + q[0]) / 2, (ly + q[1]) / 2 + u * .2, q[0], q[1]); g.stroke(); }
    // the intake: a thin bamboo pipe dribbles when water reaches it
    if (o.fed && o.st === "fill" && !still) { var ix = p[0] + Math.cos(ang) * u * 1.1, iy = p[1] + Math.sin(ang) * u * 1.1, dr = (time / 300) % 1; g.fillStyle = "rgba(200,232,226,.8)"; g.beginPath(); g.arc(ix, iy - u * .3 + dr * u * .3, 2.5, 0, 7); g.fill(); }
  }
  /* ---------- the wanderer ---------- */
  var W = null, prints = [], TAP_LINES = ["Lovely spot.", "I like where the water goes.", "The moss is soft here.", "Thank you for this garden.", "I could sit here all day."];
  function cover(x, y) {   // the plank or stepping stone under a garden point, if any
    var p = g2d(x, y);
    for (var i = S.objs.length - 1; i >= 0; i--) { var o = S.objs[i]; if (o.k !== "plank" && o.k !== "step") continue; var K = KINDS[o.k], q = g2d(o.x, o.y);
      if (Math.abs(p[0] - q[0]) < K.w * .46 && Math.abs(p[1] - q[1]) < K.h * .42) return o; }
    return null;
  }
  function walkable(cx, cy) {
    if (!inb(cx, cy)) return false; var i = idx(cx, cy); if (blocked[i] || inBin(cx + .5, cy + .5)) return false;
    if (S.fill[i] > .4 || isSource(i)) return !!cover(cx + .5, cy + .5);
    return !S.objs.some(function (o) { return (o.k === "lantern" || o.k === "statue" || o.k === "spout" || o.k === "barrel") && Math.hypot(o.x - cx - .5, o.y - cy - .5) < .7; });
  }
  function findPath(sx, sy, goal) {   // BFS over cells (8 ways, no corner cutting); returns cell centres
    var s0 = idx(sx, sy), prev = new Int32Array(N).fill(-2); prev[s0] = -1; var q = [s0], h = 0;
    while (h < q.length) { var i = q[h++]; if (goal(i)) { var out = []; while (i >= 0) { out.unshift([i % COLS + .5, ((i / COLS) | 0) + .5]); i = prev[i]; } return out; }
      var x = i % COLS, y = (i / COLS) | 0;
      for (var k = 0; k < 8; k++) { var nx = x + N8[k][0], ny = y + N8[k][1]; if (!walkable(nx, ny)) continue; var j = idx(nx, ny); if (prev[j] !== -2) continue;
        if (k >= 4 && (!walkable(nx, y) || !walkable(x, ny))) continue; prev[j] = i; q.push(j); } }
    return null;
  }
  function spots() {   // nice places to visit: bridges, stones, lanterns, ferns, the shishi-odoshi, the water's edge
    var out = [];
    S.objs.forEach(function (o) { var nice = { plank: 4, step: 3, lantern: 3, fern: 2, moss: 1, statue: 2, shishi: 3, spout: 2, barrel: 2 }[o.k]; if (!nice) return;
      out.push({ x: o.x, y: o.y, on: o.k === "plank" || o.k === "step", w: nice, k: o.k, id: o.id }); });
    for (var t = 0; t < 30; t++) { var i = (Math.random() * N) | 0; if (S.fill[i] > .8) { out.push({ x: i % COLS + .5, y: ((i / COLS) | 0) + .5, on: false, w: 2, k: "water", id: "w" + i }); break; } }
    return out;
  }
  function sendWanderer() {
    if (W) { if (W.mode !== "home") { W.mode = "home"; W.path = null; whisper("The wanderer waves and strolls home."); } setWanderBtn(); return; }
    computeBlocked(); var start = null;
    for (var y = ROWS - 1; y >= 0 && !start; y--) for (var x = 0; x < 6 && !start; x++) if (walkable(x, y)) start = [x, y];
    if (!start) for (var i = 0; i < N && !start; i++) if (walkable(i % COLS, (i / COLS) | 0)) start = [i % COLS, (i / COLS) | 0];
    if (!start) { whisper("There is no room to walk just now."); return; }
    W = { x: start[0] + .5, y: start[1] + .5, home: start.slice(), mode: "visit", path: null, pause: 1.5, face: 1, hop: 0, hopH: 0, seen: {}, visits: 0, max: Q.still() ? 2 : 4 + ((Math.random() * 2) | 0), pp: 0, look: 0, fade: 0, cov: null, joy: 0, sit: 0 };
    whisper("A wanderer has come to see your garden."); setWanderBtn();
  }
  function setWanderBtn() { var b = document.getElementById("mg-wander"); if (b) b.textContent = W && W.mode !== "home" ? "Wave goodbye" : "Send the wanderer"; }
  function hitWanderer(gp) { return W && W.fade < .5 && Math.hypot(gp[0] - W.x, gp[1] - W.y) < .8; }
  function wandererTap() { W.joy = 1.2; if (!W.hop) { W.hop = .4; W.hopH = .25; W.hopT = .4; } whisper(TAP_LINES[(Math.random() * TAP_LINES.length) | 0]); if (Q.sound.on) Q.sound.tone(523, .02, 1.2); }
  function planNext() {
    var cx = Math.floor(W.x), cy = Math.floor(W.y);
    if (W.mode === "home") { var hx = W.home[0], hy = W.home[1]; W.path = findPath(cx, cy, function (i) { return i === idx(hx, hy); }) || [[W.x, W.y]]; W.leaving = true; return; }
    var cand = spots().filter(function (s) { return !W.seen[s.id]; });
    if (W.visits >= W.max || !cand.length) {   // end by sitting somewhere pretty a while
      if (W.mode !== "sit") { W.mode = "sit"; cand = cand.length ? cand : spots(); cand.sort(function (a, b) { return b.w - a.w; }); }
      else { W.mode = "home"; planNext(); return; }
    }
    cand.sort(function () { return Math.random() - .5; }); cand.sort(function (a, b) { return b.w - a.w + (Math.random() - .5) * 3; });
    for (var c = 0; c < cand.length; c++) { var s = cand[c], path = findPath(cx, cy, function (i) { var x = i % COLS + .5, y = ((i / COLS) | 0) + .5, d = Math.hypot(x - s.x, y - s.y); return s.on ? d < .8 : d < 1.6 && d > .6; });
      if (path) { W.path = path; W.spot = s; W.seen[s.id] = 1; return; } W.seen[s.id] = 1; }
    // nothing reachable: a gentle turn and a short amble, never looks stuck
    W.face = -W.face; W.pause = 1.5; var amb = findPath(cx, cy, function (i) { return Math.hypot(i % COLS - cx, ((i / COLS) | 0) - cy) > 3 && Math.random() < .15; });
    W.path = amb; W.spot = null; if (W.mode === "sit" && !amb) W.mode = "visit"; if (!amb) W.visits++;
  }
  function wanderUpdate(dt) {
    prints = prints.filter(function (p) { return performance.now() - p.t < 20000; });
    if (!W) return; var still = Q.still();
    if (W.joy > 0) W.joy -= dt;
    if (W.hop > 0) { W.hop = Math.max(0, W.hop - dt); }
    if (W.leaving && !W.path) { W.fade += dt / 1.5; if (W.fade >= 1) { W = null; setWanderBtn(); } return; }
    if (W.pause > 0) { W.pause -= dt; W.look += dt; if (!still && W.look > 1.3) { W.look = 0; W.face = -W.face; } return; }
    if (!W.path) { planNext(); return; }
    var tgt = W.path[0]; if (!tgt) { W.path = null; return; }
    var dx = tgt[0] - W.x, dy = tgt[1] - W.y, d = Math.hypot(dx, dy), sp = (still ? 1.0 : 1.2) * dt;
    var gp = g2d(tgt[0], tgt[1]), wp = g2d(W.x, W.y); if (Math.abs(gp[0] - wp[0]) > 1) W.face = gp[0] > wp[0] ? 1 : -1;
    if (d <= sp) { W.x = tgt[0]; W.y = tgt[1]; W.path.shift();
      var cv2 = cover(W.x, W.y); if (cv2 !== W.cov) { if (!still) { W.hop = .5; W.hopT = .5; W.hopH = .35; } W.cov = cv2; }   // 0.5 s hop onto or off a stone or bridge
      if (!W.path.length) { W.path = null;
        if (W.leaving) return;
        if (W.mode === "sit") { W.sitting = true; W.pause = still ? 30 : 25; W.mode = "sit"; W.visits = 99; W.spot = null; W.seen = W.seen; W.sitDone = true; return; }
        W.visits++; W.pause = 2 + Math.random() * 2; W.look = 0;
        if (W.spot) { var sp2 = g2d(W.spot.x, W.spot.y); W.face = sp2[0] >= g2d(W.x, W.y)[0] ? 1 : -1; } }
    } else { W.x += dx / d * sp; W.y += dy / d * sp; W.sitting = false;
      W.pp += sp; if (W.pp > .42) { W.pp = 0; prints.push({ x: W.x, y: W.y, t: performance.now(), s: (prints.length % 2) ? 1 : -1, a: Math.atan2(gp[1] - wp[1], gp[0] - wp[0]) }); if (prints.length > 140) prints.shift(); } }
    if (W.sitDone && W.pause <= 0 && !W.path) { W.sitDone = false; W.mode = "home"; }
  }
  function drawFootprints(g) {
    var now = performance.now();
    prints.forEach(function (p) { var a = 1 - (now - p.t) / 20000; if (a <= 0) return; var q = g2d(p.x, p.y), o = p.s * L.T * .1;
      g.save(); g.translate(q[0] - Math.sin(p.a) * o, q[1] + Math.cos(p.a) * o); g.rotate(p.a); g.fillStyle = "rgba(150,128,92," + (a * .35) + ")"; g.beginPath(); g.ellipse(0, 0, L.T * .1, L.T * .065, 0, 0, 7); g.fill(); g.restore(); });
  }
  function drawWanderer(g, time) {
    if (!W) return; var p = g2d(W.x, W.y), u = L.T * .72, still = Q.still(), walking = !!W.path && W.pause <= 0;
    var hopY = W.hop > 0 ? Math.sin((1 - W.hop / (W.hopT || .5)) * Math.PI) * L.T * (W.hopH || .35) : 0, bob = walking && !still ? Math.abs(Math.sin(time / 180)) * 2 : 0;
    var sit = W.sitting && W.pause > 0;
    g.save(); g.globalAlpha = 1 - W.fade; g.translate(p[0], p[1]);
    g.fillStyle = "rgba(62,74,58,.22)"; g.beginPath(); g.ellipse(2, u * .9, u * (.8 - hopY / (L.T * 2)), u * .28, 0, 0, 7); g.fill();
    g.translate(0, -hopY - bob + (sit ? u * .25 : 0)); g.scale(W.face, 1);
    // lantern glow (screen blend, soft)
    g.save(); g.globalCompositeOperation = "screen"; var lg = g.createRadialGradient(u * .95, u * .1, 0, u * .95, u * .1, u * 1.6); lg.addColorStop(0, "rgba(242,196,141,.55)"); lg.addColorStop(1, "rgba(242,196,141,0)"); g.fillStyle = lg; g.fillRect(-u * 1, -u * 1.6, u * 3.6, u * 3.4); g.restore();
    // feet, body, belly
    g.fillStyle = "#5f7a49"; if (!sit) { var st = walking && !still ? Math.sin(time / 180) * u * .15 : 0; g.beginPath(); g.ellipse(-u * .3 + st, u * .78, u * .2, u * .12, 0, 0, 7); g.ellipse(u * .3 - st, u * .78, u * .2, u * .12, 0, 0, 7); g.fill(); }
    var bg = g.createRadialGradient(-u * .25, -u * .1, 2, 0, u * .2, u * .9); bg.addColorStop(0, "#a7bd8c"); bg.addColorStop(1, "#6E8B4E"); blob(g, 0, u * .2, u * .66, u * (sit ? .58 : .68), bg, 23);
    blob(g, u * .05, u * .35, u * .32, u * .3, "rgba(234,223,200,.55)", 25);
    // pointy ears under the hat
    g.fillStyle = "#7f9a5f"; g.beginPath(); g.moveTo(-u * .5, -u * .25); g.lineTo(-u * 1.0, -u * .5); g.lineTo(-u * .42, -u * .02); g.fill(); g.beginPath(); g.moveTo(u * .5, -u * .25); g.lineTo(u * 1.0, -u * .5); g.lineTo(u * .42, -u * .02); g.fill();
    // face
    var blink = !still && (time % 4200) < 140; g.fillStyle = PAL.ink;
    if (W.joy > 0 || blink) { g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.arc(-u * .2, u * .02, u * .08, Math.PI * 1.1, Math.PI * 1.9); g.moveTo(u * .28, u * .02); g.arc(u * .2, u * .02, u * .08, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else { g.beginPath(); g.arc(-u * .2, u * .02, u * .07, 0, 7); g.arc(u * .2, u * .02, u * .07, 0, 7); g.fill(); }
    g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.arc(0, u * .18, u * (W.joy > 0 ? .14 : .09), .4, 2.7); g.stroke();
    if (W.joy > 0) { g.fillStyle = "rgba(242,160,140,.45)"; g.beginPath(); g.arc(-u * .36, u * .18, u * .09, 0, 7); g.arc(u * .36, u * .18, u * .09, 0, 7); g.fill(); }
    // straw hat
    var hg = g.createLinearGradient(0, -u * .7, 0, -u * .2); hg.addColorStop(0, "#f3d79f"); hg.addColorStop(1, "#d9b26f"); g.fillStyle = hg;
    g.beginPath(); g.ellipse(0, -u * .32, u * .95, u * .26, 0, 0, 7); g.fill(); g.strokeStyle = "rgba(140,100,50,.5)"; g.lineWidth = 1.5; g.stroke();
    g.beginPath(); g.ellipse(0, -u * .5, u * .45, u * .3, 0, Math.PI, 0); g.fill(); g.fillStyle = "#a3b18a"; g.fillRect(-u * .45, -u * .5, u * .9, u * .09);
    // tiny lantern on a stick
    g.strokeStyle = "#6f5235"; g.lineWidth = 2; g.beginPath(); g.moveTo(u * .5, u * .35); g.lineTo(u * .95, -u * .2); g.stroke();
    var sw = still ? 0 : Math.sin(time / 600) * .15; g.save(); g.translate(u * .95, -u * .2); g.rotate(sw);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, u * .18); g.stroke(); var lp = g.createRadialGradient(0, u * .35, 1, 0, u * .35, u * .2); lp.addColorStop(0, "#fff3d6"); lp.addColorStop(1, PAL.peach);
    g.fillStyle = lp; g.beginPath(); g.roundRect(-u * .13, u * .18, u * .26, u * .32, 4); g.fill(); g.fillStyle = "#6f5235"; g.fillRect(-u * .15, u * .16, u * .3, 3); g.restore();
    if (W.joy > 0 && !still) { g.fillStyle = "rgba(242,196,141," + Math.min(1, W.joy) + ")"; for (var s2 = 0; s2 < 3; s2++) { var a2 = -1.9 + s2 * .6, r2 = u * (1.2 + (1.2 - W.joy) * .6); g.beginPath(); g.arc(Math.cos(a2) * r2, Math.sin(a2) * r2, 3, 0, 7); g.fill(); } }
    g.restore();
  }
  document.getElementById("mg-wander").addEventListener("click", sendWanderer);
  (function () { var b = document.getElementById("mg-tok"); function show() { b.textContent = "Bamboo tok: " + (tokOn ? "on" : "off"); b.setAttribute("aria-pressed", tokOn); }
    b.addEventListener("click", function () { tokOn = !tokOn; try { localStorage.setItem("gw-mg-tok", tokOn ? "1" : "0"); } catch (e) {} show(); }); show(); })();

  /* ---------- tray icons: Moth's icons, else drawn from the sprites ---------- */
  function setIcons() {
    document.querySelectorAll(".mg-ic").forEach(function (s) {
      var n = s.dataset.icon, a = art["icon-" + n];
      if (a) { s.style.backgroundImage = "url(" + a.src + ")"; return; }
      var kind = Object.keys(KINDS).filter(function (k) { return KINDS[k].art === n; })[0];
      var c = mk(96, 96), g = c.getContext("2d");
      if (kind) { var sp = sprite(kind), K = KINDS[kind], sc = Math.min(88 / K.w, 88 / K.h); g.drawImage(sp, 48 - K.w * sc / 2, 48 - K.h * sc / 2, K.w * sc, K.h * sc); }
      else { g.strokeStyle = PAL.ink; g.lineWidth = 6; g.lineCap = "round"; g.beginPath();
        if (n === "trowel" || n === "trowel-fill") { g.lineWidth = 7; g.moveTo(18, 80); g.lineTo(40, 58); g.stroke(); g.beginPath(); g.fillStyle = n === "trowel" ? "#9A94A8" : "#D6C7A8";
          g.moveTo(40, 58); g.quadraticCurveTo(46, 30, 78, 18); g.quadraticCurveTo(68, 50, 40, 58); g.fill(); g.lineWidth = 3; g.stroke(); g.beginPath(); g.lineWidth = 6;
          if (n === "trowel-fill") { g.fillStyle = "#b9a37c"; g.arc(70, 72, 12, Math.PI, 0); g.fill(); } else { g.strokeStyle = "#8f7a58"; g.moveTo(52, 82); g.quadraticCurveTo(66, 70, 84, 78); } }
        else if (n === "undo") { g.arc(50, 52, 24, Math.PI * 1.1, Math.PI * 2.4); g.moveTo(26, 30); g.lineTo(26, 48); g.lineTo(42, 46); }
        else if (n === "fresh-garden") { for (var r = 1; r < 4; r++) { g.moveTo(18, 30 + r * 12); g.bezierCurveTo(40, 22 + r * 12, 56, 38 + r * 12, 78, 30 + r * 12); } }
        else { g.moveTo(20, 76); g.lineTo(76, 20); var tines = n === "rake-wide" ? 7 : n === "rake-fine" ? 5 : n === "rake-swirl" ? 3 : 0; var x0 = tines === 7 ? 24 : 40, stp = tines === 7 ? 8 : 9; if (tines === 7) { g.moveTo(14, 46); g.lineTo(54, 6); } for (var t = 0; t < tines; t++) { var bx = x0 + t * stp * .7, by = 36 - t * stp * .7; if (tines !== 7) { bx = 40 + t * 9; by = 20 + t * 2; } g.moveTo(bx, by); g.lineTo(bx + 12, by + 12); } if (!tines) { g.moveTo(56, 12); g.lineTo(84, 40); } }
        g.stroke(); }
      s.style.backgroundImage = "url(" + c.toDataURL() + ")";
    });
  }

  /* ---------- boot ---------- */
  Q.loadArt(ART, ART_NAMES).then(function (a) {
    art = a; layout(); setIcons(); freshState();
    return Q.load(GAME).then(function (d) { if (d && dec(d)) { /* welcome back */ } });
  }).then(function () {
    requestAnimationFrame(function (t) { last = t; frame(t); });
    var params = new URLSearchParams(location.search);
    var start = function (m) { session.len = m; session.start = performance.now(); setTimeout(function () { cv.focus({ preventScroll: true }); }, 50); if (m === 0) whisper("No timer. Stay as long as you like."); };
    if (params.get("len") != null) start(+params.get("len") || 0);
    else Q.pickLength({ title: "Welcome to the Moss Garden", text: "Rake the sand, move stones, and dig paths with the trowel so the spring can find its way. Would you like a gentle timer?", lengths: [5, 10, 30], open: true, last: 0 }).then(start);
  });

  // test hooks (used by the Playwright checks; nothing on screen)
  window.__MG = { S: S, L: function () { return L; }, sim: function (sec) { for (var t = 0; t < sec; t += .1) sim(.1); }, rake: function (a, b, hd) { remember(); rakeLine.started = false; rakeLine(a, b, hd == null ? head : hd); }, g2scr: g2scr, idx: idx,
    dist: dist, blocked: blocked, send: sendWanderer, W: function () { return W; }, compost: compost, place: function (k, x, y, r) { var o = { id: uid++, k: k, x: x, y: y, r: r || 0 }; S.objs.push(o); return o; }, lab: lab, setHead: setHead, enc: enc, hist: function () { return hist.length; }, art: function () { return Object.keys(art).filter(function (k) { return art[k] && k[0] !== "_"; }); }, session: session, endCard: endCard, computeBlocked: computeBlocked };
})();
