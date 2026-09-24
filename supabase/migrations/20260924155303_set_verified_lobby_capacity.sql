-- Preserve historical 50-player results, but do not advertise more active
-- answerers than the current StudioNet load test has actually exercised.
alter table public.landmark_games
  alter column max_players set default 8;
