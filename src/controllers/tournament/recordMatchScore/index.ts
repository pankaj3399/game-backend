import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { AppError, buildErrorPayload } from "../../../shared/errors";
import { authorizeScheduleOrMatchParticipant } from "../../schedule/shared/authorize";
import { fetchTournamentScheduleContext } from "../../schedule/shared/queries";
import { recordTournamentMatchScoreFlow } from "./handler";
import { recordMatchScoreParamsSchema, recordMatchScoreSchema } from "./validation";

/**
 * PATCH /api/tournaments/:id/matches/:matchId/score
 * Records score. If the winner is decided, closes the match and applies Glicko2 updates.
 */
export async function recordMatchScore(req: AuthenticatedRequest, res: Response) {
  try {
    const paramsResult = recordMatchScoreParamsSchema.safeParse({
      id: req.params.id,
      matchId: Array.isArray(req.params.matchId) ? req.params.matchId[0] : req.params.matchId,
    });
    if (!paramsResult.success) {
      const message = paramsResult.error.issues.map((issue) => issue.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const { id: tournamentId, matchId: matchIdParam } = paramsResult.data;

    const parsedBody = recordMatchScoreSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const message = parsedBody.error.issues.map((issue) => issue.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const tournament = await fetchTournamentScheduleContext(tournamentId);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeScheduleOrMatchParticipant(tournament, req.user, {
      matchId: matchIdParam,
    });
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await recordTournamentMatchScoreFlow(tournamentId, matchIdParam, parsedBody.data);

    const responseMessage =
      result.matchStatus === "completed"
        ? "Match score recorded and ratings updated"
        : "Partial score recorded; winner is still pending";

    res.status(200).json({
      message: responseMessage,
      match: {
        id: result.matchId,
        tournamentId: result.tournamentId,
        status: result.matchStatus,
      },
      tournamentCompleted: result.tournamentCompleted,
      ratings: result.updatedRatings,
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error recording match score", { err });
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error recording match score", { err });
    res.status(500).json(buildErrorPayload("Failed to record match score"));
  }
}
