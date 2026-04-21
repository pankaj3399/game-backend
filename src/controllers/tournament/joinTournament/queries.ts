import type mongoose from "mongoose";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";

export interface JoinTournamentLeanDoc {
  participants?: mongoose.Types.ObjectId[];
  maxMember?: number;
}

export async function getTournamentById(tournamentId: string) {
  return Tournament.findById(tournamentId)
    .select("_id club name status minMember maxMember participants firstRoundScheduledAt schedule")
    .populate("club")
    .populate({ path: "schedule", select: "currentRound" })
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
  const scheduleDoc = await Schedule.findOne({ tournament: tournamentId })
    .select("_id currentRound")
    .lean<{ _id: mongoose.Types.ObjectId; currentRound?: number } | null>()
    .exec();

  if (scheduleDoc && Math.trunc(scheduleDoc.currentRound ?? 0) >= 1) {
    return null;
  }

  const scheduleFilter = scheduleDoc
    ? { schedule: scheduleDoc._id }
    : {
        $or: [{ schedule: { $exists: false } }, { schedule: null }],
      };

  return Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      status: "active",
      firstRoundScheduledAt: null,
      ...scheduleFilter,
      $expr: {
        $or: [
          { $not: [{ $isNumber: "$maxMember" }] },
          { $ne: ["$maxMember", "$maxMember"] },
          {
            $lt: [{ $size: { $ifNull: ["$participants", []] } }, "$maxMember"],
          },
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
