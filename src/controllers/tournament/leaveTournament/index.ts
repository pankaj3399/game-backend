import type { Response } from "express";
import { logger } from "../../../lib/logger";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload } from "../../../shared/errors";
import { AuthenticatedRequest } from "../../../shared/authContext";
import { leaveTournamentFlow } from "./handler";

export type { LeaveTournamentPullLean, LeaveTournamentTournamentDoc } from "./types";

/**
 * POST /api/tournaments/:id/leave
 * Leave a tournament; participant membership is enforced atomically in leaveTournamentFlow.
 */
export async function leaveTournament(req: AuthenticatedRequest, res: Response) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const result = await leaveTournamentFlow(idResult.data, req.user);
    if (result.status !== 200) {
      res.status(result.status).json(buildErrorPayload(result.message));
      return;
    }

    res.status(200).json({
      message: "Successfully left tournament",
      tournament: {
        id: result.data.tournamentId,
        spotsFilled: result.data.spotsFilled,
        spotsTotal: result.data.spotsTotal,
        isParticipant: result.data.isParticipant,
      },
    });
  } catch (err: unknown) {
    logger.error("Error leaving tournament", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
