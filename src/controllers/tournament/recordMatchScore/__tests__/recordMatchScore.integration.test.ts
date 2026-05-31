import Game from '../../../../models/Game';
import Schedule from '../../../../models/Schedule';
import Tournament from '../../../../models/Tournament';
import {
	createGame,
	createSchedule,
	createTournament,
	createUser,
	setupMemoryMongo,
} from '../../../../testUtils/db';
import { recordTournamentMatchScoreFlow } from '../handler';

setupMemoryMongo();

describe('recordTournamentMatchScoreFlow() integration', () => {
	it('commits a completed score to the real game document', async () => {
		const playerOne = await createUser();
		const playerTwo = await createUser();
		const tournament = await createTournament({
			participants: [playerOne._id, playerTwo._id],
			totalRounds: 2,
		});
		const game = await createGame({
			tournament: tournament._id,
			side1Players: [playerOne._id],
			side2Players: [playerTwo._id],
			status: 'active',
		});
		const { schedule } = await createSchedule(tournament._id, game._id, { currentRound: 1 });
		await Tournament.updateOne({ _id: tournament._id }, { $set: { schedule: schedule._id } });
		await Game.updateOne({ _id: game._id }, { $set: { schedule: schedule._id } });

		const result = await recordTournamentMatchScoreFlow(
			tournament._id.toString(),
			game._id.toString(),
			{ playerOneScores: [10], playerTwoScores: [4] },
			{ actor: 'organiser', organiserGraceExpired: false, tournamentCompleted: false }
		);

		expect(result).toMatchObject({
			matchId: game._id.toString(),
			tournamentId: tournament._id.toString(),
			matchStatus: 'completed',
			tournamentCompleted: false,
		});
		const persistedGame = await Game.findById(game._id).lean().orFail();
		expect(persistedGame.status).toBe('finished');
		expect(persistedGame.score).toEqual({
			playerOneScores: [10],
			playerTwoScores: [4],
		});
		expect(persistedGame.endTime).toBeInstanceOf(Date);
	});

	it('marks the final scheduled round and tournament complete when all relevant games are finished', async () => {
		const playerOne = await createUser();
		const playerTwo = await createUser();
		const tournament = await createTournament({
			participants: [playerOne._id, playerTwo._id],
			totalRounds: 1,
		});
		const game = await createGame({
			tournament: tournament._id,
			side1Players: [playerOne._id],
			side2Players: [playerTwo._id],
		});
		const { schedule } = await createSchedule(tournament._id, game._id, { currentRound: 1 });
		await Tournament.updateOne({ _id: tournament._id }, { $set: { schedule: schedule._id } });
		await Game.updateOne({ _id: game._id }, { $set: { schedule: schedule._id } });

		const result = await recordTournamentMatchScoreFlow(
			tournament._id.toString(),
			game._id.toString(),
			{ playerOneScores: [10], playerTwoScores: [2] },
			{ actor: 'organiser', organiserGraceExpired: false, tournamentCompleted: false }
		);

		expect(result.tournamentCompleted).toBe(true);
		await expect(Schedule.findById(schedule._id).lean().orFail()).resolves.toMatchObject({ status: 'finished' });
		const persistedTournament = await Tournament.findById(tournament._id).lean().orFail();
		expect(persistedTournament.completedAt).toBeInstanceOf(Date);
	});
});
