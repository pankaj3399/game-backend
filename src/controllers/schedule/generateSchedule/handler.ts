import mongoose, { type Types } from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import { computeMatchStartTime, getParticipantOrder } from "../shared/helpers";
import {
  DEFAULT_BREAK_TIME_MINUTES,
  DEFAULT_MATCH_DURATION_MINUTES,
} from "../shared/constants";
import { resolveTimedGameStatus } from "../../../shared/matchTiming";
import type { GenerateScheduleBody, TournamentScheduleContext } from "../shared/types";
import { ensurePreviousRoundFinished } from "./ensurePreviousRoundFinished";
import { buildRoundPairs, ensureMinimumParticipants, type MatchPair } from "./pairingFromDemand";

type ScheduleRoundEntryLike = {
  game: mongoose.Types.ObjectId;
  slot: number;
  round: number;
  mode: GenerateScheduleBody["mode"];
};

type PairSlotAssignment = {
  slot: number;
  courtIndex: number;
};

function getPairParticipantIds(pair: MatchPair): string[] {
  if (pair.kind === "singles") {
    return [pair.teamOne[0].toString(), pair.teamTwo[0].toString()];
  }

  return [
    pair.teamOne[0].toString(),
    pair.teamOne[1].toString(),
    pair.teamTwo[0].toString(),
    pair.teamTwo[1].toString(),
  ];
}

function buildPairSlotAssignments(pairs: MatchPair[], courtCount: number): PairSlotAssignment[] {
  const assignments: PairSlotAssignment[] = [];
  const slotState = new Map<number, { usedCourts: number; participantIds: Set<string> }>();
  const safeCourtCount = Math.max(1, courtCount);

  for (const pair of pairs) {
    const participantIds = getPairParticipantIds(pair);
    let assigned = false;

    for (let slot = 1; !assigned; slot += 1) {
      const state = slotState.get(slot);
      const usedCourts = state?.usedCourts ?? 0;
      const participantSet = state?.participantIds ?? new Set<string>();

      if (usedCourts >= safeCourtCount) {
        continue;
      }

      const hasConflict = participantIds.some((participantId) => participantSet.has(participantId));
      if (hasConflict) {
        continue;
      }

      const assignment: PairSlotAssignment = {
        slot,
        courtIndex: usedCourts,
      };

      const acceptedState = state ?? { usedCourts, participantIds: participantSet };
      slotState.set(slot, acceptedState);
      acceptedState.usedCourts += 1;
      for (const participantId of participantIds) {
        acceptedState.participantIds.add(participantId);
      }

      assignments.push(assignment);
      assigned = true;
    }
  }

  return assignments;
}

export async function persistScheduleRound(
  tournament: TournamentScheduleContext,
  body: GenerateScheduleBody
): Promise<{
  scheduleId: Types.ObjectId;
  currentRound: number;
  generatedMatches: number;
}> {
  const availableCourtIds = new Set(
    (tournament.club?.courts ?? []).map((court) => court._id.toString())
  );
  const selectedCourtIds = body.courtIds.filter((courtId) => availableCourtIds.has(courtId));
  const uniqueCourtIds = [...new Set(selectedCourtIds)];
  if (uniqueCourtIds.length === 0) {
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

      const resolvedMatchesPerPlayer =
        body.matchesPerPlayer ?? scheduleDoc.matchesPerPlayer ?? 1;

      const targetRound = body.round;
      if (targetRound > tournament.totalRounds) {
        throw new Error(`Round ${targetRound} exceeds totalRounds limit (${tournament.totalRounds})`);
      }

      const roundMatchDurationMinutes =
        scheduleDoc.matchDurationMinutes ?? tournament.duration ?? DEFAULT_MATCH_DURATION_MINUTES;

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
        const lockedMatchesCount = await Game.countDocuments({
          _id: { $in: gamesToReplaceIds },
          status: { $in: ["finished", "pendingScore", "cancelled"] },
        })
          .session(session)
          .exec();
        if (lockedMatchesCount > 0) {
          throw new Error(
            "Cannot regenerate this round: one or more matches are already completed or awaiting score submission"
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
        resolvedMatchesPerPlayer,
        targetRound
      );

      const isScheduledTournament = tournament.tournamentMode === "singleDay";
      const resolvedMatchDurationMinutes =
        body.matchDurationMinutes ?? DEFAULT_MATCH_DURATION_MINUTES;
      const resolvedBreakTimeMinutes =
        body.breakTimeMinutes ?? DEFAULT_BREAK_TIME_MINUTES;

      if (isScheduledTournament) {
        if (
          body.matchDurationMinutes == null ||
          body.breakTimeMinutes == null
        ) {
          throw new Error(
            "matchDurationMinutes and breakTimeMinutes are required for scheduled tournaments"
          );
        }
      }

      if (pairs.length === 0) {
        throw new Error("At least one match is required to generate a schedule round");
      }

      const pairSlotAssignments = buildPairSlotAssignments(pairs, uniqueCourtIds.length);
      const generationTimestamp = new Date();

      const gameDocs = pairs.map((pair, index) => {
        const assignment = pairSlotAssignments[index];
        if (!assignment) {
          throw new Error("Failed to assign schedule slot for one or more matches");
        }

        const slot = assignment.slot;
        const startTime = computeMatchStartTime(
          tournament.date,
          body.startTime,
          slot,
          {
            matchDurationMinutes: resolvedMatchDurationMinutes,
            breakTimeMinutes: resolvedBreakTimeMinutes,
          }
        );

        const status = resolveTimedGameStatus({
          persistedStatus: "draft",
          startTime,
          matchDurationMinutes: resolvedMatchDurationMinutes,
          now: generationTimestamp,
        });

        const common = {
          court: new mongoose.Types.ObjectId(uniqueCourtIds[assignment.courtIndex]),
          tournament: tournament._id,
          schedule: scheduleDoc._id,
          score: {
            playerOneScores: [],
            playerTwoScores: [],
          },
          startTime,
          status,
          gameMode: "tournament" as const,
          playMode: tournament.playMode,
        };

        if (pair.kind === "singles") {
          return {
            ...common,
            matchType: "singles" as const,
            side1: { players: [pair.teamOne[0]] },
            side2: { players: [pair.teamTwo[0]] },
          };
        }

        return {
          ...common,
          matchType: "doubles" as const,
          side1: { players: [pair.teamOne[0], pair.teamOne[1]] },
          side2: { players: [pair.teamTwo[0], pair.teamTwo[1]] },
        };
      });

      const createdGames = await Game.insertMany(gameDocs, { ordered: true, session });

      const newRoundEntries = createdGames.map((game, index) => ({
        game: game._id,
        mode: body.mode,
        slot: pairSlotAssignments[index]?.slot ?? 1,
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
      scheduleDoc.matchesPerPlayer = resolvedMatchesPerPlayer;
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
        completedAt: null,
      };

      if (isScheduledTournament) {
        tournamentSet.duration = resolvedMatchDurationMinutes;
        tournamentSet.breakDuration = resolvedBreakTimeMinutes;
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
