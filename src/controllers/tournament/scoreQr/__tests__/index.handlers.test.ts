import type { Response } from 'express';
import { Types } from 'mongoose';
import User from '../../../../models/User';
import {
	cancelActiveScoreQr,
	confirmScoreQr,
	generateIndependentScoreQr,
	getActiveScoreQr,
	updateScoreQrScores,
	validateScoreQrConfirmContext,
} from '../index';
import * as handler from '../handler';
import * as events from '../events';
import { AppError } from '../../../../shared/errors';

jest.mock('../handler');
jest.mock('../events');
jest.mock('../../../../models/User');

const mockConfirmFlow = handler.confirmScoreQrFlow as jest.MockedFunction<
	typeof handler.confirmScoreQrFlow
>;
const mockActiveFlow = handler.getActiveScoreQrSessionFlow as jest.MockedFunction<
	typeof handler.getActiveScoreQrSessionFlow
>;
const mockUpdateFlow = handler.updateScoreQrSessionScoresFlow as jest.MockedFunction<
	typeof handler.updateScoreQrSessionScoresFlow
>;
const mockGenerateFlow = handler.generateScoreQrFlow as jest.MockedFunction<
	typeof handler.generateScoreQrFlow
>;
const mockConfirmContextFlow = handler.validateScoreQrConfirmContextFlow as jest.MockedFunction<
	typeof handler.validateScoreQrConfirmContextFlow
>;
const mockCancelFlow = handler.cancelActiveScoreQrFlow as jest.MockedFunction<
	typeof handler.cancelActiveScoreQrFlow
>;
const mockPublish = events.publishScoreQrRequestEvent as jest.MockedFunction<
	typeof events.publishScoreQrRequestEvent
>;

const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439011');
const REQUEST_ID = '507f1f77bcf86cd799439012';
const MATCH_ID = '507f1f77bcf86cd799439013';

