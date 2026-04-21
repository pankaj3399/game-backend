import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import { guardIdParam } from "../../../shared/guards";
import { generateDoublesPairsFlow } from "./handler";
import { authorizeScheduleAccess } from "../shared/authorize";
import { fetchTournamentScheduleContext } from "../shared/queries";
import { generatePairsSchema } from "../shared/validation";

/**
 * POST /api/schedule/:id/pairs
 * Generates doubles teams from ordered participants.
 */
export async function generateDoublesPairs(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const bodyResult = generatePairsSchema.safeParse(req.body);
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

    const payload = generateDoublesPairsFlow(bodyResult.data.participantOrder, tournament);
    res.status(200).json(payload);
  } catch (err) {
    logger.error("Error generating doubles pairs", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
