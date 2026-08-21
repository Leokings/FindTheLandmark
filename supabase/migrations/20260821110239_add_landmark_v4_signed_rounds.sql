alter table public.landmark_games
  add column contract_version text not null default 'v3',
  add column contract_address text;

update public.landmark_games
set contract_address = '0x198b1027F8eF524BEC3DA10a021b728FD071D7DB'
where contract_game_id is not null;

alter table public.landmark_games
  alter column contract_version set default 'v4',
  add constraint landmark_games_contract_version_check
    check (contract_version in ('v3', 'v4')),
  add constraint landmark_games_contract_address_check
    check (contract_address is null or contract_address ~ '^0x[0-9A-Fa-f]{40}$');

alter table public.landmark_game_players
  add column signer_address text,
  add constraint landmark_game_players_signer_address_check
    check (signer_address is null or signer_address ~ '^0x[0-9a-f]{40}$');

create unique index landmark_game_players_game_signer_idx
  on public.landmark_game_players (game_id, signer_address)
  where signer_address is not null;

alter table public.landmark_game_rounds
  drop constraint landmark_game_rounds_status_check,
  add constraint landmark_game_rounds_status_check
    check (status in (
      'queued', 'open', 'revealing', 'revealed', 'finalizing',
      'submitting', 'pending', 'settled', 'failed'
    )),
  add column reveal_deadline timestamptz,
  add column finalize_after timestamptz,
  add column reveal_transaction_hash text,
  add column finalize_transaction_hash text;

alter table public.landmark_game_answers
  add column signer_address text,
  add column commitment text,
  add column commit_transaction_hash text,
  add column reveal_salt text,
  add constraint landmark_game_answers_signer_address_check
    check (signer_address is null or signer_address ~ '^0x[0-9a-f]{40}$'),
  add constraint landmark_game_answers_commitment_check
    check (commitment is null or commitment ~ '^[0-9a-f]{64}$'),
  add constraint landmark_game_answers_reveal_salt_check
    check (reveal_salt is null or reveal_salt ~ '^[0-9a-f]{64}$'),
  add constraint landmark_game_answers_commit_tx_check
    check (
      commit_transaction_hash is null
      or commit_transaction_hash ~ '^(0x)?[0-9A-Fa-f]{64}$'
    );

create index landmark_game_answers_commit_tx_idx
  on public.landmark_game_answers (commit_transaction_hash)
  where commit_transaction_hash is not null;

create or replace function public.landmark_apply_round_settlement_v4(
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
  if exists (
    select 1
    from jsonb_array_elements(p_scores) as score(value)
    where jsonb_typeof(score.value) <> 'object'
      or coalesce(score.value->>'player_address', '') !~ '^0x[0-9a-f]{40}$'
      or coalesce(score.value->>'choice_index', '') !~ '^[0-3]$'
      or coalesce(score.value->>'elapsed_ms', '') !~ '^[0-9]{1,5}$'
      or coalesce(score.value->>'awarded_xp', '') !~ '^[0-9]{1,5}$'
      or coalesce(jsonb_typeof(score.value->'correct'), '') <> 'boolean'
  ) then
    raise exception 'invalid score entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_scores) as score(value)
    where (score.value->>'elapsed_ms')::integer > 90000
  ) then
    raise exception 'elapsed time outside allowed range';
  end if;
  if (
    select count(*)
    from jsonb_array_elements(p_scores)
  ) <> (
    select count(distinct score.value->>'player_address')
    from jsonb_array_elements(p_scores) as score(value)
  ) then
    raise exception 'duplicate player score';
  end if;

  update public.landmark_game_rounds
  set status = 'settled',
      correct_index = p_correct_index,
      consensus_status = p_consensus_status,
      settled_at = now(),
      next_check_at = null,
      error_message = null
  where id = p_round_id
    and status in ('finalizing', 'pending')
  returning game_id into v_game_id;

  if v_game_id is null then
    return false;
  end if;

  update public.landmark_game_answers as answer
  set elapsed_ms = (score.value->>'elapsed_ms')::integer,
      awarded_points = (score.value->>'awarded_xp')::integer,
      correct = (score.value->>'correct')::boolean
  from public.landmark_game_players as player,
       jsonb_array_elements(p_scores) as score(value)
  where answer.round_id = p_round_id
    and answer.player_id = player.id
    and player.game_id = v_game_id
    and player.signer_address = score.value->>'player_address'
    and answer.choice_index = (score.value->>'choice_index')::integer;

  update public.landmark_game_players as player
  set score = coalesce((
    select sum(answer.awarded_points)::integer
    from public.landmark_game_answers as answer
    where answer.player_id = player.id
      and answer.correct is not null
  ), 0)
  where player.game_id = v_game_id;

  if not exists (
    select 1 from public.landmark_game_rounds
    where game_id = v_game_id and status <> 'settled'
  ) then
    update public.landmark_games
    set status = 'finished',
        current_round = round_count,
        winner_player_id = (
          select id from public.landmark_game_players
          where game_id = v_game_id
          order by score desc, joined_at asc
          limit 1
        ),
        finished_at = now(),
        updated_at = now()
    where id = v_game_id and status in ('running', 'verifying');
  end if;

  return true;
end;
$$;

revoke all on function public.landmark_apply_round_settlement_v4(uuid, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.landmark_apply_round_settlement_v4(uuid, integer, jsonb, text)
  to service_role;
