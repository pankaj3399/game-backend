import type { ClientSession, Types } from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import { LogWarning } from "../../../lib/logger";
import type { GameStatus } from "../../../types/domain/game";
import type {
  GameForMatchesDoc,
  ScheduleForMatchesDoc,
  ScheduleRoundDoc,
} from "./types";

/** Load schedule by id (the tournament’s single ref). No separate tournament filter — `_id` is enough. */
export async function fetchScheduleForTournament(scheduleId: Types.ObjectId | null) {
  if (scheduleId == null) {
    return null;
  }

  return Schedule.findById(scheduleId)
    .select("_id status currentRound matchDurationMinutes rounds")
    .lean<ScheduleForMatchesDoc>()
    .exec();
}

export async function fetchGamesForScheduleRounds(
  tournamentId: Types.ObjectId,
  scheduleId: Types.ObjectId | null,
  rounds: ScheduleRoundDoc[]
) {
  const gameIds = rounds.map((entry) => entry.game);

  // Populate is required: `GameForMatchesDoc` / `GameMatchPlayerSlot` assume
  // populated side players (see getTournamentMatches mapper), not raw refs.
  const orConditions: Array<Record<string, unknown>> = [
    // Always include detached historical games for this tournament so cancelled/regenerated
    // rounds remain visible even after their schedule entries are removed.
    { tournament: tournamentId, isHistorical: true },
  ];

  if (scheduleId != null && gameIds.length > 0) {
    orConditions.push({ schedule: scheduleId, _id: { $in: gameIds } });
  }

  return Game.find({
    $or: orConditions,
  })
    .select("_id side1 side2 court status matchType playMode startTime score isHistorical detachedFromRound detachedFromSlot")
    .populate("side1.players", "name alias profilePictureUrl")
    .populate("side2.players", "name alias profilePictureUrl")
    .populate("court", "name")
    .lean<GameForMatchesDoc[]>()
    .exec();
}

/**
 * Applies status transitions with optimistic concurrency (`expectedStatus` in the filter).
 * Updates that no longer match (another writer changed `status` first) are skipped silently;
 * compare `matchedCount` to `updates.length` below to detect partial application.
 */
export async function updateGameStatuses(
  updates: { id: Types.ObjectId; status: GameStatus; expectedStatus: GameStatus }[],
  session?: ClientSession
): Promise<Array<{ id: Types.ObjectId; status: GameStatus }>> {
  if (updates.length === 0) {
    return [];
  }

  const result = await Game.bulkWrite(
    updates.map((entry) => ({
      updateOne: {
        filter: { _id: entry.id, status: entry.expectedStatus },
        update: { $set: { status: entry.status } },
      },
    })),
    session ? { session } : {}
  );

  if (result.matchedCount < updates.length) {
    LogWarning(
      "updateGameStatuses",
      `optimistic concurrency: matched ${result.matchedCount} of ${updates.length} game status updates (expected status changed concurrently)`
    );
  }

  const desiredById = new Map(updates.map((entry) => [entry.id.toString(), entry.status]));
  const ids = updates.map((entry) => entry.id);
  const persisted = await Game.find({ _id: { $in: ids } })
    .select("_id status")
    .setOptions(session ? { session } : {})
    .lean<Array<{ _id: Types.ObjectId; status: GameStatus }>>()
    .exec();

  return persisted
    .filter((entry) => desiredById.get(entry._id.toString()) === entry.status)
    .map((entry) => ({ id: entry._id, status: entry.status }));
}
