import { Types } from "mongoose";
import Game from "../../../models/Game";
import { buildPermissionContext, type AuthenticatedSession } from "../../../shared/authContext";
import { isOwnerOrSuperAdmin, userCanManageClub } from "../../../lib/permissions";
import { error, ok } from "../../../shared/helpers";
import type { TournamentScheduleContext } from "./types";

export async function authorizeScheduleAccess(
  tournament: TournamentScheduleContext,
  session: AuthenticatedSession
) {
  if (!tournament.club || tournament.club._id == null) {
    return error(400, "Tournament has no club");
  }

  const clubId = tournament.club._id.toString();

  if (isOwnerOrSuperAdmin(session, tournament.createdBy)) {
    return ok({ clubId }, { status: 200, message: "Authorized" });
  }

  const permissionContext = buildPermissionContext(session);
  const canManageClub = await userCanManageClub(permissionContext, clubId);
  if (!canManageClub) {
    return error(403, "You do not have permission to schedule this tournament");
  }

  return ok({ clubId }, { status: 200, message: "Authorized" });
}

/**
 * Staff scheduling permission, or (if `matchId` is set) the user is a player on that match.
 * Avoids duplicating staff checks vs participant checks across controllers.
 */
export async function authorizeScheduleOrMatchParticipant(
  tournament: TournamentScheduleContext,
  session: AuthenticatedSession,
  options: { matchId?: string }
) {
  const primary = await authorizeScheduleAccess(tournament, session);
  if (primary.status === 200) {
    return primary;
  }

  const matchId = options.matchId;
  if (!matchId || !Types.ObjectId.isValid(matchId)) {
    return primary;
  }

  const isParticipant = await Game.exists({
    _id: new Types.ObjectId(matchId),
    tournament: tournament._id,
    gameMode: "tournament",
    "teams.players": session._id,
  });

  if (isParticipant) {
    const clubId = tournament.club?._id.toString() ?? "";
    return ok({ clubId }, { status: 200, message: "Authorized" });
  }

  return primary;
}
