-- Child rows are deleted by the parent game's cascade. Their DELETE triggers
-- previously tried to recreate an event for the already-deleted game, causing
-- the scheduled cleanup transaction to roll back on a foreign-key violation.
drop trigger if exists landmark_game_players_bump_event on public.landmark_game_players;
create trigger landmark_game_players_bump_event
after insert or update on public.landmark_game_players
for each row execute function public.landmark_bump_game_event();

drop trigger if exists landmark_game_rounds_bump_event on public.landmark_game_rounds;
create trigger landmark_game_rounds_bump_event
after insert or update on public.landmark_game_rounds
for each row execute function public.landmark_bump_game_event();
