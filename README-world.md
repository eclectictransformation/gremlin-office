# Gremlin World: notes for whoever edits it next

`world.html` + `world.js` + `world.css` draw the cube rooms. Everything you can see or tap lives in
`world-data.json` (see its `_readme` fields). Painted art lives in `assets/world/<room>/`.

Local preview: `python3 -m http.server 8765` in this folder, then open http://127.0.0.1:8765/world.html

---

## The Calm Arcade (playable cabinets)

The two big cabinets in the Arcade room are items of type `"arcade"`. Each one names a `machine`, and the
machines live under the top-level `"arcade"` key in `world-data.json`.

| Machine | Theme | Games |
|---|---|---|
| **OFFICE OLYMPICS** (teal) | Competitive sports, but it's an office and nobody is trying very hard | Desk Tennis · Paper Plane Toss · Stapler Stack |
| **GARDEN GREMLINS** (red) | Very low-stakes gardening (and some laundry) | Hungry Vine · Sock Pairing · Seed Packet Bonk |

### Files

| File | What it does |
|---|---|
| `games/arcade.js` | The cabinet overlay (marquee, screen, menu, game-over and prize screens, on-screen pad), the game loop, personal bests, the prize hook. Exposes `window.GremlinArcade`. |
| `games/arcade.css` | Cabinet overlay styles plus the marquee/"PRESS START" labels drawn on the cabinets in the room. |
| `games/office-olympics.js` | The three Office Olympics games and its attract screen. |
| `games/garden-gremlins.js` | The three Garden Gremlins games and its attract screen. |
| `tools/screenshots-arcade.py` | Headless test and screenshots (`screenshots/arcade-*.png`). Needs the local server running. |

Everything is drawn in canvas. There are no external fonts, libraries or sounds. Machine scripts load
only when someone opens that cabinet for the first time.

### Controls

- **Keyboard:** arrows or WASD, Space/Enter for the action button, Esc goes back (game, then menu, then closed).
- **Mouse:** click menu items. Desk Tennis follows the mouse, Plane Toss supports a slingshot drag,
  Sock Pairing is click-to-flip, Seed Packet Bonk follows the mouse.
- **Phone:** tap menu items, drag or swipe on the screen, or use the on-screen pad (it's hidden on desktops
  with a mouse).
- While a cabinet is open the room doesn't turn and the gremlins keep quiet.

### Adding a game

1. Add an entry to the machine's `games` list in `world-data.json` (copy an existing one). A game listed
   there with no code yet shows as **COMING SOON**, so you can tease it first.
2. In `games/<machine>.js`, call `GremlinArcade.register("<game-id>", function (api) { return {...}; })`.
   The object can have `start()`, `update(dt)`, `draw(ctx)`, `press(key)`, `release(key)` and
   `pointer(type, x, y)`. Keys are `left/right/up/down/action`. The screen is 320×240.
3. Useful bits on `api`: `W`, `H`, `top` (the y below the score bar), `held`, `score`,
   `end({title, msg, score})`, `sprite(rows, palette)`, `text(...)`, `rnd`, `pick`, `toast(msg)`,
   `reduced` (the visitor prefers reduced motion), `coarse` (touch device).
4. House rules: original ideas only (no famous game names or characters), no countdown timers, nothing to
   buy, and losing should be a gentle joke ("the plant needs a nap"), never a "GAME OVER".

### Adding a machine

Add a machine under `arcade.machines` (title, tagline, `cab`/`cabDark`/`accent`/`screen` colours,
`script: "games/<id>.js"`, `games: [...]`). Then point a room item at it:
`{"type": "arcade", "machine": "<id>", ...}`. Copy the `cabinet-blue` item for the marquee/screen boxes.

### Personal bests

These are saved only in the visitor's browser (`localStorage` key `gremlin-world-arcade-best-<game-id>`).
Nothing is sent anywhere.

---

## Prize hook (built, switched OFF)

Every game in `world-data.json` has a `prize` block, and **all of them ship disabled**:

```json
"prize": { "enabled": false, "milestone": { "type": "score", "value": 15 }, "message": "" }
```

When a game ends, `games/arcade.js` calls `GremlinArcade.maybeAwardPrize(gameId, score)`.

- **While `enabled` is `false`** (today) the call does nothing at all.
- **If someone flips `enabled` to `true` without writing any other code**, then the first time the visitor
  reaches the milestone in a visit they see a "★ NICE ONE ★" screen. It shows the optional `message` and
  the site's existing **"Prizes coming soon."** line (`prize.note` in `world-data.json`). That's it.
  It does not show, generate or store any code. For games where fewer is better (Sock Pairing), "reached"
  means *at or under* the value.
- Supported milestone types: `"score"` only.

### Turning real prizes on later (Bryan's decision)

Don't do it by editing the JSON or the JS alone. Anything in `world-data.json` or `games/*.js` is public,
so anyone can read it with View Source, and a high score can be faked from the browser console. So:

- **Never hard-code a real code, coupon text or amount** in `world-data.json`, `games/*.js` or any other
  file this site serves.
- Real rewards would come **from a server** (e.g. `maybeAwardPrize` asks an endpoint, which decides and
  hands out a single-use code with rate limits), **or be checked by the booking system** (e.g. the visitor
  just gets told "mention the arcade when you book" and staff or the booking system applies whatever offer
  exists).
- The place to wire that in is the body of `maybeAwardPrize` in `games/arcade.js`. Keep it so that a
  failure or "no" from the server falls back to the friendly "coming soon" screen.
- Whether to offer prizes at all, which games, what milestones and what the reward is: **Bryan decides**.
  Until then leave every `enabled` as `false`.

To check the hook still behaves, run `python3 tools/screenshots-arcade.py`. It verifies that a disabled prize
stays silent and that an enabled one (switched on in memory only) shows nothing more than "Prizes coming soon".
