-- Gremlin World: chess with people (Phase 2), "who's around", pokes, friends, blocks, reports, and
-- server-saved gremlin wins + wardrobe unlocks. Same lock-down pattern as everything else:
-- private schema gw, RLS on with a restrictive deny-all policy, no table grants; the browser only calls
-- public.gw_* SECURITY DEFINER functions with its session token. No free text anywhere: pokes and
-- reactions are preset phrase ids; names are existing Gremlin Names (already filtered by gw.check_name).
-- NOT APPLIED YET. Apply with the Supabase CLI / dashboard when Bryan approves.

create table if not exists gw.presence (
  player_id  uuid primary key references gw.players(id) on delete cascade,
  last_seen  timestamptz not null default now(),
  dnd        boolean not null default false
);
create table if not exists gw.chess_phrases (id int primary key, phrase text not null, kind text not null check (kind in ('poke','react')));
insert into gw.chess_phrases (id, phrase, kind) values
  (1, 'Want to play chess?', 'poke'), (2, 'Fancy a slow game?', 'poke'), (3, 'Rematch?', 'poke'),
  (11, 'Good game.', 'react'), (12, 'Nice move.', 'react'), (13, 'Hmm...', 'react'), (14, 'Oops.', 'react'), (15, 'Thanks.', 'react')
on conflict (id) do update set phrase = excluded.phrase, kind = excluded.kind;

