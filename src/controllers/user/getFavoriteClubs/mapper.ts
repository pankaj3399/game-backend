
import type { FavoriteClubsUserDoc } from './types';

export function mapFavoriteClubsResponse(data: FavoriteClubsUserDoc) {
	return {
		favoriteClubs: data.favoriteClubs.map((club) => ({
			id: club._id.toString(),
			name: club.name
		})),
		homeClub: data.homeClub
			? {
				id: data.homeClub._id.toString(),
				name: data.homeClub.name
			}
			: null
	};
}
