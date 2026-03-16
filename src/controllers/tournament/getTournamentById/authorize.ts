import { userCanManageClub } from "../../../lib/permissions";
import type { TournamentPopulated } from "../../../types/api/tournament";
import { buildPermissionContext, type AuthenticatedSession } from "../../../shared/authContext";
import { error, ok } from "../../../shared/helpers";

export interface DetailViewContext {
  isManager: boolean;
  clubIdStr: string;
}

/**
 * Verifies the user can view the tournament.
 * Non-managers can only view active tournaments.
 */
export async function authorizeGetById(
  tournament: TournamentPopulated,
  session: AuthenticatedSession
) {
  const clubIdStr = tournament.club?._id?.toString();
  if (!clubIdStr) {
    return error(400, "Tournament has no club");
  }

  const ctx = buildPermissionContext(session);
  const isManager = await userCanManageClub(ctx, clubIdStr);

  // Non-managers can only view active tournaments.
  if (tournament.status !== "active" && !isManager) {
    return error(403, "You do not have permission to view this tournament");
  }

  return ok({ context: { isManager, clubIdStr } }, { status: 200, message: "Authorized" });
}
