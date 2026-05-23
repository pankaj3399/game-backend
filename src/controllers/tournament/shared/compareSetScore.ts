import { AppError } from "../../../shared/errors";
import type { GamePlayMode } from "../../../types/domain/game";

export type SetScoreValue = number | "wo" | null;

function getSetFormat(
  playMode: GamePlayMode,
  setIndex: number,
): "standard" | "tiebreak10" {
  if (playMode === "TieBreak10") {
    return "tiebreak10";
  }
  if (playMode === "3setTieBreak10") {
    return setIndex === 2 ? "tiebreak10" : "standard";
  }
  return "standard";
}

/**
 * Compare two set scores: positive if player one wins the set, negative if player two wins, 0 if undecided.
 * Used by tournament score recording and QR score flows so validation rules stay aligned.
 */
export function compareSetScore(
  playerOneScore: SetScoreValue,
  playerTwoScore: SetScoreValue,
  playMode: GamePlayMode,
  setIndex: number,
): number {
  if (playerOneScore === "wo" && playerTwoScore === "wo") {
    return 0;
  }

  if (playerOneScore === "wo") {
    return -1;
  }

  if (playerTwoScore === "wo") {
    return 1;
  }

  if (
    playerOneScore === null ||
    playerTwoScore === null ||
    typeof playerOneScore !== "number" ||
    typeof playerTwoScore !== "number"
  ) {
    return 0;
  }

  const setFormat = getSetFormat(playMode, setIndex);

  if (setFormat === "standard") {
    if (playerOneScore > 7 || playerTwoScore > 7) {
      throw new AppError(
        `Invalid standard set score: ${playerOneScore}-${playerTwoScore}. Maximum games allowed is 7.`,
        400,
      );
    }
    if (
      (playerOneScore === 7 && playerTwoScore < 5) ||
      (playerTwoScore === 7 && playerOneScore < 5)
    ) {
      throw new AppError(
        `Invalid standard set score: ${playerOneScore}-${playerTwoScore}. A 7-game win must have an opponent at 5 or 6 games.`,
        400,
      );
    }

    if (
      (playerOneScore === 6 && playerTwoScore <= 4) ||
      (playerOneScore === 7 && (playerTwoScore === 5 || playerTwoScore === 6))
    ) {
      return 1;
    }
    if (
      (playerTwoScore === 6 && playerOneScore <= 4) ||
      (playerTwoScore === 7 && (playerOneScore === 5 || playerOneScore === 6))
    ) {
      return -1;
    }

    return 0;
  }

  if (setFormat === "tiebreak10") {
    if (playerOneScore >= 10 && playerOneScore - playerTwoScore >= 2) {
      if (playerOneScore > 10 && playerOneScore - playerTwoScore > 2) {
        throw new AppError(
          `Invalid TieBreak10 score: ${playerOneScore}-${playerTwoScore}. Point difference should not exceed 2 if going past 10 points.`,
          400,
        );
      }
      return 1;
    }
    if (playerTwoScore >= 10 && playerTwoScore - playerOneScore >= 2) {
      if (playerTwoScore > 10 && playerTwoScore - playerOneScore > 2) {
        throw new AppError(
          `Invalid TieBreak10 score: ${playerOneScore}-${playerTwoScore}. Point difference should not exceed 2 if going past 10 points.`,
          400,
        );
      }
      return -1;
    }
    return 0;
  }

  return 0;
}
