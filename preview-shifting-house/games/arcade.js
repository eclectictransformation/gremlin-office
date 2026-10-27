/* Gremlin Arcade: the cabinet overlay for Gremlin World's Calm Arcade. No libraries, no network calls
   outside this folder. Machines and their menus live in world-data.json -> "arcade".machines; each
   machine's game code is its own file (games/<machine>.js) that calls GremlinArcade.register(id, factory).

   A game factory gets an `api` and returns { start(), update(dt), draw(ctx), press(key)?, release(key)?,
   pointer(type, x, y)? }. The screen is 320 x 240 logical pixels; keys are left/right/up/down/action.
   Games call api.score(n) as they go and api.end({ title, msg, score }) for a soft, silly ending.

   Ranked machines ("ranked": true, only Break Room Brawl) also show shared top-10 boards. The board data
   comes from hooks set by world-player.js via GremlinArcade.setHooks({ played, ended, leaderboard, ranked,
   signIn }); with no hooks (or no network) the cabinets still work exactly as before. */
(function () {
  "use strict";
  var GW = 320, GH = 240, HUD = 14;
  var factories = {}, scripts = {}, sprites = {}, held = {}, S = null, root = null, ctx = null, hooks = {};
  var pxScale = 1;   // CSS px per logical px, refreshed by fit()
  var EDGE_FRAC = 0.14, EDGE_MIN_CSS = 48, EDGE_MAX_FRAC = 0.2;   // paddle inset: 14% of the court or 48 CSS px, whichever is larger
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var KEYMAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
    ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down",
    " ": "action", Spacebar: "action", Enter: "action", z: "action", Z: "action", x: "action", X: "action" };
  var FONT = "ui-monospace, Menlo, Consolas, 'DejaVu Sans Mono', 'Courier New', monospace";
  var $ = function (s) { return root.querySelector(s); };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ---------- personal bests (this device only, just for fun) ---------- */
  function bestKey(id) { return "gremlin-world-arcade-best-" + id; }
  function getBest(id) { try { var v = localStorage.getItem(bestKey(id)); return v == null ? null : +v; } catch (e) { return null; } }
  function setBest(id, v) { try { localStorage.setItem(bestKey(id), String(v)); } catch (e) {} }

  /* ---------- registry + lazy loading ---------- */
  function register(id, factory) { factories[id] = factory; }
  function loadScript(src) {
    if (!src) return Promise.resolve();
    if (!scripts[src]) scripts[src] = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { delete scripts[src]; rej(new Error("Couldn't load " + src)); };
      document.head.appendChild(s);
    });
    return scripts[src];
  }

  /* ---------- drawing helpers shared with the games ---------- */
  // pixel sprite from rows of palette characters ('.' or any char missing from the palette = clear)
  function sprite(rows, pal) {
    var key = rows.join("|") + JSON.stringify(pal); if (sprites[key]) return sprites[key];
    var c = document.createElement("canvas"); c.width = rows[0].length; c.height = rows.length;
    var x = c.getContext("2d");
    rows.forEach(function (r, j) { for (var i = 0; i < r.length; i++) { var col = pal[r[i]]; if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); } } });
    return (sprites[key] = c);
  }
  function text(c, s, x, y, size, color, align, shadow) {
    c.font = "bold " + (size || 8) + "px " + FONT; c.textAlign = align || "left"; c.textBaseline = "top";
    if (shadow !== false) { c.fillStyle = "rgba(0,0,0,.6)"; c.fillText(s, x + 1, y + 1); }
    c.fillStyle = color || "#fff"; c.fillText(s, x, y);
  }
  function makeApi(cfg) {
    return {
      W: GW, H: GH, top: HUD + 2, reduced: reduce.matches, calm: !!(S && S.opts && S.opts.calm), coarse: coarse, id: cfg.id,
      held: function (k) { return !!held[k]; },
      score: function (n) { if (S) S.score = n; },
      end: end, sprite: sprite, text: text,
      best: function () { return getBest(cfg.id); },
      rnd: function (a, b) { return a + Math.random() * (b - a); },
      pick: function (a) { return a[Math.floor(Math.random() * a.length)]; },
      toast: function (s, ms) { if (S) S.toast = { s: s, until: S.t + (ms || 1400) / 1000 }; },
      time: function () { return S ? S.t : 0; },
      // how far a paddle sits in from the screen edge (logical px) so a thumb behind it doesn't cover it
      edgeInset: function (span) {
        span = span || GW;
        var v = Math.max(span * EDGE_FRAC, EDGE_MIN_CSS / (pxScale || 1));
        return Math.ceil(Math.min(v, span * EDGE_MAX_FRAC));
      }
    };
  }

  /* ---------- the cabinet overlay ---------- */
  function build() {
    root = el("div", "arcade-overlay"); root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "arcade-title");
    root.innerHTML =
      '<div class="cab">' +
        '<div class="cab-marquee"><h2 id="arcade-title"></h2><p class="cab-tag"></p></div>' +
        '<div class="cab-bezel"><div class="cab-screen" tabindex="-1">' +
          '<canvas width="320" height="240" aria-hidden="true"></canvas>' +
          '<div class="scr scr-menu"><p class="scr-head">PICK A GAME</p><ul class="menu"></ul><p class="scr-foot">NO TIMERS &middot; NO RUSH</p></div>' +
          '<div class="scr scr-over" hidden><p class="over-title"></p><p class="over-msg"></p><p class="over-score"></p>' +
            '<div class="board over-board" hidden><p class="board-status"></p><ol class="board-list"></ol></div>' +
            '<div class="over-btns"><button type="button" class="ab again">AGAIN?</button><button type="button" class="ab tomenu">OTHER GAMES</button>' +
            '<button type="button" class="ab getname" hidden>GET A NAME</button></div></div>' +
          '<div class="scr scr-boards" hidden><p class="scr-head">&#9733; TOP 10 &#9733;</p><div class="board-tabs"></div>' +
            '<div class="board"><p class="board-status"></p><ol class="board-list"></ol></div>' +
            '<div class="over-btns"><button type="button" class="ab boards-back">BACK</button><button type="button" class="ab getname" hidden>GET A NAME</button></div></div>' +
          '<div class="scr scr-prize" hidden><p class="over-title">&#9733; NICE ONE &#9733;</p><p class="prize-msg"></p><p class="prize-soon"></p>' +
            '<div class="over-btns"><button type="button" class="ab prize-ok">OK</button></div></div>' +
          '<p class="scr-live" aria-live="polite"></p>' +
        '</div></div>' +
        '<p class="cab-help"></p>' +
        '<div class="cab-pad">' +
          '<div class="dpad"><button type="button" tabindex="-1" data-k="up" aria-label="Up">&#9650;</button>' +
          '<button type="button" tabindex="-1" data-k="left" aria-label="Left">&#9664;</button>' +
          '<button type="button" tabindex="-1" data-k="down" aria-label="Down">&#9660;</button>' +
          '<button type="button" tabindex="-1" data-k="right" aria-label="Right">&#9654;</button></div>' +
          '<button type="button" tabindex="-1" class="act" data-k="action">GO</button>' +
        '</div>' +
        '<div class="cab-row"><button type="button" class="ab back">&#9664; BACK</button><button type="button" class="ab close" aria-label="Close the arcade cabinet">CLOSE &#10005;</button></div>' +
      '</div>';
    (document.getElementById("app") || document.body).appendChild(root);
    var cv = $("canvas"); ctx = cv.getContext("2d");

    $(".back").addEventListener("click", back);
    $(".close").addEventListener("click", close);
    $(".again").addEventListener("click", function () { if (S && S.cfg) startGame(S.cfg); });
    $(".tomenu").addEventListener("click", toMenu);
    $(".boards-back").addEventListener("click", toMenu);
    root.querySelectorAll(".getname").forEach(function (b) { b.addEventListener("click", function () {
      var pend = S && S.pending; close();
      if (hooks.signIn) hooks.signIn(pend);
    }); });
    $(".prize-ok").addEventListener("click", function () { $(".scr-prize").hidden = true; if (S) S.mode = "over"; $(".again").focus({ preventScroll: true }); });

    // on-screen buttons: hold to move, tap to act; they never take focus, so Space can't double-fire them
    root.querySelectorAll(".cab-pad button").forEach(function (b) {
      var k = b.dataset.k;
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (er) {} b.classList.add("on"); keyDown(k); });
      var up = function () { b.classList.remove("on"); keyUp(k); };
      b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
      b.addEventListener("click", function (e) { e.preventDefault(); });
    });

    // canvas pointer -> logical 320x240 coordinates
    function lp(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * GW, y: (e.clientY - r.top) / r.height * GH }; }
    cv.addEventListener("pointerdown", function (e) {
      if (!S || S.mode !== "play" || !S.game) return; e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      S.ptrDown = true; var p = lp(e); if (S.game.pointer) S.game.pointer("down", p.x, p.y);
    });
    cv.addEventListener("pointermove", function (e) { if (!S || S.mode !== "play" || !S.game || !S.game.pointer) return; var p = lp(e); S.game.pointer(S.ptrDown ? "drag" : "hover", p.x, p.y); });
    var pu = function (e) { if (!S || !S.ptrDown) return; S.ptrDown = false; if (S.mode === "play" && S.game && S.game.pointer) { var p = lp(e); S.game.pointer("up", p.x, p.y); } };
    cv.addEventListener("pointerup", pu); cv.addEventListener("pointercancel", pu);

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", function (e) { var k = KEYMAP[e.key]; if (k && S) keyUp(k); });
    window.addEventListener("blur", function () { held = {}; });
    window.addEventListener("resize", fit);
  }

  function keyDown(k) {
    if (!S) return;
    if (S.mode === "play") { if (!held[k] && S.game && S.game.press) S.game.press(k); held[k] = true; return; }
    // the on-screen pad also drives the menu and the end screen
    var btns = Array.prototype.filter.call(root.querySelectorAll(".scr:not([hidden]) button"), function (b) { return !b.disabled; });
    if (!btns.length) return;
    var i = btns.indexOf(document.activeElement);
    if (k === "action") { (btns[i] || btns[0]).click(); return; }
    var d = (k === "up" || k === "left") ? -1 : 1;
    btns[(i < 0 ? 0 : (i + d + btns.length) % btns.length)].focus({ preventScroll: true });
  }
  function keyUp(k) { if (held[k] && S && S.game && S.game.release) S.game.release(k); delete held[k]; }
  function onKey(e) {
    if (!S) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); back(); return; }
    var k = KEYMAP[e.key]; if (!k) return;
    if (S.mode === "play") { e.preventDefault(); if (!e.repeat) keyDown(k); return; }
    // in menus: arrows move between buttons; Enter/Space click the focused one natively
    if (k !== "action" && /^Arrow/.test(e.key)) { e.preventDefault(); keyDown(k); }
  }

  /* ---------- layout: the cabinet always fits inside the world view ---------- */
  function fit() {
    if (!S || root.hidden) return;
    var scr = $(".cab-screen"), cab = $(".cab"), cv = $("canvas");
    var bz = $(".cab-bezel"), cs = getComputedStyle(cab), bs = getComputedStyle(bz);
    var maxW = cab.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight);
    var chrome = cab.offsetHeight - scr.offsetHeight;
    var availH = root.clientHeight - 16 - chrome;
    var w = Math.max(200, Math.floor(Math.min(maxW, availH * 4 / 3)));
    scr.style.width = w + "px";
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * 0.75 * dpr);
    ctx.setTransform(cv.width / GW, 0, 0, cv.height / GH, 0, 0); ctx.imageSmoothingEnabled = false;
    pxScale = w / GW;
    root.style.setProperty("--px", (w / GW).toFixed(3));
  }

  /* ---------- modes: menu -> play -> over (soft) -> menu ---------- */
  function open(machine, opts) {
    if (!root) build();
    if (S) close(true);
    S = { m: machine, opts: opts || {}, mode: "menu", game: null, cfg: null, t: 0, last: 0, score: 0, toast: null, prized: {} };
    held = {};
    root.style.setProperty("--cab", machine.color || "#2f6b6b");
    root.style.setProperty("--cab-dark", machine.colorDark || "#1d4544");
    root.style.setProperty("--acc", machine.accent || "#f3d98b");
    root.style.setProperty("--scr", machine.screen || "#10201f");
    $("#arcade-title").textContent = machine.title || "ARCADE";
    $(".cab-tag").textContent = machine.tagline || "";
    root.hidden = false; root.classList.remove("in"); void root.offsetWidth; root.classList.add("in");
    renderMenu(true);
    S.raf = requestAnimationFrame(frame);
    loadScript(machine.script).then(function () { if (S && S.m === machine && S.mode === "menu") renderMenu(); })
      .catch(function () { if (S && S.m === machine) { $(".scr-head").textContent = "THIS MACHINE IS NAPPING. TRY AGAIN LATER."; } });
  }
  function renderMenu(loading) {
    var m = S.m, ul = $(".menu"); ul.innerHTML = "";
    S.mode = "menu"; S.game = null; S.cfg = null; held = {};
    $(".scr-menu").hidden = false; $(".scr-over").hidden = true; $(".scr-prize").hidden = true; $(".scr-boards").hidden = true;
    $(".scr-menu .scr-head").textContent = loading ? "WARMING UP\u2026" : "PICK A GAME";
    $(".scr-menu .scr-foot").textContent = m.foot || "NO TIMERS \u00b7 NO RUSH";
    root.classList.toggle("ranked", !!m.ranked);
    (m.games || []).forEach(function (g) {
      var li = el("li"), b = el("button", "menu-item"); b.type = "button";
      var ready = !!factories[g.id];
      b.appendChild(el("span", "mi-name", g.name));
      b.appendChild(el("span", "mi-blurb", g.blurb || ""));
      var best = getBest(g.id);
      b.appendChild(el("span", "mi-best", !ready ? (loading ? "" : "COMING SOON") : S.opts.calm ? "" : best != null ? "BEST " + (g.scoreLabel || "SCORE") + " " + best : "NEW!"));
      b.disabled = !ready;
      b.addEventListener("click", function () { startGame(g); });
      li.appendChild(b); ul.appendChild(li);
    });
    if (m.ranked && !loading) {
      var li2 = el("li"), bb = el("button", "menu-item boards-item"); bb.type = "button";
      bb.appendChild(el("span", "mi-name", "\u2605 Top 10 boards"));
      bb.appendChild(el("span", "mi-best", ""));
      bb.appendChild(el("span", "mi-blurb", "Who's the best in the break room? (Desk Duel is just for fun.)"));
      bb.addEventListener("click", function () { showBoards(); });
      li2.appendChild(bb); ul.appendChild(li2);
      tickerFor(m, bb.querySelector(".mi-best"));
    }
    setPad(null);
    $(".cab-help").textContent = m.hint || "Pick a game. Arrow keys or the pad below work too.";
    $(".back").innerHTML = "CLOSE &#10005;"; $(".back").hidden = true;
    fit();
    var first = ul.querySelector("button:not([disabled])");
    if (first) first.focus({ preventScroll: true }); else $(".close").focus({ preventScroll: true });
  }

  /* ---------- shared top-10 boards (ranked machines only) ---------- */
  function rankedGames(m) { return (m.games || []).filter(function (g) { return g.ranked; }); }
  // a small "#1 NAME 1234" ticker on the menu's boards button
  function tickerFor(m, span) {
    if (!hooks.leaderboard) return;
    var gs = rankedGames(m), lines = [];
    Promise.all(gs.map(function (g) { return hooks.leaderboard(g.id).then(function (rows) { if (rows && rows[0]) lines.push(g.name.split(" ")[0].toUpperCase() + ": " + rows[0].name + " " + rows[0].score); }, function () {}); }))
      .then(function () { if (!S || !span.isConnected) return; span.textContent = lines.length ? "#1 " + lines[0] : "BE THE FIRST!";
        var i = 0; clearInterval(S.tick); if (lines.length > 1) S.tick = setInterval(function () { if (!span.isConnected) return; i = (i + 1) % lines.length; span.textContent = "#1 " + lines[i]; }, 2600); });
  }
  function fillBoard(box, rows, status, me) {
    var ol = box.querySelector(".board-list"); ol.innerHTML = "";
    box.querySelector(".board-status").textContent = status || "";
    if (rows && rows.length) rows.forEach(function (r) {
      var li = el("li", me && r.name.toLowerCase() === me.toLowerCase() ? "me" : "");
      li.appendChild(el("span", "br-rank", String(r.rank))); li.appendChild(el("span", "br-name", r.name)); li.appendChild(el("span", "br-score", String(r.score)));
      ol.appendChild(li);
    });
    else if (rows) ol.appendChild(el("li", "empty", "Nobody yet. The board is fresh and sparkly."));
    box.hidden = false;
  }
  function guestNote() { return hooks.player && hooks.player() ? "" : "Get a Gremlin Name to join the board!"; }
  function showBoards(gameId) {
    if (!S) return;
    var gs = rankedGames(S.m); if (!gs.length) return;
    gameId = gameId || S.boardGame || gs[0].id; S.boardGame = gameId; S.mode = "boards";
    $(".scr-menu").hidden = true; $(".scr-over").hidden = true; $(".scr-boards").hidden = false;
    var tabs = $(".board-tabs"); tabs.innerHTML = "";
    gs.forEach(function (g) {
      var t = el("button", "ab tab" + (g.id === gameId ? " on" : ""), g.name.toUpperCase()); t.type = "button";
      t.setAttribute("aria-pressed", g.id === gameId ? "true" : "false");
      t.addEventListener("click", function () { showBoards(g.id); $(".board-tabs .tab.on").focus({ preventScroll: true }); });
      tabs.appendChild(t);
    });
    var box = $(".scr-boards .board"), me = hooks.player && hooks.player();
    $(".scr-boards .getname").hidden = !!me || !hooks.signIn;
    fillBoard(box, null, "Asking the gremlins\u2026");
    if (!hooks.leaderboard) { fillBoard(box, null, "The scoreboard is napping. Scores still count on this device."); return; }
    hooks.leaderboard(gameId).then(function (rows) {
      if (S && S.mode === "boards" && S.boardGame === gameId) fillBoard(box, rows, me ? "Your best counts. Play again to climb!" : guestNote(), me);
    }, function () { if (S && S.mode === "boards") fillBoard(box, null, "The scoreboard is napping (no connection). You can still play!"); });
    $(".scr-live").textContent = "Top 10 board for " + gameId;
  }
  function setPad(g) {
    var keys = g ? (g.pad || []) : ["up", "down", "left", "right", "action"];
    root.querySelectorAll(".cab-pad button").forEach(function (b) { b.classList.toggle("off", keys.indexOf(b.dataset.k) < 0); b.classList.remove("on"); });
    $(".cab-pad .act").textContent = g ? (g.actionLabel || "GO") : "PLAY";
    $(".cab-pad").classList.toggle("ud", !!g && keys.indexOf("left") < 0 && keys.indexOf("up") >= 0);
  }
  function startGame(g) {
    if (!S || !factories[g.id]) return;
    if (S.game && S.game.stop) S.game.stop();
    S.cfg = g; S.score = 0; S.toast = null; held = {};
    S.game = factories[g.id](makeApi(g)); if (S.game.start) S.game.start();
    S.mode = "play"; S.pending = null;
    $(".scr-menu").hidden = true; $(".scr-over").hidden = true; $(".scr-prize").hidden = true; $(".scr-boards").hidden = true;
    if (hooks.played) try { hooks.played(g, S.m); } catch (e) {}
    setPad(g);
    $(".cab-help").textContent = (coarse ? g.touchHelp : g.keysHelp) || g.keysHelp || "";
    $(".back").hidden = false; $(".back").innerHTML = "&#9664; GAMES";
    $(".scr-live").textContent = g.name + " started.";
    fit();
    $(".cab-screen").focus({ preventScroll: true });
  }
  function end(o) {
    if (!S || S.mode !== "play") return;
    o = o || {}; held = {};
    var g = S.cfg, score = o.score != null ? o.score : S.score, best = getBest(g.id), low = g.best === "low", isNew = false;
    if (score > 0 && (best == null || (low ? score < best : score > best))) { setBest(g.id, score); best = score; isNew = true; }
    S.mode = "over";
    $(".over-title").textContent = o.title || "NICE.";
    $(".over-msg").textContent = o.msg || "";
    $(".over-score").hidden = !!(S.opts.calm || g.scoreless);
    $(".over-score").textContent = (g.scoreLabel || "SCORE") + " " + score + "  \u00b7  BEST " + (best == null ? "-" : best) + (isNew ? "  \u2605 NEW PERSONAL BEST" : "");
    $(".scr-over").hidden = false;
    $(".scr-live").textContent = (o.title || "") + " " + (o.msg || "");
    setPad(null);
    setTimeout(function () { if (S && S.mode === "over") $(".again").focus({ preventScroll: true }); }, 700);   // a beat, so a held Space doesn't skip the joke
    if (hooks.ended) try { hooks.ended(g, score, S.m, isNew); } catch (e) {}
    var ob = $(".over-board"), gn = $(".scr-over .getname"); ob.hidden = true; gn.hidden = true;
    $(".scr-over").classList.toggle("has-board", !!(S.m.ranked && g.ranked));
    if (S.m.ranked && g.ranked) {
      var me = hooks.player && hooks.player(), mach = S.m;
      S.pending = score > 0 ? { game: g.id, score: score } : null;
      fillBoard(ob, null, me ? "Sending your score to the board\u2026" : "Asking the gremlins\u2026");
      var p = me && score > 0 && hooks.ranked ? hooks.ranked(g, score) : Promise.resolve(null);
      p.then(function (res) {
        return (hooks.leaderboard ? hooks.leaderboard(g.id) : Promise.reject()).then(function (rows) { return { res: res, rows: rows }; });
      }).then(function (o) {
        if (!S || S.mode !== "over" || S.m !== mach) return;
        var r = o.res, msg;
        if (!me) { msg = score > 0 ? "Get a Gremlin Name to put " + score + " on the board!" : "Get a Gremlin Name to join the board!"; gn.hidden = !hooks.signIn; }
        else if (!r) msg = score > 0 ? "" : "Score some points to get on the board.";
        else if (r.ok === false) msg = r.message || "The board didn't take that one. Try again in a minute.";
        else { S.pending = null; msg = r.top10 ? (r.improved ? "\u2605 You're #" + r.rank + " on the board!" : "Your best (" + r.best + ") is still #" + r.rank + ".") : (r.improved ? "New best! You're #" + r.rank + ". The top 10 is close." : "Your best is " + r.best + " (#" + r.rank + ")."); }
        fillBoard(ob, o.rows, msg, me);
      }).catch(function () {
        if (!S || S.mode !== "over" || S.m !== mach) return;
        fillBoard(ob, null, "The scoreboard is napping (no connection). Your score is saved on this device.");
        if (!me) gn.hidden = !hooks.signIn;
      });
    }
    maybeAwardPrize(g.id, score);
  }
  function toMenu() { if (!S) return; if (S.game && S.game.stop) S.game.stop(); renderMenu(); }
  function back() { if (!S) return; if (S.mode === "menu") close(); else toMenu(); }
  function setHooks(h) { hooks = h || {}; }
  function close(silent) {
    if (!S) return;
    if (S.game && S.game.stop) S.game.stop();
    cancelAnimationFrame(S.raf); clearInterval(S.tick);
    var cb = S.opts.onClose; S = null; held = {};
    root.hidden = true;
    if (!silent && cb) cb();
  }

  /* ---------- prize hook: OFF. Read README-world.md before changing anything here. ----------
     Each game in world-data.json may carry  "prize": { "enabled": false, "milestone": { "type": "score", "value": N }, "message": "" }.
     While disabled (every game ships disabled) this does nothing. If someone enables one without writing any
     more code, the most it can do is show a friendly "Prizes coming soon" note. Real rewards must never be
     hard-coded in this public file: they would come from a server or be checked by the booking system. */
  function findGame(id) {
    var ms = (S && S.opts.machines) || {}, out = null;
    Object.keys(ms).forEach(function (k) { (ms[k].games || []).forEach(function (g) { if (g.id === id) out = g; }); });
    if (!out && S && S.m) (S.m.games || []).forEach(function (g) { if (g.id === id) out = g; });
    return out;
  }
  function maybeAwardPrize(gameId, score) {
    var g = findGame(gameId), p = g && g.prize;
    if (!p || p.enabled !== true || !S) return false;
    var m = p.milestone || {};
    if (m.type !== "score" || typeof m.value !== "number" || typeof score !== "number" || score <= 0) return false;
    var reached = g.best === "low" ? score <= m.value : score >= m.value;
    if (!reached || S.prized[gameId]) return false;
    S.prized[gameId] = true;
    $(".prize-msg").textContent = p.message || "You reached a milestone!";
    $(".prize-soon").textContent = S.opts.prizeNote || "Prizes coming soon.";
    S.mode = "prize"; $(".scr-prize").hidden = false;
    setTimeout(function () { if (S && S.mode === "prize") $(".prize-ok").focus({ preventScroll: true }); }, 60);
    return true;
  }

  /* ---------- the loop (only runs while the cabinet is open) ---------- */
  var stars = [];
  for (var i = 0; i < 40; i++) stars.push([Math.random() * GW, Math.random() * GH, Math.random() * 6.28, 1 + (Math.random() * 2 | 0)]);
  function attract(c, t) {
    c.fillStyle = S.m.screen || "#10201f"; c.fillRect(0, 0, GW, GH);
    c.fillStyle = S.m.accent || "#f3d98b";
    stars.forEach(function (s) { var a = reduce.matches ? 0.6 : 0.35 + 0.35 * Math.sin(t * 1.5 + s[2]); c.globalAlpha = a; c.fillRect(s[0] | 0, ((s[1] + (reduce.matches ? 0 : t * 6 * s[3])) % GH) | 0, s[3], s[3]); });
    c.globalAlpha = 1;
    var f = factories["attract:" + S.m.id]; if (f) f(c, t, makeApi({ id: "attract" }));
  }
  function hud(c) {
    var g = S.cfg; c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(0, 0, GW, HUD);
    text(c, g.name.toUpperCase(), 4, 3, 8, S.m.accent || "#f3d98b", "left", false);
    var b = getBest(g.id);
    if (!S.opts.calm && !g.scoreless) text(c, (g.scoreLabel || "SCORE") + " " + S.score + "   BEST " + (b == null ? "-" : b), GW - 4, 3, 8, "#fff", "right", false);
    if (S.toast && S.t < S.toast.until) {
      c.font = "bold 9px " + FONT; var w = c.measureText(S.toast.s).width + 12;
      c.fillStyle = "rgba(0,0,0,.6)"; c.fillRect((GW - w) / 2 | 0, HUD + 4, w | 0, 14);
      text(c, S.toast.s, GW / 2, HUD + 6, 9, "#fff", "center", false);
    }
  }
  function frame(t) {
    if (!S) return;
    S.raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (t - (S.last || t)) / 1000); S.last = t; S.t += dt;
    if (S.mode === "play" && S.game) S.game.update(dt);
    if (S.game) { S.game.draw(ctx); hud(ctx); } else attract(ctx, S.t);
  }

  window.GremlinArcade = {
    register: register, open: open, close: close, back: back, setHooks: setHooks, showBoards: function (id) { showBoards(id); },
    factories: factories,
    isOpen: function () { return !!S; },
    get mode() { return S ? S.mode : "closed"; },
    get game() { return S && S.game; },
    maybeAwardPrize: maybeAwardPrize
  };
})();
