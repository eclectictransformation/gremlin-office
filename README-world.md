# Gremlin World: notes for whoever edits it next

`world.html` + `world.js` + `world.css` draw the cube rooms. Everything you can see or tap lives in
`world-data.json` (see its `_readme` fields). Painted art lives in `assets/world/<room>/`.

Local preview: `python3 -m http.server 8765` in this folder, then open http://127.0.0.1:8765/world.html

---

## The Calm Arcade (playable cabinets)

The three cabinets in the Arcade room are items of type `"arcade"`. Each one names a `machine`, and the
machines live under the top-level `"arcade"` key in `world-data.json`.

| Machine | Theme | Games |
|---|---|---|
| **OFFICE OLYMPICS** (teal) | Competitive sports, but it's an office and nobody is trying very hard | Desk Tennis · Paper Plane Toss · Stapler Stack |
| **GARDEN GREMLINS** (red) | Very low-stakes gardening (and some laundry) | Hungry Vine · Sock Pairing · Seed Packet Bonk |
| **BREAK ROOM BRAWL** (purple, the small one by the door) | The competitive one: short rounds and **shared top-10 boards** | Coffee Relay · Jam Buster · Desk Duel (2P) |

Break Room Brawl is the **only** cabinet with shared boards (`"ranked": true` on the machine and on each
ranked game). Office Olympics and Garden Gremlins stay personal-best only.

- **Coffee Relay** (60 s, ranked): grab a mug at the coffee machine, steer it to the lit desk. Jerky moves
  fill the wobble meter and spill it; dodge the roomba and the rolling chairs. Points per delivery:
  100 + 25 × streak (max 8) + up to 50 for speed.
- **Jam Buster** (45 s, ranked): 3×3 printers jam; bop them (click/tap, or arrows + Space). Every 5 bops in a
  row raises the combo (×2…×5); gold jams are worth 3×. Missing one or bopping an empty printer resets the combo.
- **Desk Duel (2P)** (unranked): two players on one keyboard (W/S vs ↑/↓) or each drags their half of the
  screen. First to 7. It shows the longest rally but never goes on a board.

### Files

| File | What it does |
|---|---|
| `games/arcade.js` | The cabinet overlay (marquee, screen, menu, game-over and prize screens, on-screen pad), the game loop, personal bests, the prize hook. Exposes `window.GremlinArcade`. |
| `games/arcade.css` | Cabinet overlay styles plus the marquee/"PRESS START" labels drawn on the cabinets in the room. |
| `games/office-olympics.js` | The three Office Olympics games and its attract screen. |
| `games/garden-gremlins.js` | The three Garden Gremlins games and its attract screen. |
| `games/break-room-brawl.js` | The three Break Room Brawl games and its attract screen. |
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
   **One exception:** Break Room Brawl's ranked games use a short round clock (60 s / 45 s) so scores on
   the shared board are comparable. Keep it to that cabinet, keep it short, and keep the ending friendly.

### Adding a machine

Add a machine under `arcade.machines` (title, tagline, `cab`/`cabDark`/`accent`/`screen` colours,
`script: "games/<id>.js"`, `games: [...]`, optional `foot` line under the screen). Then point a room item at it:
`{"type": "arcade", "machine": "<id>", ...}`. Copy the `cabinet-blue` item for the marquee/screen boxes.

### Personal bests

These live in the visitor's browser (`localStorage` key `gremlin-world-arcade-best-<game-id>`). Guests'
bests never leave the device. Visitors with a Gremlin Name also get them synced (inside their progress,
see below), and only Break Room Brawl's ranked games are sent to the shared boards.

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

---

## Gremlin Names (lightweight login), quest journal, badges, guestbook

Optional and fun-sized. **No email, no passwords, no personal info.** A visitor can:

