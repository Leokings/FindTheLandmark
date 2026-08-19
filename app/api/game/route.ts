import { privateKeyToAccount } from "viem/accounts";

const EDGE_FUNCTION_URL =
  "https://auovgyyatbxdfynbbfth.supabase.co/functions/v1/landmark-api";
const MAX_BODY_BYTES = 20_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 100;

type GameAction = "create" | "join" | "results" | "state" | "start" | "answer";

type GameBody = {
  action?: unknown;
  code?: unknown;
  displayName?: unknown;
  playerId?: unknown;
  playerToken?: unknown;
  choiceIndex?: unknown;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request) {
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

function signer() {
  const privateKey = process.env.LANDMARK_SITE_SIGNING_KEY;
  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) return null;
  return privateKeyToAccount(privateKey as `0x${string}`);
}

function validAction(value: unknown): value is GameAction {
  return value === "create"
    || value === "join"
    || value === "results"
    || value === "state"
    || value === "start"
    || value === "answer";
}

async function forwardSigned(body: Record<string, unknown>, timeoutMs: number) {
  const account = signer();
  if (!account) return json({ error: "Game service unavailable." }, 503);
  const forwardedBody = JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(forwardedBody);
  const signature = await account.signMessage({
    message: `find-the-landmark:${timestamp}:${nonce}:${bodyHash}`,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-landmark-timestamp": timestamp,
        "x-landmark-nonce": nonce,
        "x-landmark-signature": signature,
      },
      body: forwardedBody,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({ error: "Bad game response." }));
    return json(data, response.status);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json({ error: timedOut ? "Still working. Try again." : "Game service unavailable." }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-site request blocked." }, 403);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: "Request too large." }, 413);
  }

  let input: GameBody;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: "Request too large." }, 413);
    }
    input = JSON.parse(rawBody) as GameBody;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (!validAction(input.action)) return json({ error: "Invalid action." }, 400);
  const playerId = typeof input.playerId === "string" ? input.playerId.trim() : "";
  if (input.action !== "results" && !/^[A-Za-z0-9_-]{12,100}$/.test(playerId)) {
    return json({ error: "Invalid player." }, 400);
  }

  const requestIpHash = await sha256Hex(`landmark-ip:${clientIp(request)}`);
  const body: Record<string, unknown> = { action: input.action, requestIpHash };
  if (input.action !== "results") body.playerId = playerId;
  if (input.action === "create" || input.action === "join") {
    const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
    if (displayName.length < 1 || displayName.length > 24) return json({ error: "Enter a player name." }, 400);
    body.displayName = displayName;
  }
  if (input.action !== "create") {
    const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
    if (!/^[A-Z2-9]{6}$/.test(code)) return json({ error: "Invalid lobby code." }, 400);
    body.code = code;
  }
  if (input.action === "state" || input.action === "start" || input.action === "answer") {
    const playerToken = typeof input.playerToken === "string" ? input.playerToken.trim() : "";
    if (!/^[a-f0-9]{64}$/.test(playerToken)) return json({ error: "Lobby session expired." }, 401);
    body.playerToken = playerToken;
  }
  if (input.action === "answer") {
    const choiceIndex = Number(input.choiceIndex);
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) {
      return json({ error: "Choose an answer." }, 400);
    }
    body.choiceIndex = choiceIndex;
  }

  const timeout = input.action === "start" ? 90_000 : input.action === "state" ? 55_000 : 25_000;
  return forwardSigned(body, timeout);
}
