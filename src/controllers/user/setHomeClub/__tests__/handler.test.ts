import { setHomeClubFlow } from '../handler';
import * as queries from '../queries';

jest.mock('../queries');

const mockAssign = queries.assignHomeClubFromFavorites as jest.MockedFunction<
	typeof queries.assignHomeClubFromFavorites
>;
const mockCheckUser = queries.checkUserExists as jest.MockedFunction<typeof queries.checkUserExists>;

const USER_ID = '507f1f77bcf86cd799439011';
const CLUB_ID = '507f1f77bcf86cd799439012';

beforeEach(() => {
	jest.clearAllMocks();
});

describe('setHomeClubFlow', () => {
	it('returns 200 when home club is updated', async () => {
		mockAssign.mockResolvedValue({ _id: USER_ID, homeClub: CLUB_ID } as never);

		const result = await setHomeClubFlow(USER_ID, { club: CLUB_ID });

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.status).toBe(200);
			expect(result.message).toMatch(/home club updated/i);
		}
		expect(mockAssign).toHaveBeenCalledWith(USER_ID, CLUB_ID);
		expect(mockCheckUser).not.toHaveBeenCalled();
	});

	it('returns 404 when user does not exist', async () => {
		mockAssign.mockResolvedValue(null);
		mockCheckUser.mockResolvedValue(null);

		const result = await setHomeClubFlow(USER_ID, { club: CLUB_ID });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(404);
			expect(result.message).toMatch(/user not found/i);
		}
	});

	it('returns 400 when club is not in favorites', async () => {
		mockAssign.mockResolvedValue(null);
		mockCheckUser.mockResolvedValue({ _id: USER_ID } as never);

		const result = await setHomeClubFlow(USER_ID, { club: CLUB_ID });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(400);
			expect(result.message).toMatch(/must be in favorites/i);
		}
	});
});
