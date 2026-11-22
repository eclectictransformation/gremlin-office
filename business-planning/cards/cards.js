/* Gift certificate + business card maker (Business Planning). Works for guests and members, all on this device:
   pictures are read in the browser and never sent anywhere. Only "Ask Moth" sends words (members only), through
   the normal Business Planning conversation with Saji. */
(function () {
  "use strict";
  var R = window.DesksCardsRender, A = window.DesksAccess;
  var $ = function (id) { return document.getElementById(id); };
  var esc = (A && A.esc) || function (s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); };
  var LS = "desksCards.v1", STEP_NO = { product: 1, size: 1, style: 2, details: 3, pictures: 4, look: 5 };
  var TPL = [], STOCK = [], IMG = {}, ITEMS = [], BACK_ITEMS = [];
  var S = { product: null, size: null, industry: "wellness", edited: {}, certContact: false, cardAddress: true, cardBack: false,
            longMode: { cert: "wrap", card: "shrink" }, moves: {}, fit: "contain", stockId: null, step: "product" };
  var hist = [], moveMode = false, sel = null, drag = null, mothFrom = "style", member = null, me = null;

  var CERT_FIELDS = [
    { id: "business_name", label: "Business name", ac: "organization" },
    { id: "recipient", label: "To", help: "Who it's for. Leave it empty to write it in by hand." },
    { id: "amount", label: "Good for", help: "An amount or a service, like $50 or One 60-Minute Massage." },
    { id: "from", label: "From", help: "Leave it empty to sign it by hand." },
    { id: "code", label: "Gift code" },
    { id: "expiry", label: "Expiry" },
    { id: "terms", label: "Terms", area: true }];
  var CONTACT_FIELDS = [{ id: "phone", label: "Phone", type: "tel", ac: "tel" }, { id: "address", label: "Address", ac: "street-address" }];
  var CARD_FIELDS = [
    { id: "name", label: "Your name", ac: "name" }, { id: "title", label: "Title", ac: "organization-title" },
    { id: "business_name", label: "Business name", ac: "organization" }, { id: "phone", label: "Phone", type: "tel", ac: "tel" },
    { id: "email", label: "Email", type: "email", ac: "email" }, { id: "website", label: "Website", ac: "url" }, { id: "address", label: "Address", ac: "street-address" }];
  var FIELD_LABEL = {}; CERT_FIELDS.concat(CONTACT_FIELDS, CARD_FIELDS).forEach(function (f) { FIELD_LABEL[f.id] = f.label; });

  function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
  function restore() { try { var x = JSON.parse(localStorage.getItem(LS) || "null"); if (x && typeof x === "object") Object.assign(S, x, { longMode: Object.assign({}, S.longMode, x.longMode || {}) }); } catch (e) {} }

  /* ---------- templates ---------- */
  function find(kind, variant, side, ind) { return TPL.find(function (t) { return t.kind === kind && (variant == null || t.variant === variant) && t.side === side && t.industry.key === ind; }); }
  function cur(ind) { ind = ind || S.industry; return S.product === "card" ? find("business_card", null, "front", ind) : find("gift_certificate", S.size, "front", ind); }
  function backTpl() { return S.product === "card" ? find("business_card", null, "back", S.industry) : null; }
  function industries() { var seen = {}; return TPL.filter(function (t) { if (seen[t.industry.key]) return false; seen[t.industry.key] = 1; return true; }).sort(function (a, b) { return a.industry.number - b.industry.number; }).map(function (t) { return t.industry; }); }
  function tkey(t) { return t.id + "@" + t.variant + "@" + t.side; }
  function sizeText(t) { return t.trim[0] + " × " + t.trim[1] + " in"; }
  function productName(t) { return t.kind === "business_card" ? "business card" : "gift certificate"; }
  function layerOf(t, id) { return t && t.layers.find(function (L) { return L.id === id; }); }
  function value(id, L) { return Object.prototype.hasOwnProperty.call(S.edited, id) ? S.edited[id] : (L && L.text ? L.text.default : ""); }
  var RS = {
    value: value, get longMode() { return S.longMode; }, get certContact() { return S.certContact; }, get cardAddress() { return S.cardAddress; },
    movesFor: function (t) { return S.moves[tkey(t)] || {}; }, image: function (id) { return IMG[id] || null; }, fit: function () { return S.fit; }
  };

  /* ---------- drawing ---------- */
  function sizeCanvas(cv, t, cssW) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(200, Math.min(Math.round(cssW * dpr), 2400));
    cv.width = w; cv.height = Math.round(w * t.h / t.w);
  }
  var pending = false;
  function draw() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; drawNow(); }); }
  function drawNow() {
    var t = cur(); if (!t) return;
    var cv = $("cv"), w = $("stage").clientWidth - 20;
    sizeCanvas(cv, t, w);
    ITEMS = R.draw(cv, t, RS, { selected: moveMode ? sel : null, guides: moveMode });
    $("stage-cap").textContent = t.industry.name + " · " + sizeText(t);
    var b = backTpl(), showBack = !!(b && S.cardBack && (S.step === "details" || S.step === "pictures" || S.step === "look"));
    $("stage-back").hidden = !showBack;
    if (showBack) { var cb = $("cv-back"); sizeCanvas(cb, b, w); BACK_ITEMS = R.draw(cb, b, RS, { selected: moveMode ? sel : null, guides: moveMode }); }
    notes();
  }

  /* ---------- steps ---------- */
  function go(step, noHist) {
    if (!noHist && S.step && S.step !== step) hist.push(S.step);
    S.step = step; save();
    if (step !== "look") setMove(false);
    document.querySelectorAll(".step").forEach(function (s) { s.hidden = s.dataset.step !== step; });
    var staged = step !== "product" && step !== "size";
    $("stage-wrap").hidden = !staged;
    $("work").classList.toggle("is-split", staged && step !== "style");
    $("steprow").hidden = step === "product";
    $("stepnum").textContent = STEP_NO[step] ? "Step " + STEP_NO[step] + " of 5" : "";
    if (step === "style") { $("styles").hidden = true; $("see-styles").setAttribute("aria-expanded", "false"); }
    if (step === "details") buildDetails();
    if (step === "pictures") drawPictures();
    if (step === "look") drawLook();
    if (step === "moth") drawMoth();
    if (staged) draw();
    var h = document.querySelector('.step[data-step="' + step + '"] .big-q'); if (h && document.activeElement && document.activeElement.tagName === "BUTTON") { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo({ top: 0 });
  }
  $("back").onclick = function () {
    var prev = hist.pop();
    if (!prev) prev = { size: "product", style: S.product === "cert" ? "size" : "product", details: "style", pictures: "details", look: "pictures", moth: mothFrom }[S.step] || "product";
    go(prev, true);
  };
  document.querySelectorAll("[data-product]").forEach(function (b) { b.onclick = function () { S.product = b.dataset.product; go(S.product === "cert" ? "size" : "style"); }; });
  document.querySelectorAll("[data-size]").forEach(function (b) { b.onclick = function () { S.size = b.dataset.size; go("style"); }; });

  /* step 2: one style large, the rest behind "See other styles" */
  $("use-style").onclick = function () { go("details"); };
  $("see-styles").onclick = function () {
    var box = $("styles"), open = box.hidden;
    box.hidden = !open; this.setAttribute("aria-expanded", String(open));
    if (open) drawStyles();
  };
  function drawStyles() {
    var box = $("styles"); box.innerHTML = "";
    industries().forEach(function (ind) {
      var t = cur(ind.key); if (!t) return;
      var b = document.createElement("button"); b.type = "button"; b.className = "style-pick"; b.dataset.industry = ind.key;
      if (ind.key === S.industry) b.setAttribute("aria-current", "true");
      var cv = document.createElement("canvas"); cv.width = 420; cv.height = Math.round(420 * t.h / t.w); cv.setAttribute("aria-hidden", "true");
      var sp = document.createElement("span"); sp.textContent = ind.name;
      b.appendChild(cv); b.appendChild(sp); box.appendChild(b);
      R.draw(cv, t, RS, {});
      b.onclick = function () {
        S.industry = ind.key; save();
        box.querySelectorAll(".style-pick").forEach(function (x) { x.removeAttribute("aria-current"); }); b.setAttribute("aria-current", "true");
        draw(); $("stage").scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
    });
  }

  /* step 3: details */
  function field(f, t) {
    var L = layerOf(t, f.id); if (!L) return "";
    var v = value(f.id, L), id = "fd-" + f.id;
    var input = f.area ? '<textarea id="' + id + '" data-field="' + f.id + '" maxlength="400" data-no-dictate>' + esc(v) + "</textarea>"
      : '<input type="' + (f.type || "text") + '" id="' + id + '" data-field="' + f.id + '" value="' + esc(v) + '" maxlength="200"' + (f.ac ? ' autocomplete="' + f.ac + '"' : "") + " data-no-dictate>";
    return '<div class="fd" data-fd="' + f.id + '"><label class="f" for="' + id + '">' + esc(f.label) + "</label>" + input +
      (f.help ? '<p class="help" style="margin:.25rem 0 0">' + esc(f.help) + "</p>" : "") + '<p class="fieldnote" id="note-' + f.id + '" hidden></p></div>';
  }
  function longPick(kind) {
    var m = S.longMode[kind];
    return '<fieldset class="longpick" id="longpick"><legend>If the phone or address is long</legend>' +
      '<label class="tg"><input type="radio" name="long" value="wrap"' + (m === "wrap" ? " checked" : "") + "> Wrap to two lines</label>" +
      '<label class="tg"><input type="radio" name="long" value="shrink"' + (m === "shrink" ? " checked" : "") + "> Shrink to fit</label></fieldset>";
  }
  function buildDetails() {
    var t = cur(), f = $("details"), h = "";
    if (S.product === "cert") {
      h += CERT_FIELDS.map(function (x) { return field(x, t); }).join("");
      h += '<label class="toggle"><input type="checkbox" id="tg-contact"' + (S.certContact ? " checked" : "") + "> Add your phone and address</label>";
      h += '<div id="contact-box"' + (S.certContact ? "" : " hidden") + ">" + CONTACT_FIELDS.map(function (x) { return field(x, t); }).join("") + longPick("cert") + "</div>";
    } else {
      h += CARD_FIELDS.map(function (x) { return field(x, t); }).join("");
      h += '<label class="toggle"><input type="checkbox" id="tg-address"' + (S.cardAddress ? " checked" : "") + "> Show the address</label>";
      h += longPick("card");
      h += '<label class="toggle"><input type="checkbox" id="tg-back"' + (S.cardBack ? " checked" : "") + "> Add a back with just your logo</label>";
      h += '<p class="help" style="margin:.1rem 0 0">Card text is 7 pt, a common size for contact details.</p>';
    }
    f.innerHTML = h;
    f.querySelectorAll("[data-field]").forEach(function (el) {
      el.addEventListener("input", function () { S.edited[el.dataset.field] = el.value; save(); draw(); });
    });
    var c = $("tg-contact"); if (c) c.onchange = function () { S.certContact = c.checked; $("contact-box").hidden = !c.checked; save(); draw(); };
    var a = $("tg-address"); if (a) a.onchange = function () { S.cardAddress = a.checked; var w = f.querySelector('[data-fd="address"]'); if (w) w.hidden = !a.checked; save(); draw(); };
    if (a) { var w = f.querySelector('[data-fd="address"]'); if (w) w.hidden = !a.checked; }
    var bk = $("tg-back"); if (bk) bk.onchange = function () { S.cardBack = bk.checked; save(); draw(); };
    f.querySelectorAll('[name="long"]').forEach(function (r) { r.onchange = function () { S.longMode[S.product] = r.value; save(); draw(); }; });
  }
  $("details-next").onclick = function () { go("pictures"); };

  // Overflow notes (overflow_policy): shrink that can't fit switches to wrap with a note; wrap past 2 lines is flagged with shrink / shorter offered.
  function fieldNotes() {
    var out = {};
    ITEMS.forEach(function (it) {
      if (it.type !== "text_field" || !it.L.slot || !it.visible || it.empty || !it.fit) return;
      var n = "";
      if (it.L.overflow) {
        n = it.fit.note || "";
        if (n === "wrap_over" && it.fit.shrinkFits) n = "wrap_over_shrink";
      } else if (!it.fit.ok) n = "long";
      if (n) out[it.id] = n;
    });
    return out;
  }
  var NOTE_TEXT = {
    auto_wrap: "This is too long for one line, even at the smallest size (6.5 pt), so it wraps to two lines.",
    auto_wrap_over: "This is too long for one line, even at 6.5 pt, and too long for two lines. A shorter version will fit.",
    wrap_over: "This needs more than two lines. A shorter version will fit.",
    wrap_over_shrink: "This needs more than two lines.",
    long: "This is a little long for its space. A shorter version will look best."
  };
  function notes() {
    var fn = fieldNotes();
    document.querySelectorAll(".fieldnote").forEach(function (p) {
      var id = p.id.slice(5), n = fn[id];
      p.hidden = !n; p.dataset.note = n || "";
      if (!n) { p.textContent = ""; return; }
      p.textContent = NOTE_TEXT[n];
      if (n === "wrap_over_shrink") {
        var b = document.createElement("button"); b.type = "button"; b.className = "linkbtn"; b.textContent = "Shrink to fit instead";
        b.onclick = function () { S.longMode[S.product] = "shrink"; save(); var r = document.querySelector('[name="long"][value="shrink"]'); if (r) r.checked = true; draw(); };
        p.appendChild(document.createTextNode(" ")); p.appendChild(b); p.appendChild(document.createTextNode(" or try a shorter version."));
      }
    });
    if (S.step === "look") lookNotes(fn);
  }

  /* step 4: pictures, all kept in this browser */
  function drawPictures() {
    $("logo-name").textContent = IMG.logo ? IMG.logo.name : ""; $("rm-logo").hidden = !IMG.logo;
    $("main-name").textContent = IMG.main_graphic ? IMG.main_graphic.name : ""; $("rm-main").hidden = !IMG.main_graphic;
    $("fitpick").hidden = !IMG.main_graphic;
    document.querySelectorAll('[name="fit"]').forEach(function (r) { r.checked = r.value === S.fit; });
    var t = cur(), L = layerOf(t, "main_graphic"), sug = (L && L.suggested_stock) || [];
    var list = STOCK.slice().sort(function (a, b) { var ia = sug.indexOf(a.id), ib = sug.indexOf(b.id); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    $("stock").innerHTML = list.map(function (s) { return '<button type="button" data-stock="' + s.id + '" aria-pressed="' + (S.stockId === s.id && IMG.main_graphic && IMG.main_graphic.stock === s.id) + '" title="' + esc(s.label) + '"><img src="' + s.thumb + '" alt="' + esc(s.label) + '" loading="lazy"></button>'; }).join("");
    $("stock").querySelectorAll("[data-stock]").forEach(function (b) { b.onclick = function () { pickStock(b.dataset.stock); }; });
  }
  function picErr(m) { $("pic-err").textContent = m || ""; $("pic-err").hidden = !m; }
  function loadImage(src) { return new Promise(function (ok, bad) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = bad; im.src = src; }); }
  async function upload(input, slot) {
    picErr(""); var f = input.files && input.files[0]; input.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) return picErr("That file doesn't look like a picture. Try a PNG or JPG.");
    if (f.size > 25 * 1024 * 1024) return picErr("That picture is very large. Please choose one under 25 MB.");
    try {
      var url = URL.createObjectURL(f), im = await loadImage(url);
      if (!(im.naturalWidth > 0)) { im.width = 1000; im.height = 1000; }
      if (IMG[slot] && IMG[slot].url) URL.revokeObjectURL(IMG[slot].url);
      IMG[slot] = { img: im, name: f.name, url: url };
      if (slot === "main_graphic") { S.stockId = null; if (/jpe?g/.test(f.type)) S.fit = "cover"; }
      save(); drawPictures(); draw();
    } catch (e) { picErr("That picture didn't open. Try a PNG or JPG."); }
  }
  async function pickStock(id) {
    var s = STOCK.find(function (x) { return x.id === id; }); if (!s) return;
    try { var im = await loadImage(s.file); IMG.main_graphic = { img: im, name: s.label, stock: id }; S.stockId = id; S.fit = "contain"; save(); drawPictures(); draw(); }
    catch (e) { picErr("That picture didn't load. Please try again."); }
  }
  $("up-logo").onchange = function () { upload(this, "logo"); };
  $("up-main").onchange = function () { upload(this, "main_graphic"); };
  $("rm-logo").onclick = function () { delete IMG.logo; drawPictures(); draw(); };
  $("rm-main").onclick = function () { delete IMG.main_graphic; S.stockId = null; save(); drawPictures(); draw(); };
  document.querySelectorAll('[name="fit"]').forEach(function (r) { r.onchange = function () { S.fit = r.value; save(); draw(); }; });
  $("pics-next").onclick = function () { go("look"); };
  $("pics-skip").onclick = function () { go("look"); };

  /* step 5: look-over, move, download */
  function setMove(on) {
    moveMode = !!on; sel = on ? sel : null;
    $("move").setAttribute("aria-pressed", String(moveMode));
    $("move").textContent = moveMode ? "Done moving" : "Move things around";
    $("move-hint").hidden = !moveMode;
    $("stage").classList.toggle("moving", moveMode); $("stage-back").classList.toggle("moving", moveMode);
    $("cv").tabIndex = moveMode ? 0 : -1;
  }
  function drawLook() {
    var t = cur(), d = t.w * 300, e = t.h * 300;
    $("dl-spec").textContent = "Print-ready: 300 dpi with " + t.bleed + " in of bleed on every side (" + Math.round(d) + " × " + Math.round(e) + " px). Trim to " + sizeText(t) + ".";
    $("dl-back").hidden = !(backTpl() && S.cardBack);
    $("dl-pdf").textContent = backTpl() && S.cardBack ? "Download PDF (front and back)" : "Download PDF";
    $("dl-msg").textContent = "";
  }
  function lookNotes(fn) {
    var li = [], t = cur();
    R.outsideSafe(t, ITEMS).forEach(function (id) { li.push("“" + (FIELD_LABEL[id] || (id === "logo" ? "Logo" : id === "main_graphic" ? "Main picture" : "A piece")) + "” is close to the edge and could get trimmed. Drag it in a little."); });
    if (Object.keys(fn || {}).length) li.push("Some words are a bit long for their space. Go back to your details to adjust them.");
    var empty = ["logo", "main_graphic"].filter(function (id) { return layerOf(t, id) && !IMG[id]; });
    if (empty.length) li.push("Empty picture spaces are left off the download.");
    if (backTpl() && S.cardBack && !IMG.logo) li.push("The back shows just your logo, so add a logo for it.");
    $("look-notes").innerHTML = li.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
  }
  $("move").onclick = function () { setMove(!moveMode); draw(); };
  $("reset").onclick = function () { var t = cur(), b = backTpl(); delete S.moves[tkey(t)]; if (b) delete S.moves[tkey(b)]; sel = null; save(); draw(); $("dl-msg").textContent = "Everything is back where the template put it."; };
  $("to-template").onclick = function () { go("style"); };

  function toInches(cv, t, ev) { var r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * t.w, (ev.clientY - r.top) / r.height * t.h]; }
  function wireDrag(cv, tplFn, itemsFn) {
    cv.addEventListener("pointerdown", function (ev) {
      if (!moveMode || S.step !== "look") return;
      var t = tplFn(), p = toInches(cv, t, ev), it = R.hitTest(itemsFn(), p[0], p[1]);
      if (!it) { sel = null; draw(); return; }
      ev.preventDefault(); sel = it.moveKey;
      var mv = S.moves[tkey(t)] = S.moves[tkey(t)] || {}, start = (mv[sel] || [0, 0]).slice();
      drag = { t: t, p0: p, start: start, key: sel, cv: cv };
      try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
      draw();
    });
    cv.addEventListener("pointermove", function (ev) {
      if (!drag || drag.cv !== cv) return;
      var p = toInches(cv, drag.t, ev), mv = S.moves[tkey(drag.t)];
      mv[drag.key] = [Math.round((drag.start[0] + p[0] - drag.p0[0]) * 1000) / 1000, Math.round((drag.start[1] + p[1] - drag.p0[1]) * 1000) / 1000];
      draw();
    });
    function end() { if (drag) { drag = null; save(); draw(); } }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }
  wireDrag($("cv"), cur, function () { return ITEMS; });
  wireDrag($("cv-back"), backTpl, function () { return BACK_ITEMS; });
  $("cv").addEventListener("keydown", function (ev) {
    if (!moveMode || !sel) return;
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[ev.key]; if (!d) return;
    ev.preventDefault(); var st = ev.shiftKey ? 0.1 : 0.02, t = cur(), mv = S.moves[tkey(t)] = S.moves[tkey(t)] || {}, c = mv[sel] || [0, 0];
    mv[sel] = [Math.round((c[0] + d[0] * st) * 1000) / 1000, Math.round((c[1] + d[1] * st) * 1000) / 1000]; save(); draw();
  });

  function fileBase(t) { return (t.kind === "business_card" ? "business-card" : "gift-certificate") + "-" + t.industry.key + (t.kind === "business_card" ? "" : "-" + t.variant); }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  async function dl(kind) {
    var btns = [$("dl-png"), $("dl-back"), $("dl-pdf")]; btns.forEach(function (b) { b.disabled = true; });
    $("dl-msg").textContent = "Making your print file…";
    try {
      await R.loadFonts("", FONTS);
      var t = cur(), name;
      if (kind === "png" || kind === "back") {
        var tt = kind === "back" ? backTpl() : t, r = await R.pngBlob(tt, RS);
        name = fileBase(tt) + (kind === "back" ? "-back" : "") + "-print-300dpi.png"; saveBlob(r.blob, name);
        window.DesksCards.lastFile = { name: name, w: r.w, h: r.h, size: r.blob.size };
      } else {
        var pages = [t].concat(backTpl() && S.cardBack ? [backTpl()] : []), pdf = await R.pdfBlob(pages, RS);
        name = fileBase(t) + "-print.pdf"; saveBlob(pdf, name); window.DesksCards.lastFile = { name: name, pages: pages.length, size: pdf.size };
      }
      $("dl-msg").textContent = "Downloaded " + name + ". Print at 100% (actual size), then trim on the trim line.";
    } catch (e) { $("dl-msg").textContent = "That download didn't work. Please try again."; }
    finally { btns.forEach(function (b) { b.disabled = false; }); }
  }
  $("dl-png").onclick = function () { dl("png"); };
  $("dl-back").onclick = function () { dl("back"); };
  $("dl-pdf").onclick = function () { dl("pdf"); };

  /* ---------- Ask Moth for a new design (members; sent through Saji) ---------- */
  document.querySelectorAll("[data-moth]").forEach(function (b) { b.onclick = function () { mothFrom = S.step; go("moth"); }; });
  async function memberLevel() {
    if (member !== null) return member;
    try { me = await A.ready; } catch (e) { me = { role: "guest" }; }
    if (!me || me.role === "guest") { member = false; return member; }
    try { var L = await A.api.bp.limits(); member = L && (L.level === "basic" || L.level === "full"); } catch (e) { member = false; }
    return member;
  }
  async function drawMoth() {
    var t = cur();
    $("moth-base").textContent = "Starting from: the " + t.industry.name + " " + productName(t) + ", " + sizeText(t) + ".";
    $("moth-done").hidden = true; $("moth-err").hidden = true; $("moth-form").hidden = true; $("moth-guest").hidden = true;
    var m = await memberLevel();
    if (m) { $("moth-form").hidden = false; return; }
    $("moth-guest").hidden = false;
    if (me && me.role !== "guest") { $("moth-guest-text").textContent = "Once Bryan approves your account, you can ask Moth for a new design here. It's free for now."; $("moth-signin").hidden = true; }
  }
  function mothBody(ask) {
    var t = cur(), lines = [], fields = S.product === "cert" ? CERT_FIELDS.concat(S.certContact ? CONTACT_FIELDS : []) : CARD_FIELDS;
    fields.forEach(function (f) { if (f.id === "address" && S.product === "card" && !S.cardAddress) return; var L = layerOf(t, f.id); if (!L) return; var v = String(value(f.id, L)).trim(); lines.push(f.label + ": " + (v || "(left empty)")); });
    var opts = [];
    if (S.product === "cert") opts.push("Size: " + sizeText(t), "Phone and address: " + (S.certContact ? "shown, " + S.longMode.cert : "off"));
    else opts.push("Logo-only back: " + (S.cardBack ? "yes" : "no"), "Long phone or address: " + S.longMode.card);
    opts.push("Logo: " + (IMG.logo ? "added on my device (not sent)" : "none yet"), "Main picture: " + (IMG.main_graphic ? (IMG.main_graphic.stock ? "our stock picture " + IMG.main_graphic.stock : "my own, on my device (not sent)") : "none yet"));
    if (Object.keys(S.moves[tkey(t)] || {}).length) opts.push("I moved some pieces around in the editor.");
    return ["Intake: moth_design", "Product: " + (t.kind === "business_card" ? "Business card" : "Gift certificate") + " " + sizeText(t), "Closest style: " + t.id + " (" + t.industry.name + ")", "---",
      "[Design request for Moth] Saji, please pass this to Moth. Free for now. A new design stays mine and doesn't join the shared styles unless Bryan approves it.",
      "", "What I'd change:", ask, "", "My details:", lines.join("\n"), "", opts.join("\n")].join("\n");
  }
  $("moth-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var ask = $("moth-ask").value.trim(), err = $("moth-err");
    err.hidden = true;
    if (!ask) { $("moth-ask").focus(); err.textContent = "Say what you'd change, in any words. A sentence is plenty."; err.hidden = false; return; }
    $("moth-send").disabled = true;
    var bp = A.api.bp, body = mothBody(ask), tid = null;
    try {
      try { tid = await bp.start("Design request for Moth", body, "free"); }
      catch (e1) {
        if (!/open plan/i.test(e1.message || "")) throw e1;
        var th = await bp.threads(), open = th.find(function (x) { return x.status === "open"; });
        if (!open) throw e1;
        await bp.post(open.id, body); tid = open.id;
      }
      $("moth-form").hidden = true; $("moth-done").hidden = false; $("moth-ask").value = "";
      var a = $("moth-done").querySelector("a"); if (a && tid) a.href = "../?t=" + tid;
      window.DesksCards.lastMoth = { thread: tid, body: body };
    } catch (e2) { err.textContent = (e2 && e2.message) || "That didn't send. Please try again."; err.hidden = false; }
    finally { $("moth-send").disabled = false; }
  });
  $("moth-cancel").onclick = function () { go(mothFrom, true); };
  $("moth-back").onclick = function () { go(mothFrom, true); };

  /* ---------- start ---------- */
  var FONTS = [];
  window.DesksCards = { S: S, IMG: IMG, cur: function () { return cur(); }, back: backTpl, items: function () { return ITEMS; }, backItems: function () { return BACK_ITEMS; },
    templates: function () { return TPL; }, go: go, draw: drawNow, notes: fieldNotes, R: R, RS: RS, ready: null };
  window.DesksCards.ready = Promise.all(["data/templates.json", "data/stock.json", "data/fonts.json"].map(function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }))
    .then(async function (x) {
      TPL = x[0]; STOCK = x[1]; FONTS = x[2];
      await R.loadFonts("", FONTS);
      restore();
      if (!S.product || (S.product === "cert" && !S.size)) S.step = S.product ? "size" : "product";
      if (!cur()) { S.industry = "wellness"; }
      if (S.step === "moth") S.step = "style";
      $("loading").hidden = true;
      go(S.step || "product", true);
      if (S.stockId) pickStock(S.stockId);
      var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(draw, 120); });
      return true;
    })
    .catch(function () { $("loading").hidden = true; $("load-err").hidden = false; });
})();
