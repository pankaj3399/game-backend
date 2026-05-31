import { buildProfileUpdatePayload } from '../payload';

describe('buildProfileUpdatePayload', () => {
	it('includes only provided fields', () => {
		expect(buildProfileUpdatePayload({ alias: 'ace', name: 'Alice' })).toEqual({
			alias: 'ace',
			name: 'Alice',
		});
	});

	it('omits undefined optional fields', () => {
		expect(buildProfileUpdatePayload({})).toEqual({});
	});
});
