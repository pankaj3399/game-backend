import { z } from "zod";
import { objectId } from "../../../validation/base-helpers";

export const playModeEnum = z.enum([
  "TieBreak10",
  "1set",
  "3setTieBreak10",
  "3set",
  "5set",
]);

export const statusEnum = z.enum(["draft", "active"]);


const baseTournament = z.object({
    club: objectId,
    schedule: objectId.optional(),
    sponsorId: objectId.optional(),
  
    name: z.string().min(1),
  
    logo: z.string().optional(),
  
    playMode: playModeEnum,
  
    entryFee: z.number().min(0).nonnegative().default(0),
    minMember: z.number().min(1).nonnegative(),
    maxMember: z.number().min(1).nonnegative(),
  
    duration: z.string(),
    breakDuration: z.string(),
  
    courts: z.array(objectId).min(1),
  
    foodInfo: z.string().optional(),
    descriptionInfo: z.string().optional(),
  
  });



  const draftSingleDay = baseTournament.partial().extend({
    status: z.literal("draft"),
    tournamentMode: z.literal("singleDay"),
    date: z.coerce.date().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  })

  const draftPeriod = baseTournament.partial().extend({
    status: z.literal("draft"),
    tournamentMode: z.literal("period"),
  })

  const publishSingleDay = baseTournament.extend({
    status: z.literal("active"),
    tournamentMode: z.literal("singleDay"),
    date: z.coerce.date(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    courts: z.array(objectId).min(1),
  })

  const publishPeriod = baseTournament.extend({
    status: z.literal("active"),
    tournamentMode: z.literal("period"),
    courts: z.array(objectId).min(1),
  })

  const draftModeSchema = z.discriminatedUnion("tournamentMode", [
    draftSingleDay,
    draftPeriod,
  ]);
  
  const publishModeSchema = z.discriminatedUnion("tournamentMode", [
    publishSingleDay,
    publishPeriod,
  ]);

  const createTournamentSchemaBase = z.discriminatedUnion("status", [
    draftModeSchema,
    publishModeSchema,
  ]);

  type CreateTournamentBase = z.infer<typeof createTournamentSchemaBase>;

  /** Refinements: maxMember >= minMember; for active singleDay, startTime < endTime. */
  export const createTournamentSchema = createTournamentSchemaBase
    .refine(
      (d: CreateTournamentBase) =>
        (d.maxMember ?? 0) >= (d.minMember ?? 0),
      { message: "maxMember must be greater than or equal to minMember", path: ["maxMember"] }
    )
    .refine(
      (d: CreateTournamentBase) => {
        if (d.status !== "active" || d.tournamentMode !== "singleDay") return true;
        const toMin = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          return h * 60 + m;
        };
        return toMin(d.startTime) < toMin(d.endTime);
      },
      { message: "Start time must be before end time", path: ["startTime"] }
    );

  export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;