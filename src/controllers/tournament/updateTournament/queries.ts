import mongoose from "mongoose";
import { logger } from "../../../lib/logger";
import Tournament from "../../../models/Tournament";
import { error, ok } from "../../../shared/helpers";
import type { TournamentForUpdateAuth } from "../../../types/api";

/**
 * Fetches a tournament by ID as a lean document for update flow.
 * Returns null if not found.
 */
export async function fetchTournamentForUpdate(id: string) {
  try{
    const tournament = await Tournament.findById(id)
      .select(
        "club createdBy status sponsor name minMember maxMember totalRounds date startTime endTime playMode tournamentMode entryFee duration breakDuration foodInfo descriptionInfo"
      )
      .lean<TournamentForUpdateAuth>()
      .exec();
    if(!tournament){
      return error(404, "Tournament not found");
    }
    const [meta] = await Tournament.aggregate<{ participantCount: number }>([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $project: {
          participantCount: { $size: { $ifNull: ["$participants", []] } },
        },
      },
    ]);
    const participantCount = meta?.participantCount ?? 0;
    return ok({ ...tournament, participantCount } , { status: 200, message: "Tournament fetched successfully" });
  }
  catch(err){
    logger.error("Error fetching tournament for update", { err });
    return error(500, "Internal server error");
  }
}
