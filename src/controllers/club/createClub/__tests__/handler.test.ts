import mongoose from 'mongoose';
import { createClubFlow } from '../handler';
import * as queries from '../queries';
import * as sharedQueries from '../../shared/queries';

jest.mock('../queries');
jest.mock('../../shared/queries');
jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return {
		...actual,
		startSession: jest.fn(),
	};
});

const mockFindByName = queries.findClubByName as jest.MockedFunction<typeof queries.findClubByName>;
const mockCreateClub = queries.createClubWithSession as jest.MockedFunction<
	typeof queries.createClubWithSession
>;
const mockInsertCourts = queries.insertCourtsWithSession as jest.MockedFunction<
	typeof queries.insertCourtsWithSession
>;
const mockFindUser = queries.findUserByIdWithSession as jest.MockedFunction<
	typeof queries.findUserByIdWithSession
>;
const mockAddAdmin = sharedQueries.addUserAdminOfClub as jest.MockedFunction<
	typeof sharedQueries.addUserAdminOfClub
>;
const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;

const USER_ID = '507f1f77bcf86cd799439011';

const validInput = {
	name: 'New Club',
	address: '1 Street',
	coordinates: [77.5, 12.9] as [number, number],
	courts: [],
};

function mockSession() {
	const session = {
		startTransaction: jest.fn(),
		commitTransaction: jest.fn().mockResolvedValue(undefined),
		abortTransaction: jest.fn().mockResolvedValue(undefined),
		endSession: jest.fn().mockResolvedValue(undefined),
	};
	mockStartSession.mockResolvedValue(session as never);
	return session;
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('createClubFlow', () => {
	it('returns 409 when club name already exists', async () => {
		mockFindByName.mockResolvedValue({ _id: 'existing' } as never);
		const result = await createClubFlow(validInput, USER_ID);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(409);
	});

	it('creates club and assigns admin on success', async () => {
		mockFindByName.mockResolvedValue(null);
		mockSession();
		mockCreateClub.mockResolvedValue({
			_id: { toString: () => '507f1f77bcf86cd799439012' },
			name: 'New Club',
			logoUrl: null,
			address: '1 Street',
			website: null,
			bookingSystemUrl: null,
		} as never);
		mockInsertCourts.mockResolvedValue(undefined);
		mockFindUser.mockResolvedValue({ _id: USER_ID } as never);
		mockAddAdmin.mockResolvedValue({
			acknowledged: true,
			matchedCount: 1,
			modifiedCount: 1,
			upsertedCount: 0,
			upsertedId: null,
		});

		const result = await createClubFlow(validInput, USER_ID);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.status).toBe(201);
			expect(result.data.club.name).toBe('New Club');
		}
	});
});
