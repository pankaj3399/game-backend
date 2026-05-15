import type { AdminClubDoc } from './types';

export function mapAdminClubsResponse(
	clubs: AdminClubDoc[],
	courtCountMap: Map<string, number>,
	membersCountMap: Map<string, number>,
	eventsCountMap: Map<string, number>
) {
	const id = (club: AdminClubDoc) => club._id.toString();

	return {
		clubs: clubs.map((club) => ({
			id: id(club),
			name: club.name,
			logoUrl: club.logoUrl ?? null,
			courtCount: courtCountMap.get(id(club)) ?? 0,
			membersCount: membersCountMap.get(id(club)) ?? 0,
			eventsCount: eventsCountMap.get(id(club)) ?? 0
		}))
	};
}
