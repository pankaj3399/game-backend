import Court from '../../models/Court';
import Club from '../../models/Club';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/permissions';
import type { TournamentPermissionContext } from '../../lib/permissions';
import { error, ok } from './helpers';

export async function checkClubManagement(
	ctx: TournamentPermissionContext,
	clubId: string,
	customMessage?: string
) {
	const canManage = await userCanManageClub(ctx, clubId);
	if (!canManage) {
		return error(403, customMessage ?? 'You do not have permission to manage this club');
	}
	return ok({}, { status: 200, message: 'Authorized' });
}

export async function checkClubExists(clubId: string) {
	const club = await Club.findById(clubId).select('_id').lean().exec();
	if (!club) {
		return error(404, 'Club not found');
	}
	return ok({}, { status: 200, message: 'Club exists' });
}

export async function checkSponsorBelongsToClub(sponsorId: string | null | undefined, clubId: string) {
	const sponsorValid = await sponsorBelongsToClub(sponsorId, clubId);
	if (!sponsorValid) {
		return error(400, 'Sponsor must belong to the selected club and be active');
	}
	return ok({}, { status: 200, message: 'Sponsor valid' });
}

export async function checkCourtsBelongToClub(clubId: string, courtIds: string[]) {
	const uniqueCourtIds = [...new Set(courtIds)];
	const courtsInClub = await Court.find({
		_id: { $in: uniqueCourtIds },
		club: clubId
	})
		.select('_id')
		.lean()
		.exec();

	if (courtsInClub.length !== uniqueCourtIds.length) {
		return error(400, 'Invalid or out-of-club court ID(s). Each court must exist and belong to the selected club.');
	}

	return ok({}, { status: 200, message: 'Courts valid' });
}
