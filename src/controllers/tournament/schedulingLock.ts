import type { TournamentPopulated } from "../../types/api/tournament";

/**
 * True when the schedule document indicates at least one scheduled round exists.
 */
export function hasScheduledRoundInTournamentDetail(tournament: TournamentPopulated) {
	const schedule = tournament.schedule;
	if (!schedule || typeof schedule !== "object") {
		return false;
	}

	const currentRound =
		"currentRound" in schedule && typeof schedule.currentRound === "number"
			? Math.trunc(schedule.currentRound)
			: 0;
	if (currentRound >= 1) {
		return true;
	}

	if (!("rounds" in schedule) || !Array.isArray(schedule.rounds)) {
		return false;
	}

	return schedule.rounds.some((round) => typeof round?.round === "number" && round.round >= 1);
}

/**
 * Join/leave are blocked once the first round is scheduled or the schedule shows active rounds.
 * Matches {@link mapTournamentDetail} permissions logic.
 */
export function isTournamentSchedulingLocked(tournament: TournamentPopulated) {
	return tournament.firstRoundScheduledAt != null || hasScheduledRoundInTournamentDetail(tournament);
}
