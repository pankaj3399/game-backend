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
    if (!mongoose.isValidObjectId(id)) {
      return error(400, "Invalid tournament id");
    }

    const [tournament] = await Tournament.aggregate<TournamentForUpdateAuth>([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $project: {
          club: 1,
          createdBy: 1,
          status: 1,
          sponsor: 1,
          name: 1,
          minMember: 1,
          maxMember: 1,
          totalRounds: 1,
          date: 1,
          startTime: 1,
          endTime: 1,
          timezone: 1,
          playMode: 1,
          tournamentMode: 1,
          entryFee: 1,
          duration: 1,
          breakDuration: 1,
          foodInfo: 1,
          descriptionInfo: 1,
          participantCount: { $size: { $ifNull: ["$participants", []] } },
        },
      },
    ]);
    if(!tournament){
      return error(404, "Tournament not found");
    }
    return ok(tournament , { status: 200, message: "Tournament fetched successfully" });
  }
  catch(err){
    logger.error("Error fetching tournament for update", { err });
    return error(500, "Internal server error");
  }
}
