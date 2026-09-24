import assert from "node:assert/strict";
import test from "node:test";

import {
  executionFailureReason,
  hasGenuineConsensus,
  hasSuccessfulFinalizedExecution,
  isTerminal,
  signedCommitResult,
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

test("a signed answer is confirmed only with its own successful onchain commit and timestamp", () => {
  const expected = {
    contractAddress: "0x1234567890123456789012345678901234567890",
    gameId: "game-test",
    roundIndex: 2,
    signerAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    commitment: "a".repeat(64),
    startMs: Date.parse("2026-09-24T12:00:00Z"),
    endMs: Date.parse("2026-09-24T12:01:00Z"),
  };
  const receipt = Object.assign(finalizedReceipt(), {
    from_address: expected.signerAddress,
    to_address: expected.contractAddress,
    created_at: "2026-09-24T12:00:30Z",
    data: { calldata: { readable: `{"args":["game-test",2,"${expected.commitment}",]"method":"commit_answer"}` } },
  });
  assert.equal(signedCommitResult(receipt, expected), "confirmed");
  assert.equal(signedCommitResult({ ...receipt, status_name: "ACCEPTED" }, expected), "pending");
  assert.equal(signedCommitResult({ ...receipt, created_at: "2026-09-24T12:01:01Z" }, expected), "late");
  assert.equal(signedCommitResult({ ...receipt, from_address: "0x0000000000000000000000000000000000000001" }, expected), "invalid");
  assert.equal(signedCommitResult({ ...receipt, data: { calldata: { readable: "other" } } }, expected), "invalid");
  const failed = structuredClone(receipt);
  failed.consensus_data.leader_receipt[0].execution_result = "ERROR";
  assert.equal(signedCommitResult(failed, expected), "invalid");
});
