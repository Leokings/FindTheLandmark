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
import { hasGenuineConsensus, isTerminal, statusName } from "./genlayer-receipt.ts";

const magickWasm = await Deno.readFile(
  new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42")),
);
await initializeImageMagick(magickWasm);

const CONTRACT_ADDRESS = "0xa9778Ef1607CCcA9Da3Dce8da9fC6a39523598ee";
const EXPECTED_RELAYER = "0x7f07ab481dd8b57085d7c9e0c97c6126ee7faaec";
const SITE_SIGNER = "0xdc2606D6c7833178fFF3D456ADEF8d97029ea196";
const GENLAYER_RPC_URL = "https://studio.genlayer.com/api";
const EVIDENCE_BUCKET = "landmark-evidence";
const ALLOWED_IMAGE_HOSTS = new Set(["upload.wikimedia.org"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_NORMALIZED_DIMENSION = 1_280;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
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
  status: "queued" | "open" | "submitting" | "pending" | "settled" | "failed";
  started_at: string | null;
  ends_at: string | null;
  transaction_hash: string | null;
  correct_index: number | null;
  consensus_status: string | null;
  next_check_at: string | null;
  error_message: string | null;
};

const headers = {
  "Access-Control-Allow-Origin": "https://find-the-landmark.plain3rd.chatgpt.site",
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
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - numericTimestamp) > MAX_CLOCK_SKEW_MS) return false;
  if (!/^[a-f0-9-]{36}$/i.test(nonce) || !/^0x[a-f0-9]{130}$/i.test(signature)) return false;
  const bodyHash = await sha256Hex(rawBody);
  return verifyMessage({
    address: SITE_SIGNER,
    message: `find-the-landmark:${timestamp}:${nonce}:${bodyHash}`,
    signature: signature as `0x${string}`,
  });
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

async function mirrorRoundEvidence(db: DatabaseClient, gameId: string, position: number, sourceUrl: string) {
  const normalized = normalizeEvidence(await downloadEvidence(sourceUrl));
  const objectPath = `games/${gameId}/round-${position}.jpg`;
  const { error } = await db.storage.from(EVIDENCE_BUCKET).upload(objectPath, normalized, {
    contentType: "image/jpeg",
    cacheControl: "86400",
    upsert: true,
  });
  if (error) throw new Error("Round image could not be prepared.");
  const { data } = db.storage.from(EVIDENCE_BUCKET).getPublicUrl(objectPath);
  return { evidenceUrl: data.publicUrl, evidenceSha256: await sha256Hex(normalized) };
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

async function openRound(db: DatabaseClient, game: GameRow, position: number) {
  const round = game.plan[position];
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + round.durationMs);
  const { error: roundError } = await db
    .from("landmark_game_rounds")
    .update({
      status: "open",
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .eq("game_id", game.id)
    .eq("position", position)
    .eq("status", "queued");
  if (roundError) throw roundError;
  const gameUpdate: Record<string, unknown> = {
    status: "running",
    current_round: position,
    next_check_at: null,
    updated_at: startedAt.toISOString(),
  };
  if (!game.started_at) gameUpdate.started_at = startedAt.toISOString();
  const { error: gameError } = await db
    .from("landmark_games")
    .update(gameUpdate)
    .eq("id", game.id);
  if (gameError) throw gameError;
}

async function submitRound(
  db: DatabaseClient,
  game: GameRow,
  round: RoundRow,
  writeClient: GenLayerWriteClient,
) {
  const challenge = game.plan[round.position];
  const [{ data: players, error: playerError }, { data: answers, error: answerError }] = await Promise.all([
    db.from("landmark_game_players").select("id,player_hash").eq("game_id", game.id),
    db.from("landmark_game_answers").select("player_id,choice_index,elapsed_ms").eq("round_id", round.id),
  ]);
  if (playerError || answerError) throw playerError ?? answerError;
  const playerHashes = new Map((players ?? []).map((player) => [player.id, player.player_hash]));
  const contractAnswers = (answers ?? []).map((answer) => ({
    player_hash: playerHashes.get(answer.player_id),
    choice_index: answer.choice_index,
    elapsed_ms: answer.elapsed_ms,
  })).filter((answer) => typeof answer.player_hash === "string");

  let evidenceUrl = "";
  let evidenceSha256 = "";
  if (challenge.kind === "identify") {
    if (!challenge.image) throw new Error("Round image is missing.");
    const mirrored = await mirrorRoundEvidence(db, game.id, round.position, challenge.image);
    evidenceUrl = mirrored.evidenceUrl;
    evidenceSha256 = mirrored.evidenceSha256;
  }

  const transactionHash = await writeClient.writeContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    functionName: "settle_round",
    leaderOnly: false,
    args: [
      game.contract_game_id,
      round.position,
      JSON.stringify(contractAnswers),
      evidenceUrl,
      evidenceSha256,
    ],
  });
  const { error } = await db
    .from("landmark_game_rounds")
    .update({
      status: "pending",
      transaction_hash: transactionHash,
      next_check_at: new Date(Date.now() + 4_000).toISOString(),
      error_message: null,
    })
    .eq("id", round.id)
    .eq("status", "submitting");
  if (error) throw error;
  console.log(JSON.stringify({
    event: "lobby_round_submitted",
    gameId: game.contract_game_id,
    round: round.position,
    transactionHash,
  }));

  if (round.position + 1 < game.round_count) {
    await openRound(db, game, round.position + 1);
  } else {
    const { error: gameError } = await db
      .from("landmark_games")
      .update({
        status: "verifying",
        current_round: game.round_count,
        updated_at: new Date().toISOString(),
      })
      .eq("id", game.id);
    if (gameError) throw gameError;
  }
}

