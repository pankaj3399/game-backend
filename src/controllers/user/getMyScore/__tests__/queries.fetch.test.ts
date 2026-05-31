import { Types } from 'mongoose';
import Game from '../../../../models/Game';
import {
	fetchCompletedTournamentGamesForUser,
	fetchStandaloneGamesForUser,
} from '../queries';

jest.mock('../../../../models/Game');
jest.mock('../../../../models/User');
jest.mock('../../../../models/ScoreValidationRequest');

const USER_ID = '507f1f77bcf86cd799439011';
const GAME_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

function mockCountDocuments(total: number) {
	(Game.countDocuments as jest.Mock).mockReturnValue({
		exec: () => Promise.resolve(total),
	});
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('fetchCompletedTournamentGamesForUser', () => {
	it('returns paginated entries and win estimate from aggregate + find', async () => {
		mockCountDocuments(1);
		let aggregateCall = 0;
		(Game.aggregate as jest.Mock).mockImplementation(() => {
			const callIndex = aggregateCall;
			aggregateCall += 1;
			return {
				exec: () => {
					if (callIndex === 0) {
						return Promise.resolve([{ _id: GAME_ID }]);
					}
					return Promise.resolve([
						{
							side1: { players: [new Types.ObjectId(USER_ID)] },
							side2: { players: [new Types.ObjectId()] },
							score: { playerOneScores: [6], playerTwoScores: [4] },
						},
					]);
				},
			};
		});

		const populatedGame = {
			_id: GAME_ID,
			side1: { players: [{ _id: new Types.ObjectId(USER_ID), name: 'A', alias: null }] },
			side2: { players: [{ _id: new Types.ObjectId(), name: 'B', alias: null }] },
			tournament: { _id: new Types.ObjectId(), name: 'Cup' },
			score: { playerOneScores: [6], playerTwoScores: [4] },
			matchType: 'singles',
			playMode: '1set',
			playedAt: new Date(),
		};

		(Game.find as jest.Mock).mockReturnValue({
			select: () => ({
				populate: () => ({
					populate: () => ({
						populate: () => ({
							lean: () => ({
								exec: () => Promise.resolve([populatedGame]),
							}),
						}),
					}),
				}),
			}),
		});

		const result = await fetchCompletedTournamentGamesForUser({
			userId: USER_ID,
			mode: 'all',
			range: 'allTime',
			page: 1,
			limit: 10,
		});

		expect(result.totalEntries).toBe(1);
		expect(result.entries).toHaveLength(1);
		expect(result.estimatedWins).toBe(1);
		expect(result.winsTruncated).toBe(false);
	});
});

describe('fetchStandaloneGamesForUser', () => {
	it('returns standalone entries from facet aggregate and ordered find', async () => {
		(Game.aggregate as jest.Mock).mockReturnValue({
			exec: jest.fn().mockResolvedValue([
				{
					ids: [{ _id: GAME_ID }],
					totalCount: [{ n: 1 }],
				},
			]),
		});

		const standaloneGame = {
			_id: GAME_ID,
			side1: { players: [{ _id: new Types.ObjectId(USER_ID), name: 'A', alias: null }] },
			side2: { players: [{ _id: new Types.ObjectId(), name: 'B', alias: null }] },
			tournament: null,
			score: { playerOneScores: [], playerTwoScores: [] },
			matchType: 'singles',
			playMode: '1set',
			status: 'finished',
			playedAt: new Date(),
		};

		(Game.find as jest.Mock).mockReturnValue({
			select: () => ({
				populate: () => ({
					populate: () => ({
						lean: () => ({
							exec: () => Promise.resolve([standaloneGame]),
						}),
					}),
				}),
			}),
		});

		const result = await fetchStandaloneGamesForUser({
			userId: USER_ID,
			mode: 'all',
			range: 'allTime',
		});

		expect(result.totalEntries).toBe(1);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.status).toBe('finished');
	});
});
