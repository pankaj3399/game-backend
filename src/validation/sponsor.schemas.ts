import { z } from 'zod';
import { SPONSOR_STATUSES } from '../types/domain/sponsor';

const optionalText = z
	.string()
	.trim()
	.optional()
	.nullable()
	.transform((v) => {
		if (v === undefined) return undefined;
		if (v === null) return null;
		if (v === '') return null;
		return v;
	});

const optionalUrl = z
	.union([z.url(), z.literal('')])
	.optional()
	.nullable()
	.transform((v) => (v === '' ? null : v));

export const createSponsorSchema = z.object({
	name: z.string().trim().min(1, 'Name is required'),
	description: z.string().trim().max(500).optional().nullable(),
	logoUrl: optionalText,
	link: optionalUrl
});

export const updateSponsorSchema = z.object({
	name: z.string().trim().min(1).optional(),
	description: z.string().trim().max(500).optional().nullable(),
	logoUrl: optionalText,
	link: optionalUrl,
	status: z.enum(SPONSOR_STATUSES).optional()
});

export type CreateSponsorInput = z.infer<typeof createSponsorSchema>;
export type UpdateSponsorInput = z.infer<typeof updateSponsorSchema>;
