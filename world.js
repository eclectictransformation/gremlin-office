/* Gremlin World (sample): several CSS-3D cube rooms joined by doors and tunnels.
   Same camera/input approach as office.js; no libraries. Content lives in world-data.json
   (the hub also pulls its hotspots from office-data.json so the office stays in one place). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var vp = $("#viewport"), world = $("#world");
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var standalone = window.self === window.top;
  if (coarse) document.body.classList.add("coarse");
  if (standalone) document.body.classList.add("standalone");
  var params = new URLSearchParams(location.search);
  var forceSvg = params.get("art") === "svg";

  var D2R = Math.PI / 180, R2D = 180 / Math.PI, S = 1024, H = 512, P = 600;
  var view = { yaw: 0, pitch: 0, zoom: 1 }, vel = { yaw: 0, pitch: 0 };
  var STRIPS = [], pitchLimit = 80, W = null, OFFICE = null, anim = null, dirty = true, busy = false;
  var current = null, history = [], faceEls = {}, itemEls = {}, artMode = {};
  var keys = {}, debugOn = false;

  var FACES = {
    front:   { n: [0, 0, -1], r: [1, 0, 0],  d: [0, 1, 0],  tf: "rotateY(0deg)" },
    right:   { n: [1, 0, 0],  r: [0, 0, 1],  d: [0, 1, 0],  tf: "rotateY(-90deg)" },
    back:    { n: [0, 0, 1],  r: [-1, 0, 0], d: [0, 1, 0],  tf: "rotateY(-180deg)" },
    left:    { n: [-1, 0, 0], r: [0, 0, -1], d: [0, 1, 0],  tf: "rotateY(-270deg)" },
    floor:   { n: [0, 1, 0],  r: [1, 0, 0],  d: [0, 0, 1],  tf: "rotateX(90deg)" },
    ceiling: { n: [0, -1, 0], r: [1, 0, 0],  d: [0, 0, -1], tf: "rotateX(-90deg)" }
  };
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function dirOf(yaw, pitch) { var y = yaw * D2R, p = pitch * D2R; return [Math.cos(p) * Math.sin(y), -Math.sin(p), -Math.cos(p) * Math.cos(y)]; }
  function project(yaw, pitch) {
    var d = dirOf(yaw, pitch), best = null, bd = -2;
    for (var k in FACES) { var v = dot(d, FACES[k].n); if (v > bd) { bd = v; best = k; } }
    var f = FACES[best]; return { face: best, x: H + H * dot(d, f.r) / bd, y: H + H * dot(d, f.d) / bd };
  }
  // {face,x,y} -> yaw/pitch, so items can be placed by face pixel (easy to read off an image editor)
  function lookOf(at) {
    var f = FACES[at.face], u = (at.x - H) / H, v = (at.y - H) / H;
    var d = [0, 1, 2].map(function (i) { return f.n[i] + f.r[i] * u + f.d[i] * v; });
    var len = Math.hypot(d[0], d[1], d[2]);
    return { yaw: ((Math.atan2(d[0], -d[2]) * R2D) + 360) % 360, pitch: Math.asin(-d[1] / len) * R2D };
  }

  /* ---------- storage ---------- */
  function load(k, def) { try { var v = localStorage.getItem("gremlin-world-" + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem("gremlin-world-" + k, JSON.stringify(v)); } catch (e) {} }
  var socks = load("socks", []), visited = load("visited", []), found = load("found", []);

  function el(tag, cls, attrs) { var e = document.createElement(tag); if (cls) e.className = cls; if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  /* ---------- painted art: prefer assets/world/<room>/<face>.webp|png, fall back to the drawn SVG ---------- */
  function probe(src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(true); }; im.onerror = function () { res(false); }; im.src = src; }); }
  function detectArt(id) {
    if (forceSvg) return Promise.resolve(null);
    if (id in artMode) return Promise.resolve(artMode[id]);
    var base = "assets/world/" + id + "/front.";
    return probe(base + "webp").then(function (ok) { return ok ? "webp" : probe(base + "png").then(function (ok2) { return ok2 ? "png" : null; }); })
      .then(function (ext) { artMode[id] = ext; return ext; });
  }
  function faceSrcs(room, id, k) {
    var fallback = room.faces.replace("{face}", k), list = [];
    if (artMode[id]) { list.push("assets/world/" + id + "/" + k + "." + artMode[id]); list.push("assets/world/" + id + "/" + k + "." + (artMode[id] === "webp" ? "png" : "webp")); }
    list.push(fallback); return list;
  }

  /* ---------- build a room ---------- */
  function clearRoom() { world.innerHTML = ""; faceEls = {}; itemEls = {}; }
  function buildRoom(id) {
    var room = W.rooms[id], painted = !!artMode[id]; var hasSvg = /\.svg$/.test(room.faces);
    clearRoom();
    Object.keys(FACES).forEach(function (k) {
      var f = el("div", "face face-" + k);
      f.style.width = f.style.height = S + "px"; f.style.left = f.style.top = -H + "px";
      f.style.transform = FACES[k].tf + " translateZ(" + (-H) + "px)";
      var img = el("img", "face-art", { alt: "", draggable: "false", decoding: "async" });
      var srcs = faceSrcs(room, id, k), i = 0;
      img.onerror = function () { if (++i < srcs.length) img.src = srcs[i]; };
      img.dataset.src = srcs[0]; img.style.width = img.style.height = (S + 2) + "px";
      f.appendChild(img); faceEls[k] = f; world.appendChild(f);
    });
    if (room.importOffice && OFFICE) buildOfficeHotspots();
    (room.items || []).forEach(function (it) {
      if (it.type === "sock" && socks.indexOf(it.id) >= 0) return;
      var at = painted && it.atArt ? it.atArt : it.at, img = painted && it.artImg ? it.artImg : it.img;
      var size = (painted && it.artSize) || it.size || [80, 80];
      // a thing that only exists in the drawn placeholder (rooms whose only art is the painting skip this)
      if (painted && hasSvg && !it.atArt && !img && !it.artOnly && it.type !== "sock") return;
      if (!painted && it.artOnly) return;
      if (!at) return;
      var strip = null;
      if (it.type === "strip") { strip = STRIPS[it.strip || 0]; if (!strip) return; img = strip.thumb || strip.filename; }
      var b = el("button", "it " + it.type + (img ? " hasimg" : ""), { "aria-label": it.label || it.id, "data-id": it.id });
      place(b, at, size);
      if (it.rot) b.style.transform = "rotate(" + it.rot + "deg)";
      if (img) { var im = el("img", "prop", { alt: "", draggable: "false" }); im.dataset.src = img; b.appendChild(im); }
      if (it.type === "sock" && !(painted && it.artBare)) { var si = el("img", "", { alt: "", draggable: "false" }); si.dataset.src = "assets/world/props/sock-" + it.gremlin + ".svg"; b.appendChild(si); }
      if (it.type === "portal") { var tg = el("span", "tag"); tg.textContent = W.rooms[it.to].short + " \u2192"; b.appendChild(tg); }
      if (it.type === "egg" && found.indexOf(it.id) >= 0) b.classList.add("found");
      var lk = lookOf(at);
      b._item = { it: it, yaw: lk.yaw, pitch: lk.pitch, painted: painted, size: size, strip: strip };
      wire(b); itemEls[it.id] = b; faceEls[at.face].appendChild(b);
    });
  }
  function place(e, at, size) { e.style.left = (at.x - size[0] / 2) + "px"; e.style.top = (at.y - size[1] / 2) + "px"; e.style.width = size[0] + "px"; e.style.height = size[1] + "px"; }

  // The hub reuses the live office's Easter eggs + framed strips straight from office-data.json
  function buildOfficeHotspots() {
    (OFFICE.strips || []).forEach(function (s) {
      var slot = OFFICE.slots && OFFICE.slots[s.slot]; if (!slot || s.active === false) return;
      var pr = project(slot.yaw, slot.pitch);
      var b = el("button", "strip" + (s.upside_down ? " upside" : ""), { "aria-label": "Comic strip: " + s.title });
      b.style.left = (pr.x - slot.w / 2) + "px"; b.style.top = (pr.y - slot.h / 2) + "px"; b.style.width = slot.w + "px"; b.style.height = slot.h + "px";
      var mat = el("span", "mat"), im = el("img", "", { alt: s.alt || s.title, draggable: "false" }); im.dataset.src = s.thumb || s.filename; mat.appendChild(im); b.appendChild(mat);
      b._item = { office: true, yaw: slot.yaw, pitch: slot.pitch, card: { meta: "Gremlin Diaries \u00b7 " + s.date, title: (s.episode ? "Episode " + s.episode + ": " : "") + s.title, image: s.filename, alt: s.alt, link: { href: "diaries.html", label: "Read all the strips" } } };
      wire(b); faceEls[pr.face].appendChild(b);
    });
    (OFFICE.hotspots || []).forEach(function (h) {
      if (h.active === false || !h.position) return;
      var pr = project(h.position.yaw, h.position.pitch), sz = h.size || [80, 80];
      var b = el("button", "hs " + (h.style || "hidden"), { "aria-label": h.label || h.card.title, "data-id": h.id });
      b.style.left = (pr.x - sz[0] / 2) + "px"; b.style.top = (pr.y - sz[1] / 2) + "px"; b.style.width = sz[0] + "px"; b.style.height = sz[1] + "px";
      if (h.style === "framed" && h.card.image) { var im = el("img", "", { alt: h.card.alt || "", draggable: "false" }); im.dataset.src = h.card.image; b.appendChild(im); }
      if (h.style === "clock") buildClock(b);
      b._item = { office: true, yaw: h.position.yaw, pitch: h.position.pitch, card: h.card, type: h.type };
      wire(b); faceEls[pr.face].appendChild(b);
    });
  }
  function buildClock(b) {
    for (var i = 0; i < 12; i++) { var t = el("span", "tick"); t.style.transform = "rotate(" + i * 30 + "deg)"; t.style.transformOrigin = "50% 45px"; b.appendChild(t); }
    b.appendChild(el("span", "hand h")); b.appendChild(el("span", "hand m")); b.appendChild(el("span", "pin"));
    var d = new Date(); $(".h", b).style.transform = "rotate(" + ((d.getHours() % 12) * 30 + d.getMinutes() / 2) + "deg)"; $(".m", b).style.transform = "rotate(" + d.getMinutes() * 6 + "deg)";
  }

  /* ---------- lazy loading ---------- */
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

  /* ---------- camera ---------- */
  function resize() {
    var w = vp.clientWidth, h = vp.clientHeight;
    P = Math.min((h / 2) / Math.tan(32.5 * D2R), (w / 2) / Math.tan(27.5 * D2R));
    P = Math.max(P, (w / 2) / Math.tan(50 * D2R)); dirty = true;
  }
  function render() {
    view.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, view.pitch)); view.yaw = ((view.yaw % 360) + 360) % 360;
    var pz = P * view.zoom; vp.style.perspective = pz + "px";
    world.style.transform = "translateZ(" + pz + "px) rotateX(" + view.pitch + "deg) rotateY(" + view.yaw + "deg)";
    lazyLoad();
    if (debugOn) $("#debug").textContent = "yaw " + view.yaw.toFixed(1) + "  pitch " + view.pitch.toFixed(1) + (lastPointer ? "\ncursor " + lastPointer.face + " x " + Math.round(lastPointer.x) + " y " + Math.round(lastPointer.y) : "");
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
    if (!dragging && (Math.abs(vel.yaw) > 0.01 || Math.abs(vel.pitch) > 0.01)) { view.yaw += vel.yaw; view.pitch += vel.pitch; vel.yaw *= 0.92; vel.pitch *= 0.92; dirty = true; }
    if (dirty) { render(); dirty = false; }
    requestAnimationFrame(loop);
  }
  function turnTo(yaw, pitch, zoom, cb, dur) {
    var dy = ((yaw - view.yaw + 540) % 360) - 180;
    if (mqReduce.matches) { view.yaw += dy; view.pitch = pitch; view.zoom = zoom; dirty = true; anim = null; if (cb) cb(); return; }
    vel.yaw = vel.pitch = 0;
    anim = { t0: performance.now(), dur: dur || (550 + Math.abs(dy) * 3), y0: view.yaw, dy: dy, p0: view.pitch, dp: pitch - view.pitch, z0: view.zoom, dz: zoom - view.zoom, cb: cb };
  }

  /* ---------- input (drag / swipe / keys), same feel as the office ---------- */
  var dragging = false, down = null, suppressClick = false, lastPointer = null;
  function poke() { var hint = $("#hint"); if (hint && !hint._timer) hint._timer = setTimeout(function () { hint.classList.add("gone"); }, 7000); }
  function unproject(sx, sy) {
    var rect = vp.getBoundingClientRect(), pz = P * view.zoom, x = sx - rect.width / 2, y = sy - rect.height / 2, z = -pz;
    var b = -view.pitch * D2R, a = -view.yaw * D2R;
    var y1 = y * Math.cos(b) - z * Math.sin(b), z1 = y * Math.sin(b) + z * Math.cos(b);
    var x2 = x * Math.cos(a) + z1 * Math.sin(a), z2 = -x * Math.sin(a) + z1 * Math.cos(a), len = Math.sqrt(x2 * x2 + y1 * y1 + z2 * z2);
    return project(((Math.atan2(x2, -z2) * R2D) + 360) % 360, Math.asin(-y1 / len) * R2D);
  }
  vp.addEventListener("pointerdown", function (e) {
    if (e.button && e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, lx: e.clientX, ly: e.clientY, lt: performance.now() };
    dragging = false; vel.yaw = vel.pitch = 0; if (!busy) anim = null; poke(); hideBubble();
  });
  vp.addEventListener("pointermove", function (e) {
    if (debugOn) { var r = vp.getBoundingClientRect(); lastPointer = unproject(e.clientX - r.left, e.clientY - r.top); dirty = true; }
    if (!down || e.pointerId !== down.id || busy) return;
    if (e.pointerType === "mouse" && e.buttons === 0) { endDrag(); return; }  // missed the pointerup (it landed on a card or the HUD)
    var dx = e.clientX - down.lx, dy = e.clientY - down.ly;
    if (!dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { dragging = true; vp.classList.add("dragging"); try { vp.setPointerCapture(e.pointerId); } catch (err) {} }
    if (!dragging) return;
    var k = R2D / (P * view.zoom); view.yaw -= dx * k; view.pitch += dy * k;
    var now = performance.now(), dtm = Math.max(8, now - down.lt);
    if (!mqReduce.matches) { vel.yaw = -dx * k * 16 / dtm; vel.pitch = dy * k * 16 / dtm; }
    down.lx = e.clientX; down.ly = e.clientY; down.lt = now; dirty = true;
  });
  function endDrag() {
    if (dragging) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 0); }
    if (performance.now() - (down ? down.lt : 0) > 80) vel.yaw = vel.pitch = 0;
    dragging = false; down = null; vp.classList.remove("dragging");
  }
  window.addEventListener("pointerup", function (e) { if (down && e.pointerId === down.id) endDrag(); });
  vp.addEventListener("pointercancel", function () { dragging = false; down = null; vel.yaw = vel.pitch = 0; vp.classList.remove("dragging"); });
  vp.addEventListener("wheel", function (e) {
    if (!e.ctrlKey && !standalone && Math.abs(e.deltaY) > Math.abs(e.deltaX)) return;
    e.preventDefault(); view.zoom = Math.max(0.8, Math.min(2.2, view.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); dirty = true;
  }, { passive: false });
  vp.addEventListener("scroll", function () { vp.scrollTop = 0; vp.scrollLeft = 0; });
  window.addEventListener("keydown", function (e) {
    poke();
    var open = !$("#card").hidden || !$("#map").hidden || !$("#prize").hidden;
    if (e.key === "Escape") { closeCard(); closeMap(); closePrize(); hideBubble(); return; }
    if (open) return;
    if (/^Arrow/.test(e.key)) { keys[e.key] = true; anim = null; e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") { view.zoom = Math.min(2.2, view.zoom * 1.1); dirty = true; }
    else if (e.key === "-" || e.key === "_") { view.zoom = Math.max(0.8, view.zoom / 1.1); dirty = true; }
    else if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey) { debugOn = !debugOn; $("#debug").hidden = !debugOn; dirty = true; }
    else if (e.key === "Backspace" && history.length) { goBack(); }
  });
  window.addEventListener("keyup", function (e) { delete keys[e.key]; });
  window.addEventListener("blur", function () { keys = {}; });
  document.querySelectorAll("[data-look]").forEach(function (b) {
    b.addEventListener("click", function () { turnTo(view.yaw, view.pitch + (b.dataset.look === "up" ? 35 : -35), view.zoom); });
  });

  function wire(b) {
    b.addEventListener("click", function (e) {
      if (suppressClick || busy) { e.preventDefault(); return; }
      b.classList.add("glow"); setTimeout(function () { b.classList.remove("glow"); }, 900);
      activate(b);
    });
    b.addEventListener("focus", function () { if (down || busy) return; var it = b._item; turnTo(it.yaw, Math.max(-60, Math.min(60, it.pitch)), view.zoom); });
  }

  /* ---------- what happens when you click things ---------- */
  var returnFocus = null;
  function activate(b) {
    var x = b._item, it = x.it; returnFocus = b; hideBubble();
    if (x.office) { turnTo(x.yaw, x.pitch, 1.3, function () { showCard(x.card, x.type); }); return; }
    if (it.type === "portal") { travel(it.to, b); return; }
    if (it.type === "sock") { grabSock(b, it); return; }
    if (it.type === "strip") { var st = x.strip; turnTo(x.yaw, x.pitch, 1.3, function () { showCard({ image: st.thumb || st.filename, alt: st.alt, meta: "the archive" + (st.episode ? " \u00b7 episode " + st.episode : ""), title: st.title, text: st.alt, link: { href: "comics.html", label: "Read it in the comics archive" } }); }); return; }
    // eggs
    var first = found.indexOf(it.id) < 0;
    if (first) { found.push(it.id); save("found", found); b.classList.add("found"); }
    effect(b, it.effect, x);
    turnTo(x.yaw, x.pitch, it.effect === "wink" ? 1.6 : 1.3, function () {
      if (it.say) { var n = (b._n = ((b._n || 0) + 1)); var lines = it.say.lines; say(it.say.who, lines[(n - 1) % lines.length]); return; }
      var c = Object.assign({}, x.painted && it.artCard ? it.artCard : it.card);
      if (!first && it.repeat) c = Object.assign(c, { text: it.repeat });
      setTimeout(function () { showCard(c); }, it.effect === "wink" ? 1500 : 0);
    });
  }
  function effect(b, kind, x) {
    if (!kind || mqReduce.matches && kind !== "wink") return;
    if (kind === "wiggle" || kind === "knock") { b.classList.remove(kind); void b.offsetWidth; b.classList.add(kind); }
    if (kind === "puff") { for (var i = 0; i < 3; i++) (function (i) { setTimeout(function () { var p = el("span", "puff"); p.style.left = (55 + i * 12) + "%"; b.appendChild(p); setTimeout(function () { p.remove(); }, 2300); }, i * 350); })(i); }
    if (kind === "wink") {
      var eyePos = x.painted ? x.it.artEye : x.it.eye; if (!eyePos) return;
      var s = el("span", "sparkle"); s.textContent = "\u2726"; s.style.left = (eyePos.x + 6) + "px"; s.style.top = (eyePos.y - 46) + "px";
      setTimeout(function () { b.appendChild(s); setTimeout(function () { s.remove(); }, 1900); }, 1400);
      var e = b.querySelector(".eye"); if (!e) { e = el("span", "eye" + (x.painted ? " painted" : "")); b.appendChild(e); }
      e.style.left = eyePos.x + "px"; e.style.top = eyePos.y + "px";
      e.classList.remove("on"); void e.offsetWidth; setTimeout(function () { e.classList.add("on"); }, 500);
    }
  }
  function textNodes(parent, txt) {
    String(txt || "").split(/\n\n+/).forEach(function (para) {
      var p = el("p");
      para.split("\n").forEach(function (line, i) {
        if (i) p.appendChild(el("br"));
        line.replace(/\{localtime\}/g, new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })).split(/(\[[^\]]+\])/).forEach(function (part) {
          if (!part) return; if (/^\[.*\]$/.test(part)) { var m = el("mark", "placeholder"); m.textContent = part; p.appendChild(m); } else p.appendChild(document.createTextNode(part));
        });
      });
      parent.appendChild(p);
    });
  }
  function showCard(c, type) {
    c = c || {}; var frag = document.createDocumentFragment();
    if (c.image) frag.appendChild(el("img", "card-img" + (type === "character" ? " portrait" : ""), { src: c.image, alt: c.alt || "" }));
    var meta = el("p", "meta"); meta.textContent = c.meta || ({ poem: "a hidden poem", "bryan-note": "a Bryan note", prank: "gremlin business", art: "the art collection", helper: "a small helpful thing", character: "the team" })[type] || ""; frag.appendChild(meta);
    var t = el("h2", "", { id: "card-title" }); t.textContent = c.title || ""; frag.appendChild(t);
    textNodes(frag, c.text);
    if (c.widget === "breathe") { var w = el("div", "breathe"); w.appendChild(el("div", "orb")); var sp = el("span"); sp.textContent = "in 4 \u00b7 hold 4 \u00b7 out 6"; w.appendChild(sp); frag.appendChild(w); }
    if (c.link) {
      if (!c.link.href) { var s = el("span", "linkish placeholder"); s.textContent = c.link.label; frag.appendChild(s); }
      else { var a = el("a", "", { href: c.link.href }); a.textContent = (c.link.label || "Open") + " \u2192"; if (/^https?:/i.test(c.link.href)) { a.target = "_blank"; a.rel = "noopener"; } frag.appendChild(a); }
    }
    var card = $("#card"), cb = $(".card-body", card); cb.innerHTML = ""; cb.appendChild(frag);
    card.classList.toggle("wide", !!(c.image && type !== "character")); card.hidden = false; $(".card-close", card).focus({ preventScroll: true });
  }
  function closeCard() { var card = $("#card"); if (card.hidden) return; card.hidden = true; turnTo(view.yaw, view.pitch, 1); if (returnFocus && document.contains(returnFocus)) try { returnFocus.focus({ preventScroll: true }); } catch (e) {} }
  $("#card .card-close").addEventListener("click", closeCard);

  /* ---------- gremlin speech bubbles ---------- */
  var NAMES = { pip: "Pip", moth: "Moth", noodle: "Noodle", grimble: "Grimble", dot: "Dot", vesper: "Vesper" }, bubbleTimer = null;
  function say(who, text, ms) {
    var bub = $("#bubble"); $("img", bub).src = "assets/gremlins/" + who + ".webp";
    var p = $("p", bub); p.innerHTML = ""; var bn = el("b"); bn.textContent = NAMES[who] || who; p.appendChild(bn); p.appendChild(document.createTextNode(text));
    bub.hidden = false; bub.style.animation = "none"; void bub.offsetWidth; bub.style.animation = "";
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, ms || Math.max(5000, text.length * 70));
  }
  function hideBubble() { $("#bubble").hidden = true; clearTimeout(bubbleTimer); }
  $("#bubble").addEventListener("click", hideBubble);

  /* ---------- the sock hunt (no timer, progress saved on this device) ---------- */
  function updateSocks() { $("#sock-count").textContent = socks.length + " / " + W.socksTotal; $("#socks").setAttribute("aria-label", "Sock hunt: " + socks.length + " of " + W.socksTotal + " socks found"); }
  function grabSock(b, it) {
    if (socks.indexOf(it.id) >= 0) return;
    socks.push(it.id); save("socks", socks); updateSocks();
    b.classList.add("got"); var pill = $("#socks"); pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
    setTimeout(function () { b.remove(); }, 950);
    say(it.gremlin, it.say + " (" + socks.length + " of " + W.socksTotal + ")");
    if (socks.length >= W.socksTotal) setTimeout(openPrize, 2200);
  }
  function openPrize() {
    $("#prize-title").textContent = W.prize.title; $("#prize-text").textContent = W.prize.text; $("#prize-note").textContent = W.prize.note;
    hideBubble(); $("#prize").hidden = false; $("#prize-close").focus({ preventScroll: true });
  }
  function closePrize() { $("#prize").hidden = true; }
  $("#prize-close").addEventListener("click", closePrize);
  $("#prize-reset").addEventListener("click", function () { socks = []; save("socks", socks); updateSocks(); closePrize(); buildRoom(current); render(); say("grimble", "Socks re-hidden. Same spots, mind you. We're not very creative at hiding."); });
  $("#socks").addEventListener("click", function () {
    if (socks.length >= W.socksTotal) { openPrize(); return; }
    say("grimble", socks.length ? "You've found " + socks.length + " of " + W.socksTotal + " socks. The rest are somewhere in these rooms. Look low, look up." : "Five socks went missing in the wash. They're hiding somewhere in these rooms. No rush.");
  });

  /* ---------- travelling between rooms ---------- */
  function setRoomUI() {
    var room = W.rooms[current];
    $("#room-name").textContent = room.name; document.title = room.name + " \u00b7 Gremlin World";
    document.body.className = document.body.className.replace(/\bmood-\S+/g, "").trim();
    if (room.mood) document.body.classList.add("mood-" + room.mood);
    $("#btn-back").hidden = !history.length;
    if (history.length) $("#btn-back").setAttribute("aria-label", "Go back to " + W.rooms[history[history.length - 1]].name);
    if (visited.indexOf(current) < 0) { visited.push(current); save("visited", visited); }
  }
  function enter(id, opts) {
    opts = opts || {};
    return detectArt(id).then(function () {
      current = id; buildRoom(id);
      var sv = W.rooms[id].startView || { yaw: 0, pitch: 0 };
      view.yaw = sv.yaw; view.pitch = sv.pitch; view.zoom = opts.zoomFrom || 1; vel.yaw = vel.pitch = 0;
      setRoomUI(); resize(); render();
      try { window.history.replaceState(null, "", "#" + id); } catch (e) {}
      var g = W.rooms[id].greet, seen = load("greeted", []);
      if (g && seen.indexOf(id) < 0) { seen.push(id); save("greeted", seen); setTimeout(function () { say(g.who, g.text, 8000); }, opts.zoomFrom ? 900 : 1200); }
    });
  }
  function travel(to, fromBtn, isBack) {
    if (busy || to === current) return;
    busy = true; hideBubble(); closeCard(); closeMap();
    var warp = $("#warp"), from = current;
    var go = function () {
      warp.classList.add("on"); if (!mqReduce.matches) warp.classList.add("squish");
      setTimeout(function () {
        if (!isBack) history.push(from);
        enter(to, { zoomFrom: mqReduce.matches ? 1 : 1.9 }).then(function () {
          setTimeout(function () {
            warp.classList.remove("on", "squish"); busy = false;
            turnTo(view.yaw, view.pitch, 1, null, 700); vp.focus({ preventScroll: true });
          }, 250);
        });
      }, mqReduce.matches ? 150 : 650);
    };
    if (fromBtn && !mqReduce.matches) { var x = fromBtn._item; turnTo(x.yaw, Math.max(-50, Math.min(50, x.pitch)), 2.2, go, 650); }
    else go();
  }
  function goBack() { if (!history.length) return; var to = history.pop(); travel(to, null, true); }
  $("#btn-back").addEventListener("click", goBack);

  /* ---------- map ---------- */
  function openMap() {
    var svg = $("#map-svg"), list = $("#map-list"), NS = "http://www.w3.org/2000/svg"; svg.innerHTML = ""; list.innerHTML = "";
    W.links.forEach(function (l) { var a = W.map[l[0]], b = W.map[l[1]], p = document.createElementNS(NS, "path"); p.setAttribute("class", "link"); p.setAttribute("d", "M" + a[0] + " " + a[1] + " Q" + ((a[0] + b[0]) / 2 + 8) + " " + ((a[1] + b[1]) / 2 + 10) + " " + b[0] + " " + b[1]); svg.appendChild(p); });
    Object.keys(W.rooms).forEach(function (id) {
      var r = W.rooms[id], pos = W.map[id], known = visited.indexOf(id) >= 0;
      var g = document.createElementNS(NS, "g"); g.setAttribute("class", "node" + (id === current ? " here" : "") + (known ? "" : " unknown"));
      var rc = document.createElementNS(NS, "rect"); rc.setAttribute("x", pos[0] - 32); rc.setAttribute("y", pos[1] - 11); rc.setAttribute("width", 64); rc.setAttribute("height", 22); rc.setAttribute("rx", 8); g.appendChild(rc);
      var tx = document.createElementNS(NS, "text"); tx.setAttribute("x", pos[0]); tx.setAttribute("y", pos[1] + 3); tx.textContent = known ? r.short : "???"; g.appendChild(tx); svg.appendChild(g);
      var li = el("li"), bt = el("button");
      if (id === current) { bt.textContent = r.name + " (you are here)"; bt.className = "here"; bt.disabled = true; }
      else if (known) { bt.textContent = "Go to " + r.name; bt.addEventListener("click", function () { travel(id, null); }); }
      else { bt.textContent = "An undiscovered room\u2026"; bt.disabled = true; }
      li.appendChild(bt); list.appendChild(li);
    });
    var hidden = el("li"), hb = el("button"); hb.disabled = true; hb.textContent = "More rooms are being dug\u2026"; hidden.appendChild(hb); list.appendChild(hidden);
    $("#map").hidden = false; $("#map .card-close").focus({ preventScroll: true });
  }
  function closeMap() { if ($("#map").hidden) return; $("#map").hidden = true; }
  $("#btn-map").addEventListener("click", openMap);
  $("#map .card-close").addEventListener("click", closeMap);
  $("#btn-help").addEventListener("click", function () {
    returnFocus = $("#btn-help");
    showCard({ meta: "a small helpful thing", title: "How to explore", text: "Drag (or swipe) to look around. Arrow keys work too, and + / - zoom.\n\nDoors, hatches and tunnels take you to other rooms; the Map jumps back to rooms you've visited, and Back returns you the way you came.\n\nFive gremlin socks are hiding somewhere. No timer, no rush. Your progress stays on this device.\n\nKeyboard: Tab moves between clickable things, Enter opens them, Esc closes." });
  });
  window.addEventListener("hashchange", function () { var id = location.hash.slice(1); if (W.rooms[id] && id !== current && !busy) travel(id, null); });

  /* ---------- start ---------- */
  Promise.all([
    fetch("world-data.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("office-data.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch("strips.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (res) {
    W = res[0]; OFFICE = res[1]; updateSocks();
    // comic strips, newest first, for the archive's empty frames
    STRIPS = ((res[2] && res[2].strips) || []).filter(function (x) { return x.active !== false; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var startId = W.rooms[location.hash.slice(1)] ? location.hash.slice(1) : W.start;
    return enter(startId);
  }).then(function () {
    var done = function () { $("#loading").classList.add("done"); };
    var front = $(".face-front img.face-art");
    if (front && front.complete && front.naturalWidth) done(); else if (front) { front.addEventListener("load", done); setTimeout(done, 2500); } else done();
    window.addEventListener("resize", resize);
    requestAnimationFrame(loop);
    if (/[?&]debug/.test(location.search)) { debugOn = true; $("#debug").hidden = false; }
    window.GremlinWorld = { view: view, turnTo: turnTo, travel: travel, lookOf: lookOf, get room() { return current; }, get busy() { return busy; }, data: W,
      look: function (id) { var b = itemEls[id]; if (b) turnTo(b._item.yaw, b._item.pitch, 1); }, click: function (id) { var b = itemEls[id]; if (b) activate(b); } };
  }).catch(function (err) {
    console.error(err);
    $("#loading").textContent = "The tunnel is stuck. (Couldn't load world-data.json; open this page through a web server, not as a file.)";
  });
})();
