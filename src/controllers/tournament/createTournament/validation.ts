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

const entryFeeSchema = z.coerce.number().min(0).default(0);
const memberCountSchema = z.coerce.number().int().min(1);
const totalRoundsSchema = z.coerce.number().int().min(1).max(100);
const durationMinutesSchema = z.coerce.number().int().min(5).max(240).default(60);
const breakMinutesSchema = z.coerce.number().int().min(0).max(120).default(0);


const baseTournament = z.object({
    club: objectId,
    schedule: objectId.optional(),
    sponsor: objectId.nullable().optional(),
    sponsorId: objectId.nullable().optional(),
  
    name: z.string().min(1),

    playMode: playModeEnum,
  
    entryFee: entryFeeSchema,
    minMember: memberCountSchema,
    maxMember: memberCountSchema,
    totalRounds: totalRoundsSchema.optional(),
  
    duration: durationMinutesSchema.optional().default(60),
    breakDuration: breakMinutesSchema.optional().default(0),
  
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

  const draftUnscheduled = baseTournament.partial().extend({
    status: z.literal("draft"),
    tournamentMode: z.literal("unscheduled"),
  })

  const publishSingleDay = baseTournament.extend({
    status: z.literal("active"),
    tournamentMode: z.literal("singleDay"),
    date: z.coerce.date(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })

  const publishUnscheduled = baseTournament.extend({
    status: z.literal("active"),
    tournamentMode: z.literal("unscheduled"),
  })

  const draftModeSchema = z.discriminatedUnion("tournamentMode", [
    draftSingleDay,
    draftUnscheduled,
  ]);
  
  const publishModeSchema = z.discriminatedUnion("tournamentMode", [
    publishSingleDay,
    publishUnscheduled,
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
    )
    .superRefine((d, ctx) => {
      if (
        d.sponsor !== undefined &&
        d.sponsorId !== undefined &&
        d.sponsor !== d.sponsorId
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sponsor"],
          message: "conflicting sponsor and sponsorId",
        });
      }
    })
    .superRefine((d, ctx) => {
      if (d.status !== "active") {
        return;
      }
      if (d.totalRounds === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalRounds"],
          message: "totalRounds is required when status is active",
        });
      }
    })
    .transform((d) => {
      const sponsor = d.sponsor ?? d.sponsorId ?? undefined;
      const { sponsorId, ...rest } = d;
      return {
        ...rest,
        sponsor,
      };
    });

  export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;