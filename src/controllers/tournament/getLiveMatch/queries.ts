import { Types } from "mongoose";
import Game from "../../../models/Game";
import Tournament from "../../../models/Tournament";
import type { GameStatus } from "../../../types/domain/game";
import type { TournamentPlayMode, TournamentMode } from "../../../types/domain/tournament";
import { resolveTimedGameStatus } from "../../../shared/matchTiming";
import { updateGameStatuses } from "../getTournamentMatches/queries";
import type { LiveMatchGameDoc } from "./types";

/** Lower bound for dated matches — keeps the query bounded without hiding future matches. */
const LIVE_MATCH_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;

export type EligibleTournamentWithoutMatchesDoc = {
  _id: Types.ObjectId;
  name: string;
  date?: Date | null;
  playMode: TournamentPlayMode;
  tournamentMode: TournamentMode;
};

export async function fetchLiveMatchGames(userId: Types.ObjectId) {
  const startTimeLowerBound = new Date(Date.now() - LIVE_MATCH_LOOKBACK_MS);

  return Game.find({
    gameMode: "tournament",
    status: { $nin: ["finished", "cancelled"] },
    isHistorical: { $ne: true },
    $and: [
      { $or: [{ "side1.players": userId }, { "side2.players": userId }] },
      {
        $or: [{ startTime: null }, { startTime: { $gte: startTimeLowerBound } }],
      },
    ],
  })
    .select(
      "_id status startTime matchType playMode side1 side2 score tournament schedule court detachedFromRound",
    )
    .populate("side1.players", "name alias profilePictureUrl")
    .populate("side2.players", "name alias profilePictureUrl")
    .populate("tournament", "name duration")
    // `rounds` are embedded on Schedule; project only fields used by resolveMatchRound (mapper).
    .populate("schedule", "matchDurationMinutes rounds.game rounds.round rounds.slot")
    .populate("court", "name")
    .sort({ startTime: 1, _id: 1 })
    .lean<LiveMatchGameDoc[]>()
    .exec();
}

/** Active tournaments the user joined that have no in-flight match in {@link fetchLiveMatchGames}. */
export async function fetchEligibleTournamentsWithoutUserMatches(
  userId: Types.ObjectId,
  tournamentIdsWithMatches: Set<string>,
) {
  const filter: Record<string, unknown> = {
    status: "active",
    participants: userId,
  };

  if (tournamentIdsWithMatches.size > 0) {
    filter._id = {
      $nin: Array.from(tournamentIdsWithMatches).map((id) => new Types.ObjectId(id)),
    };
  }

  return Tournament.find(filter)
    .select("name date playMode tournamentMode")
    .sort({ date: 1, name: 1 })
    .lean<EligibleTournamentWithoutMatchesDoc[]>()
    .exec();
}

/**
 * Persists timed status transitions (draft→active, etc.) and mirrors updates on the in-memory docs.
 */
export async function applyResolvedTimedStatuses(
  games: LiveMatchGameDoc[],
  now: Date,
): Promise<void> {
  const statusUpdates: Array<{
    id: Types.ObjectId;
    status: GameStatus;
    expectedStatus: GameStatus;
  }> = [];

  for (const game of games) {
    const durationMinutes =
      game.schedule?.matchDurationMinutes ?? game.tournament?.duration ?? 60;

    const nextStatus = resolveTimedGameStatus({
      persistedStatus: game.status,
      startTime: game.startTime ?? null,
      matchDurationMinutes: durationMinutes,
      now,
    });

    if (nextStatus !== game.status) {
      statusUpdates.push({
        id: game._id,
        status: nextStatus,
        expectedStatus: game.status,
      });
    }
  }

  if (statusUpdates.length === 0) {
    return;
  }

  const appliedUpdates = await updateGameStatuses(statusUpdates);
  const statusById = new Map(
    appliedUpdates.map((u) => [u.id.toString(), u.status]),
  );
  for (const game of games) {
    const persisted = statusById.get(game._id.toString());
    if (persisted !== undefined) {
      game.status = persisted;
    }
  }
}
