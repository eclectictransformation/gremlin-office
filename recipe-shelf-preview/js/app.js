/* Business: Eclectic Transformation. Recipes area (Reading Corner). Plain JS, no build step. */
(function () {
  "use strict";
  var DATA_URL = "data/recipes.json";
  var SAVE_KEY = "et-recipes-saved-v1";
  var HAVE_KEY = "et-recipes-have-v1";
  var main = document.getElementById("main");
  var ld = document.getElementById("ld-json");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DB = { categories: [], books: [], recipes: [], comingSoonTitles: {} };
  var PORTIONS = { double: { f: 2, label: "Double" }, full: { f: 1, label: "Full" }, half: { f: 0.5, label: "Half" }, quarter: { f: 0.25, label: "Quarter" } };
  var DEFAULT_PORTIONS = { quarts: ["full", "half", "quarter"], servings: ["double", "full", "half"] };
  var SORTS = {
    az: "A to Z", "quarts-desc": "Most quarts first", "quarts-asc": "Fewest quarts first",
    serves: "Fewest servings first", "serves-desc": "Most servings first", time: "Quickest first"
  };
  var GROUPS = [
    ["produce", "Produce"], ["meat", "Meat & fish"], ["frozen", "Frozen"],
    ["dairy-eggs", "Dairy & eggs"], ["pantry", "Pantry"], ["equipment", "Equipment"]
  ];
  var NOTE_KIND = { aside: "From Bryan", substitution: "Swap it", sourcing: "Where to find it" };
  var sortState = {}; // per list: "home", "saved", "book:<id>", "cat:<id>"
  var surpriseSlugs = {};
  var surpriseScope = "all";
  var surpriseNav = false;
  var surpriseLock = false;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- quantity math (exported for tests via window.ETR) ---------- */
  var VOL = { tsp: 1, tbsp: 3, cup: 48, quart: 192, gallon: 768 };
  var WT = { oz: 1, lb: 16 };
  var FRACS = [[0, ""], [1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [3 / 8, "3/8"], [1 / 2, "1/2"],
    [5 / 8, "5/8"], [2 / 3, "2/3"], [3 / 4, "3/4"], [7 / 8, "7/8"], [1, ""]];
  function roundFrac(v) {
    var w = Math.floor(v), r = v - w, best = FRACS[0];
    for (var i = 1; i < FRACS.length; i++) if (Math.abs(FRACS[i][0] - r) < Math.abs(best[0] - r)) best = FRACS[i];
    if (best[0] === 1) return { value: w + 1, text: String(w + 1) };
    var t = w ? (best[1] ? w + " " + best[1] : String(w)) : (best[1] || "0");
    return { value: w + best[0], text: t };
  }
  function unitLabel(u, v) {
    if (!u) return "";
    var fixed = { tsp: "tsp", tbsp: "tbsp", lb: "lb", oz: "oz" };
    if (fixed[u]) return fixed[u];
    if (v <= 1) return u;
    if (/(ch|sh|s|x)$/.test(u)) return u + "es";
    return u + "s";
  }
  function scaleQty(amount, unit, f) {
    if (amount == null || amount === "") return { text: "", value: null, unit: unit };
    var v = amount * f, u = unit;
    if (u && VOL[u]) {
      var order = ["gallon", "quart", "cup", "tbsp", "tsp"];
      var minFor = { gallon: 1, quart: 1, cup: 0.25, tbsp: 1, tsp: 0 };
      var i = order.indexOf(u);
      while (i < order.length - 1 && v < minFor[order[i]] - 1e-9) {
        v = v * VOL[order[i]] / VOL[order[i + 1]]; i++;
      }
      u = order[i];
      // step up when a larger unit reads cleanly (e.g. 4 tbsp -> 1/4 cup, 6 tsp -> 2 tbsp)
      var upMin = { tsp: 3, tbsp: 4 }; // never auto-convert cups to quarts (8 cups of spinach reads better than 2 quarts)
      while (i > 0 && upMin[order[i]] && v >= upMin[order[i]] - 1e-9 && order[i] !== "quart") {
        var nv = v * VOL[order[i]] / VOL[order[i - 1]];
        if (Math.abs(roundFrac(nv).value - nv) > 0.01 || (order[i] === "cup" && nv < 1)) break;
        v = nv; i--; u = order[i];
      }
    } else if (u === "lb" && v < 1 - 1e-9) { v = v * 16; u = "oz"; }
    var r = roundFrac(v);
    if (r.value === 0) return { text: "a pinch of", value: 0, unit: null, pinch: true };
    return { text: r.text, value: r.value, unit: u };
  }
  function qtyText(amount, unit, f) {
    var q = scaleQty(amount, unit, f);
    if (q.pinch) return "a pinch";
    if (!q.text) return "";
    var ul = unitLabel(q.unit, q.value);
    return q.text + (ul ? " " + ul : "");
  }
  function itemName(it, f) {
    if (it.itemSingular && it.amount != null) { var q = scaleQty(it.amount, it.unit, f); if (!q.unit && q.value != null && q.value <= 1) return it.itemSingular; }
    return it.item;
  }
  window.ETR = { scaleQty: scaleQty, qtyText: qtyText };

  /* ---------- saved (visitor's own browser only) ---------- */
  function getSaved() {
    try { var a = JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function setSaved(a) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(a)); } catch (e) {} updateSavedCount(); }
  function isSaved(slug) { return getSaved().indexOf(slug) !== -1; }
  function toggleSave(slug) {
    var a = getSaved(), i = a.indexOf(slug);
    if (i === -1) a.push(slug); else a.splice(i, 1);
    setSaved(a);
    return i === -1;
  }
  function updateSavedCount() {
    var n = getSaved().filter(function (s) { return recipeBySlug(s); }).length;
    var c = document.getElementById("saved-count");
    c.textContent = n; c.setAttribute("aria-label", n + " saved recipe" + (n === 1 ? "" : "s"));
  }
  function saveBtn(slug, compact) {
    var s = isSaved(slug);
    return '<button type="button" class="save' + (compact ? " compact" : "") + '" data-save="' + esc(slug) + '" aria-pressed="' + s + '">' +
      '<span class="save-ico" aria-hidden="true">' + (s ? "★" : "☆") + "</span>" +
      '<span class="save-txt">' + (s ? "Saved" : "Save for later") + "</span></button>";
  }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------- pantry checks & sharing (visitor's own device only) ---------- */
  function getHaveMap() {
    try {
      var o = JSON.parse(localStorage.getItem(HAVE_KEY) || "{}");
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }
  }
  function getHave(slug) {
    var a = getHaveMap()[slug];
    if (!Array.isArray(a)) return [];
    return a.map(function (n) { return +n; }).filter(function (n) { return n >= 0 && n % 1 === 0; });
  }
  function setHave(slug, idxs) {
    try {
      var o = getHaveMap();
      var clean = [];
      (idxs || []).forEach(function (n) {
        n = +n;
        if (n >= 0 && n % 1 === 0 && clean.indexOf(n) === -1) clean.push(n);
      });
      clean.sort(function (a, b) { return a - b; });
      if (!clean.length) delete o[slug]; else o[slug] = clean;
      localStorage.setItem(HAVE_KEY, JSON.stringify(o));
    } catch (e) {}
  }
  function hasNativeShare(data) {
    if (!navigator.share) return false;
    if (typeof navigator.canShare !== "function") return true;
    try { return data ? !!navigator.canShare(data) : true; } catch (e) { return false; }
  }
  function recipePageUrl(slug, portion) {
    var hash = "#/r/" + encodeURIComponent(slug) + (portion && portion !== "full" ? "/" + portion : "");
    return location.href.split("#")[0] + hash;
  }
  function portionPhrase(p) {
    return PORTIONS[p] ? PORTIONS[p].label.toLowerCase() + " batch" : "full batch";
  }
  function resolvedPortion(r, portion) {
    var yt = yType(r);
    var popts = (r.portions && r.portions.length ? r.portions : DEFAULT_PORTIONS[yt]).filter(function (k) { return PORTIONS[k]; });
    return popts.indexOf(portion) !== -1 ? portion : "full";
  }
  function hashPortion() {
    var parts = parseHash();
    return parts[0] === "r" ? parts[2] : "";
  }
  function ingLine(it, f, withPrep) {
    var amt = qtyText(it.amount, it.unit, f);
    var line = (amt ? amt + " " : "") + itemName(it, f);
    if (withPrep && it.prep) line += ", " + it.prep;
    if (it.optional) line += " (optional)";
    return line;
  }
  function normShopParts(s) {
    return String(s || "").toLowerCase().replace(/\([^)]*\)/g, " ").split(/[,:;]| and /)
      .map(function (p) { return p.replace(/\s+/g, " ").trim(); })
      .filter(function (p) { return p.length >= 3; });
  }
  function groupIdForIng(it, r) {
    var nameCore = (it.item || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    var skip = { or: 1, and: 1, the: 1, for: 1, with: 1, of: 1, can: 1, cans: 1, oz: 1 };
    var list = r.shopping || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].group === "equipment") continue;
      var items = list[i].items || [];
      for (var j = 0; j < items.length; j++) {
        var s = (items[j].item || "").toLowerCase();
        var sCore = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
        if (nameCore && sCore && (sCore.indexOf(nameCore) !== -1 || nameCore.indexOf(sCore) !== -1)) return list[i].group;
        var parts = normShopParts(s);
        for (var k = 0; k < parts.length; k++) {
          var part = parts[k];
          if (skip[part]) continue;
          if (nameCore.indexOf(part) !== -1 || part.indexOf(nameCore) !== -1) return list[i].group;
          var words = part.split(/\s+/);
          for (var w = 0; w < words.length; w++) {
            if (words[w].length < 4 || skip[words[w]]) continue;
            if (nameCore.indexOf(words[w]) !== -1) return list[i].group;
          }
        }
      }
    }
    return "";
  }
  function groupLabel(id) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][0] === id) return GROUPS[i][1];
    return "";
  }
  function stillNeedText(slug, portion) {
    var r = recipeBySlug(slug);
    if (!r) return "";
    var p = resolvedPortion(r, portion);
    var f = PORTIONS[p].f;
    var have = getHave(r.slug);
    var byGroup = {};
    var left = 0;
    r.ingredients.forEach(function (it, i) {
      if (have.indexOf(i) !== -1) return;
      left++;
      var g = groupIdForIng(it, r) || "";
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push("- " + ingLine(it, f, false));
    });
    if (!left) return "";
    var lines = [r.title + " (" + portionPhrase(p) + ")", ""];
    var ids = GROUPS.map(function (g) { return g[0]; }).filter(function (id) { return byGroup[id] && byGroup[id].length; });
    if (byGroup[""] && byGroup[""].length) ids.push("");
    var grouped = ids.some(function (g) { return g; });
    ids.forEach(function (g) {
      if (grouped) lines.push(groupLabel(g) || "Also");
      Array.prototype.push.apply(lines, byGroup[g]);
      if (grouped) lines.push("");
    });
    if (!grouped) lines.push("");
    lines.push(recipePageUrl(r.slug, p));
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
  }
  function recipeShareText(slug, portion) {
    var r = recipeBySlug(slug);
    if (!r) return "";
    var p = resolvedPortion(r, portion);
    return r.title + " (" + portionPhrase(p) + ")\n\nA recipe from the Eclectic Transformation Reading Corner.\n\n" + recipePageUrl(r.slug, p);
  }
  function recipeEmailText(slug, portion) {
    var r = recipeBySlug(slug);
    if (!r) return "";
    var p = resolvedPortion(r, portion);
    var f = PORTIONS[p].f;
    var lines = [r.title, "(" + portionPhrase(p) + ")", ""];
    if (r.summary) lines.push(r.summary, "");
    if (yType(r) === "servings" && servings(r)) lines.push("Serves " + roundFrac(servings(r) * f).text);
    if (quarts(r)) lines.push("Makes about " + roundFrac(quarts(r) * f).text + " qt");
    if (r.time && r.time.rough) lines.push("Time: " + r.time.rough);
    if (r.advisory) { lines.push("", r.advisory); }
    lines.push("", "Ingredients");
    r.ingredients.forEach(function (it) { lines.push("- " + ingLine(it, f, true)); });
    lines.push("", "Steps");
    r.steps.forEach(function (s, i) {
      lines.push((i + 1) + ". " + s.text);
      if (s.stove) {
        if (s.stove.electric) lines.push("   Electric: " + s.stove.electric);
        if (s.stove.gas) lines.push("   Gas: " + s.stove.gas);
      }
    });
    if (r.storage && r.storage.length) {
      lines.push("", "Storing it");
      r.storage.forEach(function (s) { lines.push("- " + s); });
    }
    lines.push("", recipePageUrl(r.slug, p));
    return lines.join("\n");
  }
  function mailtoHref(subject, body) {
    return "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      toast(ok ? "Copied" : "Select the list and copy it yourself.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied"); }).catch(fallback);
    } else fallback();
  }
  function nativeShare(data, fallbackText) {
    if (data && hasNativeShare(data)) {
      navigator.share(data).catch(function (err) {
        if (err && err.name === "AbortError") return;
        if (fallbackText) copyText(fallbackText);
      });
      return;
    }
    if (fallbackText) copyText(fallbackText);
  }
  function recipeShareData(slug, portion) {
    var r = recipeBySlug(slug);
    if (!r) return { data: null, fallback: "" };
    var p = resolvedPortion(r, portion);
    var url = recipePageUrl(r.slug, p);
    var title = r.title;
    var short = r.title + " (" + portionPhrase(p) + ")\n\nA recipe from the Eclectic Transformation Reading Corner.";
    var withUrl = { title: title, text: short, url: url };
    var textOnly = { title: title, text: short + "\n\n" + url };
    if (hasNativeShare(withUrl)) return { data: withUrl, fallback: textOnly.text };
    if (hasNativeShare(textOnly)) return { data: textOnly, fallback: textOnly.text };
    return { data: null, fallback: textOnly.text };
  }
  function needPanelHtml(r, p) {
    var text = stillNeedText(r.slug, p);
    var have = getHave(r.slug);
    var total = r.ingredients.length;
    var haveN = have.filter(function (i) { return i < total; }).length;
    var left = total - haveN;
    var allHave = total > 0 && left === 0;
    var status = allHave ? "You've got everything!" : (left === 1 ? "1 item" : left + " items");
    var shareData = { title: "Shopping list: " + r.title, text: text };
    var html = '<div class="need no-print" id="need-panel">' +
      '<div class="need-head"><h3 id="need-h">What I still need</h3></div>' +
      '<p class="need-status" id="need-status" aria-live="polite">' + status + "</p>";
    if (!allHave) {
      html += '<pre class="need-preview" id="need-text">' + esc(text) + "</pre>";
      html += '<div class="need-actions">';
      if (hasNativeShare(shareData)) html += '<button type="button" class="text-act" data-need-share>Share</button>';
      html += '<button type="button" class="text-act" data-need-copy>Copy</button>';
      html += '<a class="text-act" data-need-email href="' + esc(mailtoHref("Shopping list: " + r.title, text)) + '">Email</a>';
      html += '<button type="button" class="text-act" data-need-print>Print list</button></div>';
      html += '<p class="need-hint">Nothing leaves this device unless you choose to send it.</p>';
    }
    return html + "</div>";
  }
  function paintNeed(art) {
    if (!art) return;
    var r = recipeBySlug(art.dataset.slug);
    if (!r) return;
    var p = resolvedPortion(r, hashPortion());
    var mount = document.getElementById("need-panel");
    if (mount) {
      var wrap = document.createElement("div");
      wrap.innerHTML = needPanelHtml(r, p);
      mount.parentNode.replaceChild(wrap.firstChild, mount);
    }
    var have = getHave(r.slug);
    var clear = art.querySelector("[data-clear-have]");
    if (clear) clear.hidden = !have.length;
  }
  function endListPrint() {
    document.body.classList.remove("print-need");
    var box = document.getElementById("need-print");
    if (box) { box.hidden = true; box.innerHTML = ""; }
  }

  /* ---------- data ---------- */
  function visible(item) { return !item.example || DB.showExamples; }
  function recipeBySlug(s) {
    for (var i = 0; i < DB.recipes.length; i++) if (DB.recipes[i].slug === s) return DB.recipes[i];
    return null;
  }
  function bookById(id) {
    for (var i = 0; i < DB.books.length; i++) if (DB.books[i].id === id) return DB.books[i];
    return null;
  }
  function categoryById(id) {
    for (var i = 0; i < DB.categories.length; i++) if (DB.categories[i].id === id) return DB.categories[i];
    return null;
  }
  function categoriesSorted() {
    return DB.categories.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function booksInCategory(id) {
    return DB.books.filter(function (b) { return b.categoryId === id && visible(b); });
  }
  function yType(r) { return r.yieldType || (r.yield && r.yield.type) || (r.yield && r.yield.batchQuarts ? "quarts" : "servings"); }
  function quarts(r) { return (r.yield && r.yield.batchQuarts) || 0; }
  function servings(r) { return (r.yield && r.yield.servings) || null; }
  function minutes(r) { return (r.time && r.time.totalMinutes) || null; }
  function nullsLast(a, b, dir) { if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; return dir * (a - b); }
  function sortRecipes(list, mode) {
    var l = list.slice(), az = function (a, b) { return a.title.localeCompare(b.title); };
    var cmp = {
      "quarts-desc": function (a, b) { return nullsLast(quarts(a) || null, quarts(b) || null, -1) || az(a, b); },
      "quarts-asc": function (a, b) { return nullsLast(quarts(a) || null, quarts(b) || null, 1) || az(a, b); },
      serves: function (a, b) { return nullsLast(servings(a), servings(b), 1) || az(a, b); },
      "serves-desc": function (a, b) { return nullsLast(servings(a), servings(b), -1) || az(a, b); },
      time: function (a, b) { return nullsLast(minutes(a), minutes(b), 1) || az(a, b); }
    }[mode] || az;
    return l.sort(cmp);
  }
  /* sort options for a list: a book's own sortOptions, or neutral ones (quarts only if any big-batch recipe is in the list) */
  function sortOptionsFor(list, book) {
    if (book && book.sortOptions && book.sortOptions.length) return book.sortOptions.filter(function (k) { return SORTS[k]; });
    var o = ["az", "serves", "time"];
    if (list.some(function (r) { return yType(r) === "quarts"; })) o.push("quarts-desc");
    return o;
  }
  function currentSort(ctx, opts, book) {
    var s = sortState[ctx];
    if (s && opts.indexOf(s) !== -1) return s;
    if (book && book.defaultSort && opts.indexOf(book.defaultSort) !== -1) return book.defaultSort;
    return opts[0];
  }
  function yieldBadge(r) {
    if (yType(r) === "quarts") return '<span class="rcard-q" aria-label="Makes about ' + quarts(r) + ' quarts"><b>' + quarts(r) + "</b><small>qt</small></span>";
    var n = servings(r);
    return '<span class="rcard-q serves" aria-label="Serves ' + (n || "a few") + '"><small>serves</small><b>' + (n || "~") + "</b></span>";
  }
  function bookRecipes(b) {
    return (b.sampleSlugs || []).map(recipeBySlug).filter(function (r) { return r && visible(r); });
  }
  function parseHash() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    var parts = h.split("/").filter(Boolean);
    if (parts[0] === "category") parts[0] = "c";
    if (parts[0] === "book") parts[0] = "b";
    if (parts[0] === "recipe") parts[0] = "r";
    return parts;
  }
  function surprisePool(scope) {
    return DB.recipes.filter(function (r) {
      if (r.status !== "approved" || !visible(r)) return false;
      var b = bookById(r.book);
      if (!b || !visible(b)) return false;
      if (scope && scope !== "all" && b.categoryId !== scope) return false;
      return bookRecipes(b).length > 0;
    });
  }
  function pickSurprise(scope, exceptSlug) {
    var pool = surprisePool(scope);
    if (exceptSlug && pool.length > 1) pool = pool.filter(function (r) { return r.slug !== exceptSlug; });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function goSurprise(scope, exceptSlug) {
    if (surpriseLock) return;
    var r = pickSurprise(scope, exceptSlug);
    if (!r) { toast("Nothing to open here yet."); return; }
    surpriseScope = scope || "all";
    surpriseSlugs[r.slug] = true;
    surpriseNav = true;
    var hash = "#/r/" + encodeURIComponent(r.slug);
    if (reduceMotion) { location.hash = hash; return; }
    surpriseLock = true;
    main.classList.add("is-leaving");
    window.setTimeout(function () { surpriseLock = false; location.hash = hash; }, 500);
  }
  window.ETR.surprisePool = surprisePool;
  window.ETR.goSurprise = goSurprise;
  window.ETR.stillNeedText = stillNeedText;
  window.ETR.recipeShareText = recipeShareText;
  window.ETR.recipeEmailText = recipeEmailText;
  window.ETR.mailtoHref = mailtoHref;
  window.ETR.hasNativeShare = hasNativeShare;
  window.ETR.recipePageUrl = recipePageUrl;

  /* ---------- small UI parts ---------- */
  function exBadge(item) { return item.example ? '<span class="badge ex" title="Placeholder content, not a real recipe yet">Example</span>' : ""; }
  function wtBadge(b) { return b.workingTitle ? '<span class="badge wt">Working title</span>' : ""; }
  function coverArt(kind) {
    var a = {
      pot: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 26h44v6c0 12-9 20-22 20S10 44 10 32z" fill="currentColor"/><rect x="6" y="24" width="52" height="5" rx="2.5" fill="currentColor"/><path d="M24 18c0-4 4-4 4-8M32 18c0-4 4-4 4-8M40 18c0-4 4-4 4-8" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
      leaf: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 50C14 26 30 12 52 12c0 24-14 38-38 38z" fill="currentColor"/><path d="M14 50L40 24" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round"/></svg>',
      jar: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="8" width="20" height="7" rx="2" fill="currentColor"/><path d="M20 18h24c3 0 5 3 5 6v26c0 4-3 7-7 7H22c-4 0-7-3-7-7V24c0-3 2-6 5-6z" fill="currentColor"/><path d="M22 32h20" stroke="var(--c)" stroke-width="2.5" stroke-linecap="round"/></svg>',
      cup: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 20h32v8c0 12-7 22-16 22S12 40 12 28z" fill="currentColor"/><path d="M44 24h6c5 0 8 4 8 8s-3 8-8 8h-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M18 56h24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
      herb: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 56V14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M32 42c-12-2-18-12-18-22 12 0 18 10 18 22zM32 38c12-2 18-12 18-22-12 0-18 10-18 22zM32 26c-9-2-14-9-14-16 9 0 14 7 14 16zM32 24c9-2 14-9 14-16-9 0-14 7-14 16z" fill="currentColor"/></svg>',
      dropper: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="26" y="6" width="12" height="10" rx="2" fill="currentColor"/><path d="M24 16h16v8H24z" fill="currentColor"/><path d="M28 24h8v22l-4 12-4-12z" fill="currentColor"/></svg>',
      glass: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 8h28l-4 30c-1 8-7 14-10 14s-9-6-10-14z" fill="currentColor"/><path d="M32 52v8M22 60h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/></svg>'
    };
    return a[kind] || a.pot;
  }
  function recipeCard(r, showBook) {
    var b = bookById(r.book), extra = [];
    if (showBook && b) extra.push(b.title + (b.workingTitle ? " (working title)" : ""));
    if (yType(r) === "quarts" && servings(r)) extra.push("serves about " + servings(r));
    if (yType(r) === "servings" && quarts(r)) extra.push("about " + quarts(r) + " qt");
    return '<li class="rcard">' +
      '<a class="rcard-link" href="#/r/' + esc(r.slug) + '">' + yieldBadge(r) +
      '<span class="rcard-body"><span class="rcard-title">' + esc(r.title) + "</span>" +
      '<span class="rcard-meta">' + esc([r.section].concat(extra).filter(Boolean).join(" · ")) + (r.time && r.time.rough ? " · " + esc(r.time.rough) : "") + "</span>" +
      '<span class="rcard-badges">' + exBadge(r) + dietBadges(r) + (r.adultsOnly ? '<span class="badge adult">Adults only</span>' : "") + "</span></span></a>" + saveBtn(r.slug, true) + "</li>";
  }
  function sortControl(ctx, opts, cur) {
    if (opts.length < 2) return "";
    return '<div class="sortbar"><label for="sort-' + esc(ctx.replace(/[^a-z0-9]/gi, "-")) + '">Sort by</label>' +
      '<select id="sort-' + esc(ctx.replace(/[^a-z0-9]/gi, "-")) + '" data-sort="' + esc(ctx) + '">' +
      opts.map(function (k) { return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + SORTS[k] + "</option>"; }).join("") +
      "</select></div>";
  }
  function dietBadges(r) {
    return (r.diet || []).map(function (d) { return '<span class="badge diet">' + esc(d) + "</span>"; }).join("");
  }
  function teaser(b) {
    var f = b.formats || {}, btns = "";
    var defs = [["pdf", "PDF (digital)"], ["print", "Hard copy (print)"]];
    defs.forEach(function (d) {
      var fm = f[d[0]];
      if (!fm) return; // this book doesn't offer the format, so no button
      if (fm.available && fm.url) {
        btns += '<a class="btn fmt" href="' + esc(fm.url) + '" rel="noopener">' + d[1] + "</a>";
      } else {
        btns += '<button type="button" class="btn fmt" disabled aria-disabled="true">' + d[1] +
          ' <span class="soon">Coming soon</span></button>';
      }
    });
    return '<aside class="teaser" aria-label="The full book">' +
      "<p>" + esc(b.printTeaser || "The full book will be offered here when it's ready.") + "</p>" +
      (btns ? '<div class="fmt-row">' + btns + "</div>" : "") + "</aside>";
  }
  function crumbs(items) {
    var trail = items.map(function (it, i) {
      var last = i === items.length - 1;
      if (last || !it.href) return '<span aria-current="page">' + esc(it.label) + "</span>";
      return '<a href="' + esc(it.href) + '">' + esc(it.label) + "</a>";
    }).join(' <span aria-hidden="true">›</span> ');
    var prev = null;
    for (var i = items.length - 2; i >= 0; i--) if (items[i].href) { prev = items[i]; break; }
    var back = prev ? '<a class="back-link" href="' + esc(prev.href) + '">Back' + (prev.backLabel ? " to " + esc(prev.backLabel) : "") + "</a>" : "";
    return '<nav class="crumbs" aria-label="Breadcrumb">' + back + '<span class="crumb-trail">' + trail + "</span></nav>";
  }
  function surpriseBtn(scope, label) {
    var pool = surprisePool(scope);
    if (!pool.length) return "";
    return '<button type="button" class="surprise" data-surprise="' + esc(scope || "all") + '" aria-label="Open a random recipe">' + esc(label || "Surprise me") + "</button>";
  }
  function bookShelf(books) {
    var html = '<div class="shelf" role="list">';
    books.forEach(function (b, i) {
      var soon = b.status === "coming-soon";
      html += '<div role="listitem" class="slot">' +
        '<a href="#/b/' + esc(b.id) + '" class="book' + (soon ? " soon" : "") + '" data-book="' + esc(b.id) + '" style="--c:' + esc(b.cover.color) + ";--a:" + esc(b.cover.accent) + ";--tilt:" + (i % 2 ? "-1.2deg" : "0.8deg") + '" ' +
        'aria-label="' + esc(b.title) + (b.workingTitle ? " (working title)" : "") + ". " + (soon ? "Coming soon." : "Open to sample recipes.") + '">' +
        '<span class="book-3d"><span class="spine" aria-hidden="true"><span>' + esc(b.title) + "</span></span>" +
        '<span class="pages" aria-hidden="true"></span>' +
        '<span class="cover"><span class="cover-art">' + coverArt(b.cover.art) + "</span>" +
        '<span class="cover-title">' + esc(b.title) + "</span>" +
        '<span class="cover-sub">' + esc(b.subtitle || "") + "</span>" +
        '<span class="cover-foot">Eclectic Transformation</span></span></span>' +
        (soon ? '<span class="ribbon" aria-hidden="true">Coming soon</span>' : "") +
        '</a><div class="book-tags">' + exBadge(b) + wtBadge(b) + "</div></div>";
    });
    html += '</div><div class="plank" aria-hidden="true"></div>';
    return html;
  }
  function sampleList(list, ctx, book) {
    if (!list.length) return "";
    var opts = sortOptionsFor(list, book), cur = currentSort(ctx, opts, book);
    return '<section class="allrec" aria-labelledby="allrec-h"><div class="sec-head"><h2 id="allrec-h">Sample recipes</h2>' + (list.length > 1 ? sortControl(ctx, opts, cur) : "") + "</div>" +
      '<ul class="rlist">' + sortRecipes(list, cur).map(function (r) { return recipeCard(r, !book); }).join("") + "</ul></section>";
  }

  /* ---------- views ---------- */
  function viewHome() {
    var cats = categoriesSorted();
    var html = '<section class="wrap home-view"><p class="eyebrow">Reading Corner</p>' +
      '<h1 tabindex="-1">The Recipe Shelf</h1>' +
      '<p class="lede">Choose a category to see its books, then open a book for a few recipes.</p>' +
      '<p class="surprise-row">' + surpriseBtn("all") + "</p>" +
      '<ul class="cats">';
    cats.forEach(function (c) {
      var soon = !!c.comingSoon;
      html += '<li><a class="cat' + (soon ? " soon" : "") + '" href="#/c/' + esc(c.id) + '">' +
        '<span class="cat-icon" aria-hidden="true">' + coverArt(c.icon) + "</span>" +
        '<span class="cat-text"><span class="cat-name">' + esc(c.name) + "</span>" +
        '<span class="cat-blurb">' + esc(c.blurb || "") + "</span>" +
        (soon ? '<span class="cat-soon">Coming soon</span>' : "") +
        "</span></a></li>";
    });
    html += "</ul></section>";
    return { html: html, title: "Recipes · Reading Corner" };
  }

  function viewCategory(id) {
    var c = categoryById(id);
    if (!c) return notFound("That category isn't on the shelf", "It may not be published yet.");
    var books = booksInCategory(c.id);
    var recs = [];
    books.forEach(function (b) { bookRecipes(b).forEach(function (r) { recs.push(r); }); });
    var html = '<section class="wrap shelf-view">' +
      crumbs([{ href: "#/", label: "Reading Corner", backLabel: "the shelf" }, { label: c.name }]) +
      (c.comingSoon ? '<p class="eyebrow">Coming soon</p>' : "") +
      '<h1 tabindex="-1">' + esc(c.name) + "</h1>" +
      '<p class="lede">' + esc(c.blurb || "") + "</p>" +
      '<p class="surprise-row">' + surpriseBtn(c.id) + "</p>";
    if (books.length) html += bookShelf(books);
    else html += '<div class="empty"><p>Books for this category will show up here.</p><a class="btn quiet" href="#/">Back to the shelf</a></div>';
    if (recs.length) html += sampleList(recs, "cat:" + c.id);
    html += "</section>";
    return { html: html, title: c.name + " · Recipes" };
  }

  function viewBook(id) {
    var b = bookById(id);
    if (!b || !visible(b)) return notFound("That book isn't on the shelf", "It may not be published yet.");
    var cat = categoryById(b.categoryId);
    var soon = b.status === "coming-soon";
    var recs0 = bookRecipes(b), bo = sortOptionsFor(recs0, b), bs = currentSort("book:" + b.id, bo, b);
    var recs = sortRecipes(recs0, bs);
    var left = '<div class="page left"><p class="eyebrow">' + (soon ? "Coming soon" : "A few recipes from") + "</p>" +
      '<h1 tabindex="-1">' + esc(b.title) + "</h1>" +
      '<div class="tags">' + exBadge(b) + wtBadge(b) + "</div>" +
      '<p class="sub">' + esc(b.subtitle || "") + "</p><p>" + esc(b.blurb || "") + "</p>" + teaser(b) + "</div>";
    var right = '<div class="page right">';
    if (!recs.length) {
      right += '<div class="soon-page"><span class="soon-art" style="--c:' + esc(b.cover.color) + '">' + coverArt(b.cover.art) + "</span>" +
        "<h2>Still in the pot</h2><p>This book isn't ready yet. When it is, a few sample recipes will show up right here.</p>" +
        '<a class="btn quiet" href="' + (cat ? "#/c/" + esc(cat.id) : "#/") + '">Back to ' + esc(cat ? cat.name : "the shelf") + "</a></div>";
    } else {
      right += (soon ? '<p class="peek-note">This book is still in the works. Here\'s a sneak peek.</p>' : "") +
        '<div class="sec-head"><h2>' + (soon ? "Sneak peek" : "Inside this book") + "</h2>" + (recs.length > 1 ? sortControl("book:" + b.id, bo, bs) : "") + "</div>" +
        '<ul class="rlist">' + recs.map(function (r) { return recipeCard(r); }).join("") + "</ul>" +
        '<p class="hint">Tap a recipe to open it. Use ☆ to save it for later without leaving this page.</p>';
    }
    right += "</div>";
    var trail = [{ href: "#/", label: "Reading Corner", backLabel: "the shelf" }];
    if (cat) trail.push({ href: "#/c/" + cat.id, label: cat.name, backLabel: cat.name });
    trail.push({ label: b.title });
    var html = '<section class="wrap book-view">' + crumbs(trail) +
      '<div class="spread' + (reduceMotion ? "" : " animate") + '" style="--c:' + esc(b.cover.color) + '">' + left + '<div class="gutter" aria-hidden="true"></div>' + right + "</div></section>";
    return { html: html, title: b.title + " · Recipes" };
  }

  function viewRecipe(slug, portion, showTry) {
    var r = recipeBySlug(slug);
    if (!r || r.status !== "approved" || !visible(r)) return notFound("That recipe isn't on the shelf", "It may not be published yet.");
    var yt = yType(r);
    var popts = (r.portions && r.portions.length ? r.portions : DEFAULT_PORTIONS[yt]).filter(function (k) { return PORTIONS[k]; });
    var p = popts.indexOf(portion) !== -1 ? portion : "full", f = PORTIONS[p].f;
    var b = bookById(r.book);
    var cat = b ? categoryById(b.categoryId) : null;
    var q = quarts(r) * f, qt = roundFrac(q).text;
    var serves = "";
    if (servings(r)) {
      var sv = roundFrac(servings(r) * f).text;
      serves = (yt === "quarts" ? "about " : "") + sv + (r.yield.servingsUnit ? " " + r.yield.servingsUnit : "");
    }
    var makes = "";
    if (quarts(r)) makes = '<li><span>Makes</span> about ' + qt + " qt" + (r.yield.basis && p === "full" ? " <small>(" + esc(r.yield.basis) + ")</small>" : "") + "</li>";
    var fin = r.yield && r.yield.finishedQuarts != null ? '<li><span>Finished</span> about ' + roundFrac(r.yield.finishedQuarts * f).text + " qt</li>" : "";

    var have = getHave(r.slug);
    var ing = r.ingredients.map(function (it, i) {
      var amt = qtyText(it.amount, it.unit, f);
      var checked = have.indexOf(i) !== -1;
      return '<li' + (checked ? ' class="have"' : "") + '><label class="ing-check">' +
        '<input type="checkbox" data-have data-ing="' + i + '"' + (checked ? " checked" : "") + ">" +
        '<span class="tick" aria-hidden="true"></span>' +
        '<span class="ing-text"><span class="sr">I have </span>' +
        (amt ? '<span class="amt">' + esc(amt) + "</span> " : "") +
        '<span class="item">' + esc(itemName(it, f)) + "</span>" +
        (it.prep ? '<span class="prep">, ' + esc(it.prep) + "</span>" : "") +
        (it.optional ? ' <span class="tag opt">optional</span>' : "") +
        (it.thisTime ? ' <span class="tag tt" title="This amount changes from batch to batch">this time</span>' : "") +
        "</span></label></li>";
    }).join("");

    var shop = GROUPS.map(function (g) {
      var grp = (r.shopping || []).filter(function (s) { return s.group === g[0]; })[0];
      if (!grp || !grp.items.length) return "";
      return '<div class="shop-g"><h4>' + g[1] + "</h4><ul>" + grp.items.map(function (it) {
        var sc = g[0] === "equipment" || it.scale === false ? 1 : f;
        var amt = qtyText(it.amount, it.unit, sc);
        return '<li><span class="box" aria-hidden="true"></span>' + (amt ? '<span class="amt">' + esc(amt) + "</span> " : "") + esc(itemName(it, sc)) + "</li>";
      }).join("") + "</ul></div>";
    }).join("");

    var steps = r.steps.map(function (s) {
      var stove = "";
      if (s.stove) {
        stove = '<div class="stove">' + (s.stove.electric ? '<p><span class="st-k">Electric</span> ' + esc(s.stove.electric) + "</p>" : "") +
          (s.stove.gas ? '<p><span class="st-k">Gas</span> ' + esc(s.stove.gas) + "</p>" : "") + "</div>";
      }
      return "<li><p>" + esc(s.text) + "</p>" + stove + "</li>";
    }).join("");

    var notes = (r.notes || []).map(function (n) {
      return '<li><span class="note-k">' + esc(NOTE_KIND[n.kind] || "Note") + "</span> " + esc(n.text) + "</li>";
    }).join("");
    var storage = (r.storage || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");

    var related = (r.related || []).map(function (s) {
      var rr = recipeBySlug(s);
      if (rr && rr.status === "approved" && visible(rr)) {
        return '<li class="rel"><a href="#/r/' + esc(rr.slug) + '">' + esc(rr.title) + ' <small>' + (yType(rr) === "quarts" ? quarts(rr) + " qt" : "serves " + (servings(rr) || "a few")) + "</small></a>" + saveBtn(rr.slug, true) + "</li>";
      }
      var t = (DB.comingSoonTitles || {})[s];
      return t ? '<li class="rel soon"><span>' + esc(t) + '</span> <span class="tag">coming soon</span></li>' : "";
    }).join("");

    var seg = popts.map(function (k) {
      return '<button type="button" class="seg-b" data-portion="' + k + '" aria-pressed="' + (k === p) + '">' + PORTIONS[k].label + "</button>";
    }).join("");

    var photo = r.photo && r.photo.src ? '<figure class="photo"><img src="' + esc(r.photo.src) + '" alt="' + esc(r.photo.alt || r.title) + '" loading="lazy"></figure>' : "";
    var trail = [{ href: "#/", label: "Reading Corner", backLabel: "the shelf" }];
    if (cat) trail.push({ href: "#/c/" + cat.id, label: cat.name, backLabel: cat.name });
    if (b) trail.push({ href: "#/b/" + b.id, label: b.title, backLabel: b.title });
    trail.push({ label: r.title });

    var tryAnother = "";
    if (showTry && surprisePool(surpriseScope).length > 1) {
      tryAnother = '<p class="try-row no-print"><button type="button" class="try-another" data-surprise="' + esc(surpriseScope) + '" data-except="' + esc(r.slug) + '" aria-label="Try another random recipe">Try another</button></p>';
    }

    var html = '<article class="wrap recipe" data-slug="' + esc(r.slug) + '">' +
      crumbs(trail) +
      '<header class="r-head"><p class="eyebrow">' + esc(r.section || "") + "</p>" +
      '<h1 tabindex="-1">' + esc(r.title) + "</h1>" +
      '<div class="tags">' + exBadge(r) + dietBadges(r) + (r.adultsOnly ? '<span class="badge adult">Adults only</span>' : "") + "</div>" +
      (r.summary ? '<p class="lede">' + esc(r.summary) + "</p>" : "") +
      '<ul class="facts">' + (yt === "servings" && serves ? '<li class="lead"><span>Serves</span> ' + esc(serves) + "</li>" : "") + makes + fin +
      (yt === "quarts" && serves ? "<li><span>Serves</span> " + esc(serves) + "</li>" : "") +
      (r.time && r.time.rough ? "<li><span>Time</span> " + esc(r.time.rough) + "</li>" : "") + "</ul>" +
      (r.advisory ? '<p class="advisory" role="note">' + esc(r.advisory) + "</p>" : "") +
      '<div class="r-tools no-print" role="toolbar" aria-label="Recipe tools"><div class="seg" role="group" aria-label="Portion size">' + seg + "</div>" +
      saveBtn(r.slug) + "</div>" +
      (function () {
        var info = recipeShareData(r.slug, p);
        var emailBody = recipeEmailText(r.slug, p);
        return '<div class="r-share no-print">' +
          (info.data
            ? '<button type="button" class="text-act" data-share-recipe>Share recipe</button>'
            : '<button type="button" class="text-act" data-copy-link>Copy link</button>') +
          '<a class="text-act" data-email-recipe href="' + esc(mailtoHref(r.title, emailBody)) + '">Email recipe</a>' +
          '<button type="button" class="text-act" data-print title="Opens the print dialog. Choose Save as PDF there.">Save as PDF</button></div>';
      }()) +
      '<p class="print-only print-portion">Portion: ' + PORTIONS[p].label + " batch</p>" +
      (((bookById(r.book) || {}).style === "intuitive") ? '<p class="thistime" role="note"><b>Amounts are what I used this time.</b> I cook by feel, so treat them as a guide' + (p !== "full" ? ", and scaled amounts are rounded" : "") + ". Taste as you go.</p>" : (p !== "full" ? '<p class="thistime" role="note">Scaled amounts are rounded to friendly measurements.</p>' : "")) + "</header>" +
      photo +
      '<div class="r-grid"><section class="col-a" aria-labelledby="ing-h"><h2 id="ing-h">Ingredients <small>' + (yt === "servings" && serves ? "serves " + esc(serves) : PORTIONS[p].label.toLowerCase() + " batch") + "</small></h2>" +
      '<ul class="ing" aria-live="polite">' + ing + "</ul>" +
      '<p class="ing-foot no-print"><span class="ing-hint">Tick what you already have.</span>' +
      '<button type="button" class="clear-checks" data-clear-have' + (have.length ? "" : " hidden") + '>Clear checks</button></p>' +
      needPanelHtml(r, p) +
      (shop ? '<details class="shop no-print" open><summary><h3>Shopping list</h3></summary><div class="shop-grid">' + shop + "</div></details>" : "") + "</section>" +
      '<section class="col-b" aria-labelledby="steps-h"><h2 id="steps-h">Steps</h2><ol class="steps">' + steps + "</ol>" +
      (storage ? '<h3>Storing it</h3><ul class="storage">' + storage + "</ul>" : "") +
      (notes ? '<h3>Notes</h3><ul class="notes">' + notes + "</ul>" : "") + "</section></div>" +
      (related ? '<section class="related no-print" aria-labelledby="rel-h"><h2 id="rel-h">Goes well with</h2><ul>' + related + "</ul></section>" : "") +
      tryAnother +
      (b ? '<p class="back-book no-print"><a href="#/b/' + esc(b.id) + '">Back to ' + esc(b.title) + "</a></p>" : "") +
      "</article>";
    setJsonLd(r, b);
    return { html: html, title: r.title + " · Recipes" };
  }

  function viewSaved() {
    var list = getSaved().map(recipeBySlug).filter(function (r) { return r && r.status === "approved" && visible(r); });
    var html = '<section class="wrap saved-view">' +
      crumbs([{ href: "#/", label: "Reading Corner", backLabel: "the shelf" }, { label: "Saved" }]) +
      '<p class="eyebrow">Saved for later</p><h1 tabindex="-1">Your saved recipes</h1>' +
      '<p class="lede">These are kept only in this browser on this device. No account needed.</p>';
    if (!list.length) html += '<div class="empty"><p>Nothing saved yet. Tap ☆ on any recipe to keep it here.</p><a class="btn" href="#/">Browse the shelf</a></div>';
    else { var so = sortOptionsFor(list), ss = currentSort("saved", so);
      html += sortControl("saved", so, ss) + '<ul class="rlist">' + sortRecipes(list, ss).map(function (r) { return recipeCard(r, true); }).join("") + "</ul>" +
      '<button type="button" class="btn quiet" data-clear-saved>Clear saved list</button>'; }
    html += "</section>";
    return { html: html, title: "Saved recipes" };
  }

  function notFound(title, msg) {
    return { html: '<section class="wrap"><h1 tabindex="-1">' + esc(title || "That recipe isn't on the shelf") + "</h1><p>" + esc(msg || "It may not be published yet.") + '</p><a class="btn" href="#/">Back to the shelf</a></section>', title: "Not found" };
  }

  function setJsonLd(r, b) {
    var j = {
      "@context": "https://schema.org", "@type": "Recipe", name: r.title,
      description: r.summary || undefined,
      recipeCategory: r.section || undefined,
      recipeYield: yType(r) === "quarts" ? quarts(r) + " quarts" : (servings(r) ? servings(r) + " servings" : undefined),
      suitableForDiet: (r.diet || []).indexOf("vegan") !== -1 ? "https://schema.org/VeganDiet" : undefined,
      totalTime: r.time && r.time.totalMinutes ? "PT" + r.time.totalMinutes + "M" : undefined,
      recipeIngredient: r.ingredients.map(function (it) {
        var a = qtyText(it.amount, it.unit, 1);
        return (a ? a + " " : "") + it.item + (it.prep ? ", " + it.prep : "") + (it.optional ? " (optional)" : "");
      }),
      recipeInstructions: r.steps.map(function (s) { return { "@type": "HowToStep", text: s.text }; }),
      author: { "@type": "Organization", name: "Eclectic Transformation", url: "https://eclectictransformation.com" },
      image: r.photo && r.photo.src ? r.photo.src : undefined,
      isPartOf: b ? { "@type": "Book", name: b.title } : undefined
    };
    ld.textContent = JSON.stringify(j);
  }

  /* ---------- router ---------- */
  function route() {
    var parts = parseHash(), v;
    var arriving = main.classList.contains("is-leaving");
    main.classList.remove("is-leaving");
    if (parts[0] !== "r") { ld.textContent = ""; surpriseSlugs = {}; }
    var fromSurprise = surpriseNav; surpriseNav = false;
    if (!parts.length) v = viewHome();
    else if (parts[0] === "c") v = viewCategory(decodeURIComponent(parts[1] || ""));
    else if (parts[0] === "b") v = viewBook(decodeURIComponent(parts[1] || ""));
    else if (parts[0] === "r") {
      var slug = decodeURIComponent(parts[1] || "");
      var showTry = !!(fromSurprise || surpriseSlugs[slug]);
      v = viewRecipe(slug, parts[2], showTry);
    }
    else if (parts[0] === "saved") v = viewSaved();
    else v = notFound("That page isn't on the shelf", "Try going back to the shelf.");
    var keepScroll = route.keepScroll; route.keepScroll = false;
    var y = window.scrollY;
    main.innerHTML = v.html;
    if (arriving && !reduceMotion) {
      main.classList.add("is-arriving");
      window.setTimeout(function () { main.classList.remove("is-arriving"); }, 520);
    }
    document.title = v.title + " · Eclectic Transformation";
    $all(".navlink").forEach(function (a) {
      var on = (a.dataset.nav === "saved" && parts[0] === "saved") || (a.dataset.nav === "shelf" && !parts.length);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (keepScroll) { window.scrollTo(0, y); }
    else {
      window.scrollTo(0, 0);
      var h1 = $("h1", main); if (h1 && route.ready) h1.focus({ preventScroll: true });
    }
    route.ready = true;
    postHeight();
  }

  function postHeight() {
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: "et-recipes-height", height: document.documentElement.scrollHeight }, "*"); } catch (e) {}
    }
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var sb = e.target.closest("[data-save]");
    if (sb) {
      e.preventDefault();
      var slug = sb.getAttribute("data-save"), now = toggleSave(slug), r = recipeBySlug(slug);
      $all('[data-save="' + slug.replace(/"/g, "") + '"]').forEach(function (b) {
        b.setAttribute("aria-pressed", now);
        $(".save-ico", b).textContent = now ? "★" : "☆";
        $(".save-txt", b).textContent = now ? "Saved" : "Save for later";
      });
      toast(now ? "Saved “" + (r ? r.title : slug) + "”. Find it under Saved." : "Removed from Saved.");
      if (!now && parseHash()[0] === "saved") route();
      return;
    }
    var sur = e.target.closest("[data-surprise]");
    if (sur) {
      e.preventDefault();
      goSurprise(sur.getAttribute("data-surprise") || "all", sur.getAttribute("data-except") || "");
      return;
    }
    var pb = e.target.closest("[data-portion]");
    if (pb) {
      var art = e.target.closest(".recipe");
      route.keepScroll = true;
      var newHash = "#/r/" + art.dataset.slug + (pb.dataset.portion === "full" ? "" : "/" + pb.dataset.portion);
      if (location.hash === newHash) return;
      history.replaceState(null, "", newHash); route();
      var nb = $('[data-portion="' + pb.dataset.portion + '"]'); if (nb) nb.focus();
      return;
    }
    if (e.target.closest("[data-clear-have]")) {
      var artH = e.target.closest(".recipe");
      if (!artH) return;
      e.preventDefault();
      setHave(artH.dataset.slug, []);
      $all("[data-have]", artH).forEach(function (inp) {
        inp.checked = false;
        var li = inp.closest("li"); if (li) li.classList.remove("have");
      });
      paintNeed(artH);
      var first = artH.querySelector("[data-have]");
      if (first) first.focus();
      return;
    }
    if (e.target.closest("[data-need-copy]")) {
      e.preventDefault();
      var artC = e.target.closest(".recipe");
      copyText(stillNeedText(artC.dataset.slug, hashPortion()));
      return;
    }
    if (e.target.closest("[data-need-share]")) {
      e.preventDefault();
      var artS = e.target.closest(".recipe");
      var needText = stillNeedText(artS.dataset.slug, hashPortion());
      var rec = recipeBySlug(artS.dataset.slug);
      nativeShare({ title: "Shopping list: " + (rec ? rec.title : ""), text: needText }, needText);
      return;
    }
    if (e.target.closest("[data-need-print]")) {
      e.preventDefault();
      var artP = e.target.closest(".recipe");
      var listText = stillNeedText(artP.dataset.slug, hashPortion());
      var box = document.getElementById("need-print");
      if (box) {
        box.innerHTML = "";
        var h = document.createElement("h1");
        h.textContent = "What I still need";
        var pre = document.createElement("pre");
        pre.textContent = listText;
        box.appendChild(h);
        box.appendChild(pre);
        box.hidden = false;
      }
      document.body.classList.add("print-need");
      window.print();
      return;
    }
    if (e.target.closest("[data-share-recipe]")) {
      e.preventDefault();
      var artR = e.target.closest(".recipe");
      var info = recipeShareData(artR.dataset.slug, hashPortion());
      if (info.data) nativeShare(info.data, info.fallback);
      else copyText(info.fallback);
      return;
    }
    if (e.target.closest("[data-copy-link]")) {
      e.preventDefault();
      var artL = e.target.closest(".recipe");
      var recL = recipeBySlug(artL.dataset.slug);
      copyText(recipePageUrl(artL.dataset.slug, resolvedPortion(recL, hashPortion())));
      return;
    }
    if (e.target.closest("[data-print]")) {
      endListPrint();
      toast("Choose \"Save as PDF\" in the print dialog.");
      window.setTimeout(function () { window.print(); }, 80);
      return;
    }
    if (e.target.closest("[data-clear-saved]")) { setSaved([]); route(); toast("Saved list cleared."); return; }
    var bk = e.target.closest(".book[data-book]");
    if (bk && !reduceMotion && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      if (bk.classList.contains("opening")) return;
      bk.classList.add("opening");
      setTimeout(function () { location.hash = bk.getAttribute("href"); }, 650);
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches("[data-have]")) {
      var art = e.target.closest(".recipe");
      if (!art) return;
      var i = +e.target.getAttribute("data-ing");
      var haveNow = getHave(art.dataset.slug);
      var on = e.target.checked;
      var at = haveNow.indexOf(i);
      if (on && at === -1) haveNow.push(i);
      if (!on && at !== -1) haveNow.splice(at, 1);
      setHave(art.dataset.slug, haveNow);
      var li = e.target.closest("li");
      if (li) li.classList.toggle("have", on);
      paintNeed(art);
      return;
    }
    if (e.target.matches("[data-sort]")) {
      var ctx = e.target.getAttribute("data-sort"), id = e.target.id;
      sortState[ctx] = e.target.value; route.keepScroll = true; route();
      var s = document.getElementById(id); if (s) s.focus();
    }
  });
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", postHeight);
  window.addEventListener("afterprint", endListPrint);

  /* ---------- boot ---------- */
  fetch(DATA_URL, { cache: "no-cache" }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (d) {
    DB = d;
    DB.categories = d.categories || [];
    DB.books = d.books || [];
    DB.recipes = d.recipes || [];
    DB.comingSoonTitles = d.comingSoonTitles || {};
    var hasEx = DB.showExamples && (DB.books.concat(DB.recipes)).some(function (x) { return x.example; });
    document.getElementById("preview-note").hidden = !hasEx;
    updateSavedCount(); route();
  }).catch(function () {
    main.innerHTML = '<section class="wrap"><h1 tabindex="-1">The recipe shelf didn\'t load</h1><p>Please refresh the page in a moment.</p></section>';
  });
})();
