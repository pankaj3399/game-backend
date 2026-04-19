import { Types } from "mongoose";
import { LogWarning } from "../../../lib/logger";
import type { GameStatus } from "../../../types/domain/game";
import type {
  LiveMatchGameDoc,
  LiveMatchResponseItem,
  MatchPlayerResponse,
  MatchStatusResponse,
  PopulatedPlayer,
} from "./types";

export function toResponseStatus(status: GameStatus): MatchStatusResponse {
  if (status === "finished") {
    return "completed";
  }

  if (status === "pendingScore") {
    return "pendingScore";
  }

  if (status === "active") {
    return "inProgress";
  }

  if (status === "cancelled") {
    return "cancelled";
  }

  return "scheduled";
}

function isPopulatedPlayer(value: unknown): value is PopulatedPlayer {
  return typeof value === "object" && value !== null && "_id" in value;
}

function mapPlayer(value: PopulatedPlayer | Types.ObjectId): MatchPlayerResponse {
  if (isPopulatedPlayer(value)) {
    return {
      id: value._id.toString(),
      name: value.name ?? null,
      alias: value.alias ?? null,
    };
  }

  return {
    id: value.toString(),
    name: null,
    alias: null,
  };
}

function mapTeamPlayers(team: {
  players: Array<PopulatedPlayer | Types.ObjectId | null> | undefined;
}) {
  if (!team || !Array.isArray(team.players)) {
    return [] as MatchPlayerResponse[];
  }

  return team.players
    .filter((player): player is PopulatedPlayer | Types.ObjectId => player != null)
    .map((player) => mapPlayer(player));
}

function resolveTeamsForUser(game: LiveMatchGameDoc, userId: string) {
  const mappedTeams = [mapTeamPlayers(game.side1), mapTeamPlayers(game.side2)];

  const userTeamIndex = mappedTeams.findIndex((team) =>
    team.some((player) => player.id === userId)
  );

  if (userTeamIndex === -1) {
    return {
      myTeam: mappedTeams[0] ?? [],
      opponentTeam: mappedTeams[1] ?? [],
    };
  }

  const opponentTeamIndex = userTeamIndex === 0 ? 1 : 0;

  return {
    myTeam: mappedTeams[userTeamIndex] ?? [],
    opponentTeam: mappedTeams[opponentTeamIndex] ?? [],
  };
}

export function mapLiveMatchItem(game: LiveMatchGameDoc, userId: string): LiveMatchResponseItem {
  const tournamentId = game.tournament?._id?.toString() ?? null;
  const tournamentNameTrimmed = game.tournament?.name?.trim();

  if (!tournamentId || !tournamentNameTrimmed) {
    LogWarning(
      "getTournamentLiveMatch",
      `Missing tournament name or id on in-flight game ${game._id.toString()}`
    );
  }

  const teams = resolveTeamsForUser(game, userId);

  return {
    id: game._id.toString(),
    mode: game.matchType,
    status: toResponseStatus(game.status),
    startTime: game.startTime ? game.startTime.toISOString() : null,
    tournament: {
      id: tournamentId,
      name: tournamentNameTrimmed || "[Deleted/Unknown Tournament]",
    },
    court: {
      id: game.court?._id ? game.court._id.toString() : null,
      name: game.court?.name ?? null,
    },
    myTeam: teams.myTeam,
    opponentTeam: teams.opponentTeam,
  };
}
