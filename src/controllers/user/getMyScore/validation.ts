import { z } from 'zod';

export const myScoreFilterModeSchema = z.enum(['all', 'singles', 'doubles']);
export const myScoreDateRangeSchema = z.enum(['last30Days', 'allTime']);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export const myScoreQuerySchema = z.object({
	mode: myScoreFilterModeSchema.optional().default('all'),
	range: myScoreDateRangeSchema.optional().default('last30Days'),
	page: z.coerce.number().int().min(1).optional().default(DEFAULT_PAGE),
	limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
});

export type MyScoreQuery = z.infer<typeof myScoreQuerySchema>;
