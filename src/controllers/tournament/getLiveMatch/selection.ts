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
  const candidates = games.filter(
    (game) =>
      game.status === "draft" &&
      game.startTime instanceof Date &&
      game.startTime.getTime() > now.getTime()
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((earliest, current) => {
    const earliestTs = earliest.startTime instanceof Date ? earliest.startTime.getTime() : Number.POSITIVE_INFINITY;
    const currentTs = current.startTime instanceof Date ? current.startTime.getTime() : Number.POSITIVE_INFINITY;
    return currentTs < earliestTs ? current : earliest;
  }, candidates[0]);
}
