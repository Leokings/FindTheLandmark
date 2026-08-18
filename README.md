# Find the Landmark

A multiplayer landmark game for up to 50 players. A host creates a room, everyone gets the same image and quiz rounds, and the highest in-game XP wins.

GenLayer validators settle each shared round. Scores exist only inside that game.

## Run

```bash
npm install
npm run dev
```

Set `LANDMARK_SITE_SIGNING_KEY` in the server environment before using lobby actions.

## Verify

```bash
npm test
genvm-lint check contracts/LandmarkLobby.py --json
python -m pytest tests/direct -q
gltest tests/integration/ -v -s --network studionet
```

- [Live app](https://find-the-landmark.vercel.app/)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0xa9778Ef1607CCcA9Da3Dce8da9fC6a39523598ee)
- Deployment record: `deployments/studionet.json`
