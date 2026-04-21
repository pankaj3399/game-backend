import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { buildErrorPayload } from "../../../shared/errors";
import { createTournamentSchema } from "./validation";
import { createTournamentFlow } from "./handler";
import { AuthenticatedRequest } from "../../../shared";

/**
 * POST /api/tournaments
 * Create tournament as draft or publish. Body must match createTournamentSchema
 * (discriminated union on status and tournamentMode).
 */
export async function createTournament(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = createTournamentSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i: { message: string }) => i.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      logger.error("Invalid tournament creation request", {
        errors: message,
      });
      return;
    }

    const result = await createTournamentFlow(parsed.data, req.user);

    if (result.status !== 200) {
      res.status(result.status).json(buildErrorPayload(result.message));
      return;
    }

    const tournament = result.data.tournament;
    const statusMessage =
      tournament?.status === "draft" ? "Draft saved" : "Tournament published";
    res.status(201).json({
      message: statusMessage,
      tournament,
    });
  } catch (err: unknown) {
    logger.error("Internal server error", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
