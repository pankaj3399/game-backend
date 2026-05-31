import * as shared from '../index';

describe('shared index exports', () => {
	it('re-exports guard and relation helpers', () => {
		expect(typeof shared.guardObjectId).toBe('function');
		expect(typeof shared.checkClubExists).toBe('function');
		expect(typeof shared.parseRouteObjectId).toBe('function');
	});
});
