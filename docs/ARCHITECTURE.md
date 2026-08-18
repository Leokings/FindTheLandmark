# Architecture

## Application layer

The web/backend layer owns deterministic work: the A–D answer key, countdowns, daily round selection, login, scores, and indexed leaderboard views.

## GenLayer layer

The intelligent contract owns only the decision that needs independent judgment:

1. The relayer creates a photo-hunt round with a landmark and visible-proof rule.
2. A submission carries a stable player hash, public HTTPS image URL, and SHA-256 digest.
3. Validators fetch the same bytes, verify the digest, and independently judge landmark match, visibility, photographic evidence, and safety.
4. A passing consensus records the winner. Once set, later submissions cannot replace it.

This makes the race deterministic at settlement while keeping image interpretation consensus-backed.
