/* Gremlin Chess with people (Phase 2) + the wardrobe server calls.
   Talks to Supabase ONLY through the public gw_chess_* / gw_wardrobe* RPCs with the PUBLISHABLE key (public by design).
   No secret keys, no personal data, no free text: names are Gremlin Names, and every message is a preset phrase id.
   If the server functions aren't installed yet, the panel just says "Playing friends opens soon." */
(function () {
  "use strict";
  var CFG = { url: "https://ydotiqwobbenwqeerkoc.supabase.co", key: "sb_publishable_MqY3Lf60gY2OnVOShQMKRg_yRYCO4Nv", timeout: 8000 };
  var PHRASES = [{ id: 1, text: "Want to play chess?" }, { id: 2, text: "Fancy a slow game?" }, { id: 3, text: "Rematch?" }];
  var SAY = { later: "They might be busy. Maybe try again a bit later.", slow_down: "Let's take a little break from asking for now.", play_first: "You can ask to be friends after you've played a game together.",
    not_found: "Hmm, that gremlin seems to have wandered off.", resting: "Playing with people is resting for your name right now.", gone: "That one has already floated away.", session: "Your Gremlin Key needs a fresh login. Pop over to My Account to log in again." };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn, label) { var b = el("button", cls, text); b.type = "button"; if (label) b.setAttribute("aria-label", label); if (fn) b.addEventListener("click", fn); return b; }
  function session() {
    try { var p = JSON.parse(localStorage.getItem("gremlin-world-player") || "null"); if (p && p.token && !(p.expires_at && Date.parse(p.expires_at) < Date.now())) return p; } catch (e) {}
    return null;
  }
  var missing = false;
  function rpc(fn, body) {
    var s = session(); if (!s) return Promise.reject({ session: true });
    if (missing) return Promise.reject({ missing: true });
    body = body || {}; body.p_token = s.token;
    var ctl = window.AbortController ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, CFG.timeout) : null;
    return fetch(CFG.url + "/rest/v1/rpc/" + fn, { method: "POST", headers: { "apikey": CFG.key, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (r.status === 404) { missing = true; throw { missing: true }; } if (!r.ok) throw { http: r.status }; return r.json(); }, function (e) { clearTimeout(t); throw { offline: true }; });
  }

  var api = {
    loggedIn: function () { return !!session(); },
    me: function () { var s = session(); return s ? s.name : null; },
    poll: function (here) { return rpc("gw_chess_poll", { p_here: here !== false }); },
    poke: function (name, phrase) { return rpc("gw_chess_poke", { p_to: name, p_phrase: phrase }); },
    answer: function (id, a) { return rpc("gw_chess_answer", { p_poke: id, p_answer: a }); },
    dnd: function (on) { return rpc("gw_chess_dnd", { p_on: !!on }); },
    block: function (name) { return rpc("gw_chess_block", { p_name: name }); },
    unblock: function (name) { return rpc("gw_chess_unblock", { p_name: name }); },
    report: function (name, why) { return rpc("gw_chess_report", { p_name: name, p_reason: why }); },
    friend: function (name, action) { return rpc("gw_chess_friend", { p_name: name, p_action: action }); },
    game: function (id) { return rpc("gw_chess_game", { p_game: id }); },
    move: function (id, ply, uci, end) { return rpc("gw_chess_move", { p_game: id, p_ply: ply, p_uci: uci, p_end: end || null }); },
    resign: function (id) { return rpc("gw_chess_resign", { p_game: id }).catch(function () {}); },
    rematch: function (id) { return rpc("gw_chess_rematch", { p_game: id }); },
    recordWin: function (who, plies) { if (!session()) return Promise.resolve(null); return rpc("gw_chess_gremlin_win", { p_gremlin: who, p_moves: Math.ceil(plies / 2) }).catch(function () { return null; }); },
    wardrobe: function () { return rpc("gw_wardrobe", {}); },
    saveWardrobe: function (outfit) { return rpc("gw_wardrobe_save", { p_outfit: outfit }); },
    isMissing: function () { return missing; }
  };

  /* ---------- the "Play a friend" panel on the chess table ---------- */
  api.render = function (box, hooks) {
    var timer = null, note = null;
    box.innerHTML = "";
    box.appendChild(el("h3", "gc-h3", "Play a friend"));
    if (!session()) { box.appendChild(el("p", "gc-fine", "Log in with your Gremlin Key (in My Account or Gremlin World) to play other gremlins. Everyone plays under their Gremlin Name, and you only chat with friendly preset phrases.")); return; }
    var body = el("div", "gs-body"); box.appendChild(body);
    note = el("p", "gs-note"); note.setAttribute("aria-live", "polite"); box.appendChild(note);
    function tell(t) { note.textContent = t || ""; }
    function err(e) { if (e && e.missing) return soon(); tell(e && e.offline ? "The friends board is a bit far away right now. Try again in a moment." : "Something went wobbly. Try again in a moment."); }
    function soon() { clearTimeout(timer); body.innerHTML = ""; body.appendChild(el("p", "gc-fine", "Playing friends opens soon. For now, the gremlins are very happy to play you.")); tell(""); }
    function ok(r) { if (r && !r.ok && r.error) { tell(SAY[r.error] || "Hmm, not right now."); return false; } return true; }
    function refresh(here) {
      clearTimeout(timer);
      if (!document.contains(box)) return;
      api.poll(here).then(function (d) { if (!ok(d)) return; draw(d); timer = setTimeout(function () { refresh(true); }, document.hidden ? 60000 : 15000); }, err);
    }
    function section(title) { var s = el("div", "gs-sec"); s.appendChild(el("h4", "gs-h", title)); body.appendChild(s); return s; }
    function person(name, extra) { var li = el("li", "gs-p"); li.appendChild(el("span", "gs-name", name)); var acts = el("span", "gs-acts"); li.appendChild(acts); (extra || []).forEach(function (b) { acts.appendChild(b); }); return li; }
    function pokeMenu(name, anchor) {
      var old = body.querySelector(".gs-menu"); if (old) old.remove();
      var m = el("div", "gs-menu"); m.setAttribute("role", "group"); m.setAttribute("aria-label", "Pick what to say to " + name);
      m.appendChild(el("p", "", "Say to " + name + ":"));
      PHRASES.forEach(function (p) { m.appendChild(btn("gc-btn ghost small", p.text, function () { m.remove(); api.poke(name, p.id).then(function (r) { if (ok(r)) tell("Sent. If " + name + " says yes, your game will appear under Your games."); }, err); })); });
      m.appendChild(btn("gc-btn ghost small", "Never mind", function () { m.remove(); anchor.focus(); }));
      anchor.closest("li").appendChild(m); m.querySelector("button").focus();
    }
    function confirmBox(anchor, text, yesText, fn) {
      var m = el("div", "gs-menu"); m.appendChild(el("p", "", text));
      m.appendChild(btn("gc-btn small", yesText, function () { m.remove(); fn(); }));
      m.appendChild(btn("gc-btn ghost small", "Never mind", function () { m.remove(); anchor.focus(); }));
      anchor.closest("li").appendChild(m); m.querySelector("button").focus();
    }
    function draw(d) {
      d = d || {}; ["pokes", "friend_asks", "games", "friends", "around", "blocked"].forEach(function (k) { if (!Array.isArray(d[k])) d[k] = []; });
      var keep = document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute("data-k") : null;
      body.innerHTML = "";
      var dnd = el("label", "gc-toggle"); var cb = el("input"); cb.type = "checkbox"; cb.checked = !!d.dnd; cb.setAttribute("data-k", "dnd");
      cb.addEventListener("change", function () { api.dnd(cb.checked).then(function () { refresh(true); }, err); });
      dnd.appendChild(cb); dnd.appendChild(el("span", "", "Not right now (hide me and hold my invitations)")); body.appendChild(dnd);
      if (d.social === false) body.appendChild(el("p", "gc-fine", "Playing with people is resting for your name right now. The gremlins are still here."));
      if (d.pokes.length) {
        var s = section("Invitations"), ul = el("ul", "gs-list"); s.appendChild(ul);
        d.pokes.forEach(function (k) {
          var li = person(k.from + ": \u201C" + k.phrase + "\u201D", [
            btn("gc-btn small", "Yes, let's play", function () { api.answer(k.id, "accept").then(function (r) { if (ok(r) && r.game_id) hooks.startPerson(r.game_id); }, err); }),
            btn("gc-btn ghost small", "Not right now", function () { api.answer(k.id, "decline").then(function () { refresh(true); }, err); }),
            btn("gc-btn ghost small", "Block", function (e) { confirmBox(e.currentTarget, "Block " + k.from + "? They won't see you or be able to ask you again. They aren't told.", "Block", function () { api.answer(k.id, "block").then(function () { tell(k.from + " is blocked."); refresh(true); }, err); }); }, "Block " + k.from)]);
          ul.appendChild(li);
        });
      }
      if (d.friend_asks.length) {
        var s2 = section("Friend requests"), ul2 = el("ul", "gs-list"); s2.appendChild(ul2);
        d.friend_asks.forEach(function (n) { ul2.appendChild(person(n + " would like to be friends", [btn("gc-btn small", "Yes", function () { api.friend(n, "yes").then(function () { refresh(true); }, err); }, "Yes, be friends with " + n), btn("gc-btn ghost small", "No thanks", function () { api.friend(n, "no").then(function () { refresh(true); }, err); }, "No thanks to " + n)])); });
      }
      var friendNames = {}; d.friends.forEach(function (f) { friendNames[f.name] = 1; });
      var sg = section("Your games");
      if (!d.games.length) sg.appendChild(el("p", "gc-fine", "No games with people yet."));
      else { var ug = el("ul", "gs-list"); sg.appendChild(ug); d.games.forEach(function (g) {
        var live = g.status === "active" || g.status === "set_aside";
        var label = live ? (g.your_turn ? "Your move with " + g.opp : "Waiting for " + g.opp) : "Finished with " + g.opp;
        var acts = [btn("gc-btn small" + (live && g.your_turn ? "" : " ghost"), live ? "Open" : "Look", function () { hooks.startPerson(g.id); }, (live ? "Open your game with " : "Look at your game with ") + g.opp)];
        if (!friendNames[g.opp] && g.opp.indexOf(" who moved away") < 0) acts.push(btn("gc-btn ghost small", "Ask to be friends", function () { api.friend(g.opp, "ask").then(function (r) { if (ok(r)) tell(r.friends ? "You and " + g.opp + " are friends now." : "Asked. If " + g.opp + " says yes too, you'll be friends."); refresh(true); }, err); }, "Ask " + g.opp + " to be friends"));
        ug.appendChild(person(label, acts)); }); }
      var sf = section("Friends");
      if (!d.friends.length) sf.appendChild(el("p", "gc-fine", "After you play someone, you can both choose to be friends."));
      else { var uf = el("ul", "gs-list"); sf.appendChild(uf); d.friends.forEach(function (f) {
        var a = btn("gc-btn small ghost", "Ask to play", function (e) { pokeMenu(f.name, e.currentTarget); }, "Ask " + f.name + " to play"); a.setAttribute("data-k", "f-" + f.name);
        uf.appendChild(person(f.name + (f.around ? " (around now)" : ""), [a, btn("gc-btn ghost small", "Remove", function (e) { confirmBox(e.currentTarget, "Stop being friends with " + f.name + "? They aren't told.", "Remove", function () { api.friend(f.name, "remove").then(function () { refresh(true); }, err); }); }, "Remove " + f.name + " as a friend")])); }); }
      var sa = section("Around the Nook now");
      var others = d.around.filter(function (p) { return !friendNames[p.name]; });
      if (!others.length) sa.appendChild(el("p", "gc-fine", "Nobody else is around just now. The gremlins are always up for a game."));
      else { var ua = el("ul", "gs-list"); sa.appendChild(ua); others.forEach(function (p) {
        var a = btn("gc-btn small ghost", "Ask to play", function (e) { pokeMenu(p.name, e.currentTarget); }, "Ask " + p.name + " to play"); a.setAttribute("data-k", "a-" + p.name);
        ua.appendChild(person(p.name, [a,
          btn("gc-btn ghost small", "Block", function (e) { confirmBox(e.currentTarget, "Block " + p.name + "? They won't see you or be able to ask you again. They aren't told.", "Block", function () { api.block(p.name).then(function () { tell(p.name + " is blocked."); refresh(true); }, err); }); }, "Block " + p.name),
          btn("gc-btn ghost small", "Report name", function (e) { confirmBox(e.currentTarget, "Tell Bryan this name isn't kind? It will be hidden while he looks, and blocked for you.", "Report", function () { api.report(p.name, "name").then(function (r) { if (ok(r)) tell("Thank you. Bryan will take a look."); refresh(true); }, err); }); }, "Report the name " + p.name)])); }); }
      if (d.blocked.length) {
        var sb = section("Blocked"), ub = el("ul", "gs-list"); sb.appendChild(ub);
        d.blocked.forEach(function (n) { ub.appendChild(person(n, [btn("gc-btn ghost small", "Unblock", function () { api.unblock(n).then(function () { refresh(true); }, err); }, "Unblock " + n)])); });
      }
      if (keep) { var k2 = body.querySelector('[data-k="' + keep.replace(/"/g, "") + '"]'); if (k2) k2.focus({ preventScroll: true }); }
    }
    body.appendChild(el("p", "gc-fine", "Looking around the Nook\u2026"));
    refresh(true);
  };
  window.GremlinSocial = api;
})();
