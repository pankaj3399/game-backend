import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload } from "../../../shared/errors";
import { AuthenticatedRequest, type AuthenticatedSession } from "../../../shared/authContext";
import { updateDraftSchema } from "./validation";
import { authorizeUpdate } from "./authorize";
import { fetchTournamentForUpdate } from "./queries";
import { updateTournamentFlow } from "./handler";
import { validateActiveTournamentEnrolledUpdate } from "./activeEnrolledUpdate";

/**
 * PATCH /api/tournaments/:id
 * Update tournament. Existing draft and published tournaments can be updated.
 */
export async function updateTournament(req: AuthenticatedRequest ,res: Response){
  try {

    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const bodyParse = updateDraftSchema.safeParse(req.body);
    if (!bodyParse.success) {
      const message = bodyParse.error.issues.map((i) => i.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const tournament = await fetchTournamentForUpdate(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }
    if (tournament.status !== 200) {
      res.status(tournament.status).json(buildErrorPayload(tournament.message));
      return;
    }

    const enrolledGuard = validateActiveTournamentEnrolledUpdate(
      tournament.data,
      bodyParse.data
    );
    if (!enrolledGuard.ok) {
      res.status(enrolledGuard.status).json(buildErrorPayload(enrolledGuard.message));
      return;
    }

    const authResult = await authorizeUpdate(tournament.data, bodyParse.data, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await updateTournamentFlow(idResult.data, bodyParse.data, {
      clubChanged: authResult.data.clubChanged,
    });
    if (!result) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    res.status(200).json({
      message: "Tournament updated",
      tournament: result.tournament,
    });
  } catch (err: unknown) {
    const mongoErr = err as { code?: number; keyPattern?: Record<string, number> };
    if (mongoErr?.code === 11000) {
      if (mongoErr.keyPattern?.club === 1 && mongoErr.keyPattern?.name === 1) {
        res.status(409).json(buildErrorPayload("A tournament with this name already exists in the selected club"));
        return;
      }
      if (mongoErr.keyPattern?.name === 1) {
        res.status(409).json(buildErrorPayload("A tournament with this name already exists"));
        return;
      }
      res.status(409).json(buildErrorPayload("A tournament with the same unique data already exists"));
      return;
    }

    logger.error("Error updating tournament", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
