type ClockGame = {
  status: string;
  current_round: number;
  round_count: number;
};

export function scheduledClockChange(game: ClockGame, roundIndex: number, verifying: boolean) {
  const status = verifying ? "verifying" : "running";
  const current_round = verifying ? game.round_count : roundIndex;
  if (game.status === status && game.current_round === current_round) return null;
  return { status, current_round };
}
