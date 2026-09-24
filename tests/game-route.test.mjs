import assert from "node:assert/strict";
import { after, test, mock } from "node:test";
import { POST } from "../app/api/game/route.ts";

const previousSigningKey = process.env.LANDMARK_SITE_SIGNING_KEY;
process.env.LANDMARK_SITE_SIGNING_KEY = `0x${"11".repeat(32)}`;

after(() => {
  mock.restoreAll();
  if (previousSigningKey === undefined) delete process.env.LANDMARK_SITE_SIGNING_KEY;
  else process.env.LANDMARK_SITE_SIGNING_KEY = previousSigningKey;
});

function request(body) {
  return new Request("https://find-the-landmark.vercel.app/api/game", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("create forwards a stable client token to the game service", async () => {
  const token = "ab".repeat(32);
  const seen = [];
  const fetchMock = mock.method(globalThis, "fetch", async (_url, options) => {
    seen.push(JSON.parse(options.body));
    return Response.json({ code: "ABC234", playerToken: token }, { status: 201 });
  });
  try {
    const response = await POST(request({
      action: "create",
      playerId: "browser_player_1",
      playerToken: token,
      displayName: "Browser Player",
      signerAddress: `0x${"12".repeat(20)}`,
    }));
    assert.equal(response.status, 201);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].playerToken, token);
    assert.equal((await response.json()).code, "ABC234");
  } finally {
    fetchMock.mock.restore();
  }
});

test("state retries a transient failed upstream read", async () => {
  let calls = 0;
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    calls += 1;
    if (calls === 1) throw new DOMException("aborted", "AbortError");
    return Response.json({ status: "waiting", playerCount: 2 });
  });
  try {
    const response = await POST(request({
      action: "state",
      playerId: "browser_player_1",
      playerToken: "ab".repeat(32),
      code: "ABC234",
    }));
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.equal((await response.json()).playerCount, 2);
  } finally {
    fetchMock.mock.restore();
  }
});

test("invalid entry token is rejected before the service call", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("unexpected upstream call");
  });
  try {
    const response = await POST(request({
      action: "join",
      playerId: "browser_player_1",
      playerToken: "short",
      displayName: "Browser Player",
      signerAddress: `0x${"12".repeat(20)}`,
      code: "ABC234",
    }));
    assert.equal(response.status, 400);
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
  }
});
