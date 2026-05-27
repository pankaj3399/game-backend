import mongoose from 'mongoose';
import { ROLES, type Role } from '../../../../constants/roles';
import type { AuthenticatedSession } from '../../../../shared/authContext';
import type { TournamentPopulated } from '../../../../types/api/tournament';
import { isOwnerOrSuperAdmin, userCanManageClub } from '../../../../lib/permissions';
import { authorizeGetById } from '../authorizeGetById';

jest.mock('../../../../lib/permissions', () => ({
	isOwnerOrSuperAdmin: jest.fn(),
	userCanManageClub: jest.fn(),
}));

const mockIsOwnerOrSuperAdmin = jest.mocked(isOwnerOrSuperAdmin);
const mockUserCanManageClub = jest.mocked(userCanManageClub);

function makeSession(role: Role = ROLES.PLAYER): AuthenticatedSession {
	return {
		_id: new mongoose.Types.ObjectId(),
		role,
		adminOf: [],
		organizerOf: [],
	} as unknown as AuthenticatedSession;
}

function makeTournament(options: {
	status?: 'draft' | 'active';
	clubId?: mongoose.Types.ObjectId | null;
	createdBy?: mongoose.Types.ObjectId;
} = {}): TournamentPopulated {
	const createdBy = options.createdBy ?? new mongoose.Types.ObjectId();
	return {
		_id: new mongoose.Types.ObjectId(),
		status: options.status ?? 'active',
		club:
			options.clubId === null
				? null
				: {
						_id: options.clubId ?? new mongoose.Types.ObjectId(),
						name: 'Central Club',
					},
		createdBy: {
			equals: (value: unknown) => createdBy.equals(value as mongoose.Types.ObjectId),
		},
	} as unknown as TournamentPopulated;
}

describe('authorizeGetById()', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockUserCanManageClub.mockResolvedValue(false);
		mockIsOwnerOrSuperAdmin.mockReturnValue(false);
	});

	it('rejects tournaments that have no club relation', async () => {
		const result = await authorizeGetById(makeTournament({ clubId: null }));

		expect(result).toEqual({
			ok: false,
			status: 400,
			message: 'Tournament has no club',
		});
		expect(mockUserCanManageClub).not.toHaveBeenCalled();
	});

	it('allows guests to view published tournaments as players', async () => {
		const clubId = new mongoose.Types.ObjectId();
		const result = await authorizeGetById(makeTournament({ status: 'active', clubId }));

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.status).toBe(200);
			expect(result.data.context).toEqual({
				isManager: false,
				isCreator: false,
				clubIdStr: clubId.toString(),
				role: ROLES.PLAYER,
			});
		}
		expect(mockUserCanManageClub).not.toHaveBeenCalled();
	});

	it('blocks guests from draft tournaments', async () => {
		const result = await authorizeGetById(makeTournament({ status: 'draft' }));

		expect(result).toEqual({
			ok: false,
			status: 403,
			message: 'You do not have permission to view this tournament',
		});
	});

	it('allows draft access for the creator', async () => {
		const session = makeSession(ROLES.ORGANISER);
		const tournament = makeTournament({ status: 'draft', createdBy: session._id });
		mockIsOwnerOrSuperAdmin.mockReturnValue(true);

		const result = await authorizeGetById(tournament, session);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.context.isCreator).toBe(true);
			expect(result.data.context.isManager).toBe(false);
			expect(result.data.context.role).toBe(ROLES.ORGANISER);
		}
		expect(mockUserCanManageClub).toHaveBeenCalledTimes(1);
	});

	it('allows draft access for club managers', async () => {
		const session = makeSession(ROLES.CLUB_ADMIN);
		mockUserCanManageClub.mockResolvedValue(true);
		const result = await authorizeGetById(makeTournament({ status: 'draft' }), session);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.context.isManager).toBe(true);
			expect(result.data.context.isCreator).toBe(false);
			expect(result.data.context.role).toBe(ROLES.CLUB_ADMIN);
		}
	});

	it('blocks authenticated users who cannot view a draft', async () => {
		const session = makeSession(ROLES.PLAYER);
		mockUserCanManageClub.mockResolvedValue(false);
		mockIsOwnerOrSuperAdmin.mockReturnValue(false);

		const result = await authorizeGetById(makeTournament({ status: 'draft' }), session);

		expect(result).toEqual({
			ok: false,
			status: 403,
			message: 'You do not have permission to view this tournament',
		});
	});
});
