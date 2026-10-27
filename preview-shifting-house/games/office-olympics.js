/* OFFICE OLYMPICS: desk sports for very small athletes. Original games, drawn in code.
   Registers: desk-tennis, paper-plane-toss, stapler-stack (see world-data.json -> arcade). */
(function () {
  "use strict";
  var A = window.GremlinArcade; if (!A) return;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  var DONUT = ["..ppppp..", ".pppsppp.", "ppbpppspp", "ppp...ppp", "psp...pbp", "ppp...ppp", "dpppbpppd", ".ddpppdd.", "..ddddd.."];
  var DONUT_PAL = { p: "#f49ac1", s: "#fff3a0", b: "#7fd3f0", d: "#d99a52" };
  var MUG = ["..~.~..", ".~.~...", "wwwwww.", "wccccww", "wccccw.w", "wccccww", ".wwww.."];
  var MUG_PAL = { w: "#f1ede2", c: "#6b4226", "~": "rgba(255,255,255,.7)" };
  var PLANE = ["w.......", "wwww....", ".wwwwww.", "..wggwwww", ".wwww...", "ww......"];
  var PLANE_PAL = { w: "#ffffff", g: "#c9d4dd" };

  function desk(c, api, top) {
    c.fillStyle = "#3b2a1e"; c.fillRect(0, 0, api.W, api.H);
    c.fillStyle = "#4a3526"; for (var y = top || 0; y < api.H; y += 12) c.fillRect(0, y, api.W, 1);
  }

  /* ===== DESK TENNIS: you (a gremlin) vs a stapler who keeps stopping for coffee =====
     Both paddles sit well in from the screen edges (api.edgeInset: 14% of the court or 48 CSS px), so a thumb
     dragging in the strip behind your gremlin never hides it. Ball speeds scale with the shorter court. */
  A.register("desk-tennis", function (api) {
    var W = api.W, H = api.H, TOP = api.top + 2, PH = 38, PW = 10, WIN = 5, SPAN0 = 272;   // SPAN0: the old paddle-to-paddle gap
    var X, k, you, cpu, ball, pts, hits, pause, sip, nextSip, target, msgs;
    function layout() { X = api.edgeInset(W); k = (W - 2 * X - 2 * PW) / SPAN0; }   // X: left edge of you / right edge of the stapler
    function serve(dir) { ball = { x: W / 2, y: (TOP + H) / 2, vx: 95 * k * dir, vy: api.rnd(-50, 50) * k }; pause = 0.9; }
    function point(forYou) {
      if (forYou) { pts[0]++; api.toast(api.pick(["THE STAPLER WAS BUSY.", "POINT! THE STAPLER SIGHS.", "NICE. VERY NICE."])); }
      else { pts[1]++; api.toast(api.pick(["THE DONUT ROLLED AWAY.", "OOPS. CRUMBS EVERYWHERE.", "IT'S FINE. IT'S A DONUT."])); }
      if (pts[0] >= WIN) return api.end({ title: "YOU WIN " + pts[0] + "-" + pts[1] + "!", msg: "The stapler demands a rematch. After its coffee.", score: hits });
      if (pts[1] >= WIN) return api.end({ title: "THE DONUT ROLLED UNDER THE DESK.", msg: "Again? The stapler is being very smug about it.", score: hits });
      serve(forYou ? 1 : -1);
    }
    return {
      start: function () { layout(); you = { y: (TOP + H) / 2 }; cpu = { y: (TOP + H) / 2 }; pts = [0, 0]; hits = 0; sip = 0; nextSip = api.rnd(3, 6); target = null; api.score(0); serve(-1); },
      press: function () {},
      pointer: function (type, x, y) { if (type !== "up") target = y; },   // only the height matters: drag anywhere, ideally behind your gremlin
      update: function (dt) {
        layout();
        // you: keys move, pointer/touch drags
        var mv = (api.held("down") ? 1 : 0) - (api.held("up") ? 1 : 0);
        if (mv) { you.y += mv * 190 * dt; target = null; } else if (target != null) you.y += clamp(target - you.y, -260 * dt, 260 * dt);
        you.y = clamp(you.y, TOP + PH / 2, H - PH / 2);
        // the stapler: lazy, and sometimes it just stops to sip coffee
        nextSip -= dt;
        if (sip > 0) sip -= dt;
        else if (nextSip <= 0) { sip = api.rnd(1.1, 1.8); nextSip = api.rnd(4, 9); api.toast("*SIP*  THE STAPLER IS ON A BREAK", 1200); }
        if (sip <= 0) { var goal = ball.vx > 0 ? ball.y : (TOP + H) / 2; cpu.y += clamp(goal - cpu.y, -105 * dt, 105 * dt); }
        cpu.y = clamp(cpu.y, TOP + PH / 2, H - PH / 2);
        if (pause > 0) { pause -= dt; return; }
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.y < TOP + 5) { ball.y = TOP + 5; ball.vy = Math.abs(ball.vy); }
        if (ball.y > H - 5) { ball.y = H - 5; ball.vy = -Math.abs(ball.vy); }
        // paddles (you at x X..X+10, stapler at x W-X-10..W-X)
        var yf = X + PW, sf = W - X - PW;
        if (ball.vx < 0 && ball.x - 4 < yf && ball.x > X - 4 && Math.abs(ball.y - you.y) < PH / 2 + 4) {
          var off = (ball.y - you.y) / (PH / 2); var sp = Math.min(240 * k, Math.hypot(ball.vx, ball.vy) * 1.05 + 4 * k);
          ball.vx = Math.abs(sp * Math.cos(off * 0.9)); ball.vy = sp * Math.sin(off * 0.9); ball.x = yf + 4; hits++; api.score(hits);
        }
        if (ball.vx > 0 && ball.x + 4 > sf && ball.x < W - X + 4 && Math.abs(ball.y - cpu.y) < PH / 2 + 4) {
          var o2 = (ball.y - cpu.y) / (PH / 2), s2 = Math.min(240 * k, Math.hypot(ball.vx, ball.vy) * 1.03);
          ball.vx = -Math.abs(s2 * Math.cos(o2 * 0.8)); ball.vy = s2 * Math.sin(o2 * 0.8); ball.x = sf - 4;
        }
        // a miss rolls on behind the paddle and off the desk edge
        if (ball.x < -10) point(false); else if (ball.x > W + 10) point(true);
      },
      draw: function (c) {
        desk(c, api, TOP);
        // the thumb strips behind each paddle (a touch darker: "drag here")
        c.fillStyle = "rgba(0,0,0,.14)"; c.fillRect(0, TOP, X - 3, H - TOP); c.fillRect(W - X + 3, TOP, X - 3, H - TOP);
        c.fillStyle = "#c9b28f"; for (var y = TOP + 4; y < H; y += 14) c.fillRect(W / 2 - 1, y, 2, 7);   // a line of paperclips
        api.text(c, String(pts[0]), W / 2 - 24, TOP + 6, 18, "#9fe07a", "right");
        api.text(c, String(pts[1]), W / 2 + 24, TOP + 6, 18, "#f49ac1", "left");
        // you: a tall green gremlin with eyes that follow the donut
        var y0 = Math.round(you.y - PH / 2), gx = X;
        c.fillStyle = "#3f7d3a"; c.fillRect(gx, y0, 10, PH); c.fillStyle = "#5fa356"; c.fillRect(gx, y0 + 2, 4, PH - 4);
        c.fillStyle = "#3f7d3a"; c.fillRect(gx - 1, y0 - 3, 3, 4); c.fillRect(gx + 8, y0 - 3, 3, 4);
        var look = clamp((ball.y - you.y) / 40, -1, 1);
        c.fillStyle = "#fff"; c.fillRect(gx + 2, y0 + 6, 3, 4); c.fillRect(gx + 6, y0 + 6, 3, 4);
        c.fillStyle = "#111"; c.fillRect(gx + 3, y0 + 7 + Math.round(look), 2, 2); c.fillRect(gx + 7, y0 + 7 + Math.round(look), 2, 2);
        c.fillStyle = "#1e3d1b"; c.fillRect(gx + 3, y0 + 13, 5, 1);
        // the stapler (standing on its end, as one does)
        var y1 = Math.round(cpu.y - PH / 2), sx = W - X - PW;
        c.fillStyle = "#555b63"; c.fillRect(sx + 4, y1, 7, PH); c.fillStyle = "#c0392b"; c.fillRect(sx, y1 + 2, 5, PH - 6);
        c.fillStyle = "#e57368"; c.fillRect(sx + 1, y1 + 4, 1, PH - 12); c.fillStyle = "#222"; c.fillRect(sx + 2, y1 + PH - 6, 6, 3);
        if (sip > 0) { c.drawImage(api.sprite(MUG, MUG_PAL), sx - 16, y1 - 4, 14, 14); api.text(c, "sip", sx - 20, y1 - 14, 8, "#fff3a0", "left"); }
        // the donut
        if (pause <= 0 || Math.floor(api.time() * 6) % 2 || api.reduced) c.drawImage(api.sprite(DONUT, DONUT_PAL), Math.round(ball.x - 6), Math.round(ball.y - 6), 12, 12);
      }
    };
  });

  /* ===== PAPER PLANE TOSS: flick paper planes into the recycling, mind the desk fan ===== */
  A.register("paper-plane-toss", function (api) {
    var W = api.W, H = api.H, FLOOR = 226, START = { x: 34, y: 180 }, ROUND = 6;
    var ang, pow, plane, bin, wind, left, scored, drag, after, trail, flops;
    var FLOPS = ["LANDED ON GRIMBLE'S KEYBOARD.", "INTO THE FICUS. THE FICUS IS PLEASED.", "NOSE-DIVE. VERY DRAMATIC.", "IT FLEW OFF TO A BETTER JOB.", "A PERFECT LANDING. ON THE FLOOR.", "IT'S RESTING. LET IT REST."];
    function newBin() { bin = { x: Math.round(api.rnd(185, 280)), w: 30, top: FLOOR - 30 }; wind = Math.round(api.rnd(-4, 4)) * 10; }
    function reset() { plane = null; trail = []; }
    function throwIt() {
      if (plane || after > 0 || left <= 0) return;
      var sp = 120 + pow * 170, a = ang * Math.PI / 180;
      plane = { x: START.x, y: START.y, vx: Math.cos(a) * sp, vy: -Math.sin(a) * sp, rot: -a }; left--; trail = [];
    }
    function finish(inBin) {
      if (inBin) { scored++; api.score(scored); api.toast(api.pick(["IN THE BIN! RECYCLED!", "SWISH. THE BIN IS PROUD.", "PERFECT. VERY ECO."])); }
      else api.toast(api.pick(FLOPS), 1600);
      plane = null; after = 1.1;
    }
    return {
      start: function () { ang = 45; pow = 0.55; left = ROUND; scored = 0; after = 0; flops = 0; api.score(0); newBin(); reset(); },
      press: function (k) { if (k === "action") throwIt(); },
      pointer: function (type, x, y) {
        if (plane || after > 0) return;
        if (type === "down") drag = { x: x, y: y };
        else if (type === "drag" && drag) {
          var dx = drag.x - x, dy = drag.y - y, len = Math.hypot(dx, dy);   // pull back like a slingshot
          if (len > 6) { ang = clamp(Math.atan2(-dy, dx) * 180 / Math.PI, 10, 80); pow = clamp(len / 90, 0.15, 1); }
        } else if (type === "up" && drag) { drag = null; throwIt(); }   // a plain tap throws with the current aim
      },
      update: function (dt) {
        if (!plane && after <= 0) {
          ang = clamp(ang + ((api.held("up") ? 1 : 0) - (api.held("down") ? 1 : 0)) * 50 * dt, 10, 80);
          pow = clamp(pow + ((api.held("right") ? 1 : 0) - (api.held("left") ? 1 : 0)) * 0.7 * dt, 0.15, 1);
        }
        if (after > 0) { after -= dt; if (after <= 0) { if (left <= 0) return api.end(scored ? { title: scored + " OF " + ROUND + " PLANES RECYCLED!", msg: scored >= 4 ? "The recycling bin would like your autograph." : "The bin is quietly proud of you. Again?" } : { title: "ZERO IN THE BIN.", msg: "But every single one of them flew. That counts. Again?" }); newBin(); } return; }
        if (!plane) return;
        var gust = wind * (0.8 + 0.3 * Math.sin(api.time() * 3));
        plane.vx += gust * dt; plane.vy += 140 * dt; plane.vy -= Math.max(0, plane.vx) * 0.18 * dt;   // a little lift
        var px = plane.x, py = plane.y;
        plane.x += plane.vx * dt; plane.y += plane.vy * dt; plane.rot = Math.atan2(plane.vy, plane.vx);
        trail.push([plane.x, plane.y]); if (trail.length > 14) trail.shift();
        // through the bin opening while coming down?
        if (py < bin.top && plane.y >= bin.top && plane.x > bin.x + 2 && plane.x < bin.x + bin.w - 2) return finish(true);
        // bonk off the bin's sides
        if (plane.y > bin.top && plane.x > bin.x - 2 && plane.x < bin.x + bin.w + 2 && px <= bin.x - 2 || plane.y > bin.top && px >= bin.x + bin.w + 2 && plane.x < bin.x + bin.w + 2 && plane.x > bin.x) { plane.vx = -plane.vx * 0.4; plane.x = px; }
        if (plane.y > FLOOR || plane.x > W + 20 || plane.x < -20) finish(false);
        if (plane && plane.y < -60) plane.vy = Math.abs(plane.vy) * 0.2;
      },
      draw: function (c) {
        c.fillStyle = "#2a3b4c"; c.fillRect(0, 0, W, H);                      // office wall
        c.fillStyle = "#33485c"; for (var x = 0; x < W; x += 40) c.fillRect(x, 0, 1, FLOOR);
        c.fillStyle = "#6b4a32"; c.fillRect(0, FLOOR, W, H - FLOOR);            // floor
        c.fillStyle = "#5a3d29"; c.fillRect(0, START.y + 6, 60, 8); c.fillRect(6, START.y + 14, 5, FLOOR - START.y - 14); c.fillRect(50, START.y + 14, 5, FLOOR - START.y - 14); // desk
        // the desk fan, top middle, with breezy streaks
        var fx = 160, fy = 32, spin = api.reduced ? 0 : api.time() * (4 + Math.abs(wind) / 4);
        c.fillStyle = "#7f8c8d"; c.fillRect(fx - 1, fy + 8, 3, 12); c.fillRect(fx - 7, fy + 19, 15, 3);
        c.fillStyle = "#bdc3c7"; c.beginPath(); c.arc(fx, fy, 9, 0, 6.3); c.fill();
        c.fillStyle = "#ecf0f1"; for (var i = 0; i < 3; i++) { var a = spin + i * 2.09; c.fillRect(Math.round(fx + Math.cos(a) * 5) - 2, Math.round(fy + Math.sin(a) * 5) - 2, 4, 4); }
        if (wind) { c.fillStyle = "rgba(255,255,255,.35)"; for (var j = 0; j < 6; j++) { var sx = ((api.time() * wind * 2 + j * 57) % W + W) % W; c.fillRect(Math.round(sx), 50 + j * 22, 10, 1); } }
        api.text(c, "FAN " + (wind === 0 ? "OFF" : (wind > 0 ? "\u2192 " : "\u2190 ") + Math.abs(wind / 10)), fx + 14, fy - 4, 8, "#d6e4ee", "left");
        // recycling bin
        c.fillStyle = "#2e86c1"; c.fillRect(bin.x, bin.top, bin.w, FLOOR - bin.top); c.fillStyle = "#1b4f72"; c.fillRect(bin.x - 2, bin.top - 2, bin.w + 4, 4);
        c.fillStyle = "#d6eaf8"; c.fillRect(bin.x + 11, bin.top + 10, 8, 2); c.fillRect(bin.x + 11, bin.top + 18, 8, 2); c.fillRect(bin.x + 10, bin.top + 12, 2, 6); c.fillRect(bin.x + 18, bin.top + 12, 2, 6);
        // planes left
        for (var k = 0; k < left; k++) c.drawImage(api.sprite(PLANE, PLANE_PAL), 6 + k * 12, H - 10, 9, 6);
        // aim guide (just a few dots: no wind shown, the fan is part of the fun)
        if (!plane && after <= 0) {
          var a2 = ang * Math.PI / 180, sp = 120 + pow * 170;
          c.fillStyle = "rgba(255,243,160,.8)";
          for (var t = 0.08; t < 0.5; t += 0.08) c.fillRect(Math.round(START.x + Math.cos(a2) * sp * t) - 1, Math.round(START.y - Math.sin(a2) * sp * t + 70 * t * t) - 1, 2, 2);
          c.fillStyle = "#000"; c.fillRect(6, START.y - 22, 42, 5); c.fillStyle = "#9fe07a"; c.fillRect(7, START.y - 21, Math.round(40 * pow), 3);
          c.save(); c.translate(START.x, START.y); c.rotate(-a2); c.drawImage(api.sprite(PLANE, PLANE_PAL), -9, -6, 18, 12); c.restore();
        }
        if (plane) {
          c.fillStyle = "rgba(255,255,255,.25)"; trail.forEach(function (p, i) { if (i % 2) c.fillRect(Math.round(p[0]), Math.round(p[1]), 1, 1); });
          c.save(); c.translate(Math.round(plane.x), Math.round(plane.y)); c.rotate(plane.rot); c.drawImage(api.sprite(PLANE, PLANE_PAL), -9, -6, 18, 12); c.restore();
        }
      }
    };
  });

  /* ===== STAPLER STACK: build a wobbly tower of desk things ===== */
  A.register("stapler-stack", function (api) {
    var W = api.W, H = api.H, BASE = 214;
    var KINDS = [
      { n: "stapler", w: 58, h: 14, c: "#c0392b", d: "#7b241c" }, { n: "tape", w: 44, h: 14, c: "#7f8c8d", d: "#4d5656" },
      { n: "book", w: 70, h: 12, c: "#2e86c1", d: "#1b4f72" }, { n: "mug", w: 30, h: 18, c: "#f1ede2", d: "#b8b2a2" },
      { n: "box", w: 52, h: 16, c: "#e59866", d: "#a04000" }
    ];
    var stack, mover, falling, cam, camTo, toppling, perfect;
    function spawn() {
      var k = KINDS[stack.length < 2 ? 0 : Math.floor(Math.random() * KINDS.length)];
      mover = { k: k, x: W / 2 + (Math.random() < 0.5 ? -20 : 20), dir: Math.random() < 0.5 ? -1 : 1, speed: Math.min(130, 60 + stack.length * 5) };
    }
    function topY() { var t = stack[stack.length - 1]; return t ? t.y : BASE; }
    function drawThing(c, k, x, y, rot) {
      c.save(); c.translate(Math.round(x), Math.round(y)); if (rot) c.rotate(rot);
      var w = k.w, h = k.h; c.fillStyle = k.d; c.fillRect(-w / 2, -h, w, h); c.fillStyle = k.c; c.fillRect(-w / 2, -h, w, h - 3);
      if (k.n === "stapler") { c.fillStyle = "#e57368"; c.fillRect(-w / 2 + 3, -h + 2, w - 12, 2); c.fillStyle = "#555b63"; c.fillRect(w / 2 - 8, -h + 3, 6, h - 6); }
      if (k.n === "tape") { c.fillStyle = "#d4ac0d"; c.fillRect(-6, -h + 2, 12, 8); c.fillStyle = "#4d5656"; c.fillRect(-2, -h + 5, 4, 3); }
      if (k.n === "book") { c.fillStyle = "#f1ede2"; c.fillRect(-w / 2 + 2, -4, w - 4, 2); c.fillStyle = "#f4d03f"; c.fillRect(-6, -h + 3, 12, 2); }
      if (k.n === "mug") { c.fillStyle = k.c; c.fillRect(w / 2, -h + 4, 4, 2); c.fillRect(w / 2 + 3, -h + 4, 2, 8); c.fillRect(w / 2, -h + 10, 4, 2); c.fillStyle = "#6b4226"; c.fillRect(-w / 2 + 2, -h, w - 4, 3); }
      if (k.n === "box") { c.fillStyle = "#f6ddcc"; c.fillRect(-w / 2 + 4, -h + 4, w - 8, 3); c.fillStyle = "#f49ac1"; c.fillRect(-4, -h + 8, 8, 4); }
      c.restore();
    }
    function drop() { if (mover && !falling && !toppling) { falling = { k: mover.k, x: mover.x, y: 40 - cam, vy: 0 }; mover = null; } }
    return {
      start: function () { stack = []; cam = 0; camTo = 0; toppling = null; falling = null; perfect = 0; api.score(0); spawn(); },
      press: function (k) { if (k === "action" || k === "down") drop(); },
      pointer: function (type) { if (type === "down") drop(); },
      update: function (dt) {
        cam += (camTo - cam) * Math.min(1, dt * 4);
        if (mover) { mover.x += mover.dir * mover.speed * dt; if (mover.x > W / 2 + 115) mover.dir = -1; if (mover.x < W / 2 - 115) mover.dir = 1; }
        if (falling) {
          falling.vy += 420 * dt; falling.y += falling.vy * dt;
          var land = topY();
          if (falling.y >= land) {
            var t = stack[stack.length - 1], under = t ? t : { x: W / 2, k: { w: 150 } }, dx = falling.x - under.x;
            if (Math.abs(dx) > under.k.w / 2 + 2) { toppling = { k: falling.k, x: falling.x, y: land, vx: dx > 0 ? 40 : -40, vy: -40, rot: 0, vr: dx > 0 ? 4 : -4, t: 0 }; falling = null; return; }
            if (Math.abs(dx) < 3 && t) { falling.x = under.x; perfect++; api.toast("PERFECT! GRIMBLE APPLAUDS.", 1000); }
            stack.push({ k: falling.k, x: falling.x, y: land - falling.k.h }); falling = null; api.score(stack.length);
            camTo = Math.max(0, 110 - topY());   // keep the top of the tower in view
            spawn();
          }
        }
        if (toppling) {
          toppling.t += dt; toppling.vy += 300 * dt; toppling.x += toppling.vx * dt; toppling.y += toppling.vy * dt; toppling.rot += toppling.vr * dt;
          if (toppling.t > 1.3) { var n = stack.length; toppling = null; api.end({ title: "THE TOWER TOOK A LITTLE NAP.", msg: n ? n + " things tall! Moth says it was very architectural. Again?" : "It slid right off. The desk is slippery today. Again?", score: n }); }
        }
      },
      draw: function (c) {
        c.fillStyle = "#24323d"; c.fillRect(0, 0, W, H);
        c.save(); c.translate(0, Math.round(cam));
        c.fillStyle = "#2c3e4c"; for (var y = BASE - 400; y < BASE; y += 30) c.fillRect(0, y, W, 1);
        c.fillStyle = "#6b4a32"; c.fillRect(W / 2 - 80, BASE, 160, 10); c.fillStyle = "#5a3d29"; c.fillRect(W / 2 - 74, BASE + 10, 6, 40); c.fillRect(W / 2 + 68, BASE + 10, 6, 40);
        stack.forEach(function (s) { drawThing(c, s.k, s.x, s.y + s.k.h); });
        if (falling) drawThing(c, falling.k, falling.x, falling.y);
        if (toppling) drawThing(c, toppling.k, toppling.x, toppling.y, toppling.rot);
        c.restore();
        if (mover) { drawThing(c, mover.k, mover.x, 40); c.fillStyle = "rgba(255,243,160,.25)"; c.fillRect(Math.round(mover.x) - 1, 44, 2, 20); }
        if (!stack.length && mover) api.text(c, api.coarse ? "TAP TO DROP" : "SPACE / CLICK TO DROP", W / 2, 70, 9, "#fff3a0", "center");
      }
    };
  });

  /* attract-mode doodle behind the menu: a donut that bounces between a gremlin and a stapler */
  A.register("attract:office-olympics", function (c, t, api) {
    var x = 160 + Math.sin(t * 1.3) * 130, y = 214 - Math.abs(Math.sin(t * 2.6)) * 40;
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(0, 226, 320, 14);
    c.drawImage(api.sprite(DONUT, DONUT_PAL), Math.round(x) - 6, Math.round(y) - 6, 12, 12);
  });
})();
