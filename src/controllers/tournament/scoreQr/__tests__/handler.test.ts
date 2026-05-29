import crypto from 'crypto';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import Game from '../../../../models/Game';
import Tournament from '../../../../models/Tournament';
import User from '../../../../models/User';
import ScoreValidationRequest from '../../../../models/ScoreValidationRequest';
import { AppError } from '../../../../shared/errors';
import { signScoreQrToken } from '../../../../shared/scoreQrToken';
import {
	cancelActiveScoreQrFlow,
	confirmScoreQrFlow,
	generateScoreQrFlow,
	getActiveScoreQrSessionFlow,
	updateScoreQrSessionScoresFlow,
	validateScoreQrConfirmContextFlow,
	validateScoreQrTokenFlow,
} from '../handler';
import * as queries from '../queries';
import { recordTournamentMatchScoreFlow } from '../../recordMatchScore/handler';
import { fetchTournamentScheduleContext } from '../../../schedule/shared/queries';
import { hasTournamentScheduleAccess } from '../../../schedule/shared/authorize';

jest.mock('qrcode');
jest.mock('../../../../models/Game');
jest.mock('../../../../models/User');
jest.mock('../../../../models/ScoreValidationRequest');
jest.mock('../../../../models/Tournament');
jest.mock('../queries');
jest.mock('../../recordMatchScore/handler');
jest.mock('../../../schedule/shared/queries');
jest.mock('../../../schedule/shared/authorize');
jest.mock('../events', () => ({
	publishScoreQrRequestEvent: jest.fn(),
}));

const mockFindGame = queries.findTournamentGame as jest.MockedFunction<typeof queries.findTournamentGame>;
const mockExpire = queries.expireStalePendingRequests as jest.MockedFunction<
	typeof queries.expireStalePendingRequests
>;
const mockCancel = queries.cancelPendingRequests as jest.MockedFunction<typeof queries.cancelPendingRequests>;
const mockCreateStandalone = queries.createStandaloneMatchForQr as jest.MockedFunction<
	typeof queries.createStandaloneMatchForQr
>;
const mockGetOpponent = queries.getOpponentUserIdFromGame as jest.MockedFunction<
	typeof queries.getOpponentUserIdFromGame
>;
const mockFindRequest = queries.findScoreValidationRequestById as jest.MockedFunction<
	typeof queries.findScoreValidationRequestById
>;

const REQUESTER = '507f1f77bcf86cd799439011';
const TOURNAMENT = '507f1f77bcf86cd799439012';
const MATCH = '507f1f77bcf86cd799439013';
const OPPONENT = '507f1f77bcf86cd799439014';

const scoreInput = { playerOneScores: [6], playerTwoScores: [4] };

