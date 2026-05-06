import mongoose, { Types } from "mongoose";
import { rateGlicko2HeadToHead, rateGlicko2Player } from "../../../lib/glicko2";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import User from "../../../models/User";
import type { IGame } from "../../../models/Game";
import { AppError } from "../../../shared/errors";
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
}): RatingState {
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

function findSnapshotForPlayer(
  game: IGame,
  playerId: string
): { rating: number; rd: number } | null {
  for (const side of [game.side1, game.side2]) {
    for (const snap of side.playerSnapshots ?? []) {
      if (snap?.player?.toString() === playerId) {
        return { rating: snap.rating, rd: snap.rd };
      }
    }
  }
  return null;
}

/**
 * Replays Glicko updates for all finished tournament matches in schedule order so
 * organiser score corrections do not stack multiple times on user ratings.
 */
export async function recomputeTournamentGlickoRatings(tournamentId: string, session: mongoose.ClientSession) {
  const tournament = await Tournament.findById(tournamentId)
    .select("schedule totalRounds")
    .session(session)
    .lean<{ _id: Types.ObjectId; schedule?: Types.ObjectId | null; totalRounds?: number } | null>()
    .exec();

  if (!tournament?.schedule) {
    return;
  }

  const scheduleDoc = await Schedule.findById(tournament.schedule).session(session).exec();
  if (!scheduleDoc) {
    return;
  }

  const configuredTotalRounds =
    typeof tournament.totalRounds === "number" && Number.isFinite(tournament.totalRounds)
      ? Math.max(1, Math.trunc(tournament.totalRounds))
      : 1;

  const relevantEntries = scheduleDoc.rounds.filter((entry) => entry.round <= configuredTotalRounds);
  const orderedGameIds = relevantEntries.map((entry) => entry.game.toString());

  if (orderedGameIds.length === 0) {
    return;
  }

  const gameDocs = await Game.find({
    _id: { $in: orderedGameIds.map((id) => new Types.ObjectId(id)) },
    tournament: new Types.ObjectId(tournamentId),
    gameMode: "tournament",
  })
    .session(session)
    .exec();

  const gameById = new Map(gameDocs.map((g) => [g._id.toString(), g]));
  const finishedOrdered: IGame[] = [];

  for (const gid of orderedGameIds) {
    const g = gameById.get(gid);
    if (g && g.status === "finished") {
      finishedOrdered.push(g);
    }
  }

  if (finishedOrdered.length === 0) {
    return;
  }

  const allPlayerIds = new Set<string>();
  for (const g of finishedOrdered) {
    for (const id of [...getSidePlayerIds(g, "side1"), ...getSidePlayerIds(g, "side2")]) {
      allPlayerIds.add(id);
    }
  }

  const users = await User.find({ _id: { $in: [...allPlayerIds] } })
    .setOptions({ includeDeleted: true })
    .select("_id elo")
    .session(session)
    .lean<Array<{ _id: Types.ObjectId; elo?: { rating?: number | null; rd?: number | null; vol?: number | null; tau?: number | null } }>>()
    .exec();

  const usersById = new Map(users.map((u) => [u._id.toString(), u]));
  if (usersById.size !== allPlayerIds.size) {
    throw new AppError("One or more match participants no longer exist", 400);
  }

  const states = new Map<string, RatingState>();

  function ensureStateForPlayer(playerId: string, game: IGame) {
    if (states.has(playerId)) {
      return;
    }
    const user = usersById.get(playerId);
    if (!user) {
      throw new AppError(`Invariant: missing user document for participant ${playerId}`, 500);
    }
    const snap = findSnapshotForPlayer(game, playerId);
    if (snap) {
      states.set(playerId, {
        rating: snap.rating,
        rd: snap.rd,
        vol: typeof user.elo?.vol === "number" ? user.elo.vol : 0.06,
        tau: typeof user.elo?.tau === "number" ? user.elo.tau : 0.5,
      });
    } else {
      states.set(playerId, toRatingState(user));
    }
  }

  for (const game of finishedOrdered) {
    const input: RecordMatchScoreInput = {
      playerOneScores: [...game.score.playerOneScores],
      playerTwoScores: [...game.score.playerTwoScores],
    };
    const outcomes = flattenOutcomeSegments(input);
    if (outcomes.length === 0) {
      continue;
    }

    const uniqueParticipantIds = [
      ...new Set([
        ...getSidePlayerIds(game, "side1"),
        ...getSidePlayerIds(game, "side2"),
      ]),
    ];

    for (const id of uniqueParticipantIds) {
      ensureStateForPlayer(id, game);
    }

    if (uniqueParticipantIds.length < 2) {
      throw new AppError("Match is missing participants", 400);
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
  }

  for (const playerId of allPlayerIds) {
    const nextState = getStateOrThrow(states, playerId);

    await User.updateOne(
      { _id: playerId },
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
  }
}
