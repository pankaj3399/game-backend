import { logger } from "../../../lib/logger";
import Tournament from "../../../models/Tournament";
import { error, ok } from "../../shared/helpers";

/**
 * Fetches a tournament by ID as a lean document for update flow.
 * Returns null if not found.
 */
export async function fetchTournamentForUpdate(id: string) {
  try{
    const tournament = await Tournament.findById(id).lean().exec();
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
