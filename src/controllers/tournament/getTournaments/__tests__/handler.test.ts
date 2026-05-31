import Tournament from '../../../../models/Tournament';
import { getTournamentsFlow } from '../handler';
import * as distanceService from '../distanceService';

jest.mock('../../../../models/Tournament');
jest.mock('../distanceService');

const mockFindClubIds = distanceService.findClubIdsForDistanceBand as jest.MockedFunction<
	typeof distanceService.findClubIdsForDistanceBand
>;

const baseQuery = {
	page: 1,
	limit: 10,
	status: 'active' as const,
	clubScope: 'all' as const,
};

const baseCtx = {
	role: 'player' as const,
	userId: '507f1f77bcf86cd799439011',
	adminOf: [],
	organizerOf: [],
	homeClubCoordinates: null,
};

function mockTournamentFind(results: unknown[] = []) {
	const chain = {
		populate: jest.fn().mockReturnThis(),
		sort: jest.fn().mockReturnThis(),
		skip: jest.fn().mockReturnThis(),
		limit: jest.fn().mockReturnThis(),
		lean: jest.fn().mockReturnThis(),
		exec: jest.fn().mockResolvedValue(results),
	};
	(Tournament.find as jest.Mock).mockReturnValue(chain);
	return chain;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockTournamentFind([]);
	(Tournament.countDocuments as jest.Mock).mockReturnValue({
		exec: jest.fn().mockResolvedValue(0),
	});
});

describe('getTournamentsFlow', () => {
	it('returns 400 when distance filter requested without home club coordinates', async () => {
		const result = await getTournamentsFlow(
			{ ...baseQuery, distance: 'near' },
			baseCtx,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(400);
			expect(result.message).toMatch(/home club/i);
		}
	});

	it('applies distance club filter when coordinates exist', async () => {
		mockFindClubIds.mockResolvedValue(['507f1f77bcf86cd799439012']);
		const result = await getTournamentsFlow(
			{ ...baseQuery, distance: 'near' },
			{ ...baseCtx, homeClubCoordinates: [77.5, 12.9] },
		);
		expect(result.ok).toBe(true);
		expect(mockFindClubIds).toHaveBeenCalled();
		expect(Tournament.find).toHaveBeenCalled();
	});
});
