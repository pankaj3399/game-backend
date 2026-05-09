import { z } from "zod";

const MAX_SCORE_ROWS = 5;
const numericScore = z.number().int().min(0);
const scoreValue = z.union([numericScore, z.literal("wo")]);

const scoreArraysSchema = z
  .object({
    playerOneScores: z.array(scoreValue).min(1).max(MAX_SCORE_ROWS),
    playerTwoScores: z.array(scoreValue).min(1).max(MAX_SCORE_ROWS),
  })
  .strict()
  .refine(
    (value) => value.playerOneScores.length === value.playerTwoScores.length,
    {
      message: "playerOneScores and playerTwoScores must have the same length",
      path: ["playerTwoScores"],
    },
  )
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
    }
  });

export const generateScoreQrBodySchema = scoreArraysSchema;

export const generateIndependentScoreQrBodySchema = scoreArraysSchema
  .extend({
    independentMatchType: z.enum(["singles", "doubles"]).optional(),
    independentPlayMode: z
      .enum(["TieBreak10", "1set", "3setTieBreak10", "3set", "5set"])
      .optional(),
  })
  .strict();

export const confirmScoreQrBodySchema = z
  .object({
    token: z.string().trim().min(1, "token is required"),
  })
  .strict();

export const scoreQrTokenParamsSchema = z
  .object({
    token: z.string().trim().min(1, "token is required"),
  })
  .strict();

export const activeScoreQrQuerySchema = z
  .object({
    flow: z.enum(["tournament", "independent"]).optional(),
    tournamentId: z.string().trim().optional(),
    matchId: z.string().trim().optional(),
    playMode: z
      .enum(["TieBreak10", "1set", "3setTieBreak10", "3set", "5set"])
      .optional(),
    matchType: z.enum(["singles", "doubles"]).optional(),
  })
  .strict();

export type GenerateScoreQrBodyInput = z.infer<
  typeof generateScoreQrBodySchema
>;
export type GenerateIndependentScoreQrBodyInput = z.infer<
  typeof generateIndependentScoreQrBodySchema
>;
export type ConfirmScoreQrBodyInput = z.infer<typeof confirmScoreQrBodySchema>;
export type ScoreQrTokenParamsInput = z.infer<typeof scoreQrTokenParamsSchema>;
export type ActiveScoreQrQueryInput = z.infer<typeof activeScoreQrQuerySchema>;
