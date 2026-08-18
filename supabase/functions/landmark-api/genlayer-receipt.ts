const STATUS_BY_CODE: Record<string, string> = {
  "0": "UNINITIALIZED",
  "1": "PENDING",
  "2": "PROPOSING",
  "3": "COMMITTING",
  "4": "REVEALING",
  "5": "ACCEPTED",
  "6": "UNDETERMINED",
  "7": "FINALIZED",
  "8": "CANCELED",
  "9": "APPEAL_REVEALING",
  "10": "APPEAL_COMMITTING",
  "11": "READY_TO_FINALIZE",
  "12": "VALIDATORS_TIMEOUT",
  "13": "LEADER_TIMEOUT",
};

const TERMINAL = new Set([
  "ACCEPTED",
  "UNDETERMINED",
  "FINALIZED",
  "CANCELED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

function statusValue(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return STATUS_BY_CODE[String(value)] ?? "UNKNOWN";
  if (typeof value !== "string" || !value.trim()) return "UNKNOWN";
  const normalized = value.trim().toUpperCase();
  return /^\d+$/.test(normalized) ? STATUS_BY_CODE[String(Number(normalized))] ?? "UNKNOWN" : normalized;
}

export function statusName(receipt: unknown) {
  if (!receipt || typeof receipt !== "object") return "UNKNOWN";
  const record = receipt as Record<string, unknown>;
  const named = statusValue(record.statusName ?? record.status_name);
  return named === "UNKNOWN" ? statusValue(record.statusCode ?? record.status_code ?? record.status) : named;
}

export function isTerminal(receipt: unknown) {
  return TERMINAL.has(statusName(receipt));
}

export function hasGenuineConsensus(receipt: unknown) {
  if (!receipt || typeof receipt !== "object") return false;
  const transaction = receipt as Record<string, unknown>;
  if (!new Set(["ACCEPTED", "FINALIZED"]).has(statusName(receipt))) return false;

  const decoded = transaction.txDataDecoded ?? transaction.tx_data_decoded;
  const decodedRecord = decoded && typeof decoded === "object" ? decoded as Record<string, unknown> : null;
  const leaderOnly = decodedRecord?.leaderOnly
    ?? decodedRecord?.leader_only
    ?? transaction.leaderOnly
    ?? transaction.leader_only;
  if (leaderOnly !== false) return false;

  const consensus = transaction.consensusData ?? transaction.consensus_data;
  if (!consensus || typeof consensus !== "object") return false;
  const leaderReceipts = (consensus as Record<string, unknown>).leaderReceipt
    ?? (consensus as Record<string, unknown>).leader_receipt;
  if (!Array.isArray(leaderReceipts)) return false;
  const leader = leaderReceipts.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    return String((candidate as Record<string, unknown>).mode ?? "").toLowerCase() === "leader";
  });
  if (!leader || typeof leader !== "object") return false;
  const leaderRecord = leader as Record<string, unknown>;
  const execution = String(leaderRecord.executionResult ?? leaderRecord.execution_result ?? "").toUpperCase();
  const result = leaderRecord.result;
  const resultStatus = result && typeof result === "object"
    ? String((result as Record<string, unknown>).status ?? "").toUpperCase()
    : "";
  if (execution !== "SUCCESS" || resultStatus !== "RETURN") return false;

  const resultName = String(transaction.resultName ?? transaction.result_name ?? "").toUpperCase();
  if (resultName !== "AGREE" && resultName !== "MAJORITY_AGREE") return false;
  const lastRound = transaction.lastRound ?? transaction.last_round;
  if (!lastRound || typeof lastRound !== "object") return false;
  const voteNames = (lastRound as Record<string, unknown>).validatorVotesName
    ?? (lastRound as Record<string, unknown>).validator_votes_name;
  if (!Array.isArray(voteNames) || voteNames.length < 3) return false;
  const agrees = voteNames.filter((vote) => String(vote).toUpperCase() === "AGREE").length;
  return agrees > voteNames.length / 2;
}
