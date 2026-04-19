import type { Types } from "mongoose";
import Game from "../../../models/Game";
import type { GameStatus } from "../../../types/domain/game";
import { resolveTimedGameStatus } from "../../../shared/matchTiming";
import { updateGameStatuses } from "../getTournamentMatches/queries";
import type { LiveMatchGameDoc } from "./types";

const LIVE_MATCH_LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000;

export async function fetchLiveMatchGames(userId: Types.ObjectId) {
  const startTimeLowerBound = new Date(Date.now() - LIVE_MATCH_LOOKBACK_MS);

  return Game.find({
    gameMode: "tournament",
    status: { $nin: ["finished", "cancelled"] },
    $or: [{ "side1.players": userId }, { "side2.players": userId }],
    startTime: { $ne: null, $gte: startTimeLowerBound },
  })
    .select("_id status startTime matchType side1 side2 tournament schedule court")
    .populate("side1.players", "name alias")
    .populate("side2.players", "name alias")
    .populate("tournament", "name duration")
    .populate("schedule", "matchDurationMinutes")
    .populate("court", "name")
    .sort({ startTime: 1 })
    .lean<LiveMatchGameDoc[]>()
    .exec();
}

/**
 * Persists timed status transitions (draft→active, etc.) and mirrors updates on the in-memory docs.
 */
export async function applyResolvedTimedStatuses(
  games: LiveMatchGameDoc[],
  now: Date
): Promise<void> {
  const statusUpdates: Array<{ id: Types.ObjectId; status: GameStatus }> = [];

  for (const game of games) {
    const durationMinutes = game.schedule?.matchDurationMinutes ?? game.tournament?.duration ?? 60;

    const nextStatus = resolveTimedGameStatus({
      persistedStatus: game.status,
      startTime: game.startTime ?? null,
      matchDurationMinutes: durationMinutes,
      now,
    });

    if (nextStatus !== game.status) {
      statusUpdates.push({ id: game._id, status: nextStatus });
    }
  }

  if (statusUpdates.length === 0) {
    return;
  }

  await updateGameStatuses(statusUpdates);
  const statusById = new Map(statusUpdates.map((u) => [u.id.toString(), u.status]));
  for (const game of games) {
    const persisted = statusById.get(game._id.toString());
    if (persisted !== undefined) {
      game.status = persisted;
    }
  }
}
