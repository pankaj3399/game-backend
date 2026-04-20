import mongoose, { Types } from "mongoose";
import { rateGlicko2HeadToHead, rateGlicko2Player } from "../../../lib/glicko2";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import User from "../../../models/User";
import { AppError } from "../../../shared/errors";
import type { GamePlayMode } from "../../../types/domain/game";
import type { RecordMatchScoreInput } from "./validation";

type ScoreValue = number | "wo";

interface RatingState {
  rating: number;
  rd: number;
  vol: number;
  tau: number;
}

function isObjectId(value: unknown): value is Types.ObjectId {
  return value instanceof Types.ObjectId;
}

function scoreToOutcomes(playerOneScore: ScoreValue, playerTwoScore: ScoreValue) {
  if (playerOneScore === "wo" && playerTwoScore === "wo") {
    return [0.5];
  }
  if (playerOneScore === "wo") {
    return [0];
  }
  if (playerTwoScore === "wo") {
    return [1];
  }

  const total = playerOneScore + playerTwoScore;
  if (total <= 0) {
    return [0.5];
  }

  let winsAssigned = 0;
  const outcomes: number[] = [];

  for (let step = 1; step <= total; step += 1) {
    const shouldHaveWins = Math.round((step * playerOneScore) / total);
    if (shouldHaveWins > winsAssigned) {
      outcomes.push(1);
      winsAssigned += 1;
      continue;
    }
    outcomes.push(0);
  }

  return outcomes;
}

function flattenOutcomeSegments(input: RecordMatchScoreInput) {
  const outcomes: number[] = [];

  for (let index = 0; index < input.playerOneScores.length; index += 1) {
    const playerOneValue = input.playerOneScores[index];
    const playerTwoValue = input.playerTwoScores[index];
    outcomes.push(...scoreToOutcomes(playerOneValue, playerTwoValue));
  }

  return outcomes;
}

/** Matches glicko2.ts SCALE — combine RD in φ-space (equal weights, e.g. 0.5 each in doubles). */
const GLICKO_RD_SCALE = 173.7178;

function averageOpponentState(states: RatingState[]) {
  const count = states.length;
  if (count === 0) {
    return {
      rating: 1500,
      rd: 200,
      vol: 0.06,
      tau: 0.5,
    };
  }

  if (count === 1) {
    const s = states[0];
    return { ...s };
  }

  const weight = 1 / count;
  let phiSqWeightedSum = 0;
  let ratingSum = 0;
  let volSum = 0;
  let tauSum = 0;

  for (const state of states) {
    ratingSum += state.rating;
    const phi = state.rd / GLICKO_RD_SCALE;
    phiSqWeightedSum += weight * weight * phi * phi;
    volSum += state.vol;
    tauSum += state.tau;
  }

  return {
    rating: ratingSum / count,
    rd: Math.sqrt(phiSqWeightedSum) * GLICKO_RD_SCALE,
    vol: volSum / count,
    tau: tauSum / count,
  };
}

function toRatingState(user: {
  elo?: { rating?: number | null; rd?: number | null; vol?: number | null; tau?: number | null } | null;
}) {
  const rating = typeof user.elo?.rating === "number" ? user.elo.rating : 1500;
  const rd = typeof user.elo?.rd === "number" ? user.elo.rd : 200;
  const vol = typeof user.elo?.vol === "number" ? user.elo.vol : 0.06;
  const tau = typeof user.elo?.tau === "number" ? user.elo.tau : 0.5;

  return {
    rating,
    rd,
    vol,
    tau,
  };
}

function getStateOrThrow(states: Map<string, RatingState>, id: string) {
  const state = states.get(id);
  if (!state) {
    throw new AppError(`Invariant: missing rating state for participant ${id}`, 500);
  }
  return state;
}

function getSidePlayerIds(
  game: { side1?: { players?: unknown[] }; side2?: { players?: unknown[] } },
  side: "side1" | "side2"
) {
  const entry = game[side];
  if (!entry || !Array.isArray(entry.players)) {
    return [] as string[];
  }

  const ids: string[] = [];
  for (const player of entry.players) {
    if (isObjectId(player)) {
      ids.push(player.toString());
    }
  }

  return ids;
}

function compareSetScore(playerOneScore: ScoreValue, playerTwoScore: ScoreValue): number {
  if (playerOneScore === "wo" && playerTwoScore === "wo") {
    return 0;
  }

  if (playerOneScore === "wo") {
    return -1;
  }

  if (playerTwoScore === "wo") {
    return 1;
  }

  if (playerOneScore === playerTwoScore) {
    return 0;
  }

  return playerOneScore > playerTwoScore ? 1 : -1;
}

function requiredSetCount(playMode: GamePlayMode): number {
  if (playMode === "5set") {
    return 5;
  }

  if (playMode === "3set" || playMode === "3setTieBreak10") {
    return 3;
  }

  return 1;
}

