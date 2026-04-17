import type { Response } from "express";
import { Types } from "mongoose";
import Game from "../../../models/Game";
import { logger } from "../../../lib/logger";
import type { AuthenticatedRequest } from "../../../shared/authContext";
import { buildErrorPayload } from "../../../shared/errors";
import type { GameStatus, MatchType } from "../../../types/domain/game";
import { parseDurationMinutes, resolveTimedGameStatus } from "../../../shared/matchTiming";

type MatchStatusResponse = "completed" | "inProgress" | "scheduled" | "cancelled";

interface MatchPlayerResponse {
  id: string;
  name: string | null;
  alias: string | null;
}

interface LiveMatchResponseItem {
  id: string;
  mode: MatchType;
  status: MatchStatusResponse;
  startTime: string | null;
  tournament: {
    id: string;
    name: string;
  };
  court: {
    id: string | null;
    name: string | null;
  };
  myTeam: MatchPlayerResponse[];
  opponentTeam: MatchPlayerResponse[];
}

interface PopulatedPlayer {
  _id: Types.ObjectId;
  name?: string | null;
  alias?: string | null;
}

interface LiveMatchGameDoc {
  _id: Types.ObjectId;
  status: GameStatus;
  startTime?: Date | null;
  matchType: MatchType;
  teams: Array<{
    players: Array<PopulatedPlayer | Types.ObjectId>;
  }>;
  tournament?: {
    _id: Types.ObjectId;
    name?: string | null;
    duration?: string | null;
  } | null;
  schedule?: {
    _id: Types.ObjectId;
    matchDurationMinutes?: number | null;
  } | null;
  court?: {
    _id: Types.ObjectId;
    name?: string | null;
  } | null;
}

function toResponseStatus(status: GameStatus): MatchStatusResponse {
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

function mapTeamPlayers(team: { players: Array<PopulatedPlayer | Types.ObjectId> } | undefined) {
  if (!team || !Array.isArray(team.players)) {
    return [] as MatchPlayerResponse[];
  }

  return team.players.map((player) => mapPlayer(player));
}

function resolveTeamsForUser(game: LiveMatchGameDoc, userId: string) {
  const mappedTeams = [mapTeamPlayers(game.teams[0]), mapTeamPlayers(game.teams[1])];

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

function mapLiveMatchItem(game: LiveMatchGameDoc, userId: string): LiveMatchResponseItem | null {
  const tournamentId = game.tournament?._id?.toString();
  const tournamentName = game.tournament?.name?.trim();

  if (!tournamentId || !tournamentName) {
    return null;
  }

  const teams = resolveTeamsForUser(game, userId);

  return {
    id: game._id.toString(),
    mode: game.matchType,
    status: toResponseStatus(game.status),
    startTime: game.startTime ? game.startTime.toISOString() : null,
    tournament: {
      id: tournamentId,
      name: tournamentName,
    },
    court: {
      id: game.court?._id ? game.court._id.toString() : null,
      name: game.court?.name ?? null,
    },
    myTeam: teams.myTeam,
    opponentTeam: teams.opponentTeam,
  };
}

/**
 * GET /api/tournaments/live-match
 * Returns the current user's active match (if any) and their next scheduled match.
 */
export async function getTournamentLiveMatch(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user._id.toString();

    const games = await Game.find({
      gameMode: "tournament",
      status: { $nin: ["finished", "cancelled"] },
      "teams.players": req.user._id,
      startTime: { $ne: null },
    })
      .select("_id status startTime matchType teams tournament schedule court")
      .populate("teams.players", "name alias")
      .populate("tournament", "name duration")
      .populate("schedule", "matchDurationMinutes")
      .populate("court", "name")
      .sort({ startTime: 1 })
      .lean<LiveMatchGameDoc[]>()
      .exec();

    if (games.length === 0) {
      res.status(200).json({
        liveMatch: null,
        nextMatch: null,
      });
      return;
    }

    const now = new Date();
    const statusUpdates: Array<{ id: Types.ObjectId; status: GameStatus }> = [];

    for (const game of games) {
      const durationMinutes =
        typeof game.schedule?.matchDurationMinutes === "number"
          ? game.schedule.matchDurationMinutes
          : parseDurationMinutes(game.tournament?.duration ?? null);

      const nextStatus = resolveTimedGameStatus({
        persistedStatus: game.status,
        startTime: game.startTime ?? null,
        matchDurationMinutes: durationMinutes,
        now,
      });

      if (nextStatus !== game.status) {
        statusUpdates.push({ id: game._id, status: nextStatus });
        game.status = nextStatus;
      }
    }

    if (statusUpdates.length > 0) {
      await Game.bulkWrite(
        statusUpdates.map((entry) => ({
          updateOne: {
            filter: { _id: entry.id },
            update: { $set: { status: entry.status } },
          },
        }))
      );
    }

    const liveGame = games.find((game) => game.status === "active") ?? null;
    const nextGame =
      games.find((game) => game.status === "draft" && game.startTime instanceof Date && game.startTime.getTime() > now.getTime()) ??
      null;

    const liveMatch = liveGame ? mapLiveMatchItem(liveGame, userId) : null;
    const nextMatch = nextGame ? mapLiveMatchItem(nextGame, userId) : null;

    res.status(200).json({
      liveMatch,
      nextMatch,
    });
  } catch (err) {
    logger.error("Error getting tournament live match", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}
