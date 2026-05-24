export type ScoreValue = number | "wo" | null;

export function scoreToOutcomes(playerOneScore: ScoreValue, playerTwoScore: ScoreValue) {
  if (playerOneScore === "wo" && playerTwoScore === "wo") {
    return [0.5];
  }
  if (playerOneScore === "wo") {
    return [0];
  }
  if (playerTwoScore === "wo") {
    return [1];
  }

  if (
    playerOneScore === null ||
    playerTwoScore === null ||
    typeof playerOneScore !== "number" ||
    typeof playerTwoScore !== "number"
  ) {
    return [0.5];
  }

  const total = playerOneScore + playerTwoScore;
  if (total <= 0) {
    return [0.5];
  }

  let winsAssigned = 0;
  const outcomes: number[] = [];

  for (let step = 1; step <= total; step += 1) {
    const shouldHaveWins = Math.round((step * playerOneScore) / total);
    if (shouldHaveWins > winsAssigned) {
      outcomes.push(1);
      winsAssigned += 1;
      continue;
    }
    outcomes.push(0);
  }

  return outcomes;
}
