alter table public.landmark_games
  alter column round_count set default 12;

update public.landmark_games
set round_count = 12,
    updated_at = now()
where status = 'waiting';
