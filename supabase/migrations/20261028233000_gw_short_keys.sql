-- Gremlin World: short, friendly Gremlin Keys for NEW players: two little words + a number (moss-sock-7).
-- Backward compatible:
--   * existing players keep their bcrypt key_hash untouched; no player rows are changed.
--   * normalize_key now keeps digits (old keys are letters only, so they normalize exactly as before),
--     and puts a dash between a word and a number ("moss sock7" -> "moss-sock-7").
--   * gw.make_key() (old three-word generator) is left in place, just no longer called by gw_register.
-- Uniqueness: Gremlin Names stay unique (players.name_key unique); the key is a per-player secret
-- (bcrypt hash checked against that one name), so two players may share a key safely.

-- THE WORD LIST (3-5 letters, nature / cozy things / gremlin things; no homophones or tricky spellings).
create or replace function gw.short_key_words()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'moss','fern','leaf','acorn','pine','twig','pond','frog','toad','snail',
    'bean','plum','berry','honey','mint','sage','daisy','tulip','seed','root',
    'stump','rock','shell','wave','cloud','snow','star','moon','hill','lake',
    'brook','nest','egg','owl','fox','cat','pup','hen','duck','mole',
    'wren','robin','otter','panda','moth','sock','mug','cup','jam','bun',
    'toast','quilt','nap','yarn','mitt','hat','boot','lamp','soup','pie',
    'cake','crumb','spoon','fork','bowl','kite','drum','snug','fuzz','puff',
    'bloom','nook','den','hut','barn','shed','path','cozy','imp','gizmo',
    'sprig','apple','lemon','peach','bunny'
  ]::text[]
$$;

-- numbers 2..99 with no 0 or 1 in them (so nobody mixes up 0/O or 1/l)
create or replace function gw.make_short_key()
returns text language plpgsql set search_path = '' as $$
declare w text[] := array(select x from unnest(gw.short_key_words()) x where char_length(x) between 3 and 5);
        nums int[] := array(select n from generate_series(2, 99) n where n::text !~ '[01]');
        a int; b int;
begin
  a := 1 + gw.rand_index(array_length(w, 1));
  loop b := 1 + gw.rand_index(array_length(w, 1)); exit when b <> a; end loop;
  return w[a] || '-' || w[b] || '-' || nums[1 + gw.rand_index(array_length(nums, 1))]::text;
end $$;

create or replace function gw.normalize_key(p text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(p, ''))), '([a-z])([0-9])', '\1-\2', 'g'),
                                         '([0-9])([a-z])', '\1-\2', 'g'),
                          '[^a-z0-9]+', '-', 'g'),
         '-+', '-', 'g'), '-')
$$;

create or replace function public.gw_register(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare err text := gw.check_name(p_name); n text := gw.clean_name(p_name); k text; pid uuid; s jsonb;
begin
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  if exists (select 1 from gw.players where name_key = lower(n)) then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  if not gw.rate_ok('register', 'global', 10, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
  k := gw.make_short_key();
  insert into gw.players (name, name_key, key_hash) values (n, lower(n), extensions.crypt(k, extensions.gen_salt('bf', 8)))
    returning id into pid;
  insert into gw.progress (player_id) values (pid);
  s := gw.new_session(pid);
  return jsonb_build_object('ok', true, 'player_id', pid, 'name', n, 'key', k) || s;
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'taken');
end $$;

-- "Give me another": a brand-new player (made in the last 30 minutes) may swap their key for a fresh one.
-- Needs their own session token; older players can't be re-keyed this way.
create or replace function public.gw_reroll_key(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pid uuid := gw.session_player(p_token); k text;
begin
  if pid is null then return jsonb_build_object('ok', false, 'error', 'session'); end if;
  if not exists (select 1 from gw.players where id = pid and created_at > now() - interval '30 minutes') then
    return jsonb_build_object('ok', false, 'error', 'too_late'); end if;
  if not gw.rate_ok('reroll', pid::text, 20, interval '30 minutes') then return jsonb_build_object('ok', false, 'error', 'slow_down'); end if;
  k := gw.make_short_key();
  update gw.players set key_hash = extensions.crypt(k, extensions.gen_salt('bf', 8)) where id = pid;
  return jsonb_build_object('ok', true, 'key', k);
end $$;

revoke execute on function gw.short_key_words(), gw.make_short_key() from public, anon, authenticated;
revoke all on function public.gw_reroll_key(text) from public, anon, authenticated;
grant execute on function public.gw_reroll_key(text) to anon;
