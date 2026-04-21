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
  scheduleId: Types.ObjectId | null,
  rounds: ScheduleRoundDoc[]
) {
  if (scheduleId == null || rounds.length === 0) {
    return [];
  }

  const gameIds = rounds.map((entry) => entry.game);

  // Populate is required: `GameForMatchesDoc` / `GameMatchPlayerSlot` assume
  // populated side players (see getTournamentMatches mapper), not raw refs.
  return Game.find({ schedule: scheduleId, _id: { $in: gameIds } })
    .select("_id side1 side2 court status matchType playMode startTime score")
    .populate("side1.players", "name alias elo.rating elo.rd")
    .populate("side2.players", "name alias elo.rating elo.rd")
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
) {
  if (updates.length === 0) {
    return [] as Array<{ id: Types.ObjectId; status: GameStatus }>;
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
