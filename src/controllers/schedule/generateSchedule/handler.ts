import mongoose from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule.js";
import Tournament from "../../../models/Tournament";
import type { GameStatus } from "../../../types/domain/game";
import {
  buildRoundPairs,
  ensureMinimumParticipants,
  type MatchPair,
} from "./pairingFromDemand";
import {
  computeMatchStartTime,
  getParticipantOrder,
} from "../shared/helpers";
import { parseDurationMinutes, resolveTimedGameStatus } from "../../../shared/matchTiming";
import { isValidIanaTimeZone, resolveTournamentTimeZone } from "../../../shared/timezone";
import type {
  GenerateScheduleBody,
  TournamentScheduleContext,
} from "../shared/types";
type ScheduleRoundEntryLike = {
  game: mongoose.Types.ObjectId;
  slot: number;
  round: number;
  mode: GenerateScheduleBody["mode"];
};

const DEFAULT_MATCH_DURATION_MINUTES = 60;
const DEFAULT_BREAK_TIME_MINUTES = 5;
const RESCHEDULE_WITH_SCORES_CONFIRMATION_PREFIX = "RESCHEDULE_WITH_SCORES_CONFIRMATION_REQUIRED:";

type ReplaceableGame = {
  _id: mongoose.Types.ObjectId;
  status: GameStatus;
  score?: { playerOneScores?: Array<number | "wo">; playerTwoScores?: Array<number | "wo"> } | null;
};

function hasScoresOrRelevantStatus(
  game: ReplaceableGame,
  includeActiveStatus: boolean
): boolean {
  const playerOneScores = game.score?.playerOneScores ?? [];
  const playerTwoScores = game.score?.playerTwoScores ?? [];
  const hasScoreValues = playerOneScores.length > 0 || playerTwoScores.length > 0;
  if (hasScoreValues || game.status === "pendingScore" || game.status === "finished") {
    return true;
  }
  return includeActiveStatus && game.status === "active";
}

async function ensurePreviousRoundFinished(
  scheduleDoc: {
    _id: mongoose.Types.ObjectId;
    rounds: ScheduleRoundEntryLike[];
  },
  targetRound: number,
  matchDurationMinutes: number,
  session: mongoose.ClientSession
) {
  if (targetRound <= 1) {
    return;
  }

  const previousRound = targetRound - 1;
  const previousRoundEntries = scheduleDoc.rounds.filter(
    (entry: ScheduleRoundEntryLike) => entry.round === previousRound
  );

  if (previousRoundEntries.length === 0) {
    throw new Error(
      `Round ${previousRound} has not been generated yet. Generate and complete it before creating round ${targetRound}.`
    );
  }

  const previousRoundGameIds = previousRoundEntries.map((entry) => entry.game);
  const previousRoundGames = await Game.find({
    _id: { $in: previousRoundGameIds },
    schedule: scheduleDoc._id,
  })
    .select("_id status startTime")
    .session(session)
    .lean<Array<{ _id: mongoose.Types.ObjectId; status: GameStatus; startTime?: Date | null }>>()
    .exec();

  const now = new Date();
  const updates: Array<{ id: mongoose.Types.ObjectId; status: GameStatus }> = [];
  const statusByGameId = new Map<string, GameStatus>();

  for (const game of previousRoundGames) {
    const nextStatus = resolveTimedGameStatus({
      persistedStatus: game.status,
      startTime: game.startTime ?? null,
      matchDurationMinutes,
      now,
    });

    statusByGameId.set(game._id.toString(), nextStatus);

    if (nextStatus !== game.status) {
      updates.push({ id: game._id, status: nextStatus });
    }
  }

  if (updates.length > 0) {
    await Game.bulkWrite(
      updates.map((entry) => ({
        updateOne: {
          filter: { _id: entry.id },
          update: { $set: { status: entry.status } },
        },
      })),
      { session }
    );
  }

  const hasUnfinishedMatch = previousRoundEntries.some((entry) => {
    const status = statusByGameId.get(entry.game.toString());
    // Tournament progression ignores cancelled matches.
    return status !== "finished" && status !== "cancelled";
  });

  if (hasUnfinishedMatch) {
    throw new Error(
      `Round ${previousRound} is not finished yet. Complete all match scores before generating round ${targetRound}.`
    );
  }
}

