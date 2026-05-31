/**
 * Unit tests for persistScheduleRound — mocks mongoose session and model chains.
 */

import mongoose, { Types } from 'mongoose';
import Tournament from '../../../../models/Tournament';
import Schedule from '../../../../models/Schedule';
import Game from '../../../../models/Game';
import User from '../../../../models/User';
import { persistScheduleRound } from '../handler';
import type { GenerateScheduleBody, TournamentScheduleContext } from '../../shared/types';

jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return { ...actual, startSession: jest.fn() };
});

jest.mock('../../../../models/Tournament');
jest.mock('../../../../models/Schedule');
jest.mock('../../../../models/Game');
jest.mock('../../../../models/User');
jest.mock('../ensurePreviousRoundFinished', () => ({
	ensurePreviousRoundFinished: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../tournament/recordMatchScore/recomputeTournamentGlickoRatings', () => ({
	recomputeTournamentGlickoRatingsThroughRound: jest.fn().mockResolvedValue(undefined),
}));

const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;

const TOURNAMENT_ID = new Types.ObjectId('507f1f77bcf86cd799439011');
const SCHEDULE_ID = new Types.ObjectId('507f1f77bcf86cd799439012');
const COURT_ID = new Types.ObjectId('507f1f77bcf86cd799439013');
const P1 = new Types.ObjectId('507f1f77bcf86cd799439014');
const P2 = new Types.ObjectId('507f1f77bcf86cd799439015');

