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
const scoreValue = z.union([numericScore, z.literal("wo"), z.null()]);

export const recordMatchScoreSchema = z
  .object({
    playerOneScores: z.array(scoreValue).min(1).max(MAX_SCORE_ROWS),
    playerTwoScores: z.array(scoreValue).min(1).max(MAX_SCORE_ROWS),
  })
  .strict()
  .refine((value) => value.playerOneScores.length === value.playerTwoScores.length, {
    message: "playerOneScores and playerTwoScores must have the same length",
    path: ["playerTwoScores"],
  })
  .superRefine((value, ctx) => {
    for (let index = 0; index < value.playerOneScores.length; index += 1) {
      const one = value.playerOneScores[index];
      const two = value.playerTwoScores[index];

      if (one === "wo" && two === "wo") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Both sides cannot be "wo" in the same set',
          path: ["playerTwoScores", index],
        });
      }

      if (one === "wo" && two !== null && two !== "wo") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Walkover opponent score must be empty",
          path: ["playerTwoScores", index],
        });
      }

      if (two === "wo" && one !== null && one !== "wo") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Walkover opponent score must be empty",
          path: ["playerOneScores", index],
        });
      }
    }
  });

export type RecordMatchScoreInput = z.infer<typeof recordMatchScoreSchema>;
