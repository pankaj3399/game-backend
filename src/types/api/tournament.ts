
import mongoose from "mongoose";
import { z } from "zod";
import type { DbIdLike } from "../domain/common";
import {
  TOURNAMENT_MODES,
  TOURNAMENT_PLAY_MODES,
  TOURNAMENT_STATUSES,
  type TournamentStatus,
} from "../domain/tournament";
import type {
  PublishBodyInput,
  PublishInput,
} from "../../validation/tournament.schemas";

import type { ITournament } from "../../models/Tournament";

export interface PopulatedClub {
	_id: mongoose.Types.ObjectId;
	name: string;
  address?: string | null;
}

export interface PopulatedSponsor {
	_id: mongoose.Types.ObjectId;
	name: string;
	logoUrl?: string | null;
	link?: string | null;
}

export interface TournamentListDoc {
	_id: mongoose.Types.ObjectId;
	name: string;
	club: PopulatedClub | null;
	date?: Date;
	status: TournamentStatus;
	sponsorId?: PopulatedSponsor | null;
}

export interface TournamentForUpdateAuth {
  club: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  status: TournamentStatus;
  minMember: number;
  maxMember: number;
}

export type TournamentPopulated = Omit<
	ITournament,
	'club' | 'sponsor' | 'courts' | 'participants'
> & {
  club?: {
    _id: mongoose.Types.ObjectId;
    name?: string;
    address?: string | null;
  } | null;
	sponsor?: {
		_id: mongoose.Types.ObjectId;
		name?: string;
		logoUrl?: string | null;
		link?: string | null;
	} | null;
	courts?: Array<{
		_id: mongoose.Types.ObjectId;
		name?: string;
		type?: string;
		placement?: string;
	}>;
	participants?: Array<{
		_id?: mongoose.Types.ObjectId | string;
		name?: string | null;
		alias?: string | null;
	}>;
};



const dbIdLikeSchema = z.union([
  z.instanceof(mongoose.Types.ObjectId),
  z.string().regex(/^[0-9a-fA-F]{24}$/),
]);

/**
 * Source data shape read from DB before publish normalization.
 * Allows missing/nullable optional fields so defaults can be applied.
 */
export const tournamentPublishSourceSchema = z
  .object({
    _id: z.instanceof(mongoose.Types.ObjectId),
    club: dbIdLikeSchema.nullable(),
    createdBy: dbIdLikeSchema,
    status: z.enum(TOURNAMENT_STATUSES),
    name: z.string(),
    sponsor: dbIdLikeSchema.optional().nullable(),
    date: z.coerce.date().optional().nullable(),
    startTime: z.string().optional().nullable(),
    endTime: z.string().optional().nullable(),
    playMode: z.enum(TOURNAMENT_PLAY_MODES).optional(),
    tournamentMode: z.enum(TOURNAMENT_MODES).optional(),
    entryFee: z.number().optional(),
    minMember: z.number().int().min(1),
    maxMember: z.number().int().min(1),
    duration: z.string().optional(),
    breakDuration: z.string().optional(),
    courts: z.array(dbIdLikeSchema).optional(),
    foodInfo: z.string().optional(),
    descriptionInfo: z.string().optional(),
  })
  .strict();

export type TournamentPublishSource = z.infer<typeof tournamentPublishSourceSchema>;

export type NormalizedTournamentPublishSource = {
  _id: mongoose.Types.ObjectId;
  club: DbIdLike | null;
  createdBy: DbIdLike;
  status: (typeof TOURNAMENT_STATUSES)[number];
  name: string;
  sponsor: DbIdLike | null;
  date: Date | null;
  startTime?: string | null;
  endTime?: string | null;
  playMode: PublishInput["playMode"];
  tournamentMode: PublishInput["tournamentMode"];
  entryFee?: number;
  minMember: number;
  maxMember: number;
  duration?: string;
  breakDuration?: string;
  courts: DbIdLike[];
  foodInfo: string;
  descriptionInfo: string;
};

const DEFAULT_PLAY_MODE: PublishInput["playMode"] = "TieBreak10";
const DEFAULT_TOURNAMENT_MODE: PublishInput["tournamentMode"] = "singleDay";

export function normalizeTournamentPublishSource(
  source: Readonly<TournamentPublishSource>
): NormalizedTournamentPublishSource {
  return {
    _id: source._id,
    club: source.club,
    createdBy: source.createdBy,
    status: source.status,
    name: source.name,
    sponsor: source.sponsor ?? null,
    date: source.date ?? null,
    startTime: source.startTime,
    endTime: source.endTime,
    playMode: source.playMode ?? DEFAULT_PLAY_MODE,
    tournamentMode: source.tournamentMode ?? DEFAULT_TOURNAMENT_MODE,
    entryFee: source.entryFee,
    minMember: source.minMember ,
    maxMember: source.maxMember,
    duration: source.duration,
    breakDuration: source.breakDuration,
    courts: source.courts ?? [],
    foodInfo: source.foodInfo ?? "",
    descriptionInfo: source.descriptionInfo ?? "",
  };
}

export type { PublishBodyInput };
