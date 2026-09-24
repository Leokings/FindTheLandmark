import assert from "node:assert/strict";
import test from "node:test";
import { needsSupplementalReveal, scheduledClockChange } from "../supabase/functions/landmark-api/clock.ts";

test("a state refresh does not write the same game clock again", () => {
  assert.equal(scheduledClockChange({ status: "running", current_round: 1, round_count: 12 }, 1, false), null);
  assert.equal(scheduledClockChange({ status: "verifying", current_round: 12, round_count: 12 }, 11, true), null);
});

test("a confirmed reveal batch is retried when later answers arrive", () => {
  assert.equal(needsSupplementalReveal(2, 0), true);
  assert.equal(needsSupplementalReveal(2, 1), true);
  assert.equal(needsSupplementalReveal(2, 2), false);
});

test("the clock advances only when the round or phase changes", () => {
  assert.deepEqual(
    scheduledClockChange({ status: "registering", current_round: 0, round_count: 12 }, 0, false),
    { status: "running", current_round: 0 },
  );
  assert.deepEqual(
    scheduledClockChange({ status: "running", current_round: 0, round_count: 12 }, 1, false),
    { status: "running", current_round: 1 },
  );
  assert.deepEqual(
    scheduledClockChange({ status: "running", current_round: 11, round_count: 12 }, 11, true),
    { status: "verifying", current_round: 12 },
  );
});
