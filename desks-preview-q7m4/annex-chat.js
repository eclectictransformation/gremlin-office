// Elsewhere Annex v5: chat. Typed text + push-to-talk voice clips (Eclectic Transformation · Gremlin Desks only, private team service).
// Transport: Supabase Realtime Broadcast on the PRIVATE topic "annex-chat" (RLS in migration 013: staff read, staff who aren't muted send).
// Who hears a line is decided here from its scope: nearby (same place, within ~20 m; whole room inside an instance copy) · party · instance copy · all.
// Voice: hold V (or the 🎙 button) to record up to 7 s (MediaRecorder, Opus ~24 kbps ≈ 20 KB). Real mode uploads to the private bucket
// voice-clips/<you>/<uuid>.webm, broadcasts a 2-minute signed link, and deletes the clip after 2 minutes (voice-sweep catches leftovers).
// If the upload fails a tiny clip (≤ 48 KB) goes inline as base64 instead. Clips play one at a time; nothing is archived.
// Demo (?demo=1, localhost): no network. Fake teammates hear you if in range, answer typed lines, and can "speak" a synthetic clip.
export function createChat({ net, host, el, rpg, demo, sb, me, D: getD, inControl }) {
  const CF = () => ({ nearM: 20, maxLen: 280, voiceMax: 7, voiceMin: 0.4, cooldown: 2.5, b64Max: 49152, signedSecs: 120, deleteAfter: 120, ...(getD()?.chat || {}) });
  const C = { self: { x: 0, z: 0, inst: null, party: null }, lines: [], heard: [], played: [], blocked: [], sent: [], queue: [], playing: null, rec: null, recStart: 0, coolUntil: 0, listenAll: false, open: false, scope: "nearby", inAnnex: false, lastSend: 0, mutedNote: 0 };
  const selfId = () => net.N.selfId;
  const copyOf = (inst, party, owner) => (inst ? `${inst}:${party || owner}` : null);
  const myCopy = () => copyOf(C.self.inst, C.self.party, selfId());
  const muted = () => (net.N.mutedUntil || 0) > Date.now();
  // ---------- who hears what ----------
  function hears(msg, L) { // L = listener {x, z, copy, party}
    if (msg.scope === "all") return true;
    if (msg.scope === "party") return !!msg.party && msg.party === L.party;
    if (msg.scope === "instance") return !!msg.copy && msg.copy === L.copy;
    if ((msg.copy || null) !== (L.copy || null)) return false; // nearby never leaks into another instance copy
    return L.copy ? true : Math.hypot((msg.x || 0) - L.x, (msg.z || 0) - L.z) <= CF().nearM; }
  const meL = () => ({ x: C.self.x, z: C.self.z, copy: myCopy(), party: C.self.party });
  const canHear = (msg) => hears(msg, meL()) || (C.listenAll && net.isAdmin() && inControl());
  net.N.demoHears = (f, msg) => hears(msg, { x: f.x, z: f.z, copy: copyOf(f.inst, f.party, f.id), party: f.party });

  // ---------- HUD ----------
  const box = el("div", "o3-chat"); box.dataset.ctl = "chat"; box.hidden = true; host.hud.appendChild(box);
  const log = el("div", "o3-chatlog"); box.appendChild(log);
  const bar = el("div", "o3-chatbar"); box.appendChild(bar);
  const scopeSel = el("select"); scopeSel.dataset.ctl = "chat-scope"; [["nearby", "📍 Nearby"], ["party", "🤝 Party"], ["instance", "🌀 Instance"], ["all", "📣 Everyone"]].forEach(([v, t]) => { const o = el("option", null, t); o.value = v; scopeSel.appendChild(o); });
  scopeSel.onchange = () => (C.scope = scopeSel.value);
  const input = el("input"); input.dataset.ctl = "chat-input"; input.maxLength = 280; input.placeholder = "Say something… (Enter to send, Esc to close)";
  const mic = el("button", "o3-btn ghost small", "🎙"); mic.dataset.ctl = "chat-mic"; mic.title = "Hold to talk (or hold V)";
  const hint = el("div", "o3-small o3-chathint", "Enter = chat · hold V = talk (7 s) · clips are short, not kept, and heard by people near you");
  bar.appendChild(scopeSel); bar.appendChild(input); bar.appendChild(mic); box.appendChild(hint);
  const recDot = el("div", "o3-chatrec"); recDot.dataset.ctl = "chat-rec"; recDot.hidden = true; host.hud.appendChild(recDot);
  // v5b: a 💬 toggle in the top-right tray (touch): the chat bar no longer sits on the joystick; it opens as a strip at the top
  const tgl = el("button", "o3-btn ghost o3-chattgl", "💬"); tgl.dataset.ctl = "chat-toggle"; tgl.title = "Chat (Enter)"; tgl.setAttribute("aria-label", "Chat"); tgl.hidden = true; tgl.onclick = () => setOpen(!C.open);
  (host.tray || host.hud).appendChild(tgl);
  function setOpen(v) { C.open = v; if (v) { C.unread = 0; delete tgl.dataset.unread; } box.classList.toggle("open", v); tgl.classList.toggle("on", v); if (v) { if (!matchMedia("(pointer:coarse)").matches) input.focus(); render(); } else { input.blur(); } }
  const xBtn = el("button", "o3-btn ghost small o3-chatx", "×"); xBtn.dataset.ctl = "chat-close"; xBtn.setAttribute("aria-label", "Close chat"); xBtn.onclick = () => setOpen(false);
  const sendBtn = el("button", "o3-btn small o3-chatsend", "Send"); sendBtn.dataset.ctl = "chat-send"; sendBtn.onclick = () => { const v = input.value; input.value = ""; if (v.trim()) say(v); setOpen(false); };
  bar.appendChild(sendBtn); bar.appendChild(xBtn);
  const scopeIcon = { nearby: "📍", party: "🤝", instance: "🌀", all: "📣" };
  function addLine(m, kind = "text") { const ln = { id: m.id, from: m.from, name: m.name, scope: m.scope, text: m.text, kind, at: Date.now(), me: m.from === selfId(), over: !!m.over };
    C.lines.push(ln); if (C.lines.length > 60) C.lines.shift(); if (!C.open && !ln.me) { C.unread = (C.unread || 0) + 1; tgl.dataset.unread = String(Math.min(9, C.unread)); } render(); }
  function render() { log.textContent = ""; const now = Date.now();
    C.lines.slice(-8).forEach((l) => { const d = el("div", "o3-chatline" + (l.me ? " me" : "") + (l.kind === "voice" ? " voice" : "") + (l.kind === "sys" ? " sys" : ""));
      if (!C.open && now - l.at > 20000) d.classList.add("old");
      d.appendChild(el("span", "o3-small", (scopeIcon[l.scope] || "") + (l.over ? "👂" : "")));
      if (l.kind !== "sys") d.appendChild(el("b", null, (l.me ? "You" : l.name) + ": "));
      d.appendChild(el("span", null, l.text)); log.appendChild(d); }); }
  const sys = (text) => addLine({ id: "s" + Date.now(), from: "sys", name: "", scope: "", text }, "sys");

  // ---------- typed text ----------
  async function say(text, scope = C.scope) {
    text = String(text || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, CF().maxLen); if (!text) return { ok: false, error: "empty" };
    if (muted()) { sys("🔇 You're muted by the Control Room for now."); return { ok: false, error: "muted" }; }
    if (Date.now() - C.lastSend < 700) return { ok: false, error: "slow" }; C.lastSend = Date.now();
    const msg = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), from: selfId(), name: net.N.selfName, scope, text, inst: C.self.inst, copy: myCopy(), party: C.self.party, x: +C.self.x.toFixed(1), z: +C.self.z.toFixed(1), at: Date.now() };
    addLine(msg); C.sent.push(msg);
    const r = await net.sendChat("chat", msg);
    if (!demo && sb) sb.rpc("annex_chat_log", { p_scope: scope, p_inst: C.self.inst, p_text: text }).then(({ error }) => { if (error && /muted/.test(error.message)) sys("🔇 Muted: that line didn't go out."); }, () => {});
    return r; }
  net.on("chat", (m) => { if (!m || typeof m !== "object" || m.from === selfId() || (demo && demoMuted(m.from))) return; const text = String(m.text || "").slice(0, CF().maxLen); if (!text) return;
    const near = hears(m, meL()); if (!near && !canHear(m)) return; C.heard.push({ from: m.from, scope: m.scope, text, over: !near }); addLine({ ...m, name: String(m.name || "?").slice(0, 40), text, over: !near }); });

  // ---------- push-to-talk voice ----------
  const pickMime = () => ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
  async function micStream() {
    if (!(demo && /[?&]fakemic=1\b/.test(location.search))) { try { if (navigator.mediaDevices?.getUserMedia) return { stream: await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }), real: true }; } catch (e) { if (!demo) throw e; } }
    return { stream: toneStream(440), real: false }; } // demo stand-in when there's no mic: a short hum
  let ac = null; function toneStream(f) { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(), d = ac.createMediaStreamDestination(); o.frequency.value = f; g.gain.value = 0.15; o.connect(g); g.connect(d); o.start(); d._stop = () => { try { o.stop(); } catch {} }; d.stream._stop = d._stop; return d.stream; }
  async function startTalk() {
    if (C.rec || !C.inAnnex) return false;
    if (muted()) { sys("🔇 You're muted by the Control Room for now."); return false; }
    if (C.playing || Date.now() < C.coolUntil) { sys("⏳ One at a time: wait for the clip to finish."); return false; }
    if (!window.MediaRecorder) { sys("🎙 This browser can't record clips."); return false; }
    let src; try { src = await micStream(); } catch { sys("🎙 Microphone blocked. Allow it in the browser to talk."); return false; }
    const mime = pickMime(), rec = new MediaRecorder(src.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 }), chunks = [];
    C.rec = { rec, src, chunks, mime: (mime || "audio/webm").split(";")[0], scope: C.scope, t0: performance.now() };
    rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
    rec.onstop = () => finishTalk(C.rec ? C.rec : null);
    rec.start(); recDot.hidden = false; recDot.textContent = `🔴 Talking (${({ nearby: "nearby", party: "party", instance: "instance", all: "everyone" })[C.scope]})… let go of V to send`;
    C.recTimer = setTimeout(() => stopTalk(), CF().voiceMax * 1000); return true; }
  function stopTalk() { const R = C.rec; if (!R || R.stopping) return false; R.stopping = true; R.dur = (performance.now() - R.t0) / 1000; clearTimeout(C.recTimer); try { R.rec.stop(); } catch {} return true; }
  async function finishTalk(R) { C.rec = null; recDot.hidden = true; if (!R) return; R.src.stream.getTracks().forEach((t) => t.stop()); R.src.stream._stop?.();
    const dur = Math.min(CF().voiceMax, R.dur || 0), blob = new Blob(R.chunks, { type: R.mime });
    if (dur < CF().voiceMin || !blob.size) { sys("🎙 Too short: hold V while you talk."); return; }
    if (blob.size > 262144) { sys("🎙 That clip was too big to send."); return; }
    C.coolUntil = Date.now() + CF().cooldown * 1000;
    const base = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), from: selfId(), name: net.N.selfName, scope: R.scope, dur: +dur.toFixed(1), mime: R.mime, size: blob.size, inst: C.self.inst, copy: myCopy(), party: C.self.party, x: +C.self.x.toFixed(1), z: +C.self.z.toFixed(1), at: Date.now() };
    let msg = null, via = "b64";
    if (!demo && sb && me?.id) { const path = `${me.id}/${crypto.randomUUID()}.${R.mime.includes("ogg") ? "ogg" : R.mime.includes("mp4") ? "m4a" : "webm"}`;
      const up = await sb.storage.from("voice-clips").upload(path, blob, { contentType: R.mime, upsert: false });
      if (!up.error) { const { data } = await sb.storage.from("voice-clips").createSignedUrl(path, CF().signedSecs); if (data?.signedUrl) { msg = { ...base, url: data.signedUrl }; via = "storage"; }
        setTimeout(() => sb.storage.from("voice-clips").remove([path]).catch(() => {}), CF().deleteAfter * 1000); }
      else if (/row-level|policy|403/i.test(up.error.message || "") && muted()) { sys("🔇 Muted: clip not sent."); return; } }
    if (!msg) { if (blob.size > CF().b64Max) { sys("🎙 Couldn't upload that clip, and it's too long to send inline."); return; } msg = { ...base, b64: await toB64(blob) }; }
    C.sent.push({ ...base, via }); addLine({ ...base, text: `🎙 voice clip · ${base.dur}s` }, "voice");
    await net.sendChat("voice", msg);
    if (!demo && sb) sb.rpc("annex_chat_log", { p_scope: R.scope, p_inst: C.self.inst, p_text: null, p_kind: "voice" }).then(() => {}, () => {}); }
  const toB64 = (blob) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.readAsDataURL(blob); });
  net.on("voice", (m) => { if (!m || typeof m !== "object" || m.from === selfId() || (demo && demoMuted(m.from))) return; const near = hears(m, meL()); if (!near && !canHear(m)) return;
    const src = m.url && /^https:\/\//.test(m.url) ? m.url : m.b64 && m.b64.length < 70000 && /^audio\/(webm|ogg|mp4)$/.test(m.mime || "") ? `data:${m.mime};base64,${m.b64}` : null; if (!src) return;
    C.heard.push({ from: m.from, scope: m.scope, voice: true, dur: m.dur, over: !near }); addLine({ ...m, name: String(m.name || "?").slice(0, 40), text: `🔊 voice clip · ${(+m.dur || 0).toFixed(1)}s`, over: !near }, "voice");
    C.queue.push({ src, from: m.from, name: m.name, dur: +m.dur || 0, id: m.id }); if (C.queue.length > 4) C.queue.shift(); playNext(); });
  function playNext() { if (C.playing || !C.queue.length) return; const q = C.queue.shift(), a = new Audio(q.src); C.playing = q; recDot.hidden = false; recDot.textContent = `🔊 ${q.name} is talking…`;
    const done = (ok) => { if (C.playing !== q) return; C.playing = null; recDot.hidden = !C.rec ? true : recDot.hidden; (ok ? C.played : C.blocked).push({ from: q.from, id: q.id }); C.coolUntil = Math.max(C.coolUntil, Date.now() + 600); setTimeout(playNext, 600); };
    a.onended = () => done(true); a.onerror = () => done(false); setTimeout(() => done(true), (Math.max(q.dur, 1) + 3) * 1000);
    a.play().catch(() => { done(false); sys(`🔊 ${q.name} sent a clip: click anywhere, then it can play.`); }); }

  // ---------- input wiring ----------
  addEventListener("keydown", (e) => { if (!C.inAnnex) return; const tag = e.target.tagName;
    if (e.target === input) { if (e.key === "Enter") { e.preventDefault(); const v = input.value; input.value = ""; if (v.trim()) say(v); setOpen(false); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } return; }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || host.state().busy) return;
    if (e.key === "Enter") { e.preventDefault(); setOpen(true); } else if ((e.key === "v" || e.key === "V") && !e.repeat) { e.preventDefault(); startTalk(); } }, true);
  addEventListener("keyup", (e) => { if ((e.key === "v" || e.key === "V") && C.rec) stopTalk(); }, true);
  mic.addEventListener("pointerdown", (e) => { e.preventDefault(); startTalk(); }); ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => mic.addEventListener(ev, () => C.rec && stopTalk()));

  // ---------- Control Room mute (admin) ----------
  async function mute(id, minutes) { if (!net.isAdmin()) return { ok: false, error: "admins only" };
    const r = await net.sendGM({ type: "mute", to: id, minutes });
    if (!demo && sb) { const { error } = await sb.rpc("annex_chat_mute", { p_user: id, p_minutes: minutes }); if (error) return { ok: false, error: error.message }; }
    if (demo) { const f = net.N.demoMuted || (net.N.demoMuted = {}); f[id] = minutes > 0 ? Date.now() + minutes * 60000 : 0; }
    return r; }
  net.on("gm", (p) => { if (p.type !== "mute" || p.to !== selfId()) return; net.N.mutedUntil = p.minutes > 0 ? Date.now() + p.minutes * 60000 : 0;
    sys(p.minutes > 0 ? `🔇 The Control Room muted your chat and voice for ${p.minutes} min.` : "🔈 You can chat again."); if (C.rec) stopTalk(); net.rejoinChat?.(); });
  const demoMuted = (id) => (net.N.demoMuted?.[id] || 0) > Date.now();

  function update(p, inst, party) { C.self = { x: p.x, z: p.z, inst, party }; }
  function onArrive() { C.inAnnex = true; box.hidden = false; tgl.hidden = false; render(); }
  function onLeave() { C.inAnnex = false; box.hidden = true; tgl.hidden = true; setOpen(false); if (C.rec) stopTalk(); C.queue.length = 0; }
  const debug = { state: () => ({ open: C.open, scope: C.scope, lines: C.lines.map((l) => ({ name: l.name, scope: l.scope, text: l.text, kind: l.kind, me: l.me, over: l.over })), heard: C.heard.slice(), played: C.played.slice(), blocked: C.blocked.slice(), sent: C.sent.map((s) => ({ scope: s.scope, text: s.text || null, dur: s.dur || null, via: s.via || "text", size: s.size || null })), recording: !!C.rec, playing: !!C.playing, queue: C.queue.length, muted: muted(), listenAll: C.listenAll, copy: myCopy(), shown: !box.hidden }),
    say, startTalk, stopTalk, setOpen, setScope: (s) => { C.scope = s; scopeSel.value = s; return s; }, listenAll: (v) => { C.listenAll = !!v; return C.listenAll; }, mute, demoMuted, hears: (msg, L) => hears(msg, L),
    demoSay: (id, text, scope, extra) => net.demoSay(id, text, scope, extra), demoVoice: async (id, scope = "nearby", secs = 1.2, extra = {}) => { const clip = await synthClip(secs); return net.demoVoice(id, clip, scope, extra); }, quietFakes: (v = true) => (net.N.demoQuiet = !!v) };
  async function synthClip(secs) { const st = toneStream(330), mime = pickMime(), rec = new MediaRecorder(st, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : {}), ch = [];
    rec.ondataavailable = (e) => e.data?.size && ch.push(e.data); const done = new Promise((r) => (rec.onstop = r)); rec.start(); await new Promise((r) => setTimeout(r, secs * 1000)); rec.stop(); await done; st._stop?.();
    const b = new Blob(ch, { type: (mime || "audio/webm").split(";")[0] }); return { b64: await toB64(b), mime: b.type, dur: secs, size: b.size }; }
  return { update, onArrive, onLeave, debug, mute, hears, recent: () => C.lines.slice(), listenAll: (v) => (v === undefined ? C.listenAll : (C.listenAll = !!v)) };
}
