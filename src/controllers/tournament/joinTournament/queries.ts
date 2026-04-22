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
 * Atomically adds the user if the tournament is active and participant count is
 * still below maxMember (Mongo `$expr` + `$addToSet`).
 * Returns the updated document, or null if the filter matched nothing (full / wrong state).
 */
export async function addParticipantIfCapacityAllows(
  tournamentId: string,
  userId: mongoose.Types.ObjectId
) {
  return Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      status: "active",
      $expr: {
        $or: [
          { $not: [{ $isNumber: "$maxMember" }] },
          {
            $lt: [{ $size: { $ifNull: ["$participants", []] } }, "$maxMember"],
          },
        ],
      },
    },
    { $addToSet: { participants: userId } },
    { returnDocument: "after" }
  )
    .select("participants maxMember")
    .lean<JoinTournamentLeanDoc | null>()
    .exec();
}
