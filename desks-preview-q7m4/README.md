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
