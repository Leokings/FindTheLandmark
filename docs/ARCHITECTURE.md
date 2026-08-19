# Architecture

- Supabase stores lobby membership, shared rounds, answers, and the per-game board.
- The host starts a twelve-round game for 2–50 players.
- Five image rounds, three atlas quizzes, and four sourced GenLayer Docs quizzes are shared by the full lobby.
- One GenLayer consensus transaction settles all player answers for each round.
- Each image and its SHA-256 hash are committed in the game plan before play starts.
- XP is applied only when that round reaches irreversible `FINALIZED` consensus.
- XP starts at zero in every lobby and never carries into another game.
- The browser cannot submit answer keys, trusted timing, or direct database writes.
- The Vercel route signs backend requests; Supabase rejects unknown signers and replayed nonces.
- Supabase Realtime wakes lobby clients; throttled polling remains as a fallback.
- Completed leaderboards remain available by lobby code from the Results tab.
