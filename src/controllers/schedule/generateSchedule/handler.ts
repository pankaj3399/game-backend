import mongoose from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule.js";
import Tournament from "../../../models/Tournament";
import User from "../../../models/User";
import { DEFAULT_ELO } from "../../../lib/config";
import type { GameStatus } from "../../../types/domain/game";
import { recomputeTournamentGlickoRatingsThroughRound } from "../../tournament/recordMatchScore/recomputeTournamentGlickoRatings";
import {
  buildRoundPairs,
  ensureMinimumParticipants,
  type MatchPair,
} from "./pairingFromDemand";
import {
  computeMatchStartTime,
  getParticipantOrder,
} from "../shared/helpers";
import { parseDurationMinutes } from "../../../shared/matchTiming";
import { isValidIanaTimeZone, resolveTournamentTimeZone } from "../../../shared/timezone";
import { ensurePreviousRoundFinished } from "./ensurePreviousRoundFinished";
import type {
  GenerateScheduleBody,
  ScheduleParticipantInfo,
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
  side1?: { playerSnapshots?: Array<{ player: mongoose.Types.ObjectId; rating: number; rd: number; vol?: number; tau?: number }> } | null;
  side2?: { playerSnapshots?: Array<{ player: mongoose.Types.ObjectId; rating: number; rd: number; vol?: number; tau?: number }> } | null;
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
        .populate("participants", "name alias elo.rating elo.rd elo.vol elo.tau")
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
      if (isRoundRegeneration && targetRound !== scheduleDoc.currentRound) {
        throw new Error(
          `Cannot regenerate round ${targetRound} while later rounds exist. Cancel later rounds first.`
        );
      }

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

        if (targetRound > 1) {
          await recomputeTournamentGlickoRatingsThroughRound(scheduleDoc._id, targetRound - 1, {
            session,
          });
        }
      }

      if (existingRoundEntries.length > 0) {
        const gamesToReplaceIds = existingRoundEntries.map(
          (entry: ScheduleRoundEntryLike) => entry.game
        );
        const gamesToReplace = await Game.find({
          _id: { $in: gamesToReplaceIds },
          schedule: scheduleDoc._id,
        })
          .select("_id status score side1.playerSnapshots side2.playerSnapshots")
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

        if (targetRound === 1) {
          const baselineByUserId = new Map<string, { rating: number; rd: number; vol?: number; tau?: number }>();
          for (const game of gamesToReplace) {
            const snapshots = [
              ...(game.side1?.playerSnapshots ?? []),
              ...(game.side2?.playerSnapshots ?? []),
            ];
            for (const snapshot of snapshots) {
              baselineByUserId.set(snapshot.player.toString(), {
                rating: snapshot.rating,
                rd: snapshot.rd,
                vol: snapshot.vol,
                tau: snapshot.tau,
              });
            }
          }

          if (baselineByUserId.size > 0) {
            await User.bulkWrite(
              [...baselineByUserId.entries()].map(([userId, rating]) => ({
                updateOne: {
                  filter: { _id: userId },
                  update: {
                    $set: {
                      "elo.rating": rating.rating,
                      "elo.rd": rating.rd,
                      "elo.vol": Number.isFinite(rating.vol) && rating.vol! > 0 ? rating.vol : DEFAULT_ELO.vol,
                      "elo.tau": Number.isFinite(rating.tau) && rating.tau! > 0 ? rating.tau : DEFAULT_ELO.tau,
                    },
                  },
                },
              })),
              { session }
            );
          }
        }
      }

      if (isRoundRegeneration && targetRound > 1) {
        await recomputeTournamentGlickoRatingsThroughRound(scheduleDoc._id, targetRound - 1, {
          session,
        });
      }

      const participantIds = freshTournament.participants.map((participant) => participant._id);
      const latestParticipants = await User.find({ _id: { $in: participantIds } })
        .select("name alias elo.rating elo.rd elo.vol elo.tau")
        .session(session)
        .lean<ScheduleParticipantInfo[]>()
        .exec();
      const selectedParticipants = getParticipantOrder(
        body.participantOrder,
        latestParticipants
      );
      ensureMinimumParticipants(body.mode, selectedParticipants.length);

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
        latestParticipants.map((participant) => [participant._id.toString(), participant])
      );

      type SlotAssignment = { slot: number; courtId: string };

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

      /**
       * Assign matches to simultaneous slots such that no participant appears in
       * more than one match in the same slot (prevents "A/B vs A/C" happening at once).
       */
      const slots: Array<{ usedPlayers: Set<string>; matchCount: number }> = [];
      const slotAssignments: SlotAssignment[] = new Array(pairs.length);

      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
        const pair = pairs[pairIndex];
        const pairParticipantIds = Array.from(new Set(getPairParticipantIds(pair)));

        let placed = false;
        for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
          const slot = slots[slotIndex];
          if (slot.matchCount >= matchesPerWave) {
            continue;
          }

          const hasConflicts = pairParticipantIds.some((participantId) =>
            slot.usedPlayers.has(participantId)
          );
          if (hasConflicts) {
            continue;
          }

          const courtLocalIndex = slot.matchCount;
          slot.matchCount += 1;
          pairParticipantIds.forEach((participantId) => slot.usedPlayers.add(participantId));

          slotAssignments[pairIndex] = {
            slot: slotIndex + 1,
            courtId: uniqueCourtIds[courtLocalIndex],
          };
          placed = true;
          break;
        }

        if (!placed) {
          const newSlotIndex = slots.length;
          slots.push({ usedPlayers: new Set(pairParticipantIds), matchCount: 1 });
          slotAssignments[pairIndex] = {
            slot: newSlotIndex + 1,
            courtId: uniqueCourtIds[0],
          };
        }
      }

      const gameDocs = pairs.map((pair, index) => {
        const { slot, courtId } = slotAssignments[index]!;
        const common = {
          court: new mongoose.Types.ObjectId(courtId),
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
          const participantVol = participant?.elo?.vol;
          const participantTau = participant?.elo?.tau;
          const rating = Number.isFinite(participantRating) ? participantRating : 1500;
          const rd = Number.isFinite(participantRd) ? participantRd : 200;
          const vol = Number.isFinite(participantVol) && participantVol! > 0 ? participantVol! : 0.06;
          const tau = Number.isFinite(participantTau) && participantTau! > 0 ? participantTau! : 0.5;
          return { player: playerId, rating, rd, vol, tau };
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
        slot: slotAssignments[index]!.slot,
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