function isWinnerDecided(playMode: GamePlayMode, input: RecordMatchScoreInput): boolean {
  return decisiveSetsLength(playMode, input) != null;
}

/** Number of set rows that include the decisive set (1-based), or null if no winner yet. */
function decisiveSetsLength(playMode: GamePlayMode, input: RecordMatchScoreInput): number | null {
  const setsToEvaluate = requiredSetCount(playMode);
  const majority = Math.floor(setsToEvaluate / 2) + 1;
  let playerOneSetWins = 0;
  let playerTwoSetWins = 0;

  for (let index = 0; index < setsToEvaluate; index += 1) {
    const playerOneScore = input.playerOneScores[index];
    const playerTwoScore = input.playerTwoScores[index];

    if (playerOneScore === undefined || playerTwoScore === undefined) {
      continue;
    }

    const setResult = compareSetScore(playerOneScore, playerTwoScore);
    if (setResult > 0) {
      playerOneSetWins += 1;
    } else if (setResult < 0) {
      playerTwoSetWins += 1;
    }

    if (playerOneSetWins >= majority || playerTwoSetWins >= majority) {
      return index + 1;
    }
  }

  return null;
}

export async function recordTournamentMatchScoreFlow(
  tournamentId: string,
  matchId: string,
  input: RecordMatchScoreInput
) {
  const session = await mongoose.startSession();

  try {
    const persisted = await session.withTransaction(async () => {
      const game = await Game.findOne({
        _id: matchId,
        tournament: tournamentId,
        gameMode: "tournament",
      })
        .session(session)
        .exec();

      if (!game) {
        throw new AppError("Tournament match not found", 404);
      }

      const now = new Date();
      game.startTime = game.startTime ?? now;

      const setsRequired = requiredSetCount(game.playMode);
      if (
        input.playerOneScores.length > setsRequired ||
        input.playerTwoScores.length > setsRequired ||
        input.playerOneScores.length !== input.playerTwoScores.length
      ) {
        throw new AppError(
          `Both playerOneScores and playerTwoScores must have the same number of entries and no more than ${setsRequired} sets for ${game.playMode} matches`,
          400
        );
      }

      const winnerDecided = isWinnerDecided(game.playMode, input);
      if (!winnerDecided) {
        game.score = {
          playerOneScores: [...input.playerOneScores],
          playerTwoScores: [...input.playerTwoScores],
        };
        game.status = "pendingScore";
        game.endTime = undefined;
        await game.save({ session });

        return {
          matchId,
          tournamentId,
          matchStatus: "pendingScore" as const,
          tournamentCompleted: false,
          updatedRatings: [] as Array<{ userId: string; rating: number; rd: number; vol: number }>,
        };
      }

      const decisiveLen = decisiveSetsLength(game.playMode, input);
      if (decisiveLen == null) {
        throw new AppError("Winner could not be determined from submitted scores", 400);
      }

      const scoreThroughDecisiveSet: RecordMatchScoreInput = {
        ...input,
        playerOneScores: input.playerOneScores.slice(0, decisiveLen),
        playerTwoScores: input.playerTwoScores.slice(0, decisiveLen),
      };

      game.score = {
        playerOneScores: [...scoreThroughDecisiveSet.playerOneScores],
        playerTwoScores: [...scoreThroughDecisiveSet.playerTwoScores],
      };

      const outcomes = flattenOutcomeSegments(scoreThroughDecisiveSet);
      if (outcomes.length === 0) {
        throw new AppError("At least one score outcome is required", 400);
      }

      game.status = "finished";
      game.endTime = now;
      await game.save({ session });

      const participantIds = [
        ...(Array.isArray(game.side1?.players) ? game.side1.players.filter(isObjectId) : []),
        ...(Array.isArray(game.side2?.players) ? game.side2.players.filter(isObjectId) : []),
      ];

      const uniqueParticipantIds = [...new Set(participantIds.map((id) => id.toString()))];
      if (uniqueParticipantIds.length < 2) {
        throw new AppError("Match is missing participants", 400);
      }

      const users = await User.find({ _id: { $in: uniqueParticipantIds } })
        .setOptions({ includeDeleted: true })
        .select("_id elo")
        .session(session)
        .lean<Array<{ _id: Types.ObjectId; elo?: { rating?: number; rd?: number; vol?: number; tau?: number } }>>()
        .exec();

      const byUserId = new Map(users.map((user) => [user._id.toString(), user]));
      if (byUserId.size !== uniqueParticipantIds.length) {
        throw new AppError("One or more match participants no longer exist", 400);
      }

      const states = new Map<string, RatingState>();
      for (const participantId of uniqueParticipantIds) {
        const user = byUserId.get(participantId);
        if (!user) {
          throw new AppError(
            `Invariant: missing user document while building rating state for participant ${participantId}`,
            500
          );
        }
        states.set(participantId, toRatingState(user));
      }

      const teamOneIds = getSidePlayerIds(game, "side1");
      const teamTwoIds = getSidePlayerIds(game, "side2");

      if (game.matchType === "singles") {
        if (teamOneIds.length !== 1 || teamTwoIds.length !== 1) {
          throw new AppError("Singles match must contain exactly one player per team", 400);
        }

        const playerOneId = teamOneIds[0];
        const playerTwoId = teamTwoIds[0];

        for (const score of outcomes) {
          const playerOneState = getStateOrThrow(states, playerOneId);
          const playerTwoState = getStateOrThrow(states, playerTwoId);

          const updated = rateGlicko2HeadToHead(playerOneState, playerTwoState, score);
          states.set(playerOneId, updated.playerOne);
          states.set(playerTwoId, updated.playerTwo);
        }
      } else {
        if (teamOneIds.length !== 2 || teamTwoIds.length !== 2) {
          throw new AppError("Doubles match must contain exactly two players per team", 400);
        }

        for (const score of outcomes) {
          const teamOneSnapshot = teamOneIds.map((id) => getStateOrThrow(states, id));
          const teamTwoSnapshot = teamTwoIds.map((id) => getStateOrThrow(states, id));

          const teamOneOpponent = averageOpponentState(teamTwoSnapshot);
          const teamTwoOpponent = averageOpponentState(teamOneSnapshot);

          for (let i = 0; i < teamOneIds.length; i += 1) {
            const playerId = teamOneIds[i];
            const playerState = teamOneSnapshot[i];
            const updated = rateGlicko2Player(playerState, [
              {
                opponent: teamOneOpponent,
                score,
              },
            ]);
            states.set(playerId, updated);
          }

          for (let i = 0; i < teamTwoIds.length; i += 1) {
            const playerId = teamTwoIds[i];
            const playerState = teamTwoSnapshot[i];
            const updated = rateGlicko2Player(playerState, [
              {
                opponent: teamTwoOpponent,
                score: 1 - score,
              },
            ]);
            states.set(playerId, updated);
          }
        }
      }

      const updatedRatings: Array<{ userId: string; rating: number; rd: number; vol: number }> = [];
      for (const participantId of uniqueParticipantIds) {
        const nextState = getStateOrThrow(states, participantId);

        await User.updateOne(
          { _id: participantId },
          {
            $set: {
              "elo.rating": nextState.rating,
              "elo.rd": nextState.rd,
              "elo.vol": nextState.vol,
              "elo.tau": nextState.tau,
            },
          },
          { session }
        ).exec();

        updatedRatings.push({
          userId: participantId,
          rating: Math.round(nextState.rating),
          rd: Math.round(nextState.rd),
          vol: Number(nextState.vol.toFixed(6)),
        });
      }

      let tournamentCompleted = false;
      const tournament = await Tournament.findById(tournamentId)
        .select("_id schedule totalRounds completedAt")
        .session(session)
        .lean<{ _id: Types.ObjectId; schedule?: Types.ObjectId | null; totalRounds?: number; completedAt?: Date | null } | null>()
        .exec();

      const configuredTotalRounds =
        typeof tournament?.totalRounds === "number" && Number.isFinite(tournament.totalRounds)
          ? Math.max(1, Math.trunc(tournament.totalRounds))
          : 1;

      let schedule = tournament?.schedule
        ? await Schedule.findById(tournament.schedule).session(session).exec()
        : await Schedule.findOne({ tournament: tournamentId }).session(session).exec();

      if (schedule && schedule.currentRound >= configuredTotalRounds) {
        const relevantRoundEntries = schedule.rounds.filter((entry) => entry.round <= configuredTotalRounds);
        const relevantGameIds = [...new Set(relevantRoundEntries.map((entry) => entry.game.toString()))];

        if (relevantGameIds.length > 0) {
          const unfinishedCount = await Game.countDocuments({
            _id: { $in: relevantGameIds },
            status: { $nin: ["finished", "cancelled"] },
          })
            .session(session)
            .exec();

          if (unfinishedCount === 0) {
            schedule.status = "finished";
            await schedule.save({ session });

            const completionDate = now;
            await Tournament.updateOne(
              { _id: tournamentId },
              { $set: { completedAt: completionDate } },
              { session }
            ).exec();

            tournamentCompleted = true;
          }
        }
      }

      return {
        matchId,
        tournamentId,
        matchStatus: "completed" as const,
        tournamentCompleted,
        updatedRatings,
      };
    });

    if (!persisted) {
      throw new AppError(
        `Transaction aborted: failed to persist tournament match score (matchId=${matchId}, tournamentId=${tournamentId})`,
        500
      );
    }

    return persisted;
  } finally {
    await session.endSession();
  }
}
