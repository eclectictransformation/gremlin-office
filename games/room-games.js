/* Gremlin World: gentle room mini-games for the Gremlin Wing.
   Sort the Chaos (Noodle), Line It Up (Dot), Shelve It (Vesper), Caption This (Moth), Idea Net (Pip), Breathe (Grimble / Moth).
   House rules: no timers, no scores to lose, no fail state, nothing sudden, no typing. Esc or "Done for now" always closes.
   API: GremlinRoomGames.open(id, opts, host{ say, onClose(done) }), .close(silent), .isOpen() */
(function () {
  var root = null, cur = null, reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function el(tag, cls, attrs, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; }
  function svgEl(tag, attrs) { var e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var NAMES = { pip: "Pip", moth: "Moth", noodle: "Noodle", grimble: "Grimble", dot: "Dot", vesper: "Vesper" };

  function frame(title, who, intro) {
    root = el("div", "rg", { role: "dialog", "aria-modal": "true", "aria-label": title });
    var box = el("div", "rg-box"), head = el("div", "rg-head");
    if (who) { var av = el("img", "rg-av", { alt: "", src: "assets/gremlins/" + who + ".webp" }); head.appendChild(av); }
    var ht = el("div", "rg-ht"); ht.appendChild(el("h2", "", null, title)); var msg = el("p", "rg-msg", { "aria-live": "polite" }, intro || ""); ht.appendChild(msg); head.appendChild(ht);
    var x = el("button", "rg-x", { type: "button", "aria-label": "Close" }, "\u00d7"); x.addEventListener("click", function () { close(); }); head.appendChild(x);
    var body = el("div", "rg-body"), foot = el("div", "rg-foot");
    box.appendChild(head); box.appendChild(body); box.appendChild(foot); root.appendChild(box); document.body.appendChild(root);
    setTimeout(function () { x.focus({ preventScroll: true }); }, 30);
    return { body: body, foot: foot, msg: msg, who: who, say: function (t) { msg.textContent = (who ? NAMES[who] + ": " : "") + t; } };
  }
  function btn(label, cls, fn) { var b = el("button", "rg-btn" + (cls ? " " + cls : ""), { type: "button" }, label); b.addEventListener("click", fn); return b; }
  function finish(f, text, again) {
    f.foot.innerHTML = ""; var end = el("div", "rg-end"); end.appendChild(el("p", "", null, text)); f.body.appendChild(end);
    cur.done = true;
    if (again) f.foot.appendChild(btn("Again", "ghost", again));
    f.foot.appendChild(btn("Done for now", "", function () { close(); }));
  }
  function standardFoot(f) { f.foot.innerHTML = ""; f.foot.appendChild(btn("Done for now", "ghost", function () { close(); })); }

  /* ---------- Sort the Chaos (Noodle): untimed. Notes drift down and rest in a pile; any tray is fine. ---------- */
  var NOTES = [
    ["water the half-idea", "pip"], ["a seed packet, unlabelled", "pip"], ["moth sketch: 'lamp, but sleepy'", "moth"], ["caption slip #48", "moth"],
    ["re-ink the cyan", "dot"], ["test print, slightly wonky", "dot"], ["three books, overdue (lovingly)", "vesper"], ["a frog-shaped bookmark", "vesper"],
    ["memo: say it kindly", "grimble"], ["new tea for the burrow", "grimble"], ["a thing for someday", "later"], ["\"maybe Tuesday?\"", "later"]];
  var TRAYS = [["pip", "Pip"], ["moth", "Moth"], ["dot", "Dot"], ["vesper", "Vesper"], ["grimble", "Grimble"], ["later", "Later"]];
  function gSort(f) {
    var area = el("div", "sort-area"), pile = el("div", "sort-pile"), trays = el("div", "sort-trays"), sel = null, left, timers = [];
    area.appendChild(pile); f.body.appendChild(area); f.body.appendChild(trays);
    var notes = shuffle(NOTES).slice(0, 8); left = notes.length;
    var counts = {};
    TRAYS.forEach(function (t) {
      var b = el("button", "sort-tray t-" + t[0], { type: "button", "aria-label": "Tray: " + t[1] });
      b.appendChild(el("span", "lbl", null, t[1])); var c = el("span", "cnt", null, ""); b.appendChild(c); counts[t[0]] = 0;
      b.addEventListener("click", function () { drop(t[0], b, c); }); trays.appendChild(b);
    });
    function pick(n) { if (sel) sel.classList.remove("sel"); sel = n; n.classList.add("sel"); f.say("Lovely. Now pick a tray. Any tray."); }
    function drop(tray, tb, cnt) {
      var n = sel || pile.querySelector(".sort-note:not(.gone)"); if (!n) { f.say("Nothing to sort just yet. One's on its way."); return; }
      sel = null; n.classList.remove("sel"); n.classList.add("gone");
      counts[tray]++; cnt.textContent = counts[tray]; tb.classList.remove("bump"); void tb.offsetWidth; tb.classList.add("bump");
      f.say(n._who === tray ? ["Perfect. Right where it lives.", "Ooh, tidy.", "That's the one."][left % 3] : ["Close enough. It'll get there.", "Eh, it'll find its way.", "A small detour never hurt a note."][left % 3]);
      setTimeout(function () { n.remove(); }, reduce ? 0 : 400);
      if (--left === 0) setTimeout(function () { trays.classList.add("rest"); finish(f, "One thing at a time. The rest will wait.", function () { reset(); }); }, 600);
    }
    function spawn(i) {
      var d = notes[i], n = el("button", "sort-note c" + (i % 5), { type: "button" }, d[0]); n._who = d[1];
      n.style.setProperty("--x", (8 + Math.random() * 70) + "%"); n.style.setProperty("--r", (Math.random() * 12 - 6) + "deg"); n.style.setProperty("--rest", (i % 4) * 12 + "px");
      n.addEventListener("click", function () { pick(n); }); pile.appendChild(n);
    }
    function reset() { timers.forEach(clearTimeout); f.body.innerHTML = ""; standardFoot(f); f.say("Notes keep drifting in. Tap one, then a tray. No rush. They'll wait in the pile."); cur.done = false; gSort(f); }
    notes.forEach(function (_, i) { timers.push(setTimeout(function () { if (root) spawn(i); }, reduce ? 0 : i * 1400)); });
    cur.cleanup = function () { timers.forEach(clearTimeout); };
  }

  /* ---------- Line It Up (Dot): drag C/M/Y/K plates into register to reveal a seedling ---------- */
  function gLine(f) {
    var W = 300, H = 300, s = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "line-svg", role: "img", "aria-label": "Four ink layers of a seedling print" });
    var paper = svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "#fbf7ec" }); s.appendChild(paper);
    var LAYERS = [
      { k: "C", name: "Cyan", col: "#28aee0", draw: '<path d="M95 210h110l-14 64H109z"/><rect x="88" y="198" width="124" height="18" rx="5"/>' },
      { k: "M", name: "Magenta", col: "#e2468c", draw: '<circle cx="150" cy="86" r="22"/><circle cx="128" cy="100" r="16"/><circle cx="172" cy="100" r="16"/>' },
      { k: "Y", name: "Yellow", col: "#f5c400", draw: '<path d="M150 190c-42-6-62-34-58-72 32 4 54 26 58 72z"/><path d="M150 170c34-4 52-26 50-58-28 4-46 22-50 58z"/><circle cx="150" cy="96" r="9"/>' },
      { k: "K", name: "Black", col: "#2c2a33", draw: '<path d="M150 200V112" stroke="#2c2a33" stroke-width="6" fill="none" stroke-linecap="round"/><text x="150" y="40" font-size="26" text-anchor="middle" font-family="Georgia,serif" font-weight="700">seed</text>' }];
    var offs = [], groups = [], active = 0, tabs = el("div", "line-tabs");
    LAYERS.forEach(function (L, i) {
      var g = svgEl("g", { fill: L.col, style: "mix-blend-mode:multiply" }); g.innerHTML = L.draw +
        '<g stroke="' + L.col + '" stroke-width="2" fill="none"><path d="M14 30h22M25 19v22"/><path d="M264 270h22M275 259v22"/></g>';
      s.appendChild(g); groups.push(g);
      var a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 18; offs.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]);
      var t = el("button", "line-tab", { type: "button", "aria-pressed": i === 0 ? "true" : "false" }, L.k); t.style.setProperty("--c", L.col); t.title = L.name;
      t.addEventListener("click", function () { setActive(i); }); tabs.appendChild(t);
    });
    groups[3].setAttribute("style", "");   // black sits on top
    function setActive(i) { active = i; tabs.querySelectorAll(".line-tab").forEach(function (t, j) { t.setAttribute("aria-pressed", j === i ? "true" : "false"); }); f.say("Moving the " + LAYERS[i].name.toLowerCase() + " plate. Drag the print, or use the arrows."); }
    function off(i) { return Math.hypot(offs[i][0], offs[i][1]); }
    function upd() {
      groups.forEach(function (g, i) { g.setAttribute("transform", "translate(" + offs[i][0] + " " + offs[i][1] + ")"); });
      var worst = Math.max.apply(null, offs.map(function (_, i) { return off(i); }));
      if (worst <= 3 && !cur.done) { offs.forEach(function (o) { o[0] = 0; o[1] = 0; }); groups.forEach(function (g) { g.setAttribute("transform", ""); }); printIt(true); }
      else if (!cur.done) meter.textContent = worst < 8 ? "So close. A whisker more." : worst < 18 ? "Getting there." : "Wonky (in a nice way).";
    }
    var wrap = el("div", "line-wrap"); wrap.appendChild(s); f.body.appendChild(wrap);
    var meter = el("p", "line-meter", { "aria-live": "polite" }, ""); f.body.appendChild(meter);
    var pad = el("div", "line-pad"); [["\u2190", -1, 0], ["\u2191", 0, -1], ["\u2193", 0, 1], ["\u2192", 1, 0]].forEach(function (d) {
      pad.appendChild(btn(d[0], "ghost small", function () { if (cur.done) return; offs[active][0] += d[1] * 2; offs[active][1] += d[2] * 2; upd(); }));
    });
    var ctrl = el("div", "line-ctrl"); ctrl.appendChild(tabs); ctrl.appendChild(pad); f.body.appendChild(ctrl);
    var drag = null;
    s.addEventListener("pointerdown", function (e) { if (cur.done) return; var r = s.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, k: W / r.width }; try { s.setPointerCapture(e.pointerId); } catch (er) {} });
    s.addEventListener("pointermove", function (e) { if (!drag) return; offs[active][0] += (e.clientX - drag.x) * drag.k; offs[active][1] += (e.clientY - drag.y) * drag.k; drag.x = e.clientX; drag.y = e.clientY; upd(); });
    s.addEventListener("pointerup", function () { drag = null; offs[active][0] = Math.round(offs[active][0]); offs[active][1] = Math.round(offs[active][1]); upd(); });
    function printIt(perfect) {
      cur.done = true; s.classList.add("printed"); meter.textContent = perfect ? "In register. A seedling!" : "Printed. A little wonky, completely lovely.";
      f.say(perfect ? "Look at that. Every plate where it should be." : "Ship it. The wobble is part of the charm.");
      finish(f, "Imperfect prints still carry the message.", function () { f.body.innerHTML = ""; standardFoot(f); cur.done = false; gLine(f); });
    }
    function addAnyway() { f.foot.insertBefore(btn("Print it anyway", "", function () { if (!cur.done) printIt(false); }), f.foot.firstChild); }
    addAnyway(); upd(); setActive(0);
  }

  /* ---------- Shelve It (Vesper): books drop from the return slot; any shelf is fine; the pile tumbles after ten ---------- */
  var BOOKS = [["Small Poems for Big Mornings", "poetry"], ["Rain, Mostly (verse)", "poetry"], ["Haiku for Kettles", "poetry"],
    ["Why We Sigh", "psych"], ["The Gentle Brain", "psych"], ["Feelings, Sorted", "psych"],
    ["The Case of the Missing Sock", "mystery"], ["The Mystery of the Cold Noodles", "mystery"], ["Who Moved the Stapler", "mystery"],
    ["Mooncat Naps", "picture"], ["Frog Has a Hat", "picture"], ["The Very Small Lamp", "picture"]];
  var SHELVES = [["poetry", "Poetry"], ["psych", "Psychology"], ["mystery", "Mysteries"], ["picture", "Picture books"]];
  function gShelve(f) {
    var slot = el("div", "sh-slot"), pile = el("div", "sh-pile"), shelves = el("div", "sh-shelves"), sel = null, shelved = 0, timers = [];
    slot.appendChild(el("span", "sh-slot-mouth", null, "RETURNS")); f.body.appendChild(slot); f.body.appendChild(pile); f.body.appendChild(shelves);
    var list = shuffle(BOOKS).slice(0, 12), pranks = { 3: "moth", 7: "noodle" }, queue = [];
    list.forEach(function (b, i) { queue.push({ t: b[0], k: b[1] }); if (pranks[i]) queue.push({ prank: pranks[i] }); });
    var shelfEls = {};
    SHELVES.forEach(function (sh) {
      var b = el("button", "sh-shelf", { type: "button", "aria-label": "Shelf: " + sh[1] }); b.appendChild(el("span", "lbl", null, sh[1])); var row = el("span", "row"); b.appendChild(row); shelfEls[sh[0]] = row;
      b.addEventListener("click", function () { put(sh[0], row); }); shelves.appendChild(b);
    });
    var qi = 0;
    function next() {
      if (!root || cur.done || qi >= queue.length) return; var q = queue[qi++];
      var b = el("button", "sh-book" + (q.prank ? " prank" : "") + " c" + (qi % 6), { type: "button" }, q.prank ? "(a book?)" : q.t); b._q = q;
      b.style.setProperty("--r", (Math.random() * 10 - 5) + "deg");
      b.addEventListener("click", function () { choose(b); }); pile.appendChild(b);
    }
    function choose(b) {
      var q = b._q;
      if (q.prank === "moth") { b.classList.add("flap"); b.textContent = "\ud83e\udd8b"; f.say("That one wasn't a book. That was Moth. Hello, Moth."); setTimeout(function () { b.remove(); next(); }, reduce ? 10 : 1200); return; }
      if (q.prank === "noodle") { b.classList.add("noodle"); b.textContent = "Noodle (disguised)"; f.say("Noodle. Out of the returns pile, please. ...Thank you."); setTimeout(function () { b.remove(); next(); }, reduce ? 10 : 1400); return; }
      if (sel) sel.classList.remove("sel"); sel = b; b.classList.add("sel"); f.say("\"" + q.t + "\". Which shelf feels right?");
    }
    function put(k, row) {
      var b = sel || pile.querySelector(".sh-book:not(.prank)"); if (!b) { f.say("Waiting for the next return."); return; }
      if (b._q.prank) { choose(b); return; }
      sel = null; b.remove(); var sp = el("span", "spine c" + (shelved % 6)); sp.title = b._q.t; row.appendChild(sp); shelved++;
      f.say(b._q.k === k ? ["Lovely. It lives there.", "Exactly where I'd put it.", "Shelved. The shelf sighs happily."][shelved % 3] : ["That's a choice. A cozy one.", "Books like a little adventure.", "Close enough; it'll make a new friend."][shelved % 3]);
      if (shelved >= 10) { tumble(); return; }
      next();
    }
    function tumble() {
      cur.done = true; pile.classList.add("tumble"); for (var i = 0; i < 4; i++) { var t = el("span", "sh-book fall c" + i, null, "\u00a0"); t.style.setProperty("--d", i * 0.12 + "s"); pile.appendChild(t); }
      f.say("Oh. The pile has decided it's done for the day. Fair.");
      setTimeout(function () { finish(f, "That's plenty of shelving. Some returns take a while, and that's fine.", function () { f.body.innerHTML = ""; standardFoot(f); cur.done = false; gShelve(f); }); }, reduce ? 50 : 900);
    }
    next(); next(); next();
    cur.cleanup = function () { timers.forEach(clearTimeout); };
  }

  /* ---------- Caption This (Moth): display-only, preset gremlin-written captions ---------- */
  var PAGES = [
    { img: "\u2615", desc: "a teacup, steaming at a tiny cloud", caps: [["The kettle is in a mood again.", "cheer"], ["Tea, but make it weather.", "cheer"], ["Cup (2026). Mixed media.", "groan"]] },
    { img: "\ud83e\udde6", desc: "one sock, walking off on its own", caps: [["It has places to be.", "cheer"], ["Sole searching.", "groan"], ["The wash lets one go every year.", "cheer"]] },
    { img: "\ud83c\udf31", desc: "a sprout wearing a very small hat", caps: [["Dressed for the job it wants.", "cheer"], ["Hat-ching a plan.", "groan"], ["Pip insisted.", "cheer"]] },
    { img: "\ud83c\udf19", desc: "the moon, peeking into a window", caps: [["Just checking you're asleep. You're not.", "cheer"], ["Moon-itoring.", "groan"], ["Night shift says hi.", "cheer"]] },
    { img: "\ud83d\udcda", desc: "a stack of books leaning on a frog", caps: [["The frog has accepted this.", "cheer"], ["Leaning in.", "groan"], ["Vesper's filing system.", "cheer"]] }];
  function gCaption(f, opts) {
    var i = opts && opts.page != null ? opts.page % PAGES.length : 0, shown = 0;
    var stage = el("div", "cap-stage"); f.body.appendChild(stage);
    function show() {
      stage.innerHTML = ""; var p = PAGES[i];
      var panel = el("div", "cap-panel", { role: "img", "aria-label": p.desc }); panel.appendChild(el("span", "cap-img", null, p.img)); panel.appendChild(el("span", "cap-desc", null, p.desc)); stage.appendChild(panel);
      var choices = el("div", "cap-choices"); stage.appendChild(choices);
      p.caps.forEach(function (c) {
        choices.appendChild(btn(c[0], "ghost cap", function () {
          choices.querySelectorAll("button").forEach(function (b) { b.disabled = true; }); this.classList.add("picked");
          var line = el("p", "cap-line", null, "\u201c" + c[0] + "\u201d"); panel.appendChild(line);
          f.say(c[1] === "cheer" ? ["The gremlins cheer. Pip claps with a leaf.", "Cheers from the loft. Noodle whistles.", "Big cheer. Dot prints it on the spot."][shown % 3] : ["A long gremlin groan. (They loved it.)", "Groan. Grimble pretends not to smile.", "Everyone groans. Vesper writes it down anyway."][shown % 3]);
          shown++;
          var nx = el("div", "cap-next"); nx.appendChild(btn(shown >= PAGES.length ? "Last page" : "Next page", "", function () { i = (i + 1) % PAGES.length; if (shown >= PAGES.length) end(); else show(); })); stage.appendChild(nx);
        }));
      });
      f.say("Page " + (i + 1) + " of " + PAGES.length + ". Pick the caption you like.");
    }
    function end() { stage.innerHTML = ""; finish(f, "Every page captioned. Moth folds the favourites into the jar.", function () { f.body.innerHTML = ""; standardFoot(f); cur.done = false; shown = 0; gCaption(f, { page: 0 }); }); }
    show();
  }

  /* ---------- Idea Net (Pip): untimed catching of drifting idea-seeds; duds compost happily ---------- */
  var IDEAS = ["soup, but fancy", "a hat for the plant", "nap o'clock", "a slower Monday", "kite day", "sock swap", "tiny museum", "lamp for the moon", "a bench that rocks", "letters to future me"];
  var DUDS = ["a sad stapler", "\"do everything at once\"", "a sneeze", "grey Tuesday"];
  function gNet(f) {
    var wrap = el("div", "net-wrap"), cv = el("canvas", "net-cv", { width: 640, height: 360, "aria-label": "Idea-seeds drifting through the greenhouse. Tap or click one to catch it." });
    var jars = el("div", "net-jars"), compost = el("div", "net-compost", null, "compost: 0");
    wrap.appendChild(cv); f.body.appendChild(wrap); var bar = el("div", "net-bar"); bar.appendChild(jars); bar.appendChild(compost); f.body.appendChild(bar);
    var cx = cv.getContext("2d"), seeds = [], caught = 0, comp = 0, goal = 6, raf = 0, last = 0, mouse = null, ideas = shuffle(IDEAS), di = 0;
    for (var j = 0; j < goal; j++) jars.appendChild(el("span", "jar"));
    function addSeed(i) { var dud = i % 4 === 3; seeds.push({ x: 40 + Math.random() * 560, y: 380 + Math.random() * 120, vx: (Math.random() - .5) * 18, vy: -(14 + Math.random() * 12), r: 22, ph: Math.random() * 6, dud: dud, txt: dud ? DUDS[di++ % DUDS.length] : ideas[i % ideas.length] }); }
    for (var i = 0; i < 7; i++) addSeed(i);
    var spawned = 7;
    function draw(t) {
      var dt = Math.min(.05, (t - (last || t)) / 1000); last = t; cx.clearRect(0, 0, 640, 360);
      var g = cx.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, "#e9f6e0"); g.addColorStop(1, "#cfe8bf"); cx.fillStyle = g; cx.fillRect(0, 0, 640, 360);
      seeds.forEach(function (s) {
        if (!reduce) { s.ph += dt; s.x += (s.vx + Math.sin(s.ph * 1.3) * 12) * dt; s.y += s.vy * dt; }
        if (s.y < -40) { s.y = 400; s.x = 40 + Math.random() * 560; } if (s.x < 20) s.x = 20; if (s.x > 620) s.x = 620;
        cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 7); cx.fillStyle = s.dud ? "#b9a88a" : "#fff3a6"; cx.fill(); cx.lineWidth = 2; cx.strokeStyle = s.dud ? "#8a7a5a" : "#e0b84a"; cx.stroke();
        cx.beginPath(); cx.moveTo(s.x, s.y + s.r); cx.quadraticCurveTo(s.x + 6, s.y + s.r + 12, s.x, s.y + s.r + 22); cx.strokeStyle = "#7fb069"; cx.stroke();
        cx.fillStyle = "#3f5a35"; cx.font = "13px sans-serif"; cx.textAlign = "center"; cx.fillText(s.txt, s.x, s.y - s.r - 6);
      });
      if (mouse) { cx.beginPath(); cx.arc(mouse.x, mouse.y, 30, 0, 7); cx.strokeStyle = "rgba(84,102,74,.6)"; cx.setLineDash([4, 4]); cx.lineWidth = 3; cx.stroke(); cx.setLineDash([]); }
      raf = requestAnimationFrame(draw);
    }
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 640 / r.width, y: (e.clientY - r.top) * 360 / r.height }; }
    cv.addEventListener("pointermove", function (e) { mouse = pos(e); });
    cv.addEventListener("pointerleave", function () { mouse = null; });
    cv.addEventListener("pointerdown", function (e) { var p = pos(e), best = null, bd = 60; seeds.forEach(function (s) { var d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = s; } }); if (best) catchSeed(best); else f.say("Swish! Missed, and that's fine. They'll drift back round."); });
    function catchSeed(s) {
      seeds.splice(seeds.indexOf(s), 1);
      if (s.dud) { comp++; compost.textContent = "compost: " + comp; f.say("\u201c" + s.txt + "\u201d goes in the compost. It'll feed the next one."); }
      else { caught++; var jj = jars.children[caught - 1]; if (jj) { jj.classList.add("full"); jj.title = s.txt; } f.say("Caught \u201c" + s.txt + "\u201d! Into a jar it goes."); }
      if (caught >= goal) { cancelAnimationFrame(raf); raf = 0; finish(f, "Six ideas jarred. Half-finished ideas still count. Water them anyway.", function () { f.body.innerHTML = ""; standardFoot(f); cur.done = false; gNet(f); }); return; }
      addSeed(spawned++);
    }
    // keyboard: catch the nearest idea-seed
    var kb = btn("Catch the nearest seed", "ghost", function () { var s = seeds.filter(function (x) { return !x.dud; }).sort(function (a, b) { return a.y - b.y; })[0] || seeds[0]; if (s) catchSeed(s); });
    f.foot.insertBefore(kb, f.foot.firstChild);
    raf = requestAnimationFrame(draw);
    cur.cleanup = function () { if (raf) cancelAnimationFrame(raf); };
  }

  /* ---------- Breathe (Grimble's Cool-Off 4/6, Moth's moon lamp 4-7-8). Always stoppable, any pace. ---------- */
  function gBreathe(f, opts) {
    var steps = opts.pattern || [["Breathe in", 4], ["Breathe out", 6]], rounds = opts.rounds || 3, round = 0, si = 0, timer = 0, left = 0;
    var stage = el("div", "br-stage" + (opts.theme ? " " + opts.theme : "")), orb = el("div", "br-orb"), word = el("p", "br-word", { "aria-live": "polite" }, ""), count = el("p", "br-count", null, "");
    stage.appendChild(orb); stage.appendChild(word); stage.appendChild(count); f.body.appendChild(stage);
    if (opts.note) f.body.appendChild(el("p", "br-note", null, opts.note));
    var go = btn("Start", "", start), skip = opts.skippable ? btn("Skip the hold", "ghost", function () { skipHold = !skipHold; skip.textContent = skipHold ? "Use the hold" : "Skip the hold"; }) : null, skipHold = false;
    f.foot.insertBefore(go, f.foot.firstChild); if (skip) f.foot.insertBefore(skip, f.foot.firstChild);
    function start() { go.disabled = true; round = 0; si = 0; step(); }
    function step() {
      if (!root) return;
      if (si >= steps.length) { si = 0; round++; }
      if (round >= rounds) { orb.className = "br-orb"; word.textContent = ""; count.textContent = ""; finish(f, opts.end, function () { f.body.innerHTML = ""; standardFoot(f); cur.done = false; gBreathe(f, opts); }); return; }
      var s = steps[si]; if (skipHold && /hold/i.test(s[0])) { si++; step(); return; }
      word.textContent = s[0]; left = s[1]; count.textContent = left + "  \u00b7  breath " + (round + 1) + " of " + rounds;
      orb.className = "br-orb " + (/in/i.test(s[0]) ? "in" : /out/i.test(s[0]) ? "out" : "hold"); orb.style.transitionDuration = s[1] + "s";
      clearInterval(timer); timer = setInterval(function () { left--; if (left > 0) count.textContent = left + "  \u00b7  breath " + (round + 1) + " of " + rounds; else { clearInterval(timer); si++; step(); } }, 1000);
    }
    cur.cleanup = function () { clearInterval(timer); };
    f.say(opts.intro || "Whenever you're ready.");
  }

  var GAMES = { sort: gSort, lineup: gLine, shelve: gShelve, caption: gCaption, net: gNet, breathe: gBreathe };
  var WHO = { sort: "noodle", lineup: "dot", shelve: "vesper", caption: "moth", net: "pip", breathe: "grimble" };
  var INTRO = { sort: "Notes keep drifting in. Tap one, then a tray. No rush. They'll wait in the pile.", lineup: "Four plates, one seedling. Pick a plate, drag it till the crop marks meet. Or print it anyway.",
    shelve: "Returns are coming through the slot. Tap a book, then a shelf. Wrong shelves are allowed.", caption: "Drying pages need captions. Pick the one you like best. The gremlins will react.",
    net: "Idea-seeds are drifting up. Tap one to catch it. Duds go in the compost, happily.", breathe: "" };

  function open(id, opts, host) {
    if (root) close(true); opts = opts || {}; var fn = GAMES[id]; if (!fn) return;
    cur = { id: id, host: host || {}, done: false, cleanup: null };
    var who = opts.who || WHO[id], f = frame(opts.title || id, who, "");
    standardFoot(f); f.say(opts.intro || INTRO[id]); fn(f, opts);
  }
  function close(silent) {
    if (!root) return; var c = cur; if (c && c.cleanup) try { c.cleanup(); } catch (e) {}
    root.remove(); root = null; cur = null;
    if (!silent && c && c.host.onClose) c.host.onClose(c.done); else if (silent && c && c.host.onClose) c.host.onClose(false);
  }
  window.addEventListener("keydown", function (e) { if (root && e.key === "Escape") { e.preventDefault(); close(); } });
  window.GremlinRoomGames = { open: open, close: close, isOpen: function () { return !!root; }, list: Object.keys(GAMES) };
})();
