-- Advisor follow-up: make the deny-all intent explicit (lint 0008 rls_enabled_no_policy).
-- The gw schema is not exposed through the API and anon/authenticated have no table grants; these
-- restrictive false policies are a third lock so a future grant can't accidentally open a table.

drop policy if exists gw_no_api_access on gw.players;
create policy gw_no_api_access on gw.players as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.sessions;
create policy gw_no_api_access on gw.sessions as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.progress;
create policy gw_no_api_access on gw.progress as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.games;
create policy gw_no_api_access on gw.games as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.scores;
create policy gw_no_api_access on gw.scores as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.known_ids;
create policy gw_no_api_access on gw.known_ids as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.rate_events;
create policy gw_no_api_access on gw.rate_events as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.key_words;
create policy gw_no_api_access on gw.key_words as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.name_rules;
create policy gw_no_api_access on gw.name_rules as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.guestbook_phrases;
create policy gw_no_api_access on gw.guestbook_phrases as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.guestbook_stamps;
create policy gw_no_api_access on gw.guestbook_stamps as restrictive for all to anon, authenticated using (false) with check (false);
drop policy if exists gw_no_api_access on gw.guestbook;
create policy gw_no_api_access on gw.guestbook as restrictive for all to anon, authenticated using (false) with check (false);
