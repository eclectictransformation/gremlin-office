/* The Quiet Room: name constant, the two doors, and an OPTIONAL Gremlin Name + Key login
   (same RPCs, same storage key "gremlin-world-player" as world-player.js / the arcade / the Game Nook). */
(function () {
  "use strict";
  var Q = window.Quiet, $ = function (s) { return document.querySelector(s); };
  document.title = Q.name + " · Gremlin World";
  document.querySelectorAll("[data-qname]").forEach(function (e) { e.textContent = Q.name; });
  Q.bindStill($("#btn-still"));
  function normKey(k) { return String(k || "").trim().toLowerCase().replace(/([a-z])([0-9])/g, "$1-$2").replace(/([0-9])([a-z])/g, "$1-$2").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, ""); }
  var NOMATCH = "Hmm, that key didn't match. Try again or get a new one.", OFFLINE = "Noodle can't reach the gremlin filing cabinet right now. Try again in a little while.";
  var REG = { length: "Gremlin Names are 3 to 20 characters.", chars: "Letters, numbers, spaces, - and _ only, please.", rude: "Let's pick something a bit friendlier. The gremlins blush easily.",
    reserved: "That name belongs to someone in the office already. Try another one.", taken: "Someone already has that name. Add a number, or a tiny twist?", busy: "Lots of gremlins at the door right now. Try again in a minute.", slow_down: "Lots of tries in a row. Give it ten minutes." };
  function render() {
    var s = Q.session();
    $("#qr-who").textContent = s ? "Welcome back, " + s.name + ". Your garden follows your Gremlin Name." : "Playing as a guest. Your garden stays on this device.";
    $("#qr-login").hidden = !!s; $("#qr-out").hidden = !s;
    $("#qr-hello").textContent = s ? "Hello, " + s.name + ". Pick a door when you're ready." : "A soft little room off the Arcade. Nothing to win here. Pick a door when you're ready.";
  }
  var modal = $("#qr-modal"), back = null;
  function pane(id) { ["#qr-form-login", "#qr-form-new", "#qr-reveal"].forEach(function (p) { $(p).hidden = p !== id; }); }
  function open(id) { back = document.activeElement; pane(id); modal.hidden = false; requestAnimationFrame(function () { modal.classList.add("in"); var f = modal.querySelector(id + " input, " + id + " button"); if (f) f.focus(); }); }
  function close() { modal.classList.remove("in"); setTimeout(function () { modal.hidden = true; }, 400); render(); if (back) try { back.focus(); } catch (e) {} }
  function signedIn(r) { try { localStorage.setItem("gremlin-world-player", JSON.stringify({ name: r.name, token: r.token, expires_at: r.expires_at })); localStorage.setItem("gremlin-world-player-choice", JSON.stringify("named")); } catch (e) {} }
  $("#qr-login").addEventListener("click", function () { $("#qr-err").textContent = ""; open("#qr-form-login"); });
  $("#qr-new-open").addEventListener("click", function () { $("#qr-new-err").textContent = ""; open("#qr-form-new"); });
  $("#qr-cancel").addEventListener("click", close); $("#qr-cancel2").addEventListener("click", close); $("#qr-rv-go").addEventListener("click", close);
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) close(); });
  $("#qr-form-login").addEventListener("submit", function (e) {
    e.preventDefault(); var n = $("#qr-name").value, k = $("#qr-key").value, er = $("#qr-err");
    if (!n.trim() || !k.trim()) { er.textContent = "Both boxes, please: your Gremlin Name and your key."; return; }
    er.textContent = "Opening your door\u2026";
    Q.rpc("gw_login", { p_name: n, p_key: normKey(k) }).then(function (r) {
      if (!r || !r.ok) { er.textContent = (r && REG[r.error]) || NOMATCH; return; }
      signedIn(r); $("#qr-key").value = ""; close();
    }, function () { er.textContent = OFFLINE; });
  });
  $("#qr-form-new").addEventListener("submit", function (e) {
    e.preventDefault(); var n = $("#qr-new-name").value.replace(/\s+/g, " ").trim(), er = $("#qr-new-err");
    if (n.length < 3 || n.length > 20) { er.textContent = REG.length; return; }
    if (!/^[A-Za-z0-9 _-]+$/.test(n)) { er.textContent = REG.chars; return; }
    er.textContent = "Opening your door\u2026";
    Q.rpc("gw_register", { p_name: n }).then(function (r) {
      if (!r || !r.ok) { er.textContent = (r && REG[r.error]) || OFFLINE; return; }
      signedIn(r); $("#qr-rv-name").textContent = r.name; $("#qr-rv-key").textContent = r.key; pane("#qr-reveal"); $("#qr-rv-go").focus();
    }, function () { er.textContent = OFFLINE; });
  });
  $("#qr-out").addEventListener("click", function () {
    var s = Q.session(); if (s) Q.rpc("gw_logout", { p_token: s.token }).catch(function () {});
    try { localStorage.removeItem("gremlin-world-player"); } catch (e) {} render(); $("#qr-login").focus();
  });
  render();
})();
