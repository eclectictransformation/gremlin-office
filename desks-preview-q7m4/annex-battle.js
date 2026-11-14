// Elsewhere Annex v5b: turn-based battle screen (side view, wait-style turn gauges). Original art + wording.
// Reusable: rpg.js decides WHEN a fight becomes a battle (per-zone flag `turnBased: true` in data/annex-rpg.json) and hands
// this module a small rules object. This module only does the screen, the turn order and the little animations.
// Wait style: every gauge (yours and theirs) PAUSES while your command menu is open and while anyone's move is playing,
// so nobody is ever hit while choosing. All dice/XP/loot math stays in rpg.js.
export function createBattle({ el, hud, host, audio, cfg = {} }) {
  const C = { heroFill: 2.4, heroFillPerStride: 0.2, heroFillMin: 1.5, heroFillMax: 3.2, foeFillPerEvery: 1.3, foeFillMin: 2.2, foeFillMax: 5.0,
    heroStart: 0.65, foeStartMax: 0.35, lunge: 380, hold: 950, foeCaption: 1100, ...cfg };
  let B = null; // the battle in progress
  const root = el("div", "o3-battle"); root.hidden = true; root.dataset.btl = "root"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Battle"); hud.appendChild(root);
  const stage = el("div", "btl-stage"), banner = el("div", "btl-banner"), caption = el("div", "btl-caption"), foesEl = el("div", "btl-foes"), heroesEl = el("div", "btl-heroes"), fxEl = el("div", "btl-fx");
  stage.append(banner, foesEl, heroesEl, caption, fxEl);
  const bottom = el("div", "btl-bottom"), menu = el("div", "btl-menu"), side = el("div", "btl-side"), partyEl = el("div", "btl-party"), logEl = el("div", "btl-log");
  side.append(partyEl, logEl); bottom.append(menu, side); root.append(stage, bottom);
  const endCard = el("div", "btl-end"); endCard.hidden = true; root.appendChild(endCard);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * (B?.speed || 1)));

  // ---------- fighters ----------
  function heroCard(h) {
    const f = el("div", "btl-fighter btl-hero"); f.dataset.btl = "hero";
    const spr = el("div", "btl-sprite"); f.appendChild(spr); const ui = { el: f, spr }; paintHero(spr, h, ui); f.appendChild(el("div", "btl-tag", h.name)); idleVars(f, 0); return ui;
  }
  // v5b+: every fighter's art sits in a .btl-body (idle rock / ready bounce / squash / knockback / victory dance, all CSS transforms),
  // the hero gets a separate weapon sprite near the hands that swings on Attack. Optional pose frames swap the picture when they exist.
  function weaponEl(h) { const w = el("div", "btl-weapon"); w.dataset.btl = "weapon"; w.title = h.weaponName || ""; w.appendChild(el("span", null, h.weaponIcon || "👊")); return w; }
  function paintHero(spr, h, ui) {
    spr.textContent = ""; spr.className = "btl-sprite"; const body = el("div", "btl-body"); spr.appendChild(body); ui.body = body; ui.poses = {}; ui.base = null;
    const fallback = () => { body.textContent = ""; spr.classList.add("fig"); spr.dataset.avatar = "fallback"; ui.img = null;
      const fig = el("div", "btl-fig"); fig.style.setProperty("--c", h.color || "#5b7a4a"); fig.append(el("i", "h"), el("i", "b"), el("i", "l"), el("i", "r")); body.appendChild(fig); body.appendChild(weaponEl(h)); gear(); };
    const gear = () => { spr.querySelector(".btl-gear")?.remove(); const g = el("div", "btl-gear"); (h.gearIcons || []).forEach((t) => g.appendChild(el("span", null, t))); if (g.children.length) spr.appendChild(g); };
    if (!h.avatar) return fallback();
    const img = new Image(); img.alt = h.name; img.className = "btl-av"; img.decoding = "async"; img.draggable = false; ui.img = img; ui.base = h.avatar;
    img.onload = () => { if (spr.dataset.avatar) return; spr.dataset.avatar = "image"; if (h.avatarOpaque) spr.classList.add("opaque"); else checkOpaque(img, spr); };
    img.onerror = () => { if (img.src.endsWith(ui.base)) { img.parentNode?.remove(); fallback(); } else img.src = ui.base; };
    const frame = el("div", "btl-frame"); frame.append(img, weaponEl(h)); img.src = h.avatar; body.appendChild(frame); gear();
    // preload optional pose frames; only the ones that load are ever used
    Object.entries(h.poses || {}).forEach(([k, u]) => { if (!POSES.includes(k) || typeof u !== "string" || !/^assets\/avatars\/[a-z0-9_-]{1,60}\.(webp|png)$/.test(u)) return; const q = new Image(); q.onload = () => (ui.poses[k] = u); q.src = u; });
  }
  const POSES = ["idle", "attack", "hurt", "victory", "hold"];
  function setPose(ui, k) { if (!ui) return; ui.el.dataset.pose = k; if (!ui.img) return; const u = ui.poses[k] || (k === "hold" ? ui.poses.idle : null) || ui.poses.idle || ui.base; if (u && !ui.img.src.endsWith(u)) ui.img.src = u; ui.el.dataset.frame = ui.poses[k] ? k : "base"; }
  function idleVars(f, k) { f.style.setProperty("--dl", (-(k * 0.37 + Math.random() * 0.5)).toFixed(2) + "s"); f.style.setProperty("--dur", (1.2 + ((k * 0.13 + Math.random() * 0.4) % 0.4)).toFixed(2) + "s"); }
  // a non-transparent picture gets a little card frame instead of looking like a pasted rectangle
  function checkOpaque(img, spr) { try { const c = document.createElement("canvas"), w = (c.width = 16), h = (c.height = 16), x = c.getContext("2d"); x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data, corner = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4]; if (corner.every((i) => d[i + 3] > 250)) spr.classList.add("opaque"); } catch { spr.classList.add("opaque"); } }
  function foeCard(m, k, n) {
    const f = el("div", "btl-fighter btl-foe" + (m.boss ? " boss" : "")); f.dataset.btl = "foe-" + k; f.style.setProperty("--row", String(k % 3)); f.style.setProperty("--col", String(Math.floor(k / 3)));
    const spr = el("div", "btl-sprite"), body = el("div", "btl-body"); spr.appendChild(body); idleVars(f, k + 1);
    if (m.art) { const im = el("img"); im.src = m.art; im.alt = m.name; im.draggable = false; body.appendChild(im); } else body.appendChild(el("span", "btl-emoji", m.icon || "👾"));
    const hp = el("div", "btl-hp"), hpF = el("i"); hp.appendChild(hpF); const atb = el("div", "btl-atb"), atbF = el("i"); atb.appendChild(atbF);
    const ring = el("button", "btl-pick", ""); ring.setAttribute("aria-label", "Target " + m.name); ring.dataset.btl = "pick-" + k; ring.onclick = () => B?.picking && B.picking(k);
    f.append(spr, el("div", "btl-tag", m.name), hp, atb, ring); return { el: f, spr, body, hpF, atbF, ring };
  }

  // ---------- start / end ----------
  function start(o) { // o: { title, hero, foes: [mob], rules, speed }
    if (B) return false; const R = o.rules;
    B = { R, title: o.title || "A scuffle!", hero: { ...o.hero, g: o.hero.startGauge ?? C.heroStart, fill: clamp(C.heroFill - C.heroFillPerStride * (o.hero.speedMod || 0), C.heroFillMin, C.heroFillMax) },
      foes: o.foes.map((m, k) => ({ m, k, g: Math.random() * C.foeStartMax, fill: clamp((m.every || 2.4) * C.foeFillPerEvery, C.foeFillMin, C.foeFillMax) })),
      queue: [], busy: false, menuOpen: false, mode: "wait", picking: null, turns: 0, log: [], t0: performance.now(), speed: o.speed || 1, xp0: o.hero.xp ?? 0, done: false, raf: 0, last: performance.now(), armed: false };
    root.hidden = false; endCard.hidden = true; hud.classList.add("o3-battling"); banner.textContent = B.title; caption.textContent = ""; caption.className = "btl-caption"; logEl.textContent = "";
    foesEl.textContent = ""; heroesEl.textContent = ""; foesEl.dataset.n = String(B.foes.length);
    B.foes.forEach((f) => { f.ui = foeCard(f.m, f.k, B.foes.length); foesEl.appendChild(f.ui.el); });
    B.hero.ui = heroCard(B.hero); heroesEl.appendChild(B.hero.ui.el);
    renderParty(); renderFoes(); showMenu(null); say(o.intro || "Something squeaks at you. Your turn comes when your gauge fills.", "sys");
    audio?.sfx?.("whoosh"); B.last = performance.now(); B.raf = requestAnimationFrame(loop); return true;
  }
  function finish(outcome, extra = {}) { if (!B || B.done) return; B.done = true; cancelAnimationFrame(B.raf); const R = B.R;
    if (outcome === "win" && !extra.silent) { B.hero.ui.el.classList.remove("ready", "active"); B.hero.ui.el.classList.add("win"); setPose(B.hero.ui, "victory"); const s = R.summary ? R.summary(B) : null; showEnd(s); return; }
    close(outcome); }
  function close(outcome) { if (!B) return; const R = B.R; root.hidden = true; endCard.hidden = true; hud.classList.remove("o3-battling"); menu.textContent = ""; const was = B; B = null; R.onEnd?.(outcome, was); }
  function showEnd(s) { endCard.textContent = ""; endCard.hidden = false; menu.textContent = "";
    endCard.appendChild(el("h3", null, s?.title || "🎉 Scuffle won!")); (s?.lines || []).forEach((t) => endCard.appendChild(el("p", null, t)));
    const go = el("button", "btl-big", "▶ Carry on"); go.dataset.btl = "carry-on"; go.onclick = () => close("win"); endCard.appendChild(go); setTimeout(() => go.focus({ preventScroll: true }), 30); audio?.sfx?.("chime"); }

  // ---------- the loop: gauges fill only when nobody is choosing or moving ----------
  function loop(now) { if (!B || B.done) return; B.raf = requestAnimationFrame(loop); const dt = Math.min(0.1, (now - B.last) / 1000) / B.speed; B.last = now;
    const R = B.R; if (R.isKO()) { finish("ko"); return; }
    const alive = B.foes.filter((f) => R.alive(f.m)); if (!alive.length) { finish("win"); return; }
    if (!B.busy && !B.menuOpen) {
      B.hero.g = Math.min(1, B.hero.g + dt / B.hero.fill); alive.forEach((f) => { f.g = Math.min(1, f.g + dt / f.fill); });
      // whoever is full goes next; you win ties (so the menu pops before anything swings)
      if (B.hero.g >= 1) openMenu(); else { const f = alive.filter((q) => q.g >= 1).sort((a, b) => b.g - a.g)[0]; if (f) foeTurn(f); }
    }
    renderGauges(); }
  function renderGauges() { if (!B) return; B.hero.atbF && (B.hero.atbF.style.width = B.hero.g * 100 + "%"); B.hero.ready?.classList.toggle("ready", B.hero.g >= 1); const rd = B.hero.g >= 1 && !B.done && !B.busy; if (B.hero.ui && B.hero.ui.el.classList.contains("ready") !== rd) { B.hero.ui.el.classList.toggle("ready", rd); if (!B.busy) setPose(B.hero.ui, rd ? "hold" : "idle"); }
    B.foes.forEach((f) => { f.ui.atbF.style.width = f.g * 100 + "%"; }); }
  function renderParty() { const h = B.hero, R = B.R, st = R.hero(); partyEl.textContent = ""; const row = el("div", "btl-prow"); row.dataset.btl = "party-row";
    row.appendChild(el("b", null, st.name)); const hp = el("div", "btl-php"), hpF = el("i"), hpT = el("span", null, `❤️ ${st.hp}/${st.maxHp}`); hp.append(hpF, hpT); hpF.style.width = clamp(st.hp / st.maxHp, 0, 1) * 100 + "%";
    hp.classList.toggle("low", st.hp / st.maxHp <= 0.3); const atb = el("div", "btl-patb"), atbF = el("i"); atb.appendChild(atbF); atb.appendChild(el("span", null, "turn"));
    row.append(hp, atb); partyEl.appendChild(row); h.atbF = atbF; h.ready = atb; renderGauges(); }
  function renderFoes() { B.foes.forEach((f) => { const a = B.R.alive(f.m); f.ui.el.classList.toggle("down", !a); f.ui.hpF.style.width = clamp(f.m.hp / f.m.maxHp, 0, 1) * 100 + "%"; f.ui.el.title = `${f.m.name} · ${Math.max(0, f.m.hp)}/${f.m.maxHp} HP`; }); }
  function say(t, kind = "") { if (!B) return; B.log.push(t); caption.textContent = t; caption.className = "btl-caption show " + kind; const r = el("div", "btl-l " + kind, t); logEl.appendChild(r); while (logEl.children.length > 3) logEl.firstChild.remove(); }
  function pop(target, text, kind) { const r = target.getBoundingClientRect(), s = root.getBoundingClientRect(); const d = el("div", "btl-num " + (kind || ""), text);
    d.style.left = r.left - s.left + r.width / 2 + "px"; d.style.top = r.top - s.top + r.height * 0.25 + "px"; fxEl.appendChild(d); setTimeout(() => d.remove(), 1300 * (B?.speed || 1)); }
  function anim(node, cls, ms) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); }

  // ---------- your turn: big buttons, no timer ----------
  function openMenu() { if (B.menuOpen) return; B.menuOpen = true; B.hero.ui.el.classList.add("active"); audio?.sfx?.("blip"); showMenu("main"); say(`${B.R.hero().name}'s turn. Take your time.`, "you"); }
  function btn(label, key, fn, cls = "") { const b = el("button", "btl-cmd " + cls); b.innerHTML = ""; b.appendChild(el("span", "ic", label[0])); b.appendChild(el("span", "tx", label[1])); if (label[2]) b.appendChild(el("small", null, label[2])); b.dataset.btl = key; b.onclick = fn; return b; }
  function showMenu(kind) { if (!B) return; menu.textContent = ""; menu.dataset.kind = kind || "wait"; B.picking = null; B.foes.forEach((f) => f.ui.el.classList.remove("pickable"));
    if (!kind) { menu.appendChild(el("p", "btl-waiting", "⏳ Waiting for your turn…")); return; }
    const R = B.R;
    if (kind === "main") { const ab = R.ability(), items = R.items(), potions = items.reduce((a, it) => a + it.count, 0);
      menu.append(btn(["⚔️", "Attack", B.armed ? "📝 rolling twice" : R.weaponName()], "cmd-attack", () => chooseTarget("attack")),
        btn([ab.icon, ab.short || ab.name, ab.used && !ab.armed ? "used this scuffle" : ab.armed ? "armed" : ab.hint || ""], "cmd-ability", () => doAbility(), ab.used && !ab.armed ? "off" : ""),
        btn(["🧪", "Item", potions ? `${potions} in your bag` : "bag is empty"], "cmd-item", () => (potions ? showMenu("items") : say("Your bag has nothing to drink. Maybe the next pickup.", "sys")), potions ? "" : "off"),
        btn(["🏃", "Flee", R.fleeHint()], "cmd-flee", () => doFlee())); return; }
    if (kind === "items") { R.items().forEach((it) => menu.appendChild(btn([it.icon || "🍲", it.name, `×${it.count} · ${it.hint || ""}`], "item-" + it.id, () => act(async () => { R.useItem(it.id); }, "item"))));
      menu.appendChild(btn(["←", "Back", ""], "cmd-back", () => showMenu("main"), "back")); return; }
    if (kind === "target") { const live = B.foes.filter((f) => R.alive(f.m));
      live.forEach((f) => { f.ui.el.classList.add("pickable"); menu.appendChild(btn(["🎯", f.m.name, `${Math.max(0, f.m.hp)}/${f.m.maxHp} HP`], "target-" + f.k, () => B.picking(f.k), "tgt")); });
      menu.appendChild(btn(["←", "Back", ""], "cmd-back", () => showMenu("main"), "back")); }
  }
  function chooseTarget(what) { const R = B.R, live = B.foes.filter((f) => R.alive(f.m)); if (!live.length) return;
    const go = (k) => { const f = B.foes[k]; if (!f || !R.alive(f.m)) return; what === "attack" ? doAttack(f) : doGizmo(f); };
    if (live.length === 1) return go(live[0].k); showMenu("target"); B.picking = go; say(what === "attack" ? "Who gets it? Tap a critter." : "Fling it at whom? Tap a critter.", "you"); }
  // run one of your moves: menu closes, gauges stay paused until it has played out, then your gauge starts over
  async function act(fn, kind) { if (!B || B.busy) return; B.busy = true; showMenu(null); B.foes.forEach((f) => f.ui.el.classList.remove("pickable"));
    const n0 = B.R.logCount(); try { await fn(); } catch (e) { console.warn("battle move failed", e); } if (B && !B.done) setTimeout(() => B && !B.done && setPose(B.hero.ui, "idle"), C.lunge + 160);
    const lines = B?.R.logsSince(n0) || []; if (lines.length) say(lines[lines.length - 1], kind);
    if (!B) return; renderParty(); renderFoes(); await wait(C.hold); if (!B) return;
    B.turns++; B.hero.g = 0; B.menuOpen = false; B.hero.ui.el.classList.remove("active"); B.busy = false; showMenu(null); }
  function doAttack(f) { act(async () => { const R = B.R, hp0 = f.m.hp; B.hero.ui.el.classList.remove("ready"); setPose(B.hero.ui, "attack"); anim(B.hero.ui.el, "lunge-l", C.lunge + 60); anim(B.hero.ui.el, "atk", C.lunge + 140); await wait(C.lunge * 0.6);
      const r = R.attack(f.m, B.armed); B.armed = false; if (!r) return; const dmg = Math.max(0, hp0 - Math.max(0, f.m.hp));
      if (r.hit) { anim(f.ui.el, "hit", 450); pop(f.ui.spr, r.crit ? `${dmg}!` : String(dmg), r.crit ? "crit" : "dmg"); } else pop(f.ui.spr, r.fumble ? "oops" : "miss", "miss");
      if (!R.alive(f.m)) setTimeout(() => f.ui.el.classList.add("down"), 250); }, "hit"); }
  function doGizmo(f) { act(async () => { const R = B.R, hp0 = f.m.hp; anim(B.hero.ui.el, "cast", 500); await wait(300); R.useAbility(f.m); const dmg = Math.max(0, hp0 - Math.max(0, f.m.hp));
      anim(f.ui.el, "hit", 450); pop(f.ui.spr, String(dmg), "dmg"); if (!R.alive(f.m)) setTimeout(() => f.ui.el.classList.add("down"), 250); }, "hit"); }
  function doAbility() { const R = B.R, ab = R.ability(); if (ab.used && !ab.armed) { say(`${ab.name} is used up for this scuffle.`, "sys"); return; }
    if (ab.kind === "arm") { if (ab.armed || B.armed) { say(`${ab.name} is already ready. Pick Attack.`, "sys"); return; } if (R.useAbility(null)) { B.armed = true; say(`${ab.icon} ${ab.name} ready: your next Attack rolls two d20s. Still your turn.`, "you"); showMenu("main"); } return; }
    if (ab.kind === "target") return chooseTarget("gizmo");
    const hpB = R.hero().hp; if (ab.kind === "heal" && hpB >= R.hero().maxHp) { say("You're not out of breath yet. Still your turn.", "sys"); return; }
    act(async () => { anim(B.hero.ui.el, "cast", 500); await wait(250); R.useAbility(null); const got = R.hero().hp - hpB; if (got > 0) pop(B.hero.ui.spr, "+" + got, "heal"); }, "heal"); }
  function doFlee() { act(async () => { const R = B.R, r = R.flee(); say(r.text, r.ok ? "sys" : "miss"); if (r.ok) { anim(B.hero.ui.el, "flee", 600); await wait(650); finish("fled"); } }, "sys"); }

  // ---------- their turn: one at a time, with a visible beat ----------
  async function foeTurn(f) { if (!B || B.busy) return; B.busy = true; const R = B.R, hp0 = R.hero().hp;
    f.ui.el.classList.add("active"); say(`${f.m.icon || ""} ${f.m.name} is up…`, "foe"); await wait(380); if (!B) return;
    anim(f.ui.el, "lunge-r", C.lunge + 60); anim(f.ui.el, "atk", C.lunge + 140); await wait(C.lunge * 0.6); if (!B) return;
    const n0 = R.logCount(); R.foeAct(f.m); const lines = R.logsSince(n0); if (!B) return; const lost = hp0 - R.hero().hp;
    if (lost > 0) { anim(B.hero.ui.el, "hit", 450); setPose(B.hero.ui, "hurt"); setTimeout(() => B && !B.done && setPose(B.hero.ui, "idle"), 520); pop(B.hero.ui.spr, "−" + lost, "ouch"); } else pop(B.hero.ui.spr, "miss", "miss");
    if (lines.length) say(lines[lines.length - 1], lost > 0 ? "ouch" : "miss");
    renderParty(); if (R.isKO()) { finish("ko"); return; } await wait(C.foeCaption); if (!B) return;
    f.g = 0; f.ui.el.classList.remove("active"); B.busy = false; }

  // keyboard (desktop): 1–4 = commands, Esc = back, digits pick targets in the target list
  addEventListener("keydown", (e) => { if (!B || B.done) { if (B?.done && !endCard.hidden && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); endCard.querySelector("button")?.click(); } return; }
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; e.stopImmediatePropagation();
    const bs = [...menu.querySelectorAll("button")]; const n = parseInt(e.key, 10); if (n >= 1 && n <= bs.length) { e.preventDefault(); bs[n - 1].click(); return; }
    if (e.key === "Escape") { e.preventDefault(); if (menu.dataset.kind && menu.dataset.kind !== "main" && menu.dataset.kind !== "wait") showMenu("main"); } }, true);

  return { start, active: () => !!B, end: (o = "abort") => { if (B) { B.done = true; cancelAnimationFrame(B.raf); close(o); } },
    state: () => B && { title: B.title, hero: { g: +B.hero.g.toFixed(2), fill: B.hero.fill }, foes: B.foes.map((f) => ({ name: f.m.name, hp: f.m.hp, alive: B.R.alive(f.m), g: +f.g.toFixed(2) })), menu: menu.dataset.kind, menuOpen: B.menuOpen, busy: B.busy, turns: B.turns, log: B.log.slice(-6), pose: B.hero.ui?.el.dataset.pose || "idle", heroCls: B.hero.ui ? [...B.hero.ui.el.classList].filter((c) => c !== "btl-fighter") : [], armed: B.armed, done: B.done, ended: !endCard.hidden },
    setSpeed: (s) => { if (B) B.speed = s; C.speed = s; }, root };
}
