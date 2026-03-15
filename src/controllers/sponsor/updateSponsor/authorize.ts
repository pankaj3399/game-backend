import Club from '../../../models/Club';
import Sponsor from '../../../models/Sponsor';
import { buildPermissionContext, type AuthenticatedSession } from '../../shared/authContext';
import { error, ok } from '../../shared/helpers';

export async function authorizeUpdateSponsor(
	session: AuthenticatedSession,
	club: string,
	sponsor: string
) {
	const context = buildPermissionContext(session);
	const isAdmin = context.adminOf.includes(club);
	if (!isAdmin && context.userRole !== 'super_admin') {
		return error(403, 'You do not have permission to manage this club');
	}

	const clubData = await Club.findById(club).select('plan').lean().exec();
	if (!clubData) {
		return error(404, 'Club not found');
	}

	const sponsorDoc = await Sponsor.findOne({
		_id: sponsor,
		scope: 'club',
		club: clubData._id
	}).exec();

	if (!sponsorDoc) {
		return error(404, 'Sponsor not found');
	}

	return ok({ sponsor: sponsorDoc, clubPlan: clubData.plan }, { status: 200, message: 'Authorized' });
}
