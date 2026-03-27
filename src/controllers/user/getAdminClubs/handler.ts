import { error, ok } from '../../../shared/helpers';
import { mapAdminClubsResponse } from './mapper';
import {
	findCourtCountsByClub,
	findClubMemberCountsByClub,
	findTournamentCountsByClub,
	findUserAdminClubs
} from './queries';

type GetAdminClubsQuery = {
	limit?: number;
	offset?: number;
	page?: number;
};

export async function getAdminClubsFlow(userId: string, query?: GetAdminClubsQuery) {
	try {
		const limit = query?.limit;
		const offset =
			query?.offset ?? (limit != null && query?.page != null ? (query.page - 1) * limit : undefined);

		const adminClubs = await findUserAdminClubs(userId, { limit, offset });

		if (!adminClubs) {
			return error(404, 'User not found');
		}

		const clubIds = adminClubs.map((club) => club._id);
		const [courtCountMap, membersCountMap, eventsCountMap] = await Promise.all([
			findCourtCountsByClub(clubIds),
			findClubMemberCountsByClub(clubIds),
			findTournamentCountsByClub(clubIds)
		]);
		const response = mapAdminClubsResponse(adminClubs, courtCountMap, membersCountMap, eventsCountMap);

		return ok(response, { status: 200, message: 'Admin clubs fetched successfully' });
	} catch (err) {
		return error(500, 'Failed to fetch admin clubs');
	}
}
