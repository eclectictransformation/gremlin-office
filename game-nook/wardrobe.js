/* The Gremlin Wardrobe: a small avatar dresser for the Game Nook.
   Items and colours come from wardrobe-data.js. Earned things are only ever unlocked by the server
   (gw_wardrobe / gw_chess_gremlin_win); this page never grants anything itself. Guests can wear the free things on this device. */
(function () {
  "use strict";
  var LOCAL = "gremlin-world-wardrobe";
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn, label) { var b = el("button", cls, text); b.type = "button"; if (label) b.setAttribute("aria-label", label); if (fn) b.addEventListener("click", fn); return b; }
  function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL) || "{}") || {}; } catch (e) { return {}; } }
  function saveLocal(o) { try { localStorage.setItem(LOCAL, JSON.stringify(o)); } catch (e) {} }

  function find(id) { var D = window.GremlinWardrobe; for (var i = 0; i < D.slots.length; i++) for (var j = 0; j < D.slots[i].items.length; j++) if (D.slots[i].items[j].id === id) return D.slots[i].items[j]; return null; }
  function defaults() { var o = {}; window.GremlinWardrobe.slots.forEach(function (s) { o[s.id] = s.items[0].id; }); return o; }

  /* a simple cosy gremlin, dressed from the outfit */
  function avatar(o) {
    var c = function (slot, d) { var it = find(o[slot]); return it && it.color || d; };
    var hat = o.hat, scarf = o.scarf, socks = o.socks, sc = find(o["sock-color"]) || {};
    var s = '<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Your gremlin in its outfit"><defs>' +
      '<pattern id="wd-stripe" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="' + (sc.color || "#ccc") + '"/><rect y="5" width="10" height="5" fill="' + (sc.stripes || "#fff") + '"/></pattern>' +
      '<linearGradient id="wd-rain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e46f5a"/><stop offset=".33" stop-color="#f3d98b"/><stop offset=".66" stop-color="#6fae4f"/><stop offset="1" stop-color="#6b7fc4"/></linearGradient></defs>';
    var sockFill = sc.stripes ? "url(#wd-stripe)" : sc.rainbow ? "url(#wd-rain)" : (sc.color || "#F1EDE2");
    // legs + socks
    s += '<rect x="68" y="168" width="22" height="36" rx="10" fill="#A6B89A" stroke="#1A1A18" stroke-width="4"/><rect x="110" y="168" width="22" height="36" rx="10" fill="#A6B89A" stroke="#1A1A18" stroke-width="4"/>';
    if (socks && socks !== "socks-none") { var h = socks === "socks-tall" ? 30 : 16; s += '<rect x="66" y="' + (206 - h) + '" width="26" height="' + h + '" rx="8" fill="' + sockFill + '" stroke="#1A1A18" stroke-width="4"/><rect x="108" y="' + (206 - h) + '" width="26" height="' + h + '" rx="8" fill="' + sockFill + '" stroke="#1A1A18" stroke-width="4"/>'; }
    // body + ears + face
    s += '<path d="M52 70 l-14 -34 l30 18 M148 70 l14 -34 l-30 18" fill="#A6B89A" stroke="#1A1A18" stroke-width="4" stroke-linejoin="round"/>' +
      '<ellipse cx="100" cy="118" rx="58" ry="62" fill="#A6B89A" stroke="#1A1A18" stroke-width="4"/>' +
      '<circle cx="80" cy="104" r="7" fill="#1A1A18"/><circle cx="120" cy="104" r="7" fill="#1A1A18"/><path d="M86 128 q14 10 28 0" fill="none" stroke="#1A1A18" stroke-width="4" stroke-linecap="round"/>';
    if (o.glasses === "glasses-round") s += '<g fill="none" stroke="#1A1A18" stroke-width="3"><circle cx="80" cy="104" r="13"/><circle cx="120" cy="104" r="13"/><path d="M93 104h14"/></g>';
    if (scarf && scarf !== "scarf-none") { var f = c("scarf-color", "#F1EDE2"); s += '<path d="M50 146 q50 22 100 0 l0 14 q-50 22 -100 0z" fill="' + f + '" stroke="#1A1A18" stroke-width="4" stroke-linejoin="round"/>' + '<rect x="118" y="152" width="18" height="' + (scarf === "scarf-long" ? 56 : 30) + '" rx="5" fill="' + f + '" stroke="#1A1A18" stroke-width="4"/>'; }
    var hc = c("hat-color", "#54664A");
    if (hat === "hat-beanie") s += '<path d="M56 70 q44 -56 88 0z" fill="' + hc + '" stroke="#1A1A18" stroke-width="4" stroke-linejoin="round"/><rect x="52" y="64" width="96" height="14" rx="7" fill="' + hc + '" stroke="#1A1A18" stroke-width="4"/><circle cx="100" cy="26" r="9" fill="' + hc + '" stroke="#1A1A18" stroke-width="4"/>';
    if (hat === "hat-acorn") s += '<path d="M60 68 q40 -44 80 0z" fill="' + hc + '" stroke="#1A1A18" stroke-width="4"/><path d="M100 30 v-12" stroke="#1A1A18" stroke-width="5" stroke-linecap="round"/>';
    if (hat === "hat-crown") s += '<path d="M66 66 l6 -30 l16 16 l12 -22 l12 22 l16 -16 l6 30z" fill="' + hc + '" stroke="#1A1A18" stroke-width="4" stroke-linejoin="round"/>';
    return s + "</svg>";
  }

  function mount(host, opts) {
    opts = opts || {};
    var D = window.GremlinWardrobe, S = window.GremlinSocial, outfit = Object.assign(defaults(), loadLocal()), unlocks = [], server = false, note;
    function owned(it) { return it.free || unlocks.indexOf(it.id) >= 0; }
    function render() {
      host.innerHTML = "";
      var wrap = el("div", "wd");
      wrap.appendChild(el("h2", "gc-title", "The wardrobe"));
      wrap.appendChild(el("p", "gc-sub", server ? "Dress your gremlin. Some things are found by playing around Gremlin World." : S && S.loggedIn() ? "Dress your gremlin. (The wardrobe's server corner opens soon, so unlocks will show up then. Free things save on this device.)" : "Dress your gremlin. Log in with your Gremlin Key to keep unlocks you earn; for now, free things save on this device."));
      var row = el("div", "wd-row"), av = el("div", "wd-avatar"); av.innerHTML = avatar(outfit); row.appendChild(av);
      var col = el("div", "wd-slots");
      D.slots.forEach(function (s) {
        var g = el("fieldset", "wd-slot"); g.appendChild(el("legend", "", s.label));
        var dim = s.colorOf && (outfit[s.colorOf] || "").slice(-5) === "-none";
        if (dim) g.appendChild(el("p", "wd-dim", "Pick a " + s.colorOf.replace("socks", "pair of socks") + " first."));
        var list = el("div", "wd-items"); list.setAttribute("role", "radiogroup"); list.setAttribute("aria-label", s.label);
        s.items.forEach(function (it) {
          var have = owned(it), on = outfit[s.id] === it.id;
          var b = el("button", "wd-item" + (it.color ? " swatch" : "") + (have ? "" : " locked") + (on ? " on" : "")); b.type = "button";
          b.setAttribute("role", "radio"); b.setAttribute("aria-checked", on ? "true" : "false");
          if (it.color) { var sw = el("span", "wd-sw"); sw.style.background = it.rainbow ? "linear-gradient(#e46f5a,#f3d98b,#6fae4f,#6b7fc4)" : it.stripes ? "repeating-linear-gradient(0deg," + it.color + " 0 6px," + it.stripes + " 6px 12px)" : it.color; b.appendChild(sw); }
          b.appendChild(el("span", "wd-l", have ? it.label : "???"));
          if (!have) { b.appendChild(el("span", "wd-hint", D.hint)); b.setAttribute("aria-disabled", "true"); b.setAttribute("aria-label", "Locked. " + D.hint + "."); }
          else { if (it.unlock) b.title = D.unlockNames[it.unlock] || ""; b.setAttribute("aria-label", it.label + (it.unlock ? ", unlocked: " + (D.unlockNames[it.unlock] || "") : "")); }
          b.addEventListener("click", function () {
            if (!have) { tell("That one is " + D.hint + "."); return; }
            outfit[s.id] = it.id; persist(); render(); var f = host.querySelector('.wd-slot [aria-checked="true"][aria-label^="' + it.label.replace(/"/g, "") + '"]'); if (f) f.focus();
          });
          list.appendChild(b);
        });
        g.appendChild(list); col.appendChild(g);
      });
      row.appendChild(col); wrap.appendChild(row);
      note = el("p", "gs-note"); note.setAttribute("aria-live", "polite"); wrap.appendChild(note);
      if (opts.onClose) wrap.appendChild(btn("gc-btn ghost", "Back to the Nook", opts.onClose));
      host.appendChild(wrap);
    }
    function tell(t) { if (note) note.textContent = t; }
    var saveT = null;
    function persist() {
      var clean = {}; Object.keys(outfit).forEach(function (k) { var it = find(outfit[k]); if (it && owned(it)) clean[k] = outfit[k]; });
      saveLocal(clean);
      if (server) { clearTimeout(saveT); saveT = setTimeout(function () { S.saveWardrobe(clean).then(function (r) { if (r && r.ok) tell("Saved."); }, function () { tell("Saved on this device. The wardrobe will catch up later."); }); }, 600); }
    }
    render();
    if (S && S.loggedIn()) S.wardrobe().then(function (r) {
      if (!r || !r.ok) return;
      server = true; unlocks = r.unlocks || [];
      Object.keys(r.outfit || {}).forEach(function (k) { outfit[k] = r.outfit[k]; });
      render();
    }, function () {});
    return { get outfit() { return outfit; } };
  }
  window.GremlinWardrobeUI = { mount: mount, avatar: avatar };
})();
