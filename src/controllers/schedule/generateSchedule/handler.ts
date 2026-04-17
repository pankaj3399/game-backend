import mongoose from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule.js";
import Tournament from "../../../models/Tournament";
import type { GameStatus } from "../../../types/domain/game";
import {
  computeMatchStartTime,
  getParticipantOrder,
} from "../shared/helpers";
import { parseDurationMinutes, resolveTimedGameStatus } from "../../../shared/matchTiming";
import type {
  GenerateScheduleBody,
  ScheduleParticipantInfo,
  ScheduleMode,
  TournamentScheduleContext,
} from "../shared/types";

interface SinglesMatchPair {
  kind: "singles";
  teamOne: [mongoose.Types.ObjectId];
  teamTwo: [mongoose.Types.ObjectId];
}

interface DoublesMatchPair {
  kind: "doubles";
  teamOne: [mongoose.Types.ObjectId, mongoose.Types.ObjectId];
  teamTwo: [mongoose.Types.ObjectId, mongoose.Types.ObjectId];
}

type MatchPair = SinglesMatchPair | DoublesMatchPair;
type ScheduleRoundEntryLike = {
  game: mongoose.Types.ObjectId;
  slot: number;
  round: number;
  mode: ScheduleMode;
};

const DEFAULT_MATCH_DURATION_MINUTES = 60;
const DEFAULT_BREAK_TIME_MINUTES = 5;

function ensureMinimumParticipants(mode: ScheduleMode, count: number) {
  if (mode === "singles" && count < 2) {
    throw new Error("At least two participants are required for singles scheduling");
  }
  if (mode === "doubles" && count < 4) {
    throw new Error("At least four participants are required for doubles scheduling");
  }
}

function selectExtraRecipients(participantIds: string[], extrasNeeded: number, roundSeed: number) {
  if (extrasNeeded <= 0 || participantIds.length === 0) {
    return [] as string[];
  }

  const indexed = participantIds.map((id, index) => ({ id, index, rotated: 0 }));
  const seed = ((Math.trunc(roundSeed) % participantIds.length) + participantIds.length) % participantIds.length;

  for (const item of indexed) {
    item.rotated = (item.index - seed + participantIds.length) % participantIds.length;
  }

  indexed.sort((left, right) => left.rotated - right.rotated || left.id.localeCompare(right.id));

  return indexed.slice(0, Math.min(extrasNeeded, indexed.length)).map((item) => item.id);
}

function getDemandForRound(
  participants: ScheduleParticipantInfo[],
  mode: ScheduleMode,
  matchesPerPlayer: number,
  roundSeed: number
) {
  const participantIds = participants.map((participant) => participant._id.toString());
  const demandById = new Map<string, number>();
  for (const participantId of participantIds) {
    demandById.set(participantId, matchesPerPlayer);
  }

  const baseAppearances = participantIds.length * matchesPerPlayer;
  const bucketSize = mode === "singles" ? 2 : 4;
  let extrasNeeded = (bucketSize - (baseAppearances % bucketSize)) % bucketSize;

  if (mode === "singles" && participantIds.length % 2 === 1) {
    // With an odd field in singles, we force one additional appearance to avoid a recurring bye.
    extrasNeeded = extrasNeeded === 0 ? 1 : extrasNeeded;
    if ((baseAppearances + extrasNeeded) % bucketSize !== 0) {
      extrasNeeded += 1;
    }
  }

  const extraRecipients = selectExtraRecipients(participantIds, extrasNeeded, roundSeed);

  for (const playerId of extraRecipients) {
    const current = demandById.get(playerId) ?? matchesPerPlayer;
    demandById.set(playerId, current + 1);
  }

  return {
    demandById,
    totalAppearances: [...demandById.values()].reduce((sum, value) => sum + value, 0),
  };
}

function nextHighestDemand(
  demandById: Map<string, number>,
  participantIndex: Map<string, number>,
  excluded: Set<string>,
  preferredPairKey?: string,
  pairCounts?: Map<string, number>
) {
  const candidates = [...demandById.entries()]
    .filter(([id, demand]) => demand > 0 && !excluded.has(id))
    .map(([id, demand]) => ({ id, demand }));

  candidates.sort((left, right) => {
    if (left.demand !== right.demand) {
      return right.demand - left.demand;
    }

    if (preferredPairKey && pairCounts) {
      const leftPairCount = pairCounts.get(`${preferredPairKey}:${left.id}`) ?? pairCounts.get(`${left.id}:${preferredPairKey}`) ?? 0;
      const rightPairCount = pairCounts.get(`${preferredPairKey}:${right.id}`) ?? pairCounts.get(`${right.id}:${preferredPairKey}`) ?? 0;
      if (leftPairCount !== rightPairCount) {
        return leftPairCount - rightPairCount;
      }
    }

    const leftIndex = participantIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = participantIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.id.localeCompare(right.id);
  });

  return candidates[0]?.id ?? null;
}

