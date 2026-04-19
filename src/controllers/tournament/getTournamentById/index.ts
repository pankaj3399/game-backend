import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { AuthenticatedRequest, type AuthenticatedSession } from "../../../shared/authContext";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload } from "../../../shared/errors";
import { authorizeGetById } from "../shared/authorizeGetById";
import { fetchTournamentById } from "../shared/fetchTournamentById";
import { getClubSponsors } from "./queries";
import { mapTournamentDetail } from "./mapper";

/**
 * GET /api/tournaments/:id
 * Get tournament details. Drafts are only visible to super admins, the creator, or club managers.
 */
export async function getTournamentById(req: AuthenticatedRequest, res: Response) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const tournament = await fetchTournamentById(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeGetById(tournament, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const clubSponsors = await getClubSponsors(authResult.data.context.clubIdStr);

    const response = mapTournamentDetail(
      tournament,
      authResult.data.context,
      clubSponsors,
      req.user._id.toString()
    );

    res.status(200).json({ tournament: response });
  } catch (err: unknown) {
    logger.error("Error fetching tournament by ID", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
