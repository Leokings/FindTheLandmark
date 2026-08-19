import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const baseUrl = (process.argv[2] ?? "https://find-the-landmark.vercel.app").replace(/\/$/, "");
const runId = `${Date.now().toString(36)}${randomUUID().replaceAll("-", "").slice(0, 6)}`;
const timings = new Map();

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
const created = await gameRequest({
  action: "create",
  playerId: hostPlayerId,
  displayName: "Load 00",
});
const code = created.data.code;
const host = {
  code,
  playerId: hostPlayerId,
  playerToken: created.data.playerToken,
};
const players = [host];

const joinNumbers = Array.from({ length: 49 }, (_, index) => index + 1);
const joined = await inBatches(joinNumbers, 10, async (index) => {
  const playerId = `load_${runId}_${String(index).padStart(2, "0")}`;
  const response = await gameRequest({
    action: "join",
    code,
    playerId,
    displayName: `Load ${String(index).padStart(2, "0")}`,
  });
  return { code, playerId, playerToken: response.data.playerToken };
});
players.push(...joined);

const overflow = await gameRequest({
  action: "join",
  code,
  playerId: `load_${runId}_overflow`,
  displayName: "Overflow",
}, [409]);
if (!/full/i.test(overflow.data.error ?? "")) {
  throw new Error(`51st player was not rejected as full: ${JSON.stringify(overflow.data)}`);
}

await gameRequest({ action: "start", ...host });
let state = await waitForState(
  host,
  (value) => value.status === "running" && value.currentRound?.position === 0,
  "game registration",
  180_000,
);

for (let position = 0; position < 12; position += 1) {
  if (state.currentRound?.position !== position) {
    state = await waitForState(
      host,
      (value) => value.status === "running" && value.currentRound?.position === position,
      `round ${position + 1}`,
      180_000,
    );
  }
  const answerResults = await Promise.all(players.map((player, playerIndex) => gameRequest({
    action: "answer",
    ...player,
    choiceIndex: (position + playerIndex) % 4,
  })));
  if (answerResults.some(({ data }) => data.accepted !== true)) {
    throw new Error(`round ${position + 1} did not accept all 50 answers`);
  }
  const endsAt = Date.parse(state.currentRound.endsAt);
  await sleep(Math.max(0, endsAt - Date.now() + 250));
  state = await waitForState(
    host,
    (value) => value.status === "verifying"
      || value.status === "finished"
      || (value.status === "running" && value.currentRound?.position === position + 1),
    `round ${position + 1} submission`,
    180_000,
  );
  console.log(`round ${position + 1}/12: 50 answers accepted`);
}

state = await waitForState(
  host,
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
  resultsLookup: true,
  timings: timingSummary,
}, null, 2));
