import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  ColorSpace,
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.42";
import { verifyMessage } from "npm:viem@2.55.18";
import { needsSupplementalReveal, scheduledClockChange } from "./clock.ts";
import { contractPlan, createGamePlan, type GamePack, type GameRound } from "./content.ts";
import { activeChallenge } from "./round-presentation.ts";
import {
  executionFailureReason,
  hasGenuineConsensus,
  hasSuccessfulFinalizedExecution,
  isTerminal,
  revealExecutionCounts,
  signedCommitResult,
  signedCommitStateResult,
  statusName,
} from "./genlayer-receipt.ts";

const magickWasm = await Deno.readFile(
  new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42")),
);
await initializeImageMagick(magickWasm);

const CURRENT_CONTRACT_ADDRESS = "0xCbE0103e51B33E665C3CdDa9dE1B6187ac941841";
const RECENT_CONTRACT_ADDRESS = "0x93Cad018ECC6567c0A9056d51D9b2B637f2F658B";
const PREVIOUS_CONTRACT_ADDRESS = "0x219f4011bB42BEf4BEbb5aF46dfe69F7bE2eDd5c";
const TWO_STEP_ACTIVATION_CONTRACTS = new Set([
  CURRENT_CONTRACT_ADDRESS.toLowerCase(),
  RECENT_CONTRACT_ADDRESS.toLowerCase(),
  PREVIOUS_CONTRACT_ADDRESS.toLowerCase(),
  "0x677388E350bef8FdfD41f8F8Dc13c558175f3C7F".toLowerCase(),
]);
const EXPECTED_RELAYER = "0x7f07ab481dd8b57085d7c9e0c97c6126ee7faaec";
const SITE_SIGNERS = [
  "0xdc2606D6c7833178fFF3D456ADEF8d97029ea196",
  "0xFa1A2cCa8a3A00205038Db8DD847a2F016Cc7BA9",
] as const;
const GENLAYER_RPC_URL = "https://studio.genlayer.com/api";
const EVIDENCE_BUCKET = "landmark-evidence";
const ALLOWED_IMAGE_HOSTS = new Set(["upload.wikimedia.org"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_NORMALIZED_DIMENSION = 1_280;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const RATE_WINDOW_SECONDS = 10 * 60;
const GAME_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type DatabaseClient = ReturnType<typeof createClient>;
type GenLayerReadClient = {
  getTransaction(args: { hash: string }): Promise<unknown>;
  readContract(args: Record<string, unknown>): Promise<unknown>;
};
type GenLayerWriteClient = GenLayerReadClient & {
  getChainId(): Promise<number>;
  writeContract(args: Record<string, unknown>): Promise<string>;
};
type GameRow = {
  id: string;
  code: string;
  host_player_key: string;
  status: "waiting" | "registering" | "running" | "verifying" | "finished" | "error";
  max_players: number;
  pack: GamePack;
  round_count: number;
  current_round: number;
  plan: GameRound[];
  contract_version: "v3" | "v4";
  contract_address: string | null;
  contract_game_id: string | null;
  registration_tx_hash: string | null;
  activation_tx_hash: string | null;
  winner_player_id: string | null;
  next_check_at: string | null;
  worker_next_at: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
type PlayerRow = {
  id: string;
  game_id: string;
  player_key: string;
  player_hash: string;
  signer_address: string | null;
  player_token_hash: string;
  display_name: string;
  is_host: boolean;
  score: number;
  joined_at: string;
};
type RoundRow = {
  id: string;
  game_id: string;
  position: number;
  kind: "identify" | "quiz";
  challenge_id: string;
  status: "queued" | "open" | "revealing" | "revealed" | "finalizing" | "submitting" | "pending" | "settled" | "void" | "failed";
  started_at: string | null;
  ends_at: string | null;
  reveal_deadline: string | null;
  finalize_after: string | null;
  reveal_transaction_hash: string | null;
  reveal_answer_count: number;
  pending_reveal_answer_count: number | null;
  reveal_confirmed_at: string | null;
  finalize_transaction_hash: string | null;
  transaction_hash: string | null;
  finalize_attempts: number;
  correct_index: number | null;
  consensus_status: string | null;
  next_check_at: string | null;
  error_message: string | null;
};

const headers = {
  "Access-Control-Allow-Origin": "https://find-the-landmark.vercel.app",
  "Access-Control-Allow-Headers": "content-type, x-landmark-timestamp, x-landmark-nonce, x-landmark-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256Hex(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticate(request: Request, rawBody: string) {
  const timestamp = request.headers.get("x-landmark-timestamp") ?? "";
  const nonce = request.headers.get("x-landmark-nonce") ?? "";
  const signature = request.headers.get("x-landmark-signature") ?? "";
  const numericTimestamp = Number(timestamp);
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - numericTimestamp) > MAX_CLOCK_SKEW_MS) return null;
  if (!/^[a-f0-9-]{36}$/i.test(nonce) || !/^0x[a-f0-9]{130}$/i.test(signature)) return null;
  const bodyHash = await sha256Hex(rawBody);
  const message = `find-the-landmark:${timestamp}:${nonce}:${bodyHash}`;
  for (const address of SITE_SIGNERS) {
    if (await verifyMessage({
      address,
      message,
      signature: signature as `0x${string}`,
    })) return nonce;
  }
  return null;
}

function database() {
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  let secretKey = legacyKey;
  const currentKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (currentKeys) {
    try {
      secretKey = String((JSON.parse(currentKeys) as Record<string, unknown>).default ?? legacyKey);
    } catch {
      secretKey = legacyKey;
    }
  }
  if (!projectUrl || !secretKey) throw new Error("Lobby storage is not configured.");
  return createClient(projectUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function claimNonce(db: DatabaseClient, nonce: string) {
  const { error } = await db.from("landmark_request_nonces").insert({ nonce });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

async function enforceRateLimit(db: DatabaseClient, body: Record<string, unknown>) {
  const action = String(body.action ?? "");
  const ipHash = typeof body.requestIpHash === "string" ? body.requestIpHash : "";
  if (!/^[a-f0-9]{64}$/.test(ipHash)) throw new Error("INVALID_RATE_KEY");

  const playerKey = normalizePlayerKey(body.playerId) ?? "anonymous";
  const code = normalizeCode(body.code) ?? "none";
  const policy = action === "create"
    ? { key: `create:${ipHash}`, limit: 20 }
    : action === "join"
    ? { key: `join:${code}:${ipHash}`, limit: 120 }
    : action === "results"
    ? { key: `results:${code}:${ipHash}`, limit: 120 }
    : action === "state"
    ? { key: `state:${playerKey}`, limit: 300 }
    : action === "answer"
    ? { key: `answer:${playerKey}`, limit: 120 }
    : { key: `start:${playerKey}`, limit: 20 };

  const { data, error } = await db.rpc("landmark_take_rate_limit", {
    p_key_hash: await sha256Hex(`landmark-rate:${policy.key}`),
    p_limit: policy.limit,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });
  if (error) throw error;
  if (data !== true) throw new Error("RATE_LIMITED");
}

function normalizePlayerKey(value: unknown) {
  const playerKey = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{12,100}$/.test(playerKey) ? playerKey : null;
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.replace(/\p{Cc}/gu, "").replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= 24 ? name : null;
}

function normalizePack(value: unknown): GamePack | null {
  return value === "mixed" || value === "landmarks" || value === "genlayer" ? value : null;
}

function normalizeCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

function normalizeToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function normalizeSignerAddress(value: unknown) {
  const address = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^0x[a-f0-9]{40}$/.test(address) && address !== "0x0000000000000000000000000000000000000000"
    ? address
    : null;
}

function normalizeDigest(value: unknown) {
  const digest = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-f0-9]{64}$/.test(digest) ? digest : null;
}

function normalizeTransactionHash(value: unknown) {
  const hash = typeof value === "string" ? value.trim() : "";
  return /^(0x)?[a-fA-F0-9]{64}$/.test(hash) ? hash : null;
}

function createToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createCode() {
  const random = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(random, (byte) => GAME_CODE_CHARS[byte % GAME_CODE_CHARS.length]).join("");
}

async function requireSession(db: DatabaseClient, body: Record<string, unknown>) {
  const code = normalizeCode(body.code);
  const playerKey = normalizePlayerKey(body.playerId);
  const playerToken = normalizeToken(body.playerToken);
  if (!code || !playerKey || !playerToken) throw new Error("INVALID_SESSION");

  const { data: game, error: gameError } = await db
    .from("landmark_games")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (gameError || !game) throw new Error("GAME_NOT_FOUND");

  const { data: player, error: playerError } = await db
    .from("landmark_game_players")
    .select("*")
    .eq("game_id", game.id)
    .eq("player_key", playerKey)
    .maybeSingle();
  if (playerError || !player) throw new Error("INVALID_SESSION");
  if (player.player_token_hash !== await sha256Hex(`landmark-token:${playerToken}`)) {
    throw new Error("INVALID_SESSION");
  }
  return { game: game as GameRow, player: player as PlayerRow, playerToken };
}

function normalizeEvidenceUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.hash
    || (url.port && url.port !== "443")
    || !ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase())
  ) throw new Error("Invalid round image.");
  return url.toString();
}

