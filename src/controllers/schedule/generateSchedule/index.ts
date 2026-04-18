import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import { guardIdParam } from "../../../shared/guards";
import { mapGenerateScheduleResponse } from "./mapper";
import { persistSinglesScheduleRound } from "./handler";
import { generateScheduleSchema } from "../shared/validation";
import { authorizeScheduleAccess } from "../shared/authorize";
import { fetchTournamentScheduleContext } from "../shared/queries";

/**
 * POST /api/schedule/:id
 * Generates and persists matches for a round.
 */
export async function generateSchedule(req: AuthenticatedRequest, res: Response) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const bodyResult = generateScheduleSchema.safeParse(req.body);
    if (!bodyResult.success) {
      const message = bodyResult.error.issues.map((issue) => issue.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const tournament = await fetchTournamentScheduleContext(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeScheduleAccess(tournament, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const enrolledParticipants = tournament.participants.length;
    const minimumRequiredParticipants = Math.max(1, tournament.minMember);
    const isBeforeFirstRoundScheduling = tournament.firstRoundScheduledAt == null;
    if (isBeforeFirstRoundScheduling && enrolledParticipants < minimumRequiredParticipants) {
      res
        .status(400)
        .json(
          buildErrorPayload(
            `Cannot generate schedule yet: at least ${minimumRequiredParticipants} participants are required, currently ${enrolledParticipants} enrolled`
          )
        );
      return;
    }

    try {
      const result = await persistSinglesScheduleRound(tournament, bodyResult.data);

      res.status(200).json(
        mapGenerateScheduleResponse(
          result.scheduleId,
          bodyResult.data.round,
          result.currentRound,
          result.generatedMatches
        )
      );
      return;
    } catch (flowError) {
      const message = flowError instanceof Error ? flowError.message : "Failed to generate schedule";
      const status =
        message === "Unable to initialize tournament schedule" ? 500 : 400;
      res.status(status).json(buildErrorPayload(message));
      return;
    }
  } catch (err) {
    logger.error("Error generating tournament schedule", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
