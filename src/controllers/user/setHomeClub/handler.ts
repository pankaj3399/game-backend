
import type { SetHomeClubInput } from '../../../validation/user.schemas';
import { error, ok } from '../../../shared/helpers';
import { assignHomeClubFromFavorites, checkUserExists } from './queries';
import { logger } from '../../../lib/logger';

export async function setHomeClubFlow(userId: string, input: SetHomeClubInput) {

	try{

		const updated = await assignHomeClubFromFavorites(userId, input.club);
		
	if (!updated) {
		const userExists = await checkUserExists(userId);
		if (!userExists) {
			return error(404, 'User not found');
		}
		
		return error(400, 'Club must be in favorites to set as home club');
	}

	return ok(
		{},
		{ status: 200, message: 'Home club updated' }
	); 
} catch (err) {
		logger.error('Error setting home club', { err });
		return error(500, 'Failed to set home club');
	}
}
