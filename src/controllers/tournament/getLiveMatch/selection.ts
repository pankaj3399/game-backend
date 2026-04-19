import type { LiveMatchGameDoc } from "./types";

export function selectLiveGame(games: LiveMatchGameDoc[]): LiveMatchGameDoc | null {
  return games.find((game) => game.status === "active") ?? null;
}

/**
 * Next upcoming scheduled match only (draft with future startTime).
 * Avoids surfacing stale draft rows with past start times.
 */
export function selectNextScheduledGame(
  games: LiveMatchGameDoc[],
  now: Date
): LiveMatchGameDoc | null {
  return (
    games.find(
      (game) =>
        game.status === "draft" &&
        game.startTime instanceof Date &&
        game.startTime.getTime() > now.getTime()
    ) ?? null
  );
}
