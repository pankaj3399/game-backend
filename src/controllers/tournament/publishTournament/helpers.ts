import { DbIdLike } from '../../../types/domain';
import { normalizeTournamentPublishSource, type TournamentPublishSource, PublishBodyInput } from '../../../types/api';
function objectIdToString(value: DbIdLike | null | undefined): string | undefined {
	if (value == null) return undefined;
	return typeof value === 'string' ? value : value.toString();
}

function toPublishCandidateBase(
	tournament: Readonly<TournamentPublishSource>,
	clubId: string
) {
	const normalizedTournament = normalizeTournamentPublishSource(tournament);

	return {
		club: clubId,
		sponsorId: objectIdToString(normalizedTournament.sponsor) ?? null,
		name: normalizedTournament.name,
		logo: normalizedTournament.logo,
		date: normalizedTournament.date,
		startTime: normalizedTournament.startTime,
		endTime: normalizedTournament.endTime,
		playMode: normalizedTournament.playMode,
		tournamentMode: normalizedTournament.tournamentMode,
		entryFee: normalizedTournament.entryFee,
		minMember: normalizedTournament.minMember,
		maxMember: normalizedTournament.maxMember,
		duration: normalizedTournament.duration,
		breakDuration: normalizedTournament.breakDuration,
		courts: normalizedTournament.courts
			.map((courtId) => objectIdToString(courtId))
			.filter((courtId): courtId is string => !!courtId),
		foodInfo: normalizedTournament.foodInfo,
		descriptionInfo: normalizedTournament.descriptionInfo,
	};
}

export function buildPublishCandidate(
	tournament: Readonly<TournamentPublishSource>,
	validatedBody: Readonly<PublishBodyInput>,
	clubId: string
) {
	return {
		...toPublishCandidateBase(tournament, clubId),
		...validatedBody,
		status: 'active'
	};
}
