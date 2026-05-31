import mongoose, { Types } from 'mongoose';
import Tournament from '../../../../models/Tournament';
import Game from '../../../../models/Game';
import { leaveTournamentFlow } from '../handler';

jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return { ...actual, startSession: jest.fn() };
});

jest.mock('../../../../models/Tournament');
jest.mock('../../../../models/Game');

const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

function tournamentFindChain<T>(value: T) {
	return {
		select: () => ({
			session: () => ({
				lean: () => ({ exec: () => Promise.resolve(value) }),
			}),
		}),
	};
}

function gameFindChain<T>(value: T) {
	return {
		select: () => ({
			session: () => ({
				lean: () => ({ exec: () => Promise.resolve(value) }),
			}),
		}),
	};
}

function txSession(handler: (cb: () => Promise<unknown>) => Promise<unknown>) {
	return {
		withTransaction: handler,
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockStartSession.mockResolvedValue(
		txSession((cb) => cb()) as unknown as mongoose.ClientSession,
	);
});

describe('leaveTournamentFlow', () => {
	it('returns 404 when tournament does not exist', async () => {
		(Tournament.findById as jest.Mock).mockReturnValue(tournamentFindChain(null));
		const result = await leaveTournamentFlow(TOURNAMENT_ID, { _id: USER_ID } as never);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(404);
	});

	it('returns 400 when user is not a participant', async () => {
		(Tournament.findById as jest.Mock).mockReturnValue(
			tournamentFindChain({ _id: TOURNAMENT_ID, participants: [], maxMember: 8 }),
		);
		const result = await leaveTournamentFlow(TOURNAMENT_ID, { _id: USER_ID } as never);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toMatch(/not a participant/i);
	});

	it('returns LEAVE_CONFIRM_WO_REQUIRED when unfinished matches exist without confirm flag', async () => {
		(Tournament.findById as jest.Mock).mockReturnValue(
			tournamentFindChain({ _id: TOURNAMENT_ID, participants: [USER_ID], maxMember: 8 }),
		);
		(Game.find as jest.Mock).mockReturnValue(
			gameFindChain([{ _id: new Types.ObjectId(), side1: { players: [USER_ID] }, side2: { players: [] } }]),
		);
		const result = await leaveTournamentFlow(TOURNAMENT_ID, { _id: USER_ID } as never);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toBe('LEAVE_CONFIRM_WO_REQUIRED');
	});

	it('leaves tournament and applies walkover when confirmed', async () => {
		(Tournament.findById as jest.Mock).mockReturnValue(
			tournamentFindChain({ _id: TOURNAMENT_ID, participants: [USER_ID], maxMember: 8 }),
		);
		const matchId = new Types.ObjectId();
		(Game.find as jest.Mock).mockReturnValue(
			gameFindChain([
				{ _id: matchId, side1: { players: [USER_ID] }, side2: { players: [new Types.ObjectId()] } },
			]),
		);
		(Tournament.findOneAndUpdate as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve({ participants: [], maxMember: 8 }),
				}),
			}),
		});
		(Game.updateOne as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve({ matchedCount: 1 }),
		});

		const result = await leaveTournamentFlow(TOURNAMENT_ID, { _id: USER_ID } as never, {
			confirmLeaveWithWalkover: true,
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.isParticipant).toBe(false);
			expect(Game.updateOne).toHaveBeenCalledWith(
				expect.objectContaining({ _id: matchId }),
				expect.objectContaining({
					$set: expect.objectContaining({
						score: { playerOneScores: ['wo'], playerTwoScores: [null] },
					}),
				}),
				expect.any(Object),
			);
		}
	});
});
