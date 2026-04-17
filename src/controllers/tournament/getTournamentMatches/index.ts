import type { Response } from "express";
import { logger } from "../../../lib/logger";
import { buildErrorPayload } from "../../../shared/errors";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { guardIdParam } from "../../../shared/guards";
import { authorizeGetById } from "../getTournamentById/authorize";
import { fetchTournamentById } from "../getTournamentById/queries";
import { mapTournamentMatchesResponse } from "./mapper";
import {
  fetchGamesForScheduleRounds,
  fetchScheduleForTournament,
  updateGameStatuses,
} from "./queries";
import { parseDurationMinutes, resolveTimedGameStatus } from "../../../shared/matchTiming";

/**
 * GET /api/tournaments/:id/matches
 * Returns matches linked by the tournament schedule with round and slot metadata.
 */
export async function getTournamentMatches(req: AuthenticatedRequest, res: Response) {
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
    if (!authResult.ok) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const schedule = await fetchScheduleForTournament(
      idResult.data,
      tournament.schedule ?? null
    );

    const games = await fetchGamesForScheduleRounds(
      schedule?._id ?? null,
      schedule?.rounds ?? []
    );

    const matchDurationMinutes =
      typeof schedule?.matchDurationMinutes === "number"
        ? schedule.matchDurationMinutes
        : parseDurationMinutes(tournament.duration ?? null);
    const now = new Date();
    const statusUpdates: Array<{
      id: typeof games[number]["_id"];
      status: typeof games[number]["status"];
    }> = [];

    for (const game of games) {
      const nextStatus = resolveTimedGameStatus({
        persistedStatus: game.status,
        startTime: game.startTime ?? null,
        matchDurationMinutes,
        now,
      });

      if (nextStatus !== game.status) {
        statusUpdates.push({
          id: game._id,
          status: nextStatus,
        });
        game.status = nextStatus;
      }
    }

    if (statusUpdates.length > 0) {
      await updateGameStatuses(statusUpdates);
    }

    const payload = mapTournamentMatchesResponse(schedule, games, tournament.totalRounds);

    res.status(200).json(payload);
  } catch (err) {
    logger.error("Error fetching tournament matches", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
