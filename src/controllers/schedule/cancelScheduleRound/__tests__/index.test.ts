import mongoose, { Types } from 'mongoose';
import type { Response } from 'express';
import Game from '../../../../models/Game';
import Schedule from '../../../../models/Schedule';
import Tournament from '../../../../models/Tournament';
import User from '../../../../models/User';
import { cancelScheduleRound } from '../index';
import { fetchTournamentScheduleContext } from '../../shared/queries';
import { authorizeScheduleAccess } from '../../shared/authorize';
import { recomputeTournamentGlickoRatingsThroughRound } from '../../../tournament/recordMatchScore/recomputeTournamentGlickoRatings';
import { ROLES } from '../../../../constants/roles';

jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return { ...actual, startSession: jest.fn() };
});
jest.mock('../../../../models/Game');
jest.mock('../../../../models/Schedule');
jest.mock('../../../../models/Tournament');
jest.mock('../../../../models/User');
jest.mock('../../shared/queries');
jest.mock('../../shared/authorize');
jest.mock('../../../tournament/recordMatchScore/recomputeTournamentGlickoRatings');

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const SCHEDULE_ID = new Types.ObjectId('507f1f77bcf86cd799439012');
const GAME_ID = new Types.ObjectId('507f1f77bcf86cd799439013');
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439014');

const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;
const mockFetchContext = fetchTournamentScheduleContext as jest.MockedFunction<
	typeof fetchTournamentScheduleContext
>;
const mockAuthorize = authorizeScheduleAccess as jest.MockedFunction<typeof authorizeScheduleAccess>;
const mockRecompute = recomputeTournamentGlickoRatingsThroughRound as jest.MockedFunction<
	typeof recomputeTournamentGlickoRatingsThroughRound
>;

