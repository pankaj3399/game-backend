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
			if (val === undefined) return undefined;
			if (val === null) return null;
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
		.transform((val) => {
			if (val === undefined) return undefined;
			if (val === '' || val === null) return null;
			return val;
		}),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Schema for POST /api/user/favorite-clubs - add club to favorites. */
export const addFavoriteClubSchema = z.object({
	clubId: z.string().min(1, 'Club ID is required'),
});

/** Schema for PATCH /api/user/home-club - set home club. */
export const setHomeClubSchema = z.object({
	clubId: z.string().min(1, 'Club ID is required'),
});
