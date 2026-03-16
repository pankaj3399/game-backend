import { error, ok } from '../../../shared/helpers';
import { mapFavoriteClubsResponse } from './mapper';
import { findUserFavoriteClubs } from './queries';
import { logger } from '../../../lib/logger';

export async function getFavoriteClubsFlow(userId: string) {
	try{

		const user = await findUserFavoriteClubs(userId);
		
		if (!user) {
			return error(404, 'User not found');
		}
		
		return ok(
			mapFavoriteClubsResponse(user),
			{ status: 200, message: 'Favorite clubs fetched successfully' }
		);
	} catch (err) {
		logger.error('Error getting favorite clubs', { err });
		return error(500, 'Failed to fetch favorite clubs');
	}
}