beforeEach(() => {
	jest.clearAllMocks();
	mockExpire.mockResolvedValue(undefined);
	mockCancel.mockResolvedValue(undefined);
	(QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,abc');
	(ScoreValidationRequest.updateOne as jest.Mock).mockReturnValue({
		exec: () => Promise.resolve({}),
	});
});

describe('generateScoreQrFlow', () => {
	it('rejects invalid requester id', async () => {
		await expect(
			generateScoreQrFlow({
				requesterUserId: 'bad',
				input: scoreInput,
				publicBaseUrl: 'http://localhost',
			}),
		).rejects.toThrow(AppError);
	});

	it('requires tournament and match ids together', async () => {
		await expect(
			generateScoreQrFlow({
				requesterUserId: REQUESTER,
				tournamentId: TOURNAMENT,
				input: scoreInput,
				publicBaseUrl: 'http://localhost',
			}),
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it('generates independent QR and persists pending request', async () => {
		mockCreateStandalone.mockResolvedValue({
			matchId: MATCH,
			playMode: '3set',
			matchType: 'singles',
			opponentUserId: null,
		});
		const requestId = new Types.ObjectId();
		(ScoreValidationRequest.create as jest.Mock).mockResolvedValue({
			_id: requestId,
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		});

		const result = await generateScoreQrFlow({
			requesterUserId: REQUESTER,
			input: scoreInput,
			publicBaseUrl: 'http://localhost',
			independentPlayMode: '3set',
		});

		expect(result.flow).toBe('independent');
		expect(result.matchId).toBe(MATCH);
		expect(ScoreValidationRequest.create).toHaveBeenCalled();
		expect(result.qrDataUrl).toContain('data:image');
	});

	it('maps tournament requester scores to canonical sides', async () => {
		mockFindGame.mockResolvedValue({
			status: 'pendingScore',
			playMode: '3set',
			matchType: 'singles',
			side1: { players: [new Types.ObjectId(OPPONENT)] },
			side2: { players: [new Types.ObjectId(REQUESTER)] },
		} as never);
		mockGetOpponent.mockReturnValue(OPPONENT);
		(ScoreValidationRequest.create as jest.Mock).mockResolvedValue({
			_id: new Types.ObjectId(),
			expiresAt: new Date(),
		});

		await generateScoreQrFlow({
			requesterUserId: REQUESTER,
			tournamentId: TOURNAMENT,
			matchId: MATCH,
			input: scoreInput,
			publicBaseUrl: 'http://localhost',
		});

		expect(ScoreValidationRequest.create).toHaveBeenCalledWith(
			expect.objectContaining({
				playerOneScores: [4],
				playerTwoScores: [6],
			}),
		);
	});
});

describe('validateScoreQrTokenFlow', () => {
	it('returns malformed for garbage token', async () => {
		const result = await validateScoreQrTokenFlow('not-a-jwt');
		expect(result.valid).toBe(false);
		expect(result.reason).toBe('malformed');
	});

	it('returns valid when token matches persisted pending request', async () => {
		const requestId = new Types.ObjectId();
		const matchId = new Types.ObjectId(MATCH);
		const token = signScoreQrToken({
			jti: 'jti-1',
			sid: requestId.toString(),
			flow: 'independent',
			tid: null,
			mid: matchId.toString(),
			rby: REQUESTER,
			opp: null,
		});
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
		const expiresAt = new Date(Date.now() + 60_000);
		mockFindRequest.mockResolvedValue({
			_id: requestId,
			tokenHash,
			match: matchId,
			requestByUser: new Types.ObjectId(REQUESTER),
			tournament: null,
			opponentUser: null,
			playerOneScores: [6],
			playerTwoScores: [4],
			playMode: '3set',
			matchType: 'singles',
			status: 'pending',
			expiresAt,
		} as never);

		const result = await validateScoreQrTokenFlow(token);
		expect(result.valid).toBe(true);
		expect(result.request?.matchId).toBe(matchId.toString());
	});

	it('returns request_expired and marks pending request expired', async () => {
		const requestId = new Types.ObjectId();
		const matchId = new Types.ObjectId(MATCH);
		const token = signScoreQrToken({
			jti: 'jti-2',
			sid: requestId.toString(),
			flow: 'independent',
			tid: null,
			mid: matchId.toString(),
			rby: REQUESTER,
			opp: null,
		});
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
		mockFindRequest.mockResolvedValue({
			_id: requestId,
			tokenHash,
			match: matchId,
			requestByUser: new Types.ObjectId(REQUESTER),
			tournament: null,
			opponentUser: null,
			status: 'pending',
			expiresAt: new Date(Date.now() - 1000),
		} as never);
		(queries.markRequestExpiredIfPending as jest.Mock).mockResolvedValue(true);

		const result = await validateScoreQrTokenFlow(token);
		expect(result.valid).toBe(false);
		expect(result.reason).toBe('request_expired');
		expect(queries.markRequestExpiredIfPending).toHaveBeenCalledWith(requestId);
	});
});

describe('validateScoreQrConfirmContextFlow', () => {
	it('loads tournament name for tournament-flow tokens', async () => {
		const requestId = new Types.ObjectId();
		const matchId = new Types.ObjectId(MATCH);
		const token = signScoreQrToken({
			jti: 'jti-3',
			sid: requestId.toString(),
			flow: 'tournament',
			tid: TOURNAMENT,
			mid: matchId.toString(),
			rby: REQUESTER,
			opp: OPPONENT,
		});
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
		mockFindRequest.mockResolvedValue({
			_id: requestId,
			tokenHash,
			match: matchId,
			requestByUser: new Types.ObjectId(REQUESTER),
			tournament: new Types.ObjectId(TOURNAMENT),
			opponentUser: new Types.ObjectId(OPPONENT),
			playerOneScores: [6],
			playerTwoScores: [4],
			playMode: '3set',
			matchType: 'singles',
			status: 'pending',
			expiresAt: new Date(Date.now() + 60_000),
		} as never);
		(queries.assertTournamentConfirmerEligibility as jest.Mock).mockResolvedValue(undefined);
		(Tournament.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({ exec: () => Promise.resolve({ name: '  Open Cup  ' }) }),
			}),
		});

		const result = await validateScoreQrConfirmContextFlow({
			token,
			confirmerUserId: OPPONENT,
		});
		expect(result.valid).toBe(true);
		expect(result.request?.tournamentName).toBe('Open Cup');
	});
});

describe('cancelActiveScoreQrFlow', () => {
	it('cancels pending requests for the active session context', async () => {
		const matchId = new Types.ObjectId(MATCH);
		(queries.findLatestActivePendingRequestByContext as jest.Mock).mockResolvedValue({
			match: matchId,
			tournament: null,
			opponentUser: new Types.ObjectId(OPPONENT),
		});

		await cancelActiveScoreQrFlow(REQUESTER);

		expect(mockCancel).toHaveBeenCalledWith({
			tournamentId: null,
			matchId: MATCH,
			requesterUserId: REQUESTER,
			opponentUserId: OPPONENT,
		});
	});
});

describe('confirmScoreQrFlow', () => {
	it('throws 410 when persisted request is expired', async () => {
		const requestId = new Types.ObjectId();
		const matchId = new Types.ObjectId(MATCH);
		const token = signScoreQrToken({
			jti: 'jti-expired',
			sid: requestId.toString(),
			flow: 'independent',
			tid: null,
			mid: matchId.toString(),
			rby: REQUESTER,
			opp: null,
		});
		mockFindRequest.mockResolvedValue({
			_id: requestId,
			tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
			match: matchId,
			requestByUser: new Types.ObjectId(REQUESTER),
			tournament: null,
			opponentUser: null,
			status: 'pending',
			expiresAt: new Date(Date.now() - 1000),
		} as never);
		(queries.markRequestExpiredIfPending as jest.Mock).mockResolvedValue(true);

		await expect(
			confirmScoreQrFlow({ token, confirmerUserId: OPPONENT }),
		).rejects.toMatchObject({ statusCode: 410 });
	});

	it('confirms tournament flow via recordTournamentMatchScoreFlow', async () => {
		const requestId = new Types.ObjectId();
		const matchId = new Types.ObjectId(MATCH);
		const token = signScoreQrToken({
			jti: 'jti-confirm',
			sid: requestId.toString(),
			flow: 'tournament',
			tid: TOURNAMENT,
			mid: matchId.toString(),
			rby: REQUESTER,
			opp: OPPONENT,
		});
		mockFindRequest.mockResolvedValue({
			_id: requestId,
			tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
			match: matchId,
			requestByUser: new Types.ObjectId(REQUESTER),
			tournament: new Types.ObjectId(TOURNAMENT),
			opponentUser: new Types.ObjectId(OPPONENT),
			playerOneScores: [6],
			playerTwoScores: [4],
			playMode: '3set',
			matchType: 'singles',
			status: 'pending',
			expiresAt: new Date(Date.now() + 60_000),
		} as never);
		(queries.assertTournamentConfirmerEligibility as jest.Mock).mockResolvedValue(undefined);
		(Game.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve({
							_id: matchId,
							gameMode: 'tournament',
							tournament: new Types.ObjectId(TOURNAMENT),
							status: 'pendingScore',
						}),
				}),
			}),
		});
		(ScoreValidationRequest.findOneAndUpdate as jest.Mock).mockReturnValue({
			lean: () => ({
				exec: () =>
					Promise.resolve({
						_id: requestId,
						consumedAt: new Date(),
					}),
			}),
		});
		(fetchTournamentScheduleContext as jest.Mock).mockResolvedValue({ _id: TOURNAMENT });
		(User.findById as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve({ _id: OPPONENT }),
		});
		(hasTournamentScheduleAccess as jest.Mock).mockResolvedValue(false);
		(Tournament.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve({ completedAt: null }),
				}),
			}),
		});
		(recordTournamentMatchScoreFlow as jest.Mock).mockResolvedValue({
			matchId: matchId.toString(),
			tournamentId: TOURNAMENT,
			matchStatus: 'completed',
			tournamentCompleted: false,
			updatedRatings: [{ userId: REQUESTER, rating: 1510 }],
		});

		const result = await confirmScoreQrFlow({ token, confirmerUserId: OPPONENT });

		expect(recordTournamentMatchScoreFlow).toHaveBeenCalledWith(
			TOURNAMENT,
			matchId.toString(),
			{ playerOneScores: [6], playerTwoScores: [4] },
			expect.objectContaining({ actor: 'participant' }),
		);
		expect(result.matchStatus).toBe('completed');
		expect(result.requestId).toBe(requestId.toString());
	});

	it('finishes standalone match when winner resolved', async () => {
		const requestId = new Types.ObjectId();
		const matchId = new Types.ObjectId(MATCH);
		const token = signScoreQrToken({
			jti: 'jti-standalone',
			sid: requestId.toString(),
			flow: 'independent',
			tid: null,
			mid: matchId.toString(),
			rby: REQUESTER,
			opp: OPPONENT,
		});
		mockFindRequest.mockResolvedValue({
			_id: requestId,
			tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
			match: matchId,
			requestByUser: new Types.ObjectId(REQUESTER),
			tournament: null,
			opponentUser: new Types.ObjectId(OPPONENT),
			playerOneScores: [6],
			playerTwoScores: [4],
			playMode: '1set',
			matchType: 'singles',
			status: 'pending',
			expiresAt: new Date(Date.now() + 60_000),
		} as never);
		(queries.assertStandaloneConfirmerEligibility as jest.Mock).mockResolvedValue(undefined);
		(queries.attachConfirmerToStandaloneMatchIfNeeded as jest.Mock).mockResolvedValue(undefined);
		(queries.ensureStandaloneGameSnapshots as jest.Mock).mockResolvedValue(undefined);
		(Game.findById as jest.Mock).mockReset();
		(Game.findById as jest.Mock)
			.mockReturnValueOnce({
				select: () => ({
					lean: () => ({
						exec: () =>
							Promise.resolve({
								_id: matchId,
								gameMode: 'standalone',
								status: 'pendingScore',
							}),
					}),
				}),
			})
			.mockReturnValueOnce({
				exec: () =>
					Promise.resolve({
						_id: matchId,
						gameMode: 'standalone',
						status: 'pendingScore',
						save: jest.fn().mockResolvedValue(undefined),
					}),
			});
		(ScoreValidationRequest.findOneAndUpdate as jest.Mock).mockReturnValue({
			lean: () => ({
				exec: () =>
					Promise.resolve({
						_id: requestId,
						consumedAt: new Date(),
					}),
			}),
		});

		const result = await confirmScoreQrFlow({ token, confirmerUserId: OPPONENT });

		expect(result.matchStatus).toBe('completed');
		expect(result.tournamentId).toBeNull();
	});
});

