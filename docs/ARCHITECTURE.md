# Architecture

## Daily route

The site deterministically selects four image rounds, two atlas quizzes, and one photo hunt from the seeded banks each UTC day. Same-origin routes issue signed, short-lived answer tickets and derive a stable anonymous player hash. The browser never supplies a trusted answer key or daily run identifier.

## GenLayer settlement

- **Image pick:** the leader identifies the landmark from a hash-checked canonical image. Validators fetch the same bytes and independently accept or reject the proposed option.
- **Atlas quiz:** the leader answers the onchain question. Validators independently check the proposed factual answer; no answer key is stored in the web app.
- **Photo hunt:** validators inspect the same mirrored image bytes for target match, visibility, real-photo evidence, and safety. The first accepted proof wins that hunt for the daily run.

Every result and XP award requires a non-leader-only validator majority. A timeout, disagreement, or incomplete receipt awards nothing.

## Relay boundary

The public site sends signed requests to the Supabase Edge Function. The function accepts only the configured site signer, contract, relayer, image hosts, and formats. It normalizes image evidence, stores the exact consensus bytes, submits to Studionet, and returns the receipt-backed verdict.
