/* Shared calm helpers for The Quiet Room: session, saving (account RPCs with a device fallback),
   Still mode, the soft fade-in controls, the session-length picker, soft cards and gentle WebAudio.
   Talks to Supabase ONLY with the PUBLISHABLE key (public by design) through public.gw_quiet_* RPCs. */
(function () {
  "use strict";
  var CFG = { url: "https://ydotiqwobbenwqeerkoc.supabase.co", key: "sb_publishable_MqY3Lf60gY2OnVOShQMKRg_yRYCO4Nv", timeout: 8000 };
  var Q = window.Quiet = {};
  var qs = new URLSearchParams(location.search);
  // test-only time scale (?qtime=60). Not linked or shown anywhere.
  Q.timeScale = Math.max(1, Math.min(600, +qs.get("qtime") || 1));
  Q.name = window.QUIET_ROOM_NAME || "The Quiet Room";

  /* ---------- session (same key as world-player.js / the arcade) ---------- */
  Q.session = function () {
    try { var p = JSON.parse(localStorage.getItem("gremlin-world-player") || "null"); if (p && p.token && !(p.expires_at && Date.parse(p.expires_at) < Date.now())) return p; } catch (e) {}
    return null;
  };
  Q.rpc = function (fn, body) {
    var ctl = window.AbortController ? new AbortController() : null, t = ctl ? setTimeout(function () { ctl.abort(); }, CFG.timeout) : null;
    return fetch(CFG.url + "/rest/v1/rpc/" + fn, { method: "POST", headers: { "apikey": CFG.key, "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(t); if (r.status === 404) throw { missing: true }; if (!r.ok) throw { http: r.status }; return r.json(); }, function () { clearTimeout(t); throw { offline: true }; });
  };

  /* ---------- saving ---------- */
  var mem = {}, missing = false;
  function lsKey(game) { var s = Q.session(); return "gremlin-quiet-" + game + "-" + (s ? String(s.name).toLowerCase() : "guest"); }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return mem[k] || null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; } }
  Q.saveNote = function (t) { var n = document.getElementById("q-savenote"); if (n) n.textContent = t || ""; };
  // load: account first (if logged in and the RPC exists), else this device
  Q.load = function (game) {
    var s = Q.session(), local = lsGet(lsKey(game));
    if (!s || missing) { Q.saveNote(s ? "Saved on this device for now." : "Saved on this device. Log in to keep it with your Gremlin Name."); return Promise.resolve(local); }
    return Q.rpc("gw_quiet_load", { p_token: s.token, p_game: game }).then(function (r) {
      if (r && r.ok) { Q.saveNote("Saved with " + s.name + "."); return r.data || local; }
      Q.saveNote("Saved on this device for now."); return local;
    }, function (e) { if (e && e.missing) missing = true; Q.saveNote("Saved on this device for now."); return local; });
  };
  Q.save = function (game, data) {
    lsSet(lsKey(game), data);   // always keep a device copy too
    var s = Q.session();
    if (!s || missing) return Promise.resolve(false);
    return Q.rpc("gw_quiet_save", { p_token: s.token, p_game: game, p_data: data }).then(function (r) {
      if (r && r.ok) { Q.saveNote("Saved with " + s.name + "."); return true; }
      Q.saveNote("Saved on this device for now."); return false;
    }, function (e) { if (e && e.missing) missing = true; Q.saveNote("Saved on this device for now."); return false; });
  };
  Q.debounce = function (fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; };

  /* ---------- Still mode (same key as the house + Game Nook) ---------- */
  Q.still = function () { return document.documentElement.classList.contains("gw-still"); };
  Q.setStill = function (on) { document.documentElement.classList.toggle("gw-still", on); try { localStorage.setItem("gw-still-mode", on ? "1" : "0"); } catch (e) {} };
  Q.bindStill = function (btn) {
    if (!btn) return; function show() { var on = Q.still(); btn.setAttribute("aria-pressed", on); btn.textContent = "Still mode: " + (on ? "on" : "off"); }
    btn.addEventListener("click", function () { Q.setStill(!Q.still()); show(); }); show();
  };

  /* ---------- the soft controls: fade in on movement, hide after 4s ---------- */
  Q.softControls = function (bar) {
    var t; function wake() { bar.classList.add("on"); clearTimeout(t); t = setTimeout(function () { var kb = false; try { kb = !!bar.querySelector(":focus-visible"); } catch (e) { kb = bar.contains(document.activeElement); } if (!kb) bar.classList.remove("on"); }, 4000); }
    ["mousemove", "pointerdown", "keydown", "touchstart"].forEach(function (ev) { window.addEventListener(ev, wake, { passive: true }); });
    bar.addEventListener("focusin", wake); wake(); return wake;
  };

  /* ---------- time left, only on request, as a sentence ---------- */
  Q.timeLeftSentence = function (ms) {
    if (ms == null) return "No timer. Stay as long as you like.";
    var m = Math.round(ms / 60000);
    if (m <= 0) return "Just a few moments left.";
    if (m === 1) return "About a minute left.";
    return "About " + m + " minutes left.";
  };

  /* ---------- soft cards (picker, end, confirm) ---------- */
  Q.card = function (opts) {   // {title, text, buttons:[{label, primary, fn}], cls}
    var wrap = document.createElement("div"); wrap.className = "q-cardwrap " + (opts.cls || "");
    var c = document.createElement("div"); c.className = "q-card"; c.setAttribute("role", "dialog"); c.setAttribute("aria-modal", "true");
    var h = document.createElement("h2"); h.textContent = opts.title; h.id = "q-card-h" + Math.random().toString(36).slice(2, 7); c.setAttribute("aria-labelledby", h.id); c.appendChild(h);
    if (opts.text) { var p = document.createElement("p"); p.textContent = opts.text; c.appendChild(p); }
    var row = document.createElement("div"); row.className = "q-card-btns";
    function close() { wrap.classList.add("out"); setTimeout(function () { wrap.remove(); }, 600); document.removeEventListener("keydown", esc, true); }
    function esc(e) { if (e.key === "Escape" && opts.escape !== false) { e.preventDefault(); e.stopPropagation(); close(); if (opts.onEscape) opts.onEscape(); } }
    (opts.buttons || []).forEach(function (b) {
      var x = document.createElement(b.href ? "a" : "button"); x.className = "q-btn" + (b.primary ? " primary" : ""); x.textContent = b.label;
      if (b.href) x.href = b.href; else x.type = "button";
      if (b.id) x.id = b.id;
      x.addEventListener("click", function (e) { if (!b.href) { close(); if (b.fn) b.fn(); } });
      row.appendChild(x);
    });
    c.appendChild(row); wrap.appendChild(c); document.body.appendChild(wrap);
    document.addEventListener("keydown", esc, true);
    requestAnimationFrame(function () { wrap.classList.add("in"); var f = c.querySelector(".q-btn.primary") || c.querySelector(".q-btn"); if (f) f.focus({ preventScroll: true }); });
    return { close: close, el: wrap };
  };
  Q.pickLength = function (opts) {   // opts.lengths [5,10,30], opts.open (bool), opts.last
    return new Promise(function (res) {
      var btns = opts.lengths.map(function (m) { return { label: m + " minutes", primary: m === opts.last, fn: function () { res(m); } }; });
      if (opts.open) btns.push({ label: "No timer", primary: opts.last == null || opts.last === 0, fn: function () { res(0); } });
      Q.card({ title: opts.title, text: opts.text, buttons: btns, cls: "q-pick", escape: false });
    });
  };

  /* ---------- gentle sound (off by default; every change fades over 2s or more) ---------- */
  var ac = null, master = null;
  Q.sound = {
    on: false,
    ctx: function () { if (!ac) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); } return ac; },
    master: function () { return master; },
    set: function (on) {
      var c = this.ctx(); if (!c) return; if (c.state === "suspended") c.resume();
      this.on = on; var t = c.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(on ? 0.5 : 0, t + 2.5);
    },
    noise: function (color) {   // looping soft noise source -> filter, returns {gain, filter}
      var c = this.ctx(); if (!c) return null; var len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      var s = c.createBufferSource(); s.buffer = buf; s.loop = true; var f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = color || 700;
      var g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); return { gain: g, filter: f };
    },
    tone: function (freq, vol, dur) {   // a soft bell-ish tone with a slow swell and fade
      var c = this.ctx(); if (!c || !this.on) return; var o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = "sine"; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.05, t + 2); g.gain.linearRampToValueAtTime(0, t + 2 + (dur || 3));
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 3 + (dur || 3));
    },
    ramp: function (param, v, sec) { var c = this.ctx(); if (!c) return; var t = c.currentTime; param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(v, t + Math.max(2, sec || 2)); }
  };

  /* ---------- art loading: manifest first, then known file names, else null (caller paints a placeholder) ---------- */
  Q.loadArt = function (base, names) {
    var out = {};
    function img(src) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
    return fetch(base + "manifest.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (man) {
      var files = (man && man.files) || {};
      return Promise.all(names.map(function (n) {
        var f = files[n]; if (!f) { out[n] = null; return; }
        return img(base + (f.webp || f.png)).then(function (i) { if (!i && f.png && f.webp) return img(base + f.png); return i; }).then(function (i) { out[n] = i; });
      })).then(function () { out._manifest = man || {}; return out; });
    });
  };
})();
