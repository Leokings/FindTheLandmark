-- A signed answer can be queued for the batch reveal before its StudioNet
-- commitment reaches finalized storage. Only confirmed/onchain-scored answers
-- are shown as received or awarded XP.
alter table public.landmark_game_answers
  add column commit_verified_at timestamptz;

-- All rows written by earlier versions passed the commitment check first.
update public.landmark_game_answers
  set commit_verified_at = submitted_at
  where commitment is not null;