async function checkPendingRound(
  db: DatabaseClient,
  game: GameRow,
  readClient: GenLayerReadClient,
) {
  const now = new Date().toISOString();
  const { data: round, error } = await db
    .from("landmark_game_rounds")
    .select("*")
    .eq("game_id", game.id)
    .eq("status", "pending")
    .lte("next_check_at", now)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !round?.transaction_hash) return;

  await db
    .from("landmark_game_rounds")
    .update({ next_check_at: new Date(Date.now() + 5_000).toISOString() })
    .eq("id", round.id)
    .eq("status", "pending");

  let receipt: unknown;
  try {
    receipt = await readClient.getTransaction({ hash: round.transaction_hash });
  } catch (caught) {
    if (/not found|timed out/i.test(caught instanceof Error ? caught.message : String(caught))) return;
    throw caught;
  }
  if (!isTerminal(receipt)) return;
  if (!hasGenuineConsensus(receipt)) {
    await Promise.all([
      db.from("landmark_game_rounds").update({
        status: "failed",
        consensus_status: statusName(receipt),
        error_message: "Consensus did not finish.",
      }).eq("id", round.id),
      db.from("landmark_games").update({
        status: "error",
        error_message: "A round could not be sealed.",
        updated_at: new Date().toISOString(),
      }).eq("id", game.id),
    ]);
    return;
  }

  const result = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_round_result",
    args: [game.contract_game_id, round.position],
    transactionHashVariant: "latest-nonfinal",
  }) as Record<string, unknown>;
  const scores = Array.isArray(result.scores) ? result.scores : [];
  const correctIndex = Number(result.correct_index);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    throw new Error("GenLayer returned an invalid round result.");
  }
  const { error: applyError } = await db.rpc("landmark_apply_round_settlement", {
    p_round_id: round.id,
    p_correct_index: correctIndex,
    p_scores: scores,
    p_consensus_status: statusName(receipt),
  });
  if (applyError) throw applyError;
}

