import { parseDurationMinutes } from "../../../shared/matchTiming";
import type { LiveMatchGameDoc } from "./types";

/** Roll forward to the next match focus after the following match has started plus this buffer. */
export const LIVE_MATCH_ROLL_FORWARD_AFTER_NEXT_START_MS = 10 * 60 * 1000;

export function gameHasRecordedScore(game: LiveMatchGameDoc): boolean {
  if (game.status === "finished") {
    return true;
  }

  const playerOneScores = game.score?.playerOneScores ?? [];
  const playerTwoScores = game.score?.playerTwoScores ?? [];
  const hasValue = (values: Array<number | "wo" | null>) =>
    values.some((value) => value !== null && value !== undefined);

  return hasValue(playerOneScores) || hasValue(playerTwoScores);
}

export function resolveMatchDurationMinutes(game: LiveMatchGameDoc): number {
  return parseDurationMinutes(
    game.schedule?.matchDurationMinutes ?? game.tournament?.duration ?? null,
  );
}

/**
 * When true, the player should no longer see this match as the primary live view
 * (score recorded, awaiting-score backlog, or min(half match duration, next match start + 10 min) elapsed).
 * Time-based roll-forward for active matches requires a following scheduled match.
 */
export function shouldAdvanceLiveMatchView(
  game: LiveMatchGameDoc,
  nextScheduled: LiveMatchGameDoc | null,
  now: Date,
): boolean {
  if (gameHasRecordedScore(game)) {
    return true;
  }

  // Awaiting-score rows belong in enter-score flows, not the live broadcast modal.
  if (game.status === "pendingScore") {
    return true;
  }

  if (nextScheduled == null) {
    return false;
  }

  if (!(game.startTime instanceof Date)) {
    return false;
  }

  const startMs = game.startTime.getTime();
  if (!Number.isFinite(startMs)) {
    return false;
  }

  const durationMs = resolveMatchDurationMinutes(game) * 60_000;
  const halfMatchDeadlineMs = startMs + durationMs / 2;

  let nextStartDeadlineMs = Number.POSITIVE_INFINITY;
  if (nextScheduled.startTime instanceof Date) {
    const nextStartMs = nextScheduled.startTime.getTime();
    if (Number.isFinite(nextStartMs)) {
      nextStartDeadlineMs =
        nextStartMs + LIVE_MATCH_ROLL_FORWARD_AFTER_NEXT_START_MS;
    }
  }

  const advanceAtMs = Math.min(halfMatchDeadlineMs, nextStartDeadlineMs);
  return now.getTime() >= advanceAtMs;
}

function compareByStartTimeAsc(a: LiveMatchGameDoc, b: LiveMatchGameDoc): number {
  const aMs =
    a.startTime instanceof Date ? a.startTime.getTime() : Number.POSITIVE_INFINITY;
  const bMs =
    b.startTime instanceof Date ? b.startTime.getTime() : Number.POSITIVE_INFINITY;
  if (aMs !== bMs) {
    return aMs - bMs;
  }
  return a._id.toString().localeCompare(b._id.toString());
}

function isOnCourtStatus(game: LiveMatchGameDoc): boolean {
  return game.status === "active";
}

/**
 * Primary match for the live modal: currently active on court unless advanced,
 * then the next scheduled match for the player (including while still in draft).
 */
export function selectLiveGame(
  games: LiveMatchGameDoc[],
  now: Date,
): LiveMatchGameDoc | null {
  const nextScheduled = selectNextScheduledGame(games, now, null);

  const onCourtCandidates = games
    .filter(
      (game) =>
        isOnCourtStatus(game) &&
        !shouldAdvanceLiveMatchView(game, nextScheduled, now),
    )
    .sort(compareByStartTimeAsc);

  if (onCourtCandidates.length > 0) {
    const active = onCourtCandidates.find((game) => game.status === "active");
    return active ?? onCourtCandidates[0];
  }

  const followingNext = nextScheduled
    ? selectNextScheduledGame(games, now, nextScheduled._id.toString())
    : null;

  if (
    nextScheduled?.status === "active" &&
    !gameHasRecordedScore(nextScheduled) &&
    !shouldAdvanceLiveMatchView(nextScheduled, followingNext, now)
  ) {
    return nextScheduled;
  }

  const rolledForward = games.some(
    (game) =>
      isOnCourtStatus(game) &&
      shouldAdvanceLiveMatchView(game, nextScheduled, now),
  );
  const scoredPending = games.some(
    (game) => game.status === "pendingScore" && gameHasRecordedScore(game),
  );

  if (nextScheduled && (rolledForward || scoredPending)) {
    return nextScheduled;
  }

  return null;
}

/**
 * Next upcoming scheduled match only (draft with future startTime).
 * Avoids surfacing stale draft rows with past start times.
 */
export function selectNextScheduledGame(
  games: LiveMatchGameDoc[],
  now: Date,
  excludeGameId?: string | null,
): LiveMatchGameDoc | null {
  const candidates = games.filter(
    (game) =>
      game.status === "draft" &&
      game._id.toString() !== excludeGameId &&
      game.startTime instanceof Date &&
      game.startTime.getTime() > now.getTime(),
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((earliest, current) => {
    const earliestTs =
      earliest.startTime instanceof Date
        ? earliest.startTime.getTime()
        : Number.POSITIVE_INFINITY;
    const currentTs =
      current.startTime instanceof Date
        ? current.startTime.getTime()
        : Number.POSITIVE_INFINITY;
    if (currentTs !== earliestTs) {
      return currentTs < earliestTs ? current : earliest;
    }
    return current._id.toString() < earliest._id.toString() ? current : earliest;
  }, candidates[0]);
}
