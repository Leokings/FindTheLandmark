import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  ColorSpace,
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.42";
import { verifyMessage } from "npm:viem@2.55.18";
import { contractPlan, createGamePlan, type GameRound } from "./content.ts";
import {
  executionFailureReason,
  hasGenuineConsensus,
  hasSuccessfulFinalizedExecution,
  isTerminal,
  statusName,
} from "./genlayer-receipt.ts";

const magickWasm = await Deno.readFile(
  new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42")),
);
await initializeImageMagick(magickWasm);

const V4_CONTRACT_ADDRESS = "0x0c8e2c3a10003654F76C9736391fa245F120672d";
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
  round_count: number;
  current_round: number;
  plan: GameRound[];
  contract_version: "v3" | "v4";
  contract_address: string | null;
  contract_game_id: string | null;
  registration_tx_hash: string | null;
  winner_player_id: string | null;
  next_check_at: string | null;
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
  status: "queued" | "open" | "revealing" | "revealed" | "finalizing" | "submitting" | "pending" | "settled" | "failed";
  started_at: string | null;
  ends_at: string | null;
  reveal_deadline: string | null;
  finalize_after: string | null;
  reveal_transaction_hash: string | null;
  finalize_transaction_hash: string | null;
  transaction_hash: string | null;
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
    ? { key: `answer:${playerKey}`, limit: 40 }
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

function numericMillis(value: unknown, label: string) {
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new Error(`GenLayer returned an invalid ${label}.`);
  }
  return milliseconds;
}

