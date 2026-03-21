import { z } from 'zod';
import { createSponsorSchema, updateSponsorSchema } from '../../../../validation/sponsor.schemas';

export const createPlatformSponsorSchema = createSponsorSchema;
export const updatePlatformSponsorSchema = updateSponsorSchema;

export type CreatePlatformSponsorInput = z.infer<typeof createPlatformSponsorSchema>;
export type UpdatePlatformSponsorInput = z.infer<typeof updatePlatformSponsorSchema>;
