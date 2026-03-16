import mongoose from 'mongoose';

export type FavoriteClubDoc = {
	_id: mongoose.Types.ObjectId;
	name: string;
};

export type FavoriteClubsUserDoc = {
	favoriteClubs: FavoriteClubDoc[];
	homeClub: FavoriteClubDoc | null;
};
