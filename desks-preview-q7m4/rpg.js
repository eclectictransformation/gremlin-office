// Elsewhere Annex v4: Annex characters, d20 checks, silly gear, critters, quests, dice doors, party portals + instances.
// Eclectic Transformation · Gremlin Desks only. Rules data: data/annex-rpg.json. d20 math follows SRD 5.2.1 (CC-BY-4.0, see README).
// Only standard dice exist here: d4, d6, d8, d10, d12, d20. Normal exploration is SOLO; party size (1-3) applies only inside
// party-portal instances. Character + world state is per player in localStorage, shaped so a Supabase row can hold it later.
// v4b: a starter Training Closet instance (nothing counts: no XP / loot / quests, harmless knockouts) + a hidden dev sandbox panel.
// v5: level cap 25 + XP falloff by content level, the Mailroom starter run (solo, real XP), gate instances that wake per-character waystones,
//     hooks for the admin-only Control Room (control.js), game-master spawns in front of a player, and party members filled by annex-net.js.
// v5b: turn-based battles (annex-battle.js) for zones flagged turnBased (only the Mailroom for now); avatar sprite in the fighter slot.
// v5c: slower 5e-inspired XP curve; Mailroom is 3 fights, rest, 3 fights, rest, boss (levels 1–3); Door Station in the arrival plaza with themed doors, a tidy train teaser, and a weird Backrooms threshold.
// v5d: instance resets on re-entry; The Gently Declining Grotto (stage 1 cave crawl); instance minimap; Snorble, a solo-only companion dragon.
import { createBattle } from "./annex-battle.js";
import { attachGrottoRun } from "./annex-grotto-run.js";
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
  const blank = () => ({ v: 1, character: null, quests: {}, stash: [], world: { mobs: {}, doors: {}, loot: {}, bosses: {} }, counters: {}, flags: {}, lastCrystal: null, cards: [] });
  let S = blank();
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object") S = { ...blank(), ...s, world: { ...blank().world, ...(s.world || {}) } }; } catch {}
  S.cards = Array.isArray(S.cards) ? S.cards : [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...S, ...(trainSnap || {}), updated_at: new Date().toISOString() })); } catch {} }; // in training only the pre-closet snapshot is ever written
  const CH = () => S.character;

  // ---------- session state ----------
  let battleBoss = false; // v5d2: for the music bed
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
  // v6 (Pip): level-1 HP = class hit die + Nerve mod; each level after adds (die / 2 + 1) + Nerve mod (min 1).
  function maxHp() { const c = CH(); if (!c) return 0; const m = mod(stat("nerve")), L = level(), die = clsOf()?.die || 8; return Math.max(4, die + m) + (L - 1) * Math.max(1, die / 2 + 1 + m); }
  // v6 armor tiers: clothes/light = full Stride, medium = Stride up to +2, heavy = no Stride but a flat +1. Thick Hide / Lamplean Skin when unarmored.
  const ac = () => { const c = CH(), k = clsOf(), arm = item(c.gear.armor), tier = arm ? arm.tier || "light" : "clothes", T = D.armorTiers?.[tier] || {}, sm = mod(stat("stride"));
    let base = 10 + Math.min(sm, T.strideMax ?? 99) + (arm?.ac || 0) + (tier === "heavy" ? 1 : 0);
    if (tier === "clothes") { if (k?.unarmored === "thickHide") base = Math.max(base, Math.min(17, 10 + sm + mod(stat("nerve")))); if (k?.unarmored === "lamplean") base = Math.max(base, 12 + sm + (arm?.ac || 0)); }
    return base + gearItems().filter((it) => it.slot !== "armor").reduce((a, it) => a + (it.ac || 0), 0) + (has("guard") ? 1 : 0); };
  const weapon = () => item(CH().gear.weapon) || item("fists");
  const atkBonus = () => { const w = weapon(); return mod(stat(w.stat)) + prof() + (w.hit || 0) + gearItems().filter((it) => it.slot !== "weapon").reduce((a, it) => a + (it.hit || 0), 0); };
  const dmgMod = () => mod(stat(weapon().stat));
  const pathOf = () => D.paths[CH().path];
  function checkBonus(k, door, isSave) { const p = pathOf(), kc = clsOf(); let pf = p.prof.includes(k) || (door && p.door) || (isSave && kc?.saves?.includes(k)) ? prof() : 0; if (door && has("fingers")) pf = prof() * 2;
    return mod(stat(k)) + pf + gearItems().reduce((a, it) => a + (it.check?.[k] || 0) + (door ? it.door || 0 : 0), 0); }
  // ---------- v6: classes, resources (per fight / Breather / Full Rest), Keepsakes ----------
  const CLS = () => D?.classes?.list || {};
  function clsOf() { const c = CH(); return (c && CLS()[c.cls]) || CLS().warrior || null; }
  const lvIx = () => clamp(level(), 1, 5) - 1;
  const byLv = (a) => (Array.isArray(a) ? a[Math.min(lvIx(), a.length - 1)] : a);
  function has(fid) { const k = clsOf(); return !!k?.features?.some((f) => f.id === fid && level() >= f.lvl); }
  function classVisible(id) { const k = CLS()[id]; if (!k) return false; if (!k.hidden) return true; const u = k.unlock || {}; if (u.flag && S.flags[u.flag]) return true; if (u.quest && S.quests[u.quest]?.done) return true; if (u.level && CH() && level() >= u.level) return true; return false; }
  const classIds = () => (D?.classes?.order || Object.keys(CLS())).filter(classVisible);
  function resMax(id) { const r = clsOf()?.resources?.[id]; if (!r) return 0; if (r.maxPerLevel) return r.maxPerLevel * level(); if (r.maxByLevel) return level() >= (r.from || 1) ? level() : 0; return byLv(r.max) || 0; }
  function resNow(id) { const c = CH(); if (!c) return 0; c.res ||= {}; if (c.res[id] == null) c.res[id] = resMax(id); return clamp(c.res[id], 0, resMax(id)); }
  function canPay(cost) { return !cost || Object.entries(cost).every(([k, n]) => resNow(k) >= n); }
  function pay(cost) { if (!canPay(cost)) return false; const c = CH(); Object.entries(cost || {}).forEach(([k, n]) => (c.res[k] = resNow(k) - n)); save(); return true; }
  let F = {}; // per-fight state
  function fightReset() { F = { used: {}, turnUsed: {}, rage: false, mark: null, taunt: false, aim: false, smite: 0, twin: false, hurry: false, surge: false, allin: false, allinFoes: false, dodged: false, steadyUsed: false, sneakTurn: -1, turn: 0 }; }
  fightReset();
  function restoreRes(kind) { const c = CH(); if (!c) return; c.res ||= {}; Object.entries(clsOf()?.resources || {}).forEach(([id, r]) => { if (kind === "full" || r.recharge === "breather") c.res[id] = resMax(id); else if (r.breatherGain) c.res[id] = Math.min(resMax(id), resNow(id) + r.breatherGain); }); }
  function rest(kind) { const c = CH(); if (!c) return false; restoreRes(kind); c.hp = maxHp(); if (kind === "full") { c.tmp = 0; footUsed = {}; restockGizmo(); } abilityUsed = false; save(); renderBar(); return true; }
  function restockGizmo() { const c = CH(); if (c?.path === "tinkerer" && item("gizmo") && !c.inv.includes("gizmo")) c.inv.push("gizmo"); }
  let footUsed = {}; const footKey = () => (inst.active ? "i:" + inst.id : "open");
  function canWear(id) { const it = item(id), k = clsOf(); if (!it || !k) return true; if (it.slot === "armor") { const O = D.armorTiers?.order || ["clothes", "light", "medium", "heavy"]; return O.indexOf(it.tier || "light") <= O.indexOf(k.armor || "heavy"); } if (it.slot === "weapon" && k.weaponMaxDie) return (it.die || 4) <= k.weaponMaxDie; return true; }
  function turnFill() { const T = D.combat?.turnSpeed || {}, k = clsOf(); return clamp((T.base ?? 2.4) - (T.perPrimary ?? 0.2) * mod(stat(k?.primary || "stride")), T.min ?? 1.5, T.max ?? 3.2); }
  function migrate(c) { if (!c || !D) return c; const M = D.classes?.migration || {}; if (!c.cls || !CLS()[c.cls]) { c.cls = M[c.path] || "warrior"; c.classRepick = (c.classRepick || 0) + (M.freeRepick ?? 1); c.migratedAt = new Date().toISOString(); }
    if (!D.paths[c.path]) c.path = "wanderer"; if (!Array.isArray(c.professions)) c.professions = []; if (!c.materials || typeof c.materials !== "object" || Array.isArray(c.materials)) c.materials = {};
    if (!c.res || typeof c.res !== "object") c.res = {}; if (c.keepsake && !c.keepsake.state) c.keepsake.state = "held"; if (c.keepsake === undefined) c.keepsake = null; c.tmp = c.tmp || 0; c.v = 2; return c; }
  // Keepsakes: picker at creation. Lending / trading / recovery = data model only (keepsakes.lending.enabled = false in data).
  const KL = () => D?.keepsakes?.lending || {};
  const ksNext = (state, ev) => KL().transitions?.[state]?.[ev] || null;
  function ksTrapped(k) { k = k || CH()?.keepsake; return !!(k && KL().enabled && (KL().trappedWhile || []).includes(k.state)); }
  function ksAct(ev, o = {}) { const c = CH(), k = c?.keepsake; if (!k) return { ok: false, why: "no keepsake" }; if (!KL().enabled && !o.force) return { ok: false, why: "lending is switched off" };
    if (ev === "recover" && !(KL().pvpRecovery?.enabled) && !o.force) return { ok: false, why: "player-vs-player recovery is stubbed (needs server work)" };
    const to = ksNext(k.state, ev); if (!to) return { ok: false, why: `can't ${ev} from ${k.state}` }; const from = k.state; k.state = to; k.history = [...(k.history || []).slice(-9), { ev, from, to, at: new Date().toISOString(), who: o.who || null }];
    if (to === "lent") { k.lentTo = o.who || null; k.since = new Date().toISOString(); k.due = KL().dueSeconds ? new Date(Date.now() + KL().dueSeconds * 1000).toISOString() : null; } if (to === "returned" || to === "held") { k.lentTo = null; k.due = null; }
    save(); return { ok: true, from, to }; }
  function sneakDice() { const k = clsOf(); return k?.sneak ? byLv(k.sneak) : 0; }
  const allyHere = () => companionActive() || partySize() > 1;
  function mobSave(m, dc) { const d = roll(20), b = Math.floor((m.atk || 2) / 2), ok = d !== 1 && (d === 20 || d + b >= dc); return { d, b, tot: d + b, ok }; }
  const spellDC = (k) => 8 + prof() + mod(stat(k));
  function abilityList() { const c = CH(), k = clsOf(); if (!c || !k) return []; const L = level(), inB2 = battle.active();
    return (k.actions || []).filter((a) => L >= a.lvl).map((a) => { let off = false, why = "";
      if (a.perFight && (F.used[a.id] || 0) >= a.perFight) { off = true; why = "used this fight"; }
      else if (a.perTurn && F.turnUsed[a.id]) { off = true; why = "used this turn"; }
      else if (a.id === "rage" && F.rage) { off = true; why = "already running hot"; }
      else if (a.kind === "markTarget") { if (!(F.used.markFree < (a.freePerFight || 0)) && !canPay(a.cost)) { off = true; why = "no Pathcraft left"; } }
      else if (a.pool) { if (resNow(a.pool) <= 0) { off = true; why = "pool is empty"; } }
      else if (!canPay(a.cost)) { off = true; why = `out of ${Object.keys(a.cost).map((r) => k.resources?.[r]?.name || r).join("/")}`; }
      if (!off && (a.kind === "self") && c.hp >= maxHp()) { off = true; why = "you're at full HP"; }
      if (!off && a.kind === "arm" && ((a.id === "smite" && F.smite) || (a.id === "aim" && F.aim))) { off = true; why = "already armed"; }
      if (!off && a.kind === "revive" && !(inB2 && battle.palDown?.())) { off = true; why = "nobody is down"; }
      if (!off && a.kind === "cleanse" && !(c.status || []).length) { off = true; why = "nothing to clear"; }
      if (!off && ["target", "markTarget", "area"].includes(a.kind) && !liveFoes().length) { off = true; why = "no foes here"; }
      const costTxt = a.cost ? Object.entries(a.cost).map(([r, n]) => `${n} ${k.resources?.[r]?.icon || r}`).join(" ") : "";
      return { id: a.id, name: a.name, icon: a.icon, kind: a.kind, hint: (a.hint || "") + (costTxt ? ` · ${costTxt}` : ""), off, why, lvl: a.lvl }; }); }
  function liveFoes() { if (battle.active()) return (battle.foeList?.() || []).filter((m) => !m.dead && m.hp > 0); return allMobs().filter((m) => !m.dead && sameRoom(m) && dist(m) < 9); }
  function healSpec(h, statK) { if (!h) return 0; if (Array.isArray(h[0])) { const d = byLv(h); return rollN(d[0], d[1]).s + (statK ? mod(stat(statK)) : 0); } const extra = h[2] === "level" ? level() : typeof h[2] === "string" ? mod(stat(h[2])) : h[2] || 0; return rollN(h[0], h[1]).s + extra; }
  function healHero(n, label) { const c = CH(), h0 = c.hp; c.hp = Math.min(maxHp(), c.hp + Math.max(1, n)); const got = c.hp - h0; addLog(`${label}: +${got} HP`, "heal"); popup(`+${got} HP`, "hit"); return got; }
  function dmgFoe(m, n, label) { n = Math.max(0, n); m.hp -= n; m.hitT = 0.3; addLog(`${label}: ${n} damage to the ${m.name}`, n ? "hit" : "miss"); if (m.hp <= 0) killMob(m); return n; }
  function blast(a, m, beam) { const k = clsOf(), dd = byLv(a.dmg); let n = rollN(dd[0], dd[1]).s, tag = `${a.icon} ${a.name} ${dd[0]}d${dd[1]}${beam ? " (beam " + beam + ")" : ""}`;
    if (a.attack) { const r = resolveAttack(mod(stat(a.stat)) + prof(), m.ac, F.aim); F.aim = false; if (!r.hit) { addLog(`${tag}: 🎲 ${r.d20}${sg(r.bonus)} = ${r.total} vs AC ${m.ac} · miss`, "miss"); popup(`${a.icon} miss`, "miss"); return 0; } if (r.crit) n += rollN(dd[0], dd[1]).s; n += a.id === "bolt" ? mod(stat(a.stat)) : 0; if (a.id === "finebolt" && level() >= 2 && (k.clauses || []).includes("sharp")) n += Math.max(0, mod(stat("luck"))); }
    if (a.save) { const sv = mobSave(m, spellDC(a.stat || k.primary)); if (sv.ok) { if (!a.saveHalf) { addLog(`${tag}: the ${m.name} saves (${sv.tot} vs DC ${spellDC(a.stat || k.primary)}) · no effect`, "miss"); return 0; } n = Math.floor(n / 2); tag += " (saved, half)"; } }
    if (F.mark && F.mark === m.id) n += roll(4);
    if (has("steady") && !F.steadyUsed && (a.kind === "area" || a.id === "glare")) { F.steadyUsed = true; n += Math.max(0, mod(stat("luck"))); }
    return dmgFoe(m, n, tag); }
  function useAbility(target, id) { const c = CH(); if (!transformed || !c || koBusy) return false; if (battle.active() && !inBattleCall) return false; const k = clsOf(); if (!k) return false;
    const list = abilityList(); let A = id ? list.find((q) => q.id === id) : list.find((q) => !q.off && q.kind !== "free") || list.find((q) => !q.off); if (!A) { host.toast("No ability ready right now."); return false; }
    if (A.off) { host.toast(`${A.icon} ${A.name}: ${A.why}.`); return false; } const a = k.actions.find((q) => q.id === A.id);
    const foes = liveFoes(), m = target && !target.dead ? target : foes.sort((x, y) => (x.hp || 0) - (y.hp || 0))[0];
    if (["target", "markTarget"].includes(a.kind) && !m) { host.toast("No one nearby."); return false; }
    if (a.kind === "markTarget") { if ((F.used.markFree || 0) < (a.freePerFight || 0)) F.used.markFree = (F.used.markFree || 0) + 1; else if (!pay(a.cost)) return false; F.mark = m.id; addLog(`🎯 You mark the ${m.name}: +1d4 on your hits against it.`, "sys"); popup("🎯 marked", "hit"); }
    else { if (!a.pool && !pay(a.cost)) return false;
      if (a.kind === "self" && a.pool) { const want = Math.min(maxHp() - c.hp, resNow(a.pool), (a.chunk?.[0] || 5) + (a.chunk?.[1] === "level" ? level() : 0)); c.res[a.pool] = resNow(a.pool) - want; healHero(want, `${a.icon} ${a.name} (pool ${resNow(a.pool)} left)`); }
      else if (a.kind === "self") healHero(healSpec(a.heal, a.healStat), `${a.icon} ${a.name}`);
      else if (a.kind === "party") { healHero(healSpec(a.heal), `${a.icon} ${a.name}`); if (battle.active()) { const g = battle.healPal?.(healSpec(a.heal)) || 0; if (g) addLog(`${a.icon} ${a.name} reaches your companion too: +${g} HP`, "heal"); } }
      else if (a.kind === "revive") { const hp = battle.revivePal?.(healSpec(a.heal)) || 0; addLog(hp ? `${a.icon} ${a.name}: your companion is back up (${hp} HP).` : `${a.icon} ${a.name}: nobody to lift.`, "heal"); }
      else if (a.kind === "cleanse") { c.status = []; addLog(`${a.icon} ${a.name}: the fog lifts. Statuses cleared.`, "heal"); popup("🌫 cleared", "hit"); }
      else if (a.kind === "target") { if (a.effect === "root") { m.skip = (m.skip || 0) + 1; if (!battle.active()) m.cd = Math.max(m.cd || 0, 3); addLog(`${a.icon} ${a.name}: the ${m.name} is caught and loses its next turn.`, "hit"); popup(`${a.icon} snared`, "hit"); }
        else { const beams = byLv(a.beams || [1]); for (let b = 0; b < beams; b++) { const t = !m.dead ? m : liveFoes()[0]; if (t) blast(a, t, beams > 1 ? b + 1 : 0); }
          if (F.twin) { F.twin = false; const t2 = liveFoes().find((q) => q !== m); if (t2) blast(a, t2, 0); } } }
      else if (a.kind === "area") { if (a.effect === "stunSave") { liveFoes().forEach((q) => { const sv = mobSave(q, spellDC(k.primary)); if (!sv.ok) { q.skip = (q.skip || 0) + 1; if (!battle.active()) q.cd = Math.max(q.cd || 0, 3); } addLog(`${a.icon} ${a.name}: the ${q.name} ${sv.ok ? "shrugs it off" : "loses a turn"} (${sv.tot} vs DC ${spellDC(k.primary)})`, sv.ok ? "miss" : "hit"); }); c.status = (c.status || []).filter((x) => !/fog/i.test(x.id || "")); }
        else liveFoes().forEach((q) => blast(a, q, 0)); }
      else if (a.kind === "free") { if (a.id === "taunt") { F.taunt = true; addLog("🚪 Hold the Door: the foes turn on you.", "sys"); } if (a.id === "surge") { F.surge = true; addLog("⏩ Double Shift: you'll go again right after this.", "sys"); }
        if (a.id === "rage") { F.rage = true; addLog("🔥 Run Hot: half damage from hits, +2 damage. The fog holds off.", "sys"); } if (a.id === "allin") { F.allin = true; addLog("💢 All In: advantage on your next attack; foes get advantage on you until your next turn.", "sys"); }
        if (a.id === "twin") { F.twin = true; addLog("♊ Twin: your next blast also hits a second foe.", "sys"); } if (a.id === "hurry") { F.hurry = true; addLog("💨 Hurry: your gauge starts half full after this turn.", "sys"); } popup(`${a.icon} ${a.name}`, "hit"); }
      else if (a.kind === "arm") { if (a.id === "smite") { F.smite = a.dice || [2, 8]; addLog("⚡ Oathstrike ready: your next hit adds 2d8.", "sys"); } if (a.id === "aim") { F.aim = true; footArmed = true; addLog("🎯 Steady Aim: your next attack rolls two d20s.", "sys"); } popup(`${a.icon} ready`, "hit"); } }
    F.used[a.id] = (F.used[a.id] || 0) + 1; if (a.perTurn) F.turnUsed[a.id] = 1; abilityUsed = true;
    audio.sfx("pick"); save(); renderBar(); tipEvent("ability"); return true; }
  function openAbilities() { if (!transformed || !CH()) return; const K = clsOf(); panel("abilities", `${K.icon} ${K.name} abilities`, (pn) => { const L = abilityList(); if (!L.length) pn.appendChild(el("p", "o3-small", "No abilities yet."));
      L.forEach((a) => { const b = el("button", "o3-btn ghost o3-wide" + (a.off ? " off" : ""), `${a.icon} ${a.name} · ${a.off ? a.why : a.hint}`); b.dataset.rpg = "ab-" + a.id; b.disabled = a.off; b.onclick = () => { host.closePanel(); setTimeout(() => useAbility(undefined, a.id), 30); }; pn.appendChild(b); });
      const rs = Object.entries(K.resources || {}).filter(([id]) => resMax(id) > 0).map(([id, r]) => `${r.icon} ${r.name} ${resNow(id)}/${resMax(id)}`); if (rs.length) pn.appendChild(el("p", "o3-small", rs.join(" · "))); }); }
  function afterAct() { F.turn++; F.turnUsed = {}; F.sneakTurn = -1; if (F.surge) { F.surge = false; return 1; } if (F.hurry) { F.hurry = false; return 0.5; } return has("slip") ? 0.3 : 0; }
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
  const abBtn = mk("✨", "Abilities (X)", () => openAbilities(), "ability");
  bar.append(bName, bHp, bXp, bBtns);
  const dlog = el("div", "o3-dicelog"); dlog.hidden = true; host.hud.appendChild(dlog);
  const pop = el("div", "o3-dicepop"); host.hud.appendChild(pop);
  const fx = el("div", "o3-transform"); const fxT = el("b"); fx.appendChild(fxT); host.hud.appendChild(fx);
  const ko = el("div", "o3-ko"); const koT = el("p"); ko.appendChild(koT); host.hud.appendChild(ko);
  const hurtEl = el("div", "o3-hurt"); host.hud.appendChild(hurtEl);
  const battle = createBattle({ el, hud: host.hud, host, audio }); let battleList = [], sbTurnBased = null, inBattleCall = false, pendingLvl = null, tbGraceUntil = 0, battleZone = null, trackZone = null, trackSpot = null, prevSpot = null, lastBattle = null;
  function renderBar() {
    const c = CH(); const show = transformed && inAnnex && !!c; bar.hidden = !show; dlog.hidden = !show; if (!show) return;
    const L = level(), mh = maxHp(), lo = D.levels.xp[L - 1], hi = D.levels.xp[L] ?? null;
    bName.textContent = `${clsOf()?.icon || pathOf().icon} ${c.name} · Lv ${L} ${clsOf()?.name || ""}${isTraining() ? " · 🎓 practice" : ""}`;
    bHpF.style.width = clamp(c.hp / mh, 0, 1) * 100 + "%"; bHpT.textContent = `❤️ ${c.hp}/${mh}`;
    bXpF.style.width = (hi == null ? 100 : clamp((c.xp - lo) / (hi - lo), 0, 1) * 100) + "%"; bXpT.textContent = hi == null ? `⭐ ${c.xp} XP (max level)` : `⭐ ${c.xp}/${hi} XP`;
    const AL = abilityList(), rdy = AL.filter((a) => !a.off); abBtn.textContent = clsOf()?.icon || "✨"; abBtn.title = `Abilities (X): ${AL.map((a) => a.name + (a.off ? " (" + a.why + ")" : "")).join(" · ") || "none yet"}`; abBtn.disabled = !rdy.length; abBtn.classList.toggle("armed", !!(footArmed || F.smite || F.aim));
  }
  let logTotal = 0;
  function addLog(t, kind = "") { logTotal++; logs.push({ t, kind, at: Date.now() }); if (logs.length > 60) logs.shift();
    const row = el("div", "o3-dl " + kind, t); dlog.appendChild(row); while (dlog.children.length > 5) dlog.firstChild.remove(); setTimeout(() => row.classList.add("old"), 7000); }
  function popup(t, kind = "") { pop.textContent = t; pop.className = "o3-dicepop show " + kind; clearTimeout(pop._h); pop._h = setTimeout(() => (pop.className = "o3-dicepop"), 1700); }
  let openKind = null;
  function toggle(kind, fn) { if (!transformed) return; if (openKind === kind && host.state().busy) { host.closePanel(); return; } if (host.state().busy) host.closePanel(); fn(); }
  const panel = (kind, title, build, opt = {}) => { host.openPanel(title, (pn) => { pn.dataset.rpgPanel = kind; build(pn); }, { ...opt, onClose: () => { if (openKind === kind) openKind = null; opt.onClose?.(); } }); openKind = kind; };
  addEventListener("keydown", (e) => {
    if (!inAnnex || !transformed || battle.active() || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.repeat) return;
    const k = e.key.toLowerCase(); const map = { c: ["sheet", openSheet], i: ["gear", openGear], j: ["quests", openQuests], l: ["log", openLog] };
    if (map[k]) { e.preventDefault(); toggle(...map[k]); } else if (k === "x" && !host.state().busy) { e.preventDefault(); openAbilities(); }
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
    else if (kind === "drip") { const m = sm("#7aa8c8", { transparent: true, opacity: 0.8, emissive: "#4a88aa", emissiveIntensity: 0.35 }); const s = new THREE.Mesh(G("drip", () => new THREE.SphereGeometry(0.16, 10, 8)), m); s.scale.set(0.7, 1.3, 0.7); s.position.y = 0.55; body.add(s); box(-0.06, 0.62, 0.12, 0.04, 0.04, 0.02, eye, body); box(0.06, 0.7, 0.12, 0.05, 0.05, 0.02, eye, body); parts.bob = true; }
    else if (kind === "cavebat") { const m = sm("#5a4a62"); box(0, 0, 0, 0.1, 0.08, 0.28, m, body); parts.w = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.x = s * 0.05; body.add(p); box(s * 0.2, 0, 0, 0.36, 0.02, 0.22, sm("#3a3048"), p); return p; }); box(-0.05, 0.06, 0.12, 0.04, 0.05, 0.02, eye, body); box(0.06, 0.04, 0.12, 0.05, 0.06, 0.02, eye, body); body.position.y = 1.25; parts.fly = 1.25; }
    else if (kind === "pebble") { const m = sm("#8a8070", { roughness: 1 }); const b = new THREE.Mesh(G("peb", () => new THREE.IcosahedronGeometry(0.28, 0)), m); b.position.y = 0.26; b.scale.set(1.1, 0.7, 1); body.add(b); box(-0.08, 0.38, 0.18, 0.05, 0.06, 0.02, eye, body); box(0.1, 0.34, 0.18, 0.06, 0.05, 0.02, eye, body); }
    else if (kind === "echo") { const m = sm("#d8c8a0", { transparent: true, opacity: 0.7, emissive: "#c9b45a", emissiveIntensity: 0.25 }); const b = new THREE.Mesh(G("echo", () => new THREE.TorusGeometry(0.28, 0.06, 8, 16)), m); b.rotation.x = 1.2; b.position.y = 0.7; body.add(b); box(-0.08, 0.72, 0.1, 0.05, 0.07, 0.02, eye, body); box(0.1, 0.68, 0.1, 0.04, 0.05, 0.02, eye, body); parts.bob = true; }
    else if (kind === "moss") { const m = sm("#4a7a3a", { roughness: 1 }); const b = new THREE.Mesh(G("moss", () => new THREE.IcosahedronGeometry(0.26, 0)), m); b.position.y = 0.22; b.scale.set(1.3, 0.5, 1.1); body.add(b); box(-0.1, 0.32, 0.18, 0.05, 0.05, 0.02, eye, body); box(0.08, 0.3, 0.18, 0.06, 0.05, 0.02, eye, body); }
    else if (kind === "stalag") {
      const m = sm("#7a7060", { roughness: 1 }), m2 = sm("#6a6054", { roughness: 1 }), m3 = sm("#8a8070", { roughness: 1 });
      const sclera = sm("#f4efe0"), mouth = sm("#2a2420");
      const base = new THREE.Mesh(G("grum1", () => new THREE.IcosahedronGeometry(0.48, 0)), m);
      base.position.y = 0.38; base.scale.set(1.55, 0.85, 1.35); body.add(base);
      const mid = new THREE.Mesh(G("grum2", () => new THREE.IcosahedronGeometry(0.38, 0)), m2);
      mid.position.y = 0.85; mid.scale.set(1.25, 0.9, 1.1); mid.rotation.y = 0.4; body.add(mid);
      const head = new THREE.Mesh(G("grum3", () => new THREE.IcosahedronGeometry(0.32, 0)), m3);
      head.position.y = 1.32; head.scale.set(1.15, 1.0, 1.05); body.add(head);
      box(-0.02, 1.48, 0.28, 0.42, 0.08, 0.12, m2, body);
      box(0, 1.28, 0.34, 0.1, 0.1, 0.12, m, body);
      box(-0.14, 1.34, 0.36, 0.13, 0.12, 0.04, sclera, body);
      box(0.16, 1.40, 0.35, 0.10, 0.11, 0.04, sclera, body);
      box(-0.15, 1.33, 0.38, 0.07, 0.07, 0.03, eye, body);
      box(0.17, 1.39, 0.37, 0.05, 0.06, 0.03, eyeR, body);
      box(0, 1.12, 0.34, 0.22, 0.05, 0.05, mouth, body);
      box(-0.12, 1.14, 0.34, 0.06, 0.05, 0.05, mouth, body);
      box(0.12, 1.14, 0.34, 0.06, 0.05, 0.05, mouth, body);
      const armL = new THREE.Mesh(G("grum2", () => new THREE.IcosahedronGeometry(0.38, 0)), m);
      armL.position.set(-0.62, 0.72, 0.08); armL.scale.set(0.45, 0.55, 0.4); body.add(armL);
      const armR = new THREE.Mesh(G("grum2", () => new THREE.IcosahedronGeometry(0.38, 0)), m2);
      armR.position.set(0.58, 0.68, 0.1); armR.scale.set(0.4, 0.5, 0.38); body.add(armR);
      const idea = new THREE.Mesh(G("ccrys", () => new THREE.OctahedronGeometry(0.16, 0)), sm("#e0b25a", { emissive: "#ffc878", emissiveIntensity: 0.85 }));
      idea.position.set(0.08, 1.72, 0); idea.scale.setScalar(0.7); body.add(idea);
    }
    else { const m = sm("#f4f1e6", { side: THREE.DoubleSide }); parts.w = [-1, 1].map((s) => { const p = new THREE.Group(); body.add(p); box(s * 0.12, 0, 0, 0.24, 0.01, 0.3, m, p); return p; }); box(0, 0, 0, 0.04, 0.04, 0.3, sm("#d8d0bc"), body); body.position.y = 1.2; parts.fly = 1.2; }
    const barG = new THREE.Group(); barG.position.y = parts.fly ? 1.85 : kind === "dummy" || kind === "tboss" ? 1.7 : kind === "sock" ? 1.55 : kind === "boss" || kind === "stalag" ? 2.85 : kind === "cabinet" ? 1.5 : kind === "pebble" || kind === "moss" || kind === "drip" ? 0.9 : kind === "echo" ? 1.25 : 0.95; g.add(barG);
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
    // v5d2: the open Backrooms are calm. Critters only live in the passages beyond a weird door (ctx.beyondZoneAt).
    const BZ = ctx.beyondZoneAt ? ctx.beyondZoneAt(i, j) : null, ZM = BZ?.mobs || null;
    if (ZM && hsh(i, j, "rpg-mob") < (ZM.chance ?? 0.6)) { const r = take("mob");
      if (r) { const pool = ZM.kinds || Mb.bySection[pl.S.id] || ["dust"], cnt = ZM.count || [1, 2], n = cnt[0] + Math.floor(hsh(i, j, "rpg-n") * (cnt[1] - cnt[0] + 1)), zt = ZM.tier ?? tier;
        out.mob = { qi: r.qi, tier: zt, zone: BZ.id, kinds: Array.from({ length: n }, (_, k) => pickH(pool, hsh(i, j, "rpg-k", k))), cleared: !!S.world.mobs[pl.key] }; } }
    const Dd = D.doors; if (dep >= Dd.minDepth && hsh(i, j, "rpg-door") < Dd.chance) { const r = take("door");
      if (r) out.door = { qi: r.qi, stat: pickH(Dd.stats, hsh(i, j, "rpg-ds")), dc: Dd.dc[tier], open: !!S.world.doors[pl.key], chest: !S.world.loot["door:" + pl.key], tier }; }
    const Bx = D.boxes; if (dep >= Bx.minDepth && hsh(i, j, "rpg-box") < Bx.chance) { const r = take("box"); if (r) out.box = { qi: r.qi, taken: !!S.world.loot[pl.key], tier }; }
    return out;
  }
  function scaled(kind, tier) { const b = D.enemies[kind], sc = D.mobs.scale;
    return { kind, def: b, name: b.name, icon: b.icon, maxHp: Math.max(1, Math.round(b.hp * (1 + sc.hpPerTier * tier))), ac: b.ac + Math.floor(tier / 2) * sc.acPerTwoTiers, atk: b.atk + Math.floor(tier * sc.atkPerTier), die: b.die, dmgB: Math.floor(tier * sc.dmgPerTier), xp: Math.round(b.xp * (1 + sc.xpPerTier * tier)), speed: b.speed, every: b.every, clvl: (b.level || 1) + tier }; }
  function newMob(st, m, x, z, rect, zone, ch, id, y = 0) { m.g.position.set(x, y || 0, z); const mob = { ...st, ...m, hp: st.maxHp, rect, home: [x, z], zone, ch, cd: 1.2, dead: false, deadT: 0, ph: Math.random() * 5, id, hitT: 0, n: 0, state: "idle" };
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
    if (pl.i === startSec.center[0] && pl.j === startSec.center[1]) addStationBlockers();
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
  function classBase(cls) { const k = CLS()[cls]; const base = {}; (k?.order || STATS()).forEach((s, i) => (base[s] = D.creation.standardArray[i])); return base; }
  function suggestClass(ai) { const Q = D.classes && D.creation.classQuiz?.byAnswer; if (!Q || !ai.length) return "warrior"; const v = {}; ai.forEach((a, q) => { const id = Q[q]?.[a]; if (id) v[id] = (v[id] || 0) + 1; }); return Object.keys(v).sort((x, y) => v[y] - v[x])[0] || "warrior"; }
  const pbCost = (base) => Object.values(base).reduce((a, v) => a + (D.creation.pointBuy.cost[v] ?? 99), 0);
  const cleanName = (s) => String(s || "").replace(/[<>{}\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
  function validBuild(b) { if (!D.paths[b.path] || !cleanName(b.name)) return false; if (b.cls && !classVisible(b.cls)) return false; const v = STATS().map((k) => b.base[k]);
    if (b.method === "array") return [...v].sort((a, c) => c - a).join() === [...D.creation.standardArray].sort((a, c) => c - a).join();
    return v.every((x) => x >= D.creation.pointBuy.min && x <= D.creation.pointBuy.max) && pbCost(b.base) <= D.creation.pointBuy.points; }
  function keepsakeFrom(b) { const L = D.keepsakes?.list || []; if (b.keepsake && typeof b.keepsake === "object") return { id: b.keepsake.id || "custom", name: cleanKs(b.keepsake.name), icon: b.keepsake.icon || "✨", state: "held" };
    const f = L.find((q) => q.id === b.keepsake) || L[0]; return f ? { id: f.id, name: f.name, icon: f.icon, state: "held" } : null; }
  const cleanKs = (s) => String(s || "").replace(/[<>{}\\]/g, "").replace(/\s+/g, " ").trim().slice(0, D.keepsakes?.custom?.maxLen || 40) || "something small from home";
  function createChar(b) { if (!validBuild(b)) return false; const P = D.paths[b.path], M = D.classes?.migration || {}; const cls = CLS()[b.cls] ? b.cls : M[b.path] || "warrior", K = CLS()[cls] || {};
    S.character = { v: 2, name: cleanName(b.name), cls, path: b.path, method: b.method, base: { ...b.base }, stats: finalStats(b.base, b.path), xp: 0, hp: 0, gear: { weapon: K.weapon || P.weapon, armor: null, head: null, trinket: null }, inv: [], status: [], pendingStat: 0, waystones: {}, discovered: {}, companion: true,
      keepsake: keepsakeFrom(b), res: {}, tmp: 0, professions: [], materials: {}, classRepick: 0, created_at: new Date().toISOString() };
    if (P.weapon && P.weapon !== S.character.gear.weapon) S.character.inv.push(P.weapon);
    (K.startArmor ? [K.startArmor] : D.startGear || []).forEach((id) => { const it = item(id); if (it && !S.character.gear[it.slot] && canWear(id)) S.character.gear[it.slot] = id; });
    if (!S.character.gear.armor) (D.startGear || []).forEach((id) => { const it = item(id); if (it && !S.character.gear[it.slot] && canWear(id)) S.character.gear[it.slot] = id; });
    restockGizmo(); restoreRes("full");
    S.character.hp = maxHp(); S.quests = {}; S.stash = []; S.counters = {}; save(); return true; }
  function openCreator() {
    const answers = [], ansIx = []; let qi = 0; const first = String(deskName() || "you").split(/\s+/)[0];
    const idea = () => pickH(D.creation.nameIdeas, rng()).replaceAll("{name}", first).replace("{n}", String(100 + Math.floor(rng() * 900)));
    panel("creator", "🧵 Who are you in here?", (pn) => {
      const body = el("div", "o3-creator"); pn.appendChild(body);
      const quiz = () => { body.textContent = ""; const q = D.creation.quiz[qi];
        body.appendChild(el("p", "o3-small", `Three quick questions and the Annex will suggest who you are in here. You can change everything after. (${qi + 1}/${D.creation.quiz.length})`));
        body.appendChild(el("p", "o3-riddle", q.q)); q.a.forEach((a, ai) => { const b = el("button", "o3-btn ghost o3-wide", a.t); b.dataset.rpg = "quiz-" + ai; b.onclick = () => { answers.push(a.path); ansIx.push(ai); qi++; audio.sfx("blip"); qi < D.creation.quiz.length ? quiz() : edit(suggest(answers)); }; body.appendChild(b); });
        const skip = el("button", "o3-btn ghost small", "Skip the quiz"); skip.dataset.rpg = "quiz-skip"; skip.onclick = () => edit(suggest(answers.length ? answers : ["wanderer"])); body.appendChild(skip); };
      const edit = (sug) => { body.textContent = ""; const sc = suggestClass(ansIx), KL0 = D.keepsakes?.list || []; const b = { name: idea(), path: sug.path, cls: sc, method: "array", base: classBase(sc), keepsake: KL0[Math.floor(rng() * KL0.length)]?.id || null };
        body.appendChild(el("p", "o3-small", `The Annex thinks you're a ${CLS()[sc]?.icon || ""} ${CLS()[sc]?.name || ""} with a ${D.paths[sug.path].icon} ${D.paths[sug.path].name} background. Change anything you like, then approve it. Nothing saves until you do.`));
        const ch = el("div", "o3-paths o3-classes"); ch.dataset.rpg = "classes"; const ksBox = el("div", "o3-keepsake"); body.append(el("p", "o3-small o3-sect", "Class"), ch);
        const nl = el("label", null, "Name"); const ni = el("input"); ni.value = b.name; ni.maxLength = 24; ni.dataset.rpg = "name"; ni.oninput = () => { b.name = ni.value; draw(); }; body.append(nl, ni);
        const paths = el("div", "o3-paths"), mth = el("div", "o3-method"), tbl = el("div", "o3-stats"), sum = el("div", "o3-note"); body.append(el("p", "o3-small o3-sect", "Background (a small perk)"), paths, el("p", "o3-small o3-sect", "Keepsake"), ksBox, el("p", "o3-small o3-sect", "Stats"), mth, tbl, sum);
        const ok = el("button", "o3-btn"); ok.dataset.rpg = "approve"; const err = el("p", "o3-small"); body.append(ok, err);
        function draw() {
          ch.textContent = ""; classIds().forEach((id) => { const k = CLS()[id]; const cb = el("button", "o3-pathcard o3-classcard" + (b.cls === id ? " on" : "")); cb.dataset.rpg = "class-" + id; cb.append(el("b", null, `${k.icon} ${k.name}`), el("span", null, k.blurb), el("small", null, `d${k.die} HP · ${D.armorTiers?.[k.armor]?.name || k.armor} armor · ${D.stats.find((x) => x.id === k.primary)?.name} first`)); cb.onclick = () => { if (b.cls === id) return; b.cls = id; if (b.method === "array") b.base = classBase(id); draw(); }; ch.appendChild(cb); });
          paths.textContent = ""; Object.entries(D.paths).forEach(([id, p]) => { const pb = el("button", "o3-pathcard" + (b.path === id ? " on" : "")); pb.dataset.rpg = "path-" + id; pb.append(el("b", null, `${p.icon} ${p.name}`), el("span", null, p.perk || p.blurb)); pb.onclick = () => { b.path = id; draw(); }; paths.appendChild(pb); });
          ksBox.textContent = ""; if (D.keepsakes) { ksBox.appendChild(el("p", "o3-small", D.keepsakes.pickerText)); const ksel = el("select"); ksel.dataset.rpg = "keepsake"; ksel.setAttribute("aria-label", "Keepsake"); (D.keepsakes.list || []).forEach((q) => { const o = el("option", null, `${q.icon} ${q.name}`); o.value = q.id; if (b.keepsake === q.id) o.selected = true; ksel.appendChild(o); });
            if (D.keepsakes.custom?.enabled) { const o = el("option", null, "✍️ Something else…"); o.value = "__custom"; if (typeof b.keepsake === "object" && b.keepsake) o.selected = true; ksel.appendChild(o); }
            ksel.onchange = () => { b.keepsake = ksel.value === "__custom" ? { id: "custom", name: "", icon: "✨" } : ksel.value; draw(); }; ksBox.appendChild(ksel);
            if (typeof b.keepsake === "object" && b.keepsake) { const ki = el("input"); ki.placeholder = D.keepsakes.custom.hint; ki.maxLength = D.keepsakes.custom.maxLen || 40; ki.value = b.keepsake.name || ""; ki.dataset.rpg = "keepsake-custom"; ki.oninput = () => { b.keepsake.name = ki.value; }; ksBox.appendChild(ki); } }
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
          const P = D.paths[b.path], K = CLS()[b.cls] || {}, w = item(K.weapon || P.weapon), m = (k) => mod(fin[k]), hp = Math.max(4, (K.die || 8) + m("nerve"));
          const f1 = (K.features || []).filter((f) => f.lvl === 1).map((f) => f.name).join(", ");
          sum.textContent = `* +1 from your background. ❤️ HP ${hp} (d${K.die || 8}) · ⚔️ ${w.name}: d20${sg(m(w.stat) + D.levels.prof[0])} to hit, d${w.die}${m(w.stat) ? sg(m(w.stat)) : ""} damage · Level 1: ${f1} · Saves: ${(K.saves || []).map((x) => D.stats.find((q) => q.id === x)?.name).join(" + ")} · Background: ${P.perk || ""}`;
          const v = validBuild(b); ok.disabled = !v; ok.textContent = `✅ Looks right. Become ${cleanName(b.name) || "…"}`; err.textContent = v ? "Approving saves this character in this browser." : "Give your character a name (and keep the stats valid).";
        }
        ok.onclick = () => { if (!createChar(b)) return; host.closePanel(); transform(true); }; draw(); };
      quiz();
      pn.appendChild(el("p", "o3-small o3-credits", D.creation.aiHook.replace(/^Future: /, "Coming later: "))); pn.appendChild(el("p", "o3-small o3-credits", D.compatLine + " Rules math from the SRD 5.2.1 by Wizards of the Coast LLC (CC-BY-4.0). Full credit on your sheet."));
    }, { wide: true });
  }
  function openBecome() { const c = CH();
    panel("become", "🧵 The stitched circle", (pn) => {
      pn.appendChild(el("p", null, `Your Annex self is waiting: ${clsOf()?.icon || ""} ${c.name}, Level ${level()} ${clsOf()?.name || ""} (${pathOf().name}).`));
      if (!c.keepsake && D.keepsakes) { pn.appendChild(el("p", "o3-small", D.keepsakes.pickerText)); const row = el("div", "o3-prompts"); (D.keepsakes.list || []).slice(0, 10).forEach((q) => { const kb = el("button", "o3-btn ghost small", `${q.icon} ${q.name}`); kb.dataset.rpg = "ks-" + q.id; kb.onclick = () => { c.keepsake = { id: q.id, name: q.name, icon: q.icon, state: "held" }; save(); host.closePanel(); openBecome(); }; row.appendChild(kb); }); pn.appendChild(row); }
      if (c.classRepick > 0) { pn.appendChild(el("p", "o3-small", `Classes have arrived. You were set as a ${clsOf()?.name} from your old path. You have ${c.classRepick} free re-pick:`)); const row = el("div", "o3-prompts"); classIds().forEach((id) => { const k = CLS()[id]; const kb = el("button", "o3-btn ghost small" + (c.cls === id ? " on" : ""), `${k.icon} ${k.name}`); kb.dataset.rpg = "repick-" + id; kb.onclick = () => { repickClass(id); host.closePanel(); openBecome(); }; row.appendChild(kb); }); pn.appendChild(row); }
      pn.appendChild(el("p", "o3-small", `❤️ ${c.hp}/${maxHp()} · 🛡 AC ${ac()} · ⚔️ ${weapon().name}${(c.status || []).length ? " · " + c.status.map((s) => s.text).join(", ") : ""}`));
      const go = el("button", "o3-btn", `✨ Become ${c.name}`); go.dataset.rpg = "become"; go.onclick = () => { host.closePanel(); transform(false); }; pn.appendChild(go);
      const re = el("button", "o3-btn ghost small", "🔁 Start a new character"); re.dataset.rpg = "recreate"; let sure = false;
      re.onclick = () => { if (!sure) { sure = true; re.textContent = "Really? Level, gear and quests reset. Tap again."; return; } resetChar(); host.closePanel(); setTimeout(openCreator, 50); }; pn.appendChild(re);
    }); }
  function repickClass(id) { const c = CH(); if (!c || !(c.classRepick > 0) || !classVisible(id)) return false; c.cls = id; c.classRepick--; c.res = {}; restoreRes("full"); const K = CLS()[id]; if (K.weapon && item(K.weapon) && !ownsItem(K.weapon)) c.inv.push(K.weapon);
    ["armor", "weapon"].forEach((sl) => { if (c.gear[sl] && !canWear(c.gear[sl])) { c.inv.push(c.gear[sl]); c.gear[sl] = sl === "weapon" ? (K.weapon && canWear(K.weapon) ? (c.inv.splice(c.inv.indexOf(K.weapon), 1), K.weapon) : null) : null; } });
    c.hp = maxHp(); save(); renderBar(); addLog(`🛡 You're a ${K.name} now.`, "sys"); return true; }
  function resetChar() { S.character = null; S.quests = {}; S.stash = []; S.counters = {}; save(); transformed = false; setPlayerName(null); renderBar(); }
  function openCircle() { if (!D) return; if (transformed) { host.toast(`You're already ${CH().name}. The circle hums approvingly.`); return; } CH() ? openBecome() : openCreator(); }
  function transform(isNew) { const c = CH(); if (!c) return; migrate(c); transformed = true; fightGroup = null; abilityUsed = false; footArmed = false; fightReset(); restoreRes("full"); c.hp = clamp(c.hp || maxHp(), 1, maxHp()); save();
    setPlayerName(c.name); fxT.textContent = `✨ ${c.name}`; fx.classList.remove("on"); void fx.offsetWidth; fx.classList.add("on"); audio.sfx("whoosh");
    host.toast(fill(D.circle.become).replace("{char}", c.name)); addLog(`🧵 You became ${c.name} (${clsOf()?.name || ""}, ${pathOf().name}).`, "sys"); progress("flag", "transformed"); renderBar(); renderTip(); host.updateActions();
    if (isNew) setTimeout(() => { if (transformed && !host.state().busy) host.toast("📜 C = sheet · 🎒 I = gear · 🗒 J = quests · 🎲 L = dice log · X = abilities"); }, 3400); }

  // ---------- XP, levels, quests ----------
  // v5: XP falloff for content well below you (data: xpFalloff). Returns the fraction of XP you get.
  function xpScale(clvl) { const F = D.xpFalloff; if (!F || !clvl) return 1; const diff = level() - clvl; if (diff <= F.fullWithin) return 1; if (diff >= F.zeroAt) return 0; return Math.max(0, 1 - (diff - F.fullWithin) * F.perLevel); }
  function instBand() { return inst.active ? D?.instances[inst.id]?.xpBand : null; }
  function gainXP(n0, why, clvl, raw) { const c = CH(); if (!c) return; let n = n0;
    if (!raw) { const B = instBand(); if (B) { const L = level(); if (L >= (B.zeroAt ?? 99)) { addLog(`⭐ 0 XP · ${why} (you've outgrown this place)`, "sys"); return; } if (L > (B.fullMax ?? 99)) { n = B.token ?? 1; why += " (just a token — you've outgrown this place)"; } }
      else if (clvl) { const f = xpScale(clvl); n = f > 0 ? Math.max(D.xpFalloff?.minXP || 1, Math.round(n0 * f)) : 0; if (!n) { addLog(`⭐ 0 XP · ${why} (level ${clvl} is too far below you, level ${level()})`, "sys"); return; } if (n < n0) why += ` (reduced: level ${clvl} content)`; } }
    if (!n) return; if (isTraining() && !TR().grantXP) { trainXP += n; addLog(`🎓 Practice: ${n} XP would go here (${why}). XP is off in training.`, "sys"); return; } const L0 = level(), h0 = maxHp(), rk = Object.keys(clsOf()?.resources || {}), r0 = rk.map((id) => [id, resNow(id), resMax(id)]); c.xp += n; const L1 = level(); addLog(`⭐ +${n} XP · ${why}`, "xp");
    if (L1 > L0) { c.hp += maxHp() - h0; c.res ||= {}; r0.forEach(([id, now, mx]) => { c.res[id] = Math.max(0, now + Math.max(0, resMax(id) - mx)); }); // v6: a level-up adds the new pool capacity
 for (let L = L0 + 1; L <= L1; L++) if (D.levels.statUpAt.includes(L)) c.pendingStat = (c.pendingStat || 0) + 1;
      lastLevelUp = { from: L0, to: L1, at: Date.now() }; audio.sfx("chime"); popup(`⬆️ LEVEL ${L1}!`, "lvl"); addLog(`⬆️ Level ${L1}! Max HP ${maxHp()}${c.pendingStat ? " · pick a stat to raise" : ""}`, "lvl");
      setTimeout(() => { if (battle.active()) { pendingLvl = L1; return; } if (!host.state().busy && !koBusy) openLevelUp(); else host.toast(`⬆️ Level ${L1}! Open your sheet (C) to see what changed.`); }, 350); }
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
  function event(kind, a) { if (!D) return; if (kind === "crystal") { S.lastCrystal = a || null; save(); if (transformed && CH()) { const c = CH(), had = (c.status || []).length; c.status = []; rest("full"); c.hp = maxHp(); abilityUsed = false; save(); renderBar(); if (had) setTimeout(() => host.toast("💎 The crystal hums. Statuses cleared, HP full."), 900); } return; }
    if (!transformed || !CH()) return;
    if (kind === "curio") { gainXP(D.xp.curio, "found a curiosity"); progress("curio"); }
    if (kind === "attune") gainXP(D.xp.attune, "attuned a crystal"); }

  // ---------- items ----------
  const EQUIP = ["weapon", "armor", "head", "trinket"];
  function giveItem(id, quiet) { const c = CH(), it = item(id); if (!c || !it) return false; if (it.unique && ownsItem(id)) { if (!quiet) addLog(`You already have the ${it.name}.`, "sys"); return false; } let eq = false;
    if (EQUIP.includes(it.slot)) { const cur = item(c.gear[it.slot]); if (canWear(id) && (!cur || (it.value || 0) > (cur.value || 0))) { if (c.gear[it.slot]) c.inv.push(c.gear[it.slot]); c.gear[it.slot] = id; eq = true; } else c.inv.push(id); } else c.inv.push(id);
    save(); renderBar(); if (!quiet) addLog(`🎁 ${it.name}${eq ? " (equipped)" : ""}`, "loot"); return eq; }
  function rollLoot(tier) { const t = D.loot.tiers[clamp(tier, 0, 4)], tot = t.reduce((a, r) => a + r[1], 0); let u = rng() * tot; for (const [id, w] of t) { u -= w; if (u < 0) return id; } return t[0][0]; }
  function itemLine(it) { if (!it) return ""; if (it.slot === "weapon") return `d${it.die} · ${D.stats.find((s) => s.id === it.stat).name}${it.hit ? " · +" + it.hit + " hit" : ""}`; return it.text.split(". ")[0]; }
  function lootPanel(id, from) { const it = item(id), eq = CH().gear[it.slot] === id; audio.sfx("pick");
    panel("loot", `${from} ${it.name}`, (pn) => { pn.appendChild(el("p", null, it.text)); if (it.slot === "weapon") pn.appendChild(el("p", "o3-small", `As a weapon: d20${sg(mod(stat(it.stat)) + prof() + (it.hit || 0))} to hit, d${it.die}${sg(mod(stat(it.stat)))} damage.`));
      pn.appendChild(el("p", "o3-small", eq ? "✓ Equipped (it beat what you had)." : it.slot === "use" ? "In your bag. Use it from 🎒 Gear (I)." : it.slot === "quest" ? "Quest item. It's in your bag." : "In your bag. Swap it in from 🎒 Gear (I).")); }); }
  function openBox(bx) { if (bx.opened) return; if (!transformed) return nudge(true); bx.opened = true; S.world.loot[bx.key] = new Date().toISOString();
    let id; const rs = D.quests.find((q) => q.type === "fetch"); if (rs && !S.quests[rs.id]?.done && !CH().inv.includes(rs.item) && !S.flags.parcelFound) { id = rs.item; S.flags.parcelFound = true; } else id = rollLoot(bx.tier + (bx.chest ? 1 : 0));
    giveItem(id); bx.lid.rotation.x = -1.6; bx.spark.visible = false; bx.q.visible = false; save(); lootPanel(id, bx.chest ? "🧰 Behind the dice door:" : "📦 In the box:"); }
  function useItem(id, target) { const c = CH(), it = item(id), i = c.inv.indexOf(id); if (!it || i < 0 || it.slot !== "use") return;
    if (it.dmg) { const m = target && !target.dead ? target : liveFoes()[0]; if (!m) { host.toast("Nobody to throw it at."); return; } c.inv.splice(i, 1); const d = rollN(it.dmg[0], it.dmg[1]); dmgFoe(m, d.s + (it.dmg[2] || 0), `${it.icon || "🪀"} ${it.name} ${it.dmg[0]}d${it.dmg[1]} [${d.r.join(",")}]`); save(); renderBar(); return; }
    let h = rollN(it.heal[0], it.heal[1]).s + it.heal[2], bonus = ""; if (id === "soup" && c.path === "wanderer") { const x = roll(4); h += x; bonus = ` + Wanderer d4 [${x}]`; } c.inv.splice(i, 1); c.hp = Math.min(maxHp(), c.hp + h); addLog(`${it.icon || "🍲"} ${it.name}: ${it.heal[0]}d${it.heal[1]}+${it.heal[2]}${bonus} = +${h} HP`, "heal"); save(); renderBar(); }
  function equip(id) { const c = CH(), it = item(id), i = c.inv.indexOf(id); if (!it || i < 0 || !EQUIP.includes(it.slot)) return false; if (!canWear(id)) { host.toast(`A ${clsOf()?.name} can't use the ${it.name} (${it.slot === "armor" ? (D.armorTiers?.[it.tier]?.name || it.tier) + " armor" : "too heavy a weapon"}).`); return false; } c.inv.splice(i, 1); if (c.gear[it.slot]) c.inv.push(c.gear[it.slot]); c.gear[it.slot] = id; save(); renderBar(); return true; }

  // ---------- combat (click / E to swing; critters swing back on a timer; all rolls are d20 + modifier vs AC) ----------
  function resolveAttack(bonus, targetAc, adv) { const r1 = roll(20), r2 = adv ? roll(20) : null, d = adv ? Math.max(r1, r2) : r1, total = d + bonus; return { d20: d, rolls: adv ? [r1, r2] : [r1], bonus, total, ac: targetAc, crit: d === 20, fumble: d === 1, hit: d === 20 || (d !== 1 && total >= targetAc) }; }
  const mobWorldLocal = (m) => (m.ch ? { x: m.ch.lx + m.g.position.x, z: m.ch.lz + m.g.position.z } : { x: IX + m.g.position.x, z: IZ + m.g.position.z });
  const dist = (m) => { const w = mobWorldLocal(m); return Math.hypot(w.x - lastP.x, w.z - lastP.z); };
  const sameRoom = (m) => curZone === m.zone;
  function attackMob(m, skipRange) { if (battle.active() && !inBattleCall) return null; if (!transformed || !m || m.dead || koBusy || host.state().busy || cd > 0) return null;
    if (!skipRange && (!sameRoom(m) || dist(m) > D.mobs.reach)) { host.toast(`Too far. Get closer to the ${m.name}.`); return null; }
    cd = D.mobs.playerCooldown * (has("extra") && !battle.active() ? 0.65 : 1); F.allinFoes = false; const adv = footArmed || F.aim || F.allin; if (F.allin) { F.allin = false; F.allinFoes = true; } F.aim = false; const wp = weapon(), r = resolveAttack(atkBonus(), m.ac, adv); lastAttack = { ...r, mob: m.name, id: m.id }; m.cd = Math.max(m.cd, 0.6); tipEvent("attack");
    const rs = r.rolls.length > 1 ? `[${r.rolls.join(", ")}]→${r.d20}` : `${r.d20}`;
    if (r.fumble) { cd = 2.0; footArmed = false; addLog(`🎲 ${rs}: natural 1! ${rpick(D.mobs.fumbles)}`, "miss"); popup("🎲 1 · fumble!", "miss"); audio.sfx("nope"); renderBar(); return r; }
    if (!r.hit) { footArmed = false; addLog(`🎲 ${rs}${sg(r.bonus)} = ${r.total} vs AC ${m.ac} · miss (${m.name})`, "miss"); popup(`🎲 ${r.total} vs AC ${m.ac} · miss`, "miss"); audio.sfx("blip"); renderBar(); return r; }
    const dice = rollN(r.crit ? 2 : 1, wp.die); let dmg = dice.s + dmgMod(), extra = ""; footArmed = false;
    if (has("drilled") && wp.slot === "weapon" && wp !== item("fists")) { dmg += 2; extra += " +2 drilled"; } if (F.rage && ["stride", "nerve"].includes(wp.stat)) { dmg += 2; extra += " +2 hot"; }
    if (F.mark && F.mark === m.id) { const x = roll(4); dmg += x; extra += ` + mark d4 [${x}]`; }
    if (sneakDice() && F.sneakTurn !== F.turn && (adv || allyHere())) { const sd = rollN(sneakDice() * (r.crit ? 2 : 1), 6); dmg += sd.s; F.sneakTurn = F.turn; extra += ` + cheap shot ${sd.r.length}d6 [${sd.r.join(",")}]`; }
    if (F.smite) { const sm2 = rollN(F.smite[0] * (r.crit ? 2 : 1), F.smite[1]); dmg += sm2.s; F.smite = 0; extra += ` + oathstrike [${sm2.r.join(",")}]`; } dmg = Math.max(1, dmg);
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
  function dropLoot(ch, m, id) { if (item(id)?.unique && ownsItem(id)) return null; const g = new THREE.Group(); g.position.set(m.g.position.x, m.g.position.y || 0, m.g.position.z); (ch ? ch.g : inst.g).add(g);
    const it = item(id); const cm = sm(it.slot === "weapon" ? "#d8a64a" : it.slot === "use" ? "#7fc8a0" : "#a8c8e8", { emissive: "#fff2a8", emissiveIntensity: 0.35 }); const b = new THREE.Mesh(G("loot", () => new THREE.OctahedronGeometry(0.16, 0)), cm); b.position.y = 0.4; g.add(b);
    const d = { g, b, id, lx: (ch ? ch.lx : IX) + m.g.position.x, lz: (ch ? ch.lz : IZ) + m.g.position.z, taken: false, key: (!ch && m.boss && inst.id) ? preBossKey(inst.id) : undefined }; (ch ? ch.rpg.drops : inst.drops).push(d); addLog(`💎 The ${m.name} dropped something: ${it.name}`, "loot"); return d; }
  function takeDrop(d) { if (d.taken) return; d.taken = true; d.g.visible = false; if (d.key) { S.world.loot[d.key] = new Date().toISOString(); save(); ext.onRunEvent?.("loot", d.key); } giveItem(d.id); lootPanel(d.id, "✋ You pick up:"); }
  function hurt(n, by) { const c = CH(); if (!c || koBusy) return; if (c.tmp > 0) { const a = Math.min(c.tmp, n); c.tmp -= a; n -= a; } c.hp = Math.max(0, c.hp - n); hurtEl.classList.remove("on"); void hurtEl.offsetWidth; hurtEl.classList.add("on"); save(); renderBar(); if (c.hp <= 0) knockout(by); }
  function mobAttack(m) { const r = resolveAttack(m.atk, ac(), !!F.allinFoes); m.n++;
    if (m.boss && m.def.special && m.n % m.def.special.every === 0) { const sp = m.def.special, d = roll(20), b = checkBonus(sp.stat, false, true), tot = d + b, ok = tot >= sp.dc, dm = rollN(sp.dice[0], sp.dice[1]).s + m.dmgB, got = ok ? Math.floor(dm / 2) : dm;
      addLog(`🌪 ${sp.name}! ${sp.text} ${D.stats.find((s) => s.id === sp.stat).name} save ${d}${sg(b)} = ${tot} vs DC ${sp.dc} · ${ok ? "half" : "full"} damage: ${got}`, ok ? "miss" : "ouch"); popup(`🌪 ${sp.name} · ${got} dmg`, "ouch"); hurt(got, m.name); return; }
    if (!r.hit) { addLog(`${m.icon} ${m.name} rolls ${r.d20}${sg(m.atk)} = ${r.total} vs your AC ${r.ac} · misses`, "miss"); return; }
    let dm = Math.max(1, rollN(r.crit ? 2 : 1, m.die).s + m.dmgB), why = ""; if (F.rage) { dm = Math.max(1, Math.floor(dm / 2)); why = " (halved: running hot)"; } else if (has("dodge") && !F.dodged) { F.dodged = true; dm = Math.max(1, Math.floor(dm / 2)); why = " (halved: rolled with it)"; }
    addLog(`${m.icon} ${m.name} rolls ${r.d20}${sg(m.atk)} = ${r.total} vs AC ${r.ac} · ${rpick(m.def.hitText)} (−${dm} HP${why})`, "ouch"); audio.sfx("flump"); hurt(dm, m.name); }
  const allMobs = () => { const out = []; if (inst.active) inst.mobs.forEach((m) => out.push(m)); else chunks.forEach((ch) => ch.rpg?.mobs.forEach((m) => out.push(m))); gmMobs.forEach((m) => { if (!out.includes(m)) out.push(m); }); return out; };

  // ---------- v5b/v5c: battles (side view, wait-style turn gauges; module: annex-battle.js) ----------
  // Per-instance battleMode: "atb-turns" (current side-view wait-style turns) or "realtime" (existing open-world style).
  // The Mailroom is the test bench for comparing systems — new mode names can be added later and selected per instance. None are built in v5c.
  // "turnBased": true is kept as a compatibility alias for battleMode "atb-turns".
  // Party instances fall back to real time for now (turns aren't synced between teammates yet) unless combat.partyTurns is on.
  function battleModeOf(I) { if (!I) return "realtime"; if (I.battleMode) return I.battleMode; return I.turnBased ? "atb-turns" : "realtime"; }
  function usesAtbTurns(I) { return battleModeOf(I) === "atb-turns"; }
  function turnBasedHere() { if (!D) return false; if (inst.active) { const I = D.instances[inst.id]; if (I?.control) return false; if (isTraining() && sbTurnBased !== null) return sbTurnBased; return usesAtbTurns(I) && (partySize() <= 1 || !!D.combat?.partyTurns); } return !!D.combat?.turnBasedEverywhere; }
  // v5b+: single-room instances (Training Closet) set battleRange: critters wait at home and a fight starts only when you walk
  // up to one; it pulls in critters within battleGroup of it (a boss never pulls anyone in, and is only pulled if it's the one you walked up to).
  const rangeCfg = () => { const I = inst.active ? D.instances[inst.id] : null; return I?.battleRange ? { range: I.battleRange, group: I.battleGroup ?? 2.6 } : null; };
  const mobW = (m) => ({ x: IX + m.g.position.x, z: IZ + m.g.position.z });
  function rangeFoes(p, zone) { const rc = rangeCfg(); if (!rc) return null; let best = null, bd = 1e9; const L = inst.mobs.filter((m) => !m.dead && m.zone === zone);
    L.forEach((m) => { const w = mobW(m), d = Math.hypot(w.x - p.x, w.z - p.z); if (d < bd) { bd = d; best = m; } }); if (!best || bd > rc.range) return [];
    if (best.boss) return [best]; const bw = mobW(best); return [best, ...L.filter((m) => m !== best && !m.boss && Math.hypot(mobW(m).x - bw.x, mobW(m).z - bw.z) <= rc.group)]; }
  function battleFoes(zone) { const out = []; allMobs().forEach((m) => { if (!m.dead && m.zone === zone) out.push(m); }); if (!inst.active) gmMobs.forEach((m) => { if (!m.dead && m.zone === zone) out.push(m); }); return out; }
  const GEAR_ICON = { cone: "🚧", visor: "🧢", cardigan: "🧥", bubble: "🫧", cardboard: "📦", badge: "📛", keyring: "🔑", mint: "🍬", clips: "📎" };
  const WEAPON_ICON = { fists: "👊", newspaper: "🗞️", stapler: "📎", chicken: "🐔", ruler: "📏", umbrella: "☂️", punch: "🕳️", lamp: "💡", mop: "🧹", tape: "🩹", jug: "🫗" };
  // optional pose frames per avatar (data: avatars.static[].poses = { idle, attack, hurt, victory, hold }); missing ones fall back to CSS transforms
  const avatarPoses = (src) => { const e = (D?.avatars?.static || []).find((a) => a.src === src); return e?.poses && typeof e.poses === "object" ? e.poses : null; };
  const PATH_COL = { archivist: "#6a5a9a", wanderer: "#4a7a5a", tinkerer: "#9a6a3a" };
  const CLS_COL = { warrior: "#6a6a7a", barbarian: "#8a4a3a", ranger: "#4a7a4a", rogue: "#4a4a5a", cleric: "#b89a4a", paladin: "#7a8ab8", sorcerer: "#c87a3a", warlock: "#5a3a7a" };
  function avatarUrl() { const c = CH(); return ext.avatarUrl?.() || c?.avatar || null; }
  function heroInfo() { const c = CH(); return { name: c.name, hp: c.hp, maxHp: maxHp(), xp: c.xp, level: level(), color: CLS_COL[c.cls] || PATH_COL[c.path] || "#5b7a4a", avatar: avatarUrl(), speedMod: mod(stat(clsOf()?.primary || "stride")), fill: turnFill(),
    weaponIcon: WEAPON_ICON[c.gear.weapon] || item(c.gear.weapon)?.icon || "👊", weaponName: weapon().name, poses: avatarPoses(avatarUrl()),
    gearIcons: ["head", "armor"].map((k) => c.gear[k] && (GEAR_ICON[c.gear[k]] || (k === "head" ? "🎩" : "🦺"))).filter(Boolean) }; }
  // enemy portraits: each critter's own 3D model, photographed once into a small picture (cached per kind)
  const ART = new Map(); let artR = null;
  function foeArt(m) { const key = (m.def?.mesh || (m.boss ? (m.def?.mesh || "boss") : m.kind)) + (m.boss ? ":b" : ""); if (ART.has(key)) return ART.get(key); let url = null;
    try { if (!artR) { artR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); artR.setSize(220, 220, false); artR.setClearColor(0x000000, 0); artR.outputColorSpace = THREE.SRGBColorSpace; }
      const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4dc, 0x55503f, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(2, 3, 4); sc.add(dl);
      const mm = makeMobMesh(m.def?.mesh || (m.boss ? "boss" : m.kind), sc, 1); mm.barG.visible = false; const bb = new THREE.Box3().setFromObject(mm.body), sz = bb.getSize(new THREE.Vector3()), ct = bb.getCenter(new THREE.Vector3());
      const r = Math.max(sz.x, sz.y, sz.z, 0.3), cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50); cam.position.set(ct.x + r * 1.1, ct.y + r * 0.45, ct.z + r * 2.4); cam.lookAt(ct);
      artR.render(sc, cam); url = artR.domElement.toDataURL("image/png"); sc.remove(mm.g); } catch (e) { url = null; }
    ART.set(key, url); return url; }
  function freeArt() { if (artR) { try { artR.dispose(); artR.forceContextLoss(); } catch {} artR = null; } }
  function foeView(m) { return Object.assign(m, { art: foeArt(m) }); }
  function startBattle(foes, zone) { const I = inst.active ? D.instances[inst.id] : null, k = /:run:(\d+)$/.exec(zone || ""), stp = I?.steps && k ? I.steps[+k[1]] : null;
    abilityUsed = false; footArmed = false; fightReset(); fightGroup = "battle:" + zone; battleZone = zone; battleBoss = foes.some((m) => m.boss || m.gmBoss); renderBar(); host.setFreeze?.(true); host.closePanel?.();
    battleList = foes.slice(); foes.forEach(foeView); freeArt(); const c = CH(); lastBattle = { zone, xp0: c.xp, lvl0: level(), logT0: logTotal, foes: foes.map((m) => m.name), at: Date.now(), outcome: null };
    const C = D.companion, palOn = companionActive();
    battle.start({ title: stp ? stp.name : isTraining() ? `🎓 Practice bout · ${I.short || I.name}` : `A scuffle in ${I ? I.short || I.name : "the Annex"}`, hero: heroInfo(), foes, speed: battleSpeed,
      intro: foes.length > 1 ? `${foes.length} critters block the way! Wait for your gauge, then pick a move. Nothing moves while you choose.` : `A ${foes[0].name} blocks the way! Wait for your gauge, then pick a move. Nothing moves while you choose.`,
      companion: palOn && C ? { ...C } : null, companionOn: companionOn(), companionOnNow: () => companionOn(),
      toggleOnLabel: C?.toggleOn, toggleOffLabel: C?.toggleOff, onToggleCompanion: () => setCompanion(!companionOn()),
      rules: battleRules }); }
  const inB = (fn) => (...a) => { inBattleCall = true; try { return fn(...a); } finally { inBattleCall = false; } };
  const battleRules = {
    hero: () => heroInfo(), alive: (m) => !m.dead && m.hp > 0, isKO: () => koBusy || !CH() || CH().hp <= 0,
    weaponName: () => `${weapon().name} · d${weapon().die}`,
    attack: inB((m, armed) => { cd = 0; if (armed) footArmed = true; const r = attackMob(m, true); if (r && has("extra") && !koBusy) { const t = !m.dead ? m : (battle.foeList?.() || []).find((q) => !q.dead && q.hp > 0); if (t) { cd = 0; addLog("⚔️ Extra Attack!", "sys"); const r2 = attackMob(t, true); if (r2?.hit && !r.hit) return r2; } } return r; }),
    palStrike: inB((m) => { const C = D.companion, r = resolveAttack(C.atk, m.ac, false); if (!r.hit) { addLog(`${C.name} trips at the ${m.name} and misses.`, "miss"); return r; } const dmg = Math.max(1, rollN(1, C.die).s); m.hp -= dmg; m.hitT = 0.3; addLog(`${C.name} ${rpick(C.attackTexts).replace("{name}", m.name)} (−${dmg} HP)`, "hit"); if (m.hp <= 0) killMob(m); return Object.assign(r, { dmg }); }),
    palHeal: inB((p) => { const C = D.companion, h = p?.heal || C.heal || [1, 4, 1], c = CH(); if (!c) return { got: 0 }; const amount = Math.max(1, rollN(h[0], h[1]).s + (h[2] || 0)); const before = c.hp; c.hp = Math.min(maxHp(), c.hp + amount); const got = c.hp - before; save(); renderBar(); addLog(`${C.name} ${C.healText}  +${got} HP`, "heal"); return { got, amount }; }),
    palHit: inB((m, pal) => { const r = resolveAttack(m.atk, pal.ac ?? 11, false); if (!r.hit) { addLog(`${m.icon || ""} ${m.name} swings at ${pal.name} and misses.`, "miss"); return { hit: false, dmg: 0, text: `${m.name} misses ${pal.name}` }; } const dmg = Math.max(1, rollN(1, m.die).s + (m.dmgB || 0)); addLog(`${m.icon || ""} ${m.name} bonks ${pal.name} (−${dmg} HP)`, "ouch"); return { hit: true, dmg, text: `${m.name} bonks ${pal.name} (−${dmg} HP)` }; }),
    abilities: () => abilityList(), afterAct: () => afterAct(), taunting: () => !!F.taunt, skipTurn: (m) => { if (m.skip > 0) { m.skip--; return true; } return false; },
    ability: () => { const ab = pathOf().ability; return { name: ab.name, short: ab.name.split(" (")[0], icon: ab.icon, used: abilityUsed, armed: footArmed, kind: ab.id === "footnote" ? "arm" : ab.id === "gizmo" ? "target" : "heal",
      hint: ab.id === "footnote" ? "next attack rolls twice" : ab.id === "gizmo" ? "2d6, no roll needed" : `heal 1d8+${level()}` }; },
    useAbility: inB((target, id) => useAbility(target || undefined, id)),
    items: () => { const c = CH(), n = {}; c.inv.forEach((id) => { const it = item(id); if (it?.slot === "use") n[id] = (n[id] || 0) + 1; }); return Object.entries(n).map(([id, count]) => { const it = item(id); return it.dmg ? { id, name: it.name, icon: it.icon, count, target: true, hint: `${it.dmg[0]}d${it.dmg[1]} damage, no roll` } : { id, name: it.name, icon: it.icon, count, hint: `heals ${it.heal[0]}d${it.heal[1]}+${it.heal[2]}` }; }); },
    useItem: inB((id, m) => useItem(id, m)),
    fleeHint: () => { const b = mod(stat("stride")); return `d20${sg(b)} vs ${fleeDC()}`; },
    flee: () => { const d = roll(20), b = mod(stat("stride")), tot = d + b, dc = fleeDC(), ok = d !== 1 && (d === 20 || tot >= dc);
      addLog(`🏃 Flee: d20 ${d}${sg(b)} = ${tot} vs ${dc} · ${ok ? "you scarper back the way you came" : "you trip over a parcel. Still here!"}`, ok ? "sys" : "miss");
      return { ok, text: ok ? `🏃 ${tot} vs ${dc}: you scarper back the way you came!` : `🏃 ${tot} vs ${dc}: you trip over a parcel. Still here!` }; },
    foeAct: (m) => mobAttack(m),
    logCount: () => logTotal, logsSince: (n) => logs.slice(Math.max(0, logs.length - (logTotal - n))).map((l) => l.t),
    summary: (b) => { const c = CH(), got = c.xp - lastBattle.xp0, lines = [], L = level(); const loot = logs.slice(Math.max(0, logs.length - (logTotal - lastBattle.logT0))).filter((l) => l.kind === "loot" || l.kind === "quest").map((l) => l.t);
      lines.push(got > 0 ? `⭐ +${got} XP` : isTraining() ? "🎓 Practice: nothing counts in here." : "⭐ No XP this time (too easy for you)."); if (L > lastBattle.lvl0) lines.push(`⬆️ Level ${L}! Max HP ${maxHp()}.`);
      loot.forEach((t) => lines.push(t)); lines.push(`❤️ ${c.hp}/${maxHp()} HP · ${b.turns} turn${b.turns === 1 ? "" : "s"}`); return { title: b.foes.some((f) => f.m.boss) ? "🏆 Boss down!" : "🎉 Scuffle won!", lines }; },
    onEnd: (outcome) => { lastBattle.outcome = outcome; host.setFreeze?.(false); fightGroup = null; battleBoss = false; footArmed = false; if (outcome === "win" && has("clauses") && (clsOf()?.clauses || []).includes("signature") && CH()) { CH().tmp = Math.max(CH().tmp || 0, Math.max(1, mod(stat("luck"))) + level()); addLog(`✒️ Second Signature: ${CH().tmp} temporary HP.`, "heal"); } fightReset(); renderBar(); host.updateActions?.();
      if (outcome === "win") { try { audio.playSting?.("victory-jingle"); } catch (e) {} } // v5d2: short sting, then the area bed comes back
      if (outcome === "fled") { const sp = fleeSpot(); if (sp) ctx.placeRaw(sp); tbGraceUntil = performance.now() + 2500; host.toast("🏃 You got away. The critters stay where they are (and remember you)."); }
      else tbGraceUntil = performance.now() + 600;
      if (pendingLvl && outcome !== "ko") { pendingLvl = null; setTimeout(() => { if (!host.state().busy && !koBusy && !battle.active()) openLevelUp(); }, 300); } else pendingLvl = null; },
  };
  const fleeDC = () => (battleFoesNow().some((m) => m.boss) ? 12 : 8);
  const battleFoesNow = () => battleList.filter((m) => !m.dead);
  function fleeSpot() { const I = inst.active ? D.instances[inst.id] : null, k = /:run:(\d+)$/.exec(battleZone || "");
    const rc = rangeCfg(); if (rc && battleList.length) { const s0 = I.size, cx = battleList.reduce((a, m) => a + mobW(m).x, 0) / battleList.length, cz = battleList.reduce((a, m) => a + mobW(m).z, 0) / battleList.length;
      const sp0 = I.spawn || { x: s0 / 2, z: s0 - 2 }; let dx = lastP.x - cx, dz = lastP.z - cz, dl = Math.hypot(dx, dz); if (dl < 0.2) { dx = IX + sp0.x - cx; dz = IZ + sp0.z - cz; dl = Math.hypot(dx, dz) || 1; }
      const far = rc.range + 1.4, x = clamp(cx + dx / dl * far, IX + 1.2, IX + s0 - 1.2), z = clamp(cz + dz / dl * far, IZ + 1.2, IZ + s0 - 1.2);
      const ok = inst.mobs.every((m) => m.dead || Math.hypot(mobW(m).x - x, mobW(m).z - z) > rc.range + 0.3); return ok ? { x, z, yaw: Math.atan2(-(cx - x), -(cz - z)) } : { x: IX + sp0.x, z: IZ + sp0.z, yaw: sp0.yaw || 0 }; }
    if (I?.layout === "run" && k) { const R0 = runGeo(I), sg = R0.seg(+k[1]); return { x: IX + R0.cx, z: IZ + Math.min(sg.z1 + 1.6, R0.z1 - 1.2), yaw: 0 }; }
    if (!prevSpot) return null; const rect = walkable.find((r) => r.room === prevSpot.zone); let { x, z } = prevSpot;
    if (rect) { x = clamp(x, rect.x0 - AX + 0.4, rect.x1 - AX - 0.4); z = clamp(z, rect.z0 - AZ + 0.4, rect.z1 - AZ - 0.4); } return { x, z, y: prevSpot.y, yaw: prevSpot.yaw }; }
  let battleSpeed = 1;

  // ---------- knockout: Grenshol to the rescue (never death) ----------
  function pickCons(force) { const L = D.knockout.consequences; if (force) return L.find((c) => c.id === force) || L[0]; const tot = L.reduce((a, c) => a + c.weight, 0); let u = rng() * tot; for (const c of L) { u -= c.weight; if (u < 0) return c; } return L[0]; }
  function knockout(by, force, opts = {}) { if (koBusy || !CH()) return; if (isTraining()) return trainingKO(by); koBusy = true; const c = CH(), K = D.knockout, L = level(), lo = D.levels.xp[L - 1], loss = Math.floor((c.xp - lo) * K.xpLossPct);
    c.xp = Math.max(lo, c.xp - loss); let cons = pickCons(force), note = null, stolen = null;
    if (opts.trap) { c.xp += loss; } if ((inst.active || opts.trap) && cons.id === "steal") cons = pickCons("fog"); // v5d2: Grenshol isn't in the instances, so nothing gets 'borrowed' in there
    if (cons.id === "steal") { const cand = EQUIP.map((s) => c.gear[s]).filter((id) => id && !item(id).keep).sort((a, b) => (item(b).value || 0) - (item(a).value || 0));
      if (cand.length) { stolen = cand[0]; const it = item(stolen); c.gear[it.slot] = null; { const alt = c.inv.filter((q) => item(q)?.slot === it.slot).sort((x, y) => (item(y).value || 0) - (item(x).value || 0))[0]; if (alt) { c.inv.splice(c.inv.indexOf(alt), 1); c.gear[it.slot] = alt; } } note = rpick(cons.note).replace("{item}", it.name.toLowerCase()); S.stash.push({ item: stolen, note, at: new Date().toISOString() }); } else cons = pickCons("fog"); }
    if (opts.trap && K.trap?.noConsequence) cons = { id: "none", text: opts.rescue || "" }; else if (cons.id !== "steal" && !(c.status || []).some((s) => s.id === cons.id)) (c.status ||= []).push({ id: cons.id, text: cons.status, statMod: cons.statMod || null });
    const wasInst = inst.active ? inst.from : null; c.hp = 0; footArmed = false; abilityUsed = false; fightGroup = null;
    const lossN = opts.trap ? 0 : loss; lastKO = { by: by || null, loss: lossN, xp: c.xp, cons: cons.id, stolen, note, inInstance: !!wasInst, trap: !!opts.trap, keepsake: c.keepsake ? c.keepsake.state : null, at: Date.now(), placed: false }; fightReset(); save(); renderBar();
    addLog(`💫 Knocked out${by ? " by the " + by : ""}.${lossN ? " −" + lossN + " XP." : ""}`, "ouch"); audio.sfx("flump");
    koT.textContent = K.fade; ko.classList.add("on");
    setTimeout(() => { koT.textContent = (wasInst && K.carryInstance) || K.carry; if (wasInst) leaveInstance(true); const st = !wasInst && !opts.trap && ctx.stableSpawn ? ctx.stableSpawn() : null; const sp = wasInst ? hubSpawn(wasInst.i, wasInst.j, 0) : opts.trap ? (ctx.stationSpawn ? ctx.stationSpawn() : safeSpawn("home")) : st ? st.sp : safeSpawn(S.lastCrystal); place(sp); lastKO.placed = true; lastKO.to = sp; lastKO.stable = st ? st.id : null;
      if (st) lastKO.stableName = st.name; if (opts.trap) koT.textContent = opts.rescue || koT.textContent; c.hp = maxHp(); save(); renderBar(); host.updateActions(); }, 1400 * koSpeed);
    setTimeout(() => { ko.classList.remove("on"); koBusy = false;
      panel("knockout", "💫 " + K.noteTitle, (pn) => { pn.dataset.cons = cons.id;
        if (stolen) { pn.appendChild(el("div", "o3-note o3-gnote", note)); pn.appendChild(el("p", "o3-small", `Your ${item(stolen).name} is gone. It's on the list in Grenshol's stash (see your sheet). Maybe you can win it back one day.`)); }
        else if (cons.text) pn.appendChild(el("p", null, cons.text));
        pn.appendChild(el("p", "o3-small", `${lossN ? `You lost ${lossN} XP (never a whole level). ` : "Nothing lost. "}HP back to full. ${wasInst ? "You're back by the door you came in." : opts.trap ? "You're back at the Door Station." : lastKO.stableName ? fill(D.knockout.openHalls || "You wake at {place}.").replace("{place}", lastKO.stableName) : "You're somewhere safe."} Your Keepsake is still with you.`)); }); }, 3600 * koSpeed); }

  // ---------- dice doors ----------
  function openDoor(dr) { if (!transformed) return nudge(true); const st = D.stats.find((s) => s.id === dr.P.stat), b = checkBonus(dr.P.stat, true);
    panel("door", "🎲 A dice door", (pn) => { pn.appendChild(el("p", "o3-riddle", D.doors.labels[dr.P.stat])); pn.appendChild(el("p", "o3-small", `${st.icon} ${st.name} check · DC ${dr.P.dc} · you roll d20${sg(b)}${pathOf().prof.includes(dr.P.stat) ? " (includes proficiency)" : ""}`));
      const out = el("p", "o3-riddleout"); const btn = el("button", "o3-btn", "🎲 Roll d20"); btn.dataset.rpg = "door-roll"; pn.append(btn);
      if (CH().path === "archivist" && (!footUsed[footKey()] || footArmed)) { const fb = el("button", "o3-btn ghost small", footArmed ? "📝 Footnote armed" : "📝 Use Footnote (roll twice, once per instance)"); fb.dataset.rpg = "door-foot"; fb.onclick = () => { if (!footArmed) { footArmed = true; footUsed[footKey()] = 1; renderBar(); } fb.textContent = "📝 Footnote armed"; }; pn.append(fb); }
      pn.appendChild(out); btn.onclick = () => { const r = doorRoll(dr); if (!r) { out.textContent = "The door is still sulking. Give it a second."; out.className = "o3-riddleout no"; return; } out.textContent = r.text; out.className = "o3-riddleout " + (r.ok ? "ok" : "no"); if (r.ok) { btn.disabled = true; setTimeout(() => host.closePanel(), 1100); } }; }); }
  function doorRoll(dr) { if (dr.open || Date.now() < dr.waitUntil) return null; const b = checkBonus(dr.P.stat, true), adv = footArmed, r1 = roll(20), r2 = adv ? roll(20) : null, d = adv ? Math.max(r1, r2) : r1, tot = d + b, ok = tot >= dr.P.dc; footArmed = false;
    const rs = adv ? `[${r1}, ${r2}]→${d}` : `${d}`, sn = D.stats.find((s) => s.id === dr.P.stat).name; lastDoor = { d20: d, bonus: b, total: tot, dc: dr.P.dc, ok, stat: dr.P.stat, key: dr.key };
    if (ok) { dr.open = true; S.world.doors[dr.key] = new Date().toISOString(); const bi = dr.ch.blockers.indexOf(dr.blk); if (bi >= 0) dr.ch.blockers.splice(bi, 1); refreshBlockers(); dr.swing = 0.001; audio.sfx("chime");
      addLog(`🚪 ${sn} check ${rs}${sg(b)} = ${tot} vs DC ${dr.P.dc} · open!`, "hit"); popup(`🎲 ${tot} vs DC ${dr.P.dc} · open!`, "hit"); gainXP(D.xp.door, "dice door"); progress("door"); save(); renderBar(); return { ok, text: `${rs}${sg(b)} = ${tot} vs DC ${dr.P.dc}. ${D.doors.success}` }; }
    dr.waitUntil = Date.now() + D.doors.retrySeconds * 1000; const f = rpick(D.doors.fails); audio.sfx("nope"); addLog(`🚪 ${sn} check ${rs}${sg(b)} = ${tot} vs DC ${dr.P.dc} · nope. ${f}`, "miss"); popup(`🎲 ${tot} vs DC ${dr.P.dc} · nope`, "miss"); renderBar();
    return { ok, text: `${rs}${sg(b)} = ${tot} vs DC ${dr.P.dc}. ${f} (Try again in a few seconds.)` }; }

  // ---------- a question from an almost-person (the talk panel also lets the player ask them; either path can complete Small Talk) ----------
  function talkExtras(pn, npc) { if (!D || !transformed || !CH() || npc.poss) return; const done = S.counters.riddles || []; const rd = D.riddles.find((r) => !done.includes(r.id)); if (!rd) return;
    const holder = el("div"); pn.appendChild(holder); const b = el("button", "o3-btn ghost small", "🧩 They seem to have a question for you…"); b.dataset.rpg = "riddle"; holder.appendChild(b);
    b.onclick = () => { holder.textContent = ""; const bx = el("div", "o3-note"); bx.appendChild(el("p", "o3-riddle", `"${rd.q}"`)); const row = el("div", "o3-prompts"); const out = el("p", "o3-riddleout");
      rd.a.forEach((a, ai) => { const ab = el("button", "o3-btn ghost small", a); ab.dataset.rpg = "ans-" + ai; ab.onclick = () => { const r = answerRiddle(rd.id, ai); out.textContent = fill(r.ok ? rd.yes : rd.no); out.className = "o3-riddleout " + (r.ok ? "ok" : "no"); if (r.ok) row.querySelectorAll("button").forEach((q) => (q.disabled = true)); }; row.appendChild(ab); });
      bx.append(row, out); holder.appendChild(bx); }; }
  function answerRiddle(id, ai) { const rd = D.riddles.find((r) => r.id === id), done = (S.counters.riddles ||= []); if (!rd || done.includes(id)) return { ok: false };
    if (ai !== rd.ok) { audio.sfx("nope"); addLog("🧩 Wrong answer. The almost-person looks politely disappointed. (Ask again any time.)", "miss"); return { ok: false }; }
    done.push(id); audio.sfx("chime"); gainXP(D.xp.riddle, "answered a question"); progress("riddle"); save(); return { ok: true }; }

  // ---------- party portals -> instanced rooms (the ONLY place party size matters) ----------
  const IX = -3000, IZ = -3000; const inst = { active: false, rooms: {}, walk: false, g: null, mobs: [], drops: [], from: null, zone: "annex:inst:room", id: null, exit: null, extras: [], blockers: [] };
  function buildInstance(id) { const I = D.instances[id], s = I.size, pal = I.palette; Object.entries(inst.rooms).forEach(([k, r]) => (r.g.visible = k === id)); if (inst.rooms[id]) { inst.g = inst.rooms[id].g; inst.exit = inst.rooms[id].exit; inst.extras = inst.rooms[id].extras; inst.blockers = inst.rooms[id].blockers || []; return; }
    if (I.layout === "run") return buildRun(id, I);
    if (I.layout === "cave") return buildCave(id, I);
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
    if (I.layout === "run") return spawnRun(id, I); if (I.layout === "cave") return spawnCave(id, I); if (I.training) return spawnTraining(I, n); if (S.world.bosses[id]) return; const s = I.size, rect = { x0: 1.6, x1: s - 1.6, z0: 1.4, z1: s - 1.4 };
    const bd = I.boss, boss = { kind: "boss", def: bd, name: bd.name, icon: bd.icon, maxHp: Math.round(bd.hp * (1 + sc.hpPerExtra * (n - 1))), ac: bd.ac, atk: bd.atk, die: bd.die, dmgB: sc.dmgPerExtra * (n - 1), xp: bd.xp, speed: bd.speed, every: bd.every, boss: true, clvl: I.level || 1 };
    inst.mobs.push(newMob(boss, makeMobMesh("boss", inst.g, 2), s / 2, 3.2, rect, inst.zone, null, "inst:boss"));
    const k = I.minions ?? n * sc.minionsPerMember; for (let q = 0; q < k; q++) { const st = { ...scaled(I.minion, 0) }; st.dmgB += sc.dmgPerExtra * (n - 1); inst.mobs.push(newMob(st, makeMobMesh(I.minion, inst.g), 3.5 + q * 3.5, 5.4, rect, inst.zone, null, "inst:m" + q)); } }
  function openPortal(p) { if (!transformed) return nudge(true); if (p.pp.gate) return openGate(p); S.flags.sawPortal = true; save(); const I = D.instances[p.pp.instance], n = clamp(Math.max(party.members.length, urlParty || 1), 1, D.party.max);
    panel("portal", "🌀 Party portal", (pn) => { pn.appendChild(el("p", "o3-riddle", p.pp.label)); pn.appendChild(el("p", null, I.intro));
      if (S.world.bosses[p.pp.instance]) { pn.appendChild(el("p", "o3-small", I.done)); return; }
      const pl = el("p", "o3-small", `Party: ${n}/${D.party.max}${urlParty > 1 ? " (test party from the &party flag)" : party.members.length > 1 ? "" : ext.portalParty ? "" : " (solo for now; teammates join once Desks multiplayer is switched on)"}. The room inside scales to your party. Out in the Annex it's always just you.`); pl.dataset.rpg = "party-line"; pn.appendChild(pl);
      if (ext.portalParty) ext.portalParty(pn, p, () => { const k = clamp(Math.max(party.members.length, urlParty || 1), 1, D.party.max); pl.firstChild.textContent = `Party: ${k}/${D.party.max}. The room inside scales to your party. Out in the Annex it's always just you.`; });
      const go = el("button", "o3-btn", "🌀 Step through"); go.dataset.rpg = "portal-go"; go.onclick = () => { host.closePanel(); ext.onPartyGo?.(p); enterInstance(p); }; pn.appendChild(go); }); }
  let wantSoloRun = false;
  function enterInstance(p) { const id = p.pp.instance; const Ienter = D.instances[id]; const prep = ext.prepareEnter?.(id, p);
    if (Ienter?.resetOnEnter && !prep?.keepProgress) resetInstanceProgress(id);
    if (id === "grotto" && grotto) {
      const seed = prep?.seed;
      if (seed != null || ext.partyActive?.() || ext.partyCode?.() || wantSoloRun) { grotto.plan(seed ?? ((Date.now() & 0x7fffffff) || 1), { party: !!(ext.partyActive?.() || ext.partyCode?.()) }); wantSoloRun = false; }
      else grotto.clear();
    }
    resetMinimap(); buildInstance(id); if (id === "grotto") grotto?.afterBuild?.(Ienter); ext.onEnter?.(id, p); inst.id = id; inst.from = { i: p.i, j: p.j, id: p.pp.id, spawn: p.spawn || null }; party.instance = id; audio.sfx("zip");
    return host.threadWarp({ target: null, swap: () => { inst.active = true; if (D.instances[id].training) startTraining(); spawnInstance(id); ext.afterEnter?.(id, p); fightGroup = null; abilityUsed = false; const I0 = D.instances[id], s = I0.size, sp0 = I0.spawn || { x: s / 2, z: s - 2, yaw: 0, y: 0 }; lastP = { x: IX + sp0.x, z: IZ + sp0.z };
      ctx.placeRaw({ x: IX + sp0.x, z: IZ + sp0.z, yaw: sp0.yaw || 0, y: sp0.y || 0 }); const partyRun = id === "grotto" && !!grotto?.current() && !grotto.current().solo; host.toast(D.instances[id].training ? `${D.instances[id].name} · ${D.instances[id].control ? "admin only (nothing here counts)" : "practice mode (nothing here counts)"}` : partyRun ? `${D.instances[id].name} · party of ${Math.max(partySize(), 2)}` : D.instances[id].solo ? `${D.instances[id].name} · solo · level ${(D.instances[id].levelRange || [D.instances[id].level || 1]).join("–")}` : `${D.instances[id].name} · party of ${partySize()}`); addLog(`🌀 Entered ${D.instances[id].name} (${D.instances[id].control ? "admin" : D.instances[id].training ? "practice" : partyRun ? "party of " + Math.max(partySize(), 2) : D.instances[id].solo ? "solo" : "party of " + partySize()})`, "sys"); renderBar(); renderTip(); host.updateActions(); showMinimap(true); revealMap(curZone); drawMinimap(); } }); }
  function leaveInstance(quiet) { if (!inst.active) return; const from = inst.from; const done = () => { if (battle.active()) battle.end("left"); const was = inst.id; if (isTraining()) endTraining(); inst.active = false; ext.onLeave?.(was); party.instance = null; inst.mobs.forEach((m) => m.g.parent?.remove(m.g)); inst.drops.forEach((d) => d.g.parent?.remove(d.g)); inst.mobs = []; inst.drops = []; fightGroup = null; if (D.instances[was]?.resetOnEnter) resetInstanceProgress(was); showMinimap(false); resetMinimap(); if (CH() && !D.instances[was]?.training) rest("full"); };
    if (quiet) { done(); return; } audio.sfx("zip"); host.threadWarp({ swap: () => { done(); place(from.spawn || hubSpawn(from.i, from.j, 0), from.spawn ? TR().backText : "Back in the Annex hallway. Just you again."); renderBar(); renderTip(); host.updateActions(); } }); }
  function bossDown(m) { if (isTraining()) { tipEvent("boss"); if (TR().grantLoot && m.def.loot) dropLoot(null, m, m.def.loot); inst.mobs.forEach((q) => { if (!q.dead) { q.dead = true; q.deadT = 0; } }); host.toast(`The ${m.name} ${m.def.dieText}`); return; }
    if (inst.id === "grotto" && grotto?.current()) { inst.mobs.forEach((q) => { if (!q.dead) { q.dead = true; q.deadT = 0; } }); grotto.onLocalWin("boss"); ext.onRunEvent?.("clear", "boss"); return; }
    S.world.bosses[inst.id] = new Date().toISOString(); progress("boss", inst.id); afterBoss(inst.id); if (m.def.loot) dropLoot(null, m, m.def.loot); inst.mobs.forEach((q) => { if (!q.dead) { q.dead = true; q.deadT = 0; } }); save();
    host.toast(`The ${m.name} ${m.def.dieText}`); }

  // ---------- v5/v5c: The Mildly Perilous Mailroom (solo starter run: 3 fights, rest, 3 fights, rest, boss; real XP + loot; nothing respawns; levels 1–3) ----------
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
    (I.pickups || []).forEach((pk, q) => { const key = `run:${id}:p${q}`; if (S.world.loot[key] || !item(pk.item) || (item(pk.item).unique && ownsItem(pk.item))) return; const sg = R0.seg(pk.step), x = R0.x0 + 1 + ((q * 1.7) % (R0.W - 2)), z = sg.z0 + 1.2;
      const g = new THREE.Group(); g.position.set(x, 0, z); inst.g.add(g); const it = item(pk.item); const b = new THREE.Mesh(G("loot", () => new THREE.OctahedronGeometry(0.16, 0)), sm(it.slot === "use" ? "#7fc8a0" : "#a8c8e8", { emissive: "#fff2a8", emissiveIntensity: 0.35 })); b.position.y = 0.4; g.add(b);
      inst.drops.push({ g, b, id: pk.item, lx: IX + x, lz: IZ + z, taken: false, key }); }); }
  function runStepCheck(k) { const I = D.instances[inst.id]; if (inst.id === "grotto" && grotto?.current() && inst.mobs.some((q) => q.runBeat === "golem")) { if (inst.mobs.some((q) => q.runBeat === "golem" && !q.dead)) return; grotto.onLocalWin("golem"); ext.onRunEvent?.("clear", "golem"); return; } if (!I?.steps) return; if (inst.mobs.some((q) => q.run === k && !q.dead)) return; S.world.mobs[runKey(k)] = new Date().toISOString(); save(); ext.onRunEvent?.("clear", k);
    const left = I.steps.filter((st, q) => st.type === "fight" && !S.world.mobs[runKey(q)]).length; setTimeout(() => host.toast(`✅ ${I.steps[k].name.split(" · ")[0]} cleared${left ? ` · ${left} fight${left > 1 ? "s" : ""} to go` : " · only the boss is left"}`), 500); }
  function runRest(I) { const c = CH(); if (!c) return; rest("breather"); audio.sfx("pick"); host.toast(I.rest.text); addLog("🛋 A breather: HP full, per-breather abilities back (big ones wait for a Full Rest).", "heal"); }
  function breather(text) { if (!transformed || !CH()) return false; rest("breather"); audio.sfx("pick"); addLog("🪑 A breather in a stable place: HP full, per-breather abilities back.", "heal"); if (text) host.toast(text); return true; }
  function runProgress(id = "starter") { const I = D?.instances[id]; if (!I?.steps) return null; const key = (k) => `run:${id}:${k}`; const fights = I.steps.map((st, k) => [st, k]).filter(([st]) => st.type === "fight");
    return { fights: fights.length, cleared: fights.filter(([, k]) => S.world.mobs[key(k)]).length, boss: !!S.world.bosses[id], rests: I.steps.filter((st) => st.type === "rest").length, pickups: (I.pickups || []).length, taken: (I.pickups || []).filter((_, q) => S.world.loot[`run:${id}:p${q}`]).length }; }
  function afterBoss(id) { const I = D.instances[id];
    if (I.layout === "run" || I.layout === "cave") setTimeout(() => host.toast(I.cleared), 1800);
    if (I.gate) { const gt = (D.gates || []).find((q) => q.instance === id); const c = CH(); if (gt && c) { c.waystones ||= {}; if (!c.waystones[gt.waystone.id]) { c.waystones[gt.waystone.id] = { at: new Date().toISOString(), gate: gt.id }; save(); setTimeout(() => host.toast(`✨ ${gt.waystone.name} is awake! Travel there from the waystone board or your Home crystal.`), 1800); addLog(`✨ Waystone woken: ${gt.waystone.name}`, "lvl"); } } } }
  // ---------- v5d: The Gently Declining Grotto (stage 1 cave crawl) + instance resets + minimap ----------
  function hash01(n) { let x = (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0; return (x >>> 0) / 4294967296; }
  function caveRooms(I) { return I.cave?.rooms || []; }
  function caveRoom(I, id) { return caveRooms(I).find((r) => r.id === id); }
  function caveZone(r) { return r.step != null ? `annex:inst:run:${r.step}` : `annex:inst:cave:${r.id}`; }
  function caveWalk(r) {
    const pad = 0.14 + R;
    const rec = { x0: AX + IX + r.x - r.w / 2 + pad, x1: AX + IX + r.x + r.w / 2 - pad, z0: AZ + IZ + r.z - r.d / 2 + pad, z1: AZ + IZ + r.z + r.d / 2 - pad, room: caveZone(r), y: r.y || 0 };
    if (r.y1 != null && r.y1 !== (r.y || 0)) { rec.slope = r.slope || "z"; rec.y = r.slopeDir === -1 ? r.y1 : r.y; rec.y1 = r.slopeDir === -1 ? r.y : r.y1; }
    return rec;
  }
  function caveDoorWalk(r, side, g0, g1) {
    const pad = 0.14 + R, deep = pad + 0.45, ns = (side === "n" || side === "s");
    const at = side === "n" ? r.z - r.d / 2 : side === "s" ? r.z + r.d / 2 : side === "w" ? r.x - r.w / 2 : r.x + r.w / 2;
    const rec = { room: caveZone(r), y: yOnRoom(r, ns ? at : r.z) };
    if (ns) { rec.x0 = AX + IX + g0 + 0.08; rec.x1 = AX + IX + g1 - 0.08; rec.z0 = AZ + IZ + at - deep; rec.z1 = AZ + IZ + at + deep; }
    else { rec.z0 = AZ + IZ + g0 + 0.08; rec.z1 = AZ + IZ + g1 - 0.08; rec.x0 = AX + IX + at - deep; rec.x1 = AX + IX + at + deep; }
    if (r.y1 != null && r.y1 !== (r.y || 0) && ns) { rec.slope = r.slope || "z"; rec.y = yOnRoom(r, at - deep); rec.y1 = yOnRoom(r, at + deep); }
    return rec;
  }
  function yOnRoom(r, z) {
    const y0 = r.y || 0;
    if (r.y1 == null || r.y1 === y0) return y0;
    const yS = r.slopeDir === -1 ? y0 : r.y1, yN = r.slopeDir === -1 ? r.y1 : y0;
    const z0 = r.z - r.d / 2, t = Math.max(0, Math.min(1, (z - z0) / Math.max(0.01, r.d)));
    return yN + (yS - yN) * t;
  }
  function addRampSlab(g, r, mat, yOff, thick, widthExtra, lenExtra, geo) {
    const yS = r.slopeDir === -1 ? (r.y || 0) : r.y1, yN = r.slopeDir === -1 ? r.y1 : (r.y || 0);
    const L = r.d + (lenExtra || 0), dy = yN - yS, ang = Math.atan2(dy, r.d), len = Math.hypot(L, dy * (L / r.d));
    const fl = (() => { if (!geo) return box(r.x, (yS + yN) / 2 + (yOff || 0), r.z, r.w + (widthExtra || 0), thick || 0.16, len, mat, g);
      const m = new THREE.Mesh(geo, mat); m.position.set(r.x, (yS + yN) / 2 + (yOff || 0), r.z); m.scale.set(r.w + (widthExtra || 0), thick || 0.16, len); g.add(m); return m; })();
    fl.rotation.x = ang; return fl;
  }
  function addRampFloor(g, r, mat) { return addRampSlab(g, r, mat, 0, 0.16, 0, 0); }

  // Per-instance visualStyle: "textured-rock" (Grotto) vs default flat. Only walls + ceiling rock are textured.
  function drawRockTex(c, w, h, seed) {
    const img = c.createImageData(w, h), d = img.data;
    const hash = (ix, iy) => {
      let n = Math.imul(((ix % w) + w) % w + seed * 17, 374761393) ^ Math.imul(((iy % h) + h) % h + seed * 31, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const smth = (tt) => tt * tt * (3 - 2 * tt);
    const vnoise = (x, y, freq) => {
      const fx = (x / w) * freq, fy = (y / h) * freq, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smth(fx - x0), ty = smth(fy - y0);
      const g = (ix, iy) => hash(((ix % freq) + freq) % freq * (w / freq), ((iy % freq) + freq) % freq * (h / freq));
      const a = g(x0, y0), b = g(x0 + 1, y0), cc = g(x0, y0 + 1), dd = g(x0 + 1, y0 + 1);
      return a + (b - a) * tx + (cc - a) * ty + (a - b - cc + dd) * tx * ty;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = vnoise(x, y, 8) * 0.5 + vnoise(x, y, 16) * 0.28 + vnoise(x, y, 32) * 0.15 + vnoise(x, y, 64) * 0.07;
      const ridge = 1 - Math.abs(vnoise(x, y, 6) * 2 - 1);
      const crevice = ridge > 0.84 ? (ridge - 0.84) / 0.16 : 0;
      let v = 0.42 + n * 0.38 - crevice * 0.3 + (hash(x, y) - 0.5) * 0.06;
      v = Math.max(0.16, Math.min(0.84, v));
      const i = (y * w + x) * 4;
      d[i] = v * 212; d[i + 1] = v * 192; d[i + 2] = v * 168; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    c.strokeStyle = "rgba(28, 20, 14, 0.5)"; c.lineWidth = 1.25; c.lineJoin = "round";
    for (let k = 0; k < 8; k++) {
      let x = hash(k * 19, seed * 7) * w, y = hash(k * 23, seed * 11) * h, ox = x, oy = y;
      c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 14; s++) {
        const a = (hash(k * 29 + s, seed) - 0.5) * 1.4 + k * 0.7;
        x += Math.cos(a) * 11; y += Math.sin(a) * 11;
        if (Math.abs(x - ox) > w * 0.45 || Math.abs(y - oy) > h * 0.45) break;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  function rockTex(key, seed) {
    return M("tex:rock:" + key, () => {
      const t = canvasTex(256, 256, (c, w, h) => drawRockTex(c, w, h, seed));
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
    });
  }
  function rockBoxGeo() {
    return G("g:rockBoxVC", () => {
      const geo = new THREE.BoxGeometry(1, 1, 1), pos = geo.attributes.position, col = [];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const edge = Math.max(Math.abs(x), Math.abs(z));
        const s = 0.74 + y * 0.14 - edge * 0.16;
        col.push(s, s * 0.98, s * 0.94);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); return geo;
    });
  }
  function rockLumpGeo() {
    return G("g:rockLumpVC", () => {
      const geo = new THREE.IcosahedronGeometry(0.32, 0); geo.computeVertexNormals();
      const n = geo.attributes.normal, col = [];
      for (let i = 0; i < n.count; i++) {
        const s = 0.7 + n.getY(i) * 0.22 + n.getX(i) * 0.08;
        col.push(s, s * 0.97, s * 0.93);
      }
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); return geo;
    });
  }
  function rockVariants(tex, base, prefix, n, extra) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(M("mat:rock:" + prefix + ":" + i, () => {
        const map = tex.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping;
        const a = hash01(i * 3 + 1 + prefix.length), b = hash01(i * 7 + 2 + prefix.length);
        map.repeat.set(0.8 + a * 1.6, 0.8 + b * 1.6); map.offset.set(hash01(i * 11), hash01(i * 13));
        map.center.set(0.5, 0.5); map.rotation = hash01(i * 17) * Math.PI * 2; map.needsUpdate = true;
        const col = new THREE.Color(base);
        col.offsetHSL((hash01(i * 23) - 0.5) * 0.045, (hash01(i * 29) - 0.5) * 0.08, (hash01(i * 31) - 0.5) * 0.07);
        col.multiplyScalar(0.9 + hash01(i * 19) * 0.22);
        return new THREE.MeshStandardMaterial({ map, color: col, roughness: 0.96, metalness: 0, vertexColors: true, ...(extra || {}) });
      }));
    }
    return out;
  }

  function buildCave(id, I) {
    const rooms = caveRooms(I), pal = I.palette, g = new THREE.Group(); g.position.set(IX, 0, IZ); root.add(g); inst.g = g; inst.extras = []; inst.blockers = [];
    const textured = (I.visualStyle || I.cave?.visualStyle) === "textured-rock";
    const wm = sm(pal.wall, { roughness: 1 }), fm = sm(pal.floor, { roughness: 1 }), cm = sm(pal.ceil, { roughness: 1, emissive: pal.ceil, emissiveIntensity: 0.28 });
    const rk = sm(pal.rock || pal.wall, { roughness: 1 }), rk2 = sm("#5a4e42", { roughness: 1 });
    const wallVars = textured ? rockVariants(rockTex("wall", 11), pal.wall, "w", 8) : null;
    const rockVars = textured ? rockVariants(rockTex("wall", 11), pal.rock || pal.wall, "r", 8) : null;
    const ceilVars = textured ? rockVariants(rockTex("ceil", 29), pal.ceil, "c", 8, { emissive: pal.ceil, emissiveIntensity: 0.26 }) : null;
    const rockBox = textured ? rockBoxGeo() : null, lumpGeo = textured ? rockLumpGeo() : null;
    const pick = (arr, seed) => arr[((seed * 1000) | 0) % arr.length];
    const addBlk = (cx, cz, sx, sz, padX, padZ) => { const hx = Math.abs(sx) / 2 + (padX ?? R), hz = Math.abs(sz) / 2 + (padZ ?? R); inst.blockers.push({ x0: IX + cx - hx, x1: IX + cx + hx, z0: IZ + cz - hz, z1: IZ + cz + hz }); };
    const blkSpin = (cx, cz, sx, sz, yaw) => {
      const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), xs = [], zs = [];
      [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [-sx / 2, sz / 2], [sx / 2, sz / 2]].forEach(([dx, dz]) => { xs.push(cx + dx * c - dz * s); zs.push(cz + dx * s + dz * c); });
      inst.blockers.push({ x0: IX + Math.min(...xs) - R, x1: IX + Math.max(...xs) + R, z0: IZ + Math.min(...zs) - R, z1: IZ + Math.max(...zs) + R });
    };
    const ceilMat = (seed) => (textured ? pick(ceilVars, seed) : cm);
    const wallMat = (seed) => (textured ? pick(wallVars, seed) : wm);
    const crystal = sm("#c9a45a", { emissive: "#e0b25a", emissiveIntensity: 0.7 });
    const lamp = sm("#ffe3a8", { emissive: "#ffb45a", emissiveIntensity: 1.35 });
    const wood = sm("#6a4a28", { roughness: 0.92 }), woodD = sm("#4a3218", { roughness: 0.95 });
    const iron = sm("#3a3a3e", { metalness: 0.55, roughness: 0.45 }), rust = sm("#4a3020", { roughness: 0.85, metalness: 0.3 });
    const glow = sm("#ff7a28", { emissive: "#ff6a18", emissiveIntensity: 1.4 });
    const pool = new THREE.MeshBasicMaterial({ color: 0xffc878, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
    const H0 = I.cave.height || 2.85;
    const lump = (x, y, z, sx, sy, sz, seed, mat, collide) => {
      const rock = new THREE.Mesh(textured ? lumpGeo : G("crock", () => new THREE.IcosahedronGeometry(0.32, 0)), textured ? pick(rockVars, seed) : (mat || rk));
      rock.position.set(x, y, z); rock.scale.set(sx, sy, sz); rock.rotation.set(seed, seed * 1.7, seed * 0.6); g.add(rock);
      if (collide) addBlk(x, z, sx * 0.42, sz * 0.42);
    };
    const hangLamp = (x, yCeil, z, yFloor) => {
      box(x, yCeil - 0.16, z, 0.03, 0.28, 0.03, woodD, g);
      const lan = new THREE.Mesh(G("clantern", () => new THREE.CylinderGeometry(0.08, 0.1, 0.18, 8)), lamp);
      lan.position.set(x, yCeil - 0.42, z); g.add(lan);
      const pl = new THREE.Mesh(G("clpool", () => new THREE.CircleGeometry(1.2, 10)), pool);
      pl.rotation.x = -Math.PI / 2; pl.position.set(x, yFloor + 0.04, z); g.add(pl);
    };
    const addBeamAt = (r, z, roomH) => {
      const yf = yOnRoom(r, z), yc = yf + roomH, hw = r.w / 2 - 0.22;
      box(r.x - hw, yf + roomH * 0.48, z, 0.18, roomH * 0.96, 0.18, wood, g);
      box(r.x + hw, yf + roomH * 0.48, z, 0.18, roomH * 0.96, 0.18, wood, g);
      box(r.x, yc - 0.1, z, r.w - 0.28, 0.18, 0.2, wood, g);
      hangLamp(r.x, yc - 0.12, z, yf);
    };
    rooms.forEach((r, ri) => {
      const y0 = r.y || 0, yLo = r.y1 != null ? Math.min(y0, r.y1) : y0, yHi = r.y1 != null ? Math.max(y0, r.y1) : y0;
      const roomH = r.height || H0, sloped = r.y1 != null && r.y1 !== y0;
      if (sloped) {
        addRampSlab(g, r, fm, 0, 0.16, 0.15, 0.2);
        addRampSlab(g, r, ceilMat(ri + 3), roomH + 0.18, 0.5, 0.35, 0.35, rockBox);
      } else {
        box(r.x, y0 - 0.06, r.z, r.w + 0.2, 0.16, r.d + 0.2, fm, g);
        if (textured) { const cmesh = new THREE.Mesh(rockBox, ceilMat(ri + 5)); cmesh.position.set(r.x, y0 + roomH + 0.2, r.z); cmesh.scale.set(r.w + 0.45, 0.5, r.d + 0.45); g.add(cmesh); }
        else box(r.x, y0 + roomH + 0.2, r.z, r.w + 0.45, 0.5, r.d + 0.45, cm, g);
      }
      const wallH = roomH + (yHi - yLo) + 0.5, wallY = yLo + wallH / 2;
      const rb = { x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 };
      const overlapAmt = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
      const neighborOn = (side) => rooms.find((o) => { if (o.id === r.id) return false; const ob = { x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2 };
        if (side === "n") return Math.abs(rb.z0 - ob.z1) < 1.2 && overlapAmt(rb.x0, rb.x1, ob.x0, ob.x1) > 1.4;
        if (side === "s") return Math.abs(rb.z1 - ob.z0) < 1.2 && overlapAmt(rb.x0, rb.x1, ob.x0, ob.x1) > 1.4;
        if (side === "w") return Math.abs(rb.x0 - ob.x1) < 1.2 && overlapAmt(rb.z0, rb.z1, ob.z0, ob.z1) > 1.4;
        if (side === "e") return Math.abs(rb.x1 - ob.x0) < 1.2 && overlapAmt(rb.z0, rb.z1, ob.z0, ob.z1) > 1.4; return false; });
      const openOn = (side) => !!neighborOn(side);
      const gapRange = (side, lo, hi) => {
        const o = neighborOn(side); if (!o) return null;
        const o0 = (side === "n" || side === "s") ? o.x - o.w / 2 : o.z - o.d / 2;
        const o1 = (side === "n" || side === "s") ? o.x + o.w / 2 : o.z + o.d / 2;
        const a0 = Math.max(lo, o0), a1 = Math.min(hi, o1), mid = (a0 + a1) / 2;
        const half = Math.max(1.15, Math.min(2.15, (a1 - a0) / 2));
        return [Math.max(lo + 0.15, mid - half), Math.min(hi - 0.15, mid + half)];
      };
      const wallMesh = (cx, cy, cz, sx, sy, sz, seed, collide) => {
        if (collide) { if (Math.abs(sx) >= Math.abs(sz)) addBlk(cx, cz, sx, sz, 0.04, R); else addBlk(cx, cz, sx, sz, R, 0.04); }
        if (!textured) return box(cx, cy, cz, sx, sy, sz, wm, g);
        const m = new THREE.Mesh(rockBox, wallMat(seed)); m.position.set(cx, cy, cz); m.scale.set(sx, sy, sz); g.add(m); return m;
      };
      const wallSeg = (cx, cy, cz, sx, sy, sz) => wallMesh(cx, cy, cz, sx, sy, sz, hash01(ri * 13 + cx * 3 + cz * 7 + sx), true);
      const gapWall = (axis, c, lo, hi, at, side) => { const gr = gapRange(side, lo, hi); if (!gr) { if (axis === "z") wallSeg(c, wallY, at, hi - lo, wallH, 0.28); else wallSeg(at, wallY, c, 0.28, wallH, hi - lo); return; }
        const [g0, g1] = gr; if (axis === "z") { wallSeg((lo + g0) / 2, wallY, at, Math.max(0.2, g0 - lo), wallH, 0.28); wallSeg((g1 + hi) / 2, wallY, at, Math.max(0.2, hi - g1), wallH, 0.28); }
        else { wallSeg(at, wallY, (lo + g0) / 2, 0.28, wallH, Math.max(0.2, g0 - lo)); wallSeg(at, wallY, (g1 + hi) / 2, 0.28, wallH, Math.max(0.2, hi - g1)); } };
      gapWall("x", r.z, rb.z0, rb.z1, rb.x0, "w"); gapWall("x", r.z, rb.z0, rb.z1, rb.x1, "e");
      gapWall("z", r.x, rb.x0, rb.x1, rb.z0, "n"); gapWall("z", r.x, rb.x0, rb.x1, rb.z1, "s");
      if (roomH > H0 + 0.3) {
        const lh = roomH - H0, ly = y0 + H0 + lh / 2;
        [["n", rb.z0], ["s", rb.z1]].forEach(([side, at]) => { if (openOn(side)) wallMesh(r.x, ly, at, r.w, lh, 0.42, hash01(ri + at), false); });
        [["w", rb.x0], ["e", rb.x1]].forEach(([side, at]) => { if (openOn(side)) wallMesh(at, ly, r.z, 0.42, lh, r.d, hash01(ri + at + 4), false); });
      }
      // irregular lumpy walls (skip doorway gaps)
      const inGap = (side, t) => {
        const lo = (side === "w" || side === "e") ? rb.z0 : rb.x0, hi = (side === "w" || side === "e") ? rb.z1 : rb.x1;
        const gr = gapRange(side, lo, hi); if (!gr) return false;
        const pos = lo + t * (hi - lo);
        return pos >= gr[0] - 0.4 && pos <= gr[1] + 0.4;
      };
      const wallN = Math.max(4, Math.round((r.type === "slope" ? r.d : Math.max(r.w, r.d)) / 1.35));
      for (let k = 0; k < wallN; k++) {
        const t = (k + 0.35 + hash01(ri * 19 + k) * 0.4) / wallN, u = hash01(ri * 7 + k * 5);
        const sides = [["w", rb.x0 + 0.22, rb.z0 + t * r.d], ["e", rb.x1 - 0.22, rb.z0 + t * r.d]];
        sides.forEach(([side, x, z], si) => {
          if (inGap(side, t)) return;
          const yf = yOnRoom(r, z);
          lump(x, yf + 0.35 + u * (roomH * 0.45), z, 0.7 + u * 0.9, 0.55 + hash01(k + si) * 1.1, 0.65 + u * 0.6, u, si ? rk2 : rk, true);
        });
      }
      for (let k = 0; k < wallN; k++) {
        const t = (k + 0.3 + hash01(ri * 11 + k * 3) * 0.45) / wallN, u = hash01(ri * 3 + k * 9);
        const sides = [["n", rb.x0 + t * r.w, rb.z0 + 0.22], ["s", rb.x0 + t * r.w, rb.z1 - 0.22]];
        sides.forEach(([side, x, z], si) => {
          if (inGap(side, t)) return;
          const yf = yOnRoom(r, z);
          lump(x, yf + 0.4 + u * (roomH * 0.4), z, 0.65 + u * 0.8, 0.5 + hash01(k * 2 + si) * 1.0, 0.6 + u * 0.55, u, rk, true);
        });
      }
      // lumpy rock ceiling (fills the void when you look up or down a ramp)
      const cN = r.type === "boss" ? 16 : r.type === "slope" ? 7 : 9;
      for (let k = 0; k < cN; k++) {
        const u = hash01(ri * 17 + k * 3 + 9), v = hash01(ri * 13 + k * 7 + 2);
        const x = rb.x0 + 0.45 + u * (r.w - 0.9), z = rb.z0 + 0.45 + v * (r.d - 0.9);
        const yf = yOnRoom(r, z), yc = yf + roomH;
        lump(x, yc - 0.15 - hash01(k + ri) * 0.35, z, 0.9 + u * 1.1, 0.45 + v * 0.5, 0.85 + hash01(k * 11) * 0.9, u, rk);
        if (k % 3 === 0) {
          const st = new THREE.Mesh(G("cstalac", () => new THREE.ConeGeometry(0.1, 0.4, 5)), textured ? pick(rockVars, u + 0.3) : rk);
          st.position.set(x + 0.15, yc - 0.28, z - 0.1); st.rotation.x = Math.PI; st.scale.set(0.8 + u, 1 + v, 0.8 + u); g.add(st);
        }
      }
      // support beams + hanging lanterns along tunnels
      if (r.type !== "pocket") {
        const nBeams = r.type === "boss" ? 3 : r.type === "lobby" ? 0 : Math.max(1, Math.round(r.d / 4.2));
        for (let b = 0; b < nBeams; b++) {
          let z;
          if (r.type === "slope") {
            const highZ = r.slopeDir === -1 ? rb.z1 : rb.z0, lowZ = r.slopeDir === -1 ? rb.z0 : rb.z1;
            z = highZ + (lowZ - highZ) * (0.38 + 0.5 * ((b + 0.15) / nBeams));
          } else if (r.type === "boss") {
            z = rb.z0 + (b + 0.8) * (r.d / (nBeams + 1.2));
          } else {
            z = rb.z0 + (b + 0.55) * (r.d / (nBeams + 0.2));
          }
          addBeamAt(r, z, roomH);
        }
        if (r.type !== "slope" && nBeams === 0) hangLamp(r.x, y0 + roomH, r.z, y0);
      } else {
        hangLamp(r.x, y0 + roomH, r.z, y0);
      }
      if (r.type === "fight" || r.type === "boss") {
        const cr = new THREE.Mesh(G("ccrys", () => new THREE.OctahedronGeometry(0.16, 0)), crystal);
        cr.position.set(r.x - r.w * 0.28, y0 + 0.35, r.z + r.d * 0.28); cr.rotation.z = 0.3; g.add(cr);
      }
      if (r.type === "rest") {
        const soft = new THREE.Mesh(G("softrock", () => new THREE.SphereGeometry(0.7, 12, 8)), sm("#8a7a62", { roughness: 1 }));
        soft.scale.set(1.35, 0.45, 1.05); soft.position.set(r.x - 1.1, y0 + 0.28, r.z); g.add(soft);
        addBlk(r.x - 1.1, r.z, 1.7, 1.4);
        inst.extras.push({ key: "rest-" + r.id, lx: IX + r.x - 1.1, lz: IZ + r.z, ly: y0, label: () => I.rest.label, run: () => runRest(I) });
      }
      if (r.id === "pocket-dead") {
        cplane(M("t:deadend", () => plate("THIS IS A DEAD END", "(we checked)", { w: 720, h: 220, bg: "#3a3228", fg: "#f3e7c8", accent: "#e0b25a" })), 1.4, 0.44, r.x - 0.1, y0 + 1.5, r.z - r.d / 2 + 0.16, 0, g);
      }
      if (r.type === "lobby") {
        cplane(M("t:cave:lob:" + id, () => plate(I.door.sign, I.door.signSub, { w: 900, h: 240, bg: "#3a3228", fg: "#f3e7c8", accent: "#e0b25a" })), 2.4, 0.64, r.x, y0 + 2.05, r.z + r.d / 2 - 0.22, Math.PI, g);
      }
      if (r.type === "boss") {
        cplane(M("t:cave:boss:" + id, () => plate("THE COLLECTION CHAMBER", "please mind the pile", { w: 900, h: 220, bg: "#4a3a28", fg: "#fbf3d0", accent: "#e0b25a" })), 2.6, 0.64, r.x, y0 + 2.15, r.z - r.d / 2 + 0.16, 0, g);
        [[-4.6, 0.55, -4.2], [5.0, 0.5, -3.6], [-3.8, 0.7, 4.4], [4.4, 0.45, 3.8], [0.4, 0.9, -5.6], [-5.2, 0.6, 1.2], [5.4, 0.55, -0.8]].forEach(([dx, dy, dz], i) => {
          const c2 = new THREE.Mesh(G("ccrys", () => new THREE.OctahedronGeometry(0.16, 0)), crystal);
          c2.position.set(r.x + dx, y0 + dy, r.z + dz); c2.scale.setScalar(1.2 + (i % 3) * 0.3); c2.rotation.z = i * 0.4; g.add(c2);
        });
        [[-3.2, -2.2], [2.8, -3.4], [-1.4, 2.6], [3.6, 1.8], [0.2, -0.4], [-4.4, 0.6]].forEach(([dx, dz], i) => {
          lump(r.x + dx, y0 + roomH - 0.45 - (i % 3) * 0.2, r.z + dz, 1.6 + i * 0.15, 0.7, 1.5, 0.2 * i, rk);
        });
      }
    });
    // mine-cart rails along the main descent (skip pockets)
    const main = rooms.filter((r) => r.type !== "pocket" && r.type !== "boss");
    main.forEach((r) => {
      const gauge = 0.7;
      const addRail = (xOff) => {
        if (r.y1 != null && r.y1 !== (r.y || 0)) addRampSlab(g, r, rust, 0.07, 0.06, -r.w + 0.08, 0.1).position.x = r.x + xOff;
        else box(r.x + xOff, (r.y || 0) + 0.06, r.z, 0.08, 0.05, r.d - 0.3, rust, g);
      };
      addRail(-gauge / 2); addRail(gauge / 2);
      const ties = Math.max(3, Math.round(r.d / 1.15));
      for (let i = 0; i < ties; i++) {
        const z = r.z - r.d / 2 + 0.4 + i * ((r.d - 0.8) / ties);
        const yf = yOnRoom(r, z);
        const tie = box(r.x, yf + 0.03, z, 0.95, 0.05, 0.12, woodD, g);
        if (r.y1 != null && r.y1 !== (r.y || 0)) {
          const yS = r.slopeDir === -1 ? (r.y || 0) : r.y1, yN = r.slopeDir === -1 ? r.y1 : (r.y || 0);
          tie.rotation.x = Math.atan2(yN - yS, r.d);
        }
      }
    });
    // parked cart just inside the mouth, off the rails
    const foyer = caveRoom(I, "foyer") || rooms[0];
    (function addCart(x, y, z, yaw) {
      const cart = new THREE.Group(); cart.position.set(x, y, z); cart.rotation.y = yaw; g.add(cart);
      box(0, 0.32, 0, 0.82, 0.1, 1.15, wood, cart);
      box(0, 0.52, -0.54, 0.82, 0.42, 0.08, wood, cart);
      box(0, 0.52, 0.54, 0.82, 0.42, 0.08, wood, cart);
      box(-0.39, 0.52, 0, 0.08, 0.42, 1.1, wood, cart);
      box(0.39, 0.52, 0, 0.08, 0.42, 1.1, wood, cart);
      [[-0.42, -0.38], [0.42, -0.38], [-0.42, 0.38], [0.42, 0.38]].forEach(([wx, wz]) => {
        const wh = new THREE.Mesh(G("cwheel", () => new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10)), iron);
        wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.14, wz); cart.add(wh);
      });
    })(foyer.x + 2.15, foyer.y || 0, foyer.z + 0.4, 0.18);
    blkSpin(foyer.x + 2.15, foyer.z + 0.4, 0.9, 1.2, 0.18);
    // timber frame at the mouth
    (function addMouth() {
      const y0 = foyer.y || 0, z = foyer.z + foyer.d / 2 - 0.2, hw = 1.5;
      box(foyer.x - hw, y0 + 1.5, z, 0.28, 3.0, 0.28, wood, g);
      box(foyer.x + hw, y0 + 1.5, z, 0.28, 3.0, 0.28, wood, g);
      addBlk(foyer.x - hw, z, 0.28, 0.28); addBlk(foyer.x + hw, z, 0.28, 0.28);
      box(foyer.x, y0 + 2.95, z, 3.3, 0.28, 0.32, wood, g);
      box(foyer.x - 1.15, y0 + 2.15, z, 0.12, 1.5, 0.12, wood, g).rotation.z = 0.55;
      box(foyer.x + 1.15, y0 + 2.15, z, 0.12, 1.5, 0.12, wood, g).rotation.z = -0.55;
      box(foyer.x - hw, y0 + 0.08, z, 0.5, 0.16, 0.5, woodD, g);
      box(foyer.x + hw, y0 + 0.08, z, 0.5, 0.16, 0.5, woodD, g);
    })();
    // v6: the Survey Corps outpost at the Grotto entrance (field table, logbook, lantern, tarp, sign)
    (function addOutpost() {
      const y = foyer.y || 0, x = foyer.x - 3.3, z = foyer.z + 1.2, OP = I.outpost || {};
      box(x, y + 0.74, z, 1.3, 0.06, 0.7, wood, g); [[-0.58, -0.28], [0.58, -0.28], [-0.58, 0.28], [0.58, 0.28]].forEach(([a, b]) => box(x + a, y + 0.37, z + b, 0.06, 0.74, 0.06, woodD, g));
      box(x - 0.2, y + 0.79, z, 0.42, 0.04, 0.3, sm("#efe6cf"), g); box(x - 0.2, y + 0.8, z, 0.02, 0.045, 0.3, sm("#7a2a1e"), g);
      const lan = new THREE.Mesh(G("clantern", () => new THREE.CylinderGeometry(0.08, 0.1, 0.18, 8)), lamp); lan.position.set(x + 0.42, y + 0.87, z - 0.1); g.add(lan);
      const tarp = box(x, y + 2.25, z, 1.9, 0.04, 1.3, sm("#5a6a3a", { roughness: 1 }), g); tarp.rotation.x = 0.12;
      box(x - 0.9, y + 1.12, z - 0.6, 0.06, 2.25, 0.06, woodD, g); box(x + 0.9, y + 1.12, z - 0.6, 0.06, 2.25, 0.06, woodD, g);
      cplane(M("t:opsign", () => plate(OP.sign || "SURVEY CORPS", OP.signSub || "Mine Mouth outpost · sign the log", { w: 720, h: 220, bg: "#2e3a2a", fg: "#f3efd8", accent: "#c9b46a" })), 1.1, 0.34, x, y + 1.75, z - 0.58, 0, g, { side: THREE.DoubleSide });
      addBlk(x, z, 1.35, 0.75);
      inst.extras.push({ key: "outpost-log", lx: IX + x, lz: IZ + z, ly: y, label: () => OP.prompt || "📒 Read the outpost log", run: () => host.openPanel(OP.title || "📒 The Mine Mouth log", (pn) => { pn.dataset.annexPanel = "outpost"; const k = OP.keeper || {}; if (k.name) pn.appendChild(el("p", "o3-small", `${k.name}${k.who ? " · " + k.who : ""}${k.role ? " · " + k.role : ""}`)); pn.appendChild(el("p", null, OP.text || "Lightly staffed.")); }) });
    })();
    // mid-way foundry / workshop in the gallery
    const gal = caveRoom(I, "gallery");
    if (gal) (function addFoundry() {
      const y = gal.y || 0, x = gal.x - 2.15, z = gal.z - 0.6;
      box(x, y + 0.7, z, 1.2, 1.4, 1.0, rk2, g);
      addBlk(x, z, 1.25, 1.05); addBlk(x + 0.28, z - 0.1, 0.35, 0.35);
      box(x, y + 0.55, z + 0.52, 0.55, 0.55, 0.1, glow, g);
      box(x + 0.28, y + 1.7, z - 0.1, 0.3, 0.7, 0.3, rk2, g);
      const ember = new THREE.Mesh(G("clantern", () => new THREE.CylinderGeometry(0.08, 0.1, 0.18, 8)), lamp);
      ember.position.set(x, y + 0.55, z + 0.58); ember.scale.set(1.3, 0.7, 0.6); g.add(ember);
      const pl = new THREE.Mesh(G("clpool", () => new THREE.CircleGeometry(1.2, 10)), pool);
      pl.rotation.x = -Math.PI / 2; pl.position.set(x, y + 0.05, z + 0.4); pl.scale.set(1.3, 1.3, 1); g.add(pl);
      box(x + 1.5, y + 0.18, z + 0.3, 0.38, 0.36, 0.38, iron, g);
      box(x + 1.5, y + 0.44, z + 0.3, 0.78, 0.16, 0.3, iron, g);
      addBlk(x + 1.5, z + 0.3, 0.86, 0.42);
      box(x + 1.95, y + 0.44, z + 0.3, 0.28, 0.12, 0.18, iron, g);
      [[1.8, 1.8], [2.5, 0.7], [0.6, 2.2]].forEach(([dx, dz], i) => {
        box(x + dx, y + 0.28, z + dz, 0.55 + i * 0.08, 0.5, 0.45, wood, g);
        box(x + dx, y + 0.55, z + dz, 0.57 + i * 0.08, 0.05, 0.47, woodD, g);
        addBlk(x + dx, z + dz, 0.62 + i * 0.08, 0.52);
      });
      box(gal.x + 3.6, y + 0.28, gal.z + 1.4, 0.7, 0.55, 0.5, wood, g);
      box(gal.x + 4.3, y + 0.22, gal.z + 0.5, 0.5, 0.42, 0.45, woodD, g);
      addBlk(gal.x + 3.6, gal.z + 1.4, 0.75, 0.55); addBlk(gal.x + 4.3, gal.z + 0.5, 0.55, 0.5);
    })();
    // Collection Chamber set piece: a fully furnished lost-and-found office, somehow down here
    const bossR = caveRoom(I, "boss") || rooms[rooms.length - 1];
    (function addLostFound() {
      const y = bossR.y || 0, x = bossR.x + 2.6, z = bossR.z + 3.1, desk = new THREE.Group();
      desk.position.set(x, y, z); desk.rotation.y = -0.95; g.add(desk);
      blkSpin(x, z, 1.8, 1.7, -0.95);
      box(0, 0.78, 0, 1.7, 0.08, 0.85, wood, desk);
      box(-0.75, 0.38, 0.35, 0.1, 0.76, 0.1, wood, desk);
      box(0.75, 0.38, 0.35, 0.1, 0.76, 0.1, wood, desk);
      box(-0.75, 0.38, -0.35, 0.1, 0.76, 0.1, wood, desk);
      box(0.75, 0.38, -0.35, 0.1, 0.76, 0.1, wood, desk);
      box(0, 0.4, -0.3, 1.5, 0.06, 0.5, woodD, desk);
      box(-0.35, 0.28, -0.3, 0.55, 0.4, 0.45, wood, desk);
      const chair = new THREE.Group(); chair.position.set(0, 0, 0.85); desk.add(chair);
      box(0, 0.46, 0, 0.5, 0.08, 0.5, woodD, chair);
      box(0, 0.85, -0.22, 0.5, 0.7, 0.08, woodD, chair);
      box(-0.2, 0.22, -0.18, 0.08, 0.44, 0.08, wood, chair);
      box(0.2, 0.22, -0.18, 0.08, 0.44, 0.08, wood, chair);
      box(-0.2, 0.22, 0.18, 0.08, 0.44, 0.08, wood, chair);
      box(0.2, 0.22, 0.18, 0.08, 0.44, 0.08, wood, chair);
      box(-0.45, 0.92, 0.1, 0.08, 0.28, 0.08, woodD, desk);
      const shade = new THREE.Mesh(G("clantern", () => new THREE.CylinderGeometry(0.08, 0.1, 0.18, 8)), lamp);
      shade.position.set(-0.45, 1.18, 0.1); shade.scale.set(1.1, 0.7, 1.1); desk.add(shade);
      box(0.45, 0.86, 0.1, 0.28, 0.1, 0.22, sm("#6a2a2a"), desk);
      box(0.15, 0.86, -0.15, 0.22, 0.08, 0.16, sm("#f3e7c8"), desk);
      box(0.18, 0.95, -0.15, 0.18, 0.1, 0.14, sm("#f3e7c8"), desk);
      const pot = sm("#3a6a3a", { roughness: 1 });
      box(0.7, 0.88, 0.22, 0.12, 0.12, 0.12, sm("#8a5a3a"), desk);
      box(0.7, 1.05, 0.22, 0.16, 0.22, 0.16, pot, desk);
      cplane(M("t:cave:lostfound", () => plate("LOST & FOUND", "please queue · no, we don't know why it's here", { w: 900, h: 240, bg: "#3a3228", fg: "#f3e7c8", accent: "#e0b25a" })), 1.15, 0.32, 0, 0.96, 0.2, 0, desk);
      box(1.15, 0.9, -0.1, 0.06, 1.8, 0.06, woodD, desk);
      box(1.15, 1.75, -0.1, 0.5, 0.06, 0.5, woodD, desk);
    })();
    const ex = new THREE.Group(); ex.position.set(foyer.x, foyer.y || 0, foyer.z + foyer.d / 2 - 0.35); ex.rotation.y = Math.PI; g.add(ex);
    const { disc } = swirl(ex); disc.userData.run = () => leaveInstance(); disc.userData.maxD = 4.5;
    inst.exit = { g: ex, disc, lx: IX + foyer.x, lz: IZ + foyer.z + foyer.d / 2 - 0.65 };
    inst.extras.push({ key: "far-door", lx: IX + bossR.x, lz: IZ + bossR.z - bossR.d / 2 + 0.7, label: () => (S.world.bosses[id] ? "🌀 Leave through the far dark" : "🪨 The far dark (locked until the pile is dealt with)"), run: () => (S.world.bosses[id] ? leaveInstance() : host.toast("The dark politely declines until the pile has been spoken to.")) });
    I.spawn = { x: foyer.x, z: foyer.z + foyer.d / 2 - 2.0, y: foyer.y || 0, yaw: 0 };
    inst.rooms[id] = { g, exit: inst.exit, extras: inst.extras, blockers: inst.blockers };
    rooms.forEach((r) => {
      walkable.push(caveWalk(r));
      const rb = { x0: r.x - r.w / 2, x1: r.x + r.w / 2, z0: r.z - r.d / 2, z1: r.z + r.d / 2 };
      const overlapAmt = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
      const neighborOn = (side) => rooms.find((o) => { if (o.id === r.id) return false; const ob = { x0: o.x - o.w / 2, x1: o.x + o.w / 2, z0: o.z - o.d / 2, z1: o.z + o.d / 2 };
        if (side === "n") return Math.abs(rb.z0 - ob.z1) < 1.2 && overlapAmt(rb.x0, rb.x1, ob.x0, ob.x1) > 1.4;
        if (side === "s") return Math.abs(rb.z1 - ob.z0) < 1.2 && overlapAmt(rb.x0, rb.x1, ob.x0, ob.x1) > 1.4;
        if (side === "w") return Math.abs(rb.x0 - ob.x1) < 1.2 && overlapAmt(rb.z0, rb.z1, ob.z0, ob.z1) > 1.4;
        if (side === "e") return Math.abs(rb.x1 - ob.x0) < 1.2 && overlapAmt(rb.z0, rb.z1, ob.z0, ob.z1) > 1.4; return false; });
      const gapRange = (side, lo, hi) => {
        const o = neighborOn(side); if (!o) return null;
        const o0 = (side === "n" || side === "s") ? o.x - o.w / 2 : o.z - o.d / 2;
        const o1 = (side === "n" || side === "s") ? o.x + o.w / 2 : o.z + o.d / 2;
        const a0 = Math.max(lo, o0), a1 = Math.min(hi, o1), mid = (a0 + a1) / 2;
        const half = Math.max(1.15, Math.min(2.15, (a1 - a0) / 2));
        return [Math.max(lo + 0.15, mid - half), Math.min(hi - 0.15, mid + half)];
      };
      // only emit north/west connectors so each doorway is added once
      [["n", rb.x0, rb.x1], ["w", rb.z0, rb.z1]].forEach(([side, lo, hi]) => {
        const gr = gapRange(side, lo, hi); if (gr) walkable.push(caveDoorWalk(r, side, gr[0], gr[1]));
      });
    });
  }

  function spawnGrottoRun(id, I) {
    const rooms = caveRooms(I), n = Math.max(1, partySize());
    const golemBeat = grotto.current()?.beats.find((b) => b.kind === "golem");
    const gal = caveRoom(I, golemBeat?.roomId || "gallery");
    if (gal && !grotto.current()?.done.golem) {
      const rect = { x0: gal.x - gal.w / 2 + 0.6, x1: gal.x + gal.w / 2 - 0.6, z0: gal.z - gal.d / 2 + 0.5, z1: gal.z + gal.d / 2 - 0.5 };
      const zone = caveZone(gal), y = gal.y || 0;
      const list = golemBeat?.data?.mobs || [["pebble", 0], ["moss", 0]];
      list.forEach(([kind, tier], q) => {
        const sc0 = scaled(kind, tier); if (I.xpMult != null) sc0.xp = Math.max(1, Math.round(sc0.xp * I.xpMult));
        const m = newMob(sc0, makeMobMesh(D.enemies[kind].mesh || kind, inst.g), gal.x - 1.0 + q * 1.4, gal.z - 0.6, rect, zone, null, "run:golem:" + q, y);
        m.runBeat = "golem"; m.run = "golem"; inst.mobs.push(m);
      });
    }
    const br = caveRoom(I, "boss");
    if (br && !grotto.current()?.done.boss && !S.world.bosses[id]) {
      const Gdata = grotto.data()?.boss || {}, bd = I.boss;
      const boss = { kind: "boss", def: { ...bd, name: Gdata.name || bd.name, icon: Gdata.icon || "🧸" }, name: Gdata.name || bd.name, icon: Gdata.icon || "🧸", maxHp: bd.hp, ac: bd.ac, atk: bd.atk, die: bd.die, dmgB: 0, xp: bd.xp, speed: bd.speed, every: bd.every, boss: true, clvl: (I.levelRange || [I.level || 1])[1] || I.level || 1 };
      const rect = { x0: br.x - br.w / 2 + 0.6, x1: br.x + br.w / 2 - 0.6, z0: br.z - br.d / 2 + 0.5, z1: br.z + br.d / 2 - 0.5 };
      const m = newMob(boss, makeMobMesh(bd.mesh || "stalag", inst.g, 1.4), br.x - 1.1, br.z - 1.6, rect, caveZone(br), null, "run:boss", br.y || 0);
      m.runBeat = "boss"; inst.mobs.push(m);
    }
  }
  function startBeatFight(kind) {
    if (!inst.active) return;
    let foes = inst.mobs.filter((m) => !m.dead && (m.runBeat === kind || (kind === "boss" && m.boss)));
    if (!foes.length) { spawnGrottoRun(inst.id, D.instances[inst.id]); foes = inst.mobs.filter((m) => !m.dead && (m.runBeat === kind || (kind === "boss" && m.boss))); }
    if (foes.length) startBattle(foes, foes[0].zone);
  }
  function applyRunProgress(p) {
    if (!p) return;
    (p.cleared || []).forEach((k) => {
      const key = typeof k === "number" ? runKey(k) : (String(k).startsWith("run:") ? k : runKey(k));
      S.world.mobs[key] = S.world.mobs[key] || new Date().toISOString();
      inst.mobs.filter((m) => m.run === k || m.runBeat === k).forEach((m) => { m.dead = true; m.hp = 0; if (m.g) m.g.visible = false; });
    });
    if (p.boss) { S.world.bosses[inst.id || "grotto"] = S.world.bosses[inst.id || "grotto"] || new Date().toISOString(); inst.mobs.filter((m) => m.boss).forEach((m) => { m.dead = true; m.hp = 0; if (m.g) m.g.visible = false; }); }
    (p.loot || []).forEach((k) => { S.world.loot[k] = S.world.loot[k] || new Date().toISOString(); inst.drops.filter((d) => d.key === k && !d.taken).forEach((d) => { d.taken = true; if (d.g) d.g.visible = false; }); });
  }
  function roomAt(wx, wz) {
    if (!inst.active) return null;
    const I = D.instances[inst.id];
    if (I?.layout === "cave") {
      const x = wx - IX, z = wz - IZ;
      return caveRooms(I).find((r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) || null;
    }
    return { id: inst.id, label: I?.name };
  }
  function markGrottoBoss() {
    S.world.bosses.grotto = new Date().toISOString(); progress("boss", "grotto"); afterBoss("grotto"); save(); ext.onRunEvent?.("boss", "grotto");
  }

  function spawnCave(id, I) {
    if (id === "grotto" && grotto?.current()) return spawnGrottoRun(id, I);
    const rooms = caveRooms(I);
    I.steps.forEach((st, k) => {
      const rm = rooms.find((q) => q.id === st.room) || rooms.find((q) => q.step === k);
      if (!rm) return;
      const rect = { x0: rm.x - rm.w / 2 + 0.6, x1: rm.x + rm.w / 2 - 0.6, z0: rm.z - rm.d / 2 + 0.5, z1: rm.z + rm.d / 2 - 0.5 };
      const zone = `annex:inst:run:${k}`, y = rm.y || 0;
      if (st.type === "fight" && !S.world.mobs[runKey(k)]) st.mobs.forEach(([kind, tier], q) => {
        const sc0 = scaled(kind, tier); if (I.xpMult != null) sc0.xp = Math.max(1, Math.round(sc0.xp * I.xpMult));
        const m = newMob(sc0, makeMobMesh(D.enemies[kind].mesh || kind, inst.g), rm.x - rm.w / 4 + q * 1.3, rm.z - 0.4, rect, zone, null, `run:${k}:${q}`, y);
        m.run = k; inst.mobs.push(m);
      });
      if (st.type === "boss" && !S.world.bosses[id]) {
        const bd = I.boss;
        const boss = { kind: "boss", def: bd, name: bd.name, icon: bd.icon, maxHp: bd.hp, ac: bd.ac, atk: bd.atk, die: bd.die, dmgB: 0, xp: bd.xp, speed: bd.speed, every: bd.every, boss: true, clvl: (I.levelRange || [I.level || 1])[1] || I.level || 1 };
        inst.mobs.push(newMob(boss, makeMobMesh(bd.mesh || "stalag", inst.g, 1.4), rm.x - 1.1, rm.z - 1.6, rect, zone, null, "run:boss", y));
      }
    });
    (I.pickups || []).forEach((pk, q) => {
      const key = `run:${id}:p${q}`; const it = item(pk.item); if (S.world.loot[key] || !it) return; if (it.unique && ownsItem(pk.item)) return;
      const rm = caveRoom(I, pk.room); if (!rm) return;
      const x = rm.x + ((q % 2) ? 0.9 : -0.7), z = rm.z + 0.4, y = rm.y || 0;
      const g = new THREE.Group(); g.position.set(x, y, z); inst.g.add(g);
      const b = new THREE.Mesh(G("loot", () => new THREE.OctahedronGeometry(0.16, 0)), sm(it.slot === "use" ? "#7fc8a0" : "#a8c8e8", { emissive: "#fff2a8", emissiveIntensity: 0.35 })); b.position.y = 0.4; g.add(b);
      inst.drops.push({ g, b, id: pk.item, lx: IX + x, lz: IZ + z, ly: y, taken: false, key });
    });
  }
  function resetInstanceProgress(id) {
    const I = D.instances[id]; if (!I) return;
    const pre = `run:${id}:`;
    Object.keys(S.world.mobs || {}).forEach((k) => { if (k.startsWith(pre)) delete S.world.mobs[k]; });
    delete S.world.bosses[id];
    Object.keys(S.world.loot || {}).forEach((k) => { if (!k.startsWith(pre)) return; if (!lootKeyIsUnique(id, k)) delete S.world.loot[k]; });
    save();
  }
  function lootKeyIsUnique(id, k) {
    const I = D.instances[id]; if (!I) return false;
    if (k === preBossKey(id)) return !!(item(I.boss?.loot)?.unique);
    const m = /:p(\d+)$/.exec(k); if (!m) return false;
    const pk = (I.pickups || [])[+m[1]]; return !!(pk && item(pk.item)?.unique);
  }
  const preBossKey = (id) => `run:${id}:boss`;
  function ownsItem(id) { const c = CH(); if (!c) return false; if (Object.values(c.gear || {}).includes(id)) return true; if ((c.inv || []).includes(id)) return true; if ((S.stash || []).some((s) => s.item === id)) return true; return false; }

  // ---------- instance minimap (top-right, under the tray) ----------
  const mapEl = el("button", "o3-minimap"); mapEl.hidden = true; mapEl.type = "button"; mapEl.setAttribute("aria-label", "Instance map"); mapEl.title = "Instance map (tap to enlarge)";
  const mapCv = document.createElement("canvas"); mapEl.appendChild(mapCv);
  const mapHint = el("span", "o3-maphint", "map"); mapEl.appendChild(mapHint);
  host.hud.appendChild(mapEl);
  let mapOpen = false, mapExplored = new Set();
  mapEl.onclick = () => { mapOpen = !mapOpen; mapEl.classList.toggle("open", mapOpen); drawMinimap(); };
  function mapRooms() {
    const I = inst.active && D.instances[inst.id]; if (!I) return [];
    if (I.layout === "cave") {
      const cr = caveRooms(I); const zMax = Math.max(...cr.map((r) => r.z + r.d / 2));
      return cr.map((r) => ({ id: r.id, type: r.type, label: r.label, step: r.step, mx: r.x - r.w / 2, my: zMax - (r.z + r.d / 2), mw: r.w, mh: r.d, zone: caveZone(r), x: r.x, z: r.z, w: r.w, d: r.d, y: r.y }));
    }
    if (I.layout === "run") {
      const R0 = runGeo(I); const out = [{ id: "lobby", type: "lobby", label: "Entrance", mx: 1.2, my: 0, mw: 2.6, mh: 1.8, zone: "annex:inst:run:lobby", x: R0.cx, z: (R0.z1 - R0.LOB + R0.z1) / 2, w: R0.W, d: R0.LOB, y: 0 }];
      I.steps.forEach((st, k) => { const sg = R0.seg(k); out.push({ id: "step" + k, type: st.type, label: st.name, step: k, mx: 1.2, my: 1.8 + k * 1.65, mw: 2.6, mh: 1.65, zone: `annex:inst:run:${k}`, x: R0.cx, z: (sg.z0 + sg.z1) / 2, w: R0.W, d: R0.SEG, y: 0 }); });
      return out;
    }
    return [];
  }
  function revealMap(zone) { if (!zone) return; mapRooms().forEach((r) => { if (r.zone === zone) mapExplored.add(r.id); }); }
  function placeMinimap() { const tray = host.hud.querySelector(".o3-tray"); if (!tray || mapEl.hidden) return; const tb = tray.getBoundingClientRect(), hb = host.hud.getBoundingClientRect(); mapEl.style.top = Math.max(4, Math.round(tb.bottom - hb.top + 8)) + "px"; }
  function showMinimap(on) { const rooms = mapRooms(); const ok = !!on && rooms.length > 0; mapEl.hidden = !ok; if (ok) { if (on && !mapExplored.size) { const first = rooms[0]; if (first) mapExplored.add(first.id); } placeMinimap(); drawMinimap(); } }
  addEventListener("resize", () => { if (!mapEl.hidden) { placeMinimap(); drawMinimap(); } });
  function resetMinimap() { mapExplored = new Set(); mapOpen = false; mapEl.classList.remove("open"); }
  function drawMinimap() {
    const rooms = mapRooms(); if (!rooms.length) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, mapEl.clientWidth), h = Math.max(1, mapEl.clientHeight);
    if (mapCv.width !== Math.round(w * dpr) || mapCv.height !== Math.round(h * dpr)) { mapCv.width = Math.round(w * dpr); mapCv.height = Math.round(h * dpr); }
    const c = mapCv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rooms.forEach((r) => { x0 = Math.min(x0, r.mx); y0 = Math.min(y0, r.my); x1 = Math.max(x1, r.mx + r.mw); y1 = Math.max(y1, r.my + r.mh); });
    const pad = 7;
    const sx = (w - pad * 2) / Math.max(0.01, x1 - x0), sy = (h - pad * 2) / Math.max(0.01, y1 - y0);
    const ox = pad, oy = pad;
    const to = (mx, my) => [ox + (mx - x0) * sx, oy + (my - y0) * sy];
    rooms.forEach((r) => {
      const [x, y] = to(r.mx, r.my), rw = r.mw * sx, rh = r.mh * sy, seen = mapExplored.has(r.id);
      if (seen) { c.fillStyle = r.type === "boss" ? "#5a3a2a" : r.type === "rest" ? "#3a5a3a" : r.type === "slope" ? "#3a342c" : r.type === "pocket" ? "#3a3a32" : "#4a453c"; c.strokeStyle = "#c9b45a"; c.lineWidth = 1.2; }
      else { c.fillStyle = "rgba(12,10,8,.88)"; c.strokeStyle = "rgba(180,160,90,.45)"; c.lineWidth = 1; c.setLineDash([3, 3]); }
      c.fillRect(x, y, rw, rh); c.strokeRect(x, y, rw, rh); c.setLineDash([]);
      if (!seen) { c.fillStyle = "#e8d889"; c.font = `700 ${Math.max(9, Math.min(14, rh * 0.55))}px system-ui`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("?", x + rw / 2, y + rh / 2); }
      else if (r.type === "fight" || r.type === "boss" || r.type === "rest") {
        c.fillStyle = "#f3e7c8"; c.font = `700 ${Math.max(8, Math.min(13, rh * 0.5))}px system-ui`; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(r.type === "rest" ? "🛋" : r.type === "boss" ? "★" : "!", x + rw / 2, y + rh / 2);
      }
    });
    // player dot from lastP (annex-local? lastP is annex-local: x without AX)
    const I = D.instances[inst.id];
    if (I && lastP) {
      const lx = lastP.x - IX, lz = lastP.z - IZ;
      // find containing room in instance-local
      let here = rooms.find((r) => r.x != null && Math.abs(lx - r.x) <= (r.w || 0) / 2 + 0.2 && Math.abs(lz - r.z) <= (r.d || 0) / 2 + 0.2 && mapExplored.has(r.id)) || rooms.find((r) => mapExplored.has(r.id) && r.zone === curZone);
      if (here) {
        const u = (lx - (here.x - here.w / 2)) / Math.max(0.01, here.w), v = (lz - (here.z - here.d / 2)) / Math.max(0.01, here.d);
        const [px, py] = to(here.mx + Math.max(0, Math.min(1, u)) * here.mw, here.my + Math.max(0, Math.min(1, 1 - v)) * here.mh); // v flipped so south is up-on-map? my grows as we go deeper (lower z), so v=0 (south, high z) should be top of room = small my. Room my is already deeper=larger. z high (south, entrance) is smaller my for foyer. foyer z=30 is high, map my=0. So v = (z - zMin)/d = 0 at north (low z)... wait.
        // room z center, z0 = z-d/2 (north, lower z, deeper), z1 = z+d/2 (south).
        // map: my is smaller at entrance (south). So as z increases, my should decrease within the room.
        // u = (x - x0)/w, vMap = (z1 - z)/d  so south (high z) -> 0 (top if we don't flip further). to() uses my increasing downward on canvas. Entrance at top of minimap means small my. Within a room, south (high z) should be at top of that room's rect = small canvas y = here.my + 0*mh. So canvasY uses (zMax - z)/d.
        const z0 = here.z - here.d / 2, z1 = here.z + here.d / 2;
        const vv = (z1 - lz) / Math.max(0.01, here.d);
        const [qx, qy] = to(here.mx + Math.max(0, Math.min(1, u)) * here.mw, here.my + Math.max(0, Math.min(1, vv)) * here.mh);
        c.fillStyle = "#8fd18a"; c.strokeStyle = "#fbf3d0"; c.lineWidth = 1.5; c.beginPath(); c.arc(qx, qy, mapOpen ? 5 : 3.5, 0, 7); c.fill(); c.stroke();
      }
    }
    mapHint.textContent = mapOpen ? "tap to shrink" : "map";
  }
  function minimapState() { return { hidden: !!mapEl.hidden, open: mapOpen, explored: [...mapExplored], rooms: mapRooms().map((r) => ({ id: r.id, type: r.type, zone: r.zone, seen: mapExplored.has(r.id) })), rect: mapEl.getBoundingClientRect().toJSON?.() || (() => { const b = mapEl.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, top: b.top, right: b.right, bottom: b.bottom, left: b.left }; })() }; }

  // ---------- v5d companion (Snorble): solo-only, default on, per character ----------
  let forcedPartySize = 0;
  function companionOn() { const c = CH(); return !!(c && c.companion !== false); }
  function setCompanion(on) { const c = CH(); if (!c) return false; c.companion = !!on; save(); return c.companion; }
  function companionActive() { if (!companionOn() || !D?.companion) return false; const n = forcedPartySize > 0 ? forcedPartySize : partySize(); return n === 1; }
  function companionInfo() { const C = D?.companion; return C && { id: C.id, name: C.name, on: companionOn(), active: companionActive(), maxHp: C.maxHp, forcedParty: forcedPartySize || null }; }
  // starter door (hallway shortcut): same plaza arm as the Training Closet, on the opposite wall. The main entrance is the lit Mailroom door at the Door Station in the plaza; this one still works.
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
      pn.appendChild(el("p", "o3-small", "The run resets when you step in — parcels come back. Unique finds stay found."));
      const go = el("button", "o3-btn", pr.boss ? "🗡 Walk through again (the parcels will have opinions again)" : "🗡 Step into the Mailroom"); go.dataset.rpg = "starter-go"; go.onclick = () => { host.closePanel(); enterStarter(tp); }; pn.appendChild(go); }); }
  const enterStarter = (tp) => { tp = tp || sportals()[0]; if (!tp) return null; return enterInstance({ pp: { id: "sp-mailroom", instance: "starter" }, i: startSec.center[0], j: startSec.center[1], spawn: tp.spawn }); };
  function openGrotto(d) { if (!transformed) return nudge(true); const I = D.instances.grotto, pr = runProgress("grotto");
    const stepIn = () => enterInstance({ pp: { id: d.def.id, instance: "grotto" }, i: startSec.center[0], j: startSec.center[1], spawn: d.spawn });
    panel("grotto", `🪨 ${I.name}`, (pn) => { pn.appendChild(el("p", "o3-riddle", I.door.label)); pn.appendChild(el("p", null, I.intro));
      pn.appendChild(el("p", "o3-small", `Content level ${I.levelRange.join("–")} · real XP and loot. The run resets when you step in. Unique finds stay found. Progress last visit: ${pr.cleared}/${pr.fights} fights, boss ${pr.boss ? "beaten" : "waiting"}, ${pr.taken}/${pr.pickups} pickups.`));
      if (ext.partyDoor) ext.partyDoor(pn, "grotto", () => {});
      const go = el("button", "o3-btn", "🪨 Step into the Grotto"); go.dataset.rpg = "grotto-go"; go.onclick = () => { host.closePanel(); stepIn(); }; pn.appendChild(go);
      const solo = el("button", "o3-btn ghost", "🪨 Begin a survey run (solo)"); solo.dataset.rpg = "grotto-solo"; solo.onclick = () => { wantSoloRun = true; host.closePanel(); stepIn(); }; pn.appendChild(solo); }); }
  const enterGrotto = () => { const d = stationDoors.find((q) => q.def.id === "sd-grotto"); if (!d) return null; return enterInstance({ pp: { id: "sd-grotto", instance: "grotto" }, i: startSec.center[0], j: startSec.center[1], spawn: d.spawn }); };
  // gates (solo, deep) -> per-character waystones
  function openGate(p) { maybeDiscover(p.pp); const I = D.instances[p.pp.instance], gt = p.pp, c = CH(), awake = !!c?.waystones?.[gt.waystone.id];
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


  // ---------- v5c: Door Station in the arrival plaza (orderly themed doors, train teaser, threshold) ----------
  let stationDoors = [], departBoard = null, trainProp = null, threshProp = null, deskProp = null, comingSign = null;
  const hexDim = (hex, f) => { const n = parseInt(String(hex).replace("#", ""), 16), r = Math.round(((n >> 16) & 255) * f), gv = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f); return "#" + ((1 << 24) + (r << 16) + (gv << 8) + b).toString(16).slice(1); };
  function doorIsOpen(def) { if (!def) return false; if (def.unlocked) return true; const u = def.unlock || {}, c = CH(); if (!c) return false;
    if (u.type === "discover") { if (u.gate) { const gt = (D.gates || []).find((q) => q.id === u.gate); return !!(c.discovered?.[u.gate] || (gt && c.waystones?.[gt.waystone.id])); } return !!(u.flag && (c.discovered?.[u.flag] || S.flags?.[u.flag])); } return false; }
  function markDiscovered(id) { const c = CH(); if (!c || !id) return false; c.discovered ||= {}; if (c.discovered[id]) return false; c.discovered[id] = new Date().toISOString(); save(); paintStation(); host.toast(D.station?.discoverToast || "A Station door just flickered on."); addLog("🚪 A Station door woke.", "lvl"); return true; }
  function maybeDiscover(pp) { if (pp?.gate && transformed) markDiscovered(pp.id); }
  function stationRows(St) { return (St?.stations && St.stations.length) ? St.stations : (St?.departures?.rows || []); }
  function postmarkTex(title, sub, col) { return canvasTex(720, 240, (c) => { c.fillStyle = col.signBg; c.fillRect(0, 0, 720, 240); c.strokeStyle = col.accent; c.lineWidth = 8; c.strokeRect(10, 10, 700, 220);
    c.strokeStyle = col.accent; c.lineWidth = 5; c.beginPath(); c.arc(610, 72, 48, 0, 7); c.stroke(); c.beginPath(); c.arc(610, 72, 34, 0, 7); c.stroke();
    c.fillStyle = col.accent; c.font = "bold 14px system-ui"; c.textAlign = "center"; c.fillText("ANNEX", 610, 68); c.fillText("MAIL", 610, 86);
    c.lineWidth = 2.5; for (let i = 0; i < 4; i++) { c.beginPath(); for (let x = 0; x <= 160; x += 8) { const y = 48 + i * 12 + Math.sin(x / 7) * 3; x ? c.lineTo(430 + x, y) : c.moveTo(430 + x, y); } c.stroke(); }
    c.fillStyle = col.signFg; c.textAlign = "left"; c.font = "bold 40px system-ui"; c.fillText(title, 28, 112); c.font = "22px system-ui"; c.fillText(sub, 28, 162); }); }
  function depTex(St) { const rows = stationRows(St), Dep = St.departures || {}; return canvasTex(640, 400, (c) => { c.fillStyle = "#1a1c16"; c.fillRect(0, 0, 640, 400); c.fillStyle = "#c9b45a"; c.fillRect(0, 0, 640, 8); c.fillRect(0, 392, 640, 8);
    c.fillStyle = "#e8d889"; c.font = "bold 36px system-ui"; c.textAlign = "center"; c.fillText(Dep.title || "DEPARTURES", 320, 52); c.font = "18px system-ui"; c.fillStyle = "#9a8a4a"; c.fillText(Dep.subtitle || "", 320, 80);
    c.strokeStyle = "#4a4630"; c.beginPath(); c.moveTo(24, 96); c.lineTo(616, 96); c.stroke();
    rows.forEach((r, i) => { const y = 150 + i * 78; c.fillStyle = "#d8c878"; c.textAlign = "left"; c.font = "bold 26px system-ui"; c.fillText((r.name || "").toUpperCase(), 36, y);
      c.textAlign = "center"; c.font = "bold 24px system-ui"; c.fillText(r.code || "???", 400, y); c.textAlign = "right"; c.fillStyle = r.status === "Delayed" ? "#e08a4a" : "#8fd18a"; c.fillText((r.status || "").toUpperCase(), 604, y);
      if (r.note) { c.textAlign = "left"; c.font = "16px system-ui"; c.fillStyle = "#9a8a4a"; c.fillText(String(r.note).toUpperCase(), 36, y + 28); } });
    c.textAlign = "center"; c.font = "bold 16px system-ui"; c.fillStyle = "#c9b45a"; c.fillText("TRAIN — COMING SOON", 320, 372); }); }
  function hiddenDisc(parent, x, y, z, r) { const disc = new THREE.Mesh(G("hdisc", () => new THREE.CircleGeometry(0.55, 16)), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, transparent: true, opacity: 0 })); disc.position.set(x, y, z); parent.add(disc); return disc; }
  function themedDoor(parent, x, y, z, rotY, def) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g);
    const col = def.theme.colors, open0 = doorIsOpen(def);
    const doorM = sm(open0 ? col.door : hexDim(col.door, 0.35), { roughness: 0.85, emissive: open0 ? col.emissive : "#000000", emissiveIntensity: open0 ? 0.16 : 0 });
    const frameM = sm(open0 ? col.frame : hexDim(col.frame, 0.4), { roughness: 0.7 });
    box(0, 1.05, -0.03, 1.15, 2.1, 0.04, doorM, g); box(0, 2.14, -0.02, 1.25, 0.08, 0.06, frameM, g); box(-0.62, 1.05, -0.02, 0.06, 2.1, 0.06, frameM, g); box(0.62, 1.05, -0.02, 0.06, 2.1, 0.06, frameM, g);
    box(0, 1.22, 0.0, 0.42, 0.07, 0.03, sm(open0 ? col.slot : hexDim(col.slot, 0.45), { metalness: 0.6, roughness: 0.3 }), g);
    if (def.theme.decor === "mail") box(0.32, 1.62, 0.025, 0.22, 0.18, 0.02, sm(open0 ? "#d8c878" : "#4a4030"), g); // stamp
    if (def.theme.decor === "cave") {
      const rk = sm(open0 ? "#5a5348" : "#2a2620", { roughness: 1 });
      if (def.id === "sd-grotto") {
        // flush in the wall like the office cubicle doors (t651u); no jutting rock columns
        box(0, 2.16, -0.02, 1.28, 0.1, 0.05, rk, g);
        const lan = new THREE.Mesh(G("doorlantern", () => new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8)), sm(open0 ? "#e0b25a" : "#4a4030", { emissive: open0 ? "#c9a45a" : "#000000", emissiveIntensity: open0 ? 0.9 : 0 }));
        lan.position.set(-0.46, 1.82, 0.02); g.add(lan);
      } else {
        box(-0.7, 1.05, -0.07, 0.26, 2.05, 0.24, rk, g); box(0.7, 1.05, -0.07, 0.28, 2.05, 0.24, rk, g); box(0, 2.12, -0.07, 1.42, 0.16, 0.24, rk, g);
        const lan = new THREE.Mesh(G("doorlantern", () => new THREE.CylinderGeometry(0.06, 0.07, 0.14, 8)), sm(open0 ? "#e0b25a" : "#4a4030", { emissive: open0 ? "#c9a45a" : "#000000", emissiveIntensity: open0 ? 0.95 : 0 })); lan.position.set(-0.55, 1.85, 0.1); g.add(lan);
      }
    }
    const lockG = new THREE.Group(); lockG.position.set(0.28, 1.0, 0.05); g.add(lockG);
    box(0, 0.05, 0, 0.16, 0.2, 0.08, sm("#3a3a32", { metalness: 0.5, roughness: 0.4 }), lockG);
    const sh = new THREE.Mesh(G("lockring", () => new THREE.TorusGeometry(0.07, 0.018, 6, 12)), sm("#5a5a50", { metalness: 0.6, roughness: 0.35 })); sh.position.y = 0.16; lockG.add(sh);
    const plankG = new THREE.Group(); g.add(plankG); const plankM = sm("#3a3024", { roughness: 1 });
    const p1 = box(0, 1.1, 0.04, 0.16, 2.0, 0.05, plankM, plankG); p1.rotation.z = 0.45; const p2 = box(0, 1.1, 0.05, 0.16, 2.0, 0.05, plankM, plankG); p2.rotation.z = -0.45;
    const { ring, disc } = swirl(g); ring.visible = false; disc.position.set(0, 1.05, 0.08); disc.material = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide, transparent: true, opacity: 0 });
    disc.scale.set(1.1, 1.8, 1); // invisible click/tap target covering the door face
    const signMesh = cplane(plate("???", "sealed", { w: 720, h: 220, bg: "#2a2a2a", fg: "#8a8a8a", accent: "#5a5a5a" }), 1.15, 0.35, 0, 2.45, 0.04, 0, g);
    signMesh.material = new THREE.MeshStandardMaterial({ map: signMesh.material.map, roughness: 0.9, side: THREE.DoubleSide });
    if (def.theme.wobble) g.rotation.z = 0.015; // tiny leftover mail wobble; the row stays tidy
    // even, muted sconce above the frame
    box(0, 2.28, 0.08, 0.18, 0.06, 0.08, sm("#d8c8a0", { emissive: "#e8d9a8", emissiveIntensity: 0.35 }), g);
    const d = { def, g, doorM, frameM, lockG, plankG, ring, disc, col, signMesh };
    paintOne(d, open0); return d; }
  function doorSignTex(def, open) { const col = def.theme.colors; if (open && def.theme.decor === "mail") return postmarkTex(def.theme.sign, def.theme.signSub, col);
    return plate(open ? def.theme.sign : "???", open ? def.theme.signSub : "sealed", { w: 720, h: 220, bg: open ? col.signBg : "#2a2a2a", fg: open ? col.signFg : "#8a8a8a", accent: open ? col.accent : "#5a5a5a" }); }
  function paintOne(d, open) { const col = d.col; d.doorM.color.set(open ? col.door : hexDim(col.door, 0.35)); d.doorM.emissive.set(open ? col.emissive : "#000000"); d.doorM.emissiveIntensity = open ? 0.16 : 0;
    d.frameM.color.set(open ? col.frame : hexDim(col.frame, 0.4)); if (d.lockG) d.lockG.visible = !open; if (d.plankG) d.plankG.visible = !open; if (d.ring) d.ring.visible = false;
    if (d.signMesh && d._open !== open) { d.signMesh.material.map = doorSignTex(d.def, open); d.signMesh.material.needsUpdate = true; d._open = open; } }
  function paintStation() { stationDoors.forEach((d) => { const open = doorIsOpen(d.def); paintOne(d, open); if (d.signPlane) d.signPlane.visible = true; }); }
  function buildFacade(St, ox, oz) {
    const F = St.layout?.facade || {}, z = oz + (F.z ?? 4.72), x0 = ox + (F.x0 ?? 9.15), x1 = ox + (F.x1 ?? 13.95);
    const mid = (x0 + x1) / 2, w = x1 - x0, h = F.h ?? 3, g = new THREE.Group(); root.add(g);
    const wall = sm("#4a463c", { roughness: 0.95 }), trim = sm("#3a362e", { roughness: 0.8 });
    box(mid, h / 2, z, w, h, 0.1, wall, g); box(mid, 0.06, z + 0.06, w, 0.12, 0.04, trim, g); box(mid, h - 0.06, z + 0.06, w, 0.1, 0.04, trim, g);
    box(mid, 0.012, z + 0.95, w + 0.15, 0.02, 1.7, sm("#5a5648", { roughness: 1 }), g); // muted runner in front of the doors
    const sg = St.layout?.stationSign || {};
    cplane(M("t:stn-sign", () => plate(St.sign, St.signSub, { w: 860, h: 220, bg: "#3a3428", fg: "#fbf3d0", accent: "#c9b45a" })), 1.7, 0.4, mid, sg.y || 2.82, z + 0.08, 0, g);
    return { g, x0, x1, z, mid }; }
  function buildDesk(St, ox, oz) {
    const L = St.layout?.desk || {}, x = ox + (L.x ?? 10.15), z = oz + (L.z ?? 6.55), g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = L.rotY ?? 0.06; root.add(g);
    const oak = sm("#6a5840", { roughness: 0.7 }), dark = sm("#3a3024");
    box(0, 0.72, 0, 1.35, 0.06, 0.62, oak, g); box(-0.6, 0.36, 0, 0.06, 0.72, 0.58, dark, g); box(0.6, 0.36, 0, 0.06, 0.72, 0.58, dark, g); box(0, 0.36, -0.26, 1.2, 0.62, 0.05, oak, g);
    box(-0.45, 0.82, 0.08, 0.04, 0.2, 0.04, sm("#c8b56a", { metalness: 0.4 }), g);
    box(-0.45, 1.0, 0.08, 0.16, 0.08, 0.16, sm("#e8d9a8", { emissive: "#e8d0a0", emissiveIntensity: 0.45 }), g);
    const bell = new THREE.Mesh(G("bell", () => new THREE.SphereGeometry(0.05, 10, 8)), sm("#d8c878", { metalness: 0.6, roughness: 0.3 })); bell.position.set(0.15, 0.82, 0.08); bell.scale.y = 0.7; g.add(bell);
    box(0.15, 0.76, 0.08, 0.08, 0.02, 0.08, sm("#d8c878", { metalness: 0.5 }), g);
    cplane(M("t:checkin", () => plate((St.desk && St.desk.sign) || "CHECK-IN", (St.desk && St.desk.signSub) || "please form a tidy queue", { w: 640, h: 180, bg: "#3a3428", fg: "#fbf3d0", accent: "#c9b45a" })), 0.7, 0.2, 0, 1.05, -0.28, 0, g);
    const disc = hiddenDisc(g, 0, 0.9, 0.2, 0.55); disc.userData.run = openDesk; disc.userData.maxD = 4.5;
    deskProp = { g, disc, lx: x, lz: z, label: (St.desk && St.desk.label) || "🔔 Check-in desk" }; }
  function openDesk() { const Dk = D.station?.desk || {}; panel("checkin", "🔔 Check-in", (pn) => { pn.appendChild(el("p", "o3-riddle", Dk.text || "A tidy desk. A bell. A lamp. Nobody is currently checking anyone in.")); pn.appendChild(el("p", "o3-small", Dk.sub || "The Station likes things orderly.")); }); }
  function buildTrain(St, ox, oz) {
    const T = St.layout?.train || {}, x = ox + (T.x ?? 3.35), z0 = oz + (T.z0 ?? 2.25), z1 = oz + (T.z1 ?? 7.4);
    const midz = (z0 + z1) / 2, len = z1 - z0, g = new THREE.Group(); root.add(g);
    const rail = sm("#6a6a70", { metalness: 0.7, roughness: 0.35 }), tie = sm("#4a3a28", { roughness: 1 }), plat = sm("#6a665c", { roughness: 0.9 }), yel = sm("#d8c44a", { roughness: 0.55, emissive: "#a09030", emissiveIntensity: 0.12 });
    for (let zz = z0 + 0.15; zz < z1 - 0.1; zz += 0.42) box(x, 0.03, zz, 0.85, 0.05, 0.12, tie, g);
    box(x - 0.22, 0.07, midz, 0.06, 0.05, len - 0.1, rail, g); box(x + 0.22, 0.07, midz, 0.06, 0.05, len - 0.1, rail, g);
    box(x, 0.22, z0 + 0.08, 0.9, 0.4, 0.1, sm("#4a4036"), g); box(x, 0.55, z0 + 0.08, 0.7, 0.08, 0.08, rail, g); // buffer against the wall
    const px = T.platformX != null ? ox + T.platformX : x + 0.95, pw = T.platformW ?? 1.35, pz0 = z0 + 0.35, pz1 = z1 - 0.15, plen = pz1 - pz0;
    box(px, 0.08, (pz0 + pz1) / 2, pw, 0.16, plen, plat, g); box(px - pw / 2 + 0.06, 0.17, (pz0 + pz1) / 2, 0.1, 0.02, plen, yel, g);
    const Sx = St.layout?.trainSign || {}, sx = ox + (Sx.x ?? 4.55), sz = oz + (Sx.z ?? 6.35), sg = new THREE.Group();
    sg.position.set(sx, 0, sz); sg.rotation.y = Sx.rotY ?? 0.12; root.add(sg);
    box(0, 0.7, 0, 0.06, 1.4, 0.06, sm("#4a4030"), sg);
    cplane(M("t:trainsign", () => plate((St.train && St.train.sign) || "TRAIN — COMING SOON", (St.train && St.train.signSub) || "please wait behind the yellow line", { w: 900, h: 240, bg: "#2a2c22", fg: "#f3e7b0", accent: "#c9b45a" })), 1.2, 0.36, 0, Sx.y || 2.15, 0.04, 0, sg);
    const sdisc = hiddenDisc(sg, 0, 1.6, 0.1, 0.6); sdisc.userData.run = openTrainSign; sdisc.userData.maxD = 4.5;
    comingSign = { g: sg, disc: sdisc, lx: sx, lz: sz, label: (St.train && St.train.label) || "🚂 Train — Coming Soon" };
    trainProp = { g, lx: x, lz: midz, z0, z1, platformX: px, sign: comingSign }; }
  function openTrainSign() { const Tr = D.station?.train || {}; panel("trainsign", "🚂 Train — Coming Soon", (pn) => { pn.appendChild(el("p", "o3-riddle", Tr.text || "A short track runs into the wall. The train is coming soon, in some weird way.")); pn.appendChild(el("p", "o3-small", Tr.sub || "Please wait behind the yellow line. No boarding, and no connection from here yet.")); }); }
  function wtfSignTex() { const Th = D.station?.threshold || {}; return canvasTex(720, 280, (c) => { c.fillStyle = "#3a4a38"; c.fillRect(0, 0, 720, 280); c.strokeStyle = "#c9b45a"; c.lineWidth = 8; c.strokeRect(10, 10, 700, 260);
    c.fillStyle = "#fbf3d0"; c.font = "bold 36px system-ui"; c.textAlign = "center"; c.fillText(Th.sign || "THIS WAY (NOT THIS WAY)", 360, 118);
    c.font = "22px system-ui"; c.fillStyle = "#d8c878"; c.fillText(Th.signSub || "the floor is on Tuesdays", 360, 168);
    c.fillStyle = "#e08a4a"; c.beginPath(); c.moveTo(360, 190); c.lineTo(328, 222); c.lineTo(348, 222); c.lineTo(348, 250); c.lineTo(372, 250); c.lineTo(372, 222); c.lineTo(392, 222); c.closePath(); c.fill(); }); }
  function buildThreshold(St, ox, oz) {
    const L = St.layout?.threshold || {}, x = ox + (L.x ?? 8), z = oz + (L.z ?? 2.02), g = new THREE.Group(); root.add(g);
    box(x, 0.015, z + 0.22, 2.35, 0.03, 0.28, sm("#5a5648", { roughness: 0.85 }), g);
    box(x, 0.025, z + 0.08, 2.35, 0.02, 0.06, sm("#c9b45a", { roughness: 0.5 }), g); // tidy brass bar on the Station side
    const trim = new THREE.Group(); trim.position.set(x, 0, z - 0.16); trim.rotation.z = 0.12; trim.rotation.y = 0.04; g.add(trim); // slightly tilted hall cue
    const tm = sm("#6a6558"); box(0, 2.15, 0, 2.5, 0.08, 0.06, tm, trim); box(-1.22, 1.1, 0, 0.08, 2.2, 0.06, tm, trim); box(1.22, 1.1, 0, 0.08, 2.2, 0.06, tm, trim);
    const tile = box(x + 0.45, 0.02, z - 0.55, 0.55, 0.02, 0.55, sm("#6a5a48"), g); tile.rotation.y = 0.22;
    // upside-down lamp on the east side of the hall, clear of the Training Closet
    const lamp = new THREE.Group(); lamp.position.set(x + 0.82, 0, z - 1.05); g.add(lamp);
    box(0, 2.62, 0, 0.05, 0.5, 0.05, sm("#4a4030"), lamp);
    const shade = new THREE.Mesh(G("lampshade", () => new THREE.ConeGeometry(0.2, 0.28, 10)), sm("#e8d4a0", { emissive: "#e0c878", emissiveIntensity: 0.55 }));
    shade.position.y = 2.12; shade.rotation.x = Math.PI; lamp.add(shade); // wide opening faces the ceiling
    const bulb = new THREE.Mesh(G("bulb", () => new THREE.SphereGeometry(0.055, 8, 8)), sm("#fff6c8", { emissive: "#fff0a0", emissiveIntensity: 0.9 })); bulb.position.y = 2.24; lamp.add(bulb);
    // crooked sign faces the Station so it reads as you cross the threshold (not edge-on on the wall)
    const sg = new THREE.Group(); sg.position.set(x + 0.7, 0, z - 0.9); sg.rotation.y = 0.18; sg.rotation.z = 0.16; g.add(sg);
    cplane(M("t:wtfsign", wtfSignTex), 1.15, 0.46, 0, 1.55, 0.02, 0, sg);
    const disc = hiddenDisc(g, x, 1.2, z, 0.7); disc.userData.run = openThreshold; disc.userData.maxD = 5;
    threshProp = { g, disc, lx: x, lz: z, label: (St.threshold && St.threshold.label) || "A slightly odd threshold" }; }
  function openThreshold() { const Th = D.station?.threshold || {}; panel("threshold", Th.title || "A slightly odd threshold", (pn) => { pn.appendChild(el("p", "o3-riddle", Th.text || "The hall leans a little. The lamp is upside down. A sign says THIS WAY (NOT THIS WAY).")); pn.appendChild(el("p", "o3-small", Th.sub || "Weird, not dangerous. This is where the Station ends and the shifting halls begin.")); }); }
  function addStationBlockers() {
    const St = D.station, L = St?.layout || {}, sc = startSec.center, ch = chunks.get(ck(sc[0], sc[1])); if (!ch || ch._stationBlk || !St) return;
    ch._stationBlk = true; const ox = sc[0] * C, oz = sc[1] * C, F = L.facade || {}, Dk = L.desk || {}, Tr = L.train || {};
    const fz = oz + (F.z ?? 4.72); ch.blockers.push({ x0: ox + (F.x0 ?? 9.15), x1: ox + (F.x1 ?? 13.95), z0: fz - 0.14, z1: fz + 0.14 });
    const dx = ox + (Dk.x ?? 10.15), dz = oz + (Dk.z ?? 6.55); ch.blockers.push({ x0: dx - 0.75, x1: dx + 0.75, z0: dz - 0.42, z1: dz + 0.42 });
    const tx = ox + (Tr.x ?? 3.35), tz0 = oz + (Tr.z0 ?? 2.25); ch.blockers.push({ x0: tx - 0.5, x1: tx + 0.5, z0: tz0 - 0.05, z1: tz0 + 0.25 });
    refreshBlockers(); }
  function buildStation() { const St = D.station; if (!St) return; const sc = startSec.center, ox = sc[0] * C, oz = sc[1] * C, L = St.layout || {}, rot = L.rotY || 0, z = oz + (L.z ?? 4.85), xs = L.doorsX || {};
    buildFacade(St, ox, oz); buildTrain(St, ox, oz); buildDesk(St, ox, oz); buildThreshold(St, ox, oz);
    (St.doors || []).forEach((def) => { const x = ox + (xs[def.id] ?? 11); const built = themedDoor(root, x, 0, z, rot, def); const sz = z + 1.15;
      const d = { ...built, lx: x, lz: z, y: 0, spawn: { x, z: sz, y: 0, yaw: yawTo(0, z - sz) } }; d.disc.userData.run = () => openStationDoor(d); d.disc.userData.maxD = 4.5; stationDoors.push(d); });
    if (St.departures && L.board) { const g = new THREE.Group(); g.position.set(ox + L.board.x, 0, oz + L.board.z); g.rotation.y = L.board.rotY ?? 0; root.add(g);
      box(0, 0.7, 0, 0.08, 1.4, 0.08, sm("#4a4030"), g); box(0, 1.7, 0.02, 1.15, 0.9, 0.05, sm("#1a1c16"), g);
      cplane(M("t:dep", () => depTex(St)), 1.1, 0.78, 0, 1.7, 0.05, 0, g);
      const bdisc = hiddenDisc(g, 0, 1.7, 0.08, 0.55); bdisc.userData.run = () => openDepartures(); bdisc.userData.maxD = 4.5;
      departBoard = { g, disc: bdisc, lx: ox + L.board.x, lz: oz + L.board.z }; }
    addStationBlockers(); }
  function openDepartures() { const St = D.station, rows = stationRows(St); panel("departures", `📋 ${St.departures.title}`, (pn) => { pn.appendChild(el("p", "o3-small", St.departures.subtitle || ""));
    rows.forEach((r) => { pn.appendChild(el("p", "o3-riddle", `${r.name} ${r.code || "???"} — ${r.status || ""}${r.note ? " · " + r.note : ""}`)); pn.appendChild(el("p", "o3-small", r.clickable ? "" : "Not boarding. No connection from here yet.")); }); }); }
  function openStationDoor(d) { if (!transformed) return nudge(true); if (!doorIsOpen(d.def)) { panel("sdoor-" + d.def.id, "🚪 ???", (pn) => { pn.appendChild(el("p", "o3-riddle", D.station.lockedLabel)); }); host.toast(D.station.lockedToast); return; }
    const dest = d.def.dest || {}; if (dest.type === "instance" && dest.id === "starter") return openStarter(d);
    if (dest.type === "instance" && dest.id === "grotto") return openGrotto(d);
    if (dest.type === "instance" && dest.id) { const gt = (D.gates || []).find((q) => q.instance === dest.id || q.id === dest.id);
      if (gt) return openGate({ pp: { ...gt, gate: true }, i: startSec.center[0], j: startSec.center[1], spawn: d.spawn });
      return enterInstance({ pp: { id: d.def.id, instance: dest.id }, i: startSec.center[0], j: startSec.center[1], spawn: d.spawn }); }
    if (dest.type === "external") { host.toast("Delayed."); return; } host.toast(D.station.lockedToast); }
  function stationDoorList() { return stationDoors.map((d) => ({ id: d.def.id, open: doorIsOpen(d.def), dest: d.def.dest, theme: d.def.theme.name, sign: doorIsOpen(d.def) ? d.def.theme.sign : "???", ...W3(d.lx, 0, d.lz), spawn: { ...W3(d.spawn.x, 0, d.spawn.z), yaw: d.spawn.yaw } })); }
  function trainInfo() { return trainProp && { x: trainProp.lx, z: trainProp.lz, z0: trainProp.z0, z1: trainProp.z1, platformX: trainProp.platformX, sign: comingSign && { ...W3(comingSign.lx, 0, comingSign.lz), label: comingSign.label }, board: departBoard && W3(departBoard.lx, 0, departBoard.lz) }; }
  function thresholdInfo() { return threshProp && { ...W3(threshProp.lx, 0, threshProp.lz), label: threshProp.label }; }
  function deskInfo() { return deskProp && { ...W3(deskProp.lx, 0, deskProp.lz), label: deskProp.label }; }


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
    if (S.character) S.character.hp = clamp(S.character.hp || 1, 1, maxHp()); trainSnap = null; sandboxUsed = false; sbParty = 0; sbTurnBased = null; abilityUsed = false; footArmed = false; save(); renderBar(); renderTip(); }
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
    party: (n) => { if (!isTraining()) return false; if (battle.active()) battle.end("left"); sandboxUsed = true; sbParty = clamp(n | 0, 1, D.party.max); spawnInstance(inst.id); renderBar(); host.updateActions(); addLog(`🧪 Party size ${partySize()} (room re-spawned)`, "sys"); return partySize(); },
    force: (arr) => { forced.length = 0; (arr || []).forEach((v) => { v = v | 0; if (v >= 1 && v <= 20) forced.push(v); }); addLog(`🧪 Next d20s forced: ${forced.join(", ") || "(none)"}`, "sys"); return forced.slice(); },
    reset: () => { if (!isTraining()) return false; if (battle.active()) battle.end("left"); spawnInstance(inst.id); host.updateActions(); return inst.mobs.length; },
    heal: () => { const c = CH(); if (!c) return; c.hp = maxHp(); renderBar(); },
    // v5b+: turn-based in the closet (null = follow the JSON flag) and "fight everything at once"
    turnBased: (v) => { if (!isTraining()) return null; sandboxUsed = true; sbTurnBased = v === null || v === undefined ? null : !!v; addLog(`🧪 Turn-based ${turnBasedHere() ? "ON" : "OFF (real-time)"} in here`, "sys"); host.updateActions(); return turnBasedHere(); },
    battleAll: () => { if (!isTraining() || battle.active()) return false; const foes = inst.mobs.filter((m) => !m.dead && m.zone === inst.zone); if (!foes.length) return false; sandboxUsed = true; host.closePanel?.(); if (!turnBasedHere()) { addLog("🧪 Turn-based is off (party size > 1 or toggled off), so this stays real-time.", "sys"); return false; } startBattle(foes, inst.zone); return foes.length; },
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
      row("Battles", btn(turnBasedHere() ? "Turn-based: ON" : "Turn-based: OFF", "sb-tb", (e) => { SB.turnBased(!turnBasedHere()); e.target.textContent = turnBasedHere() ? "Turn-based: ON" : "Turn-based: OFF"; }), btn("⚔️ Fight everything", "sb-battle-all", () => SB.battleAll()));
      row("Me", btn("Full HP", "sb-heal", () => SB.heal()), btn("Knock me out", "sb-ko", () => { host.closePanel(); knockout("sandbox"); }));
    }, { wide: true }); }

  // ---------- gentle nudges before you transform ----------
  let curZone = null, lastP = { x: 0, z: 0 }, nudgeShown = 0;
  function nudge(force) { const now = Date.now(); if (!force && now - nudgeShown < 4000) return; nudgeShown = now; nudges++; host.toast(D.nudge.text); }

  // ---------- per frame ----------
  function update(dt, ts, p, st) { if (!D) return; lastP = p; curZone = st.zone; cd = Math.max(0, cd - dt); const busy = st.busy || koBusy; if (inst.active && !mapEl.hidden) { revealMap(st.zone); placeMinimap(); drawMinimap(); }
    circles.forEach((c) => { c.ring.rotation.z = ts * 0.4; c.disc.material.emissiveIntensity = transformed ? 0.2 : 0.45 + Math.sin(ts * 2.2) * 0.2; const d = Math.hypot(c.x - p.x, c.z - p.z), lvl = Math.abs((c.y || 0) - st.feet) < 1.2;
      if (lvl && d < 0.8 && !c.inside) { c.inside = true; if (!busy && !transformed) openCircle(); } else if (d > 1.4) c.inside = false; });
    if (!transformed && !inst.active) { const zc = /^annex:c:(-?\d+),(-?\d+):/.exec(st.zone || ""); const atStart = !zc || (+zc[1] === startSec.center[0] && +zc[2] === startSec.center[1]);
      if (!atStart && !busy) { if (!leftStart) { leftStart = true; nudge(); nudgeT = 0; } nudgeT += dt; if (nudgeT > D.nudge.every) { nudgeT = 0; nudge(); } } else nudgeT = 0; }
    const yaw = host.state().yaw; let fighting = null; const holdMobs = !!rangeCfg() && turnBasedHere(); const bBusy = busy || battle.active() || holdMobs;
    const tickList = (list, ox, oz) => list.forEach((m) => { if (tickMob(m, dt, ts, p.x - ox, p.z - oz, st.zone, bBusy, yaw)) fighting = m; });
    // v5b: remember where you were in the previous zone (the spot "Flee" puts you back to)
    if (st.zone !== trackZone) { if (trackSpot && trackZone) prevSpot = trackSpot; trackZone = st.zone; } if (!battle.active()) trackSpot = { x: p.x, z: p.z, yaw, y: st.feet || 0, zone: st.zone };
    if (!busy && !battle.active() && transformed && CH() && turnBasedHere() && performance.now() > tbGraceUntil) { const foes = rangeFoes(p, st.zone) || battleFoes(st.zone); if (foes.length) startBattle(foes, st.zone); }
    tportals().forEach((tp) => (tp.disc.rotation.z = -ts * 1.5)); sportals().forEach((tp) => (tp.disc.rotation.z = ts * 1.2));
    stationDoors.forEach((d) => { if (d.def.theme.wobble && doorIsOpen(d.def)) d.g.rotation.z = 0.012 + Math.sin(ts * 1.1) * 0.008; });
    if (inst.active) { tickList(inst.mobs, IX, IZ); inst.exit.disc.rotation.z = -ts * 1.5; inst.drops.forEach((d) => { if (!d.taken) d.b.rotation.y = ts * 2; }); }
    else { for (let q = gmMobs.length - 1; q >= 0; q--) { const m = gmMobs[q]; if (!m.ch.gmRoot && !chunks.has(m.ch.key)) { gmMobs.splice(q, 1); continue; } tickList([m], m.ch.lx, m.ch.lz); } }
    if (!inst.active) chunks.forEach((ch) => { const r = ch.rpg; if (!r) return; if (r.mobs.length) tickList(r.mobs, ch.lx, ch.lz);
      const dr = r.door; if (dr && dr.swing > 0 && dr.swing < 1) { dr.swing = Math.min(1, dr.swing + dt * 2.5); dr.g.scale.y = Math.max(0.001, 1 - dr.swing); if (dr.swing >= 1) dr.g.visible = false; }
      [r.box, r.box2].forEach((b) => { if (b && !b.opened) { b.spark.position.y = 0.75 + Math.sin(ts * 2) * 0.05; b.spark.rotation.y = ts * 2; } });
      if (r.portal) r.portal.disc.rotation.z = -ts * 1.5; r.drops.forEach((d) => { if (!d.taken) { d.b.rotation.y = ts * 2; d.b.position.y = 0.4 + Math.sin(ts * 3) * 0.05; } }); });
    if (inst.active && inst.id === "grotto") grotto?.update?.();
    if (fighting) { const grp = fighting.ch ? fighting.ch.key : "inst"; if (grp !== fightGroup) { fightGroup = grp; abilityUsed = false; footArmed = false; fightReset(); renderBar(); } }
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
    sportals().forEach((tp) => cand("rpg:starter" + (transformed ? "" : ":n"), Math.hypot(tp.lx - p.x, tp.lz - p.z), 2.2, transformed ? `🗡 ${D.instances.starter.name} (solo · real XP · level ${(D.instances.starter.levelRange || [1, 3]).join("–")})` : `🗡 ${D.instances.starter.short} (step into the entrance circle first)`, () => openStarter(tp)));
    stationDoors.forEach((d) => { const open = doorIsOpen(d.def), name = open ? d.def.theme.name : "???"; cand("rpg:sdoor:" + d.def.id + (transformed && open ? "" : ":n"), Math.hypot(d.lx - p.x, d.lz - p.z), 2.2, transformed ? (open ? `🚪 ${name}` : "🚪 ??? (sealed)") : `🚪 ${name} (step into the entrance circle first)`, () => openStationDoor(d)); });
    if (departBoard && !inst.active && feet < 1) cand("rpg:departures", Math.hypot(departBoard.lx - p.x, departBoard.lz - p.z), 1.9, D.station.departures.label, openDepartures);
    if (comingSign && !inst.active && feet < 1) cand("rpg:trainsign", Math.hypot(comingSign.lx - p.x, comingSign.lz - p.z), 1.9, comingSign.label, openTrainSign);
    if (threshProp && !inst.active && feet < 1) cand("rpg:threshold", Math.hypot(threshProp.lx - p.x, threshProp.lz - p.z), 2.0, threshProp.label, openThreshold);
    if (deskProp && !inst.active && feet < 1) cand("rpg:checkin", Math.hypot(deskProp.lx - p.x, deskProp.lz - p.z), 1.8, deskProp.label, openDesk);
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
      if (r.portal) { if (r.portal.pp.gate && Math.hypot(r.portal.lx - p.x, r.portal.lz - p.z) < 8) maybeDiscover(r.portal.pp); cand("rpg:portal:" + r.portal.pp.id + (transformed ? "" : ":n"), Math.hypot(r.portal.lx - p.x, r.portal.lz - p.z), 2.4, r.portal.pp.gate ? (transformed ? `🚪 Gate (solo · level ${D.instances[r.portal.pp.instance].level})` : "🚪 A gate (step into the entrance circle first)") : transformed ? "🌀 Party portal (1–3 explorers)" : "🌀 Party portal (step into the entrance circle first)", () => openPortal(r.portal)); } }); }
  function deliver() { const c = CH(), i = c?.inv.indexOf("parcel") ?? -1; if (i < 0) return false; c.inv.splice(i, 1); audio.sfx("pick"); host.toast(D.outbox.done); progress("fetch"); save(); return true; }
  function clickTargets() { if (!D) return []; const out = circles.map((c) => c.disc); tportals().forEach((tp) => out.push(tp.disc)); sportals().forEach((tp) => out.push(tp.disc)); stationDoors.forEach((d) => out.push(d.disc)); if (departBoard?.disc) out.push(departBoard.disc); if (comingSign?.disc) out.push(comingSign.disc); if (threshProp?.disc) out.push(threshProp.disc); if (deskProp?.disc) out.push(deskProp.disc); if (inst.active) { inst.mobs.forEach((m) => !m.dead && out.push(m.hitMesh)); out.push(inst.exit.disc); return out; }
    gmMobs.forEach((m) => !m.dead && out.push(m.hitMesh)); chunks.forEach((ch) => { if (!ch.rpg) return; ch.rpg.mobs.forEach((m) => !m.dead && out.push(m.hitMesh)); if (ch.rpg.portal) out.push(ch.rpg.portal.disc); }); return out; }

  // ---------- panels ----------
  function openSheet() { const c = CH(); if (!c) return; const P = pathOf(), L = level(), w = weapon(), K = clsOf();
    panel("sheet", `📜 ${c.name}`, (pn) => {
      pn.appendChild(el("p", "o3-small", `Level ${L} ${K.icon} ${K.name} · ${P.icon} ${P.name} background · d${K.die} hit die · saves ${K.saves.map((x) => D.stats.find((q) => q.id === x).name).join(" + ")} · XP ${c.xp}${D.levels.xp[L] != null ? " / " + D.levels.xp[L] : " (max level)"} · proficiency ${sg(prof())}`));
      pn.appendChild(el("p", null, `❤️ HP ${c.hp}/${maxHp()} · 🛡 AC ${ac()} · ⚔️ ${w.name}: d20${sg(atkBonus())} to hit, d${w.die}${sg(dmgMod())} damage`));
      const t = el("div", "o3-stats"); D.stats.forEach((s) => { const r = el("div", "o3-statrow"); r.dataset.stat = s.id; const v = stat(s.id);
        r.append(el("span", "o3-sname", `${s.icon} ${s.name}`), el("b", null, String(v)), el("span", "o3-sfinal", `${sg(mod(v))}${P.prof.includes(s.id) ? " · proficient " + sg(mod(v) + prof()) : ""}`), el("span", "o3-small o3-sabout", s.about)); t.appendChild(r); }); pn.appendChild(t);
      if (c.keepsake) pn.appendChild(el("p", "o3-note o3-ks", `${c.keepsake.icon || "✨"} Keepsake: ${c.keepsake.name}. Keep it close. It's never lost in a fight.`));
      const rs = Object.entries(K.resources || {}).filter(([id]) => resMax(id) > 0).map(([id, r]) => `${r.icon} ${r.name} ${resNow(id)}/${resMax(id)} (${r.recharge === "breather" ? "back each Breather" : r.breatherGain ? "+" + r.breatherGain + " per Breather, all at a Full Rest" : "back at a Full Rest"})`);
      if (rs.length) pn.appendChild(el("p", "o3-small", rs.join(" · "))); if (c.tmp) pn.appendChild(el("p", "o3-small", `✒️ Temporary HP: ${c.tmp}`));
      const fl = el("div", "o3-feats"); (K.features || []).filter((f) => f.lvl <= Math.max(L, 5)).forEach((f) => fl.appendChild(el("div", "o3-note" + (f.lvl > L ? " o3-locked" : ""), `${f.lvl > L ? "🔒 L" + f.lvl + " · " : ""}${f.name}: ${f.text}`))); pn.appendChild(fl);
      if (K.later) pn.appendChild(el("p", "o3-small", `Later: ${K.later}`));
      pn.appendChild(el("p", "o3-small", `${P.icon} ${P.name}: ${P.perk || P.ability.text} · ⏱ turn gauge ${turnFill().toFixed(1)}s (from your ${D.stats.find((q) => q.id === K.primary).name})`));
      if (D.companion) { const on = companionOn(); pn.appendChild(el("p", "o3-small", D.companion.blurb)); const tb = el("button", "o3-btn" + (on ? "" : " ghost"), on ? D.companion.toggleOn : D.companion.toggleOff); tb.dataset.rpg = "companion-toggle"; tb.onclick = () => { setCompanion(!companionOn()); host.closePanel(); openSheet(); }; pn.appendChild(tb); }
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
    buildBoard(); buildStation();
    const sc = startSec.center; buildCircle(sc[0] * C + 5.0, sc[1] * C + 12.0, 0, "start"); if (OV) buildCircle(OV.x0 + 3.2, OV.z1 - 1.6, OV.y, "overlook"); buildOverlookTraining();
    chunks.forEach((ch) => onCell(ch)); refreshBlockers(); }
  let grotto = attachGrottoRun({
    host, el, audio, AX, AZ, IX, IZ, ext, THREE,
    CH, save, giveItem, item, partySize, seedFn: seed, roll,
    openSheet, leaveInstance: () => leaveInstance(), rest, maxHp,
    heal: (n) => { const c = CH(); if (!c) return 0; const h0 = c.hp; c.hp = Math.min(maxHp(), c.hp + Math.max(1, n | 0)); save(); renderBar(); return c.hp - h0; },
    lastPos: () => lastP, extras: () => inst.extras, pushExtra: (x) => inst.extras.push(x),
    caveRoom: (I, id) => caveRoom(I || D?.instances?.grotto, id), selfId: () => ext.selfId?.() || host.me?.id || "me",
    startBeatFight, ensureItem: (id, rec) => { if (D && rec && !D.items[id]) D.items[id] = rec; },
    markBoss: markGrottoBoss,
  });
  const ready = fetch("data/annex-rpg.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { D = d; S.cards = Array.isArray(S.cards) ? S.cards : []; if (S.character) { migrate(S.character); save(); } init(); } return !!d; }).catch(() => false);

  const roomLabel = (z) => { const I = D?.instances[inst.id]; if (I?.layout === "run" || I?.layout === "cave") { const k = /:run:(\d+)$/.exec(z || curZone || ""); const stp = k ? I.steps[+k[1]] : null; if (stp) return `${I.short || I.name} · ${stp.name}`; if (I.layout === "cave") { const rm = caveRooms(I).find((r) => caveZone(r) === (z || curZone)); return `${I.short || I.name} · ${rm ? rm.label : "the mouth"}`; } return `${I.short || I.name} · the entrance`; } if (I?.solo) return `${I.name} · solo · level ${I.level}`; return roomLabel0(); };
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
      inInstance: inst.active, instance: inst.id, partySize: partySize(), urlParty, party: JSON.parse(JSON.stringify(party)), lastAttack, lastKO, lastLevelUp, lastDoor, nudges, inTraining: isTraining(), trainXP, tip: tipIdx, tipShown: !tipEl.hidden, sandboxOn: sandboxAllowed(), sandboxUsed, sbParty, training: { ...TR(), tips: undefined, portals: undefined }, koBusy, footArmed, abilityUsed, cls: c ? c.cls : null, res: c ? Object.fromEntries(Object.keys(clsOf()?.resources || {}).map((k) => [k, { now: resNow(k), max: resMax(k) }])) : null, fight: { ...F }, turnFill: c ? turnFill() : 0, abilities: c ? abilityList() : [], log: logs.slice(-8).map((l) => l.t), barShown: !bar.hidden, cd, openKind }; },
    create: (b) => createChar({ method: "array", ...b }), transform: () => transform(false),
    logs: (n = 12) => logs.slice(-n).map((q) => q.t), fight: () => JSON.parse(JSON.stringify(F)),
    turnFill: () => (CH() && D ? turnFill() : null), res: (id) => ({ now: resNow(id), max: resMax(id) }), abilities: () => abilityList(), hasFeature: (f) => has(f), sheetText: () => { openSheet?.(); const p = document.querySelector(".o3-panel:not([hidden])"); return p ? p.innerText : ""; },
    classes: () => D && { order: classIds(), list: CLS() }, useAbility: (id, mobId) => { const m = mobId ? findMob(mobId) : null; return useAbility(m || undefined, id); }, rest: (k) => rest(k), breather: (t) => breather(t), repick: (id) => repickClass(id),
    migrate: (c) => migrate(c), canWear: (id) => canWear(id), equip: (id) => equip(id), give: (id) => giveItem(id, true), useItem: (id) => useItem(id),
    keepsake: { info: () => CH()?.keepsake || null, next: (st, ev) => ksNext(st, ev), act: (ev, o) => ksAct(ev, o), trapped: () => ksTrapped(), config: () => KL() },
    setFight: (o) => Object.assign(F, o || {}), knockoutTrap: (rescue) => knockout(null, null, { trap: true, rescue }), reset: () => { S = blank(); save(); transformed = false; setPlayerName(null); renderBar(); },
    plan: (pl) => rpgPlan(pl), scaled: (k, t) => { const s = scaled(k, t); delete s.def; return s; }, circle: (id = "start") => { const c = circles.find((q) => q.id === id); return c && { ...W3(c.x, c.y, c.z) }; },
    mobs: () => { const out = []; const f = (m) => { const w = mobWorldLocal(m); out.push({ id: m.id, kind: m.kind, name: m.name, hp: m.hp, maxHp: m.maxHp, ac: m.ac, atk: m.atk, dmgB: m.dmgB, xp: m.xp, dead: m.dead, state: m.state, zone: m.zone, boss: !!m.boss, y: w.y ?? m.g?.position?.y ?? 0, ...W3(w.x, w.y ?? m.g?.position?.y ?? 0, w.z) }); };
      chunks.forEach((ch) => ch.rpg?.mobs.forEach(f)); inst.mobs.forEach(f); gmMobs.forEach(f); return out.map((o) => ({ ...o, gm: String(o.id).startsWith("gm:") })); },
    hallwayMobs: () => { let n = 0; chunks.forEach((ch) => ch.rpg?.mobs.forEach((m) => { if (!/:r\d$/.test(m.zone)) n++; const gp = m.g.position; if (gp.x < m.rect.x0 - 0.01 || gp.x > m.rect.x1 + 0.01 || gp.z < m.rect.z0 - 0.01 || gp.z > m.rect.z1 + 0.01) n++; })); return n; },
    attack: (id) => { const m = findMob(id); if (!m) return null; cd = 0; return attackMob(m, true); },
    kill: (id) => { const m = findMob(id); if (!m) return false; m.hp = 0; killMob(m); return true; },
    addXP: (n) => gainXP(n, "debug", null, true), raise, setHP: (n) => { CH().hp = n; save(); renderBar(); }, hurt: (n) => hurt(n, "test"), ko: (force, speed = 1) => { koSpeed = speed; knockout("test", force); }, koSpeed: (v) => { koSpeed = v; },
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
  debug.battle = () => battle.state(); debug.battleSpeed = (v) => { battleSpeed = v; battle.setSpeed(v); return v; }; debug.lastBattle = () => lastBattle && { ...lastBattle };
  debug.battleCmd = (sel) => { const b = document.querySelector(`[data-btl="${sel}"]`); if (!b) return false; b.click(); return true; };
  debug.holdBattles = (on) => { tbGraceUntil = on ? performance.now() + 1e9 : 0; return tbGraceUntil; };
  debug.setCompanion = (on) => setCompanion(!!on); debug.companion = () => companionInfo(); debug.forcePartySize = (n) => { forcedPartySize = Math.max(0, n | 0); return forcedPartySize; };
  debug.minimap = () => minimapState(); debug.cave = () => { const I = D.instances.grotto || D.instances[inst.id]; if (!I?.cave) return null; return { id: inst.id, rooms: caveRooms(I).map((r) => ({ ...r, zone: caveZone(r), annex: { x: IX + r.x, z: IZ + r.z, y: r.y, y1: r.y1 } })), spawn: I.spawn, explored: [...mapExplored] }; };
  debug.resetInstance = (id) => resetInstanceProgress(id || inst.id); debug.ownsItem = (id) => ownsItem(id);
  debug.takeInstDrops = () => { (inst.drops || []).forEach((d) => { if (!d.taken) takeDrop(d); }); return (CH()?.inv || []).slice(); }; debug.IX = IX; debug.IZ = IZ;
  debug.turnBasedHere = () => turnBasedHere(); debug.battleMode = () => (inst.active ? battleModeOf(D.instances[inst.id]) : (D.combat?.turnBasedEverywhere ? "atb-turns" : "realtime")); debug.zone = () => curZone; debug.avatarUrl = () => avatarUrl(); debug.heroInfo = () => (CH() ? heroInfo() : null); debug.data = debug.data || (() => D); debug.setAvatar = (u) => { const c = CH(); if (!c) return false; c.avatar = u || null; save(); return true; };
  debug.sandbox = () => { sandboxOn = true; host.updateActions(); if (isTraining()) openSandbox(); else host.toast("🧪 Sandbox armed. It opens inside the Training Closet."); return sandboxAllowed(); };
  const api5 = { musicState: () => ({ inst: inst.active ? inst.id : null, fight: !!(fightGroup || battle.active()), boss: !!(battleBoss && battle.active()) }), ext, gmSpawn, gateWaystones, travelWaystone, waystoneList, enterInstance: (p) => enterInstance(p), leaveInstance: () => leaveInstance(), data: () => D, instId: () => (inst.active ? inst.id : null), isControl, partySize: () => partySize(),
    party: () => ({ id: party.id, members: party.members.map((m) => ({ ...m })), max: D?.party?.max || 3 }),
    setParty: (id, members) => { party.id = id || null; const mine = { id: host.me?.id || "me", me: true }; party.members = [mine, ...(members || []).filter((m) => m.id !== mine.id)].slice(0, D?.party?.max || 3); return party.members.length; },
    lastPos: () => ({ ...lastP }), zone: () => curZone, applyRunProgress, roomAt, grotto: () => grotto,
    // v6 hooks used by annex.js (Grenshol help/carry, traps, stable places, Common Record, practice pad)
    has: (f) => !!CH() && has(f), hpFrac: () => (CH() && transformed ? CH().hp / Math.max(1, maxHp()) : 1),
    heal: (n) => { const c = CH(); if (!c || !transformed) return 0; const h0 = c.hp; c.hp = Math.min(maxHp(), c.hp + Math.max(1, n | 0)); save(); renderBar(); return c.hp - h0; },
    doorFound: (id) => !!CH()?.discovered?.[id], discoverDoor: (id) => markDiscovered(id), giveItem: (id) => giveItem(id, true), breather: (t) => breather(t),
    knockoutTrap: (rescue) => knockout(null, null, { trap: true, rescue }),
    doorsSummary: () => (D?.station?.doors || []).map((d) => ({ id: d.id, name: d.theme?.name || d.id, open: doorIsOpen(d), where: d.dest?.type === "instance" ? "through the Door Station" : "" })),
    practiceSwing: (ac) => { const c = CH(); if (!c) return null; if (!transformed) return "Step into your Annex self first (the crystal), then take a swing."; const wp = weapon(), r = resolveAttack(atkBonus(), ac, false), dd = [1, wp?.die || 4, 0];
      const dmg = r.hit ? Math.max(1, rollN(dd[0] * (r.crit ? 2 : 1), dd[1]).s + (dd[2] || 0) + mod(stat(wp?.stat || "brawn"))) : 0;
      const t = `🎯 ${r.d20}${r.bonus >= 0 ? "+" : ""}${r.bonus} = ${r.total} vs AC ${ac} · ${r.crit ? "critical!" : r.hit ? "hit" : r.fumble ? "natural 1" : "miss"}${r.hit ? ` · ${dmg} damage` : ""} (practice: nothing counts)`; addLog(t, r.hit ? "hit" : "miss"); return t; }, sandboxOpen: () => openSandbox(), spawnHere: (k, t) => SB.spawn(k, t), statsFor: (k, t) => { const s = statsFor(k, t); if (s) delete s.def; return s; } };
  debug.runProgress = runProgress; debug.enterStarter = () => enterStarter(); debug.enterGrotto = () => enterGrotto(); debug.grotto = () => grotto; debug.grottoRun = () => grotto?.state?.(); debug.applyRunProgress = applyRunProgress; debug.roomAt = roomAt; debug.cards = () => (S.cards || []).slice(); debug.starterDoor = () => { const tp = sportals()[0]; return tp && { ...W3(tp.lx, 0, tp.lz), spawn: { ...W3(tp.spawn.x, 0, tp.spawn.z), yaw: tp.spawn.yaw } }; };
  debug.stationDoors = () => stationDoorList(); debug.stationDoor = (id) => stationDoorList().find((d) => d.id === (id || "sd-mailroom")); debug.departures = () => D.station && { ...D.station.departures, rows: stationRows(D.station), stations: stationRows(D.station), board: departBoard && W3(departBoard.lx, 0, departBoard.lz) }; debug.openDepartures = openDepartures;
  debug.stations = () => stationRows(D.station); debug.train = () => trainInfo(); debug.threshold = () => thresholdInfo(); debug.desk = () => deskInfo(); debug.stationLayout = () => ({ doors: stationDoorList(), train: trainInfo(), threshold: thresholdInfo(), desk: deskInfo() });
  debug.discover = (id) => markDiscovered(id || "gate-turn"); debug.openStationDoor = (id) => { const d = stationDoors.find((q) => q.def.id === (id || "sd-mailroom")); if (d) openStationDoor(d); return !!d; };
  debug.enterStation = (id) => { const d = stationDoors.find((q) => q.def.id === (id || "sd-mailroom")); if (!d || !doorIsOpen(d.def)) return null; const dest = d.def.dest || {}; if (dest.id === "starter") return enterStarter(d); if (dest.type === "instance" && dest.id) { const gt = (D.gates || []).find((q) => q.instance === dest.id || q.id === dest.id); return enterInstance({ pp: gt ? { ...gt, gate: true } : { id: d.def.id, instance: dest.id }, i: startSec.center[0], j: startSec.center[1], spawn: d.spawn }); } return null; };
  debug.doorIsOpen = (id) => { const d = stationDoors.find((q) => q.def.id === id) || (D.station?.doors || []).find((q) => q.id === id); return d ? doorIsOpen(d.def || d) : false; };
  debug.gateWaystones = gateWaystones; debug.travelWaystone = travelWaystone; debug.xpScale = (l) => xpScale(l); debug.board = () => board && W3(board.lx, 0, board.lz); debug.openBoard = openBoard;
  debug.enterGate = (id) => { const gt = (D.gates || []).find((q) => q.id === (id || D.gates[0].id)); const Sx = ctx.secById[gt.section]; const i = Sx.center[0] + gt.cell[0], j = Sx.center[1] + gt.cell[1]; return enterInstance({ pp: { ...gt, gate: true }, i, j }); };
  debug.use = (id) => useItem(id); debug.lastPos = api5.lastPos; debug.gates = () => [...portalByCell.entries()].filter(([, pp]) => pp.gate).map(([k, pp]) => ({ id: pp.id, k })); debug.gmSpawn = gmSpawn; debug.party5 = api5.party; debug.setParty = api5.setParty;
  return { onCell, update, near, clickTargets, talkExtras, event, onArrive, onLeave, inInstance: () => inst.active, blockedLocal: (x, z) => !!(inst.active && inst.blockers && inst.blockers.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)), roomLabel, atmos, instButtons, debug, ready, transformed: () => transformed, ...api5 };
}
