import mongoose from "mongoose";
import { userCanManageClub } from "../../../lib/permissions";
import { buildPermissionContext, type AuthenticatedSession } from "../../../shared/authContext";
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

  const ctx = buildPermissionContext(session);
  const isManager = await userCanManageClub(ctx, clubId);
  if (isManager) {
    return error(400, "Club managers cannot join this tournament as participants");
  }

  const userId = session._id.toString();
  const alreadyJoined = (tournament.participants ?? []).some(
    (pid: mongoose.Types.ObjectId) => pid.toString() === userId
  );
  if (alreadyJoined) {
    return error(400, "Already joined");
  }

  return ok({}, { status: 200, message: "Authorized" });
}
