(() => {
const C = window.DESKS_CONFIG;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { detectSessionInUrl: true, persistSession: true } });
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3500); };
const fn = async (name, body) => {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${C.SUPABASE_URL}/functions/v1/${name}`, { method: "POST",
    headers: { "content-type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || C.SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body || {}) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const THEMES = ["sage", "sunny", "lavender", "sky", "cocoa", "night"];
const STATUS = { new: "New", waiting_on_bryan: "Waiting on Bryan", pending_approval: "Reply waiting for Bryan's OK", answered: "Answered" };
document.title = C.APP_NAME; $("#appName").textContent = C.APP_NAME;

const DEMO = /[?&]demo=1/.test(location.search) && ["localhost", "127.0.0.1"].includes(location.hostname); // screenshot/demo mode, localhost only
let office3d = null, threadCh = null;
let me = null, presence = null, online = new Set(), forceSetPw = /[?&]setpw=1/.test(location.search);
const photoUrl = async (paths) => {
  if (!paths?.length) return {};
  const { data } = await sb.storage.from("desk-photos").createSignedUrls(paths, C.PHOTO_URL_SECONDS || 300);
  const m = {}; (data || []).forEach((d) => (m[d.path] = d.signedUrl)); return m;
};
const avatar = (p) => p.avatar_url ? `<img class="avatar" src="${esc(p.avatar_url)}" alt="">`
  : `<span class="avatar">${esc((p.nickname || p.display_name || "?")[0].toUpperCase())}</span>`;

async function loadMe() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { me = null; return; }
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  me = data;
}
function startPresence() {
  if (presence || !me) return;
  sb.realtime.setAuth();
  presence = sb.channel("office", { config: { private: true, presence: { key: me.id } } });
  presence.on("presence", { event: "sync" }, () => {
    online = new Set(Object.keys(presence.presenceState()));
    document.querySelectorAll("[data-online]").forEach((el) => el.classList.toggle("on", online.has(el.dataset.online)));
    const c = $("#onlineCount"); if (c) c.textContent = online.size;
    if (office3d) office3d.setOnline(online);
  }).subscribe(async (s) => { if (s === "SUBSCRIBED") await presence.track({ at: Date.now() }); });
}
function stopPresence() { if (presence) { sb.removeChannel(presence); presence = null; online = new Set(); } }

// Re-encode through a canvas: strips EXIF/GPS and any hidden payload; caps size at 1600px.
async function reencode(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.85));
  if (!blob || blob.size > 5 * 1024 * 1024) throw new Error("too big"); return blob;
}
// ---------- screens ----------
const screens = {};
screens.login = () => {
  app.innerHTML = `<div class="card narrow"><h1>Clock in</h1><p class="muted">Staff only. Use your office login ID.</p>
  <form id="f"><label>Login ID</label><input id="lid" autocomplete="username" placeholder="yourname${esc(C.LOGIN_DOMAIN)}" required>
  <label>Password</label><input id="pw" type="password" autocomplete="current-password" required>
  <div id="captcha"></div><p id="e" class="err"></p><div class="row"><button>Log in</button><a href="#/forgot">Forgot password?</a></div></form></div>`;
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault(); $("#e").textContent = ""; const b = $("#f button"); b.disabled = true;
    const captcha_token = window.turnstile && C.CAPTCHA_SITE_KEY ? turnstile.getResponse() : undefined;
    const { data } = await fn("login", { login_id: $("#lid").value, password: $("#pw").value, captcha_token });
    b.disabled = false;
    if (!data.access_token) { $("#e").textContent = data.error || "Could not log in."; return; }
    await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
    await loadMe(); location.hash = "#/desk"; route();
  };
  if (C.CAPTCHA_SITE_KEY) { // TODO: hook ready; loads only once Bryan supplies keys
    const sc = document.createElement("script"); sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"; sc.async = true;
    sc.onload = () => turnstile.render("#captcha", { sitekey: C.CAPTCHA_SITE_KEY }); document.head.appendChild(sc);
  }
};
// Two-step code prompt (shown after password when the account has an authenticator app set up)
screens.mfa = async () => {
  const { data: f } = await sb.auth.mfa.listFactors(); const totp = f?.totp?.[0];
  app.innerHTML = `<div class="card narrow"><h1>Two-step code</h1><p class="muted">Open your authenticator app and type the 6-digit code for ${esc(C.SHORT_NAME)}.</p>
   <form id="f"><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required><p id="e" class="err"></p><div class="row"><button>Verify</button><button type="button" class="ghost" id="lo">Log out</button></div></form></div>`;
  $("#lo").onclick = () => $("#logout").click();
  $("#f").onsubmit = async (ev) => { ev.preventDefault();
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: totp.id, code: $("#code").value.trim() });
    if (error) return ($("#e").textContent = "That code didn't work."); route(); };
};
screens.security = async () => {
  const { data: f } = await sb.auth.mfa.listFactors(); const totp = (f?.totp || []).filter((x) => x.status === "verified");
  const { data: lvl } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  app.innerHTML = `<h1>Security</h1>
  <div class="card"><h2>Two-step codes</h2>${me.is_admin ? `<p><b>Required for admin.</b> The Admin screen stays locked until you've verified a code this session.</p>` : `<p class="muted">Optional but recommended.</p>`}
   ${totp.length ? `<p>✅ Authenticator app is set up. This session: <b>${lvl?.currentLevel === "aal2" ? "verified" : "not verified yet"}</b>.</p>${lvl?.currentLevel !== "aal2" ? `<a class="btn" href="#/mfa">Enter code</a>` : ""}`
    : `<button id="enroll">Set up authenticator app</button><div id="qr"></div>`}</div>
  <div class="card"><h2>Personal reset email</h2><p class="muted">Where password resets go. To change it, re-enter your password. Both the old and new address get a confirm email; nothing changes until it's confirmed.</p>
   <form id="ce"><label>New personal email</label><input id="ne" type="email" required><label>Current password</label><input id="cp" type="password" autocomplete="current-password" required><p id="cm"></p><button>Change email</button></form></div>`;
  const en = $("#enroll"); if (en) en.onclick = async () => {
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Desks " + Date.now() });
    if (error) return toast(error.message);
    $("#qr").innerHTML = `<p>Scan with Google Authenticator, Authy, 1Password, etc.</p><img src="${esc(data.totp.qr_code)}" alt="QR code" style="width:200px;background:#fff">
     <p class="muted">Or type this key: <code>${esc(data.totp.secret)}</code></p><label>Code from the app</label><input id="vc" inputmode="numeric" maxlength="6"><button id="vb">Verify</button>`;
    $("#vb").onclick = async () => { const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: $("#vc").value.trim() });
      error ? toast("That code didn't work.") : (toast("Two-step codes are on."), screens.security()); };
  };
  $("#ce").onsubmit = async (ev) => { ev.preventDefault();
    const { data } = await fn("change-recovery-email", { new_email: $("#ne").value, password: $("#cp").value });
    $("#cm").textContent = data.message || data.error || "Something went wrong."; $("#cp").value = ""; };
};
screens.forgot = () => {
  app.innerHTML = `<div class="card narrow"><h1>Forgot password</h1><p class="muted">Enter your office login ID. We'll send a reset link to the personal email you gave when you set up your account.</p>
  <form id="f"><label>Login ID</label><input id="lid" placeholder="yourname${esc(C.LOGIN_DOMAIN)}" required>
  <p id="m"></p><div class="row"><button>Send reset link</button><a href="#/login">Back to login</a></div></form></div>`;
  $("#f").onsubmit = async (ev) => { ev.preventDefault(); const { data } = await fn("forgot-password", { login_id: $("#lid").value }); $("#m").textContent = data.message || "Check your personal email."; };
};
screens.setpw = () => {
  app.innerHTML = `<div class="card narrow"><h1>Choose your password</h1>
  <p class="muted">Welcome${me ? ", " + esc(me.display_name) : ""}! Your login ID is <b>${esc(me?.login_id || "")}</b>. Pick a password (12+ characters). Password resets go to your personal email.</p>
  <form id="f"><label>New password</label><input id="p1" type="password" minlength="12" autocomplete="new-password" required>
  <label>Again</label><input id="p2" type="password" minlength="12" autocomplete="new-password" required><p id="e" class="err"></p><button>Save password</button></form></div>`;
  $("#f").onsubmit = async (ev) => {
    ev.preventDefault();
    if ($("#p1").value !== $("#p2").value) return ($("#e").textContent = "Those don't match.");
    if ($("#p1").value.length < 12) return ($("#e").textContent = "Use at least 12 characters.");
    const { error } = await sb.auth.updateUser({ password: $("#p1").value });
    if (error) return ($("#e").textContent = error.message);
    forceSetPw = false; history.replaceState(null, "", location.pathname + "#/desk"); toast("Password saved. Welcome to your desk!"); route();
  };
};

screens.desk = async () => {
  let { data: d } = await sb.from("desks").select("*").eq("user_id", me.id).maybeSingle();
  if (!d) { await sb.from("desks").insert({ user_id: me.id }); d = { user_id: me.id, theme: "sage", photos: [] }; }
  const urls = await photoUrl(d.photos);
  const [{ data: notes }, { data: notices }] = await Promise.all([sb.rpc("my_desk_notes"), sb.from("notices").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(5)]);
  const newNotes = (notes || []).filter((n) => n.is_new).length;
  app.innerHTML = `<h1>My cubicle</h1>
  <div class="row" style="margin-bottom:1rem"><a class="btn" href="#/office">🚪 Walk into the office</a>
   <button class="ghost" id="lockT">${d.locked ? "🔒 Door locked (tap to unlock)" : "🔓 Door open (tap to lock)"}</button>
   ${newNotes ? `<span class="status s-new">${newNotes} new note${newNotes > 1 ? "s" : ""}</span>` : ""}</div>
  <div class="card"><h3>☀️ Morning notices</h3>${(notices || []).length ? notices.map((n) => `<div class="notice"><b>${n.pinned ? "📌 " : ""}${esc(n.title)}</b><div style="white-space:pre-wrap">${esc(n.body)}</div><span class="muted">${new Date(n.created_at).toLocaleDateString()}</span></div>`).join("") : `<p class="muted">No notices this morning.</p>`}</div>
  <div class="card"><h3>🗒 Notes on your desk</h3>${(notes || []).length ? notes.map((n) => `<div class="notice ${n.is_new ? "new" : ""}"><b>${esc(n.author_name)}:</b> <span style="white-space:pre-wrap">${esc(n.body)}</span> <span class="muted">${new Date(n.created_at).toLocaleString()}</span> <button class="warn small" data-dn="${n.id}">Delete</button></div>`).join("") : `<p class="muted">No notes yet. Leave your door unlocked and people can stick notes on your desk.</p>`}</div>
  <div class="cube t-${esc(d.theme)}"><div class="who">${avatar({ ...me, nickname: d.nickname })}<div><h2>${esc(d.nickname || me.display_name)}</h2><span class="muted">${esc(me.login_id)}</span></div></div>
   <p>${d.sign_text ? `<span class="sign">${esc(d.sign_text)}</span>` : `<span class="muted">No sign yet. Put one up below!</span>`}</p>
   <div class="pins">${d.photos.map((p, i) => `<div class="pin" style="--r:${(i % 2 ? -1 : 1) * (1 + i % 3)}deg"><img src="${esc(urls[p] || "")}" alt="desk photo"><button class="warn" data-del="${esc(p)}" title="Take down">×</button></div>`).join("")}</div></div>
  <div class="card"><h3>Decorate</h3>
   <label>Nickname</label><input id="nick" maxlength="40" value="${esc(d.nickname || "")}">
   <label>Sign on the wall</label><input id="sign" maxlength="120" value="${esc(d.sign_text || "")}" placeholder="e.g. Powered by coffee and good intentions">
   <label>Desk color</label><select id="theme">${THEMES.map((t) => `<option ${t === d.theme ? "selected" : ""}>${t}</option>`).join("")}</select>
   <div class="row" style="margin-top:.8rem"><button id="save">Save desk</button></div>
   <label>Pin up a photo (JPG, PNG or WebP, up to 5 MB, max 8)</label><input id="up" type="file" accept="image/jpeg,image/png,image/webp">
   <p class="muted">Everyone on the office floor can see your desk photos. Please no client or health info.</p></div>`;
  if (newNotes) sb.from("desks").update({ notes_seen_at: new Date().toISOString() }).eq("user_id", me.id).then(() => {});
  $("#lockT").onclick = async () => { const { error } = await sb.from("desks").update({ locked: !d.locked }).eq("user_id", me.id); error ? toast(error.message) : (toast(d.locked ? "Door unlocked" : "Door locked"), screens.desk()); };
  app.querySelectorAll("[data-dn]").forEach((b) => (b.onclick = async () => { const { error } = await sb.from("desk_notes").delete().eq("id", +b.dataset.dn); error ? toast(error.message) : screens.desk(); }));
  $("#save").onclick = async () => {
    const { error } = await sb.from("desks").update({ nickname: $("#nick").value.trim() || null, sign_text: $("#sign").value.trim() || null, theme: $("#theme").value, updated_at: new Date().toISOString() }).eq("user_id", me.id);
    error ? toast(error.message) : (toast("Desk saved"), screens.desk());
  };
  $("#up").onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast("That photo is over 5 MB.");
    if (d.photos.length >= 8) return toast("Desk is full (8 photos). Take one down first.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast("JPG, PNG or WebP only.");
    let clean; try { clean = await reencode(f); } catch { return toast("Couldn't read that image."); }
    const path = `${me.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await sb.storage.from("desk-photos").upload(path, clean, { contentType: "image/jpeg" });
    if (error) return toast(error.message);
    await sb.from("desks").update({ photos: [...d.photos, path] }).eq("user_id", me.id); toast("Pinned!"); screens.desk();
  };
  app.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    const p = b.dataset.del; await sb.storage.from("desk-photos").remove([p]);
    await sb.from("desks").update({ photos: d.photos.filter((x) => x !== p) }).eq("user_id", me.id); screens.desk();
  }));
};

