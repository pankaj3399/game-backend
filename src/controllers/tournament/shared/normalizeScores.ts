import type { MatchScoreValueResponse } from "../getTournamentMatches/types";

export function normalizeScores(
  values: Array<number | "wo" | null> | undefined,
): MatchScoreValueResponse[] {
  if (values == null) {
    return [];
  }

  const out: MatchScoreValueResponse[] = [];
  for (const value of values) {
    if (value === "wo") {
      out.push("wo");
      continue;
    }
    if (value === null) {
      out.push(null);
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out.push(value);
    }
  }
  return out;
}
