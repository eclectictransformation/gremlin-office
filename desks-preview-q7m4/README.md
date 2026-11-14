# The Gremlin Office Desks ("Desks") — preview

Employees-only virtual office for Eclectic Transformation. Completely separate from Gremlin World.
Rename the app in `config.js` (`APP_NAME`, `SHORT_NAME`).

## Pieces
- Static site: `index.html`, `style.css`, `app.js`, `config.js`, `assets/` (no build step; supabase-js from jsDelivr).
- Supabase project **eclectic-desks** (`dotwzemmkrxswoeqcggj`, us-east-1, free plan, $0/mo). Migrations in `supabase/migrations/`.
- Edge functions (`supabase/functions/`): `login`, `forgot-password`, `admin-add-person`, `bootstrap-admin` (one-time, already run and locked), `ticket-notify` (phase-2 STUB, sends nothing).
- Only the public anon key is in the frontend. The service role key exists only inside edge functions (Supabase-injected env).

## Logins
- Login ID = `name@eclectictransformation.com` (not a mailbox). Supabase Auth's email = the person's personal email.
- `login` edge function maps login ID → auth user server-side and signs in; the personal email is never returned. 5 failed tries per ID per 15 min → locked out for 15 min.
- `forgot-password` always answers the same; max 3 reset mails per ID per hour; link goes to the personal email.
- Admin "Add person": either shows a one-time setup link (no email sent) or emails a Supabase invite.
- "Pending setup" list (`pending_people`): people named but without a personal email (Vince → Saji; Juhani, Emily → no bots). "Finish setup" pre-fills the Add person form.

## Data / rules
- `profiles` (is_admin, active, pre_approved, ticket_cap, cap_period) — not writable by non-admins; an admin can't demote/deactivate themself.
- `desks` (nickname, sign, theme, photos) — own desk only; office floor via `office_floor()` (name, nickname, sign, theme, photos of active staff).
- `bots`, `bot_access` — admin-managed. Seeded: Saji Tori, Noodle, Pip, Nancy, Grimble.
- `tickets` — insert own only; trigger enforces bot access + cap (per day/week) and forces status `new`. Status: `new` / `waiting_on_bryan` / `answered`; `reply`; `pre_approved` snapshot.
- `ticket_outbox` — every new ticket queues `to=gremlins@eclectictransformation.com`, subject `[Ticket][<Bot>] from <Name> #<id>`.
- Storage bucket `desk-photos`: private, 5 MB, jpeg/png/webp/gif, uploads only into `<uid>/`, readable by active staff via signed URLs.
- Presence: private Realtime channel `office`, active staff only.

See SECURITY.md for the security design, the bot path (bot-api + HMAC + approval gate) and the go-live checklist.

## Phase 2 (bot wake) — TODO
1. Email sender: give `ticket-notify` an email API key as a Supabase secret, send each unsent outbox row, set `sent_at`; trigger with a Database Webhook on `ticket_outbox` insert.
2. A Grok Bot routine with an email trigger on the bot's own Grok Bot inbox (or a +tag of it) wakes; `gremlins@` must forward there (Grok Bot email triggers only listen to Grok Bot inboxes).
3. The bot reads the ticket and writes `reply` + `status` with the Supabase connector (service-level SQL bypasses RLS). Rule: creation/production work → `waiting_on_bryan` unless `tickets.pre_approved` is true.

## Hosting
Any static host. After choosing the URL, set it in two places:
- `update app_config set value='https://<url>/' where key='site_url'` (insert it if missing)
- Supabase dashboard → Authentication → URL Configuration: Site URL + Redirect URLs = that URL.

## 3D office + ticket threads (migrations 007–010, local preview)
- `office3d.js` + vendored `vendor/three.module.min.js` (three r160). Route `#/office`. `?demo=1&view=cubicle|hallway|gallery|art` renders mock data, localhost only.
- `desks.locked` (others read a desk/photos only when unlocked), `desk_notes` (280 chars, 20/hour, owner+author read/delete), `gallery_art` + private bucket `gallery-art` (admin write), `notices` (admin write).
- `ticket_messages` threads; follow-ups queue `ticket_outbox` (same subject); `bot_fetch_ticket`/`bot_submit_reply` same signatures, now thread-aware; held replies hidden until `admin_release_reply`. Private Realtime topic `ticket:<id>`.
- `ticket-notify` edited locally to add `msg=<id>` to the email body — NOT deployed.

