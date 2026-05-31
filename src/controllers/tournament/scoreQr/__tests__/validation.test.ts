import {
	activeScoreQrQuerySchema,
	confirmScoreQrBodySchema,
	generateIndependentScoreQrBodySchema,
	generateScoreQrBodySchema,
	updateScoreQrScoresBodySchema,
} from '../validation';

describe('score QR score array schemas', () => {
	it('accepts matching score arrays', () => {
		expect(
			generateScoreQrBodySchema.safeParse({
				playerOneScores: [6, 4],
				playerTwoScores: [4, 6],
			}).success,
		).toBe(true);
	});

	it('rejects mismatched array lengths', () => {
		const result = generateScoreQrBodySchema.safeParse({
			playerOneScores: [6],
			playerTwoScores: [4, 6],
		});
		expect(result.success).toBe(false);
	});

	it('rejects walkover on both sides in the same set', () => {
		const result = updateScoreQrScoresBodySchema.safeParse({
			playerOneScores: ['wo'],
			playerTwoScores: ['wo'],
		});
		expect(result.success).toBe(false);
	});

	it('rejects numeric opponent score when other side is walkover', () => {
		const result = generateScoreQrBodySchema.safeParse({
			playerOneScores: ['wo'],
			playerTwoScores: [4],
		});
		expect(result.success).toBe(false);
	});

	it('allows walkover with null opponent score', () => {
		const result = generateScoreQrBodySchema.safeParse({
			playerOneScores: ['wo'],
			playerTwoScores: [null],
		});
		expect(result.success).toBe(true);
	});
});

describe('score QR auxiliary schemas', () => {
	it('validates confirm token body', () => {
		expect(confirmScoreQrBodySchema.safeParse({ token: 'abc' }).success).toBe(true);
		expect(confirmScoreQrBodySchema.safeParse({ token: '' }).success).toBe(false);
	});

	it('validates active session query', () => {
		expect(
			activeScoreQrQuerySchema.safeParse({ flow: 'tournament', tournamentId: 't1' }).success,
		).toBe(true);
	});

	it('extends independent QR body with optional match metadata', () => {
		expect(
			generateIndependentScoreQrBodySchema.safeParse({
				playerOneScores: [6],
				playerTwoScores: [4],
				independentMatchType: 'singles',
			}).success,
		).toBe(true);
	});
});
