alter table public.landmark_game_rounds
  add column reveal_answer_count integer not null default 0
    check (reveal_answer_count between 0 and 50),
  add column pending_reveal_answer_count integer
    check (pending_reveal_answer_count between 0 and 50),
  add column reveal_confirmed_at timestamptz;
