import { mapGenerateScheduleResponse } from '../mapper';

describe('mapGenerateScheduleResponse()', () => {
	it('returns the generated schedule summary used by the API', () => {
		expect(mapGenerateScheduleResponse({ toString: () => 'schedule-1' }, 3, 2, 12)).toEqual({
			message: 'Schedule generated',
			schedule: {
				id: 'schedule-1',
				round: 3,
				currentRound: 2,
				generatedMatches: 12,
			},
		});
	});
});
