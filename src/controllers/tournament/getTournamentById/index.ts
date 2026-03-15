import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { type AuthenticatedSession } from "../../shared/authContext";
import { guardIdParam } from "../../shared/guards";
import { buildErrorPayload } from "../../shared/errors";
import { authorizeGetById } from "./authorize";
import { fetchTournamentById, getClubSponsors } from "./handler";
import { mapTournamentDetail } from "./mapper";

/**
 * GET /api/tournaments/:id
 * Get tournament details. Non-managers can only view active tournaments.
 */
export async function getTournamentById(req: Request<{ id: string }>, res: Response): Promise<void> {
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

    const tournament = await fetchTournamentById(idResult.value);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeGetById(tournament, session);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const clubSponsors = await getClubSponsors(authResult.data.context.clubIdStr);

    const response = mapTournamentDetail(
      tournament,
      authResult.data.context,
      clubSponsors,
      session._id.toString()
    );

    res.status(200).json({ tournament: response });
  } catch (err: unknown) {
    logger.error("Error fetching tournament by ID", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