describe('updateScoreQrSessionScoresFlow', () => {
	it('throws when pending session not found', async () => {
		(ScoreValidationRequest.findOne as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve(null),
				}),
			}),
		});

		await expect(
			updateScoreQrSessionScoresFlow({
				requestId: '507f1f77bcf86cd799439099',
				requesterUserId: REQUESTER,
				playerOneScores: [6],
				playerTwoScores: [4],
			}),
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('updates pending request scores for independent session', async () => {
		const requestId = new Types.ObjectId();
		(ScoreValidationRequest.findOne as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve({
							_id: requestId,
							match: new Types.ObjectId(MATCH),
							tournament: null,
							playMode: '3set',
							playerOneScores: [6],
							playerTwoScores: [4],
							status: 'pending',
							expiresAt: new Date(Date.now() + 60_000),
						}),
				}),
			}),
		});
		(ScoreValidationRequest.updateOne as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 }),
		});

		const result = await updateScoreQrSessionScoresFlow({
			requestId: requestId.toString(),
			requesterUserId: REQUESTER,
			playerOneScores: [7],
			playerTwoScores: [5],
		});

		expect(result.playerOneScores).toEqual([7]);
		expect(result.playerTwoScores).toEqual([5]);
	});

	it('maps tournament requester scores to canonical sides before update', async () => {
		const requestId = new Types.ObjectId();
		(ScoreValidationRequest.findOne as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve({
							_id: requestId,
							match: new Types.ObjectId(MATCH),
							tournament: new Types.ObjectId(TOURNAMENT),
							playMode: '3set',
							playerOneScores: [4],
							playerTwoScores: [6],
							status: 'pending',
							expiresAt: new Date(Date.now() + 60_000),
						}),
				}),
			}),
		});
		mockFindGame.mockResolvedValue({
			side1: { players: [new Types.ObjectId(OPPONENT)] },
			side2: { players: [new Types.ObjectId(REQUESTER)] },
		} as never);
		(ScoreValidationRequest.updateOne as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve({ matchedCount: 1, modifiedCount: 1 }),
		});

		await updateScoreQrSessionScoresFlow({
			requestId: requestId.toString(),
			requesterUserId: REQUESTER,
			playerOneScores: [6],
			playerTwoScores: [4],
		});

		expect(ScoreValidationRequest.updateOne).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				$set: expect.objectContaining({
					playerOneScores: [4],
					playerTwoScores: [6],
				}),
			}),
		);
	});
});

