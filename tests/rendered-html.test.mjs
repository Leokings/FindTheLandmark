import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

async function openPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child, output) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next server exited early.\n${output()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The server has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next server did not become ready.\n${output()}`);
}

test("server-renders the Find the Landmark game", async (context) => {
  const port = await openPort();
  const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
  let logs = "";
  const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });
  context.after(async () => {
    if (child.exitCode === null) child.kill();
    if (child.exitCode === null) await once(child, "exit");
  });

  const response = await waitForServer(`http://127.0.0.1:${port}/`, child, () => logs);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const html = await response.text();
  assert.match(html, /<title>Find the Landmark/);
  assert.match(html, /<h1>FIND<br\/>THE <em>WORLD\.<\/em><\/h1>/);
  assert.match(html, /MAKE LOBBY/);
  assert.match(html, /50 MAX/);
  assert.match(html, /12.*ROUNDS/);
  assert.match(html, /GENLAYER DOCS/);
  assert.doesNotMatch(html, /DAILY|PHOTO HUNT|GLOBAL XP/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);

  const crossSite = await fetch(`http://127.0.0.1:${port}/api/game`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify({ action: "create", playerId: "player-123456789012", displayName: "Atlas" }),
  });
  assert.equal(crossSite.status, 403);

  const oversized = await fetch(`http://127.0.0.1:${port}/api/game`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(20_001) }),
  });
  assert.equal(oversized.status, 413);

  const malformed = await fetch(`http://127.0.0.1:${port}/api/game`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
});
