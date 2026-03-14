import mongoose from 'mongoose';
import { z } from 'zod';
import { publishBodySchema } from '../../../validation/tournament.schemas';
import type { PublishInput } from '../../../validation/tournament.schemas';

type DbObjectId = mongoose.Types.ObjectId;
export type DbIdLike = DbObjectId | string;

const dbIdLikeSchema = z.union([z.string(), z.instanceof(mongoose.Types.ObjectId)]);

export const tournamentPublishSourceSchema = z.object({
	_id: z.instanceof(mongoose.Types.ObjectId),
	club: dbIdLikeSchema.nullable(),
	status: z.enum(['active', 'draft', 'inactive']),
	name: z.string(),
	sponsorId: dbIdLikeSchema.optional().nullable(),
	logo: z.string().optional().nullable(),
	date: z.coerce.date().optional().nullable(),
	startTime: z.string().optional().nullable(),
	endTime: z.string().optional().nullable(),
	playMode: z.enum(['TieBreak10', '1set', '3setTieBreak10', '3set', '5set']).optional(),
	tournamentMode: z.enum(['singleDay', 'period']).optional(),
	externalFee: z.number().optional(),
	minMember: z.number().int().optional(),
	maxMember: z.number().int().optional(),
	playTime: z.string().optional().nullable(),
	pauseTime: z.string().optional().nullable(),
	courts: z.array(dbIdLikeSchema).optional(),
	foodInfo: z.string().optional().nullable(),
	descriptionInfo: z.string().optional().nullable(),
	numberOfRounds: z.number().int().optional(),
	roundTimings: z
		.array(
			z.object({
				startDate: z.coerce.date().optional().nullable(),
				endDate: z.coerce.date().optional().nullable()
			})
		)
		.optional()
});

export type TournamentPublishSource = z.infer<typeof tournamentPublishSourceSchema>;
export type PublishBodyInput = z.infer<typeof publishBodySchema>;

export type NormalizedTournamentPublishSource = {
	_id: mongoose.Types.ObjectId;
	club: DbIdLike | null;
	status: 'active' | 'draft' | 'inactive';
	name: string;
	sponsorId: DbIdLike | null;
	logo: string | null;
	date: Date | null;
	startTime: string | null;
	endTime: string | null;
	playMode: PublishInput['playMode'];
	tournamentMode: PublishInput['tournamentMode'];
	externalFee: number;
	minMember: number;
	maxMember: number;
	playTime: string | null;
	pauseTime: string | null;
	courts: DbIdLike[];
	foodInfo: string;
	descriptionInfo: string;
	numberOfRounds: number;
	roundTimings: NonNullable<TournamentPublishSource['roundTimings']>;
};

const DEFAULT_PLAY_MODE: PublishInput['playMode'] = 'TieBreak10';
const DEFAULT_TOURNAMENT_MODE: PublishInput['tournamentMode'] = 'singleDay';

export function normalizeTournamentPublishSource(
	source: Readonly<TournamentPublishSource>
): NormalizedTournamentPublishSource {
	return {
		_id: source._id,
		club: source.club,
		status: source.status,
		name: source.name,
		sponsorId: source.sponsorId ?? null,
		logo: source.logo ?? null,
		date: source.date ?? null,
		startTime: source.startTime ?? null,
		endTime: source.endTime ?? null,
		playMode: source.playMode ?? DEFAULT_PLAY_MODE,
		tournamentMode: source.tournamentMode ?? DEFAULT_TOURNAMENT_MODE,
		externalFee: source.externalFee ?? 0,
		minMember: source.minMember ?? 1,
		maxMember: source.maxMember ?? 1,
		playTime: source.playTime ?? null,
		pauseTime: source.pauseTime ?? null,
		courts: source.courts ?? [],
		foodInfo: source.foodInfo ?? '',
		descriptionInfo: source.descriptionInfo ?? '',
		numberOfRounds: source.numberOfRounds ?? 1,
		roundTimings: source.roundTimings ?? []
	};
}
