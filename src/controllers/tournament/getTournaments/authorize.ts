
import Club from "../../../models/Club";
import { type AuthenticatedSession } from "../../../shared/authContext";
import { hasRoleOrAbove } from "../../../constants/roles";
import { ROLES } from "../../../constants/roles";
import { ok } from "../../../shared/helpers";

export type ListFilterContext = {
  isOrganiserOrAbove: boolean;
  isSuperAdmin: boolean;
  manageableClubIds: string[];
};

/**
 * Builds the authorization context for listing tournaments.
 * Returns manageable club IDs for organisers (empty for players/super-admin uses global scope).
 */
export async function authorizeList(
  session: AuthenticatedSession
){
  const isOrganiserOrAbove = hasRoleOrAbove(session.role, ROLES.ORGANISER);
  const isSuperAdmin = session.role === ROLES.SUPER_ADMIN;

  let manageableClubIds: string[] = [];
  if (isOrganiserOrAbove && !isSuperAdmin) {
    const adminClubs = (session.adminOf ?? []).map((id) => id.toString());
    const organiserClubs = await Club.find({
      organiserIds: session._id,
      status: "active",
    }).select("_id").lean().exec();
    const organiserClubIds = organiserClubs.map((c) => c._id.toString());
    manageableClubIds = Array.from(new Set([...adminClubs, ...organiserClubIds]));
  }

  const filterContext: ListFilterContext = {
    isOrganiserOrAbove,
    isSuperAdmin,
    manageableClubIds,
  };

  return ok({ filterContext }, { status: 200, message: "Authorized" });
}
