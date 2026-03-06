import { z } from 'zod';

/** Schema for POST /api/auth/complete-signup. Requires pendingToken from OAuth redirect. */
export const completeSignupSchema = z.object({
	pendingToken: z.string().min(1, { error: 'Pending token is required' }),
	alias: z.string().min(1, { error: 'Alias is required' }).trim(),
	name: z.string().min(1, { error: 'Name is required' }).trim(),
	email: z.string().email({ message: 'Valid email is required' }).trim().optional(),
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

export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;

