import mongoose from "mongoose";
import Game from "../../../models/Game";
import type { GameStatus } from "../../../types/domain/game";
import { resolveTimedGameStatus } from "../../../shared/matchTiming";
import type { ScheduleMode } from "../shared/types";

type ScheduleRoundEntryLike = {
  game: mongoose.Types.ObjectId;
  slot: number;
  round: number;
  mode: ScheduleMode;
};

export async function ensurePreviousRoundFinished(
  scheduleDoc: {
    _id: mongoose.Types.ObjectId;
    rounds: ScheduleRoundEntryLike[];
  },
  targetRound: number,
  matchDurationMinutes: number,
  session: mongoose.ClientSession
) {
  if (targetRound <= 1) {
    return;
  }

  const previousRound = targetRound - 1;
  const previousRoundEntries = scheduleDoc.rounds.filter(
    (entry: ScheduleRoundEntryLike) => entry.round === previousRound
  );

  if (previousRoundEntries.length === 0) {
    throw new Error(
      `Round ${previousRound} has not been generated yet. Generate and complete it before creating round ${targetRound}.`
    );
  }

  const previousRoundGameIds = previousRoundEntries.map((entry) => entry.game);
  const previousRoundGames = await Game.find({
    _id: { $in: previousRoundGameIds },
    schedule: scheduleDoc._id,
  })
    .select("_id status startTime")
    .session(session)
    .lean<Array<{ _id: mongoose.Types.ObjectId; status: GameStatus; startTime?: Date | null }>>()
    .exec();

  const now = new Date();
  const updates: Array<{ id: mongoose.Types.ObjectId; status: GameStatus }> = [];
  const statusByGameId = new Map<string, GameStatus>();

  for (const game of previousRoundGames) {
    const nextStatus = resolveTimedGameStatus({
      persistedStatus: game.status,
      startTime: game.startTime ?? null,
      matchDurationMinutes,
      now,
    });

    statusByGameId.set(game._id.toString(), nextStatus);

    if (nextStatus !== game.status) {
      updates.push({ id: game._id, status: nextStatus });
    }
  }

  if (updates.length > 0) {
    await Game.bulkWrite(
      updates.map((entry) => ({
        updateOne: {
          filter: { _id: entry.id },
          update: { $set: { status: entry.status } },
        },
      })),
      { session }
    );
  }

  for (const entry of previousRoundEntries) {
    const gameId = entry.game.toString();
    const status = statusByGameId.get(gameId);

    if (status === undefined) {
      throw new Error(
        `Missing game data for game ${gameId} in round ${previousRound} (expected in schedule before generating round ${targetRound})`
      );
    }

    if (status !== "finished" && status !== "cancelled") {
      throw new Error(
        `Round ${previousRound} is not finished yet. Complete all match scores before generating round ${targetRound}.`
      );
    }
  }
}
