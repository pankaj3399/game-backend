import { z } from "zod";
import { objectId } from "../../../validation/base-helpers";

const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;

export const scheduleModeSchema = z.enum(["singles", "doubles"]);

export const generateScheduleSchema = z
  .object({
    round: z.number().int().min(1),
    mode: scheduleModeSchema,
    matchDurationMinutes: z.number().int().min(5).max(240).optional(),
    breakTimeMinutes: z.number().int().min(0).max(120).optional(),
    matchesPerPlayer: z.number().int().min(1).max(20).optional(),
    startTime: z.string().regex(timeRegex, "Invalid start time (expected HH:mm)"),
    courtIds: z.array(objectId).min(1),
    participantOrder: z.array(objectId).min(2),
  })
  .strict()
  .transform((value) => ({
    ...value,
    matchesPerPlayer: value.matchesPerPlayer ?? 1,
  }))
  .refine((value) => value.matchesPerPlayer >= 1 && value.matchesPerPlayer <= 20, {
    message: "matchesPerPlayer must be between 1 and 20",
    path: ["matchesPerPlayer"],
  });

export const generatePairsSchema = z
  .object({
    participantOrder: z.array(objectId).min(2),
  })
  .strict();

export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;
export type GeneratePairsInput = z.infer<typeof generatePairsSchema>;
