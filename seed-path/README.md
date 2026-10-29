# The Seed Path (hidden preview)
Calm, no-fail adventure. Plain HTML/CSS/JS, no build. Open index.html (noindex, unlinked).
- data/maps.js: areas (20x15 tile rows), exits, objects, walk lengths (SEED.walks), links.
- data/kin.js: the 30 Kin (look = sprite params, moment = task type+params, intro, journal line, allowed areas).
- data/text.js: cloud/hint/ending wording.
- data/challenges.js (v2): 12 riddles, 9 tiny puzzles (tiers easy/medium/harder), 5 Kin personalities (Guide notes Oct 29) mapped onto all 30 Kin, walk banter and Seed Hill group banter.
- js/challenges.js (v2): riddle + puzzle UIs and the calm hint ladder (hints after 2 tries or ~45s idle; 'Tell me the answer' after hint 3; Kin always joins).
v2 befriending: the FIRST Kin you greet just asks to join (no puzzle). Later Kin: 2nd-3rd easy, 4th medium, 5th a-bit-harder (3-Kin walk: easy, medium). Riddles and puzzles alternate; no repeats per save (seedpath.meta.v1 chHist). The old per-Kin `moment` field is kept in kin.js but no longer used for befriending.
- js/: sprites (code-drawn), moments (9 overlay types), game (run, rotation, save, journal, sound).
Saves: localStorage seedpath.save.v1 / seedpath.meta.v1 / seedpath.settings.v1 only. No network calls besides Google Fonts.
Testing: `?speed=N` speeds game time; window.SeedPath exposes a test hook.
SEED.links.meditation = https://eclectictransformation.com/meditations (Meditations & Playlists). After planting, a soft card asks "Now that you're a little calmer, would you like to hear a meditation?" and opens it in a new tab.
