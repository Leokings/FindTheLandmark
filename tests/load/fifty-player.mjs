import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createGameSigner, commitSignedAnswer } from "../../lib/genlayer-session.ts";

const baseUrl = (process.argv[2] ?? "https://find-the-landmark.vercel.app").replace(/\/$/, "");
const runId = `${Date.now().toString(36)}${randomUUID().replaceAll("-", "").slice(0, 6)}`;
const timings = new Map();
const signedPlayers = new Set();
// Three round-boundary bursts can overlap inside StudioNet's rolling minute.
// Eight writes per round stays below its 30 write/minute public-RPC bucket.
const ACTIVE_PLAYERS_PER_ROUND = 8;

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
    latest = (await gameRequest({ action: "state", ...session })).data;
    if (latest.status === "error") throw new Error(`${label}: ${latest.error ?? "game entered error state"}`);
    if (predicate(latest)) return latest;
    await sleep(3_000);
  }
  throw new Error(`${label} timed out; last state: ${JSON.stringify(latest)}`);
}

const hostPlayerId = `load_${runId}_00`;
const hostSigner = createGameSigner();
const created = await gameRequest({
  action: "create",
  playerId: hostPlayerId,
  displayName: "Load 00",
  signerAddress: hostSigner.address,
});
const code = created.data.code;
const hostSession = {
  code,
  playerId: hostPlayerId,
  playerToken: created.data.playerToken,
};
const host = { session: hostSession, signer: hostSigner };
const players = [host];

const joinNumbers = Array.from({ length: 49 }, (_, index) => index + 1);
const joined = await inBatches(joinNumbers, 10, async (index) => {
  const playerId = `load_${runId}_${String(index).padStart(2, "0")}`;
  const signer = createGameSigner();
  const response = await gameRequest({
    action: "join",
    code,
    playerId,
    displayName: `Load ${String(index).padStart(2, "0")}`,
    signerAddress: signer.address,
  });
  return { session: { code, playerId, playerToken: response.data.playerToken }, signer };
});
players.push(...joined);

const overflow = await gameRequest({
  action: "join",
  code,
  playerId: `load_${runId}_overflow`,
  displayName: "Overflow",
  signerAddress: createGameSigner().address,
}, [409]);
if (!/full/i.test(overflow.data.error ?? "")) {
  throw new Error(`51st player was not rejected as full: ${JSON.stringify(overflow.data)}`);
}

await gameRequest({ action: "start", ...host.session });
let state = await waitForState(
  host.session,
  (value) => value.status === "running" && value.currentRound?.position === 0,
  "game registration",
  180_000,
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
  const answerResults = await Promise.all(activePlayers.map(async ({ player, playerIndex }) => {
    const choiceIndex = (position + playerIndex) % 4;
    const proof = await commitSignedAnswer({
      signer: player.signer,
      contractAddress: state.contractAddress,
      contractGameId: state.contractGameId,
      roundIndex: position,
      choiceIndex,
    });
    return gameRequest({
      action: "answer",
      ...player.session,
      roundIndex: position,
      choiceIndex,
      commitment: proof.commitment,
      revealSalt: proof.salt,
      commitTransactionHash: String(proof.commitTxHash),
    });
  }));
  if (answerResults.some(({ data }) => data.accepted !== true)) {
    throw new Error(`round ${position + 1} did not accept every rotated answer`);
  }
  activePlayers.forEach(({ player }) => signedPlayers.add(player.signer.address.toLowerCase()));
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
  console.log(`round ${position + 1}/12: ${ACTIVE_PLAYERS_PER_ROUND} signed answers accepted`);
}

state = await waitForState(
  host.session,
  (value) => value.status === "finished",
  "finalized settlements",
  900_000,
);
const results = (await gameRequest({ action: "results", code })).data;
if (results.status !== "finished" || results.leaderboard?.length !== 50) {
  throw new Error(`results lookup failed: ${JSON.stringify(results)}`);
}
if (results.settledRounds !== 12 || results.pendingRounds !== 0) {
  throw new Error(`not every round finalized: ${JSON.stringify({ settledRounds: results.settledRounds, pendingRounds: results.pendingRounds })}`);
}
if (signedPlayers.size !== 50) {
  throw new Error(`not every player signed an answer: ${signedPlayers.size}/50`);
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
  pendingRounds: results.pendingRounds,
  winner: results.winner,
  overflowRejected: true,
  signedPlayersExercised: signedPlayers.size,
  answersPerRound: ACTIVE_PLAYERS_PER_ROUND,
  resultsLookup: true,
  timings: timingSummary,
}, null, 2));
