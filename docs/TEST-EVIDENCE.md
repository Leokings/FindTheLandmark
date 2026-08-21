# Production test evidence

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
