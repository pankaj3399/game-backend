import mongoose from "mongoose";
import type { AuthenticatedSession } from "../../../shared";
import { error, ok } from "../../../shared/helpers";
import { addParticipantIfCapacityAllows } from "./queries";

/**
 * Atomically adds the user to the tournament participants if capacity allows.
 * Uses findOneAndUpdate with $addToSet to prevent race conditions.
 */
export async function joinTournamentFlow(
  tournamentId: string,
  session: AuthenticatedSession
) {
  const returnedDoc = await addParticipantIfCapacityAllows(tournamentId, session._id);

  if (!returnedDoc) {
    return error(400, "This tournament is either full or no longer accepting participants");
  }

  const spotsFilled = (returnedDoc.participants ?? []).length;
  const spotsTotal = Math.max(1, returnedDoc.maxMember ?? 1);
  const isParticipant = (returnedDoc.participants ?? []).some((pid: mongoose.Types.ObjectId) => pid.toString() === session._id.toString());

  return ok({
    tournamentId,
    spotsFilled,
    spotsTotal,
    isParticipant,
  }, { status: 200, message: "Successfully joined tournament" });
}