async function downloadEvidence(sourceUrl: string) {
  const url = normalizeEvidenceUrl(sourceUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: { "User-Agent": "FindTheLandmark/2.0" },
    });
    if (!response.ok) throw new Error(`Round image returned HTTP ${response.status}.`);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(contentType)) {
      throw new Error("Round image format is unsupported.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 64 || bytes.length > MAX_IMAGE_BYTES) throw new Error("Round image size is invalid.");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeEvidence(bytes: Uint8Array) {
  return ImageMagick.read(bytes, (image): Uint8Array => {
    if (image.width < 64 || image.height < 64) throw new Error("Round image is too small.");
    image.autoOrient();
    if (image.width > MAX_NORMALIZED_DIMENSION || image.height > MAX_NORMALIZED_DIMENSION) {
      const scale = Math.min(MAX_NORMALIZED_DIMENSION / image.width, MAX_NORMALIZED_DIMENSION / image.height);
      image.resize(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    }
    image.colorSpace = ColorSpace.sRGB;
    image.quality = 82;
    image.strip();
    return image.write(MagickFormat.Jpeg, (data) => new Uint8Array(data));
  });
}

async function mirrorRoundEvidence(db: DatabaseClient, sourceUrl: string) {
  const normalized = normalizeEvidence(await downloadEvidence(sourceUrl));
  const evidenceSha256 = await sha256Hex(normalized);
  const objectPath = `content/${evidenceSha256}.jpg`;
  const { error } = await db.storage.from(EVIDENCE_BUCKET).upload(objectPath, normalized, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (
    error
    && !/already exists|duplicate/i.test(error.message)
    && String((error as unknown as Record<string, unknown>).statusCode ?? "") !== "409"
  ) throw new Error("Round image could not be prepared.");
  const { data } = db.storage.from(EVIDENCE_BUCKET).getPublicUrl(objectPath);
  return { evidenceUrl: data.publicUrl, evidenceSha256 };
}

async function genlayerClients() {
  const [{ createAccount, createClient }, { studionet }] = await Promise.all([
    import("npm:genlayer-js@1.1.8"),
    import("npm:genlayer-js@1.1.8/chains"),
  ]);
  const privateKey = Deno.env.get("GENLAYER_RELAYER_PRIVATE_KEY");
  if (!privateKey) throw new Error("GenLayer relayer is not configured.");
  const account = createAccount(privateKey as `0x${string}`);
  if (String(account.address).toLowerCase() !== EXPECTED_RELAYER) {
    throw new Error("GenLayer relayer policy does not match.");
  }
  const readClient = createClient({ chain: studionet, endpoint: GENLAYER_RPC_URL });
  const writeClient = createClient({ chain: studionet, endpoint: GENLAYER_RPC_URL, account });
  if (await writeClient.getChainId() !== studionet.id) throw new Error("Wrong GenLayer network.");
  return { readClient, writeClient };
}

async function signedCommitStatus(
  game: GameRow,
  round: RoundRow,
  signerAddress: string,
  transactionHash: string,
  commitment: string,
): Promise<"confirmed" | "pending" | "invalid" | "late"> {
  const { readClient } = await genlayerClients();
  // A finalized contract view is the authority for a signed commitment. It
  // also avoids a separate receipt lookup for every player during a burst.
  // Older deployed contracts lack the commitment field, so keep their receipt
  // verification path until those games finish.
  try {
    const state = await readClient.readContract({
      address: gameContract(game),
      functionName: "get_answer_state",
      args: [game.contract_game_id, round.position, signerAddress],
      stateStatus: "finalized",
    }) as Record<string, unknown>;
    if (typeof state.commitment === "string") {
      if (!round.started_at || !round.ends_at) return "invalid";
      return signedCommitStateResult(state, {
        commitment,
        startMs: Date.parse(round.started_at),
        endMs: Date.parse(round.ends_at),
      });
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (!/not found|timed out|fetch failed|ECONNRESET|bad gateway|service unavailable/i.test(message)) throw caught;
  }
  let receipt: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      receipt = await readClient.getTransaction({ hash: transactionHash });
    } catch (caught) {
      if (!/not found|timed out|fetch failed|ECONNRESET/i.test(caught instanceof Error ? caught.message : String(caught))) throw caught;
    }
    if (isTerminal(receipt)) break;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (!isTerminal(receipt)) return "pending";
  if (!round.started_at || !round.ends_at) return "invalid";
  return signedCommitResult(receipt, {
    contractAddress: gameContract(game),
    gameId: game.contract_game_id as string,
    roundIndex: round.position,
    signerAddress,
    commitment,
    startMs: Date.parse(round.started_at),
    endMs: Date.parse(round.ends_at),
  });
}

function numericMillis(value: unknown, label: string) {
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new Error(`GenLayer returned an invalid ${label}.`);
  }
  return milliseconds;
}

function gameContract(game: GameRow) {
  const address = game.contract_address ?? (game.contract_version === "v4" ? PREVIOUS_CONTRACT_ADDRESS : null);
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Game contract is missing.");
  return address as `0x${string}`;
}

function usesTwoStepActivation(game: GameRow) {
  return TWO_STEP_ACTIVATION_CONTRACTS.has(gameContract(game).toLowerCase());
}

async function scheduleRegisteredGame(
  db: DatabaseClient,
  game: GameRow,
  readClient: GenLayerReadClient,
) {
  const contractGame = await readClient.readContract({
    address: gameContract(game),
    functionName: "get_game",
    args: [game.contract_game_id],
    stateStatus: "finalized",
  }) as Record<string, unknown>;
  const startMs = numericMillis(contractGame.start_ms, "game start");
  if (startMs - Date.now() < 30_000) {
    await db.from("landmark_games").update({
      status: "error",
      error_message: "The board arrived too late. Make a new lobby.",
      updated_at: new Date().toISOString(),
    }).eq("id", game.id).eq("status", "registering");
    return;
  }
  const windows = await Promise.all(game.plan.map(async (_round, position) => {
    const value = await readClient.readContract({
      address: gameContract(game),
      functionName: "get_round_window",
      args: [game.contract_game_id, position],
      stateStatus: "finalized",
    }) as Record<string, unknown>;
    return {
      position,
      startMs: numericMillis(value.start_ms, "round start"),
      commitDeadlineMs: numericMillis(value.commit_deadline_ms, "commit deadline"),
      revealDeadlineMs: numericMillis(value.reveal_deadline_ms, "reveal deadline"),
      finalizeAfterMs: numericMillis(value.finalize_after_ms, "finalize deadline"),
    };
  }));
  if (windows[0]?.startMs !== startMs) throw new Error("GenLayer returned an inconsistent game schedule.");

  await Promise.all(windows.map(async (window) => {
    const { error } = await db.from("landmark_game_rounds").update({
      started_at: new Date(window.startMs).toISOString(),
      ends_at: new Date(window.commitDeadlineMs).toISOString(),
      reveal_deadline: new Date(window.revealDeadlineMs).toISOString(),
      finalize_after: new Date(window.finalizeAfterMs).toISOString(),
    }).eq("game_id", game.id).eq("position", window.position);
    if (error) throw error;
  }));
  const { error } = await db.from("landmark_games").update({
    started_at: new Date(startMs).toISOString(),
    next_check_at: new Date(startMs).toISOString(),
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq("id", game.id).eq("status", "registering");
  if (error) throw error;
}

async function syncScheduledClock(db: DatabaseClient, game: GameRow) {
  const { data, error } = await db.from("landmark_game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .order("position", { ascending: true });
  if (error) throw error;
  const rounds = (data ?? []) as RoundRow[];
  if (!rounds.length || rounds.some((round) => !round.started_at || !round.ends_at)) return;
  const nowMs = Date.now();
  const firstStartMs = Date.parse(rounds[0].started_at as string);
  const lastEndMs = Date.parse(rounds[rounds.length - 1].ends_at as string);
  if (nowMs < firstStartMs) return;

  const current = rounds.reduce((selected, round) => {
    const start = Date.parse(round.started_at as string);
    return start <= nowMs ? round.position : selected;
  }, 0);
  const verifying = nowMs > lastEndMs;
  const activeRound = rounds.find((round) => round.position === current);
  if (activeRound?.status === "queued" && nowMs <= Date.parse(activeRound.ends_at as string)) {
    const { error: roundError } = await db.from("landmark_game_rounds")
      .update({ status: "open" })
      .eq("id", activeRound.id)
      .eq("status", "queued");
    if (roundError) throw roundError;
  }
  const change = scheduledClockChange(game, current, verifying);
  if (!change) return;
  const { error: gameError } = await db.from("landmark_games").update({
    ...change,
    next_check_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", game.id).eq("status", game.status).eq("current_round", game.current_round);
  if (gameError) throw gameError;
}

async function sendRevealBatch(
  db: DatabaseClient,
  game: GameRow,
  writeClient: GenLayerWriteClient,
  due: RoundRow,
) {
  const restoreStatus = due.status === "revealed" ? "revealed" : "open";
  const { data: round } = await db.from("landmark_game_rounds")
    .update({
      status: "revealing",
      reveal_transaction_hash: null,
      pending_reveal_answer_count: null,
      next_check_at: new Date(Date.now() + 5_000).toISOString(),
    })
    .eq("id", due.id)
    .eq("status", due.status)
    .select("*")
    .maybeSingle();
  if (!round) return;

  try {
    const [{ data: players, error: playersError }, { data: answers, error: answersError }] = await Promise.all([
      db.from("landmark_game_players").select("id,signer_address").eq("game_id", game.id),
      db.from("landmark_game_answers").select("player_id,choice_index,reveal_salt").eq("round_id", round.id),
    ]);
    if (playersError || answersError) throw playersError ?? answersError;
    const signers = new Map((players ?? []).map((player) => [player.id, player.signer_address]));
    const reveals = (answers ?? []).flatMap((answer) => {
      const playerAddress = signers.get(answer.player_id);
      return typeof playerAddress === "string" && typeof answer.reveal_salt === "string"
        ? [{ player_address: playerAddress, choice_index: answer.choice_index, salt: answer.reveal_salt }]
        : [];
    });
    const transactionHash = await writeClient.writeContract({
      address: gameContract(game),
      functionName: "reveal_answers",
      // Deterministic reveal transport only. XP remains gated by the separate
      // non-leader-only finalize_round transaction below.
      leaderOnly: true,
      args: [game.contract_game_id, round.position, JSON.stringify(reveals)],
      value: 0n,
    });
    const { error: updateError } = await db.from("landmark_game_rounds").update({
      reveal_transaction_hash: transactionHash,
      pending_reveal_answer_count: reveals.length,
      next_check_at: new Date(Date.now() + 5_000).toISOString(),
      error_message: null,
    }).eq("id", round.id).eq("status", "revealing");
    if (updateError) throw updateError;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await db.from("landmark_game_rounds").update({
      status: restoreStatus,
      next_check_at: new Date(Date.now() + 8_000).toISOString(),
      error_message: message.slice(0, 500),
    }).eq("id", round.id).eq("status", "revealing");
  }
}

async function submitDueReveal(db: DatabaseClient, game: GameRow, writeClient: GenLayerWriteClient) {
  // Signed answer details are staged before finality checks. Reveal early
  // enough to leave room for a supplemental batch if some commits lag.
  const dueAt = new Date(Date.now() - 10_000).toISOString();
  const { data: due, error } = await db.from("landmark_game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .in("status", ["queued", "open"])
    .lte("ends_at", dueAt)
    .or(`next_check_at.is.null,next_check_at.lte.${new Date().toISOString()}`)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (due) await sendRevealBatch(db, game, writeClient, due as RoundRow);
}

async function submitSupplementalReveal(db: DatabaseClient, game: GameRow, writeClient: GenLayerWriteClient) {
  const { data: revealed, error } = await db.from("landmark_game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .eq("status", "revealed")
    .gt("reveal_deadline", new Date(Date.now() + 10_000).toISOString())
    .or(`next_check_at.is.null,next_check_at.lte.${new Date().toISOString()}`)
    .order("position", { ascending: true });
  if (error) throw error;
  for (const round of (revealed ?? []) as RoundRow[]) {
    const { count, error: countError } = await db.from("landmark_game_answers")
      .select("id", { count: "exact", head: true })
      .eq("round_id", round.id);
    if (countError) throw countError;
    if (!needsSupplementalReveal(count ?? 0, round.reveal_answer_count)) continue;
    await sendRevealBatch(db, game, writeClient, round);
    return;
  }
}

async function checkRevealReceipt(db: DatabaseClient, game: GameRow, readClient: GenLayerReadClient) {
  const now = new Date().toISOString();
  const { data: round, error } = await db.from("landmark_game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .eq("status", "revealing")
    .not("reveal_transaction_hash", "is", null)
    .lte("next_check_at", now)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !round?.reveal_transaction_hash) return;
  await db.from("landmark_game_rounds").update({
    next_check_at: new Date(Date.now() + 6_000).toISOString(),
  }).eq("id", round.id).eq("status", "revealing").lte("next_check_at", now);
  let receipt: unknown;
  try {
    receipt = await readClient.getTransaction({ hash: round.reveal_transaction_hash });
  } catch (caught) {
    if (/not found|timed out/i.test(caught instanceof Error ? caught.message : String(caught))) return;
    throw caught;
  }
  if (!isTerminal(receipt)) return;
  if (hasSuccessfulFinalizedExecution(receipt)) {
    const counts = revealExecutionCounts(receipt);
    const acceptedCount = counts && counts.submitted === round.pending_reveal_answer_count
      ? Math.min(30, round.reveal_answer_count + counts.newlyRevealed)
      : round.pending_reveal_answer_count ?? round.reveal_answer_count;
    const { error: updateError } = await db.from("landmark_game_rounds").update({
      status: "revealed",
      consensus_status: statusName(receipt),
      reveal_answer_count: acceptedCount,
      pending_reveal_answer_count: null,
      reveal_confirmed_at: new Date().toISOString(),
      next_check_at: null,
      error_message: null,
    }).eq("id", round.id).eq("status", "revealing");
    if (updateError) throw updateError;
    return;
  }

  const canRetry = Date.now() < Date.parse(round.reveal_deadline as string);
  const conciseError = canRetry ? "Answer reveal is retrying." : "Answers could not be revealed.";
  if (canRetry || round.reveal_confirmed_at) {
    const { error: retryError } = await db.from("landmark_game_rounds").update({
      status: round.reveal_confirmed_at ? "revealed" : "open",
      reveal_transaction_hash: null,
      pending_reveal_answer_count: null,
      consensus_status: statusName(receipt),
      next_check_at: canRetry ? new Date(Date.now() + 8_000).toISOString() : null,
      error_message: conciseError,
    }).eq("id", round.id).eq("status", "revealing");
    if (retryError) throw retryError;
    return;
  }
  await Promise.all([
    db.from("landmark_game_rounds").update({
      status: "failed",
      consensus_status: statusName(receipt),
      next_check_at: null,
      error_message: conciseError,
    }).eq("id", round.id).eq("status", "revealing"),
    db.from("landmark_games").update({
      status: "error",
      error_message: conciseError,
      updated_at: new Date().toISOString(),
    }).eq("id", game.id),
  ]);
}

async function submitDueFinalization(
  db: DatabaseClient,
  game: GameRow,
  writeClient: GenLayerWriteClient,
) {
  const now = new Date().toISOString();
  const { data: due, error } = await db.from("landmark_game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .eq("status", "revealed")
    .lte("finalize_after", now)
    .or(`next_check_at.is.null,next_check_at.lte.${now}`)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !due) return;
  const { data: round } = await db.from("landmark_game_rounds")
    .update({
      status: "finalizing",
      finalize_attempts: Math.min(3, due.finalize_attempts + 1),
      finalize_transaction_hash: null,
      next_check_at: new Date(Date.now() + 5_000).toISOString(),
    })
    .eq("id", due.id)
    .eq("status", "revealed")
    .select("*")
    .maybeSingle();
  if (!round) return;
  try {
    const transactionHash = await writeClient.writeContract({
      address: gameContract(game),
      functionName: "finalize_round",
      leaderOnly: false,
      args: [game.contract_game_id, round.position],
      value: 0n,
    });
    const { error: updateError } = await db.from("landmark_game_rounds").update({
      finalize_transaction_hash: transactionHash,
      transaction_hash: transactionHash,
      next_check_at: new Date(Date.now() + 5_000).toISOString(),
      error_message: null,
    }).eq("id", round.id).eq("status", "finalizing");
    if (updateError) throw updateError;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await db.from("landmark_game_rounds").update({
      status: "revealed",
      next_check_at: new Date(Date.now() + 8_000).toISOString(),
      error_message: message.slice(0, 500),
    }).eq("id", round.id).eq("status", "finalizing");
  }
}

async function checkFinalizationReceipt(
  db: DatabaseClient,
  game: GameRow,
  readClient: GenLayerReadClient,
) {
  const now = new Date().toISOString();
  const { data: round, error } = await db.from("landmark_game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .eq("status", "finalizing")
    .not("finalize_transaction_hash", "is", null)
    .lte("next_check_at", now)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !round?.finalize_transaction_hash) return;
  await db.from("landmark_game_rounds").update({
    next_check_at: new Date(Date.now() + 6_000).toISOString(),
  }).eq("id", round.id).eq("status", "finalizing").lte("next_check_at", now);
  let receipt: unknown;
  try {
    receipt = await readClient.getTransaction({ hash: round.finalize_transaction_hash });
  } catch (caught) {
    if (/not found|timed out/i.test(caught instanceof Error ? caught.message : String(caught))) return;
    throw caught;
  }
  if (!isTerminal(receipt)) return;
  if (!hasGenuineConsensus(receipt)) {
    const result = receipt && typeof receipt === "object" ? receipt as Record<string, unknown> : {};
    const resultName = String(result.resultName ?? result.result_name ?? statusName(receipt));
    if (round.finalize_attempts < 3) {
      const { error: retryError } = await db.from("landmark_game_rounds").update({
        status: "revealed",
        finalize_transaction_hash: null,
        transaction_hash: null,
        consensus_status: resultName,
        next_check_at: new Date(Date.now() + 15_000).toISOString(),
        error_message: "Validators are retrying this round.",
      }).eq("id", round.id).eq("status", "finalizing");
      if (retryError) throw retryError;
      return;
    }
    const failure = executionFailureReason(receipt);
    const reason = failure?.startsWith("[EXTERNAL]")
      ? "The round source could not be verified. No XP awarded."
      : "Validators could not agree. No XP awarded.";
    const { error: voidError } = await db.rpc("landmark_void_round_v4", {
      p_round_id: round.id,
      p_consensus_status: resultName,
      p_reason: reason,
    });
    if (voidError) throw voidError;
    return;
  }
  const result = await readClient.readContract({
    address: gameContract(game),
    functionName: "get_round_result",
    args: [game.contract_game_id, round.position],
    stateStatus: "finalized",
  }) as Record<string, unknown>;
  const scores = Array.isArray(result.scores) ? result.scores : [];
  const correctIndex = Number(result.correct_index);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    throw new Error("GenLayer returned an invalid round result.");
  }
  const { error: applyError } = await db.rpc("landmark_apply_round_settlement_v4", {
    p_round_id: round.id,
    p_correct_index: correctIndex,
    p_scores: scores,
    p_consensus_status: statusName(receipt),
  });
  if (applyError) throw applyError;
}

async function progressGame(db: DatabaseClient, originalGame: GameRow) {
  if (
    originalGame.status === "waiting"
    || originalGame.status === "finished"
    || originalGame.status === "error"
    || originalGame.contract_version !== "v4"
  ) return;
  const { readClient, writeClient } = await genlayerClients();
  let game = originalGame;

  if (game.status === "registering" && game.registration_tx_hash && !game.started_at) {
    const now = new Date().toISOString();
    const { data: claimed } = await db.from("landmark_games")
      .update({ next_check_at: new Date(Date.now() + 5_000).toISOString() })
      .eq("id", game.id)
      .eq("status", "registering")
      .or(`next_check_at.is.null,next_check_at.lte.${now}`)
      .select("*")
      .maybeSingle();
    if (!claimed) return;
    const twoStepActivation = usesTwoStepActivation(game);
    const transactionHash = twoStepActivation && game.activation_tx_hash
      ? game.activation_tx_hash
      : game.registration_tx_hash;
    let receipt: unknown;
    try {
      receipt = await readClient.getTransaction({ hash: transactionHash });
    } catch (caught) {
      if (/not found|timed out/i.test(caught instanceof Error ? caught.message : String(caught))) return;
      throw caught;
    }
    if (!isTerminal(receipt)) return;
    if (!hasSuccessfulFinalizedExecution(receipt)) {
      await db.from("landmark_games").update({
        status: "error",
        error_message: twoStepActivation && game.activation_tx_hash
          ? "The board could not start. Make a new lobby."
          : "The lobby could not be registered.",
        updated_at: new Date().toISOString(),
      }).eq("id", game.id);
      return;
    }
    if (twoStepActivation && !game.activation_tx_hash) {
      const activationHash = await writeClient.writeContract({
        address: gameContract(game),
        functionName: "activate_game",
        args: [game.contract_game_id],
        leaderOnly: true,
        value: 0n,
      });
      const { error } = await db.from("landmark_games").update({
        activation_tx_hash: activationHash,
        next_check_at: new Date(Date.now() + 3_000).toISOString(),
      }).eq("id", game.id).eq("status", "registering");
      if (error) throw error;
      return;
    }
    await scheduleRegisteredGame(db, game, readClient);
  }

  const { data: freshGame, error: freshError } = await db.from("landmark_games")
    .select("*")
    .eq("id", game.id)
    .single();
  if (freshError) throw freshError;
  game = freshGame as GameRow;
  await syncScheduledClock(db, game);
  await Promise.all([
    checkRevealReceipt(db, game, readClient),
    checkFinalizationReceipt(db, game, readClient),
  ]);
  const { data: checkedGame, error: checkedError } = await db.from("landmark_games")
    .select("status")
    .eq("id", game.id)
    .single();
  if (checkedError) throw checkedError;
  if (checkedGame.status === "error" || checkedGame.status === "finished") return;
  await submitDueReveal(db, game, writeClient);
  await submitSupplementalReveal(db, game, writeClient);
  await submitDueFinalization(db, game, writeClient);
}

async function tickGames(db: DatabaseClient) {
  const now = new Date().toISOString();
  const { data: due, error } = await db.from("landmark_games")
    .select("*")
    .in("status", ["registering", "running", "verifying"])
    .or(`worker_next_at.is.null,worker_next_at.lte.${now}`)
    .order("worker_next_at", { ascending: true, nullsFirst: true })
    .limit(3);
  if (error) throw error;
  let progressed = 0;
  for (const candidate of (due ?? []) as GameRow[]) {
    // Claim a game before making any GenLayer calls. A browser refresh and a
    // second cron invocation can still race safely with the per-round CAS.
    const { data: claimed, error: claimError } = await db.from("landmark_games")
      .update({ worker_next_at: new Date(Date.now() + 25_000).toISOString() })
      .eq("id", candidate.id)
      .or(`worker_next_at.is.null,worker_next_at.lte.${now}`)
      .select("*")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;
    try {
      await progressGame(db, claimed as GameRow);
      progressed += 1;
    } catch (caught) {
      console.error(`[landmark-tick] ${candidate.id}: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }
  return { progressed };
}

async function gameState(db: DatabaseClient, gameId: string, playerId: string | null) {
  const [{ data: game, error: gameError }, { data: players, error: playersError }, { data: rounds, error: roundsError }] = await Promise.all([
    db.from("landmark_games").select("*").eq("id", gameId).single(),
    db.from("landmark_game_players").select("*").eq("game_id", gameId).order("score", { ascending: false }).order("joined_at", { ascending: true }),
    db.from("landmark_game_rounds").select("*").eq("game_id", gameId).order("position", { ascending: true }),
  ]);
  if (gameError || playersError || roundsError) throw gameError ?? playersError ?? roundsError;
  const currentGame = game as GameRow;
  const player = playerId
    ? (players as PlayerRow[]).find((entry) => entry.id === playerId) ?? null
    : null;
  if (playerId && !player) throw new Error("INVALID_SESSION");

  const { data: playerAnswers, error: answersError } = player
    ? await db.from("landmark_game_answers")
      .select("round_id,choice_index,correct,awarded_points")
      .eq("player_id", player.id)
    : { data: [], error: null };
  if (answersError) throw answersError;
  const answerByRound = new Map((playerAnswers ?? []).map((answer) => [answer.round_id, answer]));
  const settledPositions = new Map(
    (rounds as RoundRow[])
      .filter((round) => round.status === "settled")
      .map((round) => [round.id, round.position]),
  );
  const lastResult = (playerAnswers ?? [])
    .flatMap((answer) => {
      const position = settledPositions.get(answer.round_id);
      return position === undefined ? [] : [{
        position,
        verdict: answer.correct === null ? "not_counted" : answer.correct ? "right" : "wrong",
        awardedXp: answer.awarded_points ?? 0,
      }];
    })
    .sort((a, b) => b.position - a.position)[0] ?? null;

  let currentRound: Record<string, unknown> | null = null;
  if (currentGame.status === "running" && currentGame.current_round >= 0 && currentGame.current_round < currentGame.round_count) {
    const round = (rounds as RoundRow[]).find((entry) => entry.position === currentGame.current_round);
    const challenge = currentGame.plan[currentGame.current_round];
    if (round && challenge) {
      const answer = player
        ? (await db
          .from("landmark_game_answers")
          .select("choice_index,commit_verified_at")
          .eq("round_id", round.id)
          .eq("player_id", player.id)
          .maybeSingle()).data
        : null;
      currentRound = {
        id: round.id,
        position: round.position,
        status: round.status,
        ...activeChallenge(challenge),
        startedAt: round.started_at,
        endsAt: round.ends_at,
        revealFallbackAt: round.ends_at
          ? new Date(Date.parse(round.ends_at) + 45_000).toISOString()
          : null,
        revealDeadline: round.reveal_deadline,
        selectedIndex: answer?.commit_verified_at ? answer.choice_index : null,
      };
    }
  }

  const board = (players as PlayerRow[]).map((entry, index) => ({
    rank: index + 1,
    id: entry.id,
    displayName: entry.display_name,
    score: entry.score,
    isHost: entry.is_host,
    isYou: entry.id === player?.id,
  }));
  const settledRounds = (rounds as RoundRow[]).filter((round) => round.status === "settled").length;
  const voidRounds = (rounds as RoundRow[]).filter((round) => round.status === "void").length;
  const pendingRounds = (rounds as RoundRow[]).filter((round) => [
    "revealing", "revealed", "finalizing", "submitting", "pending",
  ].includes(round.status)).length;
  const leadingPlayer = currentGame.winner_player_id
    ? board.find((entry) => entry.id === currentGame.winner_player_id) ?? null
    : null;
  const winner = leadingPlayer && leadingPlayer.score > 0 ? leadingPlayer : null;
  const roundRecap = (rounds as RoundRow[])
    .filter((round) => (round.status === "settled" && round.correct_index !== null) || round.status === "void")
    .map((round) => {
      const challenge = currentGame.plan[round.position];
      const answer = answerByRound.get(round.id);
      return {
        position: round.position,
        kind: challenge.kind,
        question: challenge.question,
        options: challenge.options,
        correctIndex: round.status === "void" ? null : round.correct_index,
        correctAnswer: round.status === "void" ? null : challenge.options[round.correct_index as number],
        sourceLabel: challenge.sourceLabel ?? null,
        sourceUrl: challenge.sourceUrl ?? null,
        creditUrl: challenge.creditUrl ?? null,
        choiceIndex: answer?.choice_index ?? null,
        verdict: round.status === "void" ? "void" : !player ? null : answer?.correct === true ? "right" : answer?.correct === false ? "wrong" : "not_counted",
        awardedXp: answer?.awarded_points ?? 0,
      };
    });

  return {
    code: currentGame.code,
    realtimeGameId: currentGame.id,
    status: currentGame.status,
    startsAt: currentGame.started_at,
    isHost: player?.is_host ?? false,
    maxPlayers: currentGame.max_players,
    pack: currentGame.pack ?? "mixed",
    playerCount: board.length,
    roundCount: currentGame.round_count,
    currentRoundIndex: currentGame.current_round,
    settledRounds,
    voidRounds,
    pendingRounds,
    lastResult,
    roundRecap,
    currentRound,
    nextRoundStartsAt: currentGame.status === "running"
      ? (rounds as RoundRow[]).find((round) => round.position === currentGame.current_round + 1)?.started_at ?? null
      : null,
    leaderboard: board,
    winner,
    error: currentGame.error_message,
    contractAddress: currentGame.contract_address,
    contractGameId: currentGame.contract_game_id,
    contractVersion: currentGame.contract_version,
  };
}

async function gameResults(db: DatabaseClient, body: Record<string, unknown>) {
  const code = normalizeCode(body.code);
  if (!code) return json({ error: "Invalid game code." }, 400);
  const { data: game, error } = await db
    .from("landmark_games")
    .select("id,status")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!game) return json({ error: "Game not found." }, 404);
  if (game.status !== "finished") return json({ error: "Results not ready." }, 409);
  return json(await gameState(db, game.id, null));
}

async function entryResponse(
  db: DatabaseClient,
  game: { id: string; code: string },
  player: { id: string },
  playerToken: string,
  clientToken: boolean,
  status = 200,
) {
  // New clients fetch the board separately. Admission should not wait on
  // several unrelated state queries while a room is filling up.
  const body = clientToken
    ? { code: game.code, playerToken }
    : { playerToken, ...(await gameState(db, game.id, player.id)) };
  return json(body, status);
}

async function createLobby(db: DatabaseClient, body: Record<string, unknown>) {
  const playerKey = normalizePlayerKey(body.playerId);
  const displayName = normalizeName(body.displayName);
  const signerAddress = normalizeSignerAddress(body.signerAddress);
  const pack = normalizePack(body.pack ?? "mixed");
  if (!playerKey || !displayName || !signerAddress || !pack) return json({ error: "Check the player name and game pack." }, 400);
  const requestedToken = normalizeToken(body.playerToken);
  const playerToken = requestedToken ?? createToken();
  const playerTokenHash = await sha256Hex(`landmark-token:${playerToken}`);
  const playerHash = await sha256Hex(`find-the-landmark:${playerKey}`);

  async function existingCreate() {
    const { data: game, error: gameError } = await db.from("landmark_games")
      .select("id,code,host_player_key")
      .eq("host_player_key", playerKey)
      .maybeSingle();
    if (gameError) throw gameError;
    if (!game) return null;
    const { data: player, error: playerError } = await db.from("landmark_game_players")
      .select("id,player_token_hash,signer_address,is_host")
      .eq("game_id", game.id)
      .eq("player_key", playerKey)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) return json({ error: "Lobby creation is still finishing. Try again." }, 503);
    if (!player.is_host || player.player_token_hash !== playerTokenHash || player.signer_address !== signerAddress) {
      return json({ error: "This player already has a lobby." }, 409);
    }
    return entryResponse(db, game, player, playerToken, Boolean(requestedToken));
  }

  const previous = await existingCreate();
  if (previous) return previous;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = createCode();
    const { data: game, error: gameError } = await db
      .from("landmark_games")
      .insert({
        code,
        host_player_key: playerKey,
        contract_version: "v4",
        contract_address: CURRENT_CONTRACT_ADDRESS,
        pack,
      })
      .select("*")
      .single();
    if (gameError) {
      if (gameError.code === "23505") {
        const recovered = await existingCreate();
        if (recovered) return recovered;
        continue;
      }
      throw gameError;
    }
    const { data: player, error: playerError } = await db
      .from("landmark_game_players")
      .insert({
        game_id: game.id,
        player_key: playerKey,
        player_hash: playerHash,
        signer_address: signerAddress,
        player_token_hash: playerTokenHash,
        display_name: displayName,
        is_host: true,
      })
      .select("*")
      .single();
    if (playerError) {
      await db.from("landmark_games").delete().eq("id", game.id);
      throw playerError;
    }
    return entryResponse(db, game, player, playerToken, Boolean(requestedToken), 201);
  }
  return json({ error: "Could not create a lobby code." }, 503);
}

async function joinLobby(db: DatabaseClient, body: Record<string, unknown>) {
  const code = normalizeCode(body.code);
  const playerKey = normalizePlayerKey(body.playerId);
  const displayName = normalizeName(body.displayName);
  const signerAddress = normalizeSignerAddress(body.signerAddress);
  if (!code || !playerKey || !displayName || !signerAddress) return json({ error: "Check the lobby code and player name." }, 400);
  const { data: game, error: gameError } = await db.from("landmark_games")
    .select("id,code,status,contract_version")
    .eq("code", code)
    .maybeSingle();
  if (gameError) throw gameError;
  if (!game) return json({ error: "Lobby not found." }, 404);

  const requestedToken = normalizeToken(body.playerToken);
  const playerToken = requestedToken ?? createToken();
  const playerTokenHash = await sha256Hex(`landmark-token:${playerToken}`);
  const playerHash = await sha256Hex(`find-the-landmark:${playerKey}`);

  async function existingJoin() {
    const { data: existing, error } = await db
    .from("landmark_game_players")
    .select("id,player_token_hash,signer_address")
    .eq("game_id", game.id)
    .eq("player_key", playerKey)
    .maybeSingle();
    if (error) throw error;
    if (!existing) return null;
    if (existing.player_token_hash !== playerTokenHash || existing.signer_address !== signerAddress) {
      return json({ error: "This player has already joined." }, 409);
    }
    // A timed-out response may arrive after the host starts. The same player
    // can still recover their admission, but no new player can enter.
    return entryResponse(db, game, existing, playerToken, Boolean(requestedToken));
  }

  const previous = await existingJoin();
  if (previous) return previous;
  if (game.status !== "waiting") return json({ error: "That game has already started." }, 409);
  if (game.contract_version !== "v4") return json({ error: "Make a new lobby." }, 409);

  const { data: player, error } = await db
    .from("landmark_game_players")
    .insert({
      game_id: game.id,
      player_key: playerKey,
      player_hash: playerHash,
      signer_address: signerAddress,
      player_token_hash: playerTokenHash,
      display_name: displayName,
      is_host: false,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const recovered = await existingJoin();
      if (recovered) return recovered;
      return json({ error: "Name already taken." }, 409);
    }
    if (/lobby is full/i.test(error.message)) return json({ error: "Lobby is full." }, 409);
    if (/game already started/i.test(error.message)) return json({ error: "That game has already started." }, 409);
    throw error;
  }
  return entryResponse(db, game, player, playerToken, Boolean(requestedToken));
}

async function startGame(
  db: DatabaseClient,
  game: GameRow,
  player: PlayerRow,
) {
  if (!player.is_host) return json({ error: "Only the host can start." }, 403);
  if (game.status !== "waiting") return json({ error: "The game has already started." }, 409);
  const { data: players, error: playersError } = await db
    .from("landmark_game_players")
    .select("*")
    .eq("game_id", game.id)
    .order("joined_at", { ascending: true });
  if (playersError || !players?.length) throw playersError ?? new Error("Lobby has no players.");
  if (players.length < 2) return json({ error: "Need 2 players." }, 409);
  if ((players as PlayerRow[]).some((entry) => !normalizeSignerAddress(entry.signer_address))) {
    return json({ error: "A player must rejoin this lobby." }, 409);
  }
  const plan = await Promise.all(createGamePlan(game.pack ?? "mixed").map(async (round) => {
    if (round.kind !== "identify") return round;
    if (!round.image) throw new Error("Round image is missing.");
    return { ...round, ...(await mirrorRoundEvidence(db, round.image)) };
  }));
  const onchainPlan = contractPlan(plan);
  const contractGameId = `game-${game.id}`;
  const planText = JSON.stringify(onchainPlan);
  const rosterText = JSON.stringify((players as PlayerRow[]).map((entry) => entry.signer_address));

  const contractAddress = gameContract(game);
  const { data: claimedGame, error: gameError } = await db
    .from("landmark_games")
    .update({
      status: "registering",
      plan,
      plan_hash: await sha256Hex(planText),
      contract_game_id: contractGameId,
      contract_version: "v4",
      contract_address: contractAddress,
      round_count: plan.length,
      next_check_at: new Date(Date.now() + 4_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", game.id)
    .eq("status", "waiting")
    .select("id")
    .maybeSingle();
  if (gameError) throw gameError;
  if (!claimedGame) return json({ error: "The game has already started." }, 409);

  const { error: roundsError } = await db.from("landmark_game_rounds").insert(
    plan.map((round, position) => ({
      game_id: game.id,
      position,
      kind: round.kind,
      challenge_id: round.challengeId,
    })),
  );
  if (roundsError) {
    await db.from("landmark_games").update({
      status: "error",
      error_message: "The board could not be created.",
      updated_at: new Date().toISOString(),
    }).eq("id", game.id);
    throw roundsError;
  }

  try {
    const { writeClient } = await genlayerClients();
    let transactionHash = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        transactionHash = await writeClient.writeContract({
          address: contractAddress,
          functionName: "register_game",
          leaderOnly: true,
          args: [contractGameId, rosterText, planText],
          value: 0n,
        });
        break;
      } catch (caught) {
        // Studio occasionally returns an HTML gateway page before it can
        // produce a transaction hash. Retry that transport failure only.
        const message = caught instanceof Error ? caught.message : String(caught);
        if (attempt === 2 || !/unexpected token '<'|not valid JSON/i.test(message)) throw caught;
        await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
      }
    }
    if (!transactionHash) throw new Error("StudioNet did not return a registration transaction.");
    const { error } = await db.from("landmark_games").update({
      registration_tx_hash: transactionHash,
      next_check_at: new Date(Date.now() + 3_000).toISOString(),
    }).eq("id", game.id);
    if (error) throw error;
    console.log(JSON.stringify({ event: "lobby_registered", gameId: contractGameId, transactionHash }));
  } catch (caught) {
    await db.from("landmark_games").update({
      status: "error",
      error_message: "The game could not start.",
      updated_at: new Date().toISOString(),
    }).eq("id", game.id);
    throw caught;
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const rawBody = await request.text();
  if (rawBody.length > 20_000) return json({ error: "Unauthorized request." }, 401);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  if (body.action === "tick") {
    const token = request.headers.get("x-landmark-cron-token") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token) || Object.keys(body).length !== 1) {
      return json({ error: "Unauthorized request." }, 401);
    }
    try {
      const db = database();
      const { data, error } = await db.from("landmark_cron_auth").select("token_hash").eq("id", 1).single();
      if (error || data?.token_hash !== await sha256Hex(token)) {
        return json({ error: "Unauthorized request." }, 401);
      }
      return json(await tickGames(db));
    } catch (caught) {
      console.error(`[landmark-tick] ${caught instanceof Error ? caught.message : String(caught)}`);
      return json({ error: "Game progress unavailable." }, 502);
    }
  }

  const nonce = await authenticate(request, rawBody);
  if (!nonce) return json({ error: "Unauthorized request." }, 401);

  try {
    const db = database();
    if (!(await claimNonce(db, nonce))) return json({ error: "Unauthorized request." }, 401);
    await enforceRateLimit(db, body);
    if (body.action === "create") return await createLobby(db, body);
    if (body.action === "join") return await joinLobby(db, body);
    if (body.action === "results") return await gameResults(db, body);

    const { game, player } = await requireSession(db, body);
    if (body.action === "start") {
      const response = await startGame(db, game, player);
      if (response) return response;
    } else if (body.action === "answer") {
      if (!["running", "verifying"].includes(game.status) || game.contract_version !== "v4") {
        return json({ error: "There is no open round." }, 409);
      }
      const choiceIndex = Number(body.choiceIndex);
      const roundIndex = Number(body.roundIndex);
      const commitment = normalizeDigest(body.commitment);
      const revealSalt = normalizeDigest(body.revealSalt);
      const commitTransactionHash = normalizeTransactionHash(body.commitTransactionHash);
      const signerAddress = normalizeSignerAddress(player.signer_address);
      if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) {
        return json({ error: "Choose one answer." }, 400);
      }
      if (
        !Number.isInteger(roundIndex)
        || roundIndex < 0
        || roundIndex >= game.round_count
        || !commitment
        || !revealSalt
        || !commitTransactionHash
        || !signerAddress
        || !game.contract_game_id
      ) return json({ error: "Answer proof is invalid." }, 400);
      const expectedCommitment = await sha256Hex(
        `ftl:v4:${game.contract_game_id}:${roundIndex}:${signerAddress}:${choiceIndex}:${revealSalt}`,
      );
      if (expectedCommitment !== commitment) return json({ error: "Answer proof is invalid." }, 400);
      const { data: round } = await db
        .from("landmark_game_rounds")
        .select("*")
        .eq("game_id", game.id)
        .eq("position", roundIndex)
        .maybeSingle();
      if (!round?.started_at || !round.ends_at || !round.reveal_deadline) {
        return json({ error: "Round unavailable." }, 409);
      }
      if (["settled", "void", "failed"].includes(round.status)) {
        return json({ error: "The round result is already final." }, 409);
      }
      const { data: existing } = await db.from("landmark_game_answers")
        .select("id,commitment,choice_index,commit_transaction_hash,commit_verified_at")
        .eq("round_id", round.id)
        .eq("player_id", player.id)
        .maybeSingle();
      if (existing) {
        if (existing.commitment !== commitment || existing.choice_index !== choiceIndex
          || (!existing.commit_verified_at && existing.commit_transaction_hash !== commitTransactionHash)) {
          return json({ error: "Answer already locked." }, 409);
        }
        if (existing.commit_verified_at) {
          return json({ accepted: true, roundId: round.id, selectedIndex: choiceIndex });
        }
      }
      if (Date.now() > Date.parse(round.reveal_deadline)) {
        return json({ error: "The answer reveal window has closed." }, 409);
      }
      const stagedAnswer = usesTwoStepActivation(game);
      if (stagedAnswer && !existing) {
        // Queue the signed preimage before the finalized commitment read, which
        // can lag under a large player burst. The contract still accepts a
        // reveal only when it matches that player's onchain commitment.
        const { error: stageError } = await db.from("landmark_game_answers").insert({
          game_id: game.id,
          round_id: round.id,
          player_id: player.id,
          choice_index: choiceIndex,
          elapsed_ms: 0,
          signer_address: signerAddress,
          commitment,
          commit_transaction_hash: commitTransactionHash,
          reveal_salt: revealSalt,
        });
        if (stageError) {
          if (stageError.code === "23505") return json({ error: "Answer is still confirming onchain." }, 503);
          throw stageError;
        }
      }
      const commitStatus = await signedCommitStatus(
        game, round as RoundRow, signerAddress, commitTransactionHash, commitment,
      );
      if (commitStatus === "pending") return json({ error: "Answer is still confirming onchain." }, 503);
      if (commitStatus === "late" || commitStatus === "invalid") {
        if (stagedAnswer) {
          const { error: deleteError } = await db.from("landmark_game_answers")
            .delete()
            .eq("round_id", round.id)
            .eq("player_id", player.id)
            .eq("commitment", commitment)
            .is("commit_verified_at", null);
          if (deleteError) throw deleteError;
        }
        return json({ error: commitStatus === "late"
          ? "Answer was too late onchain."
          : "Answer did not confirm onchain." }, 409);
      }
      if (stagedAnswer) {
        const { error: confirmError } = await db.from("landmark_game_answers")
          .update({ commit_verified_at: new Date().toISOString() })
          .eq("round_id", round.id)
          .eq("player_id", player.id)
          .eq("commitment", commitment);
        if (confirmError) throw confirmError;
        return json({ accepted: true, roundId: round.id, selectedIndex: choiceIndex });
      }
      const { error } = await db.from("landmark_game_answers").insert({
        game_id: game.id,
        round_id: round.id,
        player_id: player.id,
        choice_index: choiceIndex,
        elapsed_ms: 0,
        signer_address: signerAddress,
        commitment,
        commit_transaction_hash: commitTransactionHash,
        commit_verified_at: new Date().toISOString(),
        reveal_salt: revealSalt,
      });
      if (error) {
        if (error.code === "23505") return json({ error: "Answer already locked." }, 409);
        throw error;
      }
      return json({ accepted: true, roundId: round.id, selectedIndex: choiceIndex });
    } else if (body.action !== "state") {
      return json({ error: "Invalid action." }, 400);
    }

    // The cron worker owns GenLayer progress. Reads must remain cheap and
    // independent of RPC availability, especially while rounds settle.
    return json(await gameState(db, game.id, player.id));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (message === "GAME_NOT_FOUND") return json({ error: "Lobby not found." }, 404);
    if (message === "INVALID_SESSION") return json({ error: "Lobby session expired." }, 401);
    if (message === "RATE_LIMITED") return json({ error: "Slow down." }, 429);
    if (message === "INVALID_RATE_KEY") return json({ error: "Unauthorized request." }, 401);
    console.error(`[landmark-api] ${message === "[object Object]" ? JSON.stringify(caught) : message}`);
    return json({ error: "The lobby could not be updated." }, 502);
  }
});