create table if not exists gw.pokes (
  id          bigint generated always as identity primary key,
  from_id     uuid not null references gw.players(id) on delete cascade,
  to_id       uuid not null references gw.players(id) on delete cascade,
  phrase_id   int not null references gw.chess_phrases(id),
  status      text not null default 'open' check (status in ('open','accepted','declined','expired')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create unique index if not exists pokes_one_open on gw.pokes (from_id, to_id) where status = 'open';
create index if not exists pokes_to_idx on gw.pokes (to_id, status);

create table if not exists gw.blocks (
  blocker_id uuid not null references gw.players(id) on delete cascade,
  blocked_id uuid not null references gw.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create table if not exists gw.friend_asks (
  from_id uuid not null references gw.players(id) on delete cascade,
  to_id   uuid not null references gw.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);
create table if not exists gw.friends (
  a_id uuid not null references gw.players(id) on delete cascade,
  b_id uuid not null references gw.players(id) on delete cascade,
  since timestamptz not null default now(),
  primary key (a_id, b_id), check (a_id < b_id)
);
create table if not exists gw.chess_games (
  id          uuid primary key default gen_random_uuid(),
  white_id    uuid references gw.players(id) on delete set null,
  black_id    uuid references gw.players(id) on delete set null,
  moves       text[] not null default '{}',          -- UCI moves, e.g. {e2e4,e7e5}; both clients replay them with chess.js
  status      text not null default 'active' check (status in ('active','set_aside','checkmate','stalemate','draw','resigned','abandoned','blocked')),
  winner      char(1) check (winner in ('w','b')),
  rematch_of  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists chess_games_white on gw.chess_games (white_id, status);
create index if not exists chess_games_black on gw.chess_games (black_id, status);
create table if not exists gw.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid references gw.players(id) on delete set null,
  reported_id uuid references gw.players(id) on delete cascade,
  reason      text not null check (reason in ('name','pestering','other')),
  status      text not null default 'open' check (status in ('open','done')),
  created_at  timestamptz not null default now()
);
create table if not exists gw.player_flags (
  player_id uuid primary key references gw.players(id) on delete cascade,
  hidden    boolean not null default false,   -- Bryan: hide a name from every list
  social_off boolean not null default false,  -- Bryan: no pokes / person games for this player
  updated_at timestamptz not null default now()
);
-- gremlin wins (recorded by the player's own session; see gw_chess_gremlin_win) and wardrobe unlocks
create table if not exists gw.gremlin_wins (
  player_id uuid not null references gw.players(id) on delete cascade,
  gremlin   text not null check (gremlin in ('noodle','pip','dot','moth','vesper','grimble')),
  wins      int not null default 1,
  first_at  timestamptz not null default now(),
  primary key (player_id, gremlin)
);
-- the wardrobe allowlist: every wearable/colour id that can ever be saved (must match game-nook/wardrobe-data.js).
-- free = anyone can wear it; otherwise it needs a row in gw.unlocks, which only gw.grant_unlocks writes (from recorded wins).
-- Items that are neither free nor in unlock_rules are locked placeholders and can never be saved.
create table if not exists gw.wardrobe_items (
  item_id text primary key check (item_id ~ '^[a-z0-9-]{2,40}$'),
  slot    text not null check (slot ~ '^[a-z-]{2,20}$'),
  free    boolean not null default false
);
insert into gw.wardrobe_items (item_id, slot, free) values
  ('hat-none','hat',true), ('hat-beanie','hat',true), ('hat-acorn','hat',false), ('hat-crown','hat',false), ('hat-color-moss','hat-color',true), ('hat-color-butter','hat-color',true), ('hat-color-ink','hat-color',false), ('hat-color-plum','hat-color',false), ('scarf-none','scarf',true), ('scarf-short','scarf',true), ('scarf-long','scarf',false), ('scarf-color-cream','scarf-color',true), ('scarf-color-sage','scarf-color',true), ('scarf-color-leaf','scarf-color',false), ('scarf-color-lantern','scarf-color',false), ('scarf-color-gold','scarf-color',false), ('scarf-color-plum','scarf-color',false), ('socks-none','socks',true), ('socks-ankle','socks',true), ('socks-tall','socks',false), ('sock-color-cream','sock-color',true), ('sock-color-sage','sock-color',true), ('sock-color-stripy','sock-color',false), ('sock-color-bookmark','sock-color',false), ('sock-color-rainbow','sock-color',false), ('sock-color-moon','sock-color',false), ('glasses-none','glasses',true), ('glasses-round','glasses',false)
on conflict (item_id) do update set slot = excluded.slot, free = excluded.free;
-- which achievement unlocks which item
create table if not exists gw.unlock_rules (
  item_id     text primary key references gw.wardrobe_items(item_id) on delete cascade,
  achievement text not null check (achievement ~ '^(beat:(noodle|pip|dot|moth|vesper|grimble)|beat-all)$')
);
insert into gw.unlock_rules (item_id, achievement) values
  ('hat-color-ink','beat:dot'), ('scarf-color-leaf','beat:pip'), ('scarf-color-lantern','beat:moth'), ('scarf-color-gold','beat:grimble'), ('sock-color-stripy','beat:noodle'), ('sock-color-bookmark','beat:vesper'), ('sock-color-rainbow','beat-all')
on conflict (item_id) do update set achievement = excluded.achievement;
create table if not exists gw.unlocks (
  player_id uuid not null references gw.players(id) on delete cascade,
  item_id   text not null references gw.unlock_rules(item_id) on delete cascade,
  at        timestamptz not null default now(),
  primary key (player_id, item_id)
);
-- the wardrobe choice: item/colour ids only (validated against an allowlist pattern + unlocks)
create table if not exists gw.wardrobe (
  player_id uuid primary key references gw.players(id) on delete cascade,
  outfit    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['presence','chess_phrases','pokes','blocks','friend_asks','friends','chess_games','reports','player_flags','gremlin_wins','wardrobe_items','unlock_rules','unlocks','wardrobe'] loop
    execute format('alter table gw.%I enable row level security', t);
    execute format('drop policy if exists gw_no_api_access on gw.%I', t);
    execute format('create policy gw_no_api_access on gw.%I as restrictive for all to anon, authenticated using (false) with check (false)', t);
    execute format('revoke all on gw.%I from public, anon, authenticated', t);
  end loop; end $$;

---------------------------------------------------------------- helpers
create or replace function gw.pid_by_name(p_name text) returns uuid language sql stable set search_path = '' as $$
  select id from gw.players where name_key = lower(gw.clean_name(p_name)) $$;
create or replace function gw.blocked_either(a uuid, b uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from gw.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)) $$;
create or replace function gw.visible(p uuid) returns boolean language sql stable set search_path = '' as $$
  select not exists (select 1 from gw.player_flags f where f.player_id = p and (f.hidden or f.social_off))
     and gw.check_name((select name from gw.players where id = p)) is null $$;   -- re-check names against today's rules
create or replace function gw.are_friends(a uuid, b uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from gw.friends where a_id = least(a, b) and b_id = greatest(a, b)) $$;
create or replace function gw.grant_unlocks(p uuid) returns void language plpgsql volatile set search_path = '' as $$
begin
  insert into gw.unlocks (player_id, item_id)
    select p, r.item_id from gw.unlock_rules r
    where (r.achievement like 'beat:%' and exists (select 1 from gw.gremlin_wins w where w.player_id = p and w.gremlin = substr(r.achievement, 6)))
       or (r.achievement = 'beat-all' and (select count(*) from gw.gremlin_wins w where w.player_id = p) >= 6)
  on conflict do nothing;
end $$;

---------------------------------------------------------------- one poll: presence + inbox + lists
create or replace function public.gw_chess_poll(p_token text, p_here boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); me_dnd boolean;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not gw.rate_ok('chess_poll', pid::text, 12, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  if p_here then insert into gw.presence (player_id) values (pid) on conflict (player_id) do update set last_seen = now(); end if;
  update gw.pokes set status = 'expired' where status = 'open' and created_at < now() - interval '1 day';
  select dnd into me_dnd from gw.presence where player_id = pid;
  return jsonb_build_object('ok', true, 'dnd', coalesce(me_dnd, false),
    'social', gw.visible(pid),
    'around', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'friend', gw.are_friends(pid, p.id)) order by gw.are_friends(pid, p.id) desc, p.name)
       from gw.presence pr join gw.players p on p.id = pr.player_id
       where pr.player_id <> pid and pr.last_seen > now() - interval '90 seconds' and (not pr.dnd) and gw.visible(p.id) and not gw.blocked_either(pid, p.id)
       limit 30), '[]'::jsonb),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'around', coalesce(pr.last_seen > now() - interval '90 seconds' and not pr.dnd, false)) order by p.name)
       from gw.friends f join gw.players p on p.id = case when f.a_id = pid then f.b_id else f.a_id end
       left join gw.presence pr on pr.player_id = p.id where pid in (f.a_id, f.b_id)), '[]'::jsonb),
    'pokes', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'from', p.name, 'phrase', ph.phrase) order by k.created_at)
       from gw.pokes k join gw.players p on p.id = k.from_id join gw.chess_phrases ph on ph.id = k.phrase_id
       where k.to_id = pid and k.status = 'open' and not gw.blocked_either(pid, k.from_id) and (not coalesce(me_dnd, false))), '[]'::jsonb),
    'friend_asks', coalesce((select jsonb_agg(p.name) from gw.friend_asks a join gw.players p on p.id = a.from_id
       where a.to_id = pid and a.created_at > now() - interval '7 days' and not gw.blocked_either(pid, a.from_id)), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'you', case when g.white_id = pid then 'w' else 'b' end,
         'opp', coalesce(o.name, 'a gremlin who moved away'), 'ply', cardinality(g.moves), 'status', g.status, 'winner', g.winner,
         'your_turn', g.status = 'active' and ((cardinality(g.moves) % 2 = 0) = (g.white_id = pid))) order by g.updated_at desc)
       from gw.chess_games g left join gw.players o on o.id = case when g.white_id = pid then g.black_id else g.white_id end
       where pid in (g.white_id, g.black_id) and (g.status in ('active','set_aside') or g.updated_at > now() - interval '14 days')), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(p.name) from gw.blocks b join gw.players p on p.id = b.blocked_id where b.blocker_id = pid), '[]'::jsonb));
