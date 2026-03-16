import type { AdminClubDoc } from './types';

export function mapAdminClubsResponse(clubs: AdminClubDoc[], courtCountMap: Map<string, number>) {
	return {
		clubs: clubs.map((club) => ({
			id: club._id.toString(),
			name: club.name,
			courtCount: courtCountMap.get(club._id.toString()) ?? 0
		}))
	};
}