function gameContract(game: GameRow) {
  const address = game.contract_address ?? (game.contract_version === "v4" ? V4_CONTRACT_ADDRESS : null);
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Game contract is missing.");
  return address as `0x${string}`;
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
  const { error: gameError } = await db.from("landmark_games").update({
    status: verifying ? "verifying" : "running",
    current_round: verifying ? game.round_count : current,
    next_check_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", game.id).in("status", ["registering", "running", "verifying"]);
  if (gameError) throw gameError;
}

async function submitDueReveal(
  db: DatabaseClient,
  game: GameRow,
  writeClient: GenLayerWriteClient,
) {
  const now = new Date().toISOString();
  const { data: due, error } = await db.from("landmark_game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .in("status", ["queued", "open"])
    .lte("ends_at", now)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !due) return;
  const { data: round } = await db.from("landmark_game_rounds")
    .update({ status: "revealing", next_check_at: new Date(Date.now() + 5_000).toISOString() })
    .eq("id", due.id)
    .in("status", ["queued", "open"])
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
      next_check_at: new Date(Date.now() + 5_000).toISOString(),
      error_message: null,
    }).eq("id", round.id).eq("status", "revealing");
    if (updateError) throw updateError;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await db.from("landmark_game_rounds").update({
      status: "open",
      next_check_at: new Date(Date.now() + 8_000).toISOString(),
      error_message: message.slice(0, 500),
    }).eq("id", round.id).eq("status", "revealing");
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
    const { error: updateError } = await db.from("landmark_game_rounds").update({
      status: "revealed",
      consensus_status: statusName(receipt),
      next_check_at: null,
      error_message: null,
    }).eq("id", round.id).eq("status", "revealing");
    if (updateError) throw updateError;
    return;
  }

  const canRetry = Date.now() < Date.parse(round.reveal_deadline as string);
  const conciseError = canRetry ? "Answer reveal is retrying." : "Answers could not be revealed.";
  if (canRetry) {
    const { error: retryError } = await db.from("landmark_game_rounds").update({
      status: "open",
      reveal_transaction_hash: null,
      consensus_status: statusName(receipt),
      next_check_at: new Date(Date.now() + 8_000).toISOString(),
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
    .in("status", ["queued", "open", "revealing", "revealed"])
    .lte("finalize_after", now)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !due) return;
  const { data: round } = await db.from("landmark_game_rounds")
    .update({ status: "finalizing", next_check_at: new Date(Date.now() + 5_000).toISOString() })
    .eq("id", due.id)
    .in("status", ["queued", "open", "revealing", "revealed"])
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
    const failure = executionFailureReason(receipt);
    const conciseError = failure?.startsWith("[EXTERNAL]")
      ? "The round source could not be verified."
      : failure?.startsWith("[LLM_ERROR]")
      ? "Validators could not verify this round."
      : "Consensus did not finish.";
    await Promise.all([
      db.from("landmark_game_rounds").update({
        status: "failed",
        consensus_status: statusName(receipt),
        error_message: conciseError,
      }).eq("id", round.id),
      db.from("landmark_games").update({
        status: "error",
        error_message: conciseError,
        updated_at: new Date().toISOString(),
      }).eq("id", game.id),
    ]);
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
    let receipt: unknown;
    try {
      receipt = await readClient.getTransaction({ hash: game.registration_tx_hash });
    } catch (caught) {
      if (/not found|timed out/i.test(caught instanceof Error ? caught.message : String(caught))) return;
      throw caught;
    }
    if (!isTerminal(receipt)) return;
    if (!hasGenuineConsensus(receipt)) {
      await db.from("landmark_games").update({
        status: "error",
        error_message: "The lobby could not be registered.",
        updated_at: new Date().toISOString(),
      }).eq("id", game.id);
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
  await submitDueReveal(db, game, writeClient);
  await submitDueFinalization(db, game, writeClient);
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

  let currentRound: Record<string, unknown> | null = null;
  if (currentGame.status === "running" && currentGame.current_round >= 0 && currentGame.current_round < currentGame.round_count) {
    const round = (rounds as RoundRow[]).find((entry) => entry.position === currentGame.current_round);
    const challenge = currentGame.plan[currentGame.current_round];
    if (round && challenge) {
      const answer = player
        ? (await db
          .from("landmark_game_answers")
          .select("choice_index,submitted_at,commit_transaction_hash")
          .eq("round_id", round.id)
          .eq("player_id", player.id)
          .maybeSingle()).data
        : null;
      currentRound = {
        id: round.id,
        position: round.position,
        status: round.status,
        kind: challenge.kind,
        question: challenge.question,
        options: challenge.options,
        image: challenge.image ?? null,
        credit: challenge.credit ?? null,
        creditUrl: challenge.creditUrl ?? null,
        sourceLabel: challenge.sourceLabel ?? null,
        sourceUrl: challenge.sourceUrl ?? null,
        startedAt: round.started_at,
        endsAt: round.ends_at,
        revealFallbackAt: round.ends_at
          ? new Date(Date.parse(round.ends_at) + 45_000).toISOString()
          : null,
        revealDeadline: round.reveal_deadline,
        selectedIndex: answer?.choice_index ?? null,
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
  const pendingRounds = (rounds as RoundRow[]).filter((round) => [
    "revealing", "revealed", "finalizing", "submitting", "pending",
  ].includes(round.status)).length;
  const winner = currentGame.winner_player_id
    ? board.find((entry) => entry.id === currentGame.winner_player_id) ?? null
    : null;

  return {
    code: currentGame.code,
    realtimeGameId: currentGame.id,
    status: currentGame.status,
    isHost: player?.is_host ?? false,
    maxPlayers: currentGame.max_players,
    playerCount: board.length,
    roundCount: currentGame.round_count,
    currentRoundIndex: currentGame.current_round,
    settledRounds,
    pendingRounds,
    currentRound,
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

async function createLobby(db: DatabaseClient, body: Record<string, unknown>) {
  const playerKey = normalizePlayerKey(body.playerId);
  const displayName = normalizeName(body.displayName);
  const signerAddress = normalizeSignerAddress(body.signerAddress);
  if (!playerKey || !displayName || !signerAddress) return json({ error: "Enter a valid player name." }, 400);
  const playerToken = createToken();
  const playerTokenHash = await sha256Hex(`landmark-token:${playerToken}`);
  const playerHash = await sha256Hex(`find-the-landmark:${playerKey}`);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = createCode();
    const { data: game, error: gameError } = await db
      .from("landmark_games")
      .insert({
        code,
        host_player_key: playerKey,
        contract_version: "v4",
        contract_address: V4_CONTRACT_ADDRESS,
      })
      .select("*")
      .single();
    if (gameError) {
      if (gameError.code === "23505") continue;
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
    return json({ playerToken, ...(await gameState(db, game.id, player.id)) }, 201);
  }
  return json({ error: "Could not create a lobby code." }, 503);
}

async function joinLobby(db: DatabaseClient, body: Record<string, unknown>) {
  const code = normalizeCode(body.code);
  const playerKey = normalizePlayerKey(body.playerId);
  const displayName = normalizeName(body.displayName);
  const signerAddress = normalizeSignerAddress(body.signerAddress);
  if (!code || !playerKey || !displayName || !signerAddress) return json({ error: "Check the lobby code and player name." }, 400);
  const { data: game } = await db.from("landmark_games").select("*").eq("code", code).maybeSingle();
  if (!game) return json({ error: "Lobby not found." }, 404);
  if (game.status !== "waiting") return json({ error: "That game has already started." }, 409);
  if (game.contract_version !== "v4") return json({ error: "Make a new lobby." }, 409);

  const playerToken = createToken();
  const playerTokenHash = await sha256Hex(`landmark-token:${playerToken}`);
  const playerHash = await sha256Hex(`find-the-landmark:${playerKey}`);
  const { data: existing } = await db
    .from("landmark_game_players")
    .select("*")
    .eq("game_id", game.id)
    .eq("player_key", playerKey)
    .maybeSingle();
  if (existing) {
    const { data: player, error } = await db
      .from("landmark_game_players")
      .update({ player_token_hash: playerTokenHash, display_name: displayName, signer_address: signerAddress })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error?.code === "23505") return json({ error: "Name already taken." }, 409);
    if (error) throw error;
    return json({ playerToken, ...(await gameState(db, game.id, player.id)) });
  }

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
    if (error.code === "23505") return json({ error: "Name already taken." }, 409);
    if (/lobby is full/i.test(error.message)) return json({ error: "Lobby is full." }, 409);
    if (/game already started/i.test(error.message)) return json({ error: "That game has already started." }, 409);
    throw error;
  }
  return json({ playerToken, ...(await gameState(db, game.id, player.id)) });
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
  const plan = await Promise.all(createGamePlan().map(async (round) => {
    if (round.kind !== "identify") return round;
    if (!round.image) throw new Error("Round image is missing.");
    return { ...round, ...(await mirrorRoundEvidence(db, round.image)) };
  }));
  const onchainPlan = contractPlan(plan);
  const contractGameId = `game-${game.id}`;
  const planText = JSON.stringify(onchainPlan);
  const rosterText = JSON.stringify((players as PlayerRow[]).map((entry) => entry.signer_address));

  const { data: claimedGame, error: gameError } = await db
    .from("landmark_games")
    .update({
      status: "registering",
      plan,
      plan_hash: await sha256Hex(planText),
      contract_game_id: contractGameId,
      contract_version: "v4",
      contract_address: V4_CONTRACT_ADDRESS,
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
    const transactionHash = await writeClient.writeContract({
      address: V4_CONTRACT_ADDRESS as `0x${string}`,
      functionName: "register_game",
      leaderOnly: false,
      args: [contractGameId, rosterText, planText],
      value: 0n,
    });
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
  const nonce = rawBody.length <= 20_000 ? await authenticate(request, rawBody) : null;
  if (!nonce) {
    return json({ error: "Unauthorized request." }, 401);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

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
      if (game.status !== "running" || game.contract_version !== "v4") {
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
      const { data: existing } = await db.from("landmark_game_answers")
        .select("id,commitment,choice_index")
        .eq("round_id", round.id)
        .eq("player_id", player.id)
        .maybeSingle();
      if (existing) {
        if (existing.commitment !== commitment || existing.choice_index !== choiceIndex) {
          return json({ error: "Answer already locked." }, 409);
        }
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

    const { data: freshGame } = await db.from("landmark_games").select("*").eq("id", game.id).single();
    await progressGame(db, freshGame as GameRow);
    return json(await gameState(db, game.id, player.id));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (message === "GAME_NOT_FOUND") return json({ error: "Lobby not found." }, 404);
    if (message === "INVALID_SESSION") return json({ error: "Lobby session expired." }, 401);
    if (message === "RATE_LIMITED") return json({ error: "Slow down." }, 429);
    if (message === "INVALID_RATE_KEY") return json({ error: "Unauthorized request." }, 401);
    console.error(`[landmark-api] ${message}`);
    return json({ error: "The lobby could not be updated." }, 502);
  }
});
