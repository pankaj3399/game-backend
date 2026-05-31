import mongoose, { Types } from 'mongoose';
import { ROLES } from '../../../../constants/roles';
import Club from '../../../../models/Club';
import Court from '../../../../models/Court';
import Tournament from '../../../../models/Tournament';
import User from '../../../../models/User';
import {
	findClubMemberCountsByClub,
	findCourtCountsByClub,
	findTournamentCountsByClub,
	findUserAdminClubs,
} from '../queries';

jest.mock('../../../../models/User');
jest.mock('../../../../models/Club');
jest.mock('../../../../models/Court');
jest.mock('../../../../models/Tournament');

const USER_ID = '507f1f77bcf86cd799439011';
const CLUB_A = new Types.ObjectId('507f1f77bcf86cd799439012');
const CLUB_B = new Types.ObjectId('507f1f77bcf86cd799439013');
const ORGANISER_ID = new Types.ObjectId('507f1f77bcf86cd799439014');

function userFindByIdChain(user: unknown) {
	return {
		populate: () => ({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve(user),
				}),
			}),
		}),
	};
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe('findUserAdminClubs', () => {
	it('returns null when user does not exist', async () => {
		(User.findById as jest.Mock).mockReturnValue(userFindByIdChain(null));
		(Club.find as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve([]),
				}),
			}),
		});

		const result = await findUserAdminClubs(USER_ID);
		expect(result).toBeNull();
	});

	it('returns paginated clubs for super admin', async () => {
		const clubs = [{ _id: CLUB_A, name: 'Alpha', logoUrl: null }];
		(User.findById as jest.Mock).mockReturnValue(
			userFindByIdChain({ role: ROLES.SUPER_ADMIN, adminOf: [] }),
		);
		(Club.find as jest.Mock)
			.mockReturnValueOnce({
				select: () => ({
					lean: () => ({
						exec: () => Promise.resolve([]),
					}),
				}),
			})
			.mockReturnValueOnce({
				select: () => ({
					sort: () => ({
						skip: () => ({
							limit: () => ({
								lean: () => ({
									exec: () => Promise.resolve(clubs),
								}),
							}),
						}),
					}),
				}),
			});

		const result = await findUserAdminClubs(USER_ID, { limit: 50, offset: 0 });
		expect(result).toEqual(clubs);
	});

	it('merges adminOf and organiser clubs sorted by name', async () => {
		(User.findById as jest.Mock).mockReturnValue(
			userFindByIdChain({
				role: ROLES.ORGANISER,
				adminOf: [{ _id: CLUB_B, name: 'Beta Club', logoUrl: null }],
			}),
		);
		(Club.find as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () => Promise.resolve([{ _id: CLUB_A, name: 'Alpha Club', logoUrl: null }]),
				}),
			}),
		});

		const result = await findUserAdminClubs(USER_ID);
		expect(result?.map((club) => club.name)).toEqual(['Alpha Club', 'Beta Club']);
	});
});

describe('findCourtCountsByClub', () => {
	it('returns empty map for no club ids', async () => {
		const result = await findCourtCountsByClub([]);
		expect(result.size).toBe(0);
		expect(Court.aggregate).not.toHaveBeenCalled();
	});

	it('maps aggregate rows to club id counts', async () => {
		(Court.aggregate as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve([{ _id: CLUB_A, count: 4 }]),
		});

		const result = await findCourtCountsByClub([CLUB_A]);
		expect(result.get(CLUB_A.toString())).toBe(4);
	});
});

describe('findTournamentCountsByClub', () => {
	it('returns empty map for no club ids', async () => {
		const result = await findTournamentCountsByClub([]);
		expect(result.size).toBe(0);
	});

	it('maps tournament aggregate counts', async () => {
		(Tournament.aggregate as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve([{ _id: CLUB_A, count: 2 }]),
		});

		const result = await findTournamentCountsByClub([CLUB_A]);
		expect(result.get(CLUB_A.toString())).toBe(2);
	});
});

describe('findClubMemberCountsByClub', () => {
	it('returns empty map for no club ids', async () => {
		const result = await findClubMemberCountsByClub([]);
		expect(result.size).toBe(0);
	});

	it('combines user aggregates with active organiser counts', async () => {
		(User.aggregate as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve([{ _id: CLUB_A, count: 3 }]),
		});
		(Club.find as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve([
							{
								_id: CLUB_A,
								organiserIds: [ORGANISER_ID],
							},
						]),
				}),
			}),
		});
		(User.find as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve([
							{
								_id: ORGANISER_ID,
								favoriteClubs: [],
								adminOf: [],
							},
						]),
				}),
			}),
		});

		const result = await findClubMemberCountsByClub([CLUB_A]);
		expect(result.get(CLUB_A.toString())).toBe(4);
	});

	it('does not double-count organisers already in member set', async () => {
		(User.aggregate as jest.Mock).mockReturnValue({
			exec: () => Promise.resolve([{ _id: CLUB_A, count: 1 }]),
		});
		(Club.find as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve([
							{
								_id: CLUB_A,
								organiserIds: [ORGANISER_ID],
							},
						]),
				}),
			}),
		});
		(User.find as jest.Mock).mockReturnValue({
			select: () => ({
				lean: () => ({
					exec: () =>
						Promise.resolve([
							{
								_id: ORGANISER_ID,
								favoriteClubs: [CLUB_A],
								adminOf: [],
							},
						]),
				}),
			}),
		});

		const result = await findClubMemberCountsByClub([CLUB_A]);
		expect(result.get(CLUB_A.toString())).toBe(1);
	});
});
