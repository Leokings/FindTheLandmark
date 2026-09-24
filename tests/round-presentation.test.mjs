import assert from "node:assert/strict";
import test from "node:test";

import { activeChallenge } from "../supabase/functions/landmark-api/round-presentation.ts";

test("active picture rounds expose only the opaque mirrored image", () => {
  const visible = activeChallenge({
    kind: "identify",
    challengeId: "sample",
    question: "Name this landmark.",
    options: ["A", "B", "C", "D"],
    durationMs: 20_000,
    rewardXp: 100,
    speedBonus: 50,
    place: "Taj Mahal",
    city: "Agra, India",
    image: "https://upload.wikimedia.org/Taj_Mahal.jpg",
    evidenceUrl: "https://storage.example/content/sha256.jpg",
    credit: "Photographer name / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Taj_Mahal.jpg",
  });
  assert.equal(visible.image, "https://storage.example/content/sha256.jpg");
  assert.equal(visible.credit, "Wikimedia Commons");
  assert.equal(visible.category, "picture");
  assert.ok(!JSON.stringify(visible).includes("Taj Mahal"));
});

test("active quizzes do not reveal answer-bearing source titles or URLs", () => {
  const visible = activeChallenge({
    kind: "quiz",
    challengeId: "sample",
    question: "Which landmark is in India?",
    options: ["A", "B", "C", "D"],
    durationMs: 25_000,
    rewardXp: 75,
    speedBonus: 25,
    place: "Map check",
    city: "Atlas quiz",
    sourceLabel: "UNESCO · Taj Mahal",
    sourceUrl: "https://example.com/taj-mahal",
  });
  assert.equal(visible.category, "atlas");
  assert.ok(!Object.hasOwn(visible, "sourceLabel"));
  assert.ok(!Object.hasOwn(visible, "sourceUrl"));
});
