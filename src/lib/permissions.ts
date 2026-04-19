import mongoose from 'mongoose';
import Club from '../models/Club';
import Sponsor from '../models/Sponsor';
import { ROLES } from "../constants/roles";
import type { AuthenticatedSession } from "../shared/authContext";

export interface TournamentPermissionContext {
	userId: string;
	userRole?: string;
	adminOf: string[];
}

/**
 * Returns true when the session belongs to the resource owner
 * or to a super admin. Safely handles null/undefined/invalid ids.
 */
export function isOwnerOrSuperAdmin(
  session: AuthenticatedSession,
  resourceCreatedBy: mongoose.Types.ObjectId | undefined
) {
  if (session.role === ROLES.SUPER_ADMIN) return true;
  if (!resourceCreatedBy) return false;
  return resourceCreatedBy.equals?.(session._id);
}

/**
 * Check if the user is an admin of the given club (or super_admin).
 * Does NOT allow organisers - use userCanManageClub for organiser access.
 */
export function userCanManageClubAsAdmin(ctx: TournamentPermissionContext, clubId: string): boolean {
	if (ctx.userRole === 'super_admin') return true;
	if (!mongoose.Types.ObjectId.isValid(clubId)) return false;
	return (ctx.adminOf ?? []).includes(clubId);
}

/**
 * Check if the user can manage the given club (admin or organiser).
 * Super admins can manage any club.
 */
export async function userCanManageClub(
	ctx: TournamentPermissionContext,
	clubId: string
  ){
	if (ctx.userRole === "super_admin") return true;
	if (!mongoose.Types.ObjectId.isValid(clubId)) return false;
  
	if (ctx.adminOf?.includes(clubId)) return true;
  
	const exists = await Club.exists({
	  _id: clubId,
	  organiserIds: ctx.userId,
	});
  
	return !!exists;
  }
/**
 * Check if sponsorId belongs to the given club and is active.
 * Returns true if sponsorId is null/undefined (no sponsor is valid).
 */
export async function sponsorBelongsToClub(
	sponsorId: string | null | undefined,
	clubId: string
) {
	if (!sponsorId) return true;
	if (!mongoose.Types.ObjectId.isValid(sponsorId)) return false;
	if (!mongoose.Types.ObjectId.isValid(clubId)) return false;

	const sponsor = await Sponsor.findOne({
		_id: sponsorId,
		scope: 'club',
		club: clubId,
		status: 'active'
	}).lean().exec();
	return !!sponsor;
}