end $$;

create or replace function public.gw_chess_dnd(p_token text, p_on boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  insert into gw.presence (player_id, dnd) values (pid, coalesce(p_on, false)) on conflict (player_id) do update set dnd = coalesce(p_on, false);
  return jsonb_build_object('ok', true, 'dnd', coalesce(p_on, false));
end $$;

---------------------------------------------------------------- pokes
create or replace function public.gw_chess_poke(p_token text, p_to text, p_phrase int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); tid uuid := gw.pid_by_name(p_to); tdnd boolean;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not gw.visible(pid) then return jsonb_build_object('ok', false, 'error', 'resting'); end if;
  if not exists (select 1 from gw.chess_phrases where id = p_phrase and kind = 'poke') then return jsonb_build_object('ok', false, 'error', 'phrase'); end if;
  if tid is null or tid = pid or not gw.visible(tid) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- quiet limits (the sender is never told about blocks)
  if exists (select 1 from gw.pokes where from_id = pid and to_id = tid and status = 'declined' and answered_at > now() - interval '30 minutes') then
    return jsonb_build_object('ok', false, 'error', 'later'); end if;
  if not gw.rate_ok('poke', pid::text, 10, interval '1 hour') or not gw.rate_ok('poke_day', pid::text, 30, interval '1 day') then
    return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  -- 3+ different blockers in a week: friends-only pokes until Bryan looks
  if (select count(distinct blocker_id) from gw.blocks where blocked_id = pid and created_at > now() - interval '7 days') >= 3 and not gw.are_friends(pid, tid) then
    return jsonb_build_object('ok', true, 'sent', true); end if;
  if gw.blocked_either(pid, tid) then return jsonb_build_object('ok', true, 'sent', true); end if;   -- looks sent, isn't
  select dnd into tdnd from gw.presence where player_id = tid;
  insert into gw.pokes (from_id, to_id, phrase_id) values (pid, tid, p_phrase) on conflict do nothing;
  return jsonb_build_object('ok', true, 'sent', true);
end $$;

create or replace function public.gw_chess_answer(p_token text, p_poke bigint, p_answer text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); k record; gid uuid;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select * into k from gw.pokes where id = p_poke and to_id = pid and status = 'open' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if p_answer = 'accept' then
    if gw.blocked_either(pid, k.from_id) or not gw.visible(k.from_id) then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
    update gw.pokes set status = 'accepted', answered_at = now() where id = k.id;
    if random() < 0.5 then insert into gw.chess_games (white_id, black_id) values (pid, k.from_id) returning id into gid;
    else insert into gw.chess_games (white_id, black_id) values (k.from_id, pid) returning id into gid; end if;
    return jsonb_build_object('ok', true, 'game_id', gid);
  elsif p_answer = 'block' then
    update gw.pokes set status = 'expired', answered_at = now() where id = k.id;   -- not 'declined': the sender gets no hint
    perform public.gw_chess_block(p_token, (select name from gw.players where id = k.from_id));
    return jsonb_build_object('ok', true);
  else
    update gw.pokes set status = 'declined', answered_at = now() where id = k.id;
    return jsonb_build_object('ok', true);
  end if;
end $$;

---------------------------------------------------------------- blocks + reports
create or replace function public.gw_chess_block(p_token text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); tid uuid := gw.pid_by_name(p_name);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if tid is null or tid = pid then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into gw.blocks (blocker_id, blocked_id) values (pid, tid) on conflict do nothing;
  delete from gw.friends where a_id = least(pid, tid) and b_id = greatest(pid, tid);
  delete from gw.friend_asks where (from_id = pid and to_id = tid) or (from_id = tid and to_id = pid);
  update gw.pokes set status = 'expired', answered_at = now() where status = 'open' and ((from_id = pid and to_id = tid) or (from_id = tid and to_id = pid));
  update gw.chess_games set status = 'blocked', updated_at = now() where status in ('active','set_aside')
    and ((white_id = pid and black_id = tid) or (white_id = tid and black_id = pid));
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.gw_chess_unblock(p_token text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  delete from gw.blocks where blocker_id = pid and blocked_id = gw.pid_by_name(p_name);
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.gw_chess_report(p_token text, p_name text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); tid uuid := gw.pid_by_name(p_name);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if tid is null or tid = pid or p_reason not in ('name','pestering','other') then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not gw.rate_ok('report', pid::text, 5, interval '1 day') then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  insert into gw.reports (reporter_id, reported_id, reason) values (pid, tid, p_reason);
  insert into gw.blocks (blocker_id, blocked_id) values (pid, tid) on conflict do nothing;   -- reporting also hides them from you
  -- a reported name is hidden from everyone until Bryan looks
  if p_reason = 'name' then insert into gw.player_flags (player_id, hidden) values (tid, true) on conflict (player_id) do update set hidden = true, updated_at = now(); end if;
  return jsonb_build_object('ok', true);
end $$;

---------------------------------------------------------------- friends (both must say yes; only after playing together)
create or replace function public.gw_chess_friend(p_token text, p_name text, p_action text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); tid uuid := gw.pid_by_name(p_name);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if tid is null or tid = pid then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_action = 'remove' then delete from gw.friends where a_id = least(pid, tid) and b_id = greatest(pid, tid); return jsonb_build_object('ok', true); end if;
  if p_action = 'no' then delete from gw.friend_asks where from_id = tid and to_id = pid; return jsonb_build_object('ok', true); end if;
  if gw.blocked_either(pid, tid) or not gw.visible(tid) then return jsonb_build_object('ok', true, 'asked', true); end if;
  if not exists (select 1 from gw.chess_games where (white_id = pid and black_id = tid) or (white_id = tid and black_id = pid)) then
    return jsonb_build_object('ok', false, 'error', 'play_first'); end if;
  if exists (select 1 from gw.friend_asks where from_id = tid and to_id = pid) then   -- they asked already: friends
    delete from gw.friend_asks where (from_id = tid and to_id = pid) or (from_id = pid and to_id = tid);
    insert into gw.friends (a_id, b_id) values (least(pid, tid), greatest(pid, tid)) on conflict do nothing;
    return jsonb_build_object('ok', true, 'friends', true);
  end if;
  if p_action = 'yes' then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if not gw.rate_ok('friend_ask', pid::text, 10, interval '1 day') then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  insert into gw.friend_asks (from_id, to_id) values (pid, tid) on conflict (from_id, to_id) do update set created_at = now();
  return jsonb_build_object('ok', true, 'asked', true);
end $$;

---------------------------------------------------------------- person games
create or replace function public.gw_chess_game(p_token text, p_game uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); g record;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select * into g from gw.chess_games where id = p_game and pid in (white_id, black_id);
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'id', g.id, 'you', case when g.white_id = pid then 'w' else 'b' end,
    'white', coalesce((select name from gw.players where id = g.white_id), 'a gremlin who moved away'),
    'black', coalesce((select name from gw.players where id = g.black_id), 'a gremlin who moved away'),
    'moves', to_jsonb(g.moves), 'status', g.status, 'winner', g.winner);
end $$;
-- p_ply must equal the number of moves already played (stops double-taps and races); turn + ownership checked here.
-- Full legality is checked by both clients with chess.js (an Edge Function can add server-side legality later).
-- p_end lets the mover claim the game ended with this move ('checkmate' | 'stalemate' | 'draw'); the other client re-checks.
create or replace function public.gw_chess_move(p_token text, p_game uuid, p_ply int, p_uci text, p_end text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); g record; mine char(1);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if p_uci !~ '^[a-h][1-8][a-h][1-8][qrbn]?$' or (p_end is not null and p_end not in ('checkmate','stalemate','draw')) then return jsonb_build_object('ok', false, 'error', 'bad_move'); end if;
  select * into g from gw.chess_games where id = p_game and pid in (white_id, black_id) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if g.status not in ('active','set_aside') then return jsonb_build_object('ok', false, 'error', 'over'); end if;
  mine := case when g.white_id = pid then 'w' else 'b' end;
  if cardinality(g.moves) <> p_ply then return jsonb_build_object('ok', false, 'error', 'stale', 'ply', cardinality(g.moves)); end if;
  if (p_ply % 2 = 0) <> (mine = 'w') then return jsonb_build_object('ok', false, 'error', 'not_your_turn'); end if;
  if p_ply >= 600 then return jsonb_build_object('ok', false, 'error', 'over'); end if;
  if not gw.rate_ok('chess_move', pid::text, 120, interval '1 hour') then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  update gw.chess_games set moves = moves || p_uci, updated_at = now(),
    status = coalesce(p_end, 'active'), winner = case when p_end = 'checkmate' then mine else null end where id = g.id;
  return jsonb_build_object('ok', true, 'ply', p_ply + 1);
end $$;
create or replace function public.gw_chess_resign(p_token text, p_game uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  update gw.chess_games set status = 'resigned', updated_at = now(), winner = case when white_id = pid then 'b' else 'w' end
    where id = p_game and pid in (white_id, black_id) and status in ('active','set_aside');
  return jsonb_build_object('ok', found);
end $$;
create or replace function public.gw_chess_rematch(p_token text, p_game uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); g record; oid uuid; gid uuid;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select * into g from gw.chess_games where id = p_game and pid in (white_id, black_id) and status not in ('active','set_aside','blocked');
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  oid := case when g.white_id = pid then g.black_id else g.white_id end;
  if oid is null or gw.blocked_either(pid, oid) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select id into gid from gw.chess_games where rematch_of = g.id;
  if gid is null then insert into gw.chess_games (white_id, black_id, rematch_of) values (g.black_id, g.white_id, g.id) returning id into gid; end if;   -- colours swap
  return jsonb_build_object('ok', true, 'game_id', gid);
end $$;

---------------------------------------------------------------- gremlin wins + the wardrobe
-- Gremlin games run in the browser, so a win is a claim. We accept it only from a live session, with a move list that
-- is long enough to be a real game, at most 20 a day, and we never trust the client to name an unlock: unlocks are
-- derived here from gw.unlock_rules. (Low stakes by design: wearables are cosmetic; coupons never come from here.)
create or replace function public.gw_chess_gremlin_win(p_token text, p_gremlin text, p_moves int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if p_gremlin not in ('noodle','pip','dot','moth','vesper','grimble') or coalesce(p_moves, 0) < 7 then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  if not gw.rate_ok('gremlin_win', pid::text, 20, interval '1 day') then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  insert into gw.gremlin_wins (player_id, gremlin) values (pid, p_gremlin)
    on conflict (player_id, gremlin) do update set wins = gw.gremlin_wins.wins + 1;
  perform gw.grant_unlocks(pid);
  return public.gw_wardrobe(p_token);
end $$;
create or replace function public.gw_wardrobe(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  return jsonb_build_object('ok', true,
    'beaten', coalesce((select jsonb_object_agg(gremlin, wins) from gw.gremlin_wins where player_id = pid), '{}'::jsonb),
    'unlocks', coalesce((select jsonb_agg(item_id) from gw.unlocks where player_id = pid), '[]'::jsonb),
    'outfit', coalesce((select outfit from gw.wardrobe where player_id = pid), '{}'::jsonb));
end $$;
-- outfit = {"slot": "item-id", ...}. Anything not on the allowlist for that slot, or not free and not unlocked, is dropped.
create or replace function public.gw_wardrobe_save(p_token text, p_outfit jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); clean jsonb := '{}'::jsonb; k text; v text;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if jsonb_typeof(p_outfit) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  if not gw.rate_ok('wardrobe', pid::text, 60, interval '1 hour') then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  for k, v in select key, value #>> '{}' from jsonb_each(p_outfit) limit 12 loop
    continue when v is null or not exists (select 1 from gw.wardrobe_items i where i.item_id = v and i.slot = k
      and (i.free or exists (select 1 from gw.unlocks u where u.player_id = pid and u.item_id = v)));
    clean := clean || jsonb_build_object(k, v);
  end loop;
  insert into gw.wardrobe (player_id, outfit) values (pid, clean) on conflict (player_id) do update set outfit = clean, updated_at = now();
  return jsonb_build_object('ok', true, 'outfit', clean);
end $$;

---------------------------------------------------------------- tidy-up (call from pg_cron daily, or by hand)
create or replace function gw.chess_tidy() returns void language sql volatile set search_path = '' as $$
  update gw.chess_games set status = 'set_aside' where status = 'active' and updated_at < now() - interval '14 days';
  update gw.chess_games set status = 'abandoned' where status = 'set_aside' and updated_at < now() - interval '60 days';
  delete from gw.friend_asks where created_at < now() - interval '7 days';
  delete from gw.pokes where created_at < now() - interval '30 days';
$$;

---------------------------------------------------------------- Bryan's tools (dashboard SQL editor only; never granted to the API)
create or replace function gw.admin_reports() returns table (reported text, reason text, times bigint, last_at timestamptz) language sql stable set search_path = '' as $$
  select p.name, r.reason, count(*), max(r.created_at) from gw.reports r join gw.players p on p.id = r.reported_id where r.status = 'open' group by 1, 2 order by 4 desc $$;
create or replace function gw.admin_hide(p_name text, p_on boolean) returns void language sql volatile set search_path = '' as $$
  insert into gw.player_flags (player_id, hidden) values (gw.pid_by_name(p_name), p_on) on conflict (player_id) do update set hidden = p_on, updated_at = now() $$;
create or replace function gw.admin_rename(p_name text, p_new text) returns void language sql volatile set search_path = '' as $$
  update gw.players set name = gw.clean_name(p_new), name_key = lower(gw.clean_name(p_new)) where id = gw.pid_by_name(p_name) $$;
create or replace function gw.admin_remove(p_name text) returns void language sql volatile set search_path = '' as $$
  delete from gw.players where id = gw.pid_by_name(p_name) $$;

---------------------------------------------------------------- grants (anon may call only the public RPCs above)
revoke execute on all functions in schema gw from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['public.gw_chess_poll(text,boolean)','public.gw_chess_dnd(text,boolean)','public.gw_chess_poke(text,text,int)',
    'public.gw_chess_answer(text,bigint,text)','public.gw_chess_block(text,text)','public.gw_chess_unblock(text,text)','public.gw_chess_report(text,text,text)',
    'public.gw_chess_friend(text,text,text)','public.gw_chess_game(text,uuid)','public.gw_chess_move(text,uuid,int,text,text)','public.gw_chess_resign(text,uuid)',
    'public.gw_chess_rematch(text,uuid)','public.gw_chess_gremlin_win(text,text,int)','public.gw_wardrobe(text)','public.gw_wardrobe_save(text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop; end $$;
