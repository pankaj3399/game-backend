import mongoose from 'mongoose';
import type { TournamentScheduleContext } from '../../shared/types';
import { mapScheduleViewResponse } from '../mapper';

const id = () => new mongoose.Types.ObjectId();

function buildTournamentContext(): TournamentScheduleContext {
	const lowRatedId = id();
	const highRatedId = id();
	const fallbackNameId = id();

	return {
		_id: id(),
		name: 'Friday Ladder',
		minMember: 2,
		firstRoundScheduledAt: null,
		tournamentMode: 'singleDay',
		date: new Date('2025-02-01T00:00:00.000Z'),
		startTime: '18:00',
		endTime: '22:00',
		timezone: 'UTC',
		duration: 45,
		breakDuration: 10,
		totalRounds: 4,
		playMode: '1set',
		createdBy: id(),
		club: {
			_id: id(),
			courts: [
				{ _id: id(), name: 'Court 1' },
				{ _id: id(), name: 'Court 2' },
				{ _id: id(), name: 'Court 3' },
			],
		},
		participants: [
			{
				_id: lowRatedId,
				name: 'Beta Player',
				alias: null,
				profilePictureUrl: null,
				elo: { rating: 1400, rd: 210 },
			},
			{
				_id: fallbackNameId,
				name: '   ',
				alias: null,
				profilePictureUrl: '/players/fallback.png',
				elo: { rating: null, rd: null },
			},
			{
				_id: highRatedId,
				name: 'Alpha Player',
				alias: '  Ace  ',
				profilePictureUrl: '/players/ace.png',
				elo: { rating: 1650, rd: 120 },
			},
		],
		schedule: null,
	};
}

describe('mapScheduleViewResponse()', () => {
	it('maps schedule defaults, court selection, participant ranking, and display names', () => {
		const tournament = buildTournamentContext();
		const result = mapScheduleViewResponse(
			tournament,
			{ currentRound: 2, totalRounds: 4 },
			{ matchesPerPlayer: 3, startTime: '19:30' }
		);

		expect(result.tournament).toEqual({
			id: tournament._id.toString(),
			name: 'Friday Ladder',
		});
		expect(result.scheduleSummary).toEqual({ currentRound: 2, totalRounds: 4 });
		expect(result.scheduleInput).toEqual({
			matchesPerPlayer: 3,
			startTime: '19:30',
			mode: 'singles',
			matchDurationMinutes: 45,
			breakTimeMinutes: 10,
			availableCourts: [
				{ id: tournament.club?.courts[0]._id.toString(), name: 'Court 1', selected: true },
				{ id: tournament.club?.courts[1]._id.toString(), name: 'Court 2', selected: true },
				{ id: tournament.club?.courts[2]._id.toString(), name: 'Court 3', selected: false },
			],
		});
		expect(result.participants.map((participant) => participant.name)).toEqual([
			'Ace',
			'Player 2',
			'Beta Player',
		]);
		expect(result.participants.map((participant) => participant.rating)).toEqual([1650, 1500, 1400]);
		expect(result.participants.map((participant) => participant.rd)).toEqual([120, 200, 210]);
		expect(result.participants.map((participant) => participant.order)).toEqual([1, 2, 3]);
	});
});
