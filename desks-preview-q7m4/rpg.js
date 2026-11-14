// Elsewhere Annex v4: Annex characters, d20 checks, silly gear, critters, quests, dice doors, party portals + instances.
// Eclectic Transformation · Gremlin Desks only. Rules data: data/annex-rpg.json. d20 math follows SRD 5.2.1 (CC-BY-4.0, see README).
// Only standard dice exist here: d4, d6, d8, d10, d12, d20. Normal exploration is SOLO; party size (1-3) applies only inside
// party-portal instances. Character + world state is per player in localStorage, shaped so a Supabase row can hold it later.
// v4b: a starter Training Closet instance (nothing counts: no XP / loot / quests, harmless knockouts) + a hidden dev sandbox panel.
// v5: level cap 25 + XP falloff by content level, the Mailroom starter run (solo, real XP), gate instances that wake per-character waystones,
//     hooks for the admin-only Control Room (control.js), game-master spawns in front of a player, and party members filled by annex-net.js.
export function createRPG(ctx) {
  const { THREE, box, canvasTex, plate, cplane, root, host, el, audio, AX, AZ, C, C2, HW, R, walkable, hsh, ck, depthOf, startSec, sectionOf, place, refreshBlockers, chunks, fill, setPlayerName, deskName, hubSpawn, safeSpawn, OV } = ctx;
  let D = null; const pickH = (arr, u) => arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];
  const W3 = (x, y, z) => ({ x: AX + x, y, z: AZ + z });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- dice (standard set only) ----------
  const DICE = new Set([4, 6, 8, 10, 12, 20]);
  let rng = Math.random; const forced = [];
  function seed(n) { let a = n >>> 0; rng = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function roll(n) { if (!DICE.has(n)) throw new Error("Only d4, d6, d8, d10, d12 and d20 exist in the Annex (asked for d" + n + ")"); if (n === 20 && forced.length) return forced.shift(); return 1 + Math.floor(rng() * n); }
  const rollN = (k, n) => { let s = 0; const r = []; for (let i = 0; i < k; i++) { const v = roll(n); r.push(v); s += v; } return { s, r }; };
  const mod = (s) => Math.floor((s - 10) / 2);
  const sg = (v) => (v >= 0 ? "+" + v : "" + v);
  const rpick = (a) => a[Math.floor(rng() * a.length)];

  // ---------- saved state ----------
  const KEY = "et-desks-annex-rpg-v1:" + (host.me?.id || "anon");
  const blank = () => ({ v: 1, character: null, quests: {}, stash: [], world: { mobs: {}, doors: {}, loot: {}, bosses: {} }, counters: {}, flags: {}, lastCrystal: null });
  let S = blank();
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object") S = { ...blank(), ...s, world: { ...blank().world, ...(s.world || {}) } }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...S, ...(trainSnap || {}), updated_at: new Date().toISOString() })); } catch {} }; // in training only the pre-closet snapshot is ever written
  const CH = () => S.character;

  // ---------- session state ----------
  let transformed = false, inAnnex = false, cd = 0, footArmed = false, abilityUsed = false, fightGroup = null, koBusy = false, koSpeed = 1, regenT = 0, nudgeT = 0, nudges = 0, leftStart = false;
  const logs = []; let lastAttack = null, lastKO = null, lastLevelUp = null, lastDoor = null;
  const urlParty = (() => { try { return parseInt(new URLSearchParams(location.search).get("party"), 10) || 0; } catch { return 0; } })();
  const party = { id: null, members: [{ id: host.me?.id || "me", me: true }], max: 3, instance: null }; // later: Supabase realtime fills members per instance

  // ---------- derived numbers ----------
  const item = (id) => D?.items[id] || null;
  const level = () => { const c = CH(); if (!c) return 1; let L = 1; D.levels.xp.forEach((t, i) => { if (c.xp >= t) L = i + 1; }); return L; };
  const prof = () => D.levels.prof[level() - 1];
  function stat(k) { const c = CH(); let v = c.stats[k]; (c.status || []).forEach((s) => (v += s.statMod?.[k] || 0)); return v; }
  const gearItems = () => Object.values(CH().gear || {}).filter(Boolean).map(item).filter(Boolean);
  function maxHp() { const c = CH(); if (!c) return 0; const m = mod(stat("nerve")), L = level(); return Math.max(4, D.levels.hpBase + m) + (L - 1) * Math.max(1, D.levels.hpPerLevel + m); }
  const ac = () => 10 + mod(stat("stride")) + gearItems().reduce((a, it) => a + (it.ac || 0), 0);
  const weapon = () => item(CH().gear.weapon) || item("fists");
  const atkBonus = () => { const w = weapon(); return mod(stat(w.stat)) + prof() + (w.hit || 0) + gearItems().filter((it) => it.slot !== "weapon").reduce((a, it) => a + (it.hit || 0), 0); };
  const dmgMod = () => mod(stat(weapon().stat));
  const pathOf = () => D.paths[CH().path];
  function checkBonus(k, door) { const p = pathOf(); return mod(stat(k)) + (p.prof.includes(k) ? prof() : 0) + gearItems().reduce((a, it) => a + (it.check?.[k] || 0) + (door ? it.door || 0 : 0), 0); }
  const partySize = () => (!inst.active ? 1 : D?.instances[inst.id]?.solo ? 1 : isTraining() ? clamp(sbParty || 1, 1, sandboxOn ? (D?.party?.max || 3) : (TR().partyMax || 1)) : clamp(Math.max(party.members.length, urlParty || 1), 1, D?.party?.max || 3));
  const TR = () => D?.training || {};
  const isTraining = () => inst.active && !!D?.instances[inst.id]?.training;
  const isLocal = (() => { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); } catch { return false; } })();
  const urlSandbox = (() => { try { return new URLSearchParams(location.search).get("sandbox") === "1"; } catch { return false; } })();
  let sandboxOn = false, sandboxUsed = false, sbParty = 0, trainXP = 0, trainSnap = null, tipIdx = 0;
  const ext = {}; // v5 hooks set by control.js: buildControl, isAdmin, controlButtons, portalParty, onEnter, onLeave
  const isControl = () => inst.active && !!D?.instances[inst.id]?.control;
  const gmMobs = []; // v5: things a game master dropped into the world (never saved, never respawn)

  // ---------- HUD ----------
  const bar = el("div", "o3-rpgbar"); bar.hidden = true; host.hud.appendChild(bar);
  const bName = el("div", "o3-rpgname"), bHp = el("div", "o3-rpghp"), bHpF = el("i"), bHpT = el("span"), bXp = el("div", "o3-rpgxp"), bXpF = el("i"), bXpT = el("span");
  bHp.append(bHpF, bHpT); bXp.append(bXpF, bXpT);
  const bBtns = el("div", "o3-rpgbtns");
  const mk = (t, title, fn, key) => { const b = el("button", "o3-btn ghost o3-rpgb", t); b.title = title; b.setAttribute("aria-label", title); b.dataset.rpg = key; b.onclick = fn; bBtns.appendChild(b); return b; };
  mk("📜", "Character sheet (C)", () => toggle("sheet", openSheet), "sheet"); mk("🎒", "Gear & bag (I)", () => toggle("gear", openGear), "gear");
  mk("🗒", "Quest log (J)", () => toggle("quests", openQuests), "quests"); mk("🎲", "Dice log (L)", () => toggle("log", openLog), "log");
  const abBtn = mk("✨", "Ability (X)", () => useAbility(), "ability");
  bar.append(bName, bHp, bXp, bBtns);
  const dlog = el("div", "o3-dicelog"); dlog.hidden = true; host.hud.appendChild(dlog);
  const pop = el("div", "o3-dicepop"); host.hud.appendChild(pop);
  const fx = el("div", "o3-transform"); const fxT = el("b"); fx.appendChild(fxT); host.hud.appendChild(fx);
  const ko = el("div", "o3-ko"); const koT = el("p"); ko.appendChild(koT); host.hud.appendChild(ko);
  const hurtEl = el("div", "o3-hurt"); host.hud.appendChild(hurtEl);
  function renderBar() {
    const c = CH(); const show = transformed && inAnnex && !!c; bar.hidden = !show; dlog.hidden = !show; if (!show) return;
    const L = level(), mh = maxHp(), lo = D.levels.xp[L - 1], hi = D.levels.xp[L] ?? null;
    bName.textContent = `${pathOf().icon} ${c.name} · Lv ${L}${isTraining() ? " · 🎓 practice" : ""}`;
    bHpF.style.width = clamp(c.hp / mh, 0, 1) * 100 + "%"; bHpT.textContent = `❤️ ${c.hp}/${mh}`;
    bXpF.style.width = (hi == null ? 100 : clamp((c.xp - lo) / (hi - lo), 0, 1) * 100) + "%"; bXpT.textContent = hi == null ? `⭐ ${c.xp} XP (max level)` : `⭐ ${c.xp}/${hi} XP`;
    const ab = pathOf().ability; abBtn.textContent = ab.icon; abBtn.title = `${ab.name} (X)${abilityUsed ? " · used this scuffle" : ""}`; abBtn.disabled = abilityUsed && !footArmed; abBtn.classList.toggle("armed", footArmed);
  }
  function addLog(t, kind = "") { logs.push({ t, kind, at: Date.now() }); if (logs.length > 60) logs.shift();
    const row = el("div", "o3-dl " + kind, t); dlog.appendChild(row); while (dlog.children.length > 5) dlog.firstChild.remove(); setTimeout(() => row.classList.add("old"), 7000); }
  function popup(t, kind = "") { pop.textContent = t; pop.className = "o3-dicepop show " + kind; clearTimeout(pop._h); pop._h = setTimeout(() => (pop.className = "o3-dicepop"), 1700); }
  let openKind = null;
  function toggle(kind, fn) { if (!transformed) return; if (openKind === kind && host.state().busy) { host.closePanel(); return; } if (host.state().busy) host.closePanel(); fn(); }
  const panel = (kind, title, build, opt = {}) => { host.openPanel(title, (pn) => { pn.dataset.rpgPanel = kind; build(pn); }, { ...opt, onClose: () => { if (openKind === kind) openKind = null; opt.onClose?.(); } }); openKind = kind; };
  addEventListener("keydown", (e) => {
    if (!inAnnex || !transformed || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.repeat) return;
    const k = e.key.toLowerCase(); const map = { c: ["sheet", openSheet], i: ["gear", openGear], j: ["quests", openQuests], l: ["log", openLog] };
    if (map[k]) { e.preventDefault(); toggle(...map[k]); } else if (k === "x" && !host.state().busy) { e.preventDefault(); useAbility(); }
  });

  // ---------- shared looks ----------
  const MC = new Map(); const M = (k, fn) => { let v = MC.get(k); if (!v) { v = fn(); MC.set(k, v); } return v; };
  const sm = (c, o = {}) => M("m:" + c + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o }));
  const G = (k, fn) => M("g:" + k, fn);
  const d20Tex = (label, sub) => M("t:door:" + label + sub, () => canvasTex(256, 420, (c, w, h) => { c.fillStyle = "#7a5a3a"; c.fillRect(0, 0, w, h); c.strokeStyle = "#4a3422"; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
    c.fillStyle = "#f3e7c2"; c.beginPath(); const cx = w / 2, cy = 170, r = 78; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); c.fill();
    c.fillStyle = "#7a2a1e"; c.font = "bold 64px system-ui"; c.textAlign = "center"; c.fillText("20", cx, cy + 22); c.fillStyle = "#fbf3d0"; c.font = "bold 34px system-ui"; c.fillText(label, cx, 300); c.font = "26px system-ui"; c.fillText(sub, cx, 340);
    c.fillStyle = "#e6c35a"; c.beginPath(); c.arc(w - 50, 250, 12, 0, 7); c.fill(); }));

  function makeMobMesh(kind, parent, big = 1) {
    const g = new THREE.Group(); parent.add(g); const body = new THREE.Group(); g.add(body); const parts = {}; body.scale.setScalar(big);
    const eye = sm("#111111"), eyeR = sm("#ff5a3a", { emissive: "#ff3a1a", emissiveIntensity: 1 });
    if (kind === "dust") { const m = sm("#9a958a", { roughness: 1 }); const b = new THREE.Mesh(G("sph", () => new THREE.IcosahedronGeometry(0.3, 1)), m); b.scale.set(1, 0.82, 1); b.position.y = 0.26; body.add(b); parts.b = b;
      [-0.1, 0.1].forEach((x) => { const e = box(x, 0.62, -0.02, 0.06, 0.26, 0.04, m, body); e.rotation.z = x * 2; box(x * 0.9, 0.32, 0.27, 0.05, 0.05, 0.02, eye, body); }); }
    else if (kind === "moth") { const m = sm("#cfd8e8", { emissive: "#8fb0ff", emissiveIntensity: 0.5 }); box(0, 0, 0, 0.09, 0.09, 0.3, m, body); parts.w = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.x = s * 0.04; body.add(p); box(s * 0.18, 0, 0, 0.34, 0.01, 0.26, m, p); return p; }); body.position.y = 1.35; parts.fly = 1.35; }
    else if (kind === "sock") { const m = sm("#c6b3e0", { transparent: true, opacity: 0.85 }); const s = new THREE.Mesh(G("sock", () => new THREE.CylinderGeometry(0.15, 0.2, 0.85, 8)), m); s.position.y = 0.75; body.add(s); box(0, 0.36, 0.12, 0.3, 0.22, 0.42, m, body); box(0, 1.2, 0, 0.32, 0.08, 0.32, sm("#ffffff"), body);
      box(-0.06, 0.95, 0.18, 0.05, 0.05, 0.02, eye, body); box(0.06, 0.95, 0.18, 0.05, 0.05, 0.02, eye, body); parts.bob = true; }
    else if (kind === "wisp") { const m = sm("#7ff0d8", { emissive: "#3fd8b8", emissiveIntensity: 1.1 }); const b = new THREE.Mesh(G("wisp", () => new THREE.IcosahedronGeometry(0.2, 0)), m); body.add(b);
      const nm = sm("#1a3a34"); box(0.26, 0.12, 0, 0.03, 0.2, 0.03, nm, body); box(0.22, 0.03, 0, 0.09, 0.07, 0.05, nm, body); body.position.y = 1.3; parts.fly = 1.3; }
    else if (kind === "dummy" || kind === "tboss") { const m = sm(kind === "tboss" ? "#c96a3a" : "#d8b98a", { roughness: 1 }), st = sm("#6f5a3e");
      box(0, 0.25, 0, 0.08, 0.5, 0.08, st, body); box(0, 0.03, 0, 0.5, 0.06, 0.5, st, body); const t = new THREE.Mesh(G("dtorso", () => new THREE.CylinderGeometry(0.2, 0.24, 0.6, 10)), m); t.position.y = 0.8; body.add(t);
      const h = new THREE.Mesh(G("dhead", () => new THREE.IcosahedronGeometry(0.17, 1)), m); h.position.y = 1.27; body.add(h); box(0, 0.85, 0.235, 0.22, 0.22, 0.01, sm("#b8483a"), body); box(0, 0.85, 0.24, 0.1, 0.1, 0.01, sm("#f4efd9"), body);
      box(-0.06, 1.3, 0.16, 0.04, 0.04, 0.02, eye, body); box(0.06, 1.3, 0.16, 0.04, 0.04, 0.02, eye, body); parts.top = null;
      if (kind === "tboss") { box(0, 1.44, 0, 0.34, 0.06, 0.34, sm("#2a4a8a"), body); box(0, 1.42, 0.2, 0.3, 0.03, 0.14, sm("#2a4a8a"), body); box(0.24, 0.95, 0.12, 0.22, 0.3, 0.02, sm("#f4efd9"), body); } else parts.bob = true; }
    else if (kind === "cabinet" || kind === "boss") { const m = sm(kind === "boss" ? "#6f7a5a" : "#7d8a78", { metalness: 0.3, roughness: 0.6 }), line = sm("#2b2f28");
      box(0, 0.55, 0, 0.62, 1.1, 0.55, m, body); [0.3, 0.62].forEach((y) => { box(0, y, 0.28, 0.5, 0.02, 0.01, line, body); box(0, y - 0.12, 0.285, 0.14, 0.04, 0.02, sm("#c9c2a2"), body); });
      const top = new THREE.Group(); top.position.set(0, 0.98, 0); body.add(top); box(0, 0, 0.02, 0.6, 0.22, 0.52, m, top); box(0, -0.02, 0.29, 0.16, 0.04, 0.02, sm("#c9c2a2"), top);
      for (let i = 0; i < 5; i++) box(-0.22 + i * 0.11, -0.1, 0.3, 0.04, 0.06, 0.02, sm("#f4efd9"), top); parts.top = top;
      box(-0.13, 1.18, 0.27, 0.07, 0.05, 0.02, kind === "boss" ? eyeR : eye, body); box(0.13, 1.18, 0.27, 0.07, 0.05, 0.02, kind === "boss" ? eyeR : eye, body); }
    else { const m = sm("#f4f1e6", { side: THREE.DoubleSide }); parts.w = [-1, 1].map((s) => { const p = new THREE.Group(); body.add(p); box(s * 0.12, 0, 0, 0.24, 0.01, 0.3, m, p); return p; }); box(0, 0, 0, 0.04, 0.04, 0.3, sm("#d8d0bc"), body); body.position.y = 1.2; parts.fly = 1.2; }
    const barG = new THREE.Group(); barG.position.y = parts.fly ? 1.85 : kind === "dummy" || kind === "tboss" ? 1.7 : kind === "sock" ? 1.55 : kind === "boss" ? 2.8 : kind === "cabinet" ? 1.5 : 0.95; g.add(barG);
    box(0, 0, 0, 0.62, 0.08, 0.02, sm("#1a1a18"), barG); const fg = box(0, 0, 0.012, 0.58, 0.05, 0.02, sm("#d8452e", { emissive: "#b0301e", emissiveIntensity: 0.6 }), barG);
    const zz = cplane(M("t:zz", () => canvasTex(96, 64, (c) => { c.fillStyle = "#3a4a33"; c.font = "bold 40px system-ui"; c.fillText("z z", 10, 46); })), 0.4, 0.27, 0, 0.25, 0, 0, barG, { transparent: true });
    return { g, body, parts, barG, fg, zz, big };
  }

  // ---------- plans: what the RPG layer adds to a cell (pure; same seed = same answer) ----------
  const portalByCell = new Map();
  function rpgPlan(pl) {
    const out = { mob: null, door: null, box: null, portal: portalByCell.get(pl.key) || null }; if (!D || pl.center || pl.dead) return out;
    const { i, j } = pl, dep = depthOf(i, j), Mb = D.mobs, tier = Math.min(4, Math.floor(dep / (Mb.tierEvery || 3)));
    const elig = pl.rooms.filter((r) => !r.grab && !r.npc && !r.curio && !r.stair && !r.sw), used = new Set();
    const take = (tag) => { const pool = elig.filter((r) => !used.has(r.qi)); if (!pool.length) return null; const r = pool[Math.floor(hsh(i, j, "rpg-" + tag + "q", pl.ep) * pool.length)]; used.add(r.qi); return r; };
    if (dep >= Mb.minDepth && hsh(i, j, "rpg-mob") < Math.min(Mb.chanceMax, Mb.chance + Mb.chancePerDepth * dep)) { const r = take("mob");
      if (r) { const pool = Mb.bySection[pl.S.id] || ["dust"], n = Mb.count[0] + Math.floor(hsh(i, j, "rpg-n") * (Mb.count[1] - Mb.count[0] + 1));
        out.mob = { qi: r.qi, tier, kinds: Array.from({ length: n }, (_, k) => pickH(pool, hsh(i, j, "rpg-k", k))), cleared: !!S.world.mobs[pl.key] }; } }
    const Dd = D.doors; if (dep >= Dd.minDepth && hsh(i, j, "rpg-door") < Dd.chance) { const r = take("door");
      if (r) out.door = { qi: r.qi, stat: pickH(Dd.stats, hsh(i, j, "rpg-ds")), dc: Dd.dc[tier], open: !!S.world.doors[pl.key], chest: !S.world.loot["door:" + pl.key], tier }; }
    const Bx = D.boxes; if (dep >= Bx.minDepth && hsh(i, j, "rpg-box") < Bx.chance) { const r = take("box"); if (r) out.box = { qi: r.qi, taken: !!S.world.loot[pl.key], tier }; }
    return out;
  }
  function scaled(kind, tier) { const b = D.enemies[kind], sc = D.mobs.scale;
    return { kind, def: b, name: b.name, icon: b.icon, maxHp: Math.max(1, Math.round(b.hp * (1 + sc.hpPerTier * tier))), ac: b.ac + Math.floor(tier / 2) * sc.acPerTwoTiers, atk: b.atk + Math.floor(tier * sc.atkPerTier), die: b.die, dmgB: Math.floor(tier * sc.dmgPerTier), xp: Math.round(b.xp * (1 + sc.xpPerTier * tier)), speed: b.speed, every: b.every, clvl: (b.level || 1) + tier }; }
  function newMob(st, m, x, z, rect, zone, ch, id) { m.g.position.set(x, 0, z); const mob = { ...st, ...m, hp: st.maxHp, rect, home: [x, z], zone, ch, cd: 1.2, dead: false, deadT: 0, ph: Math.random() * 5, id, hitT: 0, n: 0, state: "idle" };
    m.g.traverse((o) => { if (o.isMesh) { o.userData.run = () => attackMob(mob); o.userData.maxD = 6; } }); mob.hitMesh = m.body.children[0]; return mob; }

  // ---------- building into a streamed cell ----------
  function onCell(ch) {
    if (!D || ch.rpg) return; const pl = ch.pl, P = rpgPlan(pl); ch.rpg = { P, mobs: [], door: null, box: null, box2: null, portal: null, drops: [] };
    const roomOf = (qi) => pl.rooms.find((r) => r.qi === qi), zoneOf = (qi) => `annex:c:${pl.key}:r${qi}`;
    if (P.mob && !P.mob.cleared) { const rm = roomOf(P.mob.qi), rect = { x0: rm.x0 + 0.5, x1: rm.x1 - 0.5, z0: rm.z0 + 0.5, z1: rm.z1 - 0.5 }, n = P.mob.kinds.length;
      P.mob.kinds.forEach((k, idx) => { const hx = rect.x0 + (idx + 1) * (rect.x1 - rect.x0) / (n + 1), hz = clamp((rect.z0 + rect.z1) / 2 + (idx % 2 ? 0.6 : -0.6), rect.z0, rect.z1);
        ch.rpg.mobs.push(newMob(scaled(k, P.mob.tier), makeMobMesh(k, ch.g), hx, hz, rect, zoneOf(P.mob.qi), ch, pl.key + ":" + idx)); }); }
    if (P.door) { const rm = roomOf(P.door.qi), dd = rm.door, lx = ch.lx, lz = ch.lz, label = D.stats.find((s) => s.id === P.door.stat).name.toUpperCase();
      const g = new THREE.Group(); ch.g.add(g); const tex = d20Tex(label, "DC " + P.door.dc), dm = sm("#7a5a3a");
      if (dd.line === "x") { box(dd.at, 1.1, dd.c, 0.08, 2.2, dd.w - 0.04, dm, g); const o = rm.sx > 0 ? -1 : 1; cplane(tex, 0.75, 1.25, dd.at + o * 0.05, 1.2, dd.c, o > 0 ? Math.PI / 2 : -Math.PI / 2, g); }
      else { box(dd.c, 1.1, dd.at, dd.w - 0.04, 2.2, 0.08, dm, g); const o = rm.sz > 0 ? -1 : 1; cplane(tex, 0.75, 1.25, dd.c, 1.2, dd.at + o * 0.05, o > 0 ? 0 : Math.PI, g); }
      const blk = dd.line === "x" ? { x0: lx + dd.at - 0.1 - R, x1: lx + dd.at + 0.1 + R, z0: lz + dd.c - dd.w / 2, z1: lz + dd.c + dd.w / 2 } : { x0: lx + dd.c - dd.w / 2, x1: lx + dd.c + dd.w / 2, z0: lz + dd.at - 0.1 - R, z1: lz + dd.at + 0.1 + R };
      const door = { P: P.door, g, blk, rm, ch, key: pl.key, lx: lx + (dd.line === "x" ? dd.at : dd.c), lz: lz + (dd.line === "x" ? dd.c : dd.at), waitUntil: 0, open: P.door.open, swing: 0 };
      if (door.open) g.visible = false; else ch.blockers.push(blk); ch.rpg.door = door;
      if (P.door.chest) ch.rpg.box = makeBox(ch, rm, "door:" + pl.key, P.door.tier, true); }
    if (P.box && !P.box.taken) ch.rpg.box2 = makeBox(ch, roomOf(P.box.qi), pl.key, P.box.tier, false);
    if (P.portal) ch.rpg.portal = makePortal(ch, P.portal);
    if (pl.center && TR().enabled && pl.i === startSec.center[0] && pl.j === startSec.center[1]) ch.rpg.tportal = makeTrainingPortal(ch, pl);
    if (pl.center && D.instances.starter && pl.i === startSec.center[0] && pl.j === startSec.center[1]) ch.rpg.sportal = makeStarterPortal(ch, pl);
  }
  function makeBox(ch, rm, key, tier, chest) { const g = new THREE.Group(); const x = rm.sx > 0 ? rm.x1 - 0.8 : rm.x0 + 0.8, z = rm.sz > 0 ? rm.z1 - 0.8 : rm.z0 + 0.8; g.position.set(x, 0, z); ch.g.add(g);
    const cm = sm(chest ? "#8a5a2a" : "#b08a5a", { roughness: 1 }); box(0, 0.2, 0, 0.5, 0.4, 0.4, cm, g); const lid = new THREE.Group(); lid.position.set(0, 0.4, -0.2); g.add(lid); box(0, 0.02, 0.2, 0.52, 0.05, 0.42, cm, lid);
    const q = cplane(M("t:q", () => canvasTex(64, 64, (c) => { c.fillStyle = "#f3d98b"; c.font = "bold 54px system-ui"; c.textAlign = "center"; c.fillText("?", 32, 52); })), 0.22, 0.22, 0, 0.2, 0.205, 0, g, { transparent: true });
    const spark = new THREE.Mesh(G("spark", () => new THREE.OctahedronGeometry(0.06, 0)), sm("#fffbe0", { emissive: "#fff2a8", emissiveIntensity: 1.2 })); spark.position.y = 0.75; g.add(spark);
    return { g, lid, spark, key, tier, chest, lx: ch.lx + x, lz: ch.lz + z, opened: false, q }; }
  const swirlTex = () => M("t:swirl", () => canvasTex(256, 256, (c) => { const g = c.createRadialGradient(128, 128, 10, 128, 128, 128); g.addColorStop(0, "#fff6d8"); g.addColorStop(0.35, "#b48cff"); g.addColorStop(1, "#2a1460"); c.fillStyle = g; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill();
    c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 6; for (let k = 0; k < 3; k++) { c.beginPath(); for (let t = 0; t < 60; t++) { const a = t * 0.18 + k * 2.1, r = t * 2; c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } c.stroke(); } }));
  function swirl(parent) { const ring = new THREE.Mesh(G("pring", () => new THREE.TorusGeometry(0.62, 0.07, 8, 28)), sm("#5b2db8", { emissive: "#7a4ae0", emissiveIntensity: 0.9 })); ring.position.y = 1.15; parent.add(ring);
    const disc = new THREE.Mesh(G("pdisc", () => new THREE.CircleGeometry(0.58, 28)), M("m:swirl", () => new THREE.MeshBasicMaterial({ map: swirlTex(), side: THREE.DoubleSide, transparent: true, opacity: 0.92 }))); disc.position.y = 1.15; parent.add(disc); return { ring, disc }; }
  function makePortal(ch, pp) { const g = new THREE.Group(), o = C2 + HW - 0.3; g.position.set(o, 0, o); g.rotation.y = -Math.PI / 4; ch.g.add(g); const { ring, disc } = swirl(g);
    box(0, 0.06, 0, 0.9, 0.12, 0.3, sm("#3a2a5a"), g);
    cplane(M("t:psign", () => plate("PARTY PORTAL", "1–3 explorers", { w: 640, h: 200, bg: "#3a2a5a", fg: "#f3e7ff", accent: "#b48cff" })), 1.1, 0.34, 0, 2.05, 0, 0, g, { side: THREE.DoubleSide });
    const p = { pp, g, disc, ring, lx: ch.lx + o, lz: ch.lz + o, i: ch.i, j: ch.j }; disc.userData.run = () => openPortal(p); disc.userData.maxD = 4.5; return p; }

  // ---------- the Training Closet door: in the first hallway off each arrival room ----------
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
  function trainingDoor(parent, x, y, z, rotY) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g);
    box(0, 1.05, -0.03, 1.15, 2.1, 0.04, sm("#7a5a3a"), g); box(0, 2.14, -0.02, 1.25, 0.08, 0.06, sm("#4a3422"), g); box(-0.62, 1.05, -0.02, 0.06, 2.1, 0.06, sm("#4a3422"), g); box(0.62, 1.05, -0.02, 0.06, 2.1, 0.06, sm("#4a3422"), g);
    const { ring, disc } = swirl(g); ring.position.z = 0.02; disc.position.z = 0.03; ring.material = sm("#2a8a6a", { emissive: "#3fd8a8", emissiveIntensity: 0.9 });
    cplane(M("t:tsign", () => plate(D.training.sign, D.training.signSub, { w: 720, h: 220, bg: "#2a5a4a", fg: "#f3fff4", accent: "#9ff0c8" })), 1.15, 0.35, 0, 2.45, 0.04, 0, g);
    return { g, ring, disc }; }
  function makeTrainingPortal(ch, pl) { const hs = C2 - (pl.hs ?? (C2 - 2)), PMg = C2 - (pl.hs ?? 6), mid = PMg / 2; const arm = ["zn", "xn", "xp", "zp"].find((d) => pl.arms[d]); if (!arm) return null;
    const def = D.training.portals.find((q) => q.where === "start"); let x, z, rot, sx, sz;
    if (arm[0] === "z") { z = arm === "zn" ? mid : C - mid; x = C2 - HW + 0.14; rot = Math.PI / 2; sx = C2 + 0.35; sz = z; } else { x = arm === "xn" ? mid : C - mid; z = C2 - HW + 0.14; rot = 0; sx = x; sz = C2 + 0.35; }
    const d = trainingDoor(ch.g, x, 0, z, rot); const tp = { def, ...d, lx: ch.lx + x, lz: ch.lz + z, y: 0, arm, spawn: { x: ch.lx + sx, z: ch.lz + sz, y: 0, yaw: yawTo(x - sx, z - sz) } };
    d.disc.userData.run = () => openTraining(tp); d.disc.userData.maxD = 4.5; return tp; }
  let ovTP = null;
  function buildOverlookTraining() { if (!OV || !TR().enabled) return; const def = D.training.portals.find((q) => q.where === "overlook"); if (!def) return; const x = OV.x0 + 5.8, z = OV.z1 - 0.14; // north wall, between the circle and the master crystal
    const d = trainingDoor(root, x, OV.y, z, Math.PI); ovTP = { def, ...d, lx: x, lz: z, y: OV.y, arm: "overlook", spawn: { x, z: z - 1.1, y: OV.y, yaw: yawTo(0, 1) } }; d.disc.userData.run = () => openTraining(ovTP); d.disc.userData.maxD = 4.5; }
  const tportals = () => { const out = []; chunks.forEach((ch) => ch.rpg?.tportal && out.push(ch.rpg.tportal)); if (ovTP) out.push(ovTP); return out; };

  // ---------- the transformation circles (entrance plaza + the Overlook) ----------
  const circles = [];
  function buildCircle(x, z, y, id) { const g = new THREE.Group(); g.position.set(x, y + 0.012, z); root.add(g);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshStandardMaterial({ color: "#fff0c0", emissive: "#ffd86a", emissiveIntensity: 0.55, transparent: true, opacity: 0.6 })); disc.rotation.x = -Math.PI / 2; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 6, 40), sm("#b8483a", { emissive: "#b8483a", emissiveIntensity: 0.5 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const sti = sm("#b8483a"); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, s = box(Math.cos(a) * 1.0, 0.02, Math.sin(a) * 1.0, 0.04, 0.02, 0.22, sti, g); s.rotation.y = -a + 0.6; }
    box(1.15, 0.7, -0.6, 0.06, 1.4, 0.06, sm("#6f5a3e"), g);
    cplane(M("t:csign", () => plate(D.circle.sign, D.circle.signSub, { w: 640, h: 220, bg: "#5b3a2e", fg: "#fbf3d0", accent: "#f3d98b" })), 0.9, 0.31, 1.15, 1.55, -0.6, 0, g, { side: THREE.DoubleSide });
    const c = { id, g, disc, ring, x, z, y, inside: false }; disc.userData.run = () => openCircle(); disc.userData.maxD = 5; circles.push(c); return c; }
  const startCircle = () => circles.find((c) => c.id === "start");

  // ---------- creator (3-question quiz -> suggestion -> player edits + approves) ----------
  const STATS = () => D.stats.map((s) => s.id);
  function suggest(answers) { const votes = { archivist: 0, wanderer: 0, tinkerer: 0 }; answers.forEach((p) => (votes[p] = (votes[p] || 0) + 1));
    const ix = (p) => { const i = answers.indexOf(p); return i < 0 ? 99 : i; }, path = Object.keys(votes).sort((a, b) => votes[b] - votes[a] || ix(a) - ix(b))[0];
    const base = {}; D.paths[path].order.forEach((k, i) => (base[k] = D.creation.standardArray[i])); return { path, base }; }
  const finalStats = (base, path) => { const o = { ...base }; o[D.paths[path].main] += 1; return o; };
  const pbCost = (base) => Object.values(base).reduce((a, v) => a + (D.creation.pointBuy.cost[v] ?? 99), 0);
  const cleanName = (s) => String(s || "").replace(/[<>{}\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
  function validBuild(b) { if (!D.paths[b.path] || !cleanName(b.name)) return false; const v = STATS().map((k) => b.base[k]);
    if (b.method === "array") return [...v].sort((a, c) => c - a).join() === [...D.creation.standardArray].sort((a, c) => c - a).join();
    return v.every((x) => x >= D.creation.pointBuy.min && x <= D.creation.pointBuy.max) && pbCost(b.base) <= D.creation.pointBuy.points; }
  function createChar(b) { if (!validBuild(b)) return false; const P = D.paths[b.path];
    S.character = { v: 1, name: cleanName(b.name), path: b.path, method: b.method, base: { ...b.base }, stats: finalStats(b.base, b.path), xp: 0, hp: 0, gear: { weapon: P.weapon, armor: null, head: null, trinket: null }, inv: [], status: [], pendingStat: 0, created_at: new Date().toISOString() };
    (D.startGear || []).forEach((id) => { const it = item(id); if (it && !S.character.gear[it.slot]) S.character.gear[it.slot] = id; });
    S.character.hp = maxHp(); S.quests = {}; S.stash = []; S.counters = {}; save(); return true; }
  function openCreator() {
    const answers = []; let qi = 0; const first = String(deskName() || "you").split(/\s+/)[0];
    const idea = () => pickH(D.creation.nameIdeas, rng()).replaceAll("{name}", first).replace("{n}", String(100 + Math.floor(rng() * 900)));
    panel("creator", "🧵 Who are you in here?", (pn) => {
      const body = el("div", "o3-creator"); pn.appendChild(body);
      const quiz = () => { body.textContent = ""; const q = D.creation.quiz[qi];
        body.appendChild(el("p", "o3-small", `Three quick questions and the Annex will suggest who you are in here. You can change everything after. (${qi + 1}/${D.creation.quiz.length})`));
        body.appendChild(el("p", "o3-riddle", q.q)); q.a.forEach((a, ai) => { const b = el("button", "o3-btn ghost o3-wide", a.t); b.dataset.rpg = "quiz-" + ai; b.onclick = () => { answers.push(a.path); qi++; audio.sfx("blip"); qi < D.creation.quiz.length ? quiz() : edit(suggest(answers)); }; body.appendChild(b); });
        const skip = el("button", "o3-btn ghost small", "Skip the quiz"); skip.dataset.rpg = "quiz-skip"; skip.onclick = () => edit(suggest(answers.length ? answers : ["wanderer"])); body.appendChild(skip); };
      const edit = (sug) => { body.textContent = ""; const b = { name: idea(), path: sug.path, method: "array", base: { ...sug.base } };
        body.appendChild(el("p", "o3-small", `The Annex thinks you're a ${D.paths[sug.path].icon} ${D.paths[sug.path].name}. Change anything you like, then approve it. Nothing saves until you do.`));
        const nl = el("label", null, "Name"); const ni = el("input"); ni.value = b.name; ni.maxLength = 24; ni.dataset.rpg = "name"; ni.oninput = () => { b.name = ni.value; draw(); }; body.append(nl, ni);
        const paths = el("div", "o3-paths"), mth = el("div", "o3-method"), tbl = el("div", "o3-stats"), sum = el("div", "o3-note"); body.append(paths, mth, tbl, sum);
        const ok = el("button", "o3-btn"); ok.dataset.rpg = "approve"; const err = el("p", "o3-small"); body.append(ok, err);
        function draw() {
          paths.textContent = ""; Object.entries(D.paths).forEach(([id, p]) => { const pb = el("button", "o3-pathcard" + (b.path === id ? " on" : "")); pb.dataset.rpg = "path-" + id; pb.append(el("b", null, `${p.icon} ${p.name}`), el("span", null, p.blurb)); pb.onclick = () => { b.path = id; draw(); }; paths.appendChild(pb); });
          mth.textContent = ""; [["array", `Standard array (${D.creation.standardArray.join(", ")})`], ["points", `Point buy (${D.creation.pointBuy.points} pts)`]].forEach(([id, t]) => { const mb = el("button", "o3-btn small" + (b.method === id ? "" : " ghost"), t); mb.dataset.rpg = "method-" + id;
            mb.onclick = () => { if (b.method === id) return; b.method = id; if (id === "points") { STATS().forEach((k) => (b.base[k] = Math.min(b.base[k], D.creation.pointBuy.max))); let g = 0; while (pbCost(b.base) > D.creation.pointBuy.points && g++ < 40) { const k = STATS().sort((x, y) => b.base[y] - b.base[x])[0]; b.base[k]--; } } else Object.assign(b.base, suggest([b.path]).base); draw(); }; mth.appendChild(mb); });
          tbl.textContent = ""; const fin = finalStats(b.base, b.path);
          D.stats.forEach((s) => { const row = el("div", "o3-statrow"); row.dataset.stat = s.id; row.append(el("span", "o3-sname", `${s.icon} ${s.name}`));
            if (b.method === "array") { const sel = el("select"); sel.dataset.rpg = "arr-" + s.id; sel.setAttribute("aria-label", s.name); D.creation.standardArray.forEach((v) => { const o = el("option", null, String(v)); o.value = v; if (v === b.base[s.id]) o.selected = true; sel.appendChild(o); });
              sel.onchange = () => { const v = +sel.value, other = STATS().find((k) => k !== s.id && b.base[k] === v); if (other) b.base[other] = b.base[s.id]; b.base[s.id] = v; draw(); }; row.appendChild(sel); }
            else { const mi = el("button", "o3-btn ghost small", "−"), pl = el("button", "o3-btn ghost small", "+"); mi.dataset.rpg = "pb-" + s.id + "-minus"; pl.dataset.rpg = "pb-" + s.id + "-plus";
              mi.onclick = () => { if (b.base[s.id] > D.creation.pointBuy.min) { b.base[s.id]--; draw(); } }; pl.onclick = () => { const t = { ...b.base, [s.id]: b.base[s.id] + 1 }; if (t[s.id] <= D.creation.pointBuy.max && pbCost(t) <= D.creation.pointBuy.points) { b.base[s.id]++; draw(); } }; row.append(mi, el("b", null, String(b.base[s.id])), pl); }
            row.append(el("span", "o3-sfinal", `→ ${fin[s.id]}${D.paths[b.path].main === s.id ? "*" : ""} (${sg(mod(fin[s.id]))})`)); tbl.appendChild(row); });
          if (b.method === "points") tbl.appendChild(el("p", "o3-small", `Points left: ${D.creation.pointBuy.points - pbCost(b.base)} (8 costs 0, 15 costs 9)`));
          const P = D.paths[b.path], w = item(P.weapon), m = (k) => mod(fin[k]), hp = Math.max(4, D.levels.hpBase + m("nerve"));
          sum.textContent = `* +1 from your path. ❤️ HP ${hp} · 🛡 AC ${10 + m("stride") + 1} (with the cardigan) · ⚔️ ${w.name}: d20${sg(m(w.stat) + D.levels.prof[0])} to hit, d${w.die}${m(w.stat) ? sg(m(w.stat)) : ""} damage · ${P.ability.icon} ${P.ability.name}: ${P.ability.text}`;
          const v = validBuild(b); ok.disabled = !v; ok.textContent = `✅ Looks right. Become ${cleanName(b.name) || "…"}`; err.textContent = v ? "Approving saves this character in this browser." : "Give your character a name (and keep the stats valid).";
        }
        ok.onclick = () => { if (!createChar(b)) return; host.closePanel(); transform(true); }; draw(); };
      quiz();
      pn.appendChild(el("p", "o3-small o3-credits", D.creation.aiHook.replace(/^Future: /, "Coming later: "))); pn.appendChild(el("p", "o3-small o3-credits", D.compatLine + " Rules math from the SRD 5.2.1 by Wizards of the Coast LLC (CC-BY-4.0). Full credit on your sheet."));
    }, { wide: true });
  }
  function openBecome() { const c = CH();
    panel("become", "🧵 The stitched circle", (pn) => {
      pn.appendChild(el("p", null, `Your Annex self is waiting: ${pathOf().icon} ${c.name}, Level ${level()} ${pathOf().name}.`));
      pn.appendChild(el("p", "o3-small", `❤️ ${c.hp}/${maxHp()} · 🛡 AC ${ac()} · ⚔️ ${weapon().name}${(c.status || []).length ? " · " + c.status.map((s) => s.text).join(", ") : ""}`));
      const go = el("button", "o3-btn", `✨ Become ${c.name}`); go.dataset.rpg = "become"; go.onclick = () => { host.closePanel(); transform(false); }; pn.appendChild(go);
      const re = el("button", "o3-btn ghost small", "🔁 Start a new character"); re.dataset.rpg = "recreate"; let sure = false;
      re.onclick = () => { if (!sure) { sure = true; re.textContent = "Really? Level, gear and quests reset. Tap again."; return; } resetChar(); host.closePanel(); setTimeout(openCreator, 50); }; pn.appendChild(re);
    }); }
  function resetChar() { S.character = null; S.quests = {}; S.stash = []; S.counters = {}; save(); transformed = false; setPlayerName(null); renderBar(); }
  function openCircle() { if (!D) return; if (transformed) { host.toast(`You're already ${CH().name}. The circle hums approvingly.`); return; } CH() ? openBecome() : openCreator(); }
  function transform(isNew) { const c = CH(); if (!c) return; transformed = true; fightGroup = null; abilityUsed = false; footArmed = false; c.hp = clamp(c.hp || maxHp(), 1, maxHp()); save();
    setPlayerName(c.name); fxT.textContent = `✨ ${c.name}`; fx.classList.remove("on"); void fx.offsetWidth; fx.classList.add("on"); audio.sfx("whoosh");
    host.toast(fill(D.circle.become).replace("{char}", c.name)); addLog(`🧵 You became ${c.name} (${pathOf().name}).`, "sys"); progress("flag", "transformed"); renderBar(); renderTip(); host.updateActions();
    if (isNew) setTimeout(() => { if (transformed && !host.state().busy) host.toast("📜 C = sheet · 🎒 I = gear · 🗒 J = quests · 🎲 L = dice log · X = ability"); }, 3400); }

  // ---------- XP, levels, quests ----------
  // v5: XP falloff for content well below you (data: xpFalloff). Returns the fraction of XP you get.
  function xpScale(clvl) { const F = D.xpFalloff; if (!F || !clvl) return 1; const diff = level() - clvl; if (diff <= F.fullWithin) return 1; if (diff >= F.zeroAt) return 0; return Math.max(0, 1 - (diff - F.fullWithin) * F.perLevel); }
  function gainXP(n0, why, clvl) { const c = CH(); if (!c || !n0) return; let n = n0; if (clvl) { const f = xpScale(clvl); n = f > 0 ? Math.max(D.xpFalloff?.minXP || 1, Math.round(n0 * f)) : 0;
      if (!n) { addLog(`⭐ 0 XP · ${why} (level ${clvl} is too far below you, level ${level()})`, "sys"); return; } if (n < n0) why += ` (reduced: level ${clvl} content)`; } if (isTraining() && !TR().grantXP) { trainXP += n; addLog(`🎓 Practice: ${n} XP would go here (${why}). XP is off in training.`, "sys"); return; } const L0 = level(), h0 = maxHp(); c.xp += n; const L1 = level(); addLog(`⭐ +${n} XP · ${why}`, "xp");
    if (L1 > L0) { c.hp += maxHp() - h0; for (let L = L0 + 1; L <= L1; L++) if (D.levels.statUpAt.includes(L)) c.pendingStat = (c.pendingStat || 0) + 1;
      lastLevelUp = { from: L0, to: L1, at: Date.now() }; audio.sfx("chime"); popup(`⬆️ LEVEL ${L1}!`, "lvl"); addLog(`⬆️ Level ${L1}! Max HP ${maxHp()}${c.pendingStat ? " · pick a stat to raise" : ""}`, "lvl");
      setTimeout(() => { if (!host.state().busy && !koBusy) openLevelUp(); else host.toast(`⬆️ Level ${L1}! Open your sheet (C) to see what changed.`); }, 350); }
    save(); renderBar(); }
  function openLevelUp() { const c = CH(); panel("levelup", `⬆️ Level ${level()}!`, (pn) => {
    pn.appendChild(el("p", null, `${c.name} feels a bit more sure of the hallways. Max HP is now ${maxHp()}, proficiency ${sg(prof())}.`)); statPick(pn); }); }
  function statPick(pn) { const c = CH(); if (!c.pendingStat) return; pn.appendChild(el("p", "o3-small", `Raise one stat by 1 (max ${D.levels.statMax}):`)); const row = el("div", "o3-prompts");
    D.stats.forEach((s) => { const b = el("button", "o3-btn ghost small", `${s.icon} ${s.name} ${c.stats[s.id]}`); b.dataset.rpg = "raise-" + s.id; b.disabled = c.stats[s.id] >= D.levels.statMax; b.onclick = () => { raise(s.id); host.closePanel(); }; row.appendChild(b); }); pn.appendChild(row); }
  function raise(k) { const c = CH(); if (!c?.pendingStat || c.stats[k] >= D.levels.statMax) return false; const h0 = maxHp(); c.stats[k]++; c.pendingStat--; c.hp += Math.max(0, maxHp() - h0); save(); renderBar(); addLog(`📈 ${D.stats.find((s) => s.id === k).name} is now ${c.stats[k]}.`, "lvl"); return true; }
  const qVisible = (q) => !q.hidden || S.flags.sawPortal || S.quests[q.id];
  function progress(type, what) { if (!CH()) return; if (isTraining() && !TR().questProgress) return; D.quests.forEach((q) => { if (q.type !== type) return; if (q.type === "flag" && q.flag !== what) return; if (q.type === "boss" && q.boss !== what) return;
      const st = (S.quests[q.id] ||= { n: 0, done: false }); if (st.done) return; st.n++; if (st.n >= q.count) { st.done = true; st.at = new Date().toISOString(); audio.sfx("chime");
        host.toast(`🗒 Quest complete: ${q.name} (+${q.xp} XP${q.loot ? ", " + item(q.loot).name : ""})`); addLog(`🗒 Quest complete: ${q.name}`, "quest"); if (q.loot) giveItem(q.loot); gainXP(q.xp, "quest: " + q.name); } });
    save(); }
  function event(kind, a) { if (!D) return; if (kind === "crystal") { S.lastCrystal = a || null; save(); if (transformed && CH()) { const c = CH(), had = (c.status || []).length; c.status = []; c.hp = maxHp(); abilityUsed = false; save(); renderBar(); if (had) setTimeout(() => host.toast("💎 The crystal hums. Statuses cleared, HP full."), 900); } return; }
    if (!transformed || !CH()) return;
    if (kind === "curio") { gainXP(D.xp.curio, "found a curiosity"); progress("curio"); }
    if (kind === "attune") gainXP(D.xp.attune, "attuned a crystal"); }

  // ---------- items ----------
  const EQUIP = ["weapon", "armor", "head", "trinket"];
  function giveItem(id, quiet) { const c = CH(), it = item(id); if (!c || !it) return false; let eq = false;
    if (EQUIP.includes(it.slot)) { const cur = item(c.gear[it.slot]); if (!cur || (it.value || 0) > (cur.value || 0)) { if (c.gear[it.slot]) c.inv.push(c.gear[it.slot]); c.gear[it.slot] = id; eq = true; } else c.inv.push(id); } else c.inv.push(id);
    save(); renderBar(); if (!quiet) addLog(`🎁 ${it.name}${eq ? " (equipped)" : ""}`, "loot"); return eq; }
  function rollLoot(tier) { const t = D.loot.tiers[clamp(tier, 0, 4)], tot = t.reduce((a, r) => a + r[1], 0); let u = rng() * tot; for (const [id, w] of t) { u -= w; if (u < 0) return id; } return t[0][0]; }
  function itemLine(it) { if (!it) return ""; if (it.slot === "weapon") return `d${it.die} · ${D.stats.find((s) => s.id === it.stat).name}${it.hit ? " · +" + it.hit + " hit" : ""}`; return it.text.split(". ")[0]; }
  function lootPanel(id, from) { const it = item(id), eq = CH().gear[it.slot] === id; audio.sfx("pick");
    panel("loot", `${from} ${it.name}`, (pn) => { pn.appendChild(el("p", null, it.text)); if (it.slot === "weapon") pn.appendChild(el("p", "o3-small", `As a weapon: d20${sg(mod(stat(it.stat)) + prof() + (it.hit || 0))} to hit, d${it.die}${sg(mod(stat(it.stat)))} damage.`));
      pn.appendChild(el("p", "o3-small", eq ? "✓ Equipped (it beat what you had)." : it.slot === "use" ? "In your bag. Use it from 🎒 Gear (I)." : it.slot === "quest" ? "Quest item. It's in your bag." : "In your bag. Swap it in from 🎒 Gear (I).")); }); }
  function openBox(bx) { if (bx.opened) return; if (!transformed) return nudge(true); bx.opened = true; S.world.loot[bx.key] = new Date().toISOString();
    let id; const rs = D.quests.find((q) => q.type === "fetch"); if (rs && !S.quests[rs.id]?.done && !CH().inv.includes(rs.item) && !S.flags.parcelFound) { id = rs.item; S.flags.parcelFound = true; } else id = rollLoot(bx.tier + (bx.chest ? 1 : 0));
    giveItem(id); bx.lid.rotation.x = -1.6; bx.spark.visible = false; bx.q.visible = false; save(); lootPanel(id, bx.chest ? "🧰 Behind the dice door:" : "📦 In the box:"); }
  function useItem(id) { const c = CH(), it = item(id), i = c.inv.indexOf(id); if (!it || i < 0 || it.slot !== "use") return; const h = rollN(it.heal[0], it.heal[1]).s + it.heal[2]; c.inv.splice(i, 1); c.hp = Math.min(maxHp(), c.hp + h); addLog(`${it.icon || "🍲"} ${it.name}: ${it.heal[0]}d${it.heal[1]}+${it.heal[2]} = +${h} HP`, "heal"); save(); renderBar(); }
  function equip(id) { const c = CH(), it = item(id), i = c.inv.indexOf(id); if (!it || i < 0 || !EQUIP.includes(it.slot)) return false; c.inv.splice(i, 1); if (c.gear[it.slot]) c.inv.push(c.gear[it.slot]); c.gear[it.slot] = id; save(); renderBar(); return true; }

  // ---------- combat (click / E to swing; critters swing back on a timer; all rolls are d20 + modifier vs AC) ----------
  function resolveAttack(bonus, targetAc, adv) { const r1 = roll(20), r2 = adv ? roll(20) : null, d = adv ? Math.max(r1, r2) : r1, total = d + bonus; return { d20: d, rolls: adv ? [r1, r2] : [r1], bonus, total, ac: targetAc, crit: d === 20, fumble: d === 1, hit: d === 20 || (d !== 1 && total >= targetAc) }; }
  const mobWorldLocal = (m) => (m.ch ? { x: m.ch.lx + m.g.position.x, z: m.ch.lz + m.g.position.z } : { x: IX + m.g.position.x, z: IZ + m.g.position.z });
  const dist = (m) => { const w = mobWorldLocal(m); return Math.hypot(w.x - lastP.x, w.z - lastP.z); };
  const sameRoom = (m) => curZone === m.zone;
  function attackMob(m, skipRange) { if (!transformed || !m || m.dead || koBusy || host.state().busy || cd > 0) return null;
    if (!skipRange && (!sameRoom(m) || dist(m) > D.mobs.reach)) { host.toast(`Too far. Get closer to the ${m.name}.`); return null; }
    cd = D.mobs.playerCooldown; const adv = footArmed, wp = weapon(), r = resolveAttack(atkBonus(), m.ac, adv); lastAttack = { ...r, mob: m.name, id: m.id }; m.cd = Math.max(m.cd, 0.6); tipEvent("attack");
    const rs = r.rolls.length > 1 ? `[${r.rolls.join(", ")}]→${r.d20}` : `${r.d20}`;
    if (r.fumble) { cd = 2.0; footArmed = false; addLog(`🎲 ${rs}: natural 1! ${rpick(D.mobs.fumbles)}`, "miss"); popup("🎲 1 · fumble!", "miss"); audio.sfx("nope"); renderBar(); return r; }
    if (!r.hit) { footArmed = false; addLog(`🎲 ${rs}${sg(r.bonus)} = ${r.total} vs AC ${m.ac} · miss (${m.name})`, "miss"); popup(`🎲 ${r.total} vs AC ${m.ac} · miss`, "miss"); audio.sfx("blip"); renderBar(); return r; }
    const dice = rollN(r.crit ? 2 : 1, wp.die); let dmg = dice.s + dmgMod(), extra = ""; if (adv && CH().path === "archivist") { const f = rollN(r.crit ? 2 : 1, 4); dmg += f.s; extra = ` + footnote d4 [${f.r.join(",")}]`; } footArmed = false; dmg = Math.max(1, dmg);
    m.hp -= dmg; m.hitT = 0.25; r.dmg = dmg; lastAttack.dmg = dmg; audio.sfx(r.crit ? "chime" : "click");
    addLog(`🎲 ${rs}${sg(r.bonus)} = ${r.total} vs AC ${m.ac} · ${r.crit ? "CRIT! " : "hit! "}${wp.name} ${r.crit ? "2" : ""}d${wp.die} [${dice.r.join(",")}]${dmgMod() ? sg(dmgMod()) : ""}${extra} = ${dmg}`, r.crit ? "crit" : "hit");
    popup(r.crit ? `🎲 20! CRIT · ${dmg} dmg` : `🎲 ${r.total} vs AC ${m.ac} · hit · ${dmg} dmg`, r.crit ? "crit" : "hit"); if (r.crit) host.toast(rpick(D.mobs.crits));
    if (m.hp <= 0) killMob(m); renderBar(); return r; }
  function killMob(m) { if (m.dead) return; m.dead = true; m.hp = 0; m.deadT = 0; if (!isTraining() || TR().questProgress) S.counters.kills = (S.counters.kills || 0) + 1; tipEvent("kill"); addLog(`✨ The ${m.name} ${m.def.dieText}`, "xp");
    if (m.gm || m.gmBoss) { gainXP(m.xp, m.name, m.clvl); progress("kill"); save(); return; } // v5: game-master spawns: XP (if this place allows it), no room-clear, no loot
    if (m.boss) { bossDown(m); gainXP(m.xp, m.name, m.clvl); progress("kill"); return; }
    if (m.run != null && inst.active) runStepCheck(m.run);
    const ch = m.ch; if (ch && ch.rpg.mobs.every((q) => q.dead)) { S.world.mobs[ch.key] = new Date().toISOString(); abilityUsed = false; fightGroup = null;
      if (rng() < D.loot.mobDropChance || !S.flags.firstDrop) { S.flags.firstDrop = true; dropLoot(ch, m, rollLoot(ch.rpg.P.mob.tier)); } save(); setTimeout(() => host.toast("The room goes quiet. It'll stay that way."), 600); }
    gainXP(m.xp, m.name, m.clvl); progress("kill"); }
  function dropLoot(ch, m, id) { const g = new THREE.Group(); g.position.set(m.g.position.x, 0, m.g.position.z); (ch ? ch.g : inst.g).add(g);
    const it = item(id); const cm = sm(it.slot === "weapon" ? "#d8a64a" : it.slot === "use" ? "#7fc8a0" : "#a8c8e8", { emissive: "#fff2a8", emissiveIntensity: 0.35 }); const b = new THREE.Mesh(G("loot", () => new THREE.OctahedronGeometry(0.16, 0)), cm); b.position.y = 0.4; g.add(b);
    const d = { g, b, id, lx: (ch ? ch.lx : IX) + m.g.position.x, lz: (ch ? ch.lz : IZ) + m.g.position.z, taken: false }; (ch ? ch.rpg.drops : inst.drops).push(d); addLog(`💎 The ${m.name} dropped something: ${it.name}`, "loot"); return d; }
  function takeDrop(d) { if (d.taken) return; d.taken = true; d.g.visible = false; if (d.key) { S.world.loot[d.key] = new Date().toISOString(); save(); } giveItem(d.id); lootPanel(d.id, "✋ You pick up:"); }
  function hurt(n, by) { const c = CH(); if (!c || koBusy) return; c.hp = Math.max(0, c.hp - n); hurtEl.classList.remove("on"); void hurtEl.offsetWidth; hurtEl.classList.add("on"); save(); renderBar(); if (c.hp <= 0) knockout(by); }
  function mobAttack(m) { const r = resolveAttack(m.atk, ac(), false); m.n++;
    if (m.boss && m.def.special && m.n % m.def.special.every === 0) { const sp = m.def.special, d = roll(20), b = checkBonus(sp.stat), tot = d + b, ok = tot >= sp.dc, dm = rollN(sp.dice[0], sp.dice[1]).s + m.dmgB, got = ok ? Math.floor(dm / 2) : dm;
      addLog(`🌪 ${sp.name}! ${sp.text} ${D.stats.find((s) => s.id === sp.stat).name} save ${d}${sg(b)} = ${tot} vs DC ${sp.dc} · ${ok ? "half" : "full"} damage: ${got}`, ok ? "miss" : "ouch"); popup(`🌪 ${sp.name} · ${got} dmg`, "ouch"); hurt(got, m.name); return; }
    if (!r.hit) { addLog(`${m.icon} ${m.name} rolls ${r.d20}${sg(m.atk)} = ${r.total} vs your AC ${r.ac} · misses`, "miss"); return; }
    const dm = Math.max(1, rollN(r.crit ? 2 : 1, m.die).s + m.dmgB); addLog(`${m.icon} ${m.name} rolls ${r.d20}${sg(m.atk)} = ${r.total} vs AC ${r.ac} · ${rpick(m.def.hitText)} (−${dm} HP)`, "ouch"); audio.sfx("flump"); hurt(dm, m.name); }
  function useAbility() { const c = CH(); if (!transformed || !c || koBusy) return false; const ab = pathOf().ability; if (abilityUsed) { host.toast(`${ab.icon} ${ab.name} is used up until this scuffle ends (or a crystal recharges it).`); return false; }
    if (ab.id === "footnote") { footArmed = true; abilityUsed = true; addLog(`📝 Footnote ready: your next attack or door check rolls two d20s.`, "sys"); popup("📝 Footnote ready", "hit"); }
    else if (ab.id === "secondwind") { if (c.hp >= maxHp()) { host.toast("You're not out of breath yet."); return false; } const h = roll(8) + level(); c.hp = Math.min(maxHp(), c.hp + h); abilityUsed = true; addLog(`🌬 Second Wind: 1d8+${level()} = +${h} HP`, "heal"); popup(`🌬 +${h} HP`, "hit"); }
    else if (ab.id === "gizmo") { const foes = allMobs().filter((m) => !m.dead && sameRoom(m)).sort((a, b) => dist(a) - dist(b)), m = foes[0];
      if (!m || dist(m) > 6) { host.toast("No one nearby to fling a gizmo at."); return false; } const d = rollN(2, 6); m.hp -= d.s; m.hitT = 0.3; abilityUsed = true; addLog(`🪀 Gizmo: 2d6 [${d.r.join(",")}] = ${d.s} damage to the ${m.name}`, "hit"); popup(`🪀 ${d.s} dmg`, "hit"); if (m.hp <= 0) killMob(m); }
    audio.sfx("pick"); save(); renderBar(); tipEvent("ability"); return true; }
  const allMobs = () => { const out = []; if (inst.active) inst.mobs.forEach((m) => out.push(m)); else chunks.forEach((ch) => ch.rpg?.mobs.forEach((m) => out.push(m))); return out; };

  // ---------- knockout: Grenshol to the rescue (never death) ----------
  function pickCons(force) { const L = D.knockout.consequences; if (force) return L.find((c) => c.id === force) || L[0]; const tot = L.reduce((a, c) => a + c.weight, 0); let u = rng() * tot; for (const c of L) { u -= c.weight; if (u < 0) return c; } return L[0]; }
  function knockout(by, force) { if (koBusy || !CH()) return; if (isTraining()) return trainingKO(by); koBusy = true; const c = CH(), K = D.knockout, L = level(), lo = D.levels.xp[L - 1], loss = Math.floor((c.xp - lo) * K.xpLossPct);
    c.xp = Math.max(lo, c.xp - loss); let cons = pickCons(force), note = null, stolen = null;
    if (cons.id === "steal") { const cand = EQUIP.map((s) => c.gear[s]).filter((id) => id && !item(id).keep).sort((a, b) => (item(b).value || 0) - (item(a).value || 0));
      if (cand.length) { stolen = cand[0]; const it = item(stolen); c.gear[it.slot] = null; { const alt = c.inv.filter((q) => item(q)?.slot === it.slot).sort((x, y) => (item(y).value || 0) - (item(x).value || 0))[0]; if (alt) { c.inv.splice(c.inv.indexOf(alt), 1); c.gear[it.slot] = alt; } } note = rpick(cons.note).replace("{item}", it.name.toLowerCase()); S.stash.push({ item: stolen, note, at: new Date().toISOString() }); } else cons = pickCons("lampshade"); }
    if (cons.id !== "steal" && !(c.status || []).some((s) => s.id === cons.id)) (c.status ||= []).push({ id: cons.id, text: cons.status, statMod: cons.statMod || null });
    const wasInst = inst.active ? inst.from : null; c.hp = 0; footArmed = false; abilityUsed = false; fightGroup = null;
    lastKO = { by: by || null, loss, xp: c.xp, cons: cons.id, stolen, note, inInstance: !!wasInst, at: Date.now(), placed: false }; save(); renderBar();
    addLog(`💫 Knocked out${by ? " by the " + by : ""}. −${loss} XP.`, "ouch"); audio.sfx("flump");
    koT.textContent = K.fade; ko.classList.add("on");
    setTimeout(() => { koT.textContent = K.carry; if (wasInst) leaveInstance(true); const sp = wasInst ? hubSpawn(wasInst.i, wasInst.j, 0) : safeSpawn(S.lastCrystal); place(sp); lastKO.placed = true; lastKO.to = sp; c.hp = maxHp(); save(); renderBar(); host.updateActions(); }, 1400 * koSpeed);
    setTimeout(() => { ko.classList.remove("on"); koBusy = false;
      panel("knockout", "💫 " + K.noteTitle, (pn) => { pn.dataset.cons = cons.id;
        if (stolen) { pn.appendChild(el("div", "o3-note o3-gnote", note)); pn.appendChild(el("p", "o3-small", `Your ${item(stolen).name} is gone. It's on the list in Grenshol's stash (see your sheet). Maybe you can win it back one day.`)); }
        else pn.appendChild(el("p", null, cons.text));
        pn.appendChild(el("p", "o3-small", `You lost ${loss} XP (never a whole level). HP back to full. You're ${wasInst ? "back by the party portal" : "by a crystal"}, safe and slightly rumpled.`)); }); }, 3600 * koSpeed); }

  // ---------- dice doors ----------
  function openDoor(dr) { if (!transformed) return nudge(true); const st = D.stats.find((s) => s.id === dr.P.stat), b = checkBonus(dr.P.stat, true);
    panel("door", "🎲 A dice door", (pn) => { pn.appendChild(el("p", "o3-riddle", D.doors.labels[dr.P.stat])); pn.appendChild(el("p", "o3-small", `${st.icon} ${st.name} check · DC ${dr.P.dc} · you roll d20${sg(b)}${pathOf().prof.includes(dr.P.stat) ? " (includes proficiency)" : ""}`));
      const out = el("p", "o3-riddleout"); const btn = el("button", "o3-btn", "🎲 Roll d20"); btn.dataset.rpg = "door-roll"; pn.append(btn);
      if (CH().path === "archivist" && (!abilityUsed || footArmed)) { const fb = el("button", "o3-btn ghost small", footArmed ? "📝 Footnote armed" : "📝 Use Footnote (roll twice)"); fb.dataset.rpg = "door-foot"; fb.onclick = () => { if (!footArmed) { footArmed = true; abilityUsed = true; renderBar(); } fb.textContent = "📝 Footnote armed"; }; pn.append(fb); }
      pn.appendChild(out); btn.onclick = () => { const r = doorRoll(dr); if (!r) { out.textContent = "The door is still sulking. Give it a second."; out.className = "o3-riddleout no"; return; } out.textContent = r.text; out.className = "o3-riddleout " + (r.ok ? "ok" : "no"); if (r.ok) { btn.disabled = true; setTimeout(() => host.closePanel(), 1100); } }; }); }
  function doorRoll(dr) { if (dr.open || Date.now() < dr.waitUntil) return null; const b = checkBonus(dr.P.stat, true), adv = footArmed, r1 = roll(20), r2 = adv ? roll(20) : null, d = adv ? Math.max(r1, r2) : r1, tot = d + b, ok = tot >= dr.P.dc; footArmed = false;
    const rs = adv ? `[${r1}, ${r2}]→${d}` : `${d}`, sn = D.stats.find((s) => s.id === dr.P.stat).name; lastDoor = { d20: d, bonus: b, total: tot, dc: dr.P.dc, ok, stat: dr.P.stat, key: dr.key };
    if (ok) { dr.open = true; S.world.doors[dr.key] = new Date().toISOString(); const bi = dr.ch.blockers.indexOf(dr.blk); if (bi >= 0) dr.ch.blockers.splice(bi, 1); refreshBlockers(); dr.swing = 0.001; audio.sfx("chime");
      addLog(`🚪 ${sn} check ${rs}${sg(b)} = ${tot} vs DC ${dr.P.dc} · open!`, "hit"); popup(`🎲 ${tot} vs DC ${dr.P.dc} · open!`, "hit"); gainXP(D.xp.door, "dice door"); progress("door"); save(); renderBar(); return { ok, text: `${rs}${sg(b)} = ${tot} vs DC ${dr.P.dc}. ${D.doors.success}` }; }
    dr.waitUntil = Date.now() + D.doors.retrySeconds * 1000; const f = rpick(D.doors.fails); audio.sfx("nope"); addLog(`🚪 ${sn} check ${rs}${sg(b)} = ${tot} vs DC ${dr.P.dc} · nope. ${f}`, "miss"); popup(`🎲 ${tot} vs DC ${dr.P.dc} · nope`, "miss"); renderBar();
    return { ok, text: `${rs}${sg(b)} = ${tot} vs DC ${dr.P.dc}. ${f} (Try again in a few seconds.)` }; }

  // ---------- weird questions from almost-people ----------
  function talkExtras(pn, npc) { if (!D || !transformed || !CH() || npc.poss) return; const done = S.counters.riddles || []; const rd = D.riddles.find((r) => !done.includes(r.id)); if (!rd) return;
    const holder = el("div"); pn.appendChild(holder); const b = el("button", "o3-btn ghost small", "🧩 It looks like it has a weird question for you…"); b.dataset.rpg = "riddle"; holder.appendChild(b);
    b.onclick = () => { holder.textContent = ""; const bx = el("div", "o3-note"); bx.appendChild(el("p", "o3-riddle", `"${rd.q}"`)); const row = el("div", "o3-prompts"); const out = el("p", "o3-riddleout");
      rd.a.forEach((a, ai) => { const ab = el("button", "o3-btn ghost small", a); ab.dataset.rpg = "ans-" + ai; ab.onclick = () => { const r = answerRiddle(rd.id, ai); out.textContent = fill(r.ok ? rd.yes : rd.no); out.className = "o3-riddleout " + (r.ok ? "ok" : "no"); if (r.ok) row.querySelectorAll("button").forEach((q) => (q.disabled = true)); }; row.appendChild(ab); });
      bx.append(row, out); holder.appendChild(bx); }; }
  function answerRiddle(id, ai) { const rd = D.riddles.find((r) => r.id === id), done = (S.counters.riddles ||= []); if (!rd || done.includes(id)) return { ok: false };
    if (ai !== rd.ok) { audio.sfx("nope"); addLog("🧩 Wrong answer. The almost-person looks politely disappointed. (Ask again any time.)", "miss"); return { ok: false }; }
    done.push(id); audio.sfx("chime"); gainXP(D.xp.riddle, "answered a weird question"); progress("riddle"); save(); return { ok: true }; }

  // ---------- party portals -> instanced rooms (the ONLY place party size matters) ----------
  const IX = -3000, IZ = -3000; const inst = { active: false, rooms: {}, walk: false, g: null, mobs: [], drops: [], from: null, zone: "annex:inst:room", id: null, exit: null, extras: [] };
  function buildInstance(id) { const I = D.instances[id], s = I.size, pal = I.palette; Object.entries(inst.rooms).forEach(([k, r]) => (r.g.visible = k === id)); if (inst.rooms[id]) { inst.g = inst.rooms[id].g; inst.exit = inst.rooms[id].exit; inst.extras = inst.rooms[id].extras; return; }
    if (I.layout === "run") return buildRun(id, I);
    const g = new THREE.Group(); g.position.set(IX, 0, IZ); root.add(g); inst.g = g; inst.extras = [];
    const wm = sm(pal.wall, { roughness: 0.95 }); box(s / 2, -0.05, s / 2, s, 0.1, s, sm(pal.floor, { roughness: 1 }), g); box(s / 2, 3.05, s / 2, s, 0.1, s, sm(pal.ceil, { emissive: pal.ceil, emissiveIntensity: 0.25 }), g);
    box(s / 2, 1.5, 0, s, 3, 0.2, wm, g); box(s / 2, 1.5, s, s, 3, 0.2, wm, g); box(0, 1.5, s / 2, 0.2, 3, s, wm, g); box(s, 1.5, s / 2, 0.2, 3, s, wm, g);
    const lm = sm("#fff7d0", { emissive: "#fff2b8", emissiveIntensity: 1.3 }); [[3.5, 3.5], [10.5, 3.5], [3.5, 10.5], [10.5, 10.5], [7, 7]].forEach(([x, z]) => box(x, 2.98, z, 1.2, 0.03, 0.6, lm, g));
    const cab = sm("#7d8a78", { metalness: 0.3, roughness: 0.6 }), ln = sm("#2b2f28"); if (!I.training) for (let k = 0; k < 10; k++) [0.45, s - 0.45].forEach((x) => { box(x, 0.8, 1.2 + k * 1.2, 0.6, 1.6, 0.9, cab, g); [0.5, 1.0].forEach((y) => box(x + (x < 1 ? 0.31 : -0.31), y, 1.2 + k * 1.2, 0.01, 0.02, 0.7, ln, g)); });
    if (I.control) { if (ext.buildControl) ext.buildControl(g, s, inst); } else if (I.training) buildTrainingRoom(g, s); else
    cplane(M("t:misc", () => plate(I.gate ? "GATE" : "RECORDS", I.gate ? "placeholder gate · lore coming soon" : "everything is filed under MISC.", { w: 900, h: 260, bg: "#3a3a2c", fg: "#f3ead2", accent: "#c9c2a2" })), 3, 0.86, s / 2, 2.3, 0.12, 0, g);
    const ex = new THREE.Group(); ex.position.set(s / 2, 0, s - 0.3); g.add(ex); const { disc } = swirl(ex); disc.userData.run = () => leaveInstance(); disc.userData.maxD = 4.5;
    inst.exit = { g: ex, disc, lx: IX + s / 2, lz: IZ + s - 0.6 }; inst.rooms[id] = { g, exit: inst.exit, extras: inst.extras }; if (inst.walk) return; inst.walk = true;
    walkable.push({ x0: AX + IX + 1.0 + R, x1: AX + IX + s - 1.0 - R, z0: AZ + IZ + 0.1 + R, z1: AZ + IZ + s - 0.1 - R, room: inst.zone, y: 0 }); }
  function spawnInstance(id) { const I = D.instances[id], n = partySize(), sc = I.scale; inst.mobs.forEach((m) => m.g.parent?.remove(m.g)); inst.drops.forEach((d) => d.g.parent?.remove(d.g)); inst.mobs = []; inst.drops = [];
    if (I.layout === "run") return spawnRun(id, I); if (I.training) return spawnTraining(I, n); if (S.world.bosses[id]) return; const s = I.size, rect = { x0: 1.6, x1: s - 1.6, z0: 1.4, z1: s - 1.4 };
    const bd = I.boss, boss = { kind: "boss", def: bd, name: bd.name, icon: bd.icon, maxHp: Math.round(bd.hp * (1 + sc.hpPerExtra * (n - 1))), ac: bd.ac, atk: bd.atk, die: bd.die, dmgB: sc.dmgPerExtra * (n - 1), xp: bd.xp, speed: bd.speed, every: bd.every, boss: true, clvl: I.level || 1 };
    inst.mobs.push(newMob(boss, makeMobMesh("boss", inst.g, 2), s / 2, 3.2, rect, inst.zone, null, "inst:boss"));
    const k = I.minions ?? n * sc.minionsPerMember; for (let q = 0; q < k; q++) { const st = { ...scaled(I.minion, 0) }; st.dmgB += sc.dmgPerExtra * (n - 1); inst.mobs.push(newMob(st, makeMobMesh(I.minion, inst.g), 3.5 + q * 3.5, 5.4, rect, inst.zone, null, "inst:m" + q)); } }
  function openPortal(p) { if (!transformed) return nudge(true); if (p.pp.gate) return openGate(p); S.flags.sawPortal = true; save(); const I = D.instances[p.pp.instance], n = clamp(Math.max(party.members.length, urlParty || 1), 1, D.party.max);
    panel("portal", "🌀 Party portal", (pn) => { pn.appendChild(el("p", "o3-riddle", p.pp.label)); pn.appendChild(el("p", null, I.intro));
      if (S.world.bosses[p.pp.instance]) { pn.appendChild(el("p", "o3-small", I.done)); return; }
      const pl = el("p", "o3-small", `Party: ${n}/${D.party.max}${urlParty > 1 ? " (test party from the &party flag)" : party.members.length > 1 ? "" : ext.portalParty ? "" : " (solo for now; teammates join once Desks multiplayer is switched on)"}. The room inside scales to your party. Out in the Annex it's always just you.`); pl.dataset.rpg = "party-line"; pn.appendChild(pl);
      if (ext.portalParty) ext.portalParty(pn, p, () => { const k = clamp(Math.max(party.members.length, urlParty || 1), 1, D.party.max); pl.firstChild.textContent = `Party: ${k}/${D.party.max}. The room inside scales to your party. Out in the Annex it's always just you.`; });
      const go = el("button", "o3-btn", "🌀 Step through"); go.dataset.rpg = "portal-go"; go.onclick = () => { host.closePanel(); ext.onPartyGo?.(p); enterInstance(p); }; pn.appendChild(go); }); }
  function enterInstance(p) { const id = p.pp.instance; buildInstance(id); ext.onEnter?.(id, p); inst.id = id; inst.from = { i: p.i, j: p.j, id: p.pp.id, spawn: p.spawn || null }; party.instance = id; audio.sfx("zip");
    return host.threadWarp({ target: null, swap: () => { inst.active = true; if (D.instances[id].training) startTraining(); spawnInstance(id); fightGroup = null; abilityUsed = false; const I0 = D.instances[id], s = I0.size, sp0 = I0.spawn || { x: s / 2, z: s - 2, yaw: 0 }; lastP = { x: IX + sp0.x, z: IZ + sp0.z };
      ctx.placeRaw({ x: IX + sp0.x, z: IZ + sp0.z, yaw: sp0.yaw || 0 }); host.toast(D.instances[id].training ? `${D.instances[id].name} · ${D.instances[id].control ? "admin only (nothing here counts)" : "practice mode (nothing here counts)"}` : D.instances[id].solo ? `${D.instances[id].name} · solo · level ${(D.instances[id].levelRange || [D.instances[id].level || 1]).join("–")}` : `${D.instances[id].name} · party of ${partySize()}`); addLog(`🌀 Entered ${D.instances[id].name} (${D.instances[id].control ? "admin" : D.instances[id].training ? "practice" : D.instances[id].solo ? "solo" : "party of " + partySize()})`, "sys"); renderBar(); renderTip(); host.updateActions(); } }); }
  function leaveInstance(quiet) { if (!inst.active) return; const from = inst.from; const done = () => { const was = inst.id; if (isTraining()) endTraining(); inst.active = false; ext.onLeave?.(was); party.instance = null; inst.mobs.forEach((m) => m.g.parent?.remove(m.g)); inst.drops.forEach((d) => d.g.parent?.remove(d.g)); inst.mobs = []; inst.drops = []; fightGroup = null; };
    if (quiet) { done(); return; } audio.sfx("zip"); host.threadWarp({ swap: () => { done(); place(from.spawn || hubSpawn(from.i, from.j, 0), from.spawn ? TR().backText : "Back in the Annex hallway. Just you again."); renderBar(); renderTip(); host.updateActions(); } }); }
  function bossDown(m) { if (isTraining()) { tipEvent("boss"); if (TR().grantLoot && m.def.loot) dropLoot(null, m, m.def.loot); inst.mobs.forEach((q) => { if (!q.dead) { q.dead = true; q.deadT = 0; } }); host.toast(`The ${m.name} ${m.def.dieText}`); return; }
    S.world.bosses[inst.id] = new Date().toISOString(); progress("boss", inst.id); afterBoss(inst.id); if (m.def.loot) dropLoot(null, m, m.def.loot); inst.mobs.forEach((q) => { if (!q.dead) { q.dead = true; q.deadT = 0; } }); save();
    host.toast(`The ${m.name} ${m.def.dieText}`); }

  // ---------- v5: The Mildly Perilous Mailroom (solo starter run: 5 fights, 2 rests, 1 boss; real XP + loot; nothing respawns) ----------
  const RUN_Z0 = 16; // the run sits south of the square rooms (z 0..14) with a gap, so their walk areas never touch
  const runKey = (k) => `run:${inst.id}:${k}`;
  function runGeo(I) { const W = I.width || 6, SEG = I.segment || 8, LOB = I.lobby || 6, n = I.steps.length, x0 = 4, x1 = x0 + W, z1 = RUN_Z0 + LOB + n * SEG;
    const seg = (k) => ({ z0: z1 - LOB - (k + 1) * SEG, z1: z1 - LOB - k * SEG }); return { W, SEG, LOB, n, x0, x1, cx: x0 + W / 2, z0: RUN_Z0, z1, seg }; }
  function buildRun(id, I) { const R0 = runGeo(I), pal = I.palette, g = new THREE.Group(); g.position.set(IX, 0, IZ); root.add(g); inst.g = g; inst.extras = [];
    const wm = sm(pal.wall, { roughness: 0.95 }), L = R0.z1 - R0.z0, cz = (R0.z0 + R0.z1) / 2;
    box(R0.cx, -0.05, cz, R0.W, 0.1, L, sm(pal.floor, { roughness: 1 }), g); box(R0.cx, 3.05, cz, R0.W, 0.1, L, sm(pal.ceil, { emissive: pal.ceil, emissiveIntensity: 0.25 }), g);
    box(R0.x0, 1.5, cz, 0.2, 3, L, wm, g); box(R0.x1, 1.5, cz, 0.2, 3, L, wm, g); box(R0.cx, 1.5, R0.z0, R0.W, 3, 0.2, wm, g); box(R0.cx, 1.5, R0.z1, R0.W, 3, 0.2, wm, g);
    const lm = sm("#fff7d0", { emissive: "#fff2b8", emissiveIntensity: 1.3 }), rest = sm("#7a9a6a", { roughness: 1 }), trim = sm("#6f5a3e"), pig = sm("#b89a6a");
    I.steps.forEach((st, k) => { const sg = R0.seg(k), mz = (sg.z0 + sg.z1) / 2; box(R0.cx, 2.98, mz, 1.4, 0.03, 0.6, lm, g);
      [R0.x0 + 0.12, R0.x1 - 0.12].forEach((x) => box(x, 1.5, sg.z1, 0.25, 3, 0.25, trim, g)); box(R0.cx, 2.85, sg.z1, R0.W, 0.25, 0.25, trim, g); // archway into this step
      const tex = M("t:run:" + id + k, () => plate(st.name.split(" · ")[0].toUpperCase(), st.name.split(" · ")[1] || "", { w: 760, h: 200, bg: st.type === "rest" ? "#3f6a4a" : st.type === "boss" ? "#6a2a2a" : "#4a3a2a", fg: "#fbf3d0", accent: "#f3d98b" }));
      cplane(tex, 1.9, 0.5, R0.x0 + 0.12, 2.25, sg.z1 - 1.2, Math.PI / 2, g);
      if (st.type === "rest") { box(R0.cx, 0.012, mz, R0.W - 1, 0.02, 4, rest, g); const sack = new THREE.Mesh(G("sack", () => new THREE.SphereGeometry(0.6, 12, 8)), sm("#c9b27a", { roughness: 1 })); sack.scale.set(1.3, 0.55, 1); sack.position.set(R0.x0 + 1.4, 0.32, mz); g.add(sack);
        box(R0.x1 - 1.0, 0.5, mz, 0.7, 1.0, 1.2, sm("#8a6a4a"), g); const pot = new THREE.Mesh(G("teapot", () => new THREE.SphereGeometry(0.16, 10, 8)), sm("#e8e0c8")); pot.position.set(R0.x1 - 1.0, 1.12, mz); g.add(pot);
        inst.extras.push({ key: "rest" + k, lx: IX + R0.x0 + 1.5, lz: IZ + mz, label: () => I.rest.label, run: () => runRest(I) }); }
      else for (let q = 0; q < 4; q++) box(R0.x1 - 0.25, 0.6 + q * 0.5, sg.z0 + 1.5 + q * 1.4, 0.3, 0.4, 1.0, pig, g); }); // pigeonholes
    const lobT = M("t:run:lob:" + id, () => plate(I.door.sign, I.door.signSub, { w: 900, h: 240, bg: "#4a3a2a", fg: "#fbf3d0", accent: "#f3d98b" })); cplane(lobT, 3, 0.8, R0.cx, 2.3, R0.z0 + 0.12, 0, g);
    const ex = new THREE.Group(); ex.position.set(R0.cx, 0, R0.z1 - 0.3); ex.rotation.y = Math.PI; g.add(ex); const { disc } = swirl(ex); disc.userData.run = () => leaveInstance(); disc.userData.maxD = 4.5;
    inst.exit = { g: ex, disc, lx: IX + R0.cx, lz: IZ + R0.z1 - 0.6 };
    const fx = new THREE.Group(); fx.position.set(R0.cx, 0, R0.z0 + 0.4); g.add(fx); const far = swirl(fx); far.ring.material = sm("#d8a64a", { emissive: "#f3d98b", emissiveIntensity: 0.9 });
    inst.extras.push({ key: "far-door", lx: IX + R0.cx, lz: IZ + R0.z0 + 0.9, label: () => (S.world.bosses[id] ? "🌀 Leave through the far door" : "🚪 The far door (locked until the boss is dealt with)"), run: () => (S.world.bosses[id] ? leaveInstance() : host.toast("Locked. Something with a lid is in the way.")) });
    I.spawn = { x: R0.cx, z: R0.z1 - 2, yaw: 0 }; inst.rooms[id] = { g, exit: inst.exit, extras: inst.extras };
    I.steps.forEach((st, k) => { const sg = R0.seg(k); walkable.push({ x0: AX + IX + R0.x0 + 0.1 + R, x1: AX + IX + R0.x1 - 0.1 - R, z0: AZ + IZ + sg.z0, z1: AZ + IZ + sg.z1, room: `annex:inst:run:${k}`, y: 0 }); });
    walkable.push({ x0: AX + IX + R0.x0 + 0.1 + R, x1: AX + IX + R0.x1 - 0.1 - R, z0: AZ + IZ + R0.z1 - R0.LOB, z1: AZ + IZ + R0.z1 - 0.1 - R, room: "annex:inst:run:lobby", y: 0 }); }
  function spawnRun(id, I) { const R0 = runGeo(I);
    I.steps.forEach((st, k) => { const sg = R0.seg(k), rect = { x0: R0.x0 + 0.7, x1: R0.x1 - 0.7, z0: sg.z0 + 0.6, z1: sg.z1 - 0.6 }, mz = (sg.z0 + sg.z1) / 2, zone = `annex:inst:run:${k}`;
      if (st.type === "fight" && !S.world.mobs[runKey(k)]) st.mobs.forEach(([kind, tier], q) => { const sc0 = scaled(kind, tier); if (I.xpMult != null) sc0.xp = Math.max(1, Math.round(sc0.xp * I.xpMult)); const m = newMob(sc0, makeMobMesh(D.enemies[kind].mesh || kind, inst.g), R0.x0 + (q + 1) * R0.W / (st.mobs.length + 1), mz - 0.8 + (q % 2) * 1.2, rect, zone, null, `run:${k}:${q}`); m.run = k; inst.mobs.push(m); });
      if (st.type === "boss" && !S.world.bosses[id]) { const bd = I.boss; const boss = { kind: "boss", def: bd, name: bd.name, icon: bd.icon, maxHp: bd.hp, ac: bd.ac, atk: bd.atk, die: bd.die, dmgB: 0, xp: bd.xp, speed: bd.speed, every: bd.every, boss: true, clvl: (I.levelRange || [I.level || 1])[1] || I.level || 1 };
        inst.mobs.push(newMob(boss, makeMobMesh(bd.mesh || "boss", inst.g, 1.5), R0.cx, mz - 1, rect, zone, null, "run:boss")); } });
    (I.pickups || []).forEach((pk, q) => { const key = `run:${id}:p${q}`; if (S.world.loot[key] || !item(pk.item)) return; const sg = R0.seg(pk.step), x = R0.x0 + 1 + ((q * 1.7) % (R0.W - 2)), z = sg.z0 + 1.2;
      const g = new THREE.Group(); g.position.set(x, 0, z); inst.g.add(g); const it = item(pk.item); const b = new THREE.Mesh(G("loot", () => new THREE.OctahedronGeometry(0.16, 0)), sm(it.slot === "use" ? "#7fc8a0" : "#a8c8e8", { emissive: "#fff2a8", emissiveIntensity: 0.35 })); b.position.y = 0.4; g.add(b);
      inst.drops.push({ g, b, id: pk.item, lx: IX + x, lz: IZ + z, taken: false, key }); }); }
  function runStepCheck(k) { const I = D.instances[inst.id]; if (!I?.steps) return; if (inst.mobs.some((q) => q.run === k && !q.dead)) return; S.world.mobs[runKey(k)] = new Date().toISOString(); save();
    const left = I.steps.filter((st, q) => st.type === "fight" && !S.world.mobs[runKey(q)]).length; setTimeout(() => host.toast(`✅ ${I.steps[k].name.split(" · ")[0]} cleared${left ? ` · ${left} fight${left > 1 ? "s" : ""} to go` : " · only the boss is left"}`), 500); }
  function runRest(I) { const c = CH(); if (!c) return; c.hp = maxHp(); abilityUsed = false; save(); renderBar(); audio.sfx("pick"); host.toast(I.rest.text); addLog("🛋 Rested: HP full, ability recharged.", "heal"); }
  function runProgress(id = "starter") { const I = D?.instances[id]; if (!I?.steps) return null; const key = (k) => `run:${id}:${k}`; const fights = I.steps.map((st, k) => [st, k]).filter(([st]) => st.type === "fight");
    return { fights: fights.length, cleared: fights.filter(([, k]) => S.world.mobs[key(k)]).length, boss: !!S.world.bosses[id], rests: I.steps.filter((st) => st.type === "rest").length, pickups: (I.pickups || []).length, taken: (I.pickups || []).filter((_, q) => S.world.loot[`run:${id}:p${q}`]).length }; }
  function afterBoss(id) { const I = D.instances[id];
    if (I.layout === "run") setTimeout(() => host.toast(I.cleared), 1800);
    if (I.gate) { const gt = (D.gates || []).find((q) => q.instance === id); const c = CH(); if (gt && c) { c.waystones ||= {}; if (!c.waystones[gt.waystone.id]) { c.waystones[gt.waystone.id] = { at: new Date().toISOString(), gate: gt.id }; save(); setTimeout(() => host.toast(`✨ ${gt.waystone.name} is awake! Travel there from the waystone board or your Home crystal.`), 1800); addLog(`✨ Waystone woken: ${gt.waystone.name}`, "lvl"); } } } }
  // starter door: same plaza arm as the Training Closet, on the opposite wall
  function makeStarterPortal(ch, pl) { const PMg = C2 - (pl.hs ?? 6), mid = PMg / 2; const arms = ["zn", "xn", "xp", "zp"].filter((d) => pl.arms[d]), arm = arms[1] || arms[0]; if (!arm) return null; const I = D.instances.starter; let x, z, rot, sx, sz; /* the plaza arm next to the Training Closet's */
    if (arm[0] === "z") { z = arm === "zn" ? mid : C - mid; x = C2 + HW - 0.14; rot = -Math.PI / 2; sx = C2 - 0.35; sz = z; } else { x = arm === "xn" ? mid : C - mid; z = C2 + HW - 0.14; rot = Math.PI; sx = x; sz = C2 - 0.35; }
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; ch.g.add(g); box(0, 1.05, -0.03, 1.15, 2.1, 0.04, sm("#8a3a2a"), g); box(0, 2.14, -0.02, 1.25, 0.08, 0.06, sm("#4a2a1a"), g); box(-0.62, 1.05, -0.02, 0.06, 2.1, 0.06, sm("#4a2a1a"), g); box(0.62, 1.05, -0.02, 0.06, 2.1, 0.06, sm("#4a2a1a"), g);
    box(0, 1.25, 0.0, 0.4, 0.06, 0.02, sm("#d8a64a", { metalness: 0.6, roughness: 0.3 }), g); // brass mail slot
    const { ring, disc } = swirl(g); ring.position.z = 0.02; disc.position.z = 0.03; ring.material = sm("#b8483a", { emissive: "#f38a5a", emissiveIntensity: 0.9 });
    cplane(M("t:ssign", () => plate(I.door.sign, I.door.signSub, { w: 720, h: 220, bg: "#6a2a1e", fg: "#fbf3d0", accent: "#f3d98b" })), 1.15, 0.35, 0, 2.45, 0.04, 0, g);
    const tp = { g, ring, disc, lx: ch.lx + x, lz: ch.lz + z, y: 0, arm, spawn: { x: ch.lx + sx, z: ch.lz + sz, y: 0, yaw: yawTo(x - sx, z - sz) } }; disc.userData.run = () => openStarter(tp); disc.userData.maxD = 4.5; return tp; }
  const sportals = () => { const out = []; chunks.forEach((ch) => ch.rpg?.sportal && out.push(ch.rpg.sportal)); return out; };
  function openStarter(tp) { if (!transformed) return nudge(true); const I = D.instances.starter, pr = runProgress("starter");
    panel("starter", `🗡 ${I.name}`, (pn) => { pn.appendChild(el("p", "o3-riddle", I.door.label)); pn.appendChild(el("p", null, I.intro));
      pn.appendChild(el("p", "o3-small", `Solo · content level ${I.levelRange.join("–")} · real XP and loot. Progress: ${pr.cleared}/${pr.fights} fights, boss ${pr.boss ? "beaten" : "waiting"}, ${pr.taken}/${pr.pickups} pickups.`));
      if (pr.boss && pr.cleared === pr.fights) pn.appendChild(el("p", "o3-small", I.done));
      const go = el("button", "o3-btn", pr.boss ? "🗡 Walk through again (it's quiet now)" : "🗡 Step into the Mailroom"); go.dataset.rpg = "starter-go"; go.onclick = () => { host.closePanel(); enterStarter(tp); }; pn.appendChild(go); }); }
  const enterStarter = (tp) => { tp = tp || sportals()[0]; if (!tp) return null; return enterInstance({ pp: { id: "sp-mailroom", instance: "starter" }, i: startSec.center[0], j: startSec.center[1], spawn: tp.spawn }); };
  // gates (solo, deep) -> per-character waystones
  function openGate(p) { const I = D.instances[p.pp.instance], gt = p.pp, c = CH(), awake = !!c?.waystones?.[gt.waystone.id];
    panel("gate", `🚪 ${I.short || I.name}`, (pn) => { pn.appendChild(el("p", "o3-riddle", gt.label)); pn.appendChild(el("p", null, I.intro));
      pn.appendChild(el("p", "o3-small", `Solo gate · content level ${I.level}. ${awake ? "✨ Its waystone is already awake for you." : "Beat its keeper to wake " + gt.waystone.name + "."}`));
      if (S.world.bosses[p.pp.instance]) { pn.appendChild(el("p", "o3-small", I.done)); return; }
      const go = el("button", "o3-btn", "🚪 Step through"); go.dataset.rpg = "gate-go"; go.onclick = () => { host.closePanel(); enterInstance(p); }; pn.appendChild(go); }); }
  function gateWaystones() { const c = CH(); if (!c || !D) return []; return (D.gates || []).filter((gt) => c.waystones?.[gt.waystone.id]).map((gt) => { const Sx = ctx.secById[gt.section]; return { id: gt.waystone.id, name: gt.waystone.name, gate: gt.id, section: gt.section, i: Sx.center[0] + gt.cell[0], j: Sx.center[1] + gt.cell[1] }; }); }
  function travelWaystone(id) { const w = gateWaystones().find((q) => q.id === id); if (!w || inst.active) return false; host.closePanel(); audio.sfx("zip");
    host.threadWarp({ swap: () => { place(hubSpawn(w.i, w.j, 0), D.waystoneBoard.travel + ` (${w.name})`); event("crystal", w.id); } }); return true; }
  function waystoneList(pn) { const L = gateWaystones(); if (!L.length) { pn.appendChild(el("p", "o3-small", D.waystoneBoard.empty)); return; }
    L.forEach((w) => { const b = el("button", "o3-btn", `✨ ${w.name}`); b.dataset.rpg = "ws-" + w.id; b.onclick = () => travelWaystone(w.id); pn.appendChild(b); }); }
  let board = null;
  function buildBoard() { const sc = startSec.center, x = sc[0] * C + 3.6, z = sc[1] * C + 12.0, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.PI / 2; root.add(g);
    box(0, 0.6, 0, 0.08, 1.2, 0.08, sm("#6f5a3e"), g); cplane(M("t:wsb", () => plate("WAYSTONES", "gates you've opened", { w: 560, h: 200, bg: "#3a3450", fg: "#f3eeff", accent: "#b48cff" })), 0.9, 0.32, 0, 1.35, 0.05, 0, g);
    board = { g, lx: x, lz: z }; }
  function openBoard() { panel("wsboard", "🗺 Waystone board", (pn) => { pn.appendChild(el("p", "o3-small", "Gate waystones you've woken (this character only). Tap one to travel.")); waystoneList(pn); }); }

  // ---------- the Training Closet: practice only (nothing counts; everything resets when you leave) ----------
  function buildTrainingRoom(g, s) { const mt = sm("#3f6a5a", { roughness: 1 }); [[3.5, 6], [7, 6], [10.5, 6]].forEach(([x, z]) => box(x, 0.012, z, 2.6, 0.02, 2.6, mt, g));
    cplane(M("t:tboard", () => plate(D.training.sign, "rule 1: nothing in here counts. rule 2: be nice to the dummies.", { w: 1000, h: 260, bg: "#f4f1e6", fg: "#2a4a3a", accent: "#3fd8a8" })), 3.2, 0.84, s / 2, 2.1, 0.12, 0, g);
    const tb = sm("#8a6a4a"); box(1.4, 0.45, 10.5, 0.9, 0.9, 1.6, tb, g); const pot = new THREE.Mesh(G("pot", () => new THREE.CylinderGeometry(0.22, 0.18, 0.3, 12)), sm("#d8452e")); pot.position.set(1.4, 1.05, 10.5); g.add(pot);
    cplane(M("t:soup", () => plate("PRACTICE SOUP", "free · probably soup", { w: 520, h: 180, bg: "#7a2a1e", fg: "#fbf3d0", accent: "#f3d98b" })), 0.9, 0.31, 1.88, 1.5, 10.5, Math.PI / 2, g);
    const rk = sm("#6f5a3e"); box(s - 1.2, 1.0, 10.5, 0.08, 2.0, 1.8, rk, g); box(s - 1.2, 1.8, 10.5, 0.5, 0.05, 1.8, rk, g); [["#c9c2a2", 9.9], ["#a8c8e8", 10.5], ["#e8742a", 11.1]].forEach(([c, z]) => box(s - 1.2, 1.35, z, 0.3, 0.7, 0.35, sm(c), g));
    cplane(M("t:rack", () => plate("PRACTICE RACK", "borrow, don't keep", { w: 520, h: 180, bg: "#2a5a4a", fg: "#f3fff4", accent: "#9ff0c8" })), 0.9, 0.31, s - 1.68, 2.2, 10.5, -Math.PI / 2, g);
    inst.extras.push({ key: "soup", lx: IX + 1.9, lz: IZ + 10.5, label: () => D.training.soup.label, run: trainSoup }, { key: "rack", lx: IX + s - 1.7, lz: IZ + 10.5, label: () => D.training.rack.label, run: trainRack }); }
  function spawnTraining(I, n) { const s = I.size, rect = { x0: 1.6, x1: s - 1.6, z0: 1.4, z1: s - 2.4 }, sc = I.scale;
    (I.mobs || []).forEach((q, k) => { const st = scaled(q.kind, 0); inst.mobs.push(newMob(st, makeMobMesh(st.def.mesh || q.kind, inst.g), q.x, q.z, rect, inst.zone, null, "train:" + k)); });
    const bd = I.boss; if (bd) { const boss = { kind: "boss", def: bd, name: bd.name, icon: bd.icon, maxHp: Math.round(bd.hp * (1 + sc.hpPerExtra * (n - 1))), ac: bd.ac, atk: bd.atk, die: bd.die, dmgB: sc.dmgPerExtra * (n - 1), xp: bd.xp, speed: bd.speed, every: bd.every, boss: true, clvl: I.level || 1 };
      inst.mobs.push(newMob(boss, makeMobMesh(bd.mesh || "tboss", inst.g, 1.25), bd.x, bd.z, rect, inst.zone, null, "train:boss")); } }
  // v5: "boss:<instance id>" spawns that instance's boss (tier adds HP/AC/atk like any critter)
  function bossStats(id, tier = 0) { const I = D.instances[id], bd = I?.boss; if (!bd) return null; const sc = D.mobs.scale, t = clamp(tier, 0, 4);
    return { kind: "boss", def: bd, name: bd.name, icon: bd.icon, maxHp: Math.round(bd.hp * (1 + sc.hpPerTier * t)), ac: bd.ac + Math.floor(t / 2) * sc.acPerTwoTiers, atk: bd.atk + Math.floor(t * sc.atkPerTier), die: bd.die, dmgB: Math.floor(t * sc.dmgPerTier), xp: bd.xp, speed: bd.speed, every: bd.every, boss: true, clvl: (I.level || 1) + t, mesh: bd.mesh || "boss", big: bd.mesh === "tboss" ? 1.25 : 2 }; }
  function statsFor(kind, tier) { if (String(kind).startsWith("boss:")) return bossStats(kind.slice(5), tier); return D.enemies[kind] ? { ...scaled(kind, clamp(tier, 0, 4)), mesh: D.enemies[kind].mesh || kind, big: 1 } : null; }
  function spawnExtra(kind, tier = 0) { if (!isTraining()) return null; const st = statsFor(kind, tier); if (!st) return null; const s = D.instances[inst.id].size, k = inst.mobs.length;
    const m = newMob(st, makeMobMesh(st.mesh, inst.g, st.big), 2.5 + ((k * 2.3) % (s - 5)), 4 + (k % 3) * 1.6, { x0: 1.6, x1: s - 1.6, z0: 1.4, z1: s - 2.4 }, inst.zone, null, "train:sb" + k); if (st.boss) m.gmBoss = true; inst.mobs.push(m); addLog(`🧪 Spawned ${st.name} (tier ${tier})`, "sys"); return m.id; }
  // v5: game master drops something right in front of me (anywhere: hallway, room, Overlook or an instance). Never saved; gone when the cell unloads.
  let gmN = 0;
  function gmSpawn(kind, tier = 0, o = {}) { if (!D) return null; const st = statsFor(kind, tier); if (!st) return null; const p = lastP, yaw = host.state().yaw, ahead = o.ahead ?? 2.6;
    const wx = p.x - Math.sin(yaw) * ahead, wz = p.z - Math.cos(yaw) * ahead, id = "gm:" + (++gmN), feet = host.state().feet || 0;
    let ch = null, parent, ox, oz;
    if (inst.active) { parent = inst.g; ox = IX; oz = IZ; }
    else { const [i, j] = [Math.floor(p.x / C), Math.floor(p.z / C)]; ch = chunks.get(ck(i, j)) || null;
      if (ch && feet < 1) { parent = ch.g; ox = ch.lx; oz = ch.lz; } else { ch = { lx: 0, lz: 0, g: root, key: "gm-root", gmRoot: true }; parent = root; ox = 0; oz = 0; } }
    const lx = wx - ox, lz = wz - oz, rect = { x0: lx - 2.5, x1: lx + 2.5, z0: lz - 2.5, z1: lz + 2.5 };
    const m = newMob(st, makeMobMesh(st.mesh, parent, st.big), lx, lz, rect, curZone || (inst.active ? inst.zone : "annex:gm"), inst.active ? null : ch, id); m.gm = true; m.g.position.y = inst.active ? 0 : (feet > 1 ? feet : 0);
    m.g.rotation.y = Math.atan2(p.x - wx, p.z - wz);
    if (inst.active) inst.mobs.push(m); else gmMobs.push(m);
    addLog(`🎭 ${o.by ? o.by + " dropped" : "Dropped"} a ${st.name} (tier ${tier}) right in front of you!`, "sys"); audio.sfx("peek"); return m.id; }
  function startTraining() { trainSnap = JSON.parse(JSON.stringify({ character: S.character, quests: S.quests, counters: S.counters, stash: S.stash, world: S.world, flags: S.flags })); trainXP = 0; tipIdx = 0; abilityUsed = false; footArmed = false; rackUsed = false; }
  function endTraining() { if (!trainSnap) return; const c = S.character, T = TR(), real = !sandboxUsed; // sandbox visits never keep anything
    const back = trainSnap.character, cur = { quests: S.quests, counters: S.counters };
    if (real && c && back && T.grantXP) { back.xp = c.xp; back.stats = c.stats; back.pendingStat = c.pendingStat; }
    if (real && c && back && T.grantLoot) { const lent = [...(T.rack?.items || [])]; back.gear = c.gear; back.inv = c.inv.filter((id) => { const k = lent.indexOf(id); if (k >= 0 && !back.inv.includes(id)) { lent.splice(k, 1); return false; } return true; }); }
    S.character = back; S.stash = trainSnap.stash; S.world = trainSnap.world; S.flags = trainSnap.flags;
    if (real && T.questProgress) { S.quests = cur.quests; S.counters = cur.counters; } else { S.quests = trainSnap.quests; S.counters = trainSnap.counters; }
    if (S.character) S.character.hp = clamp(S.character.hp || 1, 1, maxHp()); trainSnap = null; sandboxUsed = false; sbParty = 0; abilityUsed = false; footArmed = false; save(); renderBar(); renderTip(); }
  let rackUsed = false;
  function trainSoup() { const c = CH(); if (!c) return; const h = D.training.soup.heal, r = rollN(h[0], h[1]), v = r.s + h[2]; c.hp = Math.min(maxHp(), c.hp + v); addLog(`🍲 Practice soup: ${h[0]}d${h[1]} [${r.r.join(",")}]+${h[2]} = +${v} HP`, "heal"); popup(`🍲 +${v} HP`, "hit"); audio.sfx("pick"); renderBar(); tipEvent("heal"); }
  function trainRack() { if (!rackUsed) { rackUsed = true; (D.training.rack.items || []).forEach((id) => { if (item(id)) CH().inv.push(id); }); addLog("🧥 Borrowed practice gear (it stays in the closet).", "loot"); host.toast(D.training.rack.text); renderBar(); } openGear(); }
  function trainingKO(by) { koBusy = true; const c = CH(), K = D.training.ko, from = inst.from; c.hp = 0; footArmed = false; abilityUsed = false; fightGroup = null;
    lastKO = { by: by || null, loss: 0, xp: c.xp, cons: null, stolen: null, note: K.note, inInstance: true, training: true, at: Date.now(), placed: false }; renderBar(); addLog(`💫 Practice knockout${by ? " (" + by + ")" : ""}. Nothing lost.`, "sys"); audio.sfx("flump");
    koT.textContent = K.fade; ko.classList.add("on");
    setTimeout(() => { koT.textContent = K.carry; leaveInstance(true); const sp = from?.spawn || safeSpawn(S.lastCrystal); place(sp); lastKO.placed = true; lastKO.to = sp; CH().hp = maxHp(); save(); renderBar(); renderTip(); host.updateActions(); }, 1400 * koSpeed);
    setTimeout(() => { ko.classList.remove("on"); koBusy = false; panel("knockout", "💫 " + K.noteTitle, (pn) => { pn.dataset.cons = "training"; pn.appendChild(el("div", "o3-note o3-gnote", K.note)); }); }, 3600 * koSpeed); }
  function openTraining(tp) { if (!transformed) return nudge(true); if (!TR().enabled) return;
    panel("training", "🎓 " + D.instances[TR().instance].name, (pn) => { pn.appendChild(el("p", "o3-riddle", tp.def.label)); pn.appendChild(el("p", null, D.training.intro));
      pn.appendChild(el("p", "o3-small", `Solo practice. ${TR().grantXP ? "XP counts in here right now." : "No XP, no level-ups."} ${TR().grantLoot ? "" : "Nothing you borrow or find comes home."} Knockouts here are harmless.`));
      const go = el("button", "o3-btn", "🎓 Step into the closet"); go.dataset.rpg = "training-go"; go.onclick = () => { host.closePanel(); enterInstance({ pp: { id: tp.def.id, instance: TR().instance }, i: startSec.center[0], j: startSec.center[1], spawn: tp.spawn }); }; pn.appendChild(go); }); }
  // tutorial tips (a small card; each one advances when you do the thing, or with Next)
  const tipEl = el("div", "o3-tip"); tipEl.hidden = true; const tipT = el("p"), tipN = el("button", "o3-btn ghost small", "Next ›"); tipN.dataset.rpg = "tip-next"; tipEl.append(tipT, tipN); host.hud.appendChild(tipEl);
  tipN.onclick = () => { const L = D.training.tips; if (tipIdx < L.length - 1) tipIdx++; else tipEl.hidden = true; renderTip(); };
  function renderTip() { const L = D?.training?.tips; if (!L || !isTraining() || isControl() || !transformed) { tipEl.hidden = true; return; } const t = L[Math.min(tipIdx, L.length - 1)]; tipEl.hidden = false; tipEl.dataset.tip = t.id; tipT.textContent = `Tip ${Math.min(tipIdx, L.length - 1) + 1}/${L.length} · ${t.text}`; tipN.textContent = tipIdx < L.length - 1 ? "Next ›" : "Got it"; }
  function tipEvent(ev) { if (!isTraining()) return; const L = D.training.tips; let k = tipIdx; while (k < L.length && L[k].on && L[k].on !== ev) k++; if (k < L.length && L[k].on === ev) { tipIdx = k + 1; renderTip(); } }

  // ---------- dev sandbox (Training Closet only; hidden unless &sandbox=1 on localhost, or the console call) ----------
  if (urlSandbox) sandboxOn = true;
  const sandboxAllowed = () => (sandboxOn && (isLocal || !!TR().sandbox?.allowLive)) || (isControl() && !!ext.isAdmin?.()); // v5: always on in the Control Room for a server-verified admin
  const SB = {
    spawn: (kind, tier = 0) => { sandboxUsed = true; return spawnExtra(kind, tier); },
    equip: (id) => { const it = item(id), c = CH(); if (!it || !c || !EQUIP.includes(it.slot) || !isTraining()) return false; sandboxUsed = true; if (c.gear[it.slot]) c.inv.push(c.gear[it.slot]); c.gear[it.slot] = id; renderBar(); addLog(`🧪 Equipped ${it.name}`, "sys"); return true; },
    level: (L) => { const c = CH(); if (!c || !isTraining()) return false; sandboxUsed = true; c.xp = D.levels.xp[clamp(L, 1, D.levels.xp.length) - 1]; c.hp = maxHp(); renderBar(); addLog(`🧪 Level set to ${level()}`, "sys"); return level(); },
    stats: (o) => { const c = CH(); if (!c || !isTraining()) return false; sandboxUsed = true; Object.entries(o || {}).forEach(([k, v]) => { if (k in c.stats) c.stats[k] = clamp(Math.round(+v || 10), 1, D.levels.statMax); }); c.hp = Math.min(c.hp, maxHp()); renderBar(); addLog("🧪 Stats: " + D.stats.map((s) => s.name + " " + c.stats[s.id]).join(", "), "sys"); return { ...c.stats }; },
    party: (n) => { if (!isTraining()) return false; sandboxUsed = true; sbParty = clamp(n | 0, 1, D.party.max); spawnInstance(inst.id); renderBar(); host.updateActions(); addLog(`🧪 Party size ${partySize()} (room re-spawned)`, "sys"); return partySize(); },
    force: (arr) => { forced.length = 0; (arr || []).forEach((v) => { v = v | 0; if (v >= 1 && v <= 20) forced.push(v); }); addLog(`🧪 Next d20s forced: ${forced.join(", ") || "(none)"}`, "sys"); return forced.slice(); },
    reset: () => { if (!isTraining()) return false; spawnInstance(inst.id); host.updateActions(); return inst.mobs.length; },
    heal: () => { const c = CH(); if (!c) return; c.hp = maxHp(); renderBar(); },
  };
  function openSandbox() { if (!isTraining()) { host.toast("🧪 The sandbox only opens inside the Training Closet (or the Control Room)."); return; }
    panel("sandbox", "🧪 Combat sandbox (dev)", (pn) => { const row = (lab, ...kids) => { const r = el("div", "o3-sbrow"); r.appendChild(el("b", null, lab)); kids.forEach((k) => r.appendChild(k)); pn.appendChild(r); return r; };
      const sel = (opts, id) => { const s = el("select"); s.dataset.rpg = id; opts.forEach(([v, t]) => { const o = el("option", null, t); o.value = v; s.appendChild(o); }); return s; };
      const btn = (t, id, fn) => { const b = el("button", "o3-btn ghost small", t); b.dataset.rpg = id; b.onclick = fn; return b; };
      pn.appendChild(el("p", "o3-small", "Dev only. Nothing here persists: your character is restored when you leave the closet."));
      const ek = sel(Object.entries(D.enemies).map(([k, e]) => [k, `${e.icon} ${e.name}`]), "sb-enemy"), et = sel([0, 1, 2, 3, 4].map((t) => [t, "tier " + t]), "sb-tier");
      row("Spawn", ek, et, btn("Spawn", "sb-spawn", () => SB.spawn(ek.value, +et.value)), btn("Reset room", "sb-reset", () => SB.reset()));
      const it = sel(Object.entries(D.items).filter(([, v]) => EQUIP.includes(v.slot)).map(([k, v]) => [k, `${v.name} (${v.slot})`]), "sb-item"); row("Equip", it, btn("Equip", "sb-equip", () => SB.equip(it.value)));
      const lv = sel(D.levels.xp.map((_, q) => [q + 1, "Level " + (q + 1)]), "sb-level"); lv.value = level(); row("Level", lv, btn("Set", "sb-setlevel", () => SB.level(+lv.value)));
      const ins = {}; const sr = row("Stats"); D.stats.forEach((s) => { const i = el("input"); i.type = "number"; i.min = 1; i.max = D.levels.statMax; i.value = CH().stats[s.id]; i.title = s.name; i.dataset.rpg = "sb-stat-" + s.id; i.style.width = "3.2em"; ins[s.id] = i; sr.appendChild(el("span", "o3-small", s.icon)); sr.appendChild(i); });
      sr.appendChild(btn("Apply", "sb-stats", () => SB.stats(Object.fromEntries(Object.entries(ins).map(([k, i]) => [k, +i.value])))));
      row("Party", ...[1, 2, 3].map((n) => btn(String(n), "sb-party-" + n, () => SB.party(n))));
      const fi = el("input"); fi.placeholder = "20, 1, 15"; fi.dataset.rpg = "sb-dice"; fi.style.width = "8em"; row("Force d20", fi, btn("Force", "sb-force", () => SB.force(fi.value.split(/[ ,]+/).map(Number))), btn("Clear", "sb-unforce", () => SB.force([])));
      row("Me", btn("Full HP", "sb-heal", () => SB.heal()), btn("Knock me out", "sb-ko", () => { host.closePanel(); knockout("sandbox"); }));
    }, { wide: true }); }

  // ---------- gentle nudges before you transform ----------
  let curZone = null, lastP = { x: 0, z: 0 }, nudgeShown = 0;
  function nudge(force) { const now = Date.now(); if (!force && now - nudgeShown < 4000) return; nudgeShown = now; nudges++; host.toast(D.nudge.text); }

  // ---------- per frame ----------
  function update(dt, ts, p, st) { if (!D) return; lastP = p; curZone = st.zone; cd = Math.max(0, cd - dt); const busy = st.busy || koBusy;
    circles.forEach((c) => { c.ring.rotation.z = ts * 0.4; c.disc.material.emissiveIntensity = transformed ? 0.2 : 0.45 + Math.sin(ts * 2.2) * 0.2; const d = Math.hypot(c.x - p.x, c.z - p.z), lvl = Math.abs((c.y || 0) - st.feet) < 1.2;
      if (lvl && d < 0.8 && !c.inside) { c.inside = true; if (!busy && !transformed) openCircle(); } else if (d > 1.4) c.inside = false; });
    if (!transformed && !inst.active) { const zc = /^annex:c:(-?\d+),(-?\d+):/.exec(st.zone || ""); const atStart = !zc || (+zc[1] === startSec.center[0] && +zc[2] === startSec.center[1]);
      if (!atStart && !busy) { if (!leftStart) { leftStart = true; nudge(); nudgeT = 0; } nudgeT += dt; if (nudgeT > D.nudge.every) { nudgeT = 0; nudge(); } } else nudgeT = 0; }
    const yaw = host.state().yaw; let fighting = null;
    const tickList = (list, ox, oz) => list.forEach((m) => { if (tickMob(m, dt, ts, p.x - ox, p.z - oz, st.zone, busy, yaw)) fighting = m; });
    tportals().forEach((tp) => (tp.disc.rotation.z = -ts * 1.5)); sportals().forEach((tp) => (tp.disc.rotation.z = ts * 1.2));
    if (inst.active) { tickList(inst.mobs, IX, IZ); inst.exit.disc.rotation.z = -ts * 1.5; inst.drops.forEach((d) => { if (!d.taken) d.b.rotation.y = ts * 2; }); }
    else { for (let q = gmMobs.length - 1; q >= 0; q--) { const m = gmMobs[q]; if (!m.ch.gmRoot && !chunks.has(m.ch.key)) { gmMobs.splice(q, 1); continue; } tickList([m], m.ch.lx, m.ch.lz); } }
    if (!inst.active) chunks.forEach((ch) => { const r = ch.rpg; if (!r) return; if (r.mobs.length) tickList(r.mobs, ch.lx, ch.lz);
      const dr = r.door; if (dr && dr.swing > 0 && dr.swing < 1) { dr.swing = Math.min(1, dr.swing + dt * 2.5); dr.g.scale.y = Math.max(0.001, 1 - dr.swing); if (dr.swing >= 1) dr.g.visible = false; }
      [r.box, r.box2].forEach((b) => { if (b && !b.opened) { b.spark.position.y = 0.75 + Math.sin(ts * 2) * 0.05; b.spark.rotation.y = ts * 2; } });
      if (r.portal) r.portal.disc.rotation.z = -ts * 1.5; r.drops.forEach((d) => { if (!d.taken) { d.b.rotation.y = ts * 2; d.b.position.y = 0.4 + Math.sin(ts * 3) * 0.05; } }); });
    if (fighting) { const grp = fighting.ch ? fighting.ch.key : "inst"; if (grp !== fightGroup) { fightGroup = grp; abilityUsed = false; footArmed = false; renderBar(); } }
    if (transformed && CH() && !fighting && !busy && /:h$/.test(st.zone || "")) { regenT += dt; if (regenT > D.mobs.regenEvery && CH().hp < maxHp()) { regenT = 0; CH().hp++; save(); renderBar(); } } else regenT = 0;
  }
  function tickMob(m, dt, ts, px, pz, zone, busy, yaw) { const gp = m.g.position, B = m.big || 1; m.barG.rotation.y = yaw; const f = Math.max(0, m.hp / m.maxHp); m.fg.scale.x = Math.max(0.001, f) * 0.58; m.fg.position.x = -0.29 * (1 - f);
    if (m.dead) { if (!m.g.visible) return false; m.deadT += dt; m.body.scale.setScalar(Math.max(0.001, 1 - m.deadT / 0.6) * B); m.barG.visible = false; if (m.deadT > 0.6) m.g.visible = false; return false; }
    m.ph += dt; const P = m.parts; if (P.w) P.w.forEach((w, i) => (w.rotation.z = Math.sin(m.ph * 14) * 0.7 * (i ? 1 : -1))); if (P.fly) m.body.position.y = P.fly + Math.sin(m.ph * 3) * 0.12;
    if (P.top) P.top.rotation.x = m.state === "fight" ? -Math.abs(Math.sin(m.ph * 5)) * 0.5 : 0; if (P.bob) m.body.position.y = Math.sin(m.ph * 2) * 0.06; if (m.kind === "dust") m.body.position.y = Math.abs(Math.sin(m.ph * 6)) * (m.state === "fight" ? 0.18 : 0.04);
    if (m.hitT > 0) { m.hitT -= dt; const s = 1 + Math.sin(m.hitT * 40) * 0.12; m.body.scale.set(s * B, B / s, s * B); } else m.body.scale.setScalar(B);
    const engaged = transformed && !busy && zone === m.zone; m.zz.visible = !transformed;
    const tx = engaged ? px : m.home[0], tz = engaged ? pz : m.home[1], dx = tx - gp.x, dz = tz - gp.z, d = Math.hypot(dx, dz);
    if (!engaged) { m.state = "idle"; if (d > 0.05) { const s2 = Math.min(d, m.speed * 0.5 * dt); gp.x += dx / d * s2; gp.z += dz / d * s2; } return false; }
    if (m.state !== "fight") { m.state = "fight"; m.cd = Math.max(m.cd, 1.1); }
    if (d > D.mobs.mobReach * 0.8) { const s2 = Math.min(d - D.mobs.mobReach * 0.7, m.speed * dt); gp.x = clamp(gp.x + dx / d * s2, m.rect.x0, m.rect.x1); gp.z = clamp(gp.z + dz / d * s2, m.rect.z0, m.rect.z1); }
    m.g.rotation.y = Math.atan2(dx, dz); m.cd -= dt; if (m.cd <= 0 && Math.hypot(px - gp.x, pz - gp.z) < D.mobs.mobReach + 0.3) { m.cd = m.every * (0.85 + rng() * 0.3); mobAttack(m); }
    return true; }

  // ---------- "near" candidates (E key / action button) ----------
  function near(p, feet, cand) { if (!D) return; const lv = (y) => Math.abs((y || 0) - feet) < 1.2;
    circles.forEach((c) => { if (lv(c.y) && !transformed) cand("rpg:circle:" + c.id, Math.hypot(c.x - p.x, c.z - p.z), 1.9, D.circle.label, openCircle); });
    const sc = startCircle(); if (transformed && sc && CH()?.inv.includes("parcel")) cand("rpg:outbox", Math.hypot(sc.x + 1.15 - p.x, sc.z - 0.6 - p.z), 2.2, D.outbox.label, deliver);
    sportals().forEach((tp) => cand("rpg:starter" + (transformed ? "" : ":n"), Math.hypot(tp.lx - p.x, tp.lz - p.z), 2.2, transformed ? `🗡 ${D.instances.starter.name} (solo · real XP · level 1–2)` : `🗡 ${D.instances.starter.short} (step into the entrance circle first)`, () => openStarter(tp)));
    if (board && !inst.active && feet < 1) cand("rpg:wsboard", Math.hypot(board.lx - p.x, board.lz - p.z), 1.9, D.waystoneBoard.label, openBoard);
    tportals().forEach((tp) => { if (lv(tp.y)) cand("rpg:train:" + tp.def.id + (transformed ? "" : ":n"), Math.hypot(tp.lx - p.x, tp.lz - p.z), 2.2, transformed ? "🎓 Training Closet (practice, nothing counts)" : "🎓 Training Closet (step into the entrance circle first)", () => openTraining(tp)); });
    const mobC = (m) => { if (m.dead || !transformed || curZone !== m.zone) return; cand("rpg:mob:" + m.id + (cd > 0 ? ":cd" : ""), dist(m), D.mobs.reach, cd > 0 ? "⏳ (winding up…)" : `⚔️ ${weapon().name} → ${m.name} (d20${sg(atkBonus())} vs AC ${m.ac})`, () => attackMob(m)); };
    if (!inst.active) gmMobs.forEach((m) => { if (lv(m.g.position.y)) mobC(m); });
    if (feet > 1) return;
    const dropC = (d) => { if (!d.taken) cand("rpg:drop:" + d.lx.toFixed(2) + ":" + d.lz.toFixed(2), Math.hypot(d.lx - p.x, d.lz - p.z), 1.7, `✋ Pick up ${item(d.id).name}`, () => takeDrop(d)); };
    if (inst.active) { inst.mobs.forEach(mobC); inst.drops.forEach(dropC); inst.extras.forEach((x) => cand("rpg:x:" + x.key, Math.hypot(x.lx - p.x, x.lz - p.z), 1.9, x.label(), x.run)); cand("rpg:exit", Math.hypot(inst.exit.lx - p.x, inst.exit.lz - p.z), 2.2, `🌀 Leave the ${D.instances[inst.id].short || "room"}`, () => leaveInstance()); return; }
    chunks.forEach((ch) => { const r = ch.rpg; if (!r) return; r.mobs.forEach(mobC); r.drops.forEach(dropC);
      [r.box, r.box2].forEach((b) => { if (b && !b.opened) cand("rpg:box:" + b.key, Math.hypot(b.lx - p.x, b.lz - p.z), 1.6, transformed ? (b.chest ? "🧰 Open the chest" : "📦 Open the cardboard box") : "📦 A box (waiting for your Annex self)", () => openBox(b)); });
      if (r.door && !r.door.open) cand("rpg:door:" + r.door.key + (transformed ? "" : ":n"), Math.hypot(r.door.lx - p.x, r.door.lz - p.z), 1.8, transformed ? `🎲 Dice door: ${D.stats.find((s) => s.id === r.door.P.stat).name} check (DC ${r.door.P.dc})` : "🎲 A dice door (step into the entrance circle first)", () => openDoor(r.door));
      if (r.portal) cand("rpg:portal:" + r.portal.pp.id + (transformed ? "" : ":n"), Math.hypot(r.portal.lx - p.x, r.portal.lz - p.z), 2.4, r.portal.pp.gate ? (transformed ? `🚪 Gate (solo · level ${D.instances[r.portal.pp.instance].level})` : "🚪 A gate (step into the entrance circle first)") : transformed ? "🌀 Party portal (1–3 explorers)" : "🌀 Party portal (step into the entrance circle first)", () => openPortal(r.portal)); }); }
  function deliver() { const c = CH(), i = c?.inv.indexOf("parcel") ?? -1; if (i < 0) return false; c.inv.splice(i, 1); audio.sfx("pick"); host.toast(D.outbox.done); progress("fetch"); save(); return true; }
  function clickTargets() { if (!D) return []; const out = circles.map((c) => c.disc); tportals().forEach((tp) => out.push(tp.disc)); sportals().forEach((tp) => out.push(tp.disc)); if (inst.active) { inst.mobs.forEach((m) => !m.dead && out.push(m.hitMesh)); out.push(inst.exit.disc); return out; }
    gmMobs.forEach((m) => !m.dead && out.push(m.hitMesh)); chunks.forEach((ch) => { if (!ch.rpg) return; ch.rpg.mobs.forEach((m) => !m.dead && out.push(m.hitMesh)); if (ch.rpg.portal) out.push(ch.rpg.portal.disc); }); return out; }

  // ---------- panels ----------
  function openSheet() { const c = CH(); if (!c) return; const P = pathOf(), L = level(), w = weapon();
    panel("sheet", `📜 ${c.name}`, (pn) => {
      pn.appendChild(el("p", "o3-small", `Level ${L} ${P.icon} ${P.name} · XP ${c.xp}${D.levels.xp[L] != null ? " / " + D.levels.xp[L] : " (max level)"} · proficiency ${sg(prof())}`));
      pn.appendChild(el("p", null, `❤️ HP ${c.hp}/${maxHp()} · 🛡 AC ${ac()} · ⚔️ ${w.name}: d20${sg(atkBonus())} to hit, d${w.die}${sg(dmgMod())} damage`));
      const t = el("div", "o3-stats"); D.stats.forEach((s) => { const r = el("div", "o3-statrow"); r.dataset.stat = s.id; const v = stat(s.id);
        r.append(el("span", "o3-sname", `${s.icon} ${s.name}`), el("b", null, String(v)), el("span", "o3-sfinal", `${sg(mod(v))}${P.prof.includes(s.id) ? " · proficient " + sg(mod(v) + prof()) : ""}`), el("span", "o3-small o3-sabout", s.about)); t.appendChild(r); }); pn.appendChild(t);
      pn.appendChild(el("p", null, `${P.ability.icon} ${P.ability.name}${abilityUsed ? " (used this scuffle)" : ""}: ${P.ability.text}`));
      if ((c.status || []).length) pn.appendChild(el("p", "o3-small", "Status: " + c.status.map((s) => s.text).join(" · ")));
      statPick(pn);
      if (S.stash.length) { pn.appendChild(el("p", "o3-small", "🫳 Grenshol's stash (for a future win-back):")); S.stash.forEach((s) => pn.appendChild(el("div", "o3-note o3-gnote", `${item(s.item).name} · ${s.note}`))); }
      const re = el("button", "o3-btn ghost small", "🔁 Start over with a new character"); re.dataset.rpg = "sheet-reset"; let sure = false; re.onclick = () => { if (!sure) { sure = true; re.textContent = "Really? Tap again (level, gear, quests reset)."; return; } host.closePanel(); resetChar(); host.toast("Your Annex self has gone for a lie-down. Step into the entrance circle to make a new one."); }; pn.appendChild(re);
      pn.appendChild(el("p", "o3-small o3-credits", D.compatLine + " " + D.attribution)); }, { wide: true }); }
  function openGear() { const c = CH(); if (!c) return; tipEvent("gear");
    panel("gear", "🎒 Gear & bag", (pn) => { pn.appendChild(el("p", "o3-small", "Equipped:")); EQUIP.forEach((s) => { const it = item(c.gear[s]) || (s === "weapon" ? item("fists") : null); pn.appendChild(el("div", "o3-note", `${{ weapon: "⚔️", armor: "🧥", head: "🎩", trinket: "🔑" }[s]} ${s}: ${it ? it.name + " · " + itemLine(it) : "(nothing)"}`)); });
      pn.appendChild(el("p", "o3-small", `In the bag (${c.inv.length}):`)); if (!c.inv.length) pn.appendChild(el("p", "o3-small", "Empty. Critters drop things; boxes and dice-door rooms have things."));
      c.inv.forEach((id) => { const it = item(id); if (!it) return; const row = el("div", "o3-note"); row.append(document.createTextNode(`${it.name} · ${itemLine(it)} `));
        if (EQUIP.includes(it.slot)) { const b = el("button", "o3-btn small", "Equip"); b.dataset.rpg = "equip-" + id; b.onclick = () => { equip(id); host.closePanel(); openGear(); }; row.appendChild(b); }
        if (it.slot === "use") { const b = el("button", "o3-btn small", "Use"); b.dataset.rpg = "use-" + id; b.onclick = () => { useItem(id); host.closePanel(); openGear(); }; row.appendChild(b); } pn.appendChild(row); });
      if (S.stash.length) pn.appendChild(el("p", "o3-small", `Grenshol is holding ${S.stash.length} of your things. See your sheet (C).`)); }); }
  function openQuests() { panel("quests", "🗒 Quest log", (pn) => { D.quests.filter(qVisible).forEach((q) => { const st = S.quests[q.id] || { n: 0 }; const r = el("div", "o3-note o3-quest" + (st.done ? " done" : "")); r.dataset.quest = q.id;
      r.append(el("b", null, `${st.done ? "✅" : "▫️"} ${q.name}`), document.createTextNode(` · ${q.text} `), el("span", "o3-small", st.done ? `done (+${q.xp} XP)` : `${Math.min(st.n, q.count)}/${q.count} · ${q.xp} XP`)); pn.appendChild(r); });
      if (!S.flags.sawPortal) pn.appendChild(el("p", "o3-small", "More quests turn up as you find stranger doors.")); }); }
  function openLog() { panel("log", "🎲 Dice log", (pn) => { const l = el("div", "o3-chatlog"); if (!logs.length) l.appendChild(el("p", "o3-small", "No rolls yet.")); logs.slice(-40).forEach((x) => l.appendChild(el("div", "o3-dl " + x.kind, x.t))); pn.appendChild(l); setTimeout(() => (l.scrollTop = 1e6), 0); }); }

  // ---------- lifecycle ----------
  function onArrive() { inAnnex = true; transformed = false; leftStart = false; nudgeT = 0; setPlayerName(null); renderBar();
    setTimeout(() => { if (D && inAnnex && !transformed && !host.state().busy) host.toast(CH() ? `✨ The stitched circle by the wall is glowing. Step in to become ${CH().name}.` : "✨ A stitched circle is glowing by the wall. Step in to become your Annex self."); }, 9000); }
  function onLeave() { if (inst.active) leaveInstance(true); const was = transformed; inAnnex = false; transformed = false; setPlayerName(null); renderBar(); if (was && D) addLog(D.circle.unbecome, "sys"); }
  function init() { (D.partyPortals || []).forEach((pp) => { const Sx = ctx.secById[pp.section]; if (!Sx) return; portalByCell.set(ck(Sx.center[0] + pp.cell[0], Sx.center[1] + pp.cell[1]), pp); });
    (D.gates || []).forEach((gt) => { const Sx = ctx.secById[gt.section]; if (!Sx) return; const k = ck(Sx.center[0] + gt.cell[0], Sx.center[1] + gt.cell[1]); if (!portalByCell.has(k)) portalByCell.set(k, { ...gt, gate: true }); });
    buildBoard();
    const sc = startSec.center; buildCircle(sc[0] * C + 5.0, sc[1] * C + 12.0, 0, "start"); if (OV) buildCircle(OV.x0 + 3.2, OV.z1 - 1.6, OV.y, "overlook"); buildOverlookTraining();
    chunks.forEach((ch) => onCell(ch)); refreshBlockers(); }
  const ready = fetch("data/annex-rpg.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { D = d; init(); } return !!d; }).catch(() => false);

  const roomLabel = (z) => { const I = D?.instances[inst.id]; if (I?.layout === "run") { const k = /:run:(\d+)$/.exec(z || curZone || ""); const stp = k ? I.steps[+k[1]] : null; return `${I.short || I.name} · ${stp ? stp.name : "the entrance"}`; } if (I?.solo) return `${I.name} · solo · level ${I.level}`; return roomLabel0(); };
  const roomLabel0 = () => `${D?.instances[inst.id]?.name || "An instance"} · ${isControl() ? "admin only · nothing here counts" : isTraining() ? "practice (nothing here counts)" : "party of " + partySize()}`;
  const atmos = () => { const p = D?.instances[inst.id]?.palette || {}; return { bg: p.bg || "#3a3a2c", fog: p.fog || [6, 40], hemi: p.hemi ?? 1.1 }; };
  const instButtons = () => { const out = [Object.assign(el("button", "o3-btn ghost", isControl() ? "🌀 Leave the Control Room" : isTraining() ? "🌀 Leave the closet" : "🌀 Leave the instance"), { onclick: () => leaveInstance() })];
    if (isControl() && ext.controlButtons) out.push(...ext.controlButtons());
    if (isTraining() && sandboxAllowed()) { const b = Object.assign(el("button", "o3-btn ghost o3-sbbtn", "🧪 Sandbox"), { onclick: () => openSandbox() }); b.dataset.rpg = "sandbox"; out.push(b); } return out; };
  const findMob = (id) => { const all = []; chunks.forEach((ch) => ch.rpg?.mobs.forEach((m) => all.push(m))); inst.mobs.forEach((m) => all.push(m)); gmMobs.forEach((m) => all.push(m)); return id ? all.find((q) => q.id === id) : all.filter((q) => !q.dead).sort((a, b) => dist(a) - dist(b))[0]; };
  const debug = {
    ready: () => ready, loaded: () => !!D, seed, force: (arr) => { forced.length = 0; forced.push(...arr); }, roll, rollN, mod, resolveAttack: (bonus, a, adv) => resolveAttack(bonus, a, adv),
    state: () => { const c = CH(); return { transformed, inAnnex, hasChar: !!c, char: c && JSON.parse(JSON.stringify(c)), level: c ? level() : 0, maxHp: c ? maxHp() : 0, ac: c ? ac() : 0, atk: c ? atkBonus() : 0, prof: c ? prof() : 0,
      quests: JSON.parse(JSON.stringify(S.quests)), stash: S.stash.slice(), world: JSON.parse(JSON.stringify(S.world)), counters: JSON.parse(JSON.stringify(S.counters)), lastCrystal: S.lastCrystal, flags: { ...S.flags },
      inInstance: inst.active, instance: inst.id, partySize: partySize(), urlParty, party: JSON.parse(JSON.stringify(party)), lastAttack, lastKO, lastLevelUp, lastDoor, nudges, inTraining: isTraining(), trainXP, tip: tipIdx, tipShown: !tipEl.hidden, sandboxOn: sandboxAllowed(), sandboxUsed, sbParty, training: { ...TR(), tips: undefined, portals: undefined }, koBusy, footArmed, abilityUsed, log: logs.slice(-8).map((l) => l.t), barShown: !bar.hidden, cd, openKind }; },
    create: (b) => createChar({ method: "array", ...b }), transform: () => transform(false), reset: () => { S = blank(); save(); transformed = false; setPlayerName(null); renderBar(); },
    plan: (pl) => rpgPlan(pl), scaled: (k, t) => { const s = scaled(k, t); delete s.def; return s; }, circle: (id = "start") => { const c = circles.find((q) => q.id === id); return c && { ...W3(c.x, c.y, c.z) }; },
    mobs: () => { const out = []; const f = (m) => { const w = mobWorldLocal(m); out.push({ id: m.id, kind: m.kind, name: m.name, hp: m.hp, maxHp: m.maxHp, ac: m.ac, atk: m.atk, dmgB: m.dmgB, xp: m.xp, dead: m.dead, state: m.state, zone: m.zone, boss: !!m.boss, ...W3(w.x, 0, w.z) }); };
      chunks.forEach((ch) => ch.rpg?.mobs.forEach(f)); inst.mobs.forEach(f); gmMobs.forEach(f); return out.map((o) => ({ ...o, gm: String(o.id).startsWith("gm:") })); },
    hallwayMobs: () => { let n = 0; chunks.forEach((ch) => ch.rpg?.mobs.forEach((m) => { if (!/:r\d$/.test(m.zone)) n++; const gp = m.g.position; if (gp.x < m.rect.x0 - 0.01 || gp.x > m.rect.x1 + 0.01 || gp.z < m.rect.z0 - 0.01 || gp.z > m.rect.z1 + 0.01) n++; })); return n; },
    attack: (id) => { const m = findMob(id); if (!m) return null; cd = 0; return attackMob(m, true); },
    kill: (id) => { const m = findMob(id); if (!m) return false; m.hp = 0; killMob(m); return true; },
    addXP: (n) => gainXP(n, "debug"), raise, setHP: (n) => { CH().hp = n; save(); renderBar(); }, hurt: (n) => hurt(n, "test"), ko: (force, speed = 1) => { koSpeed = speed; knockout("test", force); }, koSpeed: (v) => { koSpeed = v; },
    give: (id) => giveItem(id), equip, event, progress, ability: useAbility,
    doors: () => { const out = []; chunks.forEach((ch) => { const d = ch.rpg?.door; if (d) out.push({ key: d.key, stat: d.P.stat, dc: d.P.dc, open: d.open, ...W3(d.lx, 0, d.lz), blocked: ch.blockers.includes(d.blk) }); }); return out; },
    doorRoll: (key) => { let dr = null; chunks.forEach((ch) => { if (ch.rpg?.door?.key === key) dr = ch.rpg.door; }); return dr ? doorRoll(dr) : null; },
    doorWait: (key, t = 0) => { chunks.forEach((ch) => { if (ch.rpg?.door?.key === key) ch.rpg.door.waitUntil = t; }); },
    boxes: () => { const out = []; chunks.forEach((ch) => [ch.rpg?.box, ch.rpg?.box2].forEach((b) => b && out.push({ key: b.key, opened: b.opened, chest: b.chest, ...W3(b.lx, 0, b.lz) }))); return out; },
    portals: () => [...portalByCell.entries()].filter(([, pp]) => !pp.gate).map(([k, pp]) => { const [i, j] = k.split(",").map(Number); return { id: pp.id, i, j, section: sectionOf(i, j).id, ...W3(i * C + C2 + HW - 0.3, 0, j * C + C2 + HW - 0.3) }; }),
    enterInstance: (pid) => { const pp = (D.partyPortals || []).find((q) => q.id === (pid || D.partyPortals[0].id)); const k = [...portalByCell.entries()].find(([, q]) => q === pp)[0].split(",").map(Number); return enterInstance({ pp, i: k[0], j: k[1] }); },
    tportals: () => tportals().map((tp) => ({ id: tp.def.id, arm: tp.arm, ...W3(tp.lx, tp.y, tp.lz), spawn: { ...W3(tp.spawn.x, tp.spawn.y, tp.spawn.z), yaw: tp.spawn.yaw } })),
    enterTraining: (id = "tp-entrance") => { const tp = tportals().find((q) => q.def.id === id) || tportals()[0]; if (!tp) return null; return enterInstance({ pp: { id: tp.def.id, instance: TR().instance }, i: startSec.center[0], j: startSec.center[1], spawn: tp.spawn }); },
    openTraining: (id = "tp-entrance") => { const tp = tportals().find((q) => q.def.id === id); return tp ? (openTraining(tp), true) : false; },
    setTraining: (o) => { Object.assign(D.training, o || {}); return { ...D.training, tips: undefined }; }, sb: SB, sandboxOn: (v = true) => { sandboxOn = !!v; host.updateActions(); return sandboxAllowed(); },
    tipNext: () => tipN.click(), extras: () => inst.extras.map((x) => ({ key: x.key, ...W3(x.lx, 0, x.lz) })), useExtra: (k) => { const x = inst.extras.find((q) => q.key === k); if (x) x.run(); return !!x; },
    leaveInstance: () => leaveInstance(), riddle: (ai) => { const rd = D.riddles.find((r) => !(S.counters.riddles || []).includes(r.id)); return rd ? answerRiddle(rd.id, ai ?? rd.ok) : null; },
    openSheet, openGear, openQuests, openLog, openCreator, openCircle, deliver, takeDrop: () => { let d = null; const f = (q) => { if (!q.taken && !d) d = q; }; chunks.forEach((ch) => ch.rpg?.drops.forEach(f)); inst.drops.forEach(f); if (d) takeDrop(d); return d && d.id; }, logs: () => logs.map((l) => l.t),
  };
  debug.sandbox = () => { sandboxOn = true; host.updateActions(); if (isTraining()) openSandbox(); else host.toast("🧪 Sandbox armed. It opens inside the Training Closet."); return sandboxAllowed(); };
  const api5 = { ext, gmSpawn, gateWaystones, travelWaystone, waystoneList, enterInstance: (p) => enterInstance(p), leaveInstance: () => leaveInstance(), data: () => D, instId: () => (inst.active ? inst.id : null), isControl, partySize: () => partySize(),
    party: () => ({ id: party.id, members: party.members.map((m) => ({ ...m })), max: D?.party?.max || 3 }),
    setParty: (id, members) => { party.id = id || null; const mine = { id: host.me?.id || "me", me: true }; party.members = [mine, ...(members || []).filter((m) => m.id !== mine.id)].slice(0, D?.party?.max || 3); return party.members.length; },
    lastPos: () => ({ ...lastP }), zone: () => curZone, sandboxOpen: () => openSandbox(), spawnHere: (k, t) => SB.spawn(k, t), statsFor: (k, t) => { const s = statsFor(k, t); if (s) delete s.def; return s; } };
  debug.runProgress = runProgress; debug.enterStarter = () => enterStarter(); debug.starterDoor = () => { const tp = sportals()[0]; return tp && { ...W3(tp.lx, 0, tp.lz), spawn: { ...W3(tp.spawn.x, 0, tp.spawn.z), yaw: tp.spawn.yaw } }; };
  debug.gateWaystones = gateWaystones; debug.travelWaystone = travelWaystone; debug.xpScale = (l) => xpScale(l); debug.board = () => board && W3(board.lx, 0, board.lz); debug.openBoard = openBoard;
  debug.enterGate = (id) => { const gt = (D.gates || []).find((q) => q.id === (id || D.gates[0].id)); const Sx = ctx.secById[gt.section]; const i = Sx.center[0] + gt.cell[0], j = Sx.center[1] + gt.cell[1]; return enterInstance({ pp: { ...gt, gate: true }, i, j }); };
  debug.use = (id) => useItem(id); debug.lastPos = api5.lastPos; debug.gates = () => [...portalByCell.entries()].filter(([, pp]) => pp.gate).map(([k, pp]) => ({ id: pp.id, k })); debug.gmSpawn = gmSpawn; debug.party5 = api5.party; debug.setParty = api5.setParty;
  return { onCell, update, near, clickTargets, talkExtras, event, onArrive, onLeave, inInstance: () => inst.active, roomLabel, atmos, instButtons, debug, ready, transformed: () => transformed, ...api5 };
}
