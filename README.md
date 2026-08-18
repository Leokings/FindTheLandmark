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

The site issues a signed 20-second ticket for each A–D round, then GenLayer validators independently inspect the landmark image and settle the answer. The same contract judges photo hunts and permanently locks the first consensus-accepted winner. XP is awarded only after a genuine validator-majority result.

## Live release

- App: <https://find-the-landmark.plain3rd.chatgpt.site/>
- Network: GenLayer Studionet (chain ID `61999`)
- Contract: [`0xC3fD…5Aa8C`](https://explorer-studio.genlayer.com/address/0xC3fD27d653D3298833836d239f014f184d85Aa8C)
- Deployment and seeded-round transaction IDs: `deployments/studionet.json`

## Project map

- `app/` — playable web game
- `contracts/LandmarkHunt.py` — GenLayer quick-pick and photo-hunt verifier
- `supabase/functions/landmark-api/` — authenticated server relay and consensus gate
- `tests/direct/` — direct-mode contract tests
- `tests/integration/` — read-only checks against the deployed Studionet contract
- `public/og.png` — generated social preview artwork
