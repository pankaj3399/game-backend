import mongoose, { Types } from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import { AppError } from "../../../shared/errors";
import type { GamePlayMode } from "../../../types/domain/game";
import { recomputeTournamentGlickoRatingsThroughRound } from "./recomputeTournamentGlickoRatings";
import type { RecordMatchScoreInput } from "./validation";

export type TournamentScoreActor = "organiser" | "participant";

export type RecordTournamentMatchScoreOptions = {
  actor: TournamentScoreActor;
  /** When true, organisers may no longer adjust scores (after grace period from tournament completion). */
  organiserGraceExpired: boolean;
};

type ScoreValue = number | "wo";

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
  input: RecordMatchScoreInput,
  options: RecordTournamentMatchScoreOptions
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

      if (options.actor === "organiser" && options.organiserGraceExpired) {
        throw new AppError(
          "The organiser score edit period for this tournament has ended",
          403
        );
      }

      const schedule = game.schedule
        ? await Schedule.findById(game.schedule).session(session).exec()
        : await Schedule.findOne({ tournament: tournamentId }).session(session).exec();
      const roundEntry = schedule?.rounds.find((entry) => entry.game.toString() === game._id.toString());

      const organiserMayEditAnyRound = options.actor === "organiser" && !options.organiserGraceExpired;
      const isDetachedOrHistorical = game.isHistorical === true || game.detachedFromRound != null;
      const isCurrentScheduledRound =
        Boolean(schedule && roundEntry && roundEntry.round === schedule.currentRound);
      const isScoreOnlyEdit =
        organiserMayEditAnyRound &&
        (game.status === "cancelled" || isDetachedOrHistorical || !isCurrentScheduledRound);

      if (!roundEntry && !isDetachedOrHistorical) {
        throw new AppError("Match is not part of this tournament schedule", 404);
      }
      if (!organiserMayEditAnyRound && (game.status === "cancelled" || isDetachedOrHistorical)) {
        throw new AppError("Scores can only be edited for scheduled matches in this tournament", 409);
      }
      if (!organiserMayEditAnyRound && !isCurrentScheduledRound) {
        throw new AppError("Scores can only be edited for matches in the current round", 409);
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
        game.status = isScoreOnlyEdit && game.status === "cancelled" ? "cancelled" : "pendingScore";
        if (game.status !== "cancelled") {
          game.endTime = undefined;
        }
        await game.save({ session });

        return {
          matchId,
          tournamentId,
          matchStatus: "pendingScore" as const,
          tournamentCompleted: false,
          updatedRatings: [] as Array<{ userId: string; rating: number; rd: number; vol: number }>,
          ratingsRecomputed: false,
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

      game.status = isScoreOnlyEdit && game.status === "cancelled" ? "cancelled" : "finished";
      game.endTime = game.status === "finished" ? now : game.endTime;
      await game.save({ session });

      const participantIds = [
        ...(Array.isArray(game.side1?.players) ? game.side1.players.filter(isObjectId) : []),
        ...(Array.isArray(game.side2?.players) ? game.side2.players.filter(isObjectId) : []),
      ];

      const uniqueParticipantIds = [...new Set(participantIds.map((id) => id.toString()))];
      if (uniqueParticipantIds.length < 2) {
        throw new AppError("Match is missing participants", 400);
      }

      const updatedRatings: Array<{ userId: string; rating: number; rd: number; vol: number }> = [];

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
            if (!isScoreOnlyEdit && schedule && roundEntry) {
              updatedRatings.push(
                ...(await recomputeTournamentGlickoRatingsThroughRound(schedule._id, roundEntry.round, {
                  session,
                }))
              );
            }

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
        ratingsRecomputed: updatedRatings.length > 0,
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
