import type { Request, Response } from "express";
import Tournament from "../../../models/Tournament";
import { logger } from "../../../lib/logger";
import { guardIdParam } from "../../shared/guards";
import { buildErrorPayload } from "../../shared/errors";
import { type AuthenticatedSession } from "../../shared/authContext";
import { authorizeJoin } from "./authorize";
import { joinTournamentFlow } from "./handler";

/**
 * POST /api/tournaments/:id/join
 * Join an active tournament.
 */
export async function joinTournament(req: Request<{ id: string }>, res: Response) {
  try {
    const session = req.user;
    if (!session?._id) {
      res.status(401).json(buildErrorPayload("Not authenticated"));
      return;
    }

    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const tournament = await Tournament.findById(idResult.value)
      .select("_id name status minMember maxMember participants")
      .populate("club")
      .lean()
      .exec();

    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeJoin(tournament, session);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await joinTournamentFlow(idResult.value, session);
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
