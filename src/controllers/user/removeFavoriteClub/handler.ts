import mongoose from 'mongoose';
import { error, ok } from '../../../shared/helpers';
import { removeClubFromFavorites } from './mutations';
import { findUserById, saveUserFavoriteChanges } from './queries';
import { logger } from '../../../lib/logger';

export async function removeFavoriteClubFlow(userId: string, clubId: string) {
	try{

	const user = await findUserById(userId);
	if (!user) {
		return error(404, 'User not found');
	}

	removeClubFromFavorites(user, clubId);
	await saveUserFavoriteChanges(user);

	return ok(
		{},
		{ status: 200, message: 'Club removed from favorites' }
	);
} catch (err) {
		logger.error('Error removing favorite club', { err });
		return error(500, 'Failed to remove club from favorites');
	}
}
