import User from '../../../models/User';
import type { FavoriteClubsUserDoc } from './types';

export async function findUserFavoriteClubs(userId: string) {
	return User.findById(userId)
		.populate('favoriteClubs', '_id name')
		.populate('homeClub', '_id name')
		.select('favoriteClubs homeClub')
		.lean<FavoriteClubsUserDoc>()
		.exec();
}
