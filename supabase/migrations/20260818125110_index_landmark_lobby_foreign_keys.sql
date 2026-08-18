create index landmark_game_answers_game_idx
  on public.landmark_game_answers (game_id);
create index landmark_game_answers_player_idx
  on public.landmark_game_answers (player_id);
create index landmark_games_winner_idx
  on public.landmark_games (winner_player_id)
  where winner_player_id is not null;
