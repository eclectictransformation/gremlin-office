/* The Shifting House (preview): a calmer, simpler Gremlin World.
   - house-schedule.json: which rooms are open (7 at a time) and how they swap on each new visit
   - the cloud guide (The Meditation Guide): "How are you feeling?" and "Drift home"
   - room stamps instead of the quest journal, hidden counters and badge pop-ups, Brawl in a just-for-fun corner
   - sound off until the speaker is tapped, then one soft WebAudio loop per room
   - castle oddities, the turning staircase, and Vesper's Guest Reading Corner (reading-shelf.json)
   world.js calls into window.GremlinShift through small hooks; saved progress keys are unchanged. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function load(k, d) { try { var v = localStorage.getItem("gremlin-world-" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("gremlin-world-" + k, JSON.stringify(v)); } catch (e) {} }
  function GW() { return window.GremlinWorld; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function slow(ms) { return reduce.matches ? 0 : ms; }

  /* ================= SETTINGS BRYAN CHANGES ================= */
  // The sock hunt reward: ONE shared promo code anyone who finds all 5 socks sees (the one free promotion).
  // It is public on purpose (anyone can read it with View Source). TO ROTATE IT (about monthly): change the text
  // between the quotes below, save, and redeploy. Nothing else needs to change; the card, Copy and the
  // "Email it to myself" link all read from here. Remember to retire the old code in the booking system too.
  var SOCK_REWARD_CODE = "SOCKS5";
  // Rooms that need a Gremlin Key: EMPTY on purpose. Every gremlin room is open to everyone.
  // The lock mechanism below (isLocked / lockedDoor, the friendly "not yet" card) stays dormant FOR FUTURE HIDDEN
  // AREAS: put a room id here (keys in world-data.json -> rooms) to switch it on. Soft lock: lore, not security.
  var KEY_ROOMS = [];
  /* =========================================================== */

  var W = null, SCHED = null, SHELF = { shelf: [], overflow: [] }, OPEN = [], ALWAYS = ["office", "wing", "arcade", "quietroom"], lastSwap = [], justShifted = false, issue = null;
  var stairsTargets = [], stairsIdx = 0, stairsTimer = null, catHere = false;

  /* ---------- the mood guide (exact lines from world-guide.md) ---------- */
  var MOODS = [
    { id: "stressed", label: "Stressed", room: "returns", next: ["stacks", "lantern", "burrow", "rooftop"],
      line: "Feeling stressed? Drift over to Vesper's Returns Bin. Curl up by the rainy window in the big reading chair, or shelve a few books. Wrong shelves are allowed." },
    { id: "angry", label: "Angry or frazzled", room: "corridor", next: ["burrow", "rooftop", "greenhouse", "lantern"],
      line: "A little hot around the edges? Slip through Grimble's Burrow to the Cool-Off Corridor. Follow the painted footprints, in... out..., and rest on the bench at the end." },
    { id: "anxious", label: "Anxious or overwhelmed", room: "lantern", next: ["corridor", "returns", "rooftop", "burrow"],
      line: "If everything feels like too much, come up to Moth's Lantern Loft and sit with the moon lamp. Let it breathe for you for a little while." },
    { id: "tired", label: "Tired", room: "rooftop", next: ["returns", "lantern", "burrow", "proof"],
      line: "Tired bones? The Rooftop Garden has a hammock between the planters and the moon coming up early. Nobody needs anything from you up there." },
    { id: "bored", label: "Bored or restless", room: "arcade", next: ["greenhouse", "gallery", "press", "dispatch"],
      line: "Got the wiggles? The Break Room door is right there in the Office. Try a slow game of Skee-Ball, or see how hungry the vine is today." },
    { id: "sad", label: "Sad", room: "burrow", next: ["returns", "rooftop", "lantern", "stacks"],
      line: "Heavy heart today? Grimble's Listening Burrow has two armchairs, two teacups, and a cabinet of nice things people said that's so full it won't close. Sit a while." },
    { id: "curious", label: "Curious", room: "greenhouse", next: ["someday", "gallery", "archive", "press"],
      line: "Feeling curious? Pip's Idea Greenhouse is full of idea jars, and the Idea Net lets you catch seeds as they drift up. Peek into the Someday Shelf next door too." }
  ];
  // one soft line for any room the cloud floats you to instead (when the mood room is napping)
  var ROOM_LINES = {
    office: "Home again. The kettle's still warm.", wing: "The hallway. Every door here has a way back.",
    tunnel: "The Supply Closet Tunnel is lit all the way through. Wander slowly.", gallery: "The Gallery of Odd Things. Nobody minds if you just look.",
    archive: "The Comics Archive. The big red armchair is free.", rooftop: "The Rooftop Garden. The hammock is free and the moon is early.",
    arcade: "The Break Room, where the arcade lives. Skee-Ball, Hoops and the cabinets. Nothing keeps score unless you want it to.", burrow: "Grimble's Listening Burrow. Two armchairs, two teacups. Sit a while.",
    corridor: "The Cool-Off Corridor. Follow the footprints: in... out...", greenhouse: "Pip's Idea Greenhouse. Something is always sprouting.",
    roots: "The Root Tunnel glows softly. The mushrooms light the way.", someday: "The Someday Shelf. Nothing here is due.",
    lantern: "Moth's Lantern Loft. The moon lamp is glowing.", press: "Dot's Back-Room Press. The radio is low and the cat is asleep.",
    proof: "The Proof Room has a round window seat with cushions.", dispatch: "Noodle's Dispatch Loft. The noodles are never cold.",
    lostfound: "The Lost & Found. Every sock here is waiting patiently.", returns: "Vesper's Returns Bin. Wrong shelves are allowed.",
    stacks: "The Stacks Below. Lanterns and kind margin notes.",
    quietroom: "The Quiet Room, off the Break Room. Moss Garden, the Seed Path and a chess table. Nothing to win."
  };

  /* ---------- the house: which rooms are open ---------- */
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function activeIssue(s) {
    var list = (s.issues || []).filter(function (i) { return !i.from || i.from <= today(); }).sort(function (a, b) { return a.issue - b.issue; });
    return list.length ? list[list.length - 1] : { issue: 0, open: (s.base && s.base.open) || [] };
  }
  function newSession() {
    try { if (sessionStorage.getItem("gremlin-shift-visit")) return false; sessionStorage.setItem("gremlin-shift-visit", String(Date.now())); return true; }
    catch (e) { return false; }
  }
  function arrange(s, rooms) {
    ALWAYS = s.alwaysOpen || ALWAYS; issue = activeIssue(s);
    var count = s.openCount || 7, pool = (issue.swapPool || s.swapPool || []).filter(function (r) { return rooms[r] && ALWAYS.indexOf(r) < 0; });
    var unlocks = (issue.unlocks || []).filter(function (r) { return rooms[r]; });
    var base = (issue.open || (s.base && s.base.open) || []).filter(function (r) { return rooms[r] && ALWAYS.indexOf(r) < 0; });
    var st = load("shift", null), fresh = newSession();
    if (!st || st.issue !== issue.issue || !Array.isArray(st.open)) st = { issue: issue.issue, open: base.slice(0, count), visits: 0 };
    st.open = st.open.filter(function (r) { return rooms[r] && ALWAYS.indexOf(r) < 0; });
    unlocks.forEach(function (r) { if (st.open.indexOf(r) < 0) st.open.push(r); });
    var standing = location.hash.slice(1);
    lastSwap = [];
    if (fresh && st.visits > 0) {
      var range = issue.swapsPerVisit || s.swapsPerVisit || [1, 2], n = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
      for (var i = 0; i < n; i++) {
        var closable = shuffle(st.open.filter(function (r) { return pool.indexOf(r) >= 0 && r !== standing && unlocks.indexOf(r) < 0 && !lastSwap.some(function (x) { return x.opened === r; }); }));
        var wakeable = shuffle(pool.filter(function (r) { return st.open.indexOf(r) < 0 && !lastSwap.some(function (x) { return x.closed === r; }); }));
        if (!closable.length || !wakeable.length) break;
        st.open.splice(st.open.indexOf(closable[0]), 1, wakeable[0]);
        lastSwap.push({ closed: closable[0], opened: wakeable[0] });
      }
      justShifted = lastSwap.length > 0;
    }
    if (fresh) st.visits = (st.visits || 0) + 1;
    st.lastSwap = lastSwap.length ? lastSwap : (st.lastSwap || []); st.at = Date.now();
    save("shift", st); OPEN = st.open.slice();
  }
  function isResting(id) { return !!(W && W.rooms[id]) && ALWAYS.indexOf(id) < 0 && OPEN.indexOf(id) < 0; }
  function roomName(id) { return (W && W.rooms[id] && W.rooms[id].name) || id; }
  // open rooms you can't walk to through open doors from the Office/Wing; the turning staircase visits these first
  function unreachable() {
    var seen = {}, q = ALWAYS.slice(); q.forEach(function (r) { seen[r] = 1; });
    while (q.length) { var r = q.shift(); (W.rooms[r].items || []).forEach(function (it) { if (it.type === "portal" && it.odd !== "stairs" && !seen[it.to] && !isResting(it.to)) { seen[it.to] = 1; q.push(it.to); } }); }
    return OPEN.filter(function (r) { return !seen[r]; });
  }

  /* ---------- reading shelf ---------- */
  function readShelf(j) {
    var books = ((j && j.books) || []).filter(function (b) { return b && typeof b.title === "string" && b.title.trim(); })
      .map(function (b) { var o = { title: String(b.title), teaser: String(b.teaser || ""), type: b.type === "wip" ? "wip" : "finished", date: String(b.date || ""), text: b.text ? String(b.text) : "" };
        if (typeof b.link === "string" && /^https:\/\//i.test(b.link)) o.link = b.link; return o; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return { shelf: books.slice(0, 10), overflow: books.slice(10) };
  }
  function isNew(b) { if (!b.date) return false; var t = Date.parse(b.date + "T12:00:00"); return !isNaN(t) && Date.now() - t < 14 * 864e5 && Date.now() - t > -864e5; }

  /* ---------- prepare (called by world.js once world-data.json is in) ---------- */
  var HIDE = { "brawl-board": 1 };   // one gentle thing per room: extra "find them all" sets rest (data kept)
  function prepare(w) {
    W = w;
    var get = function (u) { return fetch(u, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    return Promise.all([get("house-schedule.json"), get("reading-shelf.json"), get("gremlish.json"), get("house-notes.json")]).then(function (res) {
      GREMLISH = res[2]; addNotes(res[3]);
      SCHED = res[0] || { alwaysOpen: ["office", "wing", "arcade", "quietroom"], openCount: 7, base: { open: ["returns", "corridor", "lantern", "rooftop", "arcade", "burrow", "greenhouse"] }, swapPool: [], issues: [] };
      arrange(SCHED, W.rooms);
      SHELF = readShelf(res[1]);
      // Socks wander too: a sock whose room is napping today waits in the always-open Wing, so the hunt can always be finished.
      var spots = [{ face: "back", x: 170, y: 965 }, { face: "back", x: 854, y: 965 }, { face: "left", x: 200, y: 965 }, { face: "front", x: 150, y: 965 }];
      Object.keys(W.rooms).forEach(function (rid) {
        if (!isResting(rid)) return;
        var its = W.rooms[rid].items || [];
        for (var i = its.length - 1; i >= 0; i--) if (its[i].type === "sock" && spots.length) {
          var sk = its.splice(i, 1)[0]; sk.at = spots.shift(); sk.wandered = rid; W.rooms.wing.items.push(sk);
        }
      });
      // Break Room Brawl moves to the just-for-fun corner: no boards, no clocks (code and data untouched)
      var brawl = W.arcade && W.arcade.machines && W.arcade.machines["break-room-brawl"];
      if (brawl) { brawl.ranked = false; brawl.tagline = "Just for fun. Silly, quick, and nobody's counting."; brawl.foot = "JUST FOR FUN \u00b7 NO BOARDS"; brawl.hint = "The just-for-fun corner. No boards, no clocks on screen. Play as long as you like."; }
      var arcadeItems = (W.rooms.arcade && W.rooms.arcade.items) || [];
      arcadeItems.forEach(function (it) {
        if (it.id === "cabinet-purple") { it.label = "The just-for-fun corner: Break Room Brawl. Tap to play."; it.hover = "Just for fun"; if (it.screen) { it.screen.text = "JUST FOR FUN"; it.screen.sub = "NO BOARDS"; } }
      });
      Object.keys(W.rooms).forEach(function (rid) { (W.rooms[rid].items || []).forEach(function (it) {
        if (/^lantern-(caption|moth)-/.test(it.id) || /^press-crop-/.test(it.id)) HIDE[it.id] = 1;
        if (it.id === "returns-rain") { it._calmRain = true; delete it.showIf; }   // the rain is always gently falling in the reading corner
      }); });
      var corr = W.rooms.corridor; if (corr && !corr.mood) corr.mood = "burrow";
      buildChrome();
    });
  }
  function skipItem(it, room) {
    if (HIDE[it.id]) return true;
    if (it.odd === "cat") { return !catHere; }
    if (it.odd === "archive") return !SHELF.overflow.length;
    if (it.odd === "sockintro") return !!load("sock-intro", 0) && !window.__showSockIntro;
    return false;
  }

  /* ---------- drawn visuals for doors and oddities ---------- */
  var SVG = {
    portrait: '<svg viewBox="0 0 124 156" aria-hidden="true"><rect x="3" y="3" width="118" height="150" rx="10" fill="#c9a45c" stroke="#7a5b2e" stroke-width="5"/><rect x="14" y="14" width="96" height="128" rx="6" fill="#3c4a5e"/>' +
      '<ellipse cx="62" cy="96" rx="34" ry="40" fill="#8fae7d"/><path d="M30 70 18 46l22 14M94 70l12-24-22 14" fill="#8fae7d"/><ellipse cx="62" cy="80" rx="30" ry="26" fill="#a3c290"/>' +
      '<g class="pt-eyes"><ellipse cx="50" cy="76" rx="6" ry="5" fill="#2b231d"/><ellipse cx="74" cy="76" rx="6" ry="5" fill="#2b231d"/></g>' +
      '<ellipse class="pt-mouth" cx="62" cy="94" rx="7" ry="2" fill="#5a3b2a"/><path d="M36 120q26 16 52 0v22H36z" fill="#7a4b6a"/><rect x="40" y="134" width="44" height="6" rx="3" fill="#f3d98b" opacity=".7"/></svg>',
    stairs: '<svg viewBox="0 0 150 420" aria-hidden="true"><defs><linearGradient id="stw" x1="0" x2="1"><stop offset="0" stop-color="#6b4a2e"/><stop offset=".5" stop-color="#a77a4c"/><stop offset="1" stop-color="#6b4a2e"/></linearGradient></defs>' +
      '<rect x="66" y="10" width="18" height="400" rx="6" fill="#5d3d22"/><g class="st-steps">' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { var y = 380 - i * 38, w = 60 - Math.abs((i % 4) - 1.5) * 14; return '<path d="M75 ' + y + 'h' + w + 'l-6 12H75z" fill="url(#stw)" stroke="#3d2a18" stroke-width="2"/><path d="M75 ' + (y - 19) + 'h-' + w + 'l6 12H75z" fill="url(#stw)" stroke="#3d2a18" stroke-width="2" opacity=".85"/>'; }).join("") +
      '</g><circle cx="75" cy="14" r="10" fill="#f3d98b"/><circle cx="75" cy="14" r="22" fill="#f3d98b" opacity=".25"/></svg>',
    knock: '<svg viewBox="0 0 110 170" aria-hidden="true"><rect x="8" y="10" width="94" height="156" rx="47" fill="#ffe7b0"/><g class="kn-nook"><circle cx="55" cy="120" r="14" fill="#fff" opacity=".9"/><path d="M44 112h22v10a11 11 0 0 1-22 0z" fill="#c9a45c"/><text x="55" y="70" font-size="12" text-anchor="middle" font-family="Georgia,serif" fill="#5a4a3a">hello</text></g>' +
      '<g class="kn-door"><rect x="8" y="10" width="94" height="156" rx="47" fill="#7a5233" stroke="#4e3420" stroke-width="5"/><path d="M30 60h50M30 100h50M30 140h50" stroke="#4e3420" stroke-width="3" opacity=".5"/><circle cx="84" cy="100" r="6" fill="#c9a45c"/>' +
      '<rect x="20" y="30" width="70" height="20" rx="4" fill="#f4ead2"/><text x="55" y="45" font-size="11" text-anchor="middle" font-family="Georgia,serif" fill="#2b231d">knock gently</text></g></svg>',
    cat: '<svg viewBox="0 0 130 80" aria-hidden="true"><ellipse cx="66" cy="54" rx="50" ry="22" fill="#5a5560"/><circle cx="28" cy="40" r="20" fill="#5a5560"/><path d="M12 28 14 8l14 14M36 22l10-14 4 20" fill="#5a5560"/>' +
      '<path class="cat-eye" d="M18 40q5 4 10 0M32 40q5 4 10 0" stroke="#f3d98b" stroke-width="2.5" fill="none" stroke-linecap="round"/><path class="cat-tail" d="M112 58q22-4 12-26" stroke="#5a5560" stroke-width="10" fill="none" stroke-linecap="round"/></svg>',
    mirror: '<svg viewBox="0 0 140 190" aria-hidden="true"><defs><linearGradient id="msky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5e8"/><stop offset="1" stop-color="#e8f3f7"/></linearGradient><clipPath id="mclip"><ellipse cx="70" cy="95" rx="52" ry="76"/></clipPath></defs>' +
      '<ellipse cx="70" cy="95" rx="64" ry="88" fill="#c9a45c" stroke="#7a5b2e" stroke-width="5"/><g clip-path="url(#mclip)"><rect x="0" y="0" width="140" height="190" fill="url(#msky)"/>' +
      '<g class="m-clouds"><ellipse cx="40" cy="70" rx="24" ry="9" fill="#fff" opacity=".9"/><ellipse cx="100" cy="120" rx="30" ry="10" fill="#fff" opacity=".8"/><ellipse cx="180" cy="90" rx="22" ry="8" fill="#fff" opacity=".9"/></g></g></svg>',
    archive: '<svg viewBox="0 0 200 120" aria-hidden="true"><rect x="4" y="96" width="192" height="12" rx="3" fill="#7a5233"/>' +
      [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<rect x="' + (16 + i * 22) + '" y="' + (30 + (i % 3) * 8) + '" width="18" height="' + (66 - (i % 3) * 8) + '" rx="2" fill="' + ["#7a4b6a", "#3f6b5a", "#c9a45c", "#3d5a80"][i % 4] + '"/>'; }).join("") + '</svg>',
    sockintro: '<svg viewBox="0 0 70 44" aria-hidden="true"><path d="M6 6h22v18c0 6 4 9 12 9h18a8 8 0 0 1 0 16H34C16 49 6 38 6 24z" transform="translate(0 -8)" fill="#e8574a"/><path d="M6 2h22v6H6z" fill="#fdf6e6"/><path d="M40 33h10M44 28v10" stroke="#fdf6e6" stroke-width="2" opacity=".6" transform="translate(0 -8)"/></svg>',
    sleepy: '<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M8 22q10 8 20 0M34 22q10 8 20 0" stroke="#fdf6e6" stroke-width="3" fill="none" stroke-linecap="round"/></svg>'
  };
  function decorate(b, it, room) {
    if (it.type === "portal") {
      var dest = it.odd === "stairs" ? stairsTarget() : it.to;
      if (it.odd === "stairs") { b.insertAdjacentHTML("afterbegin", '<span class="odd-art">' + SVG.stairs + "</span>"); }
      setDoor(b, it, dest);
      if (justShifted && lastSwap.some(function (s) { return s.closed === dest || s.opened === dest; })) { b.classList.add("shifted"); }
      return;
    }
    if (it.type === "oddity" && SVG[it.odd]) { b.classList.add("odd-" + it.odd); b.insertAdjacentHTML("afterbegin", '<span class="odd-art">' + SVG[it.odd] + "</span>"); }
    if (it.id === "returns-big-chair") { var h = el("span", "hov", "Sit and read"); b.appendChild(h); }
    if (it.id === "returns-bin-nest") { var h2 = el("span", "hov", "Nap here"); b.appendChild(h2); }
  }
  function setDoor(b, it, dest) {
    var tag = b.querySelector(".tag"), resting = isResting(dest);
    b.classList.toggle("resting", resting);
    if (!tag) { tag = el("span", "tag"); b.appendChild(tag); }
    tag.textContent = resting ? "zzz \u00b7 " + W.rooms[dest].short + " is napping" : (it.odd === "stairs" ? "Up to " + W.rooms[dest].short + " (for now) \u2192" : (it.tag && dest === it.to ? it.tag : W.rooms[dest].short + " \u2192"));
    b.setAttribute("aria-label", resting ? it.label + ". " + roomName(dest) + " is napping today." : it.odd === "stairs" ? "A slowly turning staircase. Right now it goes to " + roomName(dest) + ", but it may change its mind." : it.label);
    var zz = b.querySelector(".zzz");
    if (resting && !zz) { zz = el("span", "zzz"); zz.innerHTML = SVG.sleepy + "<i>z</i><i>z</i><i>z</i>"; b.appendChild(zz); }
    if (!resting && zz) zz.remove();
  }
  function stairsTarget() { return stairsTargets.length ? stairsTargets[stairsIdx % stairsTargets.length] : (OPEN[0] || "office"); }
  function portalTarget(it) { return it.odd === "stairs" ? stairsTarget() : null; }
  function changeStairs() {
    stairsIdx++; var b = GW() && GW().item("wing-staircase"); if (!b) return;
    b.classList.add("mind"); setTimeout(function () { b.classList.remove("mind"); setDoor(b, b._item.it, stairsTarget()); }, slow(1600));
  }

  /* ---------- whispers from the cloud (one line, gentle, dismissible) ---------- */
  var wTimer = null;
  function whisper(text, ms) {
    var w = $("#cloud-say"); if (!w) return;
    $("p", w).textContent = text; w.hidden = false; w.classList.remove("in"); void w.offsetWidth; w.classList.add("in");
    wMs = Math.max(8000, ms || 0, text.length * 85); clearTimeout(wTimer); wTimer = setTimeout(function () { w.hidden = true; }, wMs);
    if (!w._calm) {   // hovering pauses a whisper, a tap puts it away
      w._calm = true;
      w.addEventListener("mouseenter", function () { clearTimeout(wTimer); });
      w.addEventListener("mouseleave", function () { if (!w.hidden) { clearTimeout(wTimer); wTimer = setTimeout(function () { w.hidden = true; }, wMs); } });
      w.addEventListener("click", function (e) { if (!e.target.closest("button, a")) { clearTimeout(wTimer); w.hidden = true; } });
    }
  }
  var wMs = 8000;

  /* ---------- clicks the Shifting House handles itself ---------- */
  var knocks = 0;
  function intercept(it, b, x) {
    var G = GW();
    if (it.type === "note" && NOTES[it.id]) { openNote(NOTES[it.id], b, x); return true; }
    if (it.id === "returns-big-chair") { sit(); return true; }
    if (it.id === "returns-bin-nest") { nap(); return true; }
    if (it.type !== "oddity") return false;
    var look = function (cb) { G.turnTo(x.yaw, x.pitch, 1.25, cb, slow(1400)); };
    if (it.odd === "portrait") { b.classList.remove("yawn"); void b.offsetWidth; b.classList.add("yawn"); look(function () { whisper("The old portrait yawns, blinks twice, and settles back into its frame. \"Oh, hello. Mind the rug.\""); }); return true; }
    if (it.odd === "knock") {
      if (b.classList.contains("open")) { look(function () { whisper("Nobody's home but a warm teacup. It says hello."); }); return true; }
      knocks++; G.effect(b, "knock", x);
      if (knocks < 2) { look(function () { whisper("Knock... knock. A small voice from inside: \"Gently, please. Once more?\""); }); }
      else { setTimeout(function () { b.classList.add("open"); sfx("creak"); }, slow(500)); look(function () { whisper("Thank you for knocking so kindly. The little door swings open. Inside: a teacup, still warm, and a note that just says \"hello\"."); }); }
      return true;
    }
    if (it.odd === "cat") { b.classList.remove("stretch"); void b.offsetWidth; b.classList.add("stretch"); look(function () { whisper("The cat blinks very slowly at you, stretches one paw, and goes back to being mostly asleep. It's only here sometimes."); }); return true; }
    if (it.odd === "shelf") { G.effect(b, "puff", x); look(function () { whisper("The bookshelf lets out a long, dusty sigh. A happy one. The books settle a little closer together."); }); return true; }
    if (it.odd === "mirror") { look(function () { whisper("The mirror doesn't show you. It shows a calm sky, just in case you wanted one."); }); return true; }
    if (it.odd === "archive") { openArchive(); return true; }
    if (it.odd === "sockintro") {
      save("sock-intro", Date.now()); b.classList.add("tug");
      look(function () { whisper("A sock! Five of the gremlins' socks went wandering in the wash. Find the socks as you wander the house, whenever you like. No timer, no rush, and you can ignore them completely.", 11000); });
      setTimeout(function () { b.remove(); }, slow(1600) || 50);
      return true;
    }
    return false;
  }
  function restingDoor(dest, b, x) {
    var G = GW(); b.classList.add("hush"); setTimeout(function () { b.classList.remove("hush"); }, 1600);
    G.turnTo(x.yaw, Math.max(-50, Math.min(50, x.pitch)), 1.15, function () { whisper(roomName(dest) + " is napping today. Its door is warm, though. It'll wake up on another visit."); }, slow(900));
  }

  /* ---------- the napping screen (a link straight to a resting room) ---------- */
  var napFrom = null;
  function napping(id, atStart) {
    var n = $("#nap"); if (!n) return;
    napFrom = { start: !!atStart };
    $("#nap-room", n).textContent = roomName(id);
    n.hidden = false; n.classList.remove("in"); void n.offsetWidth; n.classList.add("in");
    $("#nap-back", n).focus({ preventScroll: true });
  }
  function closeNap() {
    var n = $("#nap"); if (!n || n.hidden) return; n.hidden = true;
    var G = GW(); if (G) try { history.replaceState(null, "", "#" + G.room); } catch (e) {}
  }

  /* ---------- the cloud guide ---------- */
  function floatTo(id, line) {
    var G = GW(); if (!G) return;
    closeCloud(); closeNap(); standUp(true); wake(true);
    if (G.room === id) { whisper(line); return; }
    pendingLine = { room: id, line: line };
    G.travel(id, null, false, true);
  }
  var pendingLine = null;
  function chooseMood(m) {
    var target = m.room, line = m.line;
    if (isResting(target) || isLocked(target)) {
      var alt = m.next.filter(function (r) { return !isResting(r) && !isLocked(r); })[0] || OPEN.filter(function (r) { return !isLocked(r); })[0] || "office";
      line = roomName(target) + (isLocked(target) ? " likes to meet you properly first, so I'll float you to " : " is napping today, so I'll float you to ") + roomName(alt) + " instead. " + ROOM_LINES[alt];
      target = alt;
    }
    floatTo(target, line);
  }
  function drift() { var G = GW(); if (G && G.room === "office") { closeCloud(); closeNap(); whisper("You're already home. Stay as long as you like."); return; } floatTo("office", "Home again. The kettle's still warm."); }
  function openCloud() { var p = $("#cloud-panel"); p.hidden = false; $("#cloud-btn").setAttribute("aria-expanded", "true"); var f = $("button", p); if (f) f.focus({ preventScroll: true }); }
  function closeCloud() { var p = $("#cloud-panel"); if (!p || p.hidden) return; p.hidden = true; $("#cloud-btn").setAttribute("aria-expanded", "false"); }

  /* ---------- stamps (from the same "visited" list the journal used) ---------- */
  var STAMP_COL = ["#7a4b6a", "#3f6b5a", "#c9a45c", "#3d5a80", "#a0523d", "#5d7a3a"];
  function stampSvg(id, i) {
    var r = W.rooms[id], c = STAMP_COL[i % STAMP_COL.length], letter = (r.short || r.name).replace(/^The /, "").charAt(0);
    return '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-dasharray="3 2"/><circle cx="20" cy="20" r="12" fill="' + c + '" opacity=".14"/><text x="20" y="26" font-size="16" font-family="Georgia,serif" font-weight="700" text-anchor="middle" fill="' + c + '">' + letter + "</text></svg>";
  }
  function renderStamps() {
    var row = $("#stamps"); if (!row || !W) return;
    var vis = load("visited", []), ids = Object.keys(W.rooms);
    var list = $(".stamp-list", row); list.innerHTML = "";
    ids.forEach(function (id, i) { if (vis.indexOf(id) < 0) return; var s = el("span", "stamp"); s.title = roomName(id); s.setAttribute("role", "img"); s.setAttribute("aria-label", "Stamp: " + roomName(id)); s.innerHTML = stampSvg(id, i); list.appendChild(s); });
    $(".stamp-btn", row).setAttribute("aria-label", "Room stamps: " + vis.filter(function (v) { return W.rooms[v]; }).length + " rooms visited. Open the stamp page");
  }
  function openStamps() {
    var vis = load("visited", []), wrap = el("div", "stamp-page");
    wrap.appendChild(el("p", "rc-meta", "room stamps"));
    wrap.appendChild(el("h2", "", "Places you've been"));
    wrap.appendChild(el("p", "", "A little stamp for every room you've wandered into. There's no list to finish; the house rearranges itself anyway."));
    var g = el("div", "stamp-grid");
    Object.keys(W.rooms).forEach(function (id, i) {
      var got = vis.indexOf(id) >= 0, c = el("div", "stamp-cell" + (got ? " got" : ""));
      c.innerHTML = got ? stampSvg(id, i) : '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="#bdb2a0" stroke-width="2" stroke-dasharray="2 4"/></svg>';
      c.appendChild(el("span", "", got ? roomName(id) : "not yet")); g.appendChild(c);
    });
    wrap.appendChild(g);
    if (window.GremlinPlayer && GremlinPlayer.openGuide) { var wg = el("button", "calm-link", "Why make a Gremlin Key?"); wg.type = "button"; wg.addEventListener("click", function () { closeReader(); GremlinPlayer.openGuide(); }); wrap.appendChild(wg); }
    openReader(wrap, "stamps");
  }

  /* ---------- the sock hunt, finished: a warm card with a placeholder for a future reward ---------- */
  // The ONE place the sock reward comes from: the shared, rotating code in SOCK_REWARD_CODE (top of file).
  function getSockReward() { return Promise.resolve({ code: SOCK_REWARD_CODE }); }   // the code lives in SOCK_REWARD_CODE at the top of this file
  function socksDone() {
    var w = el("div", "socks-done");
    w.innerHTML = '<svg viewBox="0 0 120 60" aria-hidden="true" class="sd-art">' + ["#e8574a", "#3f6b5a", "#c9a45c", "#7a4b6a", "#3d5a80"].map(function (c, i) { return '<path d="M' + (8 + i * 22) + ' 6h12v26c0 4 3 6 7 6h1a5 5 0 0 1 0 10h-6c-9 0-14-6-14-15z" fill="' + c + '"/>'; }).join("") + '<path d="M4 30q56 22 112 0" stroke="#a0523d" stroke-width="3" fill="none"/></svg>';
    w.appendChild(el("p", "rc-meta", "the sock hunt"));
    w.appendChild(el("h2", "", "You found every sock!"));
    w.appendChild(el("p", "reward-line", "Here's $5 off the One Hour Workshop:"));
    var slot = el("div", "reward-slot"); slot.setAttribute("data-reward-slot", "socks");
    var code = el("code", "reward-code", "\u2026"); code.id = "sock-code";
    var copy = el("button", "reward-copy", "Copy"); copy.type = "button"; copy.id = "sock-copy";
    var mail = el("a", "reward-mail", "Email it to myself"); mail.id = "sock-mail"; mail.href = "mailto:";   // opens the visitor's own mail app; we collect and send nothing
    slot.appendChild(code); slot.appendChild(copy); slot.appendChild(mail); w.appendChild(slot);
    w.appendChild(el("p", "reward-how", "Save this code! Enter it when you book the One Hour Workshop online, or scribble it on a scrap of paper and hand it to Bryan in person. (Printing it works too, but scrap paper is funnier.)"));
    getSockReward().then(function (r) {
      code.textContent = r.code;
      mail.href = "mailto:?subject=" + encodeURIComponent("My Gremlin World sock reward") + "&body=" + encodeURIComponent("I found every sock! My code for $5 off the One Hour Workshop at Eclectic Transformation: " + r.code + "\n\nSave this code! Enter it when you book the One Hour Workshop online, or scribble it on a scrap of paper and hand it to Bryan in person. (Printing it works too, but scrap paper is funnier.)");
      if (r.placeholder) { slot.classList.add("placeholder"); code.title = "Preview placeholder, not a real code"; }
    });
    copy.addEventListener("click", function () {
      var t = code.textContent, done = function () { copy.textContent = "Copied"; setTimeout(function () { copy.textContent = "Copy"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, done); else done();
    });
    openReader(w, "socks");
  }

  /* ---------- the calm reading card (also used for stamps and the archive) ---------- */
  var readerReturn = null;
  function openReader(content, kind) {
    var r = $("#reader"), body = $(".rc-body", r); body.innerHTML = ""; body.appendChild(content);
    r.dataset.kind = kind || "book"; readerReturn = document.activeElement;
    r.hidden = false; r.classList.remove("in"); void r.offsetWidth; r.classList.add("in");
    $(".rc-close", r).focus({ preventScroll: true });
  }
  function closeReader() { var r = $("#reader"); if (!r || r.hidden) return false; r.hidden = true; if (readerReturn && document.contains(readerReturn)) try { readerReturn.focus({ preventScroll: true }); } catch (e) {} return true; }
  function bookCard(b) {
    var w = el("article", "book-card");
    w.appendChild(el("p", "rc-meta", b.type === "wip" ? "a work in progress" : isNew(b) ? "a new arrival" : "from Vesper's shelf"));
    w.appendChild(el("h2", "", b.title));
    if (b.teaser) w.appendChild(el("p", "rc-teaser", b.teaser));
    if (b.text) String(b.text).split(/\n\n+/).forEach(function (p) { w.appendChild(el("p", "", p)); });
    if (b.link) { var a = el("a", "rc-link", "Open the full piece \u2192"); a.href = b.link; a.target = "_blank"; a.rel = "noopener"; w.appendChild(a); }
    return w;
  }
  function openArchive() {
    var w = el("div"); w.appendChild(el("p", "rc-meta", "the stacks below")); w.appendChild(el("h2", "", "Older guest books"));
    var ul = el("ul", "rc-list");
    SHELF.overflow.forEach(function (b) { var li = el("li"), bt = el("button", "rc-book", b.title); bt.type = "button"; bt.addEventListener("click", function () { openReader(bookCard(b)); }); li.appendChild(bt); if (b.teaser) li.appendChild(el("small", "", b.teaser)); ul.appendChild(li); });
    w.appendChild(ul); openReader(w, "archive");
  }

  /* ---------- Guest Reading Corner: sit, read, stand; the nest naps ---------- */
  var seated = false, napped = false, sitFrom = null;
  function sit() {
    var G = GW(); if (!G || seated) return;
    seated = true; sitFrom = { yaw: G.view.yaw, pitch: G.view.pitch };
    document.body.classList.add("seated"); G.hideBubble();
    var t = G.lookOf({ face: "left", x: 330, y: 330 });
    G.turnTo(t.yaw, t.pitch, 1.25, function () {
      $("#shelf").hidden = false; renderShelf();
      var fresh = SHELF.shelf.some(isNew);
      whisper(fresh ? "Vesper just shelved something new." : "Curl up by the rainy window and pick a book. There's no wrong shelf here.");
      var f = $("#shelf .spine") || $("#stand-up"); if (f) f.focus({ preventScroll: true });
    }, slow(1800));
    $("#stand-up").hidden = false; ambient.update();
  }
  function standUp(quick) {
    if (!seated) return; seated = false;
    document.body.classList.remove("seated"); $("#shelf").hidden = true; $("#stand-up").hidden = true; hideTip();
    var G = GW(); if (G && !quick && sitFrom) G.turnTo(sitFrom.yaw, sitFrom.pitch, 1, null, slow(1500));
    ambient.update();
  }
  function nap() {
    if (napped) return; napped = true; standUp(true);
    document.body.classList.add("napping"); $("#nap-dim").hidden = false; $("#wake").focus({ preventScroll: true });
    whisper("The blanket nest is warm. The room goes soft and dim. Stay as long as you like.");
    ambient.update();
  }
  function wake(quick) { if (!napped) return; napped = false; document.body.classList.remove("napping"); $("#nap-dim").hidden = true; ambient.update(); }
  function renderShelf() {
    var s = $("#shelf .spines"); s.innerHTML = "";
    $("#shelf .shelf-empty").hidden = !!SHELF.shelf.length;
    SHELF.shelf.forEach(function (b, i) {
      var bt = el("button", "spine " + b.type + (isNew(b) ? " new" : "")); bt.type = "button";
      bt.style.setProperty("--h", (78 + ((i * 37) % 22)) + "%"); bt.style.setProperty("--c", ["#7a4b6a", "#3f6b5a", "#a0523d", "#3d5a80", "#8a6a48"][i % 5]);
      bt.appendChild(el("span", "spine-title", b.title));
      bt.setAttribute("aria-label", b.title + (b.teaser ? ". " + b.teaser : "") + (b.type === "wip" ? ". A work in progress." : "") + (isNew(b) ? " New arrival." : ""));
      var show = function () { showTip(bt, b); };
      bt.addEventListener("mouseenter", show); bt.addEventListener("focus", show); bt.addEventListener("mouseleave", hideTip); bt.addEventListener("blur", hideTip);
      bt.addEventListener("click", function () { hideTip(); openReader(bookCard(b)); });
      s.appendChild(bt);
    });
  }
  function showTip(bt, b) { var t = $("#shelf-tip"); $("b", t).textContent = b.title; $("span", t).textContent = b.teaser || ""; t.hidden = false; var r = bt.getBoundingClientRect(), p = $("#shelf").getBoundingClientRect(); t.style.left = Math.max(8, Math.min(p.width - 248, r.left - p.left + r.width / 2 - 120)) + "px"; }
  function hideTip() { var t = $("#shelf-tip"); if (t) t.hidden = true; }

  /* ---------- sound: off until the speaker is tapped; one soft generated loop per room ---------- */
  var ambient = (function () {
    var ac = null, master = null, cur = null, on = false, noiseBuf = null;
    var PRESET = { office: ["pad", 196], tunnel: ["pad", 147], gallery: ["pad", 220], archive: ["pad", 165], rooftop: ["wind", 0], arcade: ["pad", 262], wing: ["pad", 175],
      burrow: ["pad", 131], corridor: ["pad", 110], greenhouse: ["drip", 330], roots: ["drip", 247], someday: ["pad", 185], lantern: ["pad", 156], press: ["pad", 139],
      proof: ["pad", 208], dispatch: ["pad", 233], lostfound: ["pad", 196], returns: ["rain", 0], stacks: ["pad", 123] };
    function noise() { if (noiseBuf) return noiseBuf; var n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0), last = 0; for (var i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } return (noiseBuf = b); }
    function make(room) {
      var p = PRESET[room] || ["pad", 196], g = ac.createGain(), nodes = [], timers = []; g.gain.value = 0; g.connect(master);
      if (p[0] === "pad") {
        [1, 1.5, 2.003].forEach(function (m, i) { var o = ac.createOscillator(), og = ac.createGain(); o.type = "sine"; o.frequency.value = p[1] * m; og.gain.value = [0.5, 0.22, 0.12][i]; o.connect(og); og.connect(g); o.start(); nodes.push(o); });
        var lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g.gain); lfo.start(); nodes.push(lfo);
      } else {
        var src = ac.createBufferSource(); src.buffer = noise(); src.loop = true; var f = ac.createBiquadFilter();
        f.type = p[0] === "wind" ? "lowpass" : "bandpass"; f.frequency.value = p[0] === "wind" ? 420 : 1100; f.Q.value = 0.6; src.connect(f);
        var rg = ac.createGain(); rg.gain.value = 1; f.connect(rg); rg.connect(g); src.start(); nodes.push(src); g._rain = rg;
        if (p[0] === "wind") { var l2 = ac.createOscillator(), l2g = ac.createGain(); l2.frequency.value = 0.05; l2g.gain.value = 260; l2.connect(l2g); l2g.connect(f.frequency); l2.start(); nodes.push(l2); }
        if (p[0] === "drip" || p[0] === "rain") timers.push(setInterval(function () {
          if (p[0] === "rain" && (seated || napped)) return;   // the typewriter goes quiet while you read or nap
          var o = ac.createOscillator(), og = ac.createGain(), t = ac.currentTime; o.type = p[0] === "rain" ? "square" : "sine";
          o.frequency.value = p[0] === "rain" ? 1800 : p[1] * (1 + Math.random()); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(p[0] === "rain" ? 0.05 : 0.25, t + 0.005); og.gain.exponentialRampToValueAtTime(0.0001, t + (p[0] === "rain" ? 0.04 : 0.6));
          o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.7);
        }, p[0] === "rain" ? 2600 : 3800));
      }
      return { g: g, nodes: nodes, timers: timers, room: room };
    }
    function level() { return napped ? 0.5 : 1; }
    function play(room) {
      if (!on || !ac) return;
      if (cur && cur.room === room) { update(); return; }
      var old = cur, t = ac.currentTime; cur = make(room);
      cur.g.gain.linearRampToValueAtTime(0, t); cur.g.gain.linearRampToValueAtTime(level(), t + 2.5);
      if (old) { old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + 2); old.timers.forEach(clearInterval); setTimeout(function () { old.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); old.g.disconnect(); }, 2300); }
      update();
    }
    function update() { if (!cur || !ac) return; if (cur.g._rain) cur.g._rain.gain.setTargetAtTime(seated ? 0.5 : 1, ac.currentTime, 0.6); master.gain.setTargetAtTime(on ? 0.05 * level() : 0, ac.currentTime, 0.8); }
    function toggle() {
      on = !on;
      if (on && !ac) { var C = window.AudioContext || window.webkitAudioContext; if (!C) { on = false; return false; } ac = new C(); master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); }
      if (ac && ac.state === "suspended") ac.resume();
      if (on) { play(GW() ? GW().room : "office"); master.gain.setTargetAtTime(0.05 * level(), ac.currentTime, 0.8); }
      else if (ac) master.gain.setTargetAtTime(0, ac.currentTime, 0.4);
      return on;
    }
    function creak() {
      if (!on || !ac) return; var o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
      o.type = "sawtooth"; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(70, t + 1.2); f.type = "lowpass"; f.frequency.value = 500;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 1.3);
      o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 1.4);
    }
    return { toggle: toggle, play: play, update: update, creak: creak, get on() { return on; } };
  })();
  function sfx(kind) { if (kind === "creak") ambient.creak(); }

  /* ---------- room built: reset the corner, refresh the staircase, the cat decides ---------- */
  var builtOnce = false;
  function roomBuilt(id) {
    if (seated) standUp(true); if (napped) wake(true);
    document.body.className = document.body.className.replace(/\broom-\S+/g, "").trim(); document.body.classList.add("room-" + id);
    renderStamps(); ambient.play(id);
    if (pendingLine && pendingLine.room === id) { var l = pendingLine.line; pendingLine = null; setTimeout(function () { whisper(l); }, slow(1300) || 200); }
    if (!builtOnce) { builtOnce = true; if (justShifted) setTimeout(function () { whisper("While you were away, the house quietly shifted. " + lastSwap.map(function (s) { return roomName(s.opened) + " woke up and " + roomName(s.closed) + " is napping"; }).join("; ") + "."); ambient.creak(); }, 2600); }
  }
  // the cat picks a new mood each time a room is built (about half the time it's there)
  var origBuild = null;


  /* ---------- Still mode (WCAG 2.2.2): one pill pauses every ambient loop; remembered; on by default with reduced motion ---------- */
  function setupStill() {
    var btn = $("#btn-still"), wrap = btn && btn.parentNode, root = document.documentElement, KEY = "gw-still-mode", tipTimer = null;
    if (!btn) return;
    function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function paint() {
      var on = root.classList.contains("gw-still");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Still mode is on: the moving lights and glows are paused. Press to bring the motion back." : "Still mode: pauses the moving lights and glows so the house holds still");
    }
    function set(on, remember) { root.classList.toggle("gw-still", on); if (remember) { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {} } paint(); }
    function showTip(ms) { wrap.classList.add("tip-on"); clearTimeout(tipTimer); tipTimer = setTimeout(function () { wrap.classList.remove("tip-on"); }, ms || 3200); }
    btn.addEventListener("click", function () { set(!root.classList.contains("gw-still"), true); });
    // touch: a tap or long-press shows the explanation for a few seconds
    var pressT = null;
    btn.addEventListener("touchstart", function () { showTip(3600); pressT = setTimeout(function () { showTip(5000); }, 500); }, { passive: true });
    btn.addEventListener("touchend", function () { clearTimeout(pressT); }, { passive: true });
    btn.addEventListener("contextmenu", function (e) { if (wrap.classList.contains("tip-on")) e.preventDefault(); });
    btn.addEventListener("keydown", function (e) { if (e.key === "Escape") wrap.classList.remove("tip-on"); });
    // follow the system setting live, unless the visitor has made their own choice
    var follow = function () { if (saved() === null) set(reduce.matches, false); };
    if (reduce.addEventListener) reduce.addEventListener("change", follow); else if (reduce.addListener) reduce.addListener(follow);
    paint();
  }

  /* ---------- page chrome (cloud, napping screen, reading corner, stamps, speaker) ---------- */
  function buildChrome() {
    var app = $("#app");
    setupStill();
    stairsTargets = unreachable().concat(OPEN.filter(function (r) { return unreachable().indexOf(r) < 0; }));
    if (!reduce.matches) stairsTimer = setInterval(function () { if (!document.documentElement.classList.contains("gw-still")) changeStairs(); }, 45000);
    catHere = Math.random() < 0.5;
    setInterval(function () { catHere = Math.random() < 0.5; }, 120000);

    var cloud = el("div", "cloud-guide"); cloud.id = "cloud";
    cloud.innerHTML =
      '<div id="cloud-say" class="cloud-say" role="status" aria-live="polite" hidden><p></p><button type="button" class="cs-x" aria-label="Dismiss">&times;</button></div>' +
      '<div id="cloud-panel" class="cloud-panel" role="dialog" aria-label="The Meditation Guide" hidden>' +
        '<div class="cp-head"><b>The Meditation Guide</b><button type="button" class="cp-x" aria-label="Close the cloud guide">&times;</button></div>' +
        '<p class="cp-q">How are you feeling?</p><div class="cp-moods"></div>' +
        '<button type="button" class="cp-home">&#8962; Drift home</button></div>' +
      '<button type="button" id="cloud-btn" class="cloud-btn" aria-expanded="false" aria-controls="cloud-panel" aria-label="The Meditation Guide: how are you feeling, or drift home">' +
        '<svg viewBox="0 0 90 60" aria-hidden="true"><path d="M22 52h48a16 16 0 0 0 2-32 20 20 0 0 0-38-6 14 14 0 0 0-12 38z" fill="#fdfaf2" stroke="#c9bfa8" stroke-width="2"/>' +
        '<path class="c-eye" d="M36 33q4 3 8 0M52 33q4 3 8 0" stroke="#5a4a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="33" cy="40" rx="4" ry="2.4" fill="#f3b8a8" opacity=".6"/><ellipse cx="63" cy="40" rx="4" ry="2.4" fill="#f3b8a8" opacity=".6"/></svg></button>' +
      '<button type="button" class="cloud-hide" aria-label="Tuck the cloud away">&#8722;</button>';
    app.appendChild(cloud);
    var moods = $(".cp-moods", cloud);
    MOODS.forEach(function (m) { var b = el("button", "mood-btn", m.label); b.type = "button"; b.dataset.mood = m.id; b.addEventListener("click", function () { chooseMood(m); }); moods.appendChild(b); });
    $("#cloud-btn").addEventListener("click", function () { if ($("#cloud-panel").hidden) openCloud(); else closeCloud(); });
    $(".cp-x", cloud).addEventListener("click", function () { closeCloud(); $("#cloud-btn").focus({ preventScroll: true }); });
    $(".cp-home", cloud).addEventListener("click", drift);
    $(".cs-x", cloud).addEventListener("click", function () { $("#cloud-say").hidden = true; });
    $(".cloud-hide", cloud).addEventListener("click", function () { var t = cloud.classList.toggle("tucked"); this.setAttribute("aria-label", t ? "Bring the cloud back" : "Tuck the cloud away"); this.innerHTML = t ? "&#9729;" : "&#8722;"; if (t) { closeCloud(); $("#cloud-say").hidden = true; } });

    var nap = el("div", "nap-screen"); nap.id = "nap"; nap.hidden = true; nap.setAttribute("role", "dialog"); nap.setAttribute("aria-modal", "true"); nap.setAttribute("aria-labelledby", "nap-title");
    nap.innerHTML = '<div class="nap-card"><svg class="nap-door" viewBox="0 0 120 170" aria-hidden="true"><rect x="10" y="10" width="100" height="156" rx="50" fill="#8b5e34" stroke="#5d3d22" stroke-width="6"/><circle cx="60" cy="88" r="60" fill="#f3d98b" opacity=".18"/><path d="M38 80q8 7 16 0M66 80q8 7 16 0" stroke="#fdf6e6" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="92" cy="100" r="5" fill="#c9a45c"/></svg>' +
      '<p class="rc-meta">shh</p><h2 id="nap-title">This room is napping</h2><p><span id="nap-room"></span> is resting today. The house shifts a little each visit, so it will wake up another time.</p>' +
      '<div class="nap-btns"><button type="button" id="nap-back">&#8592; Go back</button><button type="button" id="nap-home" class="ghost">&#8962; Drift home</button></div></div>';
    app.appendChild(nap);
    $("#nap-back").addEventListener("click", function () { var st = napFrom && napFrom.start; closeNap(); if (st && document.referrer && history.length > 1) history.back(); });
    $("#nap-home").addEventListener("click", function () { closeNap(); drift(); });

    var shelf = el("div", "reading-shelf"); shelf.id = "shelf"; shelf.hidden = true; shelf.setAttribute("role", "region"); shelf.setAttribute("aria-label", "Vesper's guest shelf");
    shelf.innerHTML = '<p class="shelf-label">Vesper\'s guest shelf</p><div class="spines"></div><p class="shelf-empty">Vesper is still choosing books, coming soon.</p><div class="plank"></div><div id="shelf-tip" class="shelf-tip" hidden><b></b><span></span></div>';
    app.appendChild(shelf);
    var su = el("button", "pill btn stand-up", "Stand up"); su.id = "stand-up"; su.type = "button"; su.hidden = true; su.addEventListener("click", function () { standUp(); }); app.appendChild(su);
    var dim = el("div", "nap-dim"); dim.id = "nap-dim"; dim.hidden = true;
    var wk = el("button", "pill btn", "Wake up gently"); wk.id = "wake"; wk.type = "button"; wk.addEventListener("click", function () { wake(); }); dim.appendChild(wk); app.appendChild(dim);

    var rd = el("div", "reader"); rd.id = "reader"; rd.hidden = true; rd.setAttribute("role", "dialog"); rd.setAttribute("aria-modal", "true"); rd.setAttribute("aria-label", "Reading card");
    rd.innerHTML = '<div class="rc-page"><button type="button" class="rc-close" aria-label="Close">Close &times;</button><div class="rc-body"></div></div>';
    rd.addEventListener("click", function (e) { if (e.target === rd) closeReader(); });
    $(".rc-close", rd).addEventListener("click", closeReader);
    app.appendChild(rd);

    var stamps = el("div", "stamp-row"); stamps.id = "stamps";
    stamps.innerHTML = '<button type="button" class="stamp-btn"><span class="stamp-label">Stamps</span><span class="stamp-list"></span></button>';
    $(".stamp-btn", stamps).addEventListener("click", openStamps);
    app.appendChild(stamps);

    var right = $(".hud-right"), sp = el("button", "pill btn speaker"); sp.id = "btn-sound"; sp.type = "button"; sp.setAttribute("aria-pressed", "false"); sp.setAttribute("aria-label", "Sound is off. Tap for a soft room sound");
    sp.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 8h3l4-4v12l-4-4H3z" fill="currentColor"/><path class="sw" d="M13 7q2 3 0 6M15 5q4 5 0 10" stroke="currentColor" stroke-width="1.6" fill="none"/><path class="sx" d="M13 7l5 6M18 7l-5 6" stroke="currentColor" stroke-width="1.6"/></svg>';
    sp.addEventListener("click", function () { var on = ambient.toggle(); sp.setAttribute("aria-pressed", on ? "true" : "false"); sp.classList.toggle("on", on); sp.setAttribute("aria-label", on ? "Sound is on. Tap to turn it off" : "Sound is off. Tap for a soft room sound"); });
    if (right) right.insertBefore(sp, $("#btn-map"));

    // Esc closes the newest soft layer first (capture, so the world doesn't also act on it)
    window.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var hit = closeReader() || (!$("#nap").hidden && (closeNap(), true)) || (!$("#cloud-panel").hidden && (closeCloud(), $("#cloud-btn").focus({ preventScroll: true }), true)) || (napped && (wake(), true)) || (seated && (standUp(), true));
      if (hit) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
    window.addEventListener("keydown", function (e) {   // while a soft layer is open, the room doesn't turn underneath it
      if (!$("#reader").hidden || !$("#nap").hidden) { if (/^Arrow|^Backspace$/.test(e.key)) e.stopImmediatePropagation(); }
    }, true);
  }

  /* ---------- the gremlins' notes (house-notes.json) and Gremlish (gremlish.json: one swappable letter -> glyph key) ---------- */
  var GREMLISH = null, NOTES = {};
  function addNotes(n) {
    if (!n) return;
    var add = function (x, kind) {
      var room = W.rooms[x.room]; if (!room) return;
      NOTES[x.id] = Object.assign({ kind: kind }, x);
      room.items = room.items || [];
      room.items.push({ id: x.id, type: "note", label: kind === "room" ? (x.title || "A pinned note") : "A little note, partly in Gremlish", hover: kind === "room" ? "A pinned note" : "A little note",
        at: x.at, size: x.size || [90, 100], img: "assets/world/props/" + (kind === "room" ? "note-pinned.svg" : "note-gremlish.svg") });
    };
    (n.roomNotes || []).forEach(function (x) { add(x, "room"); });
    (n.gremlishNotes || []).forEach(function (x) { add(x, "gremlish"); });
    (n.comingSoon || []).forEach(function (x) { add(x, "room"); });
  }
  // draw one run of text in Gremlish as inline SVG (letters without a glyph are skipped)
  function gremlishSvg(text, h) {
    var G = GREMLISH; if (!G || !G.key) return null; h = h || 34;
    var m = G.metrics || { width: .72, gap: .32, space: .55, stroke: .11 }, w = m.width * h, x = 4, parts = [];
    var f = function (v) { return (+v).toFixed(1); };
    text.toUpperCase().split("").forEach(function (ch) {
      if (ch === " ") { x += (m.space + m.gap) * h; return; }
      var prims = G.glyphs[G.key[ch]]; if (!prims) return;
      var P = function (px, py) { return [x + px * w, 4 + py * h]; };
      prims.forEach(function (p) {
        if (p[0] === "l") { var a = P(p[1], p[2]), b = P(p[3], p[4]); parts.push('<path d="M' + f(a[0]) + " " + f(a[1]) + "L" + f(b[0]) + " " + f(b[1]) + '"/>'); }
        else if (p[0] === "p") { parts.push('<path d="M' + p[1].map(function (q) { var c = P(q[0], q[1]); return f(c[0]) + " " + f(c[1]); }).join("L") + (p[2] ? "Z" : "") + '"/>'); }
        else if (p[0] === "c") { var c = P(p[1], p[2]); parts.push('<circle cx="' + f(c[0]) + '" cy="' + f(c[1]) + '" r="' + f(Math.min(p[3] * h, .48 * w)) + '"/>'); }
        else if (p[0] === "a") {
          var cc = P(p[1], p[2]), rr = Math.min(p[3] * h * .95, .49 * w), s0 = p[4] * Math.PI / 180, e0 = p[5] * Math.PI / 180, span = ((p[5] - p[4]) % 360 + 360) % 360 || 360;
          parts.push('<path d="M' + f(cc[0] + rr * Math.cos(s0)) + " " + f(cc[1] + rr * Math.sin(s0)) + "A" + f(rr) + " " + f(rr) + " 0 " + (span > 180 ? 1 : 0) + " 1 " + f(cc[0] + rr * Math.cos(e0)) + " " + f(cc[1] + rr * Math.sin(e0)) + '"/>');
        } else if (p[0] === "d") { var d = P(p[1], p[2]); parts.push('<circle cx="' + f(d[0]) + '" cy="' + f(d[1]) + '" r="' + f(Math.max(.75, m.stroke * h * .85)) + '" fill="currentColor" stroke="none"/>'); }
      });
      x += (m.width + m.gap) * h;
    });
    var span = el("span", "gremlish-run"); span.setAttribute("role", "img"); span.setAttribute("aria-label", "a few words in Gremlish");
    span.innerHTML = '<svg viewBox="0 0 ' + f(x + 4) + " " + f(h + 8) + '" width="' + f(x + 4) + '" height="' + f(h + 8) + '" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="' + f(m.stroke * h) + '" stroke-linecap="round" stroke-linejoin="round">' + parts.join("") + "</g></svg>";
    return span;
  }
  // FUTURE "collect the pieces" quest hooks in here: record n.id as read and check progress. Not built yet.
  function openNote(n, b, x) {
    var G = GW(), w = el("div", "house-note " + (n.kind === "room" ? "room-note" : "g-note"));
    var img = el("img", "hn-face"); img.src = "assets/gremlins/" + n.who + ".webp"; img.alt = ""; w.appendChild(img);
    w.appendChild(el("p", "rc-meta", n.kind === "room" ? "a pinned note" : "a little note"));
    if (n.title) w.appendChild(el("h2", "", n.title));
    var p = el("p", "hn-text");
    String(n.text).split(/(\{g:[^}]*\})/).forEach(function (bit) {
      var m = /^\{g:([^}]*)\}$/.exec(bit);
      if (m) { var g = gremlishSvg(m[1]); if (g) p.appendChild(g); } else if (bit) p.appendChild(document.createTextNode(bit));
    });
    w.appendChild(p);
    w.appendChild(el("p", "hn-sign", "\u2014 " + (GNAME[n.who] || n.who)));
    G.turnTo(x.yaw, x.pitch, 1.3, function () { openReader(w, "note"); }, slow(900));
  }

  /* ---------- Gremlin-Key rooms: a friendly "not yet" (checked in the browser; it's lore, not security) ---------- */
  var OWNERS = { greenhouse: "pip", lantern: "moth", press: "dot", dispatch: "noodle", returns: "vesper", burrow: "grimble" };
  var GNAME = { pip: "Pip", moth: "Moth", dot: "Dot", noodle: "Noodle", vesper: "Vesper", grimble: "Grimble" };
  function named() { return !!(window.GremlinPlayer && GremlinPlayer.player); }
  function isLocked(id) { return KEY_ROOMS.indexOf(id) >= 0 && !named(); }
  var LOCK_LINES = [
    "Ooh, we haven't met yet. Make a Gremlin Key and come right in.",
    "{who} likes to know who's visiting before you come in. A Gremlin Key is just a nickname and a short key, like moss-sock-7.",
    "Not yet, friend. {who} is tidying up for a proper hello. Make a Gremlin Key whenever you like.",
    "{who} peeks out and waves. \u201cCome back with a Gremlin Key and I'll put the kettle on.\u201d"
  ], lockN = 0, pendingRoom = null;
  // somewhere open and welcoming to suggest instead
  function suggestRoom() { return ["rooftop", "returns", "arcade", "burrow", "office"].filter(function (r) { var G = GW(); return !isResting(r) && !isLocked(r) && (!G || r !== G.room); })[0] || "office"; }
  function lockedDoor(id) {
    var who = OWNERS[id] || "noodle", sug = suggestRoom();
    var line = LOCK_LINES[(lockN++) % LOCK_LINES.length].replace("{who}", GNAME[who] || "A gremlin");
    if (!window.GremlinPlayer || !GremlinPlayer.openGentle) { whisper(line); return; }
    GremlinPlayer.openGentle({ view: "lock", img: "assets/gremlins/" + who + ".webp", kicker: roomName(id), title: line,
      lines: ["Or keep wandering. " + roomName(sug) + " is open right now."],
      primary: { label: "Get my Gremlin Key", fn: function () { pendingRoom = id; GremlinPlayer.openSignin("new"); } },
      secondary: { label: "Keep wandering", fn: function () {
        GremlinPlayer.close(); var G = GW(); if (!G) return;
        // a dead end (every way on is a key room or napping): float somewhere open instead of leaving them stuck
        var ways = (G.data.rooms[G.room].items || []).filter(function (it) { return it.type === "portal" && !isResting(it.to) && !isLocked(it.to); });
        if (!ways.length) floatTo(sug, ROOM_LINES[sug]);
      } } });
  }
  window.addEventListener("gremlin-signed-in", function () {   // the locks lift at once; if a door sent them here, walk them in
    var r = pendingRoom; pendingRoom = null; var G = GW();
    if (r && G && G.room !== r && !isResting(r)) setTimeout(function () { G.travel(r, null, false, true); }, slow(600));
  });
  // Help card gets a quiet Gremlin Key link; Gremlish cards get an open hint (same for everyone)
  function cardExtra(c, frag) {
    if (c && c.meta === "a small helpful thing" && c.title === "The Shifting House" && window.GremlinPlayer && GremlinPlayer.openGuide) {
      var hb = el("button", "calm-link", "Why make a Gremlin Key?"); hb.type = "button"; hb.addEventListener("click", function () { GremlinPlayer.openGuide(); }); frag.appendChild(hb); return;
    }
    if (!c || !/Gremlish/.test((c.title || "") + " " + (c.text || ""))) return;
    // An open hint for everyone. (The key-holder decoder card was removed: Gremlish is now learned from the notes.)
    var box = el("div", "gremlish-note");
    box.appendChild(el("p", "", "Little notes around the house might help you read this."));
    frag.appendChild(box);
  }

  window.GremlinShift = {
    isLocked: isLocked, _setKeyRooms: function (a) { KEY_ROOMS = a.slice(); }, _setOpen: function (a) { OPEN = a.slice(); var G = GW(); if (G) G.rebuild(); },
    gremlishSvg: gremlishSvg, notes: function () { return NOTES; }, lockedDoor: lockedDoor, cardExtra: cardExtra, get keyRooms() { return KEY_ROOMS.slice(); }, sockRewardCode: SOCK_REWARD_CODE, lockLines: LOCK_LINES,
    calm: true, prepare: prepare, isResting: isResting, napping: napping, skipItem: skipItem, decorate: decorate, intercept: intercept,
    restingDoor: restingDoor, socksDone: socksDone, getSockReward: getSockReward, portalTarget: portalTarget, roomBuilt: roomBuilt, openStamps: openStamps,
    get open() { return OPEN.slice(); }, get alwaysOpen() { return ALWAYS.slice(); }, get lastSwap() { return lastSwap.slice(); }, get justShifted() { return justShifted; },
    get shelf() { return SHELF; }, get seated() { return seated; }, get napped() { return napped; }, get sound() { return ambient.on; },
    moods: MOODS, chooseMood: function (id) { var m = MOODS.filter(function (x) { return x.id === id; })[0]; if (m) chooseMood(m); }, drift: drift,
    sit: sit, standUp: standUp, nap: nap, wake: wake, stairs: function () { return stairsTarget(); }, changeStairs: changeStairs, whisper: whisper,
    _setShelf: function (j) { SHELF = readShelf(j); if (seated) renderShelf(); }
  };
})();
