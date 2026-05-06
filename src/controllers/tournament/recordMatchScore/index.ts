import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { AppError, buildErrorPayload } from "../../../shared/errors";
import { TOURNAMENT_ORGANISER_SCORE_EDIT_GRACE_HOURS } from "../../../lib/config";
import Tournament from "../../../models/Tournament";
import {
  authorizeScheduleOrMatchParticipant,
  hasTournamentScheduleAccess,
} from "../../schedule/shared/authorize";
import { fetchTournamentScheduleContext } from "../../schedule/shared/queries";
import { recordTournamentMatchScoreFlow } from "./handler";
import { recordMatchScoreParamsSchema, recordMatchScoreSchema } from "./validation";

/**
 * PATCH /api/tournaments/:id/matches/:matchId/score
 * Records score. Ratings are applied at round boundaries for future scheduling,
 * and after final-round completion. Organiser grace edits to old, detached,
 * historical, or cancelled matches only update the stored score.
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

    const isOrganiser = await hasTournamentScheduleAccess(tournament, req.user);
    const meta = await Tournament.findById(tournamentId)
      .select("completedAt")
      .lean<{ completedAt?: Date | null } | null>()
      .exec();
    const completedAt = meta?.completedAt ?? null;

    const graceHours = TOURNAMENT_ORGANISER_SCORE_EDIT_GRACE_HOURS;
    const organiserGraceExpired =
      isOrganiser &&
      completedAt instanceof Date &&
      Date.now() > completedAt.getTime() + graceHours * 60 * 60 * 1000;
    const tournamentCompleted =
      completedAt instanceof Date && Date.now() > completedAt.getTime();

    const result = await recordTournamentMatchScoreFlow(tournamentId, matchIdParam, parsedBody.data, {
      actor: isOrganiser ? "organiser" : "participant",
      organiserGraceExpired,
      tournamentCompleted,
    });

    const responseMessage =
      result.matchStatus === "completed"
        ? "Match score recorded"
        : "Partial score recorded; winner is still pending";

    res.status(200).json({
      message: responseMessage,
      match: {
        id: result.matchId,
        tournamentId: result.tournamentId,
        status: result.matchStatus,
      },
      tournamentCompleted: result.tournamentCompleted,
      ratingsRecomputed: result.ratingsRecomputed,
      ratings: result.updatedRatings,
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error("Error recording match score", { err });
        res.status(500).json(buildErrorPayload("Internal server error"));
        return;
      }
      res.status(err.statusCode).json(buildErrorPayload(err.message));
      return;
    }

    logger.error("Error recording match score", { err });
    res.status(500).json(buildErrorPayload("Failed to record match score"));
  }
}
