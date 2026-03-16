import mongoose from 'mongoose';
import type { UserDocument } from '../../../models/User';

export function removeClubFromFavorites(user: UserDocument, clubId: string) {
	const clubObjectId = new mongoose.Types.ObjectId(clubId);
	user.favoriteClubs = user.favoriteClubs.filter((id) => !id.equals(clubObjectId));

	if (user.homeClub?.equals(clubObjectId)) {
		user.homeClub = null;
	}
}
