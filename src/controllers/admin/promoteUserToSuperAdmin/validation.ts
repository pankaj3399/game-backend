import { z } from 'zod';

export const promoteUserToSuperAdminSchema = z.object({
	username: z.string().trim().min(1, 'Username is required'),
	password: z.string().trim().min(1, 'Password is required')
});

export type PromoteUserToSuperAdminInput = z.infer<typeof promoteUserToSuperAdminSchema>;
