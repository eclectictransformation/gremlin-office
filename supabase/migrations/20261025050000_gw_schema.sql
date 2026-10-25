-- Gremlin World: player accounts (no personal info), progress sync, Break Room Brawl scoreboards,
-- guestbook. Tables live in the private schema "gw" (NOT exposed by the Data API) with RLS on and no
-- policies, so the only way in from the browser is the public.gw_* RPC functions (next migration).

create schema if not exists gw;
revoke all on schema gw from public;
revoke all on schema gw from anon, authenticated;

-- players: a Gremlin Name and the bcrypt hash of the server-issued three-word Gremlin Key. Nothing else.
create table gw.players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_key      text not null unique,          -- lower-cased, spaces collapsed: uniqueness is case-insensitive
  key_hash      text not null,                 -- extensions.crypt(key, gen_salt('bf'))
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- sessions: sha256 of a random 32-byte token; the plain token only ever lives in the player's browser.
create table gw.sessions (
  token_hash  text primary key,
  player_id   uuid not null references gw.players(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_player_idx on gw.sessions (player_id);
create index sessions_expires_idx on gw.sessions (expires_at);

-- progress: the cleaned/merged progress JSON plus a few derived columns for the public stats.
create table gw.progress (
  player_id     uuid primary key references gw.players(id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  socks         int not null default 0,
  secrets       int not null default 0,
  rooms         int not null default 0,
  sock_hunts    int not null default 0,
  sock_best_ms  int,
  sock_done_at  timestamptz,                   -- server time of the first completed sock hunt
  badges        text[] not null default '{}',
  updated_at    timestamptz not null default now()
);

-- games: whitelist of every arcade game id. Only ranked games (Break Room Brawl) take shared scores.
create table gw.games (
  game_id    text primary key,
  machine    text not null,
  ranked     boolean not null default false,
  max_score  int not null,                     -- anything above this is rejected (ranked) / clamped (personal bests)
  low        boolean not null default false    -- fewer is better (personal bests only)
);

-- scores: best score per player per ranked game.
create table gw.scores (
  player_id    uuid not null references gw.players(id) on delete cascade,
  game_id      text not null references gw.games(game_id),
  score        int not null check (score >= 0),
  meta         jsonb not null default '{}'::jsonb,
  achieved_at  timestamptz not null default now(),
  primary key (player_id, game_id)
);
create index scores_board_idx on gw.scores (game_id, score desc, achieved_at);

-- known ids from world-data.json (rooms, socks, eggs, badges). Progress JSON is filtered against these.
create table gw.known_ids (
  kind  text not null check (kind in ('room', 'sock', 'egg', 'badge')),
  id    text not null,
  primary key (kind, id)
);

-- rate limiting log (register / login / login_fail / save / score). Old rows are pruned by the functions.
create table gw.rate_events (
  id       bigint generated always as identity primary key,
  kind     text not null,
  subject  text not null,
  at       timestamptz not null default now()
);
create index rate_events_lookup_idx on gw.rate_events (kind, subject, at);

-- word list for the Gremlin Keys (slot 1 adjective, 2 thing, 3 dance-ish verb)
create table gw.key_words (
  slot  int not null check (slot between 1 and 3),
  word  text not null check (word ~ '^[a-z]{3,10}$'),
  primary key (slot, word)
);

-- name filter: 'substring' (rude anywhere), 'word' (rude as a whole word),
-- 'reserved_exact' (letters-only name equals it), 'reserved_contains' (letters-only name contains it)
create table gw.name_rules (
  kind  text not null check (kind in ('substring', 'word', 'reserved_exact', 'reserved_contains')),
  term  text not null check (term ~ '^[a-z]+$'),
  primary key (kind, term)
);

-- guestbook: preset phrases and stamps only, one signature per player per (UTC) day.
create table gw.guestbook_phrases (
  id      int primary key,
  phrase  text not null
);
create table gw.guestbook_stamps (
  id     text primary key,
  emoji  text not null,
  label  text not null
);
create table gw.guestbook (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references gw.players(id) on delete cascade,
  phrase_id  int not null references gw.guestbook_phrases(id),
  stamp_id   text references gw.guestbook_stamps(id),
  signed_at  timestamptz not null default now(),
  signed_on  date not null default ((now() at time zone 'utc')::date),
  unique (player_id, signed_on)
);
create index guestbook_recent_idx on gw.guestbook (signed_at desc);
create index guestbook_stamp_idx on gw.guestbook (stamp_id);
create index guestbook_phrase_idx on gw.guestbook (phrase_id);

-- lock everything down: RLS on, no policies, no grants to the API roles.
alter table gw.players            enable row level security;
alter table gw.sessions           enable row level security;
alter table gw.progress           enable row level security;
alter table gw.games              enable row level security;
alter table gw.scores             enable row level security;
alter table gw.known_ids          enable row level security;
alter table gw.rate_events        enable row level security;
alter table gw.key_words          enable row level security;
alter table gw.name_rules         enable row level security;
alter table gw.guestbook_phrases  enable row level security;
alter table gw.guestbook_stamps   enable row level security;
alter table gw.guestbook          enable row level security;

revoke all on all tables in schema gw from public, anon, authenticated;
revoke all on all sequences in schema gw from public, anon, authenticated;
alter default privileges in schema gw revoke all on tables from public, anon, authenticated;
alter default privileges in schema gw revoke all on sequences from public, anon, authenticated;
alter default privileges in schema gw revoke execute on functions from public, anon, authenticated;
