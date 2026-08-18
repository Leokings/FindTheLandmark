alter table public.landmark_games add column next_check_at timestamptz;

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
  perform pg_advisory_xact_lock(hashtextextended(new.game_id::text, 0));

  select max_players, status
  into v_max_players, v_status
  from public.landmark_games
  where id = new.game_id
  for update;

  if v_status <> 'waiting' then
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

revoke all on function public.landmark_enforce_player_limit() from public, anon, authenticated;
grant execute on function public.landmark_enforce_player_limit() to service_role;

create trigger landmark_game_players_limit
before insert on public.landmark_game_players
for each row execute function public.landmark_enforce_player_limit();
