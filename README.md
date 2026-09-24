# Find the Landmark

A 12-round multiplayer landmark game for up to 8 players. A host picks World Tour, Landmarks, or GenLayer Lab; everyone gets the same rounds, and the highest in-game XP wins. There is no global XP.

GenLayer validators settle each shared round. A round awards XP only after its consensus transaction is `FINALIZED`; scores exist only inside that game. Players sign their own answer commitments. A Supabase Cron worker advances verification every 30 seconds even if nobody has the app open.

The lobby offers a copyable invite link. After a match, the room code or shareable results link opens the leaderboard and a round-by-round recap with correct answers and source links. Answer-bearing sources and original image filenames are hidden while a round is live.

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

The Results tab opens the final leaderboard for any completed game code. New lobbies are capped at 8 because the existing production test exercised 8 simultaneous signed answerers per round; the older 50-person roster result is retained as historical evidence, not a claim of 50-active capacity.

- [Live app](https://find-the-landmark.vercel.app/)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0x0c8e2c3a10003654F76C9736391fa245F120672d)
- Deployment record: `deployments/studionet.json`
- Production test: `docs/TEST-EVIDENCE.md`
