import { Types } from "mongoose";
import { z } from "zod";
import {
  TOURNAMENT_MODES,
  TOURNAMENT_PLAY_MODES,
} from "../../../types/domain/tournament";

/** Single nullability at domain boundaries (no undefined in outputs). */
const dateOrNull = z.union([z.date(), z.null()]);

const stringOrNull = z.union([z.string(), z.null()]);

export const mongoObjectIdSchema = z.custom<Types.ObjectId>(
  (v): v is Types.ObjectId => v instanceof Types.ObjectId,
  { message: "Expected mongoose ObjectId" }
);

export const scheduleCourtInfoSchema = z.object({
  _id: mongoObjectIdSchema,
  name: z.string(),
});

export const scheduleClubInfoSchema = z.object({
  _id: mongoObjectIdSchema,
  courts: z.array(scheduleCourtInfoSchema),
});

export const scheduleParticipantEloSchema = z.object({
  rating: z.union([z.number(), z.null()]),
});

export const scheduleParticipantInfoSchema = z.object({
  _id: mongoObjectIdSchema,
  name: stringOrNull,
  alias: stringOrNull,
  elo: scheduleParticipantEloSchema,
});

const tournamentModeSchema = z.enum(
  TOURNAMENT_MODES as unknown as [string, ...string[]]
);

const tournamentPlayModeSchema = z.enum(
  TOURNAMENT_PLAY_MODES as unknown as [string, ...string[]]
);

/**
 * Validated tournament + club + participants snapshot for schedule flows.
 * Parsed after lean/populate so downstream code does not handle undefined vs null.
 */
export const tournamentScheduleContextSchema = z.object({
  _id: mongoObjectIdSchema,
  name: z.string(),
  minMember: z.number().int().positive(),
  firstRoundScheduledAt: dateOrNull,
  tournamentMode: tournamentModeSchema,
  date: dateOrNull,
  startTime: stringOrNull,
  duration: stringOrNull,
  breakDuration: stringOrNull,
  matchesPerPlayer: z.number().int().min(1).max(20),
  totalRounds: z.number().int().min(1).max(100),
  playMode: tournamentPlayModeSchema,
  createdBy: mongoObjectIdSchema,
  club: z.union([scheduleClubInfoSchema, z.null()]),
  participants: z.array(scheduleParticipantInfoSchema),
  schedule: z.union([mongoObjectIdSchema, z.null()]),
});

export type TournamentScheduleContext = z.infer<typeof tournamentScheduleContextSchema>;

export type ScheduleCourtInfo = z.infer<typeof scheduleCourtInfoSchema>;
export type ScheduleClubInfo = z.infer<typeof scheduleClubInfoSchema>;
export type ScheduleParticipantInfo = z.infer<typeof scheduleParticipantInfoSchema>;
export type ScheduleParticipantElo = z.infer<typeof scheduleParticipantEloSchema>;

/** Lean schedule document for GET schedule / match lists. */
export const tournamentScheduleDocumentSchema = z.object({
  _id: mongoObjectIdSchema,
  status: z.enum(["draft", "active", "finished"]),
  currentRound: z.number(),
  matchDurationMinutes: z
    .number()
    .nullish()
    .transform((v): number | null => v ?? null),
  breakTimeMinutes: z
    .number()
    .nullish()
    .transform((v): number | null => v ?? null),
  rounds: z.array(
    z.object({
      game: mongoObjectIdSchema,
      slot: z.number(),
      round: z.number(),
    })
  ),
});

export type TournamentScheduleDocument = z.infer<typeof tournamentScheduleDocumentSchema>;

export function parseTournamentScheduleContext(data: unknown) {
  return tournamentScheduleContextSchema.parse(data);
}

export function parseTournamentScheduleDocument(data: unknown) {
  return tournamentScheduleDocumentSchema.parse(data);
}