async function progressGame(db: DatabaseClient, originalGame: GameRow) {
  if (originalGame.status === "waiting" || originalGame.status === "finished" || originalGame.status === "error") return;
  const { readClient, writeClient } = await genlayerClients();
  let game = originalGame;

  if (game.status === "registering" && game.registration_tx_hash) {
    const now = new Date().toISOString();
    const { data: claimed } = await db
      .from("landmark_games")
      .update({ next_check_at: new Date(Date.now() + 4_000).toISOString() })
      .eq("id", game.id)
      .eq("status", "registering")
      .or(`next_check_at.is.null,next_check_at.lte.${now}`)
      .select("*")
      .maybeSingle();
    if (claimed) {
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
      await readClient.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_game",
        args: [game.contract_game_id],
        transactionHashVariant: "latest-nonfinal",
      });
      await openRound(db, game, 0);
    }
    return;
  }

  if (game.status === "running") {
    const { data: currentRound } = await db
      .from("landmark_game_rounds")
      .select("*")
      .eq("game_id", game.id)
      .eq("position", game.current_round)
      .maybeSingle();
    if (
      currentRound
      && currentRound.status === "open"
      && currentRound.ends_at
      && Date.parse(currentRound.ends_at) <= Date.now()
    ) {
      const { data: claimedRound } = await db
        .from("landmark_game_rounds")
        .update({ status: "submitting" })
        .eq("id", currentRound.id)
        .eq("status", "open")
        .select("*")
        .maybeSingle();
      if (claimedRound) {
        try {
          await submitRound(db, game, claimedRound as RoundRow, writeClient);
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught);
          await Promise.all([
            db.from("landmark_game_rounds").update({ status: "failed", error_message: message }).eq("id", claimedRound.id),
            db.from("landmark_games").update({ status: "error", error_message: "A round could not be submitted." }).eq("id", game.id),
          ]);
          return;
        }
      }
    }
  }

  const { data: freshGame } = await db.from("landmark_games").select("*").eq("id", game.id).single();
  game = freshGame as GameRow;
  await checkPendingRound(db, game, readClient);
}

async function gameState(db: DatabaseClient, gameId: string, playerId: string) {
  const [{ data: game, error: gameError }, { data: players, error: playersError }, { data: rounds, error: roundsError }] = await Promise.all([
    db.from("landmark_games").select("*").eq("id", gameId).single(),
    db.from("landmark_game_players").select("*").eq("game_id", gameId).order("score", { ascending: false }).order("joined_at", { ascending: true }),
    db.from("landmark_game_rounds").select("*").eq("game_id", gameId).order("position", { ascending: true }),
  ]);
  if (gameError || playersError || roundsError) throw gameError ?? playersError ?? roundsError;
  const currentGame = game as GameRow;
  const player = (players as PlayerRow[]).find((entry) => entry.id === playerId);
  if (!player) throw new Error("INVALID_SESSION");

  let currentRound: Record<string, unknown> | null = null;
  if (currentGame.status === "running" && currentGame.current_round >= 0 && currentGame.current_round < currentGame.round_count) {
    const round = (rounds as RoundRow[]).find((entry) => entry.position === currentGame.current_round);
    const challenge = currentGame.plan[currentGame.current_round];
    if (round && challenge) {
      const { data: answer } = await db
        .from("landmark_game_answers")
        .select("choice_index,submitted_at")
        .eq("round_id", round.id)
        .eq("player_id", player.id)
        .maybeSingle();
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
        startedAt: round.started_at,
        endsAt: round.ends_at,
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
    isYou: entry.id === player.id,
  }));
  const settledRounds = (rounds as RoundRow[]).filter((round) => round.status === "settled").length;
  const pendingRounds = (rounds as RoundRow[]).filter((round) => ["submitting", "pending"].includes(round.status)).length;
  const winner = currentGame.winner_player_id
    ? board.find((entry) => entry.id === currentGame.winner_player_id) ?? null
    : null;

  return {
    code: currentGame.code,
    status: currentGame.status,
    isHost: player.is_host,
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
    contractAddress: CONTRACT_ADDRESS,
  };
}

