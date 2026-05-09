import { AppError } from "../../../shared/errors";
import type { GamePlayMode, MatchType } from "../../../types/domain/game";
import type { RecordMatchScoreInput } from "../recordMatchScore/validation";

export function requiredSetCount(playMode: GamePlayMode): number {
  if (playMode === "5set") return 5;
  if (playMode === "3set" || playMode === "3setTieBreak10") return 3;
  return 1;
}

function getSetFormat(
  playMode: GamePlayMode,
  setIndex: number,
): "standard" | "tiebreak10" {
  if (playMode === "TieBreak10") return "tiebreak10";
  if (playMode === "3setTieBreak10" && setIndex === 2) return "tiebreak10";
  return "standard";
}

function compareSetScore(
  playerOneScore: number | "wo",
  playerTwoScore: number | "wo",
  playMode: GamePlayMode,
  setIndex: number,
): number {
  if (playerOneScore === "wo" && playerTwoScore === "wo") return 0;
  if (playerOneScore === "wo") return -1;
  if (playerTwoScore === "wo") return 1;

  const setFormat = getSetFormat(playMode, setIndex);

  if (setFormat === "standard") {
    if (playerOneScore > 7 || playerTwoScore > 7) {
      throw new AppError(
        `Invalid standard set score: ${playerOneScore}-${playerTwoScore}`,
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

  if (playerOneScore >= 10 && playerOneScore - playerTwoScore >= 2) return 1;
  if (playerTwoScore >= 10 && playerTwoScore - playerOneScore >= 2) return -1;
  return 0;
}

function inferIndependentPlayMode(input: RecordMatchScoreInput): GamePlayMode {
  const sets = input.playerOneScores.length;
  if (sets >= 5) return "5set";
  if (sets >= 3) return "3set";
  return "TieBreak10";
}

export function normalizeIndependentMatchType(matchType?: MatchType): MatchType {
  return matchType === "doubles" ? "doubles" : "singles";
}

export function normalizeIndependentPlayMode(
  input: RecordMatchScoreInput,
  explicit?: GamePlayMode,
): GamePlayMode {
  if (
    explicit === "TieBreak10" ||
    explicit === "1set" ||
    explicit === "3setTieBreak10" ||
    explicit === "3set" ||
    explicit === "5set"
  ) {
    return explicit;
  }
  return inferIndependentPlayMode(input);
}

export function resolveWinnerBySets(
  playMode: GamePlayMode,
  input: RecordMatchScoreInput,
): "side1" | "side2" | null {
  const setCount = requiredSetCount(playMode);
  const majority = Math.floor(setCount / 2) + 1;
  let oneWins = 0;
  let twoWins = 0;

  for (let i = 0; i < setCount; i += 1) {
    const one = input.playerOneScores[i];
    const two = input.playerTwoScores[i];
    if (one === undefined || two === undefined) continue;

    const result = compareSetScore(one, two, playMode, i);
    if (result > 0) oneWins += 1;
    if (result < 0) twoWins += 1;

    if (oneWins >= majority) return "side1";
    if (twoWins >= majority) return "side2";
  }

  return null;
}

export function normalizeMatchStatus(
  status: string,
): "completed" | "pendingScore" {
  return status === "finished" ? "completed" : "pendingScore";
}
