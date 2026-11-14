/* Gremlin World v5b: no accidental zoom on phones/iPads + a ⟲ Reset view button.
   Why: on iPad/iPhone a quick double tap (or a stray pinch) zoomed the whole PAGE, and the room drag then
   swallowed the pinch you'd use to zoom back out. This keeps the page at 1x and gives a one-tap way back. */
(function () {
  var LOCK = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
  var meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute("content", LOCK);
  var css = document.createElement("style");
  css.textContent = "html,body{touch-action:manipulation;overscroll-behavior:none;-webkit-text-size-adjust:100%}" +
    "#viewport{touch-action:none}button,a,.btn,.pill{touch-action:manipulation}" +
    "input,select,textarea{font-size:16px!important}" +
    ".gw-reset{min-width:40px}";
  document.head.appendChild(css);
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (k) { document.addEventListener(k, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener("dblclick", function (e) { if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) e.preventDefault(); }, { passive: false });
  var lastEnd = 0;
  document.addEventListener("touchend", function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var now = Date.now(); if (now - lastEnd < 320 && e.touches.length === 0) e.preventDefault(); lastEnd = now;
  }, { passive: false });
  document.addEventListener("touchmove", function (e) { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  function resetView() {
    if (meta) { meta.setAttribute("content", "width=device-width, initial-scale=1.0001, maximum-scale=1.0001, user-scalable=no, viewport-fit=cover");
      setTimeout(function () { meta.setAttribute("content", LOCK); window.scrollTo(0, 0); }, 60); }
    try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); } catch (e) {}
    var G = window.GremlinWorld; if (G && G.view) { if (G.turnTo && !G.busy) G.turnTo(G.view.yaw, 0, 1, null, 350); else { G.view.zoom = 1; G.view.pitch = 0; } }
    window.GW_LAST_RESET = { at: Date.now(), scale: window.visualViewport ? window.visualViewport.scale : 1 };
  }
  window.GremlinWorldResetView = resetView;
  function addButton() {
    var right = document.querySelector(".hud-right"); if (!right || document.getElementById("btn-reset")) return;
    var b = document.createElement("button"); b.id = "btn-reset"; b.type = "button"; b.className = "pill btn gw-reset";
    b.setAttribute("aria-label", "Reset view: undo any zoom and level the view"); b.title = "Reset view (0)"; b.textContent = "⟲";
    b.addEventListener("click", resetView); var help = document.getElementById("btn-help"); right.insertBefore(b, help || null);
  }
  addEventListener("keydown", function (e) { if (e.key === "0" && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) resetView(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addButton); else addButton();
})();
