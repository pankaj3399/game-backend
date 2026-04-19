import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import { guardIdParam } from "../../../shared/guards";
import { mapScheduleViewResponse } from "./mapper";
import { authorizeScheduleAccess } from "../shared/authorize";
import {
  fetchScheduleForTournament,
  fetchTournamentScheduleContext,
} from "../shared/queries";

/**
 * GET /api/schedule/:id
 * Returns schedule page data: defaults, courts, participant ordering and round summary.
 */
export async function getSchedule(req: AuthenticatedRequest, res: Response) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const tournament = await fetchTournamentScheduleContext(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeScheduleAccess(tournament, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const schedule = await fetchScheduleForTournament(idResult.data, tournament.schedule);
    const totalRounds = tournament.totalRounds;

    const responseContext =
      tournament.tournamentMode === "singleDay"
        ? {
            ...tournament,
            duration:
              typeof schedule?.matchDurationMinutes === "number"
                ? Math.trunc(schedule.matchDurationMinutes)
                : tournament.duration,
            breakDuration:
              typeof schedule?.breakTimeMinutes === "number"
                ? Math.trunc(schedule.breakTimeMinutes)
                : tournament.breakDuration,
          }
        : tournament;

    const payload = mapScheduleViewResponse(responseContext, {
      currentRound: schedule?.currentRound ?? 0,
      totalRounds,
    });

    res.status(200).json(payload);
  } catch (err) {
    logger.error("Error fetching tournament schedule", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
