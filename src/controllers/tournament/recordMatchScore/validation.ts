import { z } from "zod";
import { objectId } from "../../../validation/base-helpers";

export const recordMatchScoreParamsSchema = z
  .object({
    id: objectId,
    matchId: objectId,
  })
  .strict();

const MAX_SCORE_ROWS = 5;
const numericScore = z.number().int().min(0);
const scoreValue = z.union([numericScore, z.literal("wo")]);

export const recordMatchScoreSchema = z
  .object({
    playerOneScores: z.array(scoreValue).min(1).max(MAX_SCORE_ROWS),
    playerTwoScores: z.array(scoreValue).min(1).max(MAX_SCORE_ROWS),
  })
  .strict()
  .refine((value) => value.playerOneScores.length === value.playerTwoScores.length, {
    message: "playerOneScores and playerTwoScores must have the same length",
    path: ["playerTwoScores"],
  });

export type RecordMatchScoreInput = z.infer<typeof recordMatchScoreSchema>;
