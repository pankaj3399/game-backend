import { Types } from 'mongoose';
import { getAdminClubsFlow } from '../handler';
import * as queries from '../queries';

jest.mock('../queries');

const mockFindClubs = queries.findUserAdminClubs as jest.MockedFunction<
	typeof queries.findUserAdminClubs
>;
const mockCourts = queries.findCourtCountsByClub as jest.MockedFunction<
	typeof queries.findCourtCountsByClub
>;
const mockMembers = queries.findClubMemberCountsByClub as jest.MockedFunction<
	typeof queries.findClubMemberCountsByClub
>;
const mockEvents = queries.findTournamentCountsByClub as jest.MockedFunction<
	typeof queries.findTournamentCountsByClub
>;

const USER_ID = '507f1f77bcf86cd799439011';
const CLUB_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

beforeEach(() => {
	jest.clearAllMocks();
	mockCourts.mockResolvedValue(new Map([[CLUB_ID.toString(), 2]]));
	mockMembers.mockResolvedValue(new Map([[CLUB_ID.toString(), 10]]));
	mockEvents.mockResolvedValue(new Map([[CLUB_ID.toString(), 3]]));
});

describe('getAdminClubsFlow', () => {
	it('returns 404 when user not found', async () => {
		mockFindClubs.mockResolvedValue(null);
		const result = await getAdminClubsFlow(USER_ID);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(404);
	});

	it('returns mapped admin clubs with counts', async () => {
		mockFindClubs.mockResolvedValue([
			{
				_id: CLUB_ID,
				name: 'Club A',
				logoUrl: null,
				address: 'Addr',
				plan: 'premium',
				expiresAt: null,
			},
		] as never);

		const result = await getAdminClubsFlow(USER_ID, { page: 1, limit: 10 });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.clubs[0]).toMatchObject({
				id: CLUB_ID.toString(),
				name: 'Club A',
				courtCount: 2,
				membersCount: 10,
				eventsCount: 3,
			});
		}
	});
});
