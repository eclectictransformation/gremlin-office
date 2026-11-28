/* Things to Do — visitor page. Wording lives in things-config.js. */
(function () {
  "use strict";

  var C = window.THINGS_CONFIG;
  var T = C.text;
  var DATA = { items: [], type_labels: {}, day_labels: {} };
  var EXT = ' target="_blank" rel="noopener noreferrer"';
  var MOCK_KEY = "things.corrections.mock.v1";
  var RATE_KEY = "things.corrections.rate.v1";
  var RATE_MAX = 40;
  var RATE_MS = 10 * 60 * 1000;
  var st = { q: "", f: { town: [], day: [], type: [], substance: [], age: [], cost: [] } };
  var corrItem = null;
  var corrBusy = false;
  var filterGroups = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fill(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; }); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function typeLabel(t) { return (DATA.type_labels && DATA.type_labels[t]) || C.typeLabels[t] || pretty(t); }
  function pretty(s) { return String(s || "").replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function isMock() { return C.correctionsMode !== "live"; }

  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var m = months[+p[1] - 1];
    if (!m) return iso;
    return m + " " + (+p[2]) + ", " + p[0];
  }

  function townOptions() {
    var seen = {};
    DATA.items.forEach(function (it) { if (it.town) seen[it.town] = true; });
    return Object.keys(seen).sort().map(function (t) { return { value: t, label: t }; });
  }
  function dayOptions() {
    var seen = {};
    DATA.items.forEach(function (it) { (it.days || []).forEach(function (d) { seen[d] = true; }); });
    return (C.dayOrder || []).filter(function (d) { return seen[d]; }).map(function (d) {
      return { value: d, label: (C.dayLabels && C.dayLabels[d]) || pretty(d) };
    });
  }
  function typeOptions() {
    var seen = {};
    DATA.items.forEach(function (it) { (it.types || []).forEach(function (t) { seen[t] = true; }); });
    var known = Object.keys(C.typeLabels || {});
    var rest = Object.keys(seen).filter(function (t) { return known.indexOf(t) < 0; }).sort();
    return known.filter(function (t) { return seen[t]; }).concat(rest).map(function (t) {
      return { value: t, label: typeLabel(t) };
    });
  }

  function buildGroups() {
    filterGroups = [
      { key: "town", label: T.filterTown, options: townOptions() },
      { key: "day", label: T.filterDay, options: dayOptions() },
      { key: "type", label: T.filterType, options: typeOptions() },
      { key: "substance", label: T.filterSubstance, options: [{ value: "yes", label: T.substanceYes }] },
      { key: "age", label: T.filterAge, options: [
        { value: "all-ages", label: C.ageLabels["all-ages"] },
        { value: "18+", label: C.ageLabels["18+"] },
        { value: "21+", label: C.ageLabels["21+"] }
      ] },
      { key: "cost", label: T.filterCost, options: [
        { value: "free", label: C.costLabels.free },
        { value: "paid", label: C.costLabels.paid },
        { value: "unknown", label: C.costLabels.unknown }
      ] }
    ];
  }

  function match(it) {
    var f = st.f;
    if (st.q) {
      var hay = norm([it.event, it.venue, it.town, it.address, (it.types || []).map(typeLabel).join(" "), it.day_schedule, it.time].join(" "));
      if (norm(st.q).split(/\s+/).some(function (w) { return w && hay.indexOf(w) < 0; })) return false;
    }
    if (f.town.length && f.town.indexOf(it.town) < 0) return false;
    if (f.day.length && !f.day.some(function (d) { return (it.days || []).indexOf(d) >= 0; })) return false;
    if (f.type.length && !f.type.some(function (t) { return (it.types || []).indexOf(t) >= 0; })) return false;
    if (f.substance.length && f.substance.indexOf("yes") >= 0 && !it.substance_free) return false;
    if (f.age.length && f.age.indexOf(it.age) < 0) return false;
    if (f.cost.length && f.cost.indexOf(it.cost_kind) < 0) return false;
    return true;
  }

  function banner(it) {
    if (it.unverified) {
      var head = it.unverified_label || T.unverified;
      var note = it.unverified_note || "";
      return '<div class="pk-unconf unverified" role="note"><p class="pk-unconf-h">' + esc(head) + "</p>" + (note ? "<p>" + esc(note) + "</p>" : "") + "</div>";
    }
    if (it.unconfirmed) {
      return '<div class="pk-unconf" role="note"><p class="pk-unconf-h">' + esc(T.notConfirmed) + "</p><p>" + esc(it.unconfirmed_note || "") + "</p></div>";
    }
    return "";
  }

  function tags(it) {
    var out = [];
    if (it.age) out.push("<li>" + esc(C.ageLabels[it.age] || it.age) + "</li>");
    if (it.substance_free) out.push('<li class="sf">' + esc(T.substanceFree) + "</li>");
    (it.types || []).forEach(function (t) { out.push("<li>" + esc(typeLabel(t)) + "</li>"); });
    return out.length ? '<ul class="td-tags">' + out.join("") + "</ul>" : "";
  }

  function notes(it) {
    var bits = [];
    if (it.hours_note) bits.push("<p class=\"td-note\">" + esc(it.hours_note) + "</p>");
    if (it.age_note) bits.push("<p class=\"td-note\">" + esc(it.age_note) + "</p>");
    if (it.annual && it.annual_note) bits.push("<p class=\"td-note\">" + esc(it.annual_note) + "</p>");
    return bits.join("");
  }

  function links(it) {
    var parts = [];
    if (it.source_url) parts.push('<a data-venue href="' + esc(it.source_url) + '"' + EXT + ">" + esc(it.unverified ? (T.sourceLink || "Source page") : T.venueLink) + "</a>");
    if (it.directions_url) parts.push('<a data-dir href="' + esc(it.directions_url) + '"' + EXT + ">" + esc(T.directions) + "</a>");
    return parts.length ? '<p class="pk-links">' + parts.join(" &middot; ") + "</p>" : "";
  }

  function card(it) {
    var schedule = [it.day_schedule, it.time].filter(Boolean).join(" · ");
    var cls = "pk-card";
    if (it.unconfirmed) cls += " is-unconf";
    if (it.unverified) cls += " is-unverified";
    return '<article class="' + cls + '" data-id="' + esc(it.id) + '">' +
      banner(it) +
      "<h2>" + esc(it.event) + "</h2>" +
      '<p class="pk-where">' + esc(it.venue) + " · " + esc(it.town) + "</p>" +
      '<ul class="pk-facts">' +
        (schedule ? "<li><b>When:</b> " + esc(schedule) + "</li>" : "") +
        (it.venue_hours ? "<li><b>Venue hours:</b> " + esc(it.venue_hours) + "</li>" : "") +
        (it.cost ? "<li><b>Cost:</b> " + esc(it.cost) + "</li>" : "") +
      "</ul>" +
      tags(it) +
      notes(it) +
      links(it) +
      '<p class="pk-confirm">' + esc(T.confirm) + "</p>" +
      '<p class="pk-bottom">' +
        (it.last_checked ? esc(fill(T.lastChecked, { d: fmtDate(it.last_checked) })) : "") +
        ' · <button class="linkbtn" type="button" data-corr>' + esc(T.suggest) + "</button>" +
      "</p></article>";
  }

  function drawRadii() {
    $("td-radii").innerHTML = '<button class="chip filters" type="button" id="td-fbtn" aria-expanded="' + (!$("td-panel").hidden) + '">' + esc(T.filtersButton) + "</button>";
    $("td-fbtn").onclick = function () { $("td-panel").hidden = !$("td-panel").hidden; drawPanel(); drawRadii(); };
  }

  function drawPanel() {
    if ($("td-panel").hidden) return;
    var h = filterGroups.map(function (g) {
      return '<div class="pk-group"><h3>' + esc(g.label) + "</h3><div class=\"pk-row\">" +
        g.options.map(function (o) {
          var on = st.f[g.key].indexOf(o.value) >= 0;
          return '<button class="chip" type="button" data-g="' + esc(g.key) + '" data-v="' + esc(o.value) + '" aria-pressed="' + on + '">' + esc(o.label) + "</button>";
        }).join("") + "</div></div>";
    }).join("");
    h += '<div class="pk-row"><button class="btn ghost" type="button" id="td-fdone">' + esc(T.filtersDone) + "</button></div>";
    $("td-panel").innerHTML = h;
    $("td-panel").querySelectorAll("[data-g]").forEach(function (b) { b.onclick = function () { toggle(b.dataset.g, b.dataset.v); }; });
    $("td-fdone").onclick = function () { $("td-panel").hidden = true; drawRadii(); };
  }

  function toggle(g, v) {
    var a = st.f[g], i = a.indexOf(v);
    if (i >= 0) a.splice(i, 1); else a.push(v);
    drawPanel(); render();
  }

  function drawActive() {
    var pills = [];
    filterGroups.forEach(function (g) {
      g.options.forEach(function (o) {
        if (st.f[g.key].indexOf(o.value) >= 0) {
          pills.push('<button class="pill" type="button" data-g="' + esc(g.key) + '" data-v="' + esc(o.value) + '" aria-label="Remove ' + esc(o.label) + '">' + esc(o.label) + ' <span aria-hidden="true">&times;</span></button>');
        }
      });
    });
    var el = $("td-active");
    el.innerHTML = pills.join("") + (pills.length ? ' <button class="linkbtn" type="button" id="td-clear">' + esc(T.clearFilters) + "</button>" : "");
    el.querySelectorAll("[data-g]").forEach(function (b) { b.onclick = function () { toggle(b.dataset.g, b.dataset.v); }; });
    if (pills.length) $("td-clear").onclick = function () {
      Object.keys(st.f).forEach(function (k) { st.f[k] = []; });
      drawPanel(); render();
    };
  }

  function render() {
    var list = DATA.items.filter(match);
    var n = list.length;
    $("td-results").textContent = fill(T.results, { n: n, things: n === 1 ? T.resultsOne : T.resultsMany });
    $("td-grid").innerHTML = list.map(card).join("");
    $("td-empty").hidden = n > 0;
    if (n === 0) $("td-empty").textContent = T.empty;
    drawActive();
    $("td-grid").querySelectorAll(".pk-card").forEach(function (el) {
      var it = byId(el.dataset.id);
      var cb = el.querySelector("[data-corr]");
      if (cb) cb.onclick = function () { openCorr(it); };
    });
  }

  function byId(id) {
    for (var i = 0; i < DATA.items.length; i++) if (DATA.items[i].id === id) return DATA.items[i];
    return null;
  }

  function rateStamps() {
    try {
      var a = JSON.parse(localStorage.getItem(RATE_KEY) || "[]");
      var cut = Date.now() - RATE_MS;
      return Array.isArray(a) ? a.filter(function (t) { return typeof t === "number" && t > cut; }) : [];
    } catch (e) { return []; }
  }
  function rateOk() { return rateStamps().length < RATE_MAX; }
  function rateHit() {
    var a = rateStamps(); a.push(Date.now());
    try { localStorage.setItem(RATE_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function mockSave(row) {
    try {
      var a = JSON.parse(localStorage.getItem(MOCK_KEY) || "[]");
      if (!Array.isArray(a)) a = [];
      a.push(row);
      localStorage.setItem(MOCK_KEY, JSON.stringify(a));
    } catch (e) {}
  }

  function openCorr(it) {
    corrItem = it || null;
    $("corr-form").reset();
    $("corr-err").textContent = "";
    $("corr-form").hidden = false;
    $("corr-ok").hidden = true;
    $("corr-event").textContent = it ? (it.event + " · " + it.venue) : "";
    $("corr-event").hidden = !it;
    $("dlg-corr").showModal();
    $("corr-what").focus();
  }

  function bindCorr() {
    $("corr-h").textContent = T.corrTitle;
    $("corr-lead").textContent = T.corrLead;
    $("corr-stage").textContent = isMock() ? T.corrStage : "";
    $("corr-stage").hidden = !isMock();
    $("corr-what-l").textContent = T.corrWhat;
    $("corr-where-l").textContent = T.corrWhere;
    $("corr-send").textContent = T.corrSend;
    document.querySelectorAll("[data-close]").forEach(function (b) {
      b.textContent = T.close;
      b.onclick = function () { b.closest("dialog").close(); };
    });
    $("td-tell").textContent = T.tell;
    $("td-tell").onclick = function () { openCorr(null); };
    $("corr-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (corrBusy) return;
      var done = function () {
        $("corr-ok-msg").textContent = isMock() ? T.corrThanksMock : T.corrThanks;
        $("corr-form").hidden = true;
        $("corr-ok").hidden = false;
      };
      if ($("corr-site").value) return done();
      var what = $("corr-what").value.trim();
      if (what.length < 3) { $("corr-err").textContent = T.corrWhat; return; }
      if (!rateOk()) { $("corr-err").textContent = T.rateLimit; return; }
      corrBusy = true; $("corr-send").disabled = true;
      if (isMock()) {
        rateHit();
        mockSave({ at: Date.now(), thing_id: corrItem ? corrItem.id : "", what_to_fix: what, where_seen: $("corr-where").value.trim() });
        done();
        corrBusy = false; $("corr-send").disabled = false;
        return;
      }
      $("corr-err").textContent = T.sendFail;
      corrBusy = false; $("corr-send").disabled = false;
    });
  }

  function fillChrome() {
    $("td-kicker").textContent = T.kicker;
    $("td-title").textContent = T.title;
    $("td-intro").textContent = T.intro;
    $("td-note").textContent = T.note;
    $("td-foot").textContent = T.footer;
    $("td-back").textContent = "\u2190 " + T.backLink;
    $("td-q").placeholder = T.searchPlaceholder;
    document.title = T.title + " · Eclectic Transformation";
  }

  function start(data) {
    DATA = data;
    if (!DATA.type_labels) DATA.type_labels = {};
    buildGroups();
    fillChrome();
    bindCorr();
    drawRadii();
    var qT;
    $("td-q").addEventListener("input", function () {
      clearTimeout(qT);
      qT = setTimeout(function () { st.q = $("td-q").value.trim(); render(); }, 120);
    });
    render();
  }

  fetch(C.dataUrl, { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("load");
    return r.json();
  }).then(start).catch(function () {
    fillChrome();
    $("td-results").textContent = T.loadError;
  });
})();
