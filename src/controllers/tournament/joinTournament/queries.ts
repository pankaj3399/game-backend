import type mongoose from "mongoose";
import Tournament from "../../../models/Tournament";

export interface JoinTournamentLeanDoc {
  participants?: mongoose.Types.ObjectId[];
  maxMember?: number;
}

export async function getTournamentById(tournamentId: string) {
  return Tournament.findById(tournamentId)
    .select("_id club name status minMember maxMember participants firstRoundScheduledAt")
    .populate("club")
    .lean()
    .exec();
}

/**
 * Atomically adds the user if the tournament is active, scheduling has not started,
 * and participant count is still below maxMember (Mongo `$expr` + `$addToSet`).
 * Returns the updated document, or null if the filter matched nothing (full / closed / wrong state).
 */
export async function addParticipantIfCapacityAllows(
  tournamentId: string,
  userId: mongoose.Types.ObjectId
) {
  return Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      status: "active",
      firstRoundScheduledAt: null,
      $expr: {
        $lt: [
          { $size: { $ifNull: ["$participants", []] } },
          { $ifNull: ["$maxMember", 1] },
        ],
      },
    },
    { $addToSet: { participants: userId } },
    { new: true }
  )
    .select("participants maxMember")
    .lean<JoinTournamentLeanDoc | null>()
    .exec();
}
