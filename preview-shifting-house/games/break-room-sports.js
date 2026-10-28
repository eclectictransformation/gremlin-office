/* BREAK ROOM SPORTS: two calm ball games for the Break Room. Original, drawn in code, no sounds, no timers.
   Registers: skee-ball, hoops, attract:break-room-sports.
   Both games: a fixed number of balls (no countdown), a power meter that fills slowly while you hold
   (Space, the ROLL/SHOOT button, or a touch/click), and let go to throw. Reduced motion: balls travel ~4x faster
   and the meter steps instead of gliding. Personal bests are saved by games/arcade.js like every other game. */
(function () {
  "use strict";
  var A = window.GremlinArcade; if (!A) return;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };

  // a slow power meter: 0 -> 1 -> 0 over ~3.6 s while held
  function Meter(api) {
    var m = { on: false, t: 0, v: 0 };
    m.start = function () { m.on = true; m.t = 0; m.v = 0; };
    m.update = function (dt) { if (!m.on) return; m.t += dt; var ph = (m.t * 0.55) % 2; m.v = ph < 1 ? ph : 2 - ph; if (api.reduced) m.v = Math.round(m.v * 10) / 10; };
    m.stop = function () { m.on = false; return clamp(m.v, 0.05, 1); };
    m.draw = function (c, x, y, h, label) {
      c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(x - 1, y - 1, 10, h + 2);
      var g = c.createLinearGradient(0, y + h, 0, y); g.addColorStop(0, "#7fc8a9"); g.addColorStop(0.6, "#f3d98b"); g.addColorStop(1, "#f2a65a");
      c.fillStyle = g; var fh = Math.round(h * m.v); c.fillRect(x, y + h - fh, 8, fh);
      c.strokeStyle = "#f6efe0"; c.lineWidth = 1; c.strokeRect(x - 0.5, y - 0.5, 9, h + 1);
      api.text(c, label, x + 4, y + h + 4, 8, "#f6efe0", "center");
    };
    return m;
  }
  function endLine(lines) { return pick(lines); }

  /* ===== SKEE-BALL: nine balls up a ramp into the rings (10-50) or the little 100 cup ===== */
  A.register("skee-ball", function (api) {
    var W = api.W, H = api.H, BALLS = 9;
    var CX = 160, CY = 74, RINGS = [[50, 9], [40, 18], [30, 27], [20, 36], [10, 46]], CUPS = [[124, 34], [196, 34]], CUP_R = 7;
    var aim, meter, ball, left, total, pops, said, aimV, dead = false;
    function landing(p) {   // where a ball with power p and angle aim stops
      var d = 40 + p * 172, sx = CX, sy = H - 18;
      return { x: sx + Math.sin(aim) * d, y: sy - Math.cos(aim) * d };
    }
    function scoreAt(x, y) {
      for (var i = 0; i < CUPS.length; i++) if (Math.hypot(x - CUPS[i][0], y - CUPS[i][1]) <= CUP_R) return 100;
      var d = Math.hypot(x - CX, y - CY);
      for (var j = 0; j < RINGS.length; j++) if (d <= RINGS[j][1]) return RINGS[j][0];
      return 0;
    }
    function roll() {
      if (ball || left <= 0) return;
      var p = meter.stop(), to = landing(p);
      ball = { x0: CX, y0: H - 18, x1: to.x, y1: to.y, t: 0, dur: api.reduced ? 0.3 : 1.3 };
      left--;
    }
    function finish() {
      var lines = total >= 300 ? ["Noodle: \"That lane likes you. The tickets are blank, but they're all yours.\"", "Dot: \"Very tidy rolling. I'd print that score on a little card.\""]
        : total >= 120 ? ["Grimble: \"Nine balls, no hurry. That felt nice to watch.\"", "Pip: \"Some went in, some went exploring. Both count.\""]
        : ["Vesper: \"The balls took the scenic route. That's allowed here.\"", "Moth: \"Every roll was a soft line. I liked them all.\""];
      api.end({ title: "NINE BALLS ROLLED.", msg: endLine(lines), score: total });
    }
    return {
      stop: function () { dead = true; },
      start: function () { dead = false; aim = 0; aimV = 0; meter = Meter(api); ball = null; left = BALLS; total = 0; pops = []; said = false; api.score(0); },
      press: function (k) { if (k === "action" && !ball && left > 0) meter.start(); },
      release: function (k) { if (k === "action" && meter.on) roll(); },
      pointer: function (type, x, y) {
        if (type === "hover" || type === "drag" || type === "down") aim = clamp(Math.atan2(x - CX, Math.max(30, H - 18 - y)), -0.5, 0.5);
        if (type === "down" && !ball && left > 0) meter.start();
        if (type === "up" && meter.on) roll();
      },
      update: function (dt) {
        var mv = (api.held("right") ? 1 : 0) - (api.held("left") ? 1 : 0); aim = clamp(aim + mv * 0.45 * dt, -0.5, 0.5);
        meter.update(dt);
        if (ball) {
          ball.t += dt / ball.dur;
          if (ball.t >= 1) {
            var s = scoreAt(ball.x1, ball.y1); total += s; api.score(total);
            pops.push({ x: ball.x1, y: ball.y1, s: s, a: api.reduced ? 1.2 : 1.6 });
            if (s === 100 && !said) { said = true; api.toast("THE LITTLE CUP! NOODLE IS CLAPPING SOFTLY.", 2000); }
            ball = null;
            if (left === 0) { left = -1; setTimeout(function () { if (!dead) finish(); }, api.reduced ? 300 : 1200); }
          }
        }
        for (var i = pops.length - 1; i >= 0; i--) { pops[i].a -= dt; if (pops[i].a <= 0) pops.splice(i, 1); }
      },
      draw: function (c) {
        c.fillStyle = "#3b2340"; c.fillRect(0, 0, W, H);
        // the ramp: a wooden lane narrowing toward the rings
        c.fillStyle = "#b07a4a"; c.beginPath(); c.moveTo(70, H); c.lineTo(250, H); c.lineTo(222, api.top + 4); c.lineTo(98, api.top + 4); c.closePath(); c.fill();
        c.strokeStyle = "#7a4f2c"; c.lineWidth = 2; c.stroke();
        c.fillStyle = "#4a2d1a"; c.beginPath(); c.arc(CX, CY, 52, 0, 6.283); c.fill();
        var cols = ["#f2a65a", "#f3d98b", "#7fc8a9", "#6fa8dc", "#c9a0dc"];
        for (var j = RINGS.length - 1; j >= 0; j--) { c.fillStyle = cols[j]; c.beginPath(); c.arc(CX, CY, RINGS[j][1], 0, 6.283); c.fill(); c.strokeStyle = "#4a2d1a"; c.lineWidth = 1.5; c.stroke(); }
        for (var r = 0; r < RINGS.length; r++) api.text(c, String(RINGS[r][0]), CX, CY - RINGS[r][1] + 1, 7, "#2b1a10", "center", false);
        CUPS.forEach(function (p) { c.fillStyle = "#2b1a10"; c.beginPath(); c.arc(p[0], p[1], CUP_R, 0, 6.283); c.fill(); c.strokeStyle = "#f3d98b"; c.stroke(); api.text(c, "100", p[0], p[1] + 9, 7, "#f3d98b", "center"); });
        // aim line (short, so there's still a little guessing)
        if (!ball && left > 0) {
          c.strokeStyle = "rgba(246,239,224,.7)"; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(CX, H - 18); c.lineTo(CX + Math.sin(aim) * 60, H - 18 - Math.cos(aim) * 60); c.stroke(); c.setLineDash([]);
          c.fillStyle = "#e8e2f4"; c.beginPath(); c.arc(CX, H - 18, 7, 0, 6.283); c.fill();
        }
        if (ball) {
          var e = 1 - Math.pow(1 - Math.min(1, ball.t), 2), x = ball.x0 + (ball.x1 - ball.x0) * e, y = ball.y0 + (ball.y1 - ball.y0) * e;
          c.fillStyle = "#e8e2f4"; c.beginPath(); c.arc(x, y, 7 - 3 * e, 0, 6.283); c.fill();
        }
        pops.forEach(function (p) { c.globalAlpha = clamp(p.a, 0, 1); api.text(c, p.s ? "+" + p.s : "ROLLED HOME", p.x, p.y - 14, p.s ? 10 : 7, "#fff7d6", "center"); c.globalAlpha = 1; });
        meter.draw(c, 290, 120, 90, "POWER");
        api.text(c, "BALLS " + Math.max(0, left), 10, 222, 8, "#f6efe0");
        if (left === 9 && !meter.on) api.text(c, api.coarse ? "HOLD, THEN LET GO" : "HOLD SPACE, LET GO", 10, 120, 8, "#f6efe0");
      }
    };
  });

  /* ===== HOOPS: ten soft arcs at a friendly hoop ===== */
  A.register("hoops", function (api) {
    var W = api.W, H = api.H, SHOTS = 10, G = 230;
    var BX = 52, BY = 196, RIM_L = 236, RIM_R = 262, RIM_Y = 104, BOARD_X = 270;
    var ang, meter, ball, left, made, msg, trail, over, dead = false;
    function shoot() {
      if (ball || left <= 0) return;
      var p = meter.stop(), v = 150 + p * 150;
      ball = { x: BX, y: BY, vx: Math.cos(ang) * v, vy: -Math.sin(ang) * v, t: 0, scored: false, prevY: BY };
      left--; trail = [];
    }
    function settle() {
      ball = null;
      if (left <= 0 && !over) { over = true; setTimeout(function () { if (!dead) finish(); }, api.reduced ? 300 : 1100); }
    }
    function finish() {
      var lines = made >= 7 ? ["Grimble: \"Soft arcs, every one. The hoop says thank you.\"", "Noodle: \"That was basically ballet. With a ball.\""]
        : made >= 3 ? ["Pip: \"Some swished, some bonked. Bonks are just practice in disguise.\"", "Dot: \"Good shooting. The backboard enjoyed the company.\""]
        : ["Vesper: \"The hoop is shy today. It was still glad you came.\"", "Moth: \"Ten lovely curves in the air. I'd draw every one.\""];
      api.end({ title: "TEN SHOTS TAKEN.", msg: pick(lines), score: made });
    }
    return {
      stop: function () { dead = true; },
      start: function () { dead = false; ang = 0.95; meter = Meter(api); ball = null; left = SHOTS; made = 0; msg = null; trail = []; over = false; api.score(0); },
      press: function (k) { if (k === "action" && !ball && left > 0) meter.start(); },
      release: function (k) { if (k === "action" && meter.on) shoot(); },
      pointer: function (type, x, y) {
        if (type === "hover" || type === "drag" || type === "down") ang = clamp(Math.atan2(BY - y, Math.max(10, x - BX)), 0.6, 1.35);
        if (type === "down" && !ball && left > 0) meter.start();
        if (type === "up" && meter.on) shoot();
      },
      update: function (dt) {
        var mv = (api.held("up") ? 1 : 0) - (api.held("down") ? 1 : 0); ang = clamp(ang + mv * 0.5 * dt, 0.6, 1.35);
        meter.update(dt);
        if (msg) { msg.a -= dt; if (msg.a <= 0) msg = null; }
        if (!ball) return;
        var steps = api.reduced ? 4 : 1, h = dt / 1.4;   // a slow, floaty arc (reduced motion: ~4x quicker)
        for (var s = 0; s < steps * 4 && ball; s++) {
          ball.prevY = ball.y; ball.vy += G * h; ball.x += ball.vx * h; ball.y += ball.vy * h; ball.t += h;
          if (ball.x + 5 > BOARD_X && ball.y > RIM_Y - 46 && ball.y < RIM_Y + 6 && ball.vx > 0) { ball.vx = -ball.vx * 0.5; ball.x = BOARD_X - 5; }
          [RIM_L, RIM_R].forEach(function (rx) { if (!ball) return; var dx = ball.x - rx, dy = ball.y - RIM_Y, d = Math.hypot(dx, dy); if (d < 6) { var nx = dx / d, ny = dy / d, dot = ball.vx * nx + ball.vy * ny; if (dot < 0) { ball.vx -= 1.6 * dot * nx; ball.vy -= 1.6 * dot * ny; } } });
          if (!ball.scored && ball.vy > 0 && ball.prevY < RIM_Y && ball.y >= RIM_Y && ball.x > RIM_L + 3 && ball.x < RIM_R - 3) {
            ball.scored = true; made++; api.score(made); msg = { s: pick(["SWISH.", "IN!", "LOVELY.", "NICE ARC."]), a: 1.4 };
          }
          if (ball.y > H + 10 || ball.x < -10 || ball.x > W + 10 || ball.t > 5) { if (!ball.scored) msg = { s: pick(["SO CLOSE.", "BONK. FRIENDLY BONK.", "NEXT ONE."]), a: 1.2 }; settle(); }
        }
        if (ball && trail) { trail.push([ball.x, ball.y]); if (trail.length > 12) trail.shift(); }
      },
      draw: function (c) {
        var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2a3550"); g.addColorStop(1, "#4b3a5a"); c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.fillStyle = "#7a5636"; c.fillRect(0, 210, W, 30);
        // pole, backboard, net, rim
        c.fillStyle = "#8c8c9a"; c.fillRect(BOARD_X + 4, RIM_Y - 30, 5, 140);
        c.fillStyle = "#f6efe0"; c.fillRect(BOARD_X, RIM_Y - 48, 6, 58); c.strokeStyle = "#f2a65a"; c.strokeRect(BOARD_X + 0.5, RIM_Y - 30.5, 5, 18);
        c.strokeStyle = "#f6efe0"; c.lineWidth = 1; for (var i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(RIM_L + i * 6.5, RIM_Y); c.lineTo(RIM_L + 5 + i * 4, RIM_Y + 18); c.stroke(); }
        c.strokeStyle = "#f2734a"; c.lineWidth = 3; c.beginPath(); c.moveTo(RIM_L, RIM_Y); c.lineTo(RIM_R + 6, RIM_Y); c.stroke(); c.lineWidth = 1;
        // the little gremlin thrower (a soft green blob with ears)
        c.fillStyle = "#7fae6b"; c.beginPath(); c.arc(BX - 16, BY + 6, 12, 0, 6.283); c.fill();
        c.beginPath(); c.moveTo(BX - 26, BY - 2); c.lineTo(BX - 34, BY - 12); c.lineTo(BX - 22, BY - 4); c.fill(); c.beginPath(); c.moveTo(BX - 6, BY - 2); c.lineTo(BX + 2, BY - 12); c.lineTo(BX - 10, BY - 4); c.fill();
        c.fillStyle = "#1d2b1a"; c.fillRect(BX - 21, BY + 3, 2, 2); c.fillRect(BX - 13, BY + 3, 2, 2);
        if (!ball && left > 0) {   // short dotted guide
          var v = 150 + meter.v * 150, vx = Math.cos(ang) * v, vy = -Math.sin(ang) * v;
          c.fillStyle = "rgba(246,239,224,.7)"; for (var k = 1; k <= 6; k++) { var t = k * 0.06; c.fillRect(BX + vx * t - 1, BY + vy * t + 0.5 * G * t * t - 1, 2, 2); }
        }
        if (trail) trail.forEach(function (p, i) { c.globalAlpha = i / trail.length * 0.35; c.fillStyle = "#f2a65a"; c.beginPath(); c.arc(p[0], p[1], 3, 0, 6.283); c.fill(); }); c.globalAlpha = 1;
        var bx = ball ? ball.x : BX, by = ball ? ball.y : BY;
        if (ball || left > 0) { c.fillStyle = "#e8894a"; c.beginPath(); c.arc(bx, by, 6, 0, 6.283); c.fill(); c.strokeStyle = "#7a3f1c"; c.beginPath(); c.moveTo(bx - 6, by); c.lineTo(bx + 6, by); c.stroke(); }
        if (msg) { c.globalAlpha = clamp(msg.a, 0, 1); api.text(c, msg.s, 200, 140, 10, "#fff7d6", "center"); c.globalAlpha = 1; }
        meter.draw(c, 12, 60, 90, "POWER");
        api.text(c, "SHOTS " + Math.max(0, left) + "  IN " + made, 120, 222, 8, "#f6efe0");
        if (left === SHOTS && !meter.on && !ball) api.text(c, api.coarse ? "HOLD, THEN LET GO" : "\u2191\u2193 AIM, HOLD SPACE", 110, 40, 8, "#f6efe0");
      }
    };
  });

  A.register("attract:break-room-sports", function (c, t, api) {
    var y = 150 - Math.abs(Math.sin(t * (api.reduced ? 0 : 1.2))) * 40;
    c.fillStyle = "#e8894a"; c.beginPath(); c.arc(220, y, 8, 0, 6.283); c.fill();
    c.fillStyle = "#f3d98b"; c.beginPath(); c.arc(100, 160, 22, 0, 6.283); c.fill(); c.fillStyle = "#7fc8a9"; c.beginPath(); c.arc(100, 160, 12, 0, 6.283); c.fill();
  });
})();
