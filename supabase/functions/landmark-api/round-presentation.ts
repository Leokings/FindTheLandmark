import type { GameRound } from "./content.ts";

// Only return fields needed to play. The authoritative source and original
// photo URL are revealed in the recap after consensus settles the round.
export function activeChallenge(challenge: GameRound) {
  return {
    kind: challenge.kind,
    question: challenge.question,
    options: challenge.options,
    image: challenge.evidenceUrl ?? null,
    category: challenge.city === "GenLayer docs" ? "genlayer" : challenge.kind === "identify" ? "picture" : "atlas",
    credit: challenge.credit ? "Wikimedia Commons" : null,
  };
}
