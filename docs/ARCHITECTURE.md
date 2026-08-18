# Architecture

## Application layer

The web layer owns deterministic work: the A–D answer key, countdowns, round order, and local run score.

Photo-hunt submissions follow a narrow server path:

1. The browser sends a supported public image URL to the same-origin Sites route.
2. The route validates and rate-limits the request, creates the player hash and submission ID, then signs the exact payload.
3. The Supabase Edge Function verifies that signature, downloads the image once, normalizes it to a standard sRGB JPEG, and mirrors the exact bytes to a public evidence bucket so every validator sees a stable copy.
4. The function hashes that mirrored copy and submits its URL and digest through the configured GenLayer relayer.
5. The function awards no result unless the receipt proves a successful, non-leader-only validator majority.

Quick-pick answers use the same trust boundary:

1. The same-origin route issues a short-lived, server-signed ticket when a round opens.
2. A player locks one option before that ticket expires; the browser never sends a trusted answer key.
3. The relay normalizes and mirrors the fixed landmark image, then submits the choice to GenLayer.
4. Independent vision validators identify which of the four onchain options matches the image.
5. The contract records correct or incorrect and awards the round's XP only after genuine consensus.

## GenLayer layer

The intelligent contract owns only the decision that needs independent judgment:

1. The admin creates a photo-hunt round with a landmark and visible-proof rule.
2. A submission carries a stable player hash, public HTTPS image URL, and SHA-256 digest.
3. Validators fetch the same bytes, verify the digest, and independently judge landmark match, visibility, photographic evidence, and safety.
4. A passing consensus records the winner. Once set, later submissions cannot replace it.

This makes the race deterministic at settlement while keeping image interpretation consensus-backed.

The app route never receives the GenLayer relayer key. The Edge Function accepts only signed requests from the live site, uses a fixed contract and relayer, restricts evidence hosts and formats, and rejects validator timeout, disagreement, leader-only execution, or incomplete receipts.
