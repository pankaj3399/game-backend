import { mapCreatedSponsor } from '../createSponsor/mapper';
import { mapPublicSponsorListItem } from '../getAllSponsors/mapper';
import { mapClubSponsorItem, mapSponsorStatusSummary } from '../getClubSponsors/mapper';
import { mapUpdatedSponsor } from '../updateSponsor/mapper';

const objectId = (value: string) => ({
	toString: () => value,
});

describe('sponsor response mappers', () => {
	it('maps a created sponsor with nullable optional fields', () => {
		expect(
			mapCreatedSponsor({
				_id: objectId('sponsor-1'),
				name: 'Court Snacks',
				status: 'active',
			})
		).toEqual({
			id: 'sponsor-1',
			name: 'Court Snacks',
			description: null,
			logoUrl: null,
			link: null,
			status: 'active',
		});
	});

	it('maps public sponsor list items without exposing status', () => {
		expect(
			mapPublicSponsorListItem({
				_id: 'public-sponsor-1',
				name: 'Open Partner',
				description: 'Public description',
				logoUrl: '/logos/open.png',
				link: 'https://example.com/open',
			})
		).toEqual({
			id: 'public-sponsor-1',
			name: 'Open Partner',
			description: 'Public description',
			logoUrl: '/logos/open.png',
			link: 'https://example.com/open',
		});
	});

	it('preserves sponsor status for premium clubs', () => {
		expect(
			mapClubSponsorItem(
				{
					_id: objectId('club-sponsor-1'),
					name: 'Premium Partner',
					description: null,
					logoUrl: '/logos/premium.png',
					link: null,
					status: 'active',
				},
				true
			)
		).toEqual({
			id: 'club-sponsor-1',
			name: 'Premium Partner',
			description: null,
			logoUrl: '/logos/premium.png',
			link: null,
			status: 'active',
		});
	});

	it('forces club sponsor status to paused for free clubs', () => {
		expect(
			mapClubSponsorItem(
				{
					_id: objectId('club-sponsor-2'),
					name: 'Free Plan Partner',
					status: 'active',
				},
				false
			)
		).toEqual({
			id: 'club-sponsor-2',
			name: 'Free Plan Partner',
			description: null,
			logoUrl: null,
			link: null,
			status: 'paused',
		});
	});

	it('maps sponsor management permissions from club plan', () => {
		expect(mapSponsorStatusSummary('premium')).toEqual({
			plan: 'premium',
			canManageSponsors: true,
		});
		expect(mapSponsorStatusSummary('free')).toEqual({
			plan: 'free',
			canManageSponsors: false,
		});
	});

	it('maps updated sponsors without inventing a description field', () => {
		expect(
			mapUpdatedSponsor({
				_id: objectId('updated-sponsor-1'),
				name: 'Updated Partner',
				logoUrl: undefined,
				link: 'https://example.com/updated',
				status: 'paused',
			})
		).toEqual({
			id: 'updated-sponsor-1',
			name: 'Updated Partner',
			logoUrl: null,
			link: 'https://example.com/updated',
			status: 'paused',
		});
	});
});
