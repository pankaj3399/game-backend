
import mongoose from "mongoose";
import Club from "../../../models/Club";
import User from "../../../models/User";
import { type AuthenticatedSession } from "../../../shared/authContext";
import { hasRoleOrAbove } from "../../../constants/roles";
import { ROLES } from "../../../constants/roles";
import { ok } from "../../../shared/helpers";

export type ListFilterContext = {
  isOrganiserOrAbove: boolean;
  isSuperAdmin: boolean;
  requesterUserId: string;
  manageableClubIds: string[];
  homeClubCoordinates: [number, number] | null;
  /** Favourite club ids for this user (empty if none). */
  favoriteClubIds: string[];
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

  let homeClubCoordinates: [number, number] | null = null;
  const user = await User.findById(session._id)
    .populate({ path: "homeClub", select: "coordinates" })
    .select("homeClub favoriteClubs")
    .lean<{
      homeClub: { coordinates?: { coordinates?: [number, number] } } | null;
      favoriteClubs?: mongoose.Types.ObjectId[];
    }>()
    .exec();

  const favoriteClubIds = (user?.favoriteClubs ?? []).map((id) => id.toString());

  if (user?.homeClub) {
    const homeClub = user.homeClub;
    const coords = homeClub?.coordinates?.coordinates;
    if (coords) {
      homeClubCoordinates = [coords[0], coords[1]];
    }
  }

  const filterContext: ListFilterContext = {
    isOrganiserOrAbove,
    isSuperAdmin,
    requesterUserId: session._id.toString(),
    manageableClubIds,
    homeClubCoordinates,
    favoriteClubIds,
  };

  return ok({ filterContext }, { status: 200, message: "Authorized" });
}
