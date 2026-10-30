/* Mossbert's Doors - calm quest game preview v2. Static; only fetches ./quests.json. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var restBtn = document.getElementById('rest-btn');
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TS = /[?&]test=1/.test(location.search) ? 0.02 : 1; // test-only speed-up of calm delays
  var TTS = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  var KEY = 'qg_preview_v1';
  var QUESTS = [], S = load(), run = null, timers = [];

  function load() {
    try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 1) { d.friends = d.friends.map(function (f) { return f === 'f_mossbun' ? 'f_clover' : f; }); return d; } } catch (e) {}
    return { v: 1, mode: null, friends: [], gems: [], questsDone: 0, nextIndex: 0, lastPopup: null };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function later(fn, ms) { var t = setTimeout(fn, ms * TS); timers.push(t); return t; }
  function rand(n) { return Math.floor(Math.random() * n); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function on(sel, fn) { app.querySelectorAll(sel).forEach(function (el) { el.addEventListener('click', fn); }); }
  function say(text, who) { return '<div class="say"><b>' + (who || 'Mossbert') + '</b><span class="line">' + esc(text) + '</span></div>'; }

  function h(html) {
    timers.forEach(clearTimeout); timers = [];
    if (TTS) try { speechSynthesis.cancel(); } catch (e) {}
    document.body.classList.remove('rest-dim');
    app.innerHTML = '<div class="screen">' + html + '</div>';
    var scr = app.firstChild;
    // pop-up slot sits inline under the first speech bubble, so it can never cover play
    var first = scr.querySelector('.say'), slot = document.createElement('div');
    slot.id = 'popslot'; slot.setAttribute('aria-live', 'polite');
    if (first) first.after(slot); else scr.prepend(slot);
    if (TTS && (first || scr.querySelector('.plaque'))) {
      var rb = document.createElement('button');
      rb.className = 'btn read'; rb.type = 'button'; rb.id = 'readbtn'; rb.textContent = 'Read it to me';
      rb.addEventListener('click', readAloud);
      (scr.querySelector('.plaque') || first).after(rb);
    }
    window.scrollTo(0, 0);
    var f = app.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true });
  }
  function readAloud() {
    var parts = [];
    app.querySelectorAll('.say .line, .plaque').forEach(function (el) { parts.push(el.textContent); });
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(parts.join('. ')); u.rate = 0.85; u.pitch = 0.95; speechSynthesis.speak(u); } catch (e) {}
  }
  function setLine(el, text, who) { el.innerHTML = say(text, who); }

  /* ---------- art: flat SVG, Moth's palette ---------- */
  function mossbert(cls) {
    return '<svg class="mossbert ' + (cls || '') + '" viewBox="0 0 300 220" role="img" aria-label="Mossbert, an old turtle with moss on his shell and a ring of keys">' +
      '<ellipse cx="150" cy="200" rx="120" ry="12" fill="#2B3350" opacity=".12"/>' +
      '<rect x="80" y="160" width="34" height="38" rx="14" fill="#8FAF8A"/><rect class="foot" x="186" y="160" width="34" height="38" rx="14" fill="#8FAF8A"/>' +
      '<path d="M60 170 Q70 70 160 66 Q250 70 250 170 Z" fill="#6E9C9A"/>' +
      '<path d="M100 120 L130 96 L165 104 L190 92 L222 120 L190 146 L150 150 L112 144 Z" fill="none" stroke="#3E4A6B" stroke-width="4" opacity=".45"/>' +
      '<ellipse cx="128" cy="78" rx="34" ry="12" fill="#C9D8B6"/><ellipse cx="190" cy="82" rx="20" ry="9" fill="#C9D8B6"/>' +
      '<rect x="56" y="162" width="200" height="14" rx="7" fill="#C9D8B6"/>' +
      '<path d="M252 150 Q290 140 288 108 Q284 80 258 86 Q240 92 244 120 Z" fill="#8FAF8A"/>' +
      '<circle cx="268" cy="104" r="4" fill="#2B3350"/><path d="M262 96 q6 -4 12 0" stroke="#2B3350" stroke-width="3" fill="none"/>' +
      '<path d="M270 122 q8 4 14 -2" stroke="#2B3350" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="276" cy="114" r="5" fill="#E8B48F" opacity=".7"/>' +
      '<circle cx="84" cy="150" r="16" fill="none" stroke="#F2D48A" stroke-width="4"/>' +
      '<rect x="64" y="160" width="6" height="22" rx="2" fill="#F2D48A"/><rect x="80" y="164" width="6" height="18" rx="2" fill="#E8B48F"/><rect x="96" y="162" width="6" height="22" rx="2" fill="#F2D48A"/></svg>';
  }
  function rabbitSVG() {
    return '<svg viewBox="0 0 40 70" aria-hidden="true"><ellipse cx="14" cy="10" rx="4" ry="11" fill="#F4EEDF"/><ellipse cx="24" cy="9" rx="4" ry="11" fill="#F4EEDF"/>' +
      '<circle cx="20" cy="26" r="10" fill="#F4EEDF"/><circle cx="24" cy="25" r="1.6" fill="#2B3350"/>' +
      '<path d="M10 36 h20 l3 22 h-26 z" fill="#6B5A8E"/><circle cx="20" cy="44" r="1.5" fill="#F2D48A"/><circle cx="20" cy="50" r="1.5" fill="#F2D48A"/>' +
      '<circle cx="31" cy="44" r="3.2" fill="#F2D48A" stroke="#2B3350" stroke-width="1"/>' +
      '<ellipse cx="14" cy="64" rx="6" ry="4" fill="#F4EEDF"/><ellipse cx="27" cy="64" rx="6" ry="4" fill="#F4EEDF"/></svg>';
  }
  function friendSVG(f) {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="56" r="34" fill="' + f.color + '"/>' +
      '<circle cx="40" cy="50" r="4" fill="#2B3350"/><circle cx="60" cy="50" r="4" fill="#2B3350"/>' +
      '<path d="M43 64 q7 6 14 0" stroke="#2B3350" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="32" cy="62" r="5" fill="#E8B48F" opacity=".7"/><circle cx="68" cy="62" r="5" fill="#E8B48F" opacity=".7"/></svg>';
  }
  var OBJ = {
    flower: '<svg viewBox="0 0 100 100"><rect x="47" y="50" width="6" height="40" fill="#6E9C9A"/><g fill="#B9A8D9"><circle cx="50" cy="32" r="12"/><circle cx="34" cy="44" r="12"/><circle cx="66" cy="44" r="12"/><circle cx="40" cy="60" r="11"/><circle cx="60" cy="60" r="11"/></g><circle cx="50" cy="48" r="9" fill="#F2D48A"/></svg>',
    bush: '<svg viewBox="0 0 100 100"><g fill="#6E9C9A"><circle cx="32" cy="62" r="22"/><circle cx="62" cy="58" r="26"/><circle cx="48" cy="44" r="20"/></g><g fill="#F4EEDF"><circle cx="40" cy="50" r="4"/><circle cx="64" cy="46" r="4"/><circle cx="56" cy="68" r="4"/></g></svg>',
    mushroom: '<svg viewBox="0 0 100 100"><rect x="40" y="52" width="20" height="34" rx="8" fill="#F4EEDF"/><path d="M14 56 Q50 6 86 56 Z" fill="#E8B48F"/><g fill="#F4EEDF"><circle cx="36" cy="40" r="5"/><circle cx="60" cy="34" r="6"/></g></svg>'
  };
  // One layered backdrop for every scene: dusk gradient sky, two hills, path to the door, stone arch + door.
  var bgN = 0;
  function backdrop(mode, opts) {
    opts = opts || {}; var id = 'g' + (++bgN);
    var top = { easy: '#9DB8D6', medium: '#B9A8D9', hard: '#3E4A6B' }[mode] || '#9DB8D6';
    var low = { easy: '#F4EEDF', medium: '#E8B48F', hard: '#6B5A8E' }[mode] || '#F4EEDF';
    var orb = mode === 'hard' ? '#F4EEDF' : '#F2D48A';
    var door = opts.door === false ? '' :
      '<g transform="translate(' + (opts.doorX || 520) + ',' + (opts.doorY || 150) + ') scale(' + (opts.doorS || .55) + ')">' +
      '<path d="M-14 250 V96 A114 114 0 0 1 214 96 V250Z" fill="#D9D3E6"/>' +
      '<g fill="#B9A8D9" opacity=".75"><rect x="-14" y="120" width="26" height="30" rx="6"/><rect x="-14" y="180" width="26" height="30" rx="6"/><rect x="188" y="120" width="26" height="30" rx="6"/><rect x="188" y="180" width="26" height="30" rx="6"/><rect x="88" y="-20" width="26" height="22" rx="6"/></g>' +
      '<path d="M20 250 V100 A80 80 0 0 1 180 100 V250Z" fill="#6B5A8E"/>' +
      '<path class="glow" d="M34 250 V102 A66 66 0 0 1 166 102 V250Z" fill="#F2D48A"/>' +
      '<g class="leaf"><path d="M34 250 V102 A66 66 0 0 1 166 102 V250Z" fill="#D9D3E6"/><line x1="100" y1="40" x2="100" y2="250" stroke="#B9A8D9" stroke-width="3"/><circle cx="140" cy="170" r="8" fill="#2B3350"/></g></g>';
    return '<svg class="bg" viewBox="0 0 720 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + low + '"/></linearGradient></defs>' +
      '<rect width="720" height="450" fill="url(#' + id + ')"/><circle cx="110" cy="80" r="30" fill="' + orb + '" opacity=".9"/>' +
      '<path d="M0 250 Q170 150 360 220 T720 190 V450 H0Z" fill="#C9D8B6"/>' +
      '<path d="M0 320 Q220 250 430 315 T720 300 V450 H0Z" fill="#8FAF8A"/>' +
      '<path d="M180 450 C300 380 470 400 ' + ((opts.doorX || 520) + 55) + ' ' + ((opts.doorY || 150) + 138) + '" stroke="#D9D3E6" stroke-width="30" fill="none" stroke-linecap="round" opacity=".85"/>' +
      door + '</svg>';
  }
  var LAMP = '<svg viewBox="0 0 50 80" aria-hidden="true"><path d="M17 10 Q25 0 33 10" fill="none" stroke="#2B3350" stroke-width="3"/>' +
    '<path d="M12 18 L38 18 L33 10 L17 10Z" fill="#6B5A8E"/>' +
    '<rect x="13" y="18" width="24" height="40" rx="4" fill="#F4EEDF" stroke="#6B5A8E" stroke-width="3"/>' +
    '<ellipse class="flame" cx="25" cy="40" rx="6" ry="10" fill="#F2D48A"/><ellipse class="flame" cx="25" cy="42" rx="2.5" ry="5" fill="#E8B48F"/>' +
    '<line x1="25" y1="18" x2="25" y2="58" stroke="#6B5A8E" stroke-width="1.5" opacity=".35"/>' +
    '<path d="M10 58 H40 L36 66 H14Z" fill="#6B5A8E"/></svg>';

  /* ---------- rabbit ---------- */
  function rabbitHTML(pos, top) { return '<div class="rabbit" id="rabbit" style="left:' + pos + '%;top:' + (top || 34) + '%">' + rabbitSVG() + '</div>'; }
  function hopRabbit(pos) { var r = $('rabbit'); if (r) requestAnimationFrame(function () { r.style.left = pos + '%'; }); }

  /* ---------- pop-ups (text, inline, never block) ---------- */
  var POPUPS = {
    umbrella: { where: 'scene', text: 'A single raindrop falls. Mossbert opens an umbrella the size of a coin. "Prepared."', art: '<svg viewBox="0 0 60 60"><path d="M10 30 A20 20 0 0 1 50 30Z" fill="#B9A8D9"/><line x1="30" y1="30" x2="30" y2="50" stroke="#2B3350" stroke-width="3"/><ellipse cx="44" cy="10" rx="3" ry="5" fill="#9DB8D6"/></svg>' },
    watch: { where: 'scene', text: 'The rabbit hurries past checking his pocket watch, then strolls back. "False alarm. It\'s a cookie." He eats it.', art: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="18" fill="#E8B48F"/><g fill="#6B5A8E"><circle cx="24" cy="26" r="2.5"/><circle cx="35" cy="24" r="2.5"/><circle cx="31" cy="36" r="2.5"/></g></svg>' },
    goldfish: { where: 'scene', text: 'A goldfish peeks out of a teacup, blinks, and ducks away again.', art: '<svg viewBox="0 0 60 60"><path d="M10 34 H46 Q44 52 28 52 Q12 52 10 34Z" fill="#D9D3E6"/><ellipse cx="28" cy="30" rx="9" ry="6" fill="#E8B48F"/><circle cx="31" cy="29" r="1.5" fill="#2B3350"/></svg>' },
    shydoor: { where: 'door', text: 'The door blushes, opens an inch, and shuts. "Sorry. Wasn\'t ready."', art: '<svg viewBox="0 0 60 60"><path d="M12 58 V26 A18 18 0 0 1 48 26 V58Z" fill="#6B5A8E"/><circle cx="24" cy="34" r="4" fill="#E8B48F"/><circle cx="36" cy="34" r="4" fill="#E8B48F"/></svg>' },
    lettuce: { where: 'door', text: 'Mossbert chews one lettuce leaf very slowly. "Take your time. I\'m busy anyway. Crunch."', art: '<svg viewBox="0 0 60 60"><path d="M10 40 Q30 0 50 40 Q30 52 10 40Z" fill="#8FAF8A"/><path d="M30 14 V44" stroke="#C9D8B6" stroke-width="3"/></svg>' },
    ahem: { where: 'notyet', text: 'The door clears its throat. "Ahem. Close-ish. I believe in you." Its knob gives a tiny thumbs-up.', art: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="14" fill="#2B3350"/><rect x="26" y="8" width="8" height="18" rx="4" fill="#F2D48A"/></svg>' },
    spoon: { where: 'notyet', text: 'Mossbert tries another key from his ring. It\'s a spoon. "Hm. That explains a lot."', art: '<svg viewBox="0 0 60 60"><ellipse cx="22" cy="20" rx="9" ry="12" fill="#D9D3E6" stroke="#6B5A8E" stroke-width="2"/><rect x="26" y="28" width="6" height="26" rx="3" transform="rotate(-25 29 41)" fill="#6B5A8E"/></svg>' },
    snore: { where: 'rest', text: 'Mossbert dozes. A snore bubble pops into sparkly zzz. "I was resting my eyes. Professionally."', art: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="20" fill="#D9D3E6"/><text x="30" y="36" text-anchor="middle" font-size="16" fill="#6B5A8E" font-family="sans-serif">zzz</text></svg>' },
    gremlin: { where: 'scene', text: 'A gremlin hides behind a flower far too small. "Nope. Just a flower. Very big flower."', art: '<svg viewBox="0 0 60 60"><circle cx="30" cy="34" r="18" fill="#6E9C9A"/><path d="M14 22 L18 10 L24 20 M46 22 L42 10 L36 20" fill="#6E9C9A"/><circle cx="24" cy="32" r="3" fill="#2B3350"/><circle cx="36" cy="32" r="3" fill="#2B3350"/><rect x="28" y="36" width="4" height="22" fill="#8FAF8A"/><circle cx="30" cy="38" r="6" fill="#B9A8D9"/></svg>' }
  };
  var COMMON = ['umbrella', 'watch', 'goldfish', 'shydoor', 'lettuce', 'ahem', 'spoon', 'snore'];
  function rollPopup() { // at most one per quest; ~1 in 3; gremlin rarer (~1 in 12)
    var forced = (location.search.match(/[?&]popup=(\w+)/) || [])[1];
    if (forced && POPUPS[forced]) return forced;
    if (Math.random() < 1 / 12) return 'gremlin';
    if (Math.random() >= 1 / 3) return null;
    var keys = COMMON.filter(function (k) { return k !== S.lastPopup; });
    return keys[rand(keys.length)];
  }
  function maybePopup(where) {
    if (!run || !run.q || run.q.popupShown || !run.q.popup) return;
    var p = POPUPS[run.q.popup], slot = $('popslot');
    if (p.where !== where || !slot) return;
    run.q.popupShown = true; S.lastPopup = run.q.popup; save();
    var el = document.createElement('button');
    el.type = 'button'; el.className = 'popup'; el.setAttribute('aria-label', p.text + ' (tap to close)');
    el.innerHTML = p.art + '<span>' + esc(p.text) + '</span>';
    slot.innerHTML = ''; slot.appendChild(el);
    var close = function () { el.classList.remove('show'); timers.push(setTimeout(function () { el.remove(); }, RM ? 0 : 1300)); };
    el.addEventListener('click', close);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('show'); }); });
    timers.push(setTimeout(close, 10000)); // real time, even in test mode
  }

  /* ---------- screens ---------- */
  function title() {
    restBtn.hidden = true; document.body.classList.remove('dim');
    h('<h1>Mossbert\'s Doors</h1><div class="stage short">' + backdrop('easy', { door: false }) + '<div class="stage-front">' + mossbert() + '</div></div>' +
      say('Ah, a visitor! I\'ve been waiting... since Tuesday. Which Tuesday? Unclear.') +
      '<div class="col"><button class="btn primary" data-go="start" data-focus>Begin</button>' +
      ((S.friends.length || S.gems.length) ? '<button class="btn soft" data-go="coll">My collection</button>' : '') + '</div>' +
      '<p class="small-note">A calm little preview. No timers. Rest any time.</p>');
    on('[data-go=start]', chooseMode);
    on('[data-go=coll]', function () { collection(false); });
  }
  function chooseMode() {
    h('<h2>How would you like the doors?</h2>' + mossbert('small') + say('Pick a way to play. You can change it next time.') +
      '<div class="stone-row">' + ['Easy', 'Medium', 'Hard'].map(function (m) {
        return '<button class="btn stone' + (S.mode === m.toLowerCase() ? ' sel' : '') + '" data-mode="' + m.toLowerCase() + '">' + m + '</button>'; }).join('') + '</div>');
    on('[data-mode]', function (e) { S.mode = e.currentTarget.dataset.mode; save(); chooseLanterns(); });
  }
  function chooseLanterns() {
    h('<h2>How many lanterns tonight?</h2>' + say('One quest, two, or three? I recommend one. Then a nap. (Mossbert is joking. Mostly.)') +
      '<div class="stone-row lanterns-pick">' + [1, 2, 3].map(function (n) {
        return '<button class="btn stone" data-n="' + n + '" aria-label="' + n + ' lantern' + (n > 1 ? 's' : '') + '"><span class="lamps">' + LAMP.repeat(n) + '</span>' + n + '</button>'; }).join('') + '</div>');
    on('[data-n]', function (e) { startSession(+e.currentTarget.dataset.n); });
  }
  function startSession(n) { run = { total: n, done: 0, mode: S.mode || 'easy', newFriends: [], newGems: [], q: null }; restBtn.hidden = false; nextQuest(); }
  function nextQuest() {
    if (run.done >= run.total) return endSession();
    var quest = QUESTS[S.nextIndex % QUESTS.length];
    S.nextIndex = (S.nextIndex + 1) % QUESTS.length; save();
    run.q = { quest: quest, popup: rollPopup(), popupShown: false };
    settle();
  }

  // Settle: player-paced breathing; the button rests while the circle grows (~3s) or shrinks (~4s).
  function settle() {
    run.beat = settle;
    var q = run.q.quest, breaths = 0, inhale = false;
    h('<h2>' + esc(q.title) + '</h2><p class="small-note">Lantern ' + (run.done + 1) + ' of ' + run.total + '</p>' + say(q.settle) +
      '<div class="breath-wrap"><div class="breath" id="breath">' + friendSVG(q.friend) + '</div>' +
      '<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<button class="btn primary" id="bbtn" data-focus>Breathe in</button><p class="small-note" id="bnote" aria-live="polite">&nbsp;</p></div>');
    var b = $('bbtn'), c = $('breath'), dots = app.querySelectorAll('.dots i'), note = $('bnote');
    b.addEventListener('click', function () {
      if (b.disabled) return;
      if (breaths >= 3) return explore();
      inhale = !inhale;
      c.classList.toggle('in', inhale);
      b.disabled = true; b.classList.add('waiting');
      note.textContent = inhale ? 'Breathing in...' : 'Breathing out...';
      later(function () {
        b.disabled = false; b.classList.remove('waiting'); note.innerHTML = '&nbsp;';
        if (!inhale) { dots[breaths].classList.add('on'); breaths++; }
        b.textContent = breaths >= 3 ? q.friend.name + ' feels calm. Let\'s look around' : (inhale ? 'Breathe out' : 'Breathe in');
      }, inhale ? 3000 : 4000);
    });
  }

  // Explore: tap to bloom; rabbit hops closer with each new bloom; one gem.
  function explore() {
    run.beat = explore;
    var q = run.q.quest, ex = q.explore, gemAt = rand(ex.objects.length), found = false, bloomed = {}, rpos = 14;
    var spots = [[6, 60], [28, 68], [52, 64], [74, 58]];
    h('<h2>Look around</h2>' + say(ex.intro) +
      '<div class="stage" id="scene">' + backdrop(run.mode, { doorX: 590, doorY: 160, doorS: .42 }) + rabbitHTML(rpos, 40) +
      ex.objects.map(function (o, i) { return '<button class="obj" data-i="' + i + '" style="left:' + spots[i][0] + '%;top:' + spots[i][1] + '%" aria-label="Tap the ' + o + '">' + OBJ[o] + '</button>'; }).join('') +
      '</div><p id="exnote" class="small-note" aria-live="polite">The rabbit is waiting up the path.</p>' +
      '<button class="btn primary" id="go" data-focus>Walk on to the door</button>');
    maybePopup('scene');
    var idle;
    function glance() { // wordless hint: rabbit turns toward the gem after ~20s idle. Nothing ends.
      clearTimeout(idle);
      idle = later(function () { if (found) return; var r = $('rabbit'); if (!r) return; r.classList.add('glance'); r.classList.toggle('flip', spots[gemAt][0] < parseFloat(r.style.left)); }, 20000);
    }
    glance();
    on('.obj', function (e) {
      var el = e.currentTarget, i = +el.dataset.i;
      el.classList.toggle('bloomed');
      var r = $('rabbit'); if (r) r.classList.remove('glance', 'flip');
      if (!bloomed[i]) { bloomed[i] = 1; rpos = Math.min(rpos + 12, 66); hopRabbit(rpos); }
      if (i === gemAt && !found) {
        found = true;
        var g = document.createElement('span'); g.className = 'gem-found'; g.textContent = '\u2726';
        g.style.left = el.style.left; g.style.top = (parseFloat(el.style.top) - 12) + '%';
        $('scene').appendChild(g);
        $('exnote').textContent = 'You found a gem: ' + ex.gem.name + '! The rabbit nods. He pretends he knew it was there.';
        if (S.gems.indexOf(ex.gem.id) < 0) { S.gems.push(ex.gem.id); run.newGems.push(ex.gem.name); save(); }
      }
      glance();
    });
    $('go').addEventListener('click', solve);
  }

  function solve() { run.beat = solve; var d = run.q.quest.door; ({ riddle: riddleDoor, lanterns: lanternDoor, math: mathDoor })[d.type](d); maybePopup('door'); }
  var NOTYET = ['Ooh, close-ish. The door is thinking. Want to try again?', 'The door giggled but stayed shut. It\'s ticklish.',
    'Hm. I tried that once too. In 1802.', 'The door says "not quite", very politely.', 'My shell says try another. My shell is usually right.'];
  function notYet(el, extra) { el.innerHTML = say(NOTYET[rand(NOTYET.length)]) + (extra || ''); maybePopup('notyet'); }

  function doorStage(plaque, intro) {
    return '<h2>The door</h2>' + say(intro || 'Let\'s take a slow breath first. In... and out. Lovely. Now, the door.') +
      '<div class="stage door-stage" id="dstage">' + backdrop(run.mode, { doorX: 290, doorY: 70, doorS: .7 }) +
      '<div class="rabbit" style="left:70%;top:42%">' + rabbitSVG() + '</div>' +
      '<div class="mb-front">' + mossbert('tiny') + '</div>' + '</div>' +
      (plaque ? '<div class="plaque" id="plaque">' + esc(plaque) + '</div>' : '');
  }
  // Easy stuck-proof: after 2 tries (misses or swaps) on any door type, offer to just open.
  function easyTry(st) {
    st.tries++;
    if (run.mode === 'easy' && st.tries >= 2 && !$('justopen')) {
      var slot = $('easyslot'); if (!slot) return;
      slot.innerHTML = '<button class="btn soft" id="justopen">Want the door to just open?</button>';
      $('justopen').addEventListener('click', function () { openDoor(false, 'Mossbert leans on the door. It opens. "Sometimes that\'s all it takes."'); });
    }
  }

  function riddleDoor(d) {
    var mode = run.mode, pool = d[mode].slice(), idx = rand(pool.length), st = { tries: 0 };
    function draw(swapped) {
      var r = pool[idx], html = doorStage(r.q) + '<div id="react">' + (swapped ? say('Of course. Here\'s a different one. That one was grumpy anyway.') : '') + '</div>';
      if (mode === 'hard') {
        html += '<form id="hf" class="col" autocomplete="off"><label class="sr" for="ans">Your answer</label>' +
          '<input id="ans" class="answer" placeholder="Type your answer" data-focus>' +
          '<div class="stone-row"><button class="btn primary" type="submit">Try it</button><button class="btn soft" type="button" id="hint">Hint</button></div></form><div id="hintbox"></div>';
      } else {
        html += '<div class="stone-row">' + r.choices.map(function (c, i) { return '<button class="btn stone" data-c="' + i + '"' + (i === 0 ? ' data-focus' : '') + '>' + esc(c) + '</button>'; }).join('') + '</div>' +
          '<div class="col"><button class="btn soft" id="swap">I don\'t know this one. Can I have another?</button><div id="easyslot"></div></div>';
      }
      h(html);
      if (mode !== 'hard') { var keep = st.tries; st.tries = Math.max(0, keep - 1); if (keep) easyTry(st); }
      var react = $('react');
      if (mode === 'hard') {
        $('hf').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = $('ans').value.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
          if (!v) return;
          if (r.accept.some(function (a) { return a === v || (a.length > 2 && v.indexOf(a) >= 0); })) openDoor(true); else notYet(react);
        });
        $('hint').addEventListener('click', function () { $('hintbox').innerHTML = '<div class="hint">' + esc(r.hint) + '</div>'; });
      } else {
        on('[data-c]', function (e) {
          if (+e.currentTarget.dataset.c === r.answer) return openDoor();
          notYet(react, '<div class="hint">' + esc(r.hint) + '</div>'); easyTry(st);
        });
        on('#swap', function () { st.tries++; idx = (idx + 1) % pool.length; draw(true); });
      }
    }
    draw(false);
  }

  function lanternDoor(d) {
    var cfg = d[run.mode], n = cfg.count, order = [], next = 1, st = { tries: 0 }, easy = run.mode === 'easy';
    for (var i = 1; i <= n; i++) order.push(i);
    for (i = n - 1; i > 0; i--) { var j = rand(i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
    h(doorStage(null, d.intro) + '<div class="lantern-row">' + order.map(function (k) {
      return '<button class="lantern" data-k="' + k + '" aria-label="Lantern with ' + k + ' star' + (k > 1 ? 's' : '') + '"><span class="stars" aria-hidden="true">' + '\u2726'.repeat(k) + '</span>' + LAMP + (cfg.showNumbers ? '<span>' + k + '</span>' : '') + '</button>'; }).join('') +
      '</div><div id="react"></div><div class="col"><button class="btn soft" id="hint">Hint</button><div id="easyslot"></div></div>');
    var react = $('react');
    on('.lantern', function (e) {
      var el = e.currentTarget, k = +el.dataset.k;
      if (el.classList.contains('lit')) return;
      if (k === next) { el.classList.add('lit'); next++; if (next > n) openDoor(run.mode === 'hard'); return; }
      if (easy) { // keep lit lanterns; gently shake only the one tapped
        el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
        setLine(react, 'That lantern yawned. It isn\'t its turn yet. Look for ' + next + ' star' + (next > 1 ? 's' : '') + '.');
        maybePopup('notyet');
      } else {
        app.querySelectorAll('.lantern').forEach(function (l) { l.classList.remove('lit'); }); next = 1;
        setLine(react, 'The lanterns blinked sleepily and dimmed. They like to start from one star.'); maybePopup('notyet');
      }
      easyTry(st);
    });
    on('#hint', function () { react.innerHTML = '<div class="hint">' + esc(d.hint) + '</div>'; });
  }

  function mathDoor(d) {
    var cfg = d[run.mode], ans = cfg.need - cfg.have, st = { tries: 0 };
    var stones = ''; for (var i = 0; i < cfg.need; i++) stones += '<span class="' + (i < cfg.have ? '' : 'empty') + '"></span>';
    var html = doorStage('The bridge needs ' + cfg.need + ' stones. We have ' + cfg.have + '. How many more do we need?', 'The door is across a little bridge. Let\'s count together.') +
      '<div class="bridge" role="img" aria-label="' + cfg.have + ' stones placed, ' + ans + ' empty spaces">' + stones + '</div><div id="react"></div>';
    if (cfg.choices) {
      var ch = cfg.choices.slice(); if (ch.indexOf(ans) < 0) ch.push(ans); ch.sort(function (a, b) { return a - b; });
      html += '<div class="stone-row">' + ch.map(function (c, i) { return '<button class="btn stone" data-c="' + c + '"' + (i === 0 ? ' data-focus' : '') + '>' + c + '</button>'; }).join('') + '</div>';
    } else {
      html += '<form id="mf" class="col"><label class="sr" for="ans">How many more stones</label><input id="ans" class="answer" inputmode="numeric" placeholder="Type a number" data-focus><button class="btn primary" type="submit">Place the stones</button></form>';
    }
    html += '<div class="col"><button class="btn soft" id="hint">Hint</button><div id="easyslot"></div></div>';
    h(html);
    var react = $('react');
    function check(v) { if (v === ans) openDoor(run.mode === 'hard'); else { notYet(react); easyTry(st); } }
    on('[data-c]', function (e) { check(+e.currentTarget.dataset.c); });
    var f = $('mf');
    if (f) f.addEventListener('submit', function (e) { e.preventDefault(); var w = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }; var raw = $('ans').value.trim().toLowerCase(); if (!raw) return; check(w[raw] || parseInt(raw, 10)); });
    on('#hint', function () { react.innerHTML = '<div class="hint">' + esc(d.hint) + '</div>'; });
  }

  function openDoor(hardWin, line) {
    var st = $('dstage'); if (st) st.classList.add('open');
    app.querySelectorAll('.stone-row .btn, .col .btn, .lantern, input, #justopen').forEach(function (b) { b.disabled = true; });
    var win = line || (hardWin && run.mode === 'hard' ? 'Mossbert lifts one foot very slowly. "I\'ve been practicing." The door is open.' : 'The door is very impressed. Doors rarely show it.');
    var r = $('react');
    r.innerHTML = say('Mossbert tries a key. Doesn\'t fit. They never fit. Good thing you\'re here.') + say(win) +
      '<button class="btn primary" id="through">Step through</button>';
    if (hardWin && run.mode === 'hard') app.querySelector('.mossbert').classList.add('dance');
    $('through').focus();
    $('through').addEventListener('click', rest);
  }

  // Rest: slow dim (~15s), friend breathes once with the circle, then buttons fade in.
  function rest() {
    var q = run.q.quest, f = q.friend, isNew = S.friends.indexOf(f.id) < 0;
    if (isNew) { S.friends.push(f.id); run.newFriends.push(f.name); }
    S.questsDone++; run.done++; save();
    var last = run.done >= run.total;
    run.beat = function () { restView(f, isNew, last); };
    restView(f, isNew, last);
  }
  function restView(f, isNew, last) {
    h('<h2>A quiet moment</h2><div class="stage">' + backdrop(run.mode, { door: false }) + rabbitHTML(78, 36) +
      '<div class="rest-friend"><div class="breath" id="rbreath">' + friendSVG(f) + '</div></div></div>' +
      say(f.name + ', ' + f.desc + ', ' + (isNew ? 'joins your collection.' : 'is happy to see you again.') + ' Breathe once together.') +
      '<p class="small-note">The rabbit checks his watch. It\'s a cookie. He eats it.</p>' +
      '<div class="col fade-wait" id="restbtns"><button class="btn primary" id="nx">' + (last ? 'All done for today' : 'Next quest') + '</button>' +
      (last ? '' : '<button class="btn soft" id="rh">Rest here</button>') + '</div>');
    requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add('rest-dim'); }); });
    later(function () { var b = $('rbreath'); if (b) b.classList.add('in'); }, 600);
    later(function () { var b = $('rbreath'); if (b) b.classList.remove('in'); }, 4600);
    later(function () { var c = $('restbtns'); if (c) c.classList.add('shown'); }, 8600);
    maybePopup('rest');
    $('nx').addEventListener('click', nextQuest);
    on('#rh', endSession);
  }

  function endSession() {
    restBtn.hidden = true;
    collection(true);
    document.body.classList.add('dim');
  }
  function collection(end) {
    var byId = {}; QUESTS.forEach(function (q) { byId[q.friend.id] = q.friend; byId[q.explore.gem.id] = q.explore.gem; });
    var cards = S.friends.map(function (id) { var f = byId[id]; return f ? '<div class="card"><div style="width:70px;margin:auto">' + friendSVG(f) + '</div><b>' + esc(f.name) + '</b><br><span class="small-note">' + esc(f.desc) + '</span></div>' : ''; }).join('') +
      S.gems.map(function (id) { var g = byId[id]; return g ? '<div class="card gem"><div style="font-size:30px">\u2726</div>' + esc(g.name) + '</div>' : ''; }).join('');
    var showCard = end && localStorage.getItem('qg_calmcard_dismissed') !== '1';
    h('<h2>' + (end ? 'All done for today' : 'Your collection') + '</h2>' + mossbert('small') +
      say(end ? 'Come back anytime. I\'ll be right here. I don\'t move much.' : 'I wrote it all on my shell, so I won\'t forget.') +
      (run && end ? '<p>Tonight: ' + run.done + ' lantern' + (run.done === 1 ? '' : 's') + (run.newFriends.length ? ', new friends: ' + esc(run.newFriends.join(', ')) : '') + (run.newGems.length ? ', gems: ' + run.newGems.length : '') + '.</p>' : '') +
      '<div class="collection">' + (cards || '<p>Nothing yet. Friends and gems will gather here.</p>') + '</div>' +
      (showCard ? '<div class="calm-card" id="cc"><button class="x" id="ccx" aria-label="Close this card">\u00d7</button><p>Want to keep the calm going?</p><p><a href="https://eclectictransformation.com/meditations" rel="noopener">Try a short guided meditation</a></p></div>' : '') +
      '<div class="col"><button class="btn primary" id="home" data-focus>Back to Mossbert</button></div>');
    on('#ccx', function () { localStorage.setItem('qg_calmcard_dismissed', '1'); var c = $('cc'); if (c) c.remove(); });
    on('#home', function () { run = null; title(); });
  }

  restBtn.addEventListener('click', function () {
    if (!run) return;
    restBtn.hidden = true;
    h('<h2>Resting</h2><div class="breath-wrap"><div class="breath in">' + mossbert() + '</div></div>' +
      say('Take as long as you like. I\'ll remember where you stopped. I\'ll write it on my shell.') +
      '<div class="col"><button class="btn primary" id="cont" data-focus>Keep going</button><button class="btn soft" id="fin">Finish for today</button></div>');
    $('cont').addEventListener('click', function () { restBtn.hidden = false; (run.beat || explore)(); });
    $('fin').addEventListener('click', endSession);
  });

  fetch('quests.json').then(function (r) { return r.json(); }).then(function (d) { QUESTS = d.quests; title(); })
    .catch(function () { app.innerHTML = '<div class="screen"><h2>Mossbert misplaced the map.</h2><p>Please open this page from a web server.</p></div>'; });
})();
