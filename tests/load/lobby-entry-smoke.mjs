import { randomBytes, randomUUID } from "node:crypto";
import { createGameSigner } from "../../lib/genlayer-session.ts";

const baseUrl = (process.argv[2] ?? "https://find-the-landmark.vercel.app").replace(/\/$/, "");
const runId = randomUUID().replaceAll("-", "").slice(0, 16);

async function request(body, expected = [200, 201]) {
  const response = await fetch(`${baseUrl}/api/game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await response.json();
  if (!expected.includes(response.status)) {
    throw new Error(`${body.action} returned ${response.status}: ${data.error ?? JSON.stringify(data)}`);
  }
  return data;
}

const host = createGameSigner();
const hostToken = randomBytes(32).toString("hex");
const create = {
  action: "create",
  playerId: `smoke_${runId}_host`,
  playerToken: hostToken,
  signerAddress: host.address,
  displayName: `Host ${runId.slice(0, 6)}`,
  pack: "mixed",
};
const room = await request(create);
const repeatedRoom = await request(create);
if (room.code !== repeatedRoom.code || room.playerToken !== hostToken || repeatedRoom.playerToken !== hostToken) {
  throw new Error("Create retry did not return the same room and session.");
}

const guest = createGameSigner();
const guestToken = randomBytes(32).toString("hex");
const join = {
  action: "join",
  code: room.code,
  playerId: `smoke_${runId}_guest`,
  playerToken: guestToken,
  signerAddress: guest.address,
  displayName: `Guest ${runId.slice(0, 6)}`,
};
const concurrent = await Promise.all([request(join), request(join)]);
if (concurrent.some((entry) => entry.playerToken !== guestToken || entry.code !== room.code)) {
  throw new Error("Concurrent join retries did not return the same session.");
}
const repeatedJoin = await request(join);
if (repeatedJoin.playerToken !== guestToken) throw new Error("Join retry rotated the guest session.");

const wrongToken = await request({ ...join, playerToken: randomBytes(32).toString("hex") }, [409]);
if (!/already joined/i.test(wrongToken.error ?? "")) {
  throw new Error("A different token could replace the guest session.");
}

const state = await request({
  action: "state",
  code: room.code,
  playerId: join.playerId,
  playerToken: guestToken,
});
if (state.playerCount !== 2 || state.leaderboard.length !== 2 || state.maxPlayers !== 50) {
  throw new Error(`Wrong lobby state after idempotent joins: ${JSON.stringify(state)}`);
}

console.log(JSON.stringify({ code: room.code, players: state.playerCount, maxPlayers: state.maxPlayers, createIdempotent: true, concurrentJoinIdempotent: true, sessionHijackRejected: true }));
