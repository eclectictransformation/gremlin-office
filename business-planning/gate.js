/* Business Planning gate (Bryan t757u; username version t759u): a friendly "type the username" box in front of
   Business Planning (both tabs) and Moth's Design Studio, so random visitors and bots can't just submit.
   Signed-in members skip it. The page stays hidden AND inert until it's unlocked, and the free-plan
   send/reply calls refuse to run while it's locked.
   Load it in <head> on each gated page:  <script src="gate.js" data-root="../"></script>  */
(function () {
  "use strict";

  /* ===================== THE USERNAME (change it here) =====================
     The one shared word people type to get in. Checked as plain text: spaces around it are ignored and
     capitals don't matter ("Guest" works too). This is a light spam door, not a real login.
     Changing it also asks everyone to type the new one (old unlocks stop counting). */
  var GATE_USERNAME = "guest";
  /* How long this browser stays unlocked after the right username (days). */
  var REMEMBER_DAYS = 30;
  /* ======================================================================== */

  function norm(v) { return String(v == null ? "" : v).trim().toLowerCase(); }
  var KEY = "desksBp.gate.v2", MARK = "u:" + norm(GATE_USERNAME);   // v2: the old password-version unlocks no longer count
  var me = document.currentScript, ROOT = (me && me.getAttribute("data-root")) || "../";
  var doc = document, html = doc.documentElement;
  function remembered() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); return !!v && v.p === MARK && v.until > Date.now(); } catch (e) { return false; }
  }
  var state = { unlocked: remembered(), member: false };
  var api = window.DesksBpGate = {
    isOpen: function () { return state.unlocked || state.member; },
    state: function () { return { unlocked: state.unlocked, member: state.member, open: api.isOpen() }; }
  };
  var resolveOpen; api.opened = new Promise(function (r) { resolveOpen = r; });
  if (api.isOpen()) { resolveOpen("remembered"); guardCalls(); return; }

  html.classList.add("bpg-locked");
  var css = doc.createElement("style");
  css.textContent =
    "html.bpg-locked body>:not(.bpg){visibility:hidden!important}" +
    ".bpg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;overflow:auto;" +
    "padding:max(1rem,env(safe-area-inset-top)) max(1rem,env(safe-area-inset-right)) max(1rem,env(safe-area-inset-bottom)) max(1rem,env(safe-area-inset-left));" +
    "background:#E8E4D8 repeating-linear-gradient(90deg,transparent 0 46px,rgba(84,102,74,.05) 46px 48px);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1A1A18;line-height:1.5}" +
    ".bpg-card{width:100%;max-width:27rem;margin:auto;background:#F1EDE2;border:2px solid #1A1A18;border-radius:16px;box-shadow:4px 4px 0 #54664A;padding:1.5rem 1.3rem 1.2rem}" +
    ".bpg-bar{display:block;width:3.25rem;height:5px;margin:0 0 .9rem;background:#B8775A;border-radius:3px}" +
    ".bpg-k{margin:0 0 .3rem;color:#B8775A;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}" +
    ".bpg h1{margin:0 0 .5rem;font:700 clamp(1.45rem,5.6vw,1.8rem)/1.2 Georgia,'Times New Roman',serif;color:#3A4A33}" +
    ".bpg p{margin:0 0 .9rem}" +
    ".bpg label{display:block;margin:0 0 .3rem;font-weight:700}" +
    ".bpg-row{display:flex;gap:.5rem;flex-wrap:wrap}" +
    ".bpg input{flex:1 1 11rem;min-width:0;min-height:48px;padding:.55rem .8rem;font:inherit;font-size:1.05rem;color:#1A1A18;background:#fff;border:2px solid #1A1A18;border-radius:10px}" +
    ".bpg input[aria-invalid=true]{border-color:#9b3d2a}" +
    ".bpg button{flex:0 0 auto;min-height:48px;min-width:6.5rem;padding:0 1.3rem;font-family:inherit;font-weight:700;font-size:1.02rem;line-height:1;color:#fff;background:#54664A;border:2px solid #1A1A18;border-radius:999px;box-shadow:2px 2px 0 #1A1A18;cursor:pointer}" +
    ".bpg button:hover{background:#3A4A33}.bpg button[disabled]{opacity:.65;cursor:wait}" +
    ".bpg input:focus-visible,.bpg button:focus-visible,.bpg a:focus-visible{outline:3px solid #B8775A;outline-offset:2px}" +
    ".bpg-err{min-height:1.5em;margin:.55rem 0 0!important;color:#9b3d2a;font-weight:600}" +
    ".bpg-links{display:flex;flex-wrap:wrap;gap:.2rem 1.2rem;margin-top:.5rem;border-top:1px solid rgba(26,26,24,.15);padding-top:.5rem}" +
    ".bpg-links a{display:inline-flex;align-items:center;min-height:44px;color:#3A4A33;font-weight:700}" +
    ".bpg-wait{color:#5d5d55}" +
    "@media (prefers-reduced-motion:no-preference){.bpg-card{animation:bpg-rise .35s ease-out}}" +
    "@keyframes bpg-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}";
  (doc.head || html).appendChild(css);

  var box, input, err, btn, form, wait, observer, hidden = [];

  function shut(el) {   // make one page element unreachable (no clicks, no focus, hidden from screen readers)
    if (el === box || el.nodeType !== 1 || el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
    hidden.push([el, el.hasAttribute("inert"), el.getAttribute("aria-hidden")]);
    el.setAttribute("inert", ""); el.inert = true; el.setAttribute("aria-hidden", "true");
  }
  function build() {
    box = doc.createElement("div"); box.className = "bpg";
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "bpg-title"); box.setAttribute("aria-describedby", "bpg-desc");
    box.innerHTML =
      '<div class="bpg-card">' +
        '<span class="bpg-bar" aria-hidden="true"></span>' +
        '<p class="bpg-k">The Gremlin Desks</p>' +
        '<h1 id="bpg-title" tabindex="-1">Type the username to get into Business Planning</h1>' +
        '<p id="bpg-desc">A little door to keep the robots out. If Bryan gave you the username, pop it in below.</p>' +
        '<p class="bpg-wait" id="bpg-wait" role="status">One moment&hellip;</p>' +
        '<form id="bpg-form" novalidate hidden>' +
          '<label for="bpg-pass">Username</label>' +
          '<div class="bpg-row">' +
            '<input type="text" id="bpg-pass" name="gate_username" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-no-dictate aria-describedby="bpg-err" required>' +
            '<button type="submit" id="bpg-go">Enter</button>' +
          '</div>' +
          '<p class="bpg-err" id="bpg-err" role="alert" aria-live="assertive"></p>' +
        '</form>' +
        '<div class="bpg-links">' +
          '<a href="' + ROOT + '">&larr; Back to the Gremlin Desks</a>' +
          '<a href="' + ROOT + 'signin/">Have an account? Sign in</a>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(box);
    form = box.querySelector("#bpg-form"); input = box.querySelector("#bpg-pass"); err = box.querySelector("#bpg-err");
    btn = box.querySelector("#bpg-go"); wait = box.querySelector("#bpg-wait");
    Array.prototype.forEach.call(doc.body.children, shut);
    observer = new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.parentNode === doc.body) shut(n); }); }); });
    observer.observe(doc.body, { childList: true });
    var tries = 0;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = norm(input.value);
      if (!v) { bad("Please type the username first."); return; }
      if (v === norm(GATE_USERNAME)) {
        try { localStorage.setItem(KEY, JSON.stringify({ p: MARK, until: Date.now() + REMEMBER_DAYS * 864e5 })); } catch (x) {}
        state.unlocked = true; open("username");
      } else {
        tries++;
        bad(tries < 3 ? "Hmm, that's not quite it. Check the spelling and try again." : "Still not it. If you're stuck, ask Bryan for the username, or sign in instead.");
        input.select();
      }
    });
    input.addEventListener("input", function () { if (input.getAttribute("aria-invalid")) { input.removeAttribute("aria-invalid"); err.textContent = ""; } });
  }
  function bad(msg) { err.textContent = msg; input.setAttribute("aria-invalid", "true"); input.focus(); }
  function ask() {   // not a member: show the username box
    if (api.isOpen() || !box) return;
    wait.hidden = true; form.hidden = false; input.focus();
  }
  function open(how) {
    if (observer) observer.disconnect();
    hidden.forEach(function (h) {
      var el = h[0]; if (!h[1]) { el.removeAttribute("inert"); el.inert = false; }
      if (h[2] == null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", h[2]);
    });
    hidden = [];
    var hadFocus = box && box.contains(doc.activeElement);
    if (box) box.remove();
    html.classList.remove("bpg-locked");
    resolveOpen(how);
    if (hadFocus) {   // land somewhere sensible: the open tab, or the page's heading
      var t = doc.querySelector('[role="tab"][aria-selected="true"]') || doc.querySelector("main h1, main h2");
      if (t) { if (!t.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT)$/.test(t.tagName)) t.setAttribute("tabindex", "-1"); t.focus(); }
    }
  }
  function guardCalls() {   // belt and braces: the free-plan calls refuse to run while the gate is shut
    var A = window.DesksAccess, G = A && A.api && A.api.bpGuest;
    if (!G || G.__gated) return; G.__gated = true;
    ["start", "post", "email"].forEach(function (k) {
      var f = G[k]; if (typeof f !== "function") return;
      G[k] = function () {
        if (!api.isOpen()) { var e = new Error("Please type the Business Planning username first."); e.code = "locked"; return Promise.reject(e); }
        return f.apply(this, arguments);
      };
    });
  }
  function boot() {
    build();
    guardCalls();
    var A = window.DesksAccess, settled = false;
    var later = setTimeout(function () { if (!settled) ask(); }, 4000);   // a slow sign-in check never leaves people stuck
    if (A && A.ready && A.ready.then) {
      A.ready.then(function (who) {
        settled = true; clearTimeout(later);
        if (who && who.role && who.role !== "guest") { state.member = true; open("member"); } else ask();
      }, function () { settled = true; clearTimeout(later); ask(); });
    } else { settled = true; clearTimeout(later); ask(); }
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot); else boot();
})();
