import { error, ok } from '../../../shared/helpers';
import { mapAdminClubsResponse } from './mapper';
import { findCourtCountsByClub, findUserAdminClubs } from './queries';

export async function getAdminClubsFlow(userId: string) {
	try {
		const adminClubs = await findUserAdminClubs(userId);
		if (!adminClubs) {
			return error(404, 'User not found');
		}

		const clubIds = adminClubs.map((club) => club._id);
		const courtCountMap = await findCourtCountsByClub(clubIds);
		const response = mapAdminClubsResponse(adminClubs, courtCountMap);

		return ok(response, { status: 200, message: 'Admin clubs fetched successfully' });
	} catch (err) {
		return error(500, 'Failed to fetch admin clubs');
	}
}
