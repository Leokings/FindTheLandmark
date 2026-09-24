-- A host attempt has one stable player key, so a retry cannot create a second room.
create unique index if not exists landmark_games_host_player_key_idx
  on public.landmark_games (host_player_key);

-- The row lock is enough to serialize admissions and protect the 50-player cap.
-- Taking a second advisory lock only adds contention during join bursts.
create or replace function public.landmark_enforce_player_limit()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_max_players integer;
  v_status text;
  v_count integer;
begin
  select max_players, status
  into v_max_players, v_status
  from public.landmark_games
  where id = new.game_id
  for update;

  if v_status is distinct from 'waiting' then
    raise exception 'game already started';
  end if;

  select count(*) into v_count
  from public.landmark_game_players
  where game_id = new.game_id;

  if v_count >= v_max_players then
    raise exception 'lobby is full';
  end if;

  return new;
end;
$$;
