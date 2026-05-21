import type { Response } from "express";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import { guardIdParam } from "../../../shared/guards";
import { mapScheduleViewResponse } from "./mapper";
import { authorizeScheduleAccess } from "../shared/authorize";
import { DEFAULT_MATCH_DURATION_MINUTES } from "../shared/constants";
import { resolveDefaultScheduleStartTime } from "../shared/resolveDefaultScheduleStartTime";
import {
  fetchScheduleForTournament,
  fetchScheduleGameTimings,
  fetchTournamentScheduleContext,
} from "../shared/queries";
import { parseDurationMinutes } from "../../../shared/matchTiming";
import { resolveTournamentTimeZone } from "../../../shared/timezone";

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

    const schedule = await fetchScheduleForTournament(tournament.schedule);
    const totalRounds = tournament.totalRounds;

    const responseContext =
      tournament.tournamentMode === "singleDay"
        ? {
            ...tournament,
            duration: schedule?.matchDurationMinutes ?? tournament.duration,
            breakDuration: schedule?.breakTimeMinutes ?? tournament.breakDuration,
          }
        : tournament;

    const roundParam = req.query.round;
    const parsedRound =
      typeof roundParam === "string" && roundParam.trim() !== ""
        ? Number.parseInt(roundParam, 10)
        : Number.NaN;
    const targetRound =
      Number.isFinite(parsedRound) && parsedRound >= 1
        ? Math.trunc(parsedRound)
        : Math.max(1, schedule?.currentRound ?? 1);

    const matchDurationMinutes = parseDurationMinutes(
      responseContext.duration ?? null,
      DEFAULT_MATCH_DURATION_MINUTES
    );

    let defaultStartTime: string | null = null;
    if (targetRound > 1 && schedule?._id) {
      const gameTimings = await fetchScheduleGameTimings(schedule._id, schedule.rounds);
      defaultStartTime = resolveDefaultScheduleStartTime({
        targetRound,
        tournamentStartTime: responseContext.startTime,
        matchDurationMinutes,
        games: gameTimings,
        timeZone: resolveTournamentTimeZone(responseContext.timezone),
      });
    }

    const payload = mapScheduleViewResponse(responseContext, {
      currentRound: schedule?.currentRound ?? 0,
      totalRounds,
    }, {
      matchesPerPlayer: schedule?.matchesPerPlayer ?? null,
      startTime: defaultStartTime,
    });

    res.status(200).json(payload);
  } catch (err) {
    logger.error("Error fetching tournament schedule", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
