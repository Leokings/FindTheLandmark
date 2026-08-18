# Find the Landmark

A fast geography race with two round types:

- **Quick pick:** identify a landmark from four choices before time runs out.
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

The app handles deterministic A–D answers, timers, and the local run score. The deployed `contracts/LandmarkHunt.py` handles the subjective image decision and permanently locks the first consensus-accepted winner. XP for a photo hunt is awarded only after a genuine validator-majority result; leader-only fallback is not accepted.

## Live release

- App: <https://find-the-landmark.plain3rd.chatgpt.site/>
- Network: GenLayer Studionet (chain ID `61999`)
- Contract: [`0xE14e…42b7a`](https://explorer-studio.genlayer.com/address/0xE14e50069F700F4C72ca9d59c1eb950b04342b7a)
- Deployment and seeded-hunt transaction IDs: `deployments/studionet.json`

## Project map

- `app/` — playable web game
- `contracts/LandmarkHunt.py` — GenLayer photo verifier and first-winner state
- `supabase/functions/landmark-api/` — authenticated server relay and consensus gate
- `tests/direct/` — direct-mode contract tests
- `tests/integration/` — read-only checks against the deployed Studionet contract
- `public/og.png` — generated social preview artwork
