import mongoose from "mongoose";
import Tournament from "../../../models/Tournament";
import type { AuthenticatedSession } from "../../shared";
import { error, ok } from "../../shared/helpers";

/**
 * Atomically adds the user to the tournament participants if capacity allows.
 * Uses findOneAndUpdate with $addToSet to prevent race conditions.
 */
export async function joinTournamentFlow(
  tournamentId: string,
  session: AuthenticatedSession
) {
  const returnedDoc = await Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      status: "active",
      $expr: {
        $lt: [
          { $size: { $ifNull: ["$participants", []] } },
          { $ifNull: ["$maxMember", 1] },
        ],
      },
    },
    { $addToSet: { participants: session._id } },
    { new: true }
  )
    .select("participants maxMember")
    .lean()
    .exec();

  if (!returnedDoc) {
    return error(400, "This tournament is already full");
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
