# Architecture

- Supabase stores lobby membership, shared rounds, answers, and the per-game board.
- The host starts a twelve-round game for 2–50 players.
- Five image rounds, three atlas quizzes, and four sourced GenLayer Docs quizzes are shared by the full lobby.
- Each player locks a salted answer commitment with a temporary in-browser GenLayer signer.
- Deterministic commitments and reveals use StudioNet's fast path; only validator consensus can award XP.
- A player can reveal directly if the batch relayer omits their answer, and anyone can finalize an expired round.
- Each image and its SHA-256 hash are committed in the game plan before play starts.
- Quiz validators fetch one record from UNESCO's official World Heritage DataHub API or a pinned GenLayer Docs source.
- Speed XP uses the GenLayer commitment transaction timestamp.
- XP is applied only when that round reaches irreversible `FINALIZED` consensus.
- XP starts at zero in every lobby and never carries into another game.
- The browser never submits answer keys, private signer keys, or trusted timing values to the database.
- The Vercel route signs backend requests; Supabase rejects unknown signers and replayed nonces.
- Supabase Realtime wakes lobby clients; throttled polling remains as a fallback.
- Completed leaderboards remain available by lobby code from the Results tab.
