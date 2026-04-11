import { buildPermissionContext, type AuthenticatedSession } from "../../../shared/authContext";
import { isOwnerOrSuperAdmin, userCanManageClub } from "../../../lib/permissions";
import { error, ok } from "../../../shared/helpers";
import type { TournamentScheduleContext } from "./types";

export async function authorizeScheduleAccess(
  tournament: TournamentScheduleContext,
  session: AuthenticatedSession
) {
  const clubId = tournament.club?._id.toString();
  if (!clubId) {
    return error(400, "Tournament has no club");
  }

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
