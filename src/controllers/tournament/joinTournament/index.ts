import type { Request, Response } from "express";
import Tournament from "../../../models/Tournament";
import { logger } from "../../../lib/logger";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload } from "../../../shared/errors";
import { AuthenticatedRequest, type AuthenticatedSession } from "../../../shared/authContext";
import { authorizeJoin } from "./authorize";
import { joinTournamentFlow } from "./handler";
import { getTournamentById } from "./queries";

/**
 * POST /api/tournaments/:id/join
 * Join an active tournament.
 */
export async function joinTournament(req:AuthenticatedRequest, res: Response) {
  try {

    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const tournament = await getTournamentById(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeJoin(tournament, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await joinTournamentFlow(idResult.data, req.user);
    if (result.status !== 200) {
      res.status(result.status).json(buildErrorPayload(result.message));
      return;
    }

    res.status(200).json({
      message: "Successfully joined tournament",
      tournament: {
        id: result.data.tournamentId,
        spotsFilled: result.data.spotsFilled,
        spotsTotal: result.data.spotsTotal,
        isParticipant: result.data.isParticipant,
      },
    });
  } catch (err: unknown) {
    logger.error("Error joining tournament", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
