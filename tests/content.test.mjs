import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_POOL_COUNTS,
  contractPlan,
  createGamePlan,
} from "../supabase/functions/landmark-api/content.ts";

test("content pool contains sixty reusable questions", () => {
  assert.deepEqual(CONTENT_POOL_COUNTS, {
    landmarks: 30,
    atlas: 15,
    genLayerDocs: 15,
    total: 60,
  });
});

test("game plans contain twelve rounds and seven authoritative-source quizzes", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const plan = createGamePlan();
    const atlasRounds = plan.filter((round) => round.sourceUrl?.startsWith(
      "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?where=id_no%3D",
    ));
    const docsRounds = plan.filter((round) => round.sourceUrl?.startsWith(
      "https://raw.githubusercontent.com/genlayerlabs/genlayer-docs/9699f3900dd697689090f6595f5c14b4f0a60fdf/",
    ));

    assert.equal(plan.length, 12);
    assert.equal(plan.filter((round) => round.kind === "identify").length, 5);
    assert.equal(atlasRounds.length, 3);
    assert.equal(docsRounds.length, 4);
    assert.ok(atlasRounds.every((round) => !round.sourceSha256));
    assert.ok(atlasRounds.every((round) => round.sourceUrl?.endsWith("&limit=1")));
    assert.ok(docsRounds.every((round) => /^[a-f0-9]{64}$/.test(round.sourceSha256 ?? "")));
    assert.ok(plan.every((round) => round.options.length === 4));
    assert.ok(plan.every((round) => new Set(round.options).size === 4));

    const onchainPlan = contractPlan(plan);
    assert.ok(onchainPlan.every((round) => Object.hasOwn(round, "source_sha256")));
    assert.ok(onchainPlan.every((round) => !Object.hasOwn(round, "source_excerpt")));
  }
});

test("answer positions are shuffled between games", () => {
  const firstOptions = new Map();

  for (let attempt = 0; attempt < 200; attempt += 1) {
    for (const round of createGamePlan()) {
      const positions = firstOptions.get(round.challengeId) ?? new Set();
      positions.add(round.options[0]);
      firstOptions.set(round.challengeId, positions);
    }
  }

  assert.ok([...firstOptions.values()].every((positions) => positions.size > 1));
});