## The Loose Stitch → Elsewhere Annex (LOCAL PREVIEW, not live)
- `annex.js` (world, NPCs, grabbers, waystones, curiosities, shifts, misfire), `annex-audio.js` (original WebAudio chiptune + hum, mute), `data/elsewhere-annex.json` (everything placeable).
- Entrances are data rows: `stitch-gallery` (active), `stitch-bryan-office` (active, riddle `office-stitch`, answer list in data), `odd-door-hall` (inactive stub).
- Progress: localStorage `et-desks-annex-v1:<user id>` → `{waystones, curiosities, flags}` (same shape as a future `seam_progress` row).
- Shifting: `shifts[]` (partitions + layouts per area; only The Annex That Turns for now). Misfire: `misfire` + per-stone `misfireChance` (Overlook = 0).
- Demo (localhost only): `?demo=1&view=stitch|secretstitch|annex|overlook`, `&as=bryan`, `&bryanopen=1`, `&annexdoors=1`.

## Elsewhere Annex v2 (procedural, local preview Nov 12 2026 — not live)
- **The world is generated.** It's a seeded grid of 16 m cells. Each cell is a safe hallway junction with up to 4 rooms off it. Chunks within 1 cell of you are built, and chunks more than 2 cells away are thrown away. Shared materials and geometry mean nothing leaks.
- **Six sections** live in `data/elsewhere-annex.json` → `sections`: The Wrong Print (start), The Annex That Turns, The Soft Stockroom, The Waiting Floor, The Tiled Shallows and The Night Shift. Each has a crystal plaza at its `center` cell, and every other cell joins the nearest section. Each section row sets its palette, floor style, openness, room mix, grabber and NPC chances, shift rate and dead zones. To add a section, copy a row and give it a new id and center.
- **Hallways are always safe.** Grabbers and almost-people only spawn inside rooms. A grab sends you to a different section, unvisited ones first.
- **Almost-people are rare.** They never appear within `grid.npcMinDepth` (5) cells of the start. Each has a quirk: stutter, backwards, corner (turns only when you're not looking), tall, or late (answers your previous question).
- **Shifting.** While you're in a section, it re-rolls its rooms every `shift.every` seconds and slides hallway walls (`blockChance`), after a flicker warning. The cell you're standing in never changes.
- **Home crystal.** You get it on your first visit, and it always returns you to the start plaza, except in `deadZones`, where it fizzles with a joke and you walk out.
- **The Overlook** is the secret start. It hangs 7 m above The Wrong Print, and its crystal is a master stone that can hop to any plaza.
- **Tests:** `python3 ../test_annex.py` against `python3 -m http.server 8841` run in this folder (52 checks). The v1 copy is in `../elsewhere-annex-v1-backup/`.

## Elsewhere Annex v3: Grenshol (local preview Nov 13 2026, not live)
Lore: deep in the Annex the Gremlins found a portal, poked it to see what it was, and accidentally let **Grenshol** out. It's big, curious, never evil, never hurts or kills anyone. Everything below is data-driven in `data/elsewhere-annex.json` (names and lines can be changed there).
- **Grenshol** (`creature`): only in deeper sections, never in `excludeSections` (the start) or within `minDepth` cells of the entrance. It shows up as a crisp silhouette at a hallway end (distant creak, lights dim as it gets close), peeks, and sneaks up while you're not looking. Look straight at it and it freezes for `freezeSeconds`; walk into it or press E (`✋ Tag Grenshol!`) to catch it. If it reaches you while you're not looking, it catches you.
- **Flitters** (`minions`): small moth-ish helpers. Sometimes one flies to an almost-person and possesses it: purple tint, glowing eyes, it follows you and says creature-ish lines (talking to it uses `minions.lines`), then lets go and walks home. Possessed people never grab.
- **Lights-change mode** (`aliveMode`): rooms deeper in can have a light switch ("See what happens when the lights change?"), plus a small random chance each minute (`randomPerMinute`). Palette and light colour shift, props twitch, more flitters, faster possessions, Grenshol hunts and blinks behind you, eerie music variation. Ends after `seconds` or when you leave the section.
- **Glimpse world** (`glimpse.js` + `data/glimpse-world.json`, its own THREE.Scene drawn through a lens shader: barrel warp, colour fringe, vignette, blink cuts). Caught → **tour**: 4–6 random viewpoints, random lengths, ~20 s, your walking is held, then you're dropped in a random Annex section. Catch it → **explore** for `explore.seconds` (75) with a countdown; spots you reach are remembered. First catch is random; later catches open a menu of remembered spots + "Somewhere new". Memory: `progress.glimpse` in the same localStorage key. The Underwood: cavern dome, stalactites, glowworms, light shafts, lake, waterfall, instanced trees/ferns/glowcaps/flowers, mist, 2 long-necks, 4 runners, 2 grazers on looping paths.
- **Escher stairwells** (`stairwells` + `stairChance` per section row): up/down land you in another cell (or another section, `otherSectionChance`), `loop` puts you back at the bottom of the same stairs, `flip` lands you upside down for `flipSeconds`.
- **Silly TVs** (`tvs`): waiting-type rooms (`roomTypes`) roll `chance` for a TV with a caption and one of 5 procedural cartoons (stamper, sun clocking in, queue, calm survey, MORE coffee) at `fps` 8, redrawn only when on screen and within `range` m.
- **Hooks, not built:** `lore.clues` (collectible clue notes, `enabled:false`, example row). The old `characters` stub (`enabled:false`) is left as-is; v4 replaces it with `rpg.js` + `data/annex-rpg.json`.
- `office3d.js` changes are tiny: a `frozen` flag (tour holds your walking) and an optional `annex.render()` hook (lens / upside-down camera).
- **Tests:** `python3 ../test_annex.py` against `python3 -m http.server 8841` in this folder (94 checks: 52 v2 + 42 v3; v2 checks call `A.calm(true)` so Grenshol doesn't wander into them). v2 copy: `../elsewhere-annex-v2-backup/`.

## Elsewhere Annex v4: Annex characters + dice (local preview Nov 13 2026, NOT live)
Everything here is original and silly. All tunables are in **`data/annex-rpg.json`**, and the code is in **`rpg.js`** (`createRPG(ctx)`, hooked from `annex.js`). Rules math follows the 5e SRD 5.2.1 (CC-BY-4.0; attribution below). The UI uses no D&D trademarks.

**Becoming your character**
- Nothing pops up when you arrive. The room you land in from the Loose Stitch, and the Overlook from the secret stitch, has a **glowing stitched circle** on the floor. Step onto it, or press E / click it:
  - **New player:** the creator opens.
  - **Existing character:** a "become your character" screen opens, with a short transform flash.
- After that you *are* your character for the Annex: your name is shown and the RPG bar appears.
- Until you step in, critters sleep, dice doors and portals ignore you, and a gentle toast nudges you back to the circle when you wander off (every `nudge.every` s). It's a nudge, not a wall.
- Leaving the Annex turns you back into your normal Desks self. You transform again on each visit.
- The Annex character is **separate from the Desks identity**. It lives in localStorage `et-desks-annex-rpg-v1:<user id>` as `{character, quests, stash, world:{mobs,doors,loot,bosses}, counters, flags}`, a shape that's ready for a future Supabase row. You can reset or recreate it from the sheet.
- **Creator:**
  1. Answer a 3-question quiz. It suggests a path and a stat spread, or you can skip it.
  2. Edit the path and the stats, using either the standard array (15, 14, 12, 10) or point-buy (22 pts, 8–15, SRD costs).
  3. Add a name (there's a random-name button) and **approve**. Nothing is saved before you approve.
  - `creation.aiHook` marks where an AI-made character could plug in later.

**Stats** (modifier = floor((score − 10) / 2))
| Annex stat | Used for | 5e export mapping |
|---|---|---|
| 🍀 Luck | loot, odd devices, Tinkerer attacks | CHA (and "luck") |
| 🫀 Nerve | HP, holding your ground | CON / WIS |
| 🧠 Wits | riddles, Archivist attacks | INT |
| 👟 Stride | AC, dodging, Wanderer attacks | DEX / STR |

**Paths** (each gets one signature ability, refreshed when you touch a crystal or a fight ends)
- 📚 **Archivist** (Wits): Office Stapler d6. *Footnote*: advantage on your next attack or door roll, +1d4 damage.
- 🧭 **Wanderer** (Stride): Umbrella of Mild Weather d8. *Second Wind (Lost Edition)*: heal 1d8 + level.
- 🔧 **Tinkerer** (Luck): Rubber Chicken Flail d6. *Spring-Loaded Gizmo*: 2d6 damage with no attack roll.

**Dice.** Only d4, d6, d8, d10, d12 and d20 exist. `roll()` throws on anything else, and there is no d24 anywhere.
- An attack is d20 + stat mod + proficiency (+ gear) vs AC. A natural 20 always hits and doubles the damage dice. A natural 1 always misses with a silly fumble line.
- Checks (doors, saves) are d20 + mod (+ proficiency if your path has it) vs DC.
- Every roll goes to the 🎲 dice log (L) and shows a short popup.

**Levels 1–5**
| Level | XP | Proficiency | Notes |
|---|---|---|---|
| 1 | 0 | +2 | |
| 2 | 100 | +2 | |
| 3 | 250 | +2 | +1 to a stat |
| 4 | 450 | +2 | |
| 5 | 700 | +3 | +1 to a stat (cap 20) |
- HP = max(4, 8 + Nerve mod) + (L − 1) × max(1, 5 + Nerve mod). AC = 10 + Stride mod + gear.
- XP sources:
  - kills (per enemy, scaled by tier)
  - quests
  - curiosities (`xp.curio` 25)
  - weird questions from almost-people (`xp.riddle` 20)
  - dice doors (15)
  - attuning a crystal (10)

**Mobs**
- Mobs live **only in rooms, never hallways**. They wake when you come close and stay inside their room's rect.
- Odds: none within `mobs.minDepth` cells of the start; otherwise a room rolls `chance` + `perDepth`·depth (max `maxChance`). The tier goes up every `tierEvery` cells of depth (HP, AC, attack, damage and XP scale per tier).
- Enemies:

  | Enemy | HP | AC |
  |---|---|---|
  | Dust Bunny | 5 | 10 |
  | Static Moth | 6 | 12 |
  | Sock Wraith | 9 | 11 |
  | Hold-Music Wisp | 8 | 12 |
  | Feral Filing Cabinet | 14 | 13 |
  | Paper-Cut Sprite | 6 | 11 |

- A cleared room is saved per cell (`world.mobs["i,j"]`) and **never respawns**, even after a reload or a section shift. Grenshol is never a combat enemy.
- Fighting: click a critter or press E. **X** uses your ability.

**Loot** (tiers 0–4, `mobDropChance` 0.45; the first group you clear always drops something)
- 11 weapons, from Polite Fists d4 to the Water Cooler Jug d12 (Mop of Destiny, Desk Lamp Mace, Three-Hole Punch…).
- 3 armours (Cardigan +1, Bubble-Wrap Vest +2, Cardboard Plate +3) and 2 hats.
- 4 trinkets (Lucky Breath Mint +1 to hit, Key Ring of Many Doors +2 on doors…).
- Vending Machine Soup heals 2d4+2.
- There are also cardboard boxes in rooms.

**Dice doors.** Some room doors are shut with a d20 label (stat + DC). Roll to open: success gives XP and there's usually something inside. A failure gives a funny line and a `retrySeconds` wait, never a lockout.

**Knockout** (0 HP; never death)
- The screen fades and **Grenshol carries you** to your last crystal (or the start plaza), with HP back to full.
- You lose `xpLossPct` (10%) of your progress *into the current level*, so you never lose a level.
- Plus one silly consequence (weighted):
  - Grenshol "borrows" your best gear into **Grenshol's stash** with a note (you fall back to your next-best piece)
  - a lampshade hat
  - squeaky boots (Stride −1)
  - glitter
  - static hair
- Statuses clear at a crystal.

**Starter quests** (`quests[]`, data-driven)
- Sign In, Please (transform)
- Lost & Found (a curiosity)
- Return to Sender (find the parcel, deliver it to an almost-person)
- Small Talk (answer a weird question)
- Dust Management (3 kills)
- Open Sesame-ish (a dice door)
- The Big Filing (the boss; hidden until you've seen a portal)

**Party portals + instances** (the ONLY place party size matters)
- Normal exploration is always **solo**: no party scaling, and the `&party` flag does nothing out there.
- 🌀 **Party portals** (`partyPortals`, 2 for now: Wrong Print cell 0,2 and Soft Stockroom cell -6,1) lead to a separate **instanced** room for 1–3 players. Right now that's *The Records Room*, with boss **The Grand Feral Filing Cabinet**:
  - HP 40, AC 13
  - Paperwork Avalanche every 3rd attack (Stride save DC 12)
  - Paper-Cut Sprite minions
- Scaling by `partySize` (1–3, `party.max` 3): boss HP × (1 + 0.6·(n−1)), +1 damage per extra member, one minion per member.
- Locally the party size is `max(party members, &party=N)` clamped to 3. The `party.members` array is where Supabase presence will plug in later.
- A boss is beaten once per character (`world.bosses`). After a knockout inside, you wake by the portal.

**Keys:** C sheet · I gear/bag · J quests · L dice log · X ability · E interact. All of these are also HUD buttons, and the layout works with mouse, keyboard and touch.

**Debug / play-test (localhost demo mode only)**
- `?demo=1&view=annex#/office` lands you in the arrival room. Add `&party=3` (or `7` to see the clamp) to test instance scaling.
- In the console: `__o3.annex.rpg.*`:
  - `state()`, `create({path,name,base})`, `transform()`, `reset()`
  - dice: `seed(n)`, `force([20,…])`, `roll(d)`, `mod(s)`
  - combat and XP: `mobs()`, `attack(id)`, `kill(id)`, `addXP(n)`, `setHP(n)`, `ko('steal', 0.3)`
  - doors: `doors()`, `doorRoll(key)`, `doorWait(key, 0)`
  - instances: `portals()`, `enterInstance()`, `leaveInstance()`
  - panels and misc: `riddle()`, `openSheet()`, `openCreator()`, `hallwayMobs()`
- `__o3.annex.rpgFind('mob'|'door'|'box', r)` finds the nearest uncleared one. Teleport there with `__o3.annex.gotoCell(i, j, qi)`.

**Files:** `rpg.js`, `data/annex-rpg.json`, plus small hooks in `annex.js`, a v4 block in `style.css`, and `sw.js` (cache `desks-shell-v9`, which adds both new files; v4b bumps it to `desks-shell-v10`).

**Tests:** run `python3 ../test_annex.py` against `python3 -m http.server 8841` in this folder. There are 94 v2/v3 checks + 43 v4 checks, written to `../screens/v3-test-results.json` and `v4-test-results.json`, with screenshots in `../screens/v4-*.png`. The v3 copy is in `../elsewhere-annex-v3-backup/`.

**Credits / licence.** Compatible with fifth edition.
This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

## v4b: the Training Closet + dev sandbox (local preview Nov 13 2026, not live)
**Where.** A narrow door signed **TRAINING CLOSET** ("practice only · nothing in here counts") sits in the first hallway off the entrance plaza: the hallway straight ahead of the Loose Stitch arrival spot, on the plaza's own short arm, so room re-rolls never cover it. The Overlook (secret stitch) has its own Training Closet door on its north wall, between the circle and the master crystal. You have to be transformed to use either one; otherwise you get the usual gentle nudge.

**Inside** (`instances.training`):
- Three Practice Dummies, a Sleepy Dust Bunny and a tiny practice boss, **Coach Stuffing** (HP 16, AC 10, d6, with a Clipboard Slap every 3rd swing).
- A practice soup pot (free, heals 2d4+2) and a practice rack that lends a newspaper, a bubble-wrap vest and a cone helm to try on.
- A small tip card walks you through attack → dice → ability → gear → healing → knockout. Each tip moves on when you do the thing, or you can press Next.

**Rules** (`training` in `data/annex-rpg.json`):
- `grantXP:false` blocks XP and level-ups. XP you "would" earn goes to the dice log.
- `grantLoot:false` means nothing drops and borrowed gear stays in the closet.
- `questProgress:false` means quests and kill counters ignore training.
- `partyMax:1` keeps training solo; `&party` doesn't scale it.
- Mobs reset on every visit.
- How it's enforced:
  - Your character is snapshotted when you step in and restored when you leave, which covers XP, gear, inventory, stats, quests and counters. Each flag set to true lets its part through.
  - While you're inside, only the snapshot is written to localStorage, so closing the tab mid-practice can't save anything either.
- **Knockout in training:** a "practice knockout". You're reset at the closet door with full HP and a gentle note. No XP loss, nothing stolen, no status.

**Dev sandbox** (hidden from players):
- Opens with `&sandbox=1` or `__o3.annex.rpg.sandbox()`, and only on localhost unless `training.sandbox.allowLive` is true. A 🧪 Sandbox button appears inside the closet.
- What it does:
  - spawn any enemy from `annex-rpg.json` at tier 0–4
  - equip any item
  - set level 1–5 and stats
  - set party size 1–3 (the room re-spawns scaled)
  - force the next d20s
  - full HP, knock me out, reset the room
- A sandbox visit never keeps anything, even if the grant flags are on.
- Console helpers: `__o3.annex.rpg.sb.{spawn,equip,level,stats,party,force,reset,heal}`. Testing helpers: `rpg.enterTraining()`, `rpg.tportals()`, `rpg.setTraining({ grantXP: true })`.

**Tests:** 33 v4b checks in `../test_annex.py` (results in `../screens/v4b-test-results.json`, screenshots in `../screens/v4b-*.png`). The v4 copy is in `../elsewhere-annex-v4-backup/`.

## v5: Control Room, multiplayer presence, the Mildly Perilous Mailroom, levels 1–25, gates + waystones (local preview Nov 13 2026, NOT live)
Backup of v4b before any v5 edit: `../elsewhere-annex-v4b-backup/`. Nothing deployed, pushed or applied. Service worker cache is `desks-shell-v11`.

**Control Room (admin only).** There's a door on the Overlook's east wall, and it is only *built* when the database says you're an admin. `annex-net.js` calls `rpc('annex_whoami')`, which uses `is_admin()`: profiles.is_admin plus an aal2 two-step session. There's no client password and no secret URL word. A non-admin's page has no door, no hotspot and no route in. Inside:
- a wall map
- the control desk (tabs: Map · Spawn · Sandbox · Move · Booth)
- the viewing booth, a glass case that loads any cell as a miniature and turns, tilts, flips it upside-down, lifts the roof or spins it, with beacons for players in that cell

What you can do there:
- **Map:** one dot per player with name, section/cell, distance from you, pairwise distances and a droppable 📍 pin. Players inside instances are listed separately.
- **Spawn:** any enemy or any boss at any tier, dropped about 2.6 m in front of a chosen player, sent on the admin-only `annex-gm` broadcast. The receiving page spawns it locally. GM mobs are never saved and give XP only. You can also send a little note.
- **Sandbox:** the full v4b sandbox (spawn, gear, level, stats, forced dice, party size).
- **Move:** nudge, rotate, lift, flip, carry or reset the room's props.

**Multiplayer.** Uses Supabase Realtime private channels:
- `annex`: presence (name, x/z/y, yaw, instance, portal, party), throttled to 1 update a second, or every 15 s when still. It also carries party invites.
- `annex-gm`: everyone reads; only admins may send (RLS on realtime.messages).

Teammates appear as simple figures with name tags in the same place or the same party instance.

Parties: max 3, only for instances. At a party portal you see "➕ Invite <name>" for teammates within 8 m. Accepting joins the party, and "Go" pulls the party into the same instance. Solo instances, like the Mailroom and gates, always count as party 1.

**Demo:** `?demo=1` (localhost only) makes you a fake admin and adds two wandering fake teammates, Vince and Juhani. Add `&as=player` to be a non-admin and check that the door is gone. Console: `__o3.annex.ctl` (state, door, enterControl, openDesk, boothOp, sendGM, fakes, demoPlace…).

**The Mildly Perilous Mailroom (`instances.starter`).** A red door with a brass slot on the arrival plaza, separate from the Training Closet. It's a solo linear run:
1. Fight 1 · Fight 2
2. 🛋 Rest (full HP and ability)
3. Fight 3 · Fight 4
4. 🛋 Rest
5. Fight 5
6. Boss: the Lost-and-Found Bin

There are 5 pickups along the way, including the new **Fizzy Pocket Potion** (1d8+2 heal, also in loot tiers 0–1). Data flags `grantXP` and `grantLoot` make it real progress, unlike Training. It's tuned for levels 1–2. Cleared fights and pickups are saved per character and don't respawn. A full clear takes a fresh level-1 character to level 2, never 3 (Bryan, Nov 14): `instances.starter.xpMult` = 0.4 scales the fight XP and the boss gives 40, so the run is worth 112 XP (a fresh character ends at 132, or 192 if the Dust Management quest completes on the way).

**Levels 1–25.**
- `levels.xp` has 25 steps (SRD-like to 20, then our own curve to 16 950).
- Proficiency goes +2 → +8.
- Stat picks at levels 3, 5, 8, 11, 14, 17, 20 and 23.
- Every enemy and instance has a `level`, and a tier adds +1 per tier.

**XP falloff** (`xpFalloff` in JSON): full XP up to 1 level below you, −20 % per extra level, and 0 at 5+ levels below. The log says "too easy for you".

**Gates + waystones.**
- `gates[]` place a gate instance in a deeper section. The placeholder is the Revolving Doorman in The Annex That Turns.
- Clearing it wakes its waystone, saved on that character as `char.waystones`.
- The 🗺 Waystone board on the start plaza and the Home crystal (once you have one) offer fast travel there.
- Real deep content and lore come later.

**Chat (typed + push-to-talk), `annex-chat.js`.** Uses the private Realtime Broadcast topic `annex-chat`.
- **Typed chat:** press **Enter**, type, Enter. Scopes:
  - 📍 Nearby: within 20 m outside instances, or the whole room inside an instance copy. It never leaks into another copy.
  - 🤝 Party
  - 🌀 Instance (the same copy)
  - 📣 Everyone

  Lines are at most 280 characters. In real mode they're logged server-side with `annex_chat_log()`: 300 characters max, 20 per minute.
- **Voice:** hold **V** (or the 🎙 button) to record a clip, up to 7 s, at Opus about 24 kbps (about 20 KB). Real mode uploads it to the private `voice-clips/<you>/` bucket (256 KB cap, audio only). The broadcast carries a 2-minute signed link, and the sender deletes the clip after 2 minutes; `voice-sweep` deletes anything older than 10 minutes. If the upload fails, a clip of 48 KB or less goes inline as base64. Clips play one at a time, and nothing is archived.
- **Control Room "💬 Chat & mute" tab:**
  - 👂 listen-in to every room (admin, only inside the Control Room)
  - 🔇 Mute 10 min / 🔈 Unmute per teammate. This sends an admin-only GM message plus `annex_chat_mute()`. The server stops muted people from sending on `annex-chat` or uploading clips.
  - recent chat
- **Demo:** fake local chat. Vince and Juhani hear you when in range and answer typed lines. `&fakemic=1` records a hum instead of the mic. Console: `__o3.annex.ctl.chat` (say, startTalk, stopTalk, demoSay, demoVoice, mute, hears).

**Server side — approved by Bryan and APPLIED Nov 14 2026 to project eclectic-desks `dotwzemmkrxswoeqcggj` (migrations 011–014; edge functions avatar-request, moth-avatar, voice-sweep). The frontend itself is not deployed from here:**
- `supabase/migrations/011_annex_multiplayer.sql`: `annex_whoami()`, `annex_gm_audit()`, and realtime.messages policies `rt_annex_sel`, `rt_annex_ins`, `rt_annex_gm_ins`. Additive only.
- `supabase/migrations/012_avatar_requests.sql`, `functions/avatar-request`, `functions/moth-avatar`: Moth cartoon avatars, 1 per player per month. See `../cartoon-avatar-plan.md`.
- `supabase/migrations/013_annex_chat.sql` + `functions/voice-sweep`: chat mutes, chat log, `annex-chat` RLS, private `voice-clips` bucket and policies. `014_voice_sweep_cron.sql` is optional (pg_cron + pg_net run the sweep every 10 min and prune the chat log after 30 days).
- Dashboard checks (no change made): Realtime "Allow public access" OFF, Auth sign-ups OFF (invite-only), TOTP MFA on.
- Known soft spot: presence and party messages could be faked by a logged-in teammate, which is low stakes. GM commands are enforced by the server.

Tests: `../test_annex.py` (v5 section) → `../screens/v5-test-results.json`, screenshots `../screens/v5-*.png`.
