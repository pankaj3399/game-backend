import mongoose, { Types } from 'mongoose';
import Game from '../../../../models/Game';
import Schedule from '../../../../models/Schedule';
import User from '../../../../models/User';
import { recomputeTournamentGlickoRatingsThroughRound } from '../recomputeTournamentGlickoRatings';

jest.mock('../../../../models/Game');
jest.mock('../../../../models/Schedule');
jest.mock('../../../../models/User');

const SCHEDULE_ID = new Types.ObjectId('507f1f77bcf86cd799439011');
const TOURNAMENT_ID = new Types.ObjectId('507f1f77bcf86cd799439012');
const GAME_ID = new Types.ObjectId('507f1f77bcf86cd799439013');
const P1 = new Types.ObjectId('507f1f77bcf86cd799439014');
const P2 = new Types.ObjectId('507f1f77bcf86cd799439015');

function makeSession() {
	return { id: 'session' } as unknown as mongoose.ClientSession;
}

function finishedSinglesGame() {
	return {
		_id: GAME_ID,
		status: 'finished',
		side1: {
			players: [P1],
			playerSnapshots: [{ player: P1, rating: 1500, rd: 200, vol: 0.06, tau: 0.5 }],
		},
		side2: {
			players: [P2],
			playerSnapshots: [{ player: P2, rating: 1500, rd: 200, vol: 0.06, tau: 0.5 }],
		},
		score: { playerOneScores: [6], playerTwoScores: [4] },
	};
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('recomputeTournamentGlickoRatingsThroughRound', () => {
	it('returns empty array when round is below 1', async () => {
		const result = await recomputeTournamentGlickoRatingsThroughRound(SCHEDULE_ID, 0, {
			session: makeSession(),
		});
		expect(result).toEqual([]);
	});

	it('returns empty array when schedule has no games', async () => {
		(Schedule.findById as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () => Promise.resolve({ tournament: TOURNAMENT_ID, rounds: [] }),
					}),
				}),
			}),
		});

		const result = await recomputeTournamentGlickoRatingsThroughRound(SCHEDULE_ID, 1, {
			session: makeSession(),
		});
		expect(result).toEqual([]);
	});

	it('recomputes ratings from finished games and persists user ELO', async () => {
		const game = finishedSinglesGame();
		(Schedule.findById as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () =>
							Promise.resolve({
								tournament: TOURNAMENT_ID,
								rounds: [{ round: 1, slot: 1, game: GAME_ID }],
							}),
					}),
				}),
			}),
		});
		(Game.find as jest.Mock)
			.mockReturnValueOnce({
				session: () => ({
					exec: () => Promise.resolve([game]),
				}),
			})
			.mockReturnValueOnce({
				select: () => ({
					session: () => ({
						exec: () => Promise.resolve([]),
					}),
				}),
			});
		(User.find as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () =>
							Promise.resolve([
								{ _id: P1, elo: { rating: 1500, rd: 200, vol: 0.06, tau: 0.5 } },
								{ _id: P2, elo: { rating: 1500, rd: 200, vol: 0.06, tau: 0.5 } },
							]),
					}),
				}),
			}),
		});
		(User.bulkWrite as jest.Mock).mockResolvedValue({});

		const result = await recomputeTournamentGlickoRatingsThroughRound(SCHEDULE_ID, 1, {
			session: makeSession(),
		});

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			userId: expect.any(String),
			rating: expect.any(Number),
			rd: expect.any(Number),
		});
		expect(User.bulkWrite).toHaveBeenCalled();
		const winner = result.find((entry) => entry.userId === P1.toString());
		const loser = result.find((entry) => entry.userId === P2.toString());
		expect(winner!.rating).toBeGreaterThan(1500);
		expect(loser!.rating).toBeLessThan(1500);
	});

	it('includes detached snapshot players when recomputing through a round', async () => {
		const detachedPlayer = new Types.ObjectId('507f1f77bcf86cd799439016');
		const game = finishedSinglesGame();
		(Schedule.findById as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () =>
							Promise.resolve({
								tournament: TOURNAMENT_ID,
								rounds: [{ round: 1, slot: 1, game: GAME_ID }],
							}),
					}),
				}),
			}),
		});
		(Game.find as jest.Mock)
			.mockReturnValueOnce({
				session: () => ({
					exec: () => Promise.resolve([game]),
				}),
			})
			.mockReturnValueOnce({
				select: () => ({
					session: () => ({
						exec: () =>
							Promise.resolve([
								{
									side1: {
										playerSnapshots: [{ player: detachedPlayer, rating: 1400, rd: 210, vol: 0.06, tau: 0.5 }],
									},
									side2: { playerSnapshots: [] },
								},
							]),
					}),
				}),
			});
		(User.find as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () =>
							Promise.resolve([
								{ _id: P1, elo: { rating: 1500, rd: 200, vol: 0.06, tau: 0.5 } },
								{ _id: P2, elo: { rating: 1500, rd: 200, vol: 0.06, tau: 0.5 } },
								{ _id: detachedPlayer, elo: { rating: 1500, rd: 200, vol: 0.06, tau: 0.5 } },
							]),
					}),
				}),
			}),
		});
		(User.bulkWrite as jest.Mock).mockResolvedValue({});

		const result = await recomputeTournamentGlickoRatingsThroughRound(SCHEDULE_ID, 1, {
			session: makeSession(),
		});

		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ userId: detachedPlayer.toString(), rating: 1400 }),
			]),
		);
	});
});
