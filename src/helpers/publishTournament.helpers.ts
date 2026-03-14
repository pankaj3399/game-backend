import type { PublishInput } from '../validation/tournament.schemas';
import {
	normalizeTournamentPublishSource,
	type DbIdLike,
	type PublishBodyInput,
	type TournamentPublishSource
} from '../controllers/tournament/types/publish';

function objectIdToString(value: DbIdLike | null | undefined): string | undefined {
	if (value == null) return undefined;
	return typeof value === 'string' ? value : value.toString();
}

function toPublishCandidateBase(
	tournament: Readonly<TournamentPublishSource>,
	clubId: string
): Omit<PublishInput, 'status'> {
	const normalizedTournament = normalizeTournamentPublishSource(tournament);

	return {
		club: clubId,
		sponsorId: objectIdToString(normalizedTournament.sponsorId) ?? null,
		name: normalizedTournament.name,
		logo: normalizedTournament.logo,
		date: normalizedTournament.date,
		startTime: normalizedTournament.startTime,
		endTime: normalizedTournament.endTime,
		playMode: normalizedTournament.playMode,
		tournamentMode: normalizedTournament.tournamentMode,
		externalFee: normalizedTournament.externalFee,
		minMember: normalizedTournament.minMember,
		maxMember: normalizedTournament.maxMember,
		playTime: normalizedTournament.playTime,
		pauseTime: normalizedTournament.pauseTime,
		courts: normalizedTournament.courts
			.map((courtId) => objectIdToString(courtId))
			.filter((courtId): courtId is string => !!courtId),
		foodInfo: normalizedTournament.foodInfo,
		descriptionInfo: normalizedTournament.descriptionInfo,
		numberOfRounds: normalizedTournament.numberOfRounds,
		roundTimings: normalizedTournament.roundTimings
	};
}

export function buildPublishCandidate(
	tournament: Readonly<TournamentPublishSource>,
	validatedBody: Readonly<PublishBodyInput>,
	clubId: string
): PublishInput {
	return {
		...toPublishCandidateBase(tournament, clubId),
		...validatedBody,
		status: 'active'
	};
}
