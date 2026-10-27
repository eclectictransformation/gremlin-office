/* GARDEN GREMLINS: very low-stakes gardening (and laundry). Original games, drawn in code.
   Registers: hungry-vine, sock-pairing, seed-packet-bonk (see world-data.json -> arcade). */
(function () {
  "use strict";
  var A = window.GremlinArcade; if (!A) return;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  var DROP = ["..b..", ".bbb.", "bbwbb", "bbbbb", ".bbb."], DROP_PAL = { b: "#5dade2", w: "#d6eaf8" };
  var SUN = ["y.y.y", ".yyy.", "yyoyy", ".yyy.", "y.y.y"], SUN_PAL = { y: "#f7dc6f", o: "#f39c12" };
  var SEED = [".dd.", "dlld", "dlld", ".dd."], SEED_PAL = { d: "#7e5109", l: "#c49a6c" };

  function soil(c, W, H) { c.fillStyle = "#2b2116"; c.fillRect(0, 0, W, H); }

  /* ===== HUNGRY VINE: Pip's plant grows toward droplets and sunbeams; a bonk just means nap time =====
     Tuned to be gentle: chunky cells, a thick vine, a slow start with a soft speed-up, a forgiving
     "near-miss still counts" sip, and a short WHOA! hesitation before a bonk so there's time to turn. */
  A.register("hungry-vine", function (api) {
    var CELL = 15, COLS = 20, ROWS = 14, OX = Math.round((api.W - COLS * CELL) / 2), OY = api.top + 4;
    var VINE = 11, PAD = (CELL - VINE) / 2, HALF = Math.ceil(CELL / 2);   // vine body 11 px wide (was 6), centred in the cell
    var STEP0 = 0.26, STEP_MIN = 0.2, STEP_RAMP = 0.001;                    // s per cell: was 0.17 -> 0.11, ramp 0.002/pt
    var GRACE = 2;                                                           // steps the vine hesitates before a bonk
    var body, dir, queue, step, acc, grow, drop, sun, sunWait, points, waiting, napping, sx, stall;
    function free(x, y) { return !body.some(function (b) { return b[0] === x && b[1] === y; }); }
    function place() { var x, y, n = 0; do { x = Math.floor(Math.random() * COLS); y = Math.floor(Math.random() * ROWS); } while ((!free(x, y) || (drop && drop[0] === x && drop[1] === y) || (sun && sun[0] === x && sun[1] === y)) && ++n < 500); return [x, y]; }
    function near(p, x, y) { return !!p && Math.abs(p[0] - x) + Math.abs(p[1] - y) <= 1; }   // on it, or brushing past right beside it
    function blocked(nx, ny) {
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return true;
      var t = body[body.length - 1];
      return !free(nx, ny) && !(grow === 0 && nx === t[0] && ny === t[1]);
    }
    function turn(k) {
      var d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[k]; if (!d) return;
      waiting = false;
      var last = queue.length ? queue[queue.length - 1] : dir;
      if (d[0] === -last[0] && d[1] === -last[1]) return;   // no folding back on yourself
      if (d[0] === last[0] && d[1] === last[1]) return;
      if (queue.length < 2) queue.push(d);
    }
    function nap() {
      napping = 1.2; api.toast("PIP'S PLANT NEEDS A NAP. ZZZ", 1200);
    }
    return {
      start: function () { body = [[6, 7], [5, 7], [4, 7]]; dir = [1, 0]; queue = []; step = STEP0; acc = 0; grow = 0; points = 0; drop = null; sun = null; drop = place(); sunWait = 6; waiting = true; napping = 0; stall = 0; api.score(0); },
      press: function (k) { if (napping) return; if (k === "action") { waiting = false; return; } turn(k); },
      pointer: function (type, x, y) {
        if (napping) return;
        if (type === "down") { sx = [x, y]; return; }
        if (type === "drag" && sx) { var dx = x - sx[0], dy = y - sx[1]; if (Math.hypot(dx, dy) > 18) { turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up")); sx = [x, y]; } return; }
        if (type === "up" && sx) {
          if (Math.hypot(x - sx[0], y - sx[1]) < 10) {   // a tap: turn toward the tapped side of the vine's head
            var h = body[0], hx = OX + h[0] * CELL + CELL / 2, hy = OY + h[1] * CELL + CELL / 2, ddx = x - hx, ddy = y - hy;
            if (dir[0] !== 0) turn(ddy < 0 ? "up" : "down"); else turn(ddx < 0 ? "left" : "right");
          }
          sx = null;
        }
      },
      update: function (dt) {
        if (napping) { napping -= dt; if (napping <= 0) api.end({ title: "PIP'S PLANT NEEDS A NAP.", msg: "It grew " + points + " " + (points === 1 ? "leaf" : "leaves") + " today. Water it again?", score: points }); return; }
        if (waiting) return;
        if (!sun) { sunWait -= dt; if (sunWait <= 0) sun = place(); }
        acc += dt; if (acc < step) return; acc -= step;
        if (queue.length) dir = queue.shift();
        var h = body[0], nx = h[0] + dir[0], ny = h[1] + dir[1];
        if (blocked(nx, ny)) {   // a little hesitation first: turn now and the vine carries on
          if (stall < GRACE) { if (!stall) api.toast(api.pick(["WHOA! TURN, TURN!", "EEP! A WALL!", "HOLD ON, LEAFY!"]), 700); stall++; return; }
          return nap();
        }
        stall = 0;
        body.unshift([nx, ny]);
        if (near(drop, nx, ny)) { grow += 1; points += 1; drop = place(); api.toast(api.pick(["SLURP!", "GLUG.", "REFRESHING!", "MMM, WATER."]), 600); }
        if (near(sun, nx, ny)) { grow += 2; points += 3; sun = null; sunWait = api.rnd(5, 10); api.toast("SUNBEAM! +3", 900); }
        if (grow > 0) grow--; else body.pop();
        step = Math.max(STEP_MIN, STEP0 - points * STEP_RAMP);
        api.score(points);
      },
      draw: function (c) {
        var W = api.W, H = api.H; soil(c, W, H);
        c.fillStyle = "#3a2c1d"; c.fillRect(OX - 2, OY - 2, COLS * CELL + 4, ROWS * CELL + 4);
        c.fillStyle = "#33271a"; for (var i = 0; i < COLS; i++) for (var j = 0; j < ROWS; j++) if ((i + j) % 2) c.fillRect(OX + i * CELL, OY + j * CELL, CELL, CELL);
        if (drop) c.drawImage(api.sprite(DROP, DROP_PAL), OX + drop[0] * CELL + 1, OY + drop[1] * CELL + 1 + (api.reduced ? 0 : Math.round(Math.sin(api.time() * 4))), CELL - 2, CELL - 2);
        if (sun) c.drawImage(api.sprite(SUN, SUN_PAL), OX + sun[0] * CELL + 1, OY + sun[1] * CELL + 1, CELL - 2, CELL - 2);
        // the vine: a dark outline pass, then the green stem on top, so the thick body still reads as one plant
        var pass = function (col, grow2) {
          c.fillStyle = col;
          for (var k = body.length - 1; k >= 0; k--) {
            var b = body[k], x = OX + b[0] * CELL + PAD - grow2, y = OY + b[1] * CELL + PAD - grow2, s = VINE + grow2 * 2;
            c.fillRect(x, y, s, s);
            var nb = body[k - 1] || null; if (nb) c.fillRect(x + (nb[0] - b[0]) * HALF, y + (nb[1] - b[1]) * HALF, s, s);
          }
        };
        pass("#1b5e20", 1); pass("#2e7d32", 0);
        for (var k = 1; k < body.length; k += 2) {   // little leaves along the stem
          var b = body[k], x = OX + b[0] * CELL, y = OY + b[1] * CELL;
          c.fillStyle = "#66bb6a"; c.fillRect(x + (k % 4 === 1 ? PAD + 1 : CELL - PAD - 5), y + (k % 4 === 1 ? PAD + 1 : CELL - PAD - 5), 4, 4);
        }
        var t = body[body.length - 1], tx = OX + t[0] * CELL, ty = OY + t[1] * CELL;
        c.fillStyle = "#c0632d"; c.fillRect(tx + 1, ty + 6, CELL - 2, CELL - 6); c.fillStyle = "#e07b39"; c.fillRect(tx - 1, ty + 4, CELL + 2, 3);
        var h = body[0], hx = OX + h[0] * CELL, hy = OY + h[1] * CELL;
        c.fillStyle = "#1b5e20"; c.fillRect(hx, hy, CELL, CELL);
        c.fillStyle = stall && !napping ? "#aed581" : "#81c784"; c.fillRect(hx + 1, hy + 1, CELL - 2, CELL - 2);
        c.fillStyle = "#f8bbd0"; c.fillRect(hx + 5, hy - 2, 5, 3);
        if (napping) { c.fillStyle = "#1b5e20"; c.fillRect(hx + 3, hy + 6, 3, 1); c.fillRect(hx + 9, hy + 6, 3, 1); api.text(c, "z", hx + 15, hy - 8 - Math.round((1.2 - napping) * 8), 9, "#fff"); }
        else { c.fillStyle = "#111"; c.fillRect(hx + 3, hy + 4, 3, 3); c.fillRect(hx + 9, hy + 4, 3, 3); c.fillRect(hx + 6, hy + 10, 3, 1); if (stall) c.fillRect(hx + 6, hy + 9, 3, 3); }
        if (waiting) api.text(c, api.coarse ? "SWIPE OR TAP TO GROW" : "PRESS AN ARROW TO GROW", W / 2, OY + 60, 10, "#fff3a0", "center");
      }
    };
  });

  /* ===== SOCK PAIRING: the laundry came out of the dryer in a memory game ===== */
  var SOCK = [
    "..xxxxx.", ".xooooox", ".xooooox", ".xooooox", ".xooooox", ".xooooox", ".xooooox", ".xooooox",
    "xooooooox", "xoooooooox", "xoooooooox", "xhhhhtttx.", ".xxxxxxx.."].map(function (r) { return (r + "..........").slice(0, 10); });
  var DESIGNS = [
    { a: "#e74c3c", b: "#fdfefe", p: "stripes" }, { a: "#3498db", b: "#f7dc6f", p: "dots" }, { a: "#27ae60", b: "#a9dfbf", p: "zig" },
    { a: "#8e44ad", b: "#f5b7b1", p: "heel" }, { a: "#f39c12", b: "#6e2c00", p: "check" }, { a: "#ecf0f1", b: "#e74c3c", p: "heart" }
  ];
  function sockSprite(api, d) {
    var rows = SOCK.map(function (r, j) {
      return r.split("").map(function (ch, i) {
        if (ch !== "o" && ch !== "h" && ch !== "t") return ch;
        if (ch === "h" || ch === "t") return d.p === "heel" ? "b" : "a";
        if (j === 0 || j === 1) return "b";
        if (d.p === "stripes") return j % 3 === 0 ? "b" : "a";
        if (d.p === "dots") return (i + j) % 4 === 0 && j % 2 === 0 ? "b" : "a";
        if (d.p === "zig") return (i + j) % 4 === 0 || (j - i + 8) % 4 === 0 ? "b" : "a";
        if (d.p === "check") return ((i >> 1) + (j >> 1)) % 2 ? "b" : "a";
        if (d.p === "heart") return (j === 4 && (i === 3 || i === 5)) || (j === 5 && i >= 3 && i <= 5) || (j === 6 && i === 4) ? "b" : "a";
        return "a";
      }).join("");
    });
    return api.sprite(rows, { x: "#1a1a18", a: d.a, b: d.b });
  }
  A.register("sock-pairing", function (api) {
    var COLS = 4, ROWS = 3, CW = 58, CH = 62, GAP = 8, X0, Y0, cards, open, cur, tries, wait, pairs, done;
    return {
      start: function () {
        X0 = Math.round((api.W - (COLS * CW + (COLS - 1) * GAP)) / 2); Y0 = api.top + 8;
        var deck = []; DESIGNS.forEach(function (d, i) { deck.push(i, i); });
        for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
        cards = deck.map(function (d, i) { return { d: d, up: false, got: false, flip: 0, x: X0 + (i % COLS) * (CW + GAP), y: Y0 + Math.floor(i / COLS) * (CH + GAP) }; });
        open = []; cur = 0; tries = 0; wait = 0; pairs = 0; done = 0; api.score(0);
      },
      press: function (k) {
        if (k === "left") cur = (cur + cards.length - 1) % cards.length; else if (k === "right") cur = (cur + 1) % cards.length;
        else if (k === "up") cur = (cur + cards.length - COLS) % cards.length; else if (k === "down") cur = (cur + COLS) % cards.length;
        else if (k === "action") this.flipCard(cur);
      },
      flipCard: function (i) {
        var cd = cards[i]; if (!cd || cd.up || cd.got || wait > 0 || open.length >= 2 || done) return;
        cd.up = true; cd.flip = 1; open.push(i);
        if (open.length === 2) {
          tries++; api.score(tries);
          var a = cards[open[0]], b = cards[open[1]];
          if (a.d === b.d) { a.got = b.got = true; open = []; pairs++; api.toast(api.pick(["A PAIR! REUNITED!", "MATCH! THEY MISSED EACH OTHER.", "TOGETHER AGAIN!"]), 900); if (pairs === DESIGNS.length) done = 1.2; }
          else { wait = 0.9; api.toast(api.pick(["NOT QUITE. ODD SOCKS.", "CLOSE! (NOT CLOSE.)", "THOSE TWO ARE JUST FRIENDS."]), 800); }
        }
      },
      pointer: function (type, x, y) {
        if (type !== "down") return;
        for (var i = 0; i < cards.length; i++) { var cd = cards[i]; if (x >= cd.x && x < cd.x + CW && y >= cd.y && y < cd.y + CH) { cur = i; this.flipCard(i); return; } }
      },
      update: function (dt) {
        cards.forEach(function (cd) { if (cd.flip > 0) cd.flip = Math.max(0, cd.flip - dt * 7); });
        if (wait > 0) { wait -= dt; if (wait <= 0) { open.forEach(function (i) { cards[i].up = false; cards[i].flip = 1; }); open = []; } }
        if (done > 0) { done -= dt; if (done <= 0) api.end({ title: "ALL SOCKS PAIRED!", msg: "In " + tries + " tries. Grimble is weeping happy tears into a (matching) sock.", score: tries }); }
      },
      draw: function (c) {
        c.fillStyle = "#1f3a4a"; c.fillRect(0, 0, api.W, api.H);
        c.fillStyle = "#24455a"; for (var y = 0; y < api.H; y += 8) c.fillRect(0, y, api.W, 1);
        cards.forEach(function (cd, i) {
          var sq = api.reduced ? 1 : Math.abs(1 - 2 * cd.flip) || 0.05, w = Math.max(2, Math.round(CW * sq)), x = cd.x + Math.round((CW - w) / 2);
          var showFace = cd.up && (cd.flip < 0.5 || api.reduced);
          c.fillStyle = cd.got ? "#d5f5e3" : showFace ? "#fdfefe" : "#c0392b"; c.fillRect(x, cd.y, w, CH);
          c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(x, cd.y + CH - 3, w, 3);
          if (showFace) { if (w > 20) c.drawImage(sockSprite(api, DESIGNS[cd.d]), x + (w - Math.round(30 * sq)) / 2, cd.y + 11, Math.round(30 * sq), 39); }
          else if (w > 20) { c.fillStyle = "#e6b0aa"; for (var k = 0; k < 4; k++) c.fillRect(x + 6, cd.y + 10 + k * 12, w - 12, 2); api.text(c, "?", x + w / 2, cd.y + 22, 16, "#fdfefe", "center"); }
          if (i === cur && !api.coarse) { c.strokeStyle = "#f7dc6f"; c.lineWidth = 2; c.strokeRect(cd.x - 2, cd.y - 2, CW + 4, CH + 4); }
        });
      }
    };
  });

  /* ===== SEED PACKET BONK: bounce a seed off a watering can to open the seed packets =====
     The can sits up off the bottom edge (api.edgeInset of the court height: 14% or 48 CSS px), so a thumb
     dragging along the strip below it never hides it. */
  A.register("seed-packet-bonk", function (api) {
    var W = api.W, H = api.H, PY = 222, CANH = 9, PW = 46, COLS = 8, ROWS = 4, BW = 34, BH = 16, GAP = 4;
    var COLORS = ["#e74c3c", "#f39c12", "#27ae60", "#8e44ad"], FLOWERS = ["#fdebd0", "#fff3a0", "#f5b7b1", "#d6eaf8"];
    var pad, ball, packets, seeds, opened, stuck, target, bits;
    function layout() { PY = H - api.edgeInset(H) - CANH; }   // was a fixed 222 (9 px off the bottom)
    function resetBall() { ball = { x: pad, y: PY - 6, vx: 0, vy: 0 }; stuck = true; }
    function launch() { if (!stuck) return; stuck = false; ball.vx = api.rnd(-60, 60); ball.vy = -140; }
    return {
      start: function () {
        layout(); pad = W / 2; seeds = 3; opened = 0; target = null; bits = []; api.score(0);
        var x0 = Math.round((W - (COLS * BW + (COLS - 1) * GAP)) / 2);
        packets = []; for (var r = 0; r < ROWS; r++) for (var cI = 0; cI < COLS; cI++) packets.push({ x: x0 + cI * (BW + GAP), y: api.top + 14 + r * (BH + GAP), r: r, on: true });
        resetBall();
      },
      press: function (k) { if (k === "action" || k === "up") launch(); },
      pointer: function (type, x) { if (type === "down" || type === "drag" || type === "hover") target = x; if (type === "up" && stuck) launch(); },
      update: function (dt) {
        layout();
        var mv = (api.held("right") ? 1 : 0) - (api.held("left") ? 1 : 0);
        if (mv) { pad += mv * 220 * dt; target = null; } else if (target != null) pad += clamp(target - pad, -300 * dt, 300 * dt);
        pad = clamp(pad, PW / 2 + 2, W - PW / 2 - 2);
        bits = bits.filter(function (b) { b.t -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 120 * dt; return b.t > 0; });
        if (stuck) { ball.x = pad; ball.y = PY - 6; return; }
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < 3) { ball.x = 3; ball.vx = Math.abs(ball.vx); } if (ball.x > W - 3) { ball.x = W - 3; ball.vx = -Math.abs(ball.vx); }
        if (ball.y < api.top + 2) { ball.y = api.top + 2; ball.vy = Math.abs(ball.vy); }
        if (ball.vy > 0 && ball.y + 3 >= PY - 2 && ball.y < PY + 6 && Math.abs(ball.x - pad) < PW / 2 + 3) {
          var off = (ball.x - pad) / (PW / 2), sp = Math.min(210, Math.hypot(ball.vx, ball.vy) + 2);
          ball.vx = sp * Math.sin(off * 1.0); ball.vy = -Math.abs(sp * Math.cos(off * 1.0)); ball.y = PY - 5;
        }
        for (var i = 0; i < packets.length; i++) {
          var p = packets[i]; if (!p.on) continue;
          if (ball.x + 3 > p.x && ball.x - 3 < p.x + BW && ball.y + 3 > p.y && ball.y - 3 < p.y + BH) {
            p.on = false; opened++; api.score(opened);
            var fromSide = Math.min(Math.abs(ball.x - p.x), Math.abs(ball.x - p.x - BW)) < Math.min(Math.abs(ball.y - p.y), Math.abs(ball.y - p.y - BH));
            if (fromSide) ball.vx = -ball.vx; else ball.vy = -ball.vy;
            for (var k = 0; k < 5; k++) bits.push({ x: p.x + BW / 2, y: p.y + BH / 2, vx: api.rnd(-40, 40), vy: api.rnd(-60, 0), t: 0.8, c: k % 2 ? "#66bb6a" : FLOWERS[p.r] });
            if (opened === packets.length) return api.end({ title: "THE WHOLE GARDEN IS PLANTED!", msg: "Every packet opened. The gremlins have no idea what's coming up. Lovely.", score: opened });
            break;
          }
        }
        if (ball.y > H + 8) {
          seeds--;
          if (seeds <= 0) return api.end({ title: "ALL THE SEEDS ROLLED INTO THE COMPOST.", msg: "Honestly? The compost is thrilled. Plant again?", score: opened });
          api.toast(api.pick(["THE SEED ROLLED INTO THE COMPOST.", "PLOP. IT'S IN THE POTATOES NOW.", "OFF IT GOES. SAY BYE."]), 1400); resetBall();
        }
      },
      draw: function (c) {
        c.fillStyle = "#1e3b2a"; c.fillRect(0, 0, W, H);
        c.fillStyle = "#4e342e"; c.fillRect(0, H - 8, W, 8);
        packets.forEach(function (p) {
          if (!p.on) return;
          c.fillStyle = COLORS[p.r]; c.fillRect(p.x, p.y, BW, BH);
          c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(p.x, p.y, BW, 2);
          c.fillStyle = "#fdfefe"; c.fillRect(p.x + 3, p.y + 4, 12, 9);
          c.fillStyle = FLOWERS[p.r]; c.fillRect(p.x + 7, p.y + 5, 4, 4); c.fillStyle = "#27ae60"; c.fillRect(p.x + 8, p.y + 9, 2, 3);
          c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(p.x + 18, p.y + 5, 12, 2); c.fillRect(p.x + 18, p.y + 9, 9, 2);
        });
        bits.forEach(function (b) { c.fillStyle = b.c; c.fillRect(Math.round(b.x), Math.round(b.y), 2, 2); });
        // the watering can
        var px = Math.round(pad - PW / 2);
        c.fillStyle = "#5d8aa8"; c.fillRect(px + 6, PY, PW - 12, 9); c.fillStyle = "#85b4d3"; c.fillRect(px + 6, PY, PW - 12, 3);
        c.fillStyle = "#5d8aa8"; c.fillRect(px, PY + 2, 7, 2); c.fillRect(px - 2, PY, 3, 3); c.fillRect(px + PW - 6, PY + 2, 5, 5);
        c.fillStyle = "#d6eaf8"; c.fillRect(px - 3, PY - 1, 1, 1); c.fillRect(px - 4, PY + 1, 1, 1);
        c.drawImage(api.sprite(SEED, SEED_PAL), Math.round(ball.x) - 3, Math.round(ball.y) - 3, 6, 6);
        for (var s = 0; s < seeds; s++) c.drawImage(api.sprite(SEED, SEED_PAL), W - 12 - s * 9, H - 7, 6, 6);
        if (stuck) api.text(c, api.coarse ? "TAP TO PLANT" : "SPACE / CLICK TO PLANT", W / 2, 160, 9, "#fff3a0", "center");
      }
    };
  });

  /* attract-mode doodle: a little vine that waves */
  A.register("attract:garden-gremlins", function (c, t, api) {
    for (var i = 0; i < 26; i++) {
      var x = 4 + i * 12, y = 220 + Math.round(Math.sin(t * 1.5 + i * 0.5) * (api.reduced ? 0 : 4));
      c.fillStyle = "#2e7d32"; c.fillRect(x, y, 10, 4); if (i % 3 === 0) { c.fillStyle = "#66bb6a"; c.fillRect(x + 3, y - 4, 4, 4); }
    }
    c.drawImage(api.sprite(DROP, DROP_PAL), 150, 40 + Math.round(((t * 40) % 160)), 10, 10);
  });
})();
