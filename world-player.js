/* Gremlin World: Gremlin Names, the quest journal, badges, the guestbook and progress sync.
   No libraries. Talks to the Gremlin World Supabase project with plain fetch() calls to
   /rest/v1/rpc/gw_* using the PUBLISHABLE key (public by design; every write goes through locked-down
   SECURITY DEFINER functions, see README-world.md + supabase/). No email, no passwords: a Gremlin Name is
   a nickname, and the server hands out a short random Gremlin Key once (two little words and a number, like moss-sock-7; older three-word keys still work).
   If the server can't be reached the world keeps working as a guest, progress saved on this device. */
(function () {
  "use strict";
  var CFG = {
    url: "https://ydotiqwobbenwqeerkoc.supabase.co",
    key: "sb_publishable_MqY3Lf60gY2OnVOShQMKRg_yRYCO4Nv",   // publishable (anon-level) key: safe to ship
    timeout: 8000
  };
  var params = new URLSearchParams(location.search);
  var OFFLINE = params.has("offline");          // ?offline: pretend the server is unreachable (testing)
  var PFX = "gremlin-world-";
  var PROGRESS_KEYS = ["socks", "socksReset", "visited", "greeted", "found", "played", "badges", "sock", "time", "first"];

  function load(k, def) { try { var v = localStorage.getItem(PFX + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(PFX + k); } catch (e) {} }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var W = null, GW = null, player = load("player", null), panel = null, returnFocus = null;
  if (player && (!player.token || (player.expires_at && Date.parse(player.expires_at) < Date.now()))) { player = null; del("player"); }
  var sync = { state: player ? "idle" : "local", at: 0, timer: null, busy: false, again: false };
  var session = 0, pendingScore = null, signedToday = false, lb = {}, statsCache = null;

  /* ---------- the server ---------- */
  function rpc(fn, body, opts) {
    if (OFFLINE) return Promise.reject(new Error("offline"));
    var ctl = window.AbortController ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, CFG.timeout) : null;
    return fetch(CFG.url + "/rest/v1/rpc/" + fn, {
      method: "POST", headers: { "apikey": CFG.key, "Content-Type": "application/json" },
      body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined, keepalive: !!(opts && opts.keepalive)
    }).then(function (r) {
      clearTimeout(t); if (!r.ok) throw new Error("http " + r.status); return r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }
  var JOKES = [
    "Hmm. The gremlins may have filed you under 'snacks.' Try again, or play as a guest while we dig.",
    "Noodle looked under every cushion. No luck. Check the key, or play as a guest for now.",
    "That key opened the snack drawer instead. One more try?",
    "Grimble sneezed on the paperwork. Try again, or explore as a guest while he tidies up.",
    "Noodle says the filing cabinet is being shy. Give it another go?"
  ], jokeN = Math.floor(Math.random() * JOKES.length);
  function joke() { return JOKES[(jokeN++) % JOKES.length]; }
  var OFFLINE_MSG = "Noodle can't reach the gremlin filing cabinet right now. You can keep playing as a guest; your progress stays on this device.";
  var ERR = {
    length: "Gremlin Names are 3 to 20 characters.",
    chars: "Letters, numbers, spaces, - and _ only, please.",
    rude: "Let's pick something a bit friendlier. The gremlins blush easily.",
    reserved: "That name belongs to someone in the office already. Try another!",
    taken: "Someone already has that name. Add a number, or a tiny twist?",
    busy: "Lots of gremlins at the door right now. Try again in a minute.",
    slow_down: "Lots of tries in a row. Noodle is making tea; give it ten minutes.",
    once_a_day: "You've signed today. The ink needs a day to dry.",
    bad_phrase: "That line wandered off. Pick another?",
    bad_stamp: "That stamp is out of ink. Pick another?"
  };
  function errText(code) { return code === "not_found" ? joke() : ERR[code] || joke(); }
  function sessionLost() {
    player = null; del("player"); sync.state = "local"; updateButton();
    toast("\uD83D\uDCA4", "Your Gremlin Name nodded off.", "Log in again with your key to keep syncing.");
  }

  /* ---------- progress: what's on this device <-> the server (the server merges, nothing is lost) ---------- */
  function allGames() { var out = []; var ms = (W && W.arcade && W.arcade.machines) || {}; Object.keys(ms).forEach(function (k) { (ms[k].games || []).forEach(function (g) { out.push(Object.assign({ machine: k }, g)); }); }); return out; }
  function getBest(id) { try { var v = localStorage.getItem(PFX + "arcade-best-" + id); return v == null || isNaN(+v) ? null : +v; } catch (e) { return null; } }
  function localProgress() {
    var bests = {}; allGames().forEach(function (g) { var b = getBest(g.id); if (b != null) bests[g.id] = b; });
    return { v: 1, socks: load("socks", []), socksReset: load("socksReset", 0), visited: load("visited", []), greeted: load("greeted", []),
      found: load("found", []), bests: bests, played: load("played", {}), badges: load("badges", {}), sock: load("sock", {}),
      time: load("time", 0), first: load("first", null) || undefined };
  }
  function union(a, b) { var o = (a || []).slice(); (b || []).forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
  function mapMerge(a, b, pick) { var o = Object.assign({}, a || {}); Object.keys(b || {}).forEach(function (k) { o[k] = o[k] == null ? b[k] : pick(k, o[k], b[k]); }); return o; }
  function lowGame(id) { var g = allGames().filter(function (x) { return x.id === id; })[0]; return g && g.best === "low"; }
  function minDef(a, b) { return a == null ? b : b == null ? a : Math.min(a, b); }
  function maxDef(a, b) { return a == null ? b : b == null ? a : Math.max(a, b); }
  // same rules as gw.merge_progress on the server
  function merge(a, b) {
    var ra = a.socksReset || 0, rb = b.socksReset || 0, sa = a.sock || {}, sb = b.sock || {};
    return { v: 1, socks: rb > ra ? (b.socks || []) : ra > rb ? (a.socks || []) : union(a.socks, b.socks), socksReset: Math.max(ra, rb),
      visited: union(a.visited, b.visited), greeted: union(a.greeted, b.greeted), found: union(a.found, b.found),
      bests: mapMerge(a.bests, b.bests, function (k, x, y) { return lowGame(k) ? Math.min(x, y) : Math.max(x, y); }),
      played: mapMerge(a.played, b.played, function (k, x, y) { return Math.max(x, y); }),
      badges: mapMerge(a.badges, b.badges, function (k, x, y) { return Math.min(x, y); }),
      sock: { start: rb > ra ? sb.start : ra > rb ? sa.start : minDef(sa.start, sb.start), best: minDef(sa.best, sb.best),
              last: (sb.done || 0) > (sa.done || 0) ? sb.last : (sa.last != null ? sa.last : sb.last), done: maxDef(sa.done, sb.done) },
      time: maxDef(a.time, b.time), first: minDef(a.first, b.first) };
  }
  function applyProgress(p) {
    var cur = localProgress(), m = merge(cur, p || {}), changed = JSON.stringify(m) !== JSON.stringify(merge(cur, {}));
    PROGRESS_KEYS.forEach(function (k) { if (m[k] != null) save(k, k === "sock" ? JSON.parse(JSON.stringify(m.sock)) : m[k]); });
    Object.keys(m.bests || {}).forEach(function (id) { try { localStorage.setItem(PFX + "arcade-best-" + id, String(m.bests[id])); } catch (e) {} });
    if (changed && GW && GW.reloadProgress) GW.reloadProgress();
    return changed;
  }
  function clearLocal() {
    PROGRESS_KEYS.forEach(del);
    allGames().forEach(function (g) { try { localStorage.removeItem(PFX + "arcade-best-" + g.id); } catch (e) {} });
    save("first", Date.now());
    if (GW && GW.reloadProgress) GW.reloadProgress();
  }
  function scheduleSync(ms) {
    if (!player) return;
    clearTimeout(sync.timer); sync.timer = setTimeout(doSync, ms == null ? 2500 : ms);
  }
  function doSync(opts) {
    if (!player) return Promise.resolve(false);
    if (sync.busy) { sync.again = true; return Promise.resolve(false); }
    sync.busy = true; clearTimeout(sync.timer);
    var tok = player.token;
    return rpc("gw_save_progress", { p_token: tok, p_progress: localProgress() }, opts).then(function (r) {
      sync.busy = false;
      if (!player || player.token !== tok) return false;
      if (!r || !r.ok) { if (r && r.error === "session") sessionLost(); else sync.state = "error"; refreshJournal(); return false; }
      sync.state = "ok"; sync.at = Date.now();
      applyProgress(r.progress); evalBadges(); refreshJournal();
      if (sync.again) { sync.again = false; scheduleSync(800); }
      return true;
    }, function () { sync.busy = false; sync.state = "error"; refreshJournal(); if (player) scheduleSync(30000); return false; });
  }

  /* ---------- badges (data in world-data.json -> badges; earned ones live in the progress JSON) ---------- */
  function badgeDefs() { return (W && W.badges && W.badges.list) || []; }
  function badgeMet(r, ev) {
    var visited = load("visited", []), found = load("found", []), sock = load("sock", {}), socks = load("socks", []), played = load("played", {});
    switch (r.type) {
      case "rooms": return visited.length >= r.n;
      case "allRooms": return Object.keys(W.rooms).every(function (id) { return visited.indexOf(id) >= 0; });
      case "sockHunt": return (sock.done || 0) > 0 || socks.length >= W.socksTotal;
      case "sockTime": return !!sock.best && sock.best < r.ms;
      case "secrets": return found.length >= r.n;
      case "allSecrets": var list = GW ? GW.secrets() : []; return list.length > 0 && list.every(function (s) { return found.indexOf(s.id) >= 0; });
      case "playedAll": return allGames().every(function (g) { return (played[g.id] || 0) > 0; });
      case "event": return ev === r.event;
      case "hours": var h = new Date().getHours(); return h >= r.from && h < r.to;
    }
    return false;
  }
  function evalBadges(ev) {
    if (!W) return [];
    var have = load("badges", {}), got = [];
    badgeDefs().forEach(function (b) { if (!have[b.id] && badgeMet(b.rule || {}, ev)) { have[b.id] = Date.now(); got.push(b); } });
    if (got.length) {
      save("badges", have);
      if (!window.GW_CALM) got.forEach(function (b, i) { setTimeout(function () { toast(b.icon, "Badge earned: " + b.name, b.desc); }, i * 1800); });
      scheduleSync(1500); refreshJournal();
    }
    return got;
  }

  /* ---------- cozy toasts ---------- */
  var toastBox = null, toastQ = [], toastOn = false;
  function toast(icon, title, sub) { toastQ.push([icon, title, sub]); if (!toastOn) nextToast(); }
  function nextToast() {
    var t = toastQ.shift(); if (!t) { toastOn = false; return; } toastOn = true;
    if (!toastBox) { toastBox = el("div", "gw-toasts"); toastBox.setAttribute("role", "status"); toastBox.setAttribute("aria-live", "polite"); (document.getElementById("app") || document.body).appendChild(toastBox); }
    var d = el("div", "gw-toast"); d.appendChild(el("span", "gw-toast-icon", t[0]));
    var tx = el("span", "gw-toast-text"); tx.appendChild(el("b", "", t[1])); if (t[2]) tx.appendChild(el("small", "", t[2])); d.appendChild(tx);
    toastBox.appendChild(d);
    setTimeout(function () { d.classList.add("out"); setTimeout(function () { d.remove(); nextToast(); }, 400); }, 3600);
  }

  /* ---------- panels (sign-in card, journal, guestbook): one at a time ---------- */
  function makePanel(id, cls, label) {
    var p = el("div", "gw-panel " + cls); p.id = id; p.hidden = true;
    p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true"); p.setAttribute("aria-label", label);
    var box = el("div", "gw-box"), x = el("button", "card-close", "\u00d7"); x.type = "button"; x.setAttribute("aria-label", "Close");
    x.addEventListener("click", closePanel); box.appendChild(x); box.appendChild(el("div", "gw-body")); p.appendChild(box);
    p.addEventListener("click", function (e) { if (e.target === p) closePanel(); });
    (document.getElementById("app") || document.body).appendChild(p);
    return p;
  }
  function showPanel(p, focusSel) {
    if (panel && panel !== p) panel.hidden = true;
    if (!panel) returnFocus = document.activeElement;
    if (GW && GW.hideBubble) GW.hideBubble(); if (GW && GW.closeCard) GW.closeCard();
    panel = p; p.hidden = false;
    var f = (focusSel && $(focusSel, p)) || $(".gw-body button, .gw-body input", p) || $(".card-close", p);
    setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }
  function closePanel() {
    if (!panel) return; panel.hidden = true; panel = null;
    if (returnFocus && document.contains(returnFocus)) try { returnFocus.focus({ preventScroll: true }); } catch (e) {}
  }
  window.addEventListener("keydown", function (e) {
    if (!panel) return;
    if (e.key === "Escape") { e.preventDefault(); closePanel(); return; }
    if (e.key === "Tab") {   // keep focus inside the open card
      var f = Array.prototype.filter.call(panel.querySelectorAll("button, input, select, a[href], textarea"), function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return; var i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- the sign-in card ---------- */
  var signin = null;
  function view(name) {
    if (!signin) signin = makePanel("gw-signin", "gw-signin", "Gremlin Name");
    var b = $(".gw-body", signin); b.innerHTML = ""; b.dataset.view = name;
    signin.classList.toggle("gw-calm", /^(guide|lock|key-shown)/.test(name));   // big-text, one-main-action cards
    return b;
  }
  function btn(text, cls, fn) { var x = el("button", "gw-btn " + (cls || ""), text); x.type = "button"; if (fn) x.addEventListener("click", fn); return x; }
  function errLine() { var p = el("p", "gw-err"); p.setAttribute("role", "alert"); return p; }
  function head(b, kicker, title, text) {
    var img = el("img", "gw-noodle"); img.src = "assets/gremlins/noodle.webp"; img.alt = ""; b.appendChild(img);
    b.appendChild(el("p", "meta", kicker)); var h = el("h2", "", title); b.appendChild(h); if (text) b.appendChild(el("p", "gw-text", text));
  }
  /* ---------- gentle cards: the welcome guide and the "not yet" door (same panel, focus and Esc as sign-in) ---------- */
  // o: {view, img, kicker, title, lines[], primary:{label,fn}, secondary:{label,fn}, extra:{label,fn}}
  function openGentle(o) {
    var b = view(o.view || "gentle");
    if (o.img !== false) { var img = el("img", "gw-noodle"); img.src = o.img || "assets/gremlins/noodle.webp"; img.alt = ""; b.appendChild(img); }
    if (o.kicker) b.appendChild(el("p", "meta", o.kicker));
    b.appendChild(el("h2", "", o.title));
    (o.lines || []).forEach(function (t) { b.appendChild(el("p", "gw-text", t)); });
    var g = el("div", "gw-choices");
    if (o.primary) g.appendChild(btn(o.primary.label, "gw-primary", o.primary.fn));
    if (o.secondary) g.appendChild(btn(o.secondary.label, "ghost gw-secondary", o.secondary.fn));
    b.appendChild(g);
    if (o.extra) { var x = el("button", "gw-textlink", o.extra.label); x.type = "button"; x.addEventListener("click", o.extra.fn); b.appendChild(x); }
    showPanel(signin, ".gw-primary");
  }
  // The first-visit welcome guide: three short cards, once per device; reopen from Help or the stamps page.
  var GUIDE = [
    { title: "Welcome in", lines: ["Wander, play games and hunt for socks. All of it is free, no key needed.", "Drag to look around. Glowing things want to be tapped. Doors and tunnels take you places."] },
    { title: "The gremlins are very friendly", lines: ["With a Gremlin Key, the gremlins remember you. Your journal and scores follow you to any device.", "You can also sign the guestbook and join the Brawl boards."] },
    { title: "Something hidden", lines: ["With a Gremlin Key, you may find other offers hidden inside, some that even Bryan doesn't know about.", "It's just a nickname and a short key, like moss-sock-7. No email."] }
  ];
  function lookAround() { save("guide-seen", Date.now()); if (!player && !load("player-choice", null)) save("player-choice", "guest"); closePanel(); }
  function openGuide(step) {
    step = step || 0; var c = GUIDE[step], last = step === GUIDE.length - 1;
    save("guide-seen", Date.now());
    openGentle({ view: "guide-" + (step + 1), kicker: "welcome \u00b7 " + (step + 1) + " of " + GUIDE.length, title: c.title, lines: c.lines,
      primary: last ? { label: player ? "Back to wandering" : "Get my Gremlin Key", fn: function () { if (player) closePanel(); else viewNew(); } } : { label: "Next", fn: function () { openGuide(step + 1); } },
      secondary: last ? (player ? null : { label: "Just look around for now", fn: lookAround }) : { label: "Skip, just let me wander", fn: lookAround },
      extra: last && !player ? { label: "I already have a Gremlin Key", fn: viewLogin } : null });
  }
  function openSignin(which, pending) {
    if (pending) pendingScore = pending;
    if (which === "new") return viewNew();
    if (which === "key") return viewLogin();
    if (player) return viewAccount();
    var b = view("choose");
    head(b, "welcome to gremlin world", "Who's visiting?", "No email, no passwords. A Gremlin Name is a nickname plus a short key like moss-sock-7, so your quest journal and arcade scores follow you to any device.");
    var g = el("div", "gw-choices");
    g.appendChild(btn("Play as a guest", "ghost", function () { save("player-choice", "guest"); closePanel(); toast("\uD83C\uDF3F", "Exploring as a guest", window.GW_STORAGE === "memory" ? "Progress lasts until you close this window. Tap the badge up top any time to save it with a Gremlin Name." : "Progress stays on this device. Tap the badge up top any time to save it."); }));
    g.appendChild(btn(hasLocalProgress() ? "Save my progress (new Gremlin Name)" : "New Gremlin Name", "", viewNew));
    g.appendChild(btn("I have a Gremlin Key", "ghost", viewLogin));
    b.appendChild(g);
    b.appendChild(el("p", "gw-fine", "Guests can visit every room, play every game and hunt every sock. With a Gremlin Name, the gremlins remember you: your journal and scores follow you to any device, and you can sign the guestbook and join the Break Room Brawl boards."));
    if (window.GW_STORAGE === "memory") memoryNote(b);
    showPanel(signin);
  }
  // This browser blocks storage in this frame: say so kindly and offer the full-window version.
  function memoryNote(b) {
    var p = el("p", "gw-fine gw-memory", "Heads up: this browser won't let the pop-up remember things, so progress lasts until you close it. ");
    if (window.self !== window.top) {
      var q = new URLSearchParams(location.search); q.delete("embed"); q.delete("noprompt");
      var a = el("a", "", "Open in a new window"); a.href = "world.html" + (q.toString() ? "?" + q : "") + location.hash; a.target = "_blank"; a.rel = "noopener";
      p.appendChild(a); p.appendChild(document.createTextNode(" to keep it."));
    }
    b.appendChild(p);
  }
  function hasLocalProgress() { var p = localProgress(); return p.socks.length + p.found.length + Math.max(0, p.visited.length - 1) + Object.keys(p.bests).length > 0; }
  function viewNew() {
    var b = view("new");
    head(b, "a new gremlin name", "Pick a Gremlin Name", "3 to 20 characters: letters, numbers, spaces, - or _. It shows on the scoreboards, so keep it friendly (and not your real name, if you like).");
    var f = el("form", "gw-form"); f.noValidate = true;
    var lab = el("label", "gw-label", "Gremlin Name"), inp = el("input"); inp.type = "text"; inp.maxLength = 20; inp.autocomplete = "off"; inp.spellcheck = false; inp.name = "gremlin-name"; inp.placeholder = "e.g. Captain Crumbs";
    lab.appendChild(inp); f.appendChild(lab); var er = errLine(); f.appendChild(er);
    var go = btn("Make my Gremlin", ""); go.type = "submit"; f.appendChild(go);
    f.appendChild(btn("Back", "ghost small", function () { openSignin(); }));
    f.addEventListener("submit", function (e) {
      e.preventDefault(); var n = inp.value.replace(/\s+/g, " ").trim();
      if (n.length < 3 || n.length > 20) { er.textContent = ERR.length; return; }
      if (!/^[A-Za-z0-9 _-]+$/.test(n)) { er.textContent = ERR.chars; return; }
      go.disabled = true; er.textContent = ""; go.textContent = "Asking the gremlins\u2026";
      rpc("gw_register", { p_name: n }).then(function (r) {
        go.disabled = false; go.textContent = "Make my Gremlin";
        if (!r || !r.ok) { er.textContent = errText(r && r.error); return; }
        signedIn(r); viewKey(r);
      }, function () { go.disabled = false; go.textContent = "Make my Gremlin"; er.textContent = OFFLINE_MSG; });
    });
    b.appendChild(f); showPanel(signin, "input");
  }
  function keyText(r) {
    return "Gremlin World\r\n\r\nGremlin Name: " + r.name + "\r\nGremlin Key:  " + r.key + "\r\n\r\nKeep this somewhere safe. Writing it down works too.\r\nThe gremlins can't look it up later, so keep it handy.\r\n" + location.href.split("#")[0] + "\r\n";
  }
  function viewKey(r) {
    // calm pass (round 4): two main actions, a cream key panel, no pressure lines, no exclamation marks
    var b = view("key-shown");
    head(b, "your gremlin key", "Hello, " + r.name, "This is your Gremlin Key. It's how the gremlins recognise you on any device.");
    var k = el("div", "gw-key"); k.appendChild(el("span", "gw-key-label", "Gremlin Key")); var code = el("code", "gw-key-code", r.key); k.appendChild(code); b.appendChild(k);
    b.appendChild(el("p", "gw-text gw-save", "Keep this somewhere safe. Writing it down works too."));
    var done = btn("I saved it. Into the world", "gw-done", function () { closePanel(); afterSignIn(true); });
    done.disabled = true;
    var note = el("p", "gw-fine gw-note", "");
    var ok = function (msg) { done.disabled = false; note.textContent = msg; };
    var row = el("div", "gw-row gw-keyrow");
    row.appendChild(btn("Copy key", "", function () {
      var txt = r.key, fin = function () { ok("Copied. Paste it somewhere safe."); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(fin, function () { selectCode(code); ok("Selected. Press Ctrl+C (or Cmd+C) to copy."); });
      else { selectCode(code); try { document.execCommand("copy"); fin(); } catch (e) { ok("Selected. Press Ctrl+C (or Cmd+C) to copy."); } }
    }));
    var mail = el("a", "gw-btn gw-mail", "Email it to myself"); mail.id = "gw-key-mail";
    // no address prefilled: it opens the visitor's own email app and we collect and send nothing
    var mailHref = function () { return "mailto:?subject=" + encodeURIComponent("My Gremlin Key") + "&body=" + encodeURIComponent("My Gremlin World name and key\n\nGremlin Name: " + r.name + "\nGremlin Key: " + r.key + "\n\nHow to use it: open Gremlin World, tap Guest at the top, choose \"I have a Gremlin Key\", and type the name and key (capitals and spaces don't matter). It works on any device.\n\n" + location.href.split("#")[0].split("?")[0]); }; mail.href = mailHref();
    mail.addEventListener("click", function () { ok("Your email app should open. Send it to yourself."); });
    row.appendChild(mail); b.appendChild(row);
    // "Give me another": brand-new players can swap the key for a fresh one (server: gw_reroll_key)
    var again = btn("Give me another", "ghost small", function () {
      again.disabled = true; again.textContent = "Shaking the key jar\u2026";
      rpc("gw_reroll_key", { p_token: player && player.token }).then(function (x) {
        again.disabled = false; again.textContent = "Give me another";
        if (x && x.ok && x.key) { r.key = x.key; code.textContent = x.key; mail.href = mailHref(); done.disabled = true; note.textContent = ""; delete note.dataset.saved; cb.checked = false; }
        else note.textContent = "That's the key the gremlins picked for you. Keep this one.";
      }, function () { again.disabled = false; again.textContent = "Give me another"; note.textContent = OFFLINE_MSG; });
    });
    b.appendChild(again);
    b.appendChild(el("p", "gw-fine", "The email button opens your own email app. Nothing is sent to us."));
    b.appendChild(el("p", "gw-fine", "The gremlins can't look it up later, so keep it handy."));
    var dl = el("button", "gw-textlink gw-dl", "Download it as a small text file"); dl.type = "button";
    dl.addEventListener("click", function () {
      var a = el("a"); a.href = URL.createObjectURL(new Blob([keyText(r)], { type: "text/plain" }));
      a.download = "gremlin-key-" + r.name.replace(/[^A-Za-z0-9_-]+/g, "-") + ".txt"; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); ok("Downloaded. Keep the file somewhere safe.");
    });
    b.appendChild(dl);
    var wrote = el("label", "gw-check"), cb = el("input"); cb.type = "checkbox"; cb.addEventListener("change", function () { if (cb.checked) ok("Good. Gremlins love a written note."); else if (!note.dataset.saved) { done.disabled = true; note.textContent = ""; } }); wrote.appendChild(cb); wrote.appendChild(document.createTextNode(" I wrote it down")); b.appendChild(wrote);
    var ok0 = ok; ok = function (msg) { if (msg.indexOf("Gremlins love") < 0) note.dataset.saved = "1"; ok0(msg); };
    b.appendChild(note); b.appendChild(done);
    showPanel(signin);
  }
  // standing rule: every key field shows the format, visible while typing
  function keyHelp() { return el("p", "gw-fine gw-keyhelp", "Your key is two little words and a number, like moss-sock-7. (Older three-word keys still work.)"); }
  function selectCode(code) { try { var r = document.createRange(); r.selectNodeContents(code); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {} }
  function viewLogin() {
    var b = view("login");
    head(b, "welcome back", "I have a Gremlin Key", "Type your Gremlin Name and your Gremlin Key. Capitals and spaces don't matter.");
    var f = el("form", "gw-form"); f.noValidate = true;
    var l1 = el("label", "gw-label", "Gremlin Name"), n = el("input"); n.type = "text"; n.maxLength = 20; n.autocomplete = "username"; n.spellcheck = false; n.name = "gremlin-name"; l1.appendChild(n);
    var l2 = el("label", "gw-label", "Gremlin Key"), k = el("input"); k.type = "text"; k.maxLength = 40; k.autocomplete = "off"; k.spellcheck = false; k.name = "gremlin-key"; k.placeholder = "moss-sock-7"; l2.appendChild(k);
    f.appendChild(l1); f.appendChild(l2); f.appendChild(keyHelp()); var er = errLine(); f.appendChild(er);
    var go = btn("Let me in", ""); go.type = "submit"; f.appendChild(go);
    f.appendChild(btn("Back", "ghost small", function () { openSignin(); }));
    f.addEventListener("submit", function (e) {
      e.preventDefault(); if (!n.value.trim() || !k.value.trim()) { er.textContent = "Both boxes, please: your Gremlin Name and your key."; return; }
      go.disabled = true; er.textContent = ""; go.textContent = "Checking the filing cabinet\u2026";
      rpc("gw_login", { p_name: n.value, p_key: k.value }).then(function (r) {
        go.disabled = false; go.textContent = "Let me in";
        if (!r || !r.ok) {
          er.textContent = errText(r && r.error);
          if (r && r.error === "not_found") { var g = btn("Play as a guest instead", "ghost small", function () { save("player-choice", "guest"); closePanel(); }); if (!$(".gw-guest-alt", f)) { g.classList.add("gw-guest-alt"); f.appendChild(g); } }
          return;
        }
        signedIn(r); closePanel(); afterSignIn(false);
      }, function () { go.disabled = false; go.textContent = "Let me in"; er.textContent = OFFLINE_MSG; });
    });
    b.appendChild(f); showPanel(signin, "input");
  }
  function viewAccount() {
    var b = view("account");
    head(b, "your gremlin name", "You're " + player.name + "!", "Your quest journal and Brawl scores are saved under this name. Log in anywhere with your name and Gremlin Key.");
    b.appendChild(el("p", "gw-sync", syncText()));
    var g = el("div", "gw-choices");
    g.appendChild(btn("Open my quest journal", "", function () { openJournal(); }));
    g.appendChild(btn("Sync now", "ghost", function () { doSync().then(function () { if (panel === signin) viewAccount(); }); }));
    g.appendChild(btn("Log out", "ghost", function () { logout(); }));
    b.appendChild(g);
    var d = el("details", "gw-forget"); d.appendChild(el("summary", "", "Delete my Gremlin Name"));
    d.appendChild(el("p", "gw-fine", "This removes your name, progress, scores and guestbook lines from the server for good. Type your Gremlin Key to confirm."));
    var k = el("input"); k.type = "text"; k.placeholder = "moss-sock-7"; k.autocomplete = "off"; k.setAttribute("aria-label", "Gremlin Key"); d.appendChild(k); d.appendChild(keyHelp());
    var er = errLine(); d.appendChild(er);
    d.appendChild(btn("Delete it", "danger small", function () {
      rpc("gw_forget_me", { p_token: player.token, p_key: k.value }).then(function (r) {
        if (!r || !r.ok) { er.textContent = r && r.error === "session" ? "Your session nodded off. Log in again first." : "That key doesn't match. Nothing was deleted."; return; }
        player = null; del("player"); clearLocal(); updateButton(); closePanel(); toast("\uD83D\uDC4B", "Gremlin Name deleted", "Thanks for visiting. You're a guest again.");
      }, function () { er.textContent = OFFLINE_MSG; });
    }));
    b.appendChild(d);
    showPanel(signin);
  }
  function signedIn(r) {
    player = { name: r.name, token: r.token, expires_at: r.expires_at }; save("player", player); save("player-choice", "named");
    sync.state = "idle"; lb = {}; updateButton();
  }
  function afterSignIn(isNew) {
    try { window.dispatchEvent(new CustomEvent("gremlin-signed-in", { detail: { isNew: isNew } })); } catch (e) {}   // key rooms and Gremlish lift at once
    toast(isNew ? "\uD83C\uDF89" : "\uD83D\uDC4B", isNew ? "Welcome, " + player.name + "!" : "Welcome back, " + player.name + "!", isNew ? "Your progress is saved under your new name." : "Fetching your quest journal\u2026");
    var tok = player.token;
    rpc("gw_load_progress", { p_token: tok }).then(function (r) { if (r && r.ok) signedToday = !!r.signed_today; }).catch(function () {});
    doSync().then(function () {
      if (pendingScore && player && player.token === tok) {
        var p = pendingScore; pendingScore = null;
        submitScore(p.game, p.score).then(function (r) { if (r && r.ok) toast("\uD83C\uDFC5", "Score on the board: " + r.best, r.top10 ? "You're #" + r.rank + " in the top 10!" : "You're #" + r.rank + ". Keep going!"); });
      }
    });
  }
  function logout() {
    var tok = player && player.token, name = player && player.name;
    var go = function () {
      if (tok) rpc("gw_logout", { p_token: tok }).catch(function () {});
      player = null; del("player"); save("player-choice", "guest"); sync.state = "local"; signedToday = false;
      clearLocal(); updateButton(); closePanel();
      toast("\uD83D\uDC4B", "Logged out", "Your progress is safe under " + name + ". This device is a guest again.");
    };
    // push anything not yet saved before we tidy this device
    doSync().then(go, go);
  }
  function syncText() {
    if (!player) return "Saved on this device only.";
    if (sync.state === "ok") return "Saved to the gremlin filing cabinet" + (sync.at ? " at " + new Date(sync.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "") + ".";
    if (sync.state === "error") return "Can't reach the filing cabinet right now. Saved on this device; we'll try again.";
    return "Syncing\u2026";
  }

  /* ---------- top-bar buttons ---------- */
  var pbtn = null, jbtn = null;
  function makeButtons() {
    var right = $(".hud-right"); if (!right || pbtn) return;
    jbtn = el("button", "pill btn gw-journal-btn"); jbtn.type = "button"; jbtn.id = "btn-journal"; jbtn.setAttribute("aria-label", "Quest journal"); jbtn.setAttribute("aria-haspopup", "dialog");
    jbtn.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 2h10a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2z" fill="#F3D98B" stroke="#3A4A33" stroke-width="1.6"/><path d="M7 6h6M7 9h6M7 12h4" stroke="#3A4A33" stroke-width="1.4"/></svg><span>Journal</span>';
    jbtn.addEventListener("click", function () { openJournal(); });
    pbtn = el("button", "pill btn gw-player-btn"); pbtn.type = "button"; pbtn.id = "btn-player"; pbtn.setAttribute("aria-haspopup", "dialog");
    pbtn.addEventListener("click", function () { openSignin(); });
    right.insertBefore(jbtn, right.firstChild); right.insertBefore(pbtn, right.firstChild);
    updateButton();
  }
  function updateButton() {
    if (!pbtn) return;
    pbtn.innerHTML = ""; var face = el("img"); face.src = "assets/gremlins/noodle.webp"; face.alt = ""; pbtn.appendChild(face);
    pbtn.appendChild(el("span", "gw-pname", player ? player.name : "Guest"));
    pbtn.classList.toggle("named", !!player);
    pbtn.setAttribute("aria-label", player ? "Signed in as " + player.name + ". Account options" : "Playing as a guest. Get a Gremlin Name or log in");
  }

  /* ---------- the quest journal ---------- */
  var journal = null;
  function fmtTime(ms) { var s = Math.round(ms / 1000), m = Math.floor(s / 60); return m + ":" + ("0" + (s % 60)).slice(-2); }
  function fmtLong(sec) { sec = Math.max(0, Math.floor(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + "h " + m + "m" : m ? m + "m " + ("0" + s).slice(-2) + "s" : s + "s"; }
  function bar(n, of) { var b = el("div", "gw-bar"), i = el("i"); i.style.width = (of ? Math.min(100, 100 * n / of) : 0) + "%"; b.appendChild(i); b.setAttribute("role", "progressbar"); b.setAttribute("aria-valuemin", "0"); b.setAttribute("aria-valuemax", String(of)); b.setAttribute("aria-valuenow", String(n)); return b; }
  function section(b, title, count) { var s = el("section", "gw-sec"), h = el("h3"); h.appendChild(document.createTextNode(title)); if (count) h.appendChild(el("span", "gw-count", count)); s.appendChild(h); b.appendChild(s); return s; }
  function chip(text, cls, title) { var c = el("span", "gw-chip " + (cls || ""), text); if (title) c.title = title; return c; }
  function timeLine() { var first = load("first", null); return "This visit: " + fmtLong(session) + " \u00b7 Total: " + fmtLong(load("time", 0) || 0) + (first ? " \u00b7 First visit: " + new Date(first).toLocaleDateString() : ""); }
  function openJournal() {
    if (window.GW_CALM && window.GremlinShift && window.GremlinShift.openStamps) return window.GremlinShift.openStamps();   // the Shifting House shows room stamps instead (same saved data)
    if (!journal) journal = makePanel("gw-journal", "gw-journal", "Quest journal");
    renderJournal(); showPanel(journal, ".card-close");
    if (player) doSync();
    loadStats();
  }
  function refreshJournal() { if (journal && !journal.hidden) renderJournal(); if (signin && !signin.hidden && $(".gw-body", signin).dataset.view === "account") { var s = $(".gw-sync", signin); if (s) s.textContent = syncText(); } }
  function renderJournal() {
    if (!W) return;
    var b = $(".gw-body", journal); var scroll = b.scrollTop; b.innerHTML = "";
    var p = localProgress(), sock = p.sock || {};
    var hd = el("div", "gw-jhead"); hd.appendChild(el("p", "meta", "quest journal"));
    hd.appendChild(el("h2", "", player ? player.name + "'s Quest Journal" : "Your Quest Journal"));
    var who = el("p", "gw-text");
    if (player) who.textContent = syncText();
    else { who.textContent = "Exploring as a guest. Progress is saved on this device. "; var sv = btn("Save my progress", "small", function () { openSignin("new"); }); who.appendChild(sv); who.appendChild(btn("Why a Gremlin Key?", "ghost small", function () { openGuide(0); })); }
    hd.appendChild(who); b.appendChild(hd);

    // sock hunt
    var socksAll = []; Object.keys(W.rooms).forEach(function (rid) { (W.rooms[rid].items || []).forEach(function (it) { if (it.type === "sock") socksAll.push(it); }); });
    var s1 = section(b, "\uD83E\uDDE6 Sock Hunt", p.socks.length + " / " + W.socksTotal);
    s1.appendChild(bar(p.socks.length, W.socksTotal));
    var row = el("div", "gw-socks");
    socksAll.forEach(function (it) {
      var got = p.socks.indexOf(it.id) >= 0, c = el("span", "gw-sock" + (got ? " got" : ""));
      if (got) { var im = el("img"); im.src = "assets/world/props/sock-" + it.gremlin + ".svg"; im.alt = ""; c.appendChild(im); c.appendChild(el("small", "", it.gremlin.charAt(0).toUpperCase() + it.gremlin.slice(1))); }
      else { c.appendChild(el("b", "", "???")); }
      row.appendChild(c);
    });
    s1.appendChild(row);
    var st = [];
    if (sock.start && p.socks.length > 0 && p.socks.length < W.socksTotal) st.push("Hunt clock: " + fmtTime(Date.now() - sock.start) + " since your first sock (no rush!)");
    if (sock.last) st.push("Last hunt: " + fmtTime(sock.last) + " from first sock to fifth");
    if (sock.best) st.push("Best: " + fmtTime(sock.best));
    if (sock.done) st.push("Hunts finished: " + sock.done);
    if (!st.length) st.push("Five socks went missing in the wash. Find one to start the hunt clock.");
    s1.appendChild(el("p", "gw-note", st.join(" \u00b7 ")));

    // secrets
    var list = GW ? GW.secrets() : [], foundN = list.filter(function (x) { return p.found.indexOf(x.id) >= 0; }).length;
    var s2 = section(b, "\u2728 Secrets", foundN + " / " + list.length); s2.appendChild(bar(foundN, list.length));
    var byRoom = {}; list.forEach(function (x) { (byRoom[x.room] = byRoom[x.room] || []).push(x); });
    Object.keys(W.rooms).forEach(function (rid) {
      if (!byRoom[rid]) return; var known = p.visited.indexOf(rid) >= 0;
      var line = el("div", "gw-room-line"); line.appendChild(el("span", "gw-room-name", known ? W.rooms[rid].short || W.rooms[rid].name : "???"));
      var chips = el("span", "gw-chips");
      byRoom[rid].forEach(function (x) { var f = p.found.indexOf(x.id) >= 0; chips.appendChild(chip(f ? x.label : "???", f ? "on" : "off", f ? x.label : "Not found yet")); });
      line.appendChild(chips); s2.appendChild(line);
    });

    // rooms
    var rids = Object.keys(W.rooms), vis = rids.filter(function (r) { return p.visited.indexOf(r) >= 0; }).length;
    var s3 = section(b, "\uD83D\uDDFA\uFE0F Rooms", vis + " / " + rids.length); s3.appendChild(bar(vis, rids.length));
    var rc = el("div", "gw-chips"); rids.forEach(function (r) { var k = p.visited.indexOf(r) >= 0; rc.appendChild(chip(k ? W.rooms[r].name : "???", k ? "on" : "off")); }); s3.appendChild(rc);

    // arcade
    var games = allGames(), playedN = games.filter(function (g) { return (p.played[g.id] || 0) > 0; }).length;
    var s4 = section(b, "\uD83D\uDD79\uFE0F Arcade", playedN + " / " + games.length + " played");
    var tbl = el("div", "gw-games");
    games.forEach(function (g) {
      var pl = p.played[g.id] || 0, bst = p.bests[g.id], r = el("div", "gw-game" + (pl ? "" : " off"));
      r.appendChild(el("span", "gw-gname", pl || bst != null ? g.name : "???"));
      r.appendChild(el("span", "gw-gmach", W.arcade.machines[g.machine].title + (g.ranked ? " \u2605" : "")));
      r.appendChild(el("span", "gw-gbest", bst != null ? "best " + bst : pl ? "played" : "-"));
      tbl.appendChild(r);
    });
    s4.appendChild(tbl);
    s4.appendChild(el("p", "gw-note", "\u2605 = Break Room Brawl games with shared top-10 boards" + (player ? "." : " (get a Gremlin Name to join).")));

    // time
    var s5 = section(b, "\u23F3 Time in the world");
    s5.appendChild(el("p", "gw-note gw-time", timeLine()));

    // badges
    var defs = badgeDefs(), have = p.badges || {}, nb = defs.filter(function (d) { return have[d.id]; }).length;
    var s6 = section(b, "\uD83C\uDFC5 Badges", nb + " / " + defs.length);
    var grid = el("div", "gw-badges");
    defs.forEach(function (d) {
      var on = !!have[d.id], c = el("div", "gw-badge" + (on ? " on" : ""));
      c.appendChild(el("span", "gw-bicon", on ? d.icon : "?"));
      c.appendChild(el("b", "", on ? d.name : "???"));
      c.appendChild(el("small", "", on ? d.desc + " (" + new Date(have[d.id]).toLocaleDateString() + ")" : d.desc));
      grid.appendChild(c);
    });
    s6.appendChild(grid);

    // everyone
    var s7 = section(b, "\uD83C\uDF0D All the gremlins");
    var sp = el("p", "gw-note gw-stats");
    if (statsCache === "error") sp.textContent = "The gremlin census is napping (can't reach the server). Your own journal still works.";
    else if (!statsCache) sp.textContent = "Counting gremlins\u2026";
    else {
      var s = statsCache, bits = [s.players + " named gremlin" + (s.players === 1 ? "" : "s"), s.sock_hunt_finished + " finished the Sock Hunt"];
      if (s.fastest_sock_hunt_ms) bits.push("fastest hunt " + fmtTime(s.fastest_sock_hunt_ms));
      bits.push("average secrets found: " + s.avg_secrets); bits.push(s.all_rooms + " found every room"); bits.push(s.guestbook_signatures + " guestbook signature" + (s.guestbook_signatures === 1 ? "" : "s"));
      sp.textContent = bits.join(" \u00b7 ");
    }
    s7.appendChild(sp);
    b.scrollTop = scroll;
  }
  function loadStats() {
    rpc("gw_stats", {}).then(function (s) { statsCache = s && typeof s === "object" ? s : "error"; refreshJournal(); }, function () { statsCache = "error"; refreshJournal(); });
  }

  /* ---------- Break Room Brawl boards ---------- */
  function getBoard(id, fresh) {
    var c = lb[id]; if (c && !fresh && Date.now() - c.t < 20000) return Promise.resolve(c.rows);
    return rpc("gw_leaderboard", { p_game_id: id, p_limit: 10 }).then(function (rows) { if (!Array.isArray(rows)) throw new Error("bad"); lb[id] = { t: Date.now(), rows: rows }; return rows; });
  }
  function submitScore(id, score) {
    if (!player) return Promise.resolve({ ok: false, message: "Get a Gremlin Name to join the board!" });
    return rpc("gw_submit_score", { p_token: player.token, p_game_id: id, p_score: Math.round(score), p_meta: { v: 1 } }).then(function (r) {
      delete lb[id];
      if (!r || !r.ok) {
        if (r && r.error === "session") { sessionLost(); return { ok: false, message: "Your Gremlin Name nodded off. Log in again to post scores." }; }
        return { ok: false, message: r && r.error === "busy" ? "Whoa, speedy! The board needs a minute to catch its breath." : "The board didn't take that one." };
      }
      evalBadges("brawl-score"); if (r.top10) evalBadges("brawl-top10");
      setTimeout(refreshRoomBoards, 300);
      return r;
    });
  }
  function rankedGames() { return allGames().filter(function (g) { return g.ranked; }); }
  function refreshRoomBoards() {
    if (!GW || GW.room !== "arcade") return;
    var gs = rankedGames(), chalk = GW.item("brawl-board"), cab = GW.item("cabinet-purple");
    Promise.all(gs.map(function (g) { return getBoard(g.id).then(function (r) { return { g: g, rows: r }; }, function () { return { g: g, rows: null }; }); })).then(function (res) {
      if (chalk) {
        var box = $(".chalk-rows", chalk); if (box) {
          box.innerHTML = "";
          res.forEach(function (x) {
            var col = el("span", "chalk-col"); col.appendChild(el("i", "", x.g.name.toUpperCase()));
            if (!x.rows) col.appendChild(el("span", "", "(napping)"));
            else if (!x.rows.length) col.appendChild(el("span", "", "be the first!"));
            else x.rows.slice(0, 3).forEach(function (r) { col.appendChild(el("span", "", r.rank + ". " + r.name + "  " + r.score)); });
            box.appendChild(col);
          });
        }
      }
      if (cab) {
        var sm = $(".scrtxt small", cab); if (!sm) return;
        var lines = []; res.forEach(function (x) { if (x.rows && x.rows[0]) lines.push(x.g.name.split(" ")[0].toUpperCase() + " #1 " + x.rows[0].name + " " + x.rows[0].score); });
        if (!lines.length) lines = ["TOP 10 BOARDS"]; var i = 0; sm.textContent = lines[0];
        clearInterval(cab._tick); if (lines.length > 1) cab._tick = setInterval(function () { if (!sm.isConnected) return clearInterval(cab._tick); i = (i + 1) % lines.length; sm.textContent = lines[i]; }, 2600);
      }
    });
  }

  /* ---------- the guestbook (preset lines only, one signature a day) ---------- */
  var gb = null;
  function openGuestbook() {
    if (!gb) gb = makePanel("gw-guestbook", "gw-guestbook", "The Gremlin Guestbook");
    renderGuestbook(null); showPanel(gb, ".card-close");
    rpc("gw_guestbook", { p_limit: 20 }).then(function (rows) { renderGuestbook(Array.isArray(rows) ? rows : "error"); }, function () { renderGuestbook("error"); });
  }
  function renderGuestbook(rows) {
    var b = $(".gw-body", gb); b.innerHTML = ""; var cfg = W.guestbook || { phrases: [], stamps: [] };
    b.appendChild(el("p", "meta", "the archive"));
    b.appendChild(el("h2", "", "The Gremlin Guestbook"));
    b.appendChild(el("p", "gw-text", "Visitors leave a kind line for the gremlins. Preset lines only, one signature per day."));
    var pages = el("ol", "gw-entries");
    if (rows === null) pages.appendChild(el("li", "gw-empty", "Turning the pages\u2026"));
    else if (rows === "error") pages.appendChild(el("li", "gw-empty", "The guestbook is napping (can't reach the server). Try again in a bit."));
    else if (!rows.length) pages.appendChild(el("li", "gw-empty", "No signatures yet. The first page is all yours."));
    else rows.forEach(function (r) {
      var li = el("li"); li.appendChild(el("span", "gw-stamp", r.stamp || "\u270D\uFE0F"));
      var t = el("span", "gw-entry"); t.appendChild(el("q", "", r.phrase)); t.appendChild(el("small", "", "\u2014 " + r.name + " \u00b7 " + new Date(r.signed_on + "T12:00:00").toLocaleDateString())); li.appendChild(t);
      pages.appendChild(li);
    });
    b.appendChild(pages);
    var sign = el("div", "gw-sign");
    if (!player) {
      sign.appendChild(el("p", "gw-note", "Only named gremlins can sign (it keeps the book tidy)."));
      sign.appendChild(btn("Get a Gremlin Name to sign", "", function () { openSignin(); }));
    } else if (signedToday) {
      sign.appendChild(el("p", "gw-note", ERR.once_a_day + " Come back tomorrow, " + player.name + "!"));
    } else if (rows !== "error") {
      sign.appendChild(el("h3", "", "Sign as " + player.name));
      var lab = el("label", "gw-label", "Your line"), sel = el("select");
      cfg.phrases.forEach(function (p) { var o = el("option", "", p.text); o.value = p.id; sel.appendChild(o); });
      sel.selectedIndex = Math.floor(Math.random() * cfg.phrases.length);
      lab.appendChild(sel); sign.appendChild(lab);
      var stamps = el("div", "gw-stamps"); stamps.setAttribute("role", "radiogroup"); stamps.setAttribute("aria-label", "Stamp");
      var chosen = ""; var mk = function (id, emoji, label) {
        var s = el("button", "gw-stampbtn" + (id === chosen ? " on" : ""), emoji); s.type = "button"; s.setAttribute("role", "radio"); s.setAttribute("aria-checked", id === chosen ? "true" : "false"); s.setAttribute("aria-label", label); s.title = label;
        s.addEventListener("click", function () { chosen = id; stamps.querySelectorAll(".gw-stampbtn").forEach(function (x) { x.classList.toggle("on", x === s); x.setAttribute("aria-checked", x === s ? "true" : "false"); }); });
        stamps.appendChild(s);
      };
      mk("", "\u2014", "No stamp"); cfg.stamps.forEach(function (s) { mk(s.id, s.emoji, s.label); });
      sign.appendChild(el("span", "gw-label", "Add a stamp (optional)")); sign.appendChild(stamps);
      var er = errLine(); sign.appendChild(er);
      var go = btn("Sign the guestbook", "", function () {
        go.disabled = true; er.textContent = "";
        rpc("gw_sign_guestbook", { p_token: player.token, p_phrase_id: +sel.value, p_stamp_id: chosen || null }).then(function (r) {
          go.disabled = false;
          if (!r || !r.ok) { if (r && r.error === "session") { sessionLost(); renderGuestbook(rows); return; } if (r && r.error === "once_a_day") signedToday = true; er.textContent = errText(r && r.error); return; }
          signedToday = true; toast("\u270D\uFE0F", "Signed!", "The gremlins will read it at tea time.");
          openGuestbook();
        }, function () { go.disabled = false; er.textContent = OFFLINE_MSG; });
      });
      sign.appendChild(go);
    }
    b.appendChild(sign);
  }

  /* ---------- world events ---------- */
  function onEvent(kind, data) {
    if (kind === "ready") { GW = data; W = GW.data; init(); setTimeout(refreshRoomBoards, 50); return; }
    if (!W) return;
    if (kind === "room-built") { if (data.room === "arcade") setTimeout(refreshRoomBoards, 50); return; }
    if (kind === "sock" || kind === "egg" || kind === "room" || kind === "socks-reset" || kind === "greeted") { evalBadges(); scheduleSync(); refreshJournal(); }
  }
  var inited = false;
  function init() {
    if (inited) return; inited = true;
    if (!load("first", null)) save("first", Date.now());
    makeButtons();
    if (window.GremlinArcade && GremlinArcade.setHooks) GremlinArcade.setHooks({
      player: function () { return player && player.name; },
      played: function (g) { var pl = load("played", {}); pl[g.id] = (pl[g.id] || 0) + 1; save("played", pl); evalBadges(); scheduleSync(); },
      ended: function () { scheduleSync(); },
      leaderboard: function (id) { return getBoard(id); },
      ranked: function (g, score) { return submitScore(g.id, score); },
      signIn: function (pending) { openSignin(null, pending); if (pending) pendingScore = pending; }
    });
    evalBadges();
    // time played: counts while the page is visible
    setInterval(function () { if (document.visibilityState !== "visible") return; session += 5; save("time", (load("time", 0) || 0) + 5); if (journal && !journal.hidden) { var t = $(".gw-time", journal); if (t) t.textContent = timeLine(); } }, 5000);
    setInterval(function () { evalBadges(); }, 60000);   // night owl
    if (player) {
      doSync();
      rpc("gw_load_progress", { p_token: player.token }).then(function (r) { if (r && r.ok) { signedToday = !!r.signed_today; if (r.name && r.name !== player.name) { player.name = r.name; save("player", player); updateButton(); } } else if (r && r.error === "session") sessionLost(); }).catch(function () {});
    }
    setInterval(function () { if (player && document.visibilityState === "visible") doSync(); }, 60000);
    window.addEventListener("focus", function () { if (player && Date.now() - sync.at > 10000) doSync(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && player) doSync({ keepalive: true }); });
    // first visit on this device: the welcome guide (it ends in the sign-in choices, so there's never two cards back to back)
    if (!player && !load("guide-seen", null) && !params.has("noprompt")) setTimeout(function () { if (!panel && !(window.GremlinArcade && GremlinArcade.isOpen())) openGuide(0); }, 900);
  }

  window.GremlinPlayer = {
    onEvent: onEvent, isOpen: function () { return !!panel; },
    openSignin: openSignin, openJournal: openJournal, openGuide: openGuide, openGentle: openGentle, openGuestbook: function (b) { openGuestbook(); },
    sync: doSync, evalBadges: evalBadges, close: closePanel,
    get player() { return player ? { name: player.name } : null; },
    get syncState() { return sync.state; },
    _rpc: rpc, _local: localProgress
  };
})();