describe('getActiveScoreQrSessionFlow', () => {
	it('returns null when no pending request exists', async () => {
		(queries.findLatestActivePendingRequestByContext as jest.Mock).mockResolvedValue(null);
		const result = await getActiveScoreQrSessionFlow({ requesterUserId: REQUESTER });
		expect(result).toBeNull();
	});

	it('expires pending request when match is finished', async () => {
		const requestId = new Types.ObjectId();
		const matchId = new Types.ObjectId(MATCH);
		(queries.findLatestActivePendingRequestByContext as jest.Mock).mockResolvedValue({
			_id: requestId,
			token: 'tok',
			match: matchId,
			tournament: null,
			requestByUser: new Types.ObjectId(REQUESTER),
			opponentUser: null,
			playerOneScores: [6],
			playerTwoScores: [4],
			playMode: '3set',
			matchType: 'singles',
			expiresAt: new Date(Date.now() + 60_000),
		});
		(Game.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve({
							_id: matchId,
							gameMode: 'standalone',
							status: 'finished',
						}),
				}),
			}),
		});
		(ScoreValidationRequest.updateOne as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve({}),
		});

		const result = await getActiveScoreQrSessionFlow({ requesterUserId: REQUESTER });
		expect(result).toBeNull();
		expect(ScoreValidationRequest.updateOne).toHaveBeenCalledWith(
			{ _id: requestId, status: 'pending' },
			{ $set: { status: 'expired' } },
		);
	});

	it('returns active session with opponent profile and QR data', async () => {
		const requestId = new Types.ObjectId();
		const matchId = new Types.ObjectId(MATCH);
		(queries.findLatestActivePendingRequestByContext as jest.Mock).mockResolvedValue({
			_id: requestId,
			token: 'tok',
			match: matchId,
			tournament: new Types.ObjectId(TOURNAMENT),
			requestByUser: new Types.ObjectId(REQUESTER),
			opponentUser: new Types.ObjectId(OPPONENT),
			playerOneScores: [6],
			playerTwoScores: [4],
			playMode: '3set',
			matchType: 'singles',
			expiresAt: new Date(Date.now() + 60_000),
		});
		(Game.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve({
							_id: matchId,
							gameMode: 'tournament',
							tournament: new Types.ObjectId(TOURNAMENT),
							status: 'pendingScore',
						}),
				}),
			}),
		});
		(User.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve({
							name: 'Bob',
							alias: 'B',
							profilePictureUrl: null,
						}),
				}),
			}),
		});

		const result = await getActiveScoreQrSessionFlow({
			requesterUserId: REQUESTER,
			publicBaseUrl: 'http://localhost',
		});

		expect(result).toMatchObject({
			requestId: requestId.toString(),
			flow: 'tournament',
			opponentUserProfile: { name: 'Bob', alias: 'B', profilePictureUrl: null },
			qrDataUrl: expect.stringContaining('data:image'),
		});
	});
});