export async function persistScheduleRound(
  tournament: TournamentScheduleContext,
  body: GenerateScheduleBody
): Promise<{
  scheduleId: mongoose.Types.ObjectId;
  currentRound: number;
  generatedMatches: number;
}> {
  const session = await mongoose.startSession();
  let result: {
    scheduleId: mongoose.Types.ObjectId;
    currentRound: number;
    generatedMatches: number;
  } | null = null;

  try {
    await session.withTransaction(async () => {
      const freshTournament = await Tournament.findById(tournament._id)
        .select(
          "_id totalRounds tournamentMode date startTime endTime timezone duration breakDuration playMode participants club schedule"
        )
        .populate({
          path: "club",
          select: "_id",
          populate: {
            path: "courts",
            select: "_id name",
          },
        })
        .populate("participants", "name alias elo.rating elo.rd")
        .session(session)
        .lean<TournamentScheduleContext | null>()
        .exec();

      if (!freshTournament) {
        throw new Error("Tournament not found");
      }

      const availableCourtIds = new Set(
        (freshTournament.club?.courts ?? []).map((court) => court._id.toString())
      );
      const invalidCourtIds = body.courtIds.filter((courtId) => !availableCourtIds.has(courtId));
      if (invalidCourtIds.length > 0) {
        throw new Error(`Invalid courtIds provided: ${invalidCourtIds.join(", ")}`);
      }
      const uniqueCourtIds = [...new Set(body.courtIds)];
      if (uniqueCourtIds.length === 0) {
        throw new Error("At least one valid court must be selected");
      }

      const selectedParticipants = getParticipantOrder(
        body.participantOrder,
        freshTournament.participants
      );
      ensureMinimumParticipants(body.mode, selectedParticipants.length);

      let scheduleDoc = freshTournament.schedule
        ? await Schedule.findById(freshTournament.schedule).session(session).exec()
        : null;

      if (!scheduleDoc) {
        scheduleDoc = await Schedule.findOneAndUpdate(
          { tournament: freshTournament._id },
          {
            $setOnInsert: {
              tournament: freshTournament._id,
              currentRound: 0,
              matchesPerPlayer: body.matchesPerPlayer ?? 1,
              rounds: [],
              status: "draft",
            },
          },
          {
            upsert: true,
            returnDocument: "after",
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
      if (targetRound > freshTournament.totalRounds) {
        throw new Error(`Round ${targetRound} exceeds totalRounds limit (${freshTournament.totalRounds})`);
      }

      const existingRoundEntries = scheduleDoc.rounds.filter(
        (entry: ScheduleRoundEntryLike) => entry.round === targetRound
      );
      const isRoundRegeneration = existingRoundEntries.length > 0;

      const scheduleMatchDurationMinutes = parseDurationMinutes(
        scheduleDoc.matchDurationMinutes ?? null,
        undefined
      );
      const roundMatchDurationMinutes =
        scheduleMatchDurationMinutes ??
        parseDurationMinutes(freshTournament.duration ?? null, DEFAULT_MATCH_DURATION_MINUTES);

      const resolvedMatchesPerPlayer = body.matchesPerPlayer ?? scheduleDoc.matchesPerPlayer ?? 1;

      if (!isRoundRegeneration) {
        await ensurePreviousRoundFinished(
          scheduleDoc,
          targetRound,
          roundMatchDurationMinutes,
          session
        );
      }

      if (existingRoundEntries.length > 0) {
        const gamesToReplaceIds = existingRoundEntries.map(
          (entry: ScheduleRoundEntryLike) => entry.game
        );
        const gamesToReplace = await Game.find({
          _id: { $in: gamesToReplaceIds },
          schedule: scheduleDoc._id,
        })
          .select("_id status score")
          .session(session)
          .lean<ReplaceableGame[]>()
          .exec();

        const gamesWithRecordedScores = gamesToReplace.filter((game) =>
          hasScoresOrRelevantStatus(game, false)
        );

        const hasScoredGames = gamesWithRecordedScores.length > 0;
        if (hasScoredGames && body.allowRescheduleWithScores !== true) {
          throw new Error(
            `${RESCHEDULE_WITH_SCORES_CONFIRMATION_PREFIX} Round ${targetRound} has ${gamesWithRecordedScores.length} scored match(es). Confirm reschedule to preserve historical scores while replacing the active round schedule.`
          );
        }

        // historicalGamesToPreserve intentionally includes "active" games so history is retained,
        // while gamesWithRecordedScores drives only the confirmation prompt for scored/pending/finished games;
        // preserved active games are later cancelled and detached from schedule during regeneration.
        const historicalGamesToPreserve = gamesToReplace.filter((game) =>
          hasScoresOrRelevantStatus(game, true)
        );

        const historicalGameIdsToPreserve = new Set(
          historicalGamesToPreserve.map((game) => game._id.toString())
        );
        const gameIdsToDelete = gamesToReplace
          .filter((game) => !historicalGameIdsToPreserve.has(game._id.toString()))
          .map((game) => game._id);

        if (historicalGamesToPreserve.length > 0) {
          const entryByGameId = new Map(
            existingRoundEntries.map((e: ScheduleRoundEntryLike) => [e.game.toString(), e])
          );

          await Game.bulkWrite(
            historicalGamesToPreserve.map((game) => {
              const entry = entryByGameId.get(game._id.toString());
              const detachedRound = entry ? Math.trunc(entry.round) : undefined;
              const detachedSlot = entry ? Math.trunc(entry.slot) : undefined;
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

        if (gameIdsToDelete.length > 0) {
          await Game.deleteMany({
            _id: { $in: gameIdsToDelete },
            schedule: scheduleDoc._id,
          })
            .session(session)
            .exec();
        }

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

      const isScheduledTournament = freshTournament.tournamentMode === "singleDay";
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

      const matchesPerWave = Math.max(1, uniqueCourtIds.length);
      if (isScheduledTournament && !isValidIanaTimeZone(freshTournament.timezone)) {
        throw new Error(
          "Tournament timezone is missing or invalid. Update tournament settings before scheduling."
        );
      }
      const tournamentTimezone = isScheduledTournament
        ? (freshTournament.timezone as string)
        : resolveTournamentTimeZone(freshTournament.timezone);
      const participantsById = new Map(
        freshTournament.participants.map((participant) => [participant._id.toString(), participant])
      );

      const gameDocs = pairs.map((pair, index) => {
        const slot = Math.floor(index / matchesPerWave) + 1;
        const common = {
          court: new mongoose.Types.ObjectId(uniqueCourtIds[index % uniqueCourtIds.length]),
          tournament: freshTournament._id,
          schedule: scheduleDoc._id,
          score: {
            playerOneScores: [],
            playerTwoScores: [],
          },
          startTime: computeMatchStartTime(
            freshTournament.date,
            body.startTime,
            slot,
            {
              matchDurationMinutes: resolvedMatchDurationMinutes,
              breakTimeMinutes: resolvedBreakTimeMinutes,
            },
            {
              windowEndTime: freshTournament.endTime ?? null,
              tournamentTimezone,
            }
          ),
          status: "draft" as const,
          gameMode: "tournament" as const,
          playMode: freshTournament.playMode,
        };

        const toSnapshot = (playerId: mongoose.Types.ObjectId) => {
          const participant = participantsById.get(playerId.toString());
          const participantRating = participant?.elo?.rating;
          const participantRd = participant?.elo?.rd;
          const rating = Number.isFinite(participantRating) ? participantRating : 1500;
          const rd = Number.isFinite(participantRd) ? participantRd : 200;
          return { player: playerId, rating, rd };
        };

        if (pair.kind === "singles") {
          return {
            ...common,
            matchType: "singles" as const,
            side1: { players: [pair.teamOne[0]], playerSnapshots: [toSnapshot(pair.teamOne[0])] },
            side2: { players: [pair.teamTwo[0]], playerSnapshots: [toSnapshot(pair.teamTwo[0])] },
          };
        }

        return {
          ...common,
          matchType: "doubles" as const,
          side1: {
            players: [pair.teamOne[0], pair.teamOne[1]],
            playerSnapshots: [toSnapshot(pair.teamOne[0]), toSnapshot(pair.teamOne[1])],
          },
          side2: {
            players: [pair.teamTwo[0], pair.teamTwo[1]],
            playerSnapshots: [toSnapshot(pair.teamTwo[0]), toSnapshot(pair.teamTwo[1])],
          },
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
        matchesPerPlayer: resolvedMatchesPerPlayer,
        completedAt: null,
      };

      if (isScheduledTournament) {
        tournamentSet.duration = resolvedMatchDurationMinutes;
        tournamentSet.breakDuration = resolvedBreakTimeMinutes;
      }

      await Tournament.updateOne(
        { _id: freshTournament._id },
        {
          $set: tournamentSet,
        },
        { session }
      ).exec();

      if (targetRound === 1) {
        await Tournament.updateOne(
          {
            _id: freshTournament._id,
            $or: [
              { firstRoundScheduledAt: { $exists: false } },
              { firstRoundScheduledAt: null },
            ],
          },
          { $set: { firstRoundScheduledAt: new Date() } },
          { session }
        ).exec();
      }

      result = {
        scheduleId: scheduleDoc._id,
        currentRound: scheduleDoc.currentRound,
        generatedMatches: createdGames.length,
      };
    });
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new Error("Failed to persist tournament schedule round");
  }

  return result;
}
