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
} from "./queries";

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
    const payload = mapTournamentMatchesResponse(schedule, games);

    res.status(200).json(payload);
  } catch (err) {
    logger.error("Error fetching tournament matches", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
