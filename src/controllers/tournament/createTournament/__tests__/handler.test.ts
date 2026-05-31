import mongoose, { Types } from 'mongoose';
import { createTournamentFlow } from '../handler';
import * as authorizeModule from '../authorize';
import Court from '../../../../models/Court';
import Tournament from '../../../../models/Tournament';
import * as timezone from '../../shared/resolveTournamentTimezone';

jest.mock('../authorize');
jest.mock('../../../../models/Court');
jest.mock('../../../../models/Tournament');
jest.mock('../../shared/resolveTournamentTimezone');
jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return {
		...actual,
		startSession: jest.fn(),
	};
});

const mockAuthorize = authorizeModule.authorizeCreate as jest.MockedFunction<
	typeof authorizeModule.authorizeCreate
>;
const mockCourtExists = Court.exists as jest.MockedFunction<typeof Court.exists>;
const mockTournamentCreate = Tournament.create as jest.MockedFunction<typeof Tournament.create>;
const mockResolveTimezone = timezone.resolveTournamentTimezoneFromClub as jest.MockedFunction<
	typeof timezone.resolveTournamentTimezoneFromClub
>;
const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;

const CLUB_ID = '507f1f77bcf86cd799439011';
const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439012');
const TOURNAMENT_ID = new Types.ObjectId('507f1f77bcf86cd799439013');

const draftInput = {
	status: 'draft' as const,
	tournamentMode: 'unscheduled' as const,
	club: CLUB_ID,
	name: 'Spring Cup',
	playMode: '3set' as const,
	entryFee: 0,
	minMember: 4,
	maxMember: 8,
};

const session = { _id: USER_ID, role: 'club_admin' } as never;

function syncTxSession() {
	return {
		withTransaction: (cb: () => Promise<unknown>) => cb(),
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

function mockCourtExistsChain(result: unknown) {
	const chain = {
		session: jest.fn().mockReturnThis(),
		exec: jest.fn().mockResolvedValue(result),
	};
	mockCourtExists.mockReturnValue(chain as never);
	return chain;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockAuthorize.mockResolvedValue({
		ok: true,
		status: 200,
		message: 'Authorized',
		data: { context: { clubId: CLUB_ID } },
	});
	mockResolveTimezone.mockResolvedValue('Europe/Berlin');
	mockStartSession.mockResolvedValue(syncTxSession());
});

describe('createTournamentFlow', () => {
	it('returns authorize error without starting a session', async () => {
		mockAuthorize.mockResolvedValue({
			ok: false,
			status: 403,
			message: 'Forbidden',
		});

		const result = await createTournamentFlow(draftInput, session);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(403);
			expect(result.message).toBe('Forbidden');
		}
		expect(mockStartSession).not.toHaveBeenCalled();
	});

	it('creates a draft tournament on success', async () => {
		const createdAt = new Date('2026-05-01T10:00:00Z');
		mockTournamentCreate.mockResolvedValue([
			{
				_id: TOURNAMENT_ID,
				name: draftInput.name,
				club: CLUB_ID,
				status: 'draft',
				date: undefined,
				createdAt,
			},
		] as never);

		const result = await createTournamentFlow(draftInput, session);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.status).toBe(200);
			expect(result.data.tournament.id).toEqual(TOURNAMENT_ID);
			expect(result.data.tournament.name).toBe('Spring Cup');
		}
		expect(mockTournamentCreate).toHaveBeenCalledWith(
			[expect.objectContaining({ name: 'Spring Cup', createdBy: USER_ID, timezone: 'Europe/Berlin' })],
			expect.objectContaining({ session: expect.anything() }),
		);
		expect(mockCourtExists).not.toHaveBeenCalled();
	});

	it('returns 400 when publishing active tournament without courts', async () => {
		const activeInput = {
			...draftInput,
			status: 'active' as const,
			totalRounds: 3,
		};
		mockCourtExistsChain(null);

		const result = await createTournamentFlow(activeInput, session);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(400);
			expect(result.message).toMatch(/no courts/i);
		}
		expect(mockCourtExists).toHaveBeenCalledWith({ club: CLUB_ID });
		expect(mockTournamentCreate).not.toHaveBeenCalled();
	});

	it('creates active tournament when club has courts', async () => {
		const activeInput = {
			...draftInput,
			status: 'active' as const,
			totalRounds: 3,
		};
		mockCourtExistsChain({ _id: new Types.ObjectId('507f1f77bcf86cd799439014') });
		mockTournamentCreate.mockResolvedValue([
			{
				_id: TOURNAMENT_ID,
				name: activeInput.name,
				club: CLUB_ID,
				status: 'active',
				date: undefined,
				createdAt: new Date(),
			},
		] as never);

		const result = await createTournamentFlow(activeInput, session);

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.status).toBe(200);
		expect(mockTournamentCreate).toHaveBeenCalled();
	});
});
