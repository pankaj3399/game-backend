import { z } from 'zod';
import { TOURNAMENT_MODES, TOURNAMENT_PLAY_MODES, TOURNAMENT_STATUSES } from '../types/domain/tournament';

const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
const isValidTime = (s: string) => timeRegex.test(s);

const playModeEnum = z.enum(TOURNAMENT_PLAY_MODES);
const tournamentModeEnum = z.enum(TOURNAMENT_MODES);
const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid ID');
const nullableNonEmptyString = z.union([z.string().trim().min(1), z.null()]);

const roundTimingSchema = z
	.object({
		startDate: z.coerce.date().optional().nullable(),
		endDate: z.coerce.date().optional().nullable()
	})
	.refine(
		(r) => {
			if (r.startDate == null || r.endDate == null) return true;
			return r.startDate.getTime() <= r.endDate.getTime();
		},
		{ message: 'startDate must be before or equal to endDate', path: ['endDate'] }
	);

/** Relaxed schema for draft create/update. Allows partial fields. */
export const createOrUpdateDraftSchema = z
	.object({
		club: z.string().regex(objectIdRegex, 'Invalid club ID').optional(),
		sponsor: z
			.string()
			.regex(objectIdRegex, 'Invalid sponsor ID')
			.optional(),
		name: z.string().trim().min(1, 'Tournament name is required').optional(),
		logo: nullableNonEmptyString.optional(),
		date: z.coerce.date().optional().nullable(),
		startTime: z.union([z.string().trim().regex(timeRegex, 'Invalid start time (expected HH:mm)'), z.null()]).optional(),
		endTime: z.union([z.string().trim().regex(timeRegex, 'Invalid end time (expected HH:mm)'), z.null()]).optional(),
		playMode: playModeEnum.optional(),
		tournamentMode: tournamentModeEnum.optional(),
		entryFee: z.number().min(0).optional(),
		minMember: z.number().int().min(1).optional(),
		maxMember: z.number().int().min(1).optional(),
		duration: nullableNonEmptyString.optional(),
		breakDuration: nullableNonEmptyString.optional(),
		courts: z.array(objectIdSchema).optional(),
		foodInfo: z.string().max(500).optional().nullable(),
		descriptionInfo: z.string().max(1000).optional().nullable(),
		numberOfRounds: z.number().int().min(1).optional(),
		roundTimings: z.array(roundTimingSchema).optional(),
		status: z.enum(TOURNAMENT_STATUSES).optional()
	})
	.strict()
	.refine((d) => Object.keys(d).length > 0, {
		message: 'At least one field must be provided for update'
	})
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

/** Strict schema for draft create. Requires mandatory fields for new drafts. */
export const createDraftSchema = createOrUpdateDraftSchema.safeExtend({
	club: z.string().min(1, 'Club is required').regex(/^[0-9a-fA-F]{24}$/, 'Invalid club ID'),
	name: z.string().trim().min(1, 'Tournament name is required')
});

/** Strict schema for publish. Requires all tournament-ready fields. */
export const publishSchema = z
	.object({
		club: z.string().min(1, 'Club is required').regex(/^[0-9a-fA-F]{24}$/, 'Invalid club ID'),
		sponsor: z
			.string()
			.regex(/^[0-9a-fA-F]{24}$/, 'Invalid sponsor ID')
			.optional()
			.nullable(),
		name: z.string().trim().min(1, 'Tournament name is required'),
		logo: z.string().optional().nullable(),
		date: z.coerce.date().optional().nullable(),
		startTime: z.string().optional().nullable(),
		endTime: z.string().optional().nullable(),
		playMode: playModeEnum,
		tournamentMode: tournamentModeEnum,
		entryFee: z.number().min(0),
		minMember: z.number().int().min(1),
		maxMember: z.number().int().min(1),
		duration: z.string().optional().nullable(),
		breakDuration: z.string().optional().nullable(),
		courts: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
		foodInfo: z.string().max(500).optional().nullable(),
		descriptionInfo: z.string().max(1000).optional().nullable(),
		status: z.literal('active')
	})
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
	)
	.refine(
		(d) => {
			if (d.tournamentMode !== 'singleDay') return true;
			return d.duration != null && d.duration !== '';
		},
		{ message: 'Playing time is required', path: ['duration'] }
	)
	.refine(
		(d) => {
			if (d.tournamentMode !== 'singleDay') return true;
			return d.breakDuration != null && d.breakDuration !== '';
		},
		{ message: 'Game pause time is required', path: ['breakDuration'] }
	)
	.refine(
		(d) => {
			if (d.tournamentMode !== 'singleDay') return true;
			const courts = d.courts ?? [];
			return courts.length > 0;
		},
		{ message: 'At least one court is required', path: ['courts'] }
	);

/** Partial schema for publish request body. Validates and strips unknown fields. */
export const publishBodySchema = z
	.object(publishSchema.shape)
	.omit({ club: true, status: true })
	.partial()
	.strip();



export type CreateOrUpdateDraftInput = z.infer<typeof createOrUpdateDraftSchema>;
export type PublishInput = z.infer<typeof publishSchema>;
export type PublishBodyInput = z.infer<typeof publishBodySchema>;
