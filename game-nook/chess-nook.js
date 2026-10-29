/* Gremlin Chess, the live Game Nook table. Mounts into any element:
     GremlinChess.mount(el, { base: "game-nook/", onClose: fn, social: GremlinSocial? })
   Rules: chess.js (vendor/chess.js, BSD-2-Clause). Gremlins think in a Web Worker (chess-engine.js).
   Calm by design: no clocks, no scores, no red, no shake, no sound. Pieces lift, glide and settle; Still mode cross-fades.
   Lines the gremlins say live in chess-quips.js (edit freely). Saved in localStorage: the game in progress, who you've
   beaten, and the Pace choice. Logged-in players also get their gremlin wins recorded on the server (for wardrobe unlocks). */
(function () {
  "use strict";
  var PFX = "gremlin-world-", SAVE = PFX + "chess-game", BEAT = PFX + "chess-beaten", ALL = PFX + "chess-show-all", PACE = PFX + "chess-pace";
  var mem = {};
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return mem[k] !== undefined ? mem[k] : d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; } }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} delete mem[k]; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn, label) { var b = el("button", cls, text); b.type = "button"; if (label) b.setAttribute("aria-label", label); if (fn) b.addEventListener("click", fn); return b; }
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- the six gremlins, easiest first (their lines live in chess-quips.js) ---------- */
  var CREW = [
    { id: "noodle", name: "Noodle", acorns: 1, undo: true, line: "Snack-fueled chaos. Cheerful about every single move.", how: "Moves almost at random. Very easy.", away: "Noodle is always here. Noodle lives at this table.", draw: "A tie. That means we both get a cracker." },
    { id: "pip", name: "Pip", acorns: 2, undo: true, line: "A bouncy idea-gardener who loves a daring plan.", how: "Loves to attack, often forgets to defend. Easy.", away: "Pip is watering the idea jars. Back soon.", draw: "Nobody won, so we both get to keep growing." },
    { id: "dot", name: "Dot", acorns: 3, undo: true, line: "A tidy printer who likes everything lined up just so.", how: "Careful. Keeps pieces protected and pawns neat. Easy to medium.", away: "Dot is lining up the letter blocks. Back soon.", draw: "A perfectly balanced board. How tidy." },
    { id: "moth", name: "Moth", acorns: 3, undo: false, line: "A dreamy artist who follows the light, and sometimes a hunch.", how: "Thinks a few moves ahead, then follows a hunch. Medium.", away: "Moth is painting lanterns. Back tomorrow.", draw: "A draw. Like a sketch we'll finish another day." },
    { id: "vesper", name: "Vesper", acorns: 4, undo: false, line: "A quiet librarian who reads the whole board like a book.", how: "Patient and solid. Knows some classic openings. Strong.", away: "Vesper is shelving returned books. Back soon.", draw: "A draw. A story with a quiet ending." },
    { id: "grimble", name: "Grimble", acorns: 5, undo: false, hint: true, line: "The wise old burrow-keeper. Warm, unhurried, the strongest of us.", how: "Thinks furthest ahead. Offers gentle hints if you ask. Strongest.", away: "Grimble is napping in the burrow. Back tomorrow.", draw: "A draw with me is a fine thing. Well played." }
  ];
  var BY = {}; CREW.forEach(function (g) { BY[g.id] = g; });
  var UNDO_SAY = { noodle: "Take-backsies. Sure.", pip: "A do-over. Gardeners love those.", dot: "Of course. Let's tidy that up." };
  function Q(who, trig) { var q = window.GremlinQuips && GremlinQuips[who]; return q && q[trig] || null; }

  function dayNumber(d) { d = d || new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function todaysCrew(d) { var others = ["pip", "dot", "moth", "vesper", "grimble"], n = dayNumber(d); return ["noodle", others[n % 5], others[(n + 2) % 5]]; }

  var GLYPH = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };
  var NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
  var VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  var VERB = ["drifted", "wandered", "tiptoed", "slid", "ambled"];
  var FILES = "abcdefgh";
  var PACES = { calm: { label: "Calm", k: 1 }, slower: { label: "Slower", k: 1.5 }, quick: { label: "Quick", k: 0.5 } };

  function still() { return document.documentElement.classList.contains("gw-still") || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  var EASE = "cubic-bezier(0.45,0,0.55,1)";
  function anim(node, frames, o) {   // a Web Animation that always resolves (even where the API is missing)
    return new Promise(function (res) {
      if (!node.animate) { var last = frames[frames.length - 1]; for (var k in last) if (k !== "offset") node.style[k] = last[k]; return res(); }
      var a = node.animate(frames, o); a.onfinish = function () { res(); }; a.oncancel = function () { res(); };
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function mount(host, opts) {
    opts = opts || {};
    var base = opts.base || "", Chess = window.ChessJS.Chess, social = opts.social || null;
    var player = load(PFX + "player", null);
    if (player && player.expires_at && Date.parse(player.expires_at) < Date.now()) player = null;
    var me = player && player.name ? player.name : null;
    var root = el("div", "gc"); host.innerHTML = ""; host.appendChild(root);
    var live = el("p", "gc-sr"); live.setAttribute("aria-live", "polite"); live.setAttribute("role", "status");
    var worker = null, reqId = 0, pending = {};
    function getWorker() {
      if (worker) return worker;
      try { worker = new Worker(base + "chess-engine.js"); worker.onmessage = function (e) { var cb = pending[e.data.id]; delete pending[e.data.id]; if (cb) cb(e.data); }; } catch (e) { worker = null; }
      return worker;
    }
    function ask(fen, who, hint, cb) {
      var w = getWorker(), id = ++reqId;
      if (w) { pending[id] = cb; w.postMessage({ id: id, fen: fen, who: who, hint: !!hint }); return; }
      function run() { setTimeout(function () { cb(window.GremlinChessEngine.think(fen, who, { hint: hint })); }, 30); }
      if (window.GremlinChessEngine) run(); else { var s = document.createElement("script"); s.src = base + "chess-engine.js"; s.onload = run; document.head.appendChild(s); }
    }
    function pace() { var p = load(PACE, "calm"); return PACES[p] ? p : "calm"; }
    function K() { return PACES[pace()].k; }

    // state: { who (gremlin id) | person: {id, opp}, color, moves: [san], over }
    var state = null, game = null, sel = null, focusSq = null, thinking = false, busy = false, lastMove = null, hintMove = null;
    var timers = [], pollT = null, idleT = null, longT = null, quipN = 0, lastQuip = {}, flusterAt = -99;
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; clearTimeout(pollT); clearTimeout(idleT); clearTimeout(longT); }

    /* ---------- screen 1: the picker ---------- */
    function showPicker() {
      clearTimers(); state = null;
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
      if (social) { var sp = el("section", "gc-social"); sp.setAttribute("aria-label", "Play a friend"); root.appendChild(sp); social.render(sp, { startPerson: startPerson }); }
      root.appendChild(el("h3", "gc-h3", "Play a gremlin"));
      root.appendChild(el("p", "gc-sub", "Who would you like to play? There's no clock. Leave any time and your game waits for you."));
      var beaten = load(BEAT, {}), today = todaysCrew(), showAll = !!opts.preview && load(ALL, false);
      var ul = el("ul", "gc-crew");
      CREW.forEach(function (g) {
        var here = today.indexOf(g.id) >= 0 || beaten[g.id] || showAll;
        var li = el("li", "gc-g" + (here ? "" : " away")), card = el(here ? "button" : "div", "gc-gcard");
        if (here) { card.type = "button"; card.addEventListener("click", function () { chooseColor(g); }); card.setAttribute("aria-label", "Play " + g.name + ". " + g.how + (beaten[g.id] ? " You've beaten " + g.name + " before." : "")); }
        var img = el("img", "gc-face"); img.src = base + "../assets/gremlins/" + g.id + ".webp"; img.alt = ""; img.width = 72; img.height = 72; card.appendChild(img);
        var tx = el("span", "gc-gtext"); tx.appendChild(el("span", "gc-gname", g.name));
        var ac = el("span", "gc-acorns"); ac.setAttribute("aria-hidden", "true"); for (var i = 0; i < 5; i++) ac.appendChild(el("span", i < g.acorns ? "on" : "off", i < g.acorns ? "\u25CF" : "\u25CB")); tx.appendChild(ac);
        tx.appendChild(el("span", "gc-gline", here ? g.line : g.away));
        if (here) tx.appendChild(el("span", "gc-ghow", g.how));
        if (beaten[g.id]) tx.appendChild(el("span", "gc-badge", "Beaten " + (beaten[g.id] > 1 ? beaten[g.id] + " times" : "once") + ". Always welcome now."));
        card.appendChild(tx); li.appendChild(card); ul.appendChild(li);
      });
      root.appendChild(ul);
      root.appendChild(el("p", "gc-fine", "Three gremlins sit at the table each day. Noodle is always here, and any gremlin you've beaten will play you any day."));
      root.appendChild(paceRow());
      if (opts.onClose) root.appendChild(btn("gc-btn ghost", opts.closeLabel || "Back", opts.onClose));
      var f = root.querySelector(".gc-resume .gc-btn") || root.querySelector(".gc-gcard[type=button]"); if (f && opts.focus !== false) f.focus({ preventScroll: true });
    }
    function paceRow() {
      var wrap = el("div", "gc-pace"); wrap.setAttribute("role", "radiogroup"); wrap.setAttribute("aria-label", "How fast pieces move");
      wrap.appendChild(el("span", "gc-pace-l", "Pace:"));
      Object.keys(PACES).forEach(function (k) {
        var b = btn("gc-chip" + (pace() === k ? " on" : ""), PACES[k].label, function () { save(PACE, k); wrap.querySelectorAll(".gc-chip").forEach(function (c) { c.classList.remove("on"); c.setAttribute("aria-checked", "false"); }); b.classList.add("on"); b.setAttribute("aria-checked", "true"); });
        b.setAttribute("role", "radio"); b.setAttribute("aria-checked", pace() === k ? "true" : "false"); wrap.appendChild(b);
      });
      return wrap;
    }
    function chooseColor(g) {
      root.innerHTML = ""; root.appendChild(live);
      var c = el("div", "gc-choose");
      var img = el("img", "gc-face big"); img.src = base + "../assets/gremlins/" + g.id + ".webp"; img.alt = g.name; c.appendChild(img);
      c.appendChild(el("h2", "gc-title", "Play " + g.name));
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
    var boardEl, wrapEl, fxEl, trailSvg, vigEl, sayEl, bubbleEl, bubbleLive, lineEl, statusEl, ctrl, faceEl, trayMine, trayTheirs, sqEls = {};
    function oppName() { return state.person ? state.person.opp : BY[state.who].name; }
    function buildBoard(color, faceSrc, vsText) {
      root.innerHTML = ""; root.appendChild(live);
      var top = el("div", "gc-top");
      var fw = el("div", "gc-facewrap"); faceEl = el("img", "gc-face"); faceEl.src = faceSrc; faceEl.alt = ""; faceEl.width = 64; faceEl.height = 64; fw.appendChild(faceEl);
      bubbleEl = el("div", "gc-bubble"); bubbleEl.setAttribute("aria-hidden", "true"); fw.appendChild(bubbleEl); top.appendChild(fw);
      var tb = el("div", "gc-topt"); tb.appendChild(el("p", "gc-vs", vsText)); sayEl = el("p", "gc-say"); tb.appendChild(sayEl); top.appendChild(tb);
      bubbleLive = el("p", "gc-sr"); bubbleLive.setAttribute("aria-live", "polite"); top.appendChild(bubbleLive);
      root.appendChild(top);
      trayTheirs = el("div", "gc-tray theirs"); trayTheirs.setAttribute("aria-label", "Pieces you've taken"); root.appendChild(trayTheirs);
      wrapEl = el("div", "gc-boardwrap");
      boardEl = el("div", "gc-board"); boardEl.setAttribute("role", "grid"); boardEl.setAttribute("aria-label", "Chess board. You play " + (color === "w" ? "white" : "black") + ". Use the arrow keys to move around, Enter to pick up and put down. You can also drag pieces.");
      sqEls = {};
      for (var r = 0; r < 8; r++) {
        var row = el("div", "gc-rank"); row.setAttribute("role", "row");
        for (var c = 0; c < 8; c++) {
          var file = color === "w" ? c : 7 - c, rank = color === "w" ? 8 - r : r + 1, sq = FILES[file] + rank;
          var b = el("button", "gc-sq " + ((file + rank) % 2 ? "light" : "dark")); b.type = "button"; b.dataset.sq = sq; b.setAttribute("role", "gridcell"); b.tabIndex = -1;
          if (c === 0) b.appendChild(el("span", "gc-coord r", String(rank)));
          if (r === 7) b.appendChild(el("span", "gc-coord f", FILES[file]));
          b.appendChild(el("span", "gc-pc"));
          b.addEventListener("click", onSquareClick.bind(null, sq));
          b.addEventListener("keydown", onKey);
          b.addEventListener("pointerdown", onPointerDown);
          sqEls[sq] = b; row.appendChild(b);
        }
        boardEl.appendChild(row);
      }
      wrapEl.appendChild(boardEl);
      vigEl = el("div", "gc-vignette"); vigEl.setAttribute("aria-hidden", "true"); wrapEl.appendChild(vigEl);
      trailSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); trailSvg.setAttribute("class", "gc-trail"); trailSvg.setAttribute("aria-hidden", "true"); trailSvg.setAttribute("viewBox", "0 0 800 800"); wrapEl.appendChild(trailSvg);
      fxEl = el("div", "gc-fx"); fxEl.setAttribute("aria-hidden", "true"); wrapEl.appendChild(fxEl);
      root.appendChild(wrapEl);
      trayMine = el("div", "gc-tray mine"); trayMine.setAttribute("aria-label", "Pieces " + oppName() + " has taken"); root.appendChild(trayMine);
      lineEl = el("p", "gc-line"); lineEl.setAttribute("aria-live", "polite"); root.appendChild(lineEl);
      statusEl = el("p", "gc-status"); root.appendChild(statusEl);
      ctrl = el("div", "gc-ctrl"); root.appendChild(ctrl);
      focusSq = color === "w" ? "e2" : "e7";
    }
    function startGame(who, color, moves) {
      clearTimers();
      game = new Chess(); lastMove = null; sel = null; hintMove = null; thinking = false; busy = false; quipN = 0; flusterAt = -99;
      (moves || []).forEach(function (m) { try { lastMove = game.move(m); } catch (e) {} });
      state = { who: who, color: color, moves: game.history(), over: false }; persist();
      buildBoard(color, base + "../assets/gremlins/" + who + ".webp", (me || "You") + " vs " + BY[who].name);
      say(moves && moves.length ? "Welcome back. Your game was right where you left it." : "");
      draw(); fillTrays(); controls(); paceLine();
      sqEls[focusSq].tabIndex = 0;
      if (opts.focus !== false) sqEls[focusSq].focus({ preventScroll: true });
      if (!(moves && moves.length)) later(function () { quip("start", true); }, 400);
      if (game.isGameOver()) return finish();
      if (game.turn() !== color) gremlinMove(); else armIdle();
    }
    function persist() { if (state && !state.person) { state.moves = game.history(); save(SAVE, state); } }
    function say(t) { if (sayEl) sayEl.textContent = t ? "\u201C" + t + "\u201D" : ""; }
    function paceLine() { /* the pace choice lives under the board too, so it can change mid-game */ ctrl.parentNode.insertBefore(paceRow(), ctrl.nextSibling); }

    /* quips: a speech bubble by the portrait, after the piece settles; ~1 in 3-4 moves, always on the big moments */
    var bubbleT = null;
    function quip(trig, always) {
      if (!state || state.person) return;
      quipN++;
      var lines = Q(state.who, trig); if (!lines) return;
      if (!always && !(quipN >= 3 && Math.random() < 0.5) && Math.random() > 0.15) return;
      quipN = 0;
      var key = state.who, pool = lines.filter(function (l) { return l !== lastQuip[key]; }), line = pickOne(pool.length ? pool : lines);
      lastQuip[key] = line; showBubble(line);
    }
    function showBubble(line) {
      clearTimeout(bubbleT);
      bubbleEl.textContent = line; bubbleEl.classList.remove("on"); void bubbleEl.offsetWidth; bubbleEl.classList.add("on");
      bubbleLive.textContent = oppName() + " says: " + line;
      bubbleT = later(function () { bubbleEl.classList.remove("on"); }, 3600 * Math.max(1, K()));
    }
    function armIdle() {   // gentle "take your time" / "still here?" lines; never a timer you can see
      clearTimeout(idleT); clearTimeout(longT);
      if (!state || state.over || state.person) return;
      longT = setTimeout(function () { if (state && !state.over && myTurn() && !busy) quip("longThink", true); }, 30000);
      idleT = setTimeout(function () { if (state && !state.over && myTurn() && !busy) quip("idle", true); }, 90000);
    }
    function myTurn() { return game && state && game.turn() === state.color; }

    function pieceName(p) { return (p.color === "w" ? "white " : "black ") + NAME[p.type]; }
    function draw() {
      var legal = sel ? game.moves({ square: sel, verbose: true }) : [], tos = {};
      legal.forEach(function (m) { tos[m.to] = m.captured ? "cap" : "dot"; });
      var inCheck = game.inCheck();
      Object.keys(sqEls).forEach(function (sq) {
        var b = sqEls[sq], p = game.get(sq), pc = b.querySelector(".gc-pc");
        pc.textContent = p ? GLYPH[p.type] + "\uFE0E" : ""; pc.className = "gc-pc" + (p ? " " + p.color : ""); pc.style.opacity = "";
        b.classList.toggle("sel", sel === sq);
        b.classList.toggle("dot", tos[sq] === "dot"); b.classList.toggle("cap", tos[sq] === "cap");
        b.classList.toggle("last", !!lastMove && (lastMove.from === sq || lastMove.to === sq));
        b.classList.toggle("hint", !!hintMove && (hintMove.from === sq || hintMove.to === sq));
        var chk = inCheck && p && p.type === "k" && p.color === game.turn();
        if (chk && !b.classList.contains("check")) { b.classList.add("check"); if (!still()) b.classList.add("pulse"); }
        if (!chk) b.classList.remove("check", "pulse");
        b.setAttribute("aria-label", sq + ", " + (p ? pieceName(p) : "empty") + (tos[sq] ? ", you can move here" : "") + (sel === sq ? ", picked up" : "") + (chk ? ", in check" : ""));
      });
      if (!statusEl) return;
      statusEl.textContent = state.over ? "The game is resting." : thinking ? oppName() + " is thinking. No rush." : myTurn() ? (inCheck ? "Your king is in check. Your move." : "Your move.") : oppName() + "'s move.";
      if (faceEl) faceEl.classList.toggle("thinking", !!thinking);
    }
    function fillTrays() {
      trayMine.innerHTML = ""; trayTheirs.innerHTML = "";
      game.history({ verbose: true }).forEach(function (m) { if (m.captured) addToTray(m.color === state.color ? trayTheirs : trayMine, m.captured, m.color === "w" ? "b" : "w"); });
    }
    function addToTray(tray, type, color) { var s = el("span", "gc-pc " + color, GLYPH[type] + "\uFE0E"); s.title = NAME[type]; tray.appendChild(s); return s; }
    function controls() {
      ctrl.innerHTML = "";
      if (state.over) {
        if (state.person) { ctrl.appendChild(btn("gc-btn", "Back to the table", showPicker)); return; }
        ctrl.appendChild(btn("gc-btn", "Play " + BY[state.who].name + " again", function () { startGame(state.who, state.color === "w" ? "b" : "w", []); }));
        ctrl.appendChild(btn("gc-btn ghost", "Pick another gremlin", showPicker));
        return;
      }
      if (state.person) {
        ctrl.appendChild(btn("gc-btn ghost small", "Tip my hat (resign)", confirmResign));
        ctrl.appendChild(btn("gc-btn ghost small", "Leave for now", showPicker, "Leave the table. The game waits for both of you."));
        return;
      }
      var g = BY[state.who];
      if (g.undo) ctrl.appendChild(btn("gc-btn ghost small", "Take that back?", undo, "Take back your last move"));
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
    var suppressClick = false;
    function onSquareClick(sq) { if (suppressClick) { suppressClick = false; return; } onSquare(sq, "click"); }
    function canAct() { return state && !state.over && !thinking && !busy && myTurn(); }
    function onSquare(sq, how) {
      if (!canAct()) { if (thinking) live.textContent = oppName() + " is still thinking."; return; }
      armIdle();
      if (focusSq !== sq) { if (sqEls[focusSq]) sqEls[focusSq].tabIndex = -1; focusSq = sq; sqEls[sq].tabIndex = 0; }
      var p = game.get(sq);
      if (sel) {
        var ms = game.moves({ square: sel, verbose: true }).filter(function (m) { return m.to === sq; });
        if (ms.length) { if (ms.length > 1 || ms[0].promotion) askPromotion(ms, how); else playerMove(ms[0], how); return; }
        if (p && p.color === state.color && sq !== sel) { sel = sq; draw(); announceSel(sq); return; }
        sel = null; draw(); live.textContent = "Put it back."; return;
      }
      if (p && p.color === state.color) {
        if (!game.moves({ square: sq }).length) { live.textContent = "That " + NAME[p.type] + " has nowhere to go right now."; return; }
        sel = sq; draw(); announceSel(sq);
      }
    }
    function announceSel(sq) { var n = game.moves({ square: sq, verbose: true }).map(function (m) { return m.to; }); live.textContent = "Picked up the " + NAME[game.get(sq).type] + " on " + sq + ". It can go to " + n.join(", ") + "."; }

    /* drag and drop (pointer): pick up on press, follow the finger, settle on release */
    var drag = null;
    function onPointerDown(e) {
      if (e.button > 0 || !canAct()) return;
      var sq = e.currentTarget.dataset.sq, p = game.get(sq);
      if (!p || p.color !== state.color || !game.moves({ square: sq }).length) return;
      drag = { sq: sq, x: e.clientX, y: e.clientY, ghost: null, id: e.pointerId };
      document.addEventListener("pointermove", onPointerMove); document.addEventListener("pointerup", onPointerUp); document.addEventListener("pointercancel", onPointerUp);
    }
    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.ghost) {
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
        sel = drag.sq; draw();
        var r = sqEls[drag.sq].getBoundingClientRect(), wr = wrapEl.getBoundingClientRect();
        drag.ghost = makeGhost(game.get(drag.sq), r.left - wr.left, r.top - wr.top, r.width); drag.ghost.classList.add("lifted");
        sqEls[drag.sq].querySelector(".gc-pc").style.opacity = "0"; drag.w = r.width; drag.wr = wr;
      }
      drag.ghost.style.left = (e.clientX - drag.wr.left - drag.w / 2) + "px"; drag.ghost.style.top = (e.clientY - drag.wr.top - drag.w / 2) + "px";
      e.preventDefault();
    }
    function onPointerUp(e) {
      document.removeEventListener("pointermove", onPointerMove); document.removeEventListener("pointerup", onPointerUp); document.removeEventListener("pointercancel", onPointerUp);
      var d = drag; drag = null; if (!d || !d.ghost) return;
      suppressClick = true; setTimeout(function () { suppressClick = false; }, 50);
      var t = document.elementFromPoint(e.clientX, e.clientY), sqb = t && t.closest && t.closest(".gc-sq"), to = sqb && sqb.dataset.sq;
      var ms = to ? game.moves({ square: d.sq, verbose: true }).filter(function (m) { return m.to === to; }) : [];
      var target = ms.length ? sqEls[to] : sqEls[d.sq], r = target.getBoundingClientRect();
      busy = true;
      anim(d.ghost, [{ left: d.ghost.style.left, top: d.ghost.style.top, transform: "scale(1.06)" }, { left: (r.left - d.wr.left) + "px", top: (r.top - d.wr.top) + "px", transform: "scale(1)" }], { duration: 250, easing: "ease-out", fill: "forwards" }).then(function () {
        d.ghost.remove(); busy = false;
        if (!ms.length) { sel = null; draw(); live.textContent = "Put it back."; return; }
        if (ms.length > 1 || ms[0].promotion) { sqEls[d.sq].querySelector(".gc-pc").style.opacity = ""; askPromotion(ms, "drag"); } else playerMove(ms[0], "drag");
      });
    }

    function askPromotion(ms, how) {
      var dlg = el("div", "gc-promo"); dlg.setAttribute("role", "group"); dlg.setAttribute("aria-label", "Your pawn reached the end. Pick what it becomes.");
      dlg.appendChild(el("p", "", "Your pawn made it to the far side. It becomes a\u2026"));
      ["q", "r", "b", "n"].forEach(function (t) {
        var m = ms.filter(function (x) { return x.promotion === t; })[0]; if (!m) return;
        dlg.appendChild(btn("gc-btn ghost", GLYPH[t] + "\uFE0E " + NAME[t], function () { dlg.remove(); playerMove(m, how); }));
      });
      ctrl.parentNode.insertBefore(dlg, ctrl); dlg.querySelector("button").focus();
    }

    /* ---------- the calm move animation ---------- */
    function makeGhost(p, x, y, w) {
      var g = el("span", "gc-ghost gc-pc " + p.color, GLYPH[p.type] + "\uFE0E");
      g.style.left = x + "px"; g.style.top = y + "px"; g.style.width = g.style.height = w + "px"; fxEl.appendChild(g); return g;
    }
    function center(sq) { var r = sqEls[sq].getBoundingClientRect(), w = wrapEl.getBoundingClientRect(); return { x: r.left - w.left, y: r.top - w.top, w: r.width }; }
    function trail(from, to, gold) {
      var a = center(from), b = center(to), W = wrapEl.getBoundingClientRect().width || 1, s = 800 / W;
      var ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", (a.x + a.w / 2) * s); ln.setAttribute("y1", (a.y + a.w / 2) * s); ln.setAttribute("x2", (b.x + b.w / 2) * s); ln.setAttribute("y2", (b.y + b.w / 2) * s);
      ln.setAttribute("stroke", gold ? "#d9b45a" : "#a993d6"); ln.setAttribute("stroke-width", 2 * s); ln.setAttribute("stroke-linecap", "round"); ln.style.opacity = ".3";
      trailSvg.appendChild(ln);
      anim(ln, [{ opacity: 0.3 }, { opacity: 0 }], { duration: 1500, easing: "ease-out", fill: "forwards" }).then(function () { ln.remove(); });
    }
    // animate move m (verbose, from game.moves) from the CURRENT position; resolves after it is applied + settled
    function animateMove(m, who) {
      var k = K(), p = game.get(m.from), a = center(m.from), b = center(m.to);
      var capSq = m.flags && m.flags.indexOf("e") >= 0 ? m.to[0] + m.from[1] : (m.captured ? m.to : null);
      var capP = capSq ? game.get(capSq) : null, capC = capSq ? center(capSq) : null;
      var dist = Math.max(Math.abs(FILES.indexOf(m.from[0]) - FILES.indexOf(m.to[0])), Math.abs(+m.from[1] - +m.to[1]));
      var fromPc = sqEls[m.from].querySelector(".gc-pc");
      function apply() { var r = game.move({ from: m.from, to: m.to, promotion: m.promotion }); lastMove = r; sel = null; hintMove = null; return r; }
      function capFx(r) {   // the taken piece fades and shrinks, then drifts to its tray. No flash.
        if (!r || !r.captured || !capC) return Promise.resolve();
        var tray = r.color === state.color ? trayTheirs : trayMine, ghost = makeGhost(capP, capC.x, capC.y, capC.w); ghost.classList.add("captured");
        return anim(ghost, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0.45, transform: "scale(0.9)" }], { duration: 600 * Math.max(1, k), easing: "ease-out", fill: "forwards" }).then(function () {
          var slot = addToTray(tray, r.captured, capP.color); slot.style.opacity = "0";
          var sr = slot.getBoundingClientRect(), wr = wrapEl.getBoundingClientRect();
          return anim(ghost, [{ opacity: 0.45, left: capC.x + "px", top: capC.y + "px", transform: "scale(0.9)" }, { opacity: 0, left: (sr.left - wr.left - capC.w / 2 + sr.width / 2) + "px", top: (sr.top - wr.top - capC.w / 2 + sr.height / 2) + "px", transform: "scale(0.45)" }], { duration: 500 * Math.max(1, k), easing: EASE, fill: "forwards" })
            .then(function () { ghost.remove(); anim(slot, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: "forwards" }); });
        });
      }
      if (still()) {   // Still mode: no lift, no glide. A 0.6s cross-fade; the tints still hold.
        var old = makeGhost(p, a.x, a.y, a.w); fromPc.style.opacity = "0";
        var r = apply(); draw();
        var nw = sqEls[m.to].querySelector(".gc-pc");
        anim(old, [{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: "forwards" }).then(function () { old.remove(); });
        return Promise.all([anim(nw, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 }), r.captured ? (function () { fillTrays(); return Promise.resolve(); })() : 0]).then(function () { return r; });
      }
      var gremlin = who === "them", lift = gremlin ? 300 * k : 120 * k, settle = gremlin ? 300 * k : 120 * k;
      var glide = gremlin ? Math.min(1600, 1000 + 100 * Math.max(0, dist - 1)) * k : Math.min(600, 500 + 20 * dist) * k;
      if (k < 1) glide = Math.max(gremlin ? 400 : 250, glide);
      var ghost = makeGhost(p, a.x, a.y, a.w); fromPc.style.opacity = "0";
      var frames, n = 14;
      if (p.type === "n") {   // the knight takes a gentle arc
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1, cx = mx - dy / len * a.w * 0.6, cy = my + dx / len * a.w * 0.6;
        frames = []; for (var i = 0; i <= n; i++) { var t = i / n, u = 1 - t; frames.push({ left: (u * u * a.x + 2 * u * t * cx + t * t * b.x) + "px", top: (u * u * a.y + 2 * u * t * cy + t * t * b.y) + "px", transform: "scale(1.06)" }); }
      } else frames = [{ left: a.x + "px", top: a.y + "px", transform: "scale(1.06)" }, { left: b.x + "px", top: b.y + "px", transform: "scale(1.06)" }];
      trail(m.from, m.to, !gremlin);
      return anim(ghost, [{ transform: "scale(1)", boxShadow: "0 0 0 rgba(26,26,24,0)" }, { transform: "scale(1.06)", boxShadow: "0 8px 14px rgba(26,26,24,.18)" }], { duration: lift, easing: "ease-out", fill: "forwards" })
        .then(function () { ghost.classList.add("lifted"); if (gremlin) vigEl.classList.add("on"); return anim(ghost, frames, { duration: glide, easing: EASE, fill: "forwards" }); })
        .then(function () {
          vigEl.classList.remove("on");
          var r = apply(); draw(); var nw = sqEls[m.to].querySelector(".gc-pc"); nw.style.opacity = "0";
          if (r.captured && capSq !== m.to) { /* en passant: the pawn left behind */ }
          var c = capFx(r);
          return anim(ghost, [{ transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: settle, easing: "ease-out", fill: "forwards" })
            .then(function () { nw.style.opacity = ""; ghost.remove(); return c; }).then(function () { return r; });
        });
    }
    function sayMove(r, whose) {
      var mover = whose === "me" ? "Your " : oppName() + "'s ";
      var t = mover + NAME[r.piece] + " " + (whose === "me" ? "went" : pickOne(VERB)) + " to " + r.to;
      if (r.flags.indexOf("k") >= 0 || r.flags.indexOf("q") >= 0) t = (whose === "me" ? "You" : oppName()) + " tucked the king away safely (castled)";
      if (r.captured) t += whose === "me" ? " and took " + oppName() + "'s " + NAME[r.captured] : " and took your " + NAME[r.captured];
      if (r.promotion) t += " and became a " + NAME[r.promotion];
      t += r.san.indexOf("#") >= 0 ? ". That's checkmate." : r.san.indexOf("+") >= 0 ? (whose === "me" ? ". Check." : ". Your king is in check.") : ".";
      lineEl.textContent = t;
    }
    function playerMove(m, how) {
      busy = true; draw(); armIdle();
      var go = how === "drag" ? Promise.resolve((function () { var r = game.move({ from: m.from, to: m.to, promotion: m.promotion }); lastMove = r; sel = null; hintMove = null; draw(); if (r.captured) fillTrays(); return r; })()) : animateMove(m, "me");
      go.then(function (r) {
        busy = false; persist(); sayMove(r, "me");
        if (state.person) return sendPersonMove(r);
        if (game.isGameOver()) return finish();
        if (r.san.indexOf("+") >= 0) quip("playerCheck", true);
        else if (r.captured) quip("playerTakes", r.captured === "q" || r.captured === "r");
        else quip("none", false);
        gremlinMove();
      });
    }
    function material(c) { var s = 0; game.board().forEach(function (row) { row.forEach(function (p) { if (p) s += (p.color === c ? 1 : -1) * VAL[p.type]; }); }); return s; }
    function playerHasMate() {
      var ms = game.moves({ verbose: true });
      for (var i = 0; i < ms.length; i++) { game.move(ms[i]); var mate = game.isCheckmate(); game.undo(); if (mate) return true; }
      return false;
    }
    function gremlinMove() {
      thinking = true; draw();
      var g = BY[state.who], myGame = game, k = K(), minThink = Math.max(600, rnd(1200, 1500) * Math.min(k, 1.2)), t0 = Date.now();
      ask(game.fen(), state.who, false, function (res) {
        if (game !== myGame || state.over) return;
        later(function () {
          if (game !== myGame || state.over) return;
          thinking = false;
          if (!res || !res.move) { draw(); return; }
          var mv = game.moves({ verbose: true }).filter(function (x) { return x.from === res.move.from && x.to === res.move.to && (!x.promotion || x.promotion === (res.move.promotion || "q")); })[0];
          if (!mv) { draw(); return; }
          busy = true; draw();
          animateMove(mv, "them").then(function (r) {
            persist(); sayMove(r, "them");
            if (game.isGameOver()) { busy = false; return finish(); }
            var ply = game.history().length;
            if (r.san.indexOf("+") >= 0) quip("gremlinCheck", true);
            else if (r.captured) quip("gremlinTakes", r.captured === "q" || r.captured === "r");
            else if (ply - flusterAt > 6 && (material(state.color) >= 8 || playerHasMate())) { flusterAt = ply; quip("flustered", true); }
            else quip("none", false);
            later(function () { busy = false; draw(); armIdle(); if (sqEls[focusSq] && document.activeElement && document.activeElement.classList.contains("gc-sq")) sqEls[focusSq].focus({ preventScroll: true }); }, 500 * k);   // a short breath; no visible lock
          });
        }, Math.max(0, minThink - (Date.now() - t0)));
      });
    }
    function undo() {
      if (thinking || busy || !game.history().length) return;
      game.undo(); if (game.turn() !== state.color && game.history().length) game.undo();
      var h = game.history({ verbose: true }); lastMove = h[h.length - 1] || null; sel = null; hintMove = null; persist(); draw(); fillTrays();
      say(UNDO_SAY[state.who] || "Of course."); lineEl.textContent = "Took back your last move. Your move.";
      if (game.turn() !== state.color) gremlinMove();
    }
    function hint() {
      if (thinking || busy || !myTurn()) return;
      say("Let me have a little look\u2026"); statusEl.textContent = "Grimble is looking for a hint. No rush.";
      ask(game.fen(), "grimble", true, function (res) {
        if (!res || !res.move) return;
        hintMove = res.move; var p = game.get(res.move.from); draw();
        say("Perhaps the " + NAME[p.type] + " on " + res.move.from + " would like to visit " + res.move.to + ". Only if you like it.");
        live.textContent = "Hint: " + NAME[p.type] + " from " + res.move.from + " to " + res.move.to + ".";
      });
    }
    function confirmResign() {
      var box = el("div", "gc-promo"); box.setAttribute("role", "group"); box.setAttribute("aria-label", "Resign?");
      box.appendChild(el("p", "", "Tip your hat and end this game? " + oppName() + " won't mind."));
      var yes = btn("gc-btn", "Yes, tip my hat", function () { box.remove(); state.over = true; if (state.person && social) social.resign(state.person.id); else persist(); end("resigned"); });
      var no = btn("gc-btn ghost", "Keep playing", function () { box.remove(); sqEls[focusSq].focus(); });
      box.appendChild(yes); box.appendChild(no); ctrl.parentNode.insertBefore(box, ctrl); no.focus();
    }
    function finish() {
      state.over = true;
      var res = game.isCheckmate() ? (game.turn() === state.color ? "lost" : "won") : "draw";
      persist(); end(res);
    }

    /* ---------- the end card: one quiet card, fading in over a second ---------- */
    function end(res) {
      clearTimers(); thinking = false; busy = false; draw(); controls();
      if (state.person) return endPerson(res);
      del(SAVE);
      var g = BY[state.who], beaten = load(BEAT, {}), first = false;
      if (res === "won") { beaten[g.id] = (beaten[g.id] || 0) + 1; first = beaten[g.id] === 1; save(BEAT, beaten); if (social) social.recordWin(g.id, game.history().length); }
      if (res === "won") quip("playerWins", true); else if (res === "lost") quip("gremlinWins", true);
      later(function () { endCard(res, g, first); }, still() ? 300 : 1800);
    }
    function endCard(res, g, first) {
      var ov = el("div", "gc-end " + res); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "gc-end-h");
      var card = el("div", "gc-endcard");
      var img = el("img", "gc-face"); img.src = base + "../assets/gremlins/" + g.id + ".webp"; img.alt = g.name; card.appendChild(img);
      var h = el("h2", "", "A quiet game. Play again?"); h.id = "gc-end-h"; card.appendChild(h);
      var sub = res === "won" ? "You beat " + g.name + "." : res === "lost" ? g.name + " won this one." : res === "draw" ? "Nobody won. That's nice too." : "Hat tipped.";
      card.appendChild(el("p", "gc-endsub", sub));
      var line = res === "won" ? (Q(g.id, "surprise") || "") : res === "draw" ? g.draw : lastQuip[g.id] || pickOne(Q(g.id, "gremlinWins") || [""]);
      if (line) card.appendChild(el("p", "gc-say", "\u201C" + line + "\u201D"));
      if (res === "won") {
        var pz = el("p", "gc-prize", social && social.loggedIn() ? "Something new might be waiting in your wardrobe." : "Log in with your Gremlin Key and wins like this unlock things for your wardrobe.");
        card.appendChild(pz);
        if (first && g.id !== "noodle") card.appendChild(el("p", "gc-fine", g.name + " will play you any day now, even when it's not their turn at the table."));
      }
      var row = el("div", "gc-row");
      var again = btn("gc-btn", "Play again", function () { ov.remove(); startGame(state.who, state.color === "w" ? "b" : "w", []); });
      row.appendChild(again);
      row.appendChild(btn("gc-btn ghost", "Pick another gremlin", function () { ov.remove(); showPicker(); }));
      row.appendChild(btn("gc-btn ghost", "Look at the board", function () { ov.remove(); var f = ctrl.querySelector("button"); if (f) f.focus(); }));
      card.appendChild(row); ov.appendChild(card); root.appendChild(ov);
      live.textContent = sub + " A quiet game. Play again?";
      ov.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { ov.remove(); var f = ctrl.querySelector("button"); if (f) f.focus(); }
        if (e.key === "Tab") { var f2 = ov.querySelectorAll("button"), a = f2[0], z = f2[f2.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
      });
      setTimeout(function () { again.focus({ preventScroll: true }); }, 30);
    }

    /* ---------- games with a person (Phase 2): moves go through the server, each client checks them with chess.js ---------- */
    function startPerson(id) {
      clearTimers();
      social.game(id).then(function (g) {
        if (!g || !g.ok) { showPicker(); return; }
        game = new Chess(); lastMove = null; sel = null; thinking = false; busy = false;
        var bad = false; (g.moves || []).forEach(function (u) { if (bad) return; try { lastMove = game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch (e) { bad = true; } });
        var opp = g.you === "w" ? g.black : g.white;
        state = { person: { id: id, opp: opp }, color: g.you, over: g.status !== "active" && g.status !== "set_aside" };
        buildBoard(g.you, base + "person.svg", (me || "You") + " vs " + opp);
        draw(); fillTrays(); controls(); paceLine();
        sqEls[focusSq].tabIndex = 0; if (opts.focus !== false) sqEls[focusSq].focus({ preventScroll: true });
        if (bad) { lineEl.textContent = "This game got a bit muddled, so it's resting. Sorry about that."; state.over = true; controls(); return; }
        lineEl.textContent = state.over ? "This game is finished." : myTurn() ? "Your move. No clock, ever." : "Waiting for " + opp + ". They can take their time.";
        if (!state.over) pollPerson();
      });
    }
    function pollPerson() {
      clearTimeout(pollT);
      pollT = setTimeout(function () {
        if (!state || !state.person || state.over) return;
        if (myTurn() || busy) return pollPerson();
        social.game(state.person.id).then(function (g) {
          if (!state || !state.person || !g || !g.ok) return pollPerson();
          var have = game.history().length, mv = g.moves || [];
          if (mv.length > have) {
            var u = mv[have], legal = game.moves({ verbose: true }).filter(function (x) { return x.from === u.slice(0, 2) && x.to === u.slice(2, 4) && (!x.promotion || x.promotion === u[4]); })[0];
            if (!legal) { state.over = true; lineEl.textContent = "That move didn't fit the rules, so the game is resting. Sorry about that."; controls(); return; }
            busy = true;
            animateMove(legal, "them").then(function (r) {
              sayMove(r, "them");
              later(function () { busy = false; draw(); if (game.isGameOver()) finish(); else if (mv.length > have + 1) pollPerson(); else pollPerson(); }, 500 * K());
            });
            return;
          }
          if (g.status === "resigned" || g.status === "blocked" || g.status === "abandoned") { state.over = true; return end(g.status === "resigned" ? (g.winner === state.color ? "won" : "resigned") : "draw"); }
          pollPerson();
        }, function () { pollPerson(); });
      }, document.hidden ? 15000 : 4000);
    }
    function sendPersonMove(r) {
      var ply = game.history().length - 1, uci = r.from + r.to + (r.promotion || "");
      var endk = game.isCheckmate() ? "checkmate" : game.isStalemate() ? "stalemate" : game.isDraw() ? "draw" : null;
      social.move(state.person.id, ply, uci, endk).then(function (res) {
        if (!res || !res.ok) { lineEl.textContent = "Hmm, that move didn't reach the table. Let's look again."; return startPerson(state.person.id); }
        if (endk) return finish();
        draw(); pollPerson();
      }, function () { lineEl.textContent = "The table is a bit far away right now. Try again in a moment."; game.undo(); draw(); });
    }
    function endPerson(res) {
      clearTimeout(pollT);
      lineEl.textContent = res === "won" ? "You won. A quiet game." : res === "lost" ? state.person.opp + " won. A quiet game." : res === "resigned" ? "Hat tipped. A quiet game." : "A quiet game, resting now.";
      var ov = el("div", "gc-end " + res); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "gc-end-h");
      var card = el("div", "gc-endcard"), h = el("h2", "", "A quiet game. Play again?"); h.id = "gc-end-h"; card.appendChild(h);
      card.appendChild(el("p", "gc-endsub", lineEl.textContent));
      var row = el("div", "gc-row"), id = state.person.id;
      var again = btn("gc-btn", "Ask for a rematch", function () { social.rematch(id).then(function (r) { ov.remove(); if (r && r.ok) startPerson(r.game_id); else showPicker(); }); });
      row.appendChild(again); row.appendChild(btn("gc-btn ghost", "Back to the table", function () { ov.remove(); showPicker(); }));
      card.appendChild(row); ov.appendChild(card); root.appendChild(ov); setTimeout(function () { again.focus({ preventScroll: true }); }, 30);
    }

    showPicker();
    return { showPicker: showPicker, startGame: startGame, startPerson: startPerson, get game() { return game; }, get state() { return state; }, get busy() { return busy || thinking; },
      destroy: function () { clearTimers(); if (worker) worker.terminate(); host.innerHTML = ""; } };
  }
  window.GremlinChess = { mount: mount, crew: CREW, todaysCrew: todaysCrew };
})();
