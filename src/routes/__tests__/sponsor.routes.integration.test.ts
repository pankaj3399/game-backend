import { Types } from 'mongoose';
import Sponsor from '../../models/Sponsor';
import Tournament from '../../models/Tournament';
import sponsorRouter from '../sponsor.routes';
import {
	createSession,
	createSponsor,
	createTournament,
	createUser,
	seedClubAdmin,
	setupMemoryMongo,
} from '../../testUtils/db';
import { buildJsonApp, requestJson } from '../../testUtils/integrationTestUtils';

setupMemoryMongo();

describe('sponsor routes integration', () => {
	const app = buildJsonApp('/sponsors', sponsorRouter);

	it('keeps the public sponsor list open and returns only active global sponsors', async () => {
		const first = await createSponsor({
			name: 'Global Partner',
			description: null,
			logoUrl: '/a.png',
			link: 'https://a.example',
			scope: 'global',
			club: null,
		});
		const second = await createSponsor({
			name: 'Second Partner',
			scope: 'global',
			club: null,
		});
		await createSponsor({
			name: 'Paused Partner',
			scope: 'global',
			club: null,
			status: 'paused',
		});

		const res = await requestJson(app, '/sponsors');
		expect(res.status).toBe(200);
		expect(res.body.sponsors).toHaveLength(2);
		expect(res.body.sponsors).toEqual(
			expect.arrayContaining([
				{
					id: first._id.toString(),
					name: 'Global Partner',
					description: null,
					logoUrl: '/a.png',
					link: 'https://a.example',
				},
				{
					id: second._id.toString(),
					name: 'Second Partner',
					description: null,
					logoUrl: null,
					link: null,
				},
			]),
		);
	});

	it('requires auth for club sponsor management', async () => {
		const { club } = await seedClubAdmin();

		await expect(requestJson(app, `/sponsors/clubs/${club._id.toString()}`)).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('returns club sponsors with subscription capabilities', async () => {
		const { user, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(user);
		const sponsor = await createSponsor({
			club: club._id,
			name: 'Club Partner',
			description: 'Visible in club',
			logoUrl: '/club.png',
		});

		await expect(
			requestJson(app, `/sponsors/clubs/${club._id.toString()}`, {
				headers: { authorization },
			})
		).resolves.toEqual({
			status: 200,
			body: {
				sponsors: [
					{
						id: sponsor._id.toString(),
						name: 'Club Partner',
						description: 'Visible in club',
						logoUrl: '/club.png',
						link: null,
						status: 'active',
					},
				],
				subscription: {
					plan: 'premium',
					canManageSponsors: true,
				},
			},
		});
	});

	it('blocks sponsor creation for users who cannot manage the club without changing the DB', async () => {
		const { club } = await seedClubAdmin({ plan: 'premium' });
		const outsider = await createUser();
		const { authorization } = await createSession(outsider);
		const before = await Sponsor.countDocuments();

		await expect(
			requestJson(app, `/sponsors/clubs/${club._id.toString()}`, {
				method: 'POST',
				headers: { authorization },
				body: { name: 'Blocked Partner' },
			})
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'You do not have permission to manage this club',
				error: true,
			},
		});
		await expect(Sponsor.countDocuments()).resolves.toBe(before);
	});

	it('creates sponsors for premium clubs through the real controller flow', async () => {
		const { user, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(user);

		const response = await requestJson(app, `/sponsors/clubs/${club._id.toString()}`, {
			method: 'POST',
			headers: { authorization },
			body: {
				name: ' Created Partner ',
				description: '  Sponsor text  ',
				link: 'https://created.example',
			},
		});

		expect(response.status).toBe(201);
		expect(response.body).toMatchObject({
			name: 'Created Partner',
			description: 'Sponsor text',
			logoUrl: null,
			link: 'https://created.example',
			status: 'active',
		});

		const created = await Sponsor.findOne({ club: club._id, name: 'Created Partner' }).lean().orFail();
		expect(created.scope).toBe('club');
		expect(created.status).toBe('active');
	});

	it('prevents free clubs from activating sponsors on update without changing the sponsor', async () => {
		const { user, club } = await seedClubAdmin({ plan: 'free' });
		const { authorization } = await createSession(user);
		const sponsor = await createSponsor({
			club: club._id,
			name: 'Paused Partner',
			status: 'paused',
		});

		await expect(
			requestJson(app, `/sponsors/clubs/${club._id.toString()}/${sponsor._id.toString()}`, {
				method: 'PATCH',
				headers: { authorization },
				body: { status: 'active' },
			})
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'Cannot activate sponsors on a free plan. Upgrade to premium.',
				error: true,
			},
		});

		const unchanged = await Sponsor.findById(sponsor._id).lean().orFail();
		expect(unchanged.status).toBe('paused');
	});

	it('updates sponsor fields through the real controller flow', async () => {
		const { user, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(user);
		const sponsor = await createSponsor({
			club: club._id,
			name: 'Old Partner',
			status: 'active',
		});

		await expect(
			requestJson(app, `/sponsors/clubs/${club._id.toString()}/${sponsor._id.toString()}`, {
				method: 'PATCH',
				headers: { authorization },
				body: {
					name: ' Updated Partner ',
					logoUrl: '',
					status: 'paused',
				},
			})
		).resolves.toEqual({
			status: 200,
			body: {
				id: sponsor._id.toString(),
				name: 'Updated Partner',
				logoUrl: null,
				link: null,
				status: 'paused',
			},
		});

		const updated = await Sponsor.findById(sponsor._id).lean().orFail();
		expect(updated.name).toBe('Updated Partner');
		expect(updated.logoUrl).toBeNull();
		expect(updated.status).toBe('paused');
	});

	it('deletes a club sponsor and clears tournament references', async () => {
		const { user, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(user);
		const sponsor = await createSponsor({ club: club._id, name: 'Delete Me' });
		const tournament = await createTournament({
			club: club._id,
			createdBy: user._id,
			name: `Tournament ${new Types.ObjectId().toString()}`,
		});
		tournament.sponsor = sponsor._id;
		await tournament.save();

		await expect(
			requestJson(app, `/sponsors/clubs/${club._id.toString()}/${sponsor._id.toString()}`, {
				method: 'DELETE',
				headers: { authorization },
			})
		).resolves.toEqual({
			status: 204,
			body: null,
		});

		await expect(Sponsor.exists({ _id: sponsor._id })).resolves.toBeNull();
		const refreshedTournament = await Tournament.findById(tournament._id).lean().exec();
		expect(refreshedTournament?.sponsor).toBeNull();
	});
});
