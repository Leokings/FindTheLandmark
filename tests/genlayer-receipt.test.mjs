import assert from "node:assert/strict";
import test from "node:test";

import {
  executionFailureReason,
  hasGenuineConsensus,
  hasSuccessfulFinalizedExecution,
  isTerminal,
  statusName,
} from "../supabase/functions/landmark-api/genlayer-receipt.ts";

function finalizedReceipt() {
  return {
    status_name: "FINALIZED",
    tx_data_decoded: { leader_only: false },
    result_name: "MAJORITY_AGREE",
    consensus_data: {
      leader_receipt: [{
        mode: "leader",
        execution_result: "SUCCESS",
        genvm_result: { raw_error: null, error_code: null },
      }],
    },
    last_round: {
      validator_votes_name: ["AGREE", "AGREE", "AGREE", "IDLE", "IDLE"],
    },
  };
}

test("accepts a successful finalized StudioNet consensus receipt", () => {
  assert.equal(hasGenuineConsensus(finalizedReceipt()), true);
});

test("supports the SDK-normalized RETURN receipt shape", () => {
  const receipt = finalizedReceipt();
  receipt.consensus_data.leader_receipt[0] = {
    mode: "leader",
    execution_result: "SUCCESS",
    result: { status: "RETURN" },
  };
  assert.equal(hasGenuineConsensus(receipt), true);
});

test("never awards on ACCEPTED or failed execution", () => {
  const accepted = finalizedReceipt();
  accepted.status_name = "ACCEPTED";
  assert.equal(isTerminal(accepted), false);
  assert.equal(hasGenuineConsensus(accepted), false);

  const failed = finalizedReceipt();
  failed.consensus_data.leader_receipt[0].execution_result = "ERROR";
  failed.consensus_data.leader_receipt[0].genvm_result = {
    raw_error: { fatal: true },
    error_code: "FAILED",
  };
  assert.equal(hasGenuineConsensus(failed), false);
});

test("requires independent validators and majority agreement", () => {
  const leaderOnly = finalizedReceipt();
  leaderOnly.tx_data_decoded.leader_only = true;
  assert.equal(hasSuccessfulFinalizedExecution(leaderOnly), true);
  assert.equal(hasGenuineConsensus(leaderOnly), false);

  const noMajority = finalizedReceipt();
  noMajority.last_round.validator_votes_name = ["AGREE", "DISAGREE", "DISAGREE"];
  assert.equal(hasGenuineConsensus(noMajority), false);
});

test("extracts a finalized rollback reason", () => {
  const failed = finalizedReceipt();
  failed.consensus_data.leader_receipt[0] = {
    mode: "leader",
    execution_result: "ERROR",
    result: { status: "rollback", payload: "[EXTERNAL] Source server returned HTTP 403" },
  };
  assert.equal(hasSuccessfulFinalizedExecution(failed), false);
  assert.equal(executionFailureReason(failed), "[EXTERNAL] Source server returned HTTP 403");
});

test("normalizes numeric status codes", () => {
  assert.equal(statusName({ status: 7 }), "FINALIZED");
  assert.equal(statusName({ status_code: "5" }), "ACCEPTED");
});
