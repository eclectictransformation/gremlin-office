/* Mossbert's Doors - calm quest game preview v4 (tap-along path). Static; only fetches ./quests.json.
   No timers shown, no fail states, no saving progress. localStorage holds preferences only. */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var restBtn = document.getElementById('rest-btn');
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TS = /[?&]test=1/.test(location.search) ? (parseFloat((location.search.match(/[?&]speed=([\d.]+)/) || [])[1]) || 0.02) : 1; // test-only speed-up of calm delays (?test=1, optional &speed=0.2)
  var KEY = 'qg_preview_v1'; // preferences only: last age + difficulty picked (no progress, no collection)
  var DATA = null, P = loadPrefs(), run = null, timers = [];

  function loadPrefs() {
    try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 2) return { v: 2, age: d.age || null, diff: d.diff || null }; } catch (e) {}
    return { v: 2, age: null, diff: null };
  }
  function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify({ v: 2, age: P.age, diff: P.diff })); } catch (e) {} }
  function later(fn, ms) { var t = setTimeout(fn, ms * TS); timers.push(t); return t; }
  function rand(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rand(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function on(sel, fn) { app.querySelectorAll(sel).forEach(function (el) { el.addEventListener('click', fn); }); }
  function say(text, who) { return '<div class="say"><b>' + (who || 'Mossbert') + '</b><span class="line">' + esc(text) + '</span></div>'; }
  function h(html) {
    timers.forEach(clearTimeout); timers = [];
    document.body.classList.remove('rest-dim');
    app.innerHTML = '<div class="screen">' + html + '</div>';
    window.scrollTo(0, 0);
    var f = app.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true });
  }
  /* Music toggle: off by default, remembered. No track yet; set MUSIC_SRC when the Frequency Weaver track arrives. */
  var MUSIC_SRC = '', MKEY = 'qg_music_on', audio = null, musicBtn = $('music-btn');
  function musicOn() { try { return localStorage.getItem(MKEY) === '1'; } catch (e) { return false; } }
  function paintMusic() {
    var onNow = musicOn();
    musicBtn.setAttribute('aria-pressed', onNow ? 'true' : 'false');
    musicBtn.textContent = onNow ? 'Music: on' : 'Music: off';
    musicBtn.title = MUSIC_SRC ? '' : 'Music is coming soon';
  }
  function playMusic() {
    if (!MUSIC_SRC || !musicOn()) { if (audio) audio.pause(); return; }
    if (!audio) { audio = new Audio(MUSIC_SRC); audio.loop = true; audio.volume = 0.35; }
    audio.play().catch(function () {});
  }
  musicBtn.addEventListener('click', function () {
    try { localStorage.setItem(MKEY, musicOn() ? '0' : '1'); } catch (e) {}
    paintMusic(); playMusic();
  });
  paintMusic();

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
      (opts.extra || '') + door + (opts.front || '') + '</svg>';
  }
  var LAMP = '<svg viewBox="0 0 50 80" aria-hidden="true"><path d="M17 10 Q25 0 33 10" fill="none" stroke="#2B3350" stroke-width="3"/>' +
    '<path d="M12 18 L38 18 L33 10 L17 10Z" fill="#6B5A8E"/>' +
    '<rect x="13" y="18" width="24" height="40" rx="4" fill="#F4EEDF" stroke="#6B5A8E" stroke-width="3"/>' +
    '<ellipse class="flame" cx="25" cy="40" rx="6" ry="10" fill="#F2D48A"/><ellipse class="flame" cx="25" cy="42" rx="2.5" ry="5" fill="#E8B48F"/>' +
    '<line x1="25" y1="18" x2="25" y2="58" stroke="#6B5A8E" stroke-width="1.5" opacity=".35"/>' +
    '<path d="M10 58 H40 L36 66 H14Z" fill="#6B5A8E"/></svg>';

  /* ---------- v4 data ---------- */
  var AGES = { kids: 'Kids', teens: 'Teens', adults: 'Adults' };
  var DIFFS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  // Breath lengths in seconds [in, out]. Opening = short and building; calm spots longer; door = today's v3 length (4 / 4.5).
  var BREATHS = {
    kids:   { open: [[2, 2.5], [2.5, 3], [3, 3.5]], bridge: [[3, 3.5]],   bench: [[3.5, 4], [3.5, 4]], door: [[4, 4.5], [4, 4.5]] },
    teens:  { open: [[2.5, 3], [3, 3.5], [3.5, 4]], bridge: [[3.5, 4]],   bench: [[4, 4.5], [4, 4.5]], door: [[4, 4.5], [4, 4.5]] },
    adults: { open: [[3, 3.5], [3.5, 4], [4, 4.5]], bridge: [[4, 4.5]],   bench: [[4.5, 5], [4.5, 5]], door: [[4, 4.5], [4, 4.5]] }
  };
  var REST_GAP = 1000; // soft rest between breaths, no hold
  var BUDDIES = [
    { id: 'mossbun', name: 'Mossbun', desc: 'a mossy bunny-loaf that rolls', color: '#8FAF8A', acc: '🌿',
      lines: { start: 'Mossbun rolls up beside you.', solved: 'Mossbun wiggles. A tiny leaf pops out.', bridge: 'Mossbun breathes with you.', garden: 'Mossbun sniffs a teacup planter.', bench: 'Little flowers sprout on Mossbun.', door: 'Mossbun rolls right up to the door.' } },
    { id: 'teaspoon', name: 'Teaspoon', desc: 'a polite snail with a teacup shell', color: '#E8B48F', acc: '☕',
      lines: { start: 'Teaspoon bows. The rabbit waits a bit longer.', solved: 'Teaspoon bows, very slowly.', bridge: 'Teaspoon breathes with you. Slowly. Politely.', garden: 'Teaspoon bows to a hedge.', bench: 'Teaspoon bows to the bench.', door: 'Teaspoon bows to the door.' } },
    { id: 'glim', name: 'Glim', desc: 'a glowworm in a lampshade hat', color: '#F2D48A', acc: '💡',
      lines: { start: 'Glim glows softly beside you.', solved: 'Glim blinks happily.', bridge: 'Glim glows brighter as you breathe.', garden: 'Glim lights up a dewdrop.', bench: 'Glim glows warm and low.', door: 'Glim lights up the keyhole.' } },
    { id: 'puddlewump', name: 'Puddlewump', desc: 'a walking puddle', color: '#9DB8D6', acc: '💧',
      lines: { start: 'Puddlewump splishes up beside you.', solved: 'Puddlewump ripples.', bridge: 'Puddlewump reflects the sky, upside down.', garden: 'Puddlewump reflects a cake that isn\'t there.', bench: 'Puddlewump goes very still and calm.', door: 'Puddlewump reflects the door. Two doors now.' } },
    { id: 'fernsworth', name: 'Sir Fernsworth', desc: 'a tall fern in a knitted sweater', color: '#6E9C9A', acc: '🧶',
      lines: { start: 'Sir Fernsworth: "Why did the fern cross the path...?"', solved: 'Sir Fernsworth: "Splendid. Now, where was I?"', bridge: 'Sir Fernsworth breathes, fronds rising.', garden: 'Sir Fernsworth: "...it was looking for a little shade..."', bench: 'Sir Fernsworth sits. His sweater sighs.', door: 'Sir Fernsworth: "...and found it was just leafing. Ha."' } },
    { id: 'pebbo', name: 'Pebbo', desc: 'an apricot pebble who thinks it\'s a bird', color: '#E8B48F', acc: '🪶',
      lines: { start: 'Pebbo "flies" over. (Rolls.) "Tweet," it says, deeply.', solved: 'Pebbo: "Tweet." (Deep, proud.)', bridge: 'Pebbo breathes. Rocks don\'t, usually.', garden: 'Pebbo perches on a hedge. Rolls off. Perches again.', bench: 'Pebbo nests on the bench.', door: 'Pebbo: "Tweet." (Deep, hopeful.)' } }
  ];
  var STOPS = ['doorway', 'hallway', 'bridge', 'garden', 'bench', 'door'];
  var LINES = { // rabbit lines by age; path humor only, never on doors
    kids:   { doorway: 'This way. Not fast. Just this way.', hallway: 'Fix the path, please.', bridge: 'Stop and look. Water is slow.', garden: 'A puzzle. And maybe a secret.', bench: 'A bench. Sit, or walk on.', door: 'Last door. It likes riddles.' },
    teens:  { doorway: 'This way. Not fast. Just this way.', hallway: 'Long hallway. Good. More hallway for us.', bridge: 'Stop for a breath. The water isn\'t going anywhere.', garden: 'I\'d say this one\'s easy, but you\'d make the face.', bench: 'Bench. Optional. Like most good things.', door: 'Last door. It likes riddles. And compliments. Try riddles first.' },
    adults: { doorway: 'This way. Not fast. Just this way.', hallway: 'Nobody\'s grading this. I checked. Twice.', bridge: 'Stop and look a while.', garden: 'Stuck? I was stuck once. I took a nap. Then I wasn\'t.', bench: 'A bench, if you want it.', door: 'Last door. It likes riddles. And compliments. Try riddles first.' }
  };
  var TITLES = { doorway: 'The doorway', hallway: 'The hallway', bridge: 'The bridge', garden: 'The garden', bench: 'The bench', door: 'The riddle door' };

  /* ---------- art bits ---------- */
  function walkerSVG() {
    return '<svg viewBox="0 0 40 70" aria-hidden="true"><path d="M20 4 Q34 6 34 26 L38 64 H2 L6 26 Q6 6 20 4Z" fill="#B9A8D9"/>' +
      '<ellipse cx="20" cy="24" rx="9" ry="10" fill="#3E4A6B" opacity=".35"/><ellipse cx="13" cy="66" rx="6" ry="3.5" fill="#6B5A8E"/><ellipse cx="27" cy="66" rx="6" ry="3.5" fill="#6B5A8E"/></svg>';
  }
  function buddySVG(b) { return friendSVG({ color: b.color }) + '<span class="acc" aria-hidden="true">' + b.acc + '</span>'; }
  function stopProps(stop) {
    switch (stop) {
      case 'doorway': return '<path d="M0 450 V230 Q120 140 260 230 V450Z" fill="#8FAF8A"/><path d="M70 330 V280 A60 60 0 0 1 190 280 V330Z" fill="#6B5A8E"/><path d="M130 330 V230 A60 60 0 0 1 190 280 V330Z" fill="#F2D48A" opacity=".8"/><rect x="95" y="330" width="70" height="10" rx="5" fill="#E8B48F"/>';
      case 'hallway': var s = ''; for (var i = 0; i < 4; i++) { var x = 120 + i * 140; s += '<path d="M' + x + ' 360 V230 A50 50 0 0 1 ' + (x + 100) + ' 230 V360" fill="none" stroke="#C9D8B6" stroke-width="18"/><path d="M' + (x + 8) + ' 260 q10 30 0 60" stroke="#6E9C9A" stroke-width="5" fill="none"/>' +
        '<g class="lamp" style="--d:' + i * .6 + 's"><line x1="' + (x + 50) + '" y1="185" x2="' + (x + 50) + '" y2="205" stroke="#2B3350" stroke-width="2"/><rect x="' + (x + 42) + '" y="205" width="16" height="22" rx="4" fill="#F4EEDF" stroke="#6B5A8E" stroke-width="2"/><circle class="flame" cx="' + (x + 50) + '" cy="216" r="5" fill="#F2D48A"/></g>'; } return s;
      case 'bridge': return '<rect x="0" y="330" width="720" height="120" fill="#6E9C9A"/><path class="ripple" d="M60 380 q30 -10 60 0 t60 0 M420 410 q30 -10 60 0 t60 0" stroke="#D9D3E6" stroke-width="3" fill="none" opacity=".6"/>' +
        '<ellipse class="fish" cx="520" cy="395" rx="22" ry="7" fill="#2B3350" opacity=".18"/><path d="M180 330 Q360 280 560 330" stroke="#B9875F" stroke-width="22" fill="none"/><path d="M180 300 Q360 250 560 300" stroke="#6B5A8E" stroke-width="5" fill="none"/>' +
        '<g stroke="#8FAF8A" stroke-width="5"><line x1="80" y1="340" x2="76" y2="290"/><line x1="96" y1="340" x2="100" y2="296"/><line x1="640" y1="340" x2="644" y2="292"/></g>';
      case 'garden': return '<circle cx="110" cy="300" r="55" fill="#6E9C9A"/><circle cx="620" cy="300" r="60" fill="#6E9C9A"/><path d="M300 360 h40 l-6 30 h-28z" fill="#D9D3E6"/><circle cx="320" cy="350" r="14" fill="#B9A8D9"/>' +
        '<line x1="470" y1="210" x2="470" y2="360" stroke="#B9875F" stroke-width="8"/><line x1="430" y1="250" x2="510" y2="250" stroke="#B9875F" stroke-width="7"/><circle cx="470" cy="200" r="20" fill="#F2D48A"/><path d="M450 222 h40 v10 h-40z" fill="#6B5A8E"/>';
      case 'bench': return '<path d="M560 150 V360" stroke="#B9875F" stroke-width="20"/><circle cx="560" cy="140" r="80" fill="#8FAF8A"/><rect x="40" y="170" width="240" height="190" fill="#D9D3E6"/><rect x="80" y="200" width="160" height="110" rx="10" fill="#9DB8D6"/><path d="M80 290 q80 -40 160 0 v20 h-160z" fill="#C9D8B6"/>' +
        '<rect x="360" y="320" width="170" height="14" rx="5" fill="#B9875F"/><rect x="360" y="296" width="170" height="10" rx="5" fill="#B9875F"/><rect x="372" y="334" width="10" height="28" fill="#6B5A8E"/><rect x="508" y="334" width="10" height="28" fill="#6B5A8E"/>';
      default: return '<rect x="0" y="150" width="720" height="210" fill="#C9C1DA" opacity=".55"/>';
    }
  }
  function sceneHTML(stop, extra) {
    var i = STOPS.indexOf(stop), isDoor = stop === 'door';
    var sky = isDoor ? 'hard' : (i >= 3 && run.diff !== 'hard' ? 'medium' : run.diff); // drift toward dusk along the path
    var bg = backdrop(sky, isDoor ? { doorX: 290, doorY: 70, doorS: .7, extra: stopProps(stop) } : { door: false, extra: stopProps(stop) });
    var b = run.buddy;
    var rabbitPos = isDoor ? 74 : 86;
    return '<div class="stage path-stage stop-' + stop + '" id="scene">' + bg +
      (isDoor ? '<div class="mb-front">' + mossbert('tiny') + '</div>' : '') +
      '<div class="walker" aria-hidden="true">' + walkerSVG() + '</div>' +
      '<div class="buddy" id="buddy" aria-hidden="true">' + buddySVG(b) + '</div>' +
      '<div class="rabbit guide" id="rabbit" style="left:' + rabbitPos + '%;top:46%">' + rabbitSVG() + '</div>' +
      (extra || '') + '<div id="breathslot"></div>' +
      '<button class="walk-arrow" id="walk" hidden aria-label="Walk on to the next stop">\u279C</button></div>' +
      '<div class="pebbles" aria-label="Stop ' + (i + 1) + ' of 6">' + STOPS.map(function (s, k) { return '<i class="' + (k < i ? 'on' : k === i ? 'here' : '') + '"></i>'; }).join('') + '</div>';
  }

  /* ---------- start screens ---------- */
  function title() {
    restBtn.hidden = true; document.body.classList.remove('dim'); run = null;
    h('<h1>Mossbert\'s Doors</h1><div class="stage short">' + backdrop('easy', { door: false }) + '<div class="stage-front">' + mossbert() + '</div></div>' +
      say('Ah, a visitor! I keep the riddle door at the end of the path. A rabbit will show you the way.') +
      '<h2 class="pick-h">Who is walking today?</h2><div class="stone-row" id="ages">' + Object.keys(AGES).map(function (a) {
        return '<button class="btn stone' + (P.age === a ? ' sel' : '') + '" data-age="' + a + '"' + (a === 'kids' ? ' data-focus' : '') + '>' + AGES[a] + '</button>'; }).join('') + '</div>' +
      '<p class="small-note">A calm little walk, a few minutes long. No timers. Rest any time.</p>');
    on('[data-age]', function (e) { P.age = e.currentTarget.dataset.age; savePrefs(); chooseDiff(); });
  }
  function chooseDiff() {
    h('<h2>How tricky should the path be?</h2>' + mossbert('small') + say(P.age === 'kids' ? 'Pick one. All of them are nice.' : 'Pick a way to play. You can change it next walk.') +
      '<div class="stone-row">' + Object.keys(DIFFS).map(function (d, k) {
        return '<button class="btn stone' + (P.diff === d ? ' sel' : '') + '" data-diff="' + d + '"' + (k === 0 ? ' data-focus' : '') + '>' + DIFFS[d] + '</button>'; }).join('') + '</div>' +
      '<div class="col"><button class="btn soft" id="back">Back</button></div>');
    on('[data-diff]', function (e) { P.diff = e.currentTarget.dataset.diff; savePrefs(); chooseBuddy(); });
    on('#back', title);
  }
  function chooseBuddy() {
    h('<h2>Pick a travel buddy</h2>' + say('Someone small to walk with you. Just for today.') +
      '<div class="buddy-grid">' + BUDDIES.map(function (b, k) {
        return '<button class="buddy-card" data-b="' + k + '"' + (k === 0 ? ' data-focus' : '') + '><span class="bpic">' + buddySVG(b) + '</span><b>' + esc(b.name) + '</b><span class="small-note">' + esc(b.desc) + '</span></button>'; }).join('') + '</div>' +
      '<div class="col"><button class="btn soft" id="back">Back</button></div>');
    on('[data-b]', function (e) { startWalk(BUDDIES[+e.currentTarget.dataset.b]); });
    on('#back', chooseDiff);
  }
  function startWalk(buddy) {
    run = { age: P.age || 'kids', diff: P.diff || 'easy', buddy: buddy, i: 0, solved: {}, gem: false, sat: false };
    run.br = BREATHS[run.age];
    restBtn.hidden = false;
    stop(0);
  }

  /* ---------- breathing (automatic, no click, no skip) ---------- */
  function breathe(seq, label, done) {
    var slot = $('breathslot'); if (!slot) return;
    slot.innerHTML = '<div class="sky-breath"><div class="breath" id="breath"></div><p class="bnote" id="bnote" aria-live="polite">' + esc(label) + '</p></div>';
    var c = $('breath'), note = $('bnote'), sc = $('scene'), k = 0, kids = run.age === 'kids';
    function one() {
      if (!$('breath')) return;
      var b = seq[k];
      c.style.transitionDuration = b[0] + 's'; c.classList.add('in'); sc.classList.add('inhale');
      note.textContent = 'Breathe in…';
      later(function () {
        if (!$('breath')) return;
        c.style.transitionDuration = b[1] + 's'; c.classList.remove('in'); sc.classList.remove('inhale');
        note.textContent = kids ? 'And out…' : 'And slowly out…';
        later(function () {
          if (!$('breath')) return;
          k++;
          if (k < seq.length) { note.textContent = '…'; return later(one, REST_GAP); }
          note.textContent = 'Lovely.';
          later(function () { if ($('breathslot')) $('breathslot').innerHTML = ''; done(); }, 900);
        }, b[1] * 1000);
      }, b[0] * 1000);
    }
    later(one, 1000);
  }

  /* ---------- the path ---------- */
  function lineBox() { return '<div id="lines">' + say(LINES[run.age][STOPS[run.i]], 'The rabbit') + '</div>'; }
  function buddyLine(key) { var el = $('bline'); if (el) el.textContent = run.buddy.lines[key]; }
  function stop(i) {
    run.i = i; var s = STOPS[i];
    run.beat = function () { stop(run.i); };
    var extra = '';
    if (run.age === 'adults' && run.diff === 'easy' && i <= 3) extra += '<div class="letter-sign" style="left:' + [38, 30, 44, 34][i] + '%">' + 'NAPS'[i] + '</div>';
    if (s === 'garden' && !run.gem) extra += '<button class="gem-spot" id="gem" aria-label="Something on the scarecrow">🧦</button>';
    h('<h2>' + TITLES[s] + '</h2>' + sceneHTML(s, extra) + lineBox() +
      '<p class="small-note buddy-line" id="bline" aria-live="polite"></p><div id="panel" class="panel"></div>');
    if (s === 'doorway') buddyLine('start'); else if (s === 'hallway') $('bline').textContent = run.buddy.name + ' follows close behind.'; else buddyLine(s);
    on('#gem', function (e) {
      run.gem = true; e.currentTarget.classList.add('found');
      $('bline').textContent = 'A hidden gem: a sock on the scarecrow. Nobody knows whose. ✦';
      e.currentTarget.setAttribute('aria-label', 'Found: a sock on the scarecrow');
    });
    on('#walk', function () { walkOn(); });
    var panel = $('panel');
    if (s === 'doorway') breathe(run.br.open, run.age === 'kids' ? 'Three slow breaths with ' + run.buddy.name + '.' : 'Three breaths to start. Short, then a little longer.', ready);
    else if (s === 'bridge') breathe(run.br.bridge, 'One slow breath. ' + run.buddy.name + ' breathes too.', ready);
    else if (s === 'hallway' || s === 'garden') {
      if (run.solved[s]) { light(); ready(); }
      else PUZZLES[run.age][s](panel, run.diff, function () { run.solved[s] = true; light(); buddyLine('solved'); later(ready, 700); });
    }
    else if (s === 'bench') benchStop(panel);
    else if (s === 'door') breathe(run.br.door, 'Two breaths before the door.', function () { doorRiddle(panel); });
  }
  function light() { var sc = $('scene'); if (sc) sc.classList.add('lit'); }
  function ready() {
    var w = $('walk'); if (!w) return;
    w.hidden = false; w.focus({ preventScroll: true });
    var r = $('rabbit'); if (r) r.classList.add('hop');
    idleWatch();
  }
  function idleWatch() { // after ~10s idle the rabbit looks back (Kids: gentle foot tap). Nothing ends.
    var r = $('rabbit'); if (!r) return;
    later(function () { if ($('rabbit')) $('rabbit').classList.add('lookback', run.age === 'kids' ? 'tap' : 'x'); }, 10000);
  }
  function walkOn() {
    var sc = $('scene'); if (!sc) return;
    var w = $('walk'); if (w) w.disabled = true;
    sc.classList.add('leaving');
    later(function () { stop(run.i + 1); }, RM ? 300 : 1400);
  }
  function benchStop(panel) {
    panel.innerHTML = '<div class="stone-row"><button class="btn primary" id="sit" data-focus>Sit a while</button><button class="btn soft" id="past">Walk on past</button></div>';
    $('sit').focus({ preventScroll: true });
    on('#past', function () { panel.innerHTML = ''; walkOn(); });
    on('#sit', function () {
      panel.innerHTML = ''; run.sat = true; document.body.classList.add('rest-dim');
      breathe(run.br.bench, 'Sit. Two slow breaths. The light goes soft.', function () { document.body.classList.remove('rest-dim'); ready(); });
    });
  }

  /* ---------- gentle stuck helpers ---------- */
  var NOTYET = ['Not quite. That\'s fine. Try another.', 'Hm. Close-ish. The path is patient.', 'Not that one. The rabbit shrugs kindly.', 'Almost. Take your time.'];
  function notYet(box, hint, diff, st, alwaysHint) {
    st.tries++;
    var extra = '';
    if ((diff === 'medium' || (alwaysHint && diff === 'easy')) && hint) extra = '<div class="hint">' + esc(hint) + '</div>';
    box.innerHTML = '<p class="react">' + NOTYET[rand(NOTYET.length)] + '</p>' + extra;
    if (diff === 'easy' && st.tries >= 2 && st.showMe) st.showMe();
  }
  function hintBtn(diff, hint) { return diff === 'hard' ? '<button class="btn soft small" id="hintbtn">Hint, please</button><div id="hintbox"></div>' : ''; }
  function wireHint(hint) { on('#hintbtn', function () { $('hintbox').innerHTML = '<div class="hint">' + esc(hint) + '</div>'; }); }

  /* ---------- Kids puzzles ---------- */
  function kidsFixPath(panel, diff, done) {
    var all = ['🍃', '🌸', '🍄', '⭐'], n = { easy: 2, medium: 3, hard: 4 }[diff], shapes = all.slice(0, n), st = { tries: 0 }, sel = null, placed = 0, snail = true;
    var pieces = shuffle(shapes.slice()), turned = diff === 'hard' ? pieces[rand(n)] : null;
    panel.innerHTML = '<p class="task">Tap a stone, then tap its spot on the path.</p>' +
      '<div class="fix-row"><span class="end">🧍</span>' + shapes.map(function (s) { return '<button class="gap" data-s="' + s + '" aria-label="Empty spot shaped like ' + s + '"><span>' + s + '</span></button>'; }).join('') + '<span class="end">🐇</span></div>' +
      '<div class="tray">' + pieces.map(function (s, k) { return '<button class="piece' + (s === turned ? ' turned' : '') + '" data-s="' + s + '"' + (k === 0 ? ' data-focus' : '') + ' aria-label="Stone ' + s + (s === turned ? ', turned sideways, tap to turn it' : '') + '"><span>' + s + '</span>' + (k === 0 ? '<i class="snail">🐌</i>' : '') + '</button>'; }).join('') + '</div><div id="react"></div>' + hintBtn(diff, 'Match the picture on the stone to the picture in the spot.');
    wireHint('Match the picture on the stone to the picture in the spot.');
    var react = $('react');
    st.showMe = function () { var s = sel ? sel.dataset.s : null; app.querySelectorAll('.gap').forEach(function (g) { if (!g.classList.contains('filled') && (!s || g.dataset.s === s)) g.classList.add('glow'); }); };
    on('.piece', function (e) {
      var p = e.currentTarget; if (p.classList.contains('used')) return;
      if (p.classList.contains('turned')) { p.classList.remove('turned'); p.setAttribute('aria-label', 'Stone ' + p.dataset.s); react.innerHTML = '<p class="react">You turned it. Now it fits.</p>'; return; }
      app.querySelectorAll('.piece').forEach(function (x) { x.classList.remove('sel'); }); p.classList.add('sel'); sel = p;
      var sn = p.querySelector('.snail'); if (sn && snail) { snail = false; sn.classList.add('off'); react.innerHTML = '<p class="react">A snail slides off and tips a tiny hat. 🎩</p>'; }
    });
    on('.gap', function (e) {
      var g = e.currentTarget; if (g.classList.contains('filled') || !sel) return;
      if (g.dataset.s === sel.dataset.s) {
        g.classList.add('filled'); g.classList.remove('glow'); sel.classList.add('used'); sel.classList.remove('sel'); sel = null; placed++;
        react.innerHTML = '<p class="react">It fits.</p>';
        if (placed === n) { react.innerHTML = '<p class="react">The path is fixed. The rabbit nods.</p>'; done(); }
      } else { sel.classList.add('slide'); var s2 = sel; later(function () { s2.classList.remove('slide'); }, 800); notYet(react, 'Look for the same picture.', diff, st); }
    });
  }
  function kidsShadow(panel, diff, done) {
    var pool = ['🐘', '🐢', '🦒', '🦆', '🐌', '🦉'], n = { easy: 2, medium: 3, hard: 4 }[diff], st = { tries: 0 };
    var opts = shuffle(pool.slice()).slice(0, n), target = opts[rand(n)];
    panel.innerHTML = '<p class="task">Who made this shadow?</p><div class="wall"><span class="shadow">' + target + '</span></div>' +
      '<div class="stone-row">' + opts.map(function (o, k) { return '<button class="btn stone pic" data-o="' + o + '"' + (k === 0 ? ' data-focus' : '') + '>' + o + '</button>'; }).join('') + '</div><div id="react"></div>' + hintBtn(diff, 'Look at the shape of the head.');
    wireHint('Look at the shape of the head.');
    var react = $('react');
    st.showMe = function () { var b = app.querySelector('[data-o="' + target + '"]'); if (b) b.classList.add('glow'); };
    on('[data-o]', function (e) {
      if (e.currentTarget.dataset.o === target) { app.querySelector('.shadow').classList.add('shown'); react.innerHTML = '<p class="react">Yes! Then ' + esc(run.buddy.name) + ' strikes a dramatic pose. Its shadow looks like a mountain.</p>'; done(); }
      else notYet(react, 'Look at the shape of the head.', diff, st);
    });
  }

  /* ---------- Teens puzzles ---------- */
  function plank(p) { return '<span class="plank ' + p.shape + '" style="background:' + p.color + '">' + (p.dots ? '•'.repeat(p.dots) : '') + '</span>'; }
  function teensPlanks(panel, diff, done) {
    var C = ['#C9D8B6', '#E8B48F', '#B9A8D9'], seq, opts, ans, hint, st = { tries: 0 };
    if (diff === 'easy') { seq = [0, 1, 0, 1, 0].map(function (k) { return { shape: 'round', color: C[k] }; }); ans = { shape: 'round', color: C[1] }; opts = [ans, { shape: 'round', color: C[0] }]; hint = 'Two colours take turns.'; }
    else if (diff === 'medium') { seq = [1, 2, 3, 4].map(function (k) { return { shape: 'round', color: C[0], dots: k }; }); ans = { shape: 'round', color: C[0], dots: 5 }; opts = [ans, { shape: 'round', color: C[0], dots: 4 }, { shape: 'round', color: C[0], dots: 6 }]; hint = 'Each plank has one more dot.'; }
    else { seq = [0, 1, 2, 3, 4].map(function (k) { return { shape: k % 2 ? 'square' : 'round', color: C[k % 3] }; }); ans = { shape: 'square', color: C[2] }; opts = [ans, { shape: 'square', color: C[0] }, { shape: 'round', color: C[2] }]; hint = 'Shapes take turns every plank. Colours go round in threes.'; }
    opts = shuffle(opts.map(function (o, k) { return { p: o, right: k === 0 }; }));
    panel.innerHTML = '<p class="task">Which plank comes next?</p><div class="plank-row">' + seq.map(plank).join('') + '<span class="plank q">?</span><span class="plank cat" id="cat" title="a sleeping cat">🐈</span></div>' +
      '<div class="stone-row">' + opts.map(function (o, k) { return '<button class="btn stone pic" data-k="' + k + '"' + (k === 0 ? ' data-focus' : '') + ' aria-label="Plank option ' + (k + 1) + '">' + plank(o.p) + '</button>'; }).join('') + '</div><div id="react"></div>' + hintBtn(diff, hint);
    wireHint(hint);
    var react = $('react');
    st.showMe = function () { opts.forEach(function (o, k) { if (o.right) app.querySelector('[data-k="' + k + '"]').classList.add('glow'); }); };
    on('[data-k]', function (e) {
      var o = opts[+e.currentTarget.dataset.k];
      if (o.right) { var q = app.querySelector('.plank.q'); q.outerHTML = plank(o.p); $('cat').classList.add('scoot'); react.innerHTML = '<p class="react">The bridge fills in. One plank was a sleeping cat. It scoots over by itself.</p>'; done(); }
      else notYet(react, hint, diff, st);
    });
  }
  function teensSigns(panel, diff, done) {
    var cfg = {
      easy:   { rule: 'This sign tells the truth.', signs: [['Sign', 'The garden is NOT to the left.']], ways: ['left', 'right'], ans: 'right', hint: 'Not left… so?' },
      medium: { rule: 'One sign always tells the truth. One always lies.', signs: [['A', 'The way is left.'], ['B', 'Sign A is telling the truth.']], ways: ['left', 'right'], ans: 'right', hint: 'If B were honest, A would be honest too. Can both be honest?' },
      hard:   { rule: 'Exactly one of these signs tells the truth.', signs: [['A', 'The way is left.'], ['B', 'The way is not the middle.'], ['C', 'The way is not left.']], ways: ['left', 'middle', 'right'], ans: 'middle', hint: 'Try each way. Count how many signs would be true.' }
    }[diff], st = { tries: 0 };
    var arrows = { left: '⬅ Left', middle: '⬆ Middle', right: 'Right ➡' };
    panel.innerHTML = '<p class="task">' + esc(cfg.rule) + ' Which way?</p><div class="signs">' + cfg.signs.map(function (s) { return '<div class="sign"><b>' + s[0] + '</b>' + esc(s[1]) + '</div>'; }).join('') + '</div>' +
      '<p class="small-note">The rabbit asks a sign for directions. The sign shrugs.</p>' +
      '<div class="stone-row">' + cfg.ways.map(function (w, k) { return '<button class="btn stone" data-w="' + w + '"' + (k === 0 ? ' data-focus' : '') + '>' + arrows[w] + '</button>'; }).join('') + '</div><div id="react"></div>' + hintBtn(diff, cfg.hint);
    wireHint(cfg.hint);
    var react = $('react');
    st.showMe = function () { app.querySelector('[data-w="' + cfg.ans + '"]').classList.add('glow'); };
    on('[data-w]', function (e) { if (e.currentTarget.dataset.w === cfg.ans) { react.innerHTML = '<p class="react">That\'s the way. The honest sign looks pleased.</p>'; done(); } else notYet(react, cfg.hint, diff, st); });
  }

  /* ---------- Adults puzzles ---------- */
  function adultsStars(panel, diff, done) {
    var G = {
      easy:   { nodes: [[10, 70], [28, 30], [50, 55], [72, 25], [90, 60]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]], nums: true, hint: 'Follow the numbers, 1 to 5.' },
      medium: { nodes: [[8, 62], [24, 28], [44, 50], [60, 18], [78, 44], [92, 78]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], hint: 'Start at an end, where only one line touches.' },
      hard:   { nodes: [[25, 85], [75, 85], [75, 45], [25, 45], [50, 10]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3], [3, 4], [4, 2]], hint: 'Start at a bottom corner. Those have an odd number of lines.' }
    }[diff], st = { tries: 0 }, cur = null, used = {}, count = 0;
    function key(a, b) { return Math.min(a, b) + '-' + Math.max(a, b); }
    function edgeOf(a, b) { return G.edges.some(function (e) { return key(e[0], e[1]) === key(a, b); }); }
    function draw() {
      var svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="stars-svg" aria-hidden="true">' +
        G.edges.map(function (e) { var A = G.nodes[e[0]], B = G.nodes[e[1]]; return '<line x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '" class="' + (used[key(e[0], e[1])] ? 'drawn' : 'faint') + '"/>'; }).join('') + '</svg>';
      $('sky').innerHTML = svg + G.nodes.map(function (n, k) { return '<button class="star' + (k === cur ? ' cur' : '') + '" data-n="' + k + '" style="left:' + (8 + .84 * n[0]) + '%;top:' + (8 + .84 * n[1]) + '%" aria-label="Star ' + (k + 1) + '">' + (G.nums ? '<span>' + (k + 1) + '</span>' : '') + '</button>'; }).join('');
      on('.star', tap);
    }
    function reset(msg) { cur = null; used = {}; count = 0; draw(); if (msg) $('react').innerHTML = '<p class="react">' + msg + '</p>'; }
    function tap(e) {
      var n = +e.currentTarget.dataset.n, react = $('react');
      if (cur === null) { if (G.nums && n !== 0) return notYet(react, G.hint, diff, st); cur = n; draw(); return; }
      if (n === cur) return;
      if (edgeOf(cur, n) && !used[key(cur, n)]) {
        used[key(cur, n)] = 1; count++; cur = n; draw();
        if (count === G.edges.length) { $('react').innerHTML = '<p class="react">The stars join up. The constellation is called "Man Carrying Slightly Too Many Groceries."</p>'; app.querySelectorAll('.star').forEach(function (s) { s.disabled = true; }); return done(); }
        var left = G.edges.some(function (e) { return !used[key(e[0], e[1])] && (e[0] === cur || e[1] === cur); });
        if (!left) { st.tries++; later(function () { reset('That line ran out of sky. No harm done. Try another start.'); if (diff === 'medium') $('react').innerHTML += '<div class="hint">' + esc(G.hint) + '</div>'; if (diff === 'easy' && st.tries >= 2) st.showMe(); }, 1200); }
      } else notYet(react, 'Each line gets drawn once, from star to joined star.', diff, st);
    }
    panel.innerHTML = '<p class="task">' + (diff === 'hard' ? 'Draw the whole shape in one line. No line twice.' : diff === 'medium' ? 'Join the stars along the faint outline.' : 'Join the stars in number order.') + '</p>' +
      '<div class="sky-box" id="sky"></div><div id="react"></div><div class="stone-row"><button class="btn soft small" id="again">Start the line again</button></div>' + hintBtn(diff, G.hint);
    wireHint(G.hint);
    st.showMe = function () { var nx = cur === null ? 0 : null; if (nx === null) G.edges.forEach(function (e) { if (!used[key(e[0], e[1])] && (e[0] === cur || e[1] === cur)) nx = e[0] === cur ? e[1] : e[0]; }); var b = app.querySelector('.star[data-n="' + nx + '"]'); if (b) b.classList.add('glow'); };
    draw();
    on('#again', function () { reset(''); });
  }
  function adultsWordLock(panel, diff, done) {
    var clue = { easy: 'The little letters on the signs you passed, in order.', medium: 'Unscramble S·P·A·N into something rabbits take in the afternoon.', hard: 'Cryptic: Short sleeps, a bridge\'s span turned back (4).' }[diff];
    var hint = { easy: 'Doorway, hallway, bridge, garden. N, A, P…', medium: 'Rabbits love a little afternoon one. Plural.', hard: 'Read SPAN backwards.' }[diff], st = { tries: 0 };
    panel.innerHTML = '<p class="task">A 4-letter word lock on the garden gate.</p><div class="sign clue">' + esc(clue) + '</div>' +
      '<form id="wl" class="col" autocomplete="off"><label class="sr" for="word">Four letters</label><input id="word" class="answer dial" maxlength="4" placeholder="_ _ _ _" data-focus autocapitalize="characters">' +
      '<button class="btn primary" type="submit">Turn the dials</button></form><div id="react"></div>' + hintBtn(diff, hint);
    wireHint(hint);
    var react = $('react');
    st.showMe = function () { react.innerHTML += '<div class="hint">It spells N A P S.</div>'; };
    $('wl').addEventListener('submit', function (e) {
      e.preventDefault(); var v = $('word').value.trim().toLowerCase(); if (!v) return;
      if (v === 'naps') { $('word').disabled = true; react.innerHTML = '<p class="react">Click. The gate swings open. The rabbit: "Everything around here ends in naps."</p>'; done(); }
      else notYet(react, hint, diff, st);
    });
  }
  var PUZZLES = { kids: { hallway: kidsFixPath, garden: kidsShadow }, teens: { hallway: teensPlanks, garden: teensSigns }, adults: { hallway: adultsStars, garden: adultsWordLock } };

  /* ---------- final door: Mossbert keeps it. Riddles come from quests.json doorRiddles (Bryan's, placeholders for now) ---------- */
  function doorRiddle(panel) {
    var r = DATA.doorRiddles[run.age][run.diff], st = { tries: 0 }, diff = run.diff;
    $('lines').innerHTML = say(r.q);
    var html = (r.placeholder ? '<p class="placeholder-tag">' + esc(r.placeholder) + '</p>' : '') + '<div id="react"></div>';
    if (r.choices) html += '<div class="stone-row">' + r.choices.map(function (c, k) { return '<button class="btn stone" data-c="' + k + '"' + (k === 0 ? ' data-focus' : '') + '>' + esc(c) + '</button>'; }).join('') + '</div><div id="easyslot"></div>';
    else html += '<form id="hf" class="col" autocomplete="off"><label class="sr" for="ans">Your answer</label><input id="ans" class="answer" placeholder="Type your answer"><div class="stone-row"><button class="btn primary" type="submit">Try it</button><button class="btn soft" type="button" id="hintbtn">Hint, please</button></div></form><div id="hintbox"></div>';
    panel.innerHTML = html;
    var react = $('react'), first = panel.querySelector('[data-c],#ans'); if (first) first.focus({ preventScroll: true });
    st.showMe = function () { var s = $('easyslot'); if (s && !$('justopen')) { s.innerHTML = '<button class="btn soft" id="justopen">Want the door to just open?</button>'; on('#justopen', function () { openDoor('Mossbert leans on the door. It opens. "Sometimes that\'s all it takes."'); }); } };
    on('[data-c]', function (e) { if (+e.currentTarget.dataset.c === r.answer) openDoor(); else notYet(react, r.hint, diff, st, true); });
    wireHint(r.hint);
    var f = $('hf');
    if (f) f.addEventListener('submit', function (e) {
      e.preventDefault(); var v = $('ans').value.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' '); if (!v) return;
      if (r.accept.some(function (a) { return a === v || (a.length > 2 && v.indexOf(a) >= 0); })) openDoor(); else notYet(react, r.hint, diff, st);
    });
  }
  function openDoor(line) {
    var sc = $('scene'); sc.classList.add('open');
    app.querySelectorAll('#panel button, #panel input').forEach(function (b) { b.disabled = true; });
    var rb = $('rabbit'); if (rb) rb.classList.add('bow');
    buddyLine('door');
    $('panel').innerHTML = say(line || 'The door is very impressed. Doors rarely show it.') + say('The rabbit bows.', 'The rabbit') +
      '<div class="col"><button class="btn primary" id="through">Step through</button></div>';
    $('through').focus({ preventScroll: true });
    on('#through', finish);
  }
  function finish() {
    restBtn.hidden = true;
    h('<h2>Nice walk.</h2><div class="stage dusk">' + backdrop('hard', { door: false }) +
      '<div class="rabbit" style="left:70%;top:46%">' + rabbitSVG() + '</div><div class="buddy end-buddy" aria-hidden="true">' + buddySVG(run.buddy) + '</div></div>' +
      say(run.buddy.name + ' waves goodbye. ' + (run.gem ? 'You spotted the sock, too.' : '') + ' Come back any time. I don\'t move much.') +
      '<div class="col fade-wait" id="endbtns"><button class="btn primary" id="again">Walk again</button><button class="btn soft" id="rest">Rest here</button></div>');
    requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add('rest-dim'); }); });
    later(function () { var c = $('endbtns'); if (c) c.classList.add('shown'); }, 2500);
    on('#again', title);
    on('#rest', function () { h('<h2>Resting</h2>' + mossbert('small') + say('Stay as long as you like. Goodnight, visitor.') + '<div class="col"><button class="btn soft" id="home">Back to the start</button></div>'); document.body.classList.add('dim'); on('#home', title); });
  }

  restBtn.addEventListener('click', function () {
    if (!run) return;
    restBtn.hidden = true;
    h('<h2>Resting</h2><div class="breath-wrap"><div class="breath in">' + mossbert() + '</div></div>' +
      say('Take as long as you like. The path will wait right here.') +
      '<div class="col"><button class="btn primary" id="cont" data-focus>Keep going</button><button class="btn soft" id="fin">Finish for today</button></div>');
    $('cont').addEventListener('click', function () { restBtn.hidden = false; run.beat(); });
    $('fin').addEventListener('click', title);
  });

  fetch('quests.json').then(function (r) { return r.json(); }).then(function (d) { DATA = d; title(); })
    .catch(function () { app.innerHTML = '<div class="screen"><h2>Mossbert misplaced the map.</h2><p>Please open this page from a web server.</p></div>'; });
})();
