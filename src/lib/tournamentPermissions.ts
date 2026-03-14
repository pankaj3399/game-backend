import mongoose from 'mongoose';
import Club from '../models/Club';
import Sponsor from '../models/Sponsor';

export interface TournamentPermissionContext {
	userId: mongoose.Types.ObjectId;
	userRole?: string;
	adminOf: mongoose.Types.ObjectId[];
}

/**
 * Check if the user can manage the given club (admin or organiser).
 * Super admins can manage any club.
 */
export async function userCanManageClub(
	ctx: TournamentPermissionContext,
	clubId: string
) {
	if (ctx.userRole === 'super_admin') return true;
	if (!mongoose.Types.ObjectId.isValid(clubId)) return false;

	const clubObjId = new mongoose.Types.ObjectId(clubId);
	const isAdmin = ctx.adminOf?.some((id) => id.equals(clubObjId));
	if (isAdmin) return true;

	const club = await Club.findById(clubId).select('organiserIds').lean().exec();
	if (!club) return false;
	const organiserIds = club.organiserIds ?? [];
	return organiserIds.some((id) => String(id) === String(ctx.userId));
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
