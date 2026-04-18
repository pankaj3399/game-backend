import mongoose from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import { computeMatchStartTime, getParticipantOrder } from "../shared/helpers";
import {
  DEFAULT_BREAK_TIME_MINUTES,
  DEFAULT_MATCH_DURATION_MINUTES,
} from "../shared/constants";
import { parseDurationMinutes } from "../../../shared/matchTiming";
import type { GenerateScheduleBody, TournamentScheduleContext } from "../shared/types";
import { ensurePreviousRoundFinished } from "./ensurePreviousRoundFinished";
import { buildRoundPairs, ensureMinimumParticipants } from "./pairingFromDemand";

type ScheduleRoundEntryLike = {
  game: mongoose.Types.ObjectId;
  slot: number;
  round: number;
  mode: GenerateScheduleBody["mode"];
};

export async function persistSinglesScheduleRound(
  tournament: TournamentScheduleContext,
  body: GenerateScheduleBody
) {
  const availableCourtIds = new Set(
    (tournament.club?.courts ?? []).map((court) => court._id.toString())
  );
  const selectedCourtIds = body.courtIds.filter((courtId) => availableCourtIds.has(courtId));
  if (selectedCourtIds.length === 0) {
    throw new Error("At least one valid court must be selected");
  }

  const selectedParticipants = getParticipantOrder(body.participantOrder, tournament.participants);
  ensureMinimumParticipants(body.mode, selectedParticipants.length);

  const session = await mongoose.startSession();

  try {
    const persisted = await session.withTransaction(async () => {
      let scheduleDoc = tournament.schedule
        ? await Schedule.findById(tournament.schedule).session(session).exec()
        : null;

      if (!scheduleDoc) {
        scheduleDoc = await Schedule.findOneAndUpdate(
          { tournament: tournament._id },
          {
            $setOnInsert: {
              tournament: tournament._id,
              currentRound: 0,
              rounds: [],
              status: "draft",
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
            runValidators: true,
            session,
          }
        ).exec();
      }

      if (!scheduleDoc) {
        throw new Error("Unable to initialize tournament schedule");
      }

      const targetRound = body.round;
      if (targetRound > tournament.totalRounds) {
        throw new Error(`Round ${targetRound} exceeds totalRounds limit (${tournament.totalRounds})`);
      }

      const roundMatchDurationMinutes =
        typeof scheduleDoc.matchDurationMinutes === "number" && Number.isFinite(scheduleDoc.matchDurationMinutes)
          ? Math.max(5, Math.trunc(scheduleDoc.matchDurationMinutes))
          : parseDurationMinutes(tournament.duration, DEFAULT_MATCH_DURATION_MINUTES);

      await ensurePreviousRoundFinished(
        scheduleDoc,
        targetRound,
        roundMatchDurationMinutes,
        session
      );

      const existingRoundEntries = scheduleDoc.rounds.filter(
        (entry: ScheduleRoundEntryLike) => entry.round === targetRound
      );

      if (existingRoundEntries.length > 0) {
        const gamesToReplaceIds = existingRoundEntries.map(
          (entry: ScheduleRoundEntryLike) => entry.game
        );
        const finishedCount = await Game.countDocuments({
          _id: { $in: gamesToReplaceIds },
          status: "finished",
        })
          .session(session)
          .exec();
        if (finishedCount > 0) {
          throw new Error(
            "Cannot regenerate this round: one or more matches are already finished"
          );
        }

        await Game.deleteMany({
          _id: { $in: gamesToReplaceIds },
          schedule: scheduleDoc._id,
        })
          .session(session)
          .exec();

        scheduleDoc.rounds = scheduleDoc.rounds.filter(
          (entry: ScheduleRoundEntryLike) => entry.round !== targetRound
        );
      }

      const { pairs } = buildRoundPairs(
        selectedParticipants,
        body.mode,
        body.matchesPerPlayer,
        targetRound
      );

      const isScheduledTournament = tournament.tournamentMode === "singleDay";
      const resolvedMatchDurationMinutes =
        body.matchDurationMinutes ?? DEFAULT_MATCH_DURATION_MINUTES;
      const resolvedBreakTimeMinutes =
        body.breakTimeMinutes ?? DEFAULT_BREAK_TIME_MINUTES;

      if (isScheduledTournament) {
        if (
          typeof body.matchDurationMinutes !== "number" ||
          typeof body.breakTimeMinutes !== "number"
        ) {
          throw new Error(
            "matchDurationMinutes and breakTimeMinutes are required for scheduled tournaments"
          );
        }
      }

      if (pairs.length === 0) {
        throw new Error("At least one match is required to generate a schedule round");
      }

      const matchesPerWave = Math.max(1, selectedCourtIds.length);

      const gameDocs = pairs.map((pair, index) => {
        const slot = Math.floor(index / matchesPerWave) + 1;
        const common = {
          court: new mongoose.Types.ObjectId(selectedCourtIds[index % selectedCourtIds.length]),
          tournament: tournament._id,
          schedule: scheduleDoc._id,
          score: {
            playerOneScores: [],
            playerTwoScores: [],
          },
          startTime: computeMatchStartTime(
            tournament.date,
            body.startTime,
            slot,
            {
              matchDurationMinutes: resolvedMatchDurationMinutes,
              breakTimeMinutes: resolvedBreakTimeMinutes,
            }
          ),
          status: "draft" as const,
          gameMode: "tournament" as const,
          playMode: tournament.playMode,
        };

        if (pair.kind === "singles") {
          return {
            ...common,
            matchType: "singles" as const,
            teams: [
              { players: [pair.teamOne[0]] },
              { players: [pair.teamTwo[0]] },
            ],
          };
        }

        return {
          ...common,
          matchType: "doubles" as const,
          teams: [
            { players: [pair.teamOne[0], pair.teamOne[1]] },
            { players: [pair.teamTwo[0], pair.teamTwo[1]] },
          ],
        };
      });

      const createdGames = await Game.insertMany(gameDocs, { ordered: true, session });

      const newRoundEntries = createdGames.map((game, index) => ({
        game: game._id,
        mode: body.mode,
        slot: Math.floor(index / matchesPerWave) + 1,
        round: targetRound,
      }));

      scheduleDoc.rounds.push(...newRoundEntries);
      scheduleDoc.rounds.sort((left: ScheduleRoundEntryLike, right: ScheduleRoundEntryLike) => {
        if (left.round !== right.round) {
          return left.round - right.round;
        }
        return left.slot - right.slot;
      });

      scheduleDoc.currentRound = Math.max(scheduleDoc.currentRound, targetRound);
      scheduleDoc.status = "active";
      scheduleDoc.matchDurationMinutes = isScheduledTournament
        ? resolvedMatchDurationMinutes
        : null;
      scheduleDoc.breakTimeMinutes = isScheduledTournament
        ? resolvedBreakTimeMinutes
        : null;
      await scheduleDoc.save({ session });

      const tournamentSet: Record<string, unknown> = {
        schedule: scheduleDoc._id,
        startTime: body.startTime,
        matchesPerPlayer: body.matchesPerPlayer,
        completedAt: null,
      };

      if (isScheduledTournament) {
        tournamentSet.duration = `${resolvedMatchDurationMinutes} min`;
        tournamentSet.breakDuration = `${resolvedBreakTimeMinutes} min`;
      }

      await Tournament.updateOne(
        { _id: tournament._id },
        {
          $set: tournamentSet,
        },
        { session }
      ).exec();

      if (targetRound === 1) {
        await Tournament.updateOne(
          {
            _id: tournament._id,
            $or: [
              { firstRoundScheduledAt: { $exists: false } },
              { firstRoundScheduledAt: null },
            ],
          },
          { $set: { firstRoundScheduledAt: new Date() } },
          { session }
        ).exec();
      }

      return {
        scheduleId: scheduleDoc._id,
        currentRound: scheduleDoc.currentRound,
        generatedMatches: createdGames.length,
      };
    });

    if (!persisted) {
      throw new Error("Failed to persist tournament schedule round");
    }

    return persisted;
  } finally {
    await session.endSession();
  }
}