function mockRes() {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('confirmScoreQr HTTP handler', () => {
	it('returns 400 for invalid body', async () => {
		const res = mockRes();
		await confirmScoreQr({ body: {}, user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns completed message when match finishes', async () => {
		mockConfirmFlow.mockResolvedValue({
			matchId: MATCH_ID,
			tournamentId: '507f1f77bcf86cd799439014',
			matchStatus: 'completed',
			tournamentCompleted: false,
			updatedRatings: [],
			requestId: REQUEST_ID,
			consumedAt: new Date().toISOString(),
		});
		const res = mockRes();
		await confirmScoreQr(
			{ body: { token: 'valid-token' }, user: { _id: USER_ID } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Score confirmed and match completed' }),
		);
	});

	it('returns pending winner message when match stays open', async () => {
		mockConfirmFlow.mockResolvedValue({
			matchId: MATCH_ID,
			tournamentId: null,
			matchStatus: 'pendingScore',
			tournamentCompleted: false,
			updatedRatings: [],
			requestId: REQUEST_ID,
			consumedAt: new Date().toISOString(),
		});
		const res = mockRes();
		await confirmScoreQr(
			{ body: { token: 'valid-token' }, user: { _id: USER_ID } } as never,
			res,
		);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Score confirmed but winner is still pending' }),
		);
	});

	it('maps AppError to status code', async () => {
		mockConfirmFlow.mockRejectedValue(new AppError('QR request expired', 410));
		const res = mockRes();
		await confirmScoreQr(
			{ body: { token: 'expired' }, user: { _id: USER_ID } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(410);
	});
});

describe('getActiveScoreQr HTTP handler', () => {
	it('returns 400 for invalid query', async () => {
		const res = mockRes();
		await getActiveScoreQr({ query: { flow: 'bad' }, user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns null session when none active', async () => {
		mockActiveFlow.mockResolvedValue(null);
		const res = mockRes();
		await getActiveScoreQr({ query: {}, user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'No active score QR session', session: null }),
		);
	});

	it('returns active session payload', async () => {
		mockActiveFlow.mockResolvedValue({
			requestId: REQUEST_ID,
			token: 'tok',
			flow: 'independent',
			tournamentId: null,
			matchId: MATCH_ID,
			requestByUserId: USER_ID.toString(),
			opponentUserId: null,
			opponentUserProfile: null,
			playerOneScores: [6],
			playerTwoScores: [4],
			playMode: '3set',
			matchType: 'singles',
			expiresAt: new Date().toISOString(),
			validationUrl: 'http://localhost/v',
			qrDataUrl: 'data:image/png;base64,x',
		});
		const res = mockRes();
		await getActiveScoreQr({ query: { flow: 'independent' }, user: { _id: USER_ID } } as never, res);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Active score QR session fetched', session: expect.any(Object) }),
		);
	});
});

describe('updateScoreQrScores HTTP handler', () => {
	it('returns 400 for invalid request id', async () => {
		const res = mockRes();
		await updateScoreQrScores(
			{
				params: { requestId: 'bad' },
				body: { playerOneScores: [6], playerTwoScores: [4] },
				user: { _id: USER_ID },
			} as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('updates scores and publishes SSE event', async () => {
		mockUpdateFlow.mockResolvedValue({
			requestId: REQUEST_ID,
			playerOneScores: [7],
			playerTwoScores: [5],
		});
		const res = mockRes();
		await updateScoreQrScores(
			{
				params: { requestId: REQUEST_ID },
				body: { playerOneScores: [7], playerTwoScores: [5] },
				user: { _id: USER_ID },
			} as never,
			res,
		);
		expect(mockPublish).toHaveBeenCalledWith(REQUEST_ID, 'scores-updated', {
			playerOneScores: [7],
			playerTwoScores: [5],
		});
		expect(res.status).toHaveBeenCalledWith(200);
	});
});

describe('generateIndependentScoreQr HTTP handler', () => {
	it('returns 400 for invalid body', async () => {
		const res = mockRes();
		await generateIndependentScoreQr({ body: {}, user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns independent QR payload on success', async () => {
		mockGenerateFlow.mockResolvedValue({
			flow: 'independent',
			matchId: MATCH_ID,
			tournamentId: null,
			requestId: REQUEST_ID,
			token: 'tok',
			qrDataUrl: 'data:image/png;base64,x',
			validationUrl: 'http://localhost/v',
			expiresAt: new Date().toISOString(),
		});
		const res = mockRes();
		await generateIndependentScoreQr(
			{
				body: {
					playerOneScores: [6],
					playerTwoScores: [4],
					independentMatchType: 'singles',
					independentPlayMode: '3set',
				},
				user: { _id: USER_ID },
			} as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Independent score QR generated successfully' }),
		);
	});
});

describe('validateScoreQrConfirmContext HTTP handler', () => {
	it('returns 410 when token expired', async () => {
		mockConfirmContextFlow.mockResolvedValue({ valid: false, reason: 'expired', request: null });
		const res = mockRes();
		await validateScoreQrConfirmContext(
			{ body: { token: 'expired' }, user: { _id: USER_ID } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(410);
	});

	it('returns requester profile on valid token', async () => {
		mockConfirmContextFlow.mockResolvedValue({
			valid: true,
			reason: 'ok',
			request: {
				id: REQUEST_ID,
				flow: 'independent',
				tournamentId: null,
				tournamentName: null,
				matchId: MATCH_ID,
				requestByUserId: USER_ID.toString(),
				opponentUserId: null,
				playerOneScores: [6],
				playerTwoScores: [4],
				playMode: '3set',
				matchType: 'singles',
				expiresAt: new Date().toISOString(),
			},
		});
		(User.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve({
							name: 'Alice',
							alias: 'A',
							profilePictureUrl: 'http://pic',
						}),
				}),
			}),
		});
		const res = mockRes();
		await validateScoreQrConfirmContext(
			{ body: { token: 'valid' }, user: { _id: USER_ID } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				request: expect.objectContaining({
					requestByUserProfile: { name: 'Alice', alias: 'A', profilePictureUrl: 'http://pic' },
				}),
			}),
		);
	});
});

describe('cancelActiveScoreQr HTTP handler', () => {
	it('returns success after cancelling flow', async () => {
		mockCancelFlow.mockResolvedValue(undefined);
		const res = mockRes();
		await cancelActiveScoreQr({ user: { _id: USER_ID } } as never, res);
		expect(mockCancelFlow).toHaveBeenCalledWith(USER_ID.toString());
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ success: true });
	});

	it('maps AppError status', async () => {
		mockCancelFlow.mockRejectedValue(new AppError('Forbidden', 403));
		const res = mockRes();
		await cancelActiveScoreQr({ user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(403);
	});
});
