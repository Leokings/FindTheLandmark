create table public.landmark_request_nonces (
  nonce uuid primary key,
  received_at timestamptz not null default now()
);

create index landmark_request_nonces_received_idx
  on public.landmark_request_nonces (received_at);

alter table public.landmark_request_nonces enable row level security;

revoke all on public.landmark_request_nonces from public, anon, authenticated;
grant select, insert, delete on public.landmark_request_nonces to service_role;
