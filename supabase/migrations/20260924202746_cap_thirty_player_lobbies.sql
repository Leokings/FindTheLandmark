-- New lobbies use a 30-player cap. Existing games retain their stored cap.
alter table public.landmark_games
  alter column max_players set default 30;
