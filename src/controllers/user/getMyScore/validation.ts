import { z } from 'zod';

export const myScoreFilterModeSchema = z.enum(['all', 'singles', 'doubles']);
export const myScoreDateRangeSchema = z.enum(['last30Days', 'allTime']);

export const myScoreQuerySchema = z.object({
	mode: myScoreFilterModeSchema.optional().default('all'),
	range: myScoreDateRangeSchema.optional().default('last30Days'),
});

export type MyScoreQuery = z.infer<typeof myScoreQuerySchema>;
