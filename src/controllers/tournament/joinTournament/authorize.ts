import mongoose from "mongoose";
import { ROLES } from "../../../constants/roles";
import type { AuthenticatedSession } from "../../../shared/authContext";
import { error, ok } from "../../../shared/helpers";

export interface JoinTournamentDoc {
  _id: mongoose.Types.ObjectId;
  club?: { _id: mongoose.Types.ObjectId } | null;
  status: string;
  participants?: mongoose.Types.ObjectId[];
  maxMember?: number;
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

  const isBlockedRole =
    session.role === ROLES.CLUB_ADMIN ||
    session.role === ROLES.SUPER_ADMIN;

  if (isBlockedRole) {
    return error(400, "Club and super admins cannot join this tournament as participants");
  }

  const userId = session._id.toString();
  const alreadyJoined = (tournament.participants ?? []).some(
    (pid: mongoose.Types.ObjectId) => pid.toString() === userId
  );
  if (alreadyJoined) {
    return error(400, "Already joined");
  }

  // Capacity must match mapTournamentDetail `permissions.canJoin` (hasAvailableSpots).
  const spotsFilled = (tournament.participants ?? []).length;
  const maxMember = tournament.maxMember;
  const spotsTotal =
    maxMember !== undefined && Number.isFinite(maxMember)
      ? Math.max(0, Math.trunc(maxMember))
      : 0;
  const hasAvailableSpots = spotsFilled < spotsTotal;
  if (!hasAvailableSpots) {
    return error(400, "Tournament full");
  }

  return ok({}, { status: 200, message: "Authorized" });
}
