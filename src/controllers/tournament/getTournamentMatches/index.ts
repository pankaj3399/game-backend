import type { Response } from "express";
import { logger } from "../../../lib/logger";
import { buildErrorPayload } from "../../../shared/errors";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { guardIdParam } from "../../../shared/guards";
import { authorizeGetById } from "../shared/authorizeGetById";
import { fetchTournamentById } from "../shared/fetchTournamentById";
import { mapTournamentMatchesResponse } from "./mapper";
import {
  fetchGamesForScheduleRounds,
  fetchScheduleForTournament,
  updateGameStatuses,
} from "./queries";
import type { GameStatus } from "../../../types/domain/game";
import type { Types } from "mongoose";
import { resolveTimedGameStatus } from "../../../shared/matchTiming";

const STATUS_UPDATE_CHUNK_SIZE = 100;

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

    const scheduleId = tournament.schedule?._id ?? null;
    const schedule = await fetchScheduleForTournament(scheduleId);

    const games = await fetchGamesForScheduleRounds(
      scheduleId,
      schedule?.rounds ?? []
    );

    // Schedule may override minutes; otherwise use tournament.duration minutes.
    const matchDurationMinutes = schedule?.matchDurationMinutes ?? tournament.duration;

    const now = new Date();
    const statusUpdates: Array<{
      id: Types.ObjectId;
      status: GameStatus;
      expectedStatus: GameStatus;
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
          expectedStatus: game.status,
        });
      }
    }

    if (statusUpdates.length > 0) {
      for (let i = 0; i < statusUpdates.length; i += STATUS_UPDATE_CHUNK_SIZE) {
        const chunk = statusUpdates.slice(i, i + STATUS_UPDATE_CHUNK_SIZE);
        await updateGameStatuses(chunk);
      }

      const statusById = new Map(
        statusUpdates.map((u) => [u.id.toString(), u.status])
      );
      for (const game of games) {
        const persisted = statusById.get(game._id.toString());
        if (persisted !== undefined) {
          game.status = persisted;
        }
      }
    }

    const payload = mapTournamentMatchesResponse(schedule, games, tournament.totalRounds);

    res.status(200).json(payload);
  } catch (err) {
    logger.error("Error fetching tournament matches", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
