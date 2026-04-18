import Tournament from "../../../models/Tournament";
import type { TournamentPopulated } from "../../../types/api/tournament";
import type { AuthenticatedSession } from "../../../shared";
import { error, ok } from "../../../shared/helpers";
import { isTournamentSchedulingLocked } from "../schedulingLock";

/**
 * Atomically removes the user from tournament participants.
 */
export async function leaveTournamentFlow(
  tournamentId: string,
  session: AuthenticatedSession
) {
  const tournament = await Tournament.findById(tournamentId)
    .select("participants firstRoundScheduledAt")
    .populate({
      path: "schedule",
      select: "currentRound rounds.round",
    })
    .lean<TournamentPopulated>()
    .exec();

  if (!tournament) {
    return error(404, "Tournament not found");
  }

  const participantIds = tournament.participants ?? [];
  const userIsParticipant = participantIds.some(
    (id) => id.toString() === session._id.toString()
  );

  if (!userIsParticipant) {
    return error(400, "You are not a participant in this tournament");
  }

  if (isTournamentSchedulingLocked(tournament)) {
    return error(
      400,
      "You cannot leave this tournament after scheduling has started"
    );
  }

  const returnedDoc = await Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      participants: session._id,
      $or: [
        { firstRoundScheduledAt: { $exists: false } },
        { firstRoundScheduledAt: null },
      ],
    },
    { $pull: { participants: session._id } },
    { new: true }
  )
    .select("participants maxMember")
    .lean()
    .exec();

  if (!returnedDoc) {
    const fresh = await Tournament.findById(tournamentId)
      .select("participants firstRoundScheduledAt")
      .populate({
        path: "schedule",
        select: "currentRound rounds.round",
      })
      .lean<TournamentPopulated>()
      .exec();

    if (!fresh) {
      return error(404, "Tournament not found");
    }

    const stillParticipant = (fresh.participants ?? []).some(
      (id) => id.toString() === session._id.toString()
    );

    if (!stillParticipant) {
      return error(400, "You are not a participant in this tournament");
    }

    if (isTournamentSchedulingLocked(fresh)) {
      return error(
        400,
        "You cannot leave this tournament after scheduling has started"
      );
    }

    return error(
      409,
      "Unable to leave tournament due to a concurrent update. Please retry."
    );
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
