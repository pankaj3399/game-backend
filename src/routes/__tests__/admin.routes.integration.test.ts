import { Types } from 'mongoose';
import Club from '../../models/Club';
import Sponsor from '../../models/Sponsor';
import adminRouter from '../admin.routes';
import {
	createClub,
	createSession,
	createSponsor,
	createUser,
	setupMemoryMongo,
} from '../../testUtils/db';
import { buildJsonApp, requestJson } from '../../testUtils/integrationTestUtils';
import { ROLES } from '../../constants/roles';

setupMemoryMongo();

describe('admin routes integration', () => {
	const app = buildJsonApp('/admin', adminRouter);

	async function superAdminSession() {
		const admin = await createUser({ role: ROLES.SUPER_ADMIN });
		const { authorization } = await createSession(admin);
		return { admin, authorization };
	}

	// ─── ping ──────────────────────────────────────────────────────────────────

	describe('GET /admin/ping', () => {
		it('returns a success message for super admins', async () => {
			const { authorization } = await superAdminSession();
			const res = await requestJson(app, '/admin/ping', { headers: { authorization } });
			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({ message: 'Admin access granted' });
		});

		it('returns 403 for a regular player', async () => {
			const user = await createUser({ role: ROLES.PLAYER });
			const { authorization } = await createSession(user);
			const res = await requestJson(app, '/admin/ping', { headers: { authorization } });
			expect(res.status).toBe(403);
		});

		it('returns 401 for unauthenticated requests', async () => {
			const res = await requestJson(app, '/admin/ping');
			expect(res.status).toBe(401);
		});
	});

	// ─── getClubSubscriptionsOverview ──────────────────────────────────────────

	describe('GET /admin/clubs/subscriptions', () => {
		it('returns clubs with their subscription details for a super admin', async () => {
			await createClub({ plan: 'premium' });
			await createClub({ plan: 'free' });

			const { authorization } = await superAdminSession();
			const res = await requestJson(app, '/admin/clubs/subscriptions', {
				headers: { authorization },
			});

			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('clubs');
			expect(Array.isArray((res.body as { clubs: unknown[] }).clubs)).toBe(true);
			expect((res.body as { clubs: unknown[] }).clubs.length).toBeGreaterThanOrEqual(2);
		});

		it('returns 403 for a club admin', async () => {
			const user = await createUser({ role: ROLES.CLUB_ADMIN });
			const { authorization } = await createSession(user);
			const res = await requestJson(app, '/admin/clubs/subscriptions', {
				headers: { authorization },
			});
			expect(res.status).toBe(403);
		});
	});

	// ─── updateClubSubscription ────────────────────────────────────────────────

	describe('PATCH /admin/clubs/:clubId/subscription', () => {
		it('upgrades a free club to premium with an expiry date', async () => {
			const club = await createClub({ plan: 'free' });
			const { authorization } = await superAdminSession();
			const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

			const res = await requestJson(app, `/admin/clubs/${club._id.toString()}/subscription`, {
				method: 'PATCH',
				headers: { authorization },
				body: { plan: 'premium', expiresAt },
			});

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({ club: { plan: 'premium' } });

			const updated = await Club.findById(club._id).lean().orFail();
			expect(updated.plan).toBe('premium');
			expect(updated.expiresAt).not.toBeNull();
		});

		it('downgrades a premium club to free and clears expiresAt', async () => {
			const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
			const club = await createClub({ plan: 'premium' });
			// manually set expiresAt
			await Club.findByIdAndUpdate(club._id, { expiresAt });

			const { authorization } = await superAdminSession();

			const res = await requestJson(app, `/admin/clubs/${club._id.toString()}/subscription`, {
				method: 'PATCH',
				headers: { authorization },
				body: { plan: 'free' },
			});

			expect(res.status).toBe(200);
			expect(res.body).toMatchObject({ club: { plan: 'free' } });

			const updated = await Club.findById(club._id).lean().orFail();
			expect(updated.plan).toBe('free');
			expect(updated.expiresAt).toBeNull();
		});

		it('returns 404 for an unknown club without changing any state', async () => {
			const { authorization } = await superAdminSession();
			// Use a strictly-future date to pass the futureDate schema validator
			const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

			const res = await requestJson(
				app,
				`/admin/clubs/${new Types.ObjectId().toString()}/subscription`,
				{
					method: 'PATCH',
					headers: { authorization },
					body: { plan: 'premium', expiresAt: futureExpiry },
				},
			);

			expect(res.status).toBe(404);
		});

		it('returns 403 for a non-super-admin without changing the club', async () => {
			const club = await createClub({ plan: 'free' });
			const user = await createUser({ role: ROLES.CLUB_ADMIN });
			const { authorization } = await createSession(user);
			const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

			const res = await requestJson(app, `/admin/clubs/${club._id.toString()}/subscription`, {
				method: 'PATCH',
				headers: { authorization },
				body: { plan: 'premium', expiresAt: futureExpiry },
			});

			expect(res.status).toBe(403);

			const unchanged = await Club.findById(club._id).lean().orFail();
			expect(unchanged.plan).toBe('free');
		});
	});

	// ─── getPlatformSponsors ───────────────────────────────────────────────────

	describe('GET /admin/sponsors', () => {
		it('returns all platform (global) sponsors for a super admin', async () => {
			await createSponsor({ name: 'Platform A', scope: 'global', club: null });
			await createSponsor({ name: 'Platform B', scope: 'global', club: null, status: 'paused' });

			const { authorization } = await superAdminSession();
			const res = await requestJson(app, '/admin/sponsors', { headers: { authorization } });

			expect(res.status).toBe(200);
			expect(res.body).toHaveProperty('sponsors');
			expect((res.body as { sponsors: unknown[] }).sponsors.length).toBeGreaterThanOrEqual(2);
		});

		it('returns 403 for a regular player', async () => {
			const user = await createUser({ role: ROLES.PLAYER });
			const { authorization } = await createSession(user);
			const res = await requestJson(app, '/admin/sponsors', { headers: { authorization } });
			expect(res.status).toBe(403);
		});
	});

	// ─── createPlatformSponsor ────────────────────────────────────────────────

	describe('POST /admin/sponsors', () => {
		it('creates a global sponsor and persists to DB', async () => {
			const { authorization } = await superAdminSession();

			const res = await requestJson(app, '/admin/sponsors', {
				method: 'POST',
				headers: { authorization },
				body: {
					name: ' New Global Partner ',
					description: 'A new platform sponsor',
					link: 'https://global.example',
				},
			});

			expect(res.status).toBe(201);
			// createPlatformSponsor sends result.data.sponsor directly (flat object)
			expect(res.body).toMatchObject({
				name: 'New Global Partner',
				description: 'A new platform sponsor',
				link: 'https://global.example',
				status: 'active',
			});

			const persisted = await Sponsor.findOne({ name: 'New Global Partner' }).lean().orFail();
			expect(persisted.scope).toBe('global');
			expect(persisted.club).toBeNull();
		});

		it('returns 403 for a non-super-admin without creating a sponsor', async () => {
			const user = await createUser({ role: ROLES.CLUB_ADMIN });
			const { authorization } = await createSession(user);
			const before = await Sponsor.countDocuments();

			const res = await requestJson(app, '/admin/sponsors', {
				method: 'POST',
				headers: { authorization },
				body: { name: 'Blocked Sponsor' },
			});

			expect(res.status).toBe(403);
			await expect(Sponsor.countDocuments()).resolves.toBe(before);
		});
	});

	// ─── updatePlatformSponsor ────────────────────────────────────────────────

	describe('PATCH /admin/sponsors/:sponsorId', () => {
		it('updates platform sponsor fields and persists changes', async () => {
			const sponsor = await createSponsor({ name: 'Old Platform Name', scope: 'global', club: null });
			const { authorization } = await superAdminSession();

			const res = await requestJson(app, `/admin/sponsors/${sponsor._id.toString()}`, {
				method: 'PATCH',
				headers: { authorization },
				body: { name: ' Updated Platform Name ', status: 'paused' },
			});

			expect(res.status).toBe(200);
			// updatePlatformSponsor sends the flat sponsor object directly
			expect(res.body).toMatchObject({
				name: 'Updated Platform Name',
				status: 'paused',
			});

			const updated = await Sponsor.findById(sponsor._id).lean().orFail();
			expect(updated.name).toBe('Updated Platform Name');
			expect(updated.status).toBe('paused');
		});

		it('returns 403 for a non-super-admin without changing the sponsor', async () => {
			const sponsor = await createSponsor({ name: 'Protected Sponsor', scope: 'global', club: null });
			const user = await createUser({ role: ROLES.PLAYER });
			const { authorization } = await createSession(user);

			const res = await requestJson(app, `/admin/sponsors/${sponsor._id.toString()}`, {
				method: 'PATCH',
				headers: { authorization },
				body: { name: 'Hacked Name' },
			});

			expect(res.status).toBe(403);
			const unchanged = await Sponsor.findById(sponsor._id).lean().orFail();
			expect(unchanged.name).toBe('Protected Sponsor');
		});
	});

	// ─── deletePlatformSponsor ────────────────────────────────────────────────

	describe('DELETE /admin/sponsors/:sponsorId', () => {
		it('deletes the platform sponsor from DB', async () => {
			const sponsor = await createSponsor({ name: 'To Delete', scope: 'global', club: null });
			const { authorization } = await superAdminSession();

			const res = await requestJson(app, `/admin/sponsors/${sponsor._id.toString()}`, {
				method: 'DELETE',
				headers: { authorization },
			});

			// Accept 200 or 204 depending on implementation
			expect([200, 204]).toContain(res.status);
			await expect(Sponsor.exists({ _id: sponsor._id })).resolves.toBeNull();
		});

		it('returns 403 for a non-super-admin without deleting the sponsor', async () => {
			const sponsor = await createSponsor({ name: 'Safe Sponsor', scope: 'global', club: null });
			const user = await createUser({ role: ROLES.PLAYER });
			const { authorization } = await createSession(user);

			const res = await requestJson(app, `/admin/sponsors/${sponsor._id.toString()}`, {
				method: 'DELETE',
				headers: { authorization },
			});

			expect(res.status).toBe(403);
			await expect(Sponsor.exists({ _id: sponsor._id })).resolves.not.toBeNull();
		});
	});
});
