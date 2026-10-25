-- Gremlin World functions.
--  * gw.*      private helpers (not reachable from the API; no EXECUTE for anon/authenticated)
--  * public.gw_*  the RPCs the site calls at /rest/v1/rpc/<name>. SECURITY DEFINER, fixed empty
--    search_path (everything schema-qualified), EXECUTE granted to anon ONLY.
-- Every RPC returns jsonb {ok: true, ...} or {ok: false, error: '<code>'} (leaderboard/guestbook return rows).

------------------------------------------------------------------ helpers
create or replace function gw.clean_name(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')
$$;

create or replace function gw.name_key(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(gw.clean_name(p))
$$;

-- returns null when the name is fine, else 'length' | 'chars' | 'rude' | 'reserved'
create or replace function gw.check_name(p_name text) returns text
language plpgsql stable set search_path = '' as $$
declare
  n text := gw.clean_name(p_name);
  leet text; letters text; raw_letters text; collapsed text; words text[]; r record;
begin
  if char_length(n) < 3 or char_length(n) > 20 then return 'length'; end if;
  if n !~ '^[A-Za-z0-9 _-]+$' or n !~ '[A-Za-z0-9]' then return 'chars'; end if;
  leet        := translate(lower(n), '01345789', 'oieastbg');
  letters     := regexp_replace(leet, '[^a-z]', '', 'g');
  raw_letters := regexp_replace(lower(n), '[^a-z]', '', 'g');
  collapsed   := regexp_replace(letters, '(.)\1+', '\1', 'g');
  words       := regexp_split_to_array(btrim(regexp_replace(leet, '[^a-z]+', ' ', 'g')), ' ');
  for r in select kind, term from gw.name_rules loop
    if r.kind = 'substring' and (position(r.term in letters) > 0
        or (r.term !~ '(.)\1' and position(r.term in collapsed) > 0)) then return 'rude'; end if;
    if r.kind = 'word' and r.term = any (words) then return 'rude'; end if;
    if r.kind = 'reserved_exact' and (r.term = letters or r.term = raw_letters) then return 'reserved'; end if;
    if r.kind = 'reserved_contains' and (position(r.term in letters) > 0 or position(r.term in raw_letters) > 0) then return 'reserved'; end if;
  end loop;
  return null;
end $$;

-- true (and logs the event) if fewer than p_max events of this kind/subject happened inside p_window
create or replace function gw.rate_ok(p_kind text, p_subject text, p_max int, p_window interval) returns boolean
language plpgsql volatile set search_path = '' as $$
declare c int;
begin
  if random() < 0.02 then delete from gw.rate_events where at < now() - interval '1 day'; end if;
  select count(*) into c from gw.rate_events where kind = p_kind and subject = p_subject and at > now() - p_window;
  if c >= p_max then return false; end if;
  insert into gw.rate_events (kind, subject) values (p_kind, p_subject);
  return true;
end $$;

create or replace function gw.hash_token(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex')
$$;

create or replace function gw.session_player(p_token text) returns uuid
language sql stable set search_path = '' as $$
  select s.player_id from gw.sessions s
  where p_token ~ '^[0-9a-f]{64}$' and s.token_hash = gw.hash_token(p_token) and s.expires_at > now()
$$;

create or replace function gw.new_session(p_player uuid) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex'); exp timestamptz := now() + interval '90 days';
begin
  insert into gw.sessions (token_hash, player_id, expires_at) values (gw.hash_token(tok), p_player, exp);
  -- keep at most 10 live sessions per player, and sweep expired ones
  delete from gw.sessions where player_id = p_player and token_hash in (
    select token_hash from gw.sessions where player_id = p_player order by created_at desc offset 10);
  delete from gw.sessions where expires_at < now();
  return jsonb_build_object('token', tok, 'expires_at', exp);
end $$;

-- random index 0..n-1 from pgcrypto's CSPRNG
create or replace function gw.rand_index(n int) returns int
language plpgsql volatile set search_path = '' as $$
declare b bytea := extensions.gen_random_bytes(4);
begin
  return ((get_byte(b,0)::bigint << 24 | get_byte(b,1) << 16 | get_byte(b,2) << 8 | get_byte(b,3)) % n)::int;
end $$;

create or replace function gw.make_key() returns text
language plpgsql volatile set search_path = '' as $$
declare out text[] := '{}'; s int; n int; w text;
begin
  for s in 1..3 loop
    select count(*) into n from gw.key_words where slot = s;
    select word into w from gw.key_words where slot = s order by word offset gw.rand_index(n) limit 1;
    out := out || w;
  end loop;
  return array_to_string(out, '-');
end $$;

create or replace function gw.normalize_key(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(lower(btrim(coalesce(p, ''))), '[^a-z]+', '-', 'g'), '-+', '-', 'g'), '-')
$$;

---------------------------------------------------------------- progress cleaning + merging
-- array of known ids of one kind (unknown ids silently dropped, max 200 inspected)
create or replace function gw.clean_ids(j jsonb, p_kind text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(distinct e.v order by e.v), '[]'::jsonb)
  from (select v from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)
          with ordinality as t(v, ord) where ord <= 200) e
  where exists (select 1 from gw.known_ids k where k.kind = p_kind and k.id = e.v)
$$;

create or replace function gw.clean_int(j jsonb, lo numeric, hi numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j) = 'number' then to_jsonb(least(greatest(floor((j #>> '{}')::numeric), lo), hi)::bigint) else null end
$$;

-- {id: number} map: kind 'game' uses gw.games (and clamps to max_score when p_hi is null), others gw.known_ids
create or replace function gw.clean_map(j jsonb, p_kind text, p_hi numeric) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, gw.clean_int(e.value, 0, coalesce(p_hi, g.max_score))), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end) e
  left join gw.games g on p_kind = 'game' and g.game_id = e.key
  where jsonb_typeof(e.value) = 'number'
    and ((p_kind = 'game' and g.game_id is not null)
      or (p_kind <> 'game' and exists (select 1 from gw.known_ids k where k.kind = p_kind and k.id = e.key)))
$$;

-- whitelisted shape: anything unknown is dropped
create or replace function gw.clean_progress(p jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'socks', gw.clean_ids(p -> 'socks', 'sock'),
    'socksReset', coalesce(gw.clean_int(p -> 'socksReset', 0, 100000), '0'::jsonb),
    'visited', gw.clean_ids(p -> 'visited', 'room'),
    'greeted', gw.clean_ids(p -> 'greeted', 'room'),
    'found', gw.clean_ids(p -> 'found', 'egg'),
    'bests', gw.clean_map(p -> 'bests', 'game', null),
    'played', gw.clean_map(p -> 'played', 'game', 1000000),
    'badges', gw.clean_map(p -> 'badges', 'badge', 99999999999999),
    'sock', jsonb_strip_nulls(jsonb_build_object(
        'start', gw.clean_int(p #> '{sock,start}', 0, 99999999999999),
        'best',  gw.clean_int(p #> '{sock,best}', 1000, 1000000000),
        'last',  gw.clean_int(p #> '{sock,last}', 1000, 1000000000),
        'done',  gw.clean_int(p #> '{sock,done}', 0, 100000))),
    'time', gw.clean_int(p -> 'time', 0, 1000000000),
    'first', gw.clean_int(p -> 'first', 0, 99999999999999)))
$$;

create or replace function gw.jarr_union(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(distinct v order by v), '[]'::jsonb) from (
    select jsonb_array_elements(coalesce(a, '[]'::jsonb)) v union all select jsonb_array_elements(coalesce(b, '[]'::jsonb))) x
$$;

-- per-key merge of two {id: number} maps. mode: 'max' | 'min' | 'best' (games: min if low else max)
create or replace function gw.jmap_merge(a jsonb, b jsonb, mode text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, case
           when mode = 'min' or (mode = 'best' and coalesce(g.low, false)) then mn else mx end), '{}'::jsonb)
  from (select key k, min(value::numeric) mn, max(value::numeric) mx from (
          select key, value from jsonb_each_text(coalesce(a, '{}'::jsonb))
          union all select key, value from jsonb_each_text(coalesce(b, '{}'::jsonb))) u group by key) m
  left join gw.games g on mode = 'best' and g.game_id = m.k
$$;

-- union of found things, best of bests, earliest badge, longest time played. A sock "reset" (hide the
-- socks again) wins over a union when its counter is newer.
create or replace function gw.merge_progress(a jsonb, b jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare ra int := coalesce((a ->> 'socksReset')::int, 0); rb int := coalesce((b ->> 'socksReset')::int, 0);
begin
  return jsonb_strip_nulls(jsonb_build_object(
    'v', 1,
    'socks', case when rb > ra then b -> 'socks' when ra > rb then a -> 'socks' else gw.jarr_union(a -> 'socks', b -> 'socks') end,
    'socksReset', greatest(ra, rb),
    'visited', gw.jarr_union(a -> 'visited', b -> 'visited'),
    'greeted', gw.jarr_union(a -> 'greeted', b -> 'greeted'),
    'found', gw.jarr_union(a -> 'found', b -> 'found'),
    'bests', gw.jmap_merge(a -> 'bests', b -> 'bests', 'best'),
    'played', gw.jmap_merge(a -> 'played', b -> 'played', 'max'),
    'badges', gw.jmap_merge(a -> 'badges', b -> 'badges', 'min'),
    'sock', jsonb_strip_nulls(jsonb_build_object(
        'start', case when rb > ra then b #> '{sock,start}' when ra > rb then a #> '{sock,start}'
                      else to_jsonb(least((a #>> '{sock,start}')::bigint, (b #>> '{sock,start}')::bigint)) end,
        'best', to_jsonb(least((a #>> '{sock,best}')::bigint, (b #>> '{sock,best}')::bigint)),
        'last', case when coalesce((b #>> '{sock,done}')::int, 0) > coalesce((a #>> '{sock,done}')::int, 0) then b #> '{sock,last}'
                     else coalesce(a #> '{sock,last}', b #> '{sock,last}') end,
        'done', to_jsonb(greatest((a #>> '{sock,done}')::int, (b #>> '{sock,done}')::int)))),
    'time', to_jsonb(greatest((a ->> 'time')::bigint, (b ->> 'time')::bigint)),
    'first', to_jsonb(least((a ->> 'first')::bigint, (b ->> 'first')::bigint))));
end $$;

---------------------------------------------------------------- public RPCs
create or replace function public.gw_register(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare err text := gw.check_name(p_name); n text := gw.clean_name(p_name); k text; pid uuid; s jsonb;
begin
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  if exists (select 1 from gw.players where name_key = lower(n)) then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  if not gw.rate_ok('register', 'global', 10, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  k := gw.make_key();
  insert into gw.players (name, name_key, key_hash) values (n, lower(n), extensions.crypt(k, extensions.gen_salt('bf', 8)))
    returning id into pid;
  insert into gw.progress (player_id) values (pid);
  s := gw.new_session(pid);
  return jsonb_build_object('ok', true, 'player_id', pid, 'name', n, 'key', k) || s;
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

create or replace function public.gw_login(p_name text, p_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare nk text := gw.name_key(p_name); k text := gw.normalize_key(p_key); p gw.players%rowtype; fails int;
begin
  if nk = '' or k = '' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not gw.rate_ok('login', 'global', 120, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  select count(*) into fails from gw.rate_events where kind = 'login_fail' and subject = nk and at > now() - interval '10 minutes';
  if fails >= 8 then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  select * into p from gw.players where name_key = nk;
  if not found or p.key_hash is distinct from extensions.crypt(k, p.key_hash) then
    insert into gw.rate_events (kind, subject) values ('login_fail', nk);
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  update gw.players set last_seen_at = now() where id = p.id;
  return jsonb_build_object('ok', true, 'player_id', p.id, 'name', p.name) || gw.new_session(p.id);
end $$;

create or replace function public.gw_logout(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from gw.sessions where token_hash = gw.hash_token(p_token);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.gw_load_progress(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); pr gw.progress%rowtype; nm text;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  update gw.players set last_seen_at = now() where id = pid returning name into nm;
  select * into pr from gw.progress where player_id = pid;
  return jsonb_build_object('ok', true, 'name', nm, 'progress', coalesce(pr.data, '{}'::jsonb),
    'scores', (select coalesce(jsonb_object_agg(game_id, score), '{}'::jsonb) from gw.scores where player_id = pid),
    'signed_today', exists (select 1 from gw.guestbook where player_id = pid and signed_on = (now() at time zone 'utc')::date));
end $$;

create or replace function public.gw_save_progress(p_token text, p_progress jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); old jsonb; m jsonb; first_done boolean;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_shape'); end if;
  if octet_length(p_progress::text) > 8192 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  if not gw.rate_ok('save', pid::text, 30, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  select data into old from gw.progress where player_id = pid for update;
  m := gw.merge_progress(gw.clean_progress(coalesce(old, '{}'::jsonb)), gw.clean_progress(p_progress));
  first_done := coalesce((m #>> '{sock,done}')::int, 0) > 0 or jsonb_array_length(m -> 'socks') >= 5;
  insert into gw.progress as g (player_id, data) values (pid, m)
  on conflict (player_id) do update set data = excluded.data;
  update gw.progress set
    socks = jsonb_array_length(m -> 'socks'),
    secrets = jsonb_array_length(m -> 'found'),
    rooms = jsonb_array_length(m -> 'visited'),
    sock_hunts = greatest(coalesce((m #>> '{sock,done}')::int, 0), case when jsonb_array_length(m -> 'socks') >= 5 then 1 else 0 end),
    sock_best_ms = (m #>> '{sock,best}')::int,
    sock_done_at = coalesce(sock_done_at, case when first_done then now() end),
    badges = array(select jsonb_object_keys(coalesce(m -> 'badges', '{}'::jsonb))),
    updated_at = now()
  where player_id = pid;
  return jsonb_build_object('ok', true, 'progress', m);
end $$;

create or replace function public.gw_submit_score(p_token text, p_game_id text, p_score int, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); g gw.games%rowtype; best int; at_ts timestamptz; rnk int; prev int;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select * into g from gw.games where game_id = p_game_id and ranked;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_game'); end if;
  if p_score is null or p_score < 1 or p_score > g.max_score then return jsonb_build_object('ok', false, 'error', 'bad_score'); end if;
  if not gw.rate_ok('score', pid::text, 5, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' or octet_length(p_meta::text) > 1024 then p_meta := '{}'::jsonb; end if;
  select score into prev from gw.scores where player_id = pid and game_id = g.game_id;
  insert into gw.scores as s (player_id, game_id, score, meta) values (pid, g.game_id, p_score, p_meta)
  on conflict (player_id, game_id) do update set score = excluded.score, meta = excluded.meta, achieved_at = now()
    where excluded.score > s.score;
  select score, achieved_at into best, at_ts from gw.scores where player_id = pid and game_id = g.game_id;
  select 1 + count(*) into rnk from gw.scores
    where game_id = g.game_id and (score > best or (score = best and achieved_at < at_ts));
  return jsonb_build_object('ok', true, 'best', best, 'improved', prev is null or p_score > prev, 'rank', rnk, 'top10', rnk <= 10);
end $$;

create or replace function public.gw_leaderboard(p_game_id text, p_limit int default 10)
returns table (rank int, name text, score int)
language sql stable security definer set search_path = '' as $$
  select (row_number() over (order by s.score desc, s.achieved_at))::int, p.name, s.score
  from gw.scores s join gw.players p on p.id = s.player_id
  join gw.games g on g.game_id = s.game_id and g.ranked
  where s.game_id = p_game_id
  order by s.score desc, s.achieved_at
  limit least(greatest(coalesce(p_limit, 10), 1), 10)
$$;

create or replace function public.gw_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'players', (select count(*) from gw.players),
    'sock_hunt_finished', (select count(*) from gw.progress where sock_hunts > 0),
    'fastest_sock_hunt_ms', (select min(sock_best_ms) from gw.progress),
    'avg_secrets', (select coalesce(round(avg(secrets), 1), 0) from gw.progress where rooms > 0),
    'avg_rooms', (select coalesce(round(avg(rooms), 1), 0) from gw.progress where rooms > 0),
    'all_rooms', (select count(*) from gw.progress where rooms >= (select count(*) from gw.known_ids where kind = 'room')),
    'rooms_total', (select count(*) from gw.known_ids where kind = 'room'),
    'brawl_players', (select count(distinct player_id) from gw.scores),
    'guestbook_signatures', (select count(*) from gw.guestbook),
    'badges', (select coalesce(jsonb_object_agg(b, n), '{}'::jsonb) from (
        select unnest(badges) b, count(*) n from gw.progress group by 1) x))
$$;

create or replace function public.gw_sign_guestbook(p_token text, p_phrase_id int, p_stamp_id text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); new_id bigint;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not exists (select 1 from gw.guestbook_phrases where id = p_phrase_id) then return jsonb_build_object('ok', false, 'error', 'bad_phrase'); end if;
  if p_stamp_id = '' then p_stamp_id := null; end if;
  if p_stamp_id is not null and not exists (select 1 from gw.guestbook_stamps where id = p_stamp_id) then
    return jsonb_build_object('ok', false, 'error', 'bad_stamp'); end if;
  insert into gw.guestbook (player_id, phrase_id, stamp_id) values (pid, p_phrase_id, p_stamp_id)
  on conflict (player_id, signed_on) do nothing returning id into new_id;
  if new_id is null then return jsonb_build_object('ok', false, 'error', 'once_a_day'); end if;
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;

create or replace function public.gw_guestbook(p_limit int default 20)
returns table (name text, phrase text, stamp text, stamp_id text, phrase_id int, signed_on date)
language sql stable security definer set search_path = '' as $$
  select p.name, ph.phrase, st.emoji, g.stamp_id, g.phrase_id, g.signed_on
  from gw.guestbook g join gw.players p on p.id = g.player_id
  join gw.guestbook_phrases ph on ph.id = g.phrase_id
  left join gw.guestbook_stamps st on st.id = g.stamp_id
  order by g.signed_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- for the weekly report: aggregates and already-public data only (names + scores, names + guestbook lines)
create or replace function public.gw_weekly_stats(p_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := greatest(coalesce(p_since, now() - interval '7 days'), now() - interval '400 days');
        since_ms bigint := (extract(epoch from greatest(coalesce(p_since, now() - interval '7 days'), now() - interval '400 days')) * 1000)::bigint;
begin
  return jsonb_build_object(
    'since', since, 'generated_at', now(),
    'players', jsonb_build_object('new', (select count(*) from gw.players where created_at >= since),
                                  'total', (select count(*) from gw.players)),
    'sock_hunts', jsonb_build_object('new', (select count(*) from gw.progress where sock_done_at >= since),
                                     'total', (select count(*) from gw.progress where sock_hunts > 0)),
    'avg_secrets', (select coalesce(round(avg(secrets), 1), 0) from gw.progress where rooms > 0),
    'rooms_distribution', (select coalesce(jsonb_object_agg(r, n order by r), '{}'::jsonb) from (
        select rooms r, count(*) n from gw.progress group by rooms) x),
    'badges', jsonb_build_object(
        'total', (select coalesce(jsonb_object_agg(b, n), '{}'::jsonb) from (select unnest(badges) b, count(*) n from gw.progress group by 1) x),
        'new', (select coalesce(jsonb_object_agg(b, n), '{}'::jsonb) from (
            select e.key b, count(*) n from gw.progress pr, jsonb_each_text(coalesce(pr.data -> 'badges', '{}'::jsonb)) e
            where e.value::numeric >= since_ms group by 1) y)),
    'brawl_top3', (select coalesce(jsonb_object_agg(g.game_id, (
        select coalesce(jsonb_agg(jsonb_build_object('rank', t.rank, 'name', t.name, 'score', t.score) order by t.rank), '[]'::jsonb)
        from public.gw_leaderboard(g.game_id, 3) t)), '{}'::jsonb) from gw.games g where g.ranked),
    'brawl_scores_new', (select count(*) from gw.scores where achieved_at >= since),
    'guestbook', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'phrase', ph.phrase, 'stamp', st.emoji, 'date', g.signed_on) order by g.signed_at desc), '[]'::jsonb)
        from (select * from gw.guestbook where signed_at >= since order by signed_at desc limit 200) g
        join gw.players p on p.id = g.player_id join gw.guestbook_phrases ph on ph.id = g.phrase_id
        left join gw.guestbook_stamps st on st.id = g.stamp_id));
end $$;

-- "Forget me": deletes the player and everything attached (sessions, progress, scores, guestbook lines)
create or replace function public.gw_forget_me(p_token text, p_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); h text;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  select key_hash into h from gw.players where id = pid;
  if h is distinct from extensions.crypt(gw.normalize_key(p_key), h) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  delete from gw.players where id = pid;
  return jsonb_build_object('ok', true);
end $$;

---------------------------------------------------------------- grants
revoke execute on all functions in schema gw from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.gw_register(text)', 'public.gw_login(text, text)', 'public.gw_logout(text)',
    'public.gw_load_progress(text)', 'public.gw_save_progress(text, jsonb)',
    'public.gw_submit_score(text, text, int, jsonb)', 'public.gw_leaderboard(text, int)', 'public.gw_stats()',
    'public.gw_sign_guestbook(text, int, text)', 'public.gw_guestbook(int)', 'public.gw_weekly_stats(timestamptz)',
    'public.gw_forget_me(text, text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop;
end $$;
