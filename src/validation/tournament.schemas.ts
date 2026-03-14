import { z } from 'zod';

const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
const isValidTime = (s: string) => timeRegex.test(s);

const playModeEnum = z.enum(['TieBreak10', '1set', '3setTieBreak10', '3set', '5set']);
const tournamentModeEnum = z.enum(['singleDay', 'period']);
const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid ID');
const nullableNonEmptyString = z.union([z.string().trim().min(1), z.null()]);

const roundTimingSchema = z.object({
	startDate: z.coerce.date().optional().nullable(),
	endDate: z.coerce.date().optional().nullable()
});

/** Relaxed schema for draft create/update. Allows partial fields. */
export const createOrUpdateDraftSchema = z
	.object({
		club: z.string().regex(objectIdRegex, 'Invalid club ID').optional(),
		sponsorId: z
			.string()
			.regex(objectIdRegex, 'Invalid sponsor ID')
			.optional()
			.nullable(),
		name: z.string().trim().min(1, 'Tournament name is required').optional(),
		logo: nullableNonEmptyString.optional(),
		date: z.coerce.date().optional().nullable(),
		startTime: z.union([z.string().trim().regex(timeRegex, 'Invalid start time (expected HH:mm)'), z.null()]).optional(),
		endTime: z.union([z.string().trim().regex(timeRegex, 'Invalid end time (expected HH:mm)'), z.null()]).optional(),
		playMode: playModeEnum.optional(),
		tournamentMode: tournamentModeEnum.optional(),
		externalFee: z.number().min(0).optional(),
		minMember: z.number().int().min(1).optional(),
		maxMember: z.number().int().min(1).optional(),
		playTime: nullableNonEmptyString.optional(),
		pauseTime: nullableNonEmptyString.optional(),
		courts: z.array(objectIdSchema).optional(),
		foodInfo: z.union([z.string().trim().min(1).max(500), z.null()]).optional(),
		descriptionInfo: z.union([z.string().trim().min(1).max(1000), z.null()]).optional(),
		numberOfRounds: z.number().int().min(1).optional(),
		roundTimings: z.array(roundTimingSchema).optional(),
		status: z.enum(['draft', 'active', 'inactive']).optional()
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
		sponsorId: z
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
		externalFee: z.number().min(0),
		minMember: z.number().int().min(1),
		maxMember: z.number().int().min(1),
		playTime: z.string().optional().nullable(),
		pauseTime: z.string().optional().nullable(),
		courts: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
		foodInfo: z.string().min(1).max(500),
		descriptionInfo: z.string().min(1).max(1000),
		numberOfRounds: z.number().int().min(1),
		roundTimings: z.array(roundTimingSchema).optional(),
		status: z.literal('active')
	})
	.refine((d) => d.maxMember >= d.minMember, {
		message: 'maxMember must be greater than or equal to minMember',
		path: ['maxMember']
	})
	.refine(
		(d) => {
			if (d.tournamentMode !== 'period') return true;
			const n = d.numberOfRounds ?? 0;
			const timings = d.roundTimings ?? [];
			return timings.length === n;
		},
		{ message: 'Please add timing for all rounds', path: ['roundTimings'] }
	)
	.refine(
		(d) => {
			if (d.tournamentMode !== 'period') return true;
			const timings = d.roundTimings;
			const isValidDate = (v: Date) =>
				!Number.isNaN(v.getTime());
			return timings?.every(
				(r) =>
					r.startDate != null &&
					r.endDate != null &&
					isValidDate(r.startDate) &&
					isValidDate(r.endDate)
			);
		},
		{
			message: 'Each round must have valid startDate and endDate when tournament mode is period',
			path: ['roundTimings']
		}
	)
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
			return d.playTime != null && d.playTime !== '';
		},
		{ message: 'Playing time is required', path: ['playTime'] }
	)
	.refine(
		(d) => {
			if (d.tournamentMode !== 'singleDay') return true;
			return d.pauseTime != null && d.pauseTime !== '';
		},
		{ message: 'Game pause time is required', path: ['pauseTime'] }
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



export const getTournamentQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
	status: z.enum(['active', 'inactive', 'draft']).optional(),
	clubId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid club ID').optional(),
	q: z.string().optional(),
	view: z.enum(['published', 'drafts']).optional()
});

export type GetTournamentQuery = z.infer<typeof getTournamentQuerySchema>;
export type CreateOrUpdateDraftInput = z.infer<typeof createOrUpdateDraftSchema>;
export type PublishInput = z.infer<typeof publishSchema>;
