/* Gremlin Chess (hidden preview). Mounts the chess table into any element:
     GremlinChess.mount(el, { base: "preview-chess/", preview: true, onClose: fn })
   Rules come from chess.js (vendor/chess.js, BSD-2-Clause); the gremlins think in a Web Worker (chess-engine.js).
   No clock, no server calls: the game in progress, who you've beaten and the Still-mode choice live in localStorage.
   The Gremlin Name (if logged in) is read from the same storage key as world-player.js, only to say hello. */
(function () {
  "use strict";
  var PFX = "gremlin-world-", SAVE = PFX + "chess-game", BEAT = PFX + "chess-beaten", ALL = PFX + "chess-show-all";
  var mem = {};
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return mem[k] !== undefined ? mem[k] : d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} delete mem[k]; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn, label) { var b = el("button", cls, text); b.type = "button"; if (label) b.setAttribute("aria-label", label); if (fn) b.addEventListener("click", fn); return b; }
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
  function fill(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; }); }

  /* ---------- the six gremlins, easiest first ---------- */
  var CREW = [
    { id: "noodle", name: "Noodle", acorns: 1, room: "the Dispatch Loft", undo: true,
      line: "Snack-fueled chaos. Cheerful about every single move.",
      how: "Moves almost at random. Very easy.",
      away: "Noodle is always here. Noodle lives at this table.",
      hi: ["Ooh, chess! Is the horse one allowed to jump? It is? Amazing.", "I brought crackers. Do you want to be the crackers or the crumbs?"],
      cap: ["Oops, snack!", "I took one! Was that allowed? It was? Hooray!"], lost: ["Oh no, my snacks!", "Hee, you got me."], check: ["Your king looks a bit worried. Sorry, king."],
      beat: "You beat me! Okay, okay, close your eyes. Now open them. It's a tiny paper crown I folded out of a cracker box. It's for you. Mostly.",
      won: "I won?! I didn't even know I was trying. Good game, you were very kind to my snacks.", draw: "A tie! That means we both get a cracker." },
    { id: "pip", name: "Pip", acorns: 2, room: "the Idea Greenhouse", undo: true,
      line: "A bouncy idea-gardener who loves a daring plan.",
      how: "Loves to attack, often forgets to defend. Easy.",
      away: "Pip is watering the idea jars. Back soon.",
      hi: ["Let's grow a big idea on this board!", "I have a plan. It's very bold. Don't look at it."],
      cap: ["Snip! Pruned that one.", "A daring leap!"], lost: ["Oh! I forgot to water that one.", "Hmm, that plan wilted."], check: ["Check! Isn't that exciting?"],
      beat: "You beat me! That was the best idea on the whole board. I saved you a seed from the greenhouse. Plant it somewhere sunny.",
      won: "My wild plan worked! Good game. Want to try again? Maybe yours will sprout this time.", draw: "Nobody won, so we both get to keep growing!" },
    { id: "dot", name: "Dot", acorns: 3, room: "the Back-Room Press", undo: true,
      line: "A tidy printer who likes everything lined up just so.",
      how: "Careful. Keeps pieces protected and pawns neat. Easy to medium.",
      away: "Dot is lining up the letter blocks. Back soon.",
      hi: ["Let's keep everything nice and tidy.", "Mind the ink. Your move first, if you like."],
      cap: ["That one was out of line.", "Tidied away."], lost: ["Oh. I left a gap there.", "Smudged."], check: ["Check. Neatly done, if I say so myself."],
      beat: "You beat me, fair and square, and everything lined up beautifully. The cat and I printed you a little certificate. The ink is still wet.",
      won: "Good game. Everything ended up in its right place, I think. Shall we set them up again?", draw: "A perfectly balanced board. How tidy." },
    { id: "moth", name: "Moth", acorns: 3, room: "the Lantern Loft", undo: false,
      line: "A dreamy artist who follows the light, and sometimes a hunch.",
      how: "Thinks a few moves ahead, then follows a hunch. Medium.",
      away: "Moth is painting lanterns. Back tomorrow.",
      hi: ["The light on this board is lovely tonight.", "Shall we paint a game together?"],
      cap: ["That piece flew toward the light.", "A soft little swoop."], lost: ["Oh, I was looking at the lamp.", "A smudge in my painting."], check: ["Check. The light is on your king."],
      beat: "You beat me! That was a beautiful game, like a painting. I made you a tiny lantern doodle to remember it by.",
      won: "I won, but your moves had such nice colours. Good game.", draw: "A draw. Like a sketch we'll finish another day." },
    { id: "vesper", name: "Vesper", acorns: 4, room: "the Returns Bin", undo: false,
      line: "A quiet librarian who reads the whole board like a book.",
      how: "Patient and solid. Knows some classic openings. Strong.",
      away: "Vesper is shelving returned books. Back soon.",
      hi: ["Welcome. Let's open a good book.", "Every game is a story. Shall we begin?"],
      cap: ["Returned to the shelf.", "A small chapter ends."], lost: ["Well read.", "Hm. I skipped a page."], check: ["Check, gently."],
      beat: "You beat me. I'll have to write that chapter down. I set a bookmark aside for you, pressed with a little fern.",
      won: "Good game. You turned some lovely pages. Come back and we'll read another.", draw: "A draw. A story with a quiet ending." },
    { id: "grimble", name: "Grimble", acorns: 5, room: "the Listening Burrow", undo: false, hint: true,
      line: "The wise old burrow-keeper. Warm, unhurried, the strongest of us.",
      how: "Thinks furthest ahead. Offers gentle hints if you ask. Strongest.",
      away: "Grimble is napping in the burrow. Back tomorrow.",
      hi: ["Come in, sit down. There's no hurry at this table.", "Take all the time you like. I'll put the kettle on."],
      cap: ["Mm. That one's mine, I'm afraid.", "Ah. A careful trade."], lost: ["Oh, well played.", "Very good. I didn't see that."], check: ["Check. Breathe. You have time."],
      beat: "Well, well. You beat me. I haven't been beaten in ages, and it feels rather wonderful. I've tucked something away for you in the burrow.",
      won: "Good game. You played thoughtfully. Shall we look at it again? There's always another.", draw: "A draw with me is a fine thing. Well played." }
  ];
  var BY = {}; CREW.forEach(function (g) { BY[g.id] = g; });
  var PRIZE = "A little prize from the gremlins is coming soon.";

  /* daily rotation: three at the table, Noodle always, plus anyone you've already beaten */
  function dayNumber(d) { d = d || new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function todaysCrew(d) {
    var others = ["pip", "dot", "moth", "vesper", "grimble"], n = dayNumber(d);
    return ["noodle", others[n % 5], others[(n + 2) % 5]];
  }

  /* ---------- glyphs ---------- */
  var GLYPH = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };
  var NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
  var FILES = "abcdefgh";

  function still() { return document.documentElement.classList.contains("gw-still") || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }

  function mount(host, opts) {
    opts = opts || {};
    var base = opts.base || "", Chess = window.ChessJS.Chess;
    var player = load(PFX + "player", null);
    if (player && player.expires_at && Date.parse(player.expires_at) < Date.now()) player = null;
    var me = player && player.name ? player.name : null;
    var root = el("div", "gc"); host.innerHTML = ""; host.appendChild(root);
    var live = el("p", "gc-sr"); live.setAttribute("aria-live", "polite"); live.setAttribute("role", "status");
    var worker = null, reqId = 0, pending = {};
    function getWorker() {
      if (worker) return worker;
      try { worker = new Worker(base + "chess-engine.js"); worker.onmessage = function (e) { var cb = pending[e.data.id]; delete pending[e.data.id]; if (cb) cb(e.data); }; }
      catch (e) { worker = null; }
      return worker;
    }
    function ask(fen, who, hint, cb) {
      var w = getWorker(), id = ++reqId;
      if (w) { pending[id] = cb; w.postMessage({ id: id, fen: fen, who: who, hint: !!hint }); return; }
      // no workers (rare): load the engine on the page and think there
      function run() { setTimeout(function () { cb(window.GremlinChessEngine.think(fen, who, { hint: hint })); }, 30); }
      if (window.GremlinChessEngine) run(); else { var s = document.createElement("script"); s.src = base + "chess-engine.js"; s.onload = run; document.head.appendChild(s); }
    }

    var state = null;   // { who, color, moves: [san], over }
    var game = null, sel = null, focusSq = null, thinking = false, lastMove = null, hintMove = null;

    /* ---------- screen 1: the picker ---------- */
    function showPicker() {
      root.innerHTML = ""; root.appendChild(live);
      var head = el("div", "gc-head");
      head.appendChild(el("h2", "gc-title", "The chess table"));
      head.appendChild(el("p", "gc-hello", me ? "Hello, " + me + ". Pull up a stool." : "Hello, guest gremlin. Pull up a stool."));
      root.appendChild(head);
      var saved = load(SAVE, null);
      if (saved && BY[saved.who] && !saved.over) {
        var res = el("div", "gc-resume");
        res.appendChild(el("p", "", "You have a game going with " + BY[saved.who].name + " (" + saved.moves.length + " moves so far)."));
        res.appendChild(btn("gc-btn", "Pick up where you left off", function () { startGame(saved.who, saved.color, saved.moves); }));
        root.appendChild(res);
      }
      root.appendChild(el("p", "gc-sub", "Who would you like to play? There's no clock. Leave any time and your game waits for you."));
      var beaten = load(BEAT, {}), today = todaysCrew(), showAll = !!opts.preview && load(ALL, false);
      if (opts.preview) {
        var tg = el("label", "gc-toggle"); var cb = el("input"); cb.type = "checkbox"; cb.checked = showAll;
        cb.addEventListener("change", function () { save(ALL, cb.checked); showPicker(); var t = root.querySelector(".gc-toggle input"); if (t) t.focus(); });
        tg.appendChild(cb); tg.appendChild(el("span", "", "Preview only: show all six gremlins"));
        root.appendChild(tg);
      }
      var ul = el("ul", "gc-crew");
      CREW.forEach(function (g) {
        var here = today.indexOf(g.id) >= 0 || beaten[g.id] || showAll;
        var li = el("li", "gc-g" + (here ? "" : " away")), card = el(here ? "button" : "div", "gc-gcard");
        if (here) { card.type = "button"; card.addEventListener("click", function () { chooseColor(g); }); card.setAttribute("aria-label", "Play " + g.name + ". " + g.how + (beaten[g.id] ? " You've beaten " + g.name + " before." : "")); }
        var img = el("img", "gc-face"); img.src = base + "../assets/gremlins/" + g.id + ".webp"; img.alt = ""; img.width = 72; img.height = 72; card.appendChild(img);
        var tx = el("span", "gc-gtext");
        var nm = el("span", "gc-gname", g.name); tx.appendChild(nm);
        var ac = el("span", "gc-acorns"); ac.setAttribute("aria-hidden", "true"); for (var i = 0; i < 5; i++) ac.appendChild(el("span", i < g.acorns ? "on" : "off", i < g.acorns ? "\u25CF" : "\u25CB")); tx.appendChild(ac);
        tx.appendChild(el("span", "gc-gline", here ? g.line : g.away));
        if (here) tx.appendChild(el("span", "gc-ghow", g.how));
        if (beaten[g.id]) tx.appendChild(el("span", "gc-badge", "Beaten " + (beaten[g.id] > 1 ? beaten[g.id] + " times" : "once") + ". Always welcome now."));
        card.appendChild(tx); li.appendChild(card); ul.appendChild(li);
      });
      root.appendChild(ul);
      root.appendChild(el("p", "gc-fine", "Three gremlins sit at the table each day. Noodle is always here, and any gremlin you've beaten will play you any day."));
      if (opts.onClose) root.appendChild(btn("gc-btn ghost", "Back to the arcade", opts.onClose));
      var f = root.querySelector(".gc-resume .gc-btn") || root.querySelector(".gc-gcard[type=button]"); if (f && opts.focus !== false) f.focus({ preventScroll: true });
    }
    function chooseColor(g) {
      root.innerHTML = ""; root.appendChild(live);
      var c = el("div", "gc-choose");
      var img = el("img", "gc-face big"); img.src = base + "../assets/gremlins/" + g.id + ".webp"; img.alt = g.name; c.appendChild(img);
      c.appendChild(el("h2", "gc-title", "Play " + g.name));
      c.appendChild(el("p", "gc-say", "\u201C" + pickOne(g.hi) + "\u201D"));
      c.appendChild(el("p", "gc-sub", "Which pieces would you like? White moves first."));
      var row = el("div", "gc-row");
      row.appendChild(btn("gc-btn", "White", function () { startGame(g.id, "w", []); }));
      row.appendChild(btn("gc-btn", "Black", function () { startGame(g.id, "b", []); }));
      row.appendChild(btn("gc-btn ghost", "Surprise me", function () { startGame(g.id, Math.random() < 0.5 ? "w" : "b", []); }));
      c.appendChild(row);
      c.appendChild(btn("gc-btn ghost small", "Back to the gremlins", showPicker));
      root.appendChild(c); row.firstChild.focus({ preventScroll: true });
    }

    /* ---------- screen 2: the board ---------- */
    var boardEl, sayEl, statusEl, ctrl, sqEls = {};
    function startGame(who, color, moves) {
      game = new Chess(); lastMove = null; sel = null; hintMove = null; thinking = false;
      (moves || []).forEach(function (m) { try { var r = game.move(m); lastMove = r; } catch (e) {} });
      state = { who: who, color: color, moves: game.history(), over: false }; persist();
      var g = BY[who];
      root.innerHTML = ""; root.appendChild(live);
      var top = el("div", "gc-top");
      var img = el("img", "gc-face"); img.src = base + "../assets/gremlins/" + who + ".webp"; img.alt = ""; img.width = 64; img.height = 64; top.appendChild(img);
      var tb = el("div", "gc-topt"); tb.appendChild(el("p", "gc-vs", (me || "You") + " vs " + g.name));
      sayEl = el("p", "gc-say"); sayEl.setAttribute("aria-live", "polite"); tb.appendChild(sayEl); top.appendChild(tb);
      root.appendChild(top);
      boardEl = el("div", "gc-board"); boardEl.setAttribute("role", "grid"); boardEl.setAttribute("aria-label", "Chess board. You play " + (color === "w" ? "white" : "black") + ". Use the arrow keys to move around, Enter to pick up and put down.");
      sqEls = {};
      for (var r = 0; r < 8; r++) {
        var row = el("div", "gc-rank"); row.setAttribute("role", "row");
        for (var c = 0; c < 8; c++) {
          var file = color === "w" ? c : 7 - c, rank = color === "w" ? 8 - r : r + 1, sq = FILES[file] + rank;
          var b = el("button", "gc-sq " + ((file + rank) % 2 ? "light" : "dark")); b.type = "button"; b.dataset.sq = sq; b.setAttribute("role", "gridcell"); b.tabIndex = -1;
          if (c === 0) b.appendChild(el("span", "gc-coord r", String(rank)));
          if (r === 7) b.appendChild(el("span", "gc-coord f", FILES[file]));
          b.appendChild(el("span", "gc-pc"));
          b.addEventListener("click", onSquare.bind(null, sq));
          b.addEventListener("keydown", onKey);
          sqEls[sq] = b; row.appendChild(b);
        }
        boardEl.appendChild(row);
      }
      root.appendChild(boardEl);
      statusEl = el("p", "gc-status"); root.appendChild(statusEl);
      ctrl = el("div", "gc-ctrl"); root.appendChild(ctrl);
      focusSq = color === "w" ? "e2" : "e7";
      say(moves && moves.length ? "Welcome back. Your game was right where you left it." : pickOne(g.hi));
      draw(); controls();
      sqEls[focusSq].tabIndex = 0;
      if (opts.focus !== false) sqEls[focusSq].focus({ preventScroll: true });
      if (game.turn() !== color && !game.isGameOver()) gremlinMove();
      else if (game.isGameOver()) finish();
    }
    function persist() { if (state) { state.moves = game.history(); save(SAVE, state); } }
    function say(t) { if (sayEl) sayEl.textContent = "\u201C" + t + "\u201D"; }
    function pieceName(p) { return (p.color === "w" ? "white " : "black ") + NAME[p.type]; }
    function draw() {
      var legal = sel ? game.moves({ square: sel, verbose: true }) : [], tos = {};
      legal.forEach(function (m) { tos[m.to] = m.captured ? "cap" : "dot"; });
      var inCheck = game.inCheck(), kingSq = null;
      Object.keys(sqEls).forEach(function (sq) {
        var b = sqEls[sq], p = game.get(sq), pc = b.querySelector(".gc-pc");
        pc.textContent = p ? GLYPH[p.type] + "\uFE0E" : ""; pc.className = "gc-pc" + (p ? " " + p.color : "");
        b.classList.toggle("sel", sel === sq);
        b.classList.toggle("dot", tos[sq] === "dot"); b.classList.toggle("cap", tos[sq] === "cap");
        b.classList.toggle("last", !!lastMove && (lastMove.from === sq || lastMove.to === sq));
        b.classList.toggle("hint", !!hintMove && (hintMove.from === sq || hintMove.to === sq));
        var chk = inCheck && p && p.type === "k" && p.color === game.turn(); b.classList.toggle("check", !!chk);
        b.setAttribute("aria-label", sq + ", " + (p ? pieceName(p) : "empty") + (tos[sq] ? ", you can move here" : "") + (sel === sq ? ", picked up" : "") + (chk ? ", in check" : ""));
      });
      var mine = game.turn() === state.color;
      statusEl.textContent = state.over ? "Game over." : thinking ? BY[state.who].name + " is thinking\u2026 (no rush)" : mine ? (inCheck ? "Check! Your move." : "Your move.") : BY[state.who].name + "'s move.";
    }
    function controls() {
      ctrl.innerHTML = ""; var g = BY[state.who];
      if (state.over) {
        ctrl.appendChild(btn("gc-btn", "Play " + g.name + " again", function () { startGame(state.who, state.color === "w" ? "b" : "w", []); }));
        ctrl.appendChild(btn("gc-btn ghost", "Pick another gremlin", function () { showPicker(); }));
        return;
      }
      if (g.undo) ctrl.appendChild(btn("gc-btn ghost small", "Undo", undo, "Take back your last move"));
      if (g.hint) ctrl.appendChild(btn("gc-btn ghost small", "Ask Grimble for a hint", hint));
      ctrl.appendChild(btn("gc-btn ghost small", "Tip my hat (resign)", confirmResign));
      ctrl.appendChild(btn("gc-btn ghost small", "Leave for now", function () { persist(); showPicker(); }, "Leave the table. Your game is saved."));
    }
    function moveFocus(sq) { if (sqEls[focusSq]) sqEls[focusSq].tabIndex = -1; focusSq = sq; sqEls[sq].tabIndex = 0; sqEls[sq].focus({ preventScroll: true }); }
    function onKey(e) {
      var sq = e.currentTarget.dataset.sq, f = FILES.indexOf(sq[0]), r = +sq[1], flip = state.color === "b" ? -1 : 1, k = e.key;
      var d = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
      if (d) { e.preventDefault(); var nf = f + d[0] * flip, nr = r + d[1] * flip; if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) moveFocus(FILES[nf] + nr); return; }
      if (k === "Escape" && sel) { e.preventDefault(); sel = null; draw(); live.textContent = "Put it back."; }
    }
    function onSquare(sq) {
      if (state.over || thinking || game.turn() !== state.color) { if (thinking) live.textContent = BY[state.who].name + " is still thinking."; return; }
      if (focusSq !== sq) { if (sqEls[focusSq]) sqEls[focusSq].tabIndex = -1; focusSq = sq; sqEls[sq].tabIndex = 0; }
      var p = game.get(sq);
      if (sel) {
        var ms = game.moves({ square: sel, verbose: true }).filter(function (m) { return m.to === sq; });
        if (ms.length) { if (ms.length > 1 || ms[0].promotion) askPromotion(ms, sq); else doMove(ms[0]); return; }
        if (p && p.color === state.color && sq !== sel) { sel = sq; draw(); announceSel(sq); return; }
        sel = null; draw(); live.textContent = "Put it back."; return;
      }
      if (p && p.color === state.color) {
        if (!game.moves({ square: sq }).length) { live.textContent = "That " + NAME[p.type] + " has nowhere to go right now."; return; }
        sel = sq; draw(); announceSel(sq);
      }
    }
    function announceSel(sq) { var n = game.moves({ square: sq, verbose: true }).map(function (m) { return m.to; }); live.textContent = "Picked up the " + NAME[game.get(sq).type] + " on " + sq + ". It can go to " + n.join(", ") + "."; }
    function askPromotion(ms, sq) {
      var dlg = el("div", "gc-promo"); dlg.setAttribute("role", "group"); dlg.setAttribute("aria-label", "Your pawn reached the end. Pick what it becomes.");
      dlg.appendChild(el("p", "", "Your pawn made it! It becomes a\u2026"));
      ["q", "r", "b", "n"].forEach(function (t) {
        var m = ms.filter(function (x) { return x.promotion === t; })[0]; if (!m) return;
        var b = btn("gc-btn ghost", GLYPH[t] + "\uFE0E " + NAME[t], function () { dlg.remove(); doMove(m); }); dlg.appendChild(b);
      });
      ctrl.parentNode.insertBefore(dlg, ctrl); dlg.querySelector("button").focus();
    }
    function speakMove(m, whoName) { return whoName + " " + NAME[m.piece] + " " + m.from + " to " + m.to + (m.captured ? ", takes " + NAME[m.captured] : "") + (m.san.indexOf("#") >= 0 ? ", checkmate" : m.san.indexOf("+") >= 0 ? ", check" : "") + "."; }
    function doMove(m) {
      var r = game.move({ from: m.from, to: m.to, promotion: m.promotion }); lastMove = r; sel = null; hintMove = null; persist();
      live.textContent = speakMove(r, "You moved");
      var g = BY[state.who];
      if (r.captured && Math.random() < 0.5) say(pickOne(g.lost));
      draw();
      if (game.isGameOver()) return finish();
      gremlinMove();
    }
    function gremlinMove() {
      thinking = true; draw();
      var g = BY[state.who], t0 = Date.now(), myGame = game;
      ask(game.fen(), state.who, false, function (res) {
        if (game !== myGame || state.over) return;
        var wait = Math.max(0, (still() ? 150 : 550) - (Date.now() - t0));   // a short, calm pause so the move doesn't snap
        setTimeout(function () {
          if (game !== myGame || state.over) return;
          thinking = false;
          if (!res || !res.move) { draw(); return; }
          var r = game.move(res.move); lastMove = r; persist();
          live.textContent = speakMove(r, g.name + " moved") + (game.turn() === state.color && !game.isGameOver() ? " Your move." : "");
          if (r.san.indexOf("+") >= 0 && r.san.indexOf("#") < 0) say(pickOne(g.check)); else if (r.captured && Math.random() < 0.6) say(pickOne(g.cap));
          draw();
          if (game.isGameOver()) finish();
          else if (sqEls[focusSq] && document.activeElement && document.activeElement.classList.contains("gc-sq")) sqEls[focusSq].focus({ preventScroll: true });
        }, wait);
      });
    }
    function undo() {
      if (thinking || !game.history().length) return;
      game.undo(); if (game.turn() !== state.color && game.history().length) game.undo();
      var h = game.history({ verbose: true }); lastMove = h[h.length - 1] || null; sel = null; hintMove = null; persist(); draw();
      say(state.who === "noodle" ? "Take-backsies! Sure!" : state.who === "pip" ? "A do-over! Gardeners love those." : "Of course. Let's tidy that up.");
      live.textContent = "Took back your last move. Your move.";
      if (game.turn() !== state.color) gremlinMove();
    }
    function hint() {
      if (thinking || game.turn() !== state.color) return;
      say("Let me have a little look\u2026"); statusEl.textContent = "Grimble is looking for a hint\u2026";
      ask(game.fen(), "grimble", true, function (res) {
        if (!res || !res.move) return;
        hintMove = res.move; var p = game.get(res.move.from); draw();
        var t = "Perhaps the " + NAME[p.type] + " on " + res.move.from + " would like to visit " + res.move.to + ". Only if you like it.";
        say(t); live.textContent = "Hint: " + NAME[p.type] + " from " + res.move.from + " to " + res.move.to + ".";
      });
    }
    function confirmResign() {
      var box = el("div", "gc-promo"); box.setAttribute("role", "group"); box.setAttribute("aria-label", "Resign?");
      box.appendChild(el("p", "", "Tip your hat and end this game? " + BY[state.who].name + " won't mind."));
      var yes = btn("gc-btn", "Yes, tip my hat", function () { box.remove(); state.over = true; state.result = "resigned"; persist(); end("resigned"); });
      var no = btn("gc-btn ghost", "Keep playing", function () { box.remove(); sqEls[focusSq].focus(); });
      box.appendChild(yes); box.appendChild(no); ctrl.parentNode.insertBefore(box, ctrl); no.focus();
    }
    function finish() {
      state.over = true;
      var res = game.isCheckmate() ? (game.turn() === state.color ? "lost" : "won") : "draw";
      state.result = res; persist(); end(res);
    }
    /* ---------- the end: the surprise moment, a kind loss, or a tie ---------- */
    function end(res) {
      thinking = false; draw(); controls(); del(SAVE);
      var g = BY[state.who], beaten = load(BEAT, {});
      if (res === "won") { beaten[g.id] = (beaten[g.id] || 0) + 1; save(BEAT, beaten); }
      var ov = el("div", "gc-end " + res); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "gc-end-h");
      var card = el("div", "gc-endcard");
      if (res === "won") card.appendChild(el("div", "gc-confetti")).setAttribute("aria-hidden", "true");
      var img = el("img", "gc-face pop"); img.src = base + "../assets/gremlins/" + g.id + ".webp"; img.alt = g.name; card.appendChild(img);
      var h = el("h2", "", res === "won" ? "You beat " + g.name + "!" : res === "lost" ? g.name + " wins this one. Good game!" : res === "draw" ? "It's a draw!" : "Hat tipped. Good game!"); h.id = "gc-end-h"; card.appendChild(h);
      card.appendChild(el("p", "gc-say", "\u201C" + (res === "won" ? g.beat : res === "draw" ? g.draw : g.won) + "\u201D"));
      if (res === "won") { var pz = el("p", "gc-prize"); pz.appendChild(el("span", "", "\uD83C\uDF81")).setAttribute("aria-hidden", "true"); pz.appendChild(document.createTextNode(" " + PRIZE)); card.appendChild(pz);
        if (beaten[g.id] === 1 && g.id !== "noodle") card.appendChild(el("p", "gc-fine", g.name + " will play you any day now, even when it's not their turn at the table.")); }
      var row = el("div", "gc-row");
      var again = btn("gc-btn", "Play again", function () { ov.remove(); startGame(state.who, state.color === "w" ? "b" : "w", []); });
      row.appendChild(again);
      row.appendChild(btn("gc-btn ghost", "Pick another gremlin", function () { ov.remove(); showPicker(); }));
      row.appendChild(btn("gc-btn ghost", "Look at the board", function () { ov.remove(); var f = ctrl.querySelector("button"); if (f) f.focus(); }));
      card.appendChild(row); ov.appendChild(card); root.appendChild(ov);
      live.textContent = h.textContent;
      ov.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { ov.remove(); var f = ctrl.querySelector("button"); if (f) f.focus(); }
        if (e.key === "Tab") { var f = ov.querySelectorAll("button"), a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
      });
      setTimeout(function () { again.focus({ preventScroll: true }); }, 30);
    }

    showPicker();
    return { showPicker: showPicker, startGame: startGame, get game() { return game; }, get state() { return state; }, destroy: function () { if (worker) worker.terminate(); host.innerHTML = ""; } };
  }
  window.GremlinChess = { mount: mount, crew: CREW, todaysCrew: todaysCrew };
})();
