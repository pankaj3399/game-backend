import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { buildErrorPayload } from "../../shared/errors";
import { type AuthenticatedSession } from "../../shared/authContext";
import { getTournamentQuerySchema } from "./validation";
import { authorizeList } from "./authorize";
import { getTournamentsFlow } from "./handler";
import { mapTournamentListItems } from "./mapper";

/**
 * GET /api/tournaments
 * - Players: list active tournaments only (published, joinable).
 * - Organisers+: list tournaments for clubs they manage; supports view=published|drafts.
 * Query: page, limit, status, q (search), view (published|drafts, organiser only)
 */
export async function getTournaments(req: Request, res: Response) {
  try {
    const session = req.user;
    if (!session?._id) {
      res.status(401).json(buildErrorPayload("Not authenticated"));
      return;
    }

    const parsed = getTournamentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const authResult = await authorizeList(session);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await getTournamentsFlow(parsed.data, authResult.data.filterContext);
    if (result.status !== 200) {
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
}
