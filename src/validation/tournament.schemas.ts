import { z } from 'zod';
import { TOURNAMENT_MODES, TOURNAMENT_PLAY_MODES, TOURNAMENT_STATUSES } from '../types/domain/tournament';
import { objectId } from './base-helpers';
const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
const isValidTime = (s: string) => timeRegex.test(s);

const playModeEnum = z.enum(TOURNAMENT_PLAY_MODES);
const tournamentModeEnum = z.enum(TOURNAMENT_MODES);

const entryFeeSchema = z.coerce.number().min(0);
const memberCountSchema = z.coerce.number().int().min(1);
const totalRoundsSchema = z.coerce.number().int().min(1).max(100);
const durationMinutesSchema = z.coerce.number().int().min(5).max(240);
const breakMinutesSchema = z.coerce.number().int().min(0).max(120);

const nullableDurationMinutes = z.union([durationMinutesSchema, z.null()]);
const nullableBreakMinutes = z.union([breakMinutesSchema, z.null()]);

const draftFields = {
	club: objectId.optional(),
	status: z.enum(TOURNAMENT_STATUSES).optional(),
	sponsor: objectId.nullable().optional(),
	name: z.string().trim().min(1, 'Tournament name is required').optional(),
	date: z.coerce.date().optional().nullable(),
	startTime: z.union([z.string().trim().regex(timeRegex, 'Invalid start time (expected HH:mm)'), z.null()]).optional(),
	endTime: z.union([z.string().trim().regex(timeRegex, 'Invalid end time (expected HH:mm)'), z.null()]).optional(),
	playMode: playModeEnum.optional(),
	tournamentMode: tournamentModeEnum.optional(),
	entryFee: entryFeeSchema.optional(),
	minMember: memberCountSchema.optional(),
	maxMember: memberCountSchema.optional(),
	totalRounds: totalRoundsSchema.optional(),
	duration: nullableDurationMinutes.optional(),
	breakDuration: nullableBreakMinutes.optional(),
	foodInfo: z.string().max(500).optional().nullable(),
	descriptionInfo: z.string().max(1000).optional().nullable(),
} satisfies z.ZodRawShape;

const draftSchemaBase = z
	.object(draftFields)
	.strict()
	.refine((d) => !d.maxMember || !d.minMember || d.maxMember >= d.minMember, {
		message: 'maxMember must be greater than or equal to minMember',
		path: ['maxMember']
	})
	.refine(
		(d) => {
			if (!d.startTime || !d.endTime || !isValidTime(d.startTime) || !isValidTime(d.endTime)) return true;
			const toMin = (t: string) => {
				const [h, m] = t.split(':').map(Number);
				return h * 60 + m;
			};
			return toMin(d.startTime) < toMin(d.endTime);
		},
		{ message: 'Start time must be before end time', path: ['startTime'] }
	);

/** Strict schema for draft creation. */
export const createDraftSchema = draftSchemaBase.safeExtend({
	club: objectId,
	name: z.string().trim().min(1, 'Tournament name is required')
});

/** Lenient schema for draft update. Allows partial fields. */
export const updateDraftSchema = draftSchemaBase.refine((d) => Object.keys(d).length > 0, {
	message: 'At least one field must be provided for update'
});

const publishFields = {
	...draftFields,
	club: objectId,
	name: z.string().trim().min(1, 'Tournament name is required'),
	playMode: playModeEnum,
	tournamentMode: tournamentModeEnum,
	entryFee: entryFeeSchema,
	minMember: memberCountSchema,
	maxMember: memberCountSchema,
	totalRounds: totalRoundsSchema,
	status: z.literal('active'),
	duration: z
		.coerce
		.number()
		.int('Playing time must be a whole number of minutes')
		.min(5, 'Playing time must be at least 5 minutes')
		.max(240, 'Playing time must be at most 240 minutes'),
	breakDuration: z
		.coerce
		.number()
		.int('Game pause time must be a whole number of minutes')
		.min(0, 'Game pause time cannot be negative')
		.max(120, 'Game pause time must be at most 120 minutes'),
	startTime: z.string().trim().regex(timeRegex, 'Invalid start time (expected HH:mm)').optional().nullable(),
	endTime: z.string().trim().regex(timeRegex, 'Invalid end time (expected HH:mm)').optional().nullable()
} satisfies z.ZodRawShape;

/** Strict schema for publish. Requires all tournament-ready fields. */
export const publishSchema = z
	.object(publishFields)
	.strict()
	.refine((d) => d.maxMember >= d.minMember, {
		message: 'maxMember must be greater than or equal to minMember',
		path: ['maxMember']
	})
	.refine(
		(d) => {
			if (d.tournamentMode !== 'singleDay') return true;
			return d.date != null;
		},
		{ message: 'Tournament date is required', path: ['date'] }
	)
	.refine(
		(d) => {
			if (d.tournamentMode !== 'singleDay') return true;
			return d.startTime != null && d.startTime !== '' && isValidTime(d.startTime);
		},
		{ message: 'Invalid or missing tournament start time', path: ['startTime'] }
	)
	.refine(
		(d) => {
			if (d.tournamentMode !== 'singleDay') return true;
			return d.endTime != null && d.endTime !== '' && isValidTime(d.endTime);
		},
		{ message: 'Invalid or missing tournament end time', path: ['endTime'] }
	)
	.refine(
		(d) => {
			if (d.tournamentMode !== 'singleDay') return true;
			if (!d.startTime || !d.endTime || !isValidTime(d.startTime) || !isValidTime(d.endTime)) return true;
			const toMin = (t: string) => {
				const [h, m] = t.split(':').map(Number);
				return h * 60 + m;
			};
			return toMin(d.startTime) < toMin(d.endTime);
		},
		{ message: 'Start time must be before end time', path: ['startTime'] }
	);

/** Partial schema for publish request body. Validates and strips unknown fields. */
export const publishBodySchema = z
	.object(publishSchema.shape)
	.omit({ status: true, club: true })
	.partial()
	.strip();



export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type PublishInput = z.infer<typeof publishSchema>;
export type PublishBodyInput = z.infer<typeof publishBodySchema>;
