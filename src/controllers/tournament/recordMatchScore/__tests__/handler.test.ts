import mongoose, { Types } from 'mongoose';
import Game from '../../../../models/Game';
import Schedule from '../../../../models/Schedule';
import User from '../../../../models/User';
import { AppError } from '../../../../shared/errors';
import { recordTournamentMatchScoreFlow } from '../handler';

jest.mock('../../../../models/Game');
jest.mock('../../../../models/Schedule');
jest.mock('../../../../models/User');
jest.mock('../../../../models/Tournament');
jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return {
		...actual,
		startSession: jest.fn(),
	};
});

const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const MATCH_ID = '507f1f77bcf86cd799439012';
const SCHEDULE_ID = new Types.ObjectId('507f1f77bcf86cd799439013');
const PLAYER_ONE = new Types.ObjectId('507f1f77bcf86cd799439014');
const PLAYER_TWO = new Types.ObjectId('507f1f77bcf86cd799439015');

function syncTxSession() {
	return {
		withTransaction: async (cb: () => Promise<unknown>) => cb(),
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

function makeGame(overrides: Record<string, unknown> = {}) {
	return {
		_id: MATCH_ID,
		tournament: TOURNAMENT_ID,
		gameMode: 'tournament',
		schedule: SCHEDULE_ID,
		playMode: '3set',
		status: 'scheduled',
		side1: {
			players: [PLAYER_ONE],
			playerSnapshots: [{ player: PLAYER_ONE, rating: 1500, rd: 350, vol: 0.06, tau: 0.5 }],
		},
		side2: {
			players: [PLAYER_TWO],
			playerSnapshots: [{ player: PLAYER_TWO, rating: 1500, rd: 350, vol: 0.06, tau: 0.5 }],
		},
		startTime: undefined,
		set: jest.fn(),
		markModified: jest.fn(),
		save: jest.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

function mockGameFindOne(game: unknown) {
	const chain = {
		session: jest.fn().mockReturnThis(),
		exec: jest.fn().mockResolvedValue(game),
	};
	(Game.findOne as jest.Mock).mockReturnValue(chain);
	return chain;
}

function mockScheduleFindById(schedule: unknown) {
	const chain = {
		session: jest.fn().mockReturnThis(),
		exec: jest.fn().mockResolvedValue(schedule),
	};
	(Schedule.findById as jest.Mock).mockReturnValue(chain);
	return chain;
}

function mockUserFindById() {
	const chain = {
		select: jest.fn().mockReturnThis(),
		session: jest.fn().mockReturnThis(),
		lean: jest.fn().mockReturnThis(),
		exec: jest.fn().mockResolvedValue({ elo: { rating: 1500, rd: 350, vol: 0.06, tau: 0.5 } }),
	};
	(User.findById as jest.Mock).mockReturnValue(chain);
	return chain;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockStartSession.mockResolvedValue(syncTxSession());
	mockUserFindById();
});

describe('recordTournamentMatchScoreFlow', () => {
	it('throws 404 when tournament match is not found', async () => {
		mockGameFindOne(null);

		await expect(
			recordTournamentMatchScoreFlow(
				TOURNAMENT_ID,
				MATCH_ID,
				{ playerOneScores: [6], playerTwoScores: [4] },
				{ actor: 'organiser', organiserGraceExpired: false, tournamentCompleted: false },
			),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Tournament match not found',
		});
	});

	it('throws 403 when organiser grace period has expired', async () => {
		mockGameFindOne(makeGame());

		await expect(
			recordTournamentMatchScoreFlow(
				TOURNAMENT_ID,
				MATCH_ID,
				{ playerOneScores: [6], playerTwoScores: [4] },
				{ actor: 'organiser', organiserGraceExpired: true, tournamentCompleted: false },
			),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'The organiser score edit period for this tournament has ended',
		});
	});

	it('persists pendingScore when winner is not yet decided', async () => {
		const game = makeGame();
		mockGameFindOne(game);
		mockScheduleFindById({
			_id: SCHEDULE_ID,
			currentRound: 1,
			rounds: [{ round: 1, game: new Types.ObjectId(MATCH_ID) }],
		});

		const result = await recordTournamentMatchScoreFlow(
			TOURNAMENT_ID,
			MATCH_ID,
			{ playerOneScores: [6], playerTwoScores: [4] },
			{ actor: 'organiser', organiserGraceExpired: false, tournamentCompleted: false },
		);

		expect(result.matchStatus).toBe('pendingScore');
		expect(result.tournamentCompleted).toBe(false);
		expect(result.updatedRatings).toEqual([]);
		expect(game.save).toHaveBeenCalledWith({ session: expect.anything() });
		expect(game.status).toBe('pendingScore');
	});
});
