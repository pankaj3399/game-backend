import { mapUpdateProfileResponse } from '../mapper';

describe('mapUpdateProfileResponse()', () => {
	it('returns the stable success message for profile updates', () => {
		expect(mapUpdateProfileResponse()).toEqual({
			message: 'Profile updated successfully',
		});
	});
});