function decrementDemand(demandById: Map<string, number>, playerId: string) {
  const next = (demandById.get(playerId) ?? 0) - 1;
  if (next <= 0) {
    demandById.delete(playerId);
    return;
  }
  demandById.set(playerId, next);
}

function buildSinglesPairs(participants: ScheduleParticipantInfo[], demandById: Map<string, number>) {
  const byId = new Map(participants.map((participant) => [participant._id.toString(), participant]));
  const participantIndex = new Map(participants.map((participant, index) => [participant._id.toString(), index]));
  const pairCounts = new Map<string, number>();
  const pairs: SinglesMatchPair[] = [];

  while (demandById.size > 0) {
    const playerOneId = nextHighestDemand(demandById, participantIndex, new Set<string>());
    if (!playerOneId) {
      break;
    }

    const playerTwoId = nextHighestDemand(
      demandById,
      participantIndex,
      new Set([playerOneId]),
      playerOneId,
      pairCounts
    );

    if (!playerTwoId) {
      throw new Error("Unable to complete singles pairing with current constraints");
    }

    const playerOne = byId.get(playerOneId);
    const playerTwo = byId.get(playerTwoId);
    if (!playerOne || !playerTwo) {
      throw new Error("Unable to resolve singles participants for pairing");
    }

    pairs.push({
      kind: "singles",
      teamOne: [playerOne._id],
      teamTwo: [playerTwo._id],
    });

    decrementDemand(demandById, playerOneId);
    decrementDemand(demandById, playerTwoId);

    const key = playerOneId < playerTwoId ? `${playerOneId}:${playerTwoId}` : `${playerTwoId}:${playerOneId}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  return pairs;
}

function buildDoublesPairs(participants: ScheduleParticipantInfo[], demandById: Map<string, number>) {
  const byId = new Map(participants.map((participant) => [participant._id.toString(), participant]));
  const participantIndex = new Map(participants.map((participant, index) => [participant._id.toString(), index]));
  const pairs: DoublesMatchPair[] = [];

  while (demandById.size > 0) {
    const selected: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const next = nextHighestDemand(demandById, participantIndex, new Set(selected));
      if (!next) {
        throw new Error("Unable to complete doubles pairing with current constraints");
      }
      selected.push(next);
    }

    const [a, b, c, d] = selected;
    const playerA = byId.get(a);
    const playerB = byId.get(b);
    const playerC = byId.get(c);
    const playerD = byId.get(d);

    if (!playerA || !playerB || !playerC || !playerD) {
      throw new Error("Unable to resolve doubles participants for pairing");
    }

    // Snake team split keeps rating/order balance tighter than adjacent pairing.
    pairs.push({
      kind: "doubles",
      teamOne: [playerA._id, playerD._id],
      teamTwo: [playerB._id, playerC._id],
    });

    decrementDemand(demandById, a);
    decrementDemand(demandById, b);
    decrementDemand(demandById, c);
    decrementDemand(demandById, d);
  }

  return pairs;
}

function buildRoundPairs(
  participants: ScheduleParticipantInfo[],
  mode: ScheduleMode,
  matchesPerPlayer: number,
  round: number
) {
  const { demandById, totalAppearances } = getDemandForRound(
    participants,
    mode,
    matchesPerPlayer,
    round
  );

  const bucket = mode === "singles" ? 2 : 4;
  if (totalAppearances % bucket !== 0) {
    throw new Error("Unable to distribute matches per player with current participants");
  }

  const pairs =
    mode === "singles"
      ? buildSinglesPairs(participants, demandById)
      : buildDoublesPairs(participants, demandById);

  return { pairs };
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
    return status !== "finished";
  });

  if (hasUnfinishedMatch) {
    throw new Error(
      `Round ${previousRound} is not finished yet. Complete all match scores before generating round ${targetRound}.`
    );
  }
}

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
  let result: {
    scheduleId: mongoose.Types.ObjectId;
    currentRound: number;
    generatedMatches: number;
  } | null = null;

  try {
    await session.withTransaction(async () => {
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
          ? Math.max(1, Math.trunc(scheduleDoc.matchDurationMinutes))
          : parseDurationMinutes(tournament.duration ?? null, DEFAULT_MATCH_DURATION_MINUTES);

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
        await Game.deleteMany({
          _id: { $in: existingRoundEntries.map((entry: ScheduleRoundEntryLike) => entry.game) },
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
        firstRoundScheduledAt: targetRound >= 1 ? new Date() : null,
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
