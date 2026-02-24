import { z } from 'zod';

/** Schema for POST /api/auth/complete-signup. Requires pendingToken from OAuth redirect. */
export const completeSignupSchema = z.object({
	pendingToken: z.string().min(1, 'Pending token is required'),
	alias: z.string().min(1, 'Alias is required').trim(),
	name: z.string().min(1, 'Name is required').trim(),
	dateOfBirth: z
		.union([z.string(), z.date(), z.null()])
		.optional()
		.nullable()
		.transform((val) => {
			if (val == null || val === '') return null;
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
