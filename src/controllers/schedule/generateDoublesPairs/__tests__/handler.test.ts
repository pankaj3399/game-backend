import { Types } from 'mongoose';
import { generateDoublesPairsFlow } from '../handler';
import type { TournamentScheduleContext } from '../../shared/types';

function participant(id: string, rating = 1500) {
	return {
		_id: new Types.ObjectId(id),
		name: `Player ${id.slice(-2)}`,
		alias: null,
		elo: { rating, rd: 200 },
	};
}

describe('generateDoublesPairsFlow', () => {
	const tournament: TournamentScheduleContext = {
		participants: [
			participant('507f1f77bcf86cd799439011', 1800),
			participant('507f1f77bcf86cd799439012', 1700),
			participant('507f1f77bcf86cd799439013', 1600),
			participant('507f1f77bcf86cd799439014', 1500),
		],
	} as TournamentScheduleContext;

	it('pairs four players into two teams sorted by rating', () => {
		const result = generateDoublesPairsFlow(
			tournament.participants.map((p) => p._id.toString()),
			tournament,
		);
		expect(result.teams).toHaveLength(2);
		expect(result.teams[0].players).toHaveLength(2);
		expect(result.unpaired).toHaveLength(0);
		expect(result.teams[0].players[0].rating).toBeGreaterThanOrEqual(
			result.teams[1].players[0].rating,
		);
	});

	it('returns unpaired list for odd participant count', () => {
		const three = tournament.participants.slice(0, 3);
		const result = generateDoublesPairsFlow(
			three.map((p) => p._id.toString()),
			{ participants: three } as TournamentScheduleContext,
		);
		expect(result.teams.length + result.unpaired.length).toBeGreaterThan(0);
		expect(result.unpaired.length).toBe(1);
	});
});
