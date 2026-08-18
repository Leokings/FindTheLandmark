import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const EDGE_FUNCTION_URL =
  "https://auovgyyatbxdfynbbfth.supabase.co/functions/v1/landmark-api";
const ALLOWED_ROUNDS = new Set(["quick-taj-001", "quick-redeemer-001", "quick-sydney-001"]);
const TICKET_LIFETIME_MS = 20_000;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const recentStarts = new Map<string, number[]>();
const recentSubmissions = new Map<string, number[]>();
const recentStatuses = new Map<string, number[]>();

type Ticket = {
  roundId: string;
  userIdHash: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature: `0x${string}`;
};

type QuickPickBody = {
  action?: unknown;
  roundId?: unknown;
  playerId?: unknown;
  choiceIndex?: unknown;
  ticket?: unknown;
  submissionId?: unknown;
  transactionHash?: unknown;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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

function limited(key: string, store: Map<string, number[]>, maximum: number) {
  const now = Date.now();
  const active = (store.get(key) ?? []).filter((time) => now - time < REQUEST_WINDOW_MS);
  if (active.length >= maximum) return true;
  active.push(now);
  store.set(key, active);
  return false;
}

function signer() {
  const privateKey = process.env.LANDMARK_SITE_SIGNING_KEY;
  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) return null;
  return privateKeyToAccount(privateKey as `0x${string}`);
}

function ticketMessage(ticket: Omit<Ticket, "signature">) {
  return `find-the-landmark:quick-ticket:${ticket.roundId}:${ticket.userIdHash}:${ticket.issuedAt}:${ticket.expiresAt}:${ticket.nonce}`;
}

function validTicket(value: unknown): value is Ticket {
  if (!value || typeof value !== "object") return false;
  const ticket = value as Record<string, unknown>;
  return typeof ticket.roundId === "string"
    && typeof ticket.userIdHash === "string"
    && typeof ticket.issuedAt === "number"
    && typeof ticket.expiresAt === "number"
    && typeof ticket.nonce === "string"
    && typeof ticket.signature === "string"
    && /^0x[a-f0-9]{130}$/i.test(ticket.signature);
}

async function forwardSigned(body: Record<string, string | number>, timeoutMs: number) {
  const account = signer();
  if (!account) return json({ error: "Live verification is temporarily unavailable." }, 503);
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
    const data = await response.json().catch(() => ({ error: "The verifier returned an unreadable response." }));
    return json(data, response.status);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json({ error: timedOut ? "Consensus is still running. Check again shortly." : "The verifier could not be reached." }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  let input: QuickPickBody;
  try {
    input = await request.json() as QuickPickBody;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const key = clientKey(request);
  const action = input.action;
  if (action === "status") {
    if (limited(key, recentStatuses, 30)) return json({ error: "Too many status checks." }, 429);
    const submissionId = typeof input.submissionId === "string" ? input.submissionId : "";
    const transactionHash = typeof input.transactionHash === "string" ? input.transactionHash : "";
    if (!/^submission-[a-f0-9-]{36}$/i.test(submissionId)) return json({ error: "Invalid submission." }, 400);
    if (!/^0x[a-f0-9]{64}$/i.test(transactionHash)) return json({ error: "Invalid transaction." }, 400);
    return forwardSigned({ action: "status", submissionId, transactionHash }, 25_000);
  }

  const roundId = typeof input.roundId === "string" ? input.roundId : "";
  const player = typeof input.playerId === "string" ? input.playerId.trim() : "";
  if (!ALLOWED_ROUNDS.has(roundId)) return json({ error: "That checkpoint is not active." }, 400);
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(player)) return json({ error: "The player session is invalid." }, 400);
  const userIdHash = await sha256Hex(`find-the-landmark:${player}`);
  const account = signer();
  if (!account) return json({ error: "Live verification is temporarily unavailable." }, 503);

  if (action === "start") {
    if (limited(key, recentStarts, 12)) return json({ error: "Too many round starts." }, 429);
    const now = Date.now();
    const unsigned = {
      roundId,
      userIdHash,
      issuedAt: now,
      expiresAt: now + TICKET_LIFETIME_MS,
      nonce: crypto.randomUUID(),
    };
    const signature = await account.signMessage({ message: ticketMessage(unsigned) });
    return json({ ticket: { ...unsigned, signature }, seconds: 20 });
  }

  if (action !== "submit") return json({ error: "Invalid action." }, 400);
  if (limited(key, recentSubmissions, 6)) return json({ error: "Too many answer attempts." }, 429);
  const choiceIndex = Number(input.choiceIndex);
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) return json({ error: "Choose one answer." }, 400);
  if (!validTicket(input.ticket)) return json({ error: "This answer ticket is invalid." }, 400);
  const { signature, ...unsigned } = input.ticket;
  if (unsigned.roundId !== roundId || unsigned.userIdHash !== userIdHash) return json({ error: "This answer ticket does not match the round." }, 400);
  if (unsigned.issuedAt > Date.now() + 5_000 || unsigned.expiresAt < Date.now() || unsigned.expiresAt - unsigned.issuedAt !== TICKET_LIFETIME_MS) {
    return json({ error: "Time ran out for this checkpoint." }, 408);
  }
  const authentic = await verifyMessage({
    address: account.address,
    message: ticketMessage(unsigned),
    signature,
  });
  if (!authentic) return json({ error: "This answer ticket is invalid." }, 400);
  const submissionId = `submission-${crypto.randomUUID()}`;
  return forwardSigned({ action: "quick_pick", submissionId, userIdHash, roundId, choiceIndex }, 95_000);
}
