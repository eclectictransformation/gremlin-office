-- The Quiet Room is now an in-world room (world-data.json rooms.quietroom). Whitelist its room id so a signed-in
-- player's "visited" list keeps it when progress syncs (unknown ids are silently dropped, so nothing breaks without this).
-- Same content tools/make-gw-seed.py would generate. Safe to re-run. Never touches players, progress or scores.
insert into gw.known_ids (kind, id) values
  ('room', 'quietroom')
on conflict do nothing;
