/* The Breathing Pond (concept 1). Hold anywhere (or Space) to breathe in: a ripple swells. Let go to breathe out: it softens.
   A faint 4s-in / 6s-out guide ring sits at the centre. Untouched, the pond keeps breathing on its own.
   5 min = midday. 10 min drifts to golden hour. 30 min: afternoon -> dusk -> night (fireflies, slower koi; the guide fades after ~10 min).
   Final minute: the light dims, one koi comes close, a lily blooms. No points, no counting, no splashes, no fast fish. */
(function () {
  "use strict";
  var Q = window.Quiet, GAME = "breathing-pond", ART = "art/";
  var cv = document.getElementById("bp"), ctx = cv.getContext("2d"), art = {}, L = {};
  var IN = 4, OUT = 6;   // guide seconds
  var NAMES = ["pond-midday", "pond-golden", "pond-dusk", "pond-night", "pond-midday-portrait", "pond-golden-portrait", "pond-dusk-portrait", "pond-night-portrait",
    "caustics", "ripple-ring", "breath-ring", "koi-orange", "koi-cream", "koi-calico", "koi-orange-segments", "koi-cream-segments", "koi-calico-segments",
    "lilypad-1", "lilypad-2", "lilypad-3", "lily-bud", "lily-bloom", "lily-bloom-strip", "dragonfly", "dragonfly-2", "leaf-1", "leaf-2", "leaf-3", "firefly"];
  var TIMES = ["midday", "golden", "dusk", "night"];
  var GRADE = { midday: ["#6FB0A8", "#3F6B5C"], golden: ["#C9B67A", "#5E7A55"], dusk: ["#8C86A8", "#4F5F86"], night: ["#33415F", "#1E2A40"] };
  function mk(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- soft painted placeholders (only for art that hasn't arrived) ---------- */
  var ph = {};
  function bgPlaceholder(time, port) {
    var k = time + (port ? "-p" : ""); if (ph[k]) return ph[k];
    var W = port ? 1080 : 1920, H = port ? 1920 : 1080, c = mk(W / 2, H / 2), g = c.getContext("2d"), col = GRADE[time];
    g.fillStyle = "#4f6b45"; g.fillRect(0, 0, W, H);
    var gr = g.createRadialGradient(W / 4, H / 4, 10, W / 4, H / 4, Math.max(W, H) / 3.2); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]);
    g.fillStyle = gr; g.beginPath(); g.ellipse(W / 4, H / 4.1, W * .36 / 1, H * .36, 0, 0, 7); g.fill();
    for (var i = 0; i < 40; i++) { var a = i / 40 * 6.28, r = 1 + Math.sin(i * 3.1) * .05; g.fillStyle = i % 3 ? "rgba(110,139,78,.9)" : "rgba(154,148,168,.9)"; g.beginPath(); g.ellipse(W / 4 + Math.cos(a) * W * .4 * r, H / 4.1 + Math.sin(a) * H * .4 * r, 40, 30, a, 0, 7); g.fill(); }
    return (ph[k] = c);
  }
  function spritePh(name) {
    if (ph[name]) return ph[name]; var c, g;
    if (/^koi-/.test(name)) { var col = name.indexOf("orange") > 0 ? "#E8A05C" : name.indexOf("cream") > 0 ? "#F4EAD8" : "#F4EAD8"; c = mk(256, 128); g = c.getContext("2d");
      g.fillStyle = col; g.beginPath(); g.ellipse(150, 64, 80, 26, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(80, 64); g.quadraticCurveTo(40, 30, 20, 40); g.quadraticCurveTo(36, 64, 20, 88); g.quadraticCurveTo(40, 98, 80, 64); g.globalAlpha = .8; g.fill(); g.globalAlpha = 1;
      if (name.indexOf("calico") > 0) { g.fillStyle = "#E8A05C"; g.beginPath(); g.ellipse(170, 58, 22, 14, .3, 0, 7); g.fill(); g.fillStyle = "#3E4A3A"; g.beginPath(); g.ellipse(130, 70, 12, 8, 0, 0, 7); g.fill(); } }
    else if (/^lilypad/.test(name)) { c = mk(192, 192); g = c.getContext("2d"); var lg = g.createRadialGradient(90, 90, 4, 96, 96, 86); lg.addColorStop(0, "#9cc074"); lg.addColorStop(1, "#6a9150"); g.fillStyle = lg; g.beginPath(); g.moveTo(96, 96); g.arc(96, 96, 80, .25, 6.1); g.closePath(); g.fill(); }
    else if (name === "lily-bud" || name === "lily-bloom") { c = mk(192, 192); g = c.getContext("2d"); var n = name === "lily-bud" ? 3 : 8; for (var i = 0; i < n; i++) { g.save(); g.translate(96, 96); g.rotate(i / n * 6.28); g.fillStyle = i % 2 ? "#F4EAD8" : "#f5c9c0"; g.beginPath(); g.ellipse(0, -30, 16, 34, 0, 0, 7); g.fill(); g.restore(); } g.fillStyle = "#F2C48D"; g.beginPath(); g.arc(96, 96, 12, 0, 7); g.fill(); }
    else if (/^leaf/.test(name)) { c = mk(96, 96); g = c.getContext("2d"); g.fillStyle = "#c98f4f"; g.beginPath(); g.moveTo(10, 50); g.quadraticCurveTo(48, 6, 88, 44); g.quadraticCurveTo(48, 90, 10, 50); g.fill(); }
    else if (/^dragonfly/.test(name)) { c = mk(128, 128); g = c.getContext("2d"); g.fillStyle = "rgba(240,248,255,.55)"; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { g.beginPath(); g.ellipse(64 + s[0] * 26, 54 + s[1] * 8, 26, 8, s[0] * s[1] * .2, 0, 7); g.fill(); }); g.fillStyle = "#4F5F86"; g.fillRect(61, 34, 6, 64); }
    else if (name === "firefly" || name === "ripple-ring" || name === "breath-ring") { var S = name === "firefly" ? 64 : 512; c = mk(S, S); g = c.getContext("2d");
      if (name === "firefly") { var fg = g.createRadialGradient(32, 32, 0, 32, 32, 32); fg.addColorStop(0, "rgba(255,240,180,1)"); fg.addColorStop(.25, "rgba(242,196,141,.6)"); fg.addColorStop(1, "rgba(242,196,141,0)"); g.fillStyle = fg; g.fillRect(0, 0, 64, 64); }
      else { g.strokeStyle = "rgba(244,234,216,.85)"; g.lineWidth = name === "breath-ring" ? 6 : 10; g.filter = "blur(3px)"; g.beginPath(); g.arc(256, 256, 230, 0, 7); g.stroke(); } }
    else if (name === "caustics") { c = mk(512, 512); g = c.getContext("2d"); g.strokeStyle = "rgba(255,255,240,.18)"; g.lineWidth = 3; for (var j = 0; j < 90; j++) { var x = (j * 97) % 512, y = (j * 61) % 512; g.beginPath(); g.ellipse(x, y, 20 + j % 17, 12 + j % 9, j, 0, 5); g.stroke(); } }
    return (ph[name] = c);
  }
  function A(name) { return art[name] || spritePh(name); }
  function bg(time) { return art["pond-" + time + (L.port ? "-portrait" : "")] || bgPlaceholder(time, L.port); }

  /* ---------- layout: cover-fit 1920x1080 (or 1080x1920 portrait) ---------- */
  function layout() {
    var dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight, port = H > W * 1.05;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px";
    var DW = port ? 1080 : 1920, DH = port ? 1920 : 1080, s = Math.max(W / DW, H / DH);
    var vis = { x0: (DW * s - W) / 2 / s, y0: (DH * s - H) / 2 / s }; vis.x1 = DW - vis.x0; vis.y1 = DH - vis.y0;
    // the water: an ellipse inside the painting's stone ring, clipped to what's on screen
    var cx = DW / 2, cy = port ? DH * .5 : DH * .48, rx = port ? DW * .36 : DW * .34, ry = port ? DH * .36 : DH * .36;
    rx = Math.min(rx, (vis.x1 - vis.x0) / 2 - 40); ry = Math.min(ry, (vis.y1 - vis.y0) / 2 - 40);
    L = { dpr: dpr, W: W, H: H, DW: DW, DH: DH, s: s, ox: (W - DW * s) / 2, oy: (H - DH * s) / 2, port: port, cx: cx, cy: cy, rx: rx, ry: ry };
  }
  function at(u, v) { return [L.cx + u * L.rx, L.cy + v * L.ry]; }   // ellipse coords -> design px
  function toDesign(px, py) { return [(px - L.ox) / L.s, (py - L.oy) / L.s]; }

  /* ---------- the pond's things ---------- */
  var PADS = [[-.78, -.38, 1, 0, 170], [-.86, .3, 2, 1.2, 150], [-.38, .82, 3, 2.1, 140], [.72, .62, 1, 3.3, 160], [.86, -.05, 2, .7, 130], [.4, -.82, 3, 4.4, 120]];
  var BUD = [-.62, -.26];   // the lily that blooms at the end sits by the first pad
  var leaves = [{ n: "leaf-1", u: .2, v: -.55, a: .4 }, { n: "leaf-2", u: -.3, v: .5, a: 2 }, { n: "leaf-3", u: .55, v: .25, a: 4 }];
  var KOI = ["orange", "cream", "calico"].map(function (k, i) { return { k: k, x: 0, y: 0, a: i * 2.1, sp: 20, tx: 0, ty: 0, ph: i * 1.7, size: [220, 200, 210][i] }; });
  var ripples = [], fireflies = [];
  function placeKoi() { KOI.forEach(function (f, i) { var p = at([-.3, .35, .1][i], [-.2, .1, .45][i]); f.x = p[0]; f.y = p[1]; newTarget(f); }); }
  function newTarget(f) { var a = Math.random() * 6.28, r = .25 + Math.random() * .55; f.tu = Math.cos(a) * r; f.tv = Math.sin(a) * r; }

  /* ---------- breath ---------- */
  var B = { held: false, v: 0, at: null, auto: true, lastTouch: -1e9, phase: 0, prevDir: 0 };
  function press(x, y) {
    B.held = true; B.lastTouch = clock; B.auto = false; B.at = x != null ? toDesign(x, y) : null;
    whisperOff(); sound.inhale();
  }
  function release() {
    if (!B.held) return; B.held = false; B.lastTouch = clock;
    var p = B.at || [L.cx, L.cy]; ripple(p[0], p[1], .4 + B.v * .6); sound.exhale();
  }
  function ripple(x, y, str) { ripples.push({ x: x, y: y, t: 0, life: 4 + str * 2, str: str }); if (ripples.length > 8) ripples.shift(); }
  cv.addEventListener("pointerdown", function (e) { try { cv.setPointerCapture(e.pointerId); } catch (x) {} press(e.clientX, e.clientY); });
  cv.addEventListener("pointerup", release); cv.addEventListener("pointercancel", release); cv.addEventListener("lostpointercapture", release);
  document.addEventListener("keydown", function (e) { if (e.key === " " && !document.querySelector(".q-cardwrap") && (e.target === cv || e.target === document.body)) { e.preventDefault(); if (!e.repeat) press(null); } });
  document.addEventListener("keyup", function (e) { if (e.key === " ") { e.preventDefault(); release(); } });

  /* ---------- session timeline ---------- */
  var S = { len: 5, start: 0, ended: false, extra: false }, clock = 0;
  function elapsedMin() { return clock / 60; }
  function lightWeights() {   // weights for midday/golden/dusk/night; every change is a slow cross-fade (minutes, never under 30s)
    var m = elapsedMin(), w = { midday: 0, golden: 0, dusk: 0, night: 0 };
    if (S.len <= 5) { w.midday = 1; }
    else if (S.len <= 10) { var t = ease((m - 2) / 7); w.midday = 1 - t; w.golden = t; }
    else {
      if (m < 10) { var a = ease((m - 1) / 8); w.midday = 1 - a; w.golden = a; }
      else if (m < 20) { var b = ease((m - 11) / 8); w.golden = 1 - b; w.dusk = b; }
      else { var c = ease((m - 21) / 7); w.dusk = 1 - c; w.night = c; }
    }
    if (S.extra) { /* staying longer: hold the last light */ }
    return w;
  }
  function endingT() { if (!S.len) return 0; return clamp((elapsedMin() - (S.len - 1)) / 1, 0, 1); }   // 0..1 over the final 60s
  function guideAlpha() { var m = elapsedMin(); if (S.len >= 30) return .42 * (1 - ease((m - 10) / 1.5)); return .42; }

  /* ---------- update ---------- */
  function update(dt) {
    clock += dt;
    // breath value: in over ~4s, out over ~6s, eased
    var guideT = clock % (IN + OUT), guideIn = guideT < IN, guideV = guideIn ? ease(guideT / IN) : 1 - ease((guideT - IN) / OUT);
    if (!B.held && clock - B.lastTouch > 12) B.auto = true;   // untouched: the pond breathes on its own
    var target = B.held ? 1 : B.auto ? guideV : 0;
    B.v += (target - B.v) * Math.min(1, dt * (target > B.v ? .55 : .38));
    if (B.auto) { var dir = guideIn ? 1 : -1; if (B.prevDir === 1 && dir === -1) ripple(L.cx, L.cy, .35); B.prevDir = dir; }
    ripples.forEach(function (r) { r.t += dt; }); ripples = ripples.filter(function (r) { return r.t < r.life; });
    // koi: about 20px/s (slower at night and in the ending); they drift a little toward the breath and ease away
    var w = lightWeights(), end = endingT(), still = Q.still();
    KOI.forEach(function (f, i) {
      var sp = 20 * (1 - .4 * w.night) * (1 - .5 * end); f.ph += dt * (1.2 + sp / 40);
      if (still) return;
      var tp = at(f.tu, f.tv); if (i === 0 && end > 0) { tp = [L.cx + L.rx * .12, L.cy + L.ry * .12]; sp *= .8; }
      var bx = (B.at ? B.at[0] : L.cx), by = (B.at ? B.at[1] : L.cy);
      var dx = tp[0] - f.x + (bx - f.x) * .25 * B.v, dy = tp[1] - f.y + (by - f.y) * .25 * B.v;
      var want = Math.atan2(dy, dx), da = ((want - f.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      f.a += clamp(da, -.35 * dt, .35 * dt);   // slow turns
      if (Math.hypot(dx, dy) < 40) { if (i === 0 && end > 0) { sp *= .2; } else newTarget(f); }
      f.x += Math.cos(f.a) * sp * dt; f.y += Math.sin(f.a) * sp * dt;
    });
    leaves.forEach(function (l, i) { if (still) return; l.u += Math.cos(clock * .02 + i) * .0006 * dt * 10; l.v += Math.sin(clock * .017 + i * 2) * .0005 * dt * 10; l.a += .004 * dt; });
    // fireflies come out at night
    var want = Math.round(w.night * 14 + w.dusk * 3);
    while (fireflies.length < want) fireflies.push({ u: (Math.random() - .5) * 2.2, v: (Math.random() - .5) * 2.2, ph: Math.random() * 6, a: 0 });
    fireflies.forEach(function (f, i) { f.a = clamp(f.a + (i < want ? dt / 8 : -dt / 8), 0, 1); if (!still) { f.u += Math.sin(clock * .1 + f.ph) * .0015 * dt * 10; f.v += Math.cos(clock * .08 + f.ph) * .0012 * dt * 10; } });
    fireflies = fireflies.filter(function (f) { return f.a > 0 || fireflies.indexOf(f) < want; });
    sound.tick();
    if (S.len && !S.ended && elapsedMin() >= S.len) endCard();
  }

  /* ---------- draw ---------- */
  function koi(f, alpha) {
    var seg = art["koi-" + f.k + "-segments"], whole = A("koi-" + f.k), sc = f.size / 256;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.scale(sc, sc); ctx.translate(-128, -64);
    if (seg && !Q.still()) {   // 4 slices, head unbent, each slice toward the tail bends a little more
      ctx.drawImage(seg, 768, 0, 256, 128, 0, 0, 256, 128);
      for (var i = 2; i >= 0; i--) { var amp = .13 * (3 - i) / 3, ang = Math.sin(f.ph - (3 - i) * .9) * amp; var jx = (i + 1) * 64;
        ctx.translate(jx, 64); ctx.rotate(ang); ctx.translate(-jx, -64); ctx.drawImage(seg, i * 256, 0, 256, 128, 0, 0, 256, 128); }
    } else ctx.drawImage(whole, 0, 0, 256, 128);
    ctx.restore();
  }
  function draw() {
    var g = ctx, w = lightWeights(), end = endingT(), still = Q.still();
    g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); g.fillStyle = "#3F6B5C"; g.fillRect(0, 0, L.W, L.H);
    g.translate(L.ox, L.oy); g.scale(L.s, L.s);
    // cross-fade the four paintings (same composition, pixel for pixel)
    var first = true; TIMES.forEach(function (t) { if (w[t] <= .001) return; g.globalAlpha = first ? 1 : w[t] / (w[t] + sumBefore(t, w)); g.drawImage(bg(t), 0, 0, L.DW, L.DH); first = false; });
    g.globalAlpha = 1;
    // caustics: gentle light on the water (midday strongest)
    var cA = .22 * w.midday + .16 * w.golden + .07 * w.dusk + .02 * w.night;
    if (cA > .01) { g.save(); g.beginPath(); g.ellipse(L.cx, L.cy, L.rx * 1.05, L.ry * 1.05, 0, 0, 7); g.clip(); g.globalAlpha = cA; g.globalCompositeOperation = "screen";
      var c = A("caustics"), off = still ? 0 : (clock * 4) % 1024; for (var x = -1024; x < L.DW + 1024; x += 1024) for (var y = -1024; y < L.DH + 1024; y += 1024) g.drawImage(c, x + off, y + off * .6, 1024, 1024); g.restore(); }
    // sprites take the light of the hour (a soft brightness grade, never a flash)
    var shade = 1 - .5 * w.night - .22 * w.dusk - .06 * w.golden; g.filter = shade < .99 ? "brightness(" + shade.toFixed(3) + ") saturate(" + (1 - .3 * w.night).toFixed(3) + ")" : "none";
    // koi under the pads
    KOI.forEach(function (f) { koi(f, .92); });
    // the breath swell (where you're holding, or the centre)
    var bp = B.at || [L.cx, L.cy], rr = A("ripple-ring");
    if (B.v > .02) { var R = still ? 150 : 90 + B.v * 170; g.globalAlpha = (still ? B.v * .5 : .18 + B.v * .35); g.drawImage(rr, bp[0] - R, bp[1] - R, R * 2, R * 2); }
    ripples.forEach(function (r) { var k = r.t / r.life, R = still ? 200 : 120 + k * (260 + 200 * r.str); g.globalAlpha = (still ? Math.sin(k * Math.PI) * .35 : (1 - k) * .45) * r.str; g.drawImage(rr, r.x - R, r.y - R, R * 2, R * 2); });
    // the guide ring: 4s in, 6s out
    var ga = guideAlpha();
    if (ga > .01) { var gt = clock % (IN + OUT), gv = gt < IN ? ease(gt / IN) : 1 - ease((gt - IN) / OUT), GR = still ? 140 : 110 + gv * 70;
      g.globalAlpha = still ? ga * (.5 + gv * .5) : ga; var br = A("breath-ring"); g.drawImage(br, L.cx - GR, L.cy - GR, GR * 2, GR * 2); }
    g.globalAlpha = 1;
    // pads respond a little to the breath
    PADS.forEach(function (p, i) { var q = at(p[0], p[1]), s = p[4] * (1 + B.v * .03), rot = p[3] + (still ? 0 : Math.sin(clock * .2 + i) * .03 + B.v * .05);
      g.save(); g.translate(q[0], q[1]); g.rotate(rot); g.drawImage(A("lilypad-" + p[2]), -s / 2, -s / 2, s, s); g.restore(); });
    // the lily: a bud all session, blooming through the final minute
    var lq = at(BUD[0], BUD[1]), strip = art["lily-bloom-strip"], bs = 110;
    if (end > 0 && strip) { var fr = Math.min(5, Math.floor(ease(end * 1.3) * 6)); var nx = Math.min(5, fr + 1), mix = still ? 0 : (ease(end * 1.3) * 6) % 1;
      g.drawImage(strip, fr * 192, 0, 192, 192, lq[0] - bs / 2, lq[1] - bs / 2, bs, bs); if (nx !== fr && mix > 0) { g.globalAlpha = mix; g.drawImage(strip, nx * 192, 0, 192, 192, lq[0] - bs / 2, lq[1] - bs / 2, bs, bs); g.globalAlpha = 1; } }
    else if (end > 0) { g.globalAlpha = 1 - end; g.drawImage(A("lily-bud"), lq[0] - 40, lq[1] - 40, 80, 80); g.globalAlpha = end; g.drawImage(A("lily-bloom"), lq[0] - bs / 2, lq[1] - bs / 2, bs, bs); g.globalAlpha = 1; }
    else g.drawImage(A("lily-bud"), lq[0] - 40, lq[1] - 40, 80, 80);
    // floating leaves, a resting dragonfly
    leaves.forEach(function (l) { var q = at(l.u, l.v); g.save(); g.translate(q[0], q[1] + (still ? 0 : Math.sin(clock * .3 + l.a) * 1.5)); g.rotate(l.a); g.drawImage(A(l.n), -40, -40, 80, 80); g.restore(); });
    var dq = at(PADS[3][0], PADS[3][1]); g.save(); g.translate(dq[0] + 14, dq[1] - 10); g.rotate(-.5); g.globalAlpha = .95 * (1 - w.night * .6); g.drawImage(A("dragonfly"), -48, -48, 96, 96); g.restore(); g.globalAlpha = 1;
    g.filter = "none";
    // dim for the final minute
    if (end > 0) { g.fillStyle = "rgba(20,28,40," + (end * .32) + ")"; g.fillRect(0, 0, L.DW, L.DH); }
    // fireflies
    fireflies.forEach(function (f, i) { if (f.a <= 0) return; var q = at(f.u, f.v), tw = still ? .8 : .55 + .45 * Math.sin(clock * .7 + f.ph); g.globalAlpha = f.a * tw; g.drawImage(A("firefly"), q[0] - 36, q[1] - 36, 72, 72); });
    g.globalAlpha = 1;
  }
  function sumBefore(t, w) { var s = 0; for (var i = 0; i < TIMES.length && TIMES[i] !== t; i++) s += w[TIMES[i]]; return s; }

  /* ---------- sound: off by default, slow fades ---------- */
  var sound = { water: null,
    toggle: function () { var on = !Q.sound.on; if (on && !this.water) { this.water = Q.sound.noise(500); if (this.water) Q.sound.ramp(this.water.gain, .22, 3); } Q.sound.set(on);
      var b = document.getElementById("bp-sound"); b.textContent = "Sound: " + (on ? "on" : "off"); b.setAttribute("aria-pressed", on); prefs.sound = on; savePrefs(); },
    inhale: function () { if (this.water) Q.sound.ramp(this.water.filter.frequency, 900, 4); },
    exhale: function () { if (this.water) Q.sound.ramp(this.water.filter.frequency, 450, 6); Q.sound.tone(174.6, .025, 4); },
    tick: function () {} };
  document.getElementById("bp-sound").addEventListener("click", function () { sound.toggle(); });

  /* ---------- prefs (light only: last length + sound) ---------- */
  var prefs = { v: 1, len: 5, sound: false };
  var savePrefs = Q.debounce(function () { Q.save(GAME, prefs); }, 1500);

  /* ---------- soft controls, whisper, ending ---------- */
  Q.softControls(document.getElementById("q-soft"));
  Q.bindStill(document.getElementById("bp-still"));
  var wT; function whisper(t, ms) { var w = document.getElementById("bp-whisper"); w.textContent = t; w.classList.add("on"); clearTimeout(wT); wT = setTimeout(whisperOff, ms || 6000); }
  function whisperOff() { document.getElementById("bp-whisper").classList.remove("on"); }
  document.getElementById("bp-time").addEventListener("click", function () { whisper(Q.timeLeftSentence(S.len && !S.extra ? Math.max(0, (S.len - elapsedMin()) * 60000) : null), 4000); });
  function endCard() {
    S.ended = true; release();
    Q.card({ title: "Take this stillness with you.", buttons: [
      { label: "Stay a little longer", primary: true, id: "bp-stay", fn: function () { S.extra = true; } },
      { label: "Return to the " + (window.QUIET_ROOM_SHORT || "Quiet Room"), href: "../", id: "bp-return" }], escape: false });
  }

  /* ---------- loop + boot ---------- */
  var last = 0;
  function frame(now) { var dt = Math.min(.1, (now - last) / 1000) * Q.timeScale; last = now; if (S.started) update(dt); draw(); requestAnimationFrame(frame); }
  window.addEventListener("resize", layout);
  Q.loadArt(ART, NAMES).then(function (a) {
    art = a; layout(); placeKoi();
    return Q.load(GAME).then(function (d) { if (d && typeof d === "object") { if ([5, 10, 30].indexOf(d.len) >= 0) prefs.len = d.len; prefs.sound = !!d.sound; } });
  }).then(function () {
    requestAnimationFrame(function (t) { last = t; frame(t); });
    var qp = new URLSearchParams(location.search);
    function start(m) {
      S.len = m; S.started = true; prefs.len = m; savePrefs(); clock = (+qp.get("qat") || 0) * 60;   // qat: test-only start offset in minutes
      if (prefs.sound) sound.toggle();
      whisper("Hold anywhere, or hold Space, to breathe in. Let go to breathe out. Or just watch.", 7000); setTimeout(function () { cv.focus({ preventScroll: true }); }, 60);
    }
    if (qp.get("len")) start(+qp.get("len") || 5);
    else Q.pickLength({ title: "The Breathing Pond", text: "How long would you like to sit by the water?", lengths: [5, 10, 30], open: false, last: prefs.len }).then(start);
  });
  window.__BP = { B: B, S: S, get clock() { return clock; }, set clock(v) { clock = v; }, weights: lightWeights, ripples: function () { return ripples.length; }, koi: KOI, endingT: endingT, guideAlpha: guideAlpha,
    art: function () { return Object.keys(art).filter(function (k) { return art[k] && k[0] !== "_"; }); }, press: press, release: release, fireflies: function () { return fireflies.length; }, prefs: prefs };
})();
