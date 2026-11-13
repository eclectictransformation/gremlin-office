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
