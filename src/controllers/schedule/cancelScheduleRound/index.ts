import type { Response } from "express";
import mongoose from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import { guardIdParam } from "../../../shared/guards";
import { authorizeScheduleAccess } from "../shared/authorize";
import { fetchTournamentScheduleContext } from "../shared/queries";

/**
 * DELETE /api/schedule/:id/round/:round
 * Cancels an already generated round by removing its round entries and linked matches.
 */
export async function cancelScheduleRound(req: AuthenticatedRequest, res: Response) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const roundParam = Array.isArray(req.params.round)
      ? req.params.round[0]
      : req.params.round;
    if (typeof roundParam !== "string" || !/^[1-9]\d*$/.test(roundParam)) {
      res.status(400).json(buildErrorPayload("Invalid round parameter"));
      return;
    }
    const roundRaw = Number.parseInt(roundParam, 10);
    const round = Number.isFinite(roundRaw) ? Math.trunc(roundRaw) : Number.NaN;
    if (!Number.isFinite(round) || round < 1) {
      res.status(400).json(buildErrorPayload("Invalid round parameter"));
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

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const latestTournament = await Tournament.findById(idResult.data)
          .select("_id schedule")
          .session(session)
          .lean<{ _id: mongoose.Types.ObjectId; schedule: mongoose.Types.ObjectId | null }>()
          .exec();

        if (!latestTournament) {
          throw new Error("Tournament not found");
        }

        const scheduleId = tournament.schedule ?? null;
        const latestScheduleId = latestTournament.schedule ?? null;
        if (
          !scheduleId ||
          !latestScheduleId ||
          scheduleId.toString() !== latestScheduleId.toString()
        ) {
          throw new Error("Tournament schedule changed concurrently. Please retry.");
        }

        const scheduleDoc = await Schedule.findById(scheduleId).session(session).exec();
        if (!scheduleDoc) {
          throw new Error("No active schedule found for this tournament");
        }

        const roundEntries = scheduleDoc.rounds.filter((entry) => entry.round === round);
        if (roundEntries.length === 0) {
          throw new Error(`Round ${round} has not been generated yet.`);
        }

        const gameIds = roundEntries.map((entry) => entry.game);
        if (gameIds.length > 0) {
          const gamesToDetach = await Game.find({
            _id: { $in: gameIds },
            schedule: scheduleDoc._id,
          })
            .select("_id status")
            .session(session)
            .lean<Array<{ _id: mongoose.Types.ObjectId; status: string }>>()
            .exec();

          const entryByGameId = new Map(
            roundEntries.map((entry) => [entry.game.toString(), entry])
          );

          await Game.bulkWrite(
            gamesToDetach.map((game) => {
              const entry = entryByGameId.get(game._id.toString());
              const detachedRound = entry ? Math.trunc(entry.round) : round;
              const detachedSlot = entry ? Math.trunc(entry.slot) : 1;
              return {
                updateOne: {
                  filter: { _id: game._id },
                  update: {
                    $unset: { schedule: "" },
                    $set: {
                      status: game.status === "finished" ? "finished" : "cancelled",
                      isHistorical: true,
                      detachedFromRound: detachedRound,
                      detachedFromSlot: detachedSlot,
                      detachedFromScheduleAt: new Date(),
                    },
                  },
                },
              };
            }),
            { session }
          );
        }

        scheduleDoc.rounds = scheduleDoc.rounds.filter((entry) => entry.round !== round);
        const remainingRounds = scheduleDoc.rounds.map((entry) => Math.trunc(entry.round));
        scheduleDoc.currentRound =
          remainingRounds.length > 0 ? Math.max(...remainingRounds) : 0;
        scheduleDoc.status = scheduleDoc.rounds.length > 0 ? "active" : "draft";
        await scheduleDoc.save({ session });
      });
    } finally {
      await session.endSession();
    }

    res.status(200).json({
      message: `Round ${round} schedule cancelled`,
      round,
    });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Failed to cancel schedule round";
    let status = 500;
    if (message === "Tournament schedule changed concurrently. Please retry.") {
      status = 409;
    } else if (
      message === "Invalid round parameter" ||
      message === "No active schedule found for this tournament" ||
      (message.startsWith("Round ") && message.endsWith("has not been generated yet."))
    ) {
      status = 400;
    }
    const safeMessage = status === 500 ? "Internal server error" : message;
    res.status(status).json(buildErrorPayload(safeMessage));
  }
}
