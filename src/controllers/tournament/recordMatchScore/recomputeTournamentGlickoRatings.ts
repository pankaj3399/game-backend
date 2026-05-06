import type { ClientSession, HydratedDocument, Types } from "mongoose";
import Game, { type IGame } from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import User from "../../../models/User";
import { rateGlicko2Player, type Glicko2MatchResult, type Glicko2Player } from "../../../lib/glicko2";

type ScoreValue = number | "wo";

type RatingResult = {
  userId: string;
  rating: number;
  rd: number;
  vol: number;
};

type GameDocument = HydratedDocument<IGame>;
type RatingMap = Map<string, Glicko2Player>;

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

function averagePlayers(players: Glicko2Player[]): Glicko2Player {
  const count = Math.max(1, players.length);
  return {
    rating: players.reduce((sum, player) => sum + player.rating, 0) / count,
    rd: players.reduce((sum, player) => sum + player.rd, 0) / count,
    vol: players.reduce((sum, player) => sum + player.vol, 0) / count,
    tau: players.reduce((sum, player) => sum + (player.tau ?? 0.5), 0) / count,
  };
}

async function loadUserRatingDefaults(
  userIds: string[],
  session: ClientSession
): Promise<Map<string, Pick<Glicko2Player, "vol" | "tau">>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const users = await User.find({ _id: { $in: userIds } })
    .select("elo.vol elo.tau")
    .session(session)
    .lean<Array<{ _id: Types.ObjectId; elo?: { vol?: number | null; tau?: number | null } | null }>>()
    .exec();

  return new Map(
    users.map((user) => [
      user._id.toString(),
      {
        vol: Number.isFinite(user.elo?.vol) && user.elo!.vol! > 0 ? user.elo!.vol! : 0.06,
        tau: Number.isFinite(user.elo?.tau) && user.elo!.tau! > 0 ? user.elo!.tau! : 0.5,
      },
    ])
  );
}

function snapshotRating(
  game: GameDocument,
  playerId: Types.ObjectId,
  defaultsByUserId: Map<string, Pick<Glicko2Player, "vol" | "tau">>
): Glicko2Player {
  const playerIdString = playerId.toString();
  const snapshots = [
    ...(Array.isArray(game.side1?.playerSnapshots) ? game.side1.playerSnapshots : []),
    ...(Array.isArray(game.side2?.playerSnapshots) ? game.side2.playerSnapshots : []),
  ];
  const snapshot = snapshots.find((entry) => entry.player.toString() === playerIdString);

  const defaults = defaultsByUserId.get(playerIdString);

  return {
    rating: snapshot && Number.isFinite(snapshot.rating) ? snapshot.rating : 1500,
    rd: snapshot && Number.isFinite(snapshot.rd) ? snapshot.rd : 200,
    vol: defaults?.vol ?? 0.06,
    tau: defaults?.tau ?? 0.5,
  };
}

function readRating(
  map: RatingMap,
  game: GameDocument,
  playerId: Types.ObjectId,
  defaultsByUserId: Map<string, Pick<Glicko2Player, "vol" | "tau">>
) {
  const existing = map.get(playerId.toString());
  if (existing) {
    return existing;
  }

  const initial = snapshotRating(game, playerId, defaultsByUserId);
  map.set(playerId.toString(), initial);
  return initial;
}

function getGamePlayers(game: GameDocument) {
  return [
    ...(Array.isArray(game.side1?.players) ? game.side1.players : []),
    ...(Array.isArray(game.side2?.players) ? game.side2.players : []),
  ];
}

async function loadScheduledGamesThroughRound(
  scheduleId: Types.ObjectId,
  round: number,
  session: ClientSession
) {
  const schedule = await Schedule.findById(scheduleId)
    .select("rounds")
    .session(session)
    .lean<{ rounds?: Array<{ round: number; slot: number; game: Types.ObjectId }> } | null>()
    .exec();
  const roundEntries = (schedule?.rounds ?? [])
    .filter((entry) => entry.round <= round)
    .sort((left, right) => left.round - right.round || left.slot - right.slot);
  const roundGameIds = roundEntries.map((entry) => entry.game);

  if (roundGameIds.length === 0) {
    return { gamesByRound: new Map<number, GameDocument[]>(), games: [] as GameDocument[] };
  }

  const roundGames = await Game.find({
    _id: { $in: roundGameIds },
    isHistorical: { $ne: true },
    detachedFromRound: { $exists: false },
  })
    .session(session)
    .exec();

  const gamesById = new Map(roundGames.map((game) => [game._id.toString(), game]));
  const games: GameDocument[] = [];
  const gamesByRound = new Map<number, GameDocument[]>();
  for (const entry of roundEntries) {
    const game = gamesById.get(entry.game.toString());
    if (game) {
      games.push(game);
      const group = gamesByRound.get(entry.round) ?? [];
      group.push(game);
      gamesByRound.set(entry.round, group);
    }
  }

  return { gamesByRound, games };
}

