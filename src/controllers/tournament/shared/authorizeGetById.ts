import { userCanManageClub } from "../../../lib/permissions";
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
 * Aligns with GET /tournaments list rules: any authenticated user may open
 * published (non-draft) tournaments; drafts are limited to super admins,
 * the creator, or club managers.
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
  const isCreator = tournament.createdBy?.equals?.(session._id);
  const isSuperAdmin = session.role === ROLES.SUPER_ADMIN;

  const isDraft = tournament.status === "draft";
  if (isDraft && !isSuperAdmin && !isCreator && !isManager) {
    return error(403, "You do not have permission to view this tournament");
  }

  return ok({ context: { isManager, isCreator, clubIdStr, role } }, { status: 200, message: "Authorized" });
}
