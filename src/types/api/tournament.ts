
import mongoose from "mongoose";
import { z } from "zod";
import type { DbIdLike } from "../domain/common";
import type { SchedulePopulatedLean } from "../domain/tournamentSchedule";
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

export interface PopulatedCourt {
  _id: mongoose.Types.ObjectId;
  name?: string;
  type?: string;
  placement?: string;
}

export interface PopulatedClub {
	_id: mongoose.Types.ObjectId;
	name: string;
  address?: string | null;
  courts?: PopulatedCourt[];
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
  _id?: mongoose.Types.ObjectId;
  club: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  status: TournamentStatus;
  sponsor?: mongoose.Types.ObjectId | null;
  name?: string;
  minMember?: number;
  maxMember?: number;
  totalRounds?: number;
  participants?: mongoose.Types.ObjectId[];
  participantCount?: number;
  date?: Date | null;
  startTime?: string | null;
  endTime?: string | null;
  playMode?: (typeof TOURNAMENT_PLAY_MODES)[number];
  tournamentMode?: (typeof TOURNAMENT_MODES)[number];
  entryFee?: number;
  duration?: number | null;
  breakDuration?: number | null;
  foodInfo?: string | null;
  descriptionInfo?: string | null;
}

export type TournamentPopulated = Omit<
	ITournament,
  'club' | 'sponsor' | 'participants' | 'schedule'
> & {
  club?: {
    _id: mongoose.Types.ObjectId;
    name?: string;
    address?: string | null;
    courts?: PopulatedCourt[];
  } | null;
	sponsor?: {
		_id: mongoose.Types.ObjectId;
		name?: string;
		logoUrl?: string | null;
		link?: string | null;
	} | null;
	participants?: Array<{
		_id: mongoose.Types.ObjectId;
		name?: string | null;
		alias?: string | null;
	}>;
  /** Set when `schedule` is populated (lean); `null` if ref is broken; omit if no ref. */
  schedule?: SchedulePopulatedLean | null;
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
    duration: z.number().int().min(5).max(240).nullable().optional(),
    breakDuration: z.number().int().min(0).max(120).nullable().optional(),
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
  duration?: number;
  breakDuration?: number;
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
    duration: source.duration ?? undefined,
    breakDuration: source.breakDuration ?? undefined,
    foodInfo: source.foodInfo ?? "",
    descriptionInfo: source.descriptionInfo ?? "",
  };
}

export type { PublishBodyInput };
