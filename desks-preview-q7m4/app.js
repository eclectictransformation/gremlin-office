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
  app.innerHTML = `<h1>My cubicle</h1>
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
    ${p.sign_text ? `<p><span class="sign">${esc(p.sign_text)}</span></p>` : ""}
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
    const { error } = await sb.from("tickets").insert({ bot_id: bot.id, body });
    if (error) return toast(error.message);
    toast("Ticket sent!"); location.hash = "#/tickets";
  };
};

screens.tickets = async () => {
  const { data } = await sb.from("tickets").select("id,body,status,reply,created_at,answered_at,bots(name,emoji)").eq("user_id", me.id).order("created_at", { ascending: false }).limit(50);
  app.innerHTML = `<h1>My tickets</h1>${!data?.length ? `<p class="muted">No tickets yet. <a href="#/ticket">Send one</a>.</p>` : ""}
  ${(data || []).map((t) => `<div class="card"><div class="row"><b>#${t.id} → ${esc(t.bots?.emoji)} ${esc(t.bots?.name)}</b><span class="status s-${t.status}">${STATUS[t.status]}</span><span class="muted">${new Date(t.created_at).toLocaleString()}</span></div>
   <p style="white-space:pre-wrap">${esc(t.body)}</p>${t.reply ? `<div class="reply"><b>Reply:</b> ${esc(t.reply)}</div>` : (t.status === "waiting_on_bryan" || t.status === "pending_approval") ? `<p class="muted">This one needs Bryan's OK before the bot starts.</p>` : ""}</div>`).join("")}`;
};

screens.admin = async (tab = "people") => {
  if (!me.is_admin) return (location.hash = "#/desk");
  const { data: lvl } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (lvl?.currentLevel !== "aal2") return (app.innerHTML = `<div class="card narrow"><h1>Admin is locked</h1><p>Admin needs a two-step code. ${lvl?.nextLevel === "aal2" ? `<a class="btn" href="#/mfa">Enter code</a>` : `Set up an authenticator app first on the <a href="#/security">Security</a> screen.`}</p></div>`);
  const [{ data: people }, { data: bots }, { data: access }, { data: pending }] = await Promise.all([
    sb.from("profiles").select("*").order("display_name"), sb.from("bots").select("*").order("id"),
    sb.from("bot_access").select("*"), sb.from("pending_people").select("*").order("login_id")]);
  const has = (u, b) => access.some((a) => a.user_id === u && a.bot_id === b);
  const tabs = `<div class="tabs">${["people", "add", "bots", "tickets", "audit"].map((t) => `<button class="${t === tab ? "" : "ghost"}" data-tab="${t}">${{ people: "People", add: "Add person", bots: "Bots", tickets: "All tickets", audit: "Audit log" }[t]}</button>`).join("")}</div>`;
  let html = "";
  if (tab === "people") {
    html = `<div class="card"><h2>People</h2><table><tr><th>Person</th><th>Bots they can ticket</th><th>Cap</th><th>Pre-approved for creation work</th><th>Active</th></tr>
    ${people.map((p) => `<tr data-u="${p.id}"><td><b>${esc(p.display_name)}</b>${p.is_admin ? " (admin)" : ""}<br><span class="muted">${esc(p.login_id)}</span></td>
     <td class="chips">${bots.map((b) => `<label><input type="checkbox" data-bot="${b.id}" ${has(p.id, b.id) ? "checked" : ""}>${esc(b.name)}</label>`).join("")}</td>
     <td class="mini"><input type="number" min="0" max="100" value="${p.ticket_cap}" data-f="ticket_cap" style="width:4.5em"> per <select data-f="cap_period"><option ${p.cap_period === "day" ? "selected" : ""}>day</option><option ${p.cap_period === "week" ? "selected" : ""}>week</option></select></td>
     <td><input type="checkbox" data-f="pre_approved" ${p.pre_approved ? "checked" : ""} style="width:auto"></td>
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
     <label class="chips"><label><input type="checkbox" id="a_pre">Pre-approved for creation/production work</label></label>
     <label>How should they get their setup link?</label><select id="a_mode"><option value="link">Show me a one-time link (no email sent)</option><option value="email">Email the invite to their personal email</option></select>
     <p id="a_msg"></p><button>Add person</button></form></div>`;
  } else if (tab === "bots") {
    html = `<div class="card"><h2>Bots</h2><table><tr><th>Bot</th><th>Role</th><th>Active</th></tr>${bots.map((b) => `<tr data-b="${b.id}"><td><input value="${esc(b.emoji)}" data-bf="emoji" style="width:3em"> <input value="${esc(b.name)}" data-bf="name" style="width:10em"></td><td><input value="${esc(b.role)}" data-bf="role"></td><td><input type="checkbox" data-bf="active" ${b.active ? "checked" : ""} style="width:auto"></td></tr>`).join("")}</table>
    <h3>Add a bot</h3><div class="row"><input id="nb_name" placeholder="Name" style="width:10em"><input id="nb_role" placeholder="Role" style="width:12em"><button id="nb">Add</button></div></div>`;
  } else if (tab === "audit") {
    const { data: al } = await sb.from("audit_log").select("*").order("at", { ascending: false }).limit(200);
    html = `<div class="card"><h2>Audit log</h2><table><tr><th>When</th><th>Who</th><th>What</th><th>Ticket</th></tr>${(al || []).map((a) => `<tr><td>${new Date(a.at).toLocaleString()}</td><td>${esc(a.actor.startsWith("admin:") ? "admin" : a.actor.startsWith("user:") ? "user" : a.actor)}</td><td>${esc(a.action)} ${esc(a.detail || "")}</td><td>${a.ticket_id ? "#" + a.ticket_id : ""}</td></tr>`).join("")}</table></div>`;
  } else {
    const [{ data: ts }, { data: drafts }] = await Promise.all([sb.from("tickets").select("*, bots(name), profiles(display_name)").order("created_at", { ascending: false }).limit(100), sb.from("ticket_drafts").select("*").is("released_at", null)]);
    html = `<div class="card"><h2>All tickets</h2>${(ts || []).map((t) => `<div class="card" data-t="${t.id}"><div class="row"><b>#${t.id} ${esc(t.profiles?.display_name)} → ${esc(t.bots?.name)}</b><span class="muted">${new Date(t.created_at).toLocaleString()}</span>${t.pre_approved ? "<span class='status'>pre-approved</span>" : ""}</div>
     <p style="white-space:pre-wrap">${esc(t.body)}</p>
     ${(() => { const d = (drafts || []).find((x) => x.ticket_id === t.id); return d ? `<div class="reply"><b>Bot's draft reply (held for your OK):</b>\n${esc(d.draft)}</div><button data-release="${t.id}">Approve &amp; release</button>` : ""; })()}
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
  app.querySelectorAll("[data-release]").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.rpc("admin_release_reply", { p_ticket: +b.dataset.release, p_reply: null });
    error ? toast(error.message) : (toast("Released to the person"), screens.admin("tickets"));
  }));
};

// ---------- router ----------
async function route() {
  const h = (location.hash.match(/^#\/([a-z]+)/) || [])[1] || "desk";
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
  try { await (screens[h] || screens.desk)(); } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") { forceSetPw = true; route(); } });
$("#logout").onclick = async () => { stopPresence(); await sb.auth.signOut(); me = null; location.hash = "#/login"; route(); };
window.addEventListener("hashchange", route);
// let supabase-js consume invite/recovery tokens first
setTimeout(route, /access_token|code=/.test(location.href) ? 600 : 0);
})();
