import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import { guardIdParam } from "../../../shared/guards";
import { mapGenerateScheduleResponse } from "./mapper";
import { persistScheduleRound } from "./handler";
import { generateScheduleSchema } from "../shared/validation";
import { authorizeScheduleAccess } from "../shared/authorize";
import { fetchTournamentScheduleContext } from "../shared/queries";

const SCHEDULE_CLIENT_ERROR_EXACT = new Set([
  "At least one valid court must be selected",
  "At least two participants are required for singles scheduling",
  "At least four participants are required for doubles scheduling",
  "At least one match is required to generate a schedule round",
  "Unable to distribute matches per player with current participants",
  "Unable to complete doubles pairing with current constraints: demand distribution is not feasible",
  "Unable to complete doubles pairing with current constraints",
  "Unable to complete singles pairing with current constraints",
  "Unable to resolve singles participants for pairing",
  "Unable to resolve doubles participants for pairing",
  "Failed to assign schedule slot for one or more matches",
  "matchDurationMinutes and breakTimeMinutes are required for scheduled tournaments",
  "Configured schedule window is shorter than a single match duration",
  "Invalid schedule window endTime: must be a valid HH:MM later than startTime",
  "Tournament timezone is missing or invalid. Update tournament settings before scheduling.",
]);

function isClientScheduleGenerationError(message: string) {
  if (SCHEDULE_CLIENT_ERROR_EXACT.has(message)) {
    return true;
  }
  if (message.startsWith("Round ") && message.includes("exceeds totalRounds limit")) {
    return true;
  }
  if (message.startsWith("Round ") && message.includes("has not been generated yet")) {
    return true;
  }
  if (message.startsWith("Cannot regenerate this round:")) {
    return true;
  }
  if (message.startsWith("Missing game data for game")) {
    return true;
  }
  if (message.startsWith("Round ") && message.includes("is not finished yet")) {
    return true;
  }
  return false;
}

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
    if (enrolledParticipants < minimumRequiredParticipants) {
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
      const result = await persistScheduleRound(tournament, bodyResult.data);

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
      const status = isClientScheduleGenerationError(message) ? 400 : 500;
      res.status(status).json(buildErrorPayload(message));
      return;
    }
  } catch (err) {
    logger.error("Error generating tournament schedule", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
