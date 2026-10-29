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
    fern: { art: "fern", w: 96, h: 96 }, statue: { art: "gremlin-statue", w: 96, h: 96 }, boat: { art: "leaf-boat", w: 64, h: 64, floats: true }
  };
  var DEFAULT_STONES = [["stone1", 27.5, 7.5], ["stone2", 12.5, 14.5], ["stone3", 19.5, 4.5], ["stone2", 33.5, 15.5], ["stone3", 7.5, 7.5], ["stone1", 22.5, 16.5], ["stone3", 35.5, 4.5]];

  /* ---------- state ---------- */
  var S = { h: new Float32Array(N), t: new Uint8Array(N), d: new Uint8Array(N), moss: new Float32Array(N), fill: new Float32Array(N), objs: [] };
  var dist = new Int16Array(N), blocked = new Uint8Array(N), head = 1, hist = [], uid = 1;
  var art = {}, sprites = {}, cv = document.getElementById("mg"), ctx = cv.getContext("2d");
  var L = {};   // layout
  var dirty = { groove: true, moss: true }, changed = false;
  function idx(x, y) { return y * COLS + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  function isSource(i) { return i === 0 || i === 1 || i === COLS; }
  function channel(i) { return S.h[i] < -0.4; }

  function freshState() {
    S.h.fill(0); S.t.fill(0); S.d.fill(0); S.moss.fill(0); S.fill.fill(0);
    S.objs = DEFAULT_STONES.map(function (s) { return { id: uid++, k: s[0], x: s[1], y: s[2] }; });
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (p) { var i = idx(p[0], p[1]); S.h[i] = -1.6; S.t[i] = 2; });   // the little spring pool
    for (var x = 2; x < 5; x++) { var i = idx(x, 1); S.h[i] = -1; S.t[i] = 1; S.d[i] = 0; }   // a short starter groove
    dirty.groove = dirty.moss = true;
  }
  function ensureSpring() { [[0, 0], [1, 0], [0, 1]].forEach(function (p) { var i = idx(p[0], p[1]); if (S.h[i] > -1) { S.h[i] = -1.6; S.t[i] = 2; } }); }

  /* ---------- history: about 30 steps ---------- */
  function snap() { return { h: S.h.slice(), t: S.t.slice(), d: S.d.slice(), moss: S.moss.slice(), objs: JSON.parse(JSON.stringify(S.objs)) }; }
  function remember() { hist.push(snap()); if (hist.length > 30) hist.shift(); }
  function undo() {
    var s = hist.pop(); if (!s) { whisper("Nothing to undo just now."); return; }
    S.h = s.h; S.t = s.t; S.d = s.d; S.moss = s.moss; S.objs = s.objs; hand = null; drag = null;
    dirty.groove = dirty.moss = true; touched(); whisper("Undone.");
  }

  /* ---------- saving (compact strings) ---------- */
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function enc() {
    var td = "", hh = "", mm = "";
    for (var i = 0; i < N; i++) { td += B64[S.t[i] * 16 + S.d[i]]; hh += B64[Math.round(Math.min(2, -S.h[i]) * 8)]; mm += B64[Math.round(Math.max(0, Math.min(1, S.moss[i])) * 63)]; }
    return { v: 1, cols: COLS, rows: ROWS, td: td, h: hh, m: mm, head: head, objs: S.objs.map(function (o) { return [o.k, +o.x.toFixed(2), +o.y.toFixed(2)]; }) };
  }
  function dec(D) {
    if (!D || D.v !== 1 || D.cols !== COLS || D.rows !== ROWS || typeof D.td !== "string" || D.td.length !== N) return false;
    for (var i = 0; i < N; i++) { var a = B64.indexOf(D.td[i]); S.t[i] = Math.max(0, Math.min(2, a >> 4)); S.d[i] = a & 15; S.h[i] = -B64.indexOf(D.h[i]) / 8; S.moss[i] = B64.indexOf(D.m[i]) / 63; }
    S.objs = (D.objs || []).filter(function (o) { return KINDS[o[0]]; }).slice(0, 80).map(function (o) { return { id: uid++, k: o[0], x: clampX(+o[1] || 1), y: clampY(+o[2] || 1) }; });
    if (D.head === 0 || D.head === 1 || D.head === 2) setHead(D.head, true);
    S.fill.fill(0); ensureSpring(); dirty.groove = dirty.moss = true; return true;
  }
  var saveSoon = Q.debounce(function () { if (!changed) return; changed = false; Q.save(GAME, enc()); }, 4000);
  function touched() { changed = true; saveSoon(); }
  window.addEventListener("pagehide", function () { if (changed) { try { localStorage.setItem("gremlin-quiet-" + GAME + "-" + ((Q.session() || {}).name || "guest").toLowerCase(), JSON.stringify(enc())); } catch (e) {} } });

  /* ---------- art + soft procedural placeholders ---------- */
  var ART_NAMES = ["sand-texture", "moss-overlay", "water-texture", "garden-frame", "garden-frame-portrait", "rake-stamp-fine", "rake-stamp-swirl", "rake-stamp-smooth",
    "stone-1", "stone-2", "stone-3", "stepping-stone", "bridge-plank", "lantern", "lantern-glow", "moss-clump", "fern", "gremlin-statue", "leaf-boat",
    "icon-rake-fine", "icon-rake-swirl", "icon-rake-smooth", "icon-bridge-plank", "icon-stepping-stone", "icon-lantern", "icon-moss-clump", "icon-fern", "icon-gremlin-statue", "icon-leaf-boat", "icon-undo", "icon-fresh-garden"];
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
    return c;
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
  function scr2g(px, py) { var dx = (px - L.ox) / L.s - L.gx0, dy = (py - L.oy) / L.s - L.gy0; return L.tr ? [dy / L.T, dx / L.T] : [dx / L.T, dy / L.T]; }
  function g2scr(x, y) { var d = g2d(x, y); return [L.ox + d[0] * L.s, L.oy + d[1] * L.s]; }
  function clampX(x) { return Math.max(.6, Math.min(COLS - .6, x)); }
  function clampY(y) { return Math.max(.6, Math.min(ROWS - .6, y)); }

  /* ---------- the rake ---------- */
  function rakeCell(x, y, hd, ang) {
    if (!inb(x, y)) return; var i = idx(x, y); if (blocked[i]) return;
    if (hd === 0) { if (isSource(i)) return; S.h[i] = Math.min(0, S.h[i] * .2 + 0); if (S.h[i] > -.3) { S.h[i] = 0; S.t[i] = 0; } return; }
    if (hd === 1) { if (S.t[i] !== 2) { S.t[i] = 1; S.d[i] = ang; } S.h[i] = Math.min(S.h[i], -1); }
    if (hd === 2) { S.t[i] = 2; S.d[i] = ang; S.h[i] = Math.min(S.h[i], -1.25); }
  }
  function rakeAt(gx, gy, hd, ang) {
    var cx = Math.floor(gx), cy = Math.floor(gy);
    if (hd === 1) rakeCell(cx, cy, 1, ang);
    else { var r = hd === 2 ? 1 : 1.2; for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++) { var dx = x + .5 - gx, dy = y + .5 - gy; if (dx * dx + dy * dy <= r * r + .1) rakeCell(x, y, hd, ang); } }
    if (hd === 2) { var ci = inb(cx, cy) ? idx(cx, cy) : -1; if (ci >= 0 && !blocked[ci]) S.h[ci] = Math.min(S.h[ci], -1.6); }   // swirls dig a little dip that pools
    dirty.groove = true;
  }
  function rakeLine(a, b, hd) {
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy); if (len < .01 && rakeLine.started) return;
    var ang = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % Math.PI) / Math.PI * 16) % 16;   // 16 directions over 180 degrees
    var n = Math.max(1, Math.ceil(len / .25));
    for (var k = 0; k <= n; k++) rakeAt(a[0] + dx * k / n, a[1] + dy * k / n, hd, ang);
    rakeLine.started = true; touched();
  }

  /* ---------- water: a small, stable grid sim ---------- */
  var N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]], flowing = 0;
  function computeBlocked() {
    blocked.fill(0);
    S.objs.forEach(function (o) { var K = KINDS[o.k]; if (!K.stone) return; var r = K.r * .85;
      for (var y = Math.floor(o.y - r - 1); y <= o.y + r + 1; y++) for (var x = Math.floor(o.x - r - 1); x <= o.x + r + 1; x++) { if (!inb(x, y)) continue; var dx = x + .5 - o.x, dy = y + .5 - o.y; if (dx * dx + dy * dy < r * r) blocked[idx(x, y)] = 1; } });
  }
  function bfs() {
    dist.fill(-1); var q = [0, 1, COLS], h = 0; q.forEach(function (i) { dist[i] = 0; });
    while (h < q.length) { var i = q[h++], x = i % COLS, y = (i / COLS) | 0;
      for (var k = 0; k < 8; k++) { var nx = x + N8[k][0], ny = y + N8[k][1]; if (!inb(nx, ny)) continue; var j = idx(nx, ny); if (dist[j] >= 0 || !channel(j) || blocked[j]) continue;
        if (k >= 4 && !channel(idx(x + N8[k][0], y)) && !channel(idx(x, y + N8[k][1]))) { /* diagonal step: allowed, grooves drawn at an angle are diagonal */ }
        dist[j] = dist[i] + 1; q.push(j); } }
  }
  function sim(dt) {
    computeBlocked(); bfs(); flowing = 0;
    var nf = S.fill.slice();
    for (var i = 0; i < N; i++) {
      var ch = channel(i) && !blocked[i];
      if (!ch) { nf[i] = Math.max(0, S.fill[i] - dt * .6); continue; }
      if (isSource(i)) { nf[i] = 1; continue; }
      if (dist[i] < 0) { nf[i] = Math.max(0, S.fill[i] - dt * .25); continue; }   // cut off: it drains away slowly
      if (S.fill[i] >= 1) continue;
      var x = i % COLS, y = (i / COLS) | 0, fed = false;
      for (var k = 0; k < 8 && !fed; k++) { var nx = x + N8[k][0], ny = y + N8[k][1]; if (inb(nx, ny)) { var j = idx(nx, ny); if (S.fill[j] >= .999 && dist[j] >= 0 && dist[j] < dist[i] + 1) fed = true; } }
      if (fed) { var deep = Math.max(0, -S.h[i] - 1); nf[i] = Math.min(1, S.fill[i] + dt / (1 + deep * 1.2)); flowing++; }   // ~1 tile a second; dips take a little longer (they pool)
    }
    S.fill = nf;
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
  var grooveC = mk(COLS * LT, ROWS * LT), mossC = mk(COLS * LT, ROWS * LT), waterC = mk(COLS * LT, ROWS * LT), mossMask = mk(COLS * LT, ROWS * LT);
  function drawGrooves() {
    var g = grooveC.getContext("2d"); g.clearRect(0, 0, grooveC.width, grooveC.height); g.lineCap = "round"; g.lineJoin = "round";
    function each(fn) { for (var i = 0; i < N; i++) if (S.t[i] || S.h[i] < -.2) fn(i, i % COLS, (i / COLS) | 0); }
    // soft trench shading: connect neighbouring groove cells
    [["rgba(150,128,92,.30)", 1.0, 0, 2], ["rgba(178,158,120,.45)", .72, 0, 1], ["rgba(255,250,236,.55)", .16, -.22, 1]].forEach(function (pass) {
      g.strokeStyle = pass[0]; g.fillStyle = pass[0];
      each(function (i, x, y) { if (!S.t[i]) return; var w = (S.t[i] === 2 ? 1.15 : .62) * pass[1] * LT, cx = (x + .5) * LT, cy = (y + .5 + pass[2] * .3) * LT;
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
    dirty.groove = false;
  }
  var mossPat = null;
  function drawMoss() {
    var m = mossMask.getContext("2d"); m.clearRect(0, 0, mossMask.width, mossMask.height); m.filter = "blur(6px)";
    for (var i = 0; i < N; i++) { var v = S.moss[i]; if (v < .04) continue; var x = (i % COLS + .5) * LT, y = (((i / COLS) | 0) + .5) * LT, r = LT * (.45 + v * .55);
      var gr = m.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(0,0,0," + Math.min(.95, v * 1.1) + ")"); gr.addColorStop(1, "rgba(0,0,0,0)"); m.fillStyle = gr; m.fillRect(x - r, y - r, r * 2, r * 2); }
    m.filter = "none";
    var g = mossC.getContext("2d"); g.clearRect(0, 0, mossC.width, mossC.height); g.globalCompositeOperation = "source-over"; g.drawImage(mossMask, 0, 0);
    g.globalCompositeOperation = "source-in"; if (!mossPat) mossPat = g.createPattern(mossTex(), "repeat"); g.fillStyle = mossPat; g.fillRect(0, 0, mossC.width, mossC.height); g.globalCompositeOperation = "source-over";
    dirty.moss = false;
  }
  var waterPat = null;
  function drawWater(time) {
    var g = waterC.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, waterC.width, waterC.height); g.globalCompositeOperation = "source-over";
    g.lineCap = "round"; g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.filter = "blur(3px)";
    for (var i = 0; i < N; i++) {
      var f = S.fill[i]; if (f < .02) continue; var x = i % COLS, y = (i / COLS) | 0, cx = (x + .5) * LT, cy = (y + .5) * LT, deep = Math.max(0, -S.h[i] - 1);
      g.globalAlpha = Math.min(1, .35 + f * .65);
      var r = LT * (.34 + deep * .5) * (.4 + .6 * f); g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      for (var k = 0; k < 8; k++) { var nx = x + N8[k][0], ny = y + N8[k][1]; if (!inb(nx, ny)) continue; var j = idx(nx, ny); if (S.fill[j] < .02) continue;
        var fj = S.fill[j], reach;
        if (f >= .999 && fj >= .999) { if (j < i) continue; reach = 1; }
        else if (fj >= .999) reach = f; else continue;   // a filling cell grows out of its full neighbour
        g.lineWidth = LT * .56; g.beginPath(); g.moveTo((nx + .5) * LT, (ny + .5) * LT); g.lineTo((nx + .5) * LT + (cx - (nx + .5) * LT) * reach, (ny + .5) * LT + (cy - (ny + .5) * LT) * reach); g.stroke(); }
    }
    g.filter = "none"; g.globalAlpha = 1; g.globalCompositeOperation = "source-in";
    if (!waterPat) waterPat = g.createPattern(waterTex(), "repeat");
    var off = Q.still() ? 0 : (time / 1000 * 6) % 512; g.translate(off, off * .4); g.fillStyle = waterPat; g.fillRect(-off, -off, waterC.width + 512, waterC.height + 512);
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
    if (dirty.groove) drawGrooves(); if (dirty.moss) drawMoss(); drawWater(time);
    var g = ctx; g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    var bg = g.createLinearGradient(0, 0, 0, L.H); bg.addColorStop(0, "#5f7650"); bg.addColorStop(1, "#4c6042"); g.fillStyle = bg; g.fillRect(0, 0, L.W, L.H);
    g.translate(L.ox, L.oy); g.scale(L.s, L.s);
    // sand
    if (!sandPat) sandPat = g.createPattern(sandTex(), "repeat");
    g.save(); g.fillStyle = PAL.sand; g.fillRect(L.R[0] - 30, L.R[1] - 30, L.R[2] + 60, L.R[3] + 60); g.translate(L.R[0], L.R[1]); g.scale(.75, .75); g.fillStyle = sandPat; g.fillRect(-40, -40, L.R[2] / .75 + 80, L.R[3] / .75 + 80); g.restore();
    // garden-space layers
    g.save(); g.translate(L.gx0, L.gy0); if (L.tr) g.transform(0, 1, 1, 0, 0, 0); g.scale(L.T / LT, L.T / LT);
    g.drawImage(mossC, 0, 0); g.drawImage(grooveC, 0, 0); g.globalAlpha = .92; g.drawImage(waterC, 0, 0); g.globalAlpha = 1;
    g.restore();
    // objects, back to front
    var objs = S.objs.slice().sort(function (a, b) { var pa = g2d(a.x, a.y), pb = g2d(b.x, b.y); return (KINDS[a.k].floats ? 1 : 0) - (KINDS[b.k].floats ? 1 : 0) || pa[1] - pb[1]; });
    var bob = Q.still() ? 0 : Math.sin(time / 1400);
    objs.forEach(function (o) { var K = KINDS[o.k], p = g2d(o.x, o.y), sp = sprite(o.k), lift = drag && drag.o === o ? 1.06 : 1;
      if (K.glow) { g.globalAlpha = .55 + (Q.still() ? 0 : .08 * Math.sin(time / 2600)); var gs = glowSprite(); g.drawImage(gs, p[0] - 96, p[1] - 96, 192, 192); g.globalAlpha = 1; }
      g.save(); g.translate(p[0], p[1] + (K.floats && o.float ? bob * 2 : 0)); if (K.floats && o.float && !Q.still()) g.rotate(Math.sin(time / 2100 + o.id) * .08);
      g.drawImage(sp, -K.w / 2 * lift, -K.h / 2 * lift, K.w * lift, K.h * lift); g.restore(); });
    // the frame on top (inner sand area is transparent)
    g.drawImage(frameImg(), 0, 0, L.DW, L.DH);
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
  var lastG = null, pid = null;
  cv.addEventListener("pointerdown", function (e) {
    if (pid !== null) return; pid = e.pointerId; try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    cursor.show = false; var gp = scr2g(e.clientX, e.clientY);
    if (hand) { placeHand(gp); pid = null; return; }
    var o = hit(gp[0], gp[1]);
    if (o) { remember(); drag = { o: o, dx: o.x - gp[0], dy: o.y - gp[1], tx: o.x, ty: o.y, sx: o.x, sy: o.y }; return; }
    remember(); rakeDown = true; rakeLine.started = false; lastG = gp; rakeLine(gp, gp, head); sound.rake();
  });
  cv.addEventListener("pointermove", function (e) {
    if (e.pointerId !== pid) return; var gp = scr2g(e.clientX, e.clientY);
    if (drag) { drag.tx = clampX(gp[0] + drag.dx); drag.ty = clampY(gp[1] + drag.dy); drag.px = e.clientX; drag.py = e.clientY; return; }
    if (rakeDown) { rakeLine(lastG, gp, head); lastG = gp; }
  });
  function up(e) {
    if (e.pointerId !== pid) return; pid = null;
    if (drag) { endDrag(overTray(e.clientX, e.clientY)); }
    rakeDown = false;
  }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  function endDrag(toTray) {
    var o = drag.o, K = KINDS[o.k];
    if (toTray && !K.stone) { S.objs = S.objs.filter(function (x) { return x !== o; }); whisper("Back on the shelf."); }
    else if (K.stone) {   // a stone leaves a small dent where it sat
      if (Math.hypot(drag.tx - drag.sx, drag.ty - drag.sy) > .6) { var cx = Math.floor(drag.sx), cy = Math.floor(drag.sy); if (inb(cx, cy)) { var i = idx(cx, cy); if (!S.t[i]) S.h[i] = Math.min(S.h[i], -.7); } dirty.groove = true; }
      o.x = o.x; }
    drag.done = true; drag = null; touched();
  }
  // stones ease toward where you pull them; heavy ones a little slower
  function moveObjs(dt) {
    if (drag) { var o = drag.o, K = KINDS[o.k], k = K.stone ? (6 - K.heavy * 3.6) : 12; o.x += (drag.tx - o.x) * Math.min(1, dt * k); o.y += (drag.ty - o.y) * Math.min(1, dt * k); }
    S.objs.forEach(function (b) { if (b.k === "boat" && b !== (drag && drag.o) && (b.vx || b.vy)) { b.x = clampX(b.x + b.vx * dt); b.y = clampY(b.y + b.vy * dt); } });
  }

  /* ---------- the shelf (drag from the tray, or tap then tap the sand) ---------- */
  var ghost = null;
  function placeHand(gp) {
    if (!hand) return; var x = clampX(gp ? gp[0] : hand.x), y = clampY(gp ? gp[1] : hand.y);
    remember(); S.objs.push({ id: uid++, k: hand.k, x: x, y: y }); hand = null; trayOn(null); touched();
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
  cv.addEventListener("pointermove", function (e) { if (hand && pid === null && e.pointerType === "mouse") { var gp = scr2g(e.clientX, e.clientY); hand.x = gp[0]; hand.y = gp[1]; } });

  /* ---------- tools ---------- */
  function setHead(hd, quiet) {
    head = hd; document.querySelectorAll(".mg-tool").forEach(function (b) { var on = +b.dataset.head === hd; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    if (!quiet) { whisper(hd === 1 ? "Fine lines." : hd === 2 ? "Wide swirls." : "Smooth: brush lines away."); touched(); }
  }
  document.querySelectorAll(".mg-tool").forEach(function (b) { b.addEventListener("click", function () { setHead(+b.dataset.head); }); });
  document.getElementById("mg-undo").addEventListener("click", undo);
  document.getElementById("mg-fresh").addEventListener("click", fresh);
  function fresh() {
    Q.card({ title: "Smooth it all out?", text: "The stones go back to their places and the sand is raked smooth. You can undo this.", buttons: [
      { label: "Keep my garden", fn: function () {} },
      { label: "Smooth it out", primary: true, id: "mg-fresh-yes", fn: function () { remember(); freshState(); touched(); whisper("A fresh garden."); } }] });
  }

  /* ---------- keyboard: arrow cursor, Space to pick up / put down, Enter to lower the rake ---------- */
  document.addEventListener("keydown", function (e) {
    if (document.querySelector(".q-cardwrap")) return;
    var tag = (e.target.tagName || "").toLowerCase(); if (tag === "input") return;
    var k = e.key, mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if ((k === "z" || k === "Z") && !e.altKey) { e.preventDefault(); undo(); return; }
    if (k === "1" || k === "2" || k === "3") { setHead(k === "1" ? 1 : k === "2" ? 2 : 0); return; }
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
    if (k === "Delete" || k === "Backspace") { if (drag && !KINDS[drag.o.k].stone) { var dd2 = drag; drag = null; S.objs = S.objs.filter(function (x) { return x !== dd2.o; }); touched(); whisper("Back on the shelf."); } }
  });

  /* ---------- whispers, soft controls, time, sound ---------- */
  var wT; function whisper(t) { var w = document.getElementById("mg-whisper"); w.textContent = t; w.classList.add("on"); clearTimeout(wT); wT = setTimeout(function () { w.classList.remove("on"); }, 3200); }
  Q.softControls(document.getElementById("q-soft"));
  Q.bindStill(document.getElementById("mg-still"));
  var session = { len: 0, start: 0, ended: false };
  function elapsed() { return (performance.now() - session.start) * Q.timeScale; }
  document.getElementById("mg-time").addEventListener("click", function () { whisper(Q.timeLeftSentence(session.len ? Math.max(0, session.len * 60000 - elapsed()) : null)); });
  var sound = { trickle: null,
    toggle: function () { var on = !Q.sound.on; if (on && !this.trickle) { this.trickle = Q.sound.noise(900); this.wind = Q.sound.noise(320); if (this.wind) Q.sound.ramp(this.wind.gain, .12, 3); } Q.sound.set(on);
      var b = document.getElementById("mg-sound"); b.textContent = "Sound: " + (on ? "on" : "off"); b.setAttribute("aria-pressed", on); },
    tick: function () { if (this.trickle && Q.sound.on) Q.sound.ramp(this.trickle.gain, Math.min(.35, flowing * .05 + (S.fill[0] ? .04 : 0)), 2); },
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
    moveObjs(Math.min(.1, dt));
    sTick += dt; if (sTick > 1) { sTick = 0; sound.tick(); }
    if (session.len && !session.ended && elapsed() >= session.len * 60000) endCard();
    draw(now); requestAnimationFrame(frame);
  }
  window.addEventListener("resize", function () { layout(); });

  /* ---------- tray icons: Moth's icons, else drawn from the sprites ---------- */
  function setIcons() {
    document.querySelectorAll(".mg-ic").forEach(function (s) {
      var n = s.dataset.icon, a = art["icon-" + n];
      if (a) { s.style.backgroundImage = "url(" + a.src + ")"; return; }
      var kind = Object.keys(KINDS).filter(function (k) { return KINDS[k].art === n; })[0];
      var c = mk(96, 96), g = c.getContext("2d");
      if (kind) { var sp = sprite(kind), K = KINDS[kind], sc = Math.min(88 / K.w, 88 / K.h); g.drawImage(sp, 48 - K.w * sc / 2, 48 - K.h * sc / 2, K.w * sc, K.h * sc); }
      else { g.strokeStyle = PAL.ink; g.lineWidth = 6; g.lineCap = "round"; g.beginPath();
        if (n === "undo") { g.arc(50, 52, 24, Math.PI * 1.1, Math.PI * 2.4); g.moveTo(26, 30); g.lineTo(26, 48); g.lineTo(42, 46); }
        else if (n === "fresh-garden") { for (var r = 1; r < 4; r++) { g.moveTo(18, 30 + r * 12); g.bezierCurveTo(40, 22 + r * 12, 56, 38 + r * 12, 78, 30 + r * 12); } }
        else { g.moveTo(20, 76); g.lineTo(76, 20); var tines = n === "rake-fine" ? 5 : n === "rake-swirl" ? 3 : 0; for (var t = 0; t < tines; t++) { g.moveTo(40 + t * 9, 20 + t * 2); g.lineTo(52 + t * 9, 32 + t * 2); } if (!tines) { g.moveTo(56, 12); g.lineTo(84, 40); } }
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
    else Q.pickLength({ title: "Welcome to the Moss Garden", text: "Rake, move stones, and let the spring find its way. Would you like a gentle timer?", lengths: [5, 10, 30], open: true, last: 0 }).then(start);
  });

  // test hooks (used by the Playwright checks; nothing on screen)
  window.__MG = { S: S, L: function () { return L; }, sim: function (sec) { for (var t = 0; t < sec; t += .1) sim(.1); }, rake: function (a, b, hd) { remember(); rakeLine.started = false; rakeLine(a, b, hd == null ? head : hd); }, g2scr: g2scr, idx: idx,
    dist: dist, blocked: blocked, enc: enc, hist: function () { return hist.length; }, art: function () { return Object.keys(art).filter(function (k) { return art[k] && k[0] !== "_"; }); }, session: session, endCard: endCard, computeBlocked: computeBlocked };
})();
