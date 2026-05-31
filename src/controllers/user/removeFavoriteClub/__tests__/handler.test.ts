import mongoose, { Types } from 'mongoose';
import { removeFavoriteClubFlow } from '../handler';
import * as queries from '../queries';

jest.mock('../queries');

const mockFindUser = queries.findUserById as jest.MockedFunction<typeof queries.findUserById>;
const mockSave = queries.saveUserFavoriteChanges as jest.MockedFunction<
	typeof queries.saveUserFavoriteChanges
>;

const USER_ID = '507f1f77bcf86cd799439011';
const CLUB_ID = '507f1f77bcf86cd799439012';
const OTHER_CLUB_ID = '507f1f77bcf86cd799439013';

function makeUserStub(favoriteIds: string[], homeClubId?: string) {
	return {
		favoriteClubs: favoriteIds.map((id) => new Types.ObjectId(id)),
		homeClub: homeClubId ? new Types.ObjectId(homeClubId) : null,
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	mockSave.mockResolvedValue(undefined);
});

describe('removeFavoriteClubFlow', () => {
	it('returns 200 and clears home club when removing it from favorites', async () => {
		const user = makeUserStub([CLUB_ID, OTHER_CLUB_ID], CLUB_ID);
		mockFindUser.mockResolvedValue(user as never);

		const result = await removeFavoriteClubFlow(USER_ID, CLUB_ID);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.status).toBe(200);
			expect(result.message).toMatch(/removed from favorites/i);
		}
		expect(user.favoriteClubs).toHaveLength(1);
		expect(user.favoriteClubs[0].equals(new mongoose.Types.ObjectId(OTHER_CLUB_ID))).toBe(true);
		expect(user.homeClub).toBeNull();
		expect(mockSave).toHaveBeenCalledWith(user);
	});

	it('returns 404 when user is not found', async () => {
		mockFindUser.mockResolvedValue(null);

		const result = await removeFavoriteClubFlow(USER_ID, CLUB_ID);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(404);
			expect(result.message).toMatch(/user not found/i);
		}
		expect(mockSave).not.toHaveBeenCalled();
	});
});
