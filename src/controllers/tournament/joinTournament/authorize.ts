import mongoose from "mongoose";
import type { AuthenticatedSession } from "../../../shared/authContext";
import { error, ok } from "../../../shared/helpers";
import { computeSpotsTotal } from "../computeSpotsTotal";
import { isTournamentSchedulingLocked } from "../schedulingLock";

export interface JoinTournamentDoc {
  _id: mongoose.Types.ObjectId;
  club?: { _id: mongoose.Types.ObjectId } | null;
  status: string;
  participants?: mongoose.Types.ObjectId[];
  maxMember: number;
  firstRoundScheduledAt?: Date | null;
  schedule?: {
    currentRound?: number;
  } | mongoose.Types.ObjectId | null;
}

/**
 * Validates that the user can join the tournament.
 */
export async function authorizeJoin(
  tournament: JoinTournamentDoc,
  session: AuthenticatedSession
){
  if (tournament.status !== "active") {
    return error(400, "Only active tournaments can be joined");
  }

  const clubId = tournament.club?._id?.toString();
  if (!clubId) {
    return error(400, "Tournament has no club"); 
  }

  const userId = session._id.toString();
  const alreadyJoined = (tournament.participants ?? []).some(
    (pid: mongoose.Types.ObjectId) => pid.toString() === userId
  );
  if (alreadyJoined) {
    return error(400, "Already joined");
  }

  if (tournament.firstRoundScheduledAt) {
    return error(400, "Tournament join is closed because the first round has already been scheduled");
  }

  if (isTournamentSchedulingLocked(tournament)) {
    return error(400, "Tournament join is closed because scheduling has already started");
  }

  // Capacity must match mapTournamentDetail `permissions.canJoin` (hasAvailableSpots).
  const spotsFilled = (tournament.participants ?? []).length;
  const spotsTotal = computeSpotsTotal(tournament.maxMember);
  const hasAvailableSpots = spotsFilled < spotsTotal;
  if (!hasAvailableSpots) {
    return error(400, "Tournament full");
  }

  return ok({}, { status: 200, message: "Authorized" });
}
