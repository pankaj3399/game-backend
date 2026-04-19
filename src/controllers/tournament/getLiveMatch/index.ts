import type { Response } from "express";
import { logger } from "../../../lib/logger";
import { buildErrorPayload } from "../../../shared/errors";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { mapLiveMatchItem } from "./mapper";
import { applyResolvedTimedStatuses, fetchLiveMatchGames } from "./queries";
import { selectLiveGame, selectNextScheduledGame } from "./selection";

/**
 * GET /api/tournaments/live-match
 * Returns the current user's active match (if any) and their next scheduled match.
 */
export async function getTournamentLiveMatch(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user._id.toString();

    const games = await fetchLiveMatchGames(req.user._id);

    if (games.length === 0) {
      res.status(200).json({
        liveMatch: null,
        nextMatch: null,
      });
      return;
    }

    const now = new Date();
    await applyResolvedTimedStatuses(games, now);

    const liveGame = selectLiveGame(games);
    const nextGame = selectNextScheduledGame(games, now);

    const liveMatch = liveGame ? mapLiveMatchItem(liveGame, userId) : null;
    const nextMatch = nextGame ? mapLiveMatchItem(nextGame, userId) : null;

    res.status(200).json({
      liveMatch,
      nextMatch,
    });
  } catch (err) {
    logger.error("Error getting tournament live match", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
