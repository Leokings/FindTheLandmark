import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createGameSigner, commitSignedAnswer } from "../../lib/genlayer-session.ts";

const baseUrl = (process.argv[2] ?? "https://find-the-landmark.vercel.app").replace(/\/$/, "");
const runId = `${Date.now().toString(36)}${randomUUID().replaceAll("-", "").slice(0, 6)}`;
const timings = new Map();
const signedPlayers = new Set();
let transientStateFailures = 0;
// Eight signed writes per round stays below StudioNet's public-RPC bucket.
const PLAYER_COUNT = 8;
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
      if (!/^answer returned 503: Answer is still confirming onchain\./.test(String(error)) || attempt === 24) throw error;
      await sleep(4_000);
    }
  }
  throw new Error("Answer could not be confirmed.");
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
      if (!/^state returned 50[234]:/.test(String(error))) throw error;
      transientStateFailures += 1;
      await sleep(3_000);
      continue;
    }
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
console.log(`Eight-player test room: ${code}`);
const hostSession = {
  code,
  playerId: hostPlayerId,
  playerToken: created.data.playerToken,
};
const host = { session: hostSession, signer: hostSigner };
const players = [host];
const pendingConfirmations = [];

const joinNumbers = Array.from({ length: PLAYER_COUNT - 1 }, (_, index) => index + 1);
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
  throw new Error(`Ninth player was not rejected as full: ${JSON.stringify(overflow.data)}`);
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
  const signedAnswers = await Promise.all(activePlayers.map(async ({ player, playerIndex }) => {
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
  const confirmations = Promise.all(signedAnswers.map(({ player, choiceIndex, proof }) => confirmedAnswer({
      action: "answer",
      ...player.session,
      roundIndex: position,
      choiceIndex,
      commitment: proof.commitment,
      revealSalt: proof.salt,
      commitTransactionHash: String(proof.commitTxHash),
    }))).then(
      (results) => ({ position, results, error: null }),
      (error) => ({ position, results: null, error }),
    );
  pendingConfirmations.push(confirmations);
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
  console.log(`round ${position + 1}/12: ${ACTIVE_PLAYERS_PER_ROUND} signed commitments sent`);
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
if (results.roundRecap?.length !== 12) throw new Error("round recap is incomplete");
if (signedPlayers.size !== PLAYER_COUNT) {
  throw new Error(`not every player signed an answer: ${signedPlayers.size}/${PLAYER_COUNT}`);
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
  timings: timingSummary,
}, null, 2));
