import type { GamePlayMode, MatchType } from "../../../types/domain/game";
import type { RecordMatchScoreInput } from "../recordMatchScore/validation";
import { compareSetScore } from "../shared/compareSetScore";

export function requiredSetCount(playMode: GamePlayMode): number {
  if (playMode === "5set") return 5;
  if (playMode === "3set" || playMode === "3setTieBreak10") return 3;
  return 1;
}

function looksLike10PointSuperTieBreak(
  one: number | "wo",
  two: number | "wo",
): boolean {
  if (one === "wo" || two === "wo") return false;
  const hi = Math.max(one, two);
  const lo = Math.min(one, two);
  return hi >= 10 && hi - lo >= 2;
}

function inferIndependentPlayMode(input: RecordMatchScoreInput): GamePlayMode {
  const sets = input.playerOneScores.length;
  if (sets >= 5) return "5set";
  if (sets >= 3) return "3set";
  if (sets === 1) {
    const one = input.playerOneScores[0];
    const two = input.playerTwoScores[0];
    if (looksLike10PointSuperTieBreak(one, two)) return "TieBreak10";
    return "1set";
  }
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
