import assert from "node:assert/strict";
import test from "node:test";

import { contractPlan, createGamePlan } from "../supabase/functions/landmark-api/content.ts";

test("game plans contain twelve rounds and four sourced GenLayer quizzes", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const plan = createGamePlan();
    const docsRounds = plan.filter((round) => Boolean(round.sourceUrl));

    assert.equal(plan.length, 12);
    assert.equal(plan.filter((round) => round.kind === "identify").length, 5);
    assert.equal(plan.filter((round) => round.kind === "quiz" && !round.sourceUrl).length, 3);
    assert.equal(docsRounds.length, 4);
    assert.ok(docsRounds.every((round) => round.sourceUrl?.startsWith("https://docs.genlayer.com/")));
    assert.ok(docsRounds.every((round) => round.sourceExcerpt));

    const onchainPlan = contractPlan(plan);
    assert.ok(onchainPlan.every((round) => Object.hasOwn(round, "source_excerpt")));
  }
});
