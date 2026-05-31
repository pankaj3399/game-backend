import { Types } from 'mongoose';
import type { Response } from 'express';
import Tournament from '../../../../models/Tournament';
import { recordMatchScore } from '../index';
import { fetchTournamentScheduleContext } from '../../../schedule/shared/queries';
import {
	authorizeScheduleOrMatchParticipant,
	hasTournamentScheduleAccess,
} from '../../../schedule/shared/authorize';
import { recordTournamentMatchScoreFlow } from '../handler';
import type { AuthenticatedRequest } from '../../../../shared/authContext';

jest.mock('../../../../models/Tournament');
jest.mock('../../../schedule/shared/queries');
jest.mock('../../../schedule/shared/authorize');
jest.mock('../handler');
jest.mock('../../../../lib/logger', () => ({ logger: { error: jest.fn() } }));

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const MATCH_ID = '507f1f77bcf86cd799439012';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439013');

const mockContext = fetchTournamentScheduleContext as jest.MockedFunction<
	typeof fetchTournamentScheduleContext
>;
const mockParticipantAuth = authorizeScheduleOrMatchParticipant as jest.MockedFunction<
	typeof authorizeScheduleOrMatchParticipant
>;
const mockScheduleAccess = hasTournamentScheduleAccess as jest.MockedFunction<
	typeof hasTournamentScheduleAccess
>;
const mockFlow = recordTournamentMatchScoreFlow as jest.MockedFunction<
	typeof recordTournamentMatchScoreFlow
>;

function mockRes() {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockContext.mockResolvedValue({ _id: TOURNAMENT_ID } as never);
	mockParticipantAuth.mockResolvedValue({ status: 200, message: 'ok' } as never);
	mockScheduleAccess.mockResolvedValue(false);
	(Tournament.findById as jest.Mock).mockReturnValue({
		select: () => ({
			lean: () => ({ exec: () => Promise.resolve({ completedAt: null }) }),
		}),
	});
});

describe('recordMatchScore HTTP handler', () => {
	it('returns 400 for invalid params', async () => {
		const res = mockRes();
		await recordMatchScore(
			{
				params: { id: 'bad', matchId: MATCH_ID },
				body: { playerOneScores: [6], playerTwoScores: [4] },
				user: { _id: USER_ID },
			} as AuthenticatedRequest,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(mockContext).not.toHaveBeenCalled();
		expect(mockParticipantAuth).not.toHaveBeenCalled();
		expect(mockScheduleAccess).not.toHaveBeenCalled();
		expect(Tournament.findById).not.toHaveBeenCalled();
		expect(mockFlow).not.toHaveBeenCalled();
	});

	it('returns 200 with completed match message', async () => {
		mockFlow.mockResolvedValue({
			matchId: MATCH_ID,
			tournamentId: TOURNAMENT_ID,
			matchStatus: 'completed',
			tournamentCompleted: false,
			updatedRatings: [],
			ratingsRecomputed: false,
		});
		const res = mockRes();
		await recordMatchScore(
			{
				params: { id: TOURNAMENT_ID, matchId: MATCH_ID },
				body: { playerOneScores: [6], playerTwoScores: [4] },
				user: { _id: USER_ID },
			} as AuthenticatedRequest,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Match score recorded' }),
		);
	});
});
