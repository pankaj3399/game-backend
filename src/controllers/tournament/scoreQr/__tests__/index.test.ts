import type { Response } from 'express';
import { Types } from 'mongoose';
import { generateScoreQr, validateScoreQr } from '../index';
import * as handler from '../handler';
import * as scheduleQueries from '../../../schedule/shared/queries';
import * as scheduleAuth from '../../../schedule/shared/authorize';

jest.mock('../handler');
jest.mock('../../../schedule/shared/queries');
jest.mock('../../../schedule/shared/authorize');

const mockGenerateFlow = handler.generateScoreQrFlow as jest.MockedFunction<
	typeof handler.generateScoreQrFlow
>;
const mockValidateFlow = handler.validateScoreQrTokenFlow as jest.MockedFunction<
	typeof handler.validateScoreQrTokenFlow
>;
const mockFetchContext = scheduleQueries.fetchTournamentScheduleContext as jest.MockedFunction<
	typeof scheduleQueries.fetchTournamentScheduleContext
>;
const mockAuthorize = scheduleAuth.authorizeScheduleOrMatchParticipant as jest.MockedFunction<
	typeof scheduleAuth.authorizeScheduleOrMatchParticipant
>;

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const MATCH_ID = '507f1f77bcf86cd799439012';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439013');

function mockRes() {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockFetchContext.mockResolvedValue({ _id: TOURNAMENT_ID } as never);
	mockAuthorize.mockResolvedValue({ status: 200, message: 'ok' } as never);
});

describe('generateScoreQr HTTP handler', () => {
	it('returns 400 for invalid tournament id', async () => {
		const res = mockRes();
		await generateScoreQr(
			{ params: { id: 'bad', matchId: MATCH_ID }, body: {}, user: { _id: USER_ID } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns 200 with QR payload on success', async () => {
		mockGenerateFlow.mockResolvedValue({
			flow: 'tournament',
			matchId: MATCH_ID,
			tournamentId: TOURNAMENT_ID,
			requestId: 'req-1',
			token: 'tok',
			qrDataUrl: 'data:image/png;base64,x',
			validationUrl: 'http://localhost/validate',
			expiresAt: new Date().toISOString(),
		});
		const res = mockRes();
		await generateScoreQr(
			{
				params: { id: TOURNAMENT_ID, matchId: MATCH_ID },
				body: { playerOneScores: [6], playerTwoScores: [4] },
				user: { _id: USER_ID },
			} as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ flow: 'tournament', qr: expect.objectContaining({ token: 'tok' }) }),
		);
	});
});

describe('validateScoreQr HTTP handler', () => {
	it('maps expired validation to 410', async () => {
		mockValidateFlow.mockResolvedValue({ valid: false, reason: 'expired', request: null });
		const res = mockRes();
		await validateScoreQr({ params: { token: 'any' } } as never, res);
		expect(res.status).toHaveBeenCalledWith(410);
	});
});
