import Tournament from '../../models/Tournament';
import tournamentRouter from '../tournament.routes';
import {
	createSession,
	createTournament,
	createUser,
	seedClubAdmin,
	setupMemoryMongo,
} from '../../testUtils/db';
import { buildJsonApp, requestJson } from '../../testUtils/integrationTestUtils';

setupMemoryMongo();

describe('tournament routes integration', () => {
	const app = buildJsonApp('/tournaments', tournamentRouter);

	it('lists active published tournaments for guests', async () => {
		const visible = await createTournament({ name: 'Public Open', status: 'active' });
		await createTournament({ name: 'Draft Hidden', status: 'draft' });

		const result = await requestJson(app, '/tournaments');

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			message: 'Tournaments listed successfully',
			pagination: expect.objectContaining({
				total: expect.any(Number),
				page: 1,
			}),
		});
		const ids = (result.body as { tournaments: Array<{ id: string }> }).tournaments.map((t) => t.id);
		expect(ids).toContain(visible._id.toString());
		expect(ids).not.toContain(
			(await Tournament.findOne({ name: 'Draft Hidden' }).lean().orFail())._id.toString(),
		);
	});

	it('returns organiser draft tournaments when authenticated with view=drafts', async () => {
		const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(admin);
		const draft = await createTournament({
			club: club._id,
			createdBy: admin._id,
			name: 'Organiser Draft',
			status: 'draft',
		});

		const result = await requestJson(app, '/tournaments?view=drafts', {
			headers: { authorization },
		});

		expect(result.status).toBe(200);
		const ids = (result.body as { tournaments: Array<{ id: string }> }).tournaments.map((t) => t.id);
		expect(ids).toContain(draft._id.toString());
	});

	it('routes score QR validation before tournament detail for unknown tokens', async () => {
		const tournament = await createTournament({ name: 'Route Order Check' });

		await expect(requestJson(app, `/tournaments/score-qr/not-a-valid-token`)).resolves.toMatchObject({
			status: 400,
			body: expect.objectContaining({
				error: true,
			}),
		});

		await expect(requestJson(app, `/tournaments/${tournament._id.toString()}/matches`)).resolves.toMatchObject({
			status: 200,
			body: expect.objectContaining({
				matches: expect.any(Array),
			}),
		});
	});

	it('blocks unauthenticated protected tournament mutations', async () => {
		const tournament = await createTournament();

		await expect(
			requestJson(app, `/tournaments/${tournament._id.toString()}/join`, { method: 'POST' }),
		).resolves.toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
	});

	it('blocks players from organiser tournament creation', async () => {
		const player = await createUser();
		const { authorization } = await createSession(player);

		await expect(
			requestJson(app, '/tournaments', {
				method: 'POST',
				headers: { authorization },
				body: { name: 'Blocked Tournament' },
			}),
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			},
		});
	});
});
