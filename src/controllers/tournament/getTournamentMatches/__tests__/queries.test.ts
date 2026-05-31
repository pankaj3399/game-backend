import { Types } from 'mongoose';
import Game from '../../../../models/Game';
import Schedule from '../../../../models/Schedule';
import {
	fetchGamesForScheduleRounds,
	fetchScheduleForTournament,
	updateGameStatuses,
} from '../queries';

jest.mock('../../../../models/Game');
jest.mock('../../../../models/Schedule');

const TOURNAMENT_ID = new Types.ObjectId('507f1f77bcf86cd799439011');
const SCHEDULE_ID = new Types.ObjectId('507f1f77bcf86cd799439012');
const GAME_ID = new Types.ObjectId('507f1f77bcf86cd799439013');

beforeEach(() => {
	jest.clearAllMocks();
});

describe('fetchScheduleForTournament', () => {
	it('returns null when schedule id is missing', async () => {
		const result = await fetchScheduleForTournament(null);
		expect(result).toBeNull();
		expect(Schedule.findById).not.toHaveBeenCalled();
	});

	it('loads schedule metadata by id', async () => {
		const schedule = { _id: SCHEDULE_ID, rounds: [] };
		(Schedule.findById as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve(schedule),
				}),
			}),
		});

		const result = await fetchScheduleForTournament(SCHEDULE_ID);
		expect(result).toEqual(schedule);
	});
});

describe('fetchGamesForScheduleRounds', () => {
	it('queries historical and scheduled games', async () => {
		const games = [{ _id: GAME_ID, status: 'draft' }];
		(Game.find as jest.Mock).mockReturnValue({
			select: () => ({
				populate: jest.fn().mockReturnThis(),
				lean: () => ({
					exec: () => Promise.resolve(games),
				}),
			}),
		});

		const result = await fetchGamesForScheduleRounds(TOURNAMENT_ID, SCHEDULE_ID, [
			{ game: GAME_ID, round: 1, slot: 1, mode: 'singles' },
		]);

		expect(result).toEqual(games);
		expect(Game.find).toHaveBeenCalledWith({
			$or: [
				{ tournament: TOURNAMENT_ID, isHistorical: true },
				{ schedule: SCHEDULE_ID, _id: { $in: [GAME_ID] } },
			],
		});
	});
});

describe('updateGameStatuses', () => {
	it('returns empty array for no updates', async () => {
		const result = await updateGameStatuses([]);
		expect(result).toEqual([]);
		expect(Game.bulkWrite).not.toHaveBeenCalled();
	});

	it('persists optimistic status updates and returns applied rows', async () => {
		(Game.bulkWrite as jest.Mock).mockResolvedValue({ matchedCount: 1 });
		(Game.find as jest.Mock).mockReturnValue({
			select: () => ({
				setOptions: () => ({
					lean: () => ({
						exec: () => Promise.resolve([{ _id: GAME_ID, status: 'active' }]),
					}),
				}),
			}),
		});

		const result = await updateGameStatuses([
			{ id: GAME_ID, status: 'active', expectedStatus: 'draft' },
		]);

		expect(Game.bulkWrite).toHaveBeenCalled();
		expect(result).toEqual([{ id: GAME_ID, status: 'active' }]);
	});
});