screens.floor = async () => {
  const { data, error } = await sb.rpc("office_floor");
  if (error) return (app.innerHTML = `<p class="err">${esc(error.message)}</p>`);
  const urls = await photoUrl(data.flatMap((p) => p.photos.slice(0, 3)));
  app.innerHTML = `<h1>The office floor</h1><p class="muted"><span class="dot on"></span><span id="onlineCount">${online.size}</span> online now</p>
  <div class="floor">${data.map((p) => `<div class="cube t-${esc(p.theme)}"><div class="who">${avatar(p)}<div><h3><span class="dot ${online.has(p.user_id) ? "on" : ""}" data-online="${esc(p.user_id)}"></span>${esc(p.nickname || p.display_name)}</h3>
    <span class="muted">${esc(p.display_name)}${p.is_admin ? " · the boss" : ""}</span></div></div>
    ${p.locked && p.user_id !== me.id ? `<p class="muted">🔒 Door locked</p>` : ""}${p.sign_text ? `<p><span class="sign">${esc(p.sign_text)}</span></p>` : ""}
    <div class="pins">${p.photos.slice(0, 3).map((x, i) => `<div class="pin" style="--r:${i - 1}deg"><img src="${esc(urls[x] || "")}" alt=""></div>`).join("")}</div></div>`).join("")}</div>`;
};

