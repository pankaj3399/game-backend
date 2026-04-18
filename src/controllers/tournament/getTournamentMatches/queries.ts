import type { Types } from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import type { DbIdLike } from "../../../types/domain/common";
import type { GameStatus } from "../../../types/domain/game";
import type {
  GameForMatchesDoc,
  ScheduleForMatchesDoc,
  ScheduleRoundDoc,
} from "./types";

function resolveScheduleRef(
	scheduleRef: DbIdLike | { _id: DbIdLike } | null | undefined
): DbIdLike | null | undefined {
	if (scheduleRef == null) {
		return scheduleRef;
	}
	if (
		typeof scheduleRef === "object" &&
		"_id" in scheduleRef &&
		(scheduleRef as { _id: unknown })._id != null
	) {
		return (scheduleRef as { _id: DbIdLike })._id;
	}
	return scheduleRef as DbIdLike;
}

export async function fetchScheduleForTournament(
	tournamentId: string,
	scheduleId: DbIdLike | { _id: DbIdLike } | null | undefined
): Promise<ScheduleForMatchesDoc | null> {
	const resolved = resolveScheduleRef(scheduleId) ?? null;
	const query = resolved
		? Schedule.findOne({ _id: resolved, tournament: tournamentId })
		: Schedule.findOne({ tournament: tournamentId });

  return query
    .select("_id status currentRound matchDurationMinutes rounds")
    .lean<ScheduleForMatchesDoc>()
    .exec();
}

export async function fetchGamesForScheduleRounds(
  scheduleId: Types.ObjectId | string | null | undefined,
  rounds: ScheduleRoundDoc[]
): Promise<GameForMatchesDoc[]> {
  if (rounds.length === 0) {
    return [];
  }
  if (scheduleId == null) {
    return [];
  }

  const gameIds = [...new Set(rounds.map((entry) => entry.game.toString()))];

  return Game.find({ _id: { $in: gameIds }, schedule: scheduleId })
    .select("_id teams court status matchType startTime score")
    .populate("teams.players", "name alias")
    .populate("court", "name")
    .lean<GameForMatchesDoc[]>()
    .exec();
}

export async function updateGameStatuses(
  updates: Array<{ id: Types.ObjectId | string; status: GameStatus }>
) {
  if (updates.length === 0) {
    return;
  }

  await Game.bulkWrite(
    updates.map((entry) => ({
      updateOne: {
        filter: { _id: entry.id },
        update: { $set: { status: entry.status } },
      },
    }))
  );
}
