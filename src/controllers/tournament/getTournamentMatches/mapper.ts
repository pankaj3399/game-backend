import type { DbIdLike } from "../../../types/domain/common";
import type { GameStatus } from "../../../types/domain/game";
import type {
  GameForMatchesDoc,
  MatchPlayerResponse,
  MatchScoreValueResponse,
  MatchStatusResponse,
  ScheduleForMatchesDoc,
  TournamentMatchResponse,
  TournamentMatchesResponse,
} from "./types";

function toIdString(id: DbIdLike | null | undefined): string | null {
  if (id == null) {
    return null;
  }
  return typeof id === "string" ? id : id.toString();
}

function mapStatus(status: GameStatus): MatchStatusResponse {
  if (status === "finished") {
    return "completed";
  }

  if (status === "active") {
    return "inProgress";
  }

  if (status === "cancelled") {
    return "cancelled";
  }

  return "scheduled";
}

function asPositiveInt(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

const EMPTY_PLAYER: MatchPlayerResponse = {
  id: "",
  name: null,
  alias: null,
};

function hasPopulatedPlayerShape(
  value: unknown
): value is { _id: DbIdLike; name?: string | null; alias?: string | null } {
  return typeof value === "object" && value !== null && "_id" in value;
}

function mapPlayer(player: { _id: DbIdLike; name?: string | null; alias?: string | null } | DbIdLike | null | undefined): MatchPlayerResponse {
  if (!player) {
    return EMPTY_PLAYER;
  }

  if (hasPopulatedPlayerShape(player)) {
    return {
      id: player._id.toString(),
      name: player.name ?? null,
      alias: player.alias ?? null,
    };
  }

  if (typeof player === "string" || "toString" in player) {
    return {
      id: player.toString(),
      name: null,
      alias: null,
    };
  }

  return EMPTY_PLAYER;
}

function mapTeamPlayers(
  team: { players: Array<{ _id: DbIdLike; name?: string | null; alias?: string | null } | DbIdLike> } | undefined
) {
  if (!team || !Array.isArray(team.players)) {
    return [] as MatchPlayerResponse[];
  }

  return team.players.map((player) => mapPlayer(player));
}

function normalizeScoreValues(values: unknown): MatchScoreValueResponse[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: MatchScoreValueResponse[] = [];
  for (const value of values) {
    if (value === "wo") {
      normalized.push("wo");
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      normalized.push(value);
    }
  }

  return normalized;
}

export function mapTournamentMatchesResponse(
  schedule: ScheduleForMatchesDoc | null,
  games: GameForMatchesDoc[],
  configuredTotalRounds: number
): TournamentMatchesResponse {
  const gamesById = new Map(games.map((game) => [game._id.toString(), game]));
  const rounds = schedule?.rounds ?? [];

  const matches: TournamentMatchResponse[] = [];
  for (const entry of rounds) {
    const gameId = entry.game.toString();
    const game = gamesById.get(gameId);
    if (!game || !Array.isArray(game.teams) || game.teams.length < 2) {
      continue;
    }

    const teamOnePlayers = mapTeamPlayers(game.teams[0]);
    const teamTwoPlayers = mapTeamPlayers(game.teams[1]);
    if (teamOnePlayers.length === 0 || teamTwoPlayers.length === 0) {
      continue;
    }

    const playerOne = teamOnePlayers[0] ?? EMPTY_PLAYER;
    const playerTwo = teamTwoPlayers[0] ?? EMPTY_PLAYER;
    const teamOnePair: [MatchPlayerResponse, MatchPlayerResponse] = [
      teamOnePlayers[0] ?? EMPTY_PLAYER,
      teamOnePlayers[1] ?? EMPTY_PLAYER,
    ];
    const teamTwoPair: [MatchPlayerResponse, MatchPlayerResponse] = [
      teamTwoPlayers[0] ?? EMPTY_PLAYER,
      teamTwoPlayers[1] ?? EMPTY_PLAYER,
    ];

    matches.push({
      id: gameId,
      round: asPositiveInt(entry.round, 1),
      slot: asPositiveInt(entry.slot, 1),
      mode: game.matchType,
      status: mapStatus(game.status),
      startTime: game.startTime ? game.startTime.toISOString() : null,
      score: {
        playerOneScores: normalizeScoreValues(game.score?.playerOneScores),
        playerTwoScores: normalizeScoreValues(game.score?.playerTwoScores),
      },
      court: {
        id: toIdString(game.court?._id),
        name: game.court?.name ?? null,
      },
      players: [playerOne, playerTwo],
      ...(game.matchType === "doubles"
        ? {
            teams: [
              teamOnePair,
              teamTwoPair,
            ],
          }
        : {}),
    });
  }

  matches.sort((a, b) => {
    if (a.round !== b.round) {
      return a.round - b.round;
    }
    if (a.slot !== b.slot) {
      return a.slot - b.slot;
    }
    return a.id.localeCompare(b.id);
  });

  const totalRounds = asPositiveInt(configuredTotalRounds, 1);
  const hasValidScheduleCurrentRound =
    schedule != null &&
    Number.isFinite(schedule.currentRound) &&
    schedule.currentRound >= 0;
  const currentRound = hasValidScheduleCurrentRound
    ? Math.trunc(schedule.currentRound)
    : totalRounds > 0
      ? 1
      : 0;

  return {
    schedule: {
      id: toIdString(schedule?._id),
      status: schedule?.status ?? null,
      currentRound,
      totalRounds,
    },
    matches,
  };
}
