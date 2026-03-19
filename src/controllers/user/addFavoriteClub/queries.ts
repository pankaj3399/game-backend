import Club from '../../../models/Club';
import User from '../../../models/User';

export async function findClubById(clubId: string) {
	return Club.findById(clubId).select('_id').lean().exec();
}

export async function addFavoriteClubToUser(userId: string, clubId: string) {
	return User.updateOne(
		{
			_id: userId,
			$or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
		},
		{ $addToSet: { favoriteClubs: clubId } }
	);
}
