# Find the Landmark

A 12-round multiplayer landmark game for up to 50 players. A host creates a room, everyone gets the same landmark, atlas, and GenLayer Docs rounds, and the highest in-game XP wins.

GenLayer validators settle each shared round. A round awards XP only after its consensus transaction is `FINALIZED`; scores exist only inside that game.

## Run

```bash
npm install
npm run dev
```

Set `LANDMARK_SITE_SIGNING_KEY` in the server environment before using lobby actions. Set the public Supabase URL and publishable key to enable Realtime lobby updates.

## Verify

```bash
npm test
genvm-lint check contracts/LandmarkLobby.py --json
python -m pytest tests/direct -q
gltest tests/integration/ -v -s --network studionet
```

The Results tab opens the final leaderboard for any completed game code.

- [Live app](https://find-the-landmark.vercel.app/)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0x198b1027F8eF524BEC3DA10a021b728FD071D7DB)
- Deployment record: `deployments/studionet.json`
