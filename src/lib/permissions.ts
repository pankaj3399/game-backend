import mongoose from 'mongoose';
import Club from '../models/Club';
import Sponsor from '../models/Sponsor';

export interface TournamentPermissionContext {
	userId: string;
	userRole?: string;
	adminOf: string[];
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

	const sponsorObjId = new mongoose.Types.ObjectId(sponsorId);
	const clubObjId = new mongoose.Types.ObjectId(clubId);

	if (!mongoose.Types.ObjectId.isValid(sponsorObjId) || !mongoose.Types.ObjectId.isValid(clubObjId)) return false;

	const sponsor = await Sponsor.findOne({
		_id: sponsorObjId,
		scope: 'club',
		clubId: clubObjId,
		status: 'active'
	}).lean().exec();
	return !!sponsor;
}
