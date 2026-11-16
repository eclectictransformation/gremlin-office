// Seeded ~15-minute Grotto run (Trevor's set pieces + Bryan's campfire stare).
// Hall exploration stays solo. Layout and beats come from data/grotto-run.json and a shared seed.
export function attachGrottoRun(bag) {
  const { host, el, audio, AX, AZ } = bag;
  const IX = bag.IX, IZ = bag.IZ;
  let G = null, plan = null, loaded = null;
  const ready = fetch("data/grotto-run.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => { G = d; return d; }).catch(() => null);
  const party = () => bag.partySize?.() > 1 || !!bag.ext?.partyActive?.();
  const selfId = () => bag.selfId?.() || bag.ext?.selfId?.() || "me";
  const send = (m) => bag.ext?.partySend?.(m);
  const mulberry = (n) => { let a = (n >>> 0) || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const pickN = (rng, arr, n) => { const a = arr.slice(); const out = []; for (let i = 0; i < n && a.length; i++) out.push(a.splice(Math.floor(rng() * a.length), 1)[0]); return out; };
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const matchAns = (rd, s) => (rd.answers || []).some((a) => { const n = norm(s), t = norm(a); return n === t || n.includes(t) || t.includes(n); });

  function makePlan(seed, opts = {}) {
    if (!G?.enabled) return null;
    const rng = mulberry(seed);
    const pieces = pickN(rng, G.setpieces, 2);
    const riddles = pickN(rng, G.riddles, 2);
    const cond = pick(rng, G.conditions);
    const mood = pick(rng, G.bossMoods);
    const officer = pick(rng, G.customs.officer);
    const qCustoms = pickN(rng, G.customs.questions, G.customs.need || 2);
    const beats = [];
    const flow = G.flow || ["customs", "setpiece", "setpiece", "riddle", "campfire", "golem", "riddle", "boss"];
    let si = 0, ri = 0;
    flow.forEach((kind, i) => {
      if (kind === "customs") beats.push({ kind, id: "customs", data: G.customs, officer, questions: qCustoms });
      else if (kind === "setpiece") beats.push({ kind, id: pieces[si].id, data: pieces[si++] });
      else if (kind === "riddle") beats.push({ kind, id: riddles[ri].id, data: riddles[ri++], skullUsed: {} });
      else if (kind === "campfire") beats.push({ kind, id: "campfire", data: G.campfire });
      else if (kind === "golem") beats.push({ kind, id: "golem", data: G.golem });
      else if (kind === "boss") beats.push({ kind, id: "boss", data: G.boss, mood });
    });
    // Keep the existing cave geometry so v5d live tests and Hettie's outpost stay put.
    // Beats are extras mapped onto those rooms in descent order.
    const slots = { customs: "foyer", setpiece: ["dripway", "bat-bend"], riddle: ["rest", "landing"], campfire: "rest", golem: "gallery", boss: "boss" };
    const used = { setpiece: 0, riddle: 0 };
    beats.forEach((b) => {
      const s = slots[b.kind];
      b.roomId = Array.isArray(s) ? s[used[b.kind]++] : s;
    });
    plan = { seed, beats, rooms: null, cond, mood, officer, solo: !opts.party && !party(), clears: {}, wins: {}, done: {}, stare: { ready: {} }, snip: {}, tap: {}, toast: {}, ration: null, toad: {}, echo: { pick: {}, misses: 0 }, plates: {}, lantern: false, mushroom: { giant: false }, titles: [], started: Date.now() };
    try { bag.seedFn?.(seed); } catch {}
    return plan;
  }

  function roomsOf() { return null; } // existing cave rooms stay; beats are extras
  function clear() { plan = null; }

  function extra(key, x, z, y, label, run) { const list = bag.extras?.() || []; if (list.some((e) => e.key === key)) return; bag.pushExtra?.({ key, lx: IX + x, lz: IZ + z, ly: y || 0, label, run }); }

  function afterBuild(I) {
    if (!G) return;
    ensurePartyOn();
    const foyer = (I && bag.caveRoom?.(I, "foyer")) || { x: 8.0, z: 31.0, y: 0, w: 10, d: 8 };
    const H = G.entryHall || {};
    const y = foyer.y || 0, x = foyer.x, z = foyer.z;
    // lived-in camp, east of the outpost table
    extra("hall-gear", x + 2.6, z - 1.4, y, () => H.gear?.prompt || "🧥 Gear up", () => openGear(H));
    extra("hall-vendor", x + 3.2, z + 0.6, y, () => H.vendor?.prompt || "🧺 Sell a find", () => openVendor(H));
    extra("hall-change", x + 2.2, z + 2.2, y, () => H.change?.prompt || "🧵 Change who you are", () => openChange(H));
    extra("hall-party", x - 0.4, z - 2.4, y, () => (plan && bag.ext?.partyCode?.() ? `🤝 Party ${bag.ext.partyCode()}` : (H.party?.prompt || "🤝 Start a run together")), () => openPartyHall(H));
    if (!plan) return;
    extra("customs", x + 0.2, z - 1.8, y, () => G.customs.prompt, () => openCustoms());
    plan.beats.forEach((b) => {
      const rm = bag.caveRoom?.(I, b.roomId) || bag.caveRoom?.(I, b.kind === "boss" ? "boss" : b.kind === "customs" ? "foyer" : b.roomId);
      if (!rm || b.kind === "customs") return;
      const lx = rm.x, lz = rm.z, ly = rm.y || 0;
      if (b.kind === "riddle") extra("riddle-" + b.id, lx, lz, ly, () => "📜 A riddle, and a skull", () => openRiddle(b));
      if (b.kind === "setpiece") extra("sp-" + b.id, lx, lz, ly, () => b.data.prompt || b.data.title, () => openSetpiece(b));
      if (b.kind === "campfire") {
        extra("fire-sit", lx - 1.2, lz, ly, () => "🔥 Sit by the fire (rest)", () => { bag.rest?.("breather"); host.toast(G.campfire.rest); });
        extra("fire-toast", lx, lz - 0.8, ly, () => G.campfire.toast.prompt, () => openToast());
        extra("fire-ration", lx + 1.1, lz, ly, () => G.campfire.ration.prompt, () => openRation());
        extra("fire-toad", lx, lz + 1.0, ly, () => G.campfire.toad.prompt, () => openToad());
        extra("fire-stare", lx, lz + 2.0, ly, () => G.campfire.stare.prompt, () => openStare());
      }
      if (b.kind === "golem") extra("golem-look", lx, lz + rm.d / 2 - 1.2, ly, () => (plan.done.golem ? "The golem is a heap of opinions." : "🗿 The Grudge Golem"), () => openGolem(b));
      if (b.kind === "boss") extra("boss-talk", lx, lz, ly, () => (plan.done.boss ? "A polite pile of fluff." : "🧸 Sir Fluffington"), () => openBoss(b));
    });
  }

  function openPanel(title, fn) { host.openPanel(title, (pn) => { pn.dataset.annexPanel = "grotto"; fn(pn); }); }
  function btn(lab, key, fn, cls) { const b = el("button", cls || "o3-btn", lab); b.dataset.gtr = key; b.onclick = fn; return b; }
  function p(cls, t) { return el("p", cls, t); }

  function openGear(H) {
    openPanel(H.gear.title, (pn) => { pn.appendChild(p(null, H.gear.text)); pn.appendChild(btn("Open your pack", "gear", () => { host.closePanel(); bag.openSheet?.(); })); });
  }
  function openChange(H) {
    openPanel(H.change.title, (pn) => { pn.appendChild(p(null, H.change.text)); pn.appendChild(btn("Leave the mouth", "leave", () => { host.closePanel(); bag.leaveInstance?.(); })); });
  }
  function openVendor(H) {
    const c = bag.CH?.(); const inv = (c?.inv || []).slice();
    openPanel(H.vendor.title, (pn) => {
      pn.appendChild(p("o3-small", H.vendor.name || "")); pn.appendChild(p(null, H.vendor.text));
      if (!inv.length) { pn.appendChild(p("o3-small", "Your pack is empty of sellable finds.")); return; }
      inv.forEach((id) => { const it = bag.item?.(id) || G.items?.[id]; const lab = it?.name || id;
        pn.appendChild(btn(`Sell ${lab}`, "sell-" + id, () => {
          const i = c.inv.indexOf(id); if (i >= 0) c.inv.splice(i, 1);
          if (H.vendor.give) bag.giveItem?.(H.vendor.give, true);
          bag.save?.(); host.closePanel(); host.toast("Mickle nods, once, and the kettle clicks.");
        }));
      });
    });
  }
  function openPartyHall(H) {
    openPanel(H.party?.title || "Play together (test)", (pn) => {
      if (bag.ext?.partyDoor) bag.ext.partyDoor(pn, "grotto", () => { host.closePanel(); host.toast("The run will use that party code."); });
      else pn.appendChild(p("o3-small", "Party start isn't hooked yet. Use the door panel."));
    });
  }

  // ----- Customs -----
  function openCustoms() {
    const C = G.customs, b = plan.beats.find((q) => q.kind === "customs");
    openPanel(C.title, (pn) => {
      pn.appendChild(p("o3-small", b.officer + " · Goblin Customs"));
      pn.appendChild(p(null, plan.solo ? C.solo : pick(mulberry(plan.seed + 3), C.intro)));
      const answers = (plan.customs ||= {});
      b.questions.forEach((q) => {
        pn.appendChild(p("o3-riddle", q.q));
        const row = el("div", "o3-grotto-opts");
        q.opts.forEach((opt, i) => {
          const bb = btn(opt, "cq-" + q.id + i, () => { answers[q.id] = i; send({ k: "customs", q: q.id, i, by: selfId() }); openCustoms(); }, "o3-btn ghost o3-wide" + (answers[q.id] === i ? " on" : ""));
          row.appendChild(bb);
        });
        pn.appendChild(row);
      });
      pn.appendChild(btn("Present the form", "c-go", () => {
        const need = b.questions.every((q) => answers[q.id] != null);
        if (!need) return host.toast("The goblin taps the empty lines.");
        // Co-op: if we have partner answers, they should be about each other — we accept any complete form this pass and stamp APPROVED (denied is for a later 'match the partner's self-report' hook).
        plan.done.customs = true; send({ k: "done", beat: "customs" });
        host.closePanel(); host.toast(pick(mulberry(plan.seed + 9), C.ok));
      }));
      pn.appendChild(btn(C.bribe.prompt, "c-bribe", () => {
        const c = bag.CH?.(); const sock = (c?.inv || []).find((id) => /sock/.test(id) || /sock/i.test(bag.item?.(id)?.name || ""));
        if (!sock) return host.toast(C.bribe.need);
        plan.done.customs = true; host.closePanel(); host.toast(C.bribe.ok);
      }, "o3-btn ghost"));
    });
  }

  // ----- Riddles + Sarcastic Skull -----
  function openRiddle(b) {
    const rd = b.data, Sk = G.skull;
    openPanel("A riddle in the dark", (pn) => {
      pn.appendChild(p("o3-riddle", rd.q));
      const inp = document.createElement("input"); inp.type = "text"; inp.className = "o3-partycode o3-grotto-ans"; inp.placeholder = "Your answer"; inp.dataset.gtr = "ans";
      pn.appendChild(inp);
      pn.appendChild(btn("Answer", "rans", () => {
        if (matchAns(rd, inp.value)) { plan.done[b.id] = true; send({ k: "done", beat: b.id }); host.closePanel(); host.toast("The cave, in spite of itself, is satisfied."); }
        else host.toast("The stone does not change its mind.");
      }));
      const used = (b.skullUsed[selfId()] || 0) > 0;
      pn.appendChild(p("o3-small", Sk.intro));
      const hb = btn(used ? "The skull has already helped you with this one." : Sk.prompt, "skull", () => {
        if (used) return;
        const d20 = bag.roll?.(20) || (1 + Math.floor(Math.random() * 20));
        b.skullUsed[selfId()] = d20;
        if (d20 === 1) host.toast(G.nat["1"].toast);
        if (d20 === 20) { host.toast(G.nat["20"].toast); try { audio.playSting?.(G.nat["20"].sting); } catch {} }
        let line;
        if (d20 <= 5) line = pick(mulberry(plan.seed + d20), Sk.low);
        else if (d20 <= 15) line = pick(mulberry(plan.seed + 2), Sk.nudge) + " " + (rd.nudge || "");
        else if (d20 <= 19) line = pick(mulberry(plan.seed + 3), Sk.strong) + " " + (rd.strong || "");
        else line = Sk.answerPrefix + (rd.answers[0]) + Sk.answerSuffix;
        host.toast(`d20 = ${d20}. ${line}`);
        send({ k: "skull", beat: b.id, d20, by: selfId() });
      }, "o3-btn ghost");
      if (used) hb.disabled = true; pn.appendChild(hb);
    });
  }

  // ----- Set pieces -----
  function openSetpiece(b) {
    const d = b.data;
    openPanel(d.title, (pn) => {
      pn.appendChild(p(null, plan.solo && d.solo ? d.intro + " " + d.solo : d.intro));
      if (b.id === "echo-door") {
        const st = plan.echo;
        (d.runes || []).forEach((r, i) => {
          pn.appendChild(btn(`${r}  ${d.runeNames?.[i] || ""}`, "rune-" + i, () => {
            st.pick[selfId()] = i; send({ k: "echo", i, by: selfId() });
            if (plan.solo) { st.pick.echo = i; resolveEcho(b, d); }
            else if (Object.keys(st.pick).length >= 2) resolveEcho(b, d);
            else host.toast("Picked, in secret. Waiting for your partner.");
          }, "o3-btn ghost"));
        });
      }
      if (b.id === "plates") pn.appendChild(p("o3-small", "Stand on a plate. Your partner stands on the other. (Solo: step on one, then the other before the timer-stone forgets.)"));
      if (b.id === "lantern-runes") pn.appendChild(btn(plan.lantern ? "The lantern is held." : "Hold the lantern up", "lan", () => { plan.lantern = true; send({ k: "lantern", on: 1 }); host.toast(d.held); maybeLantern(b, d); }));
      if (b.id === "lantern-runes" && (plan.lantern || plan.solo)) pn.appendChild(btn("Read the runes", "read", () => { plan.done[b.id] = true; send({ k: "done", beat: b.id }); host.closePanel(); host.toast(d.ok); }));
      if (b.id === "mushroom") {
        pn.appendChild(btn("Stand in the giant light (hold the ceiling)", "giant", () => { plan.mushroom.giant = true; plan.mushroom.until = Date.now() + (plan.solo ? 8000 : 60000); send({ k: "mushroom", giant: 1 }); host.toast(d.hold); }));
        pn.appendChild(btn("Crawl to the lever (you must be small)", "tiny", () => {
          if (!plan.mushroom.giant && !plan.solo) return host.toast(d.needGiant);
          plan.done[b.id] = true; send({ k: "done", beat: b.id }); host.closePanel(); host.toast(d.ok);
        }));
      }
      if (b.id === "blind-bridge") {
        pn.appendChild(btn("Hold the shield and guide", "guide", () => { plan.guide = selfId(); send({ k: "guide", by: selfId() }); host.toast(d.guide); }));
        pn.appendChild(btn("Walk the unseen bridge", "walk", () => {
          if (!plan.solo && plan.guide === selfId()) return host.toast("Someone else has to walk while you guide.");
          if (!plan.solo && !plan.guide) return host.toast("Someone needs to hold the shield first.");
          plan.done[b.id] = true; send({ k: "done", beat: b.id }); host.closePanel(); host.toast(d.ok);
        }));
      }
      if (d.ok && b.id === "plates") pn.appendChild(p("o3-small", "The gate will open when both plates are held."));
    });
  }
  function resolveEcho(b, d) {
    const vals = Object.values(plan.echo.pick);
    if (vals.length < 2 && !plan.solo) return;
    const ok = plan.solo || vals[0] === vals[1];
    if (ok) { plan.done[b.id] = true; send({ k: "done", beat: b.id }); host.closePanel(); host.toast(d.ok); }
    else { plan.echo.misses++; plan.echo.pick = {}; host.toast(plan.echo.misses >= 3 ? d.hint3 : pick(mulberry(plan.seed + plan.echo.misses), d.miss)); }
  }
  function maybeLantern(b, d) { /* reading is a separate button */ }

  function checkPlates() {
    if (!plan || plan.done.plates) return;
    const b = plan.beats.find((q) => q.id === "plates"); if (!b) return;
    const rm = bag.caveRoom?.(null, b.roomId || "plates") || bag.caveRoom?.(null, "bat-bend") || bag.caveRoom?.(null, "dripway"); if (!rm) return;
    const p = bag.lastPos?.() || {};
    const lx = p.x - IX, lz = p.z - IZ;
    const left = Math.hypot(lx - (rm.x - 2.2), lz - rm.z) < 1.1;
    const right = Math.hypot(lx - (rm.x + 2.2), lz - rm.z) < 1.1;
    const mine = left ? "L" : right ? "R" : null;
    if (mine) { plan.plates[selfId()] = { which: mine, at: Date.now() }; send({ k: "plate", which: mine, by: selfId() }); }
    const now = Date.now();
    const held = {};
    Object.entries(plan.plates).forEach(([id, v]) => { if (now - v.at < (plan.solo ? 8000 : 2500)) held[v.which] = true; });
    if (plan.solo && held.L && held.R || !plan.solo && held.L && held.R) { plan.done.plates = true; send({ k: "done", beat: "plates" }); host.toast(b.data.ok); }
  }

  // ----- Campfire -----
  function openToast() {
    const T = G.campfire.toast; const mine = (plan.toast[selfId()] ||= null);
    openPanel(T.name, (pn) => {
      pn.appendChild(p(null, T.intro));
      T.words.forEach((w) => pn.appendChild(btn(w, "tw-" + w, () => { plan.toast[selfId()] = w; send({ k: "toast", w, by: selfId() }); maybeToast(); openToast(); }, "o3-btn ghost" + (mine === w ? " on" : ""))));
      if (plan.done.toast) pn.appendChild(p("o3-small", T.ok.replace("{buff}", plan.buff || "this small blessing")));
    });
  }
  function maybeToast() {
    const vals = Object.values(plan.toast).filter(Boolean);
    if (plan.solo && vals[0]) vals[1] = vals[0];
    if (vals.length < 2) return;
    plan.buff = (G.campfire.toast.buff || "Blessing of {a} and {b}").replace("{a}", vals[0]).replace("{b}", vals[1]);
    plan.done.toast = true; host.toast(G.campfire.toast.ok.replace("{buff}", plan.buff));
  }
  function openRation() {
    const R = G.campfire.ration;
    if (plan.ration) return host.toast("The glowcap is already a memory.");
    openPanel(R.name, (pn) => {
      pn.appendChild(p(null, R.intro));
      pn.appendChild(btn("Split it", "split", () => { plan.ration = "split"; bag.heal?.(Math.max(2, Math.floor((bag.maxHp?.() || 8) * 0.35))); plan.titles.push(R.titleSplit); send({ k: "ration", how: "split", by: selfId() }); host.closePanel(); host.toast(plan.solo ? R.soloSplit : R.split); bag.save?.(); }));
      pn.appendChild(btn("Eat it all", "all", () => { plan.ration = "all"; bag.heal?.(Math.max(4, Math.floor((bag.maxHp?.() || 8) * 0.7))); plan.titles.push(R.titleAll); send({ k: "ration", how: "all", by: selfId() }); host.closePanel(); host.toast(R.all); bag.save?.(); }, "o3-btn ghost"));
    });
  }
  function openToad() {
    const T = G.campfire.toad; const q = T.questions[Math.abs(plan.seed) % T.questions.length];
    openPanel(T.name, (pn) => {
      pn.appendChild(p(null, plan.solo ? T.solo : pick(mulberry(plan.seed + 5), T.intro)));
      pn.appendChild(p("o3-riddle", q.q));
      q.opts.forEach((opt, i) => pn.appendChild(btn(opt, "tq" + i, () => { plan.toad[selfId()] = i; send({ k: "toad", i, by: selfId() }); maybeToad(q); host.closePanel(); }, "o3-btn ghost o3-wide")));
    });
  }
  function maybeToad() {
    const vals = Object.values(plan.toad);
    if (plan.solo && vals.length) { plan.done.toad = true; host.toast(G.campfire.toad.match); return; }
    if (vals.length < 2) return host.toast("The toad waits, heroically, for the other answer.");
    plan.done.toad = true;
    host.toast(vals[0] === vals[1] ? G.campfire.toad.match : G.campfire.toad.miss);
  }

  // ----- Stare moment (Bryan t650u) -----
  let stareTimer = null, stareOverlay = null;
  function openStare() {
    const S = G.campfire.stare;
    if (plan.done.stare) return host.toast("The fire already kept that minute.");
    showStare("ready");
  }
  function showStare(phase, n) {
    const S = G.campfire.stare;
    if (!stareOverlay) {
      stareOverlay = el("div", "o3-stare"); stareOverlay.dataset.gtr = "stare";
      (host.hud || document.body).appendChild(stareOverlay);
    }
    stareOverlay.hidden = false; stareOverlay.innerHTML = "";
    const card = el("div", "o3-stare-card"); stareOverlay.appendChild(card);
    const skip = btn(S.skip, "stare-skip", () => { finishStare(true); }, "o3-btn ghost o3-stare-skip");
    if (phase === "ready") {
      card.appendChild(el("h2", null, S.ready));
      if (plan.solo) card.appendChild(p("o3-small", S.soloReady));
      card.appendChild(btn(S.yes, "stare-yes", () => onYes(), "o3-btn"));
      card.appendChild(skip); return;
    }
    if (phase === "wait") { card.appendChild(el("h2", null, S.waiting)); card.appendChild(skip); return; }
    if (phase === "count") { card.appendChild(el("div", "o3-stare-num", String(n))); card.appendChild(skip); return; }
    if (phase === "hold") { card.appendChild(p("o3-stare-text", S.text)); card.appendChild(el("div", "o3-stare-num o3-stare-hold", String(n))); card.appendChild(skip); return; }
    if (phase === "after") {
      card.appendChild(p("o3-stare-text", S.after));
      card.appendChild(btn(S.continue, "stare-go", () => finishStare(false), "o3-btn"));
      return;
    }
  }
  function onYes() {
    const S = G.campfire.stare;
    plan.stare.ready[selfId()] = true; send({ k: "stare-yes", by: selfId() });
    const n = Object.keys(plan.stare.ready).length;
    if (plan.solo || n >= 2) startCount(Date.now() + 400);
    else showStare("wait");
  }
  function startCount(at, fromNet) {
    if (plan.stare.counting) return;
    plan.stare.counting = true;
    plan.stare.goAt = at; if (!fromNet) send({ k: "stare-go", at });
    const S = G.campfire.stare; const from = S.countFrom || 3;
    const tick = () => {
      const left = at - Date.now();
      if (left > 0) { showStare("count", from); return void (stareTimer = setTimeout(tick, left)); }
      const elapsed = Date.now() - at;
      const step = Math.ceil((from * 1000 - elapsed) / 1000);
      if (step > 0) { showStare("count", step); stareTimer = setTimeout(tick, 200); return; }
      const held = S.holdSeconds * 1000 + from * 1000;
      const holdLeft = Math.ceil((held - elapsed) / 1000);
      if (holdLeft > 0) { showStare("hold", holdLeft); stareTimer = setTimeout(tick, 200); return; }
      try { audio.playSting?.(S.fanfare); } catch {}
      showStare("after");
    };
    tick();
  }
  function finishStare(skipped) {
    if (stareTimer) clearTimeout(stareTimer); stareTimer = null;
    if (stareOverlay) stareOverlay.hidden = true;
    plan.done.stare = true; send({ k: "done", beat: "stare", skipped: !!skipped });
  }

  // ----- Golem / Boss -----
  function openGolem(b) {
    if (plan.done.golem) return host.toast(b.data.cleared);
    openPanel(b.data.title, (pn) => {
      pn.appendChild(p(null, b.data.intro));
      pn.appendChild(p("o3-small", pick(mulberry(Date.now()), b.data.mutter)));
      pn.appendChild(btn("Face the grudge", "golem-go", () => { host.closePanel(); bag.startBeatFight?.("golem"); }));
    });
  }
  function openBoss(b) {
    const B = b.data;
    if (plan.done.boss) return showCard();
    if (plan.bossPhase === "snip") return openSnip(B);
    if (plan.bossPhase === "finale") return openFinale(B);
    openPanel(B.title, (pn) => {
      pn.appendChild(p(null, B.intro));
      pn.appendChild(p("o3-riddle", pick(mulberry(plan.seed + (plan.mood?.id || 1)), B.grievances)));
      pn.appendChild(p("o3-small", "Mood: " + (plan.mood?.name || "") + ". " + (plan.mood?.line || "")));
      pn.appendChild(btn("Stand your ground", "boss-go", () => { host.closePanel(); bag.startBeatFight?.("boss"); }));
    });
  }
  function onLocalWin(kind) {
    if (!plan) return;
    plan.wins[kind] = plan.wins[kind] || {}; plan.wins[kind][selfId()] = true;
    send({ k: "win", beat: kind, by: selfId() });
    if (kind === "golem") {
      const n = Object.keys(plan.wins.golem).length;
      if (plan.solo || n >= 2) { plan.done.golem = true; host.toast(G.golem.cleared); }
      else host.toast(G.golem.waiting);
    }
    if (kind === "boss") { plan.bossPhase = "snip"; openSnip(G.boss); }
  }
  function openSnip(B) {
    openPanel(B.title, (pn) => {
      pn.appendChild(p(null, B.sew));
      pn.appendChild(btn(B.snip, "snip", () => { plan.snip[selfId()] = true; send({ k: "snip", by: selfId() }); maybeSnip(B); }));
    });
  }
  function maybeSnip(B) {
    const n = Object.keys(plan.snip).length;
    if (plan.solo || n >= 2) { plan.bossPhase = "finale"; host.closePanel(); openFinale(B); }
    else host.toast(B.waitingSnip);
  }
  function openFinale(B) {
    showFinale("ready");
  }
  let finOverlay = null, finTimer = null;
  function showFinale(phase, n) {
    const B = G.boss;
    if (!finOverlay) { finOverlay = el("div", "o3-stare"); (host.hud || document.body).appendChild(finOverlay); }
    finOverlay.hidden = false; finOverlay.innerHTML = "";
    const card = el("div", "o3-stare-card"); finOverlay.appendChild(card);
    if (phase === "ready") {
      card.appendChild(p(null, B.finale));
      card.appendChild(btn("I'm on a thread", "ft-yes", () => {
        plan.tap.ready = plan.tap.ready || {}; plan.tap.ready[selfId()] = true; send({ k: "finale-ready", by: selfId() });
        if (plan.solo || Object.keys(plan.tap.ready).length >= 2) startFinaleCount(Date.now() + 350);
        else { card.appendChild(p("o3-small", "Waiting for your partner…")); }
      }));
      return;
    }
    if (phase === "count") { card.appendChild(el("div", "o3-stare-num", String(n))); return; }
    if (phase === "tap") {
      card.appendChild(el("h2", null, "Now."));
      card.appendChild(btn("Unravel", "unravel", () => { plan.tap[selfId()] = true; send({ k: "finale-tap", by: selfId() }); maybeUnravel(); }, "o3-btn"));
    }
  }
  function startFinaleCount(at, fromNet) {
    if (plan.tap.started) return;
    plan.tap.started = true;
    if (!fromNet) send({ k: "finale-go", at });
    const tick = () => {
      const e = Date.now() - at, step = 3 - Math.floor(e / 1000);
      if (step > 0) { showFinale("count", step); finTimer = setTimeout(tick, 150); return; }
      showFinale("tap");
    };
    tick();
  }
  function maybeUnravel() {
    const n = Object.keys(plan.tap).filter((k) => k !== "ready").length;
    if (!(plan.solo || n >= 1)) return; // one tap starts the check; require partner if we saw finale-tap from other
    if (!plan.solo && n < 2 && !plan.tap._other) { host.toast("The thread holds — your partner has to pull too."); return; }
    finishBoss();
  }
  function finishBoss() {
    if (finTimer) clearTimeout(finTimer); if (finOverlay) finOverlay.hidden = true;
    plan.done.boss = true; send({ k: "done", beat: "boss" });
    try { audio.playSting?.("stare-fanfare"); } catch {}
    const id = G.boss.loot;
    if (id) { if (G.items?.[id] && bag.ensureItem) bag.ensureItem(id, G.items[id]); bag.giveItem?.(id, true); }
    host.toast(G.boss.unravel);
    try { bag.markBoss?.(); } catch {}
    setTimeout(showCard, 700);
  }
  function showCard() {
    openPanel(G.boss.cardTitle, (pn) => {
      pn.appendChild(p("o3-stare-text", G.boss.card));
      pn.appendChild(p("o3-small", "You found: " + (G.boss.lootName || "a pillow") + "."));
      if (plan.titles?.length) pn.appendChild(p("o3-small", "Also known as: " + plan.titles.join(", ") + "."));
      pn.appendChild(btn("Keep walking", "card-ok", () => host.closePanel()));
    });
  }

  function onEvent(m) {
    if (!plan || !m) return;
    if (m.from === selfId()) return;
    if (m.k === "done") plan.done[m.beat] = true;
    if (m.k === "customs") { (plan.customs ||= {})[m.q + ":" + m.by] = m.i; }
    if (m.k === "echo") { plan.echo.pick[m.by] = m.i; const b = plan.beats.find((q) => q.id === "echo-door"); if (b) resolveEcho(b, b.data); }
    if (m.k === "plate") { plan.plates[m.by] = { which: m.which, at: Date.now() }; }
    if (m.k === "lantern") plan.lantern = !!m.on;
    if (m.k === "mushroom") plan.mushroom.giant = !!m.giant;
    if (m.k === "guide") plan.guide = m.by;
    if (m.k === "toast") { plan.toast[m.by] = m.w; maybeToast(); }
    if (m.k === "toad") { plan.toad[m.by] = m.i; maybeToad(); }
    if (m.k === "stare-yes") { plan.stare.ready[m.by] = true; if (Object.keys(plan.stare.ready).length >= 2 && !plan.stare.counting) startCount(Date.now() + 400, true); }
    if (m.k === "stare-go" && m.at) startCount(m.at, true);
    if (m.k === "win") { plan.wins[m.beat] = plan.wins[m.beat] || {}; plan.wins[m.beat][m.by] = true; }
    if (m.k === "snip") { plan.snip[m.by] = true; maybeSnip(G.boss); }
    if (m.k === "finale-ready") { plan.tap.ready = plan.tap.ready || {}; plan.tap.ready[m.by] = true; if (Object.keys(plan.tap.ready).length >= 2 && !plan.tap.started) startFinaleCount(Date.now() + 350, true); }
    if (m.k === "finale-go" && m.at) startFinaleCount(m.at, true);
    if (m.k === "finale-tap") { plan.tap[m.by] = true; plan.tap._other = true; maybeUnravel(); }
  }

  function update() { if (plan && !plan.done.plates) checkPlates(); }

  let boundParty = false;
  function ensurePartyOn() { if (boundParty || !bag.ext?.partyOn) return; bag.ext.partyOn(onEvent); boundParty = true; }
  const _update = update;
  update = function () { ensurePartyOn(); _update(); };

  return {
    ready: () => ready, data: () => G, current: () => plan, clear,
    plan: (seed, opts) => makePlan(seed, opts), rooms: () => roomsOf(),
    afterBuild, update, onEvent, onLocalWin, showCard,
    openCustoms, openStare, openBoss,
    state: () => plan && ({ seed: plan.seed, beats: plan.beats.map((b) => b.id), cond: plan.cond, mood: plan.mood, done: { ...plan.done }, titles: plan.titles.slice(), solo: plan.solo, rooms: (plan.rooms || []).map((r) => r.id), roomIds: plan.beats.map((b) => b.roomId) }),
  };
}
