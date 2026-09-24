import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createGameSigner, commitSignedAnswer } from "../../lib/genlayer-session.ts";

const baseUrl = (process.argv[2] ?? "https://find-the-landmark.vercel.app").replace(/\/$/, "");
const runId = `${Date.now().toString(36)}${randomUUID().replaceAll("-", "").slice(0, 6)}`;
const timings = new Map();
const signedPlayers = new Set();
let transientStateFailures = 0;
let transientJoinFailures = 0;
const PLAYER_COUNT = Number(process.env.LOAD_PLAYERS ?? 8);
if (!Number.isInteger(PLAYER_COUNT) || PLAYER_COUNT < 2 || PLAYER_COUNT > 50) {
  throw new Error("LOAD_PLAYERS must be an integer from 2 to 50.");
}
// Limit the submission burst without reducing how many players answer each round.
const SIGNED_WRITE_BATCH_SIZE = 8;
const ACTIVE_PLAYERS_PER_ROUND = PLAYER_COUNT;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

async function gameRequest(body, expectedStatuses = [200, 201]) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const elapsed = Math.round(performance.now() - startedAt);
  const values = timings.get(body.action) ?? [];
  values.push(elapsed);
  timings.set(body.action, values);
  const data = await response.json().catch(() => ({ error: "Invalid JSON response." }));
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${body.action} returned ${response.status}: ${data.error ?? JSON.stringify(data)}`);
  }
  return { data, elapsed, status: response.status };
}

async function confirmedAnswer(body) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      return await gameRequest(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /^answer returned 503: Answer is still confirming onchain\./.test(message)
        || /^answer returned 50[234]:/.test(message)
        || /fetch failed|timed out/i.test(message);
      if (!retryable || attempt === 24) throw error;
      await sleep(4_000);
    }
  }
  throw new Error("Answer could not be confirmed.");
}

async function joinedPlayer(body) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await gameRequest(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /^join returned 50[234]:/.test(message) || /fetch failed|timed out/i.test(message);
      if (!retryable || attempt === 7) throw error;
      transientJoinFailures += 1;
      await sleep(1_000 * Math.min(8, attempt + 1));
    }
  }
  throw new Error("Player could not join.");
}

async function inBatches(items, batchSize, task) {
  const output = [];
  for (let offset = 0; offset < items.length; offset += batchSize) {
    output.push(...await Promise.all(items.slice(offset, offset + batchSize).map(task)));
  }
  return output;
}

async function waitForState(session, predicate, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = (await gameRequest({ action: "state", ...session })).data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/^state returned 50[234]:/.test(message)) throw error;
      transientStateFailures += 1;
      await sleep(3_000);
      continue;
    }
    if (latest.status === "error") throw new Error(`${label}: ${latest.error ?? "game entered error state"}`);
    if (predicate(latest)) return latest;
    if (label === "game registration" && latest.status === "running" && latest.currentRound?.position > 0) {
      throw new Error(`Missed the opening round while reading game state; now at round ${latest.currentRound.position + 1}.`);
    }
    const expectedRound = /^round (\d+)$/.exec(label);
    if (expectedRound && latest.status === "running" && latest.currentRound?.position > Number(expectedRound[1]) - 1) {
      throw new Error(`Missed ${label} while reading game state; now at round ${latest.currentRound.position + 1}.`);
    }
    await sleep(3_000);
  }
  throw new Error(`${label} timed out; last state: ${JSON.stringify(latest)}`);
}

const hostPlayerId = `load_${runId}_00`;
const hostSigner = createGameSigner();
const hostToken = randomBytes(32).toString("hex");
const created = await gameRequest({
  action: "create",
  playerId: hostPlayerId,
  playerToken: hostToken,
  displayName: "Load 00",
  signerAddress: hostSigner.address,
});
const code = created.data.code;
console.log(`${PLAYER_COUNT}-player test room: ${code}`);
const repeatedCreate = await gameRequest({
  action: "create",
  playerId: hostPlayerId,
  playerToken: hostToken,
  displayName: "Load 00",
  signerAddress: hostSigner.address,
});
if (repeatedCreate.data.code !== code || repeatedCreate.data.playerToken !== hostToken) {
  throw new Error("Retrying the host admission created a different lobby or session.");
}
const hostSession = {
  code,
  playerId: hostPlayerId,
  playerToken: created.data.playerToken,
};
const host = { session: hostSession, signer: hostSigner };
const players = [host];
const pendingConfirmations = [];

const joinNumbers = Array.from({ length: PLAYER_COUNT - 1 }, (_, index) => index + 1);
const joined = await inBatches(joinNumbers, 5, async (index) => {
  const playerId = `load_${runId}_${String(index).padStart(2, "0")}`;
  const signer = createGameSigner();
  const playerToken = randomBytes(32).toString("hex");
  const response = await joinedPlayer({
    action: "join",
    code,
    playerId,
    playerToken,
    displayName: `Load ${String(index).padStart(2, "0")}`,
    signerAddress: signer.address,
  });
  return { session: { code, playerId, playerToken: response.data.playerToken }, signer };
});
players.push(...joined);

const repeatedJoin = await joinedPlayer({
  action: "join",
  code,
  playerId: joined[0].session.playerId,
  playerToken: joined[0].session.playerToken,
  displayName: "Load 01",
  signerAddress: joined[0].signer.address,
});
if (repeatedJoin.data.playerToken !== joined[0].session.playerToken) {
  throw new Error("Retrying admission changed a player's session token.");
}
const hijack = await gameRequest({
  action: "join",
  code,
  playerId: joined[0].session.playerId,
  playerToken: randomBytes(32).toString("hex"),
  displayName: "Load 01",
  signerAddress: joined[0].signer.address,
}, [409]);
if (!/already joined/i.test(hijack.data.error ?? "")) {
  throw new Error("A different token replaced an admitted player's session.");
}

const overflow = await gameRequest({
  action: "join",
  code,
  playerId: `load_${runId}_overflow`,
  playerToken: randomBytes(32).toString("hex"),
  displayName: "Overflow",
  signerAddress: createGameSigner().address,
}, [409]);
if (!/full/i.test(overflow.data.error ?? "")) {
  throw new Error(`Player ${PLAYER_COUNT + 1} was not rejected as full: ${JSON.stringify(overflow.data)}`);
}

await gameRequest({ action: "start", ...host.session });
let state = await waitForState(
  host.session,
  (value) => value.status === "running" && value.currentRound?.position === 0,
  "game registration",
  420_000,
);

for (let position = 0; position < 12; position += 1) {
  if (state.currentRound?.position !== position) {
    state = await waitForState(
      host.session,
      (value) => value.status === "running" && value.currentRound?.position === position,
      `round ${position + 1}`,
      180_000,
    );
  }
  const activePlayers = Array.from({ length: ACTIVE_PLAYERS_PER_ROUND }, (_, offset) => {
    const playerIndex = (position * ACTIVE_PLAYERS_PER_ROUND + offset) % players.length;
    return { player: players[playerIndex], playerIndex };
  });
  const confirmationTasks = [];
  const commitPhaseStartedAt = performance.now();
  for (let offset = 0; offset < activePlayers.length; offset += SIGNED_WRITE_BATCH_SIZE) {
    const batch = activePlayers.slice(offset, offset + SIGNED_WRITE_BATCH_SIZE);
    const signedAnswers = await Promise.all(batch.map(async ({ player, playerIndex }) => {
      const choiceIndex = (position + playerIndex) % 4;
      const proof = await commitSignedAnswer({
        signer: player.signer,
        contractAddress: state.contractAddress,
        contractGameId: state.contractGameId,
        roundIndex: position,
        choiceIndex,
      });
      return { player, choiceIndex, proof };
    }));
    for (const { player, choiceIndex, proof } of signedAnswers) {
      signedPlayers.add(player.signer.address.toLowerCase());
      confirmationTasks.push(confirmedAnswer({
        action: "answer",
        ...player.session,
        roundIndex: position,
        choiceIndex,
        commitment: proof.commitment,
        revealSalt: proof.salt,
        commitTransactionHash: String(proof.commitTxHash),
      }));
    }
  }
  const confirmations = Promise.all(confirmationTasks).then(
    (results) => ({ position, results, error: null }),
    (error) => ({ position, results: null, error }),
  );
  pendingConfirmations.push(confirmations);
  console.log(`round ${position + 1}/12: ${confirmationTasks.length}/${PLAYER_COUNT} signed commitments sent in ${Math.round(performance.now() - commitPhaseStartedAt)}ms`);
  const endsAt = Date.parse(state.currentRound.endsAt);
  await sleep(Math.max(0, endsAt - Date.now() + 250));
  state = await waitForState(
    host.session,
    (value) => value.status === "verifying"
      || value.status === "finished"
      || (value.status === "running" && value.currentRound?.position === position + 1),
    `round ${position + 1} submission`,
    180_000,
  );
}

const confirmedRounds = await Promise.all(pendingConfirmations);
for (const confirmation of confirmedRounds) {
  if (confirmation.error) throw new Error(`round ${confirmation.position + 1} answer confirmation failed: ${confirmation.error}`);
  if (confirmation.results?.some(({ data }) => data.accepted !== true)) {
    throw new Error(`round ${confirmation.position + 1} did not confirm every signed answer`);
  }
}

state = await waitForState(
  host.session,
  (value) => value.status === "finished",
  "finalized settlements",
  900_000,
);
const results = (await gameRequest({ action: "results", code })).data;
if (results.status !== "finished" || results.leaderboard?.length !== PLAYER_COUNT) {
  throw new Error(`results lookup failed: ${JSON.stringify(results)}`);
}
if (results.settledRounds < 1 || results.settledRounds + results.voidRounds !== 12 || results.pendingRounds !== 0) {
  throw new Error(`not every round resolved: ${JSON.stringify({ settledRounds: results.settledRounds, voidRounds: results.voidRounds, pendingRounds: results.pendingRounds })}`);
}
if (PLAYER_COUNT === 50 && (results.settledRounds !== 12 || results.voidRounds !== 0)) {
  throw new Error(`Fifty-player match did not settle all rounds: ${results.settledRounds} settled, ${results.voidRounds} void`);
}
if (results.roundRecap?.length !== 12) throw new Error("round recap is incomplete");
if (!results.leaderboard.some((entry) => entry.score > 0)) {
  throw new Error("finalized game awarded no XP despite confirmed signed answers");
}
if (signedPlayers.size !== PLAYER_COUNT) {
  throw new Error(`not every player signed an answer: ${signedPlayers.size}/${PLAYER_COUNT}`);
}
if (PLAYER_COUNT === 50) {
  const [{ createClient }, { studionet }] = await Promise.all([
    import("genlayer-js"),
    import("genlayer-js/chains"),
  ]);
  const chain = createClient({ chain: studionet, endpoint: "https://studio.genlayer.com/api" });
  for (let position = 0; position < 12; position += 1) {
    const result = await chain.readContract({
      address: state.contractAddress,
      functionName: "get_round_result",
      args: [state.contractGameId, position],
      stateStatus: "finalized",
    });
    if (result.scores?.length !== PLAYER_COUNT) {
      throw new Error(`round ${position + 1} finalized with only ${result.scores?.length ?? 0}/${PLAYER_COUNT} player scores`);
    }
  }
}

const timingSummary = Object.fromEntries([...timings].map(([action, values]) => [action, {
  count: values.length,
  p50Ms: percentile(values, 0.5),
  p95Ms: percentile(values, 0.95),
  maxMs: Math.max(...values),
}]));

console.log(JSON.stringify({
  baseUrl,
  code,
  players: results.leaderboard.length,
  rounds: results.roundCount,
  settledRounds: results.settledRounds,
  voidRounds: results.voidRounds,
  pendingRounds: results.pendingRounds,
  winner: results.winner,
  overflowRejected: true,
  signedPlayersExercised: signedPlayers.size,
  answersPerRound: ACTIVE_PLAYERS_PER_ROUND,
  resultsLookup: true,
  transientStateFailures,
  transientJoinFailures,
  timings: timingSummary,
}, null, 2));
