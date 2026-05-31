import { Router } from 'express';
import { ROLES } from '../../../../constants/roles';
import optionalAuthenticate from '../../../../middlewares/optionalAuthenticate';
import Tournament from '../../../../models/Tournament';
import {
	createCourt,
	createGame,
	createSchedule,
	createSession,
	createSponsor,
	createTournament,
	createUser,
	seedClubAdmin,
	setupMemoryMongo,
} from '../../../../testUtils/db';
import { buildJsonApp, requestJson } from '../../../../testUtils/integrationTestUtils';
import { getTournamentById } from '../index';

setupMemoryMongo();

function buildApp() {
	const router = Router();
	router.get('/:id', optionalAuthenticate, getTournamentById);
	return buildJsonApp('/tournaments', router);
}

describe('GET tournament by id integration', () => {
	const app = buildApp();

	it('returns 400 for invalid route ids without changing persisted tournaments', async () => {
		const before = await Tournament.countDocuments();

		await expect(requestJson(app, '/tournaments/not-an-object-id')).resolves.toEqual({
			status: 400,
			body: { message: 'Invalid tournament ID', error: true },
		});
		await expect(Tournament.countDocuments()).resolves.toBe(before);
	});

	it('returns 404 when the tournament does not exist', async () => {
		await expect(requestJson(app, '/tournaments/64f0f0f0f0f0f0f0f0f0f0f0')).resolves.toEqual({
			status: 404,
			body: { message: 'Tournament not found', error: true },
		});
	});

	it('returns public tournament details for guests with club sponsor proof', async () => {
		const participant = await createUser({ name: 'Player One', alias: 'P1' });
		const tournament = await createTournament({
			name: 'City Open',
			participants: [participant._id],
			status: 'active',
			maxMember: 8,
			totalRounds: 3,
		});
		await createCourt(tournament.club, { name: 'Court 1' });
		const clubSponsor = await createSponsor({
			club: tournament.club,
			name: 'Local Sponsor',
			logoUrl: null,
			link: null,
		});

		const result = await requestJson(app, `/tournaments/${tournament._id.toString()}`);

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			tournament: expect.objectContaining({
				id: tournament._id.toString(),
				name: 'City Open',
				club: expect.objectContaining({
					id: tournament.club.toString(),
				}),
				courts: [expect.objectContaining({ name: 'Court 1' })],
				clubSponsors: [
					{
						id: clubSponsor._id.toString(),
						name: 'Local Sponsor',
						logoUrl: null,
						link: null,
					},
				],
				permissions: {
					canEdit: false,
					canJoin: true,
					canLeave: false,
					isParticipant: false,
				},
			}),
		});
	});

	it('blocks guests from draft tournament details', async () => {
		const tournament = await createTournament({ status: 'draft' });

		await expect(requestJson(app, `/tournaments/${tournament._id.toString()}`)).resolves.toEqual({
			status: 403,
			body: { message: 'You do not have permission to view this tournament', error: true },
		});
	});

	it('returns draft details to club admins without granting creator-only edit permissions', async () => {
		const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
		const creator = await createUser();
		const { authorization } = await createSession(admin);
		const tournament = await createTournament({
			club: club._id,
			createdBy: creator._id,
			status: 'draft',
		});

		const result = await requestJson(app, `/tournaments/${tournament._id.toString()}`, {
			headers: { authorization },
		});

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			tournament: expect.objectContaining({
				id: tournament._id.toString(),
				status: 'draft',
				permissions: {
					canEdit: false,
					canJoin: false,
					canLeave: false,
					isParticipant: false,
				},
			}),
		});
	});

	it('marks creator edit permissions and participant leave permissions from DB state', async () => {
		const creator = await createUser({ role: ROLES.PLAYER });
		const opponent = await createUser();
		const { authorization } = await createSession(creator);
		const tournament = await createTournament({
			createdBy: creator._id,
			participants: [creator._id, opponent._id],
			status: 'active',
		});
		const pendingGame = await createGame({
			tournament: tournament._id,
			side1Players: [creator._id],
			side2Players: [opponent._id],
			status: 'pendingScore',
		});
		const { schedule } = await createSchedule(tournament._id, pendingGame._id);
		pendingGame.schedule = schedule._id;
		await pendingGame.save();
		tournament.schedule = schedule._id;
		await tournament.save();

		const result = await requestJson(app, `/tournaments/${tournament._id.toString()}`, {
			headers: { authorization },
		});

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			tournament: expect.objectContaining({
				permissions: {
					canEdit: true,
					canJoin: false,
					canLeave: true,
					isParticipant: true,
				},
			}),
		});
	});
});