async function createLobby(db: DatabaseClient, body: Record<string, unknown>) {
  const playerKey = normalizePlayerKey(body.playerId);
  const displayName = normalizeName(body.displayName);
  if (!playerKey || !displayName) return json({ error: "Enter a valid player name." }, 400);
  const playerToken = createToken();
  const playerTokenHash = await sha256Hex(`landmark-token:${playerToken}`);
  const playerHash = await sha256Hex(`find-the-landmark:${playerKey}`);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = createCode();
    const { data: game, error: gameError } = await db
      .from("landmark_games")
      .insert({ code, host_player_key: playerKey })
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
  if (!code || !playerKey || !displayName) return json({ error: "Check the lobby code and player name." }, 400);
  const { data: game } = await db.from("landmark_games").select("*").eq("code", code).maybeSingle();
  if (!game) return json({ error: "Lobby not found." }, 404);
  if (game.status !== "waiting") return json({ error: "That game has already started." }, 409);

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
      .update({ player_token_hash: playerTokenHash, display_name: displayName })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return json({ playerToken, ...(await gameState(db, game.id, player.id)) });
  }

  const { data: player, error } = await db
    .from("landmark_game_players")
    .insert({
      game_id: game.id,
      player_key: playerKey,
      player_hash: playerHash,
      player_token_hash: playerTokenHash,
      display_name: displayName,
      is_host: false,
    })
    .select("*")
    .single();
  if (error) {
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
  const plan = createGamePlan();
  const onchainPlan = contractPlan(plan);
  const contractGameId = `game-${game.id}`;
  const planText = JSON.stringify(onchainPlan);
  const rosterText = JSON.stringify((players as PlayerRow[]).map((entry) => entry.player_hash));

  const { data: claimedGame, error: gameError } = await db
    .from("landmark_games")
    .update({
      status: "registering",
      plan,
      plan_hash: await sha256Hex(planText),
      contract_game_id: contractGameId,
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
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "register_game",
      leaderOnly: false,
      args: [contractGameId, rosterText, planText],
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
  if (rawBody.length > 20_000 || !(await authenticate(request, rawBody))) {
    return json({ error: "Unauthorized request." }, 401);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const db = database();
  try {
    if (body.action === "create") return await createLobby(db, body);
    if (body.action === "join") return await joinLobby(db, body);

    const { game, player } = await requireSession(db, body);
    if (body.action === "start") {
      const response = await startGame(db, game, player);
      if (response) return response;
    } else if (body.action === "answer") {
      if (game.status !== "running") return json({ error: "There is no open round." }, 409);
      const choiceIndex = Number(body.choiceIndex);
      if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) {
        return json({ error: "Choose one answer." }, 400);
      }
      const { data: round } = await db
        .from("landmark_game_rounds")
        .select("*")
        .eq("game_id", game.id)
        .eq("position", game.current_round)
        .eq("status", "open")
        .maybeSingle();
      if (!round?.started_at || !round.ends_at || Date.parse(round.ends_at) <= Date.now()) {
        return json({ error: "Time is up." }, 408);
      }
      const durationMs = game.plan[game.current_round].durationMs;
      const elapsedMs = Math.max(0, Math.min(durationMs, Date.now() - Date.parse(round.started_at)));
      const { error } = await db.from("landmark_game_answers").insert({
        game_id: game.id,
        round_id: round.id,
        player_id: player.id,
        choice_index: choiceIndex,
        elapsed_ms: elapsedMs,
      });
      if (error) {
        if (error.code === "23505") return json({ error: "Answer already locked." }, 409);
        throw error;
      }
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
    console.error(`[landmark-api] ${message}`);
    return json({ error: "The lobby could not be updated." }, 502);
  }
});
