import { z } from "zod";
import { objectId } from "../../../validation/base-helpers";

export const recordMatchScoreParamsSchema = z
  .object({
    id: objectId,
    matchId: objectId,
  })
  .strict();

const numericScore = z.number().int().min(0).max(99);
const scoreValue = z.union([numericScore, z.literal("wo")]);

export const recordMatchScoreSchema = z
  .object({
    playerOneScores: z.array(scoreValue).min(1).max(25),
    playerTwoScores: z.array(scoreValue).min(1).max(25),
  })
  .strict()
  .refine((value) => value.playerOneScores.length === value.playerTwoScores.length, {
    message: "playerOneScores and playerTwoScores must have the same length",
    path: ["playerTwoScores"],
  });

export type RecordMatchScoreInput = z.infer<typeof recordMatchScoreSchema>;
