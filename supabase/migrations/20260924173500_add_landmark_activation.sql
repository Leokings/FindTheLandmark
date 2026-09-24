alter table public.landmark_games
  add column if not exists activation_tx_hash text;

alter table public.landmark_games
  add constraint landmark_games_activation_tx_hash_format
  check (activation_tx_hash is null or activation_tx_hash ~ '^(0x)?[0-9A-Fa-f]{64}$');
