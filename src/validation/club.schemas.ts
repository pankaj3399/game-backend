import { z } from 'zod';

const courtTypeEnum = z.enum([
	'concrete',
	'clay',
	'hard',
	'grass',
	'carpet',
	'other'
]);
const courtPlacementEnum = z.enum(['indoor', 'outdoor']);

const courtSchema = z.object({
	name: z.string().min(1, 'Court name is required'),
	type: courtTypeEnum.default('concrete'),
	placement: courtPlacementEnum.default('outdoor')
});

const coordinatesSchema = z
	.tuple([z.number(), z.number()])
	.refine(
		([lon, lat]) =>
			lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90,
		{ message: 'Coordinates must be [longitude, latitude] within valid ranges' }
	);

export const createClubSchema = z.object({
	name: z.string().trim().min(1, 'Club name is required'),
	website: z.string().trim().optional().nullable(),
	bookingSystemUrl: z.string().trim().optional().nullable(),
	address: z.string().trim().min(1, 'Address is required'),
	coordinates: coordinatesSchema,
	courts: z.array(courtSchema).optional().default([])
});

export const updateClubSchema = z.object({
	name: z.string().trim().min(1).optional(),
	website: z.string().trim().optional().nullable(),
	bookingSystemUrl: z.string().trim().optional().nullable(),
	address: z.string().trim().min(1).optional(),
	coordinates: coordinatesSchema.optional(),
	courts: z
		.array(
			courtSchema.extend({
				id: z.string().optional()
			})
		)
		.optional()
});

export const addClubStaffSchema = z.object({
	userId: z.string().min(1, 'userId is required'),
	role: z.enum(['admin', 'organiser'])
});

export type CreateClubInput = z.infer<typeof createClubSchema>;
export type UpdateClubInput = z.infer<typeof updateClubSchema>;
export type AddClubStaffInput = z.infer<typeof addClubStaffSchema>;