screens.ticket = async () => {
  const [{ data: bots }, { data: use }] = await Promise.all([
    sb.from("bot_access").select("bots(id,name,role,emoji,active)").eq("user_id", me.id),
    sb.rpc("my_ticket_usage")]);
  const list = (bots || []).map((b) => b.bots).filter((b) => b && b.active);
  const u = use?.[0] || { used: 0, cap: 0, period: "day" };
  if (!list.length) return (app.innerHTML = `<div class="card"><h1>New ticket</h1><p>You don't have access to any bots yet. Bryan will set that up.</p></div>`);
  const speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  app.innerHTML = `<div class="card"><h1>New ticket</h1>
   <p class="muted">Used ${u.used} of ${u.cap} tickets this ${esc(u.period)}.</p>
   <label>Send to</label><select id="bot">${list.map((b) => `<option value="${b.id}">${esc(b.emoji)} ${esc(b.name)} · ${esc(b.role)}</option>`).join("")}</select>
   <label>What's going on?</label><textarea id="body" maxlength="${C.MAX_TICKET_CHARS}" placeholder="Just tell it like you'd tell a person: here's what's going on, here's what I'd like help with..."></textarea>
   <p class="muted" id="cnt">0 / ${C.MAX_TICKET_CHARS}</p>
   <div class="row" style="margin-top:.6rem">${speech ? `<button type="button" class="ghost mic" id="mic">🎤 Talk</button>` : `<span class="muted">Voice typing isn't supported in this browser (try Chrome, Edge or Safari).</span>`}
   <button id="send" ${u.used >= u.cap ? "disabled" : ""}>Review &amp; submit</button></div>
   <p class="muted">Voice goes into the box above so you can fix it before sending. Please no client names or health details.</p></div>`;
  const cnt = () => { const n = $("#body").value.length; $("#cnt").textContent = `${n} / ${C.MAX_TICKET_CHARS}`; $("#cnt").className = n > C.MAX_TICKET_CHARS ? "err" : "muted"; };
  $("#body").oninput = cnt;
  if (speech) {
    let rec = null;
    $("#mic").onclick = () => {
      if (rec) { rec.stop(); return; }
      rec = new speech(); rec.continuous = true; rec.interimResults = false; rec.lang = "en-US";
      const base = $("#body").value;
      let said = "";
      rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript + " ";
        $("#body").value = ((base ? base.trim() + " " : "") + said.trim()).slice(0, C.MAX_TICKET_CHARS); cnt(); };
      rec.onerror = (e) => toast("Mic: " + e.error);
      rec.onend = () => { rec = null; $("#mic").classList.remove("rec"); $("#mic").textContent = "🎤 Talk"; };
      rec.start(); $("#mic").classList.add("rec"); $("#mic").textContent = "■ Stop";
    };
  }
  $("#send").onclick = async () => {
    const body = $("#body").value.trim(); if (body.length < 5) return toast("Write a little more first.");
    if (body.length > C.MAX_TICKET_CHARS) return toast(`Please keep it under ${C.MAX_TICKET_CHARS} characters.`);
    const bot = list.find((b) => b.id == $("#bot").value);
    if (!confirm(`Send this to ${bot.name}?\n\n${body.slice(0, 600)}${body.length > 600 ? "…" : ""}`)) return;
    const { data: nt, error } = await sb.from("tickets").insert({ bot_id: bot.id, body }).select("id").single();
    if (error) return toast(error.message);
    toast("Ticket sent! Replies show up right here."); location.hash = "#/thread/" + nt.id;
  };
};

screens.tickets = async () => {
  const { data, error } = await sb.rpc("my_tickets");
  if (error) return (app.innerHTML = `<p class="err">${esc(error.message)}</p>`);
  app.innerHTML = `<h1>My tickets</h1>${!data?.length ? `<p class="muted">No tickets yet. <a href="#/ticket">Send one</a>.</p>` : ""}
  ${(data || []).map((t) => `<a class="card tlist ${t.closed_at ? "closed" : ""}" href="#/thread/${t.id}"><div class="row"><b>#${t.id} → ${esc(t.bot_emoji)} ${esc(t.bot_name)}</b>
   <span class="status s-${t.closed_at ? "closed" : t.status}">${t.closed_at ? "Closed" : STATUS[t.status]}</span>${t.unread ? `<span class="badge">${t.unread} new</span>` : ""}
   <span class="muted">${new Date(t.last_at || t.created_at).toLocaleString()}</span></div><p class="muted">${esc(t.preview)}</p></a>`).join("")}`;
};
const msgHtml = (m) => `<div class="msg ${m.author}" data-m="${m.id}"><div class="bubble">${esc(m.body)}</div><span class="muted">${m.author === "bot" ? "Reply" : "You"} · ${new Date(m.released_at || m.created_at).toLocaleString()}</span></div>`;
screens.thread = async (id) => {
  id = +id; if (!id) return (location.hash = "#/tickets");
  const load = () => Promise.all([sb.from("tickets").select("id,status,closed_at,created_at,bots(name,emoji)").eq("id", id).maybeSingle(),
    sb.from("ticket_messages").select("id,author,body,status,created_at,released_at").eq("ticket_id", id).order("id")]);
  const [{ data: t }, { data: msgs }] = await load();
  if (!t) return (app.innerHTML = `<div class="card"><p>That ticket isn't available.</p><a href="#/tickets">Back to my tickets</a></div>`);
  let list = (msgs || []).filter((m) => m.status !== "held"), tk = t;
  const waiting = () => tk.closed_at ? "This ticket is closed." : tk.status === "pending_approval" || tk.status === "waiting_on_bryan" ? "A reply is waiting for Bryan's OK." : list.length && list[list.length - 1].author === "person" ? "Sent. The reply will pop up here, no need to refresh." : "";
  app.innerHTML = `<p><a href="#/tickets">← My tickets</a></p><div class="card"><div class="row"><h2 style="margin:0">#${t.id} → ${esc(t.bots?.emoji)} ${esc(t.bots?.name)}</h2>
   ${t.closed_at ? "" : `<button class="ghost" id="closeT">Close ticket</button>`}</div>
   <div id="thread" class="thread">${list.map(msgHtml).join("")}</div><p class="muted" id="wait">${esc(waiting())}</p>
   ${t.closed_at ? "" : `<textarea id="fu" maxlength="${C.MAX_TICKET_CHARS}" placeholder="Add a follow-up…" style="min-height:90px"></textarea><div class="row"><button id="fus">Send</button><span class="muted" id="fuc">0 / ${C.MAX_TICKET_CHARS}</span></div>`}</div>`;
  const th = $("#thread"); th.scrollTop = th.scrollHeight;
  const seen = () => sb.rpc("mark_ticket_seen", { p_ticket: id }).then(() => {}); seen();
  const add = (m) => { if (m.status === "held" || list.some((x) => x.id === m.id)) return; list.push(m); list.sort((a, b) => a.id - b.id); th.innerHTML = list.map(msgHtml).join(""); th.scrollTop = th.scrollHeight; $("#wait").textContent = waiting(); seen(); };
  if (threadCh) sb.removeChannel(threadCh);
  sb.realtime.setAuth();
  threadCh = sb.channel(`ticket:${id}`, { config: { private: true } })
    .on("postgres_changes", { event: "*", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${id}` }, (p) => p.new && add(p.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${id}` }, (p) => { tk = { ...tk, ...p.new }; const w = $("#wait"); if (w) w.textContent = waiting(); })
    .subscribe();
  const fu = $("#fu");
  if (fu) {
    fu.oninput = () => ($("#fuc").textContent = `${fu.value.length} / ${C.MAX_TICKET_CHARS}`);
    $("#fus").onclick = async () => {
      const body = fu.value.trim(); if (!body) return;
      $("#fus").disabled = true;
      const { data, error } = await sb.from("ticket_messages").insert({ ticket_id: id, author: "person", body }).select("id,author,body,status,created_at,released_at").single();
      $("#fus").disabled = false;
      if (error) return toast(/row-level|policy/i.test(error.message) ? "Couldn't send (ticket closed, or 30 messages an hour max)." : error.message);
      fu.value = ""; tk.status = "new"; add(data);
    };
    $("#closeT").onclick = async () => { if (!confirm("Close this ticket? You can always open a new one.")) return; const { error } = await sb.rpc("close_ticket", { p_ticket: id }); error ? toast(error.message) : screens.thread(id); };
  }
};

