import { DbIdLike } from '../../../types/domain';
import { normalizeTournamentPublishSource, type TournamentPublishSource } from '../../../types/api';
import type { PublishBodyInput } from './validation';
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
		sponsor: objectIdToString(normalizedTournament.sponsor) ?? null,
		name: normalizedTournament.name,
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
		foodInfo: normalizedTournament.foodInfo,
		descriptionInfo: normalizedTournament.descriptionInfo,
	};
}

export function buildPublishCandidate(
	tournament: Readonly<TournamentPublishSource>,
	validatedBody: Readonly<PublishBodyInput>,
	clubId: string
) {
	const base = toPublishCandidateBase(tournament, clubId);

	const { club: _clientClub, ...bodyWithoutClub } = validatedBody as PublishBodyInput & {
		club?: unknown;
	};

	return {
		...base,
		...bodyWithoutClub,
		status: 'active'
	};
}
