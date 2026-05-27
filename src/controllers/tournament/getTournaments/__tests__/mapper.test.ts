import mongoose from 'mongoose';
import type { TournamentListDoc } from '../../../../types/api/tournament';
import { mapTournamentListItems } from '../mapper';

describe('mapTournamentListItems()', () => {
	it('maps list items with club, sponsor, nullable logo, and tournament timezone date', () => {
		const tournamentId = new mongoose.Types.ObjectId();
		const clubId = new mongoose.Types.ObjectId();
		const sponsorId = new mongoose.Types.ObjectId();

		const result = mapTournamentListItems([
			{
				_id: tournamentId,
				name: 'Evening Open',
				logoUrl: undefined,
				club: {
					_id: clubId,
					name: 'Central Club',
					logoUrl: undefined,
				},
				date: new Date('2025-03-01T23:30:00.000Z'),
				timezone: 'Asia/Kolkata',
				status: 'active',
				sponsor: {
					_id: sponsorId,
					name: 'String Partner',
					logoUrl: '/logos/string.png',
					link: 'https://example.com/string',
				},
			} as TournamentListDoc,
		]);

		expect(result).toEqual([
			{
				id: tournamentId,
				name: 'Evening Open',
				logoUrl: null,
				club: {
					id: clubId,
					name: 'Central Club',
					logoUrl: null,
				},
				date: '2025-03-02',
				status: 'active',
				sponsor: {
					id: sponsorId.toString(),
					name: 'String Partner',
					logoUrl: '/logos/string.png',
					link: 'https://example.com/string',
				},
			},
		]);
	});

	it('maps tournaments without club, date, or sponsor as null values', () => {
		const tournamentId = new mongoose.Types.ObjectId();

		expect(
			mapTournamentListItems([
				{
					_id: tournamentId,
					name: 'Draft Without Relations',
					logoUrl: '/logos/tournament.png',
					club: null,
					status: 'draft',
					sponsor: null,
				} as TournamentListDoc,
			])
		).toEqual([
			{
				id: tournamentId,
				name: 'Draft Without Relations',
				logoUrl: '/logos/tournament.png',
				club: null,
				date: null,
				status: 'draft',
				sponsor: null,
			},
		]);
	});
});
