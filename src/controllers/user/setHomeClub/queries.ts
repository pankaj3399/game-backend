import User from '../../../models/User';

export async function assignHomeClubFromFavorites(userId: string, clubId: string) {
	return User.findOneAndUpdate(
		{ _id: userId, favoriteClubs: clubId },
		{ $set: { homeClub: clubId } },
		{ returnDocument: 'after' }
	).exec();
}

export async function checkUserExists(userId: string) {
	return User.findById(userId).select('_id').lean().exec();
}
