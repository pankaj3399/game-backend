import Tournament from "../../../models/Tournament";
import Court from "../../../models/Court";
import { error, ok } from "../../../shared/helpers";
import { logger } from "../../../lib/logger";

/**
 * Fetches a tournament by ID as a lean document for publish flow.
 * Returns null if not found.
 */
export async function fetchTournamentForPublish(id: string) {
  try{
    const tournament = await Tournament.findById(id)
    .select("_id club createdBy status name sponsor date startTime endTime playMode tournamentMode entryFee minMember maxMember duration breakDuration courts foodInfo descriptionInfo")
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

/**
 * Fetches all court IDs for a club for publish flow.
 */
export async function fetchClubCourtIdsForPublish(clubId: string) {
  try {
    const clubCourts = await Court.find({
      club: clubId,
    })
      .select("_id")
      .lean()
      .exec();

    return ok(
      clubCourts.map((court) => court._id.toString()),
      { status: 200, message: "Club courts fetched successfully" }
    );
  } catch (err) {
    logger.error("Error fetching club courts for publish", { err, clubId });
    return error(500, "Internal server error");
  }
}

/**
 * Persists a validated publish payload and returns public response fields.
 */
export async function updateTournamentForPublish(
  tournamentId: string,
  payload: Record<string, unknown>
) {
  try {
    const updated = await Tournament.findByIdAndUpdate(
      tournamentId,
      { $set: payload },
      { new: true, runValidators: true }
    )
      .select("_id name club status")
      .lean()
      .exec();

    if (!updated) {
      return error(404, "Tournament not found");
    }

    return ok(
      {
        id: updated._id.toString(),
        name: updated.name,
        club: updated.club.toString(),
        status: "active" as const,
      },
      { status: 200, message: "Tournament updated successfully" }
    );
  } catch (err) {
    logger.error("Error updating tournament for publish", { err, tournamentId });
    return error(500, "Internal server error");
  }
}
