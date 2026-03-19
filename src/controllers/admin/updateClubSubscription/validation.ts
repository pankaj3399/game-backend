import { z } from 'zod';

export const updateClubSubscriptionSchema = z.object({
	plan: z.enum(['free', 'premium']).optional(),
	expiresAt: z.coerce.date().refine((date) => (date.getTime() > Date.now()), { message: 'Expiration date must be in the future' })
});

export type UpdateClubSubscriptionInput = z.infer<typeof updateClubSubscriptionSchema>;
