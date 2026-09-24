import assert from "node:assert/strict";
import test from "node:test";

import {
  createCommitment,
  hydratePendingAnswers,
  isRetryableStudioWriteError,
  pendingAnswers,
  savePendingAnswer,
} from "../lib/genlayer-session.ts";

test("retries transient StudioNet gateway responses only", () => {
  assert.equal(isRetryableStudioWriteError(new Error("Unexpected token '<', <!DOCTYPE is not valid JSON")), true);
  assert.equal(isRetryableStudioWriteError(new Error("503 Service Unavailable")), true);
  assert.equal(isRetryableStudioWriteError(new Error("Player already committed another answer")), false);
});

test("separate signers never inherit each other's pending round answer", () => {
  const values = new Map();
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try {
    const base = {
      contractAddress: "0x1111111111111111111111111111111111111111",
      contractGameId: "game-shared",
      roundIndex: 2,
      choiceIndex: 1,
      salt: "a".repeat(64),
      commitment: "b".repeat(64),
      commitTxHash: "0x" + "c".repeat(64),
      revealFallbackAtMs: 1,
      revealDeadlineMs: 2,
    };
    const signerA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const signerB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    savePendingAnswer({ ...base, signerAddress: signerA });
    assert.equal(pendingAnswers(signerA).length, 1);
    assert.equal(pendingAnswers(signerB).length, 0);
    savePendingAnswer({ ...base, signerAddress: signerB, choiceIndex: 3 });
    assert.equal(pendingAnswers(signerA)[0].choiceIndex, 1);
    assert.equal(pendingAnswers(signerB)[0].choiceIndex, 3);
  } finally {
    globalThis.window = previousWindow;
    globalThis.localStorage = previousStorage;
  }
});

test("legacy pending answer is recovered only for its actual signer", async () => {
  const values = new Map();
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.localStorage;
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try {
    const signerA = { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
    const signerB = { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    const legacy = {
      contractAddress: "0x1111111111111111111111111111111111111111",
      contractGameId: "game-legacy",
      roundIndex: 1,
      choiceIndex: 2,
      salt: "d".repeat(64),
      commitTxHash: "0x" + "e".repeat(64),
      revealFallbackAtMs: 1,
      revealDeadlineMs: 2,
    };
    legacy.commitment = await createCommitment({
      gameId: legacy.contractGameId,
      roundIndex: legacy.roundIndex,
      playerAddress: signerA.address,
      choiceIndex: legacy.choiceIndex,
      salt: legacy.salt,
    });
    values.set("find-the-landmark.pending-answers.v4", JSON.stringify([legacy]));
    assert.equal((await hydratePendingAnswers(signerB)).length, 0);
    assert.equal((await hydratePendingAnswers(signerA)).length, 1);
  } finally {
    globalThis.window = previousWindow;
    globalThis.localStorage = previousStorage;
  }
});
