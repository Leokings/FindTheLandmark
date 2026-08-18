import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Find the Landmark game", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Find the Landmark/);
  assert.match(html, /PACK LIGHT/);
  assert.match(html, /START/);
  assert.match(html, /GENLAYER LIVE/);
  assert.match(html, /PHOTO HUNT/);
  assert.match(html, /QUICK PICKS/);
  assert.match(html, /ATLAS QUIZZES/);
  assert.match(html, /07 STOPS/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});
