/**
 * Unit tests for addClubStaff handler.
 *
 * The duplicate-detection branches (modifiedCount === 0 → 409) cannot be exercised
 * via integration tests because MongoMemoryReplSet incorrectly reports modifiedCount=1
 * for no-op $addToSet operations inside WiredTiger transactions (data is always
 * correct — only the result signal is wrong in the test environment).
 *
 * These unit tests mock the query layer to cover those branches reliably.
 */

import mongoose, { Types } from 'mongoose';
import { addClubStaffFlow } from '../handler';
import * as queries from '../queries';
import type { ComputeClubStaffPermissionsResult } from '../../../../shared/clubStaffPermissions';
import * as clubStaffPermissions from '../../../../shared/clubStaffPermissions';
import { ROLES } from '../../../../constants/roles';
import type { Request } from 'express';

// ─── mocks ─────────────────────────────────────────────────────────────────

jest.mock('../queries');
jest.mock('../../shared/queries', () => ({
	...jest.requireActual('../../shared/queries'),
	isClubStaffMutationNotFoundError: jest.fn(),
}));
jest.mock('../../../../shared/clubStaffPermissions');

// mongoose.startSession needs to return a fake session with withTransaction
jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return {
		...actual,
		startSession: jest.fn(),
	};
});

// ─── stub types ─────────────────────────────────────────────────────────────
// We define narrow projection types matching what .select(...).lean() actually
// returns at runtime. Casting a partial object to the full Mongoose document
// type raises TS2352, so we alias only the fields the handler reads.

/** findClubPlanById: Club.findById(...).select('plan defaultAdminId') */
type ClubPlanProjection = {
	_id: Types.ObjectId;
	plan: 'free' | 'premium';
	defaultAdminId: Types.ObjectId | null;
};

/** findUserById: User.findById(...).select('_id email name alias').lean() */
type UserBasicProjection = {
	_id: Types.ObjectId;
	email: string;
	name: string | null;
	alias: string | null;
};

/** findClubStaffUserSnapshotById: User.findById(...).select('_id email name alias role adminOf').lean() */
type UserStaffSnapshotProjection = UserBasicProjection & {
	role: string;
	adminOf: Types.ObjectId[];
};

// ─── helpers ───────────────────────────────────────────────────────────────

type MockedFn<T extends (...args: never[]) => unknown> = jest.MockedFunction<T>;

const mockFindClubPlanById = queries.findClubPlanById as MockedFn<typeof queries.findClubPlanById>;
const mockFindUserById = queries.findUserById as MockedFn<typeof queries.findUserById>;
const mockFindClubStaffUserSnapshotById = queries.findClubStaffUserSnapshotById as MockedFn<typeof queries.findClubStaffUserSnapshotById>;
const mockAddUserAdminOfClub = queries.addUserAdminOfClub as MockedFn<typeof queries.addUserAdminOfClub>;
const mockAddUserAsClubOrganiser = queries.addUserAsClubOrganiser as MockedFn<typeof queries.addUserAsClubOrganiser>;
const mockComputePerms = clubStaffPermissions.computeClubStaffPermissionsForActor as MockedFn<typeof clubStaffPermissions.computeClubStaffPermissionsForActor>;
const mockStartSession = mongoose.startSession as MockedFn<typeof mongoose.startSession>;

const CLUB_ID = '64a000000000000000000010';
const USER_ID = '64a000000000000000000011';
const ACTOR_ID = '64a000000000000000000012';

function makeUpdateResult(matched: number, modified: number) {
	return {
		acknowledged: true,
		matchedCount: matched,
		modifiedCount: modified,
		upsertedCount: 0,
		upsertedId: null,
	};
}

