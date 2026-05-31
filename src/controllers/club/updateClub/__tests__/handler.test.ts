import mongoose, { Types } from 'mongoose';
import { updateClubFlow } from '../handler';
import * as queries from '../queries';

jest.mock('../queries');
jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return {
		...actual,
		startSession: jest.fn(),
	};
});

const mockFindClub = queries.findClubByIdForUpdate as jest.MockedFunction<
	typeof queries.findClubByIdForUpdate
>;
const mockFindCanonical = queries.findCanonicalCourtIdsForClub as jest.MockedFunction<
	typeof queries.findCanonicalCourtIdsForClub
>;
const mockDeleteRemoved = queries.deleteRemovedClubCourts as jest.MockedFunction<
	typeof queries.deleteRemovedClubCourts
>;
const mockUpdateCourt = queries.updateExistingCourt as jest.MockedFunction<
	typeof queries.updateExistingCourt
>;
const mockCreateCourt = queries.createNewCourt as jest.MockedFunction<typeof queries.createNewCourt>;
const mockCountCourts = queries.countClubCourts as jest.MockedFunction<typeof queries.countClubCourts>;
const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;

const CLUB_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = new Types.ObjectId('507f1f77bcf86cd799439012');

function makeSession() {
	return {
		startTransaction: jest.fn(),
		commitTransaction: jest.fn().mockResolvedValue(undefined),
		abortTransaction: jest.fn().mockResolvedValue(undefined),
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

function makeActorSession(isAdmin: boolean) {
	return {
		_id: ACTOR_ID,
		role: isAdmin ? 'club_admin' : 'player',
		adminOf: isAdmin ? [new Types.ObjectId(CLUB_ID)] : [],
	} as never;
}

function makeClubStub() {
	return {
		_id: new Types.ObjectId(CLUB_ID),
		name: 'Old Name',
		logoUrl: null,
		address: 'Old Address',
		website: null,
		bookingSystemUrl: null,
		coordinates: { type: 'Point', coordinates: [0, 0] },
		save: jest.fn().mockResolvedValue(undefined),
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	mockStartSession.mockResolvedValue(makeSession());
	mockCountCourts.mockResolvedValue(2);
});

describe('updateClubFlow', () => {
	it('returns 403 when actor cannot manage the club', async () => {
		const result = await updateClubFlow(CLUB_ID, { name: 'New Name' }, makeActorSession(false));

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(403);
			expect(result.message).toMatch(/permission/i);
		}
		expect(mockFindClub).not.toHaveBeenCalled();
	});

	it('returns 404 when club is not found', async () => {
		mockFindClub.mockResolvedValue(null);

		const result = await updateClubFlow(CLUB_ID, { name: 'New Name' }, makeActorSession(true));

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.status).toBe(404);
			expect(result.message).toMatch(/club not found/i);
		}
	});

	it('updates club fields and returns court count on success', async () => {
		const club = makeClubStub();
		mockFindClub.mockResolvedValue(club as never);

		const result = await updateClubFlow(
			CLUB_ID,
			{
				name: '  Renamed Club  ',
				address: '  New Address  ',
				courts: [{ name: 'Court 1', type: 'hard', placement: 'outdoor' }],
			},
			makeActorSession(true),
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.club.name).toBe('Renamed Club');
			expect(result.data.club.address).toBe('New Address');
			expect(result.data.club.courtCount).toBe(2);
		}
		expect(club.save).toHaveBeenCalledWith({ session: expect.anything() });
		expect(mockCreateCourt).toHaveBeenCalledWith(
			CLUB_ID,
			{ name: 'Court 1', type: 'hard', placement: 'outdoor' },
			expect.anything(),
		);
		expect(mockDeleteRemoved).toHaveBeenCalled();
	});
});
