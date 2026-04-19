import { buildPermissionContext, type AuthenticatedSession } from "../../../shared/authContext";
import { isOwnerOrSuperAdmin, userCanManageClub } from "../../../lib/permissions";
import { error, ok } from "../../../shared/helpers";
import Game from "../../../models/Game";
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
 * Schedule managers/owners, or a player on the given match (side1/side2).
 */
export async function authorizeScheduleOrMatchParticipant(
  tournament: TournamentScheduleContext,
  session: AuthenticatedSession,
  options: { matchId: string }
) {
  const scheduleAuth = await authorizeScheduleAccess(tournament, session);
  if (scheduleAuth.status === 200) {
    return scheduleAuth;
  }

  const match = await Game.findOne({
    _id: options.matchId,
    tournament: tournament._id,
    gameMode: "tournament",
    $or: [{ "side1.players": session._id }, { "side2.players": session._id }],
  })
    .select("_id")
    .lean<{ _id: unknown } | null>()
    .exec();

  if (!match) {
    return scheduleAuth;
  }

  if (!tournament.club || tournament.club._id == null) {
    return error(400, "Tournament has no club");
  }

  return ok(
    { clubId: tournament.club._id.toString() },
    { status: 200, message: "Authorized" }
  );
}
