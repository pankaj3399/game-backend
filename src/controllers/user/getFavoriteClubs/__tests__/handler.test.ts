import { Types } from 'mongoose';
import { getFavoriteClubsFlow } from '../handler';
import * as queries from '../queries';

jest.mock('../queries');

const mockFindUser = queries.findUserFavoriteClubs as jest.MockedFunction<
	typeof queries.findUserFavoriteClubs
>;

const USER_ID = '507f1f77bcf86cd799439011';
const CLUB_A = new Types.ObjectId('507f1f77bcf86cd799439012');
const CLUB_B = new Types.ObjectId('507f1f77bcf86cd799439013');

beforeEach(() => {
	jest.clearAllMocks();
});

describe('getFavoriteClubsFlow', () => {
	it('returns mapped favorite clubs and home club', async () => {
		mockFindUser.mockResolvedValue({
			favoriteClubs: [
				{ _id: CLUB_A, name: 'Alpha Club' },
				{ _id: CLUB_B, name: 'Beta Club' },
			],
			homeClub: { _id: CLUB_A, name: 'Alpha Club' },
		} as never);

		const result = await getFavoriteClubsFlow(USER_ID);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.status).toBe(200);
			expect(result.data).toEqual({
				favoriteClubs: [
					{ id: CLUB_A.toString(), name: 'Alpha Club' },
					{ id: CLUB_B.toString(), name: 'Beta Club' },
				],
				homeClub: { id: CLUB_A.toString(), name: 'Alpha Club' },
			});
		}
		expect(mockFindUser).toHaveBeenCalledWith(USER_ID);
	});

	it('returns 404 when user is not found', async () => {
		mockFindUser.mockResolvedValue(null);

		const result = await getFavoriteClubsFlow(USER_ID);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(404);
			expect(result.message).toMatch(/user not found/i);
		}
	});
});
