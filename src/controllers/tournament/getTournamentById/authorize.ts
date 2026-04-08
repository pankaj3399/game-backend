import { isOwnerOrSuperAdmin, userCanManageClub } from "../../../lib/permissions";
import { ROLES, type Role } from "../../../constants/roles";
import type { TournamentPopulated } from "../../../types/api/tournament";
import { buildPermissionContext, type AuthenticatedSession } from "../../../shared/authContext";
import { error, ok } from "../../../shared/helpers";

export interface DetailViewContext {
  isManager: boolean;
  isCreator: boolean;
  clubIdStr: string;
  role: Role;
}

/**
 * Verifies the user can view the tournament.
 * Non-managers can only view active tournaments.
 */
export async function authorizeGetById(
  tournament: TournamentPopulated,
  session: AuthenticatedSession
) {
  const role = session.role;
  const clubIdStr = tournament.club?._id?.toString();
  if (!clubIdStr) {
    return error(400, "Tournament has no club");
  }

  const ctx = buildPermissionContext(session);
  const isManager = await userCanManageClub(ctx, clubIdStr);
  const isCreator = String(tournament.createdBy) === session._id.toString();
  const hasOwnerOrAdminAccess = isOwnerOrSuperAdmin(session, tournament.createdBy ?? null);

  // Non-managers/non-creators can only view active tournaments.
  if (tournament.status !== "active" && !isManager && !hasOwnerOrAdminAccess) {
    return error(403, "You do not have permission to view this tournament");
  }

  return ok({ context: { isManager, isCreator, clubIdStr, role } }, { status: 200, message: "Authorized" });
}
