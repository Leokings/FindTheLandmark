# Find the Landmark

A daily geography race with three GenLayer-settled round types:

- **Quick pick:** identify a landmark from four choices before time runs out.
- **Atlas quiz:** answer a geography question between image rounds.
- **Photo hunt:** find a clear public image of the named landmark. The first consensus-accepted proof wins the XP bounty.

## Run locally

```bash
npm install
npm run dev
```

## Verify locally

```bash
npm test
genvm-lint check contracts/LandmarkHunt.py --json
python -m pytest tests/direct -q
gltest tests/integration/ -v -s --network studionet
```

## GenLayer boundary

The site issues a short-lived signed ticket for each A–D round. GenLayer validators independently audit the proposed landmark or quiz answer; the same contract judges photo hunts and locks the first accepted proof for each daily run. XP is awarded only after a genuine validator-majority result.

## Live release

- App: <https://find-the-landmark.plain3rd.chatgpt.site/>
- Network: GenLayer Studionet (chain ID `61999`)
- Contract: [`0xE192…92F6`](https://explorer-studio.genlayer.com/address/0xE1926EdBeBC1B848b477F86b3B310B8bde9792F6)
- Deployment and seeded-round transaction IDs: `deployments/studionet.json`

## Project map

- `app/` — playable web game
- `contracts/LandmarkHunt.py` — GenLayer quick-pick, quiz, and photo-hunt verifier
- `supabase/functions/landmark-api/` — authenticated server relay and consensus gate
- `tests/direct/` — direct-mode contract tests
- `tests/integration/` — read-only checks against the deployed Studionet contract
- `public/og.png` — generated social preview artwork
