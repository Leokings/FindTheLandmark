create extension if not exists pg_cron with schema pg_catalog;

create unique index landmark_game_players_game_name_idx
  on public.landmark_game_players (game_id, lower(display_name));

create table public.landmark_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now()
);

create index landmark_rate_limits_updated_idx
  on public.landmark_rate_limits (updated_at);

alter table public.landmark_rate_limits enable row level security;
revoke all on public.landmark_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.landmark_rate_limits to service_role;

create or replace function public.landmark_take_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit policy';
  end if;

  insert into public.landmark_rate_limits (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_key_hash,
    now(),
    1,
    now()
  )
  on conflict (key_hash) do update
  set request_count = case
        when public.landmark_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then 1
        else public.landmark_rate_limits.request_count + 1
      end,
      window_started_at = case
        when public.landmark_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then now()
        else public.landmark_rate_limits.window_started_at
      end,
      updated_at = now()
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.landmark_take_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.landmark_take_rate_limit(text, integer, integer)
  to service_role;

create table public.landmark_game_events (
  game_id uuid primary key references public.landmark_games(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.landmark_game_events enable row level security;
revoke all on public.landmark_game_events from public, anon, authenticated;
grant select on public.landmark_game_events to anon, authenticated;
grant all on public.landmark_game_events to service_role;

create policy "Anyone can watch a known landmark game"
on public.landmark_game_events
for select
to anon, authenticated
using (true);

create or replace function public.landmark_create_game_event()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  insert into public.landmark_game_events (game_id)
  values (new.id)
  on conflict (game_id) do nothing;
  return new;
end;
$$;

revoke all on function public.landmark_create_game_event()
  from public, anon, authenticated;
grant execute on function public.landmark_create_game_event() to service_role;

create or replace function public.landmark_bump_game_event()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_game_id uuid;
begin
  if tg_table_name = 'landmark_games' then
    v_game_id := new.id;
  elsif tg_op = 'DELETE' then
    v_game_id := old.game_id;
  else
    v_game_id := new.game_id;
  end if;

  insert into public.landmark_game_events (game_id, version, updated_at)
  values (v_game_id, 1, now())
  on conflict (game_id) do update
  set version = public.landmark_game_events.version + 1,
      updated_at = now();
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.landmark_bump_game_event()
  from public, anon, authenticated;
grant execute on function public.landmark_bump_game_event() to service_role;

create trigger landmark_games_create_event
after insert on public.landmark_games
for each row execute function public.landmark_create_game_event();

create trigger landmark_games_bump_event
after update on public.landmark_games
for each row execute function public.landmark_bump_game_event();

create trigger landmark_game_players_bump_event
after insert or update or delete on public.landmark_game_players
for each row execute function public.landmark_bump_game_event();

create trigger landmark_game_rounds_bump_event
after insert or update or delete on public.landmark_game_rounds
for each row execute function public.landmark_bump_game_event();

insert into public.landmark_game_events (game_id, version, updated_at)
select id, 1, updated_at from public.landmark_games
on conflict (game_id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'landmark_game_events'
  ) then
    alter publication supabase_realtime add table public.landmark_game_events;
  end if;
end;
$$;

create or replace function public.landmark_cleanup_operational_rows()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  delete from public.landmark_request_nonces
  where received_at < now() - interval '20 minutes';

  delete from public.landmark_rate_limits
  where updated_at < now() - interval '1 hour';

  update public.landmark_games
  set status = 'error',
      error_message = 'Game expired.',
      updated_at = now()
  where status in ('registering', 'running', 'verifying')
    and updated_at < now() - interval '6 hours';

  delete from public.landmark_games
  where (
    status = 'waiting' and updated_at < now() - interval '1 day'
  ) or (
    status = 'error' and updated_at < now() - interval '7 days'
  );
end;
$$;

revoke all on function public.landmark_cleanup_operational_rows()
  from public, anon, authenticated;
grant execute on function public.landmark_cleanup_operational_rows()
  to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'landmark-maintenance';

select cron.schedule(
  'landmark-maintenance',
  '*/10 * * * *',
  $$select public.landmark_cleanup_operational_rows();$$
);
