import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifyMessage } from "npm:viem@2.55.18";
import { hasGenuineConsensus, isTerminal, statusName } from "./genlayer-receipt.ts";

const CONTRACT_ADDRESS = "0xE14e50069F700F4C72ca9d59c1eb950b04342b7a";
const EXPECTED_RELAYER = "0x7f07ab481dd8b57085d7c9e0c97c6126ee7faaec";
const SITE_SIGNER = "0x7060227c19040F2af4f066e5247B9e87E5F62132";
const GENLAYER_RPC_URL = "https://studio.genlayer.com/api";
const EXPLORER_URL = "https://explorer-studio.genlayer.com";
const ALLOWED_HUNTS = new Set(["hunt-colosseum-001", "hunt-eiffel-001"]);
const ALLOWED_IMAGE_HOSTS = new Set(["upload.wikimedia.org", "images.unsplash.com"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const RECEIPT_TIMEOUT_MS = 82_000;
const RECEIPT_POLL_MS = 3_000;

type GenLayerReadClient = {
  getTransaction(args: { hash: string }): Promise<unknown>;
  readContract(args: Record<string, unknown>): Promise<unknown>;
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

function normalizeEvidenceUrl(value: unknown) {
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

async function downloadEvidence(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: { "User-Agent": "FindTheLandmark/1.0" },
    });
    if (!response.ok) throw new Error(`Evidence server returned HTTP ${response.status}`);
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(contentType)) {
      throw new Error("The link does not return a supported image.");
    }
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_IMAGE_BYTES) throw new Error("The image is larger than 8 MB.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 64 || bytes.length > MAX_IMAGE_BYTES) throw new Error("The image size is invalid.");
    return sha256Hex(bytes);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForReceipt(client: GenLayerReadClient, transactionHash: string) {
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
  let receipt: unknown = null;
  while (Date.now() < deadline) {
    try {
      receipt = await client.getTransaction({ hash: transactionHash });
      if (isTerminal(receipt)) return receipt;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/not found|timed out/i.test(message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_MS));
  }
  return receipt;
}

async function waitForResult(client: GenLayerReadClient, submissionId: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const exists = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "has_result",
        args: [submissionId],
        transactionHashVariant: "latest-nonfinal",
      });
      if (exists === true || exists === 1 || exists === "true") {
        return await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: "get_result",
          args: [submissionId],
          transactionHashVariant: "latest-nonfinal",
        });
      }
    } catch {
      // Accepted state can lag the receipt briefly.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const rawBody = await request.text();
  if (rawBody.length > 4_000 || !(await authenticate(request, rawBody))) {
    return json({ error: "Unauthorized request." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
  const userIdHash = typeof body.userIdHash === "string" ? body.userIdHash : "";
  const huntId = typeof body.huntId === "string" ? body.huntId : "";
  const evidenceUrl = normalizeEvidenceUrl(body.evidenceUrl);
  if (!/^submission-[a-f0-9-]{36}$/i.test(submissionId)) return json({ error: "Invalid submission." }, 400);
  if (!/^[a-f0-9]{64}$/.test(userIdHash)) return json({ error: "Invalid player." }, 400);
  if (!ALLOWED_HUNTS.has(huntId)) return json({ error: "That photo hunt is not active." }, 400);
  if (!evidenceUrl) return json({ error: "Use a direct Wikimedia Commons or Unsplash image link." }, 400);

  const privateKey = Deno.env.get("GENLAYER_RELAYER_PRIVATE_KEY");
  if (!privateKey) return json({ error: "The GenLayer relayer is not configured." }, 503);

  try {
    const evidenceSha256 = await downloadEvidence(evidenceUrl);
    const [{ createAccount, createClient }, { studionet }] = await Promise.all([
      import("npm:genlayer-js@1.1.8"),
      import("npm:genlayer-js@1.1.8/chains"),
    ]);
    const account = createAccount(privateKey as `0x${string}`);
    if (String(account.address).toLowerCase() !== EXPECTED_RELAYER) {
      return json({ error: "The GenLayer relayer policy does not match." }, 503);
    }
    const client = createClient({ chain: studionet, endpoint: GENLAYER_RPC_URL, account });
    if (await client.getChainId() !== studionet.id) return json({ error: "Wrong GenLayer network." }, 503);

    const hunt = await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_hunt",
      args: [huntId],
      transactionHashVariant: "latest-nonfinal",
    }) as Record<string, unknown>;
    if (hunt.has_winner === true) return json({ error: "Someone already won this photo hunt." }, 409);

    const transactionHash = await client.writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: "verify_photo",
      leaderOnly: false,
      args: [submissionId, userIdHash, huntId, evidenceUrl, evidenceSha256],
    });
    const receipt = await waitForReceipt(client, transactionHash);
    const consensusStatus = statusName(receipt);
    const explorerUrl = `${EXPLORER_URL}/txs/${transactionHash}`;
    if (!receipt || !isTerminal(receipt)) {
      return json({ status: "pending", transactionHash, consensusStatus, explorerUrl }, 202);
    }
    if (!hasGenuineConsensus(receipt)) {
      return json({
        status: "not_verified",
        transactionHash,
        consensusStatus,
        explorerUrl,
        error: "Validator consensus was not reached.",
      }, 422);
    }
    const result = await waitForResult(client, submissionId) as Record<string, unknown> | null;
    if (!result) return json({ status: "pending", transactionHash, consensusStatus, explorerUrl }, 202);
    return json({
      status: result.accepted === true ? "accepted" : "rejected",
      rewardXp: Number(result.reward_xp ?? 0),
      checks: {
        targetMatch: result.target_match === true,
        clearlyVisible: result.clearly_visible === true,
        realPhoto: result.real_photo === true,
        safe: result.safe === true,
      },
      transactionHash,
      consensusStatus,
      explorerUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already has a winner/i.test(message)) return json({ error: "Someone already won this photo hunt." }, 409);
    if (/image|evidence|HTTP/i.test(message)) return json({ error: message }, 400);
    console.error(`[landmark-api] ${message}`);
    return json({ error: "GenLayer could not verify this proof right now." }, 502);
  }
});
