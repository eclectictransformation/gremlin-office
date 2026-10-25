/* BREAK ROOM BRAWL: the one competitive cabinet. Short rounds, friendly rivals, shared top-10 boards
   (the boards themselves are handled by arcade.js + world-player.js; these are just the games).
   Registers: coffee-relay (60 s), jam-buster (45 s), desk-duel (2 players, unranked) + attract:break-room-brawl.
   Original games, drawn in code, family friendly. The "brawl" is strictly polite. */
(function () {
  "use strict";
  var A = window.GremlinArcade; if (!A) return;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, k) { return a + (b - a) * k; };

  var GREM = ["..g...g..", "..gg.gg..", ".ggggggg.", "gg.ggg.gg", "gwkgggwkg", "ggggggggg", ".gg.m.gg.", "..ggggg..", ".gg...gg."];
  var GREM_PAL = { g: "#7fc96b", w: "#ffffff", k: "#1a1a18", m: "#7a2e10" };
  var GREM2_PAL = { g: "#c99be8", w: "#ffffff", k: "#1a1a18", m: "#5a2a7a" };
  var MUG = [".~.~..", "wwwww.", "wcccww", "wccc.w", "wcccww", ".www.."];
  var MUG_PAL = { w: "#f1ede2", c: "#6b4226", "~": "rgba(255,255,255,.75)" };
  var DONUT = ["..ppp..", ".pspbp.", "pbp.psp", "pp...pp", "psp.pbp", ".pbpsp.", "..ddd.."];
  var DONUT_PAL = { p: "#f49ac1", s: "#fff3a0", b: "#7fd3f0", d: "#d99a52" };
  function mmss(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function clock(c, api, left, warn) {
    var s = mmss(left), w = 40;
    c.fillStyle = warn ? "rgba(192,57,43,.85)" : "rgba(0,0,0,.55)"; c.fillRect(api.W / 2 - w / 2, api.top + 1, w, 13);
    api.text(c, s, api.W / 2, api.top + 3, 9, "#fff", "center", false);
  }

  /* ===== COFFEE RELAY: carry wobbly mugs from the coffee machine to whichever desk is thirsty ===== */
  A.register("coffee-relay", function (api) {
    var W = api.W, H = api.H, TOP = api.top + 2, ROUND = 60, MAXV = 112;
    var DESKS = [44, 94, 144, 194].map(function (y) { return { x: 284, y: y + TOP - 18 }; });
    var MACH = { x: 26, y: (TOP + H) / 2 };
    var p, v, target, carrying, wobble, streak, delivered, spills, thirsty, left, tripT, bots, puddles, score, done, bestStreak;
    function pickDesk() { var i; do { i = Math.floor(Math.random() * DESKS.length); } while (i === thirsty); thirsty = i; }
    function spill(msg) {
      puddles.push({ x: p.x, y: p.y + 6, t: 3 }); carrying = false; wobble = 0; streak = 0; spills++;
      api.toast(msg || api.pick(["SPLOOSH! BACK TO THE MACHINE.", "OOPS. THE FLOOR IS CAFFEINATED.", "A LITTLE SPILL. NO HARM DONE."]), 1300);
    }
    function deliver() {
      var bonus = Math.max(0, Math.round(50 - 10 * Math.max(0, tripT - 2)));
      var pts = 100 + 25 * Math.min(streak, 8) + bonus;
      score += pts; streak++; delivered++; bestStreak = Math.max(bestStreak, streak); carrying = false; wobble = 0; api.score(score);
      api.toast(streak >= 3 ? "+" + pts + "  STREAK x" + streak + "!" : "+" + pts + "  " + api.pick(["THANK YOU!", "AHH, COFFEE.", "PERFECT TEMPERATURE."]), 1100);
      pickDesk();
    }
    function finish() {
      if (done) return; done = true;
      api.end({ title: delivered ? "TIME! " + delivered + " MUG" + (delivered === 1 ? "" : "S") + " DELIVERED." : "TIME! THE OFFICE IS STILL SLEEPY.",
        msg: delivered >= 10 ? "Best streak " + bestStreak + ". The whole floor is buzzing (politely)." : spills > 2 ? "Smooth and steady keeps the coffee in the mug. Again?" : "Everyone appreciates the effort. Again?", score: score });
    }
    return {
      start: function () {
        p = { x: 60, y: MACH.y }; v = { x: 0, y: 0 }; target = null; carrying = false; wobble = 0; streak = 0; delivered = 0; spills = 0; bestStreak = 0;
        thirsty = -1; pickDesk(); left = ROUND; tripT = 0; puddles = []; score = 0; done = false; api.score(0);
        bots = [{ kind: "roomba", x: 120, y: TOP + 40, vx: 46, vy: 0, r: 9 },
                { kind: "chair", x: 170, y: H - 40, vx: -22, vy: 18, r: 10 },
                { kind: "chair", x: 210, y: TOP + 90, vx: 16, vy: -24, r: 10 }];
      },
      pointer: function (type, x, y) { if (type === "down" || type === "drag") target = { x: x, y: y }; else if (type === "up") target = null; },
      update: function (dt) {
        if (done) return;
        left -= dt; if (left <= 0) { left = 0; return finish(); }
        // steering: keys or a pointer target, both eased so the mug only wobbles on jerky moves
        var ix = (api.held("right") ? 1 : 0) - (api.held("left") ? 1 : 0), iy = (api.held("down") ? 1 : 0) - (api.held("up") ? 1 : 0), tv = { x: 0, y: 0 };
        if (ix || iy) { var n = Math.hypot(ix, iy); tv.x = ix / n * MAXV; tv.y = iy / n * MAXV; target = null; }
        else if (target) { var dx = target.x - p.x, dy = target.y - p.y, dd = Math.hypot(dx, dy); if (dd > 3) { var sp = Math.min(MAXV, dd * 4); tv.x = dx / dd * sp; tv.y = dy / dd * sp; } }
        var k = Math.min(1, 6 * dt), ox = v.x, oy = v.y;
        v.x += (tv.x - v.x) * k; v.y += (tv.y - v.y) * k;
        var acc = Math.hypot(v.x - ox, v.y - oy) / Math.max(dt, 1e-3);
        p.x = clamp(p.x + v.x * dt, 10, 262); p.y = clamp(p.y + v.y * dt, TOP + 8, H - 8);
        if (carrying) {
          tripT += dt;
          wobble += Math.max(0, acc - 480) / 1000 * dt * 3.2;
          wobble = Math.max(0, wobble - 0.32 * dt);
          if (wobble >= 1) spill();
        }
        // office traffic
        bots.forEach(function (b) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.x < 70 || b.x > 240) { b.vx = -b.vx; b.x = clamp(b.x, 70, 240); }
          if (b.y < TOP + 12 || b.y > H - 12) { b.vy = -b.vy; b.y = clamp(b.y, TOP + 12, H - 12); }
          var dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy), md = b.r + 8;
          if (d < md && d > 0.01) {
            p.x = clamp(b.x + dx / d * md, 10, 262); p.y = clamp(b.y + dy / d * md, TOP + 8, H - 8);
            if (carrying && !b.cool) { wobble += 0.55; b.cool = 0.8; if (wobble >= 1) spill(b.kind === "roomba" ? "THE ROOMBA SAYS SORRY. SPLASH." : "A ROLLING CHAIR! SPLASH."); else api.toast("BUMP! CAREFUL\u2026", 700); }
          }
          if (b.cool) b.cool = Math.max(0, b.cool - dt);
        });
        puddles.forEach(function (q) { q.t -= dt; }); puddles = puddles.filter(function (q) { return q.t > 0; });
        if (!carrying && Math.hypot(p.x - MACH.x - 16, p.y - MACH.y) < 24) { carrying = true; tripT = 0; wobble = 0; api.toast("GOT ONE. STEADY NOW\u2026", 800); }
        var dk = DESKS[thirsty];
        if (carrying && Math.abs(p.x - (dk.x - 26)) < 18 && Math.abs(p.y - dk.y) < 20) deliver();
      },
      draw: function (c) {
        var t = api.time();
        c.fillStyle = "#e9dcc4"; c.fillRect(0, 0, W, H);
        c.fillStyle = "#dfcfb3"; for (var y = TOP; y < H; y += 20) for (var x = ((y / 20) % 2) * 20; x < W; x += 40) c.fillRect(x, y, 20, 20);
        puddles.forEach(function (q) { c.globalAlpha = Math.min(1, q.t); c.fillStyle = "#8a5a36"; c.beginPath(); c.ellipse(q.x, q.y, 11, 5, 0, 0, 6.3); c.fill(); c.globalAlpha = 1; });
        // coffee machine
        c.fillStyle = "#3d3d46"; c.fillRect(6, MACH.y - 26, 36, 52); c.fillStyle = "#56566a"; c.fillRect(9, MACH.y - 23, 30, 16);
        c.fillStyle = "#ffd166"; c.fillRect(12, MACH.y - 19, 6, 4); c.fillStyle = "#1a1a18"; c.fillRect(14, MACH.y + 2, 20, 16);
        api.text(c, "COFFEE", 24, MACH.y + 28, 7, "#5a3d2b", "center", false);
        if (!carrying) { c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 5); c.drawImage(api.sprite(MUG, MUG_PAL), 20, MACH.y + 6, 9, 9); c.globalAlpha = 1; }
        // desks
        DESKS.forEach(function (dk, i) {
          c.fillStyle = "#8a5a36"; c.fillRect(dk.x - 18, dk.y - 14, 40, 28); c.fillStyle = "#a8724a"; c.fillRect(dk.x - 18, dk.y - 14, 40, 5);
          c.fillStyle = "#2c3e50"; c.fillRect(dk.x - 4, dk.y - 12, 16, 10);
          if (i === thirsty) {
            c.strokeStyle = "#ffd166"; c.lineWidth = 2; c.strokeRect(dk.x - 21, dk.y - 17, 46, 34);
            var bob = Math.sin(t * 4) * 2; c.fillStyle = "#fff"; c.fillRect(dk.x - 44, dk.y - 30 + bob, 22, 13);
            api.text(c, "\u2615?", dk.x - 33, dk.y - 28 + bob, 8, "#7a2e10", "center", false);
          }
        });
        // traffic
        bots.forEach(function (b) {
          if (b.kind === "roomba") { c.fillStyle = "#555b66"; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 6.3); c.fill(); c.fillStyle = "#7fd3f0"; c.fillRect(b.x - 2, b.y - 5, 4, 3); }
          else { c.fillStyle = "#6a3fa0"; c.fillRect(b.x - 9, b.y - 9, 18, 14); c.fillStyle = "#43246e"; c.fillRect(b.x - 9, b.y - 13, 18, 5); c.fillStyle = "#1a1a18"; c.fillRect(b.x - 8, b.y + 6, 3, 3); c.fillRect(b.x + 5, b.y + 6, 3, 3); }
        });
        // you
        var wob = carrying ? Math.sin(t * 16) * wobble * 3 : 0;
        c.drawImage(api.sprite(GREM, GREM_PAL), Math.round(p.x - 9), Math.round(p.y - 9), 18, 18);
        if (carrying) { c.save(); c.translate(p.x + 8, p.y - 12); c.rotate(wob * 0.12); c.drawImage(api.sprite(MUG, MUG_PAL), -6, -6, 12, 12); c.restore(); }
        // steadiness meter + clock
        c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(4, api.top + 2, 62, 9);
        c.fillStyle = wobble > 0.7 ? "#e8574a" : wobble > 0.4 ? "#ffd166" : "#7fc96b"; c.fillRect(5, api.top + 3, Math.round(60 * (carrying ? 1 - wobble : 1)), 7);
        api.text(c, carrying ? "STEADY" : "GET A MUG", 35, api.top + 3, 6, "#1a1a18", "center", false);
        clock(c, api, left, left < 10);
        if (streak >= 2) api.text(c, "STREAK x" + streak, W - 4, api.top + 3, 7, "#7a2e10", "right", false);
      }
    };
  });

  /* ===== JAM BUSTER: nine printers, one very busy afternoon. Bop the jams, keep the combo going ===== */
  A.register("jam-buster", function (api) {
    var W = api.W, H = api.H, TOP = api.top + 2, ROUND = 45, JAMS = 80, GOLD = 8;
    var CW = 96, CH = 70, OX = (W - 3 * CW) / 2, OY = TOP + 12;
    var cells, schedule, si, t, combo, score, cur, done, missed, bopped, flashes, bestCombo;
    function mult() { return Math.min(5, 1 + Math.floor(combo / 5)); }
    function makeSchedule() {
      var out = [], golds = {}, i;
      while (Object.keys(golds).length < GOLD) golds[10 + Math.floor(Math.random() * (JAMS - 12))] = true;
      for (i = 0; i < JAMS; i++) out.push({ at: 0.8 + 42 * Math.pow(i / (JAMS - 1), 0.85), gold: !!golds[i] });
      return out;
    }
    function life() { return lerp(1.7, 0.9, clamp(t / ROUND, 0, 1)); }
    function bop(i) {
      if (done || i < 0 || i > 8) return;
      var c = cells[i]; cur = i;
      if (c.jam) {
        combo++; bestCombo = Math.max(bestCombo, combo); bopped++;
        var pts = (c.jam.gold ? 30 : 10) * mult(); score += pts; api.score(score);
        flashes.push({ i: i, s: "+" + pts, t: 0.6, gold: c.jam.gold }); c.jam = null; c.ok = 0.25;
        if (combo % 5 === 0 && mult() > 1) api.toast("COMBO x" + mult() + "!", 900);
      } else {
        if (combo >= 3) api.toast(api.pick(["THAT ONE WAS FINE!", "IT WAS JUST THINKING.", "COMBO DROPPED. IT'S OK."]), 900);
        combo = 0; c.oops = 0.3;
      }
    }
    function finish() {
      if (done) return; done = true;
      api.end({ title: bopped ? bopped + " JAMS BUSTED!" : "THE PRINTERS WIN THIS ROUND.",
        msg: bestCombo >= 15 ? "Best combo " + bestCombo + ". IT has sent a thank-you card." : missed > 20 ? "Paper everywhere. Very festive. Again?" : "Best combo " + bestCombo + ". The printers are humbled. Again?", score: score });
    }
    function cellAt(x, y) { var cx = Math.floor((x - OX) / CW), cy = Math.floor((y - OY) / CH); return cx >= 0 && cx < 3 && cy >= 0 && cy < 3 ? cy * 3 + cx : -1; }
    return {
      start: function () {
        cells = []; for (var i = 0; i < 9; i++) cells.push({ jam: null, ok: 0, oops: 0 });
        schedule = makeSchedule(); si = 0; t = 0; combo = 0; score = 0; cur = 4; done = false; missed = 0; bopped = 0; flashes = []; bestCombo = 0; api.score(0);
      },
      press: function (k) {
        if (k === "action") return bop(cur);
        var x = cur % 3, y = Math.floor(cur / 3);
        if (k === "left") x = (x + 2) % 3; if (k === "right") x = (x + 1) % 3; if (k === "up") y = (y + 2) % 3; if (k === "down") y = (y + 1) % 3;
        cur = y * 3 + x;
      },
      pointer: function (type, x, y) { var i = cellAt(x, y); if (type === "down") bop(i); else if (type === "hover" && i >= 0) cur = i; },
      update: function (dt) {
        if (done) return;
        t += dt;
        while (si < schedule.length && schedule[si].at <= t) {
          var free = []; cells.forEach(function (c, i) { if (!c.jam) free.push(i); });
          if (!free.length) { schedule[si].at += 0.2; break; }
          var i = api.pick(free); cells[i].jam = { gold: schedule[si].gold, left: life() * (schedule[si].gold ? 0.8 : 1), max: life() }; si++;
        }
        cells.forEach(function (c) {
          if (c.ok) c.ok = Math.max(0, c.ok - dt); if (c.oops) c.oops = Math.max(0, c.oops - dt);
          if (c.jam) { c.jam.left -= dt; if (c.jam.left <= 0) { c.jam = null; missed++; if (combo >= 3) api.toast("PAPER EVERYWHERE! COMBO RESET.", 900); combo = 0; } }
        });
        flashes.forEach(function (f) { f.t -= dt; }); flashes = flashes.filter(function (f) { return f.t > 0; });
        if (t >= ROUND || (si >= schedule.length && !cells.some(function (c) { return c.jam; }))) finish();
      },
      draw: function (c) {
        c.fillStyle = "#2a2340"; c.fillRect(0, 0, W, H);
        c.fillStyle = "#332a4d"; for (var y = TOP; y < H; y += 10) c.fillRect(0, y, W, 1);
        cells.forEach(function (cell, i) {
          var x = OX + (i % 3) * CW + 8, y = OY + Math.floor(i / 3) * CH + 6, w = CW - 16, h = CH - 14;
          var shake = cell.jam && !api.reduced ? Math.sin(api.time() * 40 + i) * 1.5 : 0;
          x += shake;
          // paper sticking out (the jam)
          if (cell.jam) {
            var k = cell.jam.left / cell.jam.max;
            c.fillStyle = cell.jam.gold ? "#ffd166" : "#fdfbf4"; c.fillRect(x + 18, y - 6, w - 36, 22);
            c.fillStyle = cell.jam.gold ? "#e0a92e" : "#cfc8b8"; c.fillRect(x + 22, y - 2, w - 44, 2); c.fillRect(x + 22, y + 3, w - 50, 2);
            api.text(c, cell.jam.gold ? "\u2605" : "!", x + w / 2, y - 4, 10, cell.jam.gold ? "#7a2e10" : "#c0392b", "center", false);
            c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(x + 6, y + h - 4, w - 12, 3); c.fillStyle = k > 0.4 ? "#7fc96b" : "#e8574a"; c.fillRect(x + 6, y + h - 4, Math.round((w - 12) * k), 3);
          }
          c.fillStyle = cell.oops ? "#a04a4a" : cell.ok ? "#6ab06a" : "#d8d2c4"; c.fillRect(x, y + 10, w, h - 18);
          c.fillStyle = "#9a9384"; c.fillRect(x, y + h - 10, w, 4); c.fillStyle = "#1a1a18"; c.fillRect(x + 10, y + 14, w - 20, 4);
          c.fillStyle = cell.jam ? "#e8574a" : "#7fc96b"; c.fillRect(x + w - 12, y + 22, 5, 5);
          if (i === cur) { c.strokeStyle = "#ffd166"; c.lineWidth = 2; c.strokeRect(x - 4, y - 9, w + 8, h + 8); }
        });
        flashes.forEach(function (f) {
          var x = OX + (f.i % 3) * CW + CW / 2, y = OY + Math.floor(f.i / 3) * CH + 8 - (0.6 - f.t) * 30;
          api.text(c, f.s, x, y, 10, f.gold ? "#ffd166" : "#fff", "center");
        });
        clock(c, api, ROUND - t, ROUND - t < 8);
        api.text(c, "COMBO " + combo + (mult() > 1 ? "  x" + mult() : ""), 4, api.top + 3, 8, mult() > 1 ? "#ffd166" : "#d6d1c2", "left");
      }
    };
  });

  /* ===== DESK DUEL: two players, one desk, one very fast donut. Local only, no board ===== */
  A.register("desk-duel", function (api) {
    var W = api.W, H = api.H, TOP = api.top + 2, PH = 36, WIN = 7;
    var L, R, ball, pts, rally, longest, pause, raw = {}, tL = null, tR = null, done;
    function kd(e) {
      var k = e.key; if (k === "w" || k === "W" || k === "s" || k === "S" || k === "ArrowUp" || k === "ArrowDown") { raw[k.length === 1 ? k.toLowerCase() : k] = true; }
    }
    function ku(e) { var k = e.key; delete raw[k.length === 1 ? k.toLowerCase() : k]; }
    function serve(dir) { ball = { x: W / 2, y: (TOP + H) / 2, vx: 120 * dir, vy: api.rnd(-60, 60) }; pause = 0.8; rally = 0; }
    function point(left) {
      pts[left ? 0 : 1]++;
      api.toast(api.pick(["POINT, " + (left ? "LEFT" : "RIGHT") + "!", "THE DONUT HAS CHOSEN.", "CRUMBS! " + pts[0] + " - " + pts[1]]), 1000);
      if (pts[0] >= WIN || pts[1] >= WIN) {
        done = true;
        return api.end({ title: (pts[0] > pts[1] ? "LEFT" : "RIGHT") + " GREMLIN WINS " + Math.max(pts[0], pts[1]) + "-" + Math.min(pts[0], pts[1]) + "!",
          msg: "Longest rally: " + longest + ". Shake hands. Share the donut.", score: longest });
      }
      serve(left ? 1 : -1);
    }
    function hit(pad, side) {
      var off = (ball.y - pad.y) / (PH / 2), sp = Math.min(320, Math.hypot(ball.vx, ball.vy) * 1.06 + 6);
      ball.vx = side * Math.abs(sp * Math.cos(off * 0.85)); ball.vy = sp * Math.sin(off * 0.85); rally++; longest = Math.max(longest, rally); api.score(longest);
    }
    return {
      start: function () {
        L = { y: (TOP + H) / 2 }; R = { y: (TOP + H) / 2 }; pts = [0, 0]; longest = 0; done = false; api.score(0); serve(api.pick([-1, 1]));
        window.addEventListener("keydown", kd, true); window.addEventListener("keyup", ku, true);
      },
      stop: function () { window.removeEventListener("keydown", kd, true); window.removeEventListener("keyup", ku, true); raw = {}; },
      press: function () {},
      pointer: function (type, x, y) { if (type === "down" || type === "drag") { if (x < W / 2) tL = y; else tR = y; } else if (type === "up") { tL = tR = null; } },
      update: function (dt) {
        if (done) return;
        var sp = 210;
        var ml = (raw.s ? 1 : 0) - (raw.w ? 1 : 0), mr = (raw.ArrowDown ? 1 : 0) - (raw.ArrowUp ? 1 : 0);
        if (ml) { L.y += ml * sp * dt; tL = null; } else if (tL != null) L.y += clamp(tL - L.y, -280 * dt, 280 * dt);
        if (mr) { R.y += mr * sp * dt; tR = null; } else if (tR != null) R.y += clamp(tR - R.y, -280 * dt, 280 * dt);
        L.y = clamp(L.y, TOP + PH / 2, H - PH / 2); R.y = clamp(R.y, TOP + PH / 2, H - PH / 2);
        if (pause > 0) { pause -= dt; return; }
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.y < TOP + 5) { ball.y = TOP + 5; ball.vy = Math.abs(ball.vy); }
        if (ball.y > H - 5) { ball.y = H - 5; ball.vy = -Math.abs(ball.vy); }
        if (ball.vx < 0 && ball.x - 4 < 22 && ball.x > 8 && Math.abs(ball.y - L.y) < PH / 2 + 4) { hit(L, 1); ball.x = 26; }
        if (ball.vx > 0 && ball.x + 4 > W - 22 && ball.x < W - 8 && Math.abs(ball.y - R.y) < PH / 2 + 4) { hit(R, -1); ball.x = W - 26; }
        if (ball.x < -10) point(false); else if (ball.x > W + 10) point(true);
      },
      draw: function (c) {
        c.fillStyle = "#3b2a1e"; c.fillRect(0, 0, W, H);
        c.fillStyle = "#4a3526"; for (var y = TOP; y < H; y += 12) c.fillRect(0, y, W, 1);
        c.fillStyle = "rgba(255,255,255,.25)"; for (var y2 = TOP + 4; y2 < H; y2 += 14) c.fillRect(W / 2 - 1, y2, 2, 7);
        c.fillStyle = "#7fc96b"; c.fillRect(12, L.y - PH / 2, 8, PH); c.fillStyle = "#c99be8"; c.fillRect(W - 20, R.y - PH / 2, 8, PH);
        c.drawImage(api.sprite(GREM, GREM_PAL), 2, Math.round(L.y - 6), 10, 10); c.drawImage(api.sprite(GREM, GREM2_PAL), W - 12, Math.round(R.y - 6), 10, 10);
        c.drawImage(api.sprite(DONUT, DONUT_PAL), Math.round(ball.x - 5), Math.round(ball.y - 5), 10, 10);
        api.text(c, String(pts[0]), W / 2 - 24, TOP + 6, 18, "#7fc96b", "center");
        api.text(c, String(pts[1]), W / 2 + 24, TOP + 6, 18, "#c99be8", "center");
        if (pause > 0 && pts[0] + pts[1] === 0) {
          api.text(c, api.coarse ? "DRAG YOUR HALF" : "W / S", 60, H - 22, 8, "#7fc96b", "center");
          api.text(c, api.coarse ? "DRAG YOUR HALF" : "\u2191 / \u2193", W - 60, H - 22, 8, "#c99be8", "center");
        }
      }
    };
  });

  /* ===== attract screen: mugs, jams and a donut, gently doing their thing behind the menu ===== */
  A.register("attract:break-room-brawl", function (c, t, api) {
    var r = api.reduced ? 0 : t;
    for (var i = 0; i < 6; i++) {
      var x = (i * 61 + r * (14 + i * 3)) % (api.W + 30) - 15, y = 200 + Math.sin(r * 1.3 + i) * 10;
      c.globalAlpha = 0.35; c.drawImage(api.sprite(i % 2 ? MUG : DONUT, i % 2 ? MUG_PAL : DONUT_PAL), x | 0, y | 0, 14, 14);
    }
    c.globalAlpha = 1;
  });
})();
