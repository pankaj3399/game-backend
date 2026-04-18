import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import { authorizeScheduleOrMatchParticipant } from "../../schedule/shared/authorize";
import { fetchTournamentScheduleContext } from "../../schedule/shared/queries";
import { recordTournamentMatchScoreFlow } from "./handler";
import { recordMatchScoreParamsSchema, recordMatchScoreSchema } from "./validation";

/**
 * PATCH /api/tournaments/:id/matches/:matchId/score
 * Records score, closes the match, and immediately applies Glicko2 updates.
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

    res.status(200).json({
      message: "Match score recorded and ratings updated",
      match: {
        id: result.matchId,
        tournamentId: result.tournamentId,
        status: "completed",
      },
      tournamentCompleted: result.tournamentCompleted,
      ratings: result.updatedRatings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record match score";
    const status =
      message === "Tournament match not found"
        ? 404
        : message.includes("missing") || message.includes("Unable") || message.includes("required")
          ? 400
          : 500;

    if (status === 500) {
      logger.error("Error recording match score", { err });
    }

    res.status(status).json(buildErrorPayload(message));
  }
}
