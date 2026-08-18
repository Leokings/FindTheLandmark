# Architecture

- Supabase stores lobby membership, shared rounds, answers, and the per-game board.
- The host starts an eight-round game for up to 50 players.
- Five image rounds and three atlas quizzes are shared by the full lobby.
- One GenLayer consensus transaction settles all player answers for each round.
- XP starts at zero in every lobby and never carries into another game.
- The browser cannot submit answer keys, trusted timing, or direct database writes.
- The Vercel route signs backend requests; Supabase rejects unknown signers and replayed nonces.
