/* The Seed Path: main game. Plain JS, no build step.
   Data lives in data/maps.js, data/kin.js and data/text.js. */
(function () {
  "use strict";
  const MAPS = SEED.maps, POOL = SEED.kin, TX = SEED.text, P = SEED.palette;
  const KIN = Object.fromEntries(POOL.map(k => [k.id, k]));
  const W = 20, H = 15, T = 16, RES = 3;
  const qs = new URLSearchParams(location.search);
  const SPEED = Math.max(0.25, Math.min(8, +qs.get("speed") || 1));   // testing aid only
  const LS = { save: "seedpath.save.v1", meta: "seedpath.meta.v1", set: "seedpath.settings.v1" };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const $ = id => document.getElementById(id);
  const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] != null ? o[k] : "");
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- settings ---------- */
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const settings = Object.assign({ sound: false, still: reduce }, store.get(LS.set, {}));
  settings.sound = settings.sound && false;   // sound always starts off; it needs a tap to begin anyway
  const saveSettings = () => store.put(LS.set, { still: settings.still });

  /* ---------- meta: lifetime collection and rotation ---------- */
  let meta = Object.assign({ met: [], cycle: [], recent: [], runs: 0, walks: 0 }, store.get(LS.meta, {}));
  const saveMeta = () => store.put(LS.meta, meta);

  function pickTasks(walkKey) {
    const walk = SEED.walks[walkKey];
    const sets = walk.areas, open = sets[(meta.walks || 0) % sets.length].slice();
    if (meta.cycle.length >= POOL.length) meta.cycle = [];        // a fresh cycle once all 30 are done
    // score every (area, Kin) pair: not yet done this cycle is best, recently met is avoided
    const score = k => (meta.cycle.includes(k.id) ? 100 : 0) + (meta.recent.lastIndexOf(k.id) >= 0 ? 20 + meta.recent.lastIndexOf(k.id) : 0) + Math.random() * 0.5;
    const cands = open.map(a => POOL.filter(k => k.areas.includes(a)).map(k => ({ k, s: score(k) })).sort((x, y) => x.s - y.s).slice(0, 9));
    let best = null, bestS = Infinity;
    (function dfs(i, pick, tot, types) {
      if (tot >= bestS) return;
      if (i === open.length) { best = pick.slice(); bestS = tot; return; }
      for (const c of cands[i]) { if (pick.includes(c.k)) continue; const tp = c.k.moment.type, pen = types[tp] ? 6 : 0;
        pick.push(c.k); types[tp] = (types[tp] || 0) + 1; dfs(i + 1, pick, tot + c.s + pen, types); types[tp]--; pick.pop(); }
    })(0, [], 0, {});
    const chosen = {}; open.forEach((a, i) => chosen[a] = best[i].id);
    return { open, slots: chosen };
  }

  /* ---------- riddles & puzzles: tier by friend number, mix kinds, no repeats within a save ---------- */
  const voiceLines = (id, key) => { const own = (SEED.kinLines[id] || {})[key]; return own || SEED.voices[SEED.voiceOf[id] || "quiet"][key]; };
  const pickLine = (id, key) => { const a = voiceLines(id, key); return a[Math.floor(Math.random() * a.length)]; };
  function tierFor(n, need) {   // n = which friend this is (2nd = 2, ...)
    if (need >= 5) return n <= 3 ? "easy" : n === 4 ? "medium" : "harder";
    if (need >= 3) return n <= 2 ? "easy" : "medium";
    return "easy";
  }
  function pickChallenge() {
    meta.chHist = meta.chHist || [];
    const n = run.friends.length + 1, tier = tierFor(n, run.need);
    const inRun = Object.values(run.kin).map(s => s.ch).filter(Boolean);
    const lastKind = run.lastKind || (Math.random() < 0.5 ? "puzzle" : "riddle");
    const want = lastKind === "riddle" ? "puzzle" : "riddle";
    const all = SEED.riddles.concat(SEED.puzzles).filter(c => c.tier === tier && !inRun.includes(c.id));
    let pool = all.filter(c => !meta.chHist.includes(c.id));
    if (!pool.length) { meta.chHist = meta.chHist.filter(h => !all.some(c => c.id === h)); pool = all; }   // every one of this tier seen: start that tier fresh
    const pref = pool.filter(c => SEED.challengeKind(c.id) === want);
    const list = pref.length ? pref : pool, ch = list[Math.floor(Math.random() * list.length)];
    meta.chHist.push(ch.id); run.lastKind = SEED.challengeKind(ch.id); saveMeta();
    return ch.id;
  }

  /* ---------- run state ---------- */
  let run = null, pos = null;
  function newRun(walkKey, force) {
    const walk = SEED.walks[walkKey];
    const p = pickTasks(walkKey);
    if (force) {   // testing: put chosen Kin in chosen areas, and open the paths that lead there
      const need = { hollow: ['meadow'], pond: ['meadow'], grove: ['meadow', 'hollow'], cottages: ['meadow', 'hollow', 'grove'] };
      p.open = [...new Set(Object.keys(force).concat(...Object.keys(force).map(a => need[a] || [])))]; p.slots = Object.assign({}, force);
    }
    meta.walks = (meta.walks || 0) + 1; saveMeta();
    run = { v: 1, walk: walkKey, need: force ? Object.keys(force).length : walk.kin, open: p.open, slots: p.slots, kin: {}, friends: [], visited: {}, playMs: 0, done: false, items: {} };
    Object.entries(p.slots).forEach(([area, id], i) => {
      const map = MAPS[area], k = KIN[id];
      const st = { area, state: "waiting", x: map.slot[0], y: map.slot[1] };
      if (k.moment.type === "fetch") { const h = map.hide[Math.floor(Math.random() * map.hide.length)]; st.item = { x: h[0], y: h[1], got: false }; }
      run.kin[id] = st;
    });
    pos = { area: "nook", x: MAPS.nook.start[0], y: MAPS.nook.start[1], dir: "up" };
    save();
  }
  function save() { if (run && !run.done) store.put(LS.save, { run, pos }); }
  const friendsNeeded = () => run.need;
  const isOpen = a => a === "nook" || a === "hill" || run.open.includes(a);

  /* ---------- map helpers ---------- */
  const EDGE = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
  function tileAt(area, x, y) {
    const m = MAPS[area]; if (x < 0 || y < 0 || x >= W || y >= H) return null;
    let ch = m.rows[y][x];
    if (ch === "g" && run.friends.length >= friendsNeeded()) ch = "=";
    if (m.exits) for (const [e, to] of Object.entries(m.exits)) {
      const onEdge = (e === "N" && y === 0) || (e === "S" && y === H - 1) || (e === "W" && x === 0) || (e === "E" && x === W - 1);
      if (onEdge && !SEED.isSolidTile(ch) && !isOpen(to)) return "z";
    }
    return ch;
  }
  const objectsAt = (area, x, y) => (MAPS[area].objects || []).filter(o => o.x === x && o.y === y);
  function kinAt(area, x, y) {
    for (const [id, s] of Object.entries(run.kin)) if (s.area === area && s.state !== "friend" && s.x === x && s.y === y) return id;
    return null;
  }
  function solid(area, x, y) {
    const ch = tileAt(area, x, y); if (ch == null) return false;
    if (SEED.isSolidTile(ch)) return true;
    if (objectsAt(area, x, y).some(o => o.kind !== "look")) return true;
    const k = kinAt(area, x, y); if (k && run.kin[k].state !== "leading") return true;
    return false;
  }
  function bfs(area, sx, sy, goal, allowSolidGoal) {
    const key = (x, y) => y * W + x, prev = new Map([[key(sx, sy), null]]), q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift();
      if (goal(x, y)) { const out = []; let k = key(x, y); while (k != null && k !== key(sx, sy)) { out.unshift([k % W, Math.floor(k / W)]); k = prev.get(k); } return out; }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(key(nx, ny))) continue;
        if (solid(area, nx, ny) && !(allowSolidGoal && goal(nx, ny))) continue;
        prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
      }
    }
    return null;
  }
  function leadPath(area, from, to, preferLit) {   // cheapest path, lantern path costs less
    const cost = new Map(), prev = new Map(), key = (x, y) => y * W + x, open = [[0, from[0], from[1]]];
    cost.set(key(from[0], from[1]), 0);
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]); const [c, x, y] = open.shift();
      if (x === to[0] && y === to[1]) break;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy; if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const ch = tileAt(area, nx, ny); if (SEED.isSolidTile(ch) || objectsAt(area, nx, ny).some(o => o.kind !== "look")) continue;
        const nc = c + (preferLit ? (ch === "L" ? 1 : 4) : (ch === "=" ? 1 : 1.3));
        if (!cost.has(key(nx, ny)) || nc < cost.get(key(nx, ny))) { cost.set(key(nx, ny), nc); prev.set(key(nx, ny), key(x, y)); open.push([nc, nx, ny]); }
      }
    }
    const out = []; let k = key(to[0], to[1]); if (!prev.has(k)) return [to];
    while (k !== key(from[0], from[1])) { out.unshift([k % W, Math.floor(k / W)]); k = prev.get(k); }
    return out;
  }

  /* ---------- sound (WebAudio, generated, off by default) ---------- */
  const Sound = {
    ctx: null, master: null, noiseGain: null, filt: null, nextChord: 0, chord: 0, nextBird: 0,
    ensure() {
      if (this.ctx) return true; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      const c = this.ctx = new AC(); this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true; this.filt = c.createBiquadFilter(); this.filt.type = "lowpass"; this.filt.frequency.value = 300;
      this.noiseGain = c.createGain(); this.noiseGain.gain.value = 0.012; src.connect(this.filt); this.filt.connect(this.noiseGain); this.noiseGain.connect(this.master); src.start();
      return true;
    },
    set(on) {
      settings.sound = on; if (!this.ensure()) return; const c = this.ctx; if (c.state === "suspended") c.resume();
      this.master.gain.cancelScheduledValues(c.currentTime); this.master.gain.setTargetAtTime(on ? 0.9 : 0, c.currentTime, 0.5);
    },
    note(f, start, dur, g, type) {
      const c = this.ctx, o = c.createOscillator(), a = c.createGain(); o.type = type || "sine"; o.frequency.value = f;
      a.gain.setValueAtTime(0, start); a.gain.linearRampToValueAtTime(g, start + Math.min(1.5, dur * 0.4)); a.gain.linearRampToValueAtTime(0, start + dur);
      o.connect(a); a.connect(this.master); o.start(start); o.stop(start + dur + 0.1);
    },
    tick(area) {
      if (!settings.sound || !this.ctx) return; const c = this.ctx, now = c.currentTime;
      const water = area === "pond", dusk = area === "grove";
      this.filt.frequency.setTargetAtTime(water ? 700 : 280, now, 1.5); this.noiseGain.gain.setTargetAtTime(water ? 0.02 : 0.01, now, 1.5);
      if (now >= this.nextChord) {    // 64 BPM, a soft pad every bar
        const chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]];
        chords[this.chord++ % 4].forEach((f, i) => this.note(dusk ? f * 0.89 : f, now + i * 0.08, 4.4, 0.025));
        this.nextChord = now + 3.75;
      }
      if (!dusk && !water && now >= this.nextBird) { const f = 1800 + Math.random() * 700; this.note(f, now, 0.25, 0.006); this.note(f * 1.2, now + 0.18, 0.25, 0.005); this.nextBird = now + 9 + Math.random() * 10; }
    },
    chime() { if (!settings.sound || !this.ctx) return; const n = this.ctx.currentTime; [659.3, 830.6, 987.8].forEach((f, i) => this.note(f, n + i * 0.22, 1.8, 0.05)); },
    tone(i) { if (!settings.sound || !this.ctx) return; const s = [392, 440, 523.3, 587.3, 659.3, 784]; this.note(s[(i - 1) % 6], this.ctx.currentTime, 1.2, 0.04); },
    hum(lv) { if (!settings.sound || !this.ctx) return; this.note(196 * Math.pow(2, [0, 2, 4, 7, 9][lv] / 12), this.ctx.currentTime, 0.9, 0.04, "triangle"); }
  };

  /* ---------- canvas ---------- */
  const cv = $("world"), ctx = cv.getContext("2d");
  cv.width = W * T * RES; cv.height = H * T * RES;

  /* ---------- game loop state ---------- */
  let mode = "title";             // title | play | dialog | moment | panel | ending | rest
  let mover = null, trail = [], pathQ = [], pendingAct = null, held = [], lastInput = 0, lastMove = 0, clock = 0;
  const banter = { next: 0, cur: null, said: [] };
  let lastProgress = 0, hintShown = false, fade = 0, fadeDir = 0, fadeCb = null, bubble = null, ending = null;
  const now = () => clock;

  /* ---------- dialog ---------- */
  let dq = [], dcb = null;
  function say(lines, cb) {
    dq = lines.map(l => typeof l === "string" ? { who: "", text: l } : l); dcb = cb || null;
    if (mode === "play") mode = "dialog"; showLine();
  }
  function showLine() {
    const box = $("dialog");
    if (!dq.length) { box.hidden = true; if (mode === "dialog") mode = "play"; lastInput = now(); const c = dcb; dcb = null; if (c) c(); return; }
    const l = dq.shift(); box.hidden = false; $("dwho").textContent = l.who || ""; $("dwho").hidden = !l.who; $("dtext").textContent = l.text;
    $("dnext").textContent = dq.length ? "Continue \u25B8" : "Okay";
    $("dnext").focus({ preventScroll: true });
  }
  $("dialog").addEventListener("click", e => { e.stopPropagation(); showLine(); });

  function toast(text) {
    const t = $("toast"); t.textContent = ""; t.append(Object.assign(document.createElement("span"), { className: "cloudicon", ariaHidden: "true" }), document.createTextNode(text));
    t.hidden = false; t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 9000);
  }

  /* ---------- hints ---------- */
  function hintText() {
    if (!run) return "";
    if (run.friends.length >= friendsNeeded()) return pos.area === "hill" ? TX.hints.hillHere : TX.hints.hill;
    const waiting = Object.entries(run.kin).filter(([, s]) => s.state !== "friend");
    const here = waiting.find(([, s]) => s.area === pos.area) || waiting[0];
    const [id, s] = here, k = KIN[id], m = MAPS[s.area];
    const o = { name: k.name, area: m.name, where: m.where, item: k.moment.item ? cap(k.moment.item) : "" };
    if (s.area !== pos.area) return fill(TX.hints.find, o) + (pos.area === "nook" ? " The path north leads to the meadow." : "");
    return fill(run.friends.length ? TX.hints.puzzle : TX.hints.first, o);
  }
  function giveHint() { toast(hintText()); hintShown = true; }
  function progress() { lastProgress = now(); hintShown = false; }

  /* ---------- befriending ---------- */
  function befriend(id) {
    const s = run.kin[id], k = KIN[id]; if (s.state === "friend") return;
    s.state = "friend"; run.friends.push(id);
    if (!meta.met.includes(id)) meta.met.push(id);
    if (!meta.cycle.includes(id)) meta.cycle.push(id);
    meta.recent = meta.recent.filter(r => r !== id).concat(id).slice(-12);
    saveMeta(); save(); progress(); Sound.chime();
    s.joy = 1.6;
    const first = run.friends.length === 1;
    const lines = [];
    if (!first) lines.push({ who: k.name, text: pickLine(id, "join") });
    lines.push({ who: "", text: fill(TX.befriended, { name: k.name }) });
    if (first && run.need > 1) lines.push(TX.firstFriend);
    lines.push({ who: "", text: TX.journalNew });
    banter.next = clock + (first ? 22 : 30) / 1;
    if (run.friends.length >= friendsNeeded()) lines.push(TX.allFound);
    say(lines); updateHud();
  }

  /* ---------- moments (overlay) ---------- */
  let moment = null;
  function openMoment(id) {
    const k = KIN[id], m = k.moment, ov = $("moment"), stage = $("mstage");
    stage.textContent = ""; $("mname").textContent = k.name; $("mkind").textContent = cap(k.kind);
    const pc = $("mpic"); pc.textContent = ""; pc.appendChild(SEED.kinPortrait(k, false, 96));
    ov.hidden = false; mode = "moment"; progress();
    let finished = false;
    const c = { kin: k, m, stage, still: settings.still, say: t => { $("mprompt").textContent = t; },
      tone: i => Sound.tone(i), hum: lv => Sound.hum(lv),
      done: () => { if (finished) return; finished = true; closeMoment(); befriend(id); } };
    moment = { id, h: SEED.challenge(c, run.kin[id].ch) };
    setTimeout(() => { const b = stage.querySelector("button"); if (b) b.focus({ preventScroll: true }); }, 50);
  }
  function closeMoment(away) {
    const id = moment && moment.id; $("moment").hidden = true; moment = null; mode = "play"; lastInput = now();
    if (away && id) say([fill(TX.stepAway, { name: KIN[id].name })]);
  }
  $("mclose").addEventListener("click", () => closeMoment(true));

  /* ---------- interaction ---------- */
  function facing() { const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[pos.dir]; return [pos.x + d[0], pos.y + d[1]]; }
  function interactAt(x, y) {
    const a = pos.area, kid = kinAt(a, x, y);
    if (kid) return talkKin(kid);
    const obj = objectsAt(a, x, y)[0];
    if (obj) return useObject(obj);
    const ch = tileAt(a, x, y);
    if (ch === "g") return say([fill(TX.hedgeSleeping, { n: TX.numbers[friendsNeeded()], have: run.friends.length })]);
    if (ch === "z") return say([TX.restingPath]);
    return false;
  }
  function talkKin(id) {
    const k = KIN[id], s = run.kin[id]; progress();
    if (s.state === "friend") return;
    // the first friend: no puzzle, it just asks to come along (it's lonely to travel alone)
    if (!run.friends.length) { s.first = 1; return say([{ who: k.name, text: pickLine(id, "first") }], () => befriend(id)); }
    if (!s.ch) { s.ch = pickChallenge(); save(); }
    return say([{ who: k.name, text: s.asked ? TX.askAgain : pickLine(id, "ask") }], () => { s.asked = 1; save(); openMoment(id); });
  }
  function talkKinV1(id) {
    const k = KIN[id], s = run.kin[id], t = k.moment.type; progress();
    if (t === "fetch") {
      if (s.item.got) { return say([{ who: "", text: fill(TX.fetchGive, { name: k.name, item: k.moment.item }) }], () => befriend(id)); }
      s.state = "asked"; save(); return say(k.intro.map(x => ({ who: k.name, text: x })));
    }
    if (t === "still") { s.state = "asked"; s.stillT = 0; return say(k.intro.map(x => ({ who: k.name, text: x }))); }
    if (t === "follow") {
      if (s.state === "leading") return say([{ who: k.name, text: TX.followWait }]);
      return say(k.intro.map(x => ({ who: k.name, text: x })), () => { s.state = "leading"; s.path = leadPath(s.area, [s.x, s.y], MAPS[s.area].followTo, MAPS[s.area].preferLit); s.pi = 0; s.tick = 0; save(); });
    }
    say(k.intro.map(x => ({ who: k.name, text: x })), () => openMoment(id));
  }
  function useObject(o) {
    if (o.kind === "seed") {
      if (run.friends.length < friendsNeeded()) return say([TX.seedNotYet]);
      return startEnding();
    }
    if (o.kind === "bench") return say(o.lines.concat(TX.restBench));
    return say(o.lines.slice());
  }

  /* ---------- movement ---------- */
  const STEP = 0.22;
  function tryStep(dir) {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir]; pos.dir = dir;
    const nx = pos.x + d[0], ny = pos.y + d[1];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
      const e = ny < 0 ? "N" : ny >= H ? "S" : nx < 0 ? "W" : "E", to = MAPS[pos.area].exits && MAPS[pos.area].exits[e];
      if (to && isOpen(to)) changeArea(to, e); return false;
    }
    if (solid(pos.area, nx, ny)) { mover = { bump: 0, dx: d[0], dy: d[1] }; return false; }
    mover = { fx: pos.x, fy: pos.y, t: 0 };
    trail.unshift({ x: pos.x, y: pos.y }); trail.length = Math.min(trail.length, 8);
    pos.x = nx; pos.y = ny; lastMove = now(); lastInput = now();
    return true;
  }
  function changeArea(to, edge) {
    const nx = edge === "W" ? W - 1 : edge === "E" ? 0 : pos.x, ny = edge === "N" ? H - 1 : edge === "S" ? 0 : pos.y;
    pathQ = []; pendingAct = null;
    fadeDir = 1; fadeCb = () => {
      pos.area = to; pos.x = nx; pos.y = ny; trail = []; mover = null; bubble = null;
      if (!run.visited[to]) { run.visited[to] = 1; progress(); }
      save(); updateHud(); fadeDir = -1;
    };
  }
  function onArrive() {
    // pick up a lost thing
    for (const [id, s] of Object.entries(run.kin)) if (s.item && s.area === pos.area && !s.item.got && s.state === "asked" && s.item.x === pos.x && s.item.y === pos.y) {
      s.item.got = true; save(); progress(); Sound.tone(3);
      say([{ who: "", text: KIN[id].moment.itemLine }, { who: "", text: fill(TX.fetchFound, { item: KIN[id].moment.item }) + " " + KIN[id].name + " will be glad." }]);
    }
  }
  function walkTo(tx, ty) {   // tap-to-walk; tapping something interactive walks next to it then uses it
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
    const interactive = kinAt(pos.area, tx, ty) || objectsAt(pos.area, tx, ty).length || ["g", "z"].includes(tileAt(pos.area, tx, ty));
    if (interactive && solid(pos.area, tx, ty) || interactive && objectsAt(pos.area, tx, ty).some(o => o.kind === "look")) {
      if (Math.abs(tx - pos.x) + Math.abs(ty - pos.y) === 1) { face(tx, ty); interactAt(tx, ty); return; }
      const p = bfs(pos.area, pos.x, pos.y, (x, y) => Math.abs(x - tx) + Math.abs(y - ty) === 1 && !solid(pos.area, x, y));
      if (p) { pathQ = p; pendingAct = [tx, ty]; }
      return;
    }
    if (solid(pos.area, tx, ty)) return;
    const p = bfs(pos.area, pos.x, pos.y, (x, y) => x === tx && y === ty); if (p) { pathQ = p; pendingAct = null; }
    // walking onto an edge opening keeps going into the next area
    const m = MAPS[pos.area]; if (p && m.exits) pendingAct = null;
  }
  function face(tx, ty) { pos.dir = tx > pos.x ? "right" : tx < pos.x ? "left" : ty > pos.y ? "down" : "up"; }

  /* ---------- world update ---------- */
  function update(dt) {
    clock += dt;
    if (fadeDir) { fade += dt / (settings.still ? 0.3 : 0.25) * fadeDir; if (fade >= 1 && fadeDir > 0) { fade = 1; const c = fadeCb; fadeCb = null; c && c(); } if (fade <= 0 && fadeDir < 0) { fade = 0; fadeDir = 0; } }
    if (mode === "ending" || mode === "rest") { ending.t += dt; return; }
    if (!run) return;
    if (mode === "moment" && moment) moment.h.update(dt);
    if (["play", "dialog", "moment", "panel"].includes(mode) && !document.hidden) run.playMs += dt * 1000;   // game time (equals real time at normal speed)
    // player movement
    if (mover) {
      if (mover.bump != null) { mover.bump += dt; if (mover.bump > 0.15) mover = null; }
      else { mover.t += dt / STEP; if (mover.t >= 1) { mover = null; onArrive(); } }
    }
    if (!mover && mode === "play" && !fadeDir) {
      if (held.length) { pathQ = []; tryStep(held[held.length - 1]); }
      else if (pathQ.length) {
        const [nx, ny] = pathQ[0]; face(nx, ny);
        if (solid(pos.area, nx, ny)) { pathQ = []; } else { pathQ.shift(); tryStep(pos.dir); if (!pathQ.length && !pendingAct) { /* arrived */ } }
        if (!pathQ.length && pendingAct && !mover) { }
      } else if (pendingAct) { const [ax, ay] = pendingAct; pendingAct = null; face(ax, ay); interactAt(ax, ay); }
      else {
        // continue off the edge when the tap was on an open edge tile
        const m = MAPS[pos.area];
        if (walkTo.edgeDir && m.exits) { const d = walkTo.edgeDir; walkTo.edgeDir = null; tryStep(d); }
      }
    }
    // kin behaviour
    bubble = null;
    for (const [id, s] of Object.entries(run.kin)) {
      if (s.joy) s.joy = Math.max(0, s.joy - dt);
      if (s.area !== pos.area || s.state === "friend") continue;
      const k = KIN[id], t = "talk", d = Math.max(Math.abs(s.x - pos.x), Math.abs(s.y - pos.y));
      if (t === "still" && mode === "play") {
        if (d <= 2 && !mover && !pathQ.length && !held.length) {
          s.stillT = (s.stillT || 0) + dt;
          const f = s.stillT / k.moment.sec;
          if (f > 0.2) bubble = { x: s.x, y: s.y, text: TX.stillPeek[Math.min(2, Math.floor((f - 0.2) / 0.27))] };
          if (s.stillT >= k.moment.sec) { s.stillT = 0; befriend(id); }
        } else s.stillT = 0;
      }
      if (t === "follow" && s.state === "leading" && mode === "play") {
        s.tick = (s.tick || 0) + dt;
        const recent = now() - lastMove < 0.7;
        if (d <= 1 && recent) { bubble = { x: s.x, y: s.y, text: TX.followWait }; s.tick = Math.min(s.tick, 0.2); }
        else if (s.tick >= 0.62 && d <= 4) {
          s.tick = 0; const nxt = s.path[s.pi];
          if (nxt && !(nxt[0] === pos.x && nxt[1] === pos.y)) { s.px = s.x; s.py = s.y; s.mt = 0; s.x = nxt[0]; s.y = nxt[1]; s.pi++; }
          if (s.pi >= s.path.length) { befriend(id); }
        } else if (d > 4) bubble = { x: s.x, y: s.y, text: "this way..." };
      }
      if (s.mt != null) { s.mt += dt / 0.5; if (s.mt >= 1) s.mt = null; }
    }
    // light banter from friends as you walk
    if (mode === "play" && run.friends.length && !ending) {
      if (!banter.next) banter.next = clock + 30;
      if (clock >= banter.next && now() - lastMove < 4 && !bubble) {
        const ids = run.friends.filter(f => trail[run.friends.indexOf(f)]), fid = ids[Math.floor(Math.random() * ids.length)];
        if (fid) { let line, tries = 0; do { line = pickLine(fid, "walk"); } while (banter.said.includes(line) && ++tries < 8);
          banter.said = banter.said.concat(line).slice(-10); banter.cur = { id: fid, text: line, until: clock + 6.5 }; }
        banter.next = clock + 38 + Math.random() * 22;
      }
      const b = banter.cur; if (b && clock < b.until && !bubble) { const i = run.friends.indexOf(b.id), cell = trail[i]; if (cell) bubble = { x: cell.x, y: cell.y, text: KIN[b.id].name + ": " + b.text, talk: true }; }
    }
    // gentle idle hint
    if (mode === "play" && !hintShown && now() - lastProgress > 60) giveHint();
    Sound.tick(pos.area);
    if (Math.floor(clock / 5) !== Math.floor((clock - dt) / 5)) save();
  }

  /* ---------- drawing ---------- */
  const ease = t => 1 - (1 - t) * (1 - t);
  function playerXY() {
    if (mover && mover.fx != null) { const e = settings.still ? mover.t : ease(mover.t); return [mover.fx + (pos.x - mover.fx) * e, mover.fy + (pos.y - mover.fy) * e]; }
    if (mover && mover.bump != null && !settings.still) { const b = Math.sin(mover.bump / 0.15 * Math.PI) * 0.08; return [pos.x + mover.dx * b, pos.y + mover.dy * b]; }
    return [pos.x, pos.y];
  }
  function drawKin(x, k, px, py, t, opts) {
    opts = opts || {};
    const per = 4 + SEED.hash(k.id.length, k.id.charCodeAt(0), 2) * 3;
    const bob = settings.still ? 0 : Math.round(Math.sin(t * Math.PI * 2 / per + k.id.length) * 1) + (opts.joy ? -Math.abs(Math.sin(t * 9)) * 3 : 0);
    const X = px * T, Y = py * T;
    const glow = (k.look.parts || []).includes("glow") || opts.glow;
    if (glow) { const g = x.createRadialGradient(X + 8, Y + 8, 1, X + 8, Y + 8, 16); g.addColorStop(0, "rgba(251,227,160,0.55)"); g.addColorStop(1, "rgba(251,227,160,0)"); x.fillStyle = g; x.fillRect(X - 10, Y - 10, 36, 36); }
    x.fillStyle = "rgba(61,75,110,0.22)"; x.beginPath(); x.ellipse(X + 8, Y + 14.5, 5, 1.6, 0, 0, 7); x.fill();
    if (opts.alpha != null) x.globalAlpha = opts.alpha;
    x.drawImage(SEED.kinSprite(k, false), X, Y + bob);
    x.globalAlpha = 1;
  }
  function drawArea(x, area, t) {
    const m = MAPS[area];
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) SEED.drawTile(x, tileAt(area, i, y), i, y, t, area, settings.still);
    // hill: a sprout or the tree
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) { const ch = tileAt(area, i, y); if (ch && "#Trhofgzlb".includes(ch)) SEED.drawTall(x, ch, i, y, t, settings.still); }
    (m.objects || []).forEach(o => { if (o.kind !== "look") SEED.drawObject(x, o, t, settings.still); });
    if (area === "nook") SEED.drawCloud(x, 13.5 * T, 9.2 * T + (settings.still ? 0 : Math.sin(t * 1.1) * 2), 1, t);
    if (area === "meadow") {   // Seed Hill is always visible up top
      x.fillStyle = "rgba(232,183,122,0.35)"; x.beginPath(); x.ellipse(160, 4, 70, 10, 0, 0, Math.PI); x.fill();
      x.fillStyle = P.forest; x.fillRect(159, 2, 2, 6); x.fillStyle = P.sage; x.fillRect(156, 2, 3, 2); x.fillRect(161, 1, 3, 2);
    }
  }
  function draw() {
    const x = ctx; x.setTransform(RES, 0, 0, RES, 0, 0); x.imageSmoothingEnabled = false;
    const t = clock;
    if (!run || mode === "title") { drawTitleBg(x, t); return; }
    const area = pos.area, m = MAPS[area];
    drawArea(x, area, t);
    if (area === "hill" && ending) drawTree(x, t);
    // lost things
    for (const [id, s] of Object.entries(run.kin)) if (s.item && s.area === area && !s.item.got && s.state === "asked") SEED.drawGlint(x, s.item.x, s.item.y, t, run.friends.length > 0, settings.still);
    // waiting kin
    const sprites = [];
    for (const [id, s] of Object.entries(run.kin)) {
      if (s.area !== area || s.state === "friend") continue;
      let kx = s.x, ky = s.y; if (s.mt != null) { kx = s.px + (s.x - s.px) * ease(s.mt); ky = s.py + (s.y - s.py) * ease(s.mt); }
      sprites.push({ y: ky, f: () => drawKin(x, KIN[id], kx, ky, t, { glow: KIN[id].moment.type === "follow" }) });
    }
    // you and your friends
    const [px, py] = playerXY();
    if (!ending) run.friends.forEach((id, i) => {
      const cell = trail[i] || { x: pos.x, y: pos.y }, prev = trail[i + 1] || cell;
      let fx = cell.x, fy = cell.y;
      if (mover && mover.fx != null) { const e = ease(mover.t); fx = prev.x + (cell.x - prev.x) * e; fy = prev.y + (cell.y - prev.y) * e; }
      if (!trail[i]) return;   // they arrive as you walk
      sprites.push({ y: fy - 0.01, f: () => { x.save(); x.translate(fx * T + 8, fy * T + 8); x.scale(0.8, 0.8); x.translate(-fx * T - 8, -fy * T - 8); drawKin(x, KIN[id], fx, fy, t + i, { joy: run.kin[id].joy > 0 }); x.restore(); } });
    });
    if (!ending || ending.t < 9999) sprites.push({ y: py, f: () => {
      const walking = mover && mover.fx != null, fr = walking && !settings.still ? 1 + (Math.floor(mover.t * 2 + pos.x + pos.y) % 2) : 0;
      const img = (pos.dir === "up" ? SEED.you.back : SEED.you.front)[fr];
      x.fillStyle = "rgba(61,75,110,0.25)"; x.beginPath(); x.ellipse(px * T + 8, py * T + 15, 5, 1.6, 0, 0, 7); x.fill();
      if (pos.dir === "left") { x.save(); x.translate(px * T + 16, py * T); x.scale(-1, 1); x.drawImage(img, 0, 0); x.restore(); } else x.drawImage(img, px * T, py * T);
    } });
    if (ending) endingSprites(x, t, sprites);
    sprites.sort((a, b) => a.y - b.y).forEach(s => s.f());
    // dusk in the grove
    if (m.tint === "dusk") {
      x.fillStyle = "rgba(61,75,110,0.42)"; x.fillRect(0, 0, 320, 240);
      for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) if (tileAt(area, i, y) === "l") { const g = x.createRadialGradient(i * T + 8, y * T + 5, 2, i * T + 8, y * T + 5, 34); g.addColorStop(0, "rgba(251,227,160,0.45)"); g.addColorStop(1, "rgba(251,227,160,0)"); x.fillStyle = g; x.fillRect(i * T - 30, y * T - 30, 76, 76); }
      run.friends.concat(Object.keys(run.kin)).forEach(() => { });
      const g = x.createRadialGradient(px * T + 8, py * T + 8, 2, px * T + 8, py * T + 8, 30); g.addColorStop(0, "rgba(241,237,226,0.18)"); g.addColorStop(1, "rgba(241,237,226,0)"); x.fillStyle = g; x.fillRect(px * T - 30, py * T - 30, 76, 76);
    }
    if (ending) { const w = Math.min(1, Math.max(0, (ending.t - 2) / 6)); x.fillStyle = "rgba(232,183,122," + (0.16 * w) + ")"; x.fillRect(0, 0, 320, 240); if (mode === "rest" && !settings.still) drawPetals(x, t); }
    if (fade > 0) { x.fillStyle = "rgba(241,237,226," + fade + ")"; x.fillRect(0, 0, 320, 240); }
    placeBubble();
  }
  function placeBubble() {
    const b = $("bubble");
    if (!bubble || mode !== "play") { b.hidden = true; return; }
    b.hidden = false; b.textContent = bubble.text; b.classList.toggle("talk", !!bubble.talk);
    b.style.left = (bubble.talk ? Math.max(22, Math.min(78, (bubble.x + 0.5) / W * 100)) : (bubble.x + 0.5) / W * 100) + "%"; b.style.top = (bubble.y / H * 100) + "%";
  }
  function drawTitleBg(x, t) {
    x.fillStyle = "#AFC29E"; x.fillRect(0, 0, 320, 240);
    for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) SEED.drawTile(x, (SEED.hash(i, y, 77) > 0.85 ? "," : "."), i, y, t, "meadow", true);
    x.fillStyle = "rgba(241,237,226,0.25)"; x.fillRect(0, 0, 320, 240);
    SEED.drawCloud(x, 160, 28 + (settings.still ? 0 : Math.sin(t) * 2), 1.6, t);
    ["hush", "pebblekin", "ripple", "glimmer", "sockling"].forEach((id, i) => { const k = KIN[id]; const bx = 2 + i * 3.6, by = 12.2; drawKin(x, k, bx, by, t + i, {}); });
  }

  /* ---------- ending ---------- */
  function startEnding() {
    mode = "dialog"; pathQ = []; banter.cur = null;
    say(groupBanter().concat(TX.ending), () => {
      ending = { t: 0, stage: "grow" }; mode = "ending"; Sound.chime(); hud(false);
      run.done = true; meta.runs++; saveMeta(); store.del(LS.save);
      setTimeout(showCard, (settings.still ? 3000 : 7500) / SPEED);
    });
  }
  function groupBanter() {   // a few words together near Seed Hill, before planting
    const fr = run.friends, firstId = fr.find(f => run.kin[f].first) || fr[0], out = [];
    if (fr.length >= 2) {
      const st = fr.find(f => SEED.voiceOf[f] === "steady" && f !== firstId), a = st || fr.find(f => f !== firstId);
      out.push({ who: KIN[a].name, text: SEED.groupBanter[0].text });
      const p = fr.find(f => SEED.voiceOf[f] === "playful" && f !== a);
      if (st && p) out.push({ who: KIN[p].name, text: SEED.groupBanter[1].text });
      else { const o = fr.find(f => f !== a && f !== firstId); if (o) out.push({ who: KIN[o].name, text: TX.nearlyThere }); }
    }
    out.push({ who: KIN[firstId].name, text: SEED.groupBanter[2].text });
    return out;
  }
  function treeG() { return ending ? Math.min(1, Math.max(0, (ending.t - 1.5) / 6)) : 0; }
  function drawTree(x, t) {
    const g = settings.still ? (ending.t > 1.5 ? 1 : 0) : treeG(), X = 9 * T + 8, Y = 3 * T + 10;
    if (g <= 0) { x.fillStyle = P.forest; x.fillRect(X - 1, Y - 4, 2, 4); return; }
    x.globalAlpha = settings.still ? Math.min(1, (ending.t - 1.5) / 0.6) : 1;
    const h = 8 + 34 * g;
    x.fillStyle = "#7A5E44"; x.fillRect(X - 2, Y - h, 4, h); x.fillRect(X - 2 - 6 * g, Y - h * 0.6, 6 * g, 2); x.fillRect(X + 2, Y - h * 0.75, 7 * g, 2);
    const cr = 6 + 22 * g; [[0, -h, 1], [-cr * 0.6, -h + 6, 0.75], [cr * 0.6, -h + 6, 0.75], [0, -h + 10, 0.8]].forEach(([a, b, s], i) => { x.fillStyle = i % 2 ? "#6B805E" : P.forest; x.beginPath(); x.arc(X + a, Y + b, cr * s, 0, 7); x.fill(); });
    if (g > 0.55) { const n = Math.floor((g - 0.55) / 0.45 * 26); for (let i = 0; i < n; i++) { const a = SEED.hash(i, 1, 9) * 6.28, r = SEED.hash(i, 2, 9) * cr; x.fillStyle = i % 3 ? P.peach : i % 2 ? P.lav : P.cream; x.fillRect(X + Math.cos(a) * r, Y - h + 3 + Math.sin(a) * r * 0.8, 2, 2); } }
    x.globalAlpha = 1;
  }
  function endingSprites(x, t, sprites) {
    const n = run.friends.length, cx = 9, cy = 4.2;
    const gone = ending.leave ? Math.min(1, (ending.t - ending.leave) / 2.5) : 0;
    run.friends.forEach((id, i) => {
      const a = -0.35 + (Math.PI + 0.7) * (n === 1 ? 0.5 : i / (n - 1)), r = 2.3 + gone * 7;
      const fx = cx + Math.cos(a) * r * 1.25, fy = cy + Math.sin(a) * r * 0.75;
      const wave = ending.leave && !settings.still;
      sprites.push({ y: fy, f: () => drawKin(x, KIN[id], fx, fy, t + i, { joy: wave || (ending.t > 7 && !settings.still && ending.t < 8.5), alpha: 1 - gone }) });
    });
  }
  function drawPetals(x, t) { for (let i = 0; i < 18; i++) { const s = SEED.hash(i, 3, 4), px = (s * 320 + Math.sin(t * 0.4 + i) * 20) % 320, py = ((t * (6 + s * 6) + i * 37) % 260) - 10; x.fillStyle = i % 2 ? "rgba(232,183,122,0.8)" : "rgba(185,167,214,0.8)"; x.fillRect(px, py, 2, 2); } }
  function showCard() { $("card").hidden = false; $("cardtext").textContent = TX.card; $("cardgo").focus({ preventScroll: true }); }
  $("cardgo").addEventListener("click", () => {
    $("card").hidden = true; ending.leave = ending.t;
    $("dialog").hidden = false; $("dwho").hidden = true; $("dtext").textContent = TX.farewell; $("dnext").textContent = "Okay";
    dq = []; dcb = () => showChoices(); mode = "ending"; $("dnext").focus({ preventScroll: true });
  });
  $("dialog").addEventListener("click", () => { if (mode === "ending" && dcb && !dq.length) { $("dialog").hidden = true; const c = dcb; dcb = null; c(); } });
  function showChoices() { $("choices").hidden = false; $("choices").querySelector(".col a,.col button").focus({ preventScroll: true }); }
  $("restbtn").addEventListener("click", () => { $("choices").hidden = true; mode = "rest"; $("restbar").hidden = false; $("restbar").querySelector("button").focus(); });
  $("restdone").addEventListener("click", () => { $("restbar").hidden = true; mode = "ending"; showChoices(); });
  $("againbtn").addEventListener("click", () => { $("choices").hidden = true; ending = null; showTitle(); });

  /* ---------- HUD and panels ---------- */
  function hud(on) { $("hud").hidden = !on; }
  function updateHud() {
    if (!run) return;
    $("areaname").textContent = MAPS[pos.area].name;
    const f = $("friends"); f.textContent = "";
    for (let i = 0; i < friendsNeeded(); i++) { const id = run.friends[i], sp = document.createElement("span"); sp.className = "fslot";
      if (id) { sp.appendChild(SEED.kinPortrait(KIN[id], false, 32)); sp.title = KIN[id].name; } else sp.title = "a friend still to meet"; f.appendChild(sp); }
    f.setAttribute("aria-label", run.friends.length + " of " + friendsNeeded() + " friends with you");
  }
  function openPanel(id) { closePanels(); $(id).hidden = false; mode = "panel"; const b = $(id).querySelector("button"); b && b.focus({ preventScroll: true }); }
  function closePanels() { ["journal", "menu"].forEach(p => $(p).hidden = true); if (mode === "panel") mode = "play"; }
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closePanels));
  function renderJournal(tab) {
    const body = $("jbody"); body.textContent = ""; tab = tab || "walk";
    document.querySelectorAll(".jtab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
    if (tab === "walk") {
      Object.entries(run.kin).forEach(([id, s]) => {
        const k = KIN[id], met = s.state === "friend", card = document.createElement("div"); card.className = "jpage" + (met ? "" : " sil");
        card.appendChild(SEED.kinPortrait(k, !met, 80));
        const tx = document.createElement("div");
        tx.innerHTML = "<h3></h3><p class='kind'></p><p class='line'></p>";
        tx.querySelector("h3").textContent = met ? k.name : "Someone shy";
        tx.querySelector(".kind").textContent = met ? cap(k.kind) + ", met in " + MAPS[s.area].name : "Somewhere in " + MAPS[s.area].name;
        tx.querySelector(".line").textContent = met ? k.journal : "This page is still waiting.";
        card.appendChild(tx); body.appendChild(card);
      });
    } else {
      const p = document.createElement("p"); p.className = "jnote"; p.textContent = "Kin you've met, across all your walks: " + meta.met.length + " of " + POOL.length + ". Every walk, a few different ones come out to say hello."; body.appendChild(p);
      const grid = document.createElement("div"); grid.className = "jgrid";
      POOL.forEach(k => { const met = meta.met.includes(k.id), c = document.createElement("button"); c.type = "button"; c.className = "jcell" + (met ? "" : " sil");
        c.appendChild(SEED.kinPortrait(k, !met, 56)); const n = document.createElement("span"); n.textContent = met ? k.name : "?"; c.appendChild(n);
        c.setAttribute("aria-label", met ? k.name + ": " + k.journal : "Not met yet");
        c.onclick = () => { $("jdetail").textContent = met ? k.name + ", " + k.kind + ". \u201C" + k.journal + "\u201D" : "Not met yet. Maybe on another walk."; };
        grid.appendChild(c); });
      body.appendChild(grid); const d = document.createElement("p"); d.id = "jdetail"; d.className = "jnote"; d.setAttribute("aria-live", "polite"); body.appendChild(d);
    }
  }
  document.querySelectorAll(".jtab").forEach(b => b.addEventListener("click", () => renderJournal(b.dataset.tab)));
  $("bjournal").addEventListener("click", () => { renderJournal("walk"); openPanel("journal"); });
  $("bhint").addEventListener("click", () => giveHint());
  $("bmenu").addEventListener("click", () => openPanel("menu"));
  function syncToggles() {
    document.querySelectorAll("[data-toggle=sound]").forEach(b => { b.setAttribute("aria-pressed", settings.sound); b.querySelector("b").textContent = settings.sound ? "on" : "off"; });
    document.querySelectorAll("[data-toggle=still]").forEach(b => { b.setAttribute("aria-pressed", settings.still); b.querySelector("b").textContent = settings.still ? "on" : "off"; });
    document.body.classList.toggle("still", settings.still);
  }
  document.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.toggle === "sound") Sound.set(!settings.sound); else { settings.still = !settings.still; saveSettings(); }
    syncToggles();
  }));
  $("newwalk").addEventListener("click", () => { closePanels(); store.del(LS.save); showTitle(); });
  document.querySelectorAll("a.arcade").forEach(a => a.href = SEED.links.arcade);
  document.querySelectorAll("a.meditate").forEach(a => a.href = SEED.links.meditation);

  /* ---------- title ---------- */
  function showTitle() {
    mode = "title"; run = null; hud(false); $("dialog").hidden = true;
    const s = store.get(LS.save, null);
    $("continue").hidden = !(s && s.run && !s.run.done);
    $("metcount").textContent = meta.met.length ? "Kin you've met so far: " + meta.met.length + " of " + POOL.length : "Thirty shy Kin live in the Hollowmere. You'll meet a few on each walk.";
    $("title").hidden = false; syncToggles();
    setTimeout(() => ($("continue").hidden ? document.querySelector(".walk") : $("continue")).focus({ preventScroll: true }), 30);
  }
  function begin(resume) {
    ["title", "card", "choices", "restbar", "moment", "journal", "menu", "toast"].forEach(i => $(i).hidden = true); moment = null; hud(true); mode = "play"; trail = []; mover = null; pathQ = []; ending = null; lastInput = clock; progress();
    updateHud(); fade = 1; fadeDir = -1;
    if (resume) say([TX.welcomeBack]);
    else { run.visited.nook = 1; const N = TX.numbers[friendsNeeded()]; say(TX.arrive.map(l => ({ who: l.who, text: fill(l.text, { N: cap(N), n: N }) }))); }
  }
  document.querySelectorAll(".walk").forEach(b => b.addEventListener("click", () => { newRun(b.dataset.walk); begin(false); }));
  $("continue").addEventListener("click", () => { const s = store.get(LS.save, null); if (!s) return; run = s.run; pos = s.pos; begin(true); });

  /* ---------- input ---------- */
  const DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
  document.addEventListener("keydown", e => {
    if (mode === "moment" && moment) { if (e.key === "Escape") { closeMoment(true); return; } if ((e.key === " " || e.key === "Enter") && e.target.tagName === "BUTTON") return; moment.h.key(e, true); return; }
    if (mode === "dialog") { if ([" ", "Enter", "e", "E"].includes(e.key) && !e.repeat) { e.preventDefault(); showLine(); } return; }
    if (mode === "panel") { if (e.key === "Escape" || (e.key === "j" && !$("journal").hidden)) closePanels(); return; }
    if (mode !== "play") return;
    if (DIRS[e.key] && !e.metaKey && !e.ctrlKey) { e.preventDefault(); const d = DIRS[e.key]; held = held.filter(h => h !== d); held.push(d); lastInput = now(); return; }
    if ([" ", "Enter", "e", "E"].includes(e.key) && !e.repeat) { if (e.target.tagName === "BUTTON" || e.target.tagName === "A") return; e.preventDefault(); lastInput = now(); const [fx, fy] = facing(); interactAt(fx, fy); return; }
    if (e.key === "j" || e.key === "J") { renderJournal("walk"); openPanel("journal"); }
    if (e.key === "h" || e.key === "H") giveHint();
    if (e.key === "Escape" || e.key === "m" || e.key === "M") openPanel("menu");
  });
  document.addEventListener("keyup", e => {
    if (mode === "moment" && moment) { moment.h.key(e, false); return; }
    if (DIRS[e.key]) held = held.filter(h => h !== DIRS[e.key]);
  });
  window.addEventListener("blur", () => { held = []; });
  cv.addEventListener("pointerdown", e => {
    if (mode === "dialog") { showLine(); return; }
    if (mode !== "play") return;
    e.preventDefault(); const r = cv.getBoundingClientRect();
    const tx = Math.floor((e.clientX - r.left) / r.width * W), ty = Math.floor((e.clientY - r.top) / r.height * H);
    lastInput = now(); walkTo.edgeDir = null; walkTo(tx, ty);
    const m = MAPS[pos.area];   // tapping an open edge tile walks on through
    if (!solid(pos.area, tx, ty)) { if (ty === 0 && m.exits.N) walkTo.edgeDir = "up"; else if (ty === H - 1 && m.exits.S) walkTo.edgeDir = "down"; else if (tx === 0 && m.exits.W) walkTo.edgeDir = "left"; else if (tx === W - 1 && m.exits.E) walkTo.edgeDir = "right"; }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
  window.addEventListener("pagehide", save);

  /* ---------- main loop ---------- */
  let last = performance.now();
  function frame(ts) { const dt = Math.min(0.1, (ts - last) / 1000) * SPEED; last = ts; update(dt); draw(); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  showTitle();

  /* ---------- a small window for automated tests (harmless for players) ---------- */
  window.SeedPath = {
    get mode() { return mode; }, get run() { return run; }, get pos() { return pos; }, get meta() { return meta; },
    busy: () => !!(mover || pathQ.length || pendingAct || fadeDir || walkTo.edgeDir),
    walkTo: (x, y) => { walkTo.edgeDir = null; walkTo(x, y); },
    newRun: (w, force) => { newRun(w, force); begin(false); },
    interactAt: (x, y) => interactAt(x, y),
    momentInfo: () => moment && moment.h.info ? moment.h.info() : null,
    hint: () => hintText(), solid: (x, y) => solid(pos.area, x, y), tileAt: (x, y) => tileAt(pos.area, x, y),
    pick: w => pickTasks(w), speed: SPEED,
    challenge: () => moment ? moment.h.info() : null, banter: () => banter.cur, forceBanter: () => { banter.next = clock; },
    setTrail: () => trail
  };
})();
