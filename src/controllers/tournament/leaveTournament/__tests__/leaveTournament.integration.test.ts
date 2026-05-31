import Game from '../../../../models/Game';
import Tournament from '../../../../models/Tournament';
import { createGame, createTournament, createUser, setupMemoryMongo } from '../../../../testUtils/db';
import { leaveTournamentFlow } from '../handler';

setupMemoryMongo();

describe('leaveTournamentFlow() integration', () => {
	it('removes the participant and finishes unfinished matches as walkovers when confirmed', async () => {
		const leaving = await createUser();
		const opponent = await createUser();
		const tournament = await createTournament({
			participants: [leaving._id, opponent._id],
			maxMember: 8,
		});
		const game = await createGame({
			tournament: tournament._id,
			side1Players: [leaving._id],
			side2Players: [opponent._id],
			status: 'active',
		});

		const result = await leaveTournamentFlow(tournament._id.toString(), leaving, {
			confirmLeaveWithWalkover: true,
		});

		expect(result.ok).toBe(true);
		const persistedTournament = await Tournament.findById(tournament._id).lean().orFail();
		expect(persistedTournament.participants.map((id) => id.toString())).toEqual([opponent._id.toString()]);

		const persistedGame = await Game.findById(game._id).lean().orFail();
		expect(persistedGame.status).toBe('finished');
		expect(persistedGame.score).toEqual({
			playerOneScores: ['wo'],
			playerTwoScores: [null],
		});
		expect(persistedGame.endTime).toBeInstanceOf(Date);
		expect(persistedGame.playedAt).toBeInstanceOf(Date);
	});

	it('requires confirmation before converting unfinished matches to walkovers', async () => {
		const leaving = await createUser();
		const opponent = await createUser();
		const tournament = await createTournament({
			participants: [leaving._id, opponent._id],
		});
		await createGame({
			tournament: tournament._id,
			side1Players: [leaving._id],
			side2Players: [opponent._id],
			status: 'active',
		});

		const result = await leaveTournamentFlow(tournament._id.toString(), leaving);

		expect(result).toMatchObject({ ok: false, status: 400, message: 'LEAVE_CONFIRM_WO_REQUIRED' });
		const persistedTournament = await Tournament.findById(tournament._id).lean().orFail();
		expect(persistedTournament.participants.map((id) => id.toString()).sort()).toEqual(
			[leaving._id.toString(), opponent._id.toString()].sort()
		);
	});

	it('rolls back the participant removal when match finalization fails inside the transaction', async () => {
		const leaving = await createUser();
		const opponent = await createUser();
		const tournament = await createTournament({
			participants: [leaving._id, opponent._id],
		});
		const game = await createGame({
			tournament: tournament._id,
			side1Players: [leaving._id],
			side2Players: [opponent._id],
			status: 'active',
		});
		const updateSpy = jest.spyOn(Game, 'updateOne').mockReturnValueOnce({
			exec: jest.fn().mockResolvedValue({ matchedCount: 0 }),
		} as never);

		try {
			const result = await leaveTournamentFlow(tournament._id.toString(), leaving, {
				confirmLeaveWithWalkover: true,
			});

			expect(result).toMatchObject({ ok: false, status: 409 });
			const persistedTournament = await Tournament.findById(tournament._id).lean().orFail();
			expect(persistedTournament.participants.map((id) => id.toString()).sort()).toEqual(
				[leaving._id.toString(), opponent._id.toString()].sort()
			);
			await expect(Game.findById(game._id).lean().orFail()).resolves.toMatchObject({ status: 'active' });
		} finally {
			updateSpy.mockRestore();
		}
	});
});
