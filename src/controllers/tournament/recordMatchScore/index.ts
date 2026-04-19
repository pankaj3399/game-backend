import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import { guardIdParam } from "../../../shared/guards";
import { authorizeScheduleAccess } from "../../schedule/shared/authorize";
import { fetchTournamentScheduleContext } from "../../schedule/shared/queries";
import Game from "../../../models/Game";
import { recordTournamentMatchScoreFlow } from "./handler";
import { recordMatchScoreSchema } from "./validation";

async function isMatchParticipant(
  tournamentId: string,
  matchId: string,
  userId: string
) {
  const match = await Game.findOne({
    _id: matchId,
    tournament: tournamentId,
    gameMode: "tournament",
    $or: [{ "side1.players": userId }, { "side2.players": userId }],
  })
    .select("_id")
    .lean<{ _id: unknown } | null>()
    .exec();

  return match != null;
}

/**
 * PATCH /api/tournaments/:id/matches/:matchId/score
 * Records score, closes the match, and immediately applies Glicko2 updates.
 */
export async function recordMatchScore(req: AuthenticatedRequest, res: Response) {
  try {
    const tournamentIdResult = guardIdParam(req.params, "tournament ID");
    if (!tournamentIdResult.ok) {
      res.status(tournamentIdResult.status).json(buildErrorPayload(tournamentIdResult.message));
      return;
    }

    const matchIdParam = Array.isArray(req.params.matchId)
      ? req.params.matchId[0]
      : req.params.matchId;
    const matchIdResult = guardIdParam({ id: matchIdParam }, "match ID");
    if (!matchIdResult.ok) {
      res.status(matchIdResult.status).json(buildErrorPayload(matchIdResult.message));
      return;
    }

    const parsedBody = recordMatchScoreSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const message = parsedBody.error.issues.map((issue) => issue.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const tournament = await fetchTournamentScheduleContext(tournamentIdResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeScheduleAccess(tournament, req.user);
    if (authResult.status !== 200) {
      const participantAccess = await isMatchParticipant(
        tournamentIdResult.data,
        matchIdResult.data,
        req.user._id.toString()
      );

      if (!participantAccess) {
        res.status(403).json(
          buildErrorPayload("You do not have permission to record score for this match")
        );
        return;
      }
    }

    const resultRaw: unknown = await recordTournamentMatchScoreFlow(
      tournamentIdResult.data,
      matchIdResult.data,
      parsedBody.data
    );

    if (!resultRaw || typeof resultRaw !== "object") {
      throw new Error("Failed to record match score");
    }

    const matchId = "matchId" in resultRaw ? resultRaw.matchId : null;
    const tournamentId = "tournamentId" in resultRaw ? resultRaw.tournamentId : null;
    const tournamentCompleted = "tournamentCompleted" in resultRaw ? resultRaw.tournamentCompleted : null;
    const updatedRatings = "updatedRatings" in resultRaw ? resultRaw.updatedRatings : null;

    if (
      typeof matchId !== "string" ||
      typeof tournamentId !== "string" ||
      typeof tournamentCompleted !== "boolean" ||
      !Array.isArray(updatedRatings)
    ) {
      throw new Error("Failed to record match score");
    }

    res.status(200).json({
      message: "Match score recorded and ratings updated",
      match: {
        id: matchId,
        tournamentId,
        status: "completed",
      },
      tournamentCompleted,
      ratings: updatedRatings,
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
