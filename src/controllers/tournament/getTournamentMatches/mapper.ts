import type { DbIdLike } from "../../../types/domain/common";
import type { GameStatus } from "../../../types/domain/game";
import type {
  GameForMatchesDoc,
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

export function mapTournamentMatchesResponse(
  schedule: ScheduleForMatchesDoc | null,
  games: GameForMatchesDoc[]
): TournamentMatchesResponse {
  const gamesById = new Map(games.map((game) => [game._id.toString(), game]));
  const rounds = schedule?.rounds ?? [];

  const matches: TournamentMatchResponse[] = [];
  for (const entry of rounds) {
    const gameId = entry.game.toString();
    const game = gamesById.get(gameId);
    if (!game || !game.playerOne || !game.playerTwo) {
      continue;
    }

    matches.push({
      id: gameId,
      round: asPositiveInt(entry.round, 1),
      slot: asPositiveInt(entry.slot, 1),
      status: mapStatus(game.status),
      startTime: game.startTime ? game.startTime.toISOString() : null,
      court: {
        id: toIdString(game.court?._id),
        name: game.court?.name ?? null,
      },
      players: [
        {
          id: game.playerOne._id.toString(),
          name: game.playerOne.name ?? null,
          alias: game.playerOne.alias ?? null,
        },
        {
          id: game.playerTwo._id.toString(),
          name: game.playerTwo.name ?? null,
          alias: game.playerTwo.alias ?? null,
        },
      ],
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

  const totalRounds =
    schedule != null
      ? rounds.length > 0
        ? rounds.reduce(
            (max, entry) => Math.max(max, asPositiveInt(entry.round, 1)),
            0
          )
        : 0
      : matches.reduce((max, match) => Math.max(max, match.round), 0);
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