function txSession(handler: (cb: () => Promise<unknown>) => Promise<unknown>) {
	return {
		withTransaction: handler,
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

function tournamentFindByIdChain<T>(value: T) {
	return {
		select: () => ({
			populate: () => ({
				populate: () => ({
					session: () => ({
						lean: () => ({
							exec: () => Promise.resolve(value),
						}),
					}),
				}),
			}),
		}),
	};
}

function makeParticipant(id: Types.ObjectId) {
	return {
		_id: id,
		name: 'Player',
		alias: null,
		profilePictureUrl: null,
		elo: { rating: 1500, rd: 200, vol: 0.06, tau: 0.5 },
	};
}

function makeFreshTournament(): TournamentScheduleContext {
	return {
		_id: TOURNAMENT_ID,
		name: 'Test Open',
		minMember: 2,
		firstRoundScheduledAt: null,
		tournamentMode: 'unscheduled',
		date: new Date('2026-06-01'),
		startTime: '09:00',
		endTime: '18:00',
		timezone: null,
		duration: null,
		breakDuration: null,
		totalRounds: 3,
		playMode: '1set',
		createdBy: new Types.ObjectId(),
		club: { _id: new Types.ObjectId(), courts: [{ _id: COURT_ID, name: 'Court 1' }] },
		participants: [makeParticipant(P1), makeParticipant(P2)],
		schedule: null,
	};
}

function makeScheduleDoc() {
	return {
		_id: SCHEDULE_ID,
		rounds: [] as Array<{ game: Types.ObjectId; slot: number; round: number; mode: string }>,
		currentRound: 0,
		matchesPerPlayer: 1,
		matchDurationMinutes: null,
		breakTimeMinutes: null,
		status: 'draft',
		save: jest.fn().mockResolvedValue(undefined),
	};
}

const body: GenerateScheduleBody = {
	round: 1,
	mode: 'singles',
	startTime: '09:00',
	courtIds: [COURT_ID.toString()],
	participantOrder: [P1.toString(), P2.toString()],
};

const tournamentCtx: TournamentScheduleContext = {
	...makeFreshTournament(),
};

beforeEach(() => {
	jest.clearAllMocks();
	mockStartSession.mockResolvedValue(txSession((cb) => cb()) as unknown as mongoose.ClientSession);
});

describe('persistScheduleRound', () => {
	it('throws when tournament is not found inside the transaction', async () => {
		(Tournament.findById as jest.Mock).mockReturnValue(tournamentFindByIdChain(null));

		await expect(persistScheduleRound(tournamentCtx, body)).rejects.toThrow(/tournament not found/i);
	});

	it('returns schedule metadata when round is persisted successfully', async () => {
		const fresh = makeFreshTournament();
		const scheduleDoc = makeScheduleDoc();
		const createdGame = { _id: new Types.ObjectId() };

		(Tournament.findById as jest.Mock).mockReturnValue(tournamentFindByIdChain(fresh));
		(Schedule.findById as jest.Mock).mockReturnValue({
			session: () => ({ exec: () => Promise.resolve(null) }),
		});
		(Schedule.findOneAndUpdate as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve(scheduleDoc),
		});
		(User.find as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () => Promise.resolve([makeParticipant(P1), makeParticipant(P2)]),
					}),
				}),
			}),
		});
		(Game.insertMany as jest.Mock).mockResolvedValue([createdGame]);
		(Tournament.updateOne as jest.Mock).mockReturnValue({ exec: () => Promise.resolve({}) });

		const result = await persistScheduleRound(tournamentCtx, body);

		expect(result.scheduleId).toEqual(SCHEDULE_ID);
		expect(result.currentRound).toBe(1);
		expect(result.generatedMatches).toBe(1);
		expect(scheduleDoc.save).toHaveBeenCalled();
		expect(Game.insertMany).toHaveBeenCalled();
	});

	it('throws when invalid court ids are provided', async () => {
		const fresh = makeFreshTournament();
		(Tournament.findById as jest.Mock).mockReturnValue(tournamentFindByIdChain(fresh));

		await expect(
			persistScheduleRound(fresh, {
				...body,
				courtIds: ['507f1f77bcf86cd799439099'],
			}),
		).rejects.toThrow(/invalid courtids/i);
	});

	it('throws when round exceeds tournament totalRounds', async () => {
		const fresh = makeFreshTournament();
		const scheduleDoc = makeScheduleDoc();
		(Tournament.findById as jest.Mock).mockReturnValue(tournamentFindByIdChain(fresh));
		(Schedule.findById as jest.Mock).mockReturnValue({
			session: () => ({ exec: () => Promise.resolve(scheduleDoc) }),
		});

		await expect(
			persistScheduleRound(fresh, { ...body, round: 99 }),
		).rejects.toThrow(/exceeds totalRounds/i);
	});

	it('requires confirmation when regenerating a scored round', async () => {
		const fresh = makeFreshTournament();
		fresh.schedule = SCHEDULE_ID;
		const existingGameId = new Types.ObjectId('507f1f77bcf86cd799439016');
		const scheduleDoc = makeScheduleDoc();
		scheduleDoc.currentRound = 1;
		scheduleDoc.rounds = [{ game: existingGameId, slot: 1, round: 1, mode: 'singles' }];

		(Tournament.findById as jest.Mock).mockReturnValue(tournamentFindByIdChain(fresh));
		(Schedule.findById as jest.Mock).mockReturnValue({
			session: () => ({ exec: () => Promise.resolve(scheduleDoc) }),
		});
		(Game.find as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () =>
							Promise.resolve([
								{
									_id: existingGameId,
									status: 'finished',
									score: { playerOneScores: [6], playerTwoScores: [4] },
									side1: { playerSnapshots: [] },
									side2: { playerSnapshots: [] },
								},
							]),
					}),
				}),
			}),
		});

		await expect(persistScheduleRound(fresh, body)).rejects.toThrow(
			/RESCHEDULE_WITH_SCORES_CONFIRMATION_REQUIRED/,
		);
	});

	it('regenerates scored round when allowRescheduleWithScores is true', async () => {
		const fresh = makeFreshTournament();
		fresh.schedule = SCHEDULE_ID;
		const existingGameId = new Types.ObjectId('507f1f77bcf86cd799439016');
		const scheduleDoc = makeScheduleDoc();
		scheduleDoc.currentRound = 1;
		scheduleDoc.rounds = [{ game: existingGameId, slot: 1, round: 1, mode: 'singles' }];
		const createdGame = { _id: new Types.ObjectId() };

		(Tournament.findById as jest.Mock).mockReturnValue(tournamentFindByIdChain(fresh));
		(Schedule.findById as jest.Mock).mockReturnValue({
			session: () => ({ exec: () => Promise.resolve(scheduleDoc) }),
		});
		(Game.find as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () =>
							Promise.resolve([
								{
									_id: existingGameId,
									status: 'finished',
									score: { playerOneScores: [6], playerTwoScores: [4] },
									side1: {
										playerSnapshots: [{ player: P1, rating: 1500, rd: 200, vol: 0.06, tau: 0.5 }],
									},
									side2: { playerSnapshots: [] },
								},
							]),
					}),
				}),
			}),
		});
		(Game.bulkWrite as jest.Mock).mockResolvedValue({});
		(User.find as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					lean: () => ({
						exec: () => Promise.resolve([makeParticipant(P1), makeParticipant(P2)]),
					}),
				}),
			}),
		});
		(Game.insertMany as jest.Mock).mockResolvedValue([createdGame]);
		(Tournament.updateOne as jest.Mock).mockReturnValue({ exec: () => Promise.resolve({}) });

		const result = await persistScheduleRound(fresh, {
			...body,
			allowRescheduleWithScores: true,
		});

		expect(result.generatedMatches).toBe(1);
		expect(Game.bulkWrite).toHaveBeenCalled();
		expect(scheduleDoc.save).toHaveBeenCalled();
	});
});