1. **Play as a guest.** Everything works and progress stays in `localStorage` on that device (this is also the
   automatic fallback whenever the server can't be reached).
2. **Get a new Gremlin Name.** They pick a nickname (3–20 characters: letters, numbers, spaces, `-`, `_`;
   unique, case-insensitive; rude words and reserved names refused). The **server** makes a random
   three-word **Gremlin Key** (e.g. `soggy-teacup-waltz`, 187 words → ~237,000 combinations) and shows it
   **once**. The card has *Copy key*, *Download .txt* and "I wrote it down"; the continue button unlocks only
   after one of those. Whatever the guest had already found is saved under the new name ("Save my progress").
3. **"I have a Gremlin Key".** Name + key (capitals and spaces don't matter) on any device pulls the progress
   down. A wrong key gets a rotating Noodle/Grimble joke and a "Play as a guest instead" button.

The top bar gets two buttons: **Guest / your name** (sign-in or account: Sync now, Log out, Delete my
Gremlin Name) and **Journal**. A first-visit card appears once (skip it with `?noprompt`).

### How it works

| Piece | Where |
|---|---|
| `world-player.js` | All the client side: sign-in card, journal, badges + toasts, guestbook, board fetching, sync. Plain `fetch` to `/rest/v1/rpc/<fn>` with only the `apikey` header. No libraries. Exposes `window.GremlinPlayer`. |
| `world.js` | Emits events (`sock`, `egg`, `room`, `socks-reset`, `greeted`, `room-built`, `ready`) to `GremlinPlayer.onEvent`, renders the chalk Brawl Board and the guestbook prop. |
| `games/arcade.js` | `GremlinArcade.setHooks({player, played, ended, leaderboard, ranked, signIn})`: game-over board, "★ Top 10 boards" screen, guest "GET A NAME" button. |
| `supabase/migrations/*.sql` | Schema, functions, seed and lockdown policies (all applied to the live project). |
| `tools/make-gw-seed.py` | Regenerates `supabase/migrations/20261025050200_gw_seed.sql` from `world-data.json` (games, score caps, findable ids, guestbook phrases/stamps) plus the key words and name rules. Run it after adding a game, secret, phrase or stamp, then apply the file (it's idempotent upserts). |
| `tools/screenshots-login.py` | End-to-end test against the live project (see "Testing"). |

- **Supabase project:** `gremlin-world` (`ydotiqwobbenwqeerkoc`), URL `https://ydotiqwobbenwqeerkoc.supabase.co`.
  The client uses the **publishable** key (`sb_publishable_…`, public by design, at the top of
  `world-player.js`). **There is no service_role / secret key anywhere in this folder; never add one.**
  Supabase Auth is not used at all.
- **Sessions:** a login returns a random 64-hex session token (stored as a SHA-256 hash server-side, valid
  90 days). The browser keeps only `{name, token, expires_at}` in `gremlin-world-player`. The key is never
  stored in the browser and only as a **bcrypt hash** (pgcrypto `crypt(..., gen_salt('bf'))`) on the server.
- **Sync:** debounced 2.5 s after any change, plus every 60 s, on focus and when the tab is hidden
  (keepalive). `gw_save_progress` **merges** on the server and returns the merged result, so every save is
  also a pull. Merge rules: lists (socks, rooms, secrets, greeted, played counts) are unions/max; a newer
  sock-basket reset (`socksReset` counter) wins; personal bests keep the best (lowest for Sock Pairing);
  badges keep the earliest earn time; total time is the max of the two. Unknown ids are dropped and
  numbers clamped by the server.
- **Offline:** every call has an 8 s timeout. If the server can't be reached the world carries on locally
  and syncs later. `?offline` simulates an unreachable server for testing.

### Database (private schema `gw`, not exposed to the API)

Tables: `players` (id, name, name_key, key_hash, created/last_seen), `sessions` (token_hash, player_id,
expires_at), `progress` (player_id, data jsonb), `games` (id, machine, ranked, low_is_better, max_score),
`scores` (player_id, game_id, best score, meta), `known_ids` (findable socks/secrets/rooms/badges/games),
`rate_events`, `key_words`, `name_rules`, `guestbook_phrases`, `guestbook_stamps`, `guestbook`.

Lockdown:
- `gw` isn't in the exposed schemas, so `/rest/v1/players` etc. return "not found" (verified).
- **RLS is enabled on all 12 tables**, all table privileges are revoked from `anon`/`authenticated`, and each
  table has a *restrictive* `using (false) with check (false)` policy (`gw_no_api_access`) as a belt and braces.
  There are **no** insert/update/delete policies for anon.
- Every write goes through a `public.gw_*` function that is `SECURITY DEFINER` with `set search_path = ''`
  (all names schema-qualified). `EXECUTE` is revoked from `public` and `authenticated` and granted to
  **`anon` only**.

Public RPC functions (POST `/rest/v1/rpc/<name>`, JSON body with the `p_…` names):

| Function | What it does | Limits |
|---|---|---|
| `gw_register(p_name)` | Validates + filters the name, makes the key, returns `{ok, name, key, token, expires_at}` (the only time the key is ever returned) | 10/min site-wide |
| `gw_login(p_name, p_key)` | Returns `{ok, name, token, expires_at}` or `not_found` | 120/min site-wide, 8 wrong keys per name per 10 min (`slow_down`) |
| `gw_logout(p_token)` | Ends the session | |
| `gw_load_progress(p_token)` | `{ok, name, progress, signed_today}` | |
| `gw_save_progress(p_token, p_progress)` | Cleans, merges, returns `{ok, progress}` | 30/min per player |
| `gw_submit_score(p_token, p_game_id, p_score, p_meta)` | Ranked Brawl games only; rejects scores above the game's cap; keeps the player's best. Returns `{ok, best, improved, rank}` | 5/min per player |
| `gw_leaderboard(p_game_id, p_limit≤10)` | Top 10: rank, name, score, date | |
| `gw_stats()` | Public totals: players, average rooms/secrets, all-rooms count, finished sock hunts, fastest hunt, badge counts, Brawl players, guestbook signatures | |
| `gw_sign_guestbook(p_token, p_phrase_id, p_stamp_id)` | Preset phrase + optional stamp; **one per player per day** (`once_a_day`) | |
| `gw_guestbook(p_limit≤50)` | Latest entries: name, phrase, stamp, date | |
| `gw_weekly_stats(p_since)` | Aggregates since a time (default 7 days ago): new/total players, new/total badge counts, finished sock hunts, average secrets, rooms distribution, new Brawl scores, Brawl top 3 per game, latest guestbook lines. Public data only (no ids, no tokens) | |
| `gw_forget_me(p_token, p_key)` | Deletes the player and everything of theirs (needs the key again) | |

Error codes the client turns into friendly lines: `length`, `chars`, `reserved`, `rude`, `taken`,
`not_found`, `slow_down`, `busy`, `session`, `bad_game`, `bad_score`, `bad_phrase`, `bad_stamp`, `once_a_day`.

Weekly stats from a terminal (the publishable key is public, this is fine):

```bash
curl -s -X POST https://ydotiqwobbenwqeerkoc.supabase.co/rest/v1/rpc/gw_weekly_stats \
  -H "apikey: sb_publishable_MqY3Lf60gY2OnVOShQMKRg_yRYCO4Nv" -H "Content-Type: application/json" \
  -d '{"p_since":"2026-10-19T00:00:00Z"}'
```

### Advisors

`get_advisors` (security) is down to one intentional item: **0028 "anon can execute SECURITY DEFINER
function" × 12**. That's the design: those 12 RPCs are the whole public API, each validates its input, checks
the session token, is rate-limited and touches only the `gw` schema. (The earlier "RLS enabled, no policy"
notes were fixed by `20261025050300_gw_lockdown_policies.sql`.) Performance shows only "unused index" notes
on a brand-new, empty database.

### Name filter

`gw.name_rules` has four kinds: `reserved_exact` (the gremlins' names, guest, staff, system, owner, …),
`reserved_contains` (bryan, admin, moderator, official, …), `substring` and `word` (rude terms).
Rude terms are matched on the name with spaces/`-`/`_` removed and leetspeak undone (0→o 1→i 3→e 4→a
5→s 7→t 8→b 9→g), also with repeated letters squashed. Short terms that hide inside innocent words
(e.g. inside "grape", "spice", "peacock", "torpedo") are `word` rules (whole words only) instead. Add rules
in `tools/make-gw-seed.py` and re-apply the seed (or insert into `gw.name_rules` directly).

### Quest journal

Opened from the **Journal** button (also works for guests):
- **Sock Hunt** n/5 with sock pictures (unfound ones are `???`), the hunt clock from first to fifth sock
  (shown as a gentle "no rush" note), last and best hunt times.
- **Secrets** n/total, grouped by room, as chips (unfound and unvisited rooms are `???`). Secrets that only
  exist in painted mode count only when painted mode is on.
- **Rooms** n/6, **Arcade** table (played, personal best, ★ for ranked Brawl games), **time** this visit and
  total, **badges**, and **Around the office** totals from `gw_stats` when online.

### Badges

Ten badges, defined in `world-data.json` → `badges.list` (`icon`, `name`, `desc`, `rule`). They're stored
in the progress JSON (`badges: {id: earned-at-ms}`), so they sync, and earning one shows a cozy toast. No
prizes, codes or amounts are attached to badges. Rules the client understands:
`rooms` (n), `allRooms`, `sockHunt`, `sockTime` (ms), `secrets` (n), `allSecrets`, `playedAll`,
`event` (`brawl-score`, `brawl-top10`), `hours` (from/to, visitor's local clock). Add a badge by adding an
entry with one of these rules, then re-run `tools/make-gw-seed.py` and apply the seed so the server accepts
the new id.

### Guestbook

The open book on the Archive's front shelf. Named gremlins pick one of 20 preset kind lines and an
optional stamp (8 emoji stamps). No free text at all, so nothing to moderate. One signature per player per
day. Phrases/stamps live in `world-data.json` → `guestbook` and in the seed (keep ids stable; add new ones
at the end).

### Break Room Brawl boards

- Only logged-in players submit; guests finish the game normally and see **"GET A NAME"** (it carries their
  score into the sign-in card, and submits it if they register or log in right then).
- The board shows on the game-over screen, in **★ Top 10 boards** on the menu (tabs per game), on the
  cabinet's screen in the room (rotating #1 lines) and on the **Brawl Board** chalkboard on the Arcade's
  left wall (top 3 per game).
- Score caps (`gw.games.max_score`): Coffee Relay 6000, Jam Buster 5000.
- Prize hooks stay as they are: every Brawl game has `"prize": {"enabled": false}`.

### Cheating caveats (honest version)

This is a static site, so **scores and progress are reported by the browser**. Someone determined can
call the RPCs from the console and post a capped score, or claim secrets they didn't click. What limits it:
score caps per game, best-only storage, 5 score submissions a minute, unknown ids dropped, numbers
clamped, session tokens required. Fine for a friendly office board; **never** attach real prizes to it
without server-side checking (see the prize section above). Time played is merged as "max of devices", so
playing on two devices at once doesn't add up exactly.

### Resetting / cleaning up (SQL editor or `execute_sql`)

```sql
-- wipe the Brawl boards only
delete from gw.scores;
-- remove one player and everything of theirs (sessions, progress, scores, guestbook cascade)
delete from gw.players where name_key = lower(regexp_replace(btrim('Some Name'), '\s+', ' ', 'g'));
-- full reset (keeps the seed: games, words, rules, phrases, stamps)
delete from gw.players; delete from gw.guestbook; truncate gw.rate_events;
```

### Testing

`python3 tools/screenshots-login.py` (local server on :8765) runs against the live project at 1280×800
and 390×844: register (reserved/short names refused, key shown, download/copy), journal, badges, phone
login with a wrong key (joke) then the right key in a different case, two-device sync both ways, Brawl
menu/Coffee Relay/Jam Buster, score submitted and shown on the game-over board, the boards screen and the
room chalkboard, guestbook sign + once-a-day, account/log out/log back in, guest mode + "GET A NAME",
Desk Duel on touch, `?offline` and a blocked server. Screenshots: `screenshots/login-*.png`,
`journal-*.png`, `brawl-*.png`. **It creates a real test player** (`Tester NNNN`, printed at the end):
delete it afterwards with the SQL above so the boards start empty. The older `screenshots-world.py` and
`screenshots-arcade.py` use `?noprompt`.


## Inside an iframe (go-live, Oct 25 2026)
- `diaries.html` pops `world.html?embed` up in an iframe. `?embed` (only honoured when framed) hides the duplicate
  "Gremlin World" title because the pop-up bar already has it plus a "New window" link. Framed *without* `?embed`,
  world.html shows its own small "open in a new window" button (`#btn-popout`).
- Esc with nothing open inside the world tells the host (`gremlin-office-escape` postMessage) so the pop-up closes.
- If the browser blocks localStorage in the frame, an inline check in world.html swaps in an in-memory store
  (`window.GW_STORAGE === "memory"`): everything still works for that visit, and the sign-in card explains and links
  to a new window. The drawn-only office no longer probes for painted art (no 404s in the console).
- Test: `python3 tools/test-live-embed.py` (site on 127.0.0.1:8765, host stand-in on localhost:8766; never creates players).
