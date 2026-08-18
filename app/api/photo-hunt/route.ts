import { privateKeyToAccount } from "viem/accounts";
import { getDailyRoute, utcRunId } from "@/lib/landmark-content";

const EDGE_FUNCTION_URL =
  "https://auovgyyatbxdfynbbfth.supabase.co/functions/v1/landmark-api";
const ALLOWED_IMAGE_HOSTS = new Set(["upload.wikimedia.org", "images.unsplash.com"]);
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 4;
const MAX_STATUS_REQUESTS_PER_WINDOW = 30;
const recentRequests = new Map<string, number[]>();
const recentStatusRequests = new Map<string, number[]>();

type PhotoHuntBody = {
  action?: unknown;
  huntId?: unknown;
  evidenceUrl?: unknown;
  playerId?: unknown;
  submissionId?: unknown;
  transactionHash?: unknown;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 1_000) return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.hash
      || (url.port && url.port !== "443")
      || !ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase())
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientKey(request: Request) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

function isRateLimited(key: string, requests = recentRequests, maximum = MAX_REQUESTS_PER_WINDOW) {
  const now = Date.now();
  const active = (requests.get(key) ?? []).filter((time) => now - time < REQUEST_WINDOW_MS);
  if (active.length >= maximum) {
    requests.set(key, active);
    return true;
  }
  active.push(now);
  requests.set(key, active);
  return false;
}

async function forwardSigned(body: Record<string, string>, timeoutMs: number) {
  const privateKey = process.env.LANDMARK_SITE_SIGNING_KEY;
  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    return json({ error: "Live verification is temporarily unavailable." }, 503);
  }

  const forwardedBody = JSON.stringify(body);
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(forwardedBody);
  const message = `find-the-landmark:${timestamp}:${nonce}:${bodyHash}`;
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const signature = await account.signMessage({ message });

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
    const data = await response.json().catch(() => ({ error: "The verifier returned an unreadable response." }));
    return json(data, response.status);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json(
      { error: timedOut ? "Consensus is taking longer than expected. Try again shortly." : "The verifier could not be reached." },
      timedOut ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  let input: PhotoHuntBody;
  try {
    input = await request.json() as PhotoHuntBody;
  } catch {
    return json({ error: "The proof request was not valid JSON." }, 400);
  }

  if (input.action === "status") {
    if (isRateLimited(clientKey(request), recentStatusRequests, MAX_STATUS_REQUESTS_PER_WINDOW)) {
      return json({ error: "Too many status checks. Open the receipt and try again shortly." }, 429);
    }
    const submissionId = typeof input.submissionId === "string" ? input.submissionId : "";
    const transactionHash = typeof input.transactionHash === "string" ? input.transactionHash : "";
    if (!/^submission-[a-f0-9-]{36}$/i.test(submissionId)) return json({ error: "Invalid submission." }, 400);
    if (!/^0x[a-f0-9]{64}$/i.test(transactionHash)) return json({ error: "Invalid transaction." }, 400);
    return forwardSigned({ action: "status", submissionId, transactionHash }, 25_000);
  }

  if (isRateLimited(clientKey(request))) {
    return json({ error: "Too many proof attempts. Try again in a few minutes." }, 429);
  }

  const huntId = typeof input.huntId === "string" ? input.huntId : "";
  const evidenceUrl = normalizeUrl(input.evidenceUrl);
  const playerId = typeof input.playerId === "string" ? input.playerId.trim() : "";
  const activeHunt = getDailyRoute().find((round) => round.type === "hunt");
  if (!activeHunt || activeHunt.huntId !== huntId) return json({ error: "That photo hunt is not active today." }, 400);
  if (!evidenceUrl) {
    return json({ error: "Use a direct Wikimedia Commons or Unsplash HTTPS image link." }, 400);
  }
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(playerId)) {
    return json({ error: "The player session is invalid. Refresh and try again." }, 400);
  }

  const submissionId = `submission-${crypto.randomUUID()}`;
  const userIdHash = await sha256Hex(`find-the-landmark:${playerId}`);
  return forwardSigned({ action: "submit", submissionId, userIdHash, huntId, runId: utcRunId(), evidenceUrl }, 95_000);
}
