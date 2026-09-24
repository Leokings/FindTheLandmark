# Find the Landmark

A 12-round multiplayer landmark game for up to 30 players. A host picks World Tour, Landmarks, or GenLayer Lab; everyone gets the same rounds, and the highest in-game XP wins. There is no global XP.

GenLayer validators settle each shared round. A round awards XP only after successful, majority-agreed `FINALIZED` consensus; scores exist only inside that game. Players sign their own answer commitments. A Supabase Cron worker advances verification every 30 seconds even if nobody has the app open. If validators cannot agree after three attempts, the round is void with no XP and the rest of the game continues.

The lobby offers a copyable invite link. After a match, the room code or shareable results link opens the leaderboard and a round-by-round recap with correct answers and source links. Answer-bearing sources and original image filenames are hidden while a round is live.

New games activate only after their board is finalized on StudioNet. A three-minute activation buffer, 90-second answer windows, and 90-second intermissions give signed submissions time to land without overflowing StudioNet's per-contract pending-transaction queue. The app checks each player's exact commitment and onchain timestamp in finalized contract state before calling the answer received; older matches use finalized transaction receipts. A pending answer keeps syncing automatically, including after the next round opens.

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

The Results tab opens the final leaderboard for any completed game code. New lobbies allow up to 30 players; earlier rooms keep their original cap. Full-participation load evidence is tracked in `docs/TEST-EVIDENCE.md`.

- [Live app](https://find-the-landmark.vercel.app/)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0xCbE0103e51B33E665C3CdDa9dE1B6187ac941841)
- Deployment record: `deployments/studionet.json`
- Production test: `docs/TEST-EVIDENCE.md`
