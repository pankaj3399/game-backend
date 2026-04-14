import type { Types } from "mongoose";
import Game from "../../../models/Game";
import Schedule from "../../../models/Schedule";
import type { DbIdLike } from "../../../types/domain/common";
import type {
  GameForMatchesDoc,
  ScheduleForMatchesDoc,
  ScheduleRoundDoc,
} from "./types";

export async function fetchScheduleForTournament(
  tournamentId: string,
  scheduleId: DbIdLike | null | undefined
): Promise<ScheduleForMatchesDoc | null> {
  const query = scheduleId
    ? Schedule.findOne({ _id: scheduleId, tournament: tournamentId })
    : Schedule.findOne({ tournament: tournamentId });

  return query
    .select("_id status currentRound rounds")
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
    .select("_id playerOne playerTwo court status startTime")
    .populate("playerOne", "name alias")
    .populate("playerTwo", "name alias")
    .populate("court", "name")
    .lean<GameForMatchesDoc[]>()
    .exec();
}
