import mongoose from "mongoose";
import type { AuthenticatedSession } from "../../../shared";
import { error, ok } from "../../../shared/helpers";
import { isTournamentSchedulingLocked } from "../schedulingLock";
import {
  findTournamentForLeave,
  findTournamentForLeaveConflictCheck,
  pullTournamentParticipantIfNotScheduled,
  scheduleHasProgressBlockingLeave,
} from "./queries";
const LEAVE_SCHEDULE_LOCKED = "LEAVE_SCHEDULE_LOCKED";

/**
 * Atomically removes the user from tournament participants.
 */
export async function leaveTournamentFlow(
  tournamentId: string,
  authSession: AuthenticatedSession
) {
  const tournament = await findTournamentForLeave(tournamentId);

  if (!tournament) {
    return error(404, "Tournament not found");
  }

  const participantIds = tournament.participants ?? [];
  const userIsParticipant = participantIds.some(
    (id) => id._id?.equals(authSession._id)
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
  let returnedDoc = null;

  try {
    returnedDoc = await mongoSession.withTransaction(async () => {
      const scheduleId = tournament.schedule?._id ?? null;
      if (scheduleId != null) {
        const scheduleHasProgress = await scheduleHasProgressBlockingLeave(
          scheduleId,
          mongoSession
        );

        if (scheduleHasProgress) {
          const err = new Error(LEAVE_SCHEDULE_LOCKED);
          (err as Error & { code?: string }).code = LEAVE_SCHEDULE_LOCKED;
          throw err;
        }
      }

      return pullTournamentParticipantIfNotScheduled(
        tournamentId,
        authSession._id,
        mongoSession
      );
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
    const fresh = await findTournamentForLeaveConflictCheck(tournamentId);

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
