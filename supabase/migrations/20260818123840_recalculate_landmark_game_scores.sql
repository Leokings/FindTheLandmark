create or replace function public.landmark_apply_round_settlement(
  p_round_id uuid,
  p_correct_index integer,
  p_scores jsonb,
  p_consensus_status text
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_game_id uuid;
begin
  if p_correct_index < 0 or p_correct_index > 3 then
    raise exception 'correct index outside allowed range';
  end if;
  if jsonb_typeof(p_scores) <> 'array' or jsonb_array_length(p_scores) > 50 then
    raise exception 'invalid score payload';
  end if;

  update public.landmark_game_rounds
  set status = 'settled',
      correct_index = p_correct_index,
      consensus_status = p_consensus_status,
      settled_at = now(),
      next_check_at = null,
      error_message = null
  where id = p_round_id and status in ('pending','submitting')
  returning game_id into v_game_id;

  if v_game_id is null then
    return false;
  end if;

  update public.landmark_game_answers as answer
  set awarded_points = (score.value->>'awarded_xp')::integer,
      correct = (score.value->>'correct')::boolean
  from public.landmark_game_players as player,
       jsonb_array_elements(p_scores) as score(value)
  where answer.round_id = p_round_id
    and answer.player_id = player.id
    and player.game_id = v_game_id
    and player.player_hash = score.value->>'player_hash';

  update public.landmark_game_players as player
  set score = coalesce((
    select sum(answer.awarded_points)::integer
    from public.landmark_game_answers as answer
    where answer.player_id = player.id
      and answer.correct is not null
  ), 0)
  where player.game_id = v_game_id;

  if exists (
    select 1 from public.landmark_games
    where id = v_game_id and status = 'verifying'
  ) and not exists (
    select 1 from public.landmark_game_rounds
    where game_id = v_game_id and status <> 'settled'
  ) then
    update public.landmark_games
    set status = 'finished',
        winner_player_id = (
          select id from public.landmark_game_players
          where game_id = v_game_id
          order by score desc, joined_at asc
          limit 1
        ),
        finished_at = now(),
        updated_at = now()
    where id = v_game_id;
  end if;

  return true;
end;
$$;

revoke all on function public.landmark_apply_round_settlement(uuid, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.landmark_apply_round_settlement(uuid, integer, jsonb, text)
  to service_role;
