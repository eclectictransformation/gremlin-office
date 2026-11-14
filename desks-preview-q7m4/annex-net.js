// Elsewhere Annex v5: multiplayer link (Eclectic Transformation · Gremlin Desks only, private team service).
// Real mode: Supabase Realtime PRIVATE channels, authorised by RLS on realtime.messages (migration 011_annex_multiplayer.sql):
//   "annex"    : presence (where everyone is) + party chatter. Active staff may read + write.
//   "annex-gm" : game-master commands (spawn in front of a player, notes). Staff may READ; only is_admin() (admin + two-step aal2) may WRITE.
//                The server enforces that when the channel is joined, so a non-admin can't send GM commands even with a hacked page.
//   "annex-chat": typed chat + push-to-talk voice clip links (migration 013). Staff read; staff who aren't muted may send.
// Admin role: public.annex_whoami() answers from the database (profiles.is_admin AND an aal2 session). The page never trusts a password.
// Demo mode (?demo=1, localhost only): no network. You are a fake admin (add &as=player to be a normal player) and two fake
// teammates (Vince, Juhani) wander the first hallways so the map, figures, parties and spawn-in-front can be tested offline.
export function createNet({ sb, me, demo, isLocal }) {
  const listeners = { players: [], gm: [], party: [], status: [], chat: [], voice: [] };
  const emit = (k, v) => listeners[k].forEach((f) => { try { f(v); } catch (e) { console.error(e); } });
  const asPlayer = (() => { try { return /[?&]as=player\b/.test(location.search); } catch { return false; } })();
  const N = { status: "off", admin: false, adminChecked: false, players: new Map(), selfId: me?.id || "me", selfName: me?.display_name || "you", demo: !!demo, log: [] };
  let annexCh = null, gmCh = null, chatCh = null, lastTrack = 0, lastSent = null, joined = false;
  const setStatus = (s) => { N.status = s; emit("status", s); };

  // ---------- who am I (server-side answer) ----------
  async function checkAdmin() {
    if (demo) { N.admin = !!isLocal && !asPlayer; N.adminChecked = true; return N.admin; }
    if (!sb) { N.admin = false; N.adminChecked = true; return false; }
    try { const { data, error } = await sb.rpc("annex_whoami"); N.admin = !error && !!data?.admin; if (data?.name) N.selfName = data.name; N.mutedUntil = data?.muted_until ? Date.parse(data.muted_until) : 0; }
    catch { N.admin = false; }
    N.adminChecked = true; return N.admin;
  }

  // ---------- fake teammates (demo only) ----------
  const fakes = [];
  // v5b: avatar billboards. Only our own static sprite paths are accepted from presence (never an arbitrary URL).
  const AV_OK = /^assets\/avatars\/[a-z0-9_-]{1,40}\.(webp|png)$/;
  const cleanAv = (v) => (typeof v === "string" && AV_OK.test(v) ? v : null);
  const fakeAv = (() => { try { return /[?&]fakeav=1\b/.test(location.search); } catch { return false; } })();
  function startFakes(world) {
    if (fakes.length || !world) return; const C = world.C, C2 = C / 2, c0 = world.start;
    [["a", "Vince", [c0[0] + 1, c0[1]]], ["c", "Juhani", [c0[0], c0[1] + 1]]].forEach(([id, name, cell], k) => {
      const f = { id, name, x: cell[0] * C + C2, z: cell[1] * C + C2, y: 0, cell: cell.slice(), to: null, speed: 1.3 + k * 0.25, inst: null, portal: null, party: null, wait: k * 1.5, got: [], fake: true, av: fakeAv && id === "a" ? "assets/avatars/bryan.webp" : null };
      fakes.push(f); });
    N.fakeTick = (dt) => fakes.forEach((f) => {
      if (f.hold) return; if (f.wait > 0) { f.wait -= dt; return; }
      if (!f.to) { const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [f.cell[0] + a, f.cell[1] + b]).filter(([i, j]) => Math.abs(i - c0[0]) <= 2 && Math.abs(j - c0[1]) <= 2);
        f.cell = nb[Math.floor(Math.random() * nb.length)]; f.to = { x: f.cell[0] * C + C2, z: f.cell[1] * C + C2 }; }
      const dx = f.to.x - f.x, dz = f.to.z - f.z, d = Math.hypot(dx, dz), s = Math.min(d, f.speed * dt);
      if (d < 0.05) { f.to = null; f.wait = 0.8 + Math.random() * 2; return; } f.x += dx / d * s; f.z += dz / d * s; f.yaw = Math.atan2(-dx, -dz); });
  }
  function fakeState() { const out = new Map(); fakes.forEach((f) => out.set(f.id, { id: f.id, name: f.name, x: f.x, z: f.z, y: f.y, yaw: f.yaw || 0, inst: f.inst, portal: f.portal, party: f.party, av: f.av || null, fake: true, t: Date.now() })); return out; }

  // ---------- join / leave ----------
  async function join(world) {
    if (joined) return; joined = true; await checkAdmin();
    if (demo) { startFakes(world); setStatus("demo"); return; }
    if (!sb) { setStatus("offline"); return; }
    try {
      sb.realtime.setAuth();
      annexCh = sb.channel("annex", { config: { private: true, presence: { key: N.selfId }, broadcast: { self: false } } });
      annexCh.on("presence", { event: "sync" }, () => { const st = annexCh.presenceState(); N.players = new Map();
        Object.entries(st).forEach(([id, arr]) => { if (id === N.selfId) return; const v = arr[arr.length - 1]; if (v && typeof v === "object") N.players.set(id, { id, name: String(v.n || "?").slice(0, 40), x: +v.x || 0, z: +v.z || 0, y: +v.y || 0, yaw: +v.yw || 0, inst: v.in || null, portal: v.pt || null, party: v.pa || null, av: cleanAv(v.av), t: +v.t || 0 }); });
        emit("players", N.players); })
        .on("broadcast", { event: "party" }, ({ payload }) => onParty(payload))
        .subscribe((s) => { if (s === "SUBSCRIBED") { setStatus("online"); lastSent = null; } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("offline"); });
      gmCh = sb.channel("annex-gm", { config: { private: true, broadcast: { self: true, ack: true } } });
      gmCh.on("broadcast", { event: "gm" }, ({ payload }) => onGM(payload, "realtime")).subscribe(() => {});
      joinChat();
    } catch (e) { console.info("Annex multiplayer offline:", e?.message || e); setStatus("offline"); }
  }
  function joinChat() { if (demo || !sb) return; if (chatCh) { try { sb.removeChannel(chatCh); } catch {} }
    chatCh = sb.channel("annex-chat", { config: { private: true, broadcast: { self: false, ack: true } } });
    chatCh.on("broadcast", { event: "chat" }, ({ payload }) => emit("chat", payload)).on("broadcast", { event: "voice" }, ({ payload }) => emit("voice", payload)).subscribe(() => {}); }
  function leave() { joined = false; if (chatCh) { try { sb.removeChannel(chatCh); } catch {} chatCh = null; } if (annexCh) { try { annexCh.untrack(); sb.removeChannel(annexCh); } catch {} annexCh = null; } if (gmCh) { try { sb.removeChannel(gmCh); } catch {} gmCh = null; } N.players = new Map(); emit("players", N.players); setStatus("off"); }

  // ---------- my position (throttled: max ~1 update/second, only when it changed) ----------
  function track(pos) {
    if (!joined) return; const now = Date.now(); N.self = { ...pos, t: now };
    if (demo || !annexCh || N.status !== "online") return;
    const v = { n: N.selfName, x: +pos.x.toFixed(1), z: +pos.z.toFixed(1), y: +(pos.y || 0).toFixed(1), yw: +(pos.yaw || 0).toFixed(2), in: pos.inst || null, pt: pos.portal || null, pa: pos.party || null, av: cleanAv(N.selfAvatar), t: now };
    const same = lastSent && ["x", "z", "y", "in", "pt", "pa"].every((k) => lastSent[k] === v[k]);
    if (now - lastTrack < 1000 || (same && now - lastTrack < 15000)) return; lastTrack = now; lastSent = v; annexCh.track(v).catch(() => {});
  }
  function tick(dt) { if (demo && N.fakeTick) { N.fakeTick(dt); N.players = fakeState(); } }
  const players = () => (demo ? fakeState() : N.players);

  // ---------- game-master commands ----------
  // payload: { type: "spawn", to: <player id>, kind, tier, id } | { type: "note", to, text, id }
  const seen = new Set();
  function onGM(p, via) {
    if (!p || typeof p !== "object" || seen.has(p.id)) return; seen.add(p.id);
    if (via === "realtime" && !gmCh) return; // only ever acted on when it arrived on the admin-write-only channel
    N.log.push({ ...p, via, at: Date.now() }); if (N.log.length > 50) N.log.shift();
    if (demo) { const f = fakes.find((q) => q.id === p.to); if (f) { f.got.push(p); f.hold = 2.5; setTimeout(() => (f.hold = 0), 2500); } }
    emit("gm", p);
  }
  async function sendGM(cmd) {
    if (!N.admin) return { ok: false, error: "admins only" };
    const p = { ...cmd, id: Math.random().toString(36).slice(2) + Date.now().toString(36), by: N.selfId, at: Date.now() };
    if (demo) { onGM(p, "demo"); return { ok: true, demo: true, id: p.id }; }
    if (!gmCh) return { ok: false, error: "offline" };
    const r = await gmCh.send({ type: "broadcast", event: "gm", payload: p }).catch((e) => String(e));
    if (sb) sb.rpc("annex_gm_audit", { p_action: String(cmd.type), p_detail: { to: cmd.to, kind: cmd.kind || null, tier: cmd.tier ?? null } }).then(() => {}, () => {});
    return { ok: r === "ok", status: r, id: p.id };
  }

  // ---------- parties (max 3, formed only at instance portals) ----------
  // {type:"invite"|"accept"|"go"|"leave", from, fromName, to, portal, instance, members}
  function onParty(p) { if (!p || typeof p !== "object" || (p.to && p.to !== N.selfId && p.to !== "*")) return; emit("party", p); }
  function sendParty(p) {
    const msg = { ...p, from: N.selfId, fromName: N.selfName, at: Date.now() };
    if (demo) { // fake teammates say yes to invites after a moment
      const f = fakes.find((q) => q.id === p.to);
      if (f && p.type === "invite") setTimeout(() => { f.portal = p.portal; f.party = p.party; emit("party", { type: "accept", from: f.id, fromName: f.name, to: N.selfId, portal: p.portal, party: p.party, at: Date.now() }); }, 500);
      if (p.type === "go") fakes.forEach((q) => { if (q.party && q.party === p.party) q.inst = p.instance; });
      if (p.type === "leave") fakes.forEach((q) => { if (q.party && q.party === p.party) { q.party = null; q.portal = null; q.inst = null; } });
      return true; }
    if (!annexCh || N.status !== "online") return false; annexCh.send({ type: "broadcast", event: "party", payload: msg }).catch(() => {}); return true;
  }
  // ---------- chat (text + voice clip messages; the chat module decides who hears what) ----------
  async function sendChat(event, msg) {
    if (demo) { setTimeout(() => demoHear(event, msg), 0); return { ok: true, demo: true }; }
    if (!chatCh) return { ok: false, error: "offline" };
    const r = await chatCh.send({ type: "broadcast", event, payload: msg }).catch((e) => String(e)); return { ok: r === "ok", status: r }; }
  // demo: fake teammates hear you if they're in range and answer typed lines with a canned reply
  const REPLIES = ["copy that 👍", "on my way", "is that sock moving?", "lol", "one sec, reading a sign", "brb, stapler emergency"];
  let replyN = 0;
  function demoHear(event, msg) { const f = fakes.find((q) => N.demoHears ? N.demoHears(q, msg) : true); fakes.forEach((q) => { if (!N.demoHears || N.demoHears(q, msg)) q.got.push({ type: event, scope: msg.scope, text: msg.text || null, dur: msg.dur || null }); });
    if (event === "chat" && f && !N.demoQuiet) setTimeout(() => emit("chat", { id: "r" + Date.now(), from: f.id, name: f.name, scope: msg.scope, text: REPLIES[replyN++ % REPLIES.length], inst: f.inst, copy: msg.copy, party: f.party, x: f.x, z: f.z, at: Date.now() }), 700); }
  function demoSay(id, text, scope = "nearby", extra = {}) { const f = fakes.find((q) => q.id === id); if (!f) return false; emit("chat", { id: "d" + Math.random().toString(36).slice(2), from: f.id, name: f.name, scope, text, inst: f.inst, party: f.party, x: f.x, z: f.z, at: Date.now(), ...extra }); return true; }
  function demoVoice(id, clip, scope = "nearby", extra = {}) { const f = fakes.find((q) => q.id === id); if (!f) return false; emit("voice", { id: "v" + Math.random().toString(36).slice(2), from: f.id, name: f.name, scope, inst: f.inst, party: f.party, x: f.x, z: f.z, at: Date.now(), ...clip, ...extra }); return true; }

  // demo helper: walk a fake teammate to a spot (e.g. a portal) and keep them there
  function demoPlace(id, x, z, extra = {}) { const f = fakes.find((q) => q.id === id); if (!f) return false; Object.assign(f, { x, z, to: null, hold: 1e9 }, extra); return true; }
  function demoRelease(id) { const f = fakes.find((q) => q.id === id); if (f) f.hold = 0; return !!f; }

  return { N, on: (k, f) => listeners[k].push(f), join, leave, track, tick, players, sendGM, sendParty, sendChat, rejoinChat: joinChat, checkAdmin, isAdmin: () => N.admin, status: () => N.status,
    demoPlace, demoSay, demoVoice, demoRelease, fakes: () => fakes.map((f) => ({ id: f.id, name: f.name, x: f.x, z: f.z, got: f.got.slice(), party: f.party, inst: f.inst })) };
}
