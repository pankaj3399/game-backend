/**
 * Unit tests for updateTournamentFlow — mocks mongoose session, Court, and Tournament.
 */

import mongoose, { Types } from 'mongoose';
import Court from '../../../../models/Court';
import Tournament from '../../../../models/Tournament';
import { updateTournamentFlow } from '../handler';

jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return { ...actual, startSession: jest.fn() };
});

jest.mock('../../../../models/Court');
jest.mock('../../../../models/Tournament');

const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const CLUB_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

function txSession(handler: (cb: () => Promise<unknown>) => Promise<unknown>) {
	return {
		withTransaction: handler,
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

beforeEach(() => {
	jest.clearAllMocks();
	mockStartSession.mockResolvedValue(txSession((cb) => cb()) as unknown as mongoose.ClientSession);
});

describe('updateTournamentFlow', () => {
	it('returns ok:false when findByIdAndUpdate yields no document', async () => {
		(Tournament.findByIdAndUpdate as jest.Mock).mockReturnValue({
			lean: () => ({
				exec: () => Promise.resolve(null),
			}),
		});

		const result = await updateTournamentFlow(
			TOURNAMENT_ID,
			{ name: 'Renamed' },
			{ clubChanged: false },
		);

		expect(result).toEqual({ ok: false });
	});

	it('throws when publishing to active club without courts', async () => {
		(Court.exists as jest.Mock).mockReturnValue({
			session: () => ({
				exec: () => Promise.resolve(null),
			}),
		});

		await expect(
			updateTournamentFlow(
				TOURNAMENT_ID,
				{ status: 'active', club: CLUB_ID },
				{ clubChanged: true },
			),
		).rejects.toThrow(/no courts/i);
	});

	it('returns tournament summary on successful update', async () => {
		const updated = {
			_id: new Types.ObjectId(TOURNAMENT_ID),
			name: 'Summer Cup',
			club: CLUB_ID,
			status: 'draft',
			date: new Date('2026-07-01'),
			updatedAt: new Date('2026-05-28'),
		};

		(Tournament.findByIdAndUpdate as jest.Mock).mockReturnValue({
			lean: () => ({
				exec: () => Promise.resolve(updated),
			}),
		});

		const result = await updateTournamentFlow(
			TOURNAMENT_ID,
			{ name: 'Summer Cup' },
			{ clubChanged: false },
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.tournament).toMatchObject({
				id: updated._id,
				name: 'Summer Cup',
				status: 'draft',
			});
		}
	});
});
