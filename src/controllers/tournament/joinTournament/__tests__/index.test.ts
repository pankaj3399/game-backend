import { Types } from 'mongoose';
import type { Response } from 'express';
import { joinTournament } from '../index';
import { getTournamentById } from '../queries';
import { authorizeJoin } from '../authorize';
import { joinTournamentFlow } from '../handler';
import type { AuthenticatedRequest } from '../../../../shared/authContext';

jest.mock('../queries');
jest.mock('../authorize');
jest.mock('../handler');
jest.mock('../../../../lib/logger', () => ({ logger: { error: jest.fn() } }));

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

const mockGet = getTournamentById as jest.MockedFunction<typeof getTournamentById>;
const mockAuth = authorizeJoin as jest.MockedFunction<typeof authorizeJoin>;
const mockFlow = joinTournamentFlow as jest.MockedFunction<typeof joinTournamentFlow>;

function mockRes() {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockGet.mockResolvedValue({ status: 'active', club: { _id: 'c' } } as never);
	mockAuth.mockResolvedValue({ ok: true, status: 200, message: 'ok', data: {} } as never);
});

describe('joinTournament HTTP handler', () => {
	it('returns 404 when tournament missing', async () => {
		mockGet.mockResolvedValue(null);
		const res = mockRes();
		await joinTournament(
			{ params: { id: TOURNAMENT_ID }, user: { _id: USER_ID } } as AuthenticatedRequest,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('returns join payload on success', async () => {
		mockFlow.mockResolvedValue({
			ok: true,
			status: 200,
			message: 'ok',
			data: {
				tournamentId: TOURNAMENT_ID,
				spotsFilled: 3,
				spotsTotal: 8,
				isParticipant: true,
			},
		} as never);
		const res = mockRes();
		await joinTournament(
			{ params: { id: TOURNAMENT_ID }, user: { _id: USER_ID } } as AuthenticatedRequest,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				tournament: expect.objectContaining({ spotsFilled: 3, isParticipant: true }),
			}),
		);
	});
});
