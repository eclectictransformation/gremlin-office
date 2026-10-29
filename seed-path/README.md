# The Seed Path (hidden preview)
Calm, no-fail adventure. Plain HTML/CSS/JS, no build. Open index.html (noindex, unlinked).
- data/maps.js: areas (20x15 tile rows), exits, objects, walk lengths (SEED.walks), links.
- data/kin.js: the 30 Kin (look = sprite params, moment = task type+params, intro, journal line, allowed areas).
- data/text.js: cloud/hint/ending wording.
- js/: sprites (code-drawn), moments (9 overlay types), game (run, rotation, save, journal, sound).
Saves: localStorage seedpath.save.v1 / seedpath.meta.v1 / seedpath.settings.v1 only. No network calls besides Google Fonts.
Testing: `?speed=N` speeds game time; window.SeedPath exposes a test hook.
TODO: SEED.links.meditation is a placeholder (Listen & Breathe URL not found).