// ---------- 3D office ----------
const signedFrom = async (bucket, paths) => { if (!paths?.length) return {}; const { data } = await sb.storage.from(bucket).createSignedUrls(paths, C.PHOTO_URL_SECONDS || 300); const m = {}; (data || []).forEach((d) => (m[d.path] = d.signedUrl)); return m; };
function demoData() {
  const mk = (id, n, nick, theme, locked, sign) => ({ user_id: id, display_name: n, nickname: nick, theme, locked, sign_text: sign, photos: [], is_admin: false });
  me = { id: "demo-me", display_name: "Demo Person", login_id: "demo@example.com", is_admin: false, active: true };
  return { floor: [mk("demo-me", "Demo Person", "Desk Captain", "sage", false, "Powered by coffee and good intentions"), mk("a", "Vince", "Vinny", "sky", false, "Ask me about spreadsheets"),
      mk("b", "Bryan Nolan", "The Boss", "sunny", true, null), mk("c", "Juhani", null, "lavender", false, "Back in 5"), mk("d", "Emily", "Em", "cocoa", true, null)],
    myDesk: { nickname: "Desk Captain", sign_text: "Powered by coffee and good intentions", theme: "sage", locked: false, photos: [] },
    notes: [{ id: 1, author_name: "Vinny", body: "Welcome to the new office! Love the plant." }, { id: 2, author_name: "Em", body: "Lunch on Friday?" }, { id: 3, author_name: "The Boss", body: "Great work this week 🎉" }],
    notices: [{ title: "Welcome to the 3D office!", body: "Walk around, visit unlocked cubicles, and leave a kind note.", pinned: true, created_at: new Date().toISOString() }, { title: "Friday", body: "Team call at 2pm.", pinned: false, created_at: new Date().toISOString() }],
    art: [1, 2, 3, 4, 5].map((i) => ({ id: i, title: "Art coming soon from Moth", artist: "Moth", image_path: null, position: i })), online: new Set(["demo-me", "a"]) };
}
screens.office = async () => {
  const mod = await import("./office3d.js");
  if (!mod.webglOK()) return (app.innerHTML = `<div class="card"><h1>The 3D office</h1><p>This device or browser can't show 3D right now (WebGL is off or unsupported). Your <a href="#/desk">2D desk</a> works as usual.</p></div>`);
  let data;
  if (DEMO) data = demoData();
  else {
    const [{ data: floor }, { data: myDesk }, { data: notes }, { data: notices }, { data: art }] = await Promise.all([sb.rpc("office_floor"), sb.from("desks").select("*").eq("user_id", me.id).maybeSingle(),
      sb.rpc("my_desk_notes"), sb.from("notices").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(20), sb.from("gallery_art").select("*").order("position")]);
    data = { floor: floor || [], myDesk: myDesk || { theme: "sage", photos: [] }, notes: notes || [], notices: notices || [], art: art || [], online };
  }
  document.body.classList.add("in-office");
  app.innerHTML = `<div id="o3root"></div>`;
  const view = (location.search.match(/[?&]view=([a-z0-9]+)/) || [])[1];
  office3d = mod.startOffice($("#o3root"), { ...data, me, demo: DEMO, api: {
    exit: () => (location.hash = "#/desk"),
    photoUrls: DEMO ? null : (paths) => photoUrl(paths),
    artUrls: DEMO ? null : (paths) => signedFrom("gallery-art", paths),
    setLocked: async (v) => { if (DEMO) return true; const { error } = await sb.from("desks").update({ locked: v }).eq("user_id", me.id); if (error) { toast(error.message); return false; } return true; },
    leaveNote: async (uid, body) => { if (DEMO) return true; const { error } = await sb.from("desk_notes").insert({ desk_user: uid, body: body.slice(0, 280) });
      if (error) { toast(/row-level|policy/i.test(error.message) ? "Couldn't leave that note (door locked, or 20 notes an hour max)." : error.message); return false; } return true; },
    deleteNote: async (id) => { if (DEMO) return true; const { error } = await sb.from("desk_notes").delete().eq("id", id); if (error) { toast(error.message); return false; } return true; },
  } });
  const Lh = office3d.layout;
  if (view === "hallway") office3d.teleport(0.2, -1.6, 0.1, -0.02);
  if (view === "gallery") office3d.teleport(1.2, Lh.gz0 - 2.2, 0.35, -0.02);
  if (view === "art") office3d.teleport(-Lh.gx + 2.7, Lh.gz0 - 2.8, Math.PI / 2, 0); // close-up of a landscape piece (frame 4)
  if (view === "gallery2") office3d.teleport(-6.5, Lh.gz1 + 1.4, -2.3, -0.02);
  if (view === "ceiling") office3d.teleport(0, 2.6, Math.PI, 1.4); // own cubicle, looking up at the ceiling oddities
  if (view === "portal") office3d.teleport(-Lh.gx + 2.6, (Lh.gz0 + Lh.gz1) / 2 - 1.4, Math.PI / 2 + 0.2, 0.02); // notice board + "What's this?" portal
  if (view === "cathouse") office3d.enterCatHouse();
  if (view === "ladder") office3d.catTeleport(2.5, -5.2, 0, 0.42); // facing the north-wall ladder
  if (view === "catwalk") office3d.catTeleport(2.5, 6.6, 0.12, -0.62, 13); // up on the catwalk, looking over the hub and drop hatch
  if (view === "cathousewide") office3d.catTeleport(6.6, 6.6, Math.PI / 4, 0.32); // corner view of the big platforms
  if (view === "cathousetop") office3d.catTeleport(0.2, 0.9, 0.15, -0.05, 10.95); // standing on the top perch
  if (DEMO) window.__o3 = office3d; // screenshot helper (demo mode is localhost-only)
};

