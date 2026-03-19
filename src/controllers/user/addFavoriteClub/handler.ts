import { error, ok } from '../../../shared/helpers';
import { addFavoriteClubToUser, findClubById } from './queries';
import { logger } from '../../../lib/logger';

export async function addFavoriteClubFlow(userId: string, input: { club: string }) {

	try{


		const club = await findClubById(input.club);
		if (!club) {
			return error(404, 'Club not found');
		}
		
		const result = await addFavoriteClubToUser(userId, input.club);

	if (result.matchedCount === 0) {
		return error(404, 'User not found');
	}

	if (result.modifiedCount === 0) {
		return error(400, 'Club already in favorites');
	}

	return ok(
		{},
		{ status: 200, message: 'Club added to favorites' }
	);
	} catch (err) {
		logger.error('Error adding favorite club', { err });
		return error(500, 'Failed to add club to favorites');	
	}
	
}
