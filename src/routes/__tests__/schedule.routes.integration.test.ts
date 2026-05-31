import Game from '../../models/Game';
import Schedule from '../../models/Schedule';
import Tournament from '../../models/Tournament';
import scheduleRouter from '../schedule.routes';
import {
	createCourt,
	createSession,
	createTournament,
	createUser,
	seedClubAdmin,
	setupMemoryMongo,
} from '../../testUtils/db';
import { buildJsonApp, requestJson } from '../../testUtils/integrationTestUtils';

setupMemoryMongo();

describe('schedule routes integration', () => {
	const app = buildJsonApp('/schedule', scheduleRouter);

	it('requires an organiser-level session before running schedule generation', async () => {
		const player = await createUser();
		const { authorization } = await createSession(player);
		const before = await Schedule.countDocuments();

		await expect(
			requestJson(app, '/schedule/64f0f0f0f0f0f0f0f0f0f0f0', {
				method: 'POST',
				headers: { authorization },
				body: {},
			})
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			},
		});
		await expect(Schedule.countDocuments()).resolves.toBe(before);
	});

	it('generates a singles round through the real HTTP route and persists schedule, games, and tournament state', async () => {
		const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(admin);
		const court = await createCourt(club._id, { name: 'Center Court' });
		const first = await createUser({ name: 'First Player', alias: 'P1' });
		const second = await createUser({ name: 'Second Player', alias: 'P2' });
		const tournament = await createTournament({
			club: club._id,
			createdBy: admin._id,
			participants: [first._id, second._id],
			minMember: 2,
			totalRounds: 2,
		});

		const result = await requestJson(app, `/schedule/${tournament._id.toString()}`, {
			method: 'POST',
			headers: { authorization },
			body: {
				round: 1,
				mode: 'singles',
				matchDurationMinutes: 45,
				breakTimeMinutes: 10,
				matchesPerPlayer: 1,
				startTime: '09:30',
				courtIds: [court._id.toString()],
				participantOrder: [first._id.toString(), second._id.toString()],
			},
		});

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			message: 'Schedule generated',
			schedule: {
				id: expect.any(String),
				round: 1,
				currentRound: 1,
				generatedMatches: 1,
			},
		});

		const schedule = await Schedule.findOne({ tournament: tournament._id }).lean().orFail();
		expect(schedule).toMatchObject({
			currentRound: 1,
			status: 'active',
			matchesPerPlayer: 1,
			matchDurationMinutes: 45,
			breakTimeMinutes: 10,
		});
		expect(schedule.rounds).toHaveLength(1);
		expect(schedule.rounds[0]).toMatchObject({ round: 1, slot: 1, mode: 'singles' });

		const game = await Game.findById(schedule.rounds[0].game).lean().orFail();
		expect(game).toMatchObject({
			tournament: tournament._id,
			schedule: schedule._id,
			court: court._id,
			status: 'draft',
			matchType: 'singles',
			gameMode: 'tournament',
		});
		expect(game.side1.players.map((id) => id.toString())).toEqual([first._id.toString()]);
		expect(game.side2.players.map((id) => id.toString())).toEqual([second._id.toString()]);
		expect(game.startTime).toBeInstanceOf(Date);

		const updatedTournament = await Tournament.findById(tournament._id).lean().orFail();
		expect(updatedTournament.schedule?.toString()).toBe(schedule._id.toString());
		expect(updatedTournament.firstRoundScheduledAt).toBeInstanceOf(Date);
		expect(updatedTournament.duration).toBe(45);
		expect(updatedTournament.breakDuration).toBe(10);
	});

	it('rejects invalid courts without creating games or advancing the schedule', async () => {
		const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(admin);
		const first = await createUser();
		const second = await createUser();
		const tournament = await createTournament({
			club: club._id,
			createdBy: admin._id,
			participants: [first._id, second._id],
			minMember: 2,
		});
		const beforeGames = await Game.countDocuments();

		const result = await requestJson(app, `/schedule/${tournament._id.toString()}`, {
			method: 'POST',
			headers: { authorization },
			body: {
				round: 1,
				mode: 'singles',
				matchDurationMinutes: 45,
				breakTimeMinutes: 10,
				startTime: '09:30',
				courtIds: [tournament._id.toString()],
				participantOrder: [first._id.toString(), second._id.toString()],
			},
		});

		expect(result.status).toBe(400);
		expect(result.body).toEqual({
			message: `Invalid courtIds provided: ${tournament._id.toString()}`,
			error: true,
		});
		await expect(Game.countDocuments()).resolves.toBe(beforeGames);
		const schedule = await Schedule.findOne({ tournament: tournament._id }).lean().orFail();
		expect(schedule.currentRound).toBe(0);
		expect(schedule.rounds).toHaveLength(0);
	});

	it('generates doubles pairs for a tournament through the real HTTP route', async () => {
		const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(admin);
		const first = await createUser({ name: 'First', alias: 'P1' });
		const second = await createUser({ name: 'Second', alias: 'P2' });
		const third = await createUser({ name: 'Third', alias: 'P3' });
		const fourth = await createUser({ name: 'Fourth', alias: 'P4' });
		const tournament = await createTournament({
			club: club._id,
			createdBy: admin._id,
			participants: [first._id, second._id, third._id, fourth._id],
			minMember: 4,
			maxMember: 8,
		});

		const result = await requestJson(app, `/schedule/${tournament._id.toString()}/pairs`, {
			method: 'POST',
			headers: { authorization },
			body: {
				participantOrder: [
					first._id.toString(),
					second._id.toString(),
					third._id.toString(),
					fourth._id.toString(),
				],
			},
		});

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			teams: expect.arrayContaining([
				expect.objectContaining({
					team: expect.any(Number),
					players: expect.arrayContaining([
						expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
					]),
				}),
			]),
			unpaired: expect.any(Array),
		});
		expect((result.body as { teams: unknown[] }).teams.length).toBeGreaterThan(0);
	});

	it('cancels a generated round and removes linked schedule entries without deleting the tournament', async () => {
		const { user: admin, club } = await seedClubAdmin({ plan: 'premium' });
		const { authorization } = await createSession(admin);
		const court = await createCourt(club._id, { name: 'Court 1' });
		const first = await createUser();
		const second = await createUser();
		const tournament = await createTournament({
			club: club._id,
			createdBy: admin._id,
			participants: [first._id, second._id],
			minMember: 2,
			totalRounds: 2,
		});

		const generated = await requestJson(app, `/schedule/${tournament._id.toString()}`, {
			method: 'POST',
			headers: { authorization },
			body: {
				round: 1,
				mode: 'singles',
				matchDurationMinutes: 45,
				breakTimeMinutes: 10,
				matchesPerPlayer: 1,
				startTime: '09:30',
				courtIds: [court._id.toString()],
				participantOrder: [first._id.toString(), second._id.toString()],
			},
		});
		expect(generated.status).toBe(200);

		const scheduleBefore = await Schedule.findOne({ tournament: tournament._id }).lean().orFail();
		const gameId = scheduleBefore.rounds[0]?.game;
		expect(gameId).toBeDefined();

		const cancelled = await requestJson(
			app,
			`/schedule/${tournament._id.toString()}/round/1`,
			{
				method: 'DELETE',
				headers: { authorization },
			},
		);
		expect(cancelled.status).toBe(200);
		expect(cancelled.body).toEqual({
			message: 'Round 1 schedule cancelled',
			round: 1,
		});

		const scheduleAfter = await Schedule.findOne({ tournament: tournament._id }).lean().orFail();
		expect(scheduleAfter.rounds).toHaveLength(0);
		expect(scheduleAfter.currentRound).toBe(0);
		expect(scheduleAfter.status).toBe('draft');

		const game = await Game.findById(gameId).lean().orFail();
		expect(game.schedule).toBeUndefined();
		expect(game.status).toBe('cancelled');
		expect(game.isHistorical).toBe(true);
	});
});
