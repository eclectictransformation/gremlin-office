/* The Gremlin Desks — welcome entry.
   Drag-the-stone check, local guest name, then three doors.
   Nothing here is sent to a server. */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Tile lists Bryan can edit. Set enabled: false to hide a tile.       */
  /* Set soon: true for a "Coming soon" card that does not link out.     */
  /* href is from the Desks root (same as today's landing-page links).   */
  /* ------------------------------------------------------------------ */
  var EXPLORE_TILES = [
    {
      id: "gremlin_world",
      enabled: true,
      kicker: "The world",
      title: "Gremlin World",
      blurb: "Wander the rooms, poke around, and see what the crew has been up to.",
      href: "world.html",
      action: "Enter Gremlin World",
      badge: "Open to everyone"
    },
    {
      id: "workshop",
      enabled: true,
      kicker: "The bench",
      title: "Pip's Workshop",
      blurb: "Little sandbox games you can try right now, plus a peek at the websites we've been designing.",
      href: "workshop/",
      action: "Visit Pip's Workshop",
      badge: "Open to everyone"
    },
    {
      id: "recipe_shelf",
      enabled: true,
      kicker: "The shelf",
      title: "Recipe Shelf",
      blurb: "Tom's recipes, kept on a quiet shelf. Pull one down and have a look.",
      href: "recipe-shelf-preview/",
      action: "Open the Shelf",
      badge: "Open to everyone"
    },
    {
      id: "local_parks",
      enabled: true,
      kicker: "The trailhead",
      title: "Wandering the Local Parks",
      blurb: "Places to camp near Hackettstown, with links straight to booking. Put together by us, one park at a time.",
      href: "parks/",
      action: "Start wandering",
      badge: "Open to everyone"
    },
    {
      id: "meet_gremlins",
      enabled: true,
      kicker: "The crew",
      title: "Meet the Gremlins",
      blurb: "How the office filled up, and who's at each desk. Playful backstories, not real résumés.",
      href: "meet-the-gremlins/",
      action: "Meet the Gremlins",
      badge: "Open to everyone"
    },
    {
      id: "office_gallery",
      enabled: true,
      kicker: "The desks",
      title: "Gremlin Office",
      blurb: "Step into the office and see the paintings on the walls, including The Watcher.",
      href: "desks-preview-q7m4/",
      action: "Enter the Office",
      badge: "Office login",
      badgeKind: "lock",
      hint: "Needs an Office login from Bryan."
    },
    {
      id: "annex",
      enabled: true,
      kicker: "The annex",
      title: "Elsewhere Annex",
      blurb: "A playable wing off the workshop: short adventures you can try as a guest.",
      href: "workshop/annex/",
      action: "Enter the Annex",
      badge: "Open to everyone"
    },
    {
      id: "game_nook",
      enabled: true,
      kicker: "The nook",
      title: "The Game Nook",
      blurb: "A quieter corner for a calm game, including chess you can try with a friend.",
      href: "game-nook/",
      action: "Open the Game Nook",
      badge: "Open to everyone"
    },
    {
      id: "local_parks",
      enabled: true,
      soon: true,
      kicker: "The trails",
      title: "Wandering the Local Parks",
      blurb: "A growing list of nearby places to camp and places to see, with filters and booking links. We'll open this door as a first look once the list is ready.",
      action: "Coming soon",
      badge: "Coming soon",
      badgeKind: "soon"
    }
  ];

  var BUSINESS_TILES = [
    {
      id: "saji",
      enabled: true,
      kicker: "The planner",
      title: "Meet Saji Tori",
      blurb: "A few short questions, one at a time. Then Saji writes back with a simple business action plan.",
      href: "business-planning/#saji",
      action: "Meet with Saji Tori",
      badge: "Free plan"
    },
    {
      id: "moth_studio",
      enabled: true,
      kicker: "The studio",
      title: "Moth's Design Studio",
      blurb: "Moth's templates for gift certificates and business cards, one choice at a time. It all stays on your device.",
      href: "business-planning/#moth",
      action: "Visit the Design Studio",
      badge: "Free to try"
    },
    {
      id: "business_planning",
      enabled: true,
      kicker: "The planning room",
      title: "Business Planning",
      blurb: "The planning room as a whole — Saji, Moth's studio, and Wren's corner when it's ready.",
      href: "business-planning/",
      action: "Open Business Planning",
      badge: "Free plan"
    },
    {
      id: "wren_corner",
      enabled: true,
      soon: true,
      kicker: "The designer",
      title: "Wren's Corner",
      blurb: "Website planning with Wren, our website designer. This desk will open here once it's ready.",
      action: "Coming soon",
      badge: "Coming soon",
      badgeKind: "soon"
    },
    {
      id: "send_ticket",
      enabled: true,
      kicker: "The mail slot",
      title: "Send Bryan a Ticket",
      blurb: "Have a question or an idea for Bryan? Send it over and he'll see who it's from.",
      href: "signin/?next=ticket",
      action: "Sign in to send",
      badge: "Sign in first",
      badgeKind: "lock",
      hint: "Tickets need a sign-in so Bryan knows who's writing."
    }
  ];

  window.DESKS_ENTRY_DOORS = { explore: EXPLORE_TILES, business: BUSINESS_TILES };
  window.DESKS_ENTRY_GO = function (id) { setDoor(id); };

  /* ------------------------------------------------------------------ */
  var NAME_KEY = "desksGuest.v1";
  var CHOICE_KEY = "desksAccess.choice";
  var NAME_MAX = 40;
  var STONE = 48;
  var HOME_W = 118;
  var HOME_H = 92;
  var NEST_W = 72;
  var NEST_H = 64;
  var PAD = 10;

  var stages = {};
  var play, home, stone, speech, live, nameInput, nameErr, hello, notYouWrap;
  var placed = false;
  var drag = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function trimName(v) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, NAME_MAX);
  }
  function loadGuest() {
    try {
      var v = JSON.parse(localStorage.getItem(NAME_KEY) || "null");
      if (v && v.name) return { name: trimName(v.name), at: v.at };
    } catch (e) {}
    return null;
  }
  function saveGuest(name) {
    var n = trimName(name);
    try { localStorage.setItem(NAME_KEY, JSON.stringify({ name: n, at: Date.now() })); } catch (e) {}
    try { sessionStorage.setItem(CHOICE_KEY, "guest"); } catch (e) {}
    return n;
  }
  function clearGuest() {
    try { localStorage.removeItem(NAME_KEY); } catch (e) {}
  }
  function guestName() {
    var g = loadGuest();
    return g ? g.name : "";
  }

  function doorFromUrl() {
    var q = location.search || "";
    var m = /[?&]door=([a-z-]+)/i.exec(q);
    return m ? m[1].toLowerCase() : "";
  }
  function setDoor(id, replace) {
    var next = (id && id !== "doors") ? ("?door=" + encodeURIComponent(id)) : (location.pathname.split("?")[0] ? location.pathname : "./");
    if (!id || id === "doors") next = location.pathname || "./";
    else next = "?door=" + encodeURIComponent(id);
    if (replace) history.replaceState({ door: id || "" }, "", next);
    else history.pushState({ door: id || "" }, "", next);
    show();
  }

  function showStage(id) {
    Object.keys(stages).forEach(function (k) {
      var el = stages[k];
      if (!el) return;
      var on = k === id;
      el.hidden = !on;
      if (on) el.removeAttribute("inert");
      else el.setAttribute("inert", "");
    });
    try {
      document.dispatchEvent(new CustomEvent("desks-entry-stage", { detail: { stage: id } }));
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function goSub(id, title) {
    showStage(id);
    titles(title);
  }

  function titles(t) { document.title = t + " · The Gremlin Desks"; }

  /* ---------------- puzzle ---------------- */
  function playBox() {
    return play.getBoundingClientRect();
  }
  function rand(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }
  function overlapEnough(sx, sy, hx, hy) {
    /* Stone vs nest (nest sits at the right/bottom of the home group). */
    var nestX = hx + (HOME_W - NEST_W);
    var nestY = hy + (HOME_H - NEST_H);
    var cx = sx + STONE / 2, cy = sy + STONE / 2;
    return cx >= nestX - 6 && cx <= nestX + NEST_W + 6 && cy >= nestY - 6 && cy <= nestY + NEST_H + 6;
  }
  function collide(ax, ay, aw, ah, bx, by, bw, bh, pad) {
    var p = pad || 0;
    return ax < bx + bw + p && ax + aw + p > bx && ay < by + bh + p && ay + ah + p > by;
  }
  function placeRandom() {
    var r = playBox();
    var W = r.width, H = r.height;
    if (W < 80 || H < 80) return;
    var maxHX = Math.max(PAD, W - HOME_W - PAD);
    var maxHY = Math.max(PAD, H - HOME_H - PAD);
    var homeOnRight = Math.random() < 0.5;
    var mid = W / 2;
    var hx, sx, sy, hy, tries = 0;
    if (homeOnRight) {
      hx = rand(Math.floor(mid + 8), maxHX);
    } else {
      hx = rand(PAD, Math.max(PAD, Math.floor(mid - HOME_W - 8)));
    }
    hy = rand(PAD, maxHY);
    do {
      if (homeOnRight) {
        sx = rand(PAD, Math.max(PAD, Math.floor(mid - STONE - 8)));
      } else {
        sx = rand(Math.floor(mid + 8), Math.max(Math.floor(mid + 8), W - STONE - PAD));
      }
      sy = rand(PAD, Math.max(PAD, H - STONE - PAD));
      tries += 1;
    } while (tries < 40 && (
      overlapEnough(sx, sy, hx, hy) ||
      collide(sx, sy, STONE, STONE, hx, hy, HOME_W, HOME_H, 24)
    ));
    home.style.left = hx + "px";
    home.style.top = hy + "px";
    stone.style.left = sx + "px";
    stone.style.top = sy + "px";
    home.classList.remove("ready");
    stone.classList.remove("home", "dragging");
    placed = false;
    speech.textContent = "Help me get home!";
    if (live) live.textContent = "";
  }
  function settleStone() {
    var hx = parseFloat(home.style.left) || 0;
    var hy = parseFloat(home.style.top) || 0;
    var nestX = hx + (HOME_W - NEST_W) + (NEST_W - STONE) / 2;
    var nestY = hy + (HOME_H - NEST_H) + (NEST_H - STONE) / 2 + 4;
    stone.style.left = nestX + "px";
    stone.style.top = nestY + "px";
    stone.classList.add("home");
    stone.classList.remove("dragging");
    home.classList.add("ready");
    placed = true;
    speech.textContent = "Good job, thanks!";
    if (live) live.textContent = "Good job, thanks!";
    window.setTimeout(function () {
      if (!guestName()) goName();
    }, 650);
  }
  function posFromEvent(e) {
    var r = playBox();
    var x = e.clientX - r.left - STONE / 2;
    var y = e.clientY - r.top - STONE / 2;
    x = Math.max(0, Math.min(x, r.width - STONE));
    y = Math.max(0, Math.min(y, r.height - STONE));
    return { x: x, y: y };
  }
  function onDown(e) {
    if (placed) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    stone.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId };
    stone.classList.add("dragging");
    var p = posFromEvent(e);
    stone.style.left = p.x + "px";
    stone.style.top = p.y + "px";
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    var p = posFromEvent(e);
    stone.style.left = p.x + "px";
    stone.style.top = p.y + "px";
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    stone.classList.remove("dragging");
    try { stone.releasePointerCapture(e.pointerId); } catch (err) {}
    var sx = parseFloat(stone.style.left) || 0;
    var sy = parseFloat(stone.style.top) || 0;
    var hx = parseFloat(home.style.left) || 0;
    var hy = parseFloat(home.style.top) || 0;
    if (overlapEnough(sx, sy, hx, hy)) settleStone();
  }
  function placeByButton() {
    if (placed) { goName(); return; }
    settleStone();
  }

  /* ---------------- tiles ---------------- */
  function renderTiles(into, list) {
    into.innerHTML = "";
    list.forEach(function (t) {
      if (t.enabled === false) return;
      var el;
      if (t.soon) {
        el = document.createElement("article");
        el.className = "tile soon";
      } else {
        el = document.createElement("a");
        el.className = "tile";
        el.href = t.href;
      }
      var kind = t.badgeKind || (t.soon ? "soon" : "open");
      var html = "";
      if (t.badge) html += '<span class="badge ' + esc(kind) + '">' + esc(t.badge) + "</span>";
      html += '<p class="door-kicker">' + esc(t.kicker) + "</p>";
      html += "<h2>" + esc(t.title) + "</h2>";
      html += '<p class="blurb">' + esc(t.blurb) + "</p>";
      html += '<span class="enter">' + esc(t.action || "Open") + "</span>";
      if (t.hint) html += '<p class="hint">' + esc(t.hint) + "</p>";
      el.innerHTML = html;
      into.appendChild(el);
    });
  }

  /* ---------------- stages ---------------- */
  function goPuzzle(reset) {
    showStage("puzzle");
    titles("Come on in");
    if (reset || !placed) placeRandom();
    window.requestAnimationFrame(placeRandom);
  }
  function goName() {
    showStage("name");
    titles("What's your name?");
    nameErr.textContent = "";
    nameInput.setAttribute("aria-invalid", "false");
    window.setTimeout(function () { try { nameInput.focus(); } catch (e) {} }, 50);
  }
  function goDoors(isBack) {
    var name = guestName();
    hello.textContent = isBack ? ("Welcome back, " + name + ".") : ("Nice to meet you, " + name + ".");
    notYouWrap.hidden = false;
    showStage("doors");
    titles("Welcome");
  }
  function goClient() {
    showStage("client");
    titles("New client");
  }
  function goExplore() {
    renderTiles($("explore-tiles"), EXPLORE_TILES);
    showStage("explore");
    titles("Here to explore");
  }
  function goBusiness() {
    renderTiles($("business-tiles"), BUSINESS_TILES);
    showStage("business");
    titles("Business & planning tools");
  }

  function show() {
    var name = guestName();
    var door = doorFromUrl();
    if (!name) {
      if (placed && (door === "" || door === "doors" || door === "name")) goName();
      else goPuzzle(false);
      return;
    }
    if (door === "client") goClient();
    else if (door === "client-ipad") goSub("client-ipad", "In the office (iPad)");
    else if (door === "client-waiver") goSub("client-waiver", "Sign the waiver");
    else if (door === "client-download") goSub("client-download", "Download or upload forms");
    else if (door === "client-preform") goSub("client-preform", "Quick pre-form");
    else if (door === "explore") goExplore();
    else if (door === "business") goBusiness();
    else goDoors(true);
  }

  function submitName(e) {
    if (e) e.preventDefault();
    var n = trimName(nameInput.value);
    if (!n) {
      nameErr.textContent = "Please type a name, even just initials.";
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
      return;
    }
    saveGuest(n);
    nameErr.textContent = "";
    nameInput.setAttribute("aria-invalid", "false");
    var pending = doorFromUrl();
    if (pending === "client" || pending === "client-ipad" || pending === "client-waiver" || pending === "client-download" || pending === "client-preform" || pending === "explore" || pending === "business") show();
    else {
      /* First arrival lands on the three doors, not a remembered deep link. */
      history.replaceState({ door: "" }, "", location.pathname || "./");
      goDoors(false);
    }
  }

  function resetWho(e) {
    if (e) e.preventDefault();
    clearGuest();
    placed = false;
    if (nameInput) nameInput.value = "";
    history.replaceState({ door: "" }, "", location.pathname || "./");
    goPuzzle(true);
  }

  function bind() {
    stages = {
      puzzle: $("stage-puzzle"),
      name: $("stage-name"),
      doors: $("stage-doors"),
      client: $("stage-client"),
      "client-ipad": $("stage-client-ipad"),
      "client-waiver": $("stage-client-waiver"),
      "client-download": $("stage-client-download"),
      "client-preform": $("stage-client-preform"),
      explore: $("stage-explore"),
      business: $("stage-business")
    };
    play = $("play");
    home = $("home");
    stone = $("stone");
    speech = $("speech");
    live = $("puzzle-live");
    nameInput = $("guest-name");
    nameErr = $("name-err");
    hello = $("hello");
    notYouWrap = $("not-you-wrap");

    stone.addEventListener("pointerdown", onDown);
    stone.addEventListener("pointermove", onMove);
    stone.addEventListener("pointerup", onUp);
    stone.addEventListener("pointercancel", onUp);
    $("place-stone").addEventListener("click", placeByButton);
    $("name-form").addEventListener("submit", submitName);
    $("not-you").addEventListener("click", resetWho);
    $("not-you-2") && $("not-you-2").addEventListener("click", resetWho);

    document.querySelectorAll("[data-go]").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        ev.preventDefault();
        setDoor(el.getAttribute("data-go") || "");
      });
    });
    window.addEventListener("popstate", show);
    window.addEventListener("resize", function () {
      if (!stages.puzzle || stages.puzzle.hidden || placed) return;
      placeRandom();
    });

    document.addEventListener("desks-access", function (e) {
      var me = e.detail || {};
      var admin = $("admin-door");
      if (admin && me.role === "admin") admin.hidden = false;
      if (me.display_name && !guestName()) {
        /* Signed-in visitors skip the puzzle and use their account name. */
        try { sessionStorage.setItem(CHOICE_KEY, "guest"); } catch (err) {}
        /* Don't overwrite a typed guest name; only greet. */
      }
    });

    var existing = guestName();
    if (existing) {
      show();
    } else {
      goPuzzle(true);
    }
    window.addEventListener("load", function () {
      if (!guestName() && stages.puzzle && !stages.puzzle.hidden && !placed) placeRandom();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
