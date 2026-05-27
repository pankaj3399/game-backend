import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { buildErrorPayload } from "../../../shared/errors";
import type { AuthenticatedSession } from "../../../shared/authContext";
import { getTournamentQuerySchema } from "./validation";
import { authorizeList } from "./authorize";
import { getTournamentsFlow } from "./handler";
import { mapTournamentListItems } from "./mapper";

/**
 * GET /api/tournaments
 * - Guests: list active published tournaments only.
 * - Players: list active tournaments only (published, joinable).
 * - Organisers+: list tournaments for clubs they manage; supports view=published|drafts.
 * Query: page, limit, when (future|past; unscheduled tournaments are always included), distance, club, clubScope (favorites), participation (joined|notJoined), q (search), view (published|drafts, organiser only)
 */
export const getTournaments = async (req: Request, res: Response) => {
  try {
    const session = req.user as AuthenticatedSession | undefined;

    const parsed = getTournamentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    if (!session && parsed.data.view === "drafts") {
      res.status(401).json(buildErrorPayload("Authorization required"));
      return;
    }

    const authResult = await authorizeList(session);
    if (!authResult.ok) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await getTournamentsFlow(parsed.data, authResult.data.filterContext);
    if (!result.ok) {
      res.status(result.status).json(buildErrorPayload(result.message));
      return;
    }
    const items = mapTournamentListItems(result.data.tournaments);

    res.status(200).json({
      message: "Tournaments listed successfully",
      tournaments: items,
      pagination: {
        total: result.data.total,
        page: result.data.page,
        limit: result.data.limit,
        totalPages: Math.ceil(result.data.total / result.data.limit),
      },
    });
  } catch (err: unknown) {
    logger.error("Error listing tournaments", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
};
