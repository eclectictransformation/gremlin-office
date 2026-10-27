/* The Gremlin Office: a tiny CSS-3D cube panorama. No libraries, no network calls
   beyond this folder. All content comes from office-data.json. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $("#app"), vp = $("#viewport"), world = $("#world");
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var standalone = window.self === window.top;
  if (coarse) document.body.classList.add("coarse");
  if (standalone) document.body.classList.add("standalone");

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var S = 1024, H = 512;          // face size / half size (px)
  var P = 600;                    // perspective distance, recomputed on resize
  var view = { yaw: 0, pitch: 0, zoom: 1 };
  var vel = { yaw: 0, pitch: 0 };
  var pitchLimit = 80, data = null, anim = null, dirty = true;
  var hotspotEls = {}, faceEls = {}, foundSet = loadFound();
  var keys = {}, lastInput = Date.now(), idleShown = false, debugOn = false;

  // Cube faces: n = direction from camera to face centre, r = face's +x, d = face's +y (CSS axes, y down)
  var FACES = {
    front:   { n: [0, 0, -1], r: [1, 0, 0],  d: [0, 1, 0],  tf: "rotateY(0deg)" },
    right:   { n: [1, 0, 0],  r: [0, 0, 1],  d: [0, 1, 0],  tf: "rotateY(-90deg)" },
    back:    { n: [0, 0, 1],  r: [-1, 0, 0], d: [0, 1, 0],  tf: "rotateY(-180deg)" },
    left:    { n: [-1, 0, 0], r: [0, 0, -1], d: [0, 1, 0],  tf: "rotateY(-270deg)" },
    floor:   { n: [0, 1, 0],  r: [1, 0, 0],  d: [0, 0, 1],  tf: "rotateX(90deg)" },
    ceiling: { n: [0, -1, 0], r: [1, 0, 0],  d: [0, 0, -1], tf: "rotateX(-90deg)" }
  };
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function dirOf(yaw, pitch) {
    var y = yaw * D2R, p = pitch * D2R;
    return [Math.cos(p) * Math.sin(y), -Math.sin(p), -Math.cos(p) * Math.cos(y)];
  }
  // yaw/pitch -> {face, x, y} in face pixels. Works for the drawn room and for cubemap images alike.
  function project(yaw, pitch) {
    var d = dirOf(yaw, pitch), best = null, bd = -2;
    for (var k in FACES) { var v = dot(d, FACES[k].n); if (v > bd) { bd = v; best = k; } }
    var f = FACES[best];
    return { face: best, x: H + H * dot(d, f.r) / bd, y: H + H * dot(d, f.d) / bd };
  }
  // screen point -> yaw/pitch (used by the D debug readout)
  function unproject(sx, sy) {
    var rect = vp.getBoundingClientRect(), pz = P * view.zoom;
    var x = sx - rect.width / 2, y = sy - rect.height / 2, z = -pz;
    var b = -view.pitch * D2R, a = -view.yaw * D2R;
    var y1 = y * Math.cos(b) - z * Math.sin(b), z1 = y * Math.sin(b) + z * Math.cos(b);
    var x2 = x * Math.cos(a) + z1 * Math.sin(a), z2 = -x * Math.sin(a) + z1 * Math.cos(a);
    var len = Math.sqrt(x2 * x2 + y1 * y1 + z2 * z2);
    return { yaw: ((Math.atan2(x2, -z2) * R2D) + 360) % 360, pitch: Math.asin(-y1 / len) * R2D };
  }

  /* ---------- storage (may be blocked inside sandboxed iframes) ---------- */
  function loadFound() { try { return new Set(JSON.parse(localStorage.getItem("gremlin-office-found") || "[]")); } catch (e) { return new Set(); } }
  function saveFound() { try { localStorage.setItem("gremlin-office-found", JSON.stringify(Array.from(foundSet))); } catch (e) {} }

  /* ---------- build ---------- */
  function el(tag, cls, attrs) {
    var e = document.createElement(tag); if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function build() {
    var room = data.room || {};
    S = room.faceSize || 1024; H = S / 2;
    pitchLimit = room.pitchLimit || 80;
    if (room.startView) { view.yaw = room.startView.yaw || 0; view.pitch = room.startView.pitch || 0; }
    Object.keys(FACES).forEach(function (k) {
      var f = el("div", "face face-" + k);
      f.style.width = f.style.height = S + "px";
      f.style.left = f.style.top = -H + "px";
      f.style.transform = FACES[k].tf + " translateZ(" + (-H) + "px)";
      var img = el("img", "face-art", { alt: "", draggable: "false", decoding: "async" });
      img.dataset.src = room.faces[k];
      img.style.width = img.style.height = (S + 2) + "px";
      f.appendChild(img);
      faceEls[k] = f; world.appendChild(f);
    });
    // strips first (DOM order = Tab order), then hotspots sorted by yaw
    (data.strips || []).forEach(function (s) {
      var slot = data.slots && data.slots[s.slot]; if (!slot || s.active === false) return;
      var pr = project(slot.yaw, slot.pitch);
      var b = el("button", "strip" + (s.upside_down ? " upside" : ""), { "aria-label": "Comic strip: " + stripName(s) + (s.upside_down ? " (hanging upside down)" : "") });
      place(b, pr, slot.w, slot.h);
      var mat = el("span", "mat"), im = el("img", "", { alt: s.alt || s.title, draggable: "false" });
      im.dataset.src = s.thumb || s.filename; mat.appendChild(im); b.appendChild(mat);
      b._item = { kind: "strip", strip: s, yaw: slot.yaw, pitch: slot.pitch, id: "strip-" + s.date, label: stripName(s), area: "gallery" };
      wire(b); faceEls[pr.face].appendChild(b);
    });
    var used = {}; (data.strips || []).forEach(function (s) { used[s.slot] = 1; });
    Object.keys(data.slots || {}).forEach(function (k) {   // empty slots get a placeholder frame
      if (used[k]) return; var slot = data.slots[k], pr = project(slot.yaw, slot.pitch);
      var b = el("div", "strip empty", { "aria-hidden": "true" }); place(b, pr, slot.w, slot.h);
      var mat = el("span", "mat"); mat.textContent = "next strip coming soon"; b.appendChild(mat); faceEls[pr.face].appendChild(b);
    });
    activeHotspots().sort(function (a, b) { return order(a) - order(b); }).forEach(function (h) {
      var pr = project(h.position.yaw, h.position.pitch), sz = h.size || [80, 80];
      var b = el("button", "hs " + (h.style || "hidden"), { "aria-label": h.label || h.card.title, "data-id": h.id });
      place(b, pr, sz[0], sz[1]);
      if (h.style === "framed" && h.card.image) { var im = el("img", "", { alt: h.card.alt || "", draggable: "false" }); im.dataset.src = h.card.image; b.appendChild(im); }
      if (h.style === "clock") buildClock(b);
      if (foundSet.has(h.id)) b.classList.add("found");
      b._item = { kind: "hotspot", h: h, yaw: h.position.yaw, pitch: h.position.pitch, id: h.id, label: h.label, area: h.area };
      hotspotEls[h.id] = b; wire(b); faceEls[pr.face].appendChild(b);
    });
    updateFound();
  }
  function stripName(s) { return (s.episode ? "Episode " + s.episode + ": " : "") + s.title; }
  function order(h) { var y = h.position.yaw; return (h.area === "floor" ? 1000 : h.area === "ceiling" ? 2000 : 0) + y; }
  function activeHotspots() { return (data.hotspots || []).filter(function (h) { return h.active !== false && h.position; }); }
  function place(e, pr, w, h) { e.style.left = (pr.x - w / 2) + "px"; e.style.top = (pr.y - h / 2) + "px"; e.style.width = w + "px"; e.style.height = h + "px"; }
  function buildClock(b) {
    for (var i = 0; i < 12; i++) { var t = el("span", "tick"); t.style.transform = "rotate(" + i * 30 + "deg)"; t.style.transformOrigin = "50% " + (49 - 4) + "px"; b.appendChild(t); }
    b.appendChild(el("span", "hand h")); b.appendChild(el("span", "hand m")); b.appendChild(el("span", "pin"));
    function tick() { var d = new Date(); $(".h", b).style.transform = "rotate(" + ((d.getHours() % 12) * 30 + d.getMinutes() / 2) + "deg)"; $(".m", b).style.transform = "rotate(" + d.getMinutes() * 6 + "deg)"; }
    tick(); setInterval(tick, 30000);
  }

  /* ---------- lazy loading: only faces you can (nearly) see ---------- */
  function lazyLoad() {
    var d = dirOf(view.yaw, view.pitch), rect = vp.getBoundingClientRect();
    var half = Math.atan(Math.hypot(rect.width, rect.height) / 2 / (P * view.zoom)) * R2D;
    var thresh = Math.cos(Math.min(179, half + 55) * D2R);
    for (var k in faceEls) {
      if (faceEls[k]._loaded || dot(d, FACES[k].n) < thresh) continue;
      faceEls[k]._loaded = true;
      faceEls[k].querySelectorAll("img[data-src]").forEach(function (im) { im.src = im.dataset.src; im.removeAttribute("data-src"); });
    }
  }

  /* ---------- render loop ---------- */
  function resize() {
    var w = vp.clientWidth, h = vp.clientHeight;
    // aim for ~65deg vertical FOV, but never narrower than ~55deg horizontally (portrait phones)
    P = Math.min((h / 2) / Math.tan(32.5 * D2R), (w / 2) / Math.tan(27.5 * D2R));
    P = Math.max(P, (w / 2) / Math.tan(50 * D2R)); // cap very wide embeds at ~100deg so it never looks fish-eyed
    dirty = true;
  }
  function render() {
    view.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, view.pitch));
    view.yaw = ((view.yaw % 360) + 360) % 360;
    var pz = P * view.zoom;
    vp.style.perspective = pz + "px";
    world.style.transform = "translateZ(" + pz + "px) rotateX(" + view.pitch + "deg) rotateY(" + view.yaw + "deg)";
    lazyLoad();
    if (debugOn) $("#debug").textContent = "view yaw " + view.yaw.toFixed(1) + "  pitch " + view.pitch.toFixed(1) + (lastPointer ? "\ncursor yaw " + lastPointer.yaw.toFixed(1) + "  pitch " + lastPointer.pitch.toFixed(1) : "");
  }
  var lastT = 0;
  function loop(t) {
    var dt = Math.min(0.05, (t - (lastT || t)) / 1000); lastT = t;
    if (anim) {
      var k = Math.min(1, (t - anim.t0) / anim.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      view.yaw = anim.y0 + anim.dy * e; view.pitch = anim.p0 + anim.dp * e; view.zoom = anim.z0 + anim.dz * e;
      dirty = true; if (k >= 1) { var cb = anim.cb; anim = null; if (cb) cb(); }
    }
    var ky = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), kp = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    if (ky || kp) { view.yaw += ky * 80 * dt; view.pitch += kp * 60 * dt; dirty = true; }
    if (!dragging && (Math.abs(vel.yaw) > 0.01 || Math.abs(vel.pitch) > 0.01)) {
      view.yaw += vel.yaw; view.pitch += vel.pitch; vel.yaw *= 0.92; vel.pitch *= 0.92; dirty = true;
    }
    if (dirty) { render(); dirty = false; }
    if (!idleShown && Date.now() - lastInput > 30000 && $("#card").hidden) { idleShown = true; $("#btn-secrets").hidden = false; }
    requestAnimationFrame(loop);
  }
  function turnTo(yaw, pitch, zoom, cb) {
    var dy = ((yaw - view.yaw + 540) % 360) - 180;
    if (mqReduce.matches) { view.yaw += dy; view.pitch = pitch; view.zoom = zoom; dirty = true; anim = null; if (cb) cb(); return; }
    vel.yaw = vel.pitch = 0;
    anim = { t0: performance.now(), dur: 550 + Math.abs(dy) * 3, y0: view.yaw, dy: dy, p0: view.pitch, dp: pitch - view.pitch, z0: view.zoom, dz: zoom - view.zoom, cb: cb };
  }

  /* ---------- input ---------- */
  var dragging = false, down = null, suppressClick = false, lastPointer = null;
  function poke() { lastInput = Date.now(); var hint = $("#hint"); if (hint && !hint._timer) hint._timer = setTimeout(function () { hint.classList.add("gone"); }, 6000); }
  vp.addEventListener("pointerdown", function (e) {
    if (e.button && e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, lx: e.clientX, ly: e.clientY, lt: performance.now() };
    dragging = false; vel.yaw = vel.pitch = 0; anim = null; poke();
  });
  vp.addEventListener("pointermove", function (e) {
    if (debugOn) { lastPointer = unproject(e.clientX - vp.getBoundingClientRect().left, e.clientY - vp.getBoundingClientRect().top); dirty = true; }
    if (!down || e.pointerId !== down.id) return;
    var dx = e.clientX - down.lx, dy = e.clientY - down.ly;
    if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
      dragging = true; vp.classList.add("dragging"); try { vp.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (!dragging) return;
    var k = R2D / (P * view.zoom);
    view.yaw -= dx * k; view.pitch += dy * k;
    var now = performance.now(), dtm = Math.max(8, now - down.lt);
    if (!mqReduce.matches) { vel.yaw = -dx * k * 16 / dtm; vel.pitch = dy * k * 16 / dtm; }
    down.lx = e.clientX; down.ly = e.clientY; down.lt = now; dirty = true; poke();
  });
  function endDrag() {
    if (dragging) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 0); }
    if (performance.now() - (down ? down.lt : 0) > 80) { vel.yaw = vel.pitch = 0; }
    dragging = false; down = null; vp.classList.remove("dragging");
  }
  vp.addEventListener("pointerup", endDrag);
  vp.addEventListener("pointercancel", function () { dragging = false; down = null; vel.yaw = vel.pitch = 0; vp.classList.remove("dragging"); });
  vp.addEventListener("wheel", function (e) {
    if (!e.ctrlKey && !standalone && Math.abs(e.deltaY) > Math.abs(e.deltaX)) return; // let the host page scroll when embedded
    e.preventDefault(); view.zoom = Math.max(0.8, Math.min(2.2, view.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); dirty = true; poke();
  }, { passive: false });
  vp.addEventListener("scroll", function () { vp.scrollTop = 0; vp.scrollLeft = 0; });
  window.addEventListener("keydown", function (e) {
    poke();
    var open = !$("#card").hidden || !$("#explore").hidden;
    if (e.key === "Escape") {
      if (!open && window.parent !== window) { try { window.parent.postMessage({ type: "gremlin-office-escape" }, "*"); } catch (err) {} }
      closeCard(); closeExplore(); return;
    }
    if (open) { if (e.key === "Tab") trapFocus(e); return; }
    if (/^Arrow/.test(e.key)) { keys[e.key] = true; anim = null; e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") { view.zoom = Math.min(2.2, view.zoom * 1.1); dirty = true; }
    else if (e.key === "-" || e.key === "_") { view.zoom = Math.max(0.8, view.zoom / 1.1); dirty = true; }
    else if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey) { debugOn = !debugOn; $("#debug").hidden = !debugOn; dirty = true; }
  });
  window.addEventListener("keyup", function (e) { delete keys[e.key]; });
  window.addEventListener("blur", function () { keys = {}; });
  document.querySelectorAll("[data-look]").forEach(function (b) {
    b.addEventListener("click", function () { poke(); turnTo(view.yaw, view.pitch + (b.dataset.look === "up" ? 35 : -35), view.zoom); });
  });

  function wire(b) {
    b.addEventListener("click", function (e) {
      if (suppressClick) { e.preventDefault(); return; }
      poke(); b.classList.add("glow"); setTimeout(function () { b.classList.remove("glow"); }, 900);
      activate(b);
    });
    b.addEventListener("focus", function () {
      // keyboard users: bring whatever is focused into view
      if (down) return;
      var it = b._item; turnTo(it.yaw, Math.max(-60, Math.min(60, it.pitch)), view.zoom);
    });
  }

  /* ---------- cards ---------- */
  var returnFocus = null;
  function activate(b) {
    var it = b._item; returnFocus = b;
    turnTo(it.yaw, it.pitch, 1.35, function () { it.kind === "strip" ? showStrip(it.strip, b) : showHotspot(it.h); });
    if (it.kind === "hotspot" && !foundSet.has(it.id)) { foundSet.add(it.id); saveFound(); b.classList.add("found"); updateFound(); }
  }
  function textNodes(parent, txt) {
    var tokens = { "{localtime}": new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) };
    txt = String(txt || "").replace(/\{localtime\}/g, tokens["{localtime}"]);
    txt.split(/\n\n+/).forEach(function (para) {
      var p = el("p");
      para.split("\n").forEach(function (line, i) {
        if (i) p.appendChild(el("br"));
        line.split(/(\[[^\]]+\])/).forEach(function (part) {
          if (!part) return;
          if (/^\[.*\]$/.test(part)) { var m = el("mark", "placeholder"); m.textContent = part; p.appendChild(m); }
          else p.appendChild(document.createTextNode(part));
        });
      });
      parent.appendChild(p);
    });
  }
  function linkEl(link) {
    if (!link) return null;
    if (!link.href) { var s = el("span", "linkish placeholder"); s.textContent = link.label || "[link]"; return s; }
    var a = el("a", "", { href: link.href }); a.textContent = (link.label || "Open") + " \u2192";
    if (/^https?:/i.test(link.href) || !standalone) { a.target = "_blank"; a.rel = "noopener"; } // never navigate a host page's frame
    return a;
  }
  function openCard(body, wide) {
    var card = $("#card"), cb = $(".card-body", card);
    cb.innerHTML = ""; cb.appendChild(body);
    card.classList.toggle("wide", !!wide); card.hidden = false;
    $(".card-close", card).focus({ preventScroll: true });
    $("#btn-secrets").hidden = true;
  }
  function showHotspot(h) {
    var c = h.card || {}, frag = document.createDocumentFragment();
    if (c.image) { var im = el("img", "card-img" + (h.type === "character" ? " portrait" : ""), { src: c.image, alt: c.alt || "" }); frag.appendChild(im); }
    var meta = el("p", "meta"); meta.textContent = ({ poem: "a hidden poem", "bryan-note": "a Bryan note", prank: "gremlin business", art: "the art collection", helper: "a small helpful thing", character: "the team" })[h.type] || ""; frag.appendChild(meta);
    var t = el("h2", "", { id: "card-title" }); t.textContent = c.title || h.label; frag.appendChild(t);
    textNodes(frag, c.text);
    if (c.widget === "breathe") {
      var w = el("div", "breathe"); w.appendChild(el("div", "orb", { "aria-hidden": "true" }));
      var sp = el("span"); sp.textContent = "in 4 \u00b7 hold 4 \u00b7 out 6"; w.appendChild(sp); frag.appendChild(w);
    }
    var l = linkEl(c.link); if (l) frag.appendChild(l);
    openCard(frag);
  }
  function showStrip(s, frameBtn) {
    var frag = document.createDocumentFragment();
    var meta = el("p", "meta"); meta.textContent = "Gremlin Diaries \u00b7 " + s.date; frag.appendChild(meta);
    var t = el("h2", "", { id: "card-title" }); t.textContent = stripName(s); frag.appendChild(t);
    if (s.upside_down && frameBtn.classList.contains("upside")) {
      textNodes(frag, s.prank_note || "Someone hung this one upside down.");
      var row = el("div", "btn-row"), fb = el("button"); fb.textContent = "Flip it right-side up";
      fb.addEventListener("click", function () { frameBtn.classList.remove("upside"); frameBtn.setAttribute("aria-label", "Comic strip: " + stripName(s)); fb.remove(); });
      row.appendChild(fb); frag.appendChild(row);
    }
    var sc = el("div", "strip-scroll"), im = el("img", "", { src: s.filename, alt: s.alt || s.title }); sc.appendChild(im); frag.appendChild(sc);
    frag.appendChild(linkEl({ href: "diaries.html", label: "Read all the strips" }));
    openCard(frag, true);
  }
  function closeCard() {
    var card = $("#card"); if (card.hidden) return;
    card.hidden = true; turnTo(view.yaw, view.pitch, 1);
    if (returnFocus) { try { returnFocus.focus({ preventScroll: true }); } catch (e) {} }
  }
  $("#card .card-close").addEventListener("click", closeCard);
  function trapFocus(e) {
    var box = !$("#card").hidden ? $("#card") : $("#explore");
    var f = box.querySelectorAll("button, a[href]"); if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    else if (!box.contains(document.activeElement)) { first.focus(); e.preventDefault(); }
  }

  /* ---------- explore list (tap-to-explore fallback) ---------- */
  function updateFound() {
    var total = activeHotspots().length, n = activeHotspots().filter(function (h) { return foundSet.has(h.id); }).length;
    $("#found").textContent = n + " / " + total + " found";
  }
  function openExplore() {
    var list = $(".explore-list", $("#explore")); list.innerHTML = "";
    var items = [];
    world.querySelectorAll("button.strip, button.hs").forEach(function (b) { items.push(b); });
    (data.areas || []).forEach(function (a) {
      var mine = items.filter(function (b) { return b._item.area === a.id; }); if (!mine.length) return;
      var h3 = el("h3"); h3.textContent = a.label; list.appendChild(h3);
      var ul = el("ul");
      var lookLi = el("li"), lookBtn = el("button"); lookBtn.textContent = "Look at " + a.label.replace(/^The /, "the ");
      lookBtn.addEventListener("click", function () { closeExplore(); turnTo(a.yaw, a.pitch, 1); vp.focus({ preventScroll: true }); });
      lookLi.appendChild(lookBtn); ul.appendChild(lookLi);
      mine.forEach(function (b) {
        var it = b._item, known = it.kind === "strip" || foundSet.has(it.id);
        var li = el("li"), btn = el("button", known ? "" : "unfound");
        btn.textContent = known ? it.label : "Something " + (a.id === "floor" ? "on the floor" : a.id === "ceiling" ? "up above" : "in " + a.label.replace(/^The /, "the ")) + "\u2026";
        btn.addEventListener("click", function () { closeExplore(); b.classList.add("glow"); setTimeout(function () { b.classList.remove("glow"); }, 1400); activate(b); });
        li.appendChild(btn); ul.appendChild(li);
      });
      list.appendChild(ul);
    });
    $("#explore").hidden = false; $("#explore .card-close").focus({ preventScroll: true });
  }
  function closeExplore() { if ($("#explore").hidden) return; $("#explore").hidden = true; $("#btn-explore").focus({ preventScroll: true }); }
  $("#btn-explore").addEventListener("click", openExplore);
  $("#explore .card-close").addEventListener("click", closeExplore);
  $("#btn-help").addEventListener("click", function () {
    var rug = (data.hotspots || []).filter(function (h) { return h.id === "welcome-rug"; })[0];
    var frag = document.createDocumentFragment(), t = el("h2", "", { id: "card-title" }); t.textContent = "How to explore"; frag.appendChild(t);
    textNodes(frag, (rug ? rug.card.text : "") + "\n\nKeyboard: Tab moves between clickable things, Enter opens them, Esc closes. Press D to show view coordinates (handy for placing new Easter eggs).");
    returnFocus = $("#btn-help"); openCard(frag);
  });
  $("#btn-secrets").addEventListener("click", function () {
    $("#btn-secrets").hidden = true; document.body.classList.add("reveal");
    setTimeout(function () { document.body.classList.remove("reveal"); idleShown = false; lastInput = Date.now(); }, 5000);
  });

  /* ---------- start ---------- */
  fetch("office-data.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    data = d; build(); resize(); render();
    var front = $(".face-front img.face-art");
    var done = function () { $("#loading").classList.add("done"); };
    if (front.complete && front.naturalWidth) done(); else { front.addEventListener("load", done); front.addEventListener("error", done); setTimeout(done, 3000); }
    window.addEventListener("resize", resize);
    requestAnimationFrame(loop);
    if (/[?&]debug/.test(location.search)) { debugOn = true; $("#debug").hidden = false; }
    window.GremlinOffice = { view: view, turnTo: turnTo, project: project, data: data, open: function (id) { var b = hotspotEls[id]; if (b) activate(b); } };
  }).catch(function (err) {
    $("#loading").innerHTML = "The office door is stuck. (Couldn't load office-data.json; open this page through a web server, not as a file.)";
  });
})();
