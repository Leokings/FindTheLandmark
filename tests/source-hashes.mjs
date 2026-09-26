import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const commit = "9699f3900dd697689090f6595f5c14b4f0a60fdf";
const source = await readFile(new URL("../supabase/functions/landmark-api/content.ts", import.meta.url), "utf8");
const matches = [...source.matchAll(/genLayerSource\("[^"]+",\s*"([^"]+)",\s*"([a-f0-9]{64})"\)/g)];
const expectedByPath = new Map(matches.map((match) => [match[1], match[2]]));
const unescoCalls = [...source.matchAll(/unescoSource\("[^"]+",\s*(\d+)\)/g)];
const unescoIds = new Set(unescoCalls.map((match) => Number(match[1])));

assert.equal(expectedByPath.size, 7, "expected seven distinct pinned GenLayer Docs sources");
assert.equal(unescoCalls.length, 15, "expected fifteen UNESCO-backed atlas questions");
assert.equal(unescoIds.size, 12, "expected twelve distinct UNESCO DataHub records");

for (const [path, expected] of expectedByPath) {
  const url = `https://raw.githubusercontent.com/genlayerlabs/genlayer-docs/${commit}/pages/${path}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(body).digest("hex");
  assert.equal(actual, expected, `${path} hash drifted`);
  if (path === "developers/intelligent-contracts/introduction.mdx") {
    const introduction = body.toString("utf8");
    assert.match(introduction, /`@gl\.public\.view`:\s*Read-only methods/);
    assert.match(introduction, /`@gl\.public\.write\.payable`:\s*Methods that can modify contract state \*and\* receive `value`/);
  }
}

for (const id of unescoIds) {
  const url = `https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?where=id_no%3D${id}&limit=1`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  const body = await response.json();
  assert.equal(body.total_count, 1, `UNESCO record ${id} was not unique`);
  assert.equal(Number(body.results?.[0]?.id_no), id, `UNESCO record ${id} did not match its filter`);
  assert.ok(body.results[0].name_en, `UNESCO record ${id} has no English name`);
  assert.ok(body.results[0].short_description_en, `UNESCO record ${id} has no English description`);
}

console.log(
  `verified ${expectedByPath.size} pinned GenLayer Docs hashes and ${unescoIds.size} official UNESCO DataHub records`,
);
