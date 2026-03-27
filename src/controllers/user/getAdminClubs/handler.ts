import { error, ok } from '../../../shared/helpers';
import { mapAdminClubsResponse } from './mapper';
import {
	findCourtCountsByClub,
	findClubMemberCountsByClub,
	findTournamentCountsByClub,
	findUserAdminClubs
} from './queries';

export async function getAdminClubsFlow(userId: string) {
	try {
		const adminClubs = await findUserAdminClubs(userId);

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
