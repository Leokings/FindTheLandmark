create table public.landmark_games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_player_key text not null check (char_length(host_player_key) between 12 and 100),
  status text not null default 'waiting' check (status in ('waiting','registering','running','verifying','finished','error')),
  max_players integer not null default 50 check (max_players between 2 and 50),
  round_count integer not null default 8 check (round_count between 3 and 12),
  current_round integer not null default -1,
  plan jsonb not null default '[]'::jsonb check (jsonb_typeof(plan) = 'array'),
  plan_hash text check (plan_hash is null or plan_hash ~ '^[0-9a-f]{64}$'),
  contract_game_id text unique,
  registration_tx_hash text,
  winner_player_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.landmark_game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.landmark_games(id) on delete cascade,
  player_key text not null check (char_length(player_key) between 12 and 100),
  player_hash text not null check (player_hash ~ '^[0-9a-f]{64}$'),
  player_token_hash text not null check (player_token_hash ~ '^[0-9a-f]{64}$'),
  display_name text not null check (char_length(display_name) between 1 and 24),
  is_host boolean not null default false,
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  unique (game_id, player_key),
  unique (game_id, player_hash)
);

alter table public.landmark_games
  add constraint landmark_games_winner_player_id_fkey
  foreign key (winner_player_id) references public.landmark_game_players(id) on delete set null;

create table public.landmark_game_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.landmark_games(id) on delete cascade,
  position integer not null check (position between 0 and 11),
  kind text not null check (kind in ('identify','quiz')),
  challenge_id text not null check (challenge_id ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  status text not null default 'queued' check (status in ('queued','open','submitting','pending','settled','failed')),
  started_at timestamptz,
  ends_at timestamptz,
  transaction_hash text,
  correct_index smallint check (correct_index is null or correct_index between 0 and 3),
  consensus_status text,
  next_check_at timestamptz,
  error_message text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_id, position)
);

create table public.landmark_game_answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.landmark_games(id) on delete cascade,
  round_id uuid not null references public.landmark_game_rounds(id) on delete cascade,
  player_id uuid not null references public.landmark_game_players(id) on delete cascade,
  choice_index smallint not null check (choice_index between 0 and 3),
  elapsed_ms integer not null check (elapsed_ms between 0 and 90000),
  awarded_points integer not null default 0 check (awarded_points >= 0),
  correct boolean,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index landmark_game_players_game_score_idx
  on public.landmark_game_players (game_id, score desc, joined_at);
create index landmark_game_rounds_game_status_idx
  on public.landmark_game_rounds (game_id, status, position);
create index landmark_game_answers_round_idx
  on public.landmark_game_answers (round_id);

alter table public.landmark_games enable row level security;
alter table public.landmark_game_players enable row level security;
alter table public.landmark_game_rounds enable row level security;
alter table public.landmark_game_answers enable row level security;

revoke all on public.landmark_games from anon, authenticated;
revoke all on public.landmark_game_players from anon, authenticated;
revoke all on public.landmark_game_rounds from anon, authenticated;
revoke all on public.landmark_game_answers from anon, authenticated;
grant all on public.landmark_games to service_role;
grant all on public.landmark_game_players to service_role;
grant all on public.landmark_game_rounds to service_role;
grant all on public.landmark_game_answers to service_role;

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
  v_applied boolean := false;
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
  set score = (score.value->>'total_xp')::integer
  from jsonb_array_elements(p_scores) as score(value)
  where player.game_id = v_game_id
    and player.player_hash = score.value->>'player_hash';

  v_applied := true;

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

  return v_applied;
end;
$$;

revoke all on function public.landmark_apply_round_settlement(uuid, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.landmark_apply_round_settlement(uuid, integer, jsonb, text)
  to service_role;
