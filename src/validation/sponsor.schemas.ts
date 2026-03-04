import { z } from 'zod';

const optionalUrl = z
	.union([z.string().url(), z.literal('')])
	.optional()
	.nullable()
	.transform((v) => (v === '' ? null : v));

export const createSponsorSchema = z.object({
	name: z.string().trim().min(1, 'Name is required'),
	logoUrl: optionalUrl,
	link: optionalUrl
});

export const updateSponsorSchema = z.object({
	name: z.string().trim().min(1).optional(),
	logoUrl: optionalUrl,
	link: optionalUrl,
	status: z.enum(['active', 'paused']).optional()
});

export type CreateSponsorInput = z.infer<typeof createSponsorSchema>;
export type UpdateSponsorInput = z.infer<typeof updateSponsorSchema>;
