import { z } from 'zod';

export const searchClubsQuerySchema = z.object({
	q: z
		.union([z.string(), z.array(z.string())])
		.optional()
		.transform((value) => {
			if (Array.isArray(value)) {
				return (value[0] ?? '').trim();
			}
			return (value ?? '').trim();
		})
});

export type SearchClubsQuery = z.infer<typeof searchClubsQuerySchema>;
