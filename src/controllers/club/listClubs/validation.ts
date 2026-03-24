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
		.transform((value) => value?.trim())
		.refine((value) => value === undefined || value.length > 0, {
			message: 'q must not be empty'
		})
});

export type ListClubsQuery = z.infer<typeof listClubsQuerySchema>;
