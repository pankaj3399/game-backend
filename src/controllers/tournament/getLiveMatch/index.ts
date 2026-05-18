import type { Response } from "express";
import { logger } from "../../../lib/logger";
import { buildErrorPayload } from "../../../shared/errors";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { mapLiveMatchItem } from "./mapper";
import {
  applyResolvedTimedStatuses,
  fetchEligibleTournamentsWithoutUserMatches,
  fetchLiveMatchGames,
} from "./queries";
import { selectLiveGame, selectNextScheduledGame } from "./selection";

/**
 * GET /api/tournaments/live-match
 * Returns the current user's active match (if any), next scheduled match,
 * and all in-flight tournament matches where the user is a participant.
 */
export async function getTournamentLiveMatch(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user._id.toString();

    const games = await fetchLiveMatchGames(req.user._id);

    const now = new Date();
    if (games.length > 0) {
      await applyResolvedTimedStatuses(games, now);
    }

    const liveGame = selectLiveGame(games);
    const nextGame = selectNextScheduledGame(games, now);

    const liveMatch = liveGame ? mapLiveMatchItem(liveGame, userId) : null;
    const nextMatch = nextGame ? mapLiveMatchItem(nextGame, userId) : null;
    const matches = games.map((game) => mapLiveMatchItem(game, userId));

    const tournamentIdsWithMatches = new Set(
      games
        .map((game) => game.tournament?._id?.toString())
        .filter((id): id is string => Boolean(id)),
    );
    const eligibleTournamentsWithoutMatches =
      await fetchEligibleTournamentsWithoutUserMatches(
        req.user._id,
        tournamentIdsWithMatches,
      );

    res.status(200).json({
      liveMatch,
      nextMatch,
      matches,
      eligibleTournaments: eligibleTournamentsWithoutMatches.map((tournament) => ({
        id: tournament._id.toString(),
        name: tournament.name.trim() || "Tournament",
        date: tournament.date ? tournament.date.toISOString() : null,
        playMode: tournament.playMode,
        tournamentMode: tournament.tournamentMode,
      })),
    });
  } catch (err) {
    logger.error("Error getting tournament live match", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
