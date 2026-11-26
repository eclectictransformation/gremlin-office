/* Wandering the Local Parks. Reads published parks + approved visitor notes/photos; visitors can only add (never read) pending notes. */
(function () {
  "use strict";
  var C = window.PARKS_CONFIG, T = C.text, A = window.DESKS_ACCESS || {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fill(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; }); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function monYear(d) { if (!d) return ""; var p = String(d).split("-"); return MONTHS[+p[1] - 1] + " " + p[0]; }
  function seasonNow() { var m = new Date().getMonth(); return m < 2 || m === 11 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "fall"; }

  var ICON = {
    pets: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="10" r="2.2"/><circle cx="9.5" cy="5.5" r="2.2"/><circle cx="14.5" cy="5.5" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M12 11c-3 0-6 4.5-6 7 0 1.7 1.3 2.5 3 2.5 1.3 0 2-.6 3-.6s1.7.6 3 .6c1.7 0 3-.8 3-2.5 0-2.5-3-7-6-7z"/></svg>',
    electric: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
    winter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/></svg>'
  };

  /* ---------- connection ---------- */
  var sbP = null;
  function sb() {
    if (sbP) return sbP;
    sbP = new Promise(function (ok, bad) {
      if (!A.SUPABASE_URL || !A.SUPABASE_ANON_KEY) { bad(new Error("not configured")); return; }
      function make() { ok(window.supabase.createClient(A.SUPABASE_URL, A.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })); }
      if (window.supabase) return make();
      var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; s.async = true;
      s.onload = make; s.onerror = function () { bad(new Error("load")); }; document.head.appendChild(s);
    });
    return sbP;
  }

  /* ---------- state ---------- */
  var parks = [], byId = {}, reviews = {}, photos = {}, photosOn = false;
  var st = { q: "", r: C.defaultRadius, f: {}, shown: C.pageSize };
  C.filters.forEach(function (g) { st.f[g.key] = []; });

  /* ---------- static text ---------- */
  $("pk-kicker").textContent = T.kicker; $("pk-title").textContent = T.title; $("pk-intro").textContent = T.intro;
  $("pk-note").textContent = T.note; $("tab-camp").textContent = T.tabCamp; $("tab-see").textContent = T.tabSee;
  $("pk-see-soon").textContent = T.seeSoon; $("pk-q").placeholder = T.searchPlaceholder; $("pk-foot").textContent = T.footer;
  $("pk-back").innerHTML = "&larr; " + esc(T.backLink);
  document.querySelectorAll("[data-close]").forEach(function (b) { b.textContent = T.close; b.onclick = function () { b.closest("dialog").close(); }; });

  function setTab(see) {
    $("tab-camp").setAttribute("aria-selected", !see); $("tab-see").setAttribute("aria-selected", see);
    $("pane-camp").hidden = see; $("pane-see").hidden = !see;
  }
  $("tab-camp").onclick = function () { setTab(false); };
  $("tab-see").onclick = function () { setTab(true); };

  /* ---------- chips ---------- */
  function drawRadii() {
    var h = C.radii.map(function (r) { return '<button class="chip" type="button" data-r="' + r + '" aria-pressed="' + (st.r === r) + '">' + r + " mi</button>"; }).join("");
    var open = !$("pk-panel").hidden;
    h += '<button class="chip filters" type="button" id="pk-fbtn" aria-expanded="' + open + '" aria-controls="pk-panel">' + esc(T.filtersButton) + "</button>";
    $("pk-radii").innerHTML = h;
    $("pk-radii").querySelectorAll("[data-r]").forEach(function (b) { b.onclick = function () { st.r = +b.dataset.r; st.shown = C.pageSize; render(); }; });
    $("pk-fbtn").onclick = function () { $("pk-panel").hidden = !$("pk-panel").hidden; drawPanel(); drawRadii(); };
  }
  function drawPanel() {
    if ($("pk-panel").hidden) return;
    var h = C.filters.map(function (g) {
      return '<div class="pk-group"><h3>' + esc(g.label) + '</h3><div class="pk-row" role="group" aria-label="' + esc(g.label) + '">' +
        g.options.map(function (o) { var on = st.f[g.key].indexOf(o.value) >= 0; return '<button class="chip" type="button" data-g="' + esc(g.key) + '" data-v="' + esc(o.value) + '" aria-pressed="' + on + '">' + esc(o.label) + "</button>"; }).join("") + "</div></div>";
    }).join("");
    h += '<button class="btn ghost" type="button" id="pk-fdone">' + esc(T.filtersDone) + "</button>";
    $("pk-panel").innerHTML = h;
    $("pk-panel").querySelectorAll("[data-g]").forEach(function (b) { b.onclick = function () { toggle(b.dataset.g, b.dataset.v); }; });
    $("pk-fdone").onclick = function () { $("pk-panel").hidden = true; drawRadii(); };
  }
  function toggle(g, v) { var a = st.f[g], i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); st.shown = C.pageSize; drawPanel(); render(); }
  function drawActive() {
    var pills = [];
    C.filters.forEach(function (g) { g.options.forEach(function (o) { if (st.f[g.key].indexOf(o.value) >= 0) pills.push('<button class="pill" type="button" data-g="' + esc(g.key) + '" data-v="' + esc(o.value) + '" aria-label="Remove ' + esc(o.label) + '">' + esc(o.label) + ' <span aria-hidden="true">&times;</span></button>'); }); });
    var el = $("pk-active");
    el.innerHTML = pills.length ? pills.join("") + '<button class="linkbtn" type="button" id="pk-clear">' + esc(T.clearFilters) + "</button>" : "";
    el.hidden = !pills.length;
    el.querySelectorAll("[data-g]").forEach(function (b) { b.onclick = function () { toggle(b.dataset.g, b.dataset.v); }; });
    if (pills.length) $("pk-clear").onclick = function () { Object.keys(st.f).forEach(function (k) { st.f[k] = []; }); st.shown = C.pageSize; drawPanel(); render(); };
  }

  /* ---------- filtering ---------- */
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function match(p) {
    if (Number(p.distance_miles) > st.r) return false;
    if (st.q) { var hay = norm([p.name, p.parent_park, p.town, p.county, p.nearest_town_county].join(" ")); if (norm(st.q).split(/\s+/).some(function (w) { return w && hay.indexOf(w) < 0; })) return false; }
    var f = st.f;
    if (f.state.length && f.state.indexOf(p.state) < 0) return false;
    if (f.stay.length && !f.stay.some(function (s) { return (p.stay_types || []).indexOf(s) >= 0; })) return false;
    if (f.winter.length && !p.winter_open) return false;
    if (f.pets.length && !(p.pets === "yes" || p.pets === "some")) return false;
    if (f.electric.length && !p.electric) return false;
    return true;
  }

  /* ---------- cards ---------- */
  function fact(label, v) { v = String(v || "").trim(); return v && !/^(n\/a|none)$/i.test(v) ? "<li><b>" + esc(label) + ":</b> " + esc(v) + "</li>" : ""; }
  function card(p) {
    var icons = "";
    if (p.pets === "yes" || p.pets === "some") { var pl = p.pets === "some" ? C.icons.petsSome : C.icons.pets; icons += '<span class="pk-ic" title="' + esc(pl) + '" role="img" aria-label="' + esc(pl) + '">' + ICON.pets + "</span>"; }
    if (p.electric) icons += '<span class="pk-ic" title="' + esc(C.icons.electric) + '" role="img" aria-label="' + esc(C.icons.electric) + '">' + ICON.electric + "</span>";
    if (p.winter_open) icons += '<span class="pk-ic" title="' + esc(C.icons.winter) + '" role="img" aria-label="' + esc(C.icons.winter) + '">' + ICON.winter + "</span>";
    var stays = (p.stay_types || []).map(function (s) { return C.stayLabels[s] || s; }).join(", ");
    var facts = fact("Stay", stays) + fact("Camping", p.camping_types) + fact("Lodging", p.other_lodging_structures) + fact("Lean-tos and shelters", /^no\b/i.test(p.lean_tos_shelters || "") ? "" : p.lean_tos_shelters) +
      fact("Season", p.winter_dates_season) + fact("Pets at sites", p.pets_allowed_campsites) + fact("Pets in cabins", p.pets_allowed_cabins) +
      fact("Electric hookups", /^no\b/i.test(p.electric_hookup_sites || "") ? "" : p.electric_hookup_sites) + fact("Cabin power", p.cabin_power) + fact("Cabin heat", p.cabin_heat_source) +
      fact("Shelter heat", p.shelter_heat) + fact("Shelter power", p.shelter_power) + fact("Run by", p.managing_agency) + fact("Books through", p.reservation_system) + fact("Good to know", p.notes);
    if (p.booking_link_depth === "park-level") facts += "<li>" + esc(T.parkLevel) + "</li>";
    var where = esc([p.town, p.state].filter(Boolean).join(", ")) + " &middot; " + esc(Number(p.distance_miles).toFixed(0)) + " mi";
    return '<article class="pk-card" data-id="' + esc(p.id) + '">' +
      "<h2>" + esc(p.name) + "</h2>" +
      '<p class="pk-where">' + where + "</p>" +
      '<div class="pk-icons">' + icons + "</div>" +
      '<div class="pk-actions">' +
        (p.reservation_url ? '<a class="btn" href="' + esc(p.reservation_url) + '" target="_blank" rel="noopener noreferrer">' + esc(T.book) + "</a>" : "") +
        (p.official_page_url ? '<a href="' + esc(p.official_page_url) + '" target="_blank" rel="noopener noreferrer">' + esc(T.official) + "</a>" : "") +
      "</div>" +
      '<details class="pk-more"><summary>' + esc(T.about) + '</summary><ul class="pk-facts">' + facts + "</ul></details>" +
      '<details class="pk-more" data-noticed><summary>' + esc(T.noticed) + '</summary><div class="pk-noticed"></div></details>' +
      '<p class="pk-bottom">' + esc(fill(T.lastChecked, { d: monYear(p.last_checked) })) + ' &middot; <button class="linkbtn" type="button" data-corr>' + esc(T.suggest) + "</button></p>" +
      "</article>";
  }

  function noticed(p, box, all) {
    var rs = reviews[p.id] || [], ph = photos[p.id] || [], h = "";
    if (!rs.length && !ph.length) h += '<p class="pk-rev who">' + esc(T.noticedNone) + "</p>";
    (all ? rs : rs.slice(0, 2)).forEach(function (r) {
      var se = C.seasons.filter(function (s) { return s.value === r.season; })[0];
      h += '<div class="pk-rev"><p class="who">' + esc(T.visitor) + (se ? " &middot; " + esc(se.label) : "") + "</p>" +
        C.reviewPrompts.map(function (q) { var v = (r[q.key] || "").trim(); return v ? '<p class="q">' + esc(q.label) + "</p><p>" + esc(v) + "</p>" : ""; }).join("") + "</div>";
    });
    if (!all && rs.length > 2) h += '<button class="linkbtn" type="button" data-readmore>' + esc(T.readMore) + "</button>";
    if (ph.length) {
      h += '<div class="pk-gal">';
      C.seasons.forEach(function (s) {
        var g = ph.filter(function (x) { return x.season === s.value; });
        if (g.length) h += "<h4>" + esc(s.label) + '</h4><div class="pk-thumbs">' + g.map(function (x) { return '<a href="#" target="_blank" rel="noopener" data-ph="' + esc(x.storage_path) + '"><img alt="' + esc("Visitor photo, " + s.label.toLowerCase()) + '" data-ph="' + esc(x.storage_path) + '"></a>'; }).join("") + "</div>";
      });
      var other = ph.filter(function (x) { return !x.season; });
      if (other.length) h += '<h4>Any time</h4><div class="pk-thumbs">' + other.map(function (x) { return '<a href="#" target="_blank" rel="noopener" data-ph="' + esc(x.storage_path) + '"><img alt="Visitor photo" data-ph="' + esc(x.storage_path) + '"></a>'; }).join("") + "</div>";
      h += "</div>";
    }
    h += '<p><button class="btn ghost" type="button" data-share>' + esc(T.shareOpen) + "</button></p>";
    box.innerHTML = h;
    var rm = box.querySelector("[data-readmore]"); if (rm) rm.onclick = function () { noticed(p, box, true); };
    box.querySelector("[data-share]").onclick = function () { openReview(p); };
    var paths = ph.map(function (x) { return x.storage_path; });
    if (paths.length) sb().then(function (c) { return c.storage.from("park-photos").createSignedUrls(paths, 3600); }).then(function (r) {
      (r.data || []).forEach(function (u) {
        if (!u.signedUrl) return;
        box.querySelectorAll('[data-ph="' + u.path + '"]').forEach(function (el) { if (el.tagName === "IMG") { el.src = u.signedUrl; el.loading = "lazy"; } else el.href = u.signedUrl; });
      });
    }).catch(function () {});
  }

  function render() {
    drawRadii(); drawActive();
    var list = parks.filter(match);
    var n = list.length;
    $("pk-results").textContent = fill(T.results, { n: n, places: n === 1 ? T.resultsOne : T.resultsMany, r: st.r });
    $("pk-grid").innerHTML = list.slice(0, st.shown).map(card).join("");
    $("pk-more").hidden = n <= st.shown; $("pk-more").textContent = T.showMore;
    var empty = $("pk-empty");
    empty.hidden = n > 0;
    if (!n) {
      var wider = C.radii.filter(function (r) { return r > st.r; });
      var target = st.r < C.wideRadius ? C.wideRadius : wider[wider.length - 1];
      empty.innerHTML = "<p>" + esc(T.empty) + "</p>" + (target ? '<button class="btn ghost" type="button" id="pk-wider">' + esc(fill(T.emptyButton, { r: target })) + "</button>" : "");
      if (target) $("pk-wider").onclick = function () { st.r = target; st.shown = C.pageSize; render(); };
    }
    $("pk-grid").querySelectorAll(".pk-card").forEach(function (el) {
      var p = byId[el.dataset.id];
      el.querySelector("[data-corr]").onclick = function () { openCorr(p); };
      var d = el.querySelector("[data-noticed]");
      d.addEventListener("toggle", function () { if (d.open && !d.dataset.done) { d.dataset.done = "1"; noticed(p, d.querySelector(".pk-noticed"), false); } });
    });
  }
  $("pk-more").onclick = function () { st.shown += C.pageSize; render(); };
  var qT; $("pk-q").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { st.q = $("pk-q").value.trim(); st.shown = C.pageSize; render(); }, 120); });

  /* ---------- correction ---------- */
  var corrPark = null, corrBusy = false;
  $("corr-h").textContent = T.corrTitle; $("corr-lead").textContent = T.corrLead; $("corr-what-l").textContent = T.corrWhat;
  $("corr-where-l").textContent = T.corrWhere; $("corr-send").textContent = T.corrSend;
  function openCorr(p) {
    corrPark = p; $("corr-form").reset(); $("corr-err").textContent = ""; $("corr-form").hidden = false; $("corr-ok").hidden = true;
    $("corr-park").textContent = p.name; $("dlg-corr").showModal(); $("corr-what").focus();
  }
  $("corr-form").addEventListener("submit", async function (e) {
    e.preventDefault(); if (corrBusy) return;
    var done = function () { $("corr-ok-msg").textContent = T.corrThanks; $("corr-form").hidden = true; $("corr-ok").hidden = false; };
    if ($("corr-site").value) return done();
    var what = $("corr-what").value.trim();
    if (what.length < 3) { $("corr-err").textContent = T.corrWhat; return; }
    corrBusy = true; $("corr-send").disabled = true;
    try {
      var c = await sb();
      var r = await c.from("park_corrections").insert({ park_id: corrPark.id, what_to_fix: what, where_seen: $("corr-where").value.trim() });
      if (r.error) throw r.error; done();
    } catch (x) { $("corr-err").textContent = T.sendFail; }
    corrBusy = false; $("corr-send").disabled = false;
  });

  /* ---------- review + photo ---------- */
  var revPark = null, revBusy = false, revSeason = null, revBlob = null;
  $("rev-h").textContent = T.revTitle; $("rev-help").textContent = T.revHelp; $("rev-season-l").textContent = T.revSeason;
  $("rev-photo-l").textContent = T.revPhoto; $("rev-send").textContent = T.revSend;
  $("rev-prompts").innerHTML = C.reviewPrompts.map(function (q) { return '<label for="rev-' + esc(q.key) + '">' + esc(q.label) + '</label><textarea id="rev-' + esc(q.key) + '" rows="2" maxlength="600"></textarea>'; }).join("");
  function drawSeasons() {
    $("rev-season").innerHTML = C.seasons.map(function (s) { return '<button class="chip" type="button" data-s="' + s.value + '" aria-pressed="' + (revSeason === s.value) + '">' + esc(s.label) + "</button>"; }).join("");
    $("rev-season").querySelectorAll("[data-s]").forEach(function (b) { b.onclick = function () { revSeason = revSeason === b.dataset.s ? null : b.dataset.s; drawSeasons(); }; });
  }
  function openReview(p) {
    revPark = p; revBlob = null; revSeason = seasonNow(); $("rev-form").reset(); $("rev-prev").hidden = true; $("rev-err").textContent = "";
    $("rev-form").hidden = false; $("rev-ok").hidden = true; $("rev-park").textContent = p.name; $("rev-photo-box").hidden = !photosOn;
    drawSeasons(); $("dlg-rev").showModal();
  }

  // Re-draw the photo on a canvas: shrinks it to about 200-300 KB and drops all EXIF/GPS data (canvas never copies it).
  async function shrink(file) {
    var src;
    try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { src = await new Promise(function (ok, bad) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = bad; i.src = URL.createObjectURL(file); }); }
    var w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight, max = 1600, blob = null;
    for (var pass = 0; pass < 6; pass++) {
      var s = Math.min(1, max / Math.max(w0, h0)), w = Math.round(w0 * s), h = Math.round(h0 * s);
      var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(src, 0, 0, w, h);
      for (var qy = 0.82; qy >= 0.5; qy -= 0.08) {
        blob = await new Promise(function (ok) { cv.toBlob(ok, "image/jpeg", qy); });
        if (blob && blob.size <= 300 * 1024) return blob;
      }
      max = Math.round(max * 0.8);
    }
    return blob && blob.size <= 400 * 1024 ? blob : null;
  }
  $("rev-photo").addEventListener("change", async function () {
    revBlob = null; $("rev-prev").hidden = true; $("rev-err").textContent = "";
    var f = this.files && this.files[0]; if (!f) return;
    try { revBlob = await shrink(f); } catch (e) { revBlob = null; }
    if (!revBlob) { $("rev-err").textContent = T.revPhotoFail; return; }
    $("rev-prev").src = URL.createObjectURL(revBlob); $("rev-prev").hidden = false;
  });
  $("rev-form").addEventListener("submit", async function (e) {
    e.preventDefault(); if (revBusy) return;
    var done = function (m) { $("rev-ok-msg").textContent = m || T.revThanks; $("rev-form").hidden = true; $("rev-ok").hidden = false; };
    if ($("rev-site").value) return done();
    var row = { id: uuid(), park_id: revPark.id, season: revSeason }, any = false;
    C.reviewPrompts.forEach(function (q) { var v = $("rev-" + q.key).value.trim(); row[q.key] = v; if (v) any = true; });
    if (!any) { $("rev-err").textContent = T.revNeedOne; return; }
    revBusy = true; $("rev-send").disabled = true; $("rev-err").textContent = "";
    try {
      var c = await sb();
      var r = await c.from("park_reviews").insert(row);
      if (r.error) throw r.error;
      var msg = T.revThanks;
      if (revBlob && photosOn) {
        try {
          var pid = uuid();
          var pr = await c.from("park_photos").insert({ id: pid, park_id: revPark.id, review_id: row.id, season: revSeason });
          if (pr.error) throw pr.error;
          var up = await c.storage.from("park-photos").upload("p/" + pid + ".jpg", revBlob, { contentType: "image/jpeg", upsert: false });
          if (up.error) throw up.error;
        } catch (x) { msg = T.revThanks + " " + T.revPhotoFail; }
      }
      done(msg);
    } catch (x) { $("rev-err").textContent = T.sendFail; }
    revBusy = false; $("rev-send").disabled = false;
  });

  /* ---------- load ---------- */
  (async function load() {
    $("pk-results").textContent = "…";
    try {
      var c = await sb();
      var cols = "id,name,parent_park,state,town,county,nearest_town_county,distance_miles,camping_types,other_lodging_structures,lean_tos_shelters,winter_dates_season,pets_allowed_campsites,pets_allowed_cabins,electric_hookup_sites,cabin_power,cabin_heat_source,shelter_heat,shelter_power,managing_agency,reservation_system,reservation_url,booking_link_depth,official_page_url,notes,stay_types,winter_open,pets,electric,last_checked";
      var res = await Promise.all([
        c.from("parks").select(cols).eq("published", true).eq("kind", "camp").order("distance_miles"),
        c.from("park_reviews").select("park_id,fav_saw,wildlife,why_go,season,created_at").eq("status", "approved").order("created_at", { ascending: false }),
        c.from("park_photos").select("park_id,season,storage_path,created_at").eq("status", "approved").order("created_at", { ascending: false }),
        c.from("park_settings").select("photos_enabled").eq("id", 1).maybeSingle()
      ]);
      if (res[0].error) throw res[0].error;
      parks = res[0].data || [];
      parks.forEach(function (p) { byId[p.id] = p; });
      (res[1].data || []).forEach(function (r) { (reviews[r.park_id] = reviews[r.park_id] || []).push(r); });
      (res[2].data || []).forEach(function (r) { (photos[r.park_id] = photos[r.park_id] || []).push(r); });
      photosOn = !!(res[3].data && res[3].data.photos_enabled);
      render();
    } catch (e) {
      drawRadii();
      $("pk-results").textContent = T.loadError;
    }
  })();
})();
