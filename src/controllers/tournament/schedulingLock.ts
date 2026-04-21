import type mongoose from "mongoose";

interface TournamentSchedulingState {
  firstRoundScheduledAt?: Date | null;
  schedule?: {
    currentRound?: number;
  } | mongoose.Types.ObjectId | null;
}

/**
 * Join/leave are blocked once the first round is scheduled or the schedule's
 * `currentRound` is at least 1. Matches {@link mapTournamentDetail} permissions logic.
 */
export function isTournamentSchedulingLocked(tournament: TournamentSchedulingState) {
  if (tournament.firstRoundScheduledAt != null) {
    return true;
  }

  const schedule = tournament.schedule;
  if (schedule == null || typeof schedule !== "object" || !("currentRound" in schedule)) {
    return false;
  }

  return Math.trunc(schedule.currentRound ?? 0) >= 1;
}
