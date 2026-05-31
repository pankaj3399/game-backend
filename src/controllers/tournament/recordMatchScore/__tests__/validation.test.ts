import { recordMatchScoreParamsSchema, recordMatchScoreSchema } from '../validation';

const TOURNAMENT_ID = '507f1f77bcf86cd799439011';
const MATCH_ID = '507f1f77bcf86cd799439012';

describe('recordMatchScoreParamsSchema', () => {
	it('requires valid object ids', () => {
		expect(
			recordMatchScoreParamsSchema.safeParse({ id: TOURNAMENT_ID, matchId: MATCH_ID }).success,
		).toBe(true);
		expect(recordMatchScoreParamsSchema.safeParse({ id: 'bad', matchId: MATCH_ID }).success).toBe(
			false,
		);
		expect(
			recordMatchScoreParamsSchema.safeParse({ id: TOURNAMENT_ID, matchId: 'bad' }).success,
		).toBe(false);
	});
});

describe('recordMatchScoreSchema', () => {
	it('accepts valid score rows', () => {
		expect(
			recordMatchScoreSchema.safeParse({
				playerOneScores: [6, 4],
				playerTwoScores: [4, 6],
			}).success,
		).toBe(true);
	});

	it('rejects walkover on both sides', () => {
		const result = recordMatchScoreSchema.safeParse({
			playerOneScores: ['wo'],
			playerTwoScores: ['wo'],
		});
		expect(result.success).toBe(false);
	});
});
