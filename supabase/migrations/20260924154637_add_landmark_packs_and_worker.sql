-- New games can choose a question pack. Existing game plans are left intact.
alter table public.landmark_games
  add column pack text not null default 'mixed'
    check (pack in ('mixed', 'landmarks', 'genlayer')),
  add column worker_next_at timestamptz;

create index landmark_games_worker_due_idx
  on public.landmark_games (worker_next_at)
  where status in ('registering', 'running', 'verifying');

-- A private, rotatable bearer token lets pg_cron wake the Edge Function even
-- when every browser disconnects. Only the service role may read its hash.
create table public.landmark_cron_auth (
  id smallint primary key default 1 check (id = 1),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.landmark_cron_auth enable row level security;
revoke all on public.landmark_cron_auth from public, anon, authenticated;
grant select on public.landmark_cron_auth to service_role;

create extension if not exists pg_net with schema extensions;

do $$
declare
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.landmark_cron_auth (token_hash)
  values (encode(extensions.digest(token, 'sha256'), 'hex'));
  perform vault.create_secret(token, 'landmark_tick_token');
end;
$$;

select cron.schedule(
  'landmark-progress',
  '30 seconds',
  $$
    select net.http_post(
      url := 'https://auovgyyatbxdfynbbfth.supabase.co/functions/v1/landmark-api',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-landmark-cron-token',
        (select decrypted_secret from vault.decrypted_secrets where name = 'landmark_tick_token')
      ),
      body := '{"action":"tick"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);
