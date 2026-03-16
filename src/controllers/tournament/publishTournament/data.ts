import Tournament from "../../../models/Tournament";
import { error, ok } from "../../../shared/helpers";
import { logger } from "../../../lib/logger";

/**
 * Fetches a tournament by ID as a lean document for publish flow.
 * Returns null if not found.
 */
export async function fetchTournamentForPublish(id: string) {
  try{
    const tournament = await Tournament.findById(id)
    .select("_id club status name sponsor logo date startTime endTime playMode tournamentMode entryFee minMember maxMember duration breakDuration courts foodInfo descriptionInfo")
    .lean()
    .exec();
    if(!tournament){
      return error(404, "Tournament not found");
    }
    return ok(tournament, { status: 200, message: "Tournament fetched successfully" });
  }
  catch(err){
    logger.error("Error fetching tournament for publish", { err });
    return error(500, "Internal server error");
  }
}
