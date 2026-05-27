import mongoose from 'mongoose';
import Game from '../../../../models/Game';
import Tournament from '../../../../models/Tournament';
import type { TournamentPopulated } from '../../../../types/api/tournament';
import { fetchTournamentById } from '../fetchTournamentById';

jest.mock('../../../../models/Tournament', () => ({
	__esModule: true,
	default: {
		findById: jest.fn(),
	},
}));

jest.mock('../../../../models/Game', () => ({
	__esModule: true,
	default: {
		exists: jest.fn(),
	},
}));

const mockTournamentFindById = jest.mocked(Tournament.findById);
const mockGameExists = jest.mocked(Game.exists);

function tournamentQuery(value: TournamentPopulated | null) {
	const query = {
		populate: jest.fn(),
		lean: jest.fn(),
		exec: jest.fn<Promise<TournamentPopulated | null>, []>().mockResolvedValue(value),
	};
	query.populate.mockReturnValue(query);
	query.lean.mockReturnValue(query);
	return query;
}

function gameExistsQuery(value: unknown) {
	const query = {
		lean: jest.fn(),
		exec: jest.fn<Promise<unknown>, []>().mockResolvedValue(value),
	};
	query.lean.mockReturnValue(query);
	return query;
}

function makeTournament(participantId = new mongoose.Types.ObjectId()): TournamentPopulated {
	return {
		_id: new mongoose.Types.ObjectId(),
		participants: [{ _id: participantId }],
	} as unknown as TournamentPopulated;
}

describe('fetchTournamentById()', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns null when the tournament does not exist', async () => {
		mockTournamentFindById.mockReturnValue(tournamentQuery(null) as unknown as ReturnType<typeof Tournament.findById>);

		await expect(fetchTournamentById('missing-id')).resolves.toBeNull();

		expect(mockGameExists).not.toHaveBeenCalled();
	});

	it('loads the standard tournament populate graph', async () => {
		const tournament = makeTournament();
		mockTournamentFindById.mockReturnValue(
			tournamentQuery(tournament) as unknown as ReturnType<typeof Tournament.findById>
		);

		await expect(fetchTournamentById('tournament-1')).resolves.toBe(tournament);

		const query = mockTournamentFindById.mock.results[0].value as ReturnType<typeof tournamentQuery>;
		expect(query.populate).toHaveBeenCalledWith({
			path: 'club',
			select: 'name address logoUrl',
			populate: {
				path: 'courts',
				select: 'name type placement',
			},
		});
		expect(query.populate).toHaveBeenCalledWith({
			path: 'schedule',
			select: 'currentRound rounds.round',
		});
		expect(query.populate).toHaveBeenCalledWith('sponsor', 'name logoUrl link');
		expect(query.populate).toHaveBeenCalledWith('participants', 'name alias profilePictureUrl');
		expect(mockGameExists).not.toHaveBeenCalled();
	});

	it('does not compute leave blockers when the requester is not a participant', async () => {
		const tournament = makeTournament(new mongoose.Types.ObjectId());
		mockTournamentFindById.mockReturnValue(
			tournamentQuery(tournament) as unknown as ReturnType<typeof Tournament.findById>
		);

		const result = await fetchTournamentById('tournament-2', {
			participantIdForLeaveChecks: new mongoose.Types.ObjectId().toString(),
		});

		expect(result).toBe(tournament);
		expect(result?.leaveBlockers).toBeUndefined();
		expect(mockGameExists).not.toHaveBeenCalled();
	});

	it('computes leave blockers for participating users', async () => {
		const participantId = new mongoose.Types.ObjectId();
		const tournament = makeTournament(participantId);
		mockTournamentFindById.mockReturnValue(
			tournamentQuery(tournament) as unknown as ReturnType<typeof Tournament.findById>
		);
		mockGameExists
			.mockReturnValueOnce(gameExistsQuery({ _id: new mongoose.Types.ObjectId() }) as unknown as ReturnType<typeof Game.exists>)
			.mockReturnValueOnce(gameExistsQuery(null) as unknown as ReturnType<typeof Game.exists>);

		const result = await fetchTournamentById('tournament-3', {
			participantIdForLeaveChecks: ` ${participantId.toString()} `,
		});

		expect(result?.leaveBlockers).toEqual({
			hasPendingScoreMatches: true,
			hasUnfinishedMatches: false,
		});
		expect(mockGameExists).toHaveBeenNthCalledWith(1, {
			tournament: 'tournament-3',
			status: 'pendingScore',
			$or: [{ 'side1.players': participantId.toString() }, { 'side2.players': participantId.toString() }],
		});
		expect(mockGameExists).toHaveBeenNthCalledWith(2, {
			tournament: 'tournament-3',
			status: { $nin: ['finished', 'cancelled', 'pendingScore'] },
			$or: [{ 'side1.players': participantId.toString() }, { 'side2.players': participantId.toString() }],
		});
	});
});
