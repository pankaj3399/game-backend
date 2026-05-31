import { Types } from 'mongoose';
import type { Response } from 'express';
import { getTournamentMatches } from '../index';
import { fetchTournamentById } from '../../shared/fetchTournamentById';
import { authorizeGetById } from '../../shared/authorizeGetById';
import * as queries from '../queries';
import { mapTournamentMatchesResponse } from '../mapper';
import { ROLES } from '../../../../constants/roles';

jest.mock('../../shared/fetchTournamentById');
jest.mock('../../shared/authorizeGetById');
jest.mock('../queries');
jest.mock('../mapper');
jest.mock('../../../../lib/logger', () => ({
	logger: { error: jest.fn() },
}));

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const SCHEDULE_ID = new Types.ObjectId('507f1f77bcf86cd799439012');
const GAME_ID = new Types.ObjectId('507f1f77bcf86cd799439013');
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439014');

const mockFetchSchedule = queries.fetchScheduleForTournament as jest.MockedFunction<
	typeof queries.fetchScheduleForTournament
>;
const mockFetchGames = queries.fetchGamesForScheduleRounds as jest.MockedFunction<
	typeof queries.fetchGamesForScheduleRounds
>;
const mockUpdateStatuses = queries.updateGameStatuses as jest.MockedFunction<
	typeof queries.updateGameStatuses
>;

function makeRes(): Response {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
}

beforeEach(() => {
	jest.clearAllMocks();
	(mapTournamentMatchesResponse as jest.Mock).mockReturnValue({ matches: [] });
});

describe('getTournamentMatches HTTP handler', () => {
	it('returns 400 for invalid tournament id', async () => {
		const res = makeRes();
		await getTournamentMatches({ params: { id: 'bad' }, user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns 404 when tournament missing', async () => {
		(fetchTournamentById as jest.Mock).mockResolvedValue(null);
		const res = makeRes();
		await getTournamentMatches({ params: { id: TOURNAMENT_ID }, user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('returns auth failure', async () => {
		(fetchTournamentById as jest.Mock).mockResolvedValue({
			_id: new Types.ObjectId(TOURNAMENT_ID),
			schedule: { _id: SCHEDULE_ID },
			duration: 60,
			totalRounds: 3,
		});
		(authorizeGetById as jest.Mock).mockResolvedValue({ ok: false, status: 403, message: 'Forbidden' });
		const res = makeRes();
		await getTournamentMatches({ params: { id: TOURNAMENT_ID }, user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('returns mapped matches and applies timed status updates', async () => {
		const startedAt = new Date(Date.now() - 90 * 60_000);
		const tournament = {
			_id: new Types.ObjectId(TOURNAMENT_ID),
			schedule: { _id: SCHEDULE_ID },
			duration: 60,
			totalRounds: 3,
		};
		(fetchTournamentById as jest.Mock).mockResolvedValue(tournament);
		(authorizeGetById as jest.Mock).mockResolvedValue({
			ok: true,
			data: { context: { clubIdStr: '507f1f77bcf86cd799439099', role: ROLES.PLAYER } },
		});
		mockFetchSchedule.mockResolvedValue({
			_id: SCHEDULE_ID,
			matchDurationMinutes: 60,
			rounds: [{ game: GAME_ID, round: 1, slot: 1, mode: 'singles' }],
		} as never);
		mockFetchGames.mockResolvedValue([
			{
				_id: GAME_ID,
				status: 'active',
				startTime: startedAt,
			},
		] as never);
		mockUpdateStatuses.mockResolvedValue([{ id: GAME_ID, status: 'pendingScore' }]);
		(mapTournamentMatchesResponse as jest.Mock).mockReturnValue({
			matches: [{ id: GAME_ID.toString(), status: 'pendingScore' }],
		});

		const res = makeRes();
		await getTournamentMatches({ params: { id: TOURNAMENT_ID }, user: { _id: USER_ID } } as never, res);

		expect(mockUpdateStatuses).toHaveBeenCalledWith([
			expect.objectContaining({ id: GAME_ID, status: 'pendingScore', expectedStatus: 'active' }),
		]);
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ matches: [{ id: GAME_ID.toString(), status: 'pendingScore' }] });
	});

	it('returns 500 on unexpected error', async () => {
		(fetchTournamentById as jest.Mock).mockRejectedValue(new Error('db down'));
		const res = makeRes();
		await getTournamentMatches({ params: { id: TOURNAMENT_ID }, user: { _id: USER_ID } } as never, res);
		expect(res.status).toHaveBeenCalledWith(500);
	});
});
