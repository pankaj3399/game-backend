import mongoose from "mongoose";
import type { Types } from "mongoose";
import Tournament from "../../../models/Tournament";
import Schedule from "../../../models/Schedule";
import type { TournamentPopulated } from "../../../types/api/tournament";
import type { AuthenticatedSession } from "../../../shared";
import { error, ok } from "../../../shared/helpers";
import { isTournamentSchedulingLocked } from "../schedulingLock";

const LEAVE_SCHEDULE_LOCKED = "LEAVE_SCHEDULE_LOCKED";

function getScheduleIdForLockCheck(
  schedule: TournamentPopulated["schedule"]
): Types.ObjectId | null {
  if (schedule == null) {
    return null;
  }
  if (typeof schedule === "object" && "_id" in schedule && schedule._id != null) {
    return schedule._id as Types.ObjectId;
  }
  return schedule as Types.ObjectId;
}

/**
 * Atomically removes the user from tournament participants.
 */
export async function leaveTournamentFlow(
  tournamentId: string,
  authSession: AuthenticatedSession
) {
  const tournament = await Tournament.findById(tournamentId)
    .select("participants firstRoundScheduledAt schedule")
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
    (id) => id.toString() === authSession._id.toString()
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

  const mongoSession = await mongoose.startSession();
  let returnedDoc: {
    participants?: Array<{ toString: () => string }>;
    maxMember?: number;
  } | null = null;

  try {
    returnedDoc = await mongoSession.withTransaction(async () => {
      const scheduleId = getScheduleIdForLockCheck(tournament.schedule);
      if (scheduleId != null) {
        const scheduleHasProgress = await Schedule.exists({
          _id: scheduleId,
          $or: [
            { currentRound: { $gte: 1 } },
            { rounds: { $elemMatch: { round: { $gte: 1 } } } },
          ],
        }).session(mongoSession);

        if (scheduleHasProgress) {
          const err = new Error(LEAVE_SCHEDULE_LOCKED);
          (err as Error & { code?: string }).code = LEAVE_SCHEDULE_LOCKED;
          throw err;
        }
      }

      return await Tournament.findOneAndUpdate(
        {
          _id: tournamentId,
          participants: authSession._id,
          $or: [
            { firstRoundScheduledAt: { $exists: false } },
            { firstRoundScheduledAt: null },
          ],
        },
        { $pull: { participants: authSession._id } },
        { new: true, session: mongoSession }
      )
        .select("participants maxMember")
        .lean()
        .exec();
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as Error & { code?: string }).code === LEAVE_SCHEDULE_LOCKED
    ) {
      return error(
        400,
        "You cannot leave this tournament after scheduling has started"
      );
    }
    throw err;
  } finally {
    await mongoSession.endSession();
  }

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
      (id) => id.toString() === authSession._id.toString()
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
