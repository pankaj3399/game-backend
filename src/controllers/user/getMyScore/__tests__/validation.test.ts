import { myScoreQuerySchema } from '../validation';

describe('myScoreQuerySchema', () => {
	it('applies defaults for mode, range, page, and limit', () => {
		const result = myScoreQuerySchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({
				mode: 'all',
				range: 'last30Days',
				page: 1,
				limit: 10,
			});
		}
	});

	it('rejects limit above maximum', () => {
		expect(myScoreQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
	});
});
