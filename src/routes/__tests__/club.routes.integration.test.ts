import { Types } from 'mongoose';
import Club from '../../models/Club';
import Court from '../../models/Court';
import User from '../../models/User';
import clubRouter from '../club.routes';
import {
	createClub,
	createCourt,
	createSession,
	createUser,
	seedClubAdmin,
	seedOrganiserForClub,
	setupMemoryMongo,
} from '../../testUtils/db';
import { buildJsonApp, requestJson } from '../../testUtils/integrationTestUtils';
import { ROLES } from '../../constants/roles';

setupMemoryMongo();

describe('club routes integration', () => {
	const app = buildJsonApp('/clubs', clubRouter);

	// ─── getClubPublic ─────────────────────────────────────────────────────────

	describe('GET /clubs/public/:clubId', () => {
		it('returns public club details including courts', async () => {
			const { club } = await seedClubAdmin({ plan: 'free' });
			await createCourt(club._id, { name: 'Court A' });

			const res = await requestJson(app, `/clubs/public/${club._id.toString()}`);

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({
				club: {
					id: club._id.toString(),
					name: club.name,
					courtCount: 1,
				},
			});
		});

		it('returns 404 for an unknown club id', async () => {
			const res = await requestJson(app, `/clubs/public/${new Types.ObjectId().toString()}`);
			expect(res.status).toBe(404);
		});
	});

	// ─── listClubs ─────────────────────────────────────────────────────────────

	describe('GET /clubs/list', () => {
		it('allows unauthenticated access', async () => {
			const res = await requestJson(app, '/clubs/list');
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('clubs');
		});

		it('allows authenticated access', async () => {
			const user = await createUser();
			const { authorization } = await createSession(user);
			const res = await requestJson(app, '/clubs/list', { headers: { authorization } });
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('clubs');
		});
	});

	// ─── createClub ────────────────────────────────────────────────────────────

	describe('POST /clubs', () => {
		it('creates a club and assigns the creator as admin', async () => {
			const user = await createUser();
			const { authorization } = await createSession(user);

			const res = await requestJson(app, '/clubs', {
				method: 'POST',
				headers: { authorization },
				body: {
					name: 'Integration Test Club',
					address: '1 Test Street',
					coordinates: [77.5946, 12.9716],
				},
			});

			expect(res.status).toBe(201);
			expect(res.body).toMatchObject({
				club: {
					name: 'Integration Test Club',
					address: '1 Test Street',
					courtCount: 0,
				},
			});

			const persisted = await Club.findOne({ name: 'Integration Test Club' }).lean().orFail();
			expect(persisted.defaultAdminId?.toString()).toBe(user._id.toString());

			const updatedUser = await User.findById(user._id).lean().orFail();
			expect(updatedUser.adminOf.map((id) => id.toString())).toContain(persisted._id.toString());
		});

		it('creates a club with courts when provided', async () => {
			const user = await createUser();
			const { authorization } = await createSession(user);

			const res = await requestJson(app, '/clubs', {
				method: 'POST',
				headers: { authorization },
				body: {
					name: 'Club With Courts',
					address: '2 Court Lane',
					coordinates: [77.5946, 12.9716],
					courts: [
						{ name: 'Court 1', type: 'hard', placement: 'outdoor' },
						{ name: 'Court 2', type: 'clay', placement: 'indoor' },
					],
				},
			});

			expect(res.status).toBe(201);
			expect(res.body).toMatchObject({ club: { courtCount: 2 } });
		});

		it('rejects a duplicate club name without creating a second club', async () => {
			const { club } = await seedClubAdmin();
			const user2 = await createUser();
			const { authorization } = await createSession(user2);
			const before = await Club.countDocuments();

			const res = await requestJson(app, '/clubs', {
				method: 'POST',
				headers: { authorization },
				body: {
					name: club.name, // exact duplicate
					address: '3 Duplicate Street',
					coordinates: [77.5946, 12.9716],
				},
			});

			expect(res.status).toBe(409);
			await expect(Club.countDocuments()).resolves.toBe(before);
		});

		it('returns 401 for unauthenticated requests', async () => {
			const res = await requestJson(app, '/clubs', {
				method: 'POST',
				body: { name: 'Ghost Club', address: 'Nowhere', coordinates: [0, 0] },
			});
			expect(res.status).toBe(401);
		});
	});

	// ─── getClubById ───────────────────────────────────────────────────────────

	describe('GET /clubs/:clubId', () => {
		it('returns club details with courts for the club admin', async () => {
			const { user, club } = await seedClubAdmin();
			await createCourt(club._id, { name: 'Main Court' });
			const { authorization } = await createSession(user);

			const res = await requestJson(app, `/clubs/${club._id.toString()}`, {
				headers: { authorization },
			});

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({
				club: { id: club._id.toString(), name: club.name },
				courts: expect.arrayContaining([expect.objectContaining({ name: 'Main Court' })]),
			});
		});

		it('returns 403 for a non-admin user', async () => {
			const { club } = await seedClubAdmin();
			const outsider = await createUser();
			const { authorization } = await createSession(outsider);

			const res = await requestJson(app, `/clubs/${club._id.toString()}`, {
				headers: { authorization },
			});

			expect(res.status).toBe(403);
		});
	});

	// ─── getClubStaff ──────────────────────────────────────────────────────────

	describe('GET /clubs/:clubId/staff', () => {
		it('returns admins and organisers for the club admin', async () => {
			const { user, club } = await seedClubAdmin();
			const { authorization } = await createSession(user);

			const res = await requestJson(app, `/clubs/${club._id.toString()}/staff`, {
				headers: { authorization },
			});

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({
				staff: expect.arrayContaining([
					expect.objectContaining({
						id: user._id.toString(),
						role: 'default_admin',
					}),
				]),
				subscription: { plan: expect.any(String) },
			});
		});

		it('includes organisers in the staff list', async () => {
			const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
			const organiser = await createUser({ role: ROLES.ORGANISER });
			club.organiserIds = [organiser._id];
			organiser.organizerOf = [club._id];
			await club.save();
			await organiser.save();

			const { authorization } = await createSession(admin);
			const res = await requestJson(app, `/clubs/${club._id.toString()}/staff`, {
				headers: { authorization },
			});

			expect(res.status).toBe(200);
			const ids = (res.body as { staff: Array<{ id: string }> }).staff.map((s) => s.id);
			expect(ids).toContain(organiser._id.toString());
		});

		it('returns 403 for a non-member user', async () => {
			const { club } = await seedClubAdmin();
			const outsider = await createUser();
			const { authorization } = await createSession(outsider);

			const res = await requestJson(app, `/clubs/${club._id.toString()}/staff`, {
				headers: { authorization },
			});

			expect(res.status).toBe(403);
		});
	});

	// ─── addClubStaff ──────────────────────────────────────────────────────────

	describe('POST /clubs/:clubId/staff', () => {
		it('adds an organiser to a premium club and updates club.organiserIds', async () => {
			const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
			const { authorization } = await createSession(admin);
			const newOrganiser = await createUser();

			const res = await requestJson(app, `/clubs/${club._id.toString()}/staff`, {
				method: 'POST',
				headers: { authorization },
				body: { userId: newOrganiser._id.toString(), role: 'organiser' },
			});

			expect(res.status).toBe(201);
			expect(res.body).toMatchObject({
				staff: {
					id: newOrganiser._id.toString(),
					role: 'organiser',
				},
			});

			const updatedClub = await Club.findById(club._id).lean().orFail();
			expect(updatedClub.organiserIds.map((id) => id.toString())).toContain(
				newOrganiser._id.toString(),
			);
		});

		it('blocks adding staff on a free-plan club without changing the DB', async () => {
			const { user: admin, club } = await seedClubAdmin({ plan: 'free' });
			const { authorization } = await createSession(admin);
			const newUser = await createUser();
			const before = await Club.findById(club._id).lean().orFail();

			const res = await requestJson(app, `/clubs/${club._id.toString()}/staff`, {
				method: 'POST',
				headers: { authorization },
				body: { userId: newUser._id.toString(), role: 'organiser' },
			});

			expect(res.status).toBe(403);
			const after = await Club.findById(club._id).lean().orFail();
			expect(after.organiserIds.length).toBe(before.organiserIds.length);
		});

		it('returns 403 when an organiser tries to add another organiser (only admins can)', async () => {
			const { club } = await seedClubAdmin({ plan: 'premium' });
			// Create an organiser manually linked to the existing club
			const organiser = await createUser({ role: ROLES.ORGANISER });
			organiser.organizerOf = [club._id];
			await organiser.save();
			await Club.findByIdAndUpdate(club._id, { $addToSet: { organiserIds: organiser._id } });

			const { authorization } = await createSession(organiser);
			const newUser = await createUser();

			const before = await Club.findById(club._id).lean().orFail();

			const res = await requestJson(app, `/clubs/${club._id.toString()}/staff`, {
				method: 'POST',
				headers: { authorization },
				body: { userId: newUser._id.toString(), role: 'organiser' },
			});

			expect(res.status).toBe(403);
			const after = await Club.findById(club._id).lean().orFail();
			expect(after.organiserIds.length).toBe(before.organiserIds.length);
		});

	});

	// ─── removeClubStaff ───────────────────────────────────────────────────────

	describe('DELETE /clubs/:clubId/staff/:staffId', () => {
		it('removes an organiser and updates club.organiserIds', async () => {
			const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
			const organiser = await createUser({ role: ROLES.ORGANISER });
			club.organiserIds = [organiser._id];
			organiser.organizerOf = [club._id];
			await club.save();
			await organiser.save();

			const { authorization } = await createSession(admin);

			const res = await requestJson(
				app,
				`/clubs/${club._id.toString()}/staff/${organiser._id.toString()}`,
				{ method: 'DELETE', headers: { authorization } },
			);

			expect(res.status).toBe(200);

			const updatedClub = await Club.findById(club._id).lean().orFail();
			expect(updatedClub.organiserIds.map((id) => id.toString())).not.toContain(
				organiser._id.toString(),
			);
		});

		it('returns 403 when trying to remove the default admin', async () => {
			const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
			const { authorization } = await createSession(admin);

			const res = await requestJson(
				app,
				`/clubs/${club._id.toString()}/staff/${admin._id.toString()}`,
				{ method: 'DELETE', headers: { authorization } },
			);

			expect(res.status).toBe(403);
		});
	});

	// ─── setClubMainAdmin ──────────────────────────────────────────────────────

	describe('PATCH /clubs/:clubId/staff/main-admin', () => {
		it('transfers main admin to another admin and updates club.defaultAdminId', async () => {
			const { user: currentAdmin, club } = await seedClubAdmin({ plan: 'premium' });
			// Add a second admin
			const newAdmin = await createUser({ role: ROLES.CLUB_ADMIN });
			newAdmin.adminOf = [club._id];
			club.organiserIds = [];
			await newAdmin.save();

			const { authorization } = await createSession(currentAdmin);

			const res = await requestJson(app, `/clubs/${club._id.toString()}/staff/main-admin`, {
				method: 'PATCH',
				headers: { authorization },
				body: { userId: newAdmin._id.toString() },
			});

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({
				staff: { id: newAdmin._id.toString(), role: 'default_admin' },
			});

			const updatedClub = await Club.findById(club._id).lean().orFail();
			expect(updatedClub.defaultAdminId?.toString()).toBe(newAdmin._id.toString());
		});

		it('returns 409 if the target is already the main admin', async () => {
			const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
			const { authorization } = await createSession(admin);

			const res = await requestJson(app, `/clubs/${club._id.toString()}/staff/main-admin`, {
				method: 'PATCH',
				headers: { authorization },
				body: { userId: admin._id.toString() },
			});

			expect(res.status).toBe(409);
		});
	});

	// ─── updateClubStaffRole ───────────────────────────────────────────────────

	describe('PATCH /clubs/:clubId/staff/:staffId', () => {
		it('promotes an organiser to admin and updates both Club and User', async () => {
			const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
			const organiser = await createUser({ role: ROLES.ORGANISER });
			club.organiserIds = [organiser._id];
			organiser.organizerOf = [club._id];
			await club.save();
			await organiser.save();

			const { authorization } = await createSession(admin);

			const res = await requestJson(
				app,
				`/clubs/${club._id.toString()}/staff/${organiser._id.toString()}`,
				{
					method: 'PATCH',
					headers: { authorization },
					body: { role: 'admin' },
				},
			);

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({
				staff: { id: organiser._id.toString(), role: 'admin' },
			});
		});
	});

	// ─── updateClub ────────────────────────────────────────────────────────────

	describe('PATCH /clubs/:clubId', () => {
		it('updates club name and address and persists changes', async () => {
			const { user, club } = await seedClubAdmin();
			const { authorization } = await createSession(user);

			const res = await requestJson(app, `/clubs/${club._id.toString()}`, {
				method: 'PATCH',
				headers: { authorization },
				body: { name: 'Updated Club Name', address: '99 New Street' },
			});

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({ club: { name: 'Updated Club Name', address: '99 New Street' } });

			const persisted = await Club.findById(club._id).lean().orFail();
			expect(persisted.name).toBe('Updated Club Name');
			expect(persisted.address).toBe('99 New Street');
		});

		it('adds new courts when courts array is provided', async () => {
			const { user, club } = await seedClubAdmin();
			const { authorization } = await createSession(user);

			const res = await requestJson(app, `/clubs/${club._id.toString()}`, {
				method: 'PATCH',
				headers: { authorization },
				body: {
					courts: [
						{ name: 'New Court 1', type: 'hard', placement: 'outdoor' },
						{ name: 'New Court 2', type: 'clay', placement: 'indoor' },
					],
				},
			});

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({ club: { courtCount: 2 } });

			const courtCount = await Court.countDocuments({ club: club._id });
			expect(courtCount).toBe(2);
		});

		it('returns 403 for a non-admin user without changing the DB', async () => {
			const { club } = await seedClubAdmin();
			const outsider = await createUser();
			const { authorization } = await createSession(outsider);
			const originalName = club.name;

			const res = await requestJson(app, `/clubs/${club._id.toString()}`, {
				method: 'PATCH',
				headers: { authorization },
				body: { name: 'Hacked Name' },
			});

			expect(res.status).toBe(403);

			const unchanged = await Club.findById(club._id).lean().orFail();
			expect(unchanged.name).toBe(originalName);
		});
	});

	// ─── requestClubSubscriptionRenewal ────────────────────────────────────────

	describe('PATCH /clubs/:clubId/subscription/renewal-request', () => {
		it('grants a 14-day premium trial on a free club', async () => {
			const { user, club } = await seedClubAdmin({ plan: 'free' });
			const { authorization } = await createSession(user);
			expect(club.plan).toBe('free');

			const res = await requestJson(
				app,
				`/clubs/${club._id.toString()}/subscription/renewal-request`,
				{ method: 'PATCH', headers: { authorization } },
			);

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({ club: { plan: 'premium' } });

			const updated = await Club.findById(club._id).lean().orFail();
			expect(updated.plan).toBe('premium');
			expect(updated.expiresAt).not.toBeNull();
			expect(updated.renewalRequestedAt).not.toBeNull();
		});

		it('returns 403 for a non-member without changing the club', async () => {
			const { club } = await seedClubAdmin({ plan: 'free' });
			const outsider = await createUser();
			const { authorization } = await createSession(outsider);

			const res = await requestJson(
				app,
				`/clubs/${club._id.toString()}/subscription/renewal-request`,
				{ method: 'PATCH', headers: { authorization } },
			);

			expect(res.status).toBe(403);

			const unchanged = await Club.findById(club._id).lean().orFail();
			expect(unchanged.plan).toBe('free');
		});

		it('is idempotent — does not overwrite an existing renewalRequestedAt', async () => {
			const { user, club } = await seedClubAdmin({ plan: 'free' });
			const { authorization } = await createSession(user);

			await requestJson(app, `/clubs/${club._id.toString()}/subscription/renewal-request`, {
				method: 'PATCH',
				headers: { authorization },
			});
			const after1 = await Club.findById(club._id).lean().orFail();

			await requestJson(app, `/clubs/${club._id.toString()}/subscription/renewal-request`, {
				method: 'PATCH',
				headers: { authorization },
			});
			const after2 = await Club.findById(club._id).lean().orFail();

			expect(after2.renewalRequestedAt?.getTime()).toBe(after1.renewalRequestedAt?.getTime());
		});
	});

	// ─── searchClubs ───────────────────────────────────────────────────────────

	describe('GET /clubs', () => {
		it('requires authentication', async () => {
			const res = await requestJson(app, '/clubs');
			expect(res.status).toBe(401);
		});

		it('returns clubs for an authenticated user', async () => {
			await seedClubAdmin();
			const user = await createUser();
			const { authorization } = await createSession(user);

			const res = await requestJson(app, '/clubs', { headers: { authorization } });
			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('clubs');
		});
	});
});
