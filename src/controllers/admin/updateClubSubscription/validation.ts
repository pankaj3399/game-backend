import { z } from 'zod';

const futureDate = z.coerce.date().refine((date) => date.getTime() > Date.now(), {
	message: 'Expiration date must be in the future',
});

export const updateClubSubscriptionSchema = z
	.object({
		plan: z.enum(['free', 'premium']).optional(),
		expiresAt: z.union([z.null(), futureDate]).optional(),
	})
	.superRefine((data, ctx) => {
		if (data.plan === 'premium' && (data.expiresAt === undefined || data.expiresAt === null)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Premium plan requires a future expiration date',
				path: ['expiresAt'],
			});
		}
	});

export type UpdateClubSubscriptionInput = z.infer<typeof updateClubSubscriptionSchema>;
