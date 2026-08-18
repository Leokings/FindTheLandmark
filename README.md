# Find the Landmark

A daily geography game with two round types:

- **Quick pick:** identify a landmark from four choices before time runs out.
- **Photo hunt:** find a clear public image of the named landmark. The first consensus-accepted proof wins the XP bounty.

## Run locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
genvm-lint check contracts/LandmarkHunt.py --json
python -m pytest tests/direct -q
```

## GenLayer boundary

Normal application logic handles quiz answers, timers, sessions, and the leaderboard. `contracts/LandmarkHunt.py` handles the subjective image decision and permanently locks the first accepted winner. The current web preview labels its proof flow as local test mode until the contract is deployed and its address is connected.

## Project map

- `app/` — playable web game
- `contracts/LandmarkHunt.py` — GenLayer photo verifier and first-winner state
- `tests/direct/` — direct-mode contract tests
- `public/og.png` — generated social preview artwork
