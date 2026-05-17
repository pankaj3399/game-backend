import { z } from 'zod';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const listClubsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).optional().default(DEFAULT_PAGE),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(MAX_LIMIT)
		.optional()
		.default(DEFAULT_LIMIT),
	q: z
		.string()
		.optional()
		.transform((value) => {
			const trimmed = value?.trim();
			return trimmed ? trimmed : undefined;
		}),
	clubScope: z.enum(['all', 'home', 'favorites']).optional().default('all'),
	/** Same km bands as tournament list (`findClubIdsForDistanceBand`). */
	distance: z.enum(['all', 'under50', 'between50And80']).optional().default('all')
});

export type ListClubsQuery = z.infer<typeof listClubsQuerySchema>;
