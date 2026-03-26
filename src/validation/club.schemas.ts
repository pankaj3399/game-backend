import { refine, optional, z } from 'zod';
import { objectId } from './base-helpers';

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
	name: z.string().trim().min(1, 'Court name is required'),
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

const noDuplicateCourts = (courts: Array<{ name: string }>) => {
	const seen = new Set<string>();
	for (const c of courts) {
		const key = c.name.trim().toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
	}
	return true;
};

export const createClubSchema = z
	.object({
		name: z.string().trim().min(1, 'Club name is required'),
		website: z.string().trim().optional().nullable(),
		bookingSystemUrl: z.string().trim().optional().nullable(),
		address: z.string().trim().min(1, 'Address is required'),
		coordinates: coordinatesSchema,
		courts: z.array(courtSchema).optional().default([])
	})
	.refine((data) => noDuplicateCourts(data.courts ?? []), {
		message: 'Duplicate courts are not allowed. Two courts cannot have the same name.',
		path: ['courts']
	});

export const updateClubSchema = z
	.object({
		name: z.string().trim().min(1).optional(),
		website: z.string().trim().optional().nullable(),
		bookingSystemUrl: z.string().trim().optional().nullable(),
		address: z.string().trim().min(1).optional(),
		coordinates: coordinatesSchema.optional(),
		courts: z
		.array(
			courtSchema.extend({
				id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid court id').optional()
			})
		)
			.optional()
	})
	.refine(
		(data) => !data.courts || noDuplicateCourts(data.courts),
		{
			message: 'Duplicate courts are not allowed. Two courts cannot have the same name.',
			path: ['courts']
		}
	);

export const clubStaffRoleSchema = z.enum(['admin', 'organiser']);

export const addClubStaffSchema = z.object({
	userId: objectId,
	role: clubStaffRoleSchema
});

export const updateClubStaffRoleSchema = z.object({
	role: clubStaffRoleSchema
});

export const setClubMainAdminSchema = z.object({
	userId: objectId
});

export type CreateClubInput = z.infer<typeof createClubSchema>;
export type UpdateClubInput = z.infer<typeof updateClubSchema>;
export type AddClubStaffInput = z.infer<typeof addClubStaffSchema>;
export type UpdateClubStaffRoleInput = z.infer<typeof updateClubStaffRoleSchema>;
export type SetClubMainAdminInput = z.infer<typeof setClubMainAdminSchema>;
