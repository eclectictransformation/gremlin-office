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
  // Inside an iframe: ?embed means the host page already has a title bar + "new window" link (diaries.html pop-up),
  // so we drop the duplicate bits. Without ?embed we offer our own small "open in a new window" button.
  var embedHost = !standalone && params.has("embed");
  if (!standalone) document.body.classList.add("framed");
  if (embedHost) document.body.classList.add("embed");
  if (!standalone && !embedHost) (function () {
    var a = $("#btn-popout"); if (!a) return;
    var q = new URLSearchParams(location.search); q.delete("embed"); q.delete("noprompt");
    a.href = "world.html" + (q.toString() ? "?" + q : "") + location.hash; a.hidden = false;
  })();
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
  // world-player.js (Gremlin Names, the quest journal, badges, sync) listens in here; the world never needs it
  function notify(kind, data) { var P = window.GremlinPlayer; if (P && P.onEvent) try { P.onEvent(kind, data); } catch (e) { console.error(e); } }
  function playerOpen() { var P = window.GremlinPlayer; return !!(P && P.isOpen && P.isOpen()); }
  // re-read progress after a sync merged in finds from another device
  function reloadProgress() {
    socks = load("socks", []); visited = load("visited", []); found = load("found", []);
    if (!W) return; updateSocks(); if (current && !busy) { buildRoom(current); render(); }
  }
  // secrets you can actually find in each room with the art that's showing (painted art hides a few drawn-only ones)
  function secretList() {
    var out = [];
    Object.keys(W.rooms).forEach(function (rid) {
      var r = W.rooms[rid], painted = rid in artMode ? !!artMode[rid] : (!!r.painted && !forceSvg), hasSvg = /\.svg$/.test(r.faces);
      (r.items || []).forEach(function (it) {
        if (it.type !== "egg") return;
        if (painted ? (hasSvg && !it.atArt && !it.img && !it.artOnly) : it.artOnly) return;
        if (!(painted && it.atArt ? it.atArt : it.at)) return;
        out.push({ id: it.id, room: rid, label: (it.card && it.card.title) || it.label || it.id });
      });
    });
    return out;
  }

  // The Shifting House (shifting.js) listens in here; with no GremlinShift loaded the world behaves exactly as before
  function SH() { return window.GremlinShift || null; }
  function hook(name) { var h = SH(); if (!h || typeof h[name] !== "function") return undefined; try { return h[name].apply(h, Array.prototype.slice.call(arguments, 1)); } catch (e) { console.error(e); } }
  function el(tag, cls, attrs) { var e = document.createElement(tag); if (cls) e.className = cls; if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

  /* ---------- painted art: prefer assets/world/<room>/<face>.webp|png, fall back to the drawn SVG ---------- */
  function probe(src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(true); }; im.onerror = function () { res(false); }; im.src = src; }); }
  function detectArt(id) {
    if (forceSvg) return Promise.resolve(null);
    if (W && W.rooms[id] && !W.rooms[id].painted) { artMode[id] = null; return Promise.resolve(null); }   // drawn-only room: don't probe (avoids 404 noise in the console)
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
  var decorTimers = [];
  function clearRoom() { world.innerHTML = ""; faceEls = {}; itemEls = {}; decorTimers.forEach(clearInterval); decorTimers = []; }
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
      if (it.type === "decor") { buildDecor(it, at, size); return; }
      var strip = null;
      if (it.type === "strip") { strip = STRIPS[it.strip || 0]; if (!strip) return; img = strip.thumb || strip.filename; }
      if (hook("skipItem", it, id)) return;
      var b = el("button", "it " + it.type + (img ? " hasimg" : "") + (it.cls ? " " + it.cls : ""), { "aria-label": it.label || it.id, "data-id": it.id });
      place(b, at, size);
      if (it.rot) b.style.transform = "rotate(" + it.rot + "deg)";
      if (img) { var im = el("img", "prop", { alt: (it.type === "frame" && it.card && it.card.alt) || "", draggable: "false" }); im.dataset.src = img; b.appendChild(im); }
      if (it.type === "sock" && !(painted && it.artBare)) { var si = el("img", "", { alt: "", draggable: "false" }); si.dataset.src = "assets/world/props/sock-" + it.gremlin + ".svg"; b.appendChild(si); }
      if (it.type === "portal") { var tg = el("span", "tag"); tg.textContent = W.rooms[it.to].short + " \u2192"; b.appendChild(tg); }
      if (it.type === "egg" && found.indexOf(it.id) >= 0) b.classList.add("found");
      if (it.type === "arcade") decorateCabinet(b, it);
      if (it.hover) { var hv = el("span", "hov"); hv.textContent = it.hover; b.appendChild(hv); }
      if (it.showIf) { b.dataset.showIf = it.showIf; if (!condMet(it.showIf)) b.classList.add("is-hidden"); }
      if (it.type === "scoreboard") { var ch = el("span", "chalk"); var h = el("b"); h.textContent = it.title || "SCORES"; ch.appendChild(h); ch.appendChild(el("span", "chalk-rows")); b.appendChild(ch); }
      var lk = lookOf(at);
      b._item = { it: it, yaw: lk.yaw, pitch: lk.pitch, painted: painted, size: size, strip: strip };
      hook("decorate", b, it, id);
      wire(b); itemEls[it.id] = b; faceEls[at.face].appendChild(b);
    });
    notify("room-built", { room: id, painted: painted });
    hook("roomBuilt", id, world);
  }
  // non-interactive overlays: painted-blank labels, signs, glows and the little animations (text or an image)
  function buildDecor(it, at, size) {
    var d = el("div", "decor" + (it.cls ? " " + it.cls : ""), { "aria-hidden": it.alt ? "false" : "true" });
    place(d, at, size);
    var tf = []; if (it.rot) tf.push("rotate(" + it.rot + "deg)"); if (it.skew) tf.push("skewY(" + it.skew + "deg)"); if (tf.length) d.style.transform = tf.join(" ");
    if (it.fs) d.style.fontSize = it.fs + "px"; if (it.color) d.style.color = it.color; if (it.font) d.classList.add("f-" + it.font);
    if (it.img) { var im = el("img", "", { alt: it.alt || "", draggable: "false" }); im.dataset.src = it.img; d.appendChild(im); }
    if (it.text) it.text.split("\n").forEach(function (ln, i) { if (i) d.appendChild(el("br")); d.appendChild(document.createTextNode(ln)); });
    if (it.alt) { d.setAttribute("role", "img"); d.setAttribute("aria-label", it.alt); }
    if (it.cycle) {   // words that print themselves one at a time (reduced motion: all of them, still)
      if (mqReduce.matches) { d.textContent = it.cycle.join(" / "); }
      else { var n = 0, w = el("span", "cyc"); w.textContent = it.cycle[0]; d.appendChild(w);
        decorTimers.push(setInterval(function () { if (document.documentElement.classList.contains("gw-still")) return; n = (n + 1) % it.cycle.length; w.classList.remove("in"); void w.offsetWidth; w.textContent = it.cycle[n]; w.classList.add("in"); }, it.every || 3200)); }
    }
    if (it.typewriter) {
      var full = it.typewriter;
      if (mqReduce.matches) d.textContent = full;
      else { var k = 0, tw = el("span", "tw"); d.appendChild(tw);
        decorTimers.push(setInterval(function () { if (document.documentElement.classList.contains("gw-still")) return; k = k > full.length + 14 ? 0 : k + 1; tw.textContent = full.slice(0, Math.min(k, full.length)); }, it.every || 260)); }
    }
    if (it.showIf) { d.dataset.showIf = it.showIf; if (!condMet(it.showIf)) d.classList.add("is-hidden"); }
    faceEls[at.face].appendChild(d);
  }
  // showIf: "<egg id>" (found) or "set:<name>" (every piece of a set tapped)
  function condMet(c) { if (/^set:/.test(c)) return setDone(c.slice(4)); return found.indexOf(c) >= 0; }
  function refreshShowIf() { world.querySelectorAll("[data-show-if]").forEach(function (e) { e.classList.toggle("is-hidden", !condMet(e.dataset.showIf)); }); }
  function setDef(name) { return (W.sets && W.sets[name]) || null; }
  function setDone(name) { var d = setDef(name), got = load("sets", {})[name] || []; return !!d && got.length >= d.total; }
  // playable cabinets get their name lit up on the painted marquee and a sleepy "press start" on the screen
  function decorateCabinet(b, it) {
    var box = function (e, bx) { e.style.left = bx[0] + "px"; e.style.top = bx[1] + "px"; e.style.width = bx[2] + "px"; e.style.height = bx[3] + "px"; };
    if (it.marquee) { var m = el("span", "marq"); m.textContent = it.marquee.text; box(m, it.marquee.box); b.appendChild(m); }
    if (it.screen) { var sc = el("span", "scrtxt"), bt = el("b"), sm = el("small"); bt.textContent = it.screen.text; sm.textContent = it.screen.sub || ""; sc.appendChild(bt); sc.appendChild(sm); box(sc, it.screen.box); b.appendChild(sc); }
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
      if ((W.rooms[current] && W.rooms[current].officeSkip || []).indexOf(h.id) >= 0) return;   // replaced by a world item (the GREMLINS ONLY door -> the Gremlin Wing)
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
  function poke() { var hint = $("#hint"); if (hint && !hint._timer) hint._timer = setTimeout(function () { hint.classList.add("gone"); try { localStorage.setItem("gremlin-world-hint-seen", "1"); } catch (e) {} }, 7000); }
  // round 4: the hint bar now lives in welcome guide card 1; it only shows on the no-guide ?noprompt path
  try { if (new URLSearchParams(location.search).has("noprompt")) document.body.classList.add("noprompt"); } catch (e) {}
  try { if (localStorage.getItem("gremlin-world-hint-seen")) $("#hint").classList.add("gone"); } catch (e) {}   // the hint line shows once per device, then fades
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
    if (arcadeOpen()) return;   // the cabinet has the keyboard while it's open
    if (roomGameOpen()) return;   // so does a room mini-game (it closes itself on Esc)
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;   // typing a Gremlin Name or Key
    if (playerOpen()) return;   // the sign-in card / journal / guestbook handle their own keys
    poke();
    var open = !$("#card").hidden || !$("#map").hidden || !$("#prize").hidden;
    if (e.key === "Escape") {
      // nothing left to close: tell a host pop-up (diaries.html) so Esc closes the whole thing
      if (!open && !standalone) { try { window.parent.postMessage({ type: "gremlin-office-escape" }, "*"); } catch (err) {} }
      closeCard(); closeMap(); closePrize(); hideBubble(); return;
    }
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
    if (it && hook("intercept", it, b, x)) return;
    if (x.office) { turnTo(x.yaw, x.pitch, 1.3, function () { showCard(x.card, x.type); }); return; }
    if (it.type === "portal") { var dest = hook("portalTarget", it) || it.to; if (hook("isResting", dest)) { hook("restingDoor", dest, b, x); return; } if (hook("isLocked", dest)) { hook("lockedDoor", dest, b, x); return; } travel(dest, b); return; }
    if (it.type === "sock") { grabSock(b, it); return; }
    if (it.type === "arcade") { turnTo(x.yaw, x.pitch, 1.35, function () { openArcade(it.machine, b, it.game); }); return; }
    if (it.type === "scoreboard") { turnTo(x.yaw, x.pitch, 1.3, function () { openArcade(it.machine, b); if (window.GremlinArcade && GremlinArcade.isOpen()) GremlinArcade.showBoards(); }); return; }
    if (it.type === "guestbook") { turnTo(x.yaw, x.pitch, 1.4, function () { if (window.GremlinPlayer) GremlinPlayer.openGuestbook(b); else showCard({ meta: "the archive", title: "The Gremlin Guestbook", text: "The ink is still drying. Try again in a moment." }); }); return; }
    if (it.type === "strip") { var st = x.strip; turnTo(x.yaw, x.pitch, 1.3, function () { showCard({ image: st.thumb || st.filename, alt: st.alt, meta: "the archive" + (st.episode ? " \u00b7 episode " + st.episode : ""), title: st.title, text: st.alt, link: { href: "comics.html", label: "Read it in the comics archive" } }); }); return; }
    if (it.type === "frame") { turnTo(x.yaw, x.pitch, 1.3, function () { showCard(it.card, "frame"); }); return; }
    if (it.type === "game") { turnTo(x.yaw, x.pitch, 1.3, function () { openRoomGame(it, b); }); return; }
    if (it.type === "setpiece") { tapSetPiece(b, it, x); return; }
    // eggs
    var first = found.indexOf(it.id) < 0;
    if (it.steps && first) {   // a few gentle taps before it gives up its secret
      var sn = (b._steps = (b._steps || 0) + 1);
      if (sn <= it.steps.lines.length) { effect(b, it.effect, x); turnTo(x.yaw, x.pitch, 1.3, function () { say(it.steps.who, it.steps.lines[sn - 1]); }); return; }
    }
    if (first) { found.push(it.id); save("found", found); b.classList.add("found"); notify("egg", { id: it.id, room: current }); refreshShowIf(); }
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
      var ei = x.painted && x.it.artEyeImg;
      if (ei) {   // the painted eye itself pops back into the empty socket (and stays for this visit)
        var sp = el("span", "sparkle"); sp.textContent = "\u2726"; sp.style.left = (eyePos.x + 6) + "px"; sp.style.top = (eyePos.y - 46) + "px";
        setTimeout(function () { b.appendChild(sp); setTimeout(function () { sp.remove(); }, 1900); }, 1400);
        var im = b.querySelector("img.eye-img"); if (!im) { im = el("img", "eye-img", { alt: "", draggable: "false", src: ei.src }); b.appendChild(im); }
        im.style.left = ei.x + "px"; im.style.top = ei.y + "px"; im.style.width = ei.w + "px"; im.style.height = ei.h + "px";
        im.classList.remove("on"); void im.offsetWidth; setTimeout(function () { im.classList.add("on"); }, 500);
        return;
      }
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
    var img = c.image ? el("img", "card-img" + (type === "character" ? " portrait" : ""), { src: c.image, alt: c.alt || "" }) : null;
    var meta = el("p", "meta"); meta.textContent = c.meta || ({ poem: "a hidden poem", "bryan-note": "a Bryan note", prank: "gremlin business", art: "the art collection", helper: "a small helpful thing", character: "the team" })[type] || "";
    var t = el("h2", "", { id: "card-title" }); t.textContent = c.title || "";
    if (type === "frame") { frag.appendChild(t); if (img) frag.appendChild(img); }
    else { if (img) frag.appendChild(img); frag.appendChild(meta); frag.appendChild(t); }
    textNodes(frag, c.text);
    hook("cardExtra", c, frag);   // e.g. the Gremlish hint line, or the help card's "Why a Gremlin Key?"
    if (c.widget === "breathe") { var w = el("div", "breathe"); w.appendChild(el("div", "orb")); var sp = el("span"); sp.textContent = "in 4 \u00b7 hold 4 \u00b7 out 6"; w.appendChild(sp); frag.appendChild(w); }
    if (c.link) {
      if (!c.link.href) { var s = el("span", "linkish placeholder"); s.textContent = c.link.label; frag.appendChild(s); }
      else { var a = el("a", "", { href: c.link.href }); a.textContent = (c.link.label || "Open") + " \u2192"; if (/^https?:/i.test(c.link.href)) { a.target = "_blank"; a.rel = "noopener"; } frag.appendChild(a); }
    }
    var card = $("#card"), cb = $(".card-body", card); cb.innerHTML = ""; cb.appendChild(frag);
    card.classList.toggle("wide", !!(c.image && type !== "character")); card.classList.toggle("frame-page", type === "frame"); card.hidden = false; $(".card-close", card).focus({ preventScroll: true });
  }
  function closeCard() { var card = $("#card"); if (card.hidden) return; card.hidden = true; turnTo(view.yaw, view.pitch, 1); if (returnFocus && document.contains(returnFocus)) try { returnFocus.focus({ preventScroll: true }); } catch (e) {} }
  $("#card .card-close").addEventListener("click", closeCard);

  /* ---------- playable arcade cabinets (games/arcade.js + games/<machine>.js, menus in world-data.json "arcade") ---------- */
  function arcadeOpen() { return !!(window.GremlinArcade && window.GremlinArcade.isOpen()); }
  function openArcade(id, btn, game) {
    var m = W.arcade && W.arcade.machines && W.arcade.machines[id];
    if (!m || !window.GremlinArcade) return;
    hideBubble(); keys = {}; vel.yaw = vel.pitch = 0; anim = null; dragging = false; down = null; vp.classList.remove("dragging");   // the world holds still while you play
    window.GremlinArcade.open(m, { game: game, machines: W.arcade.machines, calm: !!(SH() && SH().calm), onClose: function () {
      turnTo(view.yaw, view.pitch, 1);
      var f = btn || returnFocus; if (f && document.contains(f)) try { f.focus({ preventScroll: true }); } catch (e) {}
    } });
  }

  /* ---------- gentle room mini-games (games/room-games.js, loaded on first use; no timers, no fail state) ---------- */
  var gamesLoading = null;
  function roomGameOpen() { return !!(window.GremlinRoomGames && window.GremlinRoomGames.isOpen()); }
  function loadRoomGames() {
    if (window.GremlinRoomGames) return Promise.resolve();
    if (gamesLoading) return gamesLoading;
    gamesLoading = new Promise(function (res, rej) {
      var l = el("link", "", { rel: "stylesheet", href: "games/room-games.css" }); document.head.appendChild(l);
      var sc = el("script", "", { src: "games/room-games.js" }); sc.onload = function () { res(); }; sc.onerror = function () { gamesLoading = null; rej(new Error("room-games.js")); }; document.head.appendChild(sc);
    });
    return gamesLoading;
  }
  function openRoomGame(it, btn) {
    hideBubble(); keys = {}; vel.yaw = vel.pitch = 0; anim = null; dragging = false; down = null; vp.classList.remove("dragging");
    loadRoomGames().then(function () {
      window.GremlinRoomGames.open(it.game, Object.assign({ title: it.label }, it.opts || {}), { say: say, onClose: function (done) {
        turnTo(view.yaw, view.pitch, 1);
        if (done && it.doneSay) setTimeout(function () { say(it.doneSay.who, it.doneSay.text); }, 400);
        var f = btn || returnFocus; if (f && document.contains(f)) try { f.focus({ preventScroll: true }); } catch (e) {}
      } });
      notify("room-game", { id: it.game, room: current });
    }).catch(function (e) { console.error(e); showCard({ meta: "a small helpful thing", title: it.label || "A little game", text: "The game's still being glued together. Try again in a moment." }); });
  }
  // set pieces (e.g. Vesper's frogs): tap them all, something new appears. Progress lives on this device.
  function tapSetPiece(b, it, x) {
    var d = setDef(it.set); if (!d) return;
    var all = load("sets", {}), got = all[it.set] || [], first = got.indexOf(it.id) < 0;
    if (first) { got.push(it.id); all[it.set] = got; save("sets", all); b.classList.add("found"); }
    effect(b, it.effect || "wiggle", x);
    if (got.length >= d.total && first) refreshShowIf();   // reveal the reward now, even if the turn below gets interrupted
    turnTo(x.yaw, x.pitch, 1.25, function () {
      var n = got.length;
      if (n >= d.total && first) say(d.who, d.doneSay);
      else say(d.who, (first ? (it.line || d.line) : d.again).replace("{n}", n).replace("{total}", d.total));
    });
  }

  /* ---------- gremlin speech bubbles ---------- */
  var NAMES = { pip: "Pip", moth: "Moth", noodle: "Noodle", grimble: "Grimble", dot: "Dot", vesper: "Vesper" }, bubbleTimer = null;
  function say(who, text, ms) {
    if (arcadeOpen()) return;   // gremlins keep quiet while you're playing
    var bub = $("#bubble"); $("img", bub).src = "assets/gremlins/" + who + ".webp";
    var p = $("p", bub); p.innerHTML = ""; var bn = el("b"); bn.textContent = NAMES[who] || who; p.appendChild(bn); p.appendChild(document.createTextNode(text));
    bub.hidden = false; bub.style.animation = "none"; void bub.offsetWidth; bub.style.animation = "";
    bubbleMs = Math.max(8000, ms || 0, text.length * 85); clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, bubbleMs);
  }
  function hideBubble() { $("#bubble").hidden = true; clearTimeout(bubbleTimer); }
  $("#bubble").addEventListener("click", hideBubble);   // tap to dismiss
  var bubbleMs = 8000;   // hovering pauses the bubble; leaving gives it its full time again
  $("#bubble").addEventListener("mouseenter", function () { clearTimeout(bubbleTimer); });
  $("#bubble").addEventListener("mouseleave", function () { if (!$("#bubble").hidden) { clearTimeout(bubbleTimer); bubbleTimer = setTimeout(hideBubble, bubbleMs); } });

  /* ---------- the sock hunt (no timer, progress saved on this device) ---------- */
  function updateSocks() { $("#sock-count").textContent = socks.length + " / " + W.socksTotal; $("#socks").setAttribute("aria-label", "Sock hunt: " + socks.length + " of " + W.socksTotal + " socks found"); }
  function grabSock(b, it) {
    if (socks.indexOf(it.id) >= 0) return;
    socks.push(it.id); save("socks", socks); updateSocks();
    // sock-hunt timer for the quest journal: first sock -> fifth sock (the hunt itself has no countdown)
    var ss = load("sock", {}), now = Date.now();
    if (socks.length === 1 || !ss.start) ss.start = now;
    if (socks.length >= W.socksTotal) { ss.last = Math.max(1000, now - ss.start); ss.best = ss.best ? Math.min(ss.best, ss.last) : ss.last; ss.done = (ss.done || 0) + 1; }
    save("sock", ss);
    notify("sock", { id: it.id, count: socks.length, total: W.socksTotal, hunt: ss });
    b.classList.add("got"); var pill = $("#socks"); pill.classList.remove("bump"); void pill.offsetWidth; pill.classList.add("bump");
    setTimeout(function () { b.remove(); }, 950);
    if (SH() && SH().calm) { say(it.gremlin, it.say); if (socks.length >= W.socksTotal) setTimeout(function () { hook("socksDone"); }, 2600); return; }   // calm mode: no counter, no prize pop-up
    say(it.gremlin, it.say + " (" + socks.length + " of " + W.socksTotal + ")");
    if (socks.length >= W.socksTotal) setTimeout(openPrize, 2200);
  }
  function openPrize() {
    $("#prize-title").textContent = W.prize.title; $("#prize-text").textContent = W.prize.text; $("#prize-note").textContent = W.prize.note;
    hideBubble(); $("#prize").hidden = false; $("#prize-close").focus({ preventScroll: true });
  }
  function closePrize() { $("#prize").hidden = true; }
  $("#prize-close").addEventListener("click", closePrize);
  $("#prize-reset").addEventListener("click", function () { socks = []; save("socks", socks); save("socksReset", load("socksReset", 0) + 1); var ss = load("sock", {}); delete ss.start; save("sock", ss); updateSocks(); notify("socks-reset"); closePrize(); buildRoom(current); render(); say("grimble", "Socks re-hidden. Same spots, mind you. We're not very creative at hiding."); });
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
    if (visited.indexOf(current) < 0) { visited.push(current); save("visited", visited); notify("room", { id: current, count: visited.length }); }
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
      if (g && seen.indexOf(id) < 0) { seen.push(id); save("greeted", seen); notify("greeted", { id: id }); setTimeout(function () { if (!playerOpen()) say(g.who, g.text, 8000); }, opts.zoomFrom ? 900 : 1200); }
    });
  }
  function travel(to, fromBtn, isBack, force) {
    if (busy || to === current) return;
    if (!force && hook("isResting", to)) { hook("napping", to); return; }
    if (hook("isLocked", to)) { hook("lockedDoor", to); return; }   // a Gremlin-Key room: a friendly "not yet" (soft lock, lore not security)
    if (arcadeOpen()) window.GremlinArcade.close(true);
    if (roomGameOpen()) window.GremlinRoomGames.close(true);
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
    if (W.mapView) svg.setAttribute("viewBox", W.mapView.join(" "));
    W.links.forEach(function (l) { var a = W.map[l[0]], b = W.map[l[1]], p = document.createElementNS(NS, "path"); p.setAttribute("class", "link"); p.setAttribute("d", "M" + a[0] + " " + a[1] + " Q" + ((a[0] + b[0]) / 2 + 8) + " " + ((a[1] + b[1]) / 2 + 10) + " " + b[0] + " " + b[1]); svg.appendChild(p); });
    Object.keys(W.rooms).forEach(function (id) {
      var r = W.rooms[id], pos = W.map[id], known = visited.indexOf(id) >= 0, resting = !!hook("isResting", id);
      if (SH() && SH().calm) known = true;   // calm mode: every room has a name; resting ones are just napping
      var g = document.createElementNS(NS, "g"); g.setAttribute("class", "node" + (id === current ? " here" : "") + (known ? "" : " unknown"));
      var rc = document.createElementNS(NS, "rect"); rc.setAttribute("x", pos[0] - 32); rc.setAttribute("y", pos[1] - 11); rc.setAttribute("width", 64); rc.setAttribute("height", 22); rc.setAttribute("rx", 8); g.appendChild(rc);
      var tx = document.createElementNS(NS, "text"); tx.setAttribute("x", pos[0]); tx.setAttribute("y", pos[1] + 3); tx.textContent = known ? r.short : "???"; g.appendChild(tx); svg.appendChild(g);
      var li = el("li"), bt = el("button");
      if (id === current) { bt.textContent = r.name + " (you are here)"; bt.className = "here"; bt.disabled = true; }
      else if (resting) { bt.textContent = r.name + " (napping today)"; bt.disabled = true; bt.className = "napping"; g.setAttribute("class", g.getAttribute("class") + " napping"); }
      else if (known) { bt.textContent = "Go to " + r.name; bt.addEventListener("click", function () { travel(id, null); }); }
      else { bt.textContent = "An undiscovered room\u2026"; bt.disabled = true; }
      li.appendChild(bt); list.appendChild(li);
    });
    var hidden = el("li"), hb = el("button"); if (SH() && SH().calm) hb.hidden = true; hb.disabled = true; hb.textContent = "More rooms are being dug\u2026"; hidden.appendChild(hb); list.appendChild(hidden);
    $("#map").hidden = false; $("#map .card-close").focus({ preventScroll: true });
  }
  function closeMap() { if ($("#map").hidden) return; $("#map").hidden = true; }
  $("#btn-map").addEventListener("click", openMap);
  $("#map .card-close").addEventListener("click", closeMap);
  $("#btn-help").addEventListener("click", function () {
    returnFocus = $("#btn-help");
    if (SH() && SH().calm) { showCard({ meta: "a small helpful thing", title: "The Shifting House", text: "Drag (or swipe) to look around. Arrow keys work too. Doors take you to other rooms.\n\nThe house rearranges itself a little on every visit. Seven rooms are awake at a time; the others are napping, and their doors glow softly. Napping rooms wake up on another visit.\n\nThe little cloud can float you to a room that suits how you feel, or drift you home to the Office. Sound is off until you tap the speaker.\n\nKeyboard: Tab moves between clickable things, Enter opens them, Esc closes." }); return; }
    showCard({ meta: "a small helpful thing", title: "How to explore", text: "Drag (or swipe) to look around. Arrow keys work too, and + / - zoom.\n\nDoors, hatches and tunnels take you to other rooms; the Map jumps back to rooms you've visited, and Back returns you the way you came.\n\nFive gremlin socks are hiding somewhere. No timer, no rush. Your progress stays on this device, or pick a Gremlin Name (the little badge up top) to keep it on any device. The notebook button opens your quest journal.\n\nKeyboard: Tab moves between clickable things, Enter opens them, Esc closes." });
  });
  window.addEventListener("hashchange", function () { var id = location.hash.slice(1); if (W.rooms[id] && id !== current && !busy) travel(id, null); });

  /* ---------- start ---------- */
  Promise.all([
    fetch("world-data.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("office-data.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch("strips.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  ]).then(function (res) {
    W = res[0]; OFFICE = res[1];
    return Promise.resolve(hook("prepare", W)).then(function () { return res; });
  }).then(function (res) {
    updateSocks();
    // comic strips, newest first, for the archive's empty frames
    STRIPS = ((res[2] && res[2].strips) || []).filter(function (x) { return x.active !== false; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var startId = W.rooms[location.hash.slice(1)] ? location.hash.slice(1) : W.start, napStart = null;
    if (startId !== W.start && hook("isResting", startId)) { napStart = startId; startId = W.start; }
    var lockStart = null; if (startId !== W.start && hook("isLocked", startId)) { lockStart = startId; startId = W.start; }   // a link to a napping room: open the Office underneath, then say so softly
    return enter(startId).then(function () { if (napStart) hook("napping", napStart, true); if (lockStart) setTimeout(function () { hook("lockedDoor", lockStart); }, 1200); });
  }).then(function () {
    var done = function () { $("#loading").classList.add("done"); };
    var front = $(".face-front img.face-art");
    if (front && front.complete && front.naturalWidth) done(); else if (front) { front.addEventListener("load", done); setTimeout(done, 2500); } else done();
    window.addEventListener("resize", resize);
    requestAnimationFrame(loop);
    if (/[?&]debug/.test(location.search)) { debugOn = true; $("#debug").hidden = false; }
    window.GremlinWorld = { view: view, turnTo: turnTo, travel: travel, lookOf: lookOf, get room() { return current; }, get busy() { return busy; }, data: W,
      look: function (id) { var b = itemEls[id]; if (b) turnTo(b._item.yaw, b._item.pitch, 1); }, click: function (id) { var b = itemEls[id]; if (b) activate(b); },
      openArcade: function (id, game) { var cab = null; for (var k in itemEls) if (itemEls[k]._item.it && itemEls[k]._item.it.type === "arcade" && itemEls[k]._item.it.machine === id) cab = itemEls[k]; openArcade(id, cab, game); },
      reloadProgress: reloadProgress, secrets: secretList, say: say, showCard: showCard, closeCard: closeCard, hideBubble: hideBubble,
      get artMode() { return artMode; }, item: function (id) { return itemEls[id]; },
      enter: enter, history: history, openMap: openMap, closeMap: closeMap, effect: effect, rebuild: function () { if (current && !busy) { buildRoom(current); render(); } },
      get gameOpen() { return roomGameOpen(); }, closeGame: function () { if (roomGameOpen()) window.GremlinRoomGames.close(true); } };
    notify("ready", window.GremlinWorld);
    try { window.dispatchEvent(new CustomEvent("gremlinworld:ready")); } catch (e) {}
  }).catch(function (err) {
    console.error(err);
    $("#loading").textContent = "The tunnel is stuck. (Couldn't load world-data.json; open this page through a web server, not as a file.)";
  });
})();
