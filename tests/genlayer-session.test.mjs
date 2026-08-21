import assert from "node:assert/strict";
import test from "node:test";

import { isRetryableStudioWriteError } from "../lib/genlayer-session.ts";

test("retries transient StudioNet gateway responses only", () => {
  assert.equal(isRetryableStudioWriteError(new Error("Unexpected token '<', <!DOCTYPE is not valid JSON")), true);
  assert.equal(isRetryableStudioWriteError(new Error("503 Service Unavailable")), true);
  assert.equal(isRetryableStudioWriteError(new Error("Player already committed another answer")), false);
});
