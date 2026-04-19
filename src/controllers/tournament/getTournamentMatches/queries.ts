import type { ClientSession, Types } from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
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
    .populate("side1.players", "name alias")
    .populate("side2.players", "name alias")
    .populate("court", "name")
    .lean<GameForMatchesDoc[]>()
    .exec();
}

export async function updateGameStatuses(
  updates: { id: Types.ObjectId; status: GameStatus; expectedStatus: GameStatus }[],
  session?: ClientSession
) {
  if (updates.length === 0) {
    return;
  }

  await Game.bulkWrite(
    updates.map((entry) => ({
      updateOne: {
        filter: { _id: entry.id, status: entry.expectedStatus },
        update: { $set: { status: entry.status } },
      },
    })),
    session ? { session } : {}
  );
}