function makeSession(handler: (cb: () => Promise<unknown>) => Promise<unknown>) {
	return {
		withTransaction: handler,
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

/** Runs the withTransaction callback synchronously (no real transaction). */
function syncTxSession() {
	return makeSession((cb) => cb());
}

function makeActorSession(actorId = ACTOR_ID): NonNullable<Request['user']> {
	return {
		_id: new Types.ObjectId(actorId),
		role: ROLES.CLUB_ADMIN,
		adminOf: [new Types.ObjectId(CLUB_ID)],
		organizerOf: [],
	} as unknown as NonNullable<Request['user']>;
}

// Stubs typed to the narrow projection types — no full Mongoose document cast needed.
const stubClub: ClubPlanProjection = {
	_id: new Types.ObjectId(CLUB_ID),
	defaultAdminId: new Types.ObjectId(ACTOR_ID),
	plan: 'premium',
};

const stubTargetUser: UserBasicProjection = {
	_id: new Types.ObjectId(USER_ID),
	email: 'target@example.com',
	name: 'Target User',
	alias: null,
};

const stubActorSnapshot: UserStaffSnapshotProjection = {
	_id: new Types.ObjectId(ACTOR_ID),
	email: 'actor@example.com',
	name: 'Actor',
	alias: null,
	role: ROLES.CLUB_ADMIN,
	adminOf: [new Types.ObjectId(CLUB_ID)],
};


const allowAllAccess: ComputeClubStaffPermissionsResult = {
	ok: true,
	canManageOrganisers: true,
	canManageAdmins: true,
};

beforeEach(() => {
	jest.resetAllMocks();

	// Default: full permission granted
	mockComputePerms.mockReturnValue(allowAllAccess);
	mockFindClubPlanById.mockResolvedValue(stubClub as never);
	mockFindUserById.mockResolvedValue(stubTargetUser as never);
	mockFindClubStaffUserSnapshotById.mockResolvedValue(stubActorSnapshot as never);
	mockStartSession.mockResolvedValue(syncTxSession() as unknown as mongoose.ClientSession);
});

// ─── tests ─────────────────────────────────────────────────────────────────

describe('addClubStaffFlow', () => {

	describe('happy path — add organiser', () => {
		it('returns 201 when organiser is successfully added', async () => {
			mockAddUserAsClubOrganiser.mockResolvedValue(makeUpdateResult(1, 1) as never);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'organiser' }, makeActorSession());

			expect(result.status).toBe(201);
			if (result.ok) {
				expect(result.data).toMatchObject({ staff: { id: USER_ID, role: 'organiser' } });
			}
		});
	});

	describe('happy path — add admin', () => {
		it('returns 201 when admin is successfully added', async () => {
			mockAddUserAdminOfClub.mockResolvedValue(makeUpdateResult(1, 1) as never);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'admin' }, makeActorSession());

			expect(result.status).toBe(201);
			if (result.ok) {
				expect(result.data).toMatchObject({ staff: { id: USER_ID, role: 'admin' } });
			}
		});
	});

	describe('rejection paths — pre-transaction guards', () => {
		it('returns 404 when club is not found', async () => {
			mockFindClubPlanById.mockResolvedValue(null);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'organiser' }, makeActorSession());

			expect(result.status).toBe(404);
			expect(mockStartSession).not.toHaveBeenCalled();
		});

		it('returns 403 when the actor has no access to the club', async () => {
			const noAccess: ComputeClubStaffPermissionsResult = { ok: false };
			mockComputePerms.mockReturnValue(noAccess);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'organiser' }, makeActorSession());

			expect(result.status).toBe(403);
		});

		it('returns 403 when an organiser tries to add another organiser (canManageOrganisers: false)', async () => {
			const limitedAccess: ComputeClubStaffPermissionsResult = { ok: true, canManageOrganisers: false, canManageAdmins: false };
			mockComputePerms.mockReturnValue(limitedAccess);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'organiser' }, makeActorSession());

			expect(result.status).toBe(403);
		});

		it('returns 403 when the club is on a free plan', async () => {
			const freePlanClub: ClubPlanProjection = { ...stubClub, plan: 'free' };
			mockFindClubPlanById.mockResolvedValue(freePlanClub as never);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'organiser' }, makeActorSession());

			expect(result.status).toBe(403);
		});

		it('returns 404 when the target user is not found', async () => {
			mockFindUserById.mockResolvedValue(null);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'organiser' }, makeActorSession());

			expect(result.status).toBe(404);
			expect(result.message).toMatch(/user not found/i);
		});
	});

	describe('duplicate-detection — inside transaction (modifiedCount === 0)', () => {
		it('returns 409 when the user is already an organiser of this club', async () => {
			// $addToSet returns modifiedCount=0 in production when item already exists.
			// MongoMemoryReplSet/Jest misreports this as 1, so we test via mock.
			mockAddUserAsClubOrganiser.mockResolvedValue(makeUpdateResult(1, 0) as never);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'organiser' }, makeActorSession());

			expect(result.status).toBe(409);
			expect(result.message).toMatch(/already an organiser/i);
		});

		it('returns 409 when the user is already an admin of this club', async () => {
			mockAddUserAdminOfClub.mockResolvedValue(makeUpdateResult(1, 0) as never);

			const result = await addClubStaffFlow(CLUB_ID, { userId: USER_ID, role: 'admin' }, makeActorSession());

			expect(result.status).toBe(409);
			expect(result.message).toMatch(/already an admin/i);
		});
	});
});