screens.admin = async (tab = "people") => {
  if (!me.is_admin) return (location.hash = "#/desk");
  const { data: lvl } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (lvl?.currentLevel !== "aal2") return (app.innerHTML = `<div class="card narrow"><h1>Admin is locked</h1><p>Admin needs a two-step code. ${lvl?.nextLevel === "aal2" ? `<a class="btn" href="#/mfa">Enter code</a>` : `Set up an authenticator app first on the <a href="#/security">Security</a> screen.`}</p></div>`);
  const [{ data: people }, { data: bots }, { data: access }, { data: pending }] = await Promise.all([
    sb.from("profiles").select("*").order("display_name"), sb.from("bots").select("*").order("id"),
    sb.from("bot_access").select("*"), sb.from("pending_people").select("*").order("login_id")]);
  const has = (u, b) => access.some((a) => a.user_id === u && a.bot_id === b);
  const tabs = `<div class="tabs">${["people", "add", "bots", "tickets", "notices", "gallery", "audit"].map((t) => `<button class="${t === tab ? "" : "ghost"}" data-tab="${t}">${{ people: "People", add: "Add person", bots: "Bots", tickets: "All tickets", notices: "Notices", gallery: "Gallery art", audit: "Audit log" }[t]}</button>`).join("")}</div>`;
  let html = "";
  if (tab === "people") {
    html = `<div class="card"><h2>People</h2><table><tr><th>Person</th><th>Bots they can ticket</th><th>Cap</th><th>Gets answers without my approval</th><th>Active</th></tr>
    ${people.map((p) => `<tr data-u="${p.id}"><td><b>${esc(p.display_name)}</b>${p.is_admin ? " (admin)" : ""}<br><span class="muted">${esc(p.login_id)}</span></td>
     <td class="chips">${bots.map((b) => `<label><input type="checkbox" data-bot="${b.id}" ${has(p.id, b.id) ? "checked" : ""}>${esc(b.name)}</label>`).join("")}</td>
     <td class="mini"><input type="number" min="0" max="100" value="${p.ticket_cap}" data-f="ticket_cap" style="width:4.5em"> per <select data-f="cap_period"><option ${p.cap_period === "day" ? "selected" : ""}>day</option><option ${p.cap_period === "week" ? "selected" : ""}>week</option></select></td>
     <td><label class="chips"><label><input type="checkbox" data-f="pre_approved" ${p.pre_approved ? "checked" : ""}>${p.pre_approved ? "On" : "Off"}</label></label><span class="muted">Applies to replies from now on</span></td>
     <td><input type="checkbox" data-f="active" ${p.active ? "checked" : ""} ${p.id === me.id ? "disabled" : ""} style="width:auto"></td></tr>`).join("")}</table></div>
    <div class="card"><h2>Pending setup</h2><p class="muted">Named, but no personal email yet, so no account exists. Click "Finish setup" to add them.</p>
    ${pending.length ? `<table>${pending.map((p) => `<tr><td><b>${esc(p.display_name)}</b><br><span class="muted">${esc(p.login_id)}</span></td><td>${p.bot_ids.map((id) => esc(bots.find((b) => b.id === id)?.name)).join(", ") || "<span class='muted'>no bots yet</span>"}</td><td><button data-finish="${esc(p.login_id)}">Finish setup</button></td></tr>`).join("")}</table>` : `<p class="muted">Nobody pending.</p>`}</div>`;
  } else if (tab === "add") {
    html = `<div class="card"><h2>Add person</h2><form id="addf">
     <label>Name</label><input id="a_name" required maxlength="60">
     <label>Login ID</label><input id="a_lid" required placeholder="name${esc(C.LOGIN_DOMAIN)}">
     <label>Their personal email (for setting and resetting their password)</label><input id="a_pe" type="email" required>
     <label>Bots they can ticket</label><div class="chips">${bots.map((b) => `<label><input type="checkbox" name="a_bot" value="${b.id}">${esc(b.name)}</label>`).join("")}</div>
     <div class="row mini"><label>Ticket cap</label><input id="a_cap" type="number" min="0" max="100" value="3"> per <select id="a_per"><option>day</option><option>week</option></select></div>
     <label class="chips"><label><input type="checkbox" id="a_pre">Gets answers without my approval</label></label>
     <label>How should they get their setup link?</label><select id="a_mode"><option value="link">Show me a one-time link (no email sent)</option><option value="email">Email the invite to their personal email</option></select>
     <p id="a_msg"></p><button>Add person</button></form></div>`;
  } else if (tab === "bots") {
    html = `<div class="card"><h2>Bots</h2><table><tr><th>Bot</th><th>Role</th><th>Active</th></tr>${bots.map((b) => `<tr data-b="${b.id}"><td><input value="${esc(b.emoji)}" data-bf="emoji" style="width:3em"> <input value="${esc(b.name)}" data-bf="name" style="width:10em"></td><td><input value="${esc(b.role)}" data-bf="role"></td><td><input type="checkbox" data-bf="active" ${b.active ? "checked" : ""} style="width:auto"></td></tr>`).join("")}</table>
    <h3>Add a bot</h3><div class="row"><input id="nb_name" placeholder="Name" style="width:10em"><input id="nb_role" placeholder="Role" style="width:12em"><button id="nb">Add</button></div></div>`;
  } else if (tab === "notices") {
    const { data: ns } = await sb.from("notices").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false });
    html = `<div class="card"><h2>Notices</h2><p class="muted">Shown on the gallery notice board and as "Morning notices" on every desk.</p>
     <label>Title</label><input id="n_t" maxlength="100"><label>Message</label><textarea id="n_b" maxlength="1000" style="min-height:90px"></textarea>
     <label class="chips"><label><input type="checkbox" id="n_p">Pin to top</label></label><button id="n_add">Post notice</button>
     ${(ns || []).map((n) => `<div class="notice"><b>${n.pinned ? "📌 " : ""}${esc(n.title)}</b><div style="white-space:pre-wrap">${esc(n.body)}</div><button class="warn small" data-ndel="${n.id}">Remove</button></div>`).join("")}</div>`;
  } else if (tab === "gallery") {
    const { data: arts } = await sb.from("gallery_art").select("*").order("position");
    const au = await signedFrom("gallery-art", (arts || []).map((a) => a.image_path).filter(Boolean));
    html = `<div class="card"><h2>Gallery art</h2><p class="muted">JPEG, PNG or WebP up to 5 MB. Location data is stripped before upload. Only admins can add or change art.</p>
     <label>Title</label><input id="g_t" maxlength="80"><label>Artist</label><input id="g_a" maxlength="60" value="Moth">
     <label>Put it in</label><select id="g_slot"><option value="">A new frame</option>${(arts || []).map((a) => `<option value="${a.id}">Frame ${a.position}: ${esc(a.title)}</option>`).join("")}</select>
     <label>Image</label><input id="g_f" type="file" accept="image/jpeg,image/png,image/webp"><p></p><button id="g_up">Upload art</button>
     <div class="pins">${(arts || []).map((a) => `<div class="pin">${a.image_path ? `<img src="${esc(au[a.image_path] || "")}" alt="">` : `<div class="ph">Coming soon</div>`}<div class="muted">${a.position}. ${esc(a.title)}<br>by ${esc(a.artist)}</div><button class="warn" data-gdel="${a.id}" title="Remove">×</button></div>`).join("")}</div></div>`;
  } else if (tab === "audit") {
    const { data: al } = await sb.from("audit_log").select("*").order("at", { ascending: false }).limit(200);
    html = `<div class="card"><h2>Audit log</h2><table><tr><th>When</th><th>Who</th><th>What</th><th>Ticket</th></tr>${(al || []).map((a) => `<tr><td>${new Date(a.at).toLocaleString()}</td><td>${esc(a.actor.startsWith("admin:") ? "admin" : a.actor.startsWith("user:") ? "user" : a.actor)}</td><td>${esc(a.action)} ${esc(a.detail || "")}</td><td>${a.ticket_id ? "#" + a.ticket_id : ""}</td></tr>`).join("")}</table></div>`;
  } else {
    const { data: ts } = await sb.from("tickets").select("*, bots(name), profiles(display_name)").order("created_at", { ascending: false }).limit(100);
    const { data: tm } = await sb.from("ticket_messages").select("*").in("ticket_id", (ts || []).map((t) => t.id)).order("id");
    html = `<div class="card"><h2>All tickets</h2>${(ts || []).map((t) => `<div class="card" data-t="${t.id}"><div class="row"><b>#${t.id} ${esc(t.profiles?.display_name)} → ${esc(t.bots?.name)}</b><span class="muted">${new Date(t.created_at).toLocaleString()}</span></div>
     ${t.closed_at ? `<p class="muted">Closed ${new Date(t.closed_at).toLocaleString()}</p>` : `<button class="ghost small" data-closet="${t.id}">Close ticket</button>`}
     <div class="thread">${(tm || []).filter((m) => m.ticket_id === t.id).map((m) => m.status === "held" ? `<div class="msg bot held"><div class="bubble"><b>Held for your OK:</b>\n${esc(m.body)}</div></div>` : msgHtml(m)).join("")}</div>
     ${(tm || []).some((m) => m.ticket_id === t.id && m.status === "held") ? `<button data-release="${t.id}">Approve &amp; release held reply</button>` : ""}
     <label>Status</label><select data-tf="status">${Object.keys(STATUS).map((s) => `<option value="${s}" ${s === t.status ? "selected" : ""}>${STATUS[s]}</option>`).join("")}</select>
     <label>Reply</label><textarea data-tf="reply" style="min-height:80px">${esc(t.reply || "")}</textarea><button data-save="${t.id}">Save</button></div>`).join("") || "<p class='muted'>No tickets yet.</p>"}</div>`;
  }
  app.innerHTML = `<h1>Admin</h1>${tabs}${html}`;
  app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => screens.admin(b.dataset.tab)));
  app.querySelectorAll("tr[data-u]").forEach((tr) => {
    const u = tr.dataset.u;
    tr.querySelectorAll("[data-bot]").forEach((cb) => (cb.onchange = async () => {
      const bot_id = +cb.dataset.bot;
      const { error } = cb.checked ? await sb.from("bot_access").insert({ user_id: u, bot_id }) : await sb.from("bot_access").delete().match({ user_id: u, bot_id });
      toast(error ? error.message : "Bot access saved");
    }));
    tr.querySelectorAll("[data-f]").forEach((el) => (el.onchange = async () => {
      const v = el.type === "checkbox" ? el.checked : el.type === "number" ? +el.value : el.value;
      const { error } = await sb.from("profiles").update({ [el.dataset.f]: v }).eq("id", u); toast(error ? error.message : "Saved");
    }));
  });
  app.querySelectorAll("[data-finish]").forEach((b) => (b.onclick = () => {
    const p = pending.find((x) => x.login_id === b.dataset.finish);
    screens.admin("add").then(() => {
      $("#a_name").value = p.display_name; $("#a_lid").value = p.login_id; $("#a_cap").value = p.ticket_cap; $("#a_per").value = p.cap_period; $("#a_pre").checked = p.pre_approved;
      app.querySelectorAll("[name=a_bot]").forEach((c) => (c.checked = p.bot_ids.includes(+c.value))); $("#a_pe").focus();
    });
  }));
  const addf = $("#addf");
  if (addf) addf.onsubmit = async (ev) => {
    ev.preventDefault(); const mode = $("#a_mode").value;
    if (mode === "email" && !confirm("This emails an invite to " + $("#a_pe").value + ". Send it?")) return;
    const { data } = await fn("admin-add-person", { display_name: $("#a_name").value, login_id: $("#a_lid").value, personal_email: $("#a_pe").value,
      bot_ids: [...app.querySelectorAll("[name=a_bot]:checked")].map((c) => +c.value), ticket_cap: +$("#a_cap").value, cap_period: $("#a_per").value, pre_approved: $("#a_pre").checked, mode });
    if (!data.ok) return ($("#a_msg").innerHTML = `<span class="err">${esc(data.error || "Failed")}</span>`);
    $("#a_msg").innerHTML = data.setup_link ? `Added! Send them this one-time setup link yourself (it expires; don't post it publicly):<br><input readonly value="${esc(data.setup_link)}" onclick="this.select()">` : "Added! Invite emailed to their personal email.";
    addf.querySelector("button").disabled = true;
  };
  app.querySelectorAll("tr[data-b] [data-bf]").forEach((el) => (el.onchange = async () => {
    const v = el.type === "checkbox" ? el.checked : el.value;
    const { error } = await sb.from("bots").update({ [el.dataset.bf]: v }).eq("id", +el.closest("tr").dataset.b); toast(error ? error.message : "Saved");
  }));
  const nb = $("#nb"); if (nb) nb.onclick = async () => {
    const name = $("#nb_name").value.trim(), role = $("#nb_role").value.trim(); if (!name) return;
    const { error } = await sb.from("bots").insert({ name, role: role || "Helper", slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now() % 10000 });
    error ? toast(error.message) : screens.admin("bots");
  };
  app.querySelectorAll("[data-save]").forEach((b) => (b.onclick = async () => {
    const c = b.closest("[data-t]");
    const { error } = await sb.rpc("admin_set_ticket", { p_ticket: +b.dataset.save, p_status: c.querySelector("[data-tf=status]").value, p_reply: c.querySelector("[data-tf=reply]").value });
    toast(error ? error.message : "Ticket updated");
  }));
  app.querySelectorAll("[data-closet]").forEach((b) => (b.onclick = async () => { const { error } = await sb.rpc("close_ticket", { p_ticket: +b.dataset.closet }); error ? toast(error.message) : screens.admin("tickets"); }));
  const nadd = $("#n_add"); if (nadd) nadd.onclick = async () => {
    const title = $("#n_t").value.trim(); if (!title) return toast("Give it a title.");
    const { error } = await sb.from("notices").insert({ title, body: $("#n_b").value.trim(), pinned: $("#n_p").checked }); error ? toast(error.message) : (toast("Notice posted"), screens.admin("notices"));
  };
  app.querySelectorAll("[data-ndel]").forEach((b) => (b.onclick = async () => { if (!confirm("Remove this notice?")) return; const { error } = await sb.from("notices").delete().eq("id", +b.dataset.ndel); error ? toast(error.message) : screens.admin("notices"); }));
  const gup = $("#g_up"); if (gup) gup.onclick = async () => {
    const f = $("#g_f").files[0], title = $("#g_t").value.trim() || "Untitled", artist = $("#g_a").value.trim() || "Moth";
    if (!f) return toast("Pick an image first.");
    if (f.size > 5 * 1024 * 1024) return toast("That image is over 5 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast("JPG, PNG or WebP only.");
    let clean; try { clean = await reencode(f); } catch { return toast("Couldn't read that image."); }
    gup.disabled = true; const path = `art/${crypto.randomUUID()}.jpg`;
    const { error } = await sb.storage.from("gallery-art").upload(path, clean, { contentType: "image/jpeg" });
    if (error) { gup.disabled = false; return toast(error.message); }
    const slot = $("#g_slot").value;
    const r = slot ? await sb.from("gallery_art").update({ title, artist, image_path: path }).eq("id", +slot)
      : await sb.from("gallery_art").insert({ title, artist, image_path: path, position: (await sb.from("gallery_art").select("position").order("position", { ascending: false }).limit(1)).data?.[0]?.position + 1 || 1 });
    r.error ? toast(r.error.message) : (toast("Art is up in the gallery"), screens.admin("gallery"));
  };
  app.querySelectorAll("[data-gdel]").forEach((b) => (b.onclick = async () => { if (!confirm("Take this frame down?")) return;
    const { data: a } = await sb.from("gallery_art").select("image_path").eq("id", +b.dataset.gdel).maybeSingle();
    if (a?.image_path) await sb.storage.from("gallery-art").remove([a.image_path]);
    const { error } = await sb.from("gallery_art").delete().eq("id", +b.dataset.gdel); error ? toast(error.message) : screens.admin("gallery"); }));
  app.querySelectorAll("[data-release]").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.rpc("admin_release_reply", { p_ticket: +b.dataset.release, p_reply: null });
    error ? toast(error.message) : (toast("Released to the person"), screens.admin("tickets"));
  }));
};

