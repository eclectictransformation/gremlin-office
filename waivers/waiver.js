/* Event waiver: saves one row to event_waivers (and optionally newsletter_signups). Insert-only for visitors. */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  var mode = "finger", drawn = false, drawing = false, last = null, pad = $("wv-pad"), ctx = pad.getContext("2d");
  var MAX_SIG = 250000;

  function today() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function sizePad() {
    var r = pad.getBoundingClientRect(); if (!r.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (pad.width === w && pad.height === h) return;
    pad.width = w; pad.height = h; ctx.scale(dpr, dpr); style(); drawn = false;
  }
  function style() { ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1A1A18"; }
  function pos(e) { var r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  pad.addEventListener("pointerdown", function (e) { drawing = true; last = pos(e); pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, 6.3); ctx.fill(); drawn = true; e.preventDefault(); });
  pad.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; e.preventDefault(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) { pad.addEventListener(n, function () { drawing = false; }); });
  function clearPad() { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, pad.width, pad.height); ctx.restore(); drawn = false; }
  $("wv-clear").onclick = clearPad;
  window.addEventListener("resize", sizePad);

  function setMode(m) {
    mode = m;
    $("wv-finger").hidden = m !== "finger"; $("wv-type").hidden = m !== "type";
    $("wv-m-finger").setAttribute("aria-pressed", m === "finger"); $("wv-m-type").setAttribute("aria-pressed", m === "type");
    if (m === "finger") setTimeout(sizePad, 0);
  }
  $("wv-m-finger").onclick = function () { setMode("finger"); };
  $("wv-m-type").onclick = function () { setMode("type"); };
  $("wv-typed").addEventListener("input", function () { $("wv-typed-prev").textContent = $("wv-typed").value; });
  $("wv-news").addEventListener("change", function () { $("wv-news-box").hidden = !$("wv-news").checked; });
  $("wv-date").value = today();
  sizePad();

  function loadSb() {
    return new Promise(function (ok, bad) {
      var C = window.DESKS_ACCESS || {};
      if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) { bad(new Error("The waiver can't reach Bryan right now. Please tell him in person.")); return; }
      function make() { ok(window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })); }
      if (window.supabase) return make();
      var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; s.async = true;
      s.onload = make; s.onerror = function () { bad(new Error("Could not load the connection. Check your signal and try again.")); };
      document.head.appendChild(s);
    });
  }
  function sigData() {
    if (mode === "type") { var t = $("wv-typed").value.trim(); return t ? { type: "typed", data: t } : null; }
    if (!drawn) return null;
    var url = pad.toDataURL("image/png");
    if (url.length > MAX_SIG) url = pad.toDataURL("image/jpeg", 0.6);
    return url.length > MAX_SIG ? null : { type: "drawn", data: url };
  }

  var busy = false;
  $("wv-form").addEventListener("submit", async function (e) {
    e.preventDefault(); if (busy) return;
    var err = $("wv-err"); err.textContent = "";
    if ($("wv-site").value) { showOk(); return; }
    var full = $("wv-full").value.trim(), ev = $("wv-event").value.trim(), pn = $("wv-printed").value.trim(), dt = $("wv-date").value, sig = sigData();
    var news = $("wv-news").checked, email = $("wv-email").value.trim();
    if (!full) return fail("Please add your full name.");
    if (!ev) return fail("Please describe the event.");
    if (!$("wv-agree").checked) return fail("Please tick the box to confirm you've read and agree.");
    if (!pn) return fail("Please print your name.");
    if (!sig) return fail("Please sign, or type your name as your signature.");
    if (!dt) return fail("Please add the date.");
    if (news && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Please add a valid email for the newsletter, or untick it.");
    busy = true; $("wv-submit").disabled = true;
    try {
      var sb = await loadSb();
      var r = await sb.from("event_waivers").insert({ full_name: full, event_description: ev, printed_name: pn, signature_type: sig.type, signature_data: sig.data, signed_on: dt, newsletter_opt_in: news });
      if (r.error) throw new Error("Sorry, that didn't go through. Please try again, or tell Bryan in person.");
      var msg = "Your waiver was sent to Bryan.";
      if (news) {
        var n = await sb.from("newsletter_signups").insert({ name: full, email: email, source: "event-waiver" });
        if (n.error && n.error.code !== "23505") msg += " The newsletter sign-up didn't go through, so please tell Bryan if you'd like to join.";
        else msg += " You're on the newsletter list.";
      }
      $("wv-ok-msg").textContent = msg; showOk();
    } catch (x) { fail(x.message || "Something went wrong."); }
    busy = false; $("wv-submit").disabled = false;
  });
  function fail(m) { $("wv-err").textContent = m; $("wv-err").scrollIntoView({ block: "center" }); }
  function showOk() { $("wv-form").hidden = true; $("wv-ok").hidden = false; }
  $("wv-another").onclick = function () {
    $("wv-form").reset(); $("wv-typed-prev").textContent = ""; $("wv-news-box").hidden = true; clearPad(); setMode("finger");
    $("wv-date").value = today(); $("wv-form").hidden = false; $("wv-ok").hidden = true; setTimeout(sizePad, 0);
  };
})();
