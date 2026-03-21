import Club from '../../../models/Club';
import { buildPermissionContext, type AuthenticatedSession } from '../../../shared/authContext';
import { userCanManageClub } from '../../../lib/permissions';
import { error, ok } from '../../../shared/helpers';

export async function authorizeCreateSponsor(session: AuthenticatedSession, clubId: string) {
	const context = buildPermissionContext(session);
	if (!(await userCanManageClub(context, clubId))) {
		return error(403, 'You do not have permission to manage this club');
	}

	const club = await Club.findById(clubId).select('plan').lean().exec();
	if (!club) {
		return error(404, 'Club not found');
	}

	if (club.plan !== 'premium') {
		return error(403, 'Sponsors require a premium plan. Upgrade your club to add sponsors.');
	}

	return ok({ clubId }, { status: 200, message: 'Authorized' });
}
