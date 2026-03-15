import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { guardIdParam } from "../../shared/guards";
import { buildErrorPayload } from "../../shared/errors";
import { tournamentPublishSourceSchema } from "../types/publish";
import { publishBodySchema } from "./validation";
import { authorizePublish } from "./authorize";
import { fetchTournamentForPublish } from "./data";
import { publishTournamentFlow } from "./handler";

/**
 * POST /api/tournaments/:id/publish
 * Publish a draft tournament. Body must contain full publish-valid payload (merge with existing).
 * Idempotent if already active.
 */
export async function publishTournament(req: Request<{ id: string }>, res: Response){
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

    const tournamentDoc = await fetchTournamentForPublish(idResult.value);
    if (!tournamentDoc) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const tournamentParse = tournamentPublishSourceSchema.safeParse(tournamentDoc);
    if (!tournamentParse.success) {
      res.status(500).json(
        buildErrorPayload("Stored tournament data is invalid")
      );
      return;
    }
    const tournament = tournamentParse.data;

    if (tournament.status === "active") {
      res.json({
        message: "Tournament is already published",
        tournament: {
          id: tournament._id,
          name: tournament.name,
          status: tournament.status,
        },
      });
      return;
    }

    const bodyParse = publishBodySchema.safeParse(req.body);
    if (!bodyParse.success) {
      const message = bodyParse.error.issues.map((issue) => issue.message).join("; ");
      res.status(400).json(
        buildErrorPayload(message || "Invalid publish request payload")
      );
      return;
    }

    const authResult = await authorizePublish(tournament, session);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await publishTournamentFlow(
      idResult.value,
      tournament,
      bodyParse.data,
      authResult.data.clubId
    );

    if (result.status !== 200) {
      res.status(result.status).json(buildErrorPayload(result.message));
      return;
    }

    res.status(200).json({
      message: "Tournament published",
      tournament: {
        id: result.data.id,
        name: result.data.name,
        club: result.data.club,
        status: result.data.status,
      },
    });
  } catch (err: unknown) {
    logger.error("Error publishing tournament", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
