import { mapPlatformSponsor } from '../mapper';

describe('mapPlatformSponsor()', () => {
	it('maps platform sponsor documents to API response shape', () => {
		expect(
			mapPlatformSponsor({
				_id: { toString: () => 'platform-sponsor-1' },
				name: 'Platform Partner',
				description: 'Visible across the platform',
				logoUrl: '/logos/platform.png',
				link: 'https://example.com/platform',
				status: 'active',
			})
		).toEqual({
			id: 'platform-sponsor-1',
			name: 'Platform Partner',
			description: 'Visible across the platform',
			logoUrl: '/logos/platform.png',
			link: 'https://example.com/platform',
			status: 'active',
		});
	});

	it('normalizes missing optional values to null', () => {
		expect(
			mapPlatformSponsor({
				_id: 'platform-sponsor-2',
				name: 'Sparse Platform Partner',
				status: 'paused',
			})
		).toEqual({
			id: 'platform-sponsor-2',
			name: 'Sparse Platform Partner',
			description: null,
			logoUrl: null,
			link: null,
			status: 'paused',
		});
	});
});
