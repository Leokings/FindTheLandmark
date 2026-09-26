# Production test evidence

## Current release: 30-seat paced lobby

- Date: 2026-09-24
- [Live app](https://find-the-landmark.vercel.app/)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0xCbE0103e51B33E665C3CdDa9dE1B6187ac941841) (`find-the-landmark.lobby-game.v4.6`)
- New rooms have 30 seats, 90-second answer windows, and 90-second intermissions. Existing rooms keep their original cap and contract address.
- 2026-09-26 [completed 30-player match `WMSESY`](https://find-the-landmark.vercel.app/?results=WMSESY): all 30 players sent and confirmed signed commitments in all 12 rounds. Eleven rounds settled; round 11 was void after three `MAJORITY_DISAGREE` validator attempts. Each settled round recorded 30 onchain scores.
- The finished app and finalized onchain leaderboards each contain 30 players and 9,248 total XP. Winner: Load 01 with 555 XP. Near round 10, StudioNet briefly returned its 30-requests-per-minute limit; all 30 commitments eventually landed, but that burst took 79 seconds of the 90-second window.
- Room `MW2L4C`: create/join retries preserved the same sessions; duplicate concurrent joins did not add a player; a different token could not take over the guest session.
- Room `R9PALQ`: 30 players joined and all 30 submitted signed commitments in each of the first three rounds. The cumulative load runs then hit StudioNet's shared `500 requests per hour` limit; this is **not** a completed 30-player match. The synthetic room was stopped.
- Room `JJPA27`: 30 players sent signed commitments in each of the first five rounds. The long live test was stopped at the owner's request; this is **not** a completed match.
- The earlier 30-player room `VEF23R` reached six 30-answer rounds before StudioNet reported 51 pending transactions against its per-contract limit of 50. The longer intermission in v4.6 avoided this failure in `WMSESY`.
- Fast direct-mode simulation: 30 players completed all 12 contract rounds (360 commitments, 12 batch reveals and finalizations). All 30 finished with 1,644 XP. This uses simulated time and mocked image validation, so it does **not** test StudioNet throughput or validator consensus.
- Build, lint, contract lint, 16 direct contract tests, the StudioNet deployment policy test, and 24 app tests pass. A 30-active-player StudioNet match is verified, but a clean 12/12 round settlement is **not**: one factual quiz round voided.

## Previous release: 50-seat lobby

- Date: 2026-09-24
- [Live app](https://find-the-landmark.vercel.app/)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0x219f4011bB42BEf4BEbb5aF46dfe69F7bE2eDd5c) (`find-the-landmark.lobby-game.v4.4`)
- Room `Q6582Y`: 50 distinct signed-player sessions admitted; player 51 was rejected as full.
- The one-machine 50-answer load run could not complete: StudioNet rejected `eth_sendRawTransaction` with `Rate limit exceeded: 30 requests per minute`. This is **not** evidence that 50 separate devices can or cannot finish a match.
- Room `HGB3UP`: 30 players were admitted and all 30 sent signed commitments in round one (11.2 seconds). The same test machine hit StudioNet's rolling 30-request/minute limit at the start of round two. Both interrupted synthetic rooms were marked as failed so the cron worker would stop processing them.
- Room `96VW37`: retrying create/join preserved the same room and player token, concurrent duplicate joins did not add a second player, and a different token could not take over the session.
- Browser-created room `QDD66P` remained in `waiting` for 17 minutes 51 seconds with no host start, confirming there is no 25-second lobby join window. The synthetic waiting rooms were then closed.
- Build, lint, contract lint, direct contract tests, and StudioNet deployment policy test passed. A completed 50-active-player match is **not yet verified**.

## Completed eight-player match, twelve rounds

- Date: 2026-09-24
- [Completed match and round-by-round sources](https://find-the-landmark.vercel.app/?results=K82K7A)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0x677388E350bef8FdfD41f8F8Dc13c558175f3C7F) (`find-the-landmark.lobby-game.v4.3`)
- Contract deployment: `0xea597c0cbec5e4fba3a5bfbb55218ab2d7537551b2baf8e54f38a2f0902aafa3` (`FINALIZED`, `MAJORITY_AGREE`)
- Game code: `K82K7A`; registration: `0x85ed2ebd4a3e1c666f667bd8bb41044dda26d2918a31c1be29530134ee9e5b53`; activation: `0x7fad3b311198fca3ffc021b179543055cb00faf562646bd1a084d42f6d0340cd`
- Eight players signed and saved answers in every round: **96/96**. A ninth player was rejected as full.
- All **12/12** rounds settled after finalized validator consensus; zero void or pending rounds.
- Final results reopen by room code: eight leaderboard rows, twelve recaps, and twelve source/photo-credit links.
- Total XP: **2,554** in both the app database and finalized contract leaderboard. Winner: Load 06 with **489 XP** in both.
- Production API response p95: state **8.2 s**, answer **8.5 s**. The runner retries transient 502–504 responses; the full test completed without a failed answer confirmation.

| Round | Finalization transaction |
|---:|---|
| 1 | `0x5462af1c456767d8ff92f9602842ced256423072985db7d0414265d0c5b03b17` |
| 2 | `0x084d1f257aa5da25b7c1e4bae50fb8076b6097d3803edbca3f90c2e3bfb9cc4f` |
| 3 | `0x73d8510119d6d889d94323468d38a785f46e3cd91bb9a48b4d19332cb29e3291` |
| 4 | `0x036ac4e83512e161da2d97d2fa34a5c8aea413bf4932b5fa4e89cb87a6371251` |
| 5 | `0xc763324ecbcf0ff0da14e55712fef49fb008607d4a4bb1ef8ee2f9e7bce027e7` |
| 6 | `0xa7ffb1487d72910f1461d6bc3bded0d75be718b436caed6f0ae89c03c5c3f278` |
| 7 | `0xa10a228f63bba3fbe2e65ab1a20ed28c0b3d0ccdb6f3f354333f190c55e31667` |
| 8 | `0x64e62907e36fc15d30cd729eca2a229d88c7c2f6ac701c40df8d5852ae1b7873` |
| 9 | `0xe498ad84c61f88a1a929f3cc936facdfe15cd3a43e6552cc1cfea8457fd1a7e6` |
| 10 | `0x1adf3ce78892bae634314c6dac766bde1512d6e9afdc5de160d3da29f68eeee1` |
| 11 | `0x9478e0fde599dc37504fde5847f1b4aad3229e85a066f7c4a6afa9ef86f99f3d` |
| 12 | `0x10dbbc0a3a20916b7f42cf456dbb7f360e9ee1611ab3861ef0449b9b820d7712` |

## Historical roster test

The following is historical evidence of a 50-person roster, **not** 50 simultaneous answerers. Only eight players answered per round. Current lobbies have 30 seats; full-participation capacity still needs a completed test.

- Date: 2026-08-21
- App: https://find-the-landmark.vercel.app/
- StudioNet contract: `0x0c8e2c3a10003654F76C9736391fa245F120672d`
- Deployment transaction: `0x3f2b3f882169f43399c2a04cf8f6990645388c59b386da4b1957f20103d4b354` (`FINALIZED`, `MAJORITY_AGREE`)
- Game code: `WN2JHJ`
- Players: 50; player 51 rejected
- Rounds: 12 settled, 0 pending
- Signed commitments: 96 across all 50 player signers
- Settlement: all 12 transactions were non-leader-only, `FINALIZED`, `MAJORITY_AGREE`, and `SUCCESS` with 3/5 validator votes agreeing
- Ended-game lookup: 50 leaderboard rows returned by code
- Sources per game: 5 hash-bound images, 3 official UNESCO DataHub records, and 4 commit-and-hash-pinned GenLayer Docs pages

Registration transaction: `0x34671f9caebf1cbf784ef50f51b08c5dce7f6d4fd7a0cd85812c3647576d44b9`

## Timestamp speed XP

The contract records `committed_at_ms` from the signed GenLayer transaction timestamp and derives `elapsed_ms` from the onchain round start. In this run:

- 96/96 XP awards matched the contract's base-plus-speed formula.
- Recorded elapsed times ranged from 4,969 ms to 13,825 ms with 94 distinct values.
- Sample: onchain commit `1,787,314,854,500`, round start `1,787,314,849,523`, elapsed `4,977` ms, award `137` XP.

## Settlement transactions

| Round | Transaction | Status |
|---:|---|---|
| 1 | `0x36122eb0e05bcf8cd9917d31c8c756433ef175b9ce81546467c52d1ef323b64b` | `FINALIZED` |
| 2 | `0xa83a2a236543e33fec77a426360888c0589ed904631e61082583719d8a250c89` | `FINALIZED` |
| 3 | `0xf0e6b686fa96ed623c1fee7bf8e800e527d862ee206cca21b9ba9937fcbea27f` | `FINALIZED` |
| 4 | `0x44d6165000f3d8e39aaf49f9701d02cf48ca5b18a417262cfd44de061cf81955` | `FINALIZED` |
| 5 | `0x211c89686e3aa1af242f8cf8bc7aee26f15811769e241a085cf63f3b37a82def` | `FINALIZED` |
| 6 | `0xf8133bb47bfd4faf201ff515c122137ab92f7945ec802f8c453ffa371fbd1642` | `FINALIZED` |
| 7 | `0x6b69b0d4e4a2cabcd400115130e3c828c836b324821a89ffcbe0ffa2421eedef` | `FINALIZED` |
| 8 | `0x9f72c69756b403383868881ed9e0239d67107a6ee6c4a1088bb31b0f7e0230dd` | `FINALIZED` |
| 9 | `0x66af665a3723c30a3f9dd27d1f935cb153c5d760ae4c835d317a7d4dfcc84aad` | `FINALIZED` |
| 10 | `0x8734254eb51b034c64bb482cfbc5da488875a2bbcd930e5b20f2a8b6be65f690` | `FINALIZED` |
| 11 | `0xd252e87fc7c78c0a9be9b2c2894bf1677d8960199f6680449b697b64f8f321f7` | `FINALIZED` |
| 12 | `0x9f2f013936c0ecbd65878da9c10d3638bf06bdf969cff48f18e56b276e2763da` | `FINALIZED` |