function txSession(handler: (cb: () => Promise<unknown>) => Promise<unknown>) {
	return {
		withTransaction: handler,
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

function makeRes(): Response {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
}

function makeScheduleDoc(round = 1) {
	return {
		_id: SCHEDULE_ID,
		rounds: [{ round, slot: 1, game: GAME_ID, mode: 'singles' }],
		currentRound: round,
		status: 'active',
		save: jest.fn().mockResolvedValue(undefined),
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	mockStartSession.mockResolvedValue(txSession((cb) => cb()) as unknown as mongoose.ClientSession);
	mockFetchContext.mockResolvedValue({
		_id: new Types.ObjectId(TOURNAMENT_ID),
		schedule: SCHEDULE_ID,
	} as never);
	mockAuthorize.mockResolvedValue({ status: 200, message: 'ok' } as never);
	mockRecompute.mockResolvedValue([]);
});

describe('cancelScheduleRound HTTP handler', () => {
	it('returns 400 for invalid tournament id', async () => {
		const res = makeRes();
		await cancelScheduleRound(
			{ params: { id: 'bad', round: '1' }, user: { _id: USER_ID, role: ROLES.ORGANISER } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns 400 for invalid round parameter', async () => {
		const res = makeRes();
		await cancelScheduleRound(
			{ params: { id: TOURNAMENT_ID, round: '0' }, user: { _id: USER_ID, role: ROLES.ORGANISER } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns 404 when tournament not found', async () => {
		mockFetchContext.mockResolvedValue(null);
		const res = makeRes();
		await cancelScheduleRound(
			{ params: { id: TOURNAMENT_ID, round: '1' }, user: { _id: USER_ID, role: ROLES.ORGANISER } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(404);
	});

	it('returns auth failure', async () => {
		mockAuthorize.mockResolvedValue({ status: 403, message: 'Forbidden' } as never);
		const res = makeRes();
		await cancelScheduleRound(
			{ params: { id: TOURNAMENT_ID, round: '1' }, user: { _id: USER_ID, role: ROLES.ORGANISER } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('cancels round, detaches games, and does not recompute ratings when no prior rounds', async () => {
		const scheduleDoc = makeScheduleDoc(1);
		const tournamentDoc = {
			_id: new Types.ObjectId(TOURNAMENT_ID),
			schedule: SCHEDULE_ID,
			completedAt: new Date(),
			save: jest.fn().mockResolvedValue(undefined),
		};

		(Tournament.findById as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					exec: () => Promise.resolve(tournamentDoc),
				}),
			}),
		});
		(Schedule.findById as jest.Mock).mockReturnValue({
			session: () => ({
				exec: () => Promise.resolve(scheduleDoc),
			}),
		});
		(Game.find as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () =>
							Promise.resolve([
								{
									_id: GAME_ID,
									status: 'draft',
									side1: { playerSnapshots: [] },
									side2: { playerSnapshots: [] },
								},
							]),
					}),
				}),
			}),
		});
		(Game.bulkWrite as jest.Mock).mockResolvedValue({});

		const res = makeRes();
		await cancelScheduleRound(
			{ params: { id: TOURNAMENT_ID, round: '1' }, user: { _id: USER_ID, role: ROLES.ORGANISER } } as never,
			res,
		);

		expect(Game.bulkWrite).toHaveBeenCalled();
		expect(scheduleDoc.save).toHaveBeenCalled();
		expect(tournamentDoc.completedAt).toBeNull();
		expect(mockRecompute).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Round 1 schedule cancelled', round: 1 }),
		);
	});

	it('restores user ELO baselines when last round cancelled', async () => {
		const playerId = new Types.ObjectId('507f1f77bcf86cd799439015');
		const scheduleDoc = makeScheduleDoc(1);
		scheduleDoc.currentRound = 1;
		const tournamentDoc = {
			_id: new Types.ObjectId(TOURNAMENT_ID),
			schedule: SCHEDULE_ID,
			completedAt: null,
			save: jest.fn().mockResolvedValue(undefined),
		};

		(Tournament.findById as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					exec: () => Promise.resolve(tournamentDoc),
				}),
			}),
		});
		(Schedule.findById as jest.Mock).mockReturnValue({
			session: () => ({
				exec: () => Promise.resolve(scheduleDoc),
			}),
		});
		(Game.find as jest.Mock)
			.mockReturnValueOnce({
				select: () => ({
					session: () => ({
						lean: () => ({
							exec: () =>
								Promise.resolve([
									{
										_id: GAME_ID,
										status: 'finished',
										side1: {
											playerSnapshots: [{ player: playerId, rating: 1600, rd: 180, vol: 0.06, tau: 0.5 }],
										},
										side2: { playerSnapshots: [] },
									},
								]),
						}),
					}),
				}),
			})
			.mockReturnValueOnce({
				select: () => ({
					session: () => ({
						lean: () => ({
							exec: () =>
								Promise.resolve([
									{
										side1: {
											playerSnapshots: [{ player: playerId, rating: 1600, rd: 180, vol: 0.06, tau: 0.5 }],
										},
										side2: { playerSnapshots: [] },
									},
								]),
						}),
					}),
				}),
			});
		(Game.bulkWrite as jest.Mock).mockResolvedValue({});
		(User.bulkWrite as jest.Mock).mockResolvedValue({});

		const res = makeRes();
		await cancelScheduleRound(
			{ params: { id: TOURNAMENT_ID, round: '1' }, user: { _id: USER_ID, role: ROLES.ORGANISER } } as never,
			res,
		);

		expect(User.bulkWrite).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					updateOne: expect.objectContaining({
						filter: { _id: playerId.toString() },
					}),
				}),
			]),
			expect.objectContaining({ session: expect.anything() }),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it('returns 409 when schedule changed concurrently', async () => {
		(Tournament.findById as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					exec: () =>
						Promise.resolve({
							_id: new Types.ObjectId(TOURNAMENT_ID),
							schedule: new Types.ObjectId('507f1f77bcf86cd799439099'),
						}),
				}),
			}),
		});

		const res = makeRes();
		await cancelScheduleRound(
			{ params: { id: TOURNAMENT_ID, round: '1' }, user: { _id: USER_ID, role: ROLES.ORGANISER } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(409);
	});

	it('returns 400 when round was never generated', async () => {
		const scheduleDoc = {
			_id: SCHEDULE_ID,
			rounds: [],
			currentRound: 0,
			status: 'draft',
			save: jest.fn(),
		};
		(Tournament.findById as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					exec: () =>
						Promise.resolve({
							_id: new Types.ObjectId(TOURNAMENT_ID),
							schedule: SCHEDULE_ID,
						}),
				}),
			}),
		});
		(Schedule.findById as jest.Mock).mockReturnValue({
			session: () => ({
				exec: () => Promise.resolve(scheduleDoc),
			}),
		});

		const res = makeRes();
		await cancelScheduleRound(
			{ params: { id: TOURNAMENT_ID, round: '2' }, user: { _id: USER_ID, role: ROLES.ORGANISER } } as never,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(400);
	});
});
