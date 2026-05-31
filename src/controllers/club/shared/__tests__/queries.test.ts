import mongoose, { Types } from 'mongoose';
import Club from '../../../../models/Club';
import User from '../../../../models/User';
import {
	addUserAdminOfClub,
	ClubStaffMutationNotFoundError,
	findClubStaffSnapshotById,
	isUserAdminOfClub,
} from '../queries';
import { ROLES } from '../../../../constants/roles';

jest.mock('../../../../models/Club');
jest.mock('../../../../models/User');

const CLUB_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';

function makeSession() {
	return { id: 'session' } as unknown as mongoose.ClientSession;
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('findClubStaffSnapshotById', () => {
	it('returns club staff fields without session', async () => {
		const snapshot = { defaultAdminId: null, organiserIds: [] };
		const chain = {
			select: jest.fn().mockReturnThis(),
			lean: jest.fn().mockReturnThis(),
			session: jest.fn().mockReturnThis(),
			exec: jest.fn().mockResolvedValue(snapshot),
		};
		(Club.findById as jest.Mock).mockReturnValue(chain);

		const result = await findClubStaffSnapshotById(CLUB_ID);

		expect(result).toEqual(snapshot);
		expect(chain.select).toHaveBeenCalledWith('defaultAdminId organiserIds');
		expect(chain.session).not.toHaveBeenCalled();
	});
});

describe('isUserAdminOfClub', () => {
	it('returns true when User.exists finds adminOf membership', async () => {
		(User.exists as jest.Mock).mockResolvedValue({ _id: USER_ID });

		const result = await isUserAdminOfClub(CLUB_ID, USER_ID);

		expect(result).toBe(true);
		expect(User.exists).toHaveBeenCalledWith({ _id: USER_ID, adminOf: CLUB_ID });
	});
});

describe('addUserAdminOfClub', () => {
	it('throws ClubStaffMutationNotFoundError when club does not exist', async () => {
		(Club.exists as jest.Mock).mockReturnValue({
			session: () => ({
				exec: () => Promise.resolve(null),
			}),
		});

		await expect(addUserAdminOfClub(CLUB_ID, USER_ID, makeSession())).rejects.toBeInstanceOf(
			ClubStaffMutationNotFoundError,
		);
	});

	it('adds admin and syncs role when club and user exist', async () => {
		const userDoc = {
			role: ROLES.PLAYER,
			adminOf: [new Types.ObjectId(CLUB_ID)],
			save: jest.fn().mockResolvedValue(undefined),
		};
		(Club.exists as jest.Mock)
			.mockReturnValueOnce({
				session: () => ({
					exec: () => Promise.resolve({ _id: CLUB_ID }),
				}),
			})
			.mockReturnValueOnce({
				session: () => ({
					exec: () => Promise.resolve(null),
				}),
			});
		(User.exists as jest.Mock).mockReturnValueOnce({
			session: () => ({
				exec: () => Promise.resolve({ _id: USER_ID }),
			}),
		});
		(User.updateOne as jest.Mock).mockReturnValue({
			session: () => ({
				exec: () => Promise.resolve({ modifiedCount: 1 }),
			}),
		});
		(User.findById as jest.Mock).mockReturnValue({
			select: () => ({
				session: () => ({
					exec: () => Promise.resolve(userDoc),
				}),
			}),
		});

		const result = await addUserAdminOfClub(CLUB_ID, USER_ID, makeSession());

		expect(result.modifiedCount).toBe(1);
		expect(userDoc.role).toBe(ROLES.CLUB_ADMIN);
		expect(userDoc.save).toHaveBeenCalled();
	});
});
