/* Mossbert's Doors - calm quest game preview. Static, no network beyond ./quests.json. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var restBtn = document.getElementById('rest-btn');
  var popLayer = document.getElementById('popup-layer');
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'qg_preview_v1';
  var QUESTS = [];
  var S = load();      // persisted
  var run = null;      // current session
  var resumeFn = null;

  function load() {
    try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 1) return d; } catch (e) {}
    return { v: 1, mode: null, friends: [], gems: [], questsDone: 0, nextIndex: 0, lastPopup: null };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function rand(n) { return Math.floor(Math.random() * n); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function h(html) { app.innerHTML = '<div class="screen">' + html + '</div>'; window.scrollTo(0, 0); var f = app.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true }); }
  function on(sel, fn) { app.querySelectorAll(sel).forEach(function (el) { el.addEventListener('click', fn); }); }
  function say(text, who) { return '<div class="say"><b>' + (who || 'Mossbert') + '</b>' + esc(text) + '</div>'; }

  /* ---------- art (flat SVG, palette only) ---------- */
  function mossbert(cls, pose) {
    var foot = pose === 'dance' ? 'translate(0,-14)' : '';
    return '<svg class="mossbert ' + (cls || '') + '" viewBox="0 0 300 220" role="img" aria-label="Mossbert, an old turtle with moss on his shell and a ring of keys">' +
      '<ellipse cx="150" cy="200" rx="120" ry="12" fill="#2B3350" opacity=".12"/>' +
      '<rect x="80" y="160" width="34" height="38" rx="14" fill="#8FAF8A"/>' +
      '<g transform="' + foot + '"><rect x="186" y="160" width="34" height="38" rx="14" fill="#8FAF8A"/></g>' +
      '<path d="M60 170 Q70 70 160 66 Q250 70 250 170 Z" fill="#6E9C9A"/>' +
      '<path d="M100 120 L130 96 L165 104 L190 92 L222 120 L190 146 L150 150 L112 144 Z" fill="none" stroke="#3E4A6B" stroke-width="4" opacity=".45"/>' +
      '<ellipse cx="128" cy="78" rx="34" ry="12" fill="#C9D8B6"/><ellipse cx="190" cy="82" rx="20" ry="9" fill="#C9D8B6"/>' +
      '<rect x="56" y="162" width="200" height="14" rx="7" fill="#C9D8B6"/>' +
      '<path d="M252 150 Q290 140 288 108 Q284 80 258 86 Q240 92 244 120 Z" fill="#8FAF8A"/>' +
      '<circle cx="268" cy="104" r="4" fill="#2B3350"/><path d="M262 96 q6 -4 12 0" stroke="#2B3350" stroke-width="3" fill="none"/>' +
      '<path d="M270 122 q8 4 14 -2" stroke="#2B3350" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<circle cx="276" cy="114" r="5" fill="#E8B48F" opacity=".7"/>' +
      '<circle cx="84" cy="150" r="16" fill="none" stroke="#F2D48A" stroke-width="4"/>' +
      '<rect x="64" y="160" width="6" height="22" rx="2" fill="#F2D48A"/><rect x="80" y="164" width="6" height="18" rx="2" fill="#E8B48F"/><rect x="96" y="162" width="6" height="22" rx="2" fill="#F2D48A"/>' +
      '</svg>';
  }
  function rabbitSVG() {
    return '<svg viewBox="0 0 40 70" aria-hidden="true"><ellipse cx="14" cy="10" rx="4" ry="11" fill="#F4EEDF"/><ellipse cx="24" cy="9" rx="4" ry="11" fill="#F4EEDF"/>' +
      '<circle cx="20" cy="26" r="10" fill="#F4EEDF"/><circle cx="24" cy="25" r="1.6" fill="#2B3350"/>' +
      '<path d="M10 36 h20 l3 22 h-26 z" fill="#6B5A8E"/><circle cx="20" cy="44" r="1.5" fill="#F2D48A"/><circle cx="20" cy="50" r="1.5" fill="#F2D48A"/>' +
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
    bush: '<svg viewBox="0 0 100 100"><g fill="#8FAF8A"><circle cx="32" cy="62" r="22"/><circle cx="62" cy="58" r="26"/><circle cx="48" cy="44" r="20"/></g><g fill="#F4EEDF"><circle cx="40" cy="50" r="4"/><circle cx="64" cy="46" r="4"/><circle cx="56" cy="68" r="4"/></g></svg>',
    mushroom: '<svg viewBox="0 0 100 100"><rect x="40" y="52" width="20" height="34" rx="8" fill="#F4EEDF"/><path d="M14 56 Q50 6 86 56 Z" fill="#E8B48F"/><g fill="#F4EEDF"><circle cx="36" cy="40" r="5"/><circle cx="60" cy="34" r="6"/></g></svg>'
  };
  function sceneBG(mode) {
    var sky = { easy: '#9DB8D6', medium: '#E8B48F', hard: '#3E4A6B' }[mode] || '#9DB8D6';
    var moon = mode === 'hard' ? '<circle cx="640" cy="80" r="30" fill="#F4EEDF"/>' : '<circle cx="640" cy="80" r="34" fill="#F2D48A"/>';
    return '<svg class="bg" viewBox="0 0 720 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="720" height="450" fill="' + sky + '"/>' + moon +
      '<path d="M0 230 Q180 150 360 220 T720 200 V450 H0Z" fill="#C9D8B6"/><path d="M0 300 Q200 240 420 300 T720 290 V450 H0Z" fill="#8FAF8A"/>' +
      '<path d="M300 450 Q360 330 420 230" stroke="#6E9C9A" stroke-width="26" fill="none" opacity=".6"/></svg>';
  }
  function doorSVG() {
    return '<svg class="door" viewBox="0 0 200 240" role="img" aria-label="A round storybook door">' +
      '<path d="M20 240 V100 A80 80 0 0 1 180 100 V240Z" fill="#6B5A8E"/>' +
      '<path class="glow" d="M34 240 V102 A66 66 0 0 1 166 102 V240Z" fill="#F2D48A"/>' +
      '<g class="leaf"><path d="M34 240 V102 A66 66 0 0 1 166 102 V240Z" fill="#D9D3E6"/>' +
      '<line x1="100" y1="40" x2="100" y2="240" stroke="#B9A8D9" stroke-width="3"/><circle cx="140" cy="160" r="8" fill="#2B3350"/></g></svg>';
  }

  /* ---------- rabbit + pop-ups ---------- */
  function rabbitHTML(pos) { return '<div class="rabbit" id="rabbit" style="left:' + pos + '%">' + rabbitSVG() + '</div>'; }
  function hopRabbit(pos) { var r = document.getElementById('rabbit'); if (r) requestAnimationFrame(function () { r.style.left = pos + '%'; }); }

  var POPUPS = {
    umbrella: { where: 'scene', text: 'A single raindrop falls. Mossbert opens an umbrella the size of a coin. "Prepared."', art: '<svg viewBox="0 0 60 60"><path d="M10 30 A20 20 0 0 1 50 30Z" fill="#B9A8D9"/><line x1="30" y1="30" x2="30" y2="50" stroke="#2B3350" stroke-width="3"/><ellipse cx="44" cy="10" rx="3" ry="5" fill="#9DB8D6"/></svg>' },
    shydoor: { where: 'door', text: 'The door blushes, opens an inch, and shuts. "Sorry. Wasn\'t ready."', art: '<svg viewBox="0 0 60 60"><path d="M12 58 V26 A18 18 0 0 1 48 26 V58Z" fill="#6B5A8E"/><circle cx="24" cy="34" r="4" fill="#E8B48F"/><circle cx="36" cy="34" r="4" fill="#E8B48F"/></svg>' },
    lettuce: { where: 'door', text: 'Mossbert chews one lettuce leaf very slowly. "Take your time. I\'m busy anyway. Crunch."', art: '<svg viewBox="0 0 60 60"><path d="M10 40 Q30 0 50 40 Q30 52 10 40Z" fill="#8FAF8A"/><path d="M30 14 V44" stroke="#C9D8B6" stroke-width="3"/></svg>' },
    ahem: { where: 'notyet', text: 'The door clears its throat. "Ahem. Close-ish. I believe in you." Its knob gives a tiny thumbs-up.', art: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="14" fill="#2B3350"/><rect x="26" y="8" width="8" height="18" rx="4" fill="#F2D48A"/></svg>' },
    snore: { where: 'rest', text: 'Mossbert dozes. A snore bubble pops into sparkly zzz. "I was resting my eyes. Professionally."', art: '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="20" fill="#D9D3E6"/><text x="30" y="36" text-anchor="middle" font-size="16" fill="#6B5A8E" font-family="sans-serif">zzz</text></svg>' },
    gremlin: { where: 'scene', gremlin: true, text: 'A gremlin hides behind a flower far too small. "Nope. Just a flower. Very big flower."', art: '<svg viewBox="0 0 60 60"><circle cx="30" cy="34" r="18" fill="#6E9C9A"/><path d="M14 22 L18 10 L24 20 M46 22 L42 10 L36 20" fill="#6E9C9A"/><circle cx="24" cy="32" r="3" fill="#2B3350"/><circle cx="36" cy="32" r="3" fill="#2B3350"/><rect x="28" y="36" width="4" height="22" fill="#8FAF8A"/><circle cx="30" cy="38" r="6" fill="#B9A8D9"/></svg>' }
  };
  // One roll per quest, at the start: ~1 in 3 a pop-up is scheduled; gremlin ~1 in 12.
  function rollPopup() {
    if (Math.random() < 1 / 12) return 'gremlin';
    if (Math.random() >= 1 / 3) return null;
    var keys = ['umbrella', 'shydoor', 'lettuce', 'ahem', 'snore'].filter(function (k) { return k !== S.lastPopup; });
    return keys[rand(keys.length)];
  }
  function maybePopup(where) {
    if (!run || !run.q || run.q.popupShown || !run.q.popup) return;
    var p = POPUPS[run.q.popup];
    if (p.where !== where) return;
    run.q.popupShown = true; S.lastPopup = run.q.popup; save();
    var el = document.createElement('div');
    el.className = 'popup'; el.setAttribute('role', 'status');
    el.innerHTML = p.art + '<span>' + esc(p.text) + '</span>';
    popLayer.innerHTML = ''; popLayer.appendChild(el);
    var close = function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, RM ? 0 : 1300); };
    el.addEventListener('click', close);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('show'); }); });
    setTimeout(close, 9000); // fades on its own; never blocks play
  }

  /* ---------- screens ---------- */
  function title() {
    restBtn.hidden = true; document.body.classList.remove('dim');
    h('<h1>Mossbert\'s Doors</h1>' + mossbert() +
      say('Ah, a visitor! I\'ve been waiting... since Tuesday. Which Tuesday? Unclear.') +
      '<div class="col"><button class="btn primary" data-go="start" data-focus>Begin</button>' +
      ((S.friends.length || S.gems.length) ? '<button class="btn soft" data-go="coll">My collection</button>' : '') + '</div>' +
      '<p class="small-note">A calm little preview. No timers. Rest any time.</p>');
    on('[data-go=start]', chooseMode);
    on('[data-go=coll]', function () { collection(false); });
  }
  function chooseMode() {
    h('<h2>How would you like the doors?</h2>' + mossbert('small') +
      say('Pick a way to play. You can change it next time.') +
      '<div class="col">' + ['Easy', 'Medium', 'Hard'].map(function (m) {
        return '<button class="btn' + (S.mode === m.toLowerCase() ? ' sel' : '') + '" data-mode="' + m.toLowerCase() + '">' + m + '</button>'; }).join('') + '</div>');
    on('[data-mode]', function (e) { S.mode = e.currentTarget.dataset.mode; save(); chooseLanterns(); });
  }
  function chooseLanterns() {
    var lamp = '<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true"><rect x="7" y="8" width="16" height="24" rx="6" fill="#F2D48A" stroke="#6B5A8E" stroke-width="2"/><rect x="11" y="2" width="8" height="6" fill="#6B5A8E"/></svg>';
    h('<h2>How many lanterns tonight?</h2>' +
      say('One quest, two, or three? I recommend one. Then a nap. (Mossbert is joking. Mostly.)') +
      '<div class="row lanterns-pick">' + [1, 2, 3].map(function (n) {
        return '<button class="btn" data-n="' + n + '" aria-label="' + n + ' lantern' + (n > 1 ? 's' : '') + '"><span>' + lamp.repeat(n) + '</span>' + n + '</button>'; }).join('') + '</div>');
    on('[data-n]', function (e) { startSession(+e.currentTarget.dataset.n); });
  }
  function startSession(n) {
    run = { total: n, done: 0, mode: S.mode || 'easy', newFriends: [], newGems: [], q: null };
    restBtn.hidden = false;
    nextQuest();
  }
  function nextQuest() {
    if (run.done >= run.total) return endSession();
    var quest = QUESTS[S.nextIndex % QUESTS.length];
    S.nextIndex = (S.nextIndex + 1) % QUESTS.length; save();
    run.q = { quest: quest, popup: rollPopup(), popupShown: false };
    settle();
  }

  // Settle: a slow, player-paced breathing circle. Tap to breathe in, tap to breathe out. 3 breaths.
  function settle() {
    run.beat = settle; var q = run.q.quest, breaths = 0, inhale = false;
    h('<h2>' + esc(q.title) + '</h2><p class="small-note">Lantern ' + (run.done + 1) + ' of ' + run.total + '</p>' +
      say(q.settle) +
      '<div class="breath-wrap"><div class="breath" id="breath">' + friendSVG(q.friend) + '</div>' +
      '<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<button class="btn primary" id="bbtn" data-focus>Breathe in</button></div>');
    var b = document.getElementById('bbtn'), c = document.getElementById('breath'), dots = app.querySelectorAll('.dots i');
    b.addEventListener('click', function () {
      if (breaths >= 3) return explore();
      inhale = !inhale;
      c.classList.toggle('in', inhale);
      if (!inhale) { dots[breaths].classList.add('on'); breaths++; }
      if (breaths >= 3) { b.textContent = q.friend.name + ' feels calm. Let\'s look around'; }
      else b.textContent = inhale ? 'Breathe out' : 'Breathe in';
    });
  }

  // Explore: tap things to bloom; one hides the gem.
  function explore() {
    run.beat = explore; var q = run.q.quest, ex = q.explore, gemAt = rand(ex.objects.length), found = false;
    var spots = [[8, 58], [30, 66], [56, 62], [76, 56]];
    h('<h2>Look around</h2>' + say(ex.intro, 'Mossbert') +
      '<div class="scene" id="scene">' + sceneBG(run.mode) + rabbitHTML(20) +
      ex.objects.map(function (o, i) { return '<button class="obj" data-i="' + i + '" style="left:' + spots[i][0] + '%;top:' + spots[i][1] + '%" aria-label="Tap the ' + o + '">' + OBJ[o] + '</button>'; }).join('') +
      '</div><p id="exnote" class="small-note">The rabbit is waiting up ahead.</p>' +
      '<button class="btn primary" id="go" data-focus>Walk on to the door</button>');
    hopRabbit(48);
    maybePopup('scene');
    on('.obj', function (e) {
      var el = e.currentTarget, i = +el.dataset.i;
      el.classList.toggle('bloomed');
      if (i === gemAt && !found) {
        found = true;
        var g = document.createElement('span'); g.className = 'gem-found'; g.textContent = '\u2726';
        g.style.left = el.style.left; g.style.top = (parseFloat(el.style.top) - 12) + '%';
        document.getElementById('scene').appendChild(g);
        document.getElementById('exnote').textContent = 'You found a gem: ' + ex.gem.name + '!';
        if (S.gems.indexOf(ex.gem.id) < 0) { S.gems.push(ex.gem.id); run.newGems.push(ex.gem.name); save(); }
      }
    });
    document.getElementById('go').addEventListener('click', solve);
  }

  function solve() {
    run.beat = solve; var d = run.q.quest.door;
    ({ riddle: riddleDoor, lanterns: lanternDoor, math: mathDoor })[d.type](d);
    maybePopup('door');
  }
  var NOTYET = [
    'Ooh, close-ish. The door is thinking. Want to try again?',
    'The door giggled but stayed shut. It\'s ticklish.',
    'Hm. I tried that once too. In 1802.',
    'The door says "not quite", very politely.',
    'My shell says try another. My shell is usually right.'
  ];
  function notYet(el) { el.innerHTML = say(NOTYET[rand(NOTYET.length)]); maybePopup('notyet'); }
  function doorHead(text) {
    return '<h2>The door</h2><div class="door-wrap">' + rabbitSVGInline() + doorSVG() + mossbert('small') + '</div>' +
      say(text || 'Let\'s take a slow breath first. In... and out. Lovely. Now, the door.');
  }
  function rabbitSVGInline() { return '<div style="width:44px;opacity:.8;align-self:flex-end;margin-right:22%" aria-label="The rabbit waits by the door" role="img">' + rabbitSVG() + '</div>'; }

  function riddleDoor(d) {
    var mode = run.mode, pool = d[mode].slice(), idx = rand(pool.length), swaps = 0;
    function draw() {
      var r = pool[idx], html = doorHead() + '<div class="riddle" id="rq">' + esc(r.q) + '</div><div id="react"></div>';
      if (mode === 'hard') {
        html += '<form id="hf" class="col" autocomplete="off"><label class="sr" for="ans">Your answer</label>' +
          '<input id="ans" class="answer" placeholder="Type your answer" data-focus>' +
          '<button class="btn primary" type="submit">Try it</button><button class="btn soft" type="button" id="hint">Hint</button></form><div id="hintbox"></div>';
      } else {
        html += '<div class="col">' + r.choices.map(function (c, i) { return '<button class="btn" data-c="' + i + '"' + (i === 0 ? ' data-focus' : '') + '>' + esc(c) + '</button>'; }).join('') + '</div>' +
          '<div class="col"><button class="btn soft" id="swap">I don\'t know this one. Can I have another?</button>' +
          (mode === 'easy' && swaps >= 2 ? '<button class="btn soft" id="justopen">Want the door to just open?</button>' : '') + '</div>';
      }
      h(html);
      var react = document.getElementById('react');
      if (mode === 'hard') {
        document.getElementById('hf').addEventListener('submit', function (e) {
          e.preventDefault();
          var v = document.getElementById('ans').value.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
          if (!v) return;
          if (r.accept.some(function (a) { return a === v || v.indexOf(a) >= 0 && a.length > 2; })) openDoor(true);
          else notYet(react);
        });
        document.getElementById('hint').addEventListener('click', function () { document.getElementById('hintbox').innerHTML = '<div class="hint">' + esc(r.hint) + '</div>'; });
      } else {
        on('[data-c]', function (e) { if (+e.currentTarget.dataset.c === r.answer) openDoor(); else { notYet(react); react.insertAdjacentHTML('beforeend', '<div class="hint">' + esc(r.hint) + '</div>'); } });
        on('#swap', function () { swaps++; idx = (idx + 1) % pool.length; draw(); var rr = document.getElementById('react'); rr.innerHTML = say('Of course. Here\'s a different one. That one was grumpy anyway.'); });
        on('#justopen', function () { openDoor(false, 'Mossbert leans on the door. It opens. "Sometimes that\'s all it takes."'); });
      }
    }
    draw();
  }

  function lanternDoor(d) {
    var cfg = d[run.mode], n = cfg.count, order = [];
    for (var i = 1; i <= n; i++) order.push(i);
    for (i = n - 1; i > 0; i--) { var j = rand(i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
    var next = 1;
    var lamp = '<svg viewBox="0 0 46 60" aria-hidden="true"><rect x="10" y="12" width="26" height="40" rx="10" fill="#F4EEDF" stroke="#6B5A8E" stroke-width="3"/><ellipse class="flame" cx="23" cy="32" rx="7" ry="11" fill="#F2D48A"/><rect x="16" y="4" width="14" height="8" fill="#6B5A8E"/></svg>';
    h(doorHead(d.intro) + '<div class="lantern-row">' + order.map(function (k) {
      return '<button class="lantern" data-k="' + k + '" aria-label="Lantern with ' + k + ' star' + (k > 1 ? 's' : '') + '"><span aria-hidden="true">' + '\u2726'.repeat(k) + '</span>' + lamp + (cfg.showNumbers ? '<span>' + k + '</span>' : '') + '</button>'; }).join('') +
      '</div><div id="react"></div><button class="btn soft" id="hint">Hint</button>');
    var react = document.getElementById('react');
    on('.lantern', function (e) {
      var el = e.currentTarget, k = +el.dataset.k;
      if (el.classList.contains('lit')) return;
      if (k === next) { el.classList.add('lit'); next++; if (next > n) openDoor(run.mode === 'hard'); }
      else { app.querySelectorAll('.lantern').forEach(function (l) { l.classList.remove('lit'); }); next = 1; react.innerHTML = say('The lanterns blinked sleepily and dimmed. They like to start from one star.'); maybePopup('notyet'); }
    });
    on('#hint', function () { react.innerHTML = '<div class="hint">' + esc(d.hint) + '</div>'; });
  }

  function mathDoor(d) {
    var cfg = d[run.mode], ans = cfg.need - cfg.have;
    var stones = ''; for (var i = 0; i < cfg.need; i++) stones += '<span class="' + (i < cfg.have ? '' : 'empty') + '"></span>';
    var html = doorHead('The bridge to the door needs ' + cfg.need + ' stones. We have ' + cfg.have + '. How many more do we need?') +
      '<div class="stones" role="img" aria-label="' + cfg.have + ' stones placed, ' + ans + ' empty spaces">' + stones + '</div><div id="react"></div>';
    if (cfg.choices) {
      var ch = cfg.choices.slice(); if (ch.indexOf(ans) < 0) ch.push(ans); ch.sort(function (a, b) { return a - b; });
      html += '<div class="row">' + ch.map(function (c, i) { return '<button class="btn" data-c="' + c + '"' + (i === 0 ? ' data-focus' : '') + '>' + c + '</button>'; }).join('') + '</div>';
    } else {
      html += '<form id="mf" class="col"><label class="sr" for="ans">How many more stones</label><input id="ans" class="answer" inputmode="numeric" placeholder="Type a number" data-focus><button class="btn primary" type="submit">Place the stones</button></form>';
    }
    html += '<button class="btn soft" id="hint">Hint</button>';
    h(html);
    var react = document.getElementById('react');
    function check(v) { if (v === ans) openDoor(run.mode === 'hard'); else notYet(react); }
    on('[data-c]', function (e) { check(+e.currentTarget.dataset.c); });
    var f = document.getElementById('mf');
    if (f) f.addEventListener('submit', function (e) { e.preventDefault(); var w = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }; var raw = document.getElementById('ans').value.trim().toLowerCase(); if (!raw) return; check(w[raw] || parseInt(raw, 10)); });
    on('#hint', function () { react.innerHTML = '<div class="hint">' + esc(d.hint) + '</div>'; });
  }

  function openDoor(hardWin, line) {
    var door = app.querySelector('.door'); if (door) door.classList.add('open');
    app.querySelectorAll('.col .btn, .row .btn, .lantern, input, #hint, #swap').forEach(function (b) { b.disabled = true; });
    var msg = line || (hardWin && run.mode === 'hard' ? 'Mossbert lifts one foot very slowly. "I\'ve been practicing." The door is open.' : 'The door is very impressed. Doors rarely show it.');
    var r = document.getElementById('react') || app.querySelector('.screen');
    r.innerHTML = say(msg) + '<button class="btn primary" id="through" data-focus>Step through</button>';
    document.getElementById('through').focus();
    document.getElementById('through').addEventListener('click', rest);
  }

  function rest() {
    var q = run.q.quest, f = q.friend, isNew = S.friends.indexOf(f.id) < 0;
    if (isNew) { S.friends.push(f.id); run.newFriends.push(f.name); }
    S.questsDone++; run.done++; save();
    var last = run.done >= run.total;
    run.beat = function () { restView(f, isNew, last); };
    restView(f, isNew, last);
  }
  function restView(f, isNew, last) {
    h('<h2>A quiet moment</h2><div class="scene" style="aspect-ratio:16/7">' + sceneBG(run.mode) + rabbitHTML(60) +
      '<div style="position:absolute;left:38%;top:30%;width:24%">' + friendSVG(f) + '</div></div>' +
      say(f.name + ', ' + f.desc + ', ' + (isNew ? 'joins your collection.' : 'is happy to see you again.') + ' The world lets out a slow breath.') +
      '<div class="col"><button class="btn primary" id="nx" data-focus>' + (last ? 'All done for today' : 'Next quest') + '</button>' +
      (last ? '' : '<button class="btn soft" id="rh">Rest here</button>') + '</div>');
    hopRabbit(86);
    maybePopup('rest');
    document.getElementById('nx').addEventListener('click', nextQuest);
    on('#rh', endSession);
  }

  function endSession() {
    restBtn.hidden = true; popLayer.innerHTML = '';
    document.body.classList.add('dim');
    collection(true);
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
    on('#ccx', function () { localStorage.setItem('qg_calmcard_dismissed', '1'); var c = document.getElementById('cc'); if (c) c.remove(); });
    on('#home', function () { run = null; title(); });
  }

  // Rest button: always available during play. Pauses gently; continue or finish.
  restBtn.addEventListener('click', function () {
    if (!run) return;
    var saved = app.innerHTML;
    restBtn.hidden = true;
    h('<h2>Resting</h2><div class="breath-wrap"><div class="breath in">' + mossbert('', 'rest') + '</div></div>' +
      say('Take as long as you like. I\'ll remember where you stopped. I\'ll write it on my shell.') +
      '<div class="col"><button class="btn primary" id="cont" data-focus>Keep going</button><button class="btn soft" id="fin">Finish for today</button></div>');
    document.getElementById('cont').addEventListener('click', function () { restBtn.hidden = false; resumeQuest(); });
    document.getElementById('fin').addEventListener('click', endSession);
  });
  function resumeQuest() { settleOrRepeat(); }
  function settleOrRepeat() { // simplest calm resume: restart current quest from its door-side beat
    (run.beat || explore)();
  }

  fetch('quests.json').then(function (r) { return r.json(); }).then(function (d) { QUESTS = d.quests; title(); })
    .catch(function () { app.innerHTML = '<div class="screen"><h2>Mossbert misplaced the map.</h2><p>Please open this page from a web server.</p></div>'; });
})();
