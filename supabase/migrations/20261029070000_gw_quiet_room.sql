-- Gremlin World: The Quiet Room (Moss Garden + Breathing Pond) saves, one row per player per game.
-- Same lock-down pattern as the chess migration: private schema gw, RLS on with a restrictive deny-all
-- policy, no table grants; the browser only calls public.gw_quiet_* SECURITY DEFINER functions with its
-- session token (validated by gw.session_player, exactly like gw_load_progress / gw_save_progress).
-- Additive only. Applied to ydotiqwobbenwqeerkoc on Oct 29, 2026 (Moss Garden + Seed Path go-live, Bryan approved).
-- Owner scoping: players are Gremlin Keys (gw.players), not Supabase Auth users, so auth.uid() is always null here;
-- each row is bound to its owner by gw.session_player(p_token) inside the definer functions instead.

create table if not exists gw.quiet_saves (
  player_id  uuid not null references gw.players(id) on delete cascade,
  game       text not null check (game in ('moss-garden','breathing-pond')),
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536),
  updated_at timestamptz not null default now(),
  primary key (player_id, game)
);

alter table gw.quiet_saves enable row level security;
drop policy if exists gw_no_api_access on gw.quiet_saves;
create policy gw_no_api_access on gw.quiet_saves as restrictive for all to anon, authenticated using (false) with check (false);
revoke all on gw.quiet_saves from public, anon, authenticated;

create or replace function public.gw_quiet_load(p_token text, p_game text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); d jsonb; u timestamptz;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if p_game is null or p_game not in ('moss-garden','breathing-pond') then return jsonb_build_object('ok', false, 'error', 'bad_game'); end if;
  select data, updated_at into d, u from gw.quiet_saves where player_id = pid and game = p_game;
  return jsonb_build_object('ok', true, 'data', d, 'updated_at', u);
end $$;

create or replace function public.gw_quiet_save(p_token text, p_game text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token);
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if p_game is null or p_game not in ('moss-garden','breathing-pond') then return jsonb_build_object('ok', false, 'error', 'bad_game'); end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_shape'); end if;
  if octet_length(p_data::text) > 65536 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  if not gw.rate_ok('quiet_save', pid::text, 20, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  insert into gw.quiet_saves (player_id, game, data) values (pid, p_game, p_data)
    on conflict (player_id, game) do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- grants: anon may call only these two public RPCs
do $$ declare f text; begin
  foreach f in array array['public.gw_quiet_load(text,text)','public.gw_quiet_save(text,text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to anon', f);
  end loop; end $$;
