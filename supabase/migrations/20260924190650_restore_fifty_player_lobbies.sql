-- Restore the original advertised room size; existing rooms keep their chosen cap.
alter table public.landmark_games
  alter column max_players set default 50;
