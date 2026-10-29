/* The Seed Path: riddles and tiny puzzles for befriending Kin (v2).
   SEED.challenge(ctx, id) wraps one riddle or puzzle with the calm hint ladder:
   hints unlock after 2 tries or ~45s idle; after the 3rd hint, "Tell me the answer"
   appears and the Kin joins happily anyway. No fail states, no timers shown. */
(function () {
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const btn = (txt, cls) => { const b = el("button", "mbtn " + (cls || ""), txt); b.type = "button"; return b; };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const norm = s => String(s || "").toLowerCase().replace(/[\u2019']/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  const strip = s => s.replace(/^(it s |its |it is |i am |im |you are |youre |is it |a |an |the |my |your )+/, "").replace(/^(a |an |the |my |your )/, "");
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  const IDLE = 45, CAL = () => SEED.calm;
  SEED.challengeById = id => SEED.riddles.find(r => r.id === id) || SEED.puzzles.find(p => p.id === id);
  SEED.challengeKind = id => id && id.charAt(0) === "r" ? "riddle" : "puzzle";

  SEED.riddleMatches = function (r, input) {
    const n = norm(input); if (!n) return false; const s = strip(n);
    return r.a.some(a => { const an = norm(a); return n === an || s === an || strip(an) === s || new RegExp("(^| )" + an + "( |$)").test(n); });
  };

  SEED.challenge = function (c, id) {
    const def = SEED.challengeById(id), kind = SEED.challengeKind(id);
    const wrap = el("div", "chal"), title = el("p", "chtitle", kind === "riddle" ? "A riddle" : def.title), body = el("div", "chbody");
    const hintBox = el("p", "chhint"); hintBox.hidden = true; hintBox.setAttribute("aria-live", "polite");
    const row = el("div", "row chrow"), hb = btn("A hint, please", "quiet chbtn"), tb = btn("Tell me the answer", "quiet chbtn");
    hb.hidden = true; tb.hidden = true; hb.dataset.test = "hint"; tb.dataset.test = "tell"; row.append(hb, tb);
    wrap.append(title, body, hintBox, row); c.stage.appendChild(wrap);
    let tries = 0, idle = 0, given = 0, unlocked = false, finished = false;
    const hints = kind === "riddle" ? def.hints.concat("It starts with \u201C" + def.show.replace(/^(a|an|your|the) /, "").charAt(0).toUpperCase() + "\u201D.") : def.hints;
    const unlock = () => { if (unlocked || finished) return; unlocked = true; hb.hidden = false; };
    const g = {
      kin: c.kin, stage: body, still: c.still, tone: c.tone, say: c.say,
      miss(line) { tries++; idle = 0; c.say(line || (tries >= 2 ? CAL().wrong : CAL().wrongSoft)); if (tries >= 2) unlock(); },
      solved(line) { if (finished) return; finished = true; hb.hidden = tb.hidden = true; c.say(line || "Yes! That's it."); c.tone && c.tone(3); setTimeout(c.done, 1300); },
      done() { g.solved(); }
    };
    const inner = kind === "riddle" ? riddle(g, def) : P[def.type](g, def);
    hb.onclick = () => { if (finished) return; idle = 0; given = Math.min(hints.length, given + 1); hintBox.hidden = false; hintBox.textContent = hints[given - 1]; inner.hint && inner.hint(given);
      if (given >= hints.length) { hb.hidden = true; tb.hidden = false; tb.focus({ preventScroll: true }); } };
    tb.onclick = () => { if (finished) return; finished = true; hb.hidden = tb.hidden = true; inner.reveal();
      setTimeout(() => { c.say(CAL().joinedAnyway.replace("{name}", c.kin.name)); }, 1500); setTimeout(c.done, 2900); };
    wrap.addEventListener("pointerdown", () => { idle = 0; });
    return {
      update(dt) { if (finished) return; idle += dt; if (idle >= IDLE) unlock(); inner.update && inner.update(dt); },
      key(e, down) { idle = 0; return inner.key ? inner.key(e, down) : false; },
      info: () => ({ id, kind, tier: def.tier, tries, given, unlocked, answer: def.show, solve: () => inner.reveal(true), sub: inner.info ? inner.info() : null })
    };
  };

  /* ---------- riddle ---------- */
  function riddle(g, r) {
    const q = el("p", "riddle-q", "\u201C" + r.q + "\u201D");
    const form = el("form", "row rform"); const inp = el("input", "rin"); inp.type = "text"; inp.autocomplete = "off"; inp.setAttribute("autocapitalize", "off"); inp.setAttribute("aria-label", "Your answer"); inp.placeholder = "Your answer";
    inp.maxLength = 40; const go = btn("That's my answer", "primary"); go.type = "submit"; go.dataset.test = "answer";
    form.append(inp, go);
    const showC = btn("Show me three choices", "quiet chbtn"); showC.dataset.test = "showchoices";
    const ch = el("div", "row rchoices"); ch.hidden = true;
    const opts = shuffle(r.choices.map((c, i) => ({ pic: c[0], word: c[1], right: i === 0 })));
    opts.forEach(o => { const b = btn("", "rchoice"); b.dataset.test = o.right ? "choice-right" : "choice";
      if (o.pic) b.appendChild(el("span", "rpic", o.pic)); b.appendChild(el("span", "", o.word)); b.setAttribute("aria-label", o.word);
      b.onclick = () => { if (b.disabled) return; if (o.right) { b.classList.add("right"); g.solved("Yes! " + cap(r.show) + ". " + g.kin.name + " looks delighted."); } else { b.disabled = true; b.classList.add("nope"); g.miss(); } };
      ch.appendChild(b); });
    const openChoices = () => { ch.hidden = false; showC.hidden = true; };
    showC.onclick = openChoices;
    form.onsubmit = e => { e.preventDefault(); const v = inp.value; if (!norm(v)) { g.say("Type a word, or tap \u201CShow me three choices\u201D."); return; }
      if (SEED.riddleMatches(r, v)) g.solved("Yes! " + cap(r.show) + ". " + g.kin.name + " looks delighted."); else { inp.select(); g.miss(); } };
    g.stage.append(q, form, showC, ch);
    if (coarse) openChoices(); else setTimeout(() => inp.focus({ preventScroll: true }), 80);
    g.say("Type your answer, or pick from three choices. Take your time.");
    return {
      hint(n) { if (n >= 3) openChoices(); },
      reveal() { inp.value = r.show; openChoices(); ch.querySelectorAll("button").forEach(b => { if (b.dataset.test === "choice-right") b.classList.add("right"); }); g.say(CAL().told.replace("{a}", r.show)); },
      key() { return false; }, info: () => ({ choicesShown: !ch.hidden })
    };
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- puzzles ---------- */
  const P = {};
  const svg = (inner, vb, cls) => '<svg class="' + (cls || "") + '" viewBox="' + (vb || "0 0 60 60") + '" aria-hidden="true">' + inner + "</svg>";

  /* stepping stones: place 3 stones so the Kin can cross; any path counts */
  P.stones = function (g) {
    const R = 3, C = 3; let stones = new Set(), done = false;
    const wrapg = el("div", "stream"); wrapg.style.gridTemplateColumns = "repeat(" + (C + 2) + ", 1fr)"; const cells = {};
    for (let y = 0; y < R; y++) for (let x = -1; x <= C; x++) {
      if (x < 0 || x === C) { const b = el("div", "bank"); if (y === 1) b.textContent = x < 0 ? "\u263A" : ""; if (y === 1 && x === C) b.appendChild(SEED.kinPortrait(g.kin, false, 40)); wrapg.appendChild(b); continue; }
      const b = btn("", "wcell"); b.setAttribute("aria-label", "Water, column " + (x + 1) + ", row " + (y + 1)); b.dataset.test = "w" + x + "," + y;
      b.onclick = () => tap(x, y); cells[x + "," + y] = b; wrapg.appendChild(b); }
    const draw = () => Object.entries(cells).forEach(([k, b]) => { b.classList.toggle("stone", stones.has(k)); b.textContent = stones.has(k) ? "\u25CF" : "\u2248"; });
    const ok = () => { const rowOf = []; for (let x = 0; x < C; x++) { const r = [0, 1, 2].filter(y => stones.has(x + "," + y)); if (!r.length) return false; rowOf.push(r); }
      for (let x = 1; x < C; x++) if (!rowOf[x].some(a => rowOf[x - 1].some(b => Math.abs(a - b) <= 1))) return false; return true; };
    const tap = (x, y) => { if (done) return; const k = x + "," + y;
      if (stones.has(k)) { stones.delete(k); g.say("You pick the stone back up."); }
      else if (stones.size >= 3) { g.say("All 3 stones are in. Tap one to pick it back up."); return; }
      else { stones.add(k); g.tone && g.tone(stones.size); }
      draw(); if (stones.size === 3) { if (ok()) { done = true; g.solved("Hop, hop, hop. " + g.kin.name + " is across, with dry feet!"); } else g.miss("Hmm, that's a big jump somewhere. That's okay. Tap a stone to move it."); } else if (!stones.has(k)) {} else g.say(3 - stones.size + " more to place."); };
    g.stage.appendChild(wrapg); draw();
    g.say("Help " + g.kin.name + " cross. Tap the water to place 3 stepping stones. Any path works.");
    return { reveal() { stones = new Set(["0,1", "1,1", "2,1"]); done = true; draw(); g.say("A straight line across the middle works."); }, info: () => ({ stones: [...stones] }) };
  };

  /* shadow match: leaf, shell, feather onto their shadows */
  const SHAPES = {
    leaf: { label: "leaf", col: "#7F9A6E", d: "M30 5 C50 16 50 40 30 55 C10 40 10 16 30 5Z", extra: '<path d="M30 12 L30 50" stroke="#54664A" stroke-width="2"/>' },
    shell: { label: "shell", col: "#E8B77A", d: "M30 52 L7 27 A23 23 0 0 1 53 27 Z", extra: '<path d="M30 52 L18 12 M30 52 L30 6 M30 52 L42 12" stroke="#C98F52" stroke-width="2"/>' },
    feather: { label: "feather", col: "#B9A7D6", d: "M47 5 C33 13 19 29 14 53 L19 55 C27 35 37 21 50 9Z", extra: "" }
  };
  P.shadow = function (g) {
    const keys = ["leaf", "shell", "feather"]; let sel = null, left = 3;
    const items = el("div", "row shitems"), shadows = el("div", "row shslots");
    shuffle(keys).forEach(k => { const s = SHAPES[k], b = btn("", "shitem"); b.innerHTML = svg('<path d="' + s.d + '" fill="' + s.col + '"/>' + s.extra); b.setAttribute("aria-label", s.label); b.dataset.test = "item-" + k;
      b.onclick = () => { if (b.disabled) return; items.querySelectorAll(".shitem").forEach(x => x.classList.remove("sel")); sel = k; b.classList.add("sel"); g.say("Now tap the shadow that matches the " + s.label + "."); }; items.appendChild(b); });
    shuffle(keys).forEach((k, i) => { const s = SHAPES[k], b = btn("", "shslot"); b.innerHTML = svg('<path d="' + s.d + '" fill="#6E6E62" opacity=".55"/>'); b.setAttribute("aria-label", "Shadow " + (i + 1)); b.dataset.test = "shadow-" + k;
      b.onclick = () => { if (b.classList.contains("filled")) return; if (!sel) { g.say("Tap a thing first, then its shadow."); return; }
        if (sel !== k) { g.miss("Hmm, that shape doesn't quite fit. That's okay."); return; }
        fillSlot(b, k); };
      shadows.appendChild(b); });
    const fillSlot = (b, k) => { const s = SHAPES[k]; b.classList.add("filled"); b.innerHTML = svg('<path d="' + s.d + '" fill="' + s.col + '"/>' + s.extra);
      const it = items.querySelector('[data-test="item-' + k + '"]'); it.disabled = true; it.classList.remove("sel"); it.classList.add("used"); sel = null; left--; g.tone && g.tone(3 - left);
      if (left === 0) g.solved("Every shadow has its thing back."); else g.say("Yes, a perfect fit. " + left + " to go."); };
    g.stage.append(items, shadows);
    g.say("Tap a leaf, shell or feather, then tap its matching shadow.");
    return { reveal() { keys.forEach(k => { const b = shadows.querySelector('[data-test="shadow-' + k + '"]'); if (!b.classList.contains("filled")) { const s = SHAPES[k]; b.classList.add("filled"); b.innerHTML = svg('<path d="' + s.d + '" fill="' + s.col + '"/>' + s.extra); } }); items.querySelectorAll("button").forEach(b => b.disabled = true); g.say("Each thing goes with the shadow of its own shape."); }, info: () => ({ left }) };
  };

  /* lantern line: tap 4 lanterns smallest to biggest */
  const WARM = ["#FBF6EA", "#FBE3A0", "#F5D9A8", "#E8B77A"];
  P.lantern = function (g) {
    let next = 0; const row = el("div", "row lanterns"), btns = [];
    const lant = (s, lit) => svg('<rect x="27" y="2" width="6" height="6" fill="#54664A"/><rect x="14" y="8" width="32" height="6" rx="2" fill="#54664A"/><rect x="16" y="14" width="28" height="36" rx="8" fill="' + (lit >= 0 ? WARM[lit] : "#9A9A8C") + '" stroke="#3A4A33" stroke-width="3"/><rect x="14" y="50" width="32" height="6" rx="2" fill="#54664A"/>', "0 0 60 60");
    shuffle([0, 1, 2, 3]).forEach(s => { const b = btn("", "lantern"); b.innerHTML = lant(s, -1); b.querySelector("svg").style.height = (34 + s * 14) + "px"; b.setAttribute("aria-label", ["The smallest lantern", "A small lantern", "A bigger lantern", "The biggest lantern"][s]); b.dataset.test = "lantern-" + s; btns[s] = b;
      b.onclick = () => { if (b.classList.contains("lit")) return; if (s !== next) { g.miss(s > next ? "That one's a little big to go next. That's okay. Try a smaller one." : "Hmm, not that one."); return; } light(s); };
      row.appendChild(b); });
    const light = s => { const b = btns[s]; b.classList.add("lit"); b.innerHTML = lant(s, s); b.querySelector("svg").style.height = (34 + s * 14) + "px"; next++; g.tone && g.tone(next);
      if (next >= 4) g.solved("All four glow, from small and pale to big and warm."); else g.say(["A soft glow.", "A little warmer.", "Warmer still."][next - 1]); };
    g.stage.appendChild(row); g.say("Light the lanterns from the smallest to the biggest. Each one glows a little warmer.");
    return { reveal() { while (next < 4) { const b = btns[next]; b.classList.add("lit"); b.innerHTML = lant(next, next); b.querySelector("svg").style.height = (34 + next * 14) + "px"; next++; } g.say("Smallest to biggest, glowing warmer each time."); }, info: () => ({ next }) };
  };

  /* the water one (kept from v1): roll the seed to the water */
  P.guide = function (g, def) {
    const h = SEED.moments.guide({ kin: g.kin, m: {}, stage: g.stage, still: g.still, tone: g.tone, say: t => { if (/stone is in the way/.test(t)) g.miss("A stone is in the way. That's okay. Try going around."); else g.say(t); }, done: () => { g.solved("The seed reaches the water and a tiny green sprout pops up."); } });
    return { reveal() { g.say("Roll down, then all the way right, then up to the water. The sprout is happy either way."); }, key: (e, d) => h.key(e, d), info: () => h.info() };
  };

  /* bamboo pipes: rotate 3 pieces so water reaches the sprout. Bits N1 E2 S4 W8 */
  const rot = m => ((m << 1) | (m >> 3)) & 15;
  P.pipes = function (g) {
    const cells = { "0,0": { m: 3 }, "0,1": { m: 12 }, "1,1": { m: 5 } };   // start: wrong; goal 0,0 = W+S (12), 0,1 = N+E (3), 1,1 = W+E (10)
    const grid = el("div", "pipes"), btns = {};
    const order = [["src"], ["0,0"], ["1,0"], ["gap"], ["0,1"], ["1,1"]];
    const ends = { 1: [30, 0], 2: [60, 30], 4: [30, 60], 8: [0, 30] };
    const flow = () => { const wet = new Set(); let x = 0, y = 0, from = 8;
      for (let i = 0; i < 4; i++) { const c = cells[x + "," + y]; if (!c || !(c.m & from)) return { wet, out: false }; wet.add(x + "," + y); const out = c.m & ~from & 15; const d = { 1: [0, -1, 4], 2: [1, 0, 8], 4: [0, 1, 1], 8: [-1, 0, 2] }[out]; if (!d) return { wet, out: false };
        if (x === 1 && y === 1 && out === 2) return { wet, out: true }; x += d[0]; y += d[1]; from = d[2]; } return { wet, out: false }; };
    const draw = () => { const f = flow(); Object.entries(btns).forEach(([k, b]) => { const m = cells[k].m, w = f.wet.has(k);
      b.innerHTML = svg([1, 2, 4, 8].filter(bit => m & bit).map(bit => '<line x1="30" y1="30" x2="' + ends[bit][0] + '" y2="' + ends[bit][1] + '" stroke="#7F9A6E" stroke-width="16" stroke-linecap="round"/><line x1="30" y1="30" x2="' + ends[bit][0] + '" y2="' + ends[bit][1] + '" stroke="' + (w ? "#7FA7B5" : "#C8D4BE") + '" stroke-width="7" stroke-linecap="round"/>').join(""));
      b.classList.toggle("wet", w); });
      sprout.textContent = f.out ? "\u2618" : "\u2022"; sprout.classList.toggle("happy", f.out); return f.out; };
    const sprout = el("div", "pend sprout");
    const src = el("div", "pend spring", "\u2248");
    grid.append(src);
    ["0,0", "1,0", "0,1", "1,1"].forEach(k => {
      if (k === "1,0") { grid.appendChild(el("div", "prock", "\u25B2")); grid.appendChild(el("div", "pend")); return; }
      const b = btn("", "pipe"); b.dataset.test = "pipe-" + k; b.setAttribute("aria-label", "Turn this pipe"); btns[k] = b;
      b.onclick = () => { if (solved) return; cells[k].m = rot(cells[k].m); turns++; if (turns === 10) { tries(); } g.tone && g.tone(1 + turns % 4); if (draw()) { solved = true; g.solved("Water trickles all the way to the sprout. It perks right up."); } else g.say("Tap a pipe to turn it."); };
      if (k === "0,1") grid.appendChild(el("div", "pend")); grid.appendChild(b); });
    grid.appendChild(sprout);
    let solved = false, turns = 0; const tries = () => { g.miss("Pipes can be twisty. That's okay."); g.miss("Pipes can be twisty. That's okay. Want a hint?"); };
    g.stage.appendChild(grid); draw();
    g.say("Water comes from the spring on the left. Tap the bamboo pipes to turn them, so the water reaches the thirsty sprout.");
    return { reveal() { cells["0,0"].m = 12; cells["0,1"].m = 3; cells["1,1"].m = 10; draw(); g.say("In from the left, down, then across to the sprout."); }, info: () => ({ cells: JSON.parse(JSON.stringify(cells)) }) };
  };

  /* pebble fade: swap 5 pebbles into light-to-dark */
  const SHADES = ["#F1EDE2", "#D8CFBC", "#B4B4A6", "#8C8C7E", "#5E5E54"];
  P.pebbles = function (g) {
    let order; do { order = shuffle([0, 1, 2, 3, 4]); } while (order.every((v, i) => v === i) || order.filter((v, i) => v === i).length > 1);
    let sel = -1, swaps = 0, done = false; const row = el("div", "row pebbles");
    const draw = () => { row.textContent = ""; order.forEach((v, i) => { const b = btn("", "pebble" + (sel === i ? " sel" : "")); b.style.background = SHADES[v]; b.dataset.test = "pebble-" + i; b.dataset.shade = v;
      b.setAttribute("aria-label", "Pebble " + (i + 1) + ", " + ["lightest", "light", "middle", "dark", "darkest"][v]); b.onclick = () => tap(i); row.appendChild(b); }); };
    const tap = i => { if (done) return; if (sel < 0) { sel = i; draw(); g.say("Now tap where it should go."); return; }
      if (sel !== i) { [order[sel], order[i]] = [order[i], order[sel]]; swaps++; g.tone && g.tone(1 + swaps % 5); } sel = -1; draw();
      if (order.every((v, k) => v === k)) { done = true; g.solved("A soft fade, light to dark, like dusk."); } else { g.say("Swapped."); if (swaps === 8) g.miss("Pebbles are fussy. That's okay."), g.miss("Pebbles are fussy. That's okay. Want a hint?"); } };
    const lab = el("div", "row pebblelab"); lab.append(el("span", "", "light"), el("span", "", "dark"));
    g.stage.append(row, lab); draw();
    g.say("Tap two pebbles to swap them. Line them up from lightest on the left to darkest on the right.");
    return { reveal() { order = [0, 1, 2, 3, 4]; sel = -1; done = true; draw(); g.say("Lightest on the left, darkest on the right."); }, info: () => ({ order: order.slice() }) };
  };

  /* chime echo: 3 chimes glow (and sound, if sound is on); tap them back in order */
  const CHIMES = [{ c: "#A6B89A", n: "leaf chime" }, { c: "#B9A7D6", n: "lavender chime" }, { c: "#E8B77A", n: "peach chime" }, { c: "#7FA7B5", n: "water chime" }];
  P.chime = function (g) {
    const seq = []; while (seq.length < 3) { const v = Math.floor(Math.random() * 4); if (v !== seq[seq.length - 1]) seq.push(v); }
    let step = 0, playing = -1, pt = 0, done = false;
    const row = el("div", "row chimes"), bs = CHIMES.map((ch, i) => { const b = btn("", "chime"); b.style.setProperty("--cc", ch.c); b.innerHTML = svg('<rect x="27" y="0" width="6" height="12" fill="#54664A"/><rect x="18" y="12" width="24" height="40" rx="6" fill="' + ch.c + '" stroke="#3A4A33" stroke-width="3"/><circle cx="30" cy="56" r="4" fill="#3A4A33"/>');
      b.setAttribute("aria-label", ch.n); b.dataset.test = "chime-" + i; b.onclick = () => tap(i); row.appendChild(b); return b; });
    const strip = el("div", "row chorder"); strip.hidden = true; seq.forEach((v, i) => { const d = el("span", "chdot"); d.style.background = CHIMES[v].c; d.title = (i + 1) + ": " + CHIMES[v].n; strip.appendChild(d); });
    const prog = el("div", "dots"); seq.forEach(() => prog.appendChild(el("span", "dot")));
    const again = btn("Play again", "quiet chbtn"); again.dataset.test = "replay"; again.onclick = () => play();
    const glow = i => { bs.forEach((b, k) => b.classList.toggle("glow", k === i)); if (i >= 0) g.tone && g.tone(i + 2); };
    const play = () => { if (done) return; playing = 0; pt = -0.5; step = 0; [...prog.children].forEach(d => d.classList.remove("on")); bs.forEach(b => b.disabled = true); g.say("Watch (and listen)..."); };
    const tap = i => { if (done || playing >= 0) return; glow(i); setTimeout(() => glow(-1), 350);
      if (i === seq[step]) { prog.children[step].classList.add("on"); step++; if (step >= 3) { done = true; g.solved("The chimes ring together, soft and bright."); } else g.say(["Yes.", "Mm-hm."][step - 1]); }
      else { g.miss(); step = 0; [...prog.children].forEach(d => d.classList.remove("on")); setTimeout(() => { if (!done) play(); }, 900); } };
    g.stage.append(row, prog, again, strip); setTimeout(play, 600);
    g.say("Three chimes will glow, one at a time. Then tap them back in the same order. Sound is not needed.");
    return {
      update(dt) { if (playing < 0) return; pt += dt; const slot = Math.floor(pt / 0.9);
        if (pt < 0) return; if (slot >= 3) { glow(-1); playing = -1; bs.forEach(b => b.disabled = false); g.say("Your turn. Tap them in the same order."); return; }
        const on = (pt % 0.9) < 0.6 ? seq[slot] : -1;
        if (on >= 0 && !bs[on].classList.contains("glow")) glow(on); else if (on < 0 && bs.some(b => b.classList.contains("glow"))) bs.forEach(b => b.classList.remove("glow")); },
      hint(n) { if (n >= 3) strip.hidden = false; },
      reveal() { strip.hidden = false; done = true; seq.forEach((v, i) => prog.children[i].classList.add("on")); g.say("The order was: " + seq.map(v => CHIMES[v].n).join(", then ") + "."); },
      info: () => ({ seq: seq.slice(), playing, step })
    };
  };

  /* lily pad hop: place 4 pads so the frog can hop (8 directions) to the Kin */
  P.lily = function (g) {
    const C = 4, R = 3, reeds = new Set(["1,1", "2,1"]); let pads = new Set(), done = false;
    const grid = el("div", "lily"); grid.style.gridTemplateColumns = "repeat(" + (C + 2) + ", 1fr)"; const cells = {};
    for (let y = 0; y < R; y++) for (let x = -1; x <= C; x++) {
      if (x < 0 || x === C) { const b = el("div", "bank"); if (x < 0 && y === 2) b.textContent = "\u{1F438}"; if (x === C && y === 0) b.appendChild(SEED.kinPortrait(g.kin, false, 40)); grid.appendChild(b); continue; }
      const k = x + "," + y;
      if (reeds.has(k)) { grid.appendChild(el("div", "reed", "\u2551")); continue; }
      const b = btn("", "wcell"); b.dataset.test = "pad" + k; b.setAttribute("aria-label", "Water, column " + (x + 1) + ", row " + (y + 1)); b.onclick = () => tap(k); cells[k] = b; grid.appendChild(b); }
    const adj = (a, b) => Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
    const reach = () => { const P2 = [...pads].map(k => k.split(",").map(Number)); const seen = new Set(), q = [[-1, 2]];
      while (q.length) { const p = q.shift(); if (adj(p, [C, 0]) && p[0] >= 0) return true; P2.forEach(n => { const k = n + ""; if (!seen.has(k) && adj(p, n)) { seen.add(k); q.push(n); } }); } return false; };
    const draw = () => Object.entries(cells).forEach(([k, b]) => { b.classList.toggle("pad", pads.has(k)); b.textContent = pads.has(k) ? "\u2B2C" : "\u2248"; });
    const tap = k => { if (done) return; if (pads.has(k)) pads.delete(k); else if (pads.size >= 4) { g.say("All 4 lily pads are out. Tap one to move it."); return; } else { pads.add(k); g.tone && g.tone(pads.size); }
      draw(); if (reach()) { done = true; g.solved("Hop... hop... hop... hop! The frog says hello to " + g.kin.name + "."); } else if (pads.size === 4) g.miss("The frog can't quite reach. That's okay. Tap a pad to move it."); else g.say((4 - pads.size) + " lily pads left to place."); };
    g.stage.appendChild(grid); draw();
    g.say("Place 4 lily pads so the frog can hop over to " + g.kin.name + ". It can hop to any pad that touches, even corner to corner. Reeds can't hold a pad.");
    return { reveal() { pads = new Set(["0,2", "1,2", "2,2", "3,1"]); done = true; draw(); g.say("Along the bottom, then up to the Kin."); }, info: () => ({ pads: [...pads] }) };
  };

  /* moss tiles: 2x3 slide puzzle of the Kin's picture, shuffled only a few moves */
  P.moss = function (g) {
    const C = 3, R = 2; let tiles = [0, 1, 2, 3, 4, -1], done = false;   // -1 = the empty spot
    const pic = document.createElement("canvas"); pic.width = 180; pic.height = 120; const x = pic.getContext("2d");
    x.fillStyle = "#C8D4BE"; x.fillRect(0, 0, 180, 120); x.fillStyle = "#A6B89A"; for (let i = 0; i < 6; i++) x.fillRect(0, 84 + i * 6, 180, 3);
    x.fillStyle = "#FBF6EA"; x.beginPath(); x.ellipse(40, 26, 26, 9, 0, 0, 7); x.ellipse(140, 20, 22, 8, 0, 0, 7); x.fill();
    x.imageSmoothingEnabled = false; x.drawImage(SEED.kinPortrait(g.kin, false, 96), 42, 14, 96, 96);
    x.fillStyle = "#7F9A6E"; [[10, 100], [160, 96], [22, 70], [150, 66]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 7, 0, 7); x.fill(); });
    const url = pic.toDataURL();
    const nb = i => { const r = Math.floor(i / C), c = i % C, o = []; if (c > 0) o.push(i - 1); if (c < C - 1) o.push(i + 1); if (r > 0) o.push(i - C); if (r < R - 1) o.push(i + C); return o; };
    let prev = -1; const moves = 4 + Math.floor(Math.random() * 2);
    for (let m = 0; m < moves; m++) { const e = tiles.indexOf(-1); const opts = nb(e).filter(i => i !== prev); const t = opts[Math.floor(Math.random() * opts.length)]; [tiles[e], tiles[t]] = [tiles[t], tiles[e]]; prev = e; }
    if (tiles.every((v, i) => v === (i === 5 ? -1 : i))) { [tiles[4], tiles[5]] = [tiles[5], tiles[4]]; }
    const grid = el("div", "moss"), preview = el("div", "mossprev"); preview.style.backgroundImage = "url(" + url + ")"; preview.setAttribute("aria-label", "The finished picture"); preview.setAttribute("role", "img");
    const draw = () => { grid.textContent = ""; tiles.forEach((v, i) => { if (v < 0) { grid.appendChild(el("div", "mtile empty")); return; }
      const b = btn("", "mtile"); b.style.backgroundImage = "url(" + url + ")"; b.style.backgroundPosition = (v % C) * 50 + "% " + Math.floor(v / C) * 100 + "%"; b.dataset.test = "tile-" + i; b.dataset.v = v;
      b.setAttribute("aria-label", "Tile " + (v + 1) + (nb(tiles.indexOf(-1)).includes(i) ? ", can slide" : "")); b.onclick = () => tap(i); grid.appendChild(b); }); };
    let slides = 0;
    const tap = i => { if (done) return; const e = tiles.indexOf(-1); if (!nb(e).includes(i)) { g.say("Only tiles next to the empty space can slide."); return; }
      [tiles[e], tiles[i]] = [tiles[i], tiles[e]]; slides++; g.tone && g.tone(1 + slides % 5); draw();
      if (tiles.every((v, k) => v === (k === 5 ? -1 : k))) { done = true; grid.classList.add("whole"); g.solved("There's " + g.kin.name + ", all in one piece!"); } else { g.say("Slide."); if (slides === 14) { g.miss("Slide puzzles wander. That's okay."); g.miss("Slide puzzles wander. That's okay. Want a hint?"); } } };
    const wrapm = el("div", "row mosswrap"); wrapm.append(grid, preview);
    g.stage.appendChild(wrapm); draw();
    g.say("The moss picture of " + g.kin.name + " got jumbled. Tap a tile next to the gap to slide it. The little picture shows how it should look.");
    return { reveal() { tiles = [0, 1, 2, 3, 4, -1]; done = true; draw(); grid.classList.add("whole"); g.say("All back in place."); }, info: () => ({ tiles: tiles.slice() }) };
  };
  SEED.puzzleTypes = P;
})();
