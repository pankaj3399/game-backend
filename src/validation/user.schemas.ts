import {z} from 'zod';
/** Schema for PATCH /api/auth/me - update profile (authenticated users only). */
export const updateProfileSchema = z.object({
	alias: z.string().trim().optional(),
	name: z.string().trim().optional(),
	dateOfBirth: z
		.union([
			z.string().refine((s) => !Number.isNaN(new Date(s).getTime()) && s.length >= 10, { message: 'Invalid date format' }),
			z.date(),
			z.null()
		])
		.optional()
		.nullable()
		.transform((val) => {
			if (val == null) return null;
			if (typeof val === 'string') {
				const d = new Date(val);
				if (Number.isNaN(d.getTime())) throw new Error('Invalid date value');
				return d;
			}
			return val;
		}),
	gender: z
		.union([z.enum(['male', 'female', 'other']), z.literal(''), z.null()])
		.optional()
		.transform((val) => (val === '' || val == null ? null : val)),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
