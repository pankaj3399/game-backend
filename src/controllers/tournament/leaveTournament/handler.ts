import Tournament from "../../../models/Tournament";
import type { AuthenticatedSession } from "../../../shared";
import { error, ok } from "../../../shared/helpers";

/**
 * Atomically removes the user from tournament participants.
 */
export async function leaveTournamentFlow(
  tournamentId: string,
  session: AuthenticatedSession
) {
  const tournamentExists = await Tournament.exists({ _id: tournamentId });
  if (!tournamentExists) {
    return error(404, "Tournament not found");
  }

  const returnedDoc = await Tournament.findOneAndUpdate(
    { _id: tournamentId, participants: session._id },
    { $pull: { participants: session._id } },
    { new: true }
  )
    .select("participants maxMember")
    .lean()
    .exec();

  if (!returnedDoc) {
    return error(400, "You are not a participant in this tournament");
  }

  const spotsFilled = (returnedDoc.participants ?? []).length;
  const spotsTotal = Math.max(1, returnedDoc.maxMember ?? 1);
  // Post-$pull document no longer contains this user in participants, so membership is always false here.
  const isParticipant = false;

  return ok(
    {
      tournamentId,
      spotsFilled,
      spotsTotal,
      isParticipant,
    },
    { status: 200, message: "Successfully left tournament" }
  );
}
