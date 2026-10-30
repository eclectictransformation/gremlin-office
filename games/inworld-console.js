/* Gremlin World in-world console: opens a side game that lives on its own page (Moss Garden, the Seed Path,
   Gremlin Chess, the wardrobe) INSIDE the world, in a cabinet-style overlay with an iframe. Nothing opens a new
   page or tab: links inside the game that would leave it (Leave / Back to the Break Room / Return to the Arcade,
   or anything pointing outside the game's folder) just close the console and drop you back in the room.
   Same pattern as the arcade cabinets (games/arcade.js): world.js calls GremlinConsole.open(spec, {onClose}). */
(function () {
  "use strict";
  var root = null, frame = null, titleEl = null, tagEl = null, closeBtn = null, S = null, lastFocus = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function build() {
    root = el("div", "arcade-overlay gw-console"); root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "gwc-title");
    var cab = el("div", "cab gwc-cab");
    var mq = el("div", "cab-marquee gwc-marquee");
    titleEl = el("h2", "", ""); titleEl.id = "gwc-title"; tagEl = el("p", "cab-tag", "");
    var tx = el("div", "gwc-titles"); tx.appendChild(titleEl); tx.appendChild(tagEl);
    closeBtn = el("button", "ab close gwc-close", "\u2190 Back"); closeBtn.type = "button";
    closeBtn.addEventListener("click", function () { close(); });
    mq.appendChild(closeBtn); mq.appendChild(tx); cab.appendChild(mq);
    var bez = el("div", "cab-bezel gwc-bezel");
    frame = el("iframe", "gwc-frame"); frame.setAttribute("title", "Game");
    frame.addEventListener("load", watchFrame);
    bez.appendChild(frame); cab.appendChild(bez);
    root.appendChild(cab);
    root.addEventListener("click", function (e) { if (e.target === root) close(); });
    (document.getElementById("app") || document.body).appendChild(root);
    window.addEventListener("message", function (e) {
      if (e.origin !== location.origin || !e.data || !isOpen()) return;
      if (e.data.type === "gremlin-console-close" || e.data.type === "gremlin-office-escape") close();
    });
    document.addEventListener("keydown", function (e) { if (isOpen() && e.key === "Escape") { e.preventDefault(); close(); } }, true);
  }
  function baseDir(u) { return u.pathname.replace(/[^\/]*$/, ""); }
  // keep the game inside the console: any link or navigation that leaves the game's folder closes it instead
  function leaves(href, target) {
    if (!href || /^(javascript:|#)/i.test(href)) return false;
    var u; try { u = new URL(href, frame.contentWindow.location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return true;
    if (target && /^_(top|blank|parent)$/i.test(target)) return true;
    return u.pathname.indexOf(S.base) !== 0;
  }
  function watchFrame() {
    if (!S) return;
    var w, d;
    try { w = frame.contentWindow; d = frame.contentDocument; if (!d) return; } catch (e) { close(); return; }
    var here = new URL(w.location.href);
    if (here.pathname === "blank" || w.location.href === "about:blank") return;
    if (here.pathname.indexOf(S.base) !== 0) { close(); return; }   // a script navigated away: come home instead
    d.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null; if (!a) return;
      if (leaves(a.getAttribute("href"), a.getAttribute("target"))) { e.preventDefault(); e.stopPropagation(); close(); }
    }, true);
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && !e.defaultPrevented && S && S.escCloses) close(); });
    try { d.documentElement.classList.add("in-world"); } catch (e) {}
  }
  function open(spec, opts) {
    if (!root) build();
    if (!/^([a-z0-9-]+\/)+([a-z0-9-]+\.html)?(\?[a-z0-9=&-]*)?$/.test(spec.src)) return false;   // only our own side-game folders
    var u = new URL(spec.src, location.href);
    S = { spec: spec, opts: opts || {}, base: baseDir(u), escCloses: !!spec.escCloses };
    titleEl.textContent = spec.title || "A little game"; tagEl.textContent = spec.tagline || "";
    tagEl.hidden = !spec.tagline;
    closeBtn.textContent = spec.backLabel || "\u2190 Back";
    closeBtn.setAttribute("aria-label", spec.backAria || ("Close " + (spec.title || "the game") + " and go back to the room"));
    root.style.setProperty("--cab", spec.color || "#54664A"); root.style.setProperty("--cab-dark", spec.colorDark || "#3a4a33"); root.style.setProperty("--acc", spec.accent || "#f3d98b");
    frame.setAttribute("title", spec.title || "Game");
    lastFocus = document.activeElement;
    frame.src = u.pathname + u.search;
    root.hidden = false; root.classList.remove("in"); void root.offsetWidth; root.classList.add("in");
    document.body.classList.add("console-open");
    setTimeout(function () { try { closeBtn.focus({ preventScroll: true }); } catch (e) {} }, 30);
    return true;
  }
  function close(silent) {
    if (!root || root.hidden) return;
    var s = S; S = null;
    root.hidden = true; document.body.classList.remove("console-open");
    try { frame.src = "about:blank"; } catch (e) {}
    if (s && s.opts.onClose && !silent) try { s.opts.onClose(); } catch (e) { console.error(e); }
  }
  function isOpen() { return !!(root && !root.hidden); }
  window.GremlinConsole = { open: open, close: close, isOpen: isOpen, get frame() { return frame; } };
})();
