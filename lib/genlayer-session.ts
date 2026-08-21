import { bytesToHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const STUDIO_ENDPOINT = "https://studio.genlayer.com/api";
const PENDING_KEY = "find-the-landmark.pending-answers.v4";

export type GameSigner = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
};

export type PendingAnswer = {
  contractAddress: `0x${string}`;
  contractGameId: string;
  roundIndex: number;
  choiceIndex: number;
  salt: string;
  commitment: string;
  commitTxHash: string;
  revealFallbackAtMs: number;
  revealDeadlineMs: number;
  backendSaved?: boolean;
  revealTxHash?: string;
  revealSubmittedAtMs?: number;
};

function validPrivateKey(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-f0-9]{64}$/i.test(value);
}

function pendingId(answer: Pick<PendingAnswer, "contractGameId" | "roundIndex">) {
  return `${answer.contractGameId}:${answer.roundIndex}`;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function writeClient(privateKey: `0x${string}`) {
  const [{ createAccount, createClient }, { studionet }] = await Promise.all([
    import("genlayer-js"),
    import("genlayer-js/chains"),
  ]);
  return createClient({
    chain: studionet,
    endpoint: STUDIO_ENDPOINT,
    account: createAccount(privateKey),
  });
}

function friendlyStudioWriteError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (
    /pending transactions \(limit: 50\)|rate limit exceeded|unexpected token '<'|not valid JSON|bad gateway|service unavailable/i
      .test(message)
  ) {
    return new Error("StudioNet is busy. Try again in a moment.");
  }
  return caught instanceof Error ? caught : new Error("Could not lock the answer.");
}

export function isRetryableStudioWriteError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught);
  return /unexpected token '<'|not valid JSON|fetch failed|econnreset|etimedout|socket hang up|bad gateway|service unavailable|gateway timeout|\b50[234]\b/i
    .test(message);
}

async function studioWrite<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (caught) {
      lastError = caught;
      if (!isRetryableStudioWriteError(caught) || attempt === 3) break;
      const backoffMs = 350 * (2 ** attempt) + Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw friendlyStudioWriteError(lastError);
}

export function createGameSigner(): GameSigner {
  const privateKey = generatePrivateKey();
  return { privateKey, address: privateKeyToAccount(privateKey).address };
}

export function restoreGameSigner(value: unknown): GameSigner | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GameSigner>;
  if (!validPrivateKey(candidate.privateKey)) return null;
  const address = privateKeyToAccount(candidate.privateKey).address;
  if (typeof candidate.address !== "string" || address.toLowerCase() !== candidate.address.toLowerCase()) {
    return null;
  }
  return { privateKey: candidate.privateKey, address };
}

export async function createCommitment(input: {
  gameId: string;
  roundIndex: number;
  playerAddress: string;
  choiceIndex: number;
  salt: string;
}) {
  const preimage = [
    "ftl",
    "v4",
    input.gameId,
    input.roundIndex,
    input.playerAddress.toLowerCase(),
    input.choiceIndex,
    input.salt.toLowerCase(),
  ].join(":");
  return sha256Hex(preimage);
}

export async function commitSignedAnswer(input: {
  signer: GameSigner;
  contractAddress: `0x${string}`;
  contractGameId: string;
  roundIndex: number;
  choiceIndex: number;
}) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32))).slice(2).toLowerCase();
  const commitment = await createCommitment({
    gameId: input.contractGameId,
    roundIndex: input.roundIndex,
    playerAddress: input.signer.address,
    choiceIndex: input.choiceIndex,
    salt,
  });
  const commitTxHash = String(await studioWrite(async () => {
    const client = await writeClient(input.signer.privateKey);
    return client.writeContract({
      address: input.contractAddress,
      functionName: "commit_answer",
      args: [input.contractGameId, input.roundIndex, commitment],
      value: BigInt(0),
      // The commitment is deterministic and signed by the player's temporary
      // EOA. Independent validator consensus is reserved for XP finalization.
      leaderOnly: true,
    });
  }));
  return { salt, commitment, commitTxHash };
}

export async function revealSignedAnswer(input: {
  signer: GameSigner;
  answer: PendingAnswer;
}) {
  return studioWrite(async () => {
    const client = await writeClient(input.signer.privateKey);
    return client.writeContract({
      address: input.answer.contractAddress,
      functionName: "reveal_answer",
      args: [
        input.answer.contractGameId,
        input.answer.roundIndex,
        input.answer.choiceIndex,
        input.answer.salt,
      ],
      value: BigInt(0),
      // Reveals do not award XP; they only open the player's signed commitment.
      leaderOnly: true,
    });
  });
}

export async function answerState(input: {
  contractAddress: `0x${string}`;
  contractGameId: string;
  roundIndex: number;
  playerAddress: `0x${string}`;
}) {
  const [{ createClient }, { studionet }] = await Promise.all([
    import("genlayer-js"),
    import("genlayer-js/chains"),
  ]);
  const client = createClient({ chain: studionet, endpoint: STUDIO_ENDPOINT });
  return client.readContract({
    address: input.contractAddress,
    functionName: "get_answer_state",
    args: [input.contractGameId, input.roundIndex, input.playerAddress],
  }) as Promise<{ committed: boolean; revealed: boolean }>;
}

export function pendingAnswers(): PendingAnswer[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PendingAnswer => {
      if (!entry || typeof entry !== "object") return false;
      const row = entry as Partial<PendingAnswer>;
      return typeof row.contractGameId === "string"
        && typeof row.contractAddress === "string"
        && /^0x[a-f0-9]{40}$/i.test(row.contractAddress)
        && Number.isInteger(row.roundIndex)
        && Number.isInteger(row.choiceIndex)
        && typeof row.salt === "string"
        && /^[a-f0-9]{64}$/.test(row.salt)
        && typeof row.commitment === "string"
        && /^[a-f0-9]{64}$/.test(row.commitment)
        && typeof row.commitTxHash === "string"
        && typeof row.revealFallbackAtMs === "number"
        && typeof row.revealDeadlineMs === "number";
    });
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return [];
  }
}

export function savePendingAnswer(answer: PendingAnswer) {
  const others = pendingAnswers().filter((entry) => pendingId(entry) !== pendingId(answer));
  localStorage.setItem(PENDING_KEY, JSON.stringify([...others, answer]));
}

export function removePendingAnswer(answer: PendingAnswer) {
  const next = pendingAnswers().filter((entry) => pendingId(entry) !== pendingId(answer));
  localStorage.setItem(PENDING_KEY, JSON.stringify(next));
}

export function markPendingReveal(answer: PendingAnswer, revealTxHash: string) {
  savePendingAnswer({ ...answer, revealTxHash, revealSubmittedAtMs: Date.now() });
}

export function markPendingBackendSaved(answer: PendingAnswer) {
  savePendingAnswer({ ...answer, backendSaved: true });
}
