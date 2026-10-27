/* QUIET GARDEN: two slow, scoreless games for the Shifting House. Original, drawn in code, no sounds.
   Registers: lantern-float, firefly-jar, attract:quiet-garden. No timers, no fail state, no prizes.
   Both use api.edgeInset so a thumb at the screen edge never covers the jar or the launch spot. */
(function () {
  "use strict";
  var A = window.GremlinArcade; if (!A) return;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  function dusk(c, W, H, top) {
    var g = c.createLinearGradient(0, top, 0, H); g.addColorStop(0, "#1d2b4a"); g.addColorStop(0.6, "#3c4a6b"); g.addColorStop(1, "#6b5a6e");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function hills(c, W, H) {
    c.fillStyle = "#1c3329"; c.beginPath(); c.moveTo(0, H);
    for (var x = 0; x <= W; x += 16) c.lineTo(x, H - 26 - Math.sin(x / 47) * 7 - Math.cos(x / 23) * 3);
    c.lineTo(W, H); c.fill();
  }
  function stars(seed, n, W, H) { var s = [], r = seed; for (var i = 0; i < n; i++) { r = (r * 9301 + 49297) % 233280; var a = r / 233280; r = (r * 9301 + 49297) % 233280; s.push([a * W, (r / 233280) * H * 0.6 + 16, i % 7]); } return s; }
  function lantern(c, x, y, a, glow) {
    c.globalAlpha = a * 0.35 * glow; c.fillStyle = "#ffd98a"; c.beginPath(); c.arc(x, y, 14, 0, 6.283); c.fill();
    c.globalAlpha = a; c.fillStyle = "#f2a65a"; c.beginPath(); c.moveTo(x - 6, y - 7); c.lineTo(x + 6, y - 7); c.lineTo(x + 8, y + 7); c.lineTo(x - 8, y + 7); c.closePath(); c.fill();
    c.fillStyle = "#ffe7b0"; c.fillRect(x - 3, y - 2, 6, 6); c.fillStyle = "#8a4b2a"; c.fillRect(x - 6, y - 8, 12, 2); c.fillRect(x - 8, y + 7, 16, 2);
    c.globalAlpha = 1;
  }

  /* ===== LANTERN FLOAT: let lanterns go; they drift up and fade into the stars. That's all. ===== */
  A.register("lantern-float", function (api) {
    var W = api.W, H = api.H, inset, spot, list, sky, said, released;
    function release(x) {
      x = clamp(x, inset, W - inset);
      list.push({ x: x, y: H - 30, vy: -api.rnd(9, 14) * (api.reduced ? 0.7 : 1), ph: Math.random() * 6.28, a: 0 });
      released++; if (list.length > 40) list.shift();
      if (!said && released === 3) { said = true; api.toast("THE SKY IS COLLECTING THEM.", 1800); }
    }
    return {
      start: function () { inset = api.edgeInset(W); spot = W / 2; list = []; sky = stars(7, 36, W, H); said = false; released = 0; api.score(0); },
      press: function (k) { if (k === "action") release(spot); },
      pointer: function (type, x) { if (type === "down") release(x); if (type === "hover" || type === "drag") spot = clamp(x, inset, W - inset); },
      update: function (dt) {
        var mv = (api.held("right") ? 1 : 0) - (api.held("left") ? 1 : 0); spot = clamp(spot + mv * 70 * dt, inset, W - inset);
        for (var i = list.length - 1; i >= 0; i--) {
          var l = list[i]; l.y += l.vy * dt; l.ph += dt * 0.8; l.x += Math.sin(l.ph) * (api.reduced ? 2 : 6) * dt;
          l.a = l.y > api.top + 40 ? Math.min(1, l.a + dt) : Math.max(0, l.a - dt * 0.25);
          if (l.a <= 0 && l.y < api.top + 40) list.splice(i, 1);
        }
      },
      draw: function (c) {
        dusk(c, W, H, api.top); var t = api.time();
        sky.forEach(function (s) { c.globalAlpha = api.reduced ? 0.6 : 0.4 + 0.3 * Math.sin(t * 0.7 + s[2]); c.fillStyle = "#f6e3a1"; c.fillRect(s[0] | 0, s[1] | 0, 1, 1); }); c.globalAlpha = 1;
        hills(c, W, H);
        list.forEach(function (l) { lantern(c, l.x, l.y, l.a, 1 + 0.15 * Math.sin(l.ph * 2)); });
        c.globalAlpha = 0.5; c.fillStyle = "#f6e3a1"; c.fillRect((spot - 6) | 0, H - 12, 12, 2); c.globalAlpha = 1;
        if (!list.length) api.text(c, api.coarse ? "TAP TO LET A LANTERN GO" : "CLICK OR PRESS SPACE TO LET ONE GO", W / 2, H / 2, 8, "#f6e3a1", "center");
      }
    };
  });

  /* ===== FIREFLY JAR: hold the jar near a firefly and it wanders in. A full jar glows; open it to let them go. ===== */
  A.register("firefly-jar", function (api) {
    var W = api.W, H = api.H, inset, jar, flies, inJar, glow, open, sky;
    var JW = 26, JH = 32, FULL = 7;
    function spawn() { return { x: api.rnd(20, W - 20), y: api.rnd(api.top + 20, H - 80), vx: api.rnd(-8, 8), vy: api.rnd(-6, 6), ph: Math.random() * 6.28, state: "free", near: 0 }; }
    function letGo() {
      if (!inJar) return; open = 2.5;
      flies.forEach(function (f) { if (f.state === "jar") { f.state = "free"; f.x = jar.x + api.rnd(-6, 6); f.y = jar.y - JH; f.vy = -api.rnd(10, 18); f.vx = api.rnd(-10, 10); } });
      inJar = 0; api.score(0); api.toast("OFF THEY GO. THEY'LL BE BACK.", 1600);
    }
    return {
      start: function () { inset = api.edgeInset(W); jar = { x: W / 2, y: H - Math.max(24, api.edgeInset(H) * 0.6) }; flies = []; for (var i = 0; i < 9; i++) flies.push(spawn()); inJar = 0; glow = 0; open = 0; sky = stars(3, 24, W, H); api.score(0); },
      press: function (k) { if (k === "action") letGo(); },
      pointer: function (type, x, y) {
        if (type === "down" && Math.abs(x - jar.x) < JW && Math.abs(y - (jar.y - JH / 2)) < JH) { letGo(); return; }
        if (type === "drag" || type === "hover" || type === "down") jar.x = clamp(x, inset, W - inset);
      },
      update: function (dt) {
        var mv = (api.held("right") ? 1 : 0) - (api.held("left") ? 1 : 0); jar.x = clamp(jar.x + mv * 80 * dt, inset, W - inset);
        if (open > 0) open -= dt;
        flies.forEach(function (f) {
          f.ph += dt * 2;
          if (f.state === "jar") { f.x = jar.x + Math.sin(f.ph) * 7; f.y = jar.y - JH / 2 + Math.cos(f.ph * 0.8) * 9; return; }
          f.vx += api.rnd(-12, 12) * dt; f.vy += api.rnd(-12, 12) * dt; f.vx = clamp(f.vx, -14, 14); f.vy = clamp(f.vy, -12, 12);
          f.x += f.vx * dt; f.y += f.vy * dt;
          if (f.x < 10 || f.x > W - 10) f.vx *= -1; if (f.y < api.top + 10 || f.y > H - 20) f.vy *= -1;
          f.x = clamp(f.x, 10, W - 10); f.y = clamp(f.y, api.top + 10, H - 20);
          var dx = jar.x - f.x, dy = (jar.y - JH) - f.y, d = Math.hypot(dx, dy);
          if (open <= 0 && inJar < FULL && d < 60) { f.vx += dx / d * 10 * dt; f.vy += dy / d * 10 * dt; }   // a gentle pull toward the jar's mouth
          if (open <= 0 && inJar < FULL && d < 14) { f.state = "jar"; inJar++; api.score(inJar); if (inJar === FULL) api.toast("THE JAR IS GLOWING. OPEN IT WHENEVER.", 2200); }
        });
        glow += ((inJar / FULL) - glow) * Math.min(1, dt * 2);
      },
      draw: function (c) {
        dusk(c, W, H, api.top); var t = api.time();
        sky.forEach(function (s) { c.globalAlpha = 0.5; c.fillStyle = "#f6e3a1"; c.fillRect(s[0] | 0, s[1] | 0, 1, 1); }); c.globalAlpha = 1;
        hills(c, W, H);
        flies.forEach(function (f) {
          var a = api.reduced ? 0.8 : 0.55 + 0.45 * Math.sin(f.ph * 1.3);
          c.globalAlpha = a * 0.35; c.fillStyle = "#e6ff9a"; c.beginPath(); c.arc(f.x, f.y, 5, 0, 6.283); c.fill();
          c.globalAlpha = a; c.fillStyle = "#f6ffc8"; c.fillRect((f.x - 1) | 0, (f.y - 1) | 0, 2, 2);
        });
        c.globalAlpha = 1;
        var jx = jar.x - JW / 2, jy = jar.y - JH;
        c.globalAlpha = 0.25 + glow * 0.5; c.fillStyle = "#e6ff9a"; c.beginPath(); c.arc(jar.x, jar.y - JH / 2, 18 + glow * 14, 0, 6.283); c.fill(); c.globalAlpha = 1;
        c.strokeStyle = "#cfe6e0"; c.lineWidth = 2; c.strokeRect(jx, jy, JW, JH);
        c.fillStyle = open > 0 ? "#8a6a48" : "#a07d55"; c.fillRect(jx - 2, jy - (open > 0 ? 8 : 4), JW + 4, 4);
        if (!inJar && t < 6) api.text(c, api.coarse ? "HOLD THE JAR NEAR A FIREFLY" : "MOVE THE JAR NEAR A FIREFLY", W / 2, api.top + 8, 8, "#f6e3a1", "center");
      }
    };
  });

  A.register("attract:quiet-garden", function (c, t, api) {
    var x = 160 + Math.sin(t * 0.4) * 30, y = 200 - ((t * 10) % 170);
    lantern(c, x, y, 0.9, 1);
    api.text(c, "QUIET GARDEN", 160, 30, 12, "#f6e3a1", "center");
  });
})();
