import { Types } from 'mongoose';
import { joinTournamentFlow } from '../handler';
import * as queries from '../queries';

jest.mock('../queries');

const mockAddParticipant = queries.addParticipantIfCapacityAllows as jest.MockedFunction<
	typeof queries.addParticipantIfCapacityAllows
>;

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

describe('joinTournamentFlow', () => {
	it('returns 400 when tournament is full or closed', async () => {
		mockAddParticipant.mockResolvedValue(null);
		const result = await joinTournamentFlow(TOURNAMENT_ID, { _id: USER_ID } as never);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(400);
	});

	it('returns spots and participant flag on success', async () => {
		mockAddParticipant.mockResolvedValue({
			participants: [USER_ID],
			maxMember: 8,
		} as never);

		const result = await joinTournamentFlow(TOURNAMENT_ID, { _id: USER_ID } as never);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual({
				tournamentId: TOURNAMENT_ID,
				spotsFilled: 1,
				spotsTotal: 8,
				isParticipant: true,
			});
		}
	});
});