// ---------- router ----------
async function route() {
  const hm = location.hash.match(/^#\/([a-z]+)(?:\/(\d+))?/) || [], h = hm[1] || "desk", arg = hm[2];
  if (office3d && h !== "office") { office3d.destroy(); office3d = null; document.body.classList.remove("in-office"); }
  if (threadCh && h !== "thread") { sb.removeChannel(threadCh); threadCh = null; }
  if (DEMO) { $("#nav").hidden = true; return screens.office(); }
  const { data: { session } } = await sb.auth.getSession();
  if (session && !me) await loadMe();
  const authed = !!(session && me && me.active);
  $("#nav").hidden = !authed; $("#navAdmin").hidden = !(authed && me.is_admin);
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#/" + h));
  if (session && forceSetPw) return screens.setpw();
  if (!authed) { stopPresence(); if (session && me && !me.active) { await sb.auth.signOut(); toast("This account is turned off."); } return h === "forgot" ? screens.forgot() : screens.login(); }
  const { data: lvl } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (lvl?.nextLevel === "aal2" && lvl.currentLevel !== "aal2" && h !== "security") return screens.mfa();
  startPresence();
  try { await (screens[h] || screens.desk)(arg); } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") { forceSetPw = true; route(); } });
$("#logout").onclick = async () => { stopPresence(); await sb.auth.signOut(); me = null; location.hash = "#/login"; route(); };
window.addEventListener("hashchange", route);
// ---------- installable app ----------
// Why it used to fail: the only "button" on iPhone was a tiny text hint (iOS has no install prompt), on Android/desktop the
// button only appeared if beforeinstallprompt fired and did nothing otherwise, and one tap on "×" hid it forever.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((e) => console.warn("SW", e));
(() => {
  const box = $("#install"), guide = $("#instGuide"), body = $("#igBody"), navI = $("#navInstall");
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const iosOther = ios && /crios|fxios|edgios|opios|gsa\/|instagram|fban|fbav|line\//i.test(ua); // Chrome/Firefox/Edge/in-app on iPhone
  const DEMO_UA = /[?&]demo=1/.test(location.search) && ["localhost", "127.0.0.1"].includes(location.hostname) && (location.search.match(/[?&]install=(iosother|ios|android)/) || [])[1];
  const mode = DEMO_UA || (iosOther ? "iosother" : ios ? "ios" : "android");
  let ev = null;
  const later = () => { const t = +localStorage.getItem("desks-install-later") || 0; return Date.now() - t < 3 * 864e5; }; // "Not now" = 3 days
  const show = (on) => { const s = standalone(); box.hidden = !on || s || later(); navI.hidden = s; };
  const step = (n, icon, text) => `<li><span class="ig-n">${n}</span><span class="ig-i" aria-hidden="true">${icon}</span><span>${text}</span></li>`;
  const shareIcon = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#1a6fe0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M6 11H5v10h14V11h-1"/></svg>`;
  function openGuide() {
    if (mode === "iosother") body.innerHTML = `<p class="ig-lead">On iPhone and iPad, this only works in <b>Safari</b>.</p><ol class="ig-steps">
      ${step(1, "📋", "Tap <b>Copy link</b> below.")}${step(2, "🧭", "Open the <b>Safari</b> app.")}${step(3, "👆", "Tap the address bar, then tap <b>Paste and Go</b>.")}${step(4, "📲", "Then tap the <b>Add Desks to Home Screen</b> button again.")}</ol>
      <button id="igCopy" class="inst-big ghost">📋 Copy link</button>`;
    else if (mode === "ios") body.innerHTML = `<ol class="ig-steps">
      ${step(1, shareIcon, "Tap the <b>Share</b> button (a square with an arrow pointing up). It is at the <b>bottom</b> of the screen (on iPad: top right).")}
      ${step(2, "➕", "Scroll down a little and tap <b>Add to Home Screen</b>.")}
      ${step(3, "✅", "Tap <b>Add</b> in the top right corner.")}</ol><p class="ig-lead">Desks will now be on your Home Screen. Tap it any time to open your office.</p>`;
    else body.innerHTML = `<p class="ig-lead">Your browser didn't offer the one-tap button yet. You can add it from the menu:</p><ol class="ig-steps">
      ${step(1, "⋮", "Tap the <b>menu</b> button (three dots), top right of the browser.")}
      ${step(2, "📲", "Tap <b>Install app</b> or <b>Add to Home screen</b>.")}
      ${step(3, "✅", "Tap <b>Install</b> (or <b>Add</b>).")}</ol>`;
    guide.hidden = false; $("#igX").focus();
    const c = $("#igCopy"); if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(location.href.split("#")[0]); c.textContent = "✅ Link copied"; } catch { prompt("Copy this link:", location.href.split("#")[0]); } };
  }
  const closeGuide = () => (guide.hidden = true);
  $("#igX").onclick = closeGuide; $("#igDone").onclick = closeGuide;
  guide.addEventListener("click", (e) => e.target === guide && closeGuide());
  addEventListener("keydown", (e) => e.key === "Escape" && !guide.hidden && closeGuide());
  async function install() {
    if (ev) { ev.prompt(); const r = await ev.userChoice; ev = null; if (r.outcome === "accepted") show(false); return; }
    openGuide(); // iPhone/iPad (no programmatic install) or prompt not available: clear step-by-step guide
  }
  $("#installBtn").onclick = install; navI.onclick = (e) => { e.preventDefault(); install(); };
  $("#installX").onclick = () => { localStorage.setItem("desks-install-later", String(Date.now())); box.hidden = true; };
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); ev = e; show(true); }); // keep the real prompt for our button
  window.addEventListener("appinstalled", () => { ev = null; show(false); toast("Desks is on your Home Screen 🎉"); });
  matchMedia("(display-mode: standalone)").addEventListener?.("change", () => show(!standalone()));
  // iPhone/iPad never fire beforeinstallprompt, so always offer the guide there; others get the card as soon as the prompt is ready
  show(mode !== "android" || !!DEMO_UA);
  if (DEMO_UA && /[?&]guide=1/.test(location.search)) openGuide();
})();
// let supabase-js consume invite/recovery tokens first
setTimeout(route, /access_token|code=/.test(location.href) ? 600 : 0);
})();
