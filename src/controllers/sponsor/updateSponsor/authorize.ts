import Club from '../../../models/Club';
import Sponsor from '../../../models/Sponsor';
import { hasEffectivePremiumAccess } from '../../../lib/subscription';
import { buildPermissionContext, type AuthenticatedSession } from '../../../shared/authContext';
import { userCanManageClub } from '../../../lib/permissions';
import { error, ok } from '../../../shared/helpers';

export async function authorizeUpdateSponsor(
	session: AuthenticatedSession,
	club: string,
	sponsor: string
) {
	const context = buildPermissionContext(session);
	if (!(await userCanManageClub(context, club))) {
		return error(403, 'You do not have permission to manage this club');
	}

	const clubData = await Club.findById(club).select('plan expiresAt trialPremiumUntil').lean().exec();
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

	const clubHasPremiumAccess = hasEffectivePremiumAccess(
		clubData.plan,
		clubData.expiresAt,
		clubData.trialPremiumUntil
	);

	return ok({ sponsor: sponsorDoc, clubHasPremiumAccess }, { status: 200, message: 'Authorized' });
}
