import type { TournamentPopulated } from "../../types/api/tournament";

/**
 * Join/leave are blocked once the first round is scheduled or the schedule's
 * `currentRound` is at least 1. Matches {@link mapTournamentDetail} permissions logic.
 */
export function isTournamentSchedulingLocked(tournament: TournamentPopulated) {
  if (tournament.firstRoundScheduledAt != null) {
    return true;
  }

  const schedule = tournament.schedule;
  if (schedule == null) {
    return false;
  }

  return Math.trunc(schedule.currentRound ?? 0) >= 1;
}