function collectUserIds(games: GameDocument[]) {
  return [
    ...new Set(
      games.flatMap((game) => getGamePlayers(game).map((playerId) => playerId.toString()))
    ),
  ];
}

function applyFinishedGamesForRound(
  ratingsByUserId: RatingMap,
  games: GameDocument[],
  defaultsByUserId: Map<string, Pick<Glicko2Player, "vol" | "tau">>
) {
  const resultsByUserId = new Map<string, Glicko2MatchResult[]>();

  for (const game of games) {
    const sideOnePlayers = Array.isArray(game.side1?.players) ? game.side1.players : [];
    const sideTwoPlayers = Array.isArray(game.side2?.players) ? game.side2.players : [];

    for (const playerId of [...sideOnePlayers, ...sideTwoPlayers]) {
      readRating(ratingsByUserId, game, playerId, defaultsByUserId);
    }

    if (game.status !== "finished" || sideOnePlayers.length === 0 || sideTwoPlayers.length === 0) {
      continue;
    }

    const sideOneRatings = sideOnePlayers.map((playerId) =>
      readRating(ratingsByUserId, game, playerId, defaultsByUserId)
    );
    const sideTwoRatings = sideTwoPlayers.map((playerId) =>
      readRating(ratingsByUserId, game, playerId, defaultsByUserId)
    );
    const sideOneOpponent = averagePlayers(sideTwoRatings);
    const sideTwoOpponent = averagePlayers(sideOneRatings);
    const scoreSegments = getMatchScoreSegments(game);

    for (const playerId of sideOnePlayers) {
      const playerResults = resultsByUserId.get(playerId.toString()) ?? [];
      playerResults.push(
        ...scoreSegments.map((score) => ({
          opponent: sideOneOpponent,
          score,
        }))
      );
      resultsByUserId.set(playerId.toString(), playerResults);
    }

    for (const playerId of sideTwoPlayers) {
      const playerResults = resultsByUserId.get(playerId.toString()) ?? [];
      playerResults.push(
        ...scoreSegments.map((score) => ({
          opponent: sideTwoOpponent,
          score: 1 - score,
        }))
      );
      resultsByUserId.set(playerId.toString(), playerResults);
    }
  }

  for (const [userId, results] of resultsByUserId) {
    const player = ratingsByUserId.get(userId);
    if (player) {
      ratingsByUserId.set(userId, rateGlicko2Player(player, results));
    }
  }
}

function getMatchScoreSegments(game: GameDocument) {
  const outcomes: number[] = [];
  const playerOneScores = Array.isArray(game.score?.playerOneScores)
    ? game.score.playerOneScores
    : [];
  const playerTwoScores = Array.isArray(game.score?.playerTwoScores)
    ? game.score.playerTwoScores
    : [];
  const scoreCount = Math.min(playerOneScores.length, playerTwoScores.length);

  for (let index = 0; index < scoreCount; index += 1) {
    outcomes.push(...scoreToOutcomes(playerOneScores[index], playerTwoScores[index]));
  }

  return outcomes.length > 0 ? outcomes : [0.5];
}

async function persistRatings(
  ratingsByUserId: RatingMap,
  session: ClientSession
): Promise<RatingResult[]> {
  const updatedRatings = [...ratingsByUserId.entries()].map(([userId, rating]) => ({
    userId,
    rating: rating.rating,
    rd: rating.rd,
    vol: rating.vol,
  }));

  if (updatedRatings.length > 0) {
    await User.bulkWrite(
      updatedRatings.map((entry) => ({
        updateOne: {
          filter: { _id: entry.userId },
          update: {
            $set: {
              "elo.rating": entry.rating,
              "elo.rd": entry.rd,
              "elo.vol": entry.vol,
            },
          },
        },
      })),
      { session }
    );
  }

  return updatedRatings;
}

// Match playerSnapshots are immutable display context: "this player's rating before this match".
// Recompute reads them as rating-period baselines and writes only User.elo for future scheduling.
export async function recomputeTournamentGlickoRatingsThroughRound(
  scheduleId: Types.ObjectId,
  round: number,
  options: { session: ClientSession }
): Promise<RatingResult[]> {
  if (round < 1) {
    return [];
  }

  const { games, gamesByRound } = await loadScheduledGamesThroughRound(scheduleId, round, options.session);
  if (games.length === 0) {
    return [];
  }

  const defaultsByUserId = await loadUserRatingDefaults(collectUserIds(games), options.session);
  const ratingsByUserId: RatingMap = new Map();

  for (const roundNumber of [...gamesByRound.keys()].sort((left, right) => left - right)) {
    applyFinishedGamesForRound(ratingsByUserId, gamesByRound.get(roundNumber) ?? [], defaultsByUserId);
  }

  return persistRatings(ratingsByUserId, options.session);
}
