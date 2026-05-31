import { Types } from 'mongoose';
import Game from '../../../../models/Game';
import ScoreValidationRequest from '../../../../models/ScoreValidationRequest';
import User from '../../../../models/User';
import { AppError } from '../../../../shared/errors';
import {
	buildGlickoSnapshotForUser,
	cancelPendingRequests,
	expireStalePendingRequests,
	findTournamentGame,
	getOpponentUserIdFromGame,
} from '../queries';

jest.mock('../../../../models/Game');
jest.mock('../../../../models/ScoreValidationRequest');
jest.mock('../../../../models/User');

const REQUESTER_ID = '507f1f77bcf86cd799439011';
const OPPONENT_ID = '507f1f77bcf86cd799439012';
const MATCH_ID = '507f1f77bcf86cd799439013';
const TOURNAMENT_ID = '507f1f77bcf86cd799439014';

beforeEach(() => {
	jest.clearAllMocks();
});

describe('getOpponentUserIdFromGame', () => {
	it('returns the lone opponent on the other side', () => {
		const opponent = getOpponentUserIdFromGame(
			{
				side1: { players: [new Types.ObjectId(REQUESTER_ID)] },
				side2: { players: [new Types.ObjectId(OPPONENT_ID)] },
			},
			REQUESTER_ID,
		);
		expect(opponent).toBe(OPPONENT_ID);
	});

	it('throws when requester is not on either side', () => {
		expect(() =>
			getOpponentUserIdFromGame(
				{
					side1: { players: [new Types.ObjectId()] },
					side2: { players: [new Types.ObjectId(OPPONENT_ID)] },
				},
				REQUESTER_ID,
			),
		).toThrow(AppError);
	});
});

describe('findTournamentGame', () => {
	it('queries tournament matches by id and gameMode', async () => {
		const chain = {
			select: jest.fn().mockReturnThis(),
			lean: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue({ _id: MATCH_ID }),
		};
		(Game.findOne as jest.Mock).mockReturnValue(chain);

		const result = await findTournamentGame({ tournamentId: TOURNAMENT_ID, matchId: MATCH_ID });

		expect(result).toEqual({ _id: MATCH_ID });
		expect(Game.findOne).toHaveBeenCalledWith({
			_id: MATCH_ID,
			tournament: TOURNAMENT_ID,
			gameMode: 'tournament',
		});
	});
});

describe('buildGlickoSnapshotForUser', () => {
	it('falls back to DEFAULT_ELO when user has no rating fields', async () => {
		(User.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve(null),
				}),
			}),
		});

		const snapshot = await buildGlickoSnapshotForUser(REQUESTER_ID);

		expect(snapshot.player.toString()).toBe(REQUESTER_ID);
		expect(snapshot.rating).toBe(1500);
		expect(snapshot.rd).toBe(200);
	});
});

describe('expireStalePendingRequests', () => {
	it('updates expired pending requests for tournament context', async () => {
		(ScoreValidationRequest.updateMany as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve({ modifiedCount: 1 }),
		});

		await expireStalePendingRequests({
			tournamentId: TOURNAMENT_ID,
			matchId: MATCH_ID,
			requesterUserId: REQUESTER_ID,
			opponentUserId: OPPONENT_ID,
		});

		expect(ScoreValidationRequest.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				requestByUser: REQUESTER_ID,
				opponentUser: OPPONENT_ID,
				status: 'pending',
				tournament: TOURNAMENT_ID,
				match: MATCH_ID,
			}),
			{ $set: { status: 'expired' } },
		);
	});
});

describe('cancelPendingRequests', () => {
	it('cancels pending independent requests when tournamentId is null', async () => {
		(ScoreValidationRequest.updateMany as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve({ modifiedCount: 2 }),
		});

		await cancelPendingRequests({
			tournamentId: null,
			matchId: MATCH_ID,
			requesterUserId: REQUESTER_ID,
			opponentUserId: null,
		});

		expect(ScoreValidationRequest.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				tournament: null,
				match: MATCH_ID,
				status: 'pending',
			}),
			{ $set: { status: 'cancelled' } },
		);
	});
});
