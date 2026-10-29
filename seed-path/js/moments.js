/* The Seed Path: the gentle overlay moments. None of them can fail.
   Each type gets ctx = { kin, m, stage, say, done, still, tone } and returns
   { update(dt), key(e, down) }. Call ctx.done() once, when it's complete. */
(function () {
  const M = SEED.moments = {};
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const btn = (txt, cls) => { const b = el("button", "mbtn " + (cls || ""), txt); b.type = "button"; return b; };
  function holdButton(label, onDown, onUp) {
    const b = btn(label, "hold");
    const d = e => { e.preventDefault(); onDown(); b.classList.add("on"); };
    const u = e => { e.preventDefault(); onUp(); b.classList.remove("on"); };
    b.addEventListener("pointerdown", d); b.addEventListener("pointerup", u); b.addEventListener("pointerleave", u); b.addEventListener("pointercancel", u);
    b.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { d(e); } });
    b.addEventListener("keyup", e => { if (e.key === " " || e.key === "Enter") u(e); });
    return b;
  }
  const rand = SEED.hash;

  /* breathe: hold to breathe in, let go to breathe out */
  M.breath = function (c) {
    const m = c.m, need = m.cycles || 3; let holding = false, phase = "rest", tIn = 0, tOut = 0, done = 0, finished = false;
    const wrap = el("div", "breathe"), ring = el("div", "ring"), core = el("div", "core"), label = el("div", "ringlabel", "ready");
    ring.appendChild(core); ring.appendChild(label); wrap.appendChild(ring);
    const dots = el("div", "dots"); for (let i = 0; i < need; i++) dots.appendChild(el("span", "dot")); wrap.appendChild(dots);
    const hb = holdButton("Hold to breathe in", () => { holding = true; if (phase !== "in") { phase = "in"; tIn = 0; } }, () => { holding = false; if (phase === "in") { phase = "out"; tOut = 0; } });
    hb.dataset.test = "hold"; wrap.appendChild(hb); c.stage.appendChild(wrap);
    c.say("Hold the button (or Space) to breathe in for about four counts. Let go to breathe out, a bit longer.");
    let scale = 0.55;
    return {
      update(dt) {
        if (finished) return;
        if (phase === "in") { tIn += dt; scale = Math.min(1, 0.55 + 0.45 * tIn / m.inSec); label.textContent = tIn >= m.inSec ? "and let go..." : "breathing in"; }
        else if (phase === "out") {
          tOut += dt; scale = Math.max(0.55, scale - dt * 0.45 / m.outSec); label.textContent = "breathing out";
          if (tIn >= 1.2 && tOut >= Math.min(m.outSec * 0.6, 3.5)) { done++; dots.children[done - 1].classList.add("on"); tIn = 0; phase = "rest"; c.tone && c.tone(done); c.say(done < need ? "Lovely. Again, whenever you're ready." : "There."); if (done >= need) { finished = true; setTimeout(c.done, 900); } }
          else if (tIn < 1.2 && tOut > 1.5) { phase = "rest"; c.say("That's okay. Any pace is fine. Hold to breathe in, whenever you're ready."); }
        } else label.textContent = done ? "rest" : "ready";
        ring.style.setProperty("--s", c.still ? 1 : scale.toFixed(3));
        core.style.opacity = (0.35 + 0.65 * done / need).toFixed(2);
        ring.classList.toggle("in", phase === "in");
      },
      key(e, down) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (e.repeat) return; if (down) { holding = true; if (phase !== "in") { phase = "in"; tIn = 0; } hb.classList.add("on"); } else { holding = false; hb.classList.remove("on"); if (phase === "in") { phase = "out"; tOut = 0; } } return true; } },
      info: () => ({ phase, done, need })
    };
  };

  /* rhythm: tap along with drips; any `hits` count, near misses count */
  M.rhythm = function (c) {
    const m = c.m, need = m.hits || 4, every = m.every || 1.5; let t = 0, hits = 0, lastCounted = -1, finished = false;
    const cv = el("canvas", "rcv"); cv.width = 320; cv.height = 150; const x = cv.getContext("2d");
    const dots = el("div", "dots"); for (let i = 0; i < need; i++) dots.appendChild(el("span", "dot"));
    const b = btn("Tap with the " + (m.what || "drip"), "big"); b.dataset.test = "tap";
    const tap = () => {
      if (finished) return; const beat = Math.round(t / every), d = Math.abs(t - beat * every);
      if (beat >= 1 && d < 0.6 && beat !== lastCounted) { lastCounted = beat; hits++; dots.children[hits - 1].classList.add("on"); c.tone && c.tone(hits); c.say(hits < need ? ["Yes, like that.", "Mm-hm.", "Nice and easy.", "Almost there."][hits - 1] || "Mm-hm." : "Ripples all the way across."); if (hits >= need) { finished = true; setTimeout(c.done, 900); } }
      else c.say("No hurry. Wait for the next " + (m.what || "drip") + ".");
    };
    b.addEventListener("click", tap);
    c.stage.append(cv, dots, b); c.say("Tap the button (or Space) when a " + (m.what || "drip") + " lands. Close enough is fine.");
    const rings = [];
    return {
      update(dt) {
        t += dt; const ph = (t % every) / every, beat = Math.floor(t / every);
        if (rings.length === 0 || rings[rings.length - 1].b !== beat) rings.push({ b: beat, t: 0 });
        rings.forEach(r => r.t += dt); while (rings.length && rings[0].t > 2.5) rings.shift();
        x.fillStyle = "#3D4B6E"; x.fillRect(0, 0, 320, 150); x.fillStyle = "#7FA7B5"; x.fillRect(0, 100, 320, 50);
        x.strokeStyle = "rgba(251,246,234,0.7)"; x.lineWidth = 2;
        rings.forEach(r => { if (r.b < 1) return; const rr = c.still ? 14 : 6 + r.t * 30; x.globalAlpha = c.still ? (r.t < 0.8 ? 1 : 0) : Math.max(0, 1 - r.t / 2.5); x.beginPath(); x.ellipse(160, 112, rr, rr * 0.3, 0, 0, 7); x.stroke(); });
        x.globalAlpha = 1; x.fillStyle = "#A9C6CF"; const dy = c.still ? 30 : 10 + ph * 95;
        x.beginPath(); x.ellipse(160, dy, 4, 6, 0, 0, 7); x.fill();
        x.fillStyle = "#54664A"; x.fillRect(110, 0, 100, 8);
      },
      key(e, down) { if ((e.key === " " || e.key === "Enter") && down && !e.repeat) { e.preventDefault(); tap(); return true; } },
      info: () => ({ t, every, hits, need })
    };
  };

  /* hum: move your note up or down to meet theirs */
  M.hum = function (c) {
    const need = c.m.rounds || 3; let round = 0, mine = 2, target = 0, finished = false, seed = 7;
    const pick = () => { do { target = Math.floor(rand(round, seed++, 4) * 5); } while (target === mine); };
    pick();
    const box = el("div", "hum"), rows = [];
    for (let i = 4; i >= 0; i--) { const r = el("div", "humrow"); r.dataset.lv = i; rows[i] = r; box.appendChild(r); }
    const dots = el("div", "dots"); for (let i = 0; i < need; i++) dots.appendChild(el("span", "dot"));
    const ctr = el("div", "row"), lo = btn("Lower  \u2193"), hi = btn("Higher  \u2191");
    lo.dataset.test = "lower"; hi.dataset.test = "higher"; ctr.append(lo, hi);
    c.stage.append(box, dots, ctr);
    const draw = () => rows.forEach((r, i) => { r.textContent = (i === target ? c.kin.name + "'s hum  \u25C6" : "") + (i === mine ? (i === target ? "  +  yours \u25CF" : "your hum  \u25CF") : ""); r.classList.toggle("t", i === target); r.classList.toggle("m", i === mine); });
    const move = d => {
      if (finished) return; mine = Math.max(0, Math.min(4, mine + d)); c.hum && c.hum(mine);
      if (mine === target) { round++; dots.children[round - 1].classList.add("on"); c.tone && c.tone(round); draw();
        if (round >= need) { finished = true; c.say("You hum together for a while. It sounds lovely."); setTimeout(c.done, 1100); }
        else { c.say("Mmmm. Together. " + c.kin.name + " tries a new note."); setTimeout(() => { pick(); draw(); }, 800); }
      } else { c.say(mine < target ? "A little higher." : "A little lower."); draw(); }
    };
    lo.onclick = () => move(-1); hi.onclick = () => move(1);
    draw(); c.say(c.kin.name + " hums a note. Move yours up or down to meet it (arrow keys work too).");
    return { update() {}, key(e, down) { if (!down) return; if (e.key === "ArrowUp" || e.key === "w") { move(1); return true; } if (e.key === "ArrowDown" || e.key === "s") { move(-1); return true; } }, info: () => ({ mine, target, round, need }) };
  };

  /* untangle: loosen every knot, any order */
  M.untangle = function (c) {
    const n = c.m.knots || 4; let left = n;
    const box = el("div", "vines");
    box.innerHTML = '<svg viewBox="0 0 320 150" aria-hidden="true"><path d="M10 75 C 60 10, 90 140, 140 70 S 220 10, 250 80 S 300 140, 315 60" fill="none" stroke="#7F9A6E" stroke-width="7" stroke-linecap="round"/><path d="M10 95 C 70 140, 100 20, 160 90 S 240 140, 310 40" fill="none" stroke="#54664A" stroke-width="5" stroke-linecap="round"/></svg>';
    for (let i = 0; i < n; i++) {
      const k = btn("knot", "knot"); k.style.left = (8 + i * (84 / Math.max(1, n - 1))) + "%"; k.style.top = (30 + (i % 2) * 30) + "%";
      k.setAttribute("aria-label", "Loosen knot " + (i + 1)); k.dataset.test = "knot";
      k.onclick = () => { if (k.classList.contains("loose")) return; k.classList.add("loose"); k.textContent = "loose"; left--; c.tone && c.tone(n - left);
        c.say(left ? ["There's one.", "Gently does it.", "Another loop slips free.", "Nearly untangled."][(n - left - 1) % 4] : "All untangled. " + c.kin.name + " stretches out happily.");
        if (!left) setTimeout(c.done, 1000); };
      box.appendChild(k);
    }
    c.stage.appendChild(box); c.say("Tap each knot to loosen it, in any order. (Tab and Enter work too.)");
    return { update() {}, key() {}, info: () => ({ left }) };
  };

  /* sort: put each pebble with its own kind (shape and colour both tell you) */
  const KINDS = [{ k: "round", sym: "\u25CF", col: "#A6B89A", name: "round sage" }, { k: "flat", sym: "\u25AC", col: "#B9A7D6", name: "flat lavender" }, { k: "pointy", sym: "\u25B2", col: "#E8B77A", name: "pointy peach" }];
  M.sort = function (c) {
    const n = c.m.pebbles || 6; let sel = null, left = n;
    const pile = el("div", "pile"), bowls = el("div", "row bowls");
    for (let i = 0; i < n; i++) { const kd = KINDS[i % 3], p = btn(kd.sym, "pebble"); p.style.color = kd.col; p.dataset.kind = kd.k; p.dataset.test = "pebble"; p.setAttribute("aria-label", kd.name + " pebble");
      p.onclick = () => { if (p.disabled) return; [...pile.children].forEach(q => q.classList.remove("sel")); p.classList.add("sel"); sel = p; c.say("A " + kd.name + " pebble. Which bowl?"); }; pile.appendChild(p); }
    [...pile.children].sort((a, b) => rand(a.textContent.length, [...pile.children].indexOf(a), 3) - 0.5).forEach(p => pile.appendChild(p));
    KINDS.forEach(kd => { const b = btn(kd.sym + "  " + kd.name + " bowl", "bowl"); b.style.borderColor = kd.col; b.dataset.kind = kd.k; b.dataset.test = "bowl";
      b.onclick = () => { if (!sel) { c.say("Pick a pebble first, then a bowl."); return; }
        if (sel.dataset.kind !== kd.k) { const right = KINDS.find(q => q.k === sel.dataset.kind); c.say("This one would rather sit with the " + right.name + " ones."); return; }
        sel.disabled = true; sel.classList.remove("sel"); sel.classList.add("placed"); b.textContent += " " + kd.sym; sel = null; left--; c.tone && c.tone(n - left);
        c.say(left ? "Clink. " + left + " to go." : "All sorted. " + c.kin.name + " looks very satisfied."); if (!left) setTimeout(c.done, 1000); };
      bowls.appendChild(b); });
    c.stage.append(pile, bowls); c.say("Tap a pebble, then the bowl for its kind.");
    return { update() {}, key() {}, info: () => ({ left }) };
  };

  /* mirror: copy each slow stretch */
  const POSES = [{ k: "up", label: "Reach up", key: "ArrowUp", sym: "\u2191" }, { k: "left", label: "Lean left", key: "ArrowLeft", sym: "\u2190" }, { k: "right", label: "Lean right", key: "ArrowRight", sym: "\u2192" }, { k: "down", label: "Fold down", key: "ArrowDown", sym: "\u2193" }];
  M.mirror = function (c) {
    const n = c.m.poses || 4; let i = 0, finished = false; const order = [0, 1, 2, 3, 0, 3].slice(0, n);
    const show = el("div", "pose"), pad = el("div", "row pad");
    const cur = () => POSES[order[i]];
    const draw = () => { show.textContent = finished ? "\u2665" : cur().sym; show.dataset.pose = finished ? "" : cur().k; };
    const act = k => { if (finished) return;
      if (k !== cur().k) { c.say("Let's try " + cur().label.toLowerCase() + ", together. Slowly."); return; }
      i++; c.tone && c.tone(i);
      if (i >= n) { finished = true; draw(); c.say("And relax. " + c.kin.name + " gives a happy wiggle."); setTimeout(c.done, 1000); }
      else { c.say("Mmm. Now: " + cur().label.toLowerCase() + "."); draw(); } };
    POSES.forEach(p => { const b = btn(p.sym + " " + p.label); b.dataset.test = "pose-" + p.k; b.onclick = () => act(p.k); pad.appendChild(b); });
    c.stage.append(show, pad); draw(); c.say(c.kin.name + " shows a stretch. Copy it: " + cur().label.toLowerCase() + ".");
    return { update() {}, key(e, down) { if (!down) return; const p = POSES.find(q => q.key === e.key); if (p) { act(p.k); return true; } }, info: () => ({ pose: finished ? null : cur().k }) };
  };

  /* count: light each one as it appears */
  M.count = function (c) {
    const n = c.m.stars || 6, label = c.m.label || "stars"; let shown = 0, lit = 0, t = 0;
    const sky = el("div", "sky" + (label === "dewdrops" ? " day" : ""));
    c.stage.appendChild(sky); c.say("Light each of the " + label + " as it appears. There's no rush.");
    const add = () => { const s = btn(label === "dewdrops" ? "\u25C9" : "\u2726", "star"); s.dataset.test = "star"; s.setAttribute("aria-label", "Light this one");
      s.style.left = (6 + rand(shown, 2, 8) * 82) + "%"; s.style.top = (8 + rand(shown, 5, 9) * 70) + "%";
      s.onclick = () => { if (s.classList.contains("lit")) return; s.classList.add("lit"); lit++; c.tone && c.tone(lit); c.say(lit + (lit === 1 ? " " + label.replace(/s$/, "") : " " + label) + (lit >= n ? ". That's all of them." : "..."));
        if (lit >= n) setTimeout(c.done, 1000); };
      sky.appendChild(s); shown++; };
    add();
    return { update(dt) { t += dt; if (shown < n && t > 1.1) { t = 0; add(); } }, key() {}, info: () => ({ shown, lit, n }) };
  };

  /* warm: hold your hands by the fire. Warmth never fades */
  M.warm = function (c) {
    const need = c.m.sec || 6; let warmth = 0, holding = false, finished = false;
    const fire = el("div", "fire"), bar = el("div", "warmbar"), fill = el("span"); bar.appendChild(fill);
    fire.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><ellipse cx="60" cy="104" rx="40" ry="8" fill="#6E6E62"/><path class="flame" d="M60 20 C 80 50, 95 70, 60 100 C 25 70, 40 50, 60 20Z" fill="#E8B77A"/><path class="flame2" d="M60 50 C 70 66, 76 80, 60 98 C 44 80, 50 66, 60 50Z" fill="#FBE3A0"/></svg>';
    const hb = holdButton("Hold hands near the fire", () => holding = true, () => holding = false); hb.dataset.test = "hold";
    c.stage.append(fire, bar, hb); c.say("Hold the button (or Space). Feel the warmth. Letting go is fine; the warmth stays.");
    return {
      update(dt) { if (finished) return; if (holding) warmth = Math.min(need, warmth + dt); fill.style.width = (100 * warmth / need) + "%";
        fire.classList.toggle("near", holding);
        if (warmth >= need) { finished = true; c.say("Warm all the way to your fingertips."); c.tone && c.tone(3); setTimeout(c.done, 1000); }
        else if (holding) c.say(warmth < need / 2 ? "Mmm. Warmer..." : "Nearly toasty."); },
      key(e, down) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (e.repeat) return; holding = down; hb.classList.toggle("on", down); return true; } },
      info: () => ({ warmth, need })
    };
  };

  /* guide: roll a seed to the water on a little grid */
  M.guide = function (c) {
    const W = 6, H = 5, stones = new Set(["2,0", "2,1", "4,3", "4,4", "1,3"]); let sx = 0, sy = 2, finished = false; const wx = 5, wy = 1;
    const grid = el("div", "ggrid"); grid.style.gridTemplateColumns = "repeat(" + W + ", 1fr)"; const cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const b = btn("", "gcell"); b.dataset.x = x; b.dataset.y = y; b.tabIndex = -1; b.onclick = () => { if (Math.abs(x - sx) + Math.abs(y - sy) === 1) step(x - sx, y - sy); }; cells.push(b); grid.appendChild(b); }
    const pad = el("div", "row pad");
    [["\u2190", -1, 0], ["\u2191", 0, -1], ["\u2193", 0, 1], ["\u2192", 1, 0]].forEach(([s, dx, dy]) => { const b = btn(s); b.setAttribute("aria-label", "Roll " + ({ "-1,0": "left", "0,-1": "up", "0,1": "down", "1,0": "right" })[dx + "," + dy]); b.dataset.test = "roll" + dx + "," + dy; b.onclick = () => step(dx, dy); pad.appendChild(b); });
    const draw = () => cells.forEach(b => { const x = +b.dataset.x, y = +b.dataset.y, k = x + "," + y;
      b.textContent = x === sx && y === sy ? (finished ? "\u2618" : "\u25CF") : x === wx && y === wy ? "\u2248" : stones.has(k) ? "\u25B2" : "";
      b.className = "mbtn gcell" + (stones.has(k) ? " stone" : "") + (x === wx && y === wy ? " water" : "") + (x === sx && y === sy ? " seed" : ""); });
    const step = (dx, dy) => { if (finished) return; const nx = sx + dx, ny = sy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || stones.has(nx + "," + ny)) { c.say("A stone is in the way. Try going around."); return; }
      sx = nx; sy = ny; if (sx === wx && sy === wy) { finished = true; c.say("The seed reaches the water and a tiny green sprout pops up."); c.tone && c.tone(3); setTimeout(c.done, 1100); } else c.say("Roll, roll."); draw(); };
    c.stage.append(grid, pad); draw(); c.say("Roll the seed (\u25CF) to the water (\u2248). Arrow keys, the buttons, or tap the next square.");
    return { update() {}, key(e, down) { if (!down) return; const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[e.key]; if (d) { step(d[0], d[1]); return true; } },
      info: () => ({ sx, sy, wx, wy, W, H, stones: [...stones] }) };
  };
})();
