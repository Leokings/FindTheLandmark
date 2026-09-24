# Architecture

- Supabase stores lobby membership, shared rounds, answers, and the per-game board.
- The host starts a twelve-round game for 2–8 players and chooses World Tour, Landmarks, or GenLayer Lab.
- Everyone in the lobby gets the same image and/or sourced quiz rounds from the chosen pack.
- Each player locks a salted answer commitment with a temporary in-browser GenLayer signer.
- Deterministic commitments and reveals use StudioNet's fast path; only validator consensus can award XP.
- A player can reveal directly if the batch relayer omits their answer, and anyone can finalize an expired round.
- Each image and its SHA-256 hash are committed in the game plan before play starts.
- Quiz validators fetch one record from UNESCO's official World Heritage DataHub API or a pinned GenLayer Docs source.
- Speed XP uses the GenLayer commitment transaction timestamp.
- XP is applied only when that round reaches successful, majority-agreed `FINALIZED` consensus.
- A failed consensus finalization is retried twice, then the round is void for all players with no XP; later rounds and the game result still complete.
- XP starts at zero in every lobby and never carries into another game.
- The browser never submits answer keys, private signer keys, or trusted timing values to the database.
- The Vercel route signs backend requests; Supabase rejects unknown signers and replayed nonces.
- A private Supabase Cron worker advances games every 30 seconds, independent of connected players. Supabase Realtime wakes lobby clients; throttled read-only polling remains as a fallback.
- Completed leaderboards remain available by lobby code from the Results tab.
