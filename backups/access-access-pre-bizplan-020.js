/* Desks hub access layer: who is here, what they may open, guest samples, tickets, admin.
   Page-side checks here are for a friendly experience only; anyone can change a page in their own browser.
   The real protection is on the server (database rules), which this file calls in live mode. */
(function () {
  "use strict";
  var C = window.DESKS_ACCESS || { MODE: "mock", GUEST: {}, AREAS: [] };
  var G = Object.assign({ samplesPerRoomPerVisit: 1, maxChars: 1200, deepAllowed: false }, C.GUEST || {});
  var ROOM_AREA = { wren: "wren_room", saji: "saji_room" };
  var GUEST_AREAS = (C.AREAS || []).filter(function (a) { return a.guest; }).map(function (a) { return a.key; });

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function root() { var s = document.currentScript || $('script[src*="access/access.js"]'); return (s && s.getAttribute("data-root")) || ""; }
  var ROOT = root();

  /* ------------------------------------------------------------------ mock backend (prototype) */
  var MK = "desksAccess.mock.v2", MS = "desksAccess.mockSession.v1";
  function seed() {
    var now = Date.now(), d = function (h) { return new Date(now - h * 3600e3).toISOString(); };
    return {
      users: [
        { id: "u-bryan", email: "bryan@eclectictransformation.com", name: "Bryan", kind: "admin", status: "approved", areas: [], created: d(900) },
        { id: "u-theo", email: "theo.marsh@example.com", name: "Theo Marsh", kind: "member", status: "approved", areas: ["gremlin_world", "recipe_shelf", "wren_room", "saji_room", "send_tickets"], note: "Friend from the Thursday class. Building a site for my bike repair stand.", bp: { level: "basic" }, created: d(70) },
        { id: "u-rosa", email: "rosa.l@example.com", name: "Rosa Lindqvist", kind: "member", status: "pending", areas: [], note: "I make small-batch ceramics and want a simple shop page.", created: d(5) },
        { id: "u-dana", email: "dana.o@example.com", name: "Dana Okafor", kind: "member", status: "pending", areas: [], note: "Saw the Desks at the open house. Curious about Saji.", created: d(26) }
      ],
      tickets: [
        { id: 1, user: "u-theo", room: "wren", subject: "Booking page for my repair stand", body: "Saji helped me sort my notes. I'd like a one-page site with hours, prices and a way to book a tune-up.", status: "new", created: d(3) }
      ]
    };
  }
  function db() { try { return JSON.parse(localStorage.getItem(MK)) || seed(); } catch (e) { return seed(); } }
  function put(x) { try { localStorage.setItem(MK, JSON.stringify(x)); } catch (e) {} }
  function sid(v) { try { if (v === undefined) return localStorage.getItem(MS); if (v === null) localStorage.removeItem(MS); else localStorage.setItem(MS, v); } catch (e) { return null; } }
  function used(x, uid) { var day = Date.now() - 864e5; return x.tickets.filter(function (t) { return t.user === uid && Date.parse(t.created) > day; }).length; }
  function areasFor(u) {
    if (!u) return GUEST_AREAS.slice();
    if (u.kind === "admin") return C.AREAS.map(function (a) { return a.key; });
    if (u.status !== "approved") return GUEST_AREAS.slice();
    return C.AREAS.filter(function (a) { return a.guest || u.areas.indexOf(a.key) > -1; }).map(function (a) { return a.key; });
  }
  var mock = {
    me: async function () {
      var x = db(), u = x.users.find(function (z) { return z.id === sid(); });
      var role = !u ? "guest" : u.kind === "admin" ? "admin" : u.status === "approved" ? "member" : u.status;
      return { role: role, display_name: u ? u.name : null, areas: areasFor(u), ticket_cap: 3, cap_period: "day", tickets_used: u ? used(x, u.id) : 0, admin_needs_code: false };
    },
    signIn: async function (email) {
      var x = db(), u = x.users.find(function (z) { return z.email.toLowerCase() === String(email).trim().toLowerCase(); });
      if (!u) throw new Error("That email or password didn't match.");
      sid(u.id); return true;
    },
    officeSignIn: async function (loginId) {
      var id = String(loginId).trim().toLowerCase();
      if (id === "bryan" || id === "bryan@eclectictransformation.com") { sid("u-bryan"); return true; }
      throw new Error("Login ID or password is incorrect.");
    },
    signUp: async function (name, email, pw, note) {
      var x = db(); email = String(email).trim().toLowerCase();
      if (x.users.some(function (z) { return z.email === email; })) throw new Error("There's already an account for that email. Try signing in.");
      var u = { id: "u-" + Math.random().toString(36).slice(2, 9), email: email, name: name.trim().slice(0, 60), kind: "member", status: "pending", areas: [], note: (note || "").trim().slice(0, 300), created: new Date().toISOString() };
      x.users.push(u); put(x); sid(u.id); return { needsConfirm: false };
    },
    signOut: async function () { sid(null); },
    sendTicket: async function (t) {
      var me = await mock.me(); if (me.areas.indexOf("send_tickets") < 0) throw new Error("Sign in with an approved account to send a ticket.");
      if (me.role !== "admin" && me.tickets_used >= me.ticket_cap) throw new Error("You've reached today's limit of " + me.ticket_cap + " tickets. Try again tomorrow.");
      var x = db(), id = x.tickets.reduce(function (m, z) { return Math.max(m, z.id); }, 0) + 1;
      x.tickets.unshift({ id: id, user: sid(), room: t.room, subject: t.subject, body: t.body, status: "new", created: new Date().toISOString() }); put(x); return id;
    },
    myTickets: async function () { var x = db(); return x.tickets.filter(function (t) { return t.user === sid(); }); },
    adminMembers: async function () {
      var x = db(); return x.users.filter(function (u) { return u.kind === "member"; })
        .map(function (u) { return { user_id: u.id, display_name: u.name, email: u.email, intro_note: u.note, status: u.status, areas: u.areas, created_at: u.created }; })
        .sort(function (a, b) { return (b.status === "pending") - (a.status === "pending") || Date.parse(b.created_at) - Date.parse(a.created_at); });
    },
    adminSetStatus: async function (id, s) {
      var x = db(), u = x.users.find(function (z) { return z.id === id; }); if (!u) return;
      if (s === "approved" && u.status !== "approved") ["gremlin_world", "recipe_shelf", "wren_room", "saji_room", "send_tickets"].forEach(function (k) { if (u.areas.indexOf(k) < 0) u.areas.push(k); });
      u.status = s; put(x);
    },
    adminSetArea: async function (id, area, on) {
      var a = C.AREAS.find(function (z) { return z.key === area; }); if (!a || a.officeLogin) throw new Error("That area uses an Office login.");
      var x = db(), u = x.users.find(function (z) { return z.id === id; }); if (!u) return;
      u.areas = u.areas.filter(function (k) { return k !== area; }); if (on) u.areas.push(area); put(x);
    },
    adminTickets: async function () {
      var x = db(); return x.tickets.map(function (t) { var u = x.users.find(function (z) { return z.id === t.user; }) || {}; return Object.assign({ sender_name: u.name, sender_email: u.email }, t, { created_at: t.created }); });
    },
    adminSetTicket: async function (id, s) { var x = db(), t = x.tickets.find(function (z) { return z.id === id; }); if (t) { t.status = s; put(x); } },
    adminSetNote: async function (id, n) { var x = db(), t = x.tickets.find(function (z) { return z.id === id; }); if (t) { t.admin_note = n; put(x); } },
    adminDestination: async function () { return { to: C.MOCK_TICKET_TO, label: C.TICKET_DEST_LABEL + "'s Office inbox" }; },
    reset: function () { localStorage.removeItem(MK); sid(null); }
  };

  /* ------------------------------------------------------------------ live backend (UNTESTED until go-live) */
  var sbp = null;
  function sb() {
    if (sbp) return sbp;
    sbp = new Promise(function (ok, bad) {
      if (window.supabase) return ok(window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY));
      var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; s.async = true;
      s.onload = function () { ok(window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY)); }; s.onerror = bad; document.head.appendChild(s);
    });
    return sbp;
  }
  function chk(r) { if (r.error) throw new Error(r.error.message); return r.data; }
  var live = {
    me: async function () {
      var c = await sb(), s = (await c.auth.getSession()).data.session;
      if (s) { var pend = ss("desksAccess.pendingJoin"); if (pend) { try { var p = JSON.parse(pend); await c.rpc("request_membership", { p_display_name: p.name, p_intro_note: p.note }); } catch (e) {} ss("desksAccess.pendingJoin", ""); } }
      return chk(await c.rpc("my_access"));
    },
    signIn: async function (email, pw) { var c = await sb(); chk(await c.auth.signInWithPassword({ email: email, password: pw })); return true; },
    officeSignIn: async function (loginId, pw) {
      var c = await sb(), r = await c.functions.invoke("login", { body: { login_id: loginId, password: pw } });
      if (r.error || !r.data || !r.data.access_token) throw new Error("Login ID or password is incorrect.");
      chk(await c.auth.setSession({ access_token: r.data.access_token, refresh_token: r.data.refresh_token })); return true;
    },
    signUp: async function (name, email, pw, note) {
      var c = await sb(); ss("desksAccess.pendingJoin", JSON.stringify({ name: name, note: note }));
      var d = chk(await c.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: location.origin + "/" + ROOT + "signin/" } }));
      if (d.session) { await c.rpc("request_membership", { p_display_name: name, p_intro_note: note }); ss("desksAccess.pendingJoin", ""); }
      return { needsConfirm: !d.session };
    },
    signOut: async function () { var c = await sb(); await c.auth.signOut(); },
    sendTicket: async function (t) { var c = await sb(), u = (await c.auth.getUser()).data.user; var d = chk(await c.from("visitor_tickets").insert({ user_id: u && u.id, room: t.room, subject: t.subject, body: t.body }).select("id").single()); return d.id; },
    myTickets: async function () { var c = await sb(); return chk(await c.from("visitor_tickets").select("id,room,subject,status,created_at").order("created_at", { ascending: false }).limit(20)); },
    adminMembers: async function () { var c = await sb(); return chk(await c.rpc("admin_list_members")); },
    adminSetStatus: async function (id, s) { var c = await sb(); chk(await c.rpc("admin_set_member_status", { p_user: id, p_status: s })); },
    adminSetArea: async function (id, a, on) { var c = await sb(); chk(await c.rpc("admin_set_area", { p_user: id, p_area: a, p_on: on })); },
    adminTickets: async function () { var c = await sb(); return chk(await c.rpc("admin_visitor_tickets", { p_status: null })); },
    adminSetTicket: async function (id, s) { var c = await sb(); chk(await c.from("visitor_tickets").update({ status: s }).eq("id", id)); },
    adminSetNote: async function (id, note) { var c = await sb(); chk(await c.from("visitor_tickets").update({ admin_note: note }).eq("id", id)); },
    adminDestination: async function () { var c = await sb(); return chk(await c.rpc("admin_ticket_destination")); }
  };


  /* ------------------------------------------------------------------ Business Planning (one thread with Saji Tori) */
  var BP_PRESET = { basic: { turn_limit: 12, open_threads: 1, weekly_threads: 3, wren_scripts: 1 }, full: { turn_limit: null, open_threads: 5, weekly_threads: null, wren_scripts: null } };
  var BP_MAX = 20000;
  var BP_NOTES = { waiting_on_wren: C.BP_WREN_NOTE || "Wren says your script should take about 3–5 minutes. You can close this page and come back.", script_review: "Your script is getting a quick look-over." };
  function bpOf(u) { var b = Object.assign({ level: "basic", pip_review: null, review_replies: false }, BP_PRESET.basic, (u && u.bp) || {}); if (u && u.kind === "admin" && !(u.bp && u.bp.level)) Object.assign(b, { level: "full" }, BP_PRESET.full, { open_threads: 50 }); return b; }
  function bpStore(x) { x.bp = x.bp || { threads: [], messages: [] }; return x.bp; }
  function bpFire(tid) { try { window.dispatchEvent(new CustomEvent("desks-bp-change", { detail: { thread: tid } })); } catch (e) {} }
  function bpMe(x) { var u = x.users.find(function (z) { return z.id === sid(); }); return u && (u.kind === "admin" || u.status === "approved") ? u : null; }
  function nextId(a) { return a.reduce(function (m, z) { return Math.max(m, z.id); }, 0) + 1; }
  function bpBody(s) { s = String(s || "").trim(); if (!s) throw new Error("Write something first."); if (s.length > BP_MAX) throw new Error("That's over " + BP_MAX.toLocaleString() + " characters. Split it into two posts."); return s; }
  var mockBp = {
    limits: async function () {
      var x = db(), u = bpMe(x); if (!u) return { level: "example" };
      var b = bpOf(u), s = bpStore(x), week = Date.now() - 7 * 864e5, mine = s.threads.filter(function (t) { return t.user === u.id; });
      return { level: b.level, turn_limit: b.turn_limit, open_threads: b.open_threads, weekly_threads: b.weekly_threads, wren_scripts: b.wren_scripts,
        open_now: mine.filter(function (t) { return t.status === "open"; }).length, this_week: mine.filter(function (t) { return Date.parse(t.created_at) > week; }).length };
    },
    threads: async function () { var x = db(), s = bpStore(x); return s.threads.filter(function (t) { return t.user === sid(); }).sort(function (a, b) { return b.id - a.id; }); },
    messages: async function (tid) {
      var x = db(), s = bpStore(x), u = x.users.find(function (z) { return z.id === sid(); }), t = s.threads.find(function (z) { return z.id === tid; });
      if (!t || !u || (t.user !== u.id && u.kind !== "admin")) return [];
      return s.messages.filter(function (m) { return m.thread_id === tid && (m.status === "sent" || u.kind === "admin"); });
    },
    start: async function (title, body, intake) {
      var x = db(), u = bpMe(x); if (!u || bpOf(u).level === "example") throw new Error("Business Planning needs an approved account.");
      var b = bpOf(u), s = bpStore(x), mine = s.threads.filter(function (t) { return t.user === u.id; }), week = Date.now() - 7 * 864e5;
      var open = mine.filter(function (t) { return t.status === "open"; }).length;
      if (open >= b.open_threads) throw new Error("You already have " + open + " open plan" + (open === 1 ? "" : "s") + ". Close one to start another.");
      if (b.weekly_threads != null && mine.filter(function (t) { return Date.parse(t.created_at) > week; }).length >= b.weekly_threads) throw new Error("Weekly limit reached (" + b.weekly_threads + " new plans per week).");
      body = bpBody(body); title = String(title || "").trim().slice(0, 120) || "My plan";
      var now = new Date().toISOString(), t = { id: nextId(s.threads), user: u.id, title: title, status: "open", phase: "saji", intake_type: intake || "free", visitor_turns: 1, wren_scripts: 0, created_at: now, updated_at: now };
      s.threads.push(t); s.messages.push({ id: nextId(s.messages), thread_id: t.id, author: "person", author_label: null, reviewed_by: null, kind: "text", body: body, status: "sent", created_at: now });
      x.bpEmails = (x.bpEmails || []).concat([{ thread: t.id, subject: "Gremlin Ticket: Business Planning #" + t.id }]);
      put(x); bpFire(t.id); return t.id;
    },
    post: async function (tid, body) {
      var x = db(), u = bpMe(x), s = bpStore(x), t = s.threads.find(function (z) { return z.id === tid; });
      if (!u || !t || t.user !== u.id) throw new Error("Thread not available.");
      if (t.status !== "open") throw new Error("This plan is closed.");
      var b = bpOf(u); if (b.turn_limit != null && t.visitor_turns >= b.turn_limit) throw new Error("Turn limit reached (" + b.turn_limit + " messages in this plan). Bryan can open up more.");
      body = bpBody(body); var now = new Date().toISOString();
      s.messages.push({ id: nextId(s.messages), thread_id: t.id, author: "person", author_label: null, reviewed_by: null, kind: "text", body: body, status: "sent", created_at: now });
      t.visitor_turns++; t.updated_at = now; x.bpEmails = (x.bpEmails || []).concat([{ thread: t.id, subject: "Gremlin Ticket: Business Planning #" + t.id }]);
      put(x); bpFire(t.id); return true;
    },
    close: async function (tid) { var x = db(), s = bpStore(x), t = s.threads.find(function (z) { return z.id === tid; }); if (t && t.status === "open") { t.status = "closed"; t.updated_at = new Date().toISOString(); put(x); bpFire(tid); } },
    subscribe: function (tid, cb) {
      var h = function (e) { if (!e.detail || e.detail.thread === tid) cb(); }, st = function (e) { if (e.key === MK) cb(); };
      window.addEventListener("desks-bp-change", h); window.addEventListener("storage", st);
      return function () { window.removeEventListener("desks-bp-change", h); window.removeEventListener("storage", st); };
    },
    adminSettings: async function () { var x = db(); return x.users.filter(function (u) { return u.kind === "member"; }).map(function (u) { var b = bpOf(u); return { user_id: u.id, bp_level: b.level, bp_turn_limit: b.turn_limit, bp_open_threads: b.open_threads, bp_weekly_threads: b.weekly_threads, bp_wren_scripts: b.wren_scripts, bp_pip_review: b.pip_review, bp_review_replies: b.review_replies }; }); },
    adminSetLevel: async function (id, level) { var x = db(), u = x.users.find(function (z) { return z.id === id; }); if (!u) return; u.bp = Object.assign(bpOf(u), { level: level }, BP_PRESET[level] || {}); put(x); },
    adminSetLimits: async function (id, o) { var x = db(), u = x.users.find(function (z) { return z.id === id; }); if (!u) return; u.bp = Object.assign(bpOf(u), o); put(x); },
    adminThreads: async function () {
      var x = db(), s = bpStore(x), cut = Date.now() - 15 * 60e3;
      return s.threads.map(function (t) {
        var ms = s.messages.filter(function (m) { return m.thread_id === t.id; }), u = x.users.find(function (z) { return z.id === t.user; }) || {};
        var lp = ms.filter(function (m) { return m.author === "person"; }).pop(), lb = ms.filter(function (m) { return m.author === "bot"; }).pop();
        return Object.assign({}, t, { member_name: u.name, messages: ms.length, held: ms.filter(function (m) { return m.status === "held"; }).length, last_at: t.updated_at,
          stuck: t.status === "open" && !!lp && (!lb || Date.parse(lp.created_at) > Date.parse(lb.created_at)) && Date.parse(lp.created_at) < cut });
      }).sort(function (a, b) { return Date.parse(b.last_at) - Date.parse(a.last_at); });
    },
    adminRelease: async function (mid) { var x = db(), m = bpStore(x).messages.find(function (z) { return z.id === mid; }); if (m && m.status === "held") { m.status = "sent"; put(x); bpFire(m.thread_id); } }
  };
  // Mock-only stand-in for Saji's side (bp-api). Used by the local tests; never present in live mode.
  var mockBot = {
    reply: function (tid, body, label, kind, reviewedBy) {
      var x = db(), s = bpStore(x), t = s.threads.find(function (z) { return z.id === tid; }); if (!t || t.status !== "open") throw new Error("thread not available");
      label = label || "Saji Tori"; kind = kind || "text";
      var u = x.users.find(function (z) { return z.id === t.user; }), b = bpOf(u);
      if (kind === "script" && label !== "Wren") throw new Error("scripts are posted as Wren");
      if (kind === "script" && b.wren_scripts != null && t.wren_scripts >= b.wren_scripts) throw new Error("limit: Wren script limit reached");
      var now = new Date().toISOString();
      s.messages.push({ id: nextId(s.messages), thread_id: tid, author: "bot", author_label: label, reviewed_by: reviewedBy || null, kind: kind, body: String(body).trim(), status: b.review_replies ? "held" : "sent", created_at: now });
      if (kind === "script") { t.wren_scripts++; t.phase = "saji"; }
      t.updated_at = now; put(x); bpFire(tid); return { source: "business_planning", status: b.review_replies ? "held_for_bryan" : "posted" };
    },
    status: function (tid, phase) {
      var x = db(), s = bpStore(x), t = s.threads.find(function (z) { return z.id === tid; }); if (!t) throw new Error("thread not available");
      var now = new Date().toISOString(); t.phase = phase; t.updated_at = now;
      if (BP_NOTES[phase]) s.messages.push({ id: nextId(s.messages), thread_id: tid, author: "status", author_label: "Saji Tori", reviewed_by: null, kind: "status", body: BP_NOTES[phase], status: "sent", created_at: now });
      put(x); bpFire(tid); return { source: "business_planning", phase: phase, note: BP_NOTES[phase] || null };
    },
    emails: function () { return db().bpEmails || []; }
  };
  var liveBp = {
    limits: async function () { var c = await sb(); return chk(await c.rpc("bp_my_limits")); },
    threads: async function () { var c = await sb(); return chk(await c.from("bp_threads").select("id,title,status,phase,intake_type,visitor_turns,wren_scripts,created_at,updated_at").order("id", { ascending: false }).limit(50)); },
    messages: async function (tid) { var c = await sb(); return chk(await c.from("bp_messages").select("id,thread_id,author,author_label,reviewed_by,kind,body,status,created_at").eq("thread_id", tid).order("id").limit(500)); },
    start: async function (title, body, intake) { var c = await sb(); bpBody(body); return chk(await c.rpc("bp_start_thread", { p_title: String(title || "").trim() || "My plan", p_body: body, p_intake: intake || "free" })); },
    post: async function (tid, body) { var c = await sb(); bpBody(body); return chk(await c.rpc("bp_post", { p_thread: tid, p_body: body })); },
    close: async function (tid) { var c = await sb(); chk(await c.rpc("bp_close_thread", { p_thread: tid })); },
    subscribe: function (tid, cb) {
      var ch = null, stop = false;
      sb().then(async function (c) {
        if (stop) return;
        var s = (await c.auth.getSession()).data.session; if (s) c.realtime.setAuth(s.access_token);
        ch = c.channel("bp:" + tid, { config: { private: true } })
          .on("postgres_changes", { event: "*", schema: "public", table: "bp_messages", filter: "thread_id=eq." + tid }, function () { cb(); })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bp_threads", filter: "id=eq." + tid }, function () { cb(); })
          .subscribe();
      });
      return function () { stop = true; sb().then(function (c) { if (ch) c.removeChannel(ch); }); };
    },
    adminSettings: async function () { var c = await sb(); return chk(await c.rpc("admin_bp_settings")); },
    adminSetLevel: async function (id, level) { var c = await sb(); chk(await c.rpc("admin_bp_set_level", { p_user: id, p_level: level })); },
    adminSetLimits: async function (id, o) { var c = await sb(); chk(await c.rpc("admin_bp_set_limits", { p_user: id, p_turn_limit: o.turn_limit, p_open_threads: o.open_threads, p_weekly_threads: o.weekly_threads, p_wren_scripts: o.wren_scripts, p_pip_review: o.pip_review, p_review_replies: o.review_replies })); },
    adminThreads: async function () { var c = await sb(); return chk(await c.rpc("admin_bp_threads")); },
    adminRelease: async function (mid) { var c = await sb(); chk(await c.rpc("admin_bp_release", { p_message: mid })); }
  };

  var API = C.MODE === "live" ? live : mock;
  API.bp = C.MODE === "live" ? liveBp : mockBp;

  // (Preview switcher removed from the live pack.)

  /* ------------------------------------------------------------------ shared UI */
  var ROLE_WORD = { guest: "Guest", pending: "Waiting for approval", member: "Member", admin: "Admin", staff: "Office team", blocked: "Guest", signed_in_no_member: "Finishing sign-up" };
  function bar(me) {
    var el = document.createElement("div"); el.className = "da-bar"; el.setAttribute("role", "region"); el.setAttribute("aria-label", "Your access");
    var who = me.role === "guest" ? "Browsing as a guest" : "Signed in as <b>" + esc(me.display_name || "you") + "</b> &middot; " + ROLE_WORD[me.role];
    var links = me.role === "guest"
      ? '<a class="da-link" href="' + ROOT + 'signin/">Sign in</a>'
      : (me.role === "admin" ? '<a class="da-link" href="' + ROOT + 'admin/">Access page</a>' : "") +
        (me.areas.indexOf("send_tickets") > -1 ? '<a class="da-link" href="' + ROOT + 'ticket/">Tickets</a>' : "") +
        '<button class="da-link" type="button" data-da-out>Sign out</button>';
    el.innerHTML = '<span class="da-who">' + who + "</span><span class=\"da-links\">" + links + "</span>";
    var out = el.querySelector("[data-da-out]"); if (out) out.onclick = async function () { await API.signOut(); location.reload(); };
    return el;
  }
  function protoSwitch() { /* live pack: no preview switcher */ }

  /* ------------------------------------------------------------------ guest sample limits in rooms */
  function roomGate(room, me) {
    var area = ROOM_AREA[room]; if (!area) return;
    var full = me.areas.indexOf(area) > -1, form = $("form"), results = $("#results");
    var key = "desksAccess.sample." + room, usedN = function () { return +(ss(key) || 0); };
    var note = document.createElement("div"); note.className = "da-note"; note.setAttribute("role", "note");
    if (full) {
      note.innerHTML = "<strong>Full room.</strong> You're signed in, so every option is open." + (me.areas.indexOf("send_tickets") > -1 ? " When you're happy with it, you can send the result to " + esc(C.TICKET_DEST_LABEL) + " as a ticket." : "");
    } else {
      note.innerHTML = "<strong>Guest sample.</strong> You get " + (G.samplesPerRoomPerVisit === 1 ? "one short try" : G.samplesPerRoomPerVisit + " short tries") + " in this room per visit, with the easy version only. " +
        '<a href="' + ROOT + 'signin/">Sign in or create an account</a> for the full room and to send a ticket.';
    }
    if (form) form.parentNode.insertBefore(note, form);
    if (full || !form) { addResultCta(room, me, full); return; }

    // easy version only
    document.querySelectorAll('input[name="depth"]').forEach(function (r) {
      if (r.value !== "easy" && !G.deepAllowed) { r.disabled = true; r.checked = false; var l = r.closest("label"); if (l) { l.classList.add("da-locked"); var sm = l.querySelector("small"); if (sm) sm.textContent = "Members only. Sign in to plan it all out."; } }
      if (r.value === "easy") r.checked = true;
    });
    // short text
    var tas = Array.prototype.slice.call(form.querySelectorAll("textarea"));
    var per = Math.floor(G.maxChars / Math.max(1, tas.length));
    tas.forEach(function (t) { t.maxLength = per; if (t.value.length > per) t.value = t.value.slice(0, per); });
    var counter = document.createElement("p"); counter.className = "da-count"; counter.setAttribute("aria-live", "polite");
    var lastTa = tas[tas.length - 1]; if (lastTa) lastTa.insertAdjacentElement("afterend", counter);
    function count() { var n = tas.reduce(function (s, t) { return s + t.value.length; }, 0); counter.textContent = n + " / " + per * tas.length + " characters in the guest sample"; }
    tas.forEach(function (t) { t.addEventListener("input", count); }); count();

    function lock() {
      var btn = form.querySelector('button[type="submit"]'); if (btn) { btn.disabled = true; btn.textContent = "Sample used for this visit"; }
      var m = form.querySelector(".da-used"); if (!m) { m = document.createElement("p"); m.className = "da-used"; form.appendChild(m); }
      m.innerHTML = "That was your guest sample for this room. Your result stays on this device. " + '<a href="' + ROOT + 'signin/">Sign in</a> to keep going.';
    }
    if (usedN() >= G.samplesPerRoomPerVisit && !(results && !results.hidden)) lock();
    else if (usedN() >= G.samplesPerRoomPerVisit) lock();
    // runs before the room's own submit handler (capture phase)
    document.addEventListener("submit", function (e) {
      if (e.target !== form) return;
      if (usedN() >= G.samplesPerRoomPerVisit) { e.preventDefault(); e.stopImmediatePropagation(); lock(); return; }
      var text = tas.map(function (t) { return t.value.trim(); }).join(" ").trim();
      if (text.length >= 10) { ss(key, String(usedN() + 1)); setTimeout(lock, 0); }
    }, true);
    addResultCta(room, me, false);
  }
  function addResultCta(room, me, full) {
    var results = $("#results"); if (!results) return;
    var box = document.createElement("div"); box.className = "da-cta";
    if (full && me.areas.indexOf("send_tickets") > -1) box.innerHTML = "<p>Want " + esc(C.TICKET_DEST_LABEL) + " to see this?</p><a class=\"da-btn\" href=\"" + ROOT + "ticket/?room=" + room + "\">Send it as a ticket</a>";
    else if (!full) box.innerHTML = "<p>Liked the sample? Members get the in-depth version, longer notes, and can send the result to " + esc(C.TICKET_DEST_LABEL) + ".</p><a class=\"da-btn\" href=\"" + ROOT + "signin/\">Sign in or create an account</a>";
    else return;
    results.appendChild(box);
  }

  /* ------------------------------------------------------------------ boot */
  var ready = API.me().catch(function () { return { role: "guest", areas: GUEST_AREAS.slice(), tickets_used: 0, ticket_cap: 0 }; });
  window.DesksAccess = { api: API, config: C, ready: ready, esc: esc, root: ROOT, ss: ss, BP_MAX: BP_MAX };
  if (C.MODE !== "live") window.DesksAccess.mockBot = mockBot;
  document.addEventListener("DOMContentLoaded", function () {
    ready.then(function (me) {
      var s = $('script[src*="access/access.js"]'), room = s && s.getAttribute("data-room");
      var host = $(".da-bar-slot") || document.body; if (!s || s.getAttribute("data-bar") !== "off") host.insertBefore(bar(me), host.firstChild);
      if (room) roomGate(room, me);
      protoSwitch();
      document.dispatchEvent(new CustomEvent("desks-access", { detail: me }));
    });
  });
})();
