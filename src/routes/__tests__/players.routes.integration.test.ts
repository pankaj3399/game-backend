import playersRouter from '../players.routes';
import {
	createGame,
	createSession,
	createTournament,
	createUser,
	setupMemoryMongo,
} from '../../testUtils/db';
import { buildJsonApp, requestJson } from '../../testUtils/integrationTestUtils';

setupMemoryMongo();

describe('players routes integration', () => {
	const app = buildJsonApp('/players', playersRouter);

	it('returns public score history for a player with completed matches', async () => {
		const player = await createUser({ name: 'Public Player', alias: 'PP' });
		const opponent = await createUser({ name: 'Opponent', alias: 'OPP' });
		const tournament = await createTournament({
			participants: [player._id, opponent._id],
			status: 'active',
		});
		const game = await createGame({
			tournament: tournament._id,
			side1Players: [player._id],
			side2Players: [opponent._id],
			status: 'finished',
			playMode: 'TieBreak10',
		});
		game.score = { playerOneScores: [10], playerTwoScores: [7] };
		game.endTime = new Date();
		game.playedAt = new Date();
		await game.save();

		const result = await requestJson(app, `/players/${player._id.toString()}/score`);

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			player: {
				id: player._id.toString(),
				displayName: expect.any(String),
			},
			summary: expect.objectContaining({
				totalMatches: 1,
				glicko2: expect.objectContaining({
					rating: expect.any(Number),
					rd: expect.any(Number),
				}),
			}),
			entries: [
				expect.objectContaining({
					didWin: true,
					myScore: 10,
					opponentScore: 7,
					status: 'finished',
				}),
			],
			pagination: expect.objectContaining({
				page: 1,
				limit: expect.any(Number),
				total: 1,
			}),
		});
	});

	it('returns 400 for an invalid user id without requiring auth', async () => {
		await expect(requestJson(app, '/players/not-an-object-id/score')).resolves.toEqual({
			status: 400,
			body: { message: 'Invalid user ID', error: true },
		});
	});

	it('returns 404 when the user does not exist', async () => {
		await expect(requestJson(app, '/players/64f0f0f0f0f0f0f0f0f0f0f0/score')).resolves.toEqual({
			status: 404,
			body: { message: 'User not found', error: true },
		});
	});

	it('does not require authentication', async () => {
		const player = await createUser();
		const { authorization } = await createSession(player);

		const guestResult = await requestJson(app, `/players/${player._id.toString()}/score`);
		const authedResult = await requestJson(app, `/players/${player._id.toString()}/score`, {
			headers: { authorization },
		});

		expect(guestResult.status).toBe(200);
		expect(authedResult.status).toBe(200);
	});
});
