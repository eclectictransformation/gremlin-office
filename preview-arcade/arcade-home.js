/* Gremlin Arcade (hidden preview). Log in with a Gremlin Name + Gremlin Key, land on a cozy arcade machine
   with every game you've discovered in Gremlin World. Uses the SAME server calls as world-player.js
   (plain fetch to /rest/v1/rpc/gw_* with the publishable key) and the SAME session storage key
   (localStorage "gremlin-world-player" = { name, token, expires_at }). No service keys, no personal info. */
(function () {
  "use strict";
  var CFG = { url: "https://ydotiqwobbenwqeerkoc.supabase.co", key: "sb_publishable_MqY3Lf60gY2OnVOShQMKRg_yRYCO4Nv", timeout: 8000 };
  var PFX = "gremlin-world-", WORLD = "https://eclectictransformation.github.io/gremlin-office/world.html";
  // Starter games: always unlocked, even for brand-new players and guests. One sporty pair + one calm one.
  var STARTERS = ["skee-ball", "hoops", "breathe"];
  // The coupon(s) a player can find. Same code + rule as shifting.js (SOCK_REWARD_CODE) and gw_save_progress.
  var COUPONS = [{ id: "socks", code: "SOCKS5", title: "$5 off the One Hour Workshop", how: "Found every gremlin sock",
    note: "Enter it online when you book the One Hour Workshop.", got: function (p) { return (p.socks || []).length >= 5 || ((p.sock || {}).done || 0) > 0; } }];
  // Room mini-games (games/room-games.js) aren't tracked per game on the server, so they unlock when you've found their room.
  var ROOM_GAMES = [
    { id: "breathe", room: "lantern", item: "lantern-moon-lamp", name: "Breathe", blurb: "Dim the moon lamp and breathe with Grimble." },
    { id: "net", room: "greenhouse", item: "greenhouse-idea-net", name: "Idea Net", blurb: "Catch drifting ideas with Pip's butterfly net." },
    { id: "lineup", room: "press", item: "press-line-it-up", name: "Line It Up", blurb: "Dot's light table. Nudge things until they sit right." },
    { id: "sort", room: "dispatch", item: "dispatch-sort", name: "Sort the Chaos", blurb: "Six inbox trays and Noodle's best guesses." },
    { id: "shelve", room: "returns", item: "returns-shelve", name: "Shelve It", blurb: "Vesper's return slot. Wrong shelves are allowed." },
    { id: "caption", room: "lantern", item: "lantern-caption-1", name: "Caption This", blurb: "Moth's drying comic pages need words." }
  ];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var mem = {};   // fallback when the iframe can't use storage (Safari can block third-party storage)
  function load(k, d) { try { var v = localStorage.getItem(PFX + k); return v ? JSON.parse(v) : d; } catch (e) { return mem[k] !== undefined ? mem[k] : d; } }
  function save(k, v) { try { localStorage.setItem(PFX + k, JSON.stringify(v)); } catch (e) { mem[k] = v; } }
  function del(k) { try { localStorage.removeItem(PFX + k); } catch (e) {} delete mem[k]; }

  function rpc(fn, body, opts) {
    var ctl = window.AbortController ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, CFG.timeout) : null;
    return fetch(CFG.url + "/rest/v1/rpc/" + fn, { method: "POST", headers: { "apikey": CFG.key, "Content-Type": "application/json" },
      body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined, keepalive: !!(opts && opts.keepalive) })
      .then(function (r) { clearTimeout(t); if (!r.ok) throw new Error("http " + r.status); return r.json(); }, function (e) { clearTimeout(t); throw e; });
  }
  // the same jokes world-player.js tells when a login doesn't match
  var JOKES = [
    "Hmm. The gremlins may have filed you under 'snacks.' Try again?",
    "Noodle looked under every cushion. No luck. Check the key and try again.",
    "That key opened the snack drawer instead. One more try?",
    "Grimble sneezed on the paperwork. Try again while he tidies up.",
    "Noodle says the filing cabinet is being shy. Give it another go?"
  ], jokeN = Math.floor(Math.random() * JOKES.length);
  var ERR = { busy: "Lots of gremlins at the door right now. Try again in a minute.", slow_down: "Lots of tries in a row. Noodle is making tea; give it ten minutes." };
  var OFFLINE_MSG = "Noodle can't reach the gremlin filing cabinet right now. Try again in a little while.";

  var W = null, player = load("player", null), prog = {}, scores = {}, games = [], guest = false;
  if (player && (!player.token || (player.expires_at && Date.parse(player.expires_at) < Date.now()))) { player = null; del("player"); }

  function toast(t) { var x = $("#ga-toast"); x.textContent = t; x.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { x.hidden = true; }, 3800); }
  function show(id) { ["#ga-login", "#ga-machine"].forEach(function (s) { $(s).hidden = s !== id; }); }

  /* ---------- the catalogue of every game in the world ---------- */
  function catalogue() {
    var out = [], ms = W.arcade.machines;
    Object.keys(ms).forEach(function (k) { (ms[k].games || []).forEach(function (g) {
      out.push({ id: g.id, kind: "arcade", machine: ms[k], cfg: g, name: g.name, blurb: g.blurb, where: ms[k].title, best: g.best, scoreLabel: g.scoreLabel });
    }); });
    ROOM_GAMES.forEach(function (r) {
      var room = W.rooms[r.room] || {}, it = (room.items || []).filter(function (i) { return i.id === r.item; })[0] || {};
      out.push({ id: r.id, kind: "room", room: r.room, opts: it.opts || {}, label: it.label, name: r.name, blurb: r.blurb, where: room.name || r.room });
    });
    return out;
  }
  // "Discovered": arcade games = you've played it (played count) or have a best score; room games = you've found their room.
  function discovered(g) {
    if (STARTERS.indexOf(g.id) >= 0) return "starter";
    if (g.kind === "arcade") return ((prog.played || {})[g.id] > 0 || (prog.bests || {})[g.id] != null || scores[g.id] != null) ? "found" : null;
    return (prog.visited || []).indexOf(g.room) >= 0 ? "found" : null;
  }
  function bestOf(g) { var a = (prog.bests || {})[g.id], b = scores[g.id]; if (a == null) return b; if (b == null) return a; return g.best === "low" ? Math.min(a, b) : Math.max(a, b); }

  /* ---------- the machine ---------- */
  function renderMachine() {
    show("#ga-machine");
    $("#ga-hello").textContent = player ? "Welcome back, " + player.name + "!" : "Hello, guest gremlin!";
    $("#ga-who").textContent = player ? "Signed in as " + player.name + "." : "Playing as a guest.";
    $("#ga-out").textContent = player ? "Log out" : "Log in";
    var ul = $("#ga-games"); ul.innerHTML = "";
    var open = games.filter(discovered), locked = games.filter(function (g) { return !discovered(g); });
    $("#ga-count").textContent = open.length + " of " + games.length + " games found";
    open.concat(locked).forEach(function (g) {
      var d = discovered(g), li = el("li"), b = el("button", "ga-game" + (d ? "" : " locked")); b.type = "button";
      b.appendChild(el("span", "gg-name", d ? g.name : "Not found yet"));
      if (d) {
        b.appendChild(el("span", "gg-blurb", g.blurb));
        var bst = g.kind === "arcade" ? bestOf(g) : null;
        b.appendChild(el("span", "gg-tag", d === "starter" ? "starter game" : bst != null ? "best " + bst : "found in " + g.where));
        b.addEventListener("click", function () { play(g, b); });
        b.setAttribute("aria-label", "Play " + g.name);
      } else { b.disabled = true; b.setAttribute("aria-label", "A game you haven't found yet"); b.appendChild(el("span", "gg-lock", "?")); }
      li.appendChild(b); ul.appendChild(li);
    });
  }

  /* ---------- playing (the real game modules) ---------- */
  function seedBests() {   // arcade.js reads bests from this device; seed them from the server copy
    games.forEach(function (g) { if (g.kind !== "arcade") return; var b = bestOf(g); if (b == null) return;
      try { var cur = localStorage.getItem(PFX + "arcade-best-" + g.id); if (cur == null || (g.best === "low" ? b < +cur : b > +cur)) localStorage.setItem(PFX + "arcade-best-" + g.id, String(b)); } catch (e) {} });
  }
  function localBest(id) { try { var v = localStorage.getItem(PFX + "arcade-best-" + id); return v == null || isNaN(+v) ? null : +v; } catch (e) { return null; } }
  var saveT = null;
  function saveSoon() {   // the server merges (union / max), so sending our copy never loses anything
    if (!player) return; clearTimeout(saveT);
    saveT = setTimeout(function () {
      var body = JSON.parse(JSON.stringify(prog)); body.v = 1; body.bests = body.bests || {};
      games.forEach(function (g) { if (g.kind === "arcade") { var b = localBest(g.id); if (b != null) body.bests[g.id] = b; } });
      rpc("gw_save_progress", { p_token: player.token, p_progress: body }).then(function (r) {
        if (r && r.ok && r.progress) { prog = r.progress; } else if (r && r.error === "session") sessionLost();
      }).catch(function () {});
    }, 1200);
  }
  function play(g, btn) {
    if (g.kind === "arcade") {
      var m = Object.assign({}, g.machine, { games: g.machine.games.filter(function (x) { return discovered(games.filter(function (y) { return y.id === x.id; })[0]); }) });
      var ms = {}; ms[m.id] = m;
      GremlinArcade.open(m, { game: g.id, machines: ms, calm: false, onClose: function () { renderMachine(); try { btn.focus({ preventScroll: true }); } catch (e) {} } });
    } else {
      loadRoomGames().then(function () {
        window.GremlinRoomGames.open(g.id, Object.assign({ title: g.label || g.name }, g.opts), { say: function () {}, onClose: function () { try { btn.focus({ preventScroll: true }); } catch (e) {} } });
      }).catch(function () { toast("That game is still being glued together. Try again in a moment."); });
    }
  }
  var rgP = null;
  function loadRoomGames() { return rgP || (rgP = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "games/room-games.js"; s.onload = res; s.onerror = function () { rgP = null; rej(); }; document.head.appendChild(s); })); }
  function hooks() {
    GremlinArcade.setHooks({
      player: function () { return player && player.name; },
      played: function (g) { prog.played = prog.played || {}; prog.played[g.id] = (prog.played[g.id] || 0) + 1; saveSoon(); },
      ended: function () { saveSoon(); },   // same as world-player.js: bests travel in the progress JSON
      leaderboard: function (id) { return rpc("gw_leaderboard", { p_game_id: id, p_limit: 10 }).then(function (r) { if (!Array.isArray(r)) throw new Error("bad"); return r; }); },
      ranked: function (g, score) { return player ? rpc("gw_submit_score", { p_token: player.token, p_game_id: g.id, p_score: Math.round(score), p_meta: { v: 1 } }) : Promise.resolve(null); },
      signIn: null
    });
  }

  /* ---------- stats + coupons drawers ---------- */
  function drawer(title, meta, fill) {
    var d = $("#ga-drawer"), b = $("#ga-drawer-body"); b.innerHTML = "";
    b.appendChild(el("p", "ga-meta", meta)); var h = el("h2", "", title); h.id = "ga-drawer-h"; b.appendChild(h);
    fill(b); d.hidden = false; drawer.back = document.activeElement; setTimeout(function () { $(".ga-x", d).focus(); }, 30);
  }
  function closeDrawer() { $("#ga-drawer").hidden = true; if (drawer.back) try { drawer.back.focus(); } catch (e) {} }
  function statRow(box, icon, label, val) { var r = el("div", "ga-stat"); r.appendChild(el("span", "gs-i", icon)); r.appendChild(el("span", "gs-l", label)); r.appendChild(el("span", "gs-v", val)); box.appendChild(r); }
  function openStats() {
    drawer("My stats", player ? player.name + "'s quest journal" : "guest", function (b) {
      if (!player) { b.appendChild(el("p", "ga-sub", "Log in with your Gremlin Name to see your saved quest journal here.")); return; }
      var rooms = Object.keys(W.rooms), eggs = 0; rooms.forEach(function (r) { (W.rooms[r].items || []).forEach(function (i) { if (i.type === "egg") eggs++; }); });
      var bd = W.badges.list, got = prog.badges || {}, box = el("div", "ga-stats");
      statRow(box, "\uD83D\uDDFA\uFE0F", "Rooms found", (prog.visited || []).length + " of " + rooms.length);
      statRow(box, "\u2728", "Secrets found", (prog.found || []).length + " of " + eggs);
      statRow(box, "\uD83E\uDDE6", "Socks found", (prog.socks || []).length + " of " + W.socksTotal + (((prog.sock || {}).done || 0) > 0 ? " (hunt done!)" : ""));
      statRow(box, "\uD83C\uDFC5", "Badges", Object.keys(got).length + " of " + bd.length);
      statRow(box, "\uD83D\uDD79\uFE0F", "Games found", games.filter(discovered).length + " of " + games.length);
      b.appendChild(box);
      var bh = el("h3", "", "Badges"); b.appendChild(bh); var bl = el("ul", "ga-badges");
      bd.forEach(function (x) { var li = el("li", got[x.id] ? "on" : "off"); li.appendChild(el("span", "", got[x.id] ? x.icon : "\u25CC")); li.appendChild(el("b", "", got[x.id] ? x.name : "Not yet")); if (got[x.id]) li.appendChild(el("small", "", x.desc)); bl.appendChild(li); });
      b.appendChild(bl);
      var sh = el("h3", "", "Best scores"); b.appendChild(sh); var sl = el("ul", "ga-scores"), any = false;
      games.forEach(function (g) { if (g.kind !== "arcade") return; var v = bestOf(g); if (v == null) return; any = true; sl.appendChild(el("li", "", g.name + ": " + v + " " + (g.scoreLabel || "").toLowerCase())); });
      if (!any) sl.appendChild(el("li", "", "No scores yet. Any game counts."));
      b.appendChild(sl);
    });
  }
  function openCoupons() {
    drawer("My coupons", "found in gremlin world", function (b) {
      var have = player ? COUPONS.filter(function (c) { return c.got(prog); }) : [];
      if (!have.length) { b.appendChild(el("p", "ga-sub", player ? "No coupons found yet. The gremlins hide treats in Gremlin World for curious explorers." : "Log in to see coupons you've found.")); }
      have.forEach(function (c) {
        var card = el("div", "ga-coupon"); card.appendChild(el("p", "gc-t", c.title)); var code = el("code", "", c.code); card.appendChild(code);
        card.appendChild(el("p", "gc-n", c.how + ". " + c.note));
        var cp = el("button", "ga-btn ghost small", "Copy code"); cp.type = "button";
        cp.addEventListener("click", function () { (navigator.clipboard ? navigator.clipboard.writeText(c.code) : Promise.reject()).then(function () { cp.textContent = "Copied!"; }, function () { var r = document.createRange(); r.selectNodeContents(code); var s = getSelection(); s.removeAllRanges(); s.addRange(r); cp.textContent = "Selected"; }); });
        card.appendChild(cp); b.appendChild(card);
      });
      var n = COUPONS.length - have.length; if (player && n > 0 && have.length) b.appendChild(el("p", "ga-fine", "There may be more out there."));
    });
  }

  /* ---------- login, same path as world-player.js ---------- */
  function sessionLost() { player = null; del("player"); prog = {}; scores = {}; toast("Your Gremlin Name nodded off. Log in again with your key."); show("#ga-login"); }
  function loadMine() {
    return rpc("gw_load_progress", { p_token: player.token }).then(function (r) {
      if (!r || !r.ok) { if (r && r.error === "session") sessionLost(); return false; }
      prog = r.progress || {}; scores = r.scores || {};
      if (r.name && r.name !== player.name) { player.name = r.name; save("player", player); }
      seedBests(); renderMachine(); return true;
    }, function () { toast(OFFLINE_MSG); show("#ga-login"); return false; });
  }
  function bindLogin() {
    $("#ga-form").addEventListener("submit", function (e) {
      e.preventDefault(); var n = $("#ga-name"), k = $("#ga-key"), er = $("#ga-err"), go = $("#ga-go");
      if (!n.value.trim() || !k.value.trim()) { er.textContent = "Both boxes, please: your Gremlin Name and your key."; return; }
      go.disabled = true; er.textContent = ""; go.textContent = "Checking the filing cabinet\u2026";
      rpc("gw_login", { p_name: n.value, p_key: k.value }).then(function (r) {
        go.disabled = false; go.textContent = "Let me in";
        if (!r || !r.ok) { er.textContent = (r && ERR[r.error]) || JOKES[(jokeN++) % JOKES.length]; return; }
        player = { name: r.name, token: r.token, expires_at: r.expires_at }; save("player", player); save("player-choice", "named");
        k.value = ""; guest = false; loadMine();
      }, function () { go.disabled = false; go.textContent = "Let me in"; er.textContent = OFFLINE_MSG; });
    });
    $("#ga-guest").addEventListener("click", function () { guest = true; prog = {}; scores = {}; renderMachine(); });
    $("#ga-out").addEventListener("click", function () {
      if (player) { rpc("gw_logout", { p_token: player.token }).catch(function () {}); player = null; del("player"); prog = {}; scores = {}; toast("Logged out. Your progress is safe under your Gremlin Name."); }
      show("#ga-login"); setTimeout(function () { $("#ga-name").focus(); }, 30);
    });
    document.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () { b.dataset.open === "stats" ? openStats() : openCoupons(); }); });
    $("#ga-drawer .ga-x").addEventListener("click", closeDrawer);
    $("#ga-drawer").addEventListener("click", function (e) { if (e.target.id === "ga-drawer") closeDrawer(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#ga-drawer").hidden) closeDrawer(); });
  }

  function boot() {
    bindLogin();
    fetch("world-data.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (d) {
      W = d; games = catalogue(); hooks();
      if (player) { renderMachine(); loadMine(); } else show("#ga-login");
    }).catch(function () { show("#ga-login"); $("#ga-err").textContent = OFFLINE_MSG; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.__GA = { get prog() { return prog; }, get games() { return games; }, discovered: function (id) { return discovered(games.filter(function (g) { return g.id === id; })[0]); } };   // for tests
})();
